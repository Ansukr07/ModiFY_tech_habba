import test from "node:test";
import assert from "node:assert/strict";
import { SHOPS, paiseToInr } from "./seed.js";

test("synthetic offers fit their stated weekly repayment capacity", () => {
  for (const shop of SHOPS) {
    if (!shop.principal) {
      assert.equal(shop.maxEmi, 0, shop.id);
      assert.equal(shop.weeklyRepayment, undefined, shop.id);
      continue;
    }
    const rate = shop.rateBps / 10000 / 52;
    const periods = shop.tenureMonths * 52 / 12;
    const minimumPayment = Math.ceil(shop.principal * rate / (1 - (1 + rate) ** -periods));
    assert.ok(shop.weeklyRepayment >= minimumPayment, `${shop.id}: repayment does not cover principal and interest`);
    assert.ok(shop.weeklyRepayment <= shop.maxEmi, `${shop.id}: repayment exceeds capacity`);
  }
});

test("display keeps paise instead of rounding offers upward", () => {
  assert.equal(paiseToInr(10001), "₹100.01");
});

test("fairness seed twins differ only in protected flags and presentation", () => {
  const [a, b] = SHOPS.filter((shop) => shop.id.startsWith("twin"));
  assert.ok(a && b);
  for (const key of ["requestedAmount", "rails", "weeks", "leanMonthRatio", "pAuth", "pStress", "verdict", "principal", "tenureMonths", "rateBps", "cadence", "maxEmi", "weeklyRepayment", "conditions"]) {
    assert.deepEqual(a[key], b[key], key);
  }
  assert.notDeepEqual(a.ownerFlags, b.ownerFlags);
});
