import crypto from "node:crypto";
import cors from "cors";
import cookieSession from "cookie-session";
import express from "express";
import { config } from "./config.js";
import { list, one } from "./dbutil.js";
import { hashJson, rejectCibil, sendData, sendError } from "./http.js";
import { postScore, scoreHealth } from "./scoreClient.js";
import { cashflowsFor, DEMO_USERS, railsFor, SHOPS } from "./seed/fixtures.js";
import { inspectBank, safeAccount, seedBank } from "./bank.js";

const TRUST_VERIFIED = new Set(["verified", "verified_simulated"]);

export function createApp(db) {
  const app = express();
  app.set("trust proxy", 1);
  app.use(
    cors({
      origin: config.corsOrigin,
      credentials: true,
    })
  );
  app.use(express.json({ limit: "256kb" }));
  app.use((req, res, next) => {
    req.id = crypto.randomUUID();
    next();
  });
  app.use(
    cookieSession({
      name: "zerocibil",
      keys: [config.sessionSecret],
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      maxAge: 12 * 60 * 60 * 1000,
    })
  );

  function requireSession(req, res, next) {
    if (!req.session?.userId) return sendError(res, 401, "UNAUTHENTICATED", "Sign in required", { request_id: req.id });
    next();
  }

  function requireRole(...roles) {
    return (req, res, next) => {
      if (!roles.includes(req.session.role)) {
        return sendError(res, 403, "FORBIDDEN", "Insufficient role", { request_id: req.id });
      }
      next();
    };
  }

  async function shopForUser(req, id) {
    const shop = await one(db.shops, { _id: id });
    if (!shop) return { err: [404, "NOT_FOUND", "Not found"] };
    if (req.session.role === "owner" && shop.ownerId !== req.session.userId) {
      return { err: [404, "NOT_FOUND", "Not found"] };
    }
    return { shop };
  }

  async function idempotent(req, res, scope, bodyHash) {
    const key = req.get("Idempotency-Key");
    if (!key) return { missing: true };
    const hit = await one(db.idempotency, { actorId: req.session.userId, key, scope });
    if (hit) {
      if (hit.bodyHash !== bodyHash) {
        sendError(res, 409, "IDEMPOTENCY_CONFLICT", "Same key, different body", { request_id: req.id });
        return { done: true };
      }
      res.status(hit.status).json(hit.response);
      return { done: true };
    }
    return { key };
  }

  async function saveIdem(req, key, scope, bodyHash, status, response) {
    if (!key) return;
    await db.idempotency.insertOne({
      actorId: req.session.userId,
      key,
      scope,
      bodyHash,
      status,
      response,
      createdAt: new Date().toISOString(),
    });
  }

  async function audit(actorId, action, entity, payload, ok, extra = {}) {
    const ev = {
      _id: crypto.randomUUID(),
      at: new Date().toISOString(),
      actorId,
      action,
      entity,
      payloadHash: hashJson(payload),
      policyVersion: config.policyVersion,
      ok,
      request_id: extra.request_id,
      ...extra,
    };
    await db.audit_logs.insertOne(ev);
    return ev._id;
  }

  function verifiedCount(rails) {
    return rails.filter((r) => r.type !== "pdf" && TRUST_VERIFIED.has(r.trustClass || r.trust_class)).length;
  }

  async function currentVerification(application) {
    return application.current_verification_id ? one(db.verification_requests, { _id: application.current_verification_id }) : null;
  }

  async function evidenceFor(application, shop) {
    const verification = await currentVerification(application);
    if (verification) {
      if (verification.status !== "verified_simulated") return { verification, rails: [], cashflows: [] };
      const account = await one(db.bank_accounts, { _id: verification.account_id });
      const inspected = await inspectBank(db, shop, account);
      if (inspected.source_hash !== verification.result?.source_hash) return { verification: { ...verification, status: "stale" }, rails: [], cashflows: [] };
      return {
        verification,
        rails: [{ type: "upi", trustClass: "verified_simulated", provenance: "synthetic", identity_match: true, verification_id: verification._id }],
        cashflows: inspected.rows.map((row) => ({ t: row.posted_at, inflow_paise: row.inflow_paise, outflow_paise: row.outflow_paise, payer_id: row.payer_id, source_rail: row.source_rail, source_tx_id: row._id })),
      };
    }
    // Legacy seeded examples remain available, but are not bank-admin verified.
    return { verification: null, rails: await list(db.rails, { shopId: shop._id }), cashflows: await list(db.cashflows, { shopId: shop._id }) };
  }

  function scorePayload(shop, rails, cashflows, applicationId, requested) {
    const { ownerFlags, ...safeShop } = shop;
    return {
      application_id: applicationId,
      shop: {
        shop_id: shop._id,
        name: shop.name,
        category: shop.business_type || shop.category,
        years_open: shop.yearsOpen,
        city: shop.city,
      },
      rails: rails.map((r) => ({
        type: r.type,
        trust_class: r.trustClass || r.trust_class,
        provenance: r.provenance || "synthetic",
        identity_match: r.identity_match !== false,
        payload: r.payload || {},
      })),
      cashflows: cashflows.map((c) => ({
        t: c.t,
        inflow_paise: c.inflow_paise ?? c.inflowPaise,
        outflow_paise: c.outflow_paise ?? c.outflowPaise,
        payer_id: c.payer_id || c.payerId,
        source_rail: c.source_rail,
      })),
      requested_amount_paise: requested,
      policy_version: config.policyVersion,
    };
  }

  app.get("/api/health", async (_req, res) => {
    const score = await scoreHealth();
    sendData(res, { api: "ok", mongo: db.kind, score: score.ok ? "ok" : "down" });
  });

  app.post("/api/auth/login", async (req, res) => {
    const email = req.body?.email;
    const user = await one(db.users, { email });
    if (!user) return sendError(res, 401, "UNAUTHENTICATED", "Unknown demo identity", { request_id: req.id });
    req.session.userId = user._id;
    req.session.role = user.role;
    req.session.email = user.email;
    sendData(res, { user: { id: user._id, email: user.email, role: user.role }, demo: true });
  });

  app.get("/api/me", requireSession, (req, res) => {
    sendData(res, {
      user: { id: req.session.userId, email: req.session.email, role: req.session.role },
      demo: true,
    });
  });

  app.post("/api/auth/logout", requireSession, (req, res) => {
    req.session = null;
    sendData(res, { signed_out: true });
  });

  app.post("/api/shops", requireSession, requireRole("owner"), async (req, res) => {
    if (rejectCibil(req.body)) return sendError(res, 400, "CIBIL_NOT_ALLOWED", "Bureau fields are rejected");
    const { name, business_type, identity, operating_since } = req.body || {};
    if (!name) return sendError(res, 400, "VALIDATION", "name required");
    const shop = {
      _id: crypto.randomUUID(),
      ownerId: req.session.userId,
      name,
      business_type: business_type || "Kirana",
      identity: identity || {},
      operating_since: operating_since || null,
      provenance: "synthetic",
      input_revision: 1,
      createdAt: new Date().toISOString(),
    };
    await db.shops.insertOne(shop);
    sendData(res, shop, 201);
  });

  app.get("/api/shops/:id", requireSession, async (req, res) => {
    const got = await shopForUser(req, req.params.id);
    if (got.err) return sendError(res, got.err[0], got.err[1], got.err[2]);
    const rails = await list(db.rails, { shopId: got.shop._id });
    const { ownerFlags, ...safe } = got.shop;
    sendData(res, {
      ...safe,
      rails: rails.map((r) => ({
        type: r.type,
        trustClass: r.trustClass,
        provenance: r.provenance,
        identity_match: r.identity_match,
      })),
      identity_state: "ok",
      provenance: got.shop.provenance,
    });
  });

  app.post("/api/shops/:id/rails", requireSession, requireRole("owner"), async (req, res) => {
    const got = await shopForUser(req, req.params.id);
    if (got.err) return sendError(res, got.err[0], got.err[1], got.err[2]);
    if (rejectCibil(req.body)) return sendError(res, 400, "CIBIL_NOT_ALLOWED", "Bureau fields are rejected");
    const type = req.body?.type;
    if (!["aa", "upi", "gst", "udyam", "pdf"].includes(type)) {
      return sendError(res, 422, "VALIDATION", "Invalid rail type");
    }
    if (!["pdf", "udyam"].includes(type) || ["trustClass", "trust_class", "payload", "provenance", "identity_match", "cashflows"].some((key) => key in (req.body || {}))) {
      return sendError(res, 422, "TRUST_NOT_CLIENT", "Owner cannot submit verified evidence or source records");
    }
    const trustClass = type === "pdf" ? "unverified" : "supporting";
    const rail = {
      _id: crypto.randomUUID(),
      shopId: got.shop._id,
      type,
      trustClass,
      fixture_id: req.body?.fixture_id || null,
      provenance: "synthetic",
      identity_match: true,
      payload: {},
      createdAt: new Date().toISOString(),
    };
    await db.rails.insertOne(rail);
    await db.shops.updateOne({ _id: got.shop._id }, { $set: { input_revision: (got.shop.input_revision || 1) + 1 } });
    sendData(res, { ...rail, trustClass }, 201);
  });

  app.get("/api/shops/:id/cashflows", requireSession, async (req, res) => {
    const got = await shopForUser(req, req.params.id);
    if (got.err) return sendError(res, got.err[0], got.err[1], got.err[2]);
    const rows = await list(db.cashflows, { shopId: got.shop._id });
    sendData(res, {
      window: { from: req.query.from, to: req.query.to, granularity: req.query.granularity || "week" },
      provenance: "synthetic",
      items: rows,
    });
  });

  app.post("/api/applications", requireSession, requireRole("owner"), async (req, res) => {
    if (rejectCibil(req.body)) return sendError(res, 400, "CIBIL_NOT_ALLOWED", "Bureau fields are rejected");
    const bodyHash = hashJson(req.body);
    const idemp = await idempotent(req, res, "applications", bodyHash);
    if (idemp.done) return;
    if (idemp.missing) return sendError(res, 400, "IDEMPOTENCY_REQUIRED", "Idempotency-Key required");
    const shopId = req.body?.shop_id;
    const amt = req.body?.requested_amount_paise;
    if (!shopId || !Number.isInteger(amt) || amt < 0) {
      return sendError(res, 400, "VALIDATION", "shop_id and non-negative integer paise required");
    }
    const got = await shopForUser(req, shopId);
    if (got.err) return sendError(res, got.err[0], got.err[1], got.err[2]);
    const application = {
      _id: crypto.randomUUID(),
      ownerId: req.session.userId,
      shopId,
      requested_amount_paise: amt,
      status: "submitted",
      input_revision: got.shop.input_revision || 1,
      createdAt: new Date().toISOString(),
    };
    await db.applications.insertOne(application);
    const payload = { data: application };
    await saveIdem(req, idemp.key, "applications", bodyHash, 201, payload);
    res.status(201).json(payload);
  });

  app.get("/api/bank/demo-accounts", requireSession, requireRole("owner"), async (_req, res) => {
    sendData(res, (await list(db.bank_accounts, {})).map(safeAccount));
  });

  app.post("/api/applications/:id/verification-requests", requireSession, requireRole("owner"), async (req, res) => {
    const appn = await one(db.applications, { _id: req.params.id, ownerId: req.session.userId });
    if (!appn) return sendError(res, 404, "NOT_FOUND", "Not found");
    if (Object.keys(req.body || {}).some((key) => key !== "public_ref")) return sendError(res, 422, "TRUST_NOT_CLIENT", "Only a listed account reference can be submitted");
    const account = await one(db.bank_accounts, { public_ref: req.body?.public_ref });
    if (!account) return sendError(res, 422, "INVALID_ACCOUNT_REFERENCE", "Choose a listed demo account");
    const bodyHash = hashJson(req.body);
    const idem = await idempotent(req, res, "verification:" + appn._id, bodyHash);
    if (idem.done) return;
    if (idem.missing) return sendError(res, 400, "IDEMPOTENCY_REQUIRED", "Idempotency-Key required");
    const verification = { _id: crypto.randomUUID(), application_id: appn._id, shop_id: appn.shopId, owner_id: req.session.userId, account_id: account._id, status: "pending", createdAt: new Date().toISOString(), evidence_revision: (appn.evidence_revision || 0) + 1, result: null };
    await db.verification_requests.insertOne(verification);
    await db.applications.updateOne({ _id: appn._id }, { $set: { current_verification_id: verification._id, evidence_revision: verification.evidence_revision, input_revision: (appn.input_revision || 1) + 1, status: "awaiting_verification" } });
    const response = { data: { id: verification._id, status: verification.status, application_id: appn._id, evidence_revision: verification.evidence_revision } };
    await audit(req.session.userId, "verification_requested", "applications/" + appn._id, { verification_id: verification._id, account_ref: account.public_ref }, true, { request_id: req.id, verification_id: verification._id });
    await saveIdem(req, idem.key, "verification:" + appn._id, bodyHash, 201, response);
    res.status(201).json(response);
  });

  app.get("/api/bank/dashboard", requireSession, requireRole("bank_admin"), async (_req, res) => {
    const items = await list(db.verification_requests, {});
    const counts = Object.fromEntries(["pending", "verified_simulated", "mismatch", "insufficient_evidence"].map((status) => [status, items.filter((item) => item.status === status).length]));
    sendData(res, { counts, recent: items.slice(0, 50) });
  });

  app.get("/api/bank/verification-requests", requireSession, requireRole("bank_admin"), async (req, res) => {
    sendData(res, await list(db.verification_requests, req.query.status ? { status: req.query.status } : {}));
  });

  app.get("/api/bank/verification-requests/:id", requireSession, requireRole("bank_admin"), async (req, res) => {
    const v = await one(db.verification_requests, { _id: req.params.id });
    if (!v) return sendError(res, 404, "NOT_FOUND", "Not found");
    const [shop, application, account] = await Promise.all([one(db.shops, { _id: v.shop_id }), one(db.applications, { _id: v.application_id }), one(db.bank_accounts, { _id: v.account_id })]);
    const inspected = await inspectBank(db, shop, account);
    sendData(res, { ...v, shop, application, account: safeAccount(account), recommendation: inspected.recommendation, checks: inspected.checks, transactions: inspected.rows, transaction_summary: { covered_from: inspected.covered_from, covered_to: inspected.covered_to, transaction_count: inspected.transaction_count, total_credit_paise: inspected.total_credit_paise, total_debit_paise: inspected.total_debit_paise }, source_hash: inspected.source_hash });
  });

  app.post("/api/bank/verification-requests/:id/decision", requireSession, requireRole("bank_admin"), async (req, res) => {
    const v = await one(db.verification_requests, { _id: req.params.id });
    if (!v) return sendError(res, 404, "NOT_FOUND", "Not found");
    const bodyHash = hashJson(req.body || {});
    const idem = await idempotent(req, res, "bank-review:" + v._id, bodyHash);
    if (idem.done) return;
    if (idem.missing) return sendError(res, 400, "IDEMPOTENCY_REQUIRED", "Idempotency-Key required");
    if (v.status !== "pending") return sendError(res, 409, "ALREADY_REVIEWED", "This request has already been reviewed");
    const action = req.body?.action;
    if (!["confirm", "reject"].includes(action)) return sendError(res, 422, "VALIDATION", "Choose confirm or reject");
    if (action === "reject" && String(req.body?.reason || "").trim().length < 8) return sendError(res, 422, "REASON_REQUIRED", "Add a reason of at least 8 characters");
    const [shop, application, account] = await Promise.all([one(db.shops, { _id: v.shop_id }), one(db.applications, { _id: v.application_id }), one(db.bank_accounts, { _id: v.account_id })]);
    const checked = await inspectBank(db, shop, account);
    if (action === "confirm" && checked.recommendation !== "verified_simulated") return sendError(res, 422, "CHECKS_FAILED", "Required checks did not pass");
    const status = action === "confirm" ? "verified_simulated" : checked.recommendation === "mismatch" ? "mismatch" : "insufficient_evidence";
    const result = { outcome: status, checks: checked.checks, covered_from: checked.covered_from, covered_to: checked.covered_to, transaction_count: checked.transaction_count, total_credit_paise: checked.total_credit_paise, total_debit_paise: checked.total_debit_paise, source_hash: checked.source_hash, fixture_version: account.fixture_version, reviewed_by: req.session.userId, reviewed_at: new Date().toISOString(), reason: action === "reject" ? String(req.body.reason).trim() : "All required checks passed", provenance: "synthetic" };
    result.audit_reference = await audit(req.session.userId, "verification_reviewed", "applications/" + application._id, { verification_id: v._id, status, source_hash: checked.source_hash }, true, { request_id: req.id, verification_id: v._id });
    await db.verification_requests.updateOne({ _id: v._id }, { $set: { status, result } });
    await db.applications.updateOne({ _id: application._id }, { $set: { evidence_revision: (application.evidence_revision || 0) + 1, input_revision: (application.input_revision || 1) + 1, status: status === "verified_simulated" ? "submitted" : "awaiting_evidence" } });
    const response = { data: { id: v._id, status, result } };
    await saveIdem(req, idem.key, "bank-review:" + v._id, bodyHash, 200, response);
    res.json(response);
  });

  app.get("/api/applications", requireSession, async (req, res) => {
    const q = {
      ...(req.session.role === "owner" ? { ownerId: req.session.userId } : {}),
      ...(req.query.status ? { status: req.query.status } : {}),
    };
    let items = await list(db.applications, q);
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const summaries = await Promise.all(items.map(async (a) => {
      const shop = await one(db.shops, { _id: a.shopId });
      const evidence = await evidenceFor(a, shop);
      const dec = a.latest_decision_id ? await one(db.decisions, { _id: a.latest_decision_id }) : null;
      const actions = await list(db.overrides, { applicationId: a._id });
      const latest = actions.filter((x) => x.decisionId === dec?._id).sort((x, y) => y.createdAt.localeCompare(x.createdAt))[0];
      return { ...a, shop_name: shop?.name || a.shopId, business_type: shop?.business_type || shop?.category || null, verified_rail_count: verifiedCount(evidence.rails), verification_status: evidence.verification?.status || "legacy_demo", latest_verdict: dec?.verdict || null, assessed_at: dec?.assessed_at || null, updated_at: latest?.createdAt || dec?.assessed_at || a.createdAt, review_reason: latest?.action === "request_evidence" ? latest.reason : dec?.not_run_reason || dec?.drivers?.[0]?.text || dec?.drivers?.[0]?.feature || null, effective_action: latest?.action || null, effective_verdict: latest?.effective?.verdict || dec?.verdict || null };
    }));
    summaries.sort((a, b) => (a.latest_verdict ? 1 : 0) - (b.latest_verdict ? 1 : 0) || String(a.createdAt).localeCompare(String(b.createdAt)));
    const withSummary = req.query.verdict
      ? summaries.filter((a) => a.latest_verdict === req.query.verdict)
      : summaries;
    res.json({ items: withSummary.slice(0, limit), next_cursor: null });
  });

  async function loadApplicationBundle(req, id) {
    const appn = await one(db.applications, { _id: id });
    if (!appn) return { err: [404, "NOT_FOUND", "Not found"] };
    if (req.session.role === "owner" && appn.ownerId !== req.session.userId) {
      return { err: [404, "NOT_FOUND", "Not found"] };
    }
    const shop = await one(db.shops, { _id: appn.shopId });
    const rails = await list(db.rails, { shopId: appn.shopId });
    const cashflows = await list(db.cashflows, { shopId: appn.shopId });
    const decision = appn.latest_decision_id ? await one(db.decisions, { _id: appn.latest_decision_id }) : null;
    const actions = await list(db.overrides, { applicationId: appn._id });
    const latestAction = actions.filter((x) => x.decisionId === decision?._id).sort((x, y) => y.createdAt.localeCompare(x.createdAt))[0] || null;
    return { appn, shop, rails, cashflows, decision, latestAction };
  }

  app.get("/api/applications/:id", requireSession, async (req, res) => {
    const b = await loadApplicationBundle(req, req.params.id);
    if (b.err) return sendError(res, b.err[0], b.err[1], b.err[2]);
    const { ownerFlags, ...safeShop } = b.shop;
    const ownerView = req.session.role === "owner";
    const verification = await currentVerification(b.appn);
    const verifiedEvidence = verification?.status === "verified_simulated" ? await evidenceFor(b.appn, b.shop) : null;
    const gstSales = b.rails.filter((r) => r.type === "gst" && TRUST_VERIFIED.has(r.trustClass)).reduce((sum, r) => sum + Number(r.payload?.taxable_sales_paise || 0), 0);
    const upiCredits = b.cashflows.filter((r) => !r.source_rail || String(r.source_rail).includes("upi")).reduce((sum, r) => sum + Number(r.inflow_paise ?? r.inflowPaise ?? 0), 0);
    sendData(res, {
      application: b.appn,
      shop: safeShop,
      rails: verifiedEvidence ? verifiedEvidence.rails : b.rails.map((r) => ({ type: r.type, trustClass: r.trustClass, provenance: r.provenance, identity_match: r.identity_match, createdAt: r.createdAt, coverage_from: r.coverage_from || null, coverage_to: r.coverage_to || null })),
      cashflows: ownerView ? undefined : verifiedEvidence ? verifiedEvidence.cashflows : b.cashflows,
      verification: verification ? { id: verification._id, status: verification.status, result: verification.result } : { status: "not_requested" },
      decision: b.decision,
      latest_action: b.latestAction,
      reconciliation: ownerView || !gstSales ? null : { gst_sales_paise: gstSales, upi_credits_paise: upiCredits, relative_gap: Math.abs(gstSales - upiCredits) / gstSales, period_note: "Synthetic demo totals; GST period alignment is not verified" },
      provenance: "synthetic",
    });
  });

  app.post("/api/applications/:id/score", requireSession, requireRole("lender"), async (req, res) => {
    if (rejectCibil(req.body || {})) return sendError(res, 400, "CIBIL_NOT_ALLOWED", "Bureau fields are rejected");
    const bodyHash = hashJson(req.body || {});
    const idemp = await idempotent(req, res, `score:${req.params.id}`, bodyHash);
    if (idemp.done) return;
    if (idemp.missing) return sendError(res, 400, "IDEMPOTENCY_REQUIRED", "Idempotency-Key required");
    const b = await loadApplicationBundle(req, req.params.id);
    if (b.err) return sendError(res, b.err[0], b.err[1], b.err[2]);
    const evidence = await evidenceFor(b.appn, b.shop);
    if (req.body?.expected_input_revision != null && req.body.expected_input_revision !== (b.appn.input_revision || 1)) {
      return sendError(res, 409, "STALE_REVISION", "Evidence changed; refresh then score");
    }
    await db.applications.updateOne({ _id: b.appn._id }, { $set: { status: "assessing" } });
    let scored;
    try {
      scored = await postScore("/internal/agent", scorePayload(b.shop, evidence.rails, evidence.cashflows, b.appn._id, b.appn.requested_amount_paise));
    } catch (e) {
      await db.applications.updateOne({ _id: b.appn._id }, { $set: { status: "failed" } });
      await audit(req.session.userId, "score", `applications/${b.appn._id}`, req.body || {}, false, {
        request_id: req.id,
      });
      return sendError(res, 503, "SCORE_UNAVAILABLE", "Scoring service unavailable", {
        request_id: req.id,
        retryable: true,
      });
    }
    if (evidence.verification && evidence.verification.status !== "verified_simulated" || verifiedCount(evidence.rails) === 0) {
      scored.verdict = "UNVERIFIED";
      scored.principal_paise = 0;
      scored.rate_bps = 0;
      scored.tenure_months = 0;
      scored.p_stress = null;
      scored.not_run_reason = "no_verified_rail";
    }
    const decision = {
      _id: crypto.randomUUID(),
      applicationId: b.appn._id,
      shopId: b.shop._id,
      scenarioOnly: false,
      createdAt: new Date().toISOString(),
      assessed_at: new Date().toISOString(),
      verification_id: evidence.verification?._id || null,
      evidence_revision: b.appn.evidence_revision || 0,
      input_revision: b.appn.input_revision || 1,
      baselineVerdict: "DECLINE",
      ...scored,
    };
    const auditId = await audit(req.session.userId, "score", `applications/${b.appn._id}`, decision, true, {
      request_id: req.id,
      decision_id: decision._id,
      input_revision: decision.input_revision,
    });
    decision.audit_reference = auditId;
    await db.decisions.insertOne(decision);
    await db.applications.updateOne(
      { _id: b.appn._id },
      { $set: { status: "assessed", latest_decision_id: decision._id } }
    );
    const payload = { data: decision };
    await saveIdem(req, idemp.key, `score:${req.params.id}`, bodyHash, 200, payload);
    res.json(payload);
  });

  app.post("/api/applications/:id/stress", requireSession, requireRole("lender"), async (req, res) => {
    const b = await loadApplicationBundle(req, req.params.id);
    if (b.err) return sendError(res, b.err[0], b.err[1], b.err[2]);
    if (!b.decision) return sendError(res, 422, "NO_DECISION", "Score first");
    if (b.decision.input_revision !== (b.appn.input_revision || 1)) return sendError(res, 409, "STALE_REVISION", "Evidence changed; reassess before testing stress");
    const evidence = await evidenceFor(b.appn, b.shop);
    let scored;
    try {
      scored = await postScore("/stress-test", {
        ...scorePayload(b.shop, evidence.rails, evidence.cashflows, b.appn._id, b.appn.requested_amount_paise),
        lean_inflow_delta_pct: Number(req.body?.lean_inflow_delta_pct ?? 0),
        outflow_delta_pct: Number(req.body?.outflow_delta_pct ?? 0),
        base_decision_id: b.decision._id,
      });
    } catch (e) {
      return sendError(res, 503, "SCORE_UNAVAILABLE", String(e.message), { retryable: true, request_id: req.id });
    }
    scored.scenario_only = true;
    sendData(res, scored);
  });

  app.post("/api/applications/:id/override", requireSession, requireRole("lender"), async (req, res) => {
    const bodyHash = hashJson(req.body || {});
    const idemp = await idempotent(req, res, `override:${req.params.id}`, bodyHash);
    if (idemp.done) return;
    if (idemp.missing) return sendError(res, 400, "IDEMPOTENCY_REQUIRED", "Idempotency-Key required");
    const b = await loadApplicationBundle(req, req.params.id);
    if (b.err) return sendError(res, b.err[0], b.err[1], b.err[2]);
    if (!b.decision) return sendError(res, 422, "NO_DECISION", "Score first");
    if (b.decision.input_revision !== (b.shop.input_revision || 1)) return sendError(res, 409, "STALE_REVISION", "Evidence changed; reassess before a lender action");
    const reason = req.body?.reason;
    if (!reason || String(reason).trim().length < 8) {
      return sendError(res, 409, "OVERRIDE_REASON_REQUIRED", "Reason required");
    }
    const action = req.body?.action;
    if (!["decline", "request_evidence", "reduce_terms"].includes(action)) {
      return sendError(res, 422, "VALIDATION", "Invalid action");
    }
    if (action === "request_evidence" && !["aa", "upi", "gst", "identity", "reconciliation", "other"].includes(req.body?.evidence_type)) {
      return sendError(res, 422, "VALIDATION", "Choose the evidence needed");
    }
    const ov = {
      _id: crypto.randomUUID(),
      decisionId: b.decision._id,
      applicationId: b.appn._id,
      actorId: req.session.userId,
      reason,
      action,
      evidence_type: action === "request_evidence" ? req.body.evidence_type : null,
      previousTerms: {
        verdict: b.decision.verdict,
        principal_paise: b.decision.principal_paise,
      },
      proposed_terms: null,
      createdAt: new Date().toISOString(),
    };
    if (action === "decline") {
      ov.effective = { verdict: "DECLINE", principal_paise: 0 };
    } else if (action === "reduce_terms") {
      const cap = b.decision.principal_paise || 0;
      const want = req.body?.proposed_terms?.principal_paise;
      if (!Number.isInteger(want) || want > cap || want < 0 || Object.keys(req.body?.proposed_terms || {}).some((key) => key !== "principal_paise")) {
        return sendError(res, 422, "OVERRIDE_EXCEEDS_CAPACITY", "Only a reduced principal within capacity is allowed");
      }
      ov.proposed_terms = { principal_paise: want };
      ov.effective = { verdict: b.decision.verdict, principal_paise: want };
    } else {
      ov.effective = { verdict: "UNVERIFIED", principal_paise: 0 };
    }
    await db.overrides.insertOne(ov);
    const auditId = await audit(req.session.userId, "override", `applications/${b.appn._id}`, ov, true, {
      request_id: req.id,
      decision_id: b.decision._id,
      input_revision: b.decision.input_revision,
      reason: String(reason),
      action_detail: action,
      evidence_type: ov.evidence_type,
    });
    ov.audit_reference = auditId;
    await db.overrides.updateOne({ _id: ov._id }, { $set: { audit_reference: auditId } });
    await db.applications.updateOne({ _id: b.appn._id }, { $set: { status: action === "request_evidence" ? "awaiting_evidence" : "reviewed" } });
    const payload = { data: ov };
    await saveIdem(req, idemp.key, `override:${req.params.id}`, bodyHash, 200, payload);
    res.json(payload);
  });

  app.get("/api/evidence/summary", requireSession, requireRole("lender"), async (_req, res) => {
    const applications = await list(db.applications, {});
    const decisions = (await Promise.all(applications.map((a) => a.latest_decision_id ? one(db.decisions, { _id: a.latest_decision_id }) : null))).filter(Boolean);
    const offers = decisions.filter((d) => (d.principal_paise || 0) > 0);
    sendData(res, {
      dataProvenance: "synthetic",
      evaluation_note: "Synthetic demo applications. Not live MSME defaults or a holdout evaluation.",
      baselineFunded: 0,
      zerocibilFunded: offers.length,
      application_count: applications.length,
      assessed_count: decisions.length,
      positive_offer_count: offers.length,
      pending_count: applications.length - decisions.length,
      offer_definition: "positive principal_paise on STANDARD|THIN_FILE|STEP_UP",
      byVerdict: decisions.reduce((a, d) => {
        a[d.verdict] = (a[d.verdict] || 0) + 1;
        return a;
      }, {}),
      limitations: "Metrics unavailable until ml/reports is populated; zeros here are counts of demo decisions only.",
    });
  });

  app.get("/api/applications/:id/audit", requireSession, requireRole("lender"), async (req, res) => {
    const rows = await list(db.audit_logs, {});
    const items = rows.filter((e) => String(e.entity || "").includes(req.params.id));
    res.json({ items, next_cursor: null });
  });

  app.get("/api/applications/:id/report", requireSession, requireRole("lender"), async (req, res) => {
    const b = await loadApplicationBundle(req, req.params.id);
    if (b.err) return sendError(res, b.err[0], b.err[1], b.err[2]);
    if (!b.decision) return sendError(res, 404, "NOT_FOUND", "No assessment");
    sendData(res, {
      application_id: b.appn._id,
      shop_name: b.shop.name,
      provenance: "synthetic",
      requested_amount_paise: b.appn.requested_amount_paise,
      rails: b.rails.map((r) => ({ type: r.type, trustClass: r.trustClass, provenance: r.provenance })),
      verdict: b.decision.verdict,
      effective_action: b.latestAction,
      capacity: b.decision.capacity,
      versions: b.decision.versions,
      assessed_at: b.decision.assessed_at,
      explanation: b.decision.explanation,
      drivers: b.decision.drivers,
      conditions: b.decision.conditions,
      terms: {
        principal_paise: b.decision.principal_paise,
        tenure_months: b.decision.tenure_months,
        rate_bps: b.decision.rate_bps,
        cadence: b.decision.cadence,
        repayment_amount_paise: b.decision.repayment_amount_paise,
        repayment_periods: b.decision.repayment_periods,
        total_repayment_paise: b.decision.total_repayment_paise,
        total_interest_paise: b.decision.total_interest_paise,
      },
    });
  });

  app.post("/api/evidence/fairness", requireSession, requireRole("lender"), async (req, res) => {
    const pair = req.body?.fixture_pair_id;
    if (pair && pair !== "lakshmi-twins") {
      return sendError(res, 422, "VALIDATION", "Allowlisted twins only");
    }
    const apps = await list(db.applications, {});
    const a = apps.find((x) => x.shopId === "twin-a");
    const bapp = apps.find((x) => x.shopId === "twin-b");
    if (!a || !bapp) return sendError(res, 422, "VALIDATION", "Seed twins and score both first");
    const da = await one(db.decisions, { _id: a.latest_decision_id });
    const dbn = await one(db.decisions, { _id: bapp.latest_decision_id });
    const keys = ["verdict", "principal_paise", "rate_bps", "tenure_months", "cadence"];
    const pass = keys.every((k) => da?.[k] === dbn?.[k]);
    const auditId = await audit(req.session.userId, "fairness", "twins", { pass }, true, { request_id: req.id });
    sendData(res, {
      pass,
      changed_attributes: ["owner gender", "area"],
      deltas: Object.fromEntries(keys.map((k) => [k, [da?.[k], dbn?.[k]]])),
      audit_reference: auditId,
      policy_version: config.policyVersion,
    });
  });

  app.post("/api/admin/seed", requireSession, requireRole("lender"), async (req, res) => {
    await seedDb(db);
    const shopIds = ["clean-kirana", "pdf-only", "mule", "gst-gap", "twin-a", "twin-b"];
    const applications = [];
    for (const shopId of shopIds) {
      let application = (await list(db.applications, { shopId }))[0];
      if (!application) {
        const shop = await one(db.shops, { _id: shopId });
        application = {
          _id: crypto.randomUUID(),
          ownerId: shop.ownerId,
          shopId,
          requested_amount_paise: 20000000,
          status: "submitted",
          input_revision: shop.input_revision || 1,
          createdAt: new Date().toISOString(),
        };
        await db.applications.insertOne(application);
      }
      applications.push(application);
    }
    sendData(res, { seeded: true, applications });
  });

  return app;
}

export async function seedDb(db) {
  await seedBank(db);
  for (const u of DEMO_USERS) {
    if (!(await one(db.users, { _id: u._id }))) await db.users.insertOne({ ...u, createdAt: new Date().toISOString() });
  }
  for (const s of SHOPS) {
    if (!(await one(db.shops, { _id: s._id }))) {
      await db.shops.insertOne({ ...s, createdAt: new Date().toISOString() });
    }
    const existingR = await list(db.rails, { shopId: s._id });
    if (!existingR.length) {
      for (const r of railsFor(s._id)) await db.rails.insertOne({ _id: crypto.randomUUID(), ...r });
    }
    const existingC = await list(db.cashflows, { shopId: s._id });
    if (!existingC.length) {
      for (const c of cashflowsFor(s._id)) await db.cashflows.insertOne({ _id: crypto.randomUUID(), ...c });
    }
  }
}
