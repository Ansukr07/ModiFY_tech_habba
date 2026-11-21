export function repaymentTerms(principal, periods, rateBps, cadence) {
  if (!Number.isSafeInteger(principal) || principal <= 0 || !Number.isInteger(periods) || periods <= 0 || !Number.isInteger(rateBps) || rateBps < 0 || !["weekly", "monthly"].includes(cadence)) throw new Error("Invalid repayment terms");
  const rate = rateBps / 10000 / (cadence === "weekly" ? 52 : 12);
  const installment = Math.max(Math.ceil(principal / periods), Math.round(rate === 0 ? principal / periods : principal * rate / (1 - (1 + rate) ** -periods)));
  const total = installment * periods;
  if (!Number.isSafeInteger(total) || total < principal) throw new Error("Invalid repayment total");
  return { principal_paise: principal, repayment_amount_paise: installment, repayment_periods: periods, total_repayment_paise: total, total_interest_paise: total - principal };
}
