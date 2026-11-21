import assert from "node:assert/strict";
import test from "node:test";
import { normalizeSetuFi, openFiRow, sealFiRow } from "./setuFi.js";

const sample = { fiData: [{ fipID: "mock", data: [{ linkRefNumber: "link", maskedAccNumber: "XXXX42", decryptedFI: { account: { type: "deposit", transactions: { transaction: [{ txnId: "a", valueDate: "2026-11-20", type: "CREDIT", amount: "12.34", mode: "UPI" }, { txnId: "b", valueDate: "2026-11-21", type: "DEBIT", amount: "0.01" }] } } } }] }] };

test("Setu FI amounts stay exact and UPI mode remains one AA source", () => {
  const { accounts, transactions } = normalizeSetuFi(sample, "consent");
  assert.equal(accounts.length, 1);
  assert.equal(transactions[0].inflow_paise, 1234);
  assert.equal(transactions[1].outflow_paise, 1);
  assert.equal(transactions[0].source_rail, "aa");
  assert.equal(normalizeSetuFi(sample, "consent").transactions[0]._id, transactions[0]._id);
  const sealed = sealFiRow({ ...transactions[0], consent_id: "consent" }, "test secret");
  assert.equal(sealed.inflow_paise, undefined);
  assert.equal(openFiRow(sealed, "test secret").inflow_paise, 1234);
  assert.throws(() => openFiRow({ ...sealed, tag: "AAAA" }, "test secret"));
  assert.throws(() => normalizeSetuFi({ fiData: [{ ...sample.fiData[0], data: [{ ...sample.fiData[0].data[0], decryptedFI: { account: { transactions: { transaction: [{ ...sample.fiData[0].data[0].decryptedFI.account.transactions.transaction[0], amount: "1.234" }] } } } }] }] }, "consent"));
  assert.throws(() => normalizeSetuFi({ fips: [{ fipID: "mock", accounts: [{ linkRefNumber: "link", data: { account: { ...sample.fiData[0].data[0].decryptedFI.account, summary: { currency: "USD" } } } }] }] }, "consent"));
});

test("partial FI skips failed accounts without accepting them in a completed session", () => {
  const failed = { linkRefNumber: "failed-link", FIstatus: "FAILED", data: null };
  const fi = { status: "PARTIAL", fips: [{ fipID: "mock", accounts: [sample.fiData[0].data[0], failed] }] };
  assert.equal(normalizeSetuFi(fi, "consent").accounts.length, 1);
  assert.throws(() => normalizeSetuFi({ ...fi, status: "COMPLETED" }, "consent"));
});
