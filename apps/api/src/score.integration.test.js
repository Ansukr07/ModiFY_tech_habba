import assert from "node:assert/strict";
import { test } from "node:test";
import { createApp, seedDb } from "./createApp.js";
import { memoryDb } from "./store.js";

function listen(app) {
  return new Promise((resolve) => {
    const s = app.listen(0, () => {
      resolve({ port: s.address().port, close: () => new Promise((r) => s.close(r)) });
    });
  });
}

async function session(app, email) {
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
      for (const c of r.headers.getSetCookie?.() || []) cookies.push(c.split(";")[0]);
      return { status: r.status, json: await r.json() };
    } finally {
      await server.close();
    }
  };
  await send("POST", "/api/auth/login", { email });
  return send;
}

test("score pdf-only UNVERIFIED and kirana offer; stress does not replace decision", async () => {
  const health = await fetch(`${process.env.SCORE_URL || "http://127.0.0.1:8000"}/health`).then((r) => r.json());
  assert.equal(health.status, "ok");
  const db = memoryDb();
  await seedDb(db);
  const app = createApp(db);
  const owner = await session(app, "owner@demo");
  const lender = await session(app, "lender@demo");

  const pdfApp = await owner("POST", "/api/applications", { shop_id: "pdf-only", requested_amount_paise: 15000000 }, { "Idempotency-Key": "app-pdf" });
  assert.equal(pdfApp.status, 201);
  const pdfScore = await lender("POST", `/api/applications/${pdfApp.json.data._id}/score`, {}, { "Idempotency-Key": "score-pdf" });
  assert.equal(pdfScore.status, 200);
  assert.equal(pdfScore.json.data.verdict, "UNVERIFIED");
  assert.equal(pdfScore.json.data.principal_paise, 0);

  const kApp = await owner("POST", "/api/applications", { shop_id: "clean-kirana", requested_amount_paise: 20000000 }, { "Idempotency-Key": "app-k" });
  const kScore = await lender("POST", `/api/applications/${kApp.json.data._id}/score`, {}, { "Idempotency-Key": "score-k" });
  assert.equal(kScore.status, 200);
  assert.ok(kScore.json.data.principal_paise > 0);
  assert.ok(kScore.json.data.capacity?.worst_4_week_start);
  assert.ok(kScore.json.data.capacity?.worst_4_week_end);
  assert.ok(kScore.json.data.principal_paise <= kScore.json.data.capacity.max_principal_paise);
  assert.ok(kScore.json.data.repayment_periods > 0);
  assert.equal(kScore.json.data.total_repayment_paise,
    kScore.json.data.repayment_amount_paise * kScore.json.data.repayment_periods);
  assert.ok(Array.isArray(kScore.json.data.workflow_trace) && kScore.json.data.workflow_trace.length);
  assert.ok("agent_status" in kScore.json.data || kScore.json.data.workflow_trace.includes("agent_unavailable"));
  assert.ok(kScore.json.data.model_scores);
  const report = await lender("GET", `/api/applications/${kApp.json.data._id}/report`);
  assert.equal(report.json.data.terms.repayment_periods, kScore.json.data.repayment_periods);
  assert.equal(report.json.data.terms.total_repayment_paise, kScore.json.data.total_repayment_paise);
  assert.equal(report.json.data.terms.total_interest_paise, kScore.json.data.total_interest_paise);
  assert.equal(report.json.data.terms.principal_paise, kScore.json.data.principal_paise);
  assert.equal(report.json.data.capacity.max_principal_paise, kScore.json.data.capacity.max_principal_paise);
  assert.ok("model_scores" in report.json.data);
  const id = kScore.json.data._id;

  const stress = await lender("POST", `/api/applications/${kApp.json.data._id}/stress`, {
    lean_inflow_delta_pct: -40,
    outflow_delta_pct: 0,
  });
  assert.equal(stress.json.data.scenario_only, true);
  assert.ok(stress.json.data.audit_reference);
  const stressAudit = await lender("GET", `/api/applications/${kApp.json.data._id}/audit`);
  assert.ok(stressAudit.json.items.some((e) => e.action === "stress" && e.ok && e.action_detail === "illustrative_scenario"));
  const again = await lender("GET", `/api/applications/${kApp.json.data._id}`);
  assert.equal(again.json.data.decision._id, id);
  assert.equal(again.json.data.reconciliation.gst_sales_paise, 50000000);
  assert.ok(again.json.data.reconciliation.upi_credits_paise > 0);
  assert.equal(kScore.json.data.provenance, "synthetic");
  assert.equal(pdfScore.json.data.provenance, "synthetic");

  const ev = await lender("GET", "/api/evidence/summary");
  assert.equal(ev.json.data.baselineFunded, 0);
  assert.ok(Array.isArray(ev.json.data.byArchetype));
  assert.ok(ev.json.data.byArchetype.some((row) => row.archetype === "pdf_only" && row.unverified_count >= 1));

  const audit = await lender("GET", `/api/applications/${kApp.json.data._id}/audit`);
  assert.ok(audit.json.items.some((e) => e.action === "score" && e.ok));
  const reduced = await lender("POST", `/api/applications/${kApp.json.data._id}/override`, {
    action: "reduce_terms", reason: "Conservative first loan", proposed_terms: { principal_paise: 1000000 },
  }, { "Idempotency-Key": "reduce-k" });
  assert.equal(reduced.status, 200);
  const reducedView = await lender("GET", `/api/applications/${kApp.json.data._id}`);
  assert.equal(reducedView.json.data.latest_action.effective.principal_paise, 1000000);
  assert.ok(reducedView.json.data.latest_action.audit_reference);
});

test("idempotency and fairness twins", async () => {
  await fetch(`${process.env.SCORE_URL || "http://127.0.0.1:8000"}/health`).then((r) => r.json());
  const db = memoryDb();
  await seedDb(db);
  const app = createApp(db);
  const owner = await session(app, "owner@demo");
  const lender = await session(app, "lender@demo");

  const a1 = await owner(
    "POST",
    "/api/applications",
    { shop_id: "twin-a", requested_amount_paise: 20000000 },
    { "Idempotency-Key": "twin-a-app" }
  );
  const a2 = await owner(
    "POST",
    "/api/applications",
    { shop_id: "twin-a", requested_amount_paise: 20000000 },
    { "Idempotency-Key": "twin-a-app" }
  );
  assert.equal(a1.json.data._id, a2.json.data._id);
  const clash = await owner(
    "POST",
    "/api/applications",
    { shop_id: "twin-a", requested_amount_paise: 100 },
    { "Idempotency-Key": "twin-a-app" }
  );
  assert.equal(clash.status, 409);

  const b1 = await owner(
    "POST",
    "/api/applications",
    { shop_id: "twin-b", requested_amount_paise: 20000000 },
    { "Idempotency-Key": "twin-b-app" }
  );
  const sa = await lender("POST", `/api/applications/${a1.json.data._id}/score`, {}, { "Idempotency-Key": "sa" });
  const sb = await lender("POST", `/api/applications/${b1.json.data._id}/score`, {}, { "Idempotency-Key": "sb" });
  assert.equal(sa.json.data.principal_paise, sb.json.data.principal_paise);
  assert.equal(sa.json.data.verdict, sb.json.data.verdict);
  assert.equal(sa.json.data.rate_bps, sb.json.data.rate_bps);
  const fair = await lender("POST", "/api/evidence/fairness", { fixture_pair_id: "lakshmi-twins", policy_version: "v1" });
  assert.equal(fair.json.data.pass, true);
  assert.equal(fair.json.data.input_match, true);
  assert.ok(fair.json.data.matched_inputs);
  assert.equal(fair.json.data.matched_inputs.history_weeks[0], fair.json.data.matched_inputs.history_weeks[1]);

  const ov = await lender(
    "POST",
    `/api/applications/${a1.json.data._id}/override`,
    { action: "decline", reason: "Manual decline for demo file" },
    { "Idempotency-Key": "ov-1" }
  );
  assert.equal(ov.status, 200);
  const reviewed = await lender("GET", `/api/applications/${a1.json.data._id}`);
  assert.equal(reviewed.json.data.application.status, "reviewed");
  assert.equal(reviewed.json.data.latest_action.action, "decline");
  assert.equal(reviewed.json.data.latest_action.effective.verdict, "DECLINE");
  const queue = await lender("GET", "/api/applications");
  const row = queue.json.items.find((item) => item._id === a1.json.data._id);
  assert.equal(row.shop_name, "Lakshmi Stores (twin A)");
  assert.equal(row.effective_verdict, "DECLINE");
  const report = await lender("GET", `/api/applications/${a1.json.data._id}/report`);
  assert.equal(report.json.data.effective_action.action, "decline");
  const aud2 = await lender("GET", `/api/applications/${a1.json.data._id}/audit`);
  assert.ok(aud2.json.items.some((e) => e.action === "override" && e.ok));
});

test("seeded archetypes score distinctly and stress does not replace the saved decision", async () => {
  assert.equal((await fetch(`${process.env.SCORE_URL || "http://127.0.0.1:8000"}/health`).then((r) => r.json())).status, "ok");
  const db = memoryDb();
  await seedDb(db);
  const app = createApp(db);
  const owner = await session(app, "owner@demo");
  const lender = await session(app, "lender@demo");
  await lender("POST", "/api/admin/seed");
  const listing = await lender("GET", "/api/applications");
  const byShop = Object.fromEntries(listing.json.items.map((item) => [item.shopId, item]));
  assert.equal(byShop["pdf-only"].pdf_only, true);
  const scored = {};
  for (const shopId of ["clean-kirana", "pdf-only", "mule", "gst-gap"]) {
    const application = byShop[shopId];
    const result = await lender("POST", `/api/applications/${application._id}/score`, {
      expected_input_revision: application.input_revision,
    }, { "Idempotency-Key": `seed-score-${shopId}` });
    assert.equal(result.status, 200, shopId);
    scored[shopId] = result.json.data;
  }
  assert.equal(scored["pdf-only"].verdict, "UNVERIFIED");
  assert.equal(scored["pdf-only"].principal_paise, 0);
  assert.equal(scored.mule.verdict, "DECLINE");
  assert.equal(scored.mule.principal_paise, 0);
  assert.ok(scored["clean-kirana"].principal_paise > 0);
  assert.ok(scored["clean-kirana"].capacity?.retention_basis);
  const gstView = await lender("GET", `/api/applications/${byShop["gst-gap"]._id}`);
  assert.ok(gstView.json.data.reconciliation);
  assert.ok(gstView.json.data.reconciliation.relative_gap > 0);
  for (const shopId of ["clean-kirana", "pdf-only", "mule", "gst-gap"]) {
    const savedId = scored[shopId]._id;
    const stress = await lender("POST", `/api/applications/${byShop[shopId]._id}/stress`, {
      lean_inflow_delta_pct: -40,
      outflow_delta_pct: 10,
    });
    assert.equal(stress.status, 200, shopId);
    assert.equal(stress.json.data.scenario_only, true, shopId);
    if (shopId === "pdf-only") {
      assert.equal(stress.json.data.verdict, "UNVERIFIED");
      assert.equal(stress.json.data.not_run_reason, "no_verified_rail");
      assert.equal(stress.json.data.principal_paise, 0);
    }
    const after = await lender("GET", `/api/applications/${byShop[shopId]._id}`);
    assert.equal(after.json.data.decision._id, savedId, shopId);
    assert.equal(after.json.data.decision.principal_paise, scored[shopId].principal_paise, shopId);
    assert.equal(after.json.data.decision.verdict, scored[shopId].verdict, shopId);
  }
});

