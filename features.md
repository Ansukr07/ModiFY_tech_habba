# Lender-side feature spec

**Product:** ZeroCIBIL  
**Scope:** Lender queue, application assessment, decision evidence, and portfolio evidence  
**Status:** Proposed product spec, checked against the current prototype on 20 November 2026

## 1. Problem and outcome

The official F2 problem statement asks for a fairer way to decide **which** credit-invisible small businesses receive credit, **how much** they receive, and **on what terms**. It explicitly names both owners and lenders. The lender experience must let a reviewer distinguish a healthy shop from a risky or insufficiently evidenced one without inventing a CIBIL score, then explain and record the result. The Track 01 rule permits synthetic data but requires it to be clearly identified.

The lender's primary workflow is: open the queue → triage an application → inspect evidence quality and operating cashflow → run or review the assessment → compare requested and supportable terms → test a lean-period scenario → record a lender action and its reason. A reviewer should be able to answer, from one screen, **why this verdict, why this principal, and why these terms**.

This spec describes the intended behavior. It does not claim that a displayed model probability measures real-world default. All AA, UPI, GST, and cashflow records in the current demo are synthetic or simulated.

## 2. Current prototype inventory

| Area | Present now | Limit to address |
|---|---|---|
| Queue | Applications, requested amount, status/verdict, simulated verified-rail count, seed-and-score action | Shop shown mostly as an ID; no sorting, filtering, urgency, evidence freshness, or reason for review |
| Assessment | Requested and proposed principal, `p_auth`, `p_stress`, verdict, term fields, model drivers, conditions | The capacity calculation and counter-offer are not visually explained; probability labels need stronger interpretation |
| Cashflow | A line of weekly **inflows**, with a lean-inflow slider | No outflows, net surplus, weakest four-week window, labelled axes, time period, or repayment-capacity overlay |
| Trust | Rail type and trust class, PDF warning | No rail-level provenance, reconciliation gap, identity match, freshness, or actionable missing-evidence state |
| Scenario | Backend stress response and scenario principal | Only one slider, no baseline-versus-scenario comparison across terms and capacity; requests can return out of order |
| Lender actions | Request evidence and decline override with a reason | Effective override is not shown as an application state; no reduce-terms control despite API support; no evidence-request lifecycle |
| Evidence and audit | Summary count, twin fairness check, report and audit endpoints | Summary is a single line; report and audit render as raw JSON; twins result gives little context |

The backend already has endpoints for scoring, stress tests, overrides, audit, reports, and fairness. The current UI should use these before new endpoints are invented. Where the present response is too thin, the data contract below states the minimum addition.

## 3. Lender information architecture

### 3.1 Queue / portfolio view

**Purpose:** Put the next reviewable case in front of the lender and make the state of the portfolio legible.

- Show shop name, business type, requested amount, latest assessment time, current status, verdict, verified-rail count, and one concise review reason. Do not display only a sliced shop ID as the primary name.
- Group counts into **Needs assessment**, **Needs evidence**, **Ready for review**, and **Reviewed**. These are workflow labels, separate from underwriting verdicts (`UNVERIFIED`, `THIN_FILE`, `STANDARD`, `STEP_UP`, `DECLINE`).
- Filters: workflow state and verdict. Sort by oldest unreviewed first, with explicit last-updated date. Search by shop name or application ID if the queue grows beyond the seeded demo.
- Each row shows a plain data label, such as **Synthetic demo · simulated UPI + GST**. A PDF-only case must be visibly distinct from one with verified simulated rails.
- The empty state offers the existing demo seed action. Loading, scoring failure, and partial data states must retain the last usable queue instead of looking like zero applications.

**Queue visualization:** A compact horizontal status breakdown uses exact counts alongside segment labels. It is a navigation aid, not an approval-rate claim. Clicking a segment applies the corresponding filter. Do not use a pie chart for six seeded cases.

### 3.2 Application overview

**Above the fold:** shop and application identity, synthetic-data label, requested amount, current effective lender state, assessment verdict, proposed principal, and the difference between request and proposal. If the assessment is absent, show **Not assessed** rather than zeros. If data is missing or stale, show **Needs evidence** or **Reassess after evidence update**.

The summary should answer:

1. **Which?** Verdict plus a short reason and blocking conditions.
2. **How much?** Requested amount, supportable maximum, proposed amount, and counter-offer gap in rupees and percent.
3. **On what terms?** Annual rate, tenure, cadence, installment amount, total repayment, and conditions. Distinguish policy-proposed terms from a lender's effective action.

Show assessment timestamp, model and policy versions, input revision, and a link to the audit trail. These are essential when an owner adds evidence after assessment.

## 4. Evidence and visualization requirements

### 4.1 Cashflow and capacity board — highest priority

Replace the inflow-only sparkline with a labelled weekly chart over the observed history. Plot inflow, outflow, and **net operating surplus** using the same underlying transactions and units; a zero line makes negative weeks clear. Mark the weakest rolling four-week period used by policy. Tooltips or an accessible data table show week start, inflow, outflow, and net in rupees. Show the observation window and number of weeks, including missing weeks explicitly instead of silently connecting across them.

Beside the chart, render a capacity calculation waterfall:

`Weakest 4-week net → weekly lean surplus → trust/stress/history haircut → maximum affordable installment → maximum principal`

Use exact backend values and policy version. If the backend does not return an intermediate value, add it to the decision response; the browser must not reconstruct underwriting arithmetic. Label the installment period accurately (weekly versus monthly), and use the same cadence in chart comparison. Show why capacity reaches zero for a decline or unverified case.

**Acceptance:** For a known seeded shop, the highlighted lean period matches the policy's selected window; the displayed maximum installment and principal match the decision payload; a negative or absent surplus never appears as positive capacity.

### 4.2 Trust and provenance board

Each rail row shows type, trust class, provenance, coverage dates, last updated date, identity-match state, and whether it may affect the limit. Distinguish **simulated verified rail** from **unverified upload** in text, not color alone. Add a reconciliation view for GST versus UPI/bank, with amounts, difference, period, and threshold if the policy uses one. Explain that a mismatch is a review flag, not proof of fraud.

For zero verified rails, show **UNVERIFIED — no full limit** and the specific next evidence needed. A PDF may be available for context but must never be styled as a verified operational rail or counted toward a full limit. Unknown freshness or identity state is shown as unknown, never assumed passed.

**Acceptance:** A PDF-only fixture displays zero verified rails and zero full-limit proposal; every displayed rail has a visible synthetic/simulated provenance label; mismatches show source values rather than a bare warning.

### 4.3 Decision drivers and uncertainty

Present the three most material drivers as grounded rows: observed value, comparison or policy threshold, effect direction, and source. Separate **hard gates** (for example no verified rail) from model signals (`p_auth`, `p_stress`) and deterministic capacity. Use language such as “contributed to review” instead of fraud accusations. Explain `p_stress` as a **synthetic lean-period proxy**, not a calibrated probability of real default; `p_auth` is a synthetic authenticity estimate. Where model versions or evaluation metrics are unavailable, say so rather than imply validation.

**Acceptance:** Each driver can be traced to a displayed source value or a documented policy rule. A case with no score displays the policy reason and `p_stress` as not run, not 0%.

### 4.4 Offer and repayment visualization

Show requested amount, proposed amount, and policy maximum on a common rupee scale. If proposal is below request, state **Counter-offer: ₹X less than requested** and the limiting reason. Include a simple repayment timeline with number of payments, cadence, installment amount, total repayment, and total interest derived by the backend. If no positive offer exists, show the evidence or capacity blocker rather than an empty repayment schedule. Conditions and any step-up trigger must be explicit; do not imply a future limit is guaranteed.

**Acceptance:** Principal never exceeds the backend maximum; amount, cadence, rate, and repayment display are internally consistent; the same figures appear in the downloadable or printable lender report.

### 4.5 Stress-test comparison

Start from the saved base decision. Allow the lender to reduce lean-period inflow and, if supported by the existing endpoint, increase outflow. Show baseline and scenario side by side for surplus, installment capacity, maximum principal, proposed principal, verdict, and terms. Mark every scenario result **Illustrative only — does not change the saved decision**. A reset control returns to the baseline. Debounce or otherwise order requests so a slow older response cannot replace the newest slider selection.

**Acceptance:** The comparison names the exact input changes; scenario-only data never overwrites the stored decision or audit history; a zero-capacity scenario explains why its principal fell to zero.

### 4.6 Portfolio evidence and fairness

Show counts with clear denominators: assessed applications, positive proposals, unverified, declined, and pending. The current `zerocibilFunded` field counts **positive offers**, not funded/disbursed loans; label it accordingly. Baseline comparison may say “no-bureau-file rule: zero eligible in this synthetic sample,” but must not claim observed real-world lending impact.

Fairness twins should show the two matched inputs, the changed protected attribute, verdict and term deltas, and pass/fail. State that this is one synthetic fixture check, not a population-level fairness guarantee. If evaluation artifacts are absent, show **Not measured** for predictive and fairness performance. Keep synthetic metrics separate from operational queue counts.

**Acceptance:** All portfolio claims state sample size and provenance; no chart equates offers to disbursals; a failed twin check identifies the differing term and blocks a “fair” claim.

## 5. Lender actions and audit

- **Run assessment:** allowed after application submission; show progress and recoverable failure. The current input revision must be sent and a stale-revision error must prompt refresh.
- **Request evidence:** require a reason and specify missing rail or mismatch. Record who requested it and when; surface an awaiting-evidence state. The current endpoint stores an override, but the application UI does not expose an effective state or request lifecycle.
- **Reduce terms:** expose the existing API action with proposed principal no greater than policy capacity, plus a reason. Show old and new terms. Never permit the UI to increase a principal past the policy maximum.
- **Decline:** require a reason and a clear confirmation of the effective action. A model verdict is a recommendation; show the lender's final recorded action separately.
- **Audit view:** replace raw JSON with a chronological timeline of assessment, evidence changes, scenarios if intentionally logged, and overrides. Each entry shows actor, time, action, reason, input revision, policy/model version, and audit reference. Preserve raw JSON only as an optional technical detail.
- **Report:** render a readable report with provenance, key evidence, capacity math, proposed terms, lender action, and limitations. A report generated before a later override must not appear to be the current final state.

**Acceptance:** Refreshing a case preserves the effective action; the latest lender action is distinguishable from the original score; every override links to an audit entry.

## 6. Gaps against the F2 problem statement

| PS need | Current gap | Spec response | Priority |
|---|---|---|---|
| Distinguish healthy from risky with no credit history | Verdict and percentages are visible, but the operational evidence and uncertainty are hard to inspect | Cashflow/capacity board, trust provenance, grounded drivers | P0 |
| Decide **which** businesses get credit | `UNVERIFIED`, `THIN_FILE`, etc. exist, but queue triage and effective lender action are unclear | Workflow states, reasons, evidence request, effective action | P0 |
| Decide **how much** | Proposed principal is shown without a visual bridge from lean surplus to limit | Capacity waterfall and request/proposal/maximum comparison | P0 |
| Decide **on what terms** | Rate, tenure, cadence, and repayment are listed, but affordability and total cost are not explained together | Repayment view with schedule and total cost | P0 |
| Make the process fairer | Twin check exists, yet a pass can be mistaken for broad fairness evidence; no visible review of false positives on legitimate hard cases | Twin comparison with scope note; later evaluation by archetype and protected groups where lawful and available | P1 |
| Avoid overcharging good businesses | No baseline rate or total-cost comparison, so the UI cannot demonstrate that good businesses are offered fairer pricing | Show policy rate band and cost; any external rate comparison requires a sourced benchmark and matched eligibility | P1 |
| Working prototype with labelled synthetic data | Some labels exist, but the assessment header, chart, report, and derived metrics can lose that context | Persistent synthetic/simulated labels on every relevant view and export | P0 |
| Lender accountability | Audit/report endpoints exist, but raw JSON is difficult to use and overrides are not clearly effective | Action state, timeline, readable report | P1 |

The PS does **not** require production lending, real AA/GST integrations, automated disbursal, or a real default model. Those are deployment work, not promises of this prototype.

## 7. Minimum data contract and implementation order

Use the existing `/api/applications`, `/:id`, `/:id/score`, `/:id/stress`, `/:id/override`, `/:id/audit`, `/:id/report`, `/api/evidence/summary`, and `/api/evidence/fairness` routes. Extend responses only for facts the current API cannot provide:

1. **Decision:** lean-period start/end, inflow/outflow/net, haircut and its reasons, capacity per cadence, maximum principal, proposed repayment total, model/policy versions, and source references. The scoring service remains the source of underwriting math.
2. **Rails:** coverage/freshness, identity state, and reconciliation amounts/period. Never expose a client-asserted “verified” value as verified evidence.
3. **Application/workflow:** latest effective override or action, action time, and evidence-request status; keep scored verdict separate.
4. **Portfolio:** shop display name and last-assessed time in queue summaries; counts with denominators and provenance.

Build in this order: **P0** cashflow/capacity explanation, provenance, offer comparison, and effective state; then **P1** queue triage, stress comparison, readable audit/report, and fairness/evidence views. Validate each view against the seeded clean, PDF-only, mule-like, GST-gap, and fairness-twin cases. The acceptance checks above are the feature checks; avoid duplicating policy calculations in frontend tests.

## Sources checked

- `The_Big_Hack_2.0_Problem_Statements.pdf`, Finance F2, page 5; Track 01 rule, page 3.
- `spec.md`, product and underwriting goals.
- `apps/web/src/pages/LenderDesk.jsx` and `LenderQueue.jsx`, current lender screens.
- `apps/api/src/createApp.js`, current API routes and persistence behavior.
