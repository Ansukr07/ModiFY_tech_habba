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
  bank_accounts: [],
  bank_transactions: [],
  verification_requests: [],
  aa_connections: [],
  aa_accounts: [],
  aa_transactions: [],
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
    async deleteMany(q) {
      mem[name] = mem[name].filter((row) => !match(row, q));
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
    bank_accounts: coll("bank_accounts"),
    bank_transactions: coll("bank_transactions"),
    verification_requests: coll("verification_requests"),
    aa_connections: coll("aa_connections"),
    aa_accounts: coll("aa_accounts"),
    aa_transactions: coll("aa_transactions"),
    kind: "memory",
    async transaction(work) { return work(); },
  };
}

export async function mongoDb(uri, { requireTransactions = false } = {}) {
  const { MongoClient } = await import("mongodb");
  const client = new MongoClient(uri);
  await client.connect();
  const hello = await client.db("admin").command({ hello: 1 });
  const supportsTransactions = !!hello.setName || hello.msg === "isdbgrid";
  if (requireTransactions && !supportsTransactions) {
    await client.close();
    throw new Error("Production MongoDB must be a replica set or sharded cluster to support atomic writes");
  }
  const d = client.db();
  await d.collection("idempotency").createIndex({ actorId: 1, key: 1, scope: 1 }, { unique: true });
  await d.collection("cashflows").createIndex({ source_tx_id: 1 }, { unique: true, sparse: true });
  await d.collection("applications").createIndex({ shopId: 1, createdAt: -1 });
  await d.collection("applications").createIndex({ ownerId: 1, createdAt: 1, _id: 1 });
  await d.collection("applications").createIndex({ createdAt: 1, _id: 1 });
  await d.collection("rails").createIndex({ shopId: 1 });
  await d.collection("rails").createIndex({ shopId: 1, type: 1, trustClass: 1 });
  await d.collection("overrides").createIndex({ applicationId: 1, decisionId: 1, createdAt: -1 });
  await d.collection("audit_logs").createIndex({ at: -1 });
  await d.collection("shops").createIndex({ ownerId: 1 });
  await d.collection("bank_accounts").createIndex({ public_ref: 1 }, { unique: true });
  await d.collection("bank_transactions").createIndex({ account_id: 1, posted_at: 1 });
  await d.collection("verification_requests").createIndex({ application_id: 1, createdAt: -1 });
  await d.collection("aa_connections").createIndex({ application_id: 1 }, { unique: true });
  await d.collection("aa_connections").createIndex({ consent_id: 1 }, { unique: true });
  await d.collection("aa_transactions").createIndex({ account_id: 1, posted_at: 1 });
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
    bank_accounts: d.collection("bank_accounts"),
    bank_transactions: d.collection("bank_transactions"),
    verification_requests: d.collection("verification_requests"),
    aa_connections: d.collection("aa_connections"),
    aa_accounts: d.collection("aa_accounts"),
    aa_transactions: d.collection("aa_transactions"),
    kind: "mongo",
    client,
    async applicationPage(query, after, limit, verdict) {
      const filter = after ? { $and: [query, { $or: [
        { createdAt: { $gt: after.createdAt } },
        { createdAt: after.createdAt, _id: { $gt: after._id } },
      ] }] } : query;
      if (verdict) {
        const base = [
          { $match: query },
          { $lookup: { from: "decisions", localField: "latest_decision_id", foreignField: "_id", as: "decision" } },
          { $unwind: "$decision" },
          { $match: { "decision.verdict": verdict } },
        ];
        const cursorMatch = after ? [{ $match: { $or: [
          { createdAt: { $gt: after.createdAt } },
          { createdAt: after.createdAt, _id: { $gt: after._id } },
        ] } }] : [];
        const [count, rows] = await Promise.all([
          d.collection("applications").aggregate([...base, { $count: "total" }]).toArray(),
          d.collection("applications").aggregate([...base, ...cursorMatch, { $sort: { createdAt: 1, _id: 1 } }, { $limit: limit + 1 }, { $project: { decision: 0 } }]).toArray(),
        ]);
        const hasMore = rows.length > limit;
        const items = rows.slice(0, limit);
        const last = items.at(-1);
        return {
          items,
          total: count[0]?.total || 0,
          next_cursor: hasMore && last ? Buffer.from(JSON.stringify({ createdAt: last.createdAt || "", _id: last._id })).toString("base64url") : null,
        };
      }
      const [total, rows] = await Promise.all([
        d.collection("applications").countDocuments(query),
        d.collection("applications").find(filter).sort({ createdAt: 1, _id: 1 }).limit(limit + 1).toArray(),
      ]);
      const hasMore = rows.length > limit;
      const items = rows.slice(0, limit);
      const last = items.at(-1);
      return {
        items,
        total,
        next_cursor: hasMore && last ? Buffer.from(JSON.stringify({ createdAt: last.createdAt || "", _id: last._id })).toString("base64url") : null,
      };
    },
    async applicationQueueMeta(query, verdict) {
      const pipeline = [
        { $match: query },
        { $lookup: { from: "decisions", localField: "latest_decision_id", foreignField: "_id", as: "decision" } },
        { $unwind: { path: "$decision", preserveNullAndEmptyArrays: true } },
        ...(verdict ? [{ $match: { "decision.verdict": verdict } }] : []),
        { $lookup: { from: "overrides", let: { appId: "$_id", decisionId: "$decision._id" }, pipeline: [
          { $match: { $expr: { $and: [{ $eq: ["$applicationId", "$$appId"] }, { $eq: ["$decisionId", "$$decisionId"] }] } } },
          { $sort: { createdAt: -1 } }, { $limit: 1 },
        ], as: "action" } },
        { $unwind: { path: "$action", preserveNullAndEmptyArrays: true } },
        { $lookup: { from: "rails", let: { shopId: "$shopId" }, pipeline: [
          { $match: { $expr: { $and: [{ $eq: ["$shopId", "$$shopId"] }, { $ne: ["$type", "pdf"] }, { $in: [{ $ifNull: ["$trustClass", "$trust_class"] }, ["verified", "verified_simulated"]] }] } } },
          { $limit: 1 },
        ], as: "verifiedRail" } },
        { $addFields: { workflow: { $switch: { branches: [
          { case: { $in: ["$status", ["awaiting_evidence", "awaiting_verification"]] }, then: "needs_evidence" },
          { case: { $or: [{ $eq: [{ $ifNull: ["$decision._id", null] }, null] }, { $ne: ["$decision.input_revision", "$input_revision"] }] }, then: "pending" },
          { case: { $eq: ["$status", "reviewed"] }, then: "reviewed" },
          { case: { $or: [{ $eq: ["$decision.verdict", "UNVERIFIED"] }, { $eq: ["$action.effective.verdict", "UNVERIFIED"] }] }, then: "needs_evidence" },
        ], default: "assessed" } }, hasVerifiedRail: { $gt: [{ $size: "$verifiedRail" }, 0] } } },
        { $group: { _id: { workflow: "$workflow", verified: "$hasVerifiedRail" }, count: { $sum: 1 } } },
      ];
      const rows = await d.collection("applications").aggregate(pipeline).toArray();
      const meta = { workflow_counts: {}, verified_rail_applications: 0 };
      for (const row of rows) {
        meta.workflow_counts[row._id.workflow] = (meta.workflow_counts[row._id.workflow] || 0) + row.count;
        if (row._id.verified) meta.verified_rail_applications += row.count;
      }
      return meta;
    },
    async transaction(work) {
      if (!supportsTransactions) return work();
      const session = client.startSession();
      try {
        let result;
        await session.withTransaction(async () => { result = await work(session); });
        return result;
      } finally {
        await session.endSession();
      }
    },
  };
}
