import { test } from "node:test";
import assert from "node:assert/strict";
import { repaymentTerms } from "./repayment.js";

test("reduced principal produces a lower schedule at the saved rate and cadence", () => {
  const original = repaymentTerms(2_000_000, 52, 1800, "weekly");
  const reduced = repaymentTerms(1_000_000, 52, 1800, "weekly");
  assert.ok(reduced.repayment_amount_paise < original.repayment_amount_paise);
  assert.equal(reduced.total_repayment_paise, reduced.repayment_amount_paise * 52);
  assert.equal(reduced.total_interest_paise, reduced.total_repayment_paise - reduced.principal_paise);
});

test("zero rate and tiny principal still repay principal", () => {
  assert.equal(repaymentTerms(100, 3, 0, "monthly").total_repayment_paise, 102);
  assert.throws(() => repaymentTerms(0, 3, 0, "monthly"));
});
