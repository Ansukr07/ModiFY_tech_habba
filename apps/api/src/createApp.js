import crypto from "node:crypto";
import cors from "cors";
import cookieSession from "cookie-session";
import express from "express";
import { config } from "./config.js";
import { list, one } from "./dbutil.js";
import { hashJson, rejectCibil, sendData, sendError } from "./http.js";
import { postScore, scoreHealth } from "./scoreClient.js";
import { cashflowsFor, DEMO_USERS, railsFor, SHOPS } from "./seed/fixtures.js";

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
    const clientTrust = req.body?.trustClass || req.body?.trust_class;
    if (clientTrust && TRUST_VERIFIED.has(clientTrust) && type === "pdf") {
      return sendError(res, 422, "TRUST_NOT_CLIENT", "PDF cannot be verified by the client");
    }
    const trustClass = type === "pdf" || type === "udyam" ? (type === "pdf" ? "unverified" : "supporting") : "verified_simulated";
    const rail = {
      _id: crypto.randomUUID(),
      shopId: got.shop._id,
      type,
      trustClass,
      fixture_id: req.body?.fixture_id || null,
      provenance: "synthetic",
      identity_match: true,
      payload: req.body?.payload || {},
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

  app.get("/api/applications", requireSession, async (req, res) => {
    const q = req.session.role === "owner" ? { ownerId: req.session.userId } : {};
    let items = await list(db.applications, q);
    if (req.query.status) items = items.filter((a) => a.status === req.query.status);
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const sliced = items.slice(0, limit);
    const withSummary = [];
    for (const a of sliced) {
      const rails = await list(db.rails, { shopId: a.shopId });
      const dec = a.latest_decision_id ? await one(db.decisions, { _id: a.latest_decision_id }) : null;
      if (req.query.verdict && dec?.verdict !== req.query.verdict) continue;
      withSummary.push({
        ...a,
        verified_rail_count: verifiedCount(rails),
        latest_verdict: dec?.verdict || null,
      });
    }
    res.json({ items: withSummary, next_cursor: null });
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
    return { appn, shop, rails, cashflows, decision };
  }

  app.get("/api/applications/:id", requireSession, async (req, res) => {
    const b = await loadApplicationBundle(req, req.params.id);
    if (b.err) return sendError(res, b.err[0], b.err[1], b.err[2]);
    const { ownerFlags, ...safeShop } = b.shop;
    const ownerView = req.session.role === "owner";
    sendData(res, {
      application: b.appn,
      shop: safeShop,
      rails: b.rails.map((r) => ({ type: r.type, trustClass: r.trustClass, provenance: r.provenance })),
      cashflows: ownerView ? undefined : b.cashflows,
      decision: b.decision,
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
    if (req.body?.expected_input_revision != null && req.body.expected_input_revision !== b.appn.input_revision) {
      return sendError(res, 409, "STALE_REVISION", "Evidence changed; refresh then score");
    }
    await db.applications.updateOne({ _id: b.appn._id }, { $set: { status: "assessing" } });
    let scored;
    try {
      scored = await postScore("/internal/agent", scorePayload(b.shop, b.rails, b.cashflows, b.appn._id, b.appn.requested_amount_paise));
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
    if (verifiedCount(b.rails) === 0) {
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
      input_revision: b.appn.input_revision,
      baselineVerdict: "DECLINE",
      ...scored,
    };
    const auditId = await audit(req.session.userId, "score", `applications/${b.appn._id}`, decision, true, {
      request_id: req.id,
      decision_id: decision._id,
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
    let scored;
    try {
      scored = await postScore("/stress-test", {
        ...scorePayload(b.shop, b.rails, b.cashflows, b.appn._id, b.appn.requested_amount_paise),
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
    const reason = req.body?.reason;
    if (!reason || String(reason).length < 8) {
      return sendError(res, 409, "OVERRIDE_REASON_REQUIRED", "Reason required");
    }
    const action = req.body?.action;
    if (!["decline", "request_evidence", "reduce_terms"].includes(action)) {
      return sendError(res, 422, "VALIDATION", "Invalid action");
    }
    const ov = {
      _id: crypto.randomUUID(),
      decisionId: b.decision._id,
      applicationId: b.appn._id,
      actorId: req.session.userId,
      reason,
      action,
      previousTerms: {
        verdict: b.decision.verdict,
        principal_paise: b.decision.principal_paise,
      },
      proposed_terms: req.body?.proposed_terms || null,
      createdAt: new Date().toISOString(),
    };
    if (action === "decline") {
      ov.effective = { verdict: "DECLINE", principal_paise: 0 };
    } else if (action === "reduce_terms") {
      const cap = b.decision.principal_paise || 0;
      const want = req.body?.proposed_terms?.principal_paise;
      if (want == null || want > cap || want < 0) {
        return sendError(res, 422, "OVERRIDE_EXCEEDS_CAPACITY", "Cannot raise principal via override");
      }
      ov.effective = { verdict: b.decision.verdict, principal_paise: want };
    } else {
      ov.effective = { verdict: "UNVERIFIED", principal_paise: 0 };
    }
    await db.overrides.insertOne(ov);
    const auditId = await audit(req.session.userId, "override", `applications/${b.appn._id}`, ov, true, {
      request_id: req.id,
    });
    ov.audit_reference = auditId;
    const payload = { data: ov };
    await saveIdem(req, idemp.key, `override:${req.params.id}`, bodyHash, 200, payload);
    res.json(payload);
  });

  app.get("/api/evidence/summary", requireSession, requireRole("lender"), async (_req, res) => {
    const decisions = (await list(db.decisions, {})).filter((d) => !d.scenarioOnly && d.shopId !== "twin-b");
    const offers = decisions.filter((d) => (d.principal_paise || 0) > 0);
    sendData(res, {
      dataProvenance: "synthetic",
      evaluation_note: "Synthetic holdout/demo decisions. Not live MSME defaults.",
      baselineFunded: 0,
      zerocibilFunded: offers.length,
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
      verdict: b.decision.verdict,
      explanation: b.decision.explanation,
      drivers: b.decision.drivers,
      terms: {
        principal_paise: b.decision.principal_paise,
        tenure_months: b.decision.tenure_months,
        rate_bps: b.decision.rate_bps,
        cadence: b.decision.cadence,
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
      deltas: Object.fromEntries(keys.map((k) => [k, [da?.[k], dbn?.[k]]])),
      audit_reference: auditId,
      policy_version: config.policyVersion,
    });
  });

  app.post("/api/admin/seed", requireSession, requireRole("lender"), async (req, res) => {
    await seedDb(db);
    sendData(res, { seeded: true });
  });

  return app;
}

export async function seedDb(db) {
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
