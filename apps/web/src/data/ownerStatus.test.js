import { test } from "node:test";
import assert from "node:assert/strict";
import { ownerStatus } from "./ownerStatus.js";

test("failed bank review is not presented as a lender evidence request", () => {
  const result = ownerStatus({ status: "assessed", verification_status: "mismatch", latest_verdict: "UNVERIFIED" });
  assert.equal(result.label, "Bank evidence unavailable");
  assert.equal(result.hash, "#owner-evidence");
});

test("owner list and detail give the same next step for a lender request", () => {
  const summary = ownerStatus({ status: "awaiting_evidence", evidence_requested: "gst", effective_action: "request_evidence" });
  const detail = ownerStatus({ application: { status: "awaiting_evidence" }, latest_action: { action: "request_evidence", evidence_type: "gst" } });
  assert.deepEqual(summary, detail);
});

test("stale terms require reassessment before showing a lender action", () => {
  const result = ownerStatus({ application: { status: "submitted", input_revision: 3 }, decision: { input_revision: 2 }, latest_action: { action: "approve" } });
  assert.equal(result.label, "Reassessment pending");
});
