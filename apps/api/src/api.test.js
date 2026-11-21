import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createApp, seedDb } from "./createApp.js";
import { memoryDb } from "./store.js";

function jar() {
  const cookies = [];
  return {
    async json(app, method, path, body, headers = {}) {
      const res = await app.fetch
        ? null
        : await request(app, method, path, body, { ...headers, cookie: cookies.join("; ") });
      const set = res.headers["set-cookie"];
      if (set) cookies.push(...[].concat(set).map((c) => c.split(";")[0]));
      return res;
    },
  };
}

function request(app, method, path, body, headers = {}) {
  return new Promise((resolve) => {
    const chunks = [];
    const req = {
      method,
      url: path,
      headers: { host: "127.0.0.1", ...headers },
      body,
    };
    // use supertest-less: listen ephemeral
    const server = app.listen(0, async () => {
      const port = server.address().port;
      const r = await fetch(`http://127.0.0.1:${port}${path}`, {
        method,
        headers: {
          "content-type": "application/json",
          ...headers,
        },
        body: body != null ? JSON.stringify(body) : undefined,
        redirect: "manual",
      });
      const text = await r.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        json = text;
      }
      const h = {};
      r.headers.forEach((v, k) => {
        if (k === "set-cookie") h[k] = h[k] ? [].concat(h[k], v) : v;
        else h[k] = v;
      });
      server.close();
      resolve({ status: r.status, json, headers: h, raw: r });
    });
  });
}

let app;
let db;

before(async () => {
  db = memoryDb();
  await seedDb(db);
  app = createApp(db);
});

async function login(email, target = app) {
  const cookies = [];
  const send = async (method, path, body, extra = {}) => {
    const server = await listen(target);
    try {
      const r = await fetch(`http://127.0.0.1:${server.port}${path}`, {
        method,
        headers: {
          "content-type": "application/json",
          cookie: cookies.join("; "),
          ...extra,
        },
        body: body != null ? JSON.stringify(body) : undefined,
      });
      const sc = r.headers.getSetCookie?.() || [];
      for (const c of sc) cookies.push(c.split(";")[0]);
      return { status: r.status, json: await r.json(), cookies };
    } finally {
      await server.close();
    }
  };
  await send("POST", "/api/auth/login", { email });
  return send;
}

function listen(app) {
  return new Promise((resolve) => {
    const s = app.listen(0, () => {
      resolve({ port: s.address().port, close: () => new Promise((r) => s.close(r)) });
    });
  });
}

test("demo owner login uses fixture user id so seeded shops are visible", async () => {
  await db.users.insertOne({ _id: "other-owner", email: "owner@demo", role: "owner", createdAt: new Date().toISOString() });
  const send = await login("owner@demo");
  const me = await send("GET", "/api/me");
  assert.equal(me.json.data.user.id, "user-owner");
  const lender = await login("lender@demo");
  await lender("POST", "/api/admin/seed");
  const owner = await login("owner@demo");
  const listing = await owner("GET", "/api/applications");
  assert.ok((listing.json.items || []).some((item) => item.shopId === "clean-kirana"));
});

test("application listing validates keyset cursors", async () => {
  const lender = await login("lender@demo");
  const malformed = await lender("GET", "/api/applications?cursor=not-base64-json");
  assert.equal(malformed.status, 400);
  assert.equal(malformed.json.error.code, "INVALID_CURSOR");
  for (const cursor of [
    { createdAt: "yesterday", _id: "app-1" },
    { createdAt: "2026-11-21T12:00:00Z", _id: " " },
  ]) {
    const encoded = Buffer.from(JSON.stringify(cursor)).toString("base64url");
    const invalid = await lender("GET", `/api/applications?cursor=${encoded}`);
    assert.equal(invalid.status, 400);
    assert.equal(invalid.json.error.code, "INVALID_CURSOR");
  }
  const firstPage = await lender("GET", "/api/applications?limit=1");
  assert.equal(firstPage.status, 200);
  if (firstPage.json.next_cursor) {
    const nextPage = await lender("GET", `/api/applications?limit=1&cursor=${firstPage.json.next_cursor}`);
    assert.equal(nextPage.status, 200);
  }
});

test("login attempts are rate limited per client", async () => {
  const limitedApp = createApp(memoryDb());
  const clientIp = `198.51.100.${Math.floor(Math.random() * 200) + 1}`;
  let result;
  for (let attempt = 0; attempt < 61; attempt += 1) {
    result = await request(limitedApp, "POST", "/api/auth/login", { email: "unknown@demo" }, { "x-forwarded-for": clientIp });
  }
  assert.equal(result.status, 429);
  assert.equal(result.json.error.code, "RATE_LIMITED");
  assert.equal(result.headers["retry-after"], "60");
});

test("read requests are rate limited per client", async () => {
  const limitedApp = createApp(memoryDb());
  const clientIp = `198.51.100.${Math.floor(Math.random() * 200) + 1}`;
  let result;
  for (let attempt = 0; attempt < 301; attempt += 1) {
    result = await request(limitedApp, "GET", "/api/me", undefined, { "x-forwarded-for": clientIp });
  }
  assert.equal(result.status, 429);
  assert.equal(result.json.error.code, "RATE_LIMITED");
  assert.equal(result.headers["retry-after"], "60");
});

test("rejects cibilScore", async () => {
  const send = await login("owner@demo");
  const r = await send("POST", "/api/shops", { name: "X", cibilScore: 700 });
  assert.equal(r.status, 400);
  assert.equal(r.json.error.code, "CIBIL_NOT_ALLOWED");
});

test("shop creation retry returns the same shop", async () => {
  const owner = await login("owner@demo");
  const body = { name: "Retry Kirana", business_type: "Kirana" };
  const headers = { "Idempotency-Key": "shop-retry-demo" };
  const first = await owner("POST", "/api/shops", body, headers);
  const second = await owner("POST", "/api/shops", body, headers);
  assert.equal(first.status, 201);
  assert.equal(second.status, 201);
  assert.equal(first.json.data._id, second.json.data._id);
  const changed = await owner("POST", "/api/shops", { ...body, name: "Different" }, headers);
  assert.equal(changed.status, 409);
});

test("owner cannot promote pdf to verified", async () => {
  const send = await login("owner@demo");
  const r = await send("POST", "/api/shops/pdf-only/rails", {
    type: "pdf",
    trustClass: "verified_simulated",
  });
  assert.equal(r.status, 422);
});

test("login isolation 404", async () => {
  const send = await login("owner@demo");
  // lender-only evidence
  const r = await send("GET", "/api/evidence/summary");
  assert.equal(r.status, 403);
});

test("lender rail coverage comes from dated UPI records, not upload time", async () => {
  const send = await login("lender@demo");
  await send("POST", "/api/admin/seed");
  const listing = await send("GET", "/api/applications");
  const clean = listing.json.items.find((item) => item.shopId === "clean-kirana");
  const pdfOnly = listing.json.items.find((item) => item.shopId === "pdf-only");
  const cleanDetail = await send("GET", `/api/applications/${clean._id}`);
  const pdfDetail = await send("GET", `/api/applications/${pdfOnly._id}`);
  const upi = cleanDetail.json.data.rails.find((rail) => rail.type === "upi");
  const gst = cleanDetail.json.data.rails.find((rail) => rail.type === "gst");
  assert.equal(upi.coverage_from, "2026-01-05");
  assert.equal(upi.coverage_to, "2026-03-23");
  assert.equal(upi.coverage_basis, "dated_transactions");
  assert.equal(gst.coverage_from, "2026-01-05");
  assert.equal(gst.coverage_to, "2026-03-23");
  assert.equal(gst.coverage_basis, "fixture_declared_period");
  assert.equal(cleanDetail.json.data.reconciliation.available, true);
  assert.equal(cleanDetail.json.data.reconciliation.period_from, upi.coverage_from);
  assert.equal(cleanDetail.json.data.reconciliation.period_to, upi.coverage_to);
  const aa = cleanDetail.json.data.rails.find((rail) => rail.type === "aa");
  assert.equal(aa.coverage_to, null);
  assert.equal(aa.coverage_basis, "unknown");
  assert.equal(pdfDetail.json.data.rails[0].coverage_to, null);
  assert.equal(pdfDetail.json.data.rails[0].coverage_basis, "unknown");
  assert.equal(pdfOnly.verified_rail_count, 0);
  assert.equal(pdfOnly.pdf_only, true);
  assert.deepEqual(pdfOnly.rail_types, ["pdf"]);
  assert.equal(pdfOnly.evidence_last_observed_at, null);
  assert.equal(clean.evidence_last_observed_at, "2026-03-23");
  assert.equal(typeof clean.observation_age_days, "number");
  assert.equal(pdfOnly.observation_age_days, null);
  const gstGap = listing.json.items.find((item) => item.shopId === "gst-gap");
  const gstGapDetail = await send("GET", `/api/applications/${gstGap._id}`);
  const gstGapUpi = gstGapDetail.json.data.rails.find((rail) => rail.type === "upi");
  const gstGapGst = gstGapDetail.json.data.rails.find((rail) => rail.type === "gst");
  assert.equal(gstGapUpi.coverage_from, "2026-01-05");
  assert.equal(gstGapUpi.coverage_to, "2026-03-23");
  assert.equal(gstGapUpi.coverage_basis, "dated_transactions");
  assert.equal(gstGapGst.coverage_basis, "fixture_declared_period");
  assert.equal(gstGap.evidence_last_observed_at, "2026-03-23");
  const gstRail = await db.rails.findOne({ shopId: "clean-kirana", type: "gst" });
  const originalPeriodTo = gstRail.payload.period_to;
  try {
    gstRail.payload.period_to = "2026-03-16";
    const misaligned = await send("GET", `/api/applications/${clean._id}`);
    assert.equal(misaligned.json.data.reconciliation.available, false);
    assert.equal(misaligned.json.data.reconciliation.relative_gap, null);
  } finally {
    gstRail.payload.period_to = originalPeriodTo;
  }
});

test("override rejects changed application evidence and report identifies stale snapshot", async () => {
  const send = await login("lender@demo");
  const listing = await send("GET", "/api/applications");
  const application = listing.json.items.find((item) => item.shopId === "clean-kirana");
  const decision = { _id: "revision-check-decision", input_revision: application.input_revision,
    verdict: "STANDARD", principal_paise: 100000, capacity: { max_principal_paise: 100000 },
    versions: { policy: "v1" }, assessed_at: new Date().toISOString() };
  await db.decisions.insertOne(decision);
  const evidenceUpdatedAt = new Date().toISOString();
  await db.applications.updateOne({ _id: application._id }, { $set: {
    latest_decision_id: decision._id, input_revision: application.input_revision + 1,
    updatedAt: evidenceUpdatedAt,
  } });
  const refreshedQueue = await send("GET", "/api/applications");
  const staleRow = refreshedQueue.json.items.find((item) => item._id === application._id);
  assert.equal(staleRow.assessment_stale, true);
  assert.equal(staleRow.effective_verdict, null);
  assert.equal(staleRow.review_reason, "Reassess after evidence update");
  assert.equal(staleRow.updated_at, evidenceUpdatedAt);
  const rejected = await send("POST", `/api/applications/${application._id}/override`,
    { decision_id: decision._id, action: "decline", reason: "Evidence changed after score" },
    { "Idempotency-Key": "revision-check-key" });
  assert.equal(rejected.status, 409);
  assert.equal(rejected.json.error.code, "STALE_REVISION");
  const report = await send("GET", `/api/applications/${application._id}/report`);
  assert.equal(report.status, 200);
  assert.equal(report.json.data.stale_evidence, true);
  assert.equal(report.json.data.decision_id, decision._id);
  assert.equal(report.json.data.current_input_revision, application.input_revision + 1);
});

test("lender cannot record reduced terms from an incomplete legacy assessment", async () => {
  const owner = await login("owner@demo");
  const lender = await login("lender@demo");
  const created = await owner("POST", "/api/applications",
    { shop_id: "clean-kirana", requested_amount_paise: 5000000 },
    { "Idempotency-Key": "legacy-terms-application" });
  const application = created.json.data;
  const decision = { _id: "legacy-terms-decision", applicationId: application._id,
    input_revision: application.input_revision, verdict: "STANDARD", principal_paise: 1000000,
    capacity: { max_principal_paise: 1000000 } };
  await db.decisions.insertOne(decision);
  await db.applications.updateOne({ _id: application._id }, { $set: { latest_decision_id: decision._id } });
  const response = await lender("POST", `/api/applications/${application._id}/override`,
    { decision_id: decision._id, action: "reduce_terms", proposed_terms: { principal_paise: 500000 },
      reason: "Reduce incomplete legacy terms" }, { "Idempotency-Key": "legacy-terms-reduce" });
  assert.equal(response.status, 422);
  assert.equal(response.json.error.code, "ASSESSMENT_REFRESH_REQUIRED");
});

test("reduced lender action carries its own repayment schedule", async () => {
  const owner = await login("owner@demo");
  const lender = await login("lender@demo");
  const created = await owner("POST", "/api/applications", { shop_id: "clean-kirana", requested_amount_paise: 5_000_000 }, { "Idempotency-Key": "reduced-schedule-app" });
  const application = created.json.data;
  const decision = { _id: "reduced-schedule-decision", applicationId: application._id, input_revision: application.input_revision,
    verdict: "STANDARD", principal_paise: 2_000_000, capacity: { max_principal_paise: 2_000_000 },
    tenure_months: 12, rate_bps: 1800, cadence: "weekly", repayment_periods: 52,
    repayment_amount_paise: 41_975, total_repayment_paise: 2_182_700, total_interest_paise: 182_700 };
  await db.decisions.insertOne(decision);
  await db.applications.updateOne({ _id: application._id }, { $set: { latest_decision_id: decision._id } });
  const response = await lender("POST", `/api/applications/${application._id}/override`,
    { decision_id: decision._id, action: "reduce_terms", proposed_terms: { principal_paise: 1_000_000 }, reason: "Conservative first ticket" },
    { "Idempotency-Key": "reduced-schedule-action" });
  assert.equal(response.status, 200);
  const effective = response.json.data.effective;
  assert.equal(effective.principal_paise, 1_000_000);
  assert.ok(effective.repayment_amount_paise < decision.repayment_amount_paise);
  assert.equal(effective.total_repayment_paise, effective.repayment_amount_paise * 52);
  const report = await lender("GET", `/api/applications/${application._id}/report`);
  assert.equal(report.json.data.terms.principal_paise, decision.principal_paise);
  assert.deepEqual(report.json.data.effective_action.effective, effective);
});

test("owner can answer a lender evidence request on the same application", async () => {
  const owner = await login("owner@demo");
  const lender = await login("lender@demo");
  const created = await owner("POST", "/api/applications",
    { shop_id: "clean-kirana", requested_amount_paise: 5000000 },
    { "Idempotency-Key": "evidence-response-application" });
  assert.equal(created.status, 201);
  const application = created.json.data;
  const decision = { _id: "evidence-response-decision", applicationId: application._id,
    input_revision: application.input_revision, verdict: "THIN_FILE", principal_paise: 1000000 };
  await db.decisions.insertOne(decision);
  await db.applications.updateOne({ _id: application._id }, { $set: { latest_decision_id: decision._id } });
  const request = await lender("POST", `/api/applications/${application._id}/override`,
    { decision_id: decision._id, action: "request_evidence", evidence_type: "upi",
      reason: "Add reviewed merchant activity" }, { "Idempotency-Key": "evidence-response-request" });
  assert.equal(request.status, 200);
  const ownerView = await owner("GET", `/api/applications/${application._id}`);
  assert.equal(ownerView.json.data.latest_action.evidence_type, "upi");
  const response = await owner("POST", `/api/applications/${application._id}/verification-requests`,
    { public_ref: "DEMO-ACCT-001" }, { "Idempotency-Key": "evidence-response-bank" });
  assert.equal(response.status, 201);
  assert.equal(response.json.data.application_id, application._id);
  const refreshed = await owner("GET", `/api/applications/${application._id}`);
  assert.equal(refreshed.json.data.verification.status, "pending");
  assert.equal(refreshed.json.data.application.input_revision, application.input_revision + 1);
});

test("owner can answer a GST evidence request with a listed fixture", async () => {
  const owner = await login("owner@demo");
  const lender = await login("lender@demo");
  const testKey = `gst-response-${crypto.randomUUID()}`;
  const created = await owner("POST", "/api/applications",
    { shop_id: "pdf-only", requested_amount_paise: 5000000 },
    { "Idempotency-Key": `${testKey}-application` });
  const application = created.json.data;
  const decision = { _id: "gst-response-decision", applicationId: application._id,
    input_revision: application.input_revision, verdict: "UNVERIFIED", principal_paise: 0 };
  await db.decisions.insertOne(decision);
  await db.applications.updateOne({ _id: application._id }, { $set: { latest_decision_id: decision._id } });
  const request = await lender("POST", `/api/applications/${application._id}/override`,
    { decision_id: decision._id, action: "request_evidence", evidence_type: "gst",
      reason: "Attach a GST summary for review" }, { "Idempotency-Key": `${testKey}-request` });
  assert.equal(request.status, 200);
  const listed = await owner("GET", "/api/evidence/demo-fixtures?type=gst");
  assert.equal(listed.status, 200);
  assert.ok(listed.json.data.some((item) => item.public_ref === "DEMO-GST-001"));
  const wrong = await owner("POST", `/api/applications/${application._id}/evidence-responses`,
    { public_ref: "DEMO-AA-001" }, { "Idempotency-Key": `${testKey}-wrong` });
  assert.equal(wrong.status, 422);
  const upiBlocked = await owner("POST", `/api/applications/${application._id}/evidence-responses`,
    { public_ref: "DEMO-GST-001", trustClass: "verified_simulated" }, { "Idempotency-Key": `${testKey}-trust` });
  assert.equal(upiBlocked.status, 422);
  const response = await owner("POST", `/api/applications/${application._id}/evidence-responses`,
    { public_ref: "DEMO-GST-001" }, { "Idempotency-Key": `${testKey}-ok` });
  assert.equal(response.status, 201);
  assert.equal(response.json.data.rail_type, "gst");
  const duplicate = await owner("POST", `/api/applications/${application._id}/evidence-responses`,
    { public_ref: "DEMO-GST-001" }, { "Idempotency-Key": `${testKey}-ok` });
  assert.equal(duplicate.status, 201);
  assert.equal(duplicate.json.data.fixture_id, "DEMO-GST-001");
  const lateDuplicate = await owner("POST", `/api/applications/${application._id}/evidence-responses`,
    { public_ref: "DEMO-GST-001" }, { "Idempotency-Key": `${testKey}-late` });
  assert.equal(lateDuplicate.status, 422);
  assert.equal(lateDuplicate.json.error.code, "NO_EVIDENCE_REQUEST");
  const refreshed = await owner("GET", `/api/applications/${application._id}`);
  assert.equal(refreshed.json.data.application.status, "submitted");
  assert.equal(refreshed.json.data.application.input_revision, application.input_revision + 1);
  assert.ok(refreshed.json.data.rails.some((rail) => rail.type === "gst" && rail.trustClass === "verified_simulated"));
  const lenderView = await lender("GET", `/api/applications/${application._id}`);
  assert.ok(lenderView.json.data.rails.some((rail) => rail.type === "gst"));
  const secondDecision = { _id: "gst-response-decision-2", applicationId: application._id,
    input_revision: refreshed.json.data.application.input_revision, verdict: "UNVERIFIED", principal_paise: 0 };
  await db.decisions.insertOne(secondDecision);
  await db.applications.updateOne({ _id: application._id }, { $set: { latest_decision_id: secondDecision._id } });
  const secondRequest = await lender("POST", `/api/applications/${application._id}/override`,
    { decision_id: secondDecision._id, action: "request_evidence", evidence_type: "gst",
      reason: "Please provide a current GST summary" }, { "Idempotency-Key": `${testKey}-request-2` });
  assert.equal(secondRequest.status, 200);
  const reloaded = await owner("GET", `/api/applications/${application._id}`);
  assert.equal(reloaded.json.data.application.status, "awaiting_evidence");
  assert.equal(reloaded.json.data.latest_action.action, "request_evidence");
});

test("upi evidence requests stay on the bank review path", async () => {
  const owner = await login("owner@demo");
  const lender = await login("lender@demo");
  const created = await owner("POST", "/api/applications",
    { shop_id: "pdf-only", requested_amount_paise: 4000000 },
    { "Idempotency-Key": "upi-path-application" });
  const application = created.json.data;
  const decision = { _id: "upi-path-decision", applicationId: application._id,
    input_revision: application.input_revision, verdict: "UNVERIFIED", principal_paise: 0 };
  await db.decisions.insertOne(decision);
  await db.applications.updateOne({ _id: application._id }, { $set: { latest_decision_id: decision._id } });
  await lender("POST", `/api/applications/${application._id}/override`,
    { decision_id: decision._id, action: "request_evidence", evidence_type: "upi",
      reason: "Need merchant activity review" }, { "Idempotency-Key": "upi-path-request" });
  const blocked = await owner("POST", `/api/applications/${application._id}/evidence-responses`,
    { public_ref: "DEMO-GST-001" }, { "Idempotency-Key": "upi-path-blocked" });
  assert.equal(blocked.status, 422);
  assert.equal(blocked.json.error.code, "USE_BANK_REVIEW");
});

test("fairness fixture requires decisions and names differing terms", async () => {
  const send = await login("lender@demo");
  await send("POST", "/api/admin/seed");
  const missing = await send("POST", "/api/evidence/fairness", { fixture_pair_id: "lakshmi-twins" });
  assert.equal(missing.status, 422);
  assert.equal(missing.json.error.code, "DECISIONS_REQUIRED");
  const listing = await send("GET", "/api/applications");
  const twins = ["twin-a", "twin-b"].map((shopId) => listing.json.items.find((item) => item.shopId === shopId));
  for (const [index, application] of twins.entries()) {
    const decision = { _id: `fairness-check-${index}`, input_revision: application.input_revision,
      verdict: "STANDARD", principal_paise: index ? 900000 : 1000000,
      rate_bps: 1200, tenure_months: 6, cadence: "weekly", verified_rail_count: 3,
      features: { history_weeks: 12, worst_4_week_net_paise: 4000000, max_payer_share: 0.2 } };
    await db.decisions.insertOne(decision);
    await db.applications.updateOne({ _id: application._id }, { $set: { latest_decision_id: decision._id } });
  }
  const comparison = await send("POST", "/api/evidence/fairness", { fixture_pair_id: "lakshmi-twins" });
  assert.equal(comparison.status, 200);
  assert.equal(comparison.json.data.pass, false);
  assert.equal(comparison.json.data.input_match, true);
  assert.deepEqual(comparison.json.data.differing_terms, ["principal_paise"]);
  assert.equal(comparison.json.data.sample_size, 2);
  await db.decisions.updateOne({ _id: "fairness-check-1" }, { $set: {
    principal_paise: 1000000,
    features: { history_weeks: 3, worst_4_week_net_paise: 4000000, max_payer_share: 0.2 },
  } });
  const unmatched = await send("POST", "/api/evidence/fairness", { fixture_pair_id: "lakshmi-twins" });
  assert.equal(unmatched.json.data.pass, false);
  assert.equal(unmatched.json.data.input_match, false);
  assert.deepEqual(unmatched.json.data.differing_terms, []);
});

test("bank admin confirms only matching synthetic bank records", async () => {
  const owner = await login("owner@demo");
  const shop = await owner("POST", "/api/shops", { name: "Lakshmi Stores", business_type: "Kirana", identity: { city: "Bengaluru" } });
  assert.equal(shop.status, 201);
  const appn = await owner("POST", "/api/applications", { shop_id: shop.json.data._id, requested_amount_paise: 1000000 }, { "Idempotency-Key": "bank-app-1" });
  const pending = await owner("POST", `/api/applications/${appn.json.data._id}/verification-requests`, { public_ref: "DEMO-ACCT-001" }, { "Idempotency-Key": "bank-request-1" });
  assert.equal(pending.status, 201);
  assert.equal(pending.json.data.status, "pending");
  const ownerCannotSeeBank = await owner("GET", `/api/bank/verification-requests/${pending.json.data.id}`);
  assert.equal(ownerCannotSeeBank.status, 403);
  const bank = await login("bank@demo");
  const review = await bank("GET", `/api/bank/verification-requests/${pending.json.data.id}`);
  assert.equal(review.status, 200);
  assert.equal(review.json.data.recommendation, "verified_simulated");
  const confirmed = await bank("POST", `/api/bank/verification-requests/${pending.json.data.id}/decision`, { action: "confirm" }, { "Idempotency-Key": "bank-review-1" });
  assert.equal(confirmed.status, 200);
  assert.equal(confirmed.json.data.status, "verified_simulated");
  assert.equal(confirmed.json.data.result.statement.filename, "DEMO-ACCT-001-statement.pdf");
  assert.equal(confirmed.json.data.result.statement.issuer, "bank_api");
  assert.ok(confirmed.json.data.result.statement.row_count > 0);
  assert.equal(confirmed.json.data.result.statement.pdf_base64, undefined);
  const lender = await login("lender@demo");
  const lenderView = await lender("GET", `/api/applications/${appn.json.data._id}`);
  assert.equal(lenderView.json.data.verification.result.statement.pdf_base64, undefined);
  assert.equal(lenderView.json.data.verification.result.statement.row_count, confirmed.json.data.result.statement.row_count);
  const ownerCashflow = await owner("GET", `/api/applications/${appn.json.data._id}`);
  assert.ok(ownerCashflow.json.data.cashflows.length > 0);
  assert.ok(ownerCashflow.json.data.cashflows.every((row) => "t" in row && "inflow_paise" in row && "outflow_paise" in row));
  assert.ok(ownerCashflow.json.data.cashflows.every((row) => Object.keys(row).sort().join(",") === "inflow_paise,outflow_paise,t"));

  const mismatchShop = await owner("POST", "/api/shops", { name: "Lakshmi Stores", business_type: "Kirana", identity: {} });
  const mismatchApp = await owner("POST", "/api/applications", { shop_id: mismatchShop.json.data._id, requested_amount_paise: 1000000 }, { "Idempotency-Key": "bank-app-2" });
  const mismatchReq = await owner("POST", `/api/applications/${mismatchApp.json.data._id}/verification-requests`, { public_ref: "DEMO-ACCT-002" }, { "Idempotency-Key": "bank-request-2" });
  const mismatchConfirm = await bank("POST", `/api/bank/verification-requests/${mismatchReq.json.data.id}/decision`, { action: "confirm" }, { "Idempotency-Key": "bank-review-2" });
  assert.equal(mismatchConfirm.status, 422);
  const released = await bank("POST", `/api/bank/verification-requests/${mismatchReq.json.data.id}/decision`, { action: "release" }, { "Idempotency-Key": "bank-review-3" });
  assert.equal(released.status, 200);
  assert.equal(released.json.data.status, "mismatch");
  const queue = await lender("GET", "/api/applications");
  const releasedRow = queue.json.items.find((item) => item._id === mismatchApp.json.data._id);
  assert.equal(releasedRow.latest_verdict, "UNVERIFIED");
  assert.equal(releasedRow.not_run_reason, "identity_mismatch");
  assert.equal(releasedRow.p_auth, null);
  assert.equal(releasedRow.p_stress, null);
  assert.match(releasedRow.score_basis, /differs from bank record/);
  const retry = await owner("POST", `/api/applications/${mismatchApp.json.data._id}/verification-requests`, { public_ref: "DEMO-ACCT-001" }, { "Idempotency-Key": "bank-request-retry" });
  assert.equal(retry.status, 201);
  const retried = await owner("GET", `/api/applications/${mismatchApp.json.data._id}`);
  assert.equal(retried.json.data.verification.status, "pending");
  assert.equal(retried.json.data.application.input_revision, releasedRow.input_revision + 1);
});

test("AA sandbox consent publishes only eligible data and revocation invalidates it", async () => {
  const store = memoryDb();
  await seedDb(store);
  let consentStatus = "PENDING";
  let slowSession = false;
  let sessionCreated = false;
  const calls = [];
  const firstTxnDate = new Date("2021-01-03T00:00:00.000Z");
  const fi = { status: "COMPLETED", fips: [{ fipID: "mock-fip", accounts: [{ linkRefNumber: "linked", maskedAccNumber: "XXXX42", data: { account: { type: "deposit", profile: { holders: { holder: { name: "Lakshmi Stores" } } }, summary: { status: "ACTIVE", currency: "INR" }, transactions: { transaction: Array.from({ length: 8 }, (_, i) => ({ txnId: `tx-${i}`, valueDate: new Date(firstTxnDate.getTime() + i * 7 * 86400000).toISOString(), type: "CREDIT", amount: "100.00" })) } } } }] }] };
  const fakeSetu = async (path, options) => {
    calls.push([path, options]);
    if (path === "/consents" && options?.method === "POST") return { id: "consent-1", url: "https://fiu-sandbox.setu.co/v2/consents/webview/consent-1" };
    if (path === "/consents/consent-1") return { status: consentStatus, detail: consentStatus === "ACTIVE" ? { consentExpiry: "2026-12-01T00:00:00Z", dataLife: { unit: "DAY", value: 30 } } : {} };
    if (path === "/sessions") { if (slowSession) await new Promise((resolve) => setTimeout(resolve, 20)); sessionCreated = true; return { id: "session-1", status: "PENDING" }; }
    if (path.startsWith("/sessions/session-")) { assert.equal(sessionCreated, true); return fi; }
    if (path === "/consents/consent-1/revoke") return { status: "REVOKED" };
    throw new Error("Unexpected Setu call");
  };
  const target = createApp(store, { setu: fakeSetu });
  const owner = await login("owner@demo", target);
  const shop = await owner("POST", "/api/shops", { name: "Lakshmi Stores", business_type: "Kirana", identity: {} });
  const application = await owner("POST", "/api/applications", { shop_id: shop.json.data._id, requested_amount_paise: 1000000 }, { "Idempotency-Key": "aa-app" });
  const path = `/api/applications/${application.json.data._id}`;
  const consent = await owner("POST", `${path}/aa/consents`, { mobile: "9999999999" }, { "Idempotency-Key": "aa-consent" });
  assert.equal(consent.status, 201);
  const range = calls.find(([endpoint]) => endpoint === "/consents")[1].body.dataRange;
  assert.equal(range.from, "2021-01-01T00:00:00.000Z");
  assert.equal(range.to, "2021-06-30T23:59:59.000Z");
  assert.ok(Date.parse(range.to) - Date.parse(range.from) > 180 * 86400000);
  const retentionConnection = await store.aa_connections.findOne({ consent_id: "consent-1" });
  assert.equal(retentionConnection.data_life_expires_at, undefined);
  await store.users.insertOne({ _id: "other-aa-owner", email: "other-aa-owner@demo", role: "owner" });
  const otherOwner = await login("other-aa-owner@demo", target);
  assert.equal((await otherOwner("GET", `${path}/aa/connection`)).status, 404);
  assert.equal((await otherOwner("POST", `${path}/aa/refresh`, {})).status, 404);
  const lender = await login("lender@demo", target);
  assert.equal((await lender("POST", `${path}/aa/consents`, { mobile: "9999999999" }, { "Idempotency-Key": "lender-aa" })).status, 403);
  assert.equal((await owner("POST", `${path}/aa/consents`, { mobile: "9999999999" }, { "Idempotency-Key": "aa-consent" })).json.data.connection_id, consent.json.data.connection_id);
  assert.equal((await owner("POST", `${path}/aa/consents`, { mobile: "8888888888" }, { "Idempotency-Key": "other-mobile" })).status, 409);
  const forged = await owner("POST", "/api/aa/setu/webhook", { type: "CONSENT_STATUS_UPDATE", consentId: "consent-1", data: { status: "ACTIVE" } });
  assert.equal(forged.status, 503);
  const { config } = await import("./config.js");
  config.setuWebhookToken = "callback-test-secret";
  try {
    const callback = await owner("POST", "/api/aa/setu/webhook", { type: "CONSENT_STATUS_UPDATE", consentId: "consent-1", data: { status: "ACTIVE" } }, { authorization: "Bearer callback-test-secret" });
    assert.equal(callback.status, 202);
    assert.equal((await store.aa_connections.findOne({ consent_id: "consent-1" })).status, "pending_consent");
  } finally { config.setuWebhookToken = ""; }
  assert.equal(calls.find(([p]) => p === "/consents")[1].body.redirectUrl, config.corsOrigin.startsWith("https://") ? new URL("/owner/aa/return", config.corsOrigin).href : undefined);
  assert.equal((await owner("POST", `${path}/verification-requests`, { public_ref: "DEMO-ACCT-001" }, { "Idempotency-Key": "no-mix" })).status, 409);
  assert.equal((await owner("POST", `${path}/aa/refresh`, {})).json.data.status, "pending_consent");
  assert.equal((await owner("GET", path)).json.data.provenance, "aa_sandbox");
  assert.equal((await owner("GET", path)).json.data.verification.status, "pending_consent");
  consentStatus = "APPROVED";
  fi.status = "FAILED";
  const confirmedAt = Date.now();
  assert.equal((await owner("POST", `${path}/aa/refresh`, {})).json.data.status, "fetching");
  assert.equal(calls.filter(([p]) => p === "/sessions/session-1").length, 0);
  fi.status = "PENDING";
  slowSession = true;
  const failedRefreshes = await Promise.all([owner("POST", `${path}/aa/refresh`, {}), owner("POST", `${path}/aa/refresh`, {})]);
  slowSession = false;
  assert.deepEqual(failedRefreshes.map((result) => result.json.data.status).sort(), ["fetching", "fetching"]);
  const fallbackExpiry = Date.parse((await store.aa_connections.findOne({ consent_id: "consent-1" })).data_life_expires_at);
  assert.ok(fallbackExpiry >= Date.parse("2026-11-21T00:00:00Z") + 30 * 86400000);
  assert.equal(calls.filter(([p]) => p === "/sessions").length, 1);
  fi.status = "FAILED";
  assert.equal((await owner("POST", `${path}/aa/refresh`, {})).json.data.status, "failed");
  fi.status = "PENDING";
  assert.equal((await owner("POST", `${path}/aa/refresh`, {})).json.data.status, "fetching");
  assert.equal(calls.filter(([p]) => p === "/sessions").length, 2);
  assert.equal((await owner("GET", path)).json.data.cashflows.length, 0);
  fi.status = "PARTIAL";
  config.setuWebhookToken = "callback-test-secret";
  try {
    const callback = await owner("POST", "/api/aa/setu/webhook", { type: "CONSENT_STATUS_UPDATE", consentId: "consent-1" }, { authorization: "Bearer callback-test-secret" });
    assert.equal(callback.status, 202);
    assert.equal((await store.aa_connections.findOne({ consent_id: "consent-1" })).status, "ready");
    assert.equal((await store.aa_connections.findOne({ consent_id: "consent-1" })).reason, null);
    const revision = (await store.applications.findOne({ _id: application.json.data._id })).input_revision;
    assert.equal((await owner("POST", "/api/aa/setu/webhook", { type: "CONSENT_STATUS_UPDATE", consentId: "consent-1" }, { authorization: "Bearer callback-test-secret" })).status, 202);
    assert.equal((await store.applications.findOne({ _id: application.json.data._id })).input_revision, revision);
  } finally { config.setuWebhookToken = ""; }
  assert.equal((await owner("GET", path)).json.data.cashflows.length, 8);
  fi.status = "COMPLETED";
  config.setuWebhookToken = "callback-test-secret";
  try {
  const completedCallback = await owner("POST", "/api/aa/setu/webhook", { type: "CONSENT_STATUS_UPDATE", consentId: "consent-1" }, { authorization: "Bearer callback-test-secret" });
  assert.equal(completedCallback.status, 202);
  fi.fips[0].accounts[0].data.account.transactions.transaction[0].amount = "125.00";
  } finally { config.setuWebhookToken = ""; }
  assert.equal((await store.aa_connections.findOne({ consent_id: "consent-1" })).status, "ready");
  assert.equal((await owner("POST", `${path}/aa/refresh`, {})).json.data.status, "ready");
  assert.equal((await owner("GET", path)).json.data.cashflows.reduce((sum, row) => sum + row.inflow_paise, 0), 80000);
  assert.equal((await owner("GET", path)).json.data.verification.status, "ready");
  assert.equal((await owner("GET", path)).json.data.verification.source, "aa_sandbox");
  assert.equal((await owner("GET", path)).json.data.provenance, "aa_sandbox");
  const summary = (await owner("GET", path)).json.data.verification;
  assert.equal(summary.account_count, 1);
  assert.equal(summary.covered_from, firstTxnDate.toISOString().slice(0, 10));
  assert.equal(summary.covered_to, new Date(firstTxnDate.getTime() + 49 * 86400000).toISOString().slice(0, 10));
  assert.equal(summary.evidence_revision, (await store.applications.findOne({ _id: application.json.data._id })).evidence_revision);
  assert.equal((await owner("GET", `${path}/aa/connection`)).json.data.transaction_count, 8);
  assert.equal((await store.aa_accounts.findOne({ consent_id: "consent-1" })).holder_name, undefined);
  assert.equal((await store.aa_transactions.findOne({ consent_id: "consent-1" })).inflow_paise, undefined);
  assert.equal(calls.filter(([p]) => p === "/sessions").length, 2);
  const revisionBeforePause = (await owner("GET", path)).json.data.application.input_revision;
  assert.equal((await store.aa_connections.findOne({ consent_id: "consent-1" })).status, "ready");
  consentStatus = "PAUSED";
  config.setuWebhookToken = "callback-test-secret";
  try {
    const pausedCallback = await owner("POST", "/api/aa/setu/webhook", { type: "CONSENT_STATUS_UPDATE", consentId: "consent-1", data: { status: "ACTIVE" } }, { authorization: "Bearer callback-test-secret" });
    assert.equal(pausedCallback.status, 202);
  } finally { config.setuWebhookToken = ""; }
  const paused = (await owner("GET", path)).json.data;
  assert.equal(paused.verification.status, "paused");
  assert.equal(paused.cashflows.length, 0);
  assert.equal(paused.application.input_revision, revisionBeforePause + 1);
  consentStatus = "ACTIVE";
  assert.equal((await owner("POST", `${path}/aa/refresh`, {})).json.data.status, "ready");
  const currentRevision = (await owner("GET", path)).json.data.application.input_revision;
  await store.decisions.insertOne({ _id: "aa-saved-decision", input_revision: currentRevision, verdict: "THIN_FILE", principal_paise: 100000 });
  await store.applications.updateOne({ _id: application.json.data._id }, { $set: { latest_decision_id: "aa-saved-decision" } });
  const report = await lender("GET", `${path}/report`);
  assert.equal(report.json.data.verification.account_count, 1);
  assert.equal(report.json.data.verification.covered_to, new Date(firstTxnDate.getTime() + 49 * 86400000).toISOString().slice(0, 10));
  await store.aa_connections.updateOne({ consent_id: "consent-1" }, { $set: { consent_expires_at: "2021-07-01T00:00:00Z" } });
  const expiredConnection = await owner("GET", `${path}/aa/connection`);
  assert.equal(expiredConnection.json.data.status, "expired");
  assert.equal(expiredConnection.json.data.transaction_count, 0);
  assert.equal((await owner("GET", path)).json.data.verification.status, "expired");
  assert.equal((await owner("GET", path)).json.data.cashflows.length, 0);
  assert.equal((await owner("GET", path)).json.data.assessment_stale, true);
  assert.equal((await store.aa_transactions.find({ consent_id: "consent-1" })).length, 0);
  assert.equal((await store.aa_accounts.find({ consent_id: "consent-1" })).length, 0);
  await store.aa_connections.updateOne({ consent_id: "consent-1" }, { $set: { status: "ready", consent_expires_at: "2026-12-01T00:00:00Z", data_life_expires_at: "2021-07-01T00:00:00Z" } });
  const retentionExpiry = await owner("GET", `${path}/aa/connection`);
  assert.equal(retentionExpiry.json.data.status, "data_expired");
  assert.equal(retentionExpiry.json.data.transaction_count, 0);
  assert.deepEqual(retentionExpiry.json.data.accounts, []);
  assert.equal((await owner("GET", path)).json.data.verification.status, "data_expired");
  const prior = (await owner("GET", path)).json.data.application.input_revision;
  await owner("POST", `${path}/aa/revoke`, {});
  const revoked = (await owner("GET", path)).json.data;
  assert.equal(revoked.verification.status, "revoked");
  assert.equal(revoked.cashflows.length, 0);
  assert.equal(revoked.application.input_revision, prior + 1);
});
