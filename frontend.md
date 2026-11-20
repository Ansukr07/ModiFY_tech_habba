# ZeroCIBIL frontend specification

**Status:** Implementation plan, not a claim that these features are already connected.
**Authority:** [spec.md](spec.md) defines product and underwriting; [design.md](design.md) defines visual design. API contracts are in [backend.md](backend.md). If these plans conflict with either source, the source wins.

**Current frontend state:** The React app has a landing → workspace entry → owner draft or lender queue flow. Workspace selection is stored only in the browser and is not authentication. Owner details are saved as a local draft; application submission and account sessions await the backend. The lender queue and assessment still use explicitly synthetic fixtures. `/status/:id` and `/evidence` have been removed from the current navigation; their API-backed capabilities remain future requirements below.
The seed charts contain 6–12 weekly samples; the future 90-day board requires daily source records from the backend.

## 1. Purpose and boundaries

Build a two-sided React application for credit-invisible MSMEs: owners submit operational evidence and understand their status; lenders inspect authenticity, lean-period capacity, proposed terms, and evidence. Auditor/policy users inspect decision history and fairness through lender-authorized read views in the demo; no separate auditor login is required by the source.

Use the existing React, Vite, React Router, CSS tokens, pages, `Shell`, and `Mark`. Existing routes are the starting structure, not evidence that API integration is complete. Keep feature engineering, predictions, policy arithmetic, fairness comparisons, and authoritative money calculations on the backend.

All v1 financial rails and evaluation results are synthetic. Every screen must say **Synthetic demo data**, and each cashflow block must carry its own Synthetic label. A simulated verified rail is never described as a live AA/GST connection. No CIBIL input, invented score, loan disbursal, production identity integration, or LLM approval.

## 2. Navigation and screen contracts

| Route | Audience and purpose | Primary action | API dependencies |
|---|---|---|---|
| `/` | Demo role entry; explain synthetic data and no-bureau underwriting | Enter as owner or lender | `POST /api/auth/login`, `GET /api/me` |
| `/apply` | Owner profile → rails → requested amount → review | Submit application | `POST /api/shops`, `GET /api/shops/:id`, `POST /api/shops/:id/rails`, `POST /api/applications` |
| `/status/:id` | Owner-readable status, terms, next evidence needed | Provide requested evidence / return to application flow | `GET /api/applications/:id`, rail submission |
| `/queue` | Lender thin-file queue and seed gallery | Open application | `GET /api/applications` |
| `/application/:id` | Lender trust, cashflow, capacity, terms, scenario, explanation, history | Score application; then review outcome | Application/shop/cashflow reads; score, stress, override, audit, fairness, report endpoints |
| `/evidence` | Lender/policy synthetic evaluation and fairness | Inspect baseline and model evidence | `GET /api/evidence/summary`, `POST /api/evidence/fairness` |

Gate role links using the current session; API authorization remains mandatory. Owners cannot open the lender queue or another owner's application. Preserve the intended route after demo login. Unknown routes return to the entry screen. Include Apply, Queue, and Evidence only for authorized roles, plus a clear current-role indicator.

## 3. Owner experience

### Application

Use a single column, maximum 640px, with explicit steps and a persistent summary of completed information. Collect shop identity/name, business type, operating history, relevant VPA/GSTIN identity details, and a positive requested amount. No bureau field. Gender or area must not be collected as underwriting inputs; protected flags belong only to isolated fairness fixtures.

Show **No credit bureau file — underwriting from operations.** Explain why each rail is needed before the action:

| Rail | Visible label | Credit-limit role |
|---|---|---|
| AA JSON | Verified (simulated Account Aggregator) | Eligible operational evidence |
| UPI merchant / QR | Verified (simulated UPI) | Must belong to this shop |
| GSTIN + GSTR-1/3B summary | Verified (simulated GST) | Reconciliation and operational evidence |
| Udyam | Supporting identity evidence | Identity only |
| Bank PDF, photo, Excel, typed total | Unverified upload — does not set credit limit | Supporting review; cannot unlock full limit |

Trust labels come from the server, never a client-selected `verified` checkbox. Use supplied synthetic fixtures for simulated rail connections. Unsupported/corrupt evidence gets a specific error and does not count as a completed connection. Submission review displays identity, attached rails with trust class, amount, and synthetic disclaimer; preserve entered values on recoverable failures. Disable repeat submission while pending and reuse the same submission idempotency key on retry.

### Owner status

Separate workflow status (submitted, assessing, assessed, needs review, failed) from the policy verdict. A proposed offer is subject to lender review, never “loan paid” or “guaranteed approval.” Show proposed principal, repayment amount with its cadence, annual rate/band, tenure, conditions, and counteroffer when present. Hide offer numbers when no valid terms exist.

For `UNVERIFIED`, say what evidence is missing and how to provide it. For short history, explain the uncertainty calmly. For `DECLINE`, show grounded reasons and a correction/review path without calling the owner fraudulent. A verification request identifies the rail, discrepancy, and requested evidence. Resubmit evidence through the existing application/shop flow; the lender re-scores the same application. No fabricated correction submission or silent automatic approval.

## 4. Lender experience

### Queue and seed gallery

Show shop, submitted time, requested amount, workflow state, policy verdict if assessed, verified rail count, and synthetic provenance. Provide status filtering and server pagination with empty/error states. Use readable rows with a named Open application link, not click-only containers. No bureau score column.

Provide seeded applications for clean kirana, PDF-only, mule-like, GST mismatch, fairness twins, and volatile genuine UPI/short history. Distinguish synthetic scenario names from accusations about real applicants. Include new genuine, cash-heavy, festival seasonal, one legitimate dominant customer, temporary-spike, and delayed-GST cases in evidence/failure analysis.

### Assessment desk

Read order is **who and provenance → trust → observed capacity → proposed terms → explanation and action**. Header contains shop name, no-bureau banner, Synthetic badge, assessment timestamp, and version/reference link.

At viewport widths ≥1200px, use three columns: trust | cashflow | terms. Below that, stack in the same order. Keep a maximum content width of 1120px. Do not shrink tables or numbers to fit columns; allow sections to stack before information becomes cramped.

1. **Trust:** Each rail's identity match, freshness, source and trust class; `p_auth`, authenticity band, and flags. Show concentration, round-amount, replay, and GST discrepancy facts with observed values. High inflow is not sufficient proof. No verified rail means collect data; do not show a full-limit offer.
2. **Cashflow:** 90-day history, weekly inflow/outflow, highlighted weakest four-week window, and accessible tabular equivalent. Distinguish missing history from zero trading. Show worst four-week net, its weekly equivalent, haircut, maximum weekly repayment, and capacity returned by the server. Explain synthetic stress probability against the reference EMI; it is not real default probability.
3. **Terms:** Policy verdict, offered principal as the focal number, requested vs maximum principal, counteroffer explanation, tenure, rate/band, cadence, repayment amount, conditions, and schedule. Clearly label weekly vs monthly values. Optional step-up includes initial amount, N on-time weeks, and server-defined conditions; it is not an unconditional future limit.

Below the decision row, show top three drivers (name, observed value, comparison, direction, source/version), owner/lender explanations, verification requests, and the audit timeline. Expand detailed features, hashes, and model metadata only on request so they do not compete with the decision.

### Stress scenario

Use a labelled lean-inflow percentage slider plus an optional outflow percentage control; bounds come from the API policy metadata. Include a keyboard-operable numeric input and Reset. Debounce changes and discard stale responses. Send only scenario assumptions and the base decision ID to `POST /api/applications/:id/stress`.

Display base and scenario capacity/terms together with **Scenario only — does not change the recorded decision**. State **No retraining; deterministic capacity recalculation**. Preserve base probabilities and clearly show they were not re-scored. During updates show pending state; on failure keep the base assessment and mark the scenario unavailable rather than showing stale results as current.

### Override, fairness, and report

- Override requires a reason and selected action; proposed adjusted terms must remain within hard gates and capacity. Show original and lender action separately, actor/time, and audit reference. Rejected overrides explain the violated rule. Await persisted confirmation before claiming success.
- Fairness shows twin IDs, changed protected flag, and side-by-side verdict/principal/rate/tenure/cadence. Acceptance is ₹0 principal delta and no term or verdict difference. Show failed/unavailable honestly; never hard-code a green pass.
- An underwriting report (P1) opens a read view assembled from persisted assessment, rail provenance, capacity, drivers, versions, conditions, and audit reference. Use browser printing for a downloadable report; no new PDF service is required.

## 5. Evidence dashboard

Lead with baseline **no CIBIL → decline: 0 funded**, alongside ZeroCIBIL's computed offered/funded-count proxy and synthetic stress among those offers. Explain that these are simulated offers, not actual disbursals or observed defaults. Display denominator, holdout size, class balance, generator/model/policy versions, and evaluation time. Do not invent a performance percentage when reports are missing.

Include Model A suspicious-class precision/recall/F1, ROC-AUC and confusion matrix; Model B precision/recall/F1, ROC-AUC, PR-AUC where appropriate, Brier/calibration and confusion matrix. Show results by archetype, FP/FN examples, and limitations for legitimate hard cases. Include fairness twin results. Optional median-inflow baseline is labelled separately. Technical metrics use progressive disclosure beneath the product comparison.

## 6. Visual hierarchy and typography

Use [design.md](design.md) and `apps/web/src/styles/tokens.css`; preserve the paper, ink, lilac identity and four-square mark. Product screens use **Operate** mode: clarity and task completion lead the composition.

| Role | Specification | Usage |
|---|---|---|
| Page heading | Source Serif 4, 600, 40–48px, −0.03em tracking | One `h1` per page; scale down on narrow screens |
| Section heading | Source Serif 4, 600, 28px | Trust, cashflow, terms, evidence sections |
| Offer amount | Source Serif 4, 600; responsive, never clipped | One dominant financial figure |
| Body | Sora 400, 16px, 1.5 line height | Explanations and form help |
| Labels/actions | Sora 500–600 | Concise sentence case |
| Secondary details | Sora 400, 13px | Sources and timestamps |
| Rail microbadge | Sora, 11px, 0.08em tracking | Uppercase only for rail badges |
| Financial rows | Sora with tabular numerals | Right-aligned amounts, comparable precision |

Load fonts once in the app shell, with Georgia/serif and system sans fallbacks. The display offer may use serif while comparable rows use tabular Sora. Format INR with Indian digit grouping using `Intl.NumberFormat('en-IN', ...)`; display paise only where needed and never round an unsafe offer upward. Dates include an explicit timezone when relevant.

Use whitespace and type before borders: 8px spacing rhythm; close labels to their values, larger gaps between sections. Page padding 24–40px desktop, approximately 16px mobile. Black pill primary action, white outlined secondary, quiet text tertiary; one visually dominant action per section/state. Do not present Score and Override as equal competing actions.

Paper `#FFFFFF`, alternate band `#F6F6F4`, ink `#111111`, secondary `#5C5C5C`, hairline `#E8E8E4`. Lilac `#C4B5FD` is data emphasis, pale lilac `#EDE9FE` is a selected surface, deep lilac `#7C5CBF` may support readable text after contrast verification. Green `#147A3A` means inflow; loss `#B42318` and warn `#9A6700` have semantic uses, never colour-only meaning.

Cards use one elevation, 20–24px radius, 1px border, the existing soft shadow; no nested card stacks or coloured left borders. Inputs have 14px radius and 12px/14px padding. Buttons are approximately 44px tall (40px in dense lender tables). Use single-weight SVG icons and text labels. No emoji UI, gradient text, neon/dark finance chrome, decorative eyebrow labels, stock bankers, or electric-blue rebrand.

| Verdict | Visual text treatment |
|---|---|
| `STANDARD` | Black pill “Offer” |
| `THIN_FILE` | Pale-lilac pill “Thin file” |
| `UNVERIFIED` | Yellow “Collect data” with next action |
| `DECLINE` | Outline “Decline” plus explanation |
| `STEP_UP` | Black outline “Step-up” plus conditions |

## 7. Accessibility and operational states

- Semantic landmarks, ordered headings, skip link, labelled fields, inline errors connected with `aria-describedby`, keyboard access and visible 2px ink focus ring with 2px offset. Error summary links to invalid fields; never rely on placeholder labels.
- Body contrast ≥4.5:1, essential control/graphic boundaries ≥3:1; no small pale-lilac text on white. Status includes text. Charts have summaries, dates/units, accessible data tables, and no hover-only facts.
- Pending submissions announce progress; completed assessment/scenario changes use polite live regions. Do not announce every animation frame. Move focus appropriately on route changes and after validation errors; dialogs restore focus to their trigger.
- Narrow screens preserve content order, use full-width controls, and provide labelled horizontal scrolling only for genuinely wide tables. Check at 360px and at 200% zoom. Touch controls have adequate target size and spacing.
- One optional offer count-up after a successful score; route fades at most 180ms. Respect reduced motion and keep accessible text at the final value. No animated offer on error or missing terms.
- Handle loading, empty, forbidden/not found, stale decision, validation error, network timeout, parser failure, model unavailable, and audit incomplete distinctly. Never convert infrastructure failure into a loan decline. Keep existing persisted data visible with its timestamp when refresh fails.

## 8. Integration and delivery checks

Public API inventory and payload authority live in [backend.md](backend.md), including proposed fairness/audit/report additions. Route/page components own screen state; reuse small shared provenance/status/terms presentations where repeated. Keep local seed fixtures explicitly marked as demo fallback and never silently replace failed API results with successful seed decisions.

P0 delivery: owner apply/status, queue, clickable lender desk, both model outputs, verified-rail gate, capacity/terms/counteroffer, stress slider, drivers, provenance, baseline evidence, twins, score/override audit visibility. P1: richer authenticity investigation and grounded report. Optional: step-up and SHAP; later concepts are listed in the backend scope without implying MVP delivery.

Acceptance:

- Complete clean-kirana → owner submit → lender score → owner status using persisted data. Requested ₹2 lakh may yield a smaller capacity-based counteroffer.
- PDF-only never shows STANDARD/full limit; missing identity, mismatch, no surplus, and short genuine history have distinct handling.
- Slider lowers capacity under a worsening scenario, does not retrain or overwrite the base decision, and handles rapid changes safely.
- Twins show identical complete terms; evidence uses computed synthetic holdout reports and denominator.
- Score/override each expose an audit reference; errors do not show a false success or fabricated numbers.
- Review desktop and narrow screen hierarchy, keyboard-only flow, focus, contrast, chart alternatives, reduced motion, font fallback and long/absent values. Run the existing web build after implementation; these document changes alone do not certify the UI.

## 9. Policy decisions builders must not invent

The source leaves the max ticket (₹50k–₹3 lakh range), exact haircut table, numeric annual rates, history cutoffs, tiny test-limit exception, and step-up conditions unresolved. Weekly is the demo default; monthly requires consistent policy periods. Read approved values from versioned backend policy. Until defined, use UNVERIFIED with no offer for zero verified rails and do not fabricate rates, tickets, or step-up promises.

## 10. Reference-image entry screen

Use `ui inspo.jpg` as a composition reference: a spacious centred Source Serif 4 promise, a short operational explanation, black and outline pill actions, then a central device mockup flanked by two offset evidence widgets. Keep the product's existing 2×2 mark and paper/ink/lilac palette. The device shows an explicitly synthetic ZeroCIBIL lean-month and offer example; side widgets explain verified rails and the PDF limitation. The reference's rating, partner logos, return percentage, and app download are not product facts and must not appear. On narrow screens the device and widgets stack in reading order, and the two entry actions remain visible before the illustration.

The implemented landing page follows the reference's white canvas without an outer frame, large two-line heading, paired pills, phone composition, curved backdrop, source-name band, and editorial lower section. Its source names and offer figures are explicitly synthetic. The owner and lender actions route into the existing demo; live application and underwriting actions remain separate implementation work.

## 11. Lender dashboard reference

Use `dashboard insp.jpg` for `/application/:id`: edge-to-edge white workspace, slim sidebar, compact top toolbar, four summary figures, a dominant weekly-activity chart, trust detail, terms, and a navigable sample-application table. Keep this route denser than the landing page. Blue is a workspace accent here; it does not change the owner flow or the landing identity. On mobile, preserve queue and evidence navigation, stack cards, and make the table horizontally scrollable with its column labels. The chart slider is illustrative while the underwriting API is absent, so it must not change or imply recalculated offers.
