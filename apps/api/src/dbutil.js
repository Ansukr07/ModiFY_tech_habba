export async function list(col, q = {}) {
  const r = col.find(q);
  if (r && typeof r.toArray === "function") {
    return r.sort({ createdAt: -1, _id: -1 }).toArray();
  }
  return r;
}

export async function one(col, q) {
  if (typeof col.findOne === "function") return col.findOne(q);
  const rows = await list(col, q);
  return rows[0] || null;
}
