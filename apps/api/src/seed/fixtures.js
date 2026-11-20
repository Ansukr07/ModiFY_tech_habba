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
  { _id: "user-bank-admin", email: "bank@demo", role: "bank_admin" },
];

export const EVIDENCE_FIXTURES = [
  { public_ref: "DEMO-AA-001", type: "aa", label: "Matching Account Aggregator file", identity_match: true, trustClass: "verified_simulated" },
  { public_ref: "DEMO-AA-002", type: "aa", label: "Name-mismatch Account Aggregator file", identity_match: false, trustClass: "verified_simulated" },
  { public_ref: "DEMO-GST-001", type: "gst", label: "GST summary aligned with typical UPI totals", identity_match: true, trustClass: "verified_simulated", payload: { taxable_sales_paise: 50000000, period_from: "2026-01-05", period_to: "2026-03-23" } },
  { public_ref: "DEMO-GST-002", type: "gst", label: "GST summary with a sales gap versus UPI", identity_match: true, trustClass: "verified_simulated", payload: { taxable_sales_paise: 90000000, period_from: "2026-01-05", period_to: "2026-03-23" } },
  { public_ref: "DEMO-ID-001", type: "identity", rail_type: "udyam", label: "Matching Udyam record", identity_match: true, trustClass: "supporting", identity: { udyam: "UDYAM-KR-03-000111" } },
  { public_ref: "DEMO-ID-002", type: "identity", rail_type: "udyam", label: "Different Udyam holder", identity_match: false, trustClass: "supporting", identity: { udyam: "UDYAM-XX-99-000999" } },
  { public_ref: "DEMO-REC-001", type: "reconciliation", rail_type: "gst", label: "Updated GST totals for reconciliation", identity_match: true, trustClass: "verified_simulated", payload: { taxable_sales_paise: 50000000, period_from: "2026-01-05", period_to: "2026-03-23" } },
  { public_ref: "DEMO-PDF-001", type: "other", rail_type: "pdf", label: "Supporting PDF statement", identity_match: true, trustClass: "unverified" },
];

export function safeEvidenceFixture(fixture) {
  return { public_ref: fixture.public_ref, type: fixture.type, label: fixture.label, identity_match: fixture.identity_match };
}

export const BANK_ACCOUNTS = [
  { _id: "bank-clean", public_ref: "DEMO-ACCT-001", masked_number: "•••• 1042", customer_name: "Lakshmi Stores", city: "Bengaluru", status: "active", scenario_hint: "Matching account", weeks: [42, 48, 39, 51, 44, 28, 46, 49, 41, 47, 43, 45] },
  { _id: "bank-mismatch", public_ref: "DEMO-ACCT-002", masked_number: "•••• 2718", customer_name: "Ravi Tailors", city: "Bengaluru", status: "active", scenario_hint: "Different business identity", weeks: [20, 22, 18, 25, 19, 21, 23, 17, 24, 20, 22, 18] },
  { _id: "bank-short", public_ref: "DEMO-ACCT-003", masked_number: "•••• 6135", customer_name: "Lakshmi Stores", city: "Bengaluru", status: "active", scenario_hint: "Short transaction history", weeks: [42, 48, 39] },
  { _id: "bank-suspicious", public_ref: "DEMO-ACCT-004", masked_number: "•••• 8890", customer_name: "QuickTrade Hub", city: "Bengaluru", status: "active", scenario_hint: "Unusual activity", weeks: [8, 9, 10, 90, 92, 88, 91, 89, 93, 90, 88, 91] },
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
        payload: { taxable_sales_paise: 90000000, period_from: "2026-01-05", period_to: "2026-03-23" },
        createdAt: now,
      },
    ];
  }
  return [
    { shopId: id, type: "aa", trustClass: "verified_simulated", provenance: "synthetic", identity_match: true, createdAt: now },
    { shopId: id, type: "upi", trustClass: "verified_simulated", provenance: "synthetic", identity_match: true, createdAt: now },
    { shopId: id, type: "gst", trustClass: "verified_simulated", provenance: "synthetic", identity_match: true, payload: { taxable_sales_paise: 50000000, period_from: "2026-01-05", period_to: "2026-03-23" }, createdAt: now },
  ];
}

export function cashflowsFor(id) {
  const clean = [42, 48, 39, 51, 44, 28, 46, 49, 41, 47, 43, 45];
  if (id === "pdf-only") return weeksToCashflows(id, [20, 22, 18, 25, 19, 21, 23, 17, 24, 20, 22, 18], 4);
  if (id === "mule") return weeksToCashflows(id, [8, 9, 10, 90, 92, 88, 91, 89, 93, 90, 88, 91], 1);
  if (id === "gst-gap") return weeksToCashflows(id, [30, 28, 33, 31, 12, 29, 32, 30, 27, 31, 28, 30], 5);
  return weeksToCashflows(id, clean, 6);
}
