# Lender-side feature spec

**Product:** ZeroCIBIL  
**Scope:** Lender queue, application assessment, decision evidence, and portfolio evidence  
**Status:** Detailed target spec with current implementation gaps, checked against the lender prototype on 20 November 2026

## 1. Problem and outcome

The official F2 problem statement asks for a fairer way to decide **which** credit-invisible small businesses receive credit, **how much** they receive, and **on what terms**. It explicitly names both owners and lenders. The lender experience must let a reviewer distinguish a healthy shop from a risky or insufficiently evidenced one without inventing a CIBIL score, then explain and record the result. The Track 01 rule permits synthetic data but requires it to be clearly identified.

The lender's primary workflow is: open the queue → triage an application → inspect evidence quality and operating cashflow → run or review the assessment → compare requested and supportable terms → test a lean-period scenario → record a lender action and its reason. A reviewer should be able to answer, from one screen, **why this verdict, why this principal, and why these terms**.

This spec describes the intended behavior. It does not claim that a displayed model probability measures real-world default. All AA, UPI, GST, and cashflow records in the current demo are synthetic or simulated.

## 2. Current prototype inventory

| Area | Present now | Limit to address |
|---|---|---|
| Queue | Shop name/type, request, assessment date, simulated rail count, review reason, workflow/verdict filters and a six-case pipeline summary; responsive card rows and a seed action | No explicit sorting or urgency, freshness/coverage signal, last-updated time, or clickable pipeline segments. Assessment status and verdict filters are separate. |
| Assessment | Requested and proposed principal, authenticity estimate, lean-period stress proxy, verdict, policy drivers/conditions; five sections; overview summary compares request, policy maximum and proposal, shows the counter-offer gap and conditions, repayment terms, effective lender action and model/policy/input revision provenance | No distinct hard-gate vs model-signal grouping; comparison is numeric cards rather than a proportional rupee scale. |
| Cashflow | Weekly inflow, outflow and net chart; rupee scale, point tooltips and keyboard focus, zero line, policy-selected weakest four-week highlight, broken line segments at missing calendar weeks, accessible weekly table; scorer and chart share calendar-week semantics | Waterfall can make the request/proposal/final maximum comparison more prominent; chart still has no persistent per-point value labels when not hovered/focused. |
| Trust | Simulated rail count and per-rail type, provenance, added date and identity match; GST/UPI values and gap; PDF limitation | Coverage dates, freshness, eligibility effect and mismatch threshold are missing; zero-rail evidence request is not guided from the evidence panel. |
| Scenario | Inflow and outflow sliders; baseline vs scenario surplus, installment capacity, maximum principal, proposal, verdict and terms; reset and stale-response guard | No explicit zero-capacity explanation; only saved decision can be stressed; slider changes issue requests immediately. |
| Lender actions | Request evidence, reduce principal within current proposal, decline confirmation; effective action shown on refresh with reason/time/reference and previous/new principal for a reduction; owner can resubmit a listed synthetic account for review on the same application; verified bank review returns the case to lender assessment and a failed review returns it to awaiting evidence | No asynchronous notification; only the existing synthetic bank-account review route is available as an evidence response, so UPI/GST/identity-specific response workflows remain incomplete. |
| Evidence, report and audit | Portfolio counts, synthetic fairness twin comparison and delta rows; readable report/print with capacity math; chronological audit timeline | Twin pass is fixture-only; report can be stale after a later override; audit omits some requested actor/version/source detail; metrics and baseline are not evaluation-grade. |

The current browser verification previously found six seeded cases and all assessment sections render. Some persisted demo decisions were created before repayment fields existed: the terms and policy maximum appeared blank. The assessment now flags such a record and offers a refresh; this behavior still depends on the scoring service being available and a lender invoking reassessment. Current visual changes have build and policy-test evidence, but need another live lender-session review.

The backend already has endpoints for scoring, stress tests, overrides, audit, reports, and fairness. The current UI should use these before new endpoints are invented. Where the present response is too thin, the data contract below states the minimum addition.

## 3. Lender information architecture

### 3.1 Queue / portfolio view

**Purpose:** Put the next reviewable case in front of the lender and make the state of the portfolio legible.

- Show shop name, business type, requested amount, latest assessment time, current status, verdict, verified-rail count, and one concise review reason. Do not display only a sliced shop ID as the primary name.
- Group counts into **Needs assessment**, **Needs evidence**, **Ready for review**, and **Reviewed**. These are workflow labels, separate from underwriting verdicts (`UNVERIFIED`, `THIN_FILE`, `STANDARD`, `STEP_UP`, `DECLINE`).
- Filters: workflow state and verdict (implemented). Add sort by oldest unreviewed first and explicit last-updated date; retain search by shop name or application ID.
- Each row shows a plain data label, such as **Synthetic demo · simulated UPI + GST**. A PDF-only case must be visibly distinct from one with verified simulated rails.
- The empty state offers the existing demo seed action. Loading, scoring failure, and partial data states must retain the last usable queue instead of looking like zero applications.

**Queue visualization:** A compact horizontal status breakdown uses exact counts alongside segment labels. It is a navigation aid, not an approval-rate claim. Clicking a segment applies the corresponding filter. Do not use a pie chart for six seeded cases.

### 3.2 Application overview

**Above the fold:** shop and application identity, synthetic-data label, requested amount, current effective lender state, assessment verdict, proposed principal, and the difference between request and proposal. If the assessment is absent, show **Not assessed** rather than zeros. If data is missing or stale, show **Needs evidence** or **Reassess after evidence update**.

The summary should answer:

1. **Which?** Verdict plus a short reason and blocking conditions.
2. **How much?** Requested amount, supportable maximum, proposed amount, and counter-offer gap in rupees and percent.
3. **On what terms?** Annual rate, tenure, cadence, installment amount, total repayment, and conditions. Distinguish policy-proposed terms from a lender's effective action.

The current summary shows assessment timestamp, model and policy versions, input revision, and a link to lender actions/audit. These are essential when an owner adds evidence after assessment. Keep saved model recommendation visually distinct from the current effective lender action.

## 4. Evidence and visualization requirements

### 4.1 Cashflow and capacity board — highest priority

The current prototype plots weekly inflow, outflow, and **net operating surplus** with a rupee axis and zero line, highlights the exact four calendar weeks selected by policy, breaks lines at missing weeks, and provides an accessible weekly table. Keyboard-focusable chart points expose week and rupee value in tooltips. The scorer fills missing calendar weeks with zero activity before computing the rolling window; the chart labels those periods as no records.

Beside the chart, render a capacity calculation waterfall:

`Weakest 4-week net → weekly lean surplus → trust/stress/history haircut → maximum affordable installment → maximum principal`

The lender view now shows the weakest four-week net, lean weekly surplus, post-haircut maximum installment and amount, uncapped cashflow-based principal ceiling, final policy maximum, request and proposal, ticket-ceiling binding reason, and decline/unverified reason. The backend returns selected calendar week dates, haircut factor and amount, both principal caps, and ticket ceiling; the browser must not reconstruct underwriting arithmetic. Continue refining the visual sequence to compare requested, proposed, and maximum amounts prominently and label cadence accurately.

**Acceptance:** For a known seeded shop, the highlighted lean period matches the policy's selected window; the displayed maximum installment and principal match the decision payload; a negative or absent surplus never appears as positive capacity.

### 4.2 Trust and provenance board

The current prototype shows type, trust class, provenance, added date, and identity-match state, plus a GST/UPI amount comparison and gap. Add coverage dates, freshness, eligibility effect, and any policy threshold. Explain that a mismatch is a review flag, not proof of fraud.

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
- **Request evidence:** require a reason and specify missing rail or mismatch. The owner application detail shows the evidence type/reason and can submit a listed synthetic account for review on that same application. Bank review returns a verified case to lender assessment and keeps a failed case awaiting evidence. Add notification and response workflows for the other requested evidence types; preserve explicit reassessment after the evidence revision changes.
- **Reduce terms:** expose the existing API action with proposed principal no greater than policy capacity, plus a reason. Show old and new terms. Never permit the UI to increase a principal past the policy maximum.
- **Decline:** require a reason and confirm before recording; the UI now asks for confirmation. A model verdict is a recommendation; show the lender's final recorded action separately.
- **Audit view:** replace raw JSON with a chronological timeline of assessment, evidence changes, scenarios if intentionally logged, and overrides. Each entry shows actor, time, action, reason, input revision, policy/model version, and audit reference. Preserve raw JSON only as an optional technical detail.
- **Report:** the readable/printable report now includes uncapped cashflow ceiling, policy ticket ceiling, haircut and post-haircut capacity in addition to provenance, evidence, terms, and limitations. A report generated before a later override must not appear to be the current final state.

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

Build in this order: **P0 remaining** missing-week/axis clarity, capacity explanation, offer comparison, rail coverage/freshness, and evidence-request lifecycle; then **P1** queue sort/urgency, pipeline interactions, confirmation and old/new action comparisons, report freshness, audit provenance, and robust fairness/evidence evaluation. Validate each view against seeded clean, PDF-only, mule-like, GST-gap, and fairness-twin cases. The acceptance checks above are the feature checks; keep underwriting arithmetic in the scoring service.

## Sources checked

- `The_Big_Hack_2.0_Problem_Statements.pdf`, Finance F2, page 5; Track 01 rule, page 3.
- `spec.md`, product and underwriting goals.
- `apps/web/src/pages/LenderDesk.jsx` and `LenderQueue.jsx`, current lender screens.
- `apps/api/src/createApp.js`, current API routes and persistence behavior.
