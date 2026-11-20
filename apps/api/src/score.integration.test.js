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
  const health = await fetch("http://127.0.0.1:8000/health").then((r) => r.json());
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
  const id = kScore.json.data._id;

  const stress = await lender("POST", `/api/applications/${kApp.json.data._id}/stress`, {
    lean_inflow_delta_pct: -40,
    outflow_delta_pct: 0,
  });
  assert.equal(stress.json.data.scenario_only, true);
  const again = await lender("GET", `/api/applications/${kApp.json.data._id}`);
  assert.equal(again.json.data.decision._id, id);
  assert.equal(kScore.json.data.provenance, "synthetic");
  assert.equal(pdfScore.json.data.provenance, "synthetic");

  const ev = await lender("GET", "/api/evidence/summary");
  assert.equal(ev.json.data.baselineFunded, 0);

  const audit = await lender("GET", `/api/applications/${kApp.json.data._id}/audit`);
  assert.ok(audit.json.items.some((e) => e.action === "score" && e.ok));
});

test("idempotency and fairness twins", async () => {
  await fetch("http://127.0.0.1:8000/health").then((r) => r.json());
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

  const ov = await lender(
    "POST",
    `/api/applications/${a1.json.data._id}/override`,
    { action: "decline", reason: "Manual decline for demo file" },
    { "Idempotency-Key": "ov-1" }
  );
  assert.equal(ov.status, 200);
  const aud2 = await lender("GET", `/api/applications/${a1.json.data._id}/audit`);
  assert.ok(aud2.json.items.some((e) => e.action === "override" && e.ok));
});


