export function ownerStatus(record) {
  const application = record.application || record;
  const verification = record.verification?.status || record.verification_status;
  const action = record.latest_action?.action || record.effective_action;
  const requested = record.latest_action?.evidence_type || record.evidence_requested;
  const stale = record.assessment_stale || (record.decision && record.decision.input_revision !== application.input_revision);
  if (application.status === "awaiting_verification" || ["pending_consent", "consent_active", "fetching", "pending"].includes(verification)) return { label: "Bank review pending", next: "Check bank review", hash: "#owner-progress" };
  if (application.status === "awaiting_evidence" && action === "request_evidence") return { label: `Evidence requested${requested ? `: ${requested.toUpperCase()}` : ""}`, next: "Respond to lender", hash: "#owner-evidence" };
  if (["mismatch", "insufficient_evidence", "rejected", "revoked", "expired", "stale"].includes(verification)) return { label: "Bank evidence unavailable", next: "Review bank evidence", hash: "#owner-evidence" };
  if (stale) return { label: "Reassessment pending", next: "View progress", hash: "#owner-progress" };
  if (action === "decline") return { label: "Declined by lender", next: "View decision", hash: "#owner-assessment" };
  if (action === "reduce_terms") return { label: "Terms reduced by lender", next: "View decision", hash: "#owner-assessment" };
  if (action === "approve") return { label: "Lender action recorded", next: "View decision", hash: "#owner-assessment" };
  if (record.decision || record.latest_verdict) return { label: "Assessment ready", next: "View assessment", hash: "#owner-assessment" };
  return { label: "Under review", next: "View progress", hash: "#owner-progress" };
}
