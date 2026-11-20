import test from "node:test";
import assert from "node:assert/strict";
import { approvalPriority } from "./approvalPriority.js";

const base = {
  assessment_stale: false,
  effective_action: null,
  verification_status: "verified_simulated",
  pdf_only: false,
  verified_rail_count: 2,
  principal_paise: 100000,
};

test("ready approvals require a positive offer and a confirmed bank check", () => {
  const { ready, waitingOnBank } = approvalPriority([
    { ...base, _id: "decline", shop_name: "Decline", effective_verdict: "DECLINE", principal_paise: 0 },
    { ...base, _id: "unverified", shop_name: "Unverified", effective_verdict: "UNVERIFIED", principal_paise: 0 },
    { ...base, _id: "stale", shop_name: "Stale", effective_verdict: "STANDARD", assessment_stale: true, principal_paise: null },
    { ...base, _id: "approved", shop_name: "Approved", effective_verdict: "STANDARD", effective_action: "approve" },
    { ...base, _id: "pdf", shop_name: "Pdf", effective_verdict: "STANDARD", pdf_only: true, verified_rail_count: 0 },
    { ...base, _id: "legacy", shop_name: "Legacy", effective_verdict: "STANDARD", verification_status: "legacy_demo", p_auth: 0.91, p_stress: 0.15, verified_rail_count: 3 },
    { ...base, _id: "ready", shop_name: "Ready", effective_verdict: "THIN_FILE", p_auth: 0.9, p_stress: 0.1, verified_rail_count: 1 },
  ]);
  assert.deepEqual(ready.map((row) => row.item._id), ["ready"]);
  assert.deepEqual(waitingOnBank.map((row) => row.item._id), ["legacy"]);
  assert.match(ready[0].reasons.join(" "), /bank check confirmed/);
  assert.match(waitingOnBank[0].reasons.join(" "), /bank check not confirmed/);
});

test("standard offers with higher authenticity and lower stress come first", () => {
  const { ready } = approvalPriority([
    { ...base, _id: "thin", shop_name: "Thin", effective_verdict: "THIN_FILE", p_auth: 0.99, p_stress: 0.01 },
    { ...base, _id: "stressed", shop_name: "Stressed", effective_verdict: "STANDARD", p_auth: 0.8, p_stress: 0.4 },
    { ...base, _id: "best", shop_name: "Best", effective_verdict: "STANDARD", p_auth: 0.91, p_stress: 0.12 },
    { ...base, _id: "step", shop_name: "Step", effective_verdict: "STEP_UP", p_auth: 0.95, p_stress: 0.05 },
    { ...base, _id: "evidence", shop_name: "Evidence", effective_verdict: "STANDARD", p_auth: 0.99, p_stress: 0.01, effective_action: "request_evidence" },
  ]);
  assert.deepEqual(ready.map((row) => row.item._id), ["best", "stressed", "step", "thin", "evidence"]);
});
