import { test } from "node:test";
import assert from "node:assert/strict";
import { weeklyCashflow } from "./weeklyCashflow.js";

test("groups UTC weeks and preserves missing weeks", () => {
  assert.deepEqual(weeklyCashflow([
    { t: "2026-01-05T12:00:00Z", inflow_paise: 1000, outflow_paise: 300 },
    { t: "2026-01-11T12:00:00Z", inflow_paise: 500, outflow_paise: 100 },
    { t: "2026-01-19T12:00:00Z", inflow_paise: 200, outflow_paise: 250 },
  ]), [
    { date: "2026-01-05", inflow: 1500, outflow: 400 },
    { date: "2026-01-12", inflow: 0, outflow: 0, missing: true },
    { date: "2026-01-19", inflow: 200, outflow: 250 },
  ]);
});
