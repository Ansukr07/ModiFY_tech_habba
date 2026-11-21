# ZeroCIBIL — future feature spec

**Purpose:** Make the synthetic hackathon journey easier for small business owners and lender reviewers, then identify what a real pilot would require. This is a target spec, not a claim that these features are implemented.

## Product guardrails

- Serve credit-invisible Indian MSMEs and human lender reviewers. Keep the decision sequence: verify operating evidence, assess lean-period repayment capacity, then propose an amount and terms.
- Label every demo account, transaction, bank check, model output, and report as synthetic or simulated. A PDF remains supporting evidence, never a verified rail.
- Show a policy recommendation separately from the lender's recorded action. Never describe an offer as an approved or disbursed loan.
- Do not present uncalibrated model outputs as real default or fraud probabilities. Do not use CIBIL as a hidden fallback.

## Demo priority: owner experience

| Feature | User need and behavior | Acceptance for the demo |
| --- | --- | --- |
| Guided application | Explain the steps, required business details, and what each evidence source contributes in plain language. Show progress and allow the owner to revisit a submitted application. | An owner can start, submit, and find an application without lender terminology; missing fields have specific recovery messages. |
| Evidence checklist | Show which simulated AA, UPI, GST, and bank evidence is available, pending, rejected, or requested, with the reason and next action. | A lender request links to the exact application and evidence response; a rejected bank check offers a way to retry or choose another listed account. |
| Decision explanation | Translate the assessment into observed strengths, concerns, requested amount, supportable amount, payment cadence, total repayment, and next step. | A thin or unverified case never displays a zero-rupee “offer”; a changed evidence revision clearly marks earlier terms as stale. |
| Owner cashflow view | Show weekly money in, money out, and the weakest period using rupees and dates. Explain how the weak period affects affordable installments. | The chart has a readable table and works on a small screen; gaps in data are visible rather than filled with invented values. |
| Status and follow-up | Show a simple timeline: submitted, awaiting evidence or bank review, under lender review, and lender action. Surface what the owner can do next. | Status in the application list and detail agrees with the saved workflow state after refresh. |
| Language and accessibility | Use short labels, readable rupee values, keyboard access, and a mobile layout suited to shop owners. Add Hindi copy as a scoped demo option only if it can cover the full application and decision journey. | Core actions work by keyboard and at phone width; no untranslated mix of languages in a selected journey. |

## Demo priority: lender experience

| Feature | User need and behavior | Acceptance for the demo |
| --- | --- | --- |
| Review queue | Sort and filter by workflow state, missing evidence, stale assessment, and last update; show clear review reasons. | A reviewer can find an evidence response and reassess it without hunting through unrelated cases. |
| One-page case summary | Put requested amount, verified rail status, lean-period capacity, policy proposal, uncertainty, and owner follow-up in one scan. Link to source details. | Every displayed recommendation has its input revision and policy version; unavailable data says “Unavailable.” |
| Evidence provenance | Show source, identity match, observation period, freshness, and GST/UPI reconciliation. Separate verified, simulated, and uploaded PDF evidence. | Mismatched periods cannot produce a misleading GST/UPI percentage; a PDF-only case cannot pass the verified-rail gate. |
| Terms and scenario comparison | Compare requested, policy maximum, and proposed principal; show installment, cadence, rate, total cost, and a lean-period stress scenario. | Scenario results are visibly illustrative and never overwrite a saved decision or report. |
| Decision controls | Let a reviewer request specific evidence, reduce within the policy ceiling, or decline with a reason. Require a fresh assessment after evidence changes. | Actions reject stale revisions; the saved action, rationale, and old/new terms survive refresh. |
| Report and audit | Provide a readable export and timeline of evidence, scoring, scenarios, and reviewer actions. | Export names the exact decision, effective action, revision, and generation time; stale exports require refresh. |
| Portfolio evidence | Show counts by workflow and synthetic archetype, plus the matched fairness-twin example. | Counts have denominators; fixture equality is described as a demo check, not population fairness evidence. |

## After the hackathon: pilot requirements

| Area | Required capability before a real pilot |
| --- | --- |
| Owner consent and data connections | Authorized AA/UPI/GST connections, identity binding, consent scope and revocation, source references, and retention/deletion rules. |
| Notifications | Opt-in owner alerts for evidence requests and decision changes with delivery state and privacy-safe previews. |
| Lender operations | Assignment, queue pagination, review service levels, duplicate-case handling, and maker/checker controls where the lending partner requires them. |
| Policy and model validation | Versioned freshness and period-alignment rules; calibrated thresholds using consented MSME outcomes; holdout, subgroup, drift, and hard-case evaluation. |
| Security and reliability | Authenticated service calls, tenant isolation, durable atomic decision/audit writes, idempotent retries, monitoring, backups, and access logs. |
| Lending lifecycle | Partner-approved final decision, agreements and consent, disbursal, repayment servicing, reconciliation, complaints, and applicable regulatory review. |

## Suggested demo walkthrough

1. An owner submits a synthetic kirana application and sees evidence status and cashflow in everyday terms.
2. A lender compares the request with verified evidence, weak-period capacity, and proposed terms; then runs an illustrative stress scenario.
3. The lender requests evidence on a thin case. The owner responds on the same application; the lender reassesses the new revision and records an action.
4. Show a PDF-only case and a mismatch case to explain why evidence quality matters. End with the saved report, audit trail, and clearly scoped fairness-twin comparison.

**Implementation order:** Complete the existing end-to-end and report-freshness gaps in `features-spec.md` first. Add the owner and lender demo improvements above using current routes and components where possible. Treat the pilot table as a separate release gate.
