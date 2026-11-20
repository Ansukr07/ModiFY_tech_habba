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

async function login(email) {
  const cookies = [];
  const send = async (method, path, body, extra = {}) => {
    const server = await listen(app);
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

test("rejects cibilScore", async () => {
  const send = await login("owner@demo");
  const r = await send("POST", "/api/shops", { name: "X", cibilScore: 700 });
  assert.equal(r.status, 400);
  assert.equal(r.json.error.code, "CIBIL_NOT_ALLOWED");
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
  const created = await owner("POST", "/api/applications",
    { shop_id: "pdf-only", requested_amount_paise: 5000000 },
    { "Idempotency-Key": "gst-response-application" });
  const application = created.json.data;
  const decision = { _id: "gst-response-decision", applicationId: application._id,
    input_revision: application.input_revision, verdict: "UNVERIFIED", principal_paise: 0 };
  await db.decisions.insertOne(decision);
  await db.applications.updateOne({ _id: application._id }, { $set: { latest_decision_id: decision._id } });
  const request = await lender("POST", `/api/applications/${application._id}/override`,
    { decision_id: decision._id, action: "request_evidence", evidence_type: "gst",
      reason: "Attach a GST summary for review" }, { "Idempotency-Key": "gst-response-request" });
  assert.equal(request.status, 200);
  const listed = await owner("GET", "/api/evidence/demo-fixtures?type=gst");
  assert.equal(listed.status, 200);
  assert.ok(listed.json.data.some((item) => item.public_ref === "DEMO-GST-001"));
  const wrong = await owner("POST", `/api/applications/${application._id}/evidence-responses`,
    { public_ref: "DEMO-AA-001" }, { "Idempotency-Key": "gst-response-wrong" });
  assert.equal(wrong.status, 422);
  const upiBlocked = await owner("POST", `/api/applications/${application._id}/evidence-responses`,
    { public_ref: "DEMO-GST-001", trustClass: "verified_simulated" }, { "Idempotency-Key": "gst-response-trust" });
  assert.equal(upiBlocked.status, 422);
  const response = await owner("POST", `/api/applications/${application._id}/evidence-responses`,
    { public_ref: "DEMO-GST-001" }, { "Idempotency-Key": "gst-response-ok" });
  assert.equal(response.status, 201);
  assert.equal(response.json.data.rail_type, "gst");
  const refreshed = await owner("GET", `/api/applications/${application._id}`);
  assert.equal(refreshed.json.data.application.status, "submitted");
  assert.equal(refreshed.json.data.application.input_revision, application.input_revision + 1);
  assert.ok(refreshed.json.data.rails.some((rail) => rail.type === "gst" && rail.trustClass === "verified_simulated"));
  const lenderView = await lender("GET", `/api/applications/${application._id}`);
  assert.ok(lenderView.json.data.rails.some((rail) => rail.type === "gst"));
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
});
