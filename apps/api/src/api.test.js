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
