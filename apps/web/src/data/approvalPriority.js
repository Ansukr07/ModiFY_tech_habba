const OFFER_VERDICTS = new Set(["STANDARD", "STEP_UP", "THIN_FILE"]);
const VERDICT_RANK = { STANDARD: 0, STEP_UP: 1, THIN_FILE: 2 };
const VERDICT_REASON = {
  STANDARD: "Standard offer",
  STEP_UP: "Step-up offer",
  THIN_FILE: "Thin-file offer",
};

function compare(a, b) {
  const evidenceHold = (row) => (row.item.effective_action === "request_evidence" ? 1 : 0);
  return evidenceHold(a) - evidenceHold(b)
    || (VERDICT_RANK[a.verdict] ?? 9) - (VERDICT_RANK[b.verdict] ?? 9)
    || (b.item.p_auth ?? -1) - (a.item.p_auth ?? -1)
    || (a.item.p_stress ?? 2) - (b.item.p_stress ?? 2)
    || (b.item.verified_rail_count || 0) - (a.item.verified_rail_count || 0)
    || String(a.item.shop_name || "").localeCompare(String(b.item.shop_name || ""));
}

export function approvalPriority(items) {
  const ranked = items.map((item) => {
    const verdict = item.assessment_stale ? null : item.effective_verdict;
    const amountKnown = Object.prototype.hasOwnProperty.call(item, "principal_paise");
    const amount = item.assessment_stale ? null : item.principal_paise;
    const positiveAmount = amountKnown ? typeof amount === "number" && amount > 0 : OFFER_VERDICTS.has(verdict);
    const open = !item.assessment_stale
      && item.effective_action !== "approve"
      && item.effective_action !== "decline"
      && OFFER_VERDICTS.has(verdict)
      && positiveAmount
      && !item.pdf_only;
    const bankConfirmed = item.verification_status === "verified_simulated";
    const reasons = [];
    if (open) {
      reasons.push(VERDICT_REASON[verdict]);
      if (item.p_auth != null) reasons.push(`${Math.round(item.p_auth * 100)}% authenticity`);
      if (item.p_stress != null) reasons.push(`${Math.round(item.p_stress * 100)}% lean-period stress`);
      reasons.push(item.verified_rail_count === 1 ? "1 verified rail" : `${item.verified_rail_count || 0} verified rails`);
      reasons.push(bankConfirmed ? "bank check confirmed" : "bank check not confirmed");
      if (item.effective_action === "request_evidence") reasons.push("evidence was requested and is still open");
    }
    return { item, ready: open && bankConfirmed, waitingOnBank: open && !bankConfirmed, reasons, verdict, amount: positiveAmount ? amount : null };
  }).filter((row) => row.ready || row.waitingOnBank);
  return {
    ready: ranked.filter((row) => row.ready).sort(compare),
    waitingOnBank: ranked.filter((row) => row.waitingOnBank).sort(compare),
  };
}
