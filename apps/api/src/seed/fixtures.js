/** Six clickable demo shops. All provenance synthetic. Weeks are inflow thousands of rupees → paise * 100000? Seed web used 42 meaning ₹42k-ish. Use 42 * 100000 paise = ₹42,000 weekly inflow. */

function weeksToCashflows(shopId, weeks, payers) {
  const rows = [];
  const start = new Date("2026-01-05T00:00:00Z");
  weeks.forEach((w, i) => {
    const t = new Date(start);
    t.setUTCDate(t.getUTCDate() + i * 7);
    const iso = t.toISOString().slice(0, 10);
    const inflow = w * 100000;
    const outflow = Math.round(inflow * 0.72);
    const n = payers;
    for (let p = 0; p < n; p++) {
      rows.push({
        shopId,
        source_tx_id: `${shopId}-w${i}-p${p}`,
        t: iso,
        inflow_paise: Math.round(inflow / n),
        outflow_paise: p === 0 ? outflow : 0,
        payer_id: n === 1 ? "dominant" : `p_${p}`,
        provenance: "synthetic",
        generator_version: "v1",
        source_rail: "upi",
      });
    }
  });
  return rows;
}

export const DEMO_USERS = [
  { _id: "user-owner", email: "owner@demo", role: "owner" },
  { _id: "user-lender", email: "lender@demo", role: "lender" },
];

export const SHOPS = [
  {
    _id: "clean-kirana",
    ownerId: "user-owner",
    name: "Lakshmi Stores",
    business_type: "Kirana",
    city: "Bengaluru",
    yearsOpen: 6,
    identity: { udyam: "UDYAM-KR-03-000111", vpa: "lakshmistores@upi", gstin: "29AABCU9603R1ZX" },
    provenance: "synthetic",
    input_revision: 1,
    archetype: "stable",
    ownerFlags: { gender: "woman", area: "Jayanagar" },
  },
  {
    _id: "pdf-only",
    ownerId: "user-owner",
    name: "Ravi Tailors",
    business_type: "Tailor",
    city: "Bengaluru",
    yearsOpen: 4,
    identity: {},
    provenance: "synthetic",
    input_revision: 1,
    archetype: "pdf_only",
  },
  {
    _id: "mule",
    ownerId: "user-owner",
    name: "QuickTrade Hub",
    business_type: "General trade",
    city: "Bengaluru",
    yearsOpen: 1,
    identity: { vpa: "quick@upi" },
    provenance: "synthetic",
    input_revision: 1,
    archetype: "mule",
  },
  {
    _id: "gst-gap",
    ownerId: "user-owner",
    name: "Meena Repair",
    business_type: "Repair",
    city: "Bengaluru",
    yearsOpen: 5,
    identity: { gstin: "29AABCU9603R1ZY", vpa: "meena@upi" },
    provenance: "synthetic",
    input_revision: 1,
    archetype: "gst_mismatch",
  },
  {
    _id: "twin-a",
    ownerId: "user-owner",
    name: "Lakshmi Stores (twin A)",
    business_type: "Kirana",
    city: "Bengaluru",
    yearsOpen: 6,
    identity: { vpa: "twin@upi" },
    provenance: "synthetic",
    input_revision: 1,
    archetype: "twin_fairness",
    ownerFlags: { gender: "woman", area: "Jayanagar" },
  },
  {
    _id: "twin-b",
    ownerId: "user-owner",
    name: "Lakshmi Stores (twin B)",
    business_type: "Kirana",
    city: "Bengaluru",
    yearsOpen: 6,
    identity: { vpa: "twin@upi" },
    provenance: "synthetic",
    input_revision: 1,
    archetype: "twin_fairness",
    ownerFlags: { gender: "man", area: "Whitefield" },
  },
];

export function railsFor(id) {
  const now = new Date().toISOString();
  if (id === "pdf-only") {
    return [
      {
        shopId: id,
        type: "pdf",
        trustClass: "unverified",
        provenance: "synthetic",
        identity_match: true,
        createdAt: now,
      },
    ];
  }
  if (id === "mule") {
    return [
      {
        shopId: id,
        type: "upi",
        trustClass: "verified_simulated",
        provenance: "synthetic",
        identity_match: true,
        createdAt: now,
      },
    ];
  }
  if (id === "gst-gap") {
    return [
      {
        shopId: id,
        type: "upi",
        trustClass: "verified_simulated",
        provenance: "synthetic",
        identity_match: true,
        createdAt: now,
      },
      {
        shopId: id,
        type: "gst",
        trustClass: "verified_simulated",
        provenance: "synthetic",
        identity_match: true,
        payload: { taxable_sales_paise: 90000000 },
        createdAt: now,
      },
    ];
  }
  return [
    { shopId: id, type: "aa", trustClass: "verified_simulated", provenance: "synthetic", identity_match: true, createdAt: now },
    { shopId: id, type: "upi", trustClass: "verified_simulated", provenance: "synthetic", identity_match: true, createdAt: now },
    { shopId: id, type: "gst", trustClass: "verified_simulated", provenance: "synthetic", identity_match: true, payload: { taxable_sales_paise: 50000000 }, createdAt: now },
  ];
}

export function cashflowsFor(id) {
  const clean = [42, 48, 39, 51, 44, 28, 46, 49, 41, 47, 43, 45];
  if (id === "pdf-only") return weeksToCashflows(id, [20, 22, 18, 25, 19, 21, 23, 17, 24, 20, 22, 18], 4);
  if (id === "mule") return weeksToCashflows(id, [8, 9, 10, 90, 92, 88, 91, 89, 93, 90, 88, 91], 1);
  if (id === "gst-gap") return weeksToCashflows(id, [30, 28, 33, 31, 12, 29, 32, 30, 27, 31, 28, 30], 5);
  return weeksToCashflows(id, clean, 6);
}
