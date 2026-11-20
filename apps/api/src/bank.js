import crypto from "node:crypto";
import { list, one } from "./dbutil.js";
import { BANK_ACCOUNTS } from "./seed/fixtures.js";

export async function seedBank(db) {
  for (const account of BANK_ACCOUNTS) {
    const { weeks, scenario_hint, ...record } = account;
    if (!(await one(db.bank_accounts, { _id: account._id }))) {
      await db.bank_accounts.insertOne({ ...record, scenario_hint, provenance: "synthetic", fixture_version: "bank-v1" });
    }
    if ((await list(db.bank_transactions, { account_id: account._id })).length) continue;
    for (const [week, value] of weeks.entries()) {
      const date = new Date("2026-01-05T00:00:00Z");
      date.setUTCDate(date.getUTCDate() + week * 7);
      const inflow = value * 100000;
      const payers = account._id === "bank-suspicious" ? 1 : 6;
      for (let payer = 0; payer < payers; payer++) {
        await db.bank_transactions.insertOne({
          _id: `${account._id}-w${week}-p${payer}`,
          account_id: account._id,
          posted_at: date.toISOString().slice(0, 10),
          inflow_paise: Math.round(inflow / payers),
          outflow_paise: payer === 0 ? Math.round(inflow * 0.72) : 0,
          payer_id: payers === 1 ? "dominant" : `p_${payer}`,
          source_rail: "upi",
          provenance: "synthetic",
        });
      }
    }
  }
}

export function safeAccount(account) {
  return { public_ref: account.public_ref, masked_number: account.masked_number, label: account.customer_name, scenario_hint: account.scenario_hint, provenance: "synthetic" };
}

const normalize = (value) => String(value || "").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-IN");

export async function inspectBank(db, shop, account) {
  const rows = (await list(db.bank_transactions, { account_id: account._id })).sort((a, b) => a.posted_at.localeCompare(b.posted_at) || a._id.localeCompare(b._id));
  const weeks = new Set(rows.map((row) => row.posted_at));
  const identity = normalize(shop.name) === normalize(account.customer_name);
  const valid = rows.every((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.posted_at) && Number.isInteger(row.inflow_paise) && row.inflow_paise >= 0 && Number.isInteger(row.outflow_paise) && row.outflow_paise >= 0);
  const checks = [
    { name: "business_identity", status: identity ? "pass" : "fail", reason: identity ? "Business name matches bank record" : "Business name differs from bank record" },
    { name: "account_status", status: account.status === "active" ? "pass" : "fail", reason: account.status === "active" ? "Account active" : "Account inactive" },
    { name: "transaction_history", status: valid && weeks.size >= 8 ? "pass" : "fail", reason: valid ? `${weeks.size} distinct weeks available; 8 required` : "Invalid transaction rows" },
  ];
  const recommendation = !identity ? "mismatch" : checks.every((check) => check.status === "pass") ? "verified_simulated" : "insufficient_evidence";
  const source_hash = crypto.createHash("sha256").update(JSON.stringify({ account: account._id, rows })).digest("hex");
  return {
    checks, recommendation, rows, source_hash,
    covered_from: rows[0]?.posted_at || null,
    covered_to: rows.at(-1)?.posted_at || null,
    transaction_count: rows.length,
    total_credit_paise: rows.reduce((n, row) => n + row.inflow_paise, 0),
    total_debit_paise: rows.reduce((n, row) => n + row.outflow_paise, 0),
  };
}
