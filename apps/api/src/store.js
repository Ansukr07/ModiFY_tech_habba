/** Mongo or in-memory collections. */

const mem = {
  users: [],
  shops: [],
  rails: [],
  cashflows: [],
  applications: [],
  decisions: [],
  overrides: [],
  audit_logs: [],
  idempotency: [],
};

function coll(name) {
  return {
    async find(q = {}) {
      return mem[name].filter((row) => match(row, q)).sort(byCreated);
    },
    async findOne(q) {
      return mem[name].find((row) => match(row, q)) || null;
    },
    async insertOne(doc) {
      mem[name].push(doc);
      return { insertedId: doc._id };
    },
    async updateOne(q, set) {
      const row = mem[name].find((r) => match(r, q));
      if (row) Object.assign(row, set.$set || set);
    },
  };
}

function match(row, q) {
  return Object.entries(q).every(([k, v]) => {
    if (v && typeof v === "object" && v.$ne) return row[k] !== v.$ne;
    return row[k] === v;
  });
}

function byCreated(a, b) {
  return String(a.createdAt) < String(b.createdAt) ? 1 : -1;
}

export function memoryDb() {
  return {
    users: coll("users"),
    shops: coll("shops"),
    rails: coll("rails"),
    cashflows: coll("cashflows"),
    applications: coll("applications"),
    decisions: coll("decisions"),
    overrides: coll("overrides"),
    audit_logs: coll("audit_logs"),
    idempotency: coll("idempotency"),
    kind: "memory",
  };
}

export async function mongoDb(uri) {
  const { MongoClient } = await import("mongodb");
  const client = new MongoClient(uri);
  await client.connect();
  const d = client.db("zerocibil");
  await d.collection("idempotency").createIndex({ actorId: 1, key: 1, scope: 1 }, { unique: true });
  await d.collection("cashflows").createIndex({ source_tx_id: 1 }, { unique: true, sparse: true });
  await d.collection("applications").createIndex({ shopId: 1, createdAt: -1 });
  await d.collection("rails").createIndex({ shopId: 1 });
  await d.collection("audit_logs").createIndex({ at: -1 });
  await d.collection("shops").createIndex({ ownerId: 1 });
  return {
    users: d.collection("users"),
    shops: d.collection("shops"),
    rails: d.collection("rails"),
    cashflows: d.collection("cashflows"),
    applications: d.collection("applications"),
    decisions: d.collection("decisions"),
    overrides: d.collection("overrides"),
    audit_logs: d.collection("audit_logs"),
    idempotency: d.collection("idempotency"),
    kind: "mongo",
    client,
  };
}
