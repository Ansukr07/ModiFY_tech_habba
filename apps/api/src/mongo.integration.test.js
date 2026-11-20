import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { MongoMemoryServer } from "mongodb-memory-server";
import { createApp, seedDb } from "./createApp.js";
import { mongoDb } from "./store.js";

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

let mongod;
let db;

before(async () => {
  mongod = await MongoMemoryServer.create();
  db = await mongoDb(mongod.getUri());
  await seedDb(db);
});

after(async () => {
  if (db?.client) await db.client.close();
  if (mongod) await mongod.stop();
});

test("Mongo persists shop, application, decision, audit", async () => {
  const health = await fetch("http://127.0.0.1:8000/health").then((r) => r.json());
  assert.equal(health.status, "ok");
  const app = createApp(db);
  const owner = await session(app, "owner@demo");
  const lender = await session(app, "lender@demo");
  const created = await owner(
    "POST",
    "/api/applications",
    { shop_id: "clean-kirana", requested_amount_paise: 20000000 },
    { "Idempotency-Key": "mongo-app" }
  );
  assert.equal(created.status, 201);
  const fromDb = await db.applications.findOne({ _id: created.json.data._id });
  assert.ok(fromDb);
  assert.equal(fromDb.requested_amount_paise, 20000000);
  const scored = await lender("POST", `/api/applications/${created.json.data._id}/score`, {}, { "Idempotency-Key": "mongo-score" });
  assert.equal(scored.status, 200);
  const dec = await db.decisions.findOne({ _id: scored.json.data._id });
  assert.ok(dec);
  assert.equal(dec.provenance, "synthetic");
  const logs = await db.audit_logs.find({ action: "score" }).toArray();
  assert.ok(logs.length >= 1);
});
