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
| Queue | Shop name/type, request, assessment date, simulated rail count, last observed UPI activity date and observation age in days where dated UPI exists, revision-aware review reason, workflow/verdict filters, oldest-unreviewed and update-time sorting, last-updated date, and a clickable four-state pipeline with mutually exclusive counts; responsive card rows and a seed action; a failed reload keeps the last loaded rows and says so | No policy freshness cutoff or explicit urgency score exists; age is informational. Unverified and stale-assessment cases receive workflow attention. |
| Assessment | Requested and proposed principal, authenticity estimate, lean-period stress proxy, verdict, policy drivers/conditions; five sections; overview summary compares request, policy maximum and proposal on a common rupee scale, shows the counter-offer gap and conditions, repayment terms and a backend-figure payment sequence, effective lender action and model/policy/input revision provenance; missing assessments show **Not assessed** (and **Needs evidence** / **Reassess after evidence update** when those apply) instead of rupee zeros; authenticity/stress metrics say **Not run** until scored; driver order is labelled as payload order, not a materiality ranking | Policy gates/capacity and synthetic model signals now have separate panels with observed inputs, source, direction, and policy thresholds where available. |
| Cashflow | Weekly inflow, outflow and net chart; rupee scale, point tooltips and keyboard focus, zero line, policy-selected weakest four-week highlight, broken line segments at missing calendar weeks, accessible weekly table and always-visible scrollable net-value strip; scorer and chart share calendar-week semantics; capacity board now has a separate retained-share step that names the high-trust gate and the stress/history rule | Live 40% inflow sliders reviewed on clean, PDF-only, mule-like, GST-gap, and twin cases. |
| Trust | Simulated rail count and per-rail type, provenance, added date, identity match, coverage and last-observed date where source records support it; coverage basis is dated transactions for UPI, fixture-declared period for GST, and unknown for AA/PDF; UPI dates come from bank inspect rows or, if those are empty, the shop cashflow series, normalised to ISO days; display age and verified-rail gate effect; GST/UPI values and gap with the v1 35% review threshold; PDF limitation; zero-rail request link; PDF-only queue rows are labelled separately from verified rails | No policy freshness cutoff exists. AA coverage stays unknown because those rails have no dated source rows. |
| Scenario | Inflow and outflow sliders; baseline vs scenario surplus, installment capacity, maximum principal, proposal, verdict and terms; reset, stale-response guard, request debounce, and zero-capacity explanation; missing surplus/capacity values show Unavailable rather than rupee zeros | Only saved decisions can be stressed. Scenario results remain confined to the comparison and do not replace the saved terms view. API tests stress clean, PDF-only, mule, and GST-gap without replacing the saved decision. Live 40% inflow sliders: PDF-only stayed Collect data; mule stayed Decline; GST-gap showed a more negative surplus; clean kirana Offer header stayed Offer while the scenario went Offer→Decline and principal to zero; twins matched that illustrative pattern. |
| Lender actions | Request evidence, reduce principal within current proposal, decline confirmation; effective action shown on refresh with reason/time/reference and previous/new principal for a reduction; owner application detail shows requested type/reason; UPI requests use listed bank-account review; AA, GST, identity, reconciliation, and other requests use listed synthetic fixtures on the same application; owner overview flags lender evidence requests and pending bank review separately, and the application list labels those states; `owner@demo` always binds to fixture user `user-owner` so seeded shops appear in the owner workspace even if an older user row used the same email | No email/SMS; the owner still has to open the workspace. |
| Evidence, report and audit | Portfolio counts with denominators, counts by synthetic archetype (including PDF-only, mule-like, GST-gap hard cases), a two-case synthetic fairness twin comparison showing changed attributes, matched business inputs and differing term rows; live compare after scorer/API restart showed **Terms match in this fixture** with history weeks 12/12 and lean-period net ₹45,360/₹45,360; readable report/print with capacity math and uncalibrated trained-joblib scores when present; chronological audit timeline with optional technical JSON | Twin pass is fixture-only; archetype rows are operating counts, not a holdout or population fairness evaluation. Reports identify decision/action snapshot and disable printing when stale. Predictive and population fairness remain **Not measured**. |

Earlier browser verification found the six seeded cases and all assessment sections. A later live queue inspection found 11 total applications, including owner-created cases, and confirmed the new queue controls render. The detailed live assessment review was interrupted by browser control; the local app and API health endpoints returned successfully afterward. The queue, trust-panel, offer-scale, scenario, driver-panel, report, and audit changes have a production build check; UPI coverage, PDF-only behavior, the same-application owner evidence response, and missing/differing fairness twins have API tests. The assessment, scenario, and report views still need a complete live lender-session review. The scorer already running on port 8000 served an older payload without repayment totals; an isolated run of the current scorer passed the score/report consistency integration test. Some persisted demo decisions were created before repayment fields existed: the terms and policy maximum appeared blank. The assessment now flags such a record and offers a refresh; evidence staleness is checked against the application input revision. Reassessment still depends on the scoring service and a lender action. Override staleness now compares the decision with the application revision, and an API test covers that gate and report freshness metadata. The remaining live review should cover the clean, PDF-only, mule-like, GST-gap, and fairness-twin cases.

The backend already has endpoints for scoring, stress tests, overrides, audit, reports, and fairness. The current UI should use these before new endpoints are invented. Where the present response is too thin, the data contract below states the minimum addition. Policy thresholds are now included in new decision payloads; older saved decisions may show unavailable thresholds until reassessed.

## 3. Lender information architecture

### 3.1 Queue / portfolio view

**Purpose:** Put the next reviewable case in front of the lender and make the state of the portfolio legible.

- Show shop name, business type, requested amount, latest assessment time, current status, verdict, verified-rail count, source-backed last activity date, and one concise review reason. A stale decision is classified as needing reassessment after evidence changes. Do not display only a sliced shop ID as the primary name.
- Group counts into **Needs assessment**, **Needs evidence**, **Ready for review**, and **Reviewed**. These are workflow labels, separate from underwriting verdicts (`UNVERIFIED`, `THIN_FILE`, `STANDARD`, `STEP_UP`, `DECLINE`).
- Filters: workflow state and verdict, with sort by oldest unreviewed first or update time and an explicit last-updated date (implemented); retain search by shop name or application ID.
- Each row shows a plain data label, such as **Synthetic demo · simulated UPI + GST**. A PDF-only case must be visibly distinct from one with verified simulated rails.
- The empty state offers the existing demo seed action. Loading, scoring failure, and partial data states must retain the last usable queue instead of looking like zero applications.

**Queue visualization:** A compact horizontal status breakdown uses exact counts alongside segment labels. It is a navigation aid, not an approval-rate claim. Clicking a segment applies the corresponding filter (implemented). Do not use a pie chart for six seeded cases.

### 3.2 Application overview

**Above the fold:** shop and application identity, synthetic-data label, requested amount, current effective lender state, assessment verdict, proposed principal, and the difference between request and proposal. If the assessment is absent, show **Not assessed** rather than zeros. If data is missing or stale, show **Needs evidence** or **Reassess after evidence update**.

The summary should answer:

1. **Which?** Verdict plus a short reason and blocking conditions.
2. **How much?** Requested amount, supportable maximum, proposed amount, and counter-offer gap in rupees and percent.
3. **On what terms?** Annual rate, tenure, cadence, installment amount, total repayment, and conditions. Distinguish policy-proposed terms from a lender's effective action.

The current summary shows a common rupee scale for requested, policy maximum, and proposed amounts, plus assessment timestamp, model and policy versions, input revision, and a link to lender actions/audit. These are essential when an owner adds evidence after assessment. Keep saved model recommendation visually distinct from the current effective lender action.

## 4. Evidence and visualization requirements

### 4.1 Cashflow and capacity board — highest priority

The current prototype plots weekly inflow, outflow, and **net operating surplus** with a rupee axis and zero line, highlights the exact four calendar weeks selected by policy, breaks lines at missing weeks, and provides an accessible weekly table plus persistent weekly net labels. Keyboard-focusable chart points expose week and rupee value in tooltips. The scorer fills missing calendar weeks with zero activity before computing the rolling window; the chart labels those periods as no records.

Beside the chart, render a capacity calculation waterfall:

`Weakest 4-week net → weekly lean surplus → trust/stress/history retained fraction → maximum affordable installment → maximum principal`

The lender view now shows the weakest four-week net, lean weekly surplus, retained share of that surplus with the high-trust gate and stress/history rule, post-factor maximum installment and reduction amount, uncapped cashflow-based principal ceiling, final policy maximum, request and proposal, ticket-ceiling binding reason, and decline/unverified reason. The backend returns selected calendar week dates, retained-capacity factor and reduction amount, both principal caps, ticket ceiling, and the rail, authenticity, stress, and history inputs that determine the retained factor; the browser must not reconstruct underwriting arithmetic. The summary compares requested, proposed, and maximum amounts on a common scale. A positive-surplus case blocked by the high-trust gate now keeps its measured surplus and has a trust-gate reason instead of the false “zero surplus” reason. The policy unit test verifies that distinction. A scoring integration test now checks that a clean kirana principal is at most the policy maximum and that the report repeats those terms. A live reassessment of Lakshmi Stores showed weakest four-week net ₹45,360 for 2026-01-19 to 2026-02-15, lean surplus ₹11,340, 50% retained share, ₹5,670 weekly installment, and a cashflow ceiling of ₹2,29,934.53 with a ₹2,00,000 proposal.

**Acceptance:** For a known seeded shop, the highlighted lean period matches the policy's selected window; the displayed maximum installment and principal match the decision payload; a negative or absent surplus never appears as positive capacity. A policy test covers negative surplus and the retained-factor/reduction arithmetic.

### 4.2 Trust and provenance board

The current prototype shows type, trust class, provenance, added date, and identity-match state, plus a GST/UPI amount comparison and gap. Show source-backed coverage dates, observation age, eligibility effect, and any available policy threshold. Unknown coverage and thresholds must remain explicit. Explain that a mismatch is a review flag, not proof of fraud. A live GST-gap case showed GST ₹9,00,000 vs UPI ₹3,41,000 (62%) against the v1 35% review threshold after reassessment.

For zero verified rails, show **UNVERIFIED — no full limit**, the specific next evidence needed, and a link to the evidence-request action (implemented). A PDF may be available for context but must never be styled as a verified operational rail or counted toward a full limit. Unknown freshness or identity state is shown as unknown, never assumed passed.

**Acceptance:** A PDF-only fixture displays zero verified rails and zero full-limit proposal; every displayed rail has a visible synthetic/simulated provenance label; mismatches show source values rather than a bare warning.

### 4.3 Decision drivers and uncertainty

The lender view presents up to three returned observed inputs with value, comparison or policy threshold, effect direction, and source. It separates **hard gates** (for example no verified rail) from model signals (`p_auth`, `p_stress`) and deterministic capacity. Use language such as “contributed to review” instead of fraud accusations. Explain `p_stress` as a **synthetic lean-period proxy**, not a calibrated probability of real default; `p_auth` is a synthetic authenticity estimate. Where model versions or evaluation metrics are unavailable, it says so rather than implying validation. The returned driver order is still fixture/model supplied and is not a verified materiality ranking.

**Acceptance:** Each driver can be traced to a displayed source value or a documented policy rule. A case with no score displays the policy reason and `p_stress` as not run, not 0%.

### 4.4 Offer and repayment visualization

Show requested amount, proposed amount, and policy maximum on a common rupee scale. If proposal is below request, state **Counter-offer: ₹X less than requested** and the limiting reason. The proposed-terms view now includes a payment sequence with number of payments, cadence, installment amount, total repayment, total interest, and the v1 policy rate band from the backend, labelled as a placeholder rather than a market benchmark. If no positive offer exists, show the evidence or capacity blocker rather than an empty repayment schedule. Conditions and any step-up trigger must be explicit; a STEP_UP verdict now states that it does not guarantee a higher future limit.

**Acceptance:** Principal never exceeds the backend maximum; amount, cadence, rate, and repayment display are internally consistent; the same figures appear in the downloadable or printable lender report.

### 4.5 Stress-test comparison

Start from the saved base decision. Allow the lender to reduce lean-period inflow and, if supported by the existing endpoint, increase outflow. Show baseline and scenario side by side for surplus, installment capacity, maximum principal, proposed principal, verdict, and terms. Mark every scenario result **Illustrative only — does not change the saved decision**. A reset control returns to the baseline. The UI debounces requests and uses a request sequence so a slow older response cannot replace the newest slider selection.

**Acceptance:** The comparison names the exact input changes; scenario-only data never overwrites the stored decision or audit history; a zero-capacity scenario explains why its principal fell to zero. PDF-only / no-verified-rail cases name the trust gate rather than a false zero-surplus reason.

### 4.6 Portfolio evidence and fairness

Show counts with clear denominators: assessed applications, positive proposals, unverified, declined, and pending. The current `zerocibilFunded` field counts **positive offers**, not funded/disbursed loans; label it accordingly. Baseline comparison may say “no-bureau-file rule: zero eligible in this synthetic sample,” but must not claim observed real-world lending impact.

The fairness view now shows the two business inputs, changed protected-attribute values, verdict and term deltas, and pass/fail. Scored decisions persist a compact `features` snapshot (history weeks, lean-period net, payer share) so the twin check can verify matched business inputs instead of treating missing fields as a failed match. The API refuses missing or stale decisions, and a failed comparison names differing terms. State that this is one synthetic fixture check, not a population-level fairness guarantee. Predictive and population fairness performance are shown as **Not measured** because evaluation artifacts are absent. Keep synthetic metrics separate from operational queue counts.

**Acceptance:** The portfolio labels counts as synthetic with denominators, separates positive offers from disbursals, and a failed twin check identifies differing terms without a fairness pass. A population-level evaluation remains unmeasured.

## 5. Lender actions and audit

- **Run assessment:** allowed after application submission; the button shows Scoring… during the request. Retryable scoring failures tell the lender they can retry; a stale-revision error tells them to refresh this case and run the assessment again. The current input revision is sent with the request.
- **Request evidence:** require a reason and specify missing rail or mismatch. The owner application detail shows the evidence type/reason. A UPI request accepts a listed synthetic bank account and shows pending or completed bank review. AA, GST, identity, reconciliation, and other requests accept a listed synthetic fixture of that type on the same application; the owner cannot set trust class. After the application revision changes, the owner sees the previous assessment as pending reassessment rather than current terms. Bank review returns a verified case to lender assessment and keeps a failed case awaiting evidence. Fixture responses return the case to lender assessment. The owner overview and application list surface awaiting-evidence cases in the workspace; there is still no email or SMS.
- **Reduce terms:** expose the existing API action with proposed principal no greater than policy capacity, plus a reason. Show old and new terms. Never permit the UI to increase a principal past the policy maximum.
- **Decline:** require a reason and confirm before recording; the UI now asks for confirmation. A model verdict is a recommendation; show the lender's final recorded action separately.
- **Audit view:** replace raw JSON with a chronological timeline of assessment, evidence changes, illustrative stress scenarios, and overrides. New entries show actor, time, action, reason, input/evidence revision, policy/model version, available source reference, and audit reference; older events may show unknown fields. Preserve raw JSON only as an optional technical detail. Stress runs are logged as `illustrative_scenario` and do not replace the saved decision.
- **Report:** the readable/printable report now includes uncapped cashflow ceiling, policy ticket ceiling, retained-capacity factor, reduction amount, and post-factor capacity in addition to provenance, evidence, terms, and limitations. The UI invalidates a loaded report after a local override or reassessment, and the report labels its generation time, decision, revision, and effective action. A change in another session still requires a refresh to detect.

**Acceptance:** Refreshing a case preserves the effective action; the latest lender action is distinguishable from the original score; every override links to an audit entry.

## 6. Gaps against the F2 problem statement

| PS need | Current gap | Spec response | Priority |
|---|---|---|---|
| Distinguish healthy from risky with no credit history | Verdict and percentages are visible, but the operational evidence and uncertainty are hard to inspect | Cashflow/capacity board, trust provenance, grounded drivers | P0 |
| Decide **which** businesses get credit | `UNVERIFIED`, `THIN_FILE`, etc. exist, but queue triage and effective lender action are unclear | Workflow states, reasons, evidence request, effective action | P0 |
| Decide **how much** | Proposed principal is shown without a visual bridge from lean surplus to limit | Capacity waterfall and request/proposal/maximum comparison | P0 |
| Decide **on what terms** | The saved offer has a payment sequence and total cost, but the live service may still return old decisions without repayment totals | Keep terms tied to the saved decision; refresh old assessments and verify cadence, affordability, and report consistency | P0 |
| Make the process fairer | Twin check exists, yet a pass can be mistaken for broad fairness evidence; hard-case archetype counts are now visible but are not a population evaluation | Twin comparison with scope note; archetype operating counts; population metrics remain unmeasured | P1 |
| Avoid overcharging good businesses | Policy rate band and total interest are shown, but there is no sourced external rate benchmark | Keep the v1 band labelled as a placeholder; any market comparison still needs a sourced benchmark and matched eligibility | P1 |
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
