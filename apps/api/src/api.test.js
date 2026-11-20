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

  const mismatchShop = await owner("POST", "/api/shops", { name: "Lakshmi Stores", business_type: "Kirana", identity: {} });
  const mismatchApp = await owner("POST", "/api/applications", { shop_id: mismatchShop.json.data._id, requested_amount_paise: 1000000 }, { "Idempotency-Key": "bank-app-2" });
  const mismatchReq = await owner("POST", `/api/applications/${mismatchApp.json.data._id}/verification-requests`, { public_ref: "DEMO-ACCT-002" }, { "Idempotency-Key": "bank-request-2" });
  const mismatchConfirm = await bank("POST", `/api/bank/verification-requests/${mismatchReq.json.data.id}/decision`, { action: "confirm" }, { "Idempotency-Key": "bank-review-2" });
  assert.equal(mismatchConfirm.status, 422);
});
