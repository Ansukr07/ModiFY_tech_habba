import crypto from "node:crypto";
import cors from "cors";
import cookieSession from "cookie-session";
import express from "express";
import { config } from "./config.js";
import { list, one } from "./dbutil.js";
import { hashJson, rejectCibil, sendData, sendError } from "./http.js";
import { postScore, scoreHealth } from "./scoreClient.js";
import { cashflowsFor, DEMO_USERS, EVIDENCE_FIXTURES, railsFor, safeEvidenceFixture, SHOPS } from "./seed/fixtures.js";
import { inspectBank, safeAccount, seedBank } from "./bank.js";
import { buildStatementPdf, publicResult } from "./statementPdf.js";
import { setuRequest } from "./setuClient.js";
import { normalizeSetuFi, openFiRow, sealFiRow } from "./setuFi.js";
import { repaymentTerms } from "./repayment.js";

const TRUST_VERIFIED = new Set(["verified", "verified_simulated"]);

export function createApp(db, { setu = setuRequest } = {}) {
  const app = express();
  const aaSyncs = new Map();
  const route = (method, path, ...handlers) => app[method](path, ...handlers.map((handler) => (
    handler.constructor.name === "AsyncFunction"
      ? (req, res, next) => handler(req, res, next).catch(next)
      : handler
  )));
  app.set("trust proxy", config.appEnv === "production" ? 1 : false);
  app.use(
    cors({
      origin: config.corsOrigin,
      credentials: true,
    })
  );
  app.use((req, res, next) => {
    req.id = crypto.randomUUID();
    const started = performance.now();
    if (config.appEnv === "production") res.on("finish", () => {
      console.info(JSON.stringify({
        type: "http_access",
        request_id: req.id,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        duration_ms: Math.round(performance.now() - started),
        client_ip: req.ip,
      }));
    });
    next();
  });
  const rateBuckets = new Map();
  let lastRateCleanup = 0;
  app.use((req, res, next) => {
    if (req.path === "/api/health") return next();
    const now = Date.now();
    if (now - lastRateCleanup >= 60_000) {
      for (const [key, bucket] of rateBuckets) if (now - bucket.startedAt >= 60_000) rateBuckets.delete(key);
      lastRateCleanup = now;
    }
    const category = req.path === "/api/auth/login" ? "login" : req.method === "GET" ? "read" : "write";
    const key = `${req.ip}:${category}`;
    let bucket = rateBuckets.get(key);
    if (!bucket || now - bucket.startedAt >= 60_000) {
      bucket = { startedAt: now, count: 0 };
      if (rateBuckets.size >= 10_000) rateBuckets.delete(rateBuckets.keys().next().value);
      rateBuckets.set(key, bucket);
    }
    bucket.count += 1;
    const limit = category === "login" ? 60 : category === "read" ? 300 : 120;
    if (bucket.count > limit) {
      res.set("Retry-After", "60");
      return sendError(res, 429, "RATE_LIMITED", "Too many requests. Try again shortly", { request_id: req.id });
    }
    next();
  });
  app.use(express.json({ limit: "256kb" }));
  app.use(
    cookieSession({
      name: "zerocibil",
      keys: [config.sessionSecret],
      httpOnly: true,
      sameSite: "lax",
      secure: config.appEnv === "production",
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

  async function saveIdem(req, key, scope, bodyHash, status, response, session) {
    if (!key) return;
    await db.idempotency.insertOne({
      actorId: req.session.userId,
      key,
      scope,
      bodyHash,
      status,
      response,
      createdAt: new Date().toISOString(),
    }, session ? { session } : undefined);
  }

  async function audit(actorId, action, entity, payload, ok, extra = {}, session) {
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
    await db.audit_logs.insertOne(ev, session ? { session } : undefined);
    return ev._id;
  }

  function verifiedCount(rails) {
    return rails.filter((r) => r.type !== "pdf" && TRUST_VERIFIED.has(r.trustClass || r.trust_class)).length;
  }

  function isoDay(value) {
    if (value == null || value === "") return null;
    if (value instanceof Date && !Number.isNaN(+value)) return value.toISOString().slice(0, 10);
    const match = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : null;
  }

  function upiCoverageDates(flows) {
    return [...new Set((flows || [])
      .filter((row) => !row.source_rail || String(row.source_rail).includes("upi"))
      .map((row) => isoDay(row.t || row.posted_at))
      .filter(Boolean))].sort();
  }

  function evidenceFreshness(evidence) {
    const hasVerifiedUpi = evidence.rails.some((rail) => rail.type === "upi" && TRUST_VERIFIED.has(rail.trustClass || rail.trust_class));
    const observedAt = hasVerifiedUpi ? upiCoverageDates(evidence.cashflows).at(-1) || null : null;
    const ageDays = observedAt ? Math.max(0, Math.floor((Date.now() - Date.parse(observedAt)) / 86400000)) : null;
    return {
      version: config.evidenceFreshnessVersion,
      max_age_days: config.evidenceReviewAgeDays,
      observed_at: observedAt,
      age_days: ageDays,
      review_required: ageDays != null && ageDays > config.evidenceReviewAgeDays,
      eligibility_effect: "none",
    };
  }

  async function currentVerification(application) {
    return application.current_verification_id ? one(db.verification_requests, { _id: application.current_verification_id }) : null;
  }

  async function purgeAa(consentId, session) {
    const options = session ? { session } : undefined;
    await db.aa_transactions.deleteMany({ consent_id: consentId }, options);
    await db.aa_accounts.deleteMany({ consent_id: consentId }, options);
  }

  function getDataLifeExpiry(detail, fallback) {
    const life = detail?.dataLife;
    const unitMs = life && ({ DAY: 86400000, MONTH: 30 * 86400000, YEAR: 365 * 86400000 })[life.unit];
    const start = Date.parse(detail?.consentStart || new Date().toISOString());
    const duration = Number(life?.value);
    return unitMs && Number.isFinite(start) && Number.isFinite(duration) && duration > 0
      ? new Date(start + unitMs * duration).toISOString()
      : fallback;
  }

  async function evidenceFor(application, shop) {
    const aa = await one(db.aa_connections, { application_id: application._id });
    if (aa) {
      const extraRails = (await list(db.rails, { shopId: shop._id })).filter((rail) => rail.type !== "upi" && rail.type !== "aa");
      if (["revoked", "rejected", "expired", "failed"].includes(aa.status)) return { verification: { status: aa.status, source: "aa_sandbox" }, rails: extraRails, cashflows: [] };
      const dataExpired = aa.data_life_expires_at && Date.parse(aa.data_life_expires_at) <= Date.now();
      if (aa.status === "data_expired") return { verification: { status: "data_expired", source: "aa_sandbox" }, rails: extraRails, cashflows: [] };
      if (dataExpired || aa.consent_expires_at && Date.parse(aa.consent_expires_at) <= Date.now()) {
        await db.transaction(async (session) => {
          await purgeAa(aa.consent_id, session);
          await db.aa_connections.updateOne({ _id: aa._id }, { $set: { status: dataExpired ? "data_expired" : "expired", updatedAt: new Date().toISOString() } }, session ? { session } : undefined);
          await db.applications.updateOne({ _id: application._id }, { $set: { input_revision: (application.input_revision || 1) + 1, evidence_revision: (application.evidence_revision || 0) + 1, status: "awaiting_evidence", updatedAt: new Date().toISOString() } }, session ? { session } : undefined);
        });
        return { verification: { status: dataExpired ? "data_expired" : "expired", source: "aa_sandbox" }, rails: extraRails, cashflows: [] };
      }
      if (aa.status !== "ready") return { verification: { status: aa.status, source: "aa_sandbox" }, rails: extraRails, cashflows: [] };
      const rows = (await list(db.aa_transactions, { consent_id: aa.consent_id })).map((row) => openFiRow(row, config.sessionSecret)).sort((a, b) => a.posted_at.localeCompare(b.posted_at) || a._id.localeCompare(b._id));
      if (hashJson(rows) !== aa.source_hash) return { verification: { status: "stale", source: "aa_sandbox" }, rails: extraRails, cashflows: [] };
      return { verification: { _id: aa._id, status: "ready", source: "aa_sandbox", source_hash: aa.source_hash, evidence_revision: application.evidence_revision || 0, account_count: (await list(db.aa_accounts, { consent_id: aa.consent_id })).length, covered_from: rows[0]?.posted_at || null, covered_to: rows.at(-1)?.posted_at || null }, rails: [{ type: "aa", trustClass: "verified_simulated", provenance: "aa_sandbox", identity_match: true, verification_id: aa._id }, ...extraRails], cashflows: rows.map((row) => ({ t: row.posted_at, inflow_paise: row.inflow_paise, outflow_paise: row.outflow_paise, source_rail: "aa", source_tx_id: row._id })), statement: null };
    }
    const verification = await currentVerification(application);
    const shopRails = await list(db.rails, { shopId: shop._id });
    const shopFlows = await list(db.cashflows, { shopId: shop._id });
    const extraRails = shopRails.filter((rail) => rail.type !== "upi");
    if (verification?.status === "verified_simulated") {
      const account = await one(db.bank_accounts, { _id: verification.account_id });
      const inspected = await inspectBank(db, shop, account);
      if (inspected.source_hash !== verification.result?.source_hash) {
        return { verification: { ...verification, status: "stale" }, rails: extraRails, cashflows: [] };
      }
      const bankFlows = inspected.rows.map((row) => ({ t: row.posted_at, inflow_paise: row.inflow_paise, outflow_paise: row.outflow_paise, payer_id: row.payer_id, source_rail: row.source_rail, source_tx_id: row._id }));
      return {
        verification,
        rails: [{ type: "upi", trustClass: "verified_simulated", provenance: "synthetic", identity_match: true, verification_id: verification._id }, ...extraRails],
        cashflows: bankFlows.length ? bankFlows : shopFlows,
        statement: verification.result?.statement || null,
      };
    }
    if (verification) return { verification, rails: extraRails, cashflows: [] };
    return { verification: null, rails: shopRails, cashflows: shopFlows };
  }

  function scorePayload(shop, rails, cashflows, applicationId, requested, statement) {
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
      documents: statement?.pdf_base64 ? [{
        document_id: statement.document_id,
        filename: statement.filename,
        media_type: statement.media_type,
        issuer: statement.issuer,
        trust_class: statement.trust_class,
        sha256: statement.sha256,
        pdf_base64: statement.pdf_base64,
        provenance: "synthetic",
      }] : [],
    };
  }

  route("get", "/api/health", async (_req, res) => {
    const score = await scoreHealth();
    sendData(res, { api: "ok", mongo: db.kind, score: score.ok ? "ok" : "down" });
  });

  route("post", "/api/auth/login", async (req, res) => {
    const email = req.body?.email;
    const demo = DEMO_USERS.find((u) => u.email === email);
    const user = demo || (await one(db.users, { email }));
    if (!user) return sendError(res, 401, "UNAUTHENTICATED", "Unknown demo identity", { request_id: req.id });
    req.session.userId = user._id;
    req.session.role = user.role;
    req.session.email = user.email;
    sendData(res, { user: { id: user._id, email: user.email, role: user.role }, demo: true });
  });

  route("get", "/api/me", requireSession, (req, res) => {
    sendData(res, {
      user: { id: req.session.userId, email: req.session.email, role: req.session.role },
      demo: true,
    });
  });

  route("post", "/api/auth/logout", requireSession, (req, res) => {
    req.session = null;
    sendData(res, { signed_out: true });
  });

  route("post", "/api/shops", requireSession, requireRole("owner"), async (req, res) => {
    if (rejectCibil(req.body)) return sendError(res, 400, "CIBIL_NOT_ALLOWED", "Bureau fields are rejected");
    const bodyHash = hashJson(req.body);
    const idemp = req.get("Idempotency-Key") ? await idempotent(req, res, "shops", bodyHash) : null;
    if (idemp?.done) return;
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
    await db.transaction(async (session) => {
      await db.shops.insertOne(shop, session ? { session } : undefined);
      await saveIdem(req, idemp?.key, "shops", bodyHash, 201, { data: shop }, session);
    });
    sendData(res, shop, 201);
  });

  route("get", "/api/shops/:id", requireSession, async (req, res) => {
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

  route("post", "/api/shops/:id/rails", requireSession, requireRole("owner"), async (req, res) => {
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
    await db.transaction(async (session) => {
      await db.rails.insertOne(rail, session ? { session } : undefined);
      await db.shops.updateOne({ _id: got.shop._id }, { $set: { input_revision: (got.shop.input_revision || 1) + 1 } }, session ? { session } : undefined);
    });
    sendData(res, { ...rail, trustClass }, 201);
  });

  route("get", "/api/shops/:id/cashflows", requireSession, async (req, res) => {
    const got = await shopForUser(req, req.params.id);
    if (got.err) return sendError(res, got.err[0], got.err[1], got.err[2]);
    const rows = await list(db.cashflows, { shopId: got.shop._id });
    sendData(res, {
      window: { from: req.query.from, to: req.query.to, granularity: req.query.granularity || "week" },
      provenance: "synthetic",
      items: rows,
    });
  });

  route("post", "/api/applications", requireSession, requireRole("owner"), async (req, res) => {
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
    const payload = { data: application };
    await db.transaction(async (session) => {
      await db.applications.insertOne(application, session ? { session } : undefined);
      await saveIdem(req, idemp.key, "applications", bodyHash, 201, payload, session);
    });
    res.status(201).json(payload);
  });

  route("get", "/api/bank/demo-accounts", requireSession, requireRole("owner"), async (_req, res) => {
    sendData(res, (await list(db.bank_accounts, {})).map(safeAccount));
  });

  route("post", "/api/applications/:id/aa/consents", requireSession, requireRole("owner"), async (req, res) => {
    const application = await one(db.applications, { _id: req.params.id, ownerId: req.session.userId });
    if (!application) return sendError(res, 404, "NOT_FOUND", "Not found");
    if (application.current_verification_id) return sendError(res, 409, "DEMO_VERIFICATION_EXISTS", "This application already uses the offline demo bank source");
    if (!req.get("Idempotency-Key")) return sendError(res, 400, "IDEMPOTENCY_REQUIRED", "Idempotency-Key required");
    if (!/^\d{10}$/.test(String(req.body?.mobile || "")) || Object.keys(req.body || {}).some((key) => key !== "mobile")) return sendError(res, 422, "VALIDATION", "A 10-digit consent mobile number is required");
    const existing = await one(db.aa_connections, { application_id: application._id });
    if (existing) {
      if (existing.mobile_hash !== crypto.createHmac("sha256", config.sessionSecret).update(req.body.mobile).digest("hex")) return sendError(res, 409, "CONSENT_CONFLICT", "This application already uses a different Setu consent mobile");
      return sendData(res, { connection_id: existing._id, consent_url: existing.consent_url, status: existing.status });
    }
    if (setu === setuRequest && (!config.setuClientId || !config.setuClientSecret || !config.setuProductInstanceId)) return sendError(res, 503, "AA_UNAVAILABLE", "Setu sandbox is not configured");
    const now = new Date();
    // Setu sandbox deposits expose mock transactions only for Jan–Jun 2021.
    const from = new Date("2021-01-01T00:00:00.000Z");
    const to = new Date("2021-06-30T23:59:59.000Z");
    const returnUrl = new URL("/owner/aa/return", config.corsOrigin);
    let consent;
    try {
      consent = await setu("/consents", { method: "POST", body: { vua: req.body.mobile, consentDuration: { unit: "MONTH", value: "1" }, dataRange: { from: from.toISOString(), to: to.toISOString() }, consentMode: "STORE", fetchType: "ONETIME", consentTypes: ["PROFILE", "SUMMARY", "TRANSACTIONS"], fiTypes: ["DEPOSIT"], purpose: { code: "105", text: "One-time consent for loan assessment", refUri: "https://api.rebit.org.in/aa/purpose/105.xml", category: { type: "string" } }, dataLife: { unit: "MONTH", value: "1" }, frequency: { unit: "MONTHLY", value: 1 }, ...(returnUrl.protocol === "https:" ? { redirectUrl: returnUrl.href } : {}), context: [{ key: "purposeCode", value: "105" }, { key: "purposeDescription", value: "One-time consent for loan assessment" }] } });
    } catch (error) { return sendError(res, 502, "AA_PROVIDER_ERROR", error.message === "SETU_FAIR_USE_POLICY" ? "Setu rejected this consent for the product's configured fair-use policy. The FIU product purpose settings in Setu Bridge must allow this loan-assessment consent." : "Setu consent request failed", { retryable: true }); }
    let consentUrl;
    try { consentUrl = new URL(consent.url); } catch {}
    if (!consent.id || consentUrl?.protocol !== "https:" || !["fiu-sandbox.setu.co", "fiu-uat.setu.co"].includes(consentUrl.hostname) || !consentUrl.pathname.startsWith("/v2/consents/")) return sendError(res, 502, "AA_PROVIDER_ERROR", "Setu returned an invalid consent response");
    const connection = { _id: crypto.randomUUID(), application_id: application._id, owner_id: req.session.userId, consent_id: consent.id, consent_url: consent.url, mobile_hash: crypto.createHmac("sha256", config.sessionSecret).update(req.body.mobile).digest("hex"), status: "pending_consent", data_range: { from: from.toISOString(), to: to.toISOString() }, createdAt: now.toISOString() };
    await db.aa_connections.insertOne(connection);
    await audit(req.session.userId, "aa_consent_requested", `applications/${application._id}`, { connection_id: connection._id }, true, { request_id: req.id, verification_id: connection._id, source_reference: "aa_sandbox" });
    sendData(res, { connection_id: connection._id, consent_url: connection.consent_url, status: connection.status }, 201);
  });

  route("get", "/api/applications/:id/aa/connection", requireSession, requireRole("owner"), async (req, res) => {
    const application = await one(db.applications, { _id: req.params.id, ownerId: req.session.userId });
    if (!application) return sendError(res, 404, "NOT_FOUND", "Not found");
    const connection = await one(db.aa_connections, { application_id: application._id });
    if (!connection) return sendError(res, 404, "NOT_FOUND", "No AA connection");
    await evidenceFor(application, await one(db.shops, { _id: application.shopId }));
    const current = await one(db.aa_connections, { _id: connection._id });
    const accounts = await list(db.aa_accounts, { consent_id: connection.consent_id });
    const rows = (await list(db.aa_transactions, { consent_id: connection.consent_id })).map((row) => openFiRow(row, config.sessionSecret));
    const dates = rows.map((row) => row.posted_at).sort();
    sendData(res, { connection_id: current._id, status: current.status, consent_url: current.status === "pending_consent" ? current.consent_url : null, consent_expires_at: current.consent_expires_at || null, accounts: ["expired", "data_expired", "revoked", "rejected"].includes(current.status) ? [] : accounts.map((a) => ({ masked_number: a.masked_number, bank_name: a.fip_id })), covered_from: dates[0] || null, covered_to: dates.at(-1) || null, transaction_count: rows.length, reason: current.reason || null });
  });

  async function syncAaFi(application, connection, requestId, actorId, previousStatus) {
    const existing = aaSyncs.get(connection._id);
    if (existing) return "fetching";
    // shortcut: this guard is process-local; use a database lease before running multiple API instances.
    const pending = syncAaFiNow(application, connection, requestId, actorId, previousStatus);
    aaSyncs.set(connection._id, pending);
    try { return await pending; }
    finally { if (aaSyncs.get(connection._id) === pending) aaSyncs.delete(connection._id); }
  }

  async function syncAaFiNow(application, connection, requestId, actorId, previousStatus) {
    let sessionId = connection.session_id;
      if (!sessionId) {
        const session = await setu("/sessions", { method: "POST", body: { consentId: connection.consent_id, dataRange: connection.data_range, format: "json" } });
        if (!session.id) throw new Error("Missing data session ID");
        sessionId = session.id;
        await db.aa_connections.updateOne({ _id: connection._id }, { $set: { session_id: sessionId, status: "fetching" } });
        if (session.status === "PENDING") return "fetching";
        if (session.status && !["PARTIAL", "COMPLETED"].includes(session.status)) throw new Error("Unexpected Setu data session status");
      }
      const fi = await setu(`/sessions/${encodeURIComponent(sessionId)}`);
      if (["FAILED", "EXPIRED"].includes(fi.status)) {
        await db.transaction(async (session) => {
          await purgeAa(connection.consent_id, session);
          await db.aa_connections.updateOne({ _id: connection._id }, { $set: { session_id: null, status: "failed", source_hash: null, reason: "Setu data session failed; try again" } }, session ? { session } : undefined);
          await db.applications.updateOne({ _id: application._id }, { $set: { input_revision: (application.input_revision || 1) + 1, evidence_revision: (application.evidence_revision || 0) + 1, status: "awaiting_evidence", updatedAt: new Date().toISOString() } }, session ? { session } : undefined);
        });
        return "failed";
      }
      if (!["PARTIAL", "COMPLETED"].includes(fi.status)) return "fetching";
      if (fi.consentId && fi.consentId !== connection.consent_id || fi.id && fi.id !== sessionId) throw new Error("Mismatched FI session");
      const normalized = normalizeSetuFi(fi, connection.consent_id);
      const shop = await one(db.shops, { _id: application.shopId });
      const identity = (value) => String(value || "").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-IN");
      const weeks = new Set(normalized.transactions.map((row) => {
        const date = new Date(`${row.posted_at}T00:00:00Z`);
        date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
        return date.toISOString().slice(0, 10);
      }));
      const inRange = normalized.transactions.every((row) => row.posted_at >= connection.data_range.from.slice(0, 10) && row.posted_at <= connection.data_range.to.slice(0, 10));
      const eligible = fi.status === "COMPLETED" && inRange && normalized.accounts.length > 0 && normalized.transactions.length > 0 && weeks.size >= 8 && normalized.accounts.every((a) => String(a.type).toLowerCase() === "deposit" && a.status === "ACTIVE" && identity(a.holder_name) === identity(shop.name));
      const resultStatus = eligible ? "ready" : "insufficient_evidence";
      const rows = [...new Map(normalized.transactions.map((row) => [row._id, { ...row, consent_id: connection.consent_id }])).values()].sort((a, b) => a.posted_at.localeCompare(b.posted_at) || a._id.localeCompare(b._id));
      const sourceHash = hashJson(rows);
      if (previousStatus === resultStatus && connection.source_hash === sourceHash) return resultStatus;
      await db.transaction(async (session) => {
        await purgeAa(connection.consent_id, session);
        for (const { holder_name, ...account } of normalized.accounts) await db.aa_accounts.insertOne(account, session ? { session } : undefined);
        for (const row of rows) await db.aa_transactions.insertOne(sealFiRow(row, config.sessionSecret), session ? { session } : undefined);
        await db.aa_connections.updateOne({ _id: connection._id }, { $set: { status: resultStatus, source_hash: sourceHash, reason: eligible ? null : "Bank data did not satisfy identity, account, or eight-week coverage checks", updatedAt: new Date().toISOString() } }, session ? { session } : undefined);
        await db.applications.updateOne({ _id: application._id }, { $set: { input_revision: (application.input_revision || 1) + 1, evidence_revision: (application.evidence_revision || 0) + 1, status: eligible ? "submitted" : "awaiting_evidence", updatedAt: new Date().toISOString() } }, session ? { session } : undefined);
        await audit(actorId, "aa_evidence_fetched", `applications/${application._id}`, { connection_id: connection._id, status: resultStatus, source_hash: sourceHash }, true, { request_id: requestId, verification_id: connection._id, input_revision: (application.input_revision || 1) + 1, evidence_revision: (application.evidence_revision || 0) + 1, source_reference: "aa_sandbox" }, session);
      });
      return resultStatus;
  }

  route("post", "/api/applications/:id/aa/refresh", requireSession, requireRole("owner"), async (req, res) => {
    const application = await one(db.applications, { _id: req.params.id, ownerId: req.session.userId });
    if (!application) return sendError(res, 404, "NOT_FOUND", "Not found");
    const connection = await one(db.aa_connections, { application_id: application._id });
    if (!connection) return sendError(res, 404, "NOT_FOUND", "No AA connection");
    if (["revoked", "rejected", "expired"].includes(connection.status)) return sendData(res, { status: connection.status });
    let consent;
    try { consent = await setu(`/consents/${encodeURIComponent(connection.consent_id)}`); }
    catch { return sendError(res, 502, "AA_PROVIDER_ERROR", "Could not check Setu consent", { retryable: true }); }
    const status = ({ PENDING: "pending_consent", ACTIVE: "consent_active", REJECTED: "rejected", REVOKED: "revoked", PAUSED: "paused", EXPIRED: "expired" })[consent.status];
    if (!status) return sendError(res, 502, "AA_PROVIDER_ERROR", "Unknown Setu consent status");
    const previousStatus = connection.status;
    const wasReady = previousStatus === "ready";
    if (wasReady && status === "consent_active") return sendData(res, { status: "ready" }, 202);
    const expiry = getDataLifeExpiry(consent.detail, connection.data_life_expires_at || (status === "consent_active" ? new Date(Date.now() + 30 * 86400000).toISOString() : undefined));
    await db.aa_connections.updateOne({ _id: connection._id }, { $set: { status, consent_expires_at: consent.detail?.consentExpiry || null, data_life_expires_at: expiry, updatedAt: new Date().toISOString() } });
    if (["revoked", "expired", "rejected", "paused"].includes(status) && wasReady) {
      await db.applications.updateOne({ _id: application._id }, { $set: { input_revision: (application.input_revision || 1) + 1, evidence_revision: (application.evidence_revision || 0) + 1, status: "awaiting_evidence", updatedAt: new Date().toISOString() } });
    }
    if (["revoked", "expired", "rejected"].includes(status)) await purgeAa(connection.consent_id);
    if (status !== "consent_active") return sendData(res, { status }, 202);
    try {
      const latest = await one(db.aa_connections, { _id: connection._id });
      const resultStatus = await syncAaFi(application, latest, req.id, req.session.userId, previousStatus);
      sendData(res, { status: resultStatus }, 202);
    } catch { return sendError(res, 502, "AA_PROVIDER_ERROR", "Could not fetch Setu bank data", { retryable: true }); }
  });

  route("post", "/api/applications/:id/aa/revoke", requireSession, requireRole("owner"), async (req, res) => {
    const application = await one(db.applications, { _id: req.params.id, ownerId: req.session.userId });
    if (!application) return sendError(res, 404, "NOT_FOUND", "Not found");
    const connection = await one(db.aa_connections, { application_id: application._id });
    if (!connection) return sendError(res, 404, "NOT_FOUND", "No AA connection");
    if (connection.status === "revoked") return sendData(res, { status: "revoked" });
    try { await setu(`/consents/${encodeURIComponent(connection.consent_id)}/revoke`, { method: "POST" }); }
    catch { return sendError(res, 502, "AA_PROVIDER_ERROR", "Could not revoke Setu consent", { retryable: true }); }
    await db.transaction(async (session) => {
      await db.aa_connections.updateOne({ _id: connection._id }, { $set: { status: "revoked", updatedAt: new Date().toISOString() } }, session ? { session } : undefined);
      await purgeAa(connection.consent_id, session);
      await db.applications.updateOne({ _id: application._id }, { $set: { input_revision: (application.input_revision || 1) + 1, evidence_revision: (application.evidence_revision || 0) + 1, status: "awaiting_evidence", updatedAt: new Date().toISOString() } }, session ? { session } : undefined);
      await audit(req.session.userId, "aa_consent_revoked", `applications/${application._id}`, { connection_id: connection._id }, true, { request_id: req.id, verification_id: connection._id, input_revision: (application.input_revision || 1) + 1, evidence_revision: (application.evidence_revision || 0) + 1, source_reference: "aa_sandbox" }, session);
    });
    sendData(res, { status: "revoked" });
  });

  route("post", "/api/aa/setu/webhook", async (req, res) => {
    const expected = Buffer.from(config.setuWebhookToken);
    if (!expected.length) return sendError(res, 503, "AA_CALLBACK_DISABLED", "Setu callback authentication is not configured");
    const supplied = Buffer.from(String(req.get("authorization") || "").replace(/^Bearer /i, ""));
    if (!expected.length || expected.length !== supplied.length || !crypto.timingSafeEqual(expected, supplied)) return sendError(res, 401, "UNAUTHENTICATED", "Invalid AA callback authorization");
    const consentId = req.body?.consentId;
    if (typeof consentId !== "string" || !["CONSENT_STATUS_UPDATE", "SESSION_STATUS_UPDATE"].includes(req.body?.type)) return sendError(res, 422, "VALIDATION", "Invalid AA notification");
    const connection = await one(db.aa_connections, { consent_id: consentId });
    if (!connection || req.body?.type === "SESSION_STATUS_UPDATE" && req.body?.dataSessionId !== connection.session_id) return sendError(res, 404, "NOT_FOUND", "Unknown AA notification");
    if (connection.status === "revoked") return sendData(res, { accepted: true }, 202);
    let consent;
    try { consent = await setu(`/consents/${encodeURIComponent(consentId)}`); }
    catch { return sendError(res, 502, "AA_PROVIDER_ERROR", "Could not confirm Setu consent", { retryable: true }); }
    const status = ({ PENDING: "pending_consent", ACTIVE: "consent_active", REJECTED: "rejected", REVOKED: "revoked", PAUSED: "paused", EXPIRED: "expired" })[consent.status];
    if (!status) return sendError(res, 502, "AA_PROVIDER_ERROR", "Unknown Setu consent status");
    const application = await one(db.applications, { _id: connection.application_id });
    const previousStatus = connection.status;
    const wasReady = previousStatus === "ready";
    const expiry = getDataLifeExpiry(consent.detail, connection.data_life_expires_at);
    await db.transaction(async (session) => {
      await db.aa_connections.updateOne({ _id: connection._id }, { $set: { status: wasReady && status === "consent_active" ? "ready" : status, notification_at: new Date().toISOString(), consent_expires_at: consent.detail?.consentExpiry || null, data_life_expires_at: expiry } }, session ? { session } : undefined);
      if (wasReady && ["revoked", "expired", "rejected", "paused"].includes(status)) await db.applications.updateOne({ _id: application._id }, { $set: { input_revision: (application.input_revision || 1) + 1, evidence_revision: (application.evidence_revision || 0) + 1, status: "awaiting_evidence", updatedAt: new Date().toISOString() } }, session ? { session } : undefined);
      if (["revoked", "expired", "rejected"].includes(status)) await purgeAa(connection.consent_id, session);
    });
    if (status === "consent_active" && !wasReady && (req.body.type === "CONSENT_STATUS_UPDATE" || req.body?.data?.status === "PARTIAL" || req.body?.data?.status === "COMPLETED")) {
      try { await syncAaFi(application, connection, req.id, "setu_webhook", previousStatus); }
      catch { return sendError(res, 502, "AA_PROVIDER_ERROR", "Could not fetch Setu bank data", { retryable: true }); }
    }
    sendData(res, { accepted: true }, 202);
  });

  route("post", "/api/applications/:id/verification-requests", requireSession, requireRole("owner"), async (req, res) => {
    const appn = await one(db.applications, { _id: req.params.id, ownerId: req.session.userId });
    if (!appn) return sendError(res, 404, "NOT_FOUND", "Not found");
    if (await one(db.aa_connections, { application_id: appn._id })) return sendError(res, 409, "AA_CONNECTION_EXISTS", "This application already uses Setu sandbox evidence");
    if (Object.keys(req.body || {}).some((key) => key !== "public_ref")) return sendError(res, 422, "TRUST_NOT_CLIENT", "Only a listed account reference can be submitted");
    const account = await one(db.bank_accounts, { public_ref: req.body?.public_ref });
    if (!account) return sendError(res, 422, "INVALID_ACCOUNT_REFERENCE", "Choose a listed demo account");
    const bodyHash = hashJson(req.body);
    const idem = await idempotent(req, res, "verification:" + appn._id, bodyHash);
    if (idem.done) return;
    if (idem.missing) return sendError(res, 400, "IDEMPOTENCY_REQUIRED", "Idempotency-Key required");
    const verification = { _id: crypto.randomUUID(), application_id: appn._id, shop_id: appn.shopId, owner_id: req.session.userId, account_id: account._id, status: "pending", createdAt: new Date().toISOString(), evidence_revision: (appn.evidence_revision || 0) + 1, result: null };
    const response = { data: { id: verification._id, status: verification.status, application_id: appn._id, evidence_revision: verification.evidence_revision } };
    await db.transaction(async (session) => {
      await db.verification_requests.insertOne(verification, session ? { session } : undefined);
      await db.applications.updateOne({ _id: appn._id }, { $set: { current_verification_id: verification._id, evidence_revision: verification.evidence_revision, input_revision: (appn.input_revision || 1) + 1, status: "awaiting_verification", updatedAt: new Date().toISOString() } }, session ? { session } : undefined);
      await audit(req.session.userId, "verification_requested", "applications/" + appn._id, { verification_id: verification._id, account_ref: account.public_ref }, true, { request_id: req.id, verification_id: verification._id, input_revision: (appn.input_revision || 1) + 1, evidence_revision: verification.evidence_revision, source_reference: account.public_ref }, session);
      await saveIdem(req, idem.key, "verification:" + appn._id, bodyHash, 201, response, session);
    });
    res.status(201).json(response);
  });

  route("get", "/api/evidence/demo-fixtures", requireSession, requireRole("owner"), async (req, res) => {
    const type = req.query.type;
    const items = EVIDENCE_FIXTURES.filter((fixture) => !type || fixture.type === type).map(safeEvidenceFixture);
    sendData(res, items);
  });

  route("post", "/api/applications/:id/evidence-responses", requireSession, requireRole("owner"), async (req, res) => {
    const b = await loadApplicationBundle(req, req.params.id);
    if (b.err) return sendError(res, b.err[0], b.err[1], b.err[2]);
    if (b.appn.ownerId !== req.session.userId) return sendError(res, 404, "NOT_FOUND", "Not found");
    if (Object.keys(req.body || {}).some((key) => key !== "public_ref")) return sendError(res, 422, "TRUST_NOT_CLIENT", "Only a listed fixture reference can be submitted");
    const bodyHash = hashJson(req.body);
    const idem = await idempotent(req, res, "evidence-response:" + b.appn._id, bodyHash);
    if (idem.done) return;
    if (idem.missing) return sendError(res, 400, "IDEMPOTENCY_REQUIRED", "Idempotency-Key required");
    if (b.appn.status !== "awaiting_evidence" || b.latestAction?.action !== "request_evidence") return sendError(res, 422, "NO_EVIDENCE_REQUEST", "There is no open evidence request on this application");
    if (b.latestAction.evidence_type === "upi") return sendError(res, 422, "USE_BANK_REVIEW", "Submit a listed demo bank account for merchant activity review");
    const fixture = EVIDENCE_FIXTURES.find((item) => item.public_ref === req.body?.public_ref);
    if (!fixture || fixture.type !== b.latestAction.evidence_type) return sendError(res, 422, "INVALID_FIXTURE", "Choose a listed fixture that matches the requested evidence type");
    const railType = fixture.rail_type || fixture.type;
    const rail = {
      _id: crypto.randomUUID(),
      shopId: b.shop._id,
      type: railType,
      trustClass: fixture.trustClass,
      fixture_id: fixture.public_ref,
      provenance: "synthetic",
      identity_match: fixture.identity_match !== false,
      payload: fixture.payload || {},
      createdAt: new Date().toISOString(),
      source: "evidence_response",
    };
    const inputRevision = (b.appn.input_revision || 1) + 1;
    const evidenceRevision = (b.appn.evidence_revision || 0) + 1;
    const shopPatch = { input_revision: (b.shop.input_revision || 1) + 1 };
    if (fixture.identity && fixture.identity_match) shopPatch.identity = { ...(b.shop.identity || {}), ...fixture.identity };
    const response = { data: { application_id: b.appn._id, fixture_id: fixture.public_ref, evidence_type: fixture.type, rail_type: railType, input_revision: inputRevision, evidence_revision: evidenceRevision } };
    await db.transaction(async (session) => {
      await db.rails.insertOne(rail, session ? { session } : undefined);
      await db.shops.updateOne({ _id: b.shop._id }, { $set: shopPatch }, session ? { session } : undefined);
      await db.applications.updateOne({ _id: b.appn._id }, { $set: { evidence_revision: evidenceRevision, input_revision: inputRevision, status: "submitted", latest_evidence_response: { fixture_id: fixture.public_ref, evidence_type: fixture.type, rail_type: railType, at: rail.createdAt }, updatedAt: new Date().toISOString() } }, session ? { session } : undefined);
      await audit(req.session.userId, "evidence_responded", "applications/" + b.appn._id, { fixture_id: fixture.public_ref, evidence_type: fixture.type }, true, { request_id: req.id, input_revision: inputRevision, evidence_revision: evidenceRevision, source_reference: fixture.public_ref }, session);
      await saveIdem(req, idem.key, "evidence-response:" + b.appn._id, bodyHash, 201, response, session);
    });
    res.status(201).json(response);
  });

  route("get", "/api/bank/dashboard", requireSession, requireRole("bank_admin"), async (_req, res) => {
    const items = await list(db.verification_requests, {});
    const counts = Object.fromEntries(["pending", "verified_simulated", "mismatch", "insufficient_evidence"].map((status) => [status, items.filter((item) => item.status === status).length]));
    sendData(res, { counts, recent: items.slice(0, 50) });
  });

  route("get", "/api/bank/verification-requests", requireSession, requireRole("bank_admin"), async (req, res) => {
    sendData(res, await list(db.verification_requests, req.query.status ? { status: req.query.status } : {}));
  });

  route("get", "/api/bank/verification-requests/:id", requireSession, requireRole("bank_admin"), async (req, res) => {
    const v = await one(db.verification_requests, { _id: req.params.id });
    if (!v) return sendError(res, 404, "NOT_FOUND", "Not found");
    const [shop, application, account] = await Promise.all([one(db.shops, { _id: v.shop_id }), one(db.applications, { _id: v.application_id }), one(db.bank_accounts, { _id: v.account_id })]);
    const inspected = await inspectBank(db, shop, account);
    sendData(res, { ...v, result: publicResult(v.result), shop, application, account: safeAccount(account), recommendation: inspected.recommendation, checks: inspected.checks, transactions: inspected.rows, transaction_summary: { covered_from: inspected.covered_from, covered_to: inspected.covered_to, transaction_count: inspected.transaction_count, total_credit_paise: inspected.total_credit_paise, total_debit_paise: inspected.total_debit_paise }, source_hash: inspected.source_hash });
  });

  async function recordUnverifiedAssessment(application, shop, verification, checked, failedReason, inputRevision, evidenceRevision, req, session, freshnessReview) {
    let scored = null;
    if ((await scoreHealth()).ok) {
      try {
        const evidence = await evidenceFor(application, shop);
        scored = await postScore("/internal/agent", scorePayload(shop, evidence.rails, evidence.cashflows, application._id, application.requested_amount_paise, evidence.statement));
      } catch {
        scored = null;
      }
    }
    const decision = {
      _id: crypto.randomUUID(),
      applicationId: application._id,
      shopId: shop._id,
      scenarioOnly: false,
      createdAt: new Date().toISOString(),
      assessed_at: new Date().toISOString(),
      verification_id: verification._id,
      evidence_revision: evidenceRevision,
      input_revision: inputRevision,
      baselineVerdict: "DECLINE",
      ...(scored || {}),
      verdict: "UNVERIFIED",
      principal_paise: 0,
      rate_bps: 0,
      tenure_months: 0,
      p_auth: null,
      p_stress: null,
      total_repayment_paise: 0,
      total_interest_paise: 0,
      repayment_amount_paise: 0,
      not_run_reason: checked.recommendation === "mismatch" ? "identity_mismatch" : "insufficient_evidence",
      drivers: [{ text: failedReason, feature: "bank_review" }],
      freshness_review: freshnessReview,
    };
    decision.audit_reference = await audit(req.session.userId, "score", `applications/${application._id}`, decision, true, {
      request_id: req.id,
      decision_id: decision._id,
      input_revision: inputRevision,
      evidence_revision: evidenceRevision,
      source_reference: verification.account_id,
    }, session);
    await db.decisions.insertOne(decision, session ? { session } : undefined);
    return decision;
  }

  route("post", "/api/bank/verification-requests/:id/decision", requireSession, requireRole("bank_admin"), async (req, res) => {
    const v = await one(db.verification_requests, { _id: req.params.id });
    if (!v) return sendError(res, 404, "NOT_FOUND", "Not found");
    const bodyHash = hashJson(req.body || {});
    const idem = await idempotent(req, res, "bank-review:" + v._id, bodyHash);
    if (idem.done) return;
    if (idem.missing) return sendError(res, 400, "IDEMPOTENCY_REQUIRED", "Idempotency-Key required");
    if (v.status !== "pending") return sendError(res, 409, "ALREADY_REVIEWED", "This request has already been reviewed");
    const action = req.body?.action;
    if (!["confirm", "reject", "release"].includes(action)) return sendError(res, 422, "VALIDATION", "Choose confirm, reject, or release");
    if (action === "reject" && String(req.body?.reason || "").trim().length < 8) return sendError(res, 422, "REASON_REQUIRED", "Add a reason of at least 8 characters");
    const [shop, application, account] = await Promise.all([one(db.shops, { _id: v.shop_id }), one(db.applications, { _id: v.application_id }), one(db.bank_accounts, { _id: v.account_id })]);
    const checked = await inspectBank(db, shop, account);
    if (action === "confirm" && checked.recommendation !== "verified_simulated") return sendError(res, 422, "CHECKS_FAILED", "Required checks did not pass");
    if (action === "release" && checked.recommendation === "verified_simulated") return sendError(res, 422, "CHECKS_PASSED", "Required checks passed; confirm the simulated verification");
    const failedReason = checked.checks.filter((check) => check.status !== "pass").map((check) => check.reason).join("; ") || "Required checks did not pass";
    const status = action === "confirm" ? "verified_simulated" : checked.recommendation === "mismatch" ? "mismatch" : "insufficient_evidence";
    const result = { outcome: status, checks: checked.checks, covered_from: checked.covered_from, covered_to: checked.covered_to, transaction_count: checked.transaction_count, total_credit_paise: checked.total_credit_paise, total_debit_paise: checked.total_debit_paise, source_hash: checked.source_hash, fixture_version: account.fixture_version, reviewed_by: req.session.userId, reviewed_at: new Date().toISOString(), reason: action === "confirm" ? "All required checks passed" : action === "release" ? failedReason : String(req.body.reason).trim(), provenance: "synthetic" };
    if (status === "verified_simulated") {
      const pdf = buildStatementPdf({ documentId: `stmt-${v._id}`, accountRef: account.public_ref, holder: account.customer_name, sourceHash: checked.source_hash, rows: checked.rows });
      result.statement = { document_id: `stmt-${v._id}`, filename: `${account.public_ref}-statement.pdf`, media_type: "application/pdf", issuer: "bank_api", trust_class: "bank_issued_synthetic", sha256: crypto.createHash("sha256").update(pdf).digest("hex"), byte_length: pdf.length, row_count: checked.rows.length, pdf_base64: pdf.toString("base64"), provenance: "synthetic" };
    }
    const inputRevision = (application.input_revision || 1) + 1;
    const evidenceRevision = (application.evidence_revision || 0) + 1;
    const appUpdate = { evidence_revision: evidenceRevision, input_revision: inputRevision, status: status === "verified_simulated" ? "submitted" : "awaiting_evidence", updatedAt: new Date().toISOString() };
    const releaseFreshness = action === "release" ? evidenceFreshness(await evidenceFor(application, shop)) : null;
    const response = { data: { id: v._id, status, result: publicResult(result) } };
    await db.transaction(async (session) => {
      result.audit_reference = await audit(req.session.userId, "verification_reviewed", "applications/" + application._id, { verification_id: v._id, status, source_hash: checked.source_hash }, true, { request_id: req.id, verification_id: v._id, input_revision: inputRevision, evidence_revision: evidenceRevision, source_reference: account?.public_ref || null }, session);
      await db.verification_requests.updateOne({ _id: v._id }, { $set: { status, result } }, session ? { session } : undefined);
      if (action === "release") {
        const decision = await recordUnverifiedAssessment(application, shop, v, checked, failedReason, inputRevision, evidenceRevision, req, session, releaseFreshness);
        appUpdate.status = "assessed";
        appUpdate.latest_decision_id = decision._id;
      }
      await db.applications.updateOne({ _id: application._id }, { $set: appUpdate }, session ? { session } : undefined);
      response.data.result = publicResult(result);
      await saveIdem(req, idem.key, "bank-review:" + v._id, bodyHash, 200, response, session);
    });
    res.json(response);
  });

  route("get", "/api/applications", requireSession, async (req, res) => {
    const q = {
      ...(req.session.role === "owner" ? { ownerId: req.session.userId } : {}),
      ...(req.query.status ? { status: req.query.status } : {}),
    };
    const requestedLimit = Number(req.query.limit) || 50;
    const limit = Math.min(Math.max(requestedLimit, 1), 100);
    let after = null;
    if (req.query.cursor) {
      try {
        after = JSON.parse(Buffer.from(String(req.query.cursor), "base64url").toString("utf8"));
      } catch {
        return sendError(res, 400, "INVALID_CURSOR", "Application cursor is invalid");
      }
      const validCursorDate = typeof after?.createdAt === "string"
        && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(after.createdAt)
        && Number.isFinite(Date.parse(after.createdAt));
      if (!validCursorDate || typeof after?._id !== "string" || !after._id.trim()) {
        return sendError(res, 400, "INVALID_CURSOR", "Application cursor is invalid");
      }
    }
    const summarize = async (a) => {
      const shop = await one(db.shops, { _id: a.shopId });
      const evidence = await evidenceFor(a, shop);
      const dec = a.latest_decision_id ? await one(db.decisions, { _id: a.latest_decision_id }) : null;
      const actions = await list(db.overrides, { applicationId: a._id });
      const latest = actions.filter((x) => x.decisionId === dec?._id).sort((x, y) => y.createdAt.localeCompare(x.createdAt))[0];
      const freshnessFlows = evidence.cashflows.length ? evidence.cashflows : await list(db.cashflows, { shopId: a.shopId });
      const freshness = evidenceFreshness({ ...evidence, cashflows: freshnessFlows });
      const assessmentStale = !!dec && (dec.input_revision !== a.input_revision || evidence.verification?.source === "aa_sandbox" && evidence.verification.status !== "ready");
      const types = evidence.rails.map((rail) => rail.type);
      return { ...a, shop_name: shop?.name || a.shopId, business_type: shop?.business_type || shop?.category || null, verified_rail_count: verifiedCount(evidence.rails), rail_types: types, pdf_only: types.length > 0 && types.every((type) => type === "pdf"), evidence_requested: latest?.action === "request_evidence" ? latest.evidence_type : null, evidence_last_observed_at: freshness.observed_at, observation_age_days: freshness.age_days, freshness_review: freshness, verification_status: evidence.verification?.status || "legacy_demo", latest_verdict: dec?.verdict || null, principal_paise: assessmentStale ? null : dec?.principal_paise ?? null, p_auth: assessmentStale ? null : dec?.p_auth ?? null, p_stress: assessmentStale ? null : dec?.p_stress ?? null, not_run_reason: assessmentStale ? null : dec?.not_run_reason || null, score_basis: assessmentStale ? null : dec?.drivers?.[0]?.text || null, assessment_stale: assessmentStale, assessed_at: dec?.assessed_at || null, updated_at: [a.updatedAt, latest?.createdAt, dec?.assessed_at, a.createdAt].filter(Boolean).sort().at(-1) || null, review_reason: a.status === "awaiting_verification" ? "Bank verification pending" : a.status === "awaiting_evidence" ? latest?.reason || "Requested evidence pending" : assessmentStale ? "Reassess after evidence update" : freshness.review_required ? `Review freshness: latest verified activity is over ${freshness.max_age_days} days old` : dec?.not_run_reason || dec?.drivers?.[0]?.text || dec?.drivers?.[0]?.feature || null, effective_action: assessmentStale ? null : latest?.action || null, effective_verdict: assessmentStale ? null : latest?.effective?.verdict || dec?.verdict || null };
    };
    let pageItems, total, workflowCounts, verifiedRailApplications, nextCursor;
    if (typeof db.applicationPage === "function") {
      const [page, meta] = await Promise.all([
        db.applicationPage(q, after, limit, req.query.verdict),
        req.session.role === "lender" ? db.applicationQueueMeta(q, req.query.verdict) : Promise.resolve({ workflow_counts: {}, verified_rail_applications: 0 }),
      ]);
      [pageItems, total, nextCursor] = [page.items, page.total, page.next_cursor];
      [workflowCounts, verifiedRailApplications] = [meta.workflow_counts, meta.verified_rail_applications];
      pageItems = await Promise.all(pageItems.map(summarize));
    } else {
      const summaries = await Promise.all((await list(db.applications, q)).map(summarize));
      summaries.sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")) || String(a._id).localeCompare(String(b._id)));
      const filtered = req.query.verdict ? summaries.filter((a) => a.latest_verdict === req.query.verdict) : summaries;
      workflowCounts = { pending: 0, needs_evidence: 0, assessed: 0, reviewed: 0 };
      for (const item of filtered) {
        const workflow = ["awaiting_evidence", "awaiting_verification"].includes(item.status) ? "needs_evidence"
          : item.assessment_stale || !item.latest_verdict ? "pending"
            : item.status === "reviewed" ? "reviewed"
              : item.effective_verdict === "UNVERIFIED" ? "needs_evidence" : "assessed";
        workflowCounts[workflow] += 1;
      }
      const offset = after
        ? filtered.findIndex((item) => String(item.createdAt || "").localeCompare(after.createdAt) > 0 || (String(item.createdAt || "") === after.createdAt && String(item._id).localeCompare(after._id) > 0))
        : 0;
      const start = offset < 0 ? filtered.length : offset;
      pageItems = filtered.slice(start, start + limit);
      total = filtered.length;
      verifiedRailApplications = filtered.filter((item) => item.verified_rail_count > 0).length;
      const last = pageItems.at(-1);
      nextCursor = last && start + pageItems.length < filtered.length
        ? Buffer.from(JSON.stringify({ createdAt: last.createdAt || "", _id: last._id })).toString("base64url")
        : null;
    }
    res.json({
      items: pageItems,
      total,
      workflow_counts: workflowCounts,
      verified_rail_applications: verifiedRailApplications,
      next_cursor: nextCursor,
    });
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

  route("get", "/api/applications/:id", requireSession, async (req, res) => {
    const b = await loadApplicationBundle(req, req.params.id);
    if (b.err) return sendError(res, b.err[0], b.err[1], b.err[2]);
    const { ownerFlags, ...safeShop } = b.shop;
    const ownerView = req.session.role === "owner";
    const verification = await currentVerification(b.appn);
    const evidence = await evidenceFor(b.appn, b.shop);
    const gstRails = evidence.rails.filter((r) => r.type === "gst" && TRUST_VERIFIED.has(r.trustClass));
    const gstPeriods = [...new Set(gstRails.map((r) => `${isoDay(r.payload?.period_from) || ""}/${isoDay(r.payload?.period_to) || ""}`))];
    const gstPeriod = gstPeriods.length === 1 ? gstPeriods[0].split("/") : [];
    const upiFlows = evidence.cashflows.filter((r) => !r.source_rail || String(r.source_rail).includes("upi"));
    const upiDates = upiCoverageDates(upiFlows);
    const aligned = gstRails.length > 0 && gstPeriod.length === 2 && gstPeriod.every(Boolean) && upiDates[0] === gstPeriod[0] && upiDates.at(-1) === gstPeriod[1];
    const gstSales = aligned ? gstRails.reduce((sum, r) => sum + Number(r.payload?.taxable_sales_paise || 0), 0) : null;
    const upiCredits = aligned ? upiFlows.filter((r) => { const day = isoDay(r.t || r.posted_at); return day >= gstPeriod[0] && day <= gstPeriod[1]; }).reduce((sum, r) => sum + Number(r.inflow_paise ?? r.inflowPaise ?? 0), 0) : null;
    sendData(res, {
      application: b.appn,
      assessment_stale: !!b.decision && (b.decision.input_revision !== b.appn.input_revision || evidence.verification?.source === "aa_sandbox" && evidence.verification.status !== "ready"),
      shop: safeShop,
      rails: evidence.rails.map((r) => {
        const dates = r.type === "upi" ? (upiCoverageDates(evidence.cashflows).length ? upiCoverageDates(evidence.cashflows) : upiCoverageDates(b.cashflows)) : [];
        const payload = r.payload || {};
        const coverage_from = r.coverage_from || payload.period_from || dates[0] || null;
        const coverage_to = r.coverage_to || payload.period_to || dates.at(-1) || null;
        return { type: r.type, trustClass: r.trustClass, provenance: r.provenance, identity_match: r.identity_match,
          createdAt: r.createdAt || null, coverage_from, coverage_to,
          coverage_basis: r.type === "upi" && dates.length ? "dated_transactions" : payload.period_from ? "fixture_declared_period" : "unknown" };
      }),
      freshness_review: evidenceFreshness(evidence),
      cashflows: ownerView ? evidence.cashflows.map((r) => ({ t: r.t, inflow_paise: r.inflow_paise ?? r.inflowPaise ?? 0, outflow_paise: r.outflow_paise ?? r.outflowPaise ?? 0 })) : evidence.cashflows,
      verification: evidence.verification ? { id: evidence.verification._id || null, status: evidence.verification.status, source: evidence.verification.source || "synthetic", evidence_revision: evidence.verification.evidence_revision ?? null, account_count: evidence.verification.account_count ?? null, covered_from: evidence.verification.covered_from ?? null, covered_to: evidence.verification.covered_to ?? null, result: publicResult(evidence.verification.result) } : { status: "not_requested" },
      decision: b.decision,
      latest_action: b.latestAction,
      reconciliation: ownerView || !gstRails.length ? null : aligned ? { available: true, gst_sales_paise: gstSales, upi_credits_paise: upiCredits, relative_gap: Math.abs(gstSales - upiCredits) / Math.max(gstSales, upiCredits, 1), period_from: gstPeriod[0], period_to: gstPeriod[1], period_note: `Synthetic totals aligned to ${gstPeriod[0]}–${gstPeriod[1]}` } : { available: false, gst_sales_paise: null, upi_credits_paise: null, relative_gap: null, period_note: "GST and UPI coverage periods do not align; comparison unavailable" },
      provenance: evidence.verification?.source || "synthetic",
    });
  });

  route("post", "/api/applications/:id/score", requireSession, requireRole("lender"), async (req, res) => {
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
    if (await one(db.aa_connections, { application_id: b.appn._id }) && evidence.verification?.status !== "ready") {
      return sendError(res, 422, "CONSENT_NOT_READY", "Setu bank evidence is not ready");
    }
    await db.applications.updateOne({ _id: b.appn._id }, { $set: { status: "assessing" } });
    let scored;
    try {
      scored = await postScore("/internal/agent", scorePayload(b.shop, evidence.rails, evidence.cashflows, b.appn._id, b.appn.requested_amount_paise, evidence.statement));
    } catch (e) {
      await db.transaction(async (session) => {
        await db.applications.updateOne({ _id: b.appn._id }, { $set: { status: "failed" } }, session ? { session } : undefined);
        await audit(req.session.userId, "score", `applications/${b.appn._id}`, req.body || {}, false, {
          request_id: req.id,
        }, session);
      });
      return sendError(res, 503, "SCORE_UNAVAILABLE", "Scoring service unavailable", {
        request_id: req.id,
        retryable: true,
      });
    }
    if (evidence.verification && !["verified_simulated", "ready"].includes(evidence.verification.status) || verifiedCount(evidence.rails) === 0) {
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
      freshness_review: evidenceFreshness(evidence),
    };
    const payload = await db.transaction(async (session) => {
      const auditId = await audit(req.session.userId, "score", `applications/${b.appn._id}`, decision, true, {
        request_id: req.id,
        decision_id: decision._id,
        input_revision: decision.input_revision,
        evidence_revision: decision.evidence_revision,
        model_auth_version: decision.versions?.model_auth || null,
        model_stress_version: decision.versions?.model_stress || null,
        source_references: decision.explanation?.source_references || [],
      }, session);
      decision.audit_reference = auditId;
      await db.decisions.insertOne(decision, session ? { session } : undefined);
      await db.applications.updateOne(
        { _id: b.appn._id },
        { $set: { status: "assessed", latest_decision_id: decision._id } },
        session ? { session } : undefined
      );
      const result = { data: decision };
      await saveIdem(req, idemp.key, `score:${req.params.id}`, bodyHash, 200, result, session);
      return result;
    });
    res.json(payload);
  });

  route("post", "/api/applications/:id/stress", requireSession, requireRole("lender"), async (req, res) => {
    const b = await loadApplicationBundle(req, req.params.id);
    if (b.err) return sendError(res, b.err[0], b.err[1], b.err[2]);
    if (!b.decision) return sendError(res, 422, "NO_DECISION", "Score first");
    if (b.decision.input_revision !== (b.appn.input_revision || 1)) return sendError(res, 409, "STALE_REVISION", "Evidence changed; reassess before testing stress");
    const evidence = await evidenceFor(b.appn, b.shop);
    if (evidence.verification?.source === "aa_sandbox" && evidence.verification.status !== "ready") return sendError(res, 409, "STALE_REVISION", "Setu consent is no longer ready");
    let scored;
    try {
      scored = await postScore("/stress-test", {
        ...scorePayload(b.shop, evidence.rails, evidence.cashflows, b.appn._id, b.appn.requested_amount_paise, evidence.statement),
        lean_inflow_delta_pct: Number(req.body?.lean_inflow_delta_pct ?? 0),
        outflow_delta_pct: Number(req.body?.outflow_delta_pct ?? 0),
        base_decision_id: b.decision._id,
      });
    } catch (e) {
      return sendError(res, 503, "SCORE_UNAVAILABLE", String(e.message), { retryable: true, request_id: req.id });
    }
    scored.scenario_only = true;
    if ((evidence.verification && !["verified_simulated", "ready"].includes(evidence.verification.status)) || verifiedCount(evidence.rails) === 0) {
      scored.verdict = "UNVERIFIED";
      scored.principal_paise = 0;
      scored.rate_bps = 0;
      scored.tenure_months = 0;
      scored.p_stress = null;
      scored.not_run_reason = "no_verified_rail";
    }
    const leanPct = Number(req.body?.lean_inflow_delta_pct ?? 0);
    const outflowPct = Number(req.body?.outflow_delta_pct ?? 0);
    scored.audit_reference = await audit(req.session.userId, "stress", `applications/${b.appn._id}`, {
      scenario_only: true,
      lean_inflow_delta_pct: leanPct,
      outflow_delta_pct: outflowPct,
      base_decision_id: b.decision._id,
      verdict: scored.verdict,
      principal_paise: scored.principal_paise,
    }, true, {
      request_id: req.id,
      decision_id: b.decision._id,
      input_revision: b.decision.input_revision,
      evidence_revision: b.decision.evidence_revision,
      action_detail: "illustrative_scenario",
      reason: `Inflow ${leanPct}%; outflow ${outflowPct}%`,
    });
    sendData(res, scored);
  });

  route("post", "/api/applications/:id/override", requireSession, requireRole("lender"), async (req, res) => {
    const bodyHash = hashJson(req.body || {});
    const idemp = await idempotent(req, res, `override:${req.params.id}`, bodyHash);
    if (idemp.done) return;
    if (idemp.missing) return sendError(res, 400, "IDEMPOTENCY_REQUIRED", "Idempotency-Key required");
    const b = await loadApplicationBundle(req, req.params.id);
    if (b.err) return sendError(res, b.err[0], b.err[1], b.err[2]);
    if (!b.decision) return sendError(res, 422, "NO_DECISION", "Score first");
    if (b.decision.input_revision !== (b.appn.input_revision || 1)) return sendError(res, 409, "STALE_REVISION", "Evidence changed; reassess before a lender action");
    const currentEvidence = await evidenceFor(b.appn, b.shop);
    if (currentEvidence.verification?.source === "aa_sandbox" && currentEvidence.verification.status !== "ready") return sendError(res, 409, "STALE_REVISION", "Setu consent is no longer ready");
    const reason = req.body?.reason;
    if (!reason || String(reason).trim().length < 8) {
      return sendError(res, 409, "OVERRIDE_REASON_REQUIRED", "Reason required");
    }
    const action = req.body?.action;
    if (!["approve", "decline", "request_evidence", "reduce_terms"].includes(action)) {
      return sendError(res, 422, "VALIDATION", "Invalid action");
    }
    if (action === "approve" && (!b.decision.principal_paise || ["DECLINE", "UNVERIFIED"].includes(b.decision.verdict) || !["verified_simulated", "ready"].includes((await evidenceFor(b.appn, b.shop)).verification?.status))) {
      return sendError(res, 422, "NOT_APPROVABLE", "A positive assessment and completed bank verification are required");
    }
    if (["approve", "reduce_terms"].includes(action) && (b.decision.capacity?.max_principal_paise == null || (b.decision.principal_paise > 0 && [b.decision.tenure_months, b.decision.rate_bps, b.decision.cadence, b.decision.repayment_amount_paise, b.decision.repayment_periods, b.decision.total_repayment_paise, b.decision.total_interest_paise].some((value) => value == null || value === 0 || value === "")))) {
      return sendError(res, 422, "ASSESSMENT_REFRESH_REQUIRED", "Reassess this application before recording positive terms");
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
    if (action === "approve") {
      ov.effective = { verdict: b.decision.verdict, principal_paise: b.decision.principal_paise, tenure_months: b.decision.tenure_months, rate_bps: b.decision.rate_bps, cadence: b.decision.cadence, repayment_amount_paise: b.decision.repayment_amount_paise, repayment_periods: b.decision.repayment_periods, total_repayment_paise: b.decision.total_repayment_paise, total_interest_paise: b.decision.total_interest_paise };
    } else if (action === "decline") {
      ov.effective = { verdict: "DECLINE", principal_paise: 0 };
    } else if (action === "reduce_terms") {
      const cap = b.decision.principal_paise || 0;
      const want = req.body?.proposed_terms?.principal_paise;
      if (!Number.isSafeInteger(want) || want > cap || want <= 0 || Object.keys(req.body?.proposed_terms || {}).some((key) => key !== "principal_paise")) {
        return sendError(res, 422, "OVERRIDE_EXCEEDS_CAPACITY", "Only a reduced principal within capacity is allowed");
      }
      let terms;
      try { terms = repaymentTerms(want, b.decision.repayment_periods, b.decision.rate_bps, b.decision.cadence); }
      catch { return sendError(res, 422, "ASSESSMENT_REFRESH_REQUIRED", "Reassess this application before recording positive terms"); }
      ov.proposed_terms = { principal_paise: want };
      ov.effective = { verdict: b.decision.verdict, tenure_months: b.decision.tenure_months, rate_bps: b.decision.rate_bps, cadence: b.decision.cadence, ...terms };
    } else {
      ov.effective = { verdict: "UNVERIFIED", principal_paise: 0 };
    }
    const payload = await db.transaction(async (session) => {
      await db.overrides.insertOne(ov, session ? { session } : undefined);
      const auditId = await audit(req.session.userId, "override", `applications/${b.appn._id}`, ov, true, {
        request_id: req.id,
        decision_id: b.decision._id,
        input_revision: b.decision.input_revision,
        reason: String(reason),
        action_detail: action,
        evidence_type: ov.evidence_type,
        model_auth_version: b.decision.versions?.model_auth || null,
        model_stress_version: b.decision.versions?.model_stress || null,
        source_references: b.decision.explanation?.source_references || [],
      }, session);
      ov.audit_reference = auditId;
      await db.overrides.updateOne({ _id: ov._id }, { $set: { audit_reference: auditId } }, session ? { session } : undefined);
      await db.applications.updateOne({ _id: b.appn._id }, { $set: { status: action === "request_evidence" ? "awaiting_evidence" : "reviewed", updatedAt: new Date().toISOString() } }, session ? { session } : undefined);
      const result = { data: ov };
      await saveIdem(req, idemp.key, `override:${req.params.id}`, bodyHash, 200, result, session);
      return result;
    });
    res.json(payload);
  });

  route("get", "/api/evidence/summary", requireSession, requireRole("lender"), async (_req, res) => {
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
      byArchetype: await (async () => {
        const rows = [];
        for (const application of applications) {
          const shop = await one(db.shops, { _id: application.shopId });
          const decision = application.latest_decision_id ? await one(db.decisions, { _id: application.latest_decision_id }) : null;
          const key = shop?.archetype || "unspecified";
          let row = rows.find((item) => item.archetype === key);
          if (!row) {
            row = { archetype: key, application_count: 0, assessed_count: 0, positive_offer_count: 0, declined_count: 0, unverified_count: 0 };
            rows.push(row);
          }
          row.application_count += 1;
          if (decision) {
            row.assessed_count += 1;
            if ((decision.principal_paise || 0) > 0) row.positive_offer_count += 1;
            if (decision.verdict === "DECLINE") row.declined_count += 1;
            if (decision.verdict === "UNVERIFIED") row.unverified_count += 1;
          }
        }
        return rows;
      })(),
      limitations: "Metrics unavailable until ml/reports is populated; zeros here are counts of demo decisions only. Archetype rows are operational demo counts, not a holdout evaluation.",
    });
  });

  route("get", "/api/applications/:id/audit", requireSession, requireRole("lender"), async (req, res) => {
    const rows = await list(db.audit_logs, {});
    const items = rows.filter((e) => String(e.entity || "").includes(req.params.id));
    res.json({ items, next_cursor: null });
  });

  route("get", "/api/applications/:id/report", requireSession, requireRole("lender"), async (req, res) => {
    const b = await loadApplicationBundle(req, req.params.id);
    if (b.err) return sendError(res, b.err[0], b.err[1], b.err[2]);
    if (!b.decision) return sendError(res, 404, "NOT_FOUND", "No assessment");
    const evidence = await evidenceFor(b.appn, b.shop);
    sendData(res, {
      application_id: b.appn._id,
      generated_at: new Date().toISOString(),
      decision_id: b.decision._id,
      decision_input_revision: b.decision.input_revision,
      current_input_revision: b.appn.input_revision,
      stale_evidence: b.decision.input_revision !== b.appn.input_revision || evidence.verification?.source === "aa_sandbox" && evidence.verification.status !== "ready",
      shop_name: b.shop.name,
      provenance: evidence.verification?.source || "synthetic",
      verification: evidence.verification ? { id: evidence.verification._id || null, status: evidence.verification.status, source: evidence.verification.source || "synthetic", source_hash: evidence.verification.source_hash || null, evidence_revision: evidence.verification.evidence_revision ?? null, account_count: evidence.verification.account_count ?? null, covered_from: evidence.verification.covered_from ?? null, covered_to: evidence.verification.covered_to ?? null } : null,
      requested_amount_paise: b.appn.requested_amount_paise,
      rails: evidence.rails.map((r) => ({ type: r.type, trustClass: r.trustClass, provenance: r.provenance })),
      verdict: b.decision.verdict,
      effective_action: b.latestAction,
      capacity: b.decision.capacity,
      versions: b.decision.versions,
      assessed_at: b.decision.assessed_at,
      explanation: b.decision.explanation,
      drivers: b.decision.drivers,
      conditions: b.decision.conditions,
      model_scores: b.decision.model_scores || null,
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

  route("post", "/api/evidence/fairness", requireSession, requireRole("lender"), async (req, res) => {
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
    if (!da || !dbn) return sendError(res, 422, "DECISIONS_REQUIRED", "Score both twins before comparing fairness");
    if (da.input_revision !== a.input_revision || dbn.input_revision !== bapp.input_revision) {
      return sendError(res, 409, "STALE_REVISION", "Reassess both twins after evidence changes");
    }
    const [shopA, shopB] = await Promise.all([one(db.shops, { _id: a.shopId }), one(db.shops, { _id: bapp.shopId })]);
    const inputKeys = ["business_type", "years_open", "city", "requested_amount_paise", "verified_rail_count", "history_weeks", "worst_4_week_net_paise", "max_payer_share"];
    const inputFor = (appn, decision, shop) => ({ business_type: shop?.business_type || shop?.category,
      years_open: shop?.yearsOpen, city: shop?.city, requested_amount_paise: appn.requested_amount_paise,
      verified_rail_count: decision.verified_rail_count,
      history_weeks: decision.features?.history_weeks ?? decision.capacity?.retention_basis?.history_weeks,
      worst_4_week_net_paise: decision.features?.worst_4_week_net_paise ?? decision.capacity?.worst_4_week_net_paise,
      max_payer_share: decision.features?.max_payer_share });
    const inputs = [inputFor(a, da, shopA), inputFor(bapp, dbn, shopB)];
    const inputMatch = inputKeys.every((key) => inputs[0][key] != null && inputs[0][key] === inputs[1][key]);
    const keys = ["verdict", "principal_paise", "rate_bps", "tenure_months", "cadence"];
    const differingTerms = keys.filter((key) => da[key] == null || dbn[key] == null || da[key] !== dbn[key]);
    const pass = inputMatch && differingTerms.length === 0;
    const auditId = await audit(req.session.userId, "fairness", "twins", { pass, inputMatch, differingTerms }, true, { request_id: req.id });
    sendData(res, {
      pass,
      sample_size: 2,
      provenance: "synthetic fixture",
      input_match: inputMatch,
      matched_inputs: Object.fromEntries(inputKeys.map((key) => [key, [inputs[0][key] ?? null, inputs[1][key] ?? null]])),
      twin_names: [shopA?.name || "Twin A", shopB?.name || "Twin B"],
      changed_attributes: ["owner gender", "area"],
      protected_attribute_values: { owner_gender: [shopA?.ownerFlags?.gender || null, shopB?.ownerFlags?.gender || null], area: [shopA?.ownerFlags?.area || null, shopB?.ownerFlags?.area || null] },
      differing_terms: differingTerms,
      deltas: Object.fromEntries(keys.map((k) => [k, [da[k], dbn[k]]])),
      audit_reference: auditId,
      policy_version: config.policyVersion,
    });
  });

  route("post", "/api/admin/seed", requireSession, requireRole("lender"), async (req, res) => {
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

  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    if (err.type === "entity.parse.failed") return sendError(res, 400, "INVALID_JSON", "Request body must be valid JSON", { request_id: req.id });
    if (err.type === "entity.too.large") return sendError(res, 413, "BODY_TOO_LARGE", "Request body is too large", { request_id: req.id });
    if (config.appEnv === "production") console.error(JSON.stringify({ type: "http_error", request_id: req.id, error: err.name || "Error" }));
    return sendError(res, 500, "INTERNAL_ERROR", "The request could not be completed", { request_id: req.id });
  });

  return app;
}

export async function seedDb(db) {
  await seedBank(db);
  for (const u of DEMO_USERS) {
    const byId = await one(db.users, { _id: u._id });
    const byEmail = await one(db.users, { email: u.email });
    if (!byId) await db.users.insertOne({ ...u, createdAt: new Date().toISOString() });
    if (byEmail && byEmail._id !== u._id) await db.users.updateOne({ _id: byEmail._id }, { $set: { email: `${u.email}.legacy` } });
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
