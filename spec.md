# F2 — Credit for the credit-invisible

**Hackathon:** The Big Hack 2.0 (Bengaluru)  
**Track:** 01 Finance  
**Code:** F2  
**Product:** ZeroCIBIL  
**Stack:** MERN + Python ML + LangGraph agents  
**Edition:** Single participant spec. ML and agentic design below is the source of truth for underwriting.  
**Supersedes:** `nidhi_ml_agentic_ai_spec.md` (content folded in; brand is ZeroCIBIL, not Nidhi).

Three layers, never mixed:

1. **Machine learning** — authenticity (`p_auth`) and lean-period stress (`p_stress`).
2. **Deterministic underwriting** — lean-month capacity and versioned terms.
3. **Agentic AI** — tools, exceptions, explanations, audit. An LLM must not approve a loan, invent figures, change predictions, or override policy.

---

## 1. Problem statement (from the booklet)

### 1.1 Official framing

India has crores of MSMEs (kirana stores, tailors, repair shops, small manufacturers). Many sell every day and accept UPI. Lenders usually check a **credit score**, **audited accounts**, and **collateral**. Many small businesses have none of these. They have never taken a formal loan, so they have **no credit history**. Lenders call them **credit-invisible**. They are rejected or charged high interest because risk cannot be measured. Owners then borrow from informal lenders at even higher rates.

**SIDBI-linked context in the PS:**

- ~₹30 lakh crore estimated credit gap for small businesses (~24% of demand).
- ~35% estimated credit gap for women-owned small businesses (higher than overall).
- 7.28 crore enterprises on Udyam by December 2025.

### 1.2 Who this affects

1. **Owners of small businesses with no formal credit history.**
2. **Lenders** who must decide whether to lend, how much, and on what terms.

The product is **two-sided**. An owner-only budget app or a lender-only score widget does not cover the PS.

### 1.3 The problem

Lenders cannot tell a **healthy** small business from a **risky** one when there is no credit history. Good businesses are **denied credit or overcharged**.

### 1.4 The challenge

> Design a **fairer** way to decide **which** small businesses get credit, **how much** they get, and **on what terms**, when the business has **no formal credit history**.

| Decision | Meaning |
|---|---|
| Which | Eligible vs decline vs “collect more data” |
| How much | Principal / limit |
| On what terms | Tenure, interest band, repayment schedule, conditions, step-up |

### 1.5 Key terms

| Term | Definition (booklet) |
|---|---|
| **MSME** | Micro, small or medium enterprise, classified under Indian law by investment and turnover. |
| **Credit history** | Record of past loans and repayments at bureaus such as CIBIL. |
| **Credit-invisible** | Borrower with **no** credit history; bureau cannot give a score. |
| **Terms** | Interest rate, repayment schedule, and length of the loan. |

### 1.6 Track 01 rule

- Working prototype.
- Synthetic data allowed; **label real vs synthetic** on every screen.
- v1 cashflow, GST, and AA payloads are **synthetic** unless a later consented rail is added.

### 1.7 Judging map (100)

| Criterion | Weight | How ZeroCIBIL scores it |
|---|---|---|
| Innovation | 25 | Trust rails + **terms** (not yes/no) + fairness twins + agent investigation (not LLM-as-underwriter) |
| Technical depth | 25 | Dual models, leakage-safe training, capacity math, LangGraph tools, audit |
| Evidence | 20 | Baseline `no CIBIL → reject` vs funded count + proxy stress on synthetic holdout |
| Impact | 15 | Kirana / women-owned MSME in Bengaluru |
| Presentation | 15 | 3-minute two-role demo |

---

## 2. Product thesis

**We do not grant a loan because the owner looks honest or uploaded PDFs.**  
We grant **terms the shop’s lean month can pay**, using **rails that are hard to fake**, and we **shrink or refuse** when the data is not the shop’s or surplus cannot cover EMI.

Credit-invisible ≠ document-invisible. Self-uploaded bank PDFs are **unverified** and **must not set the limit**.

Brand: **ZeroCIBIL**. The lender remains accountable for the final credit decision.

### 2.1 Design principles

1. Authenticity is separate from credit risk.
2. A bureau score is not an input.
3. A PDF is not a verified rail.
4. Capacity is transparent arithmetic, shown to the lender.
5. Risk changes haircut and rate; it does not replace capacity math.
6. Agents call tools; they do not fabricate facts.
7. Every result is traceable (model, policy, provenance, input hash, override).
8. Fairness is tested on twins, not asserted.
9. `UNVERIFIED` is a valid outcome.
10. Synthetic metrics are not real-world validation.

---

## 3. Goals and non-goals

### 3.1 In scope (hackathon MVP)

- Two supervised models: **A authenticity**, **B stress**.
- Synthetic generator with labelled archetypes (≥200 shops).
- Shared Python feature builder + schema + unit tests.
- Offline train/eval; FastAPI scoring; `/stress-test` without retrain.
- Deterministic lean-month capacity and versioned terms.
- Controlled LangGraph workflow (analysis, exceptions, explanation, audit).
- Evidence dashboard vs `no CIBIL → decline`.
- Fairness twins.
- Provenance labels on every rail.

### 3.2 Out of scope

- Production AA / GST / Aadhaar / CKYC / NACH / disbursal.
- Real default prediction.
- LLM as the credit decision.
- Fraud accusation from an anomaly score alone.
- CV claims about detecting every forged PDF.
- Blockchain (Track 2).
- Consumer personal loans.

---

## 4. Users

**Owner (demo):** Kirana in Bengaluru, UPI QR, never had a formal loan, no CIBIL. Apply without a bureau file; see verified vs unverified; PDFs do not unlock a full limit; see status.

**Lender:** Thin-file queue; no bureau banner; trust + capacity + terms + drivers; stress slider; override with reason; baseline comparison.

**Auditor / policy:** Decision log; fairness report on synthetic twins.

---

## 5. Product features (PS-aligned)

### 5.1–5.3 Application and rails

Owner profile **without** CIBIL. Banner: **No credit bureau file — underwriting from operations.** Never invent a fake CIBIL number.

| Rail | Trust class | Role in limit |
|---|---|---|
| Account Aggregator JSON (simulated) | Verified | Can drive terms |
| UPI merchant / QR credits (simulated) | Verified | Can drive terms |
| GSTIN + GSTR-1 / 3B summary (simulated) | Verified | Can drive terms + recon |
| Udyam | Supporting | Identity only |
| Bank PDF / photo / Excel / typed totals | **Unverified** | Must **not** set full limit |

### 5.4 Data trust panel

Per application: rail status, mismatches, `p_auth`. Identity match; GST vs UPI vs cash; mule heuristics. **No verified rail → `UNVERIFIED` or tiny test limit**, never a large principal.

### 5.5–5.8 Cashflow, capacity, terms, verdict

90-day board with **SYNTHETIC** watermark. Max EMI from worst 4-week surplus × haircut. Asked amount above max → **counter-offer**.

Outputs: principal, tenure, rate band, cadence (weekly default), conditions, optional step-up. Risk only moves haircut and rate.

| Code | When |
|---|---|
| `DECLINE` | Identity/fraud fail, capacity ≈ 0 |
| `UNVERIFIED` | No verified rail / PDF-only |
| `THIN_FILE` | Verified, short history |
| `STANDARD` | Capacity + trust pass |
| `STEP_UP` | Conservative start, increase after N on-time weeks |

### 5.9–5.16 Explainability, slider, fairness, evidence, audit, owner status, seed gallery

Top 3 drivers with observed values. Stress slider **recomputes capacity, does not retrain**. Fairness: same cashflow, change gender/area → **₹0 principal delta**. Baseline: everyone invisible → funds 0. Override + audit log. Owner copy is non-stigmatising.

**Seed:** clean kirana; PDF-only; mule-like; GST mismatch; fairness twins; volatile genuine UPI (`THIN_FILE`).

---

## 6. Decision layers (policy)

**A — Hard gates (no ML):** incomplete identity; zero verified rails; severe authenticity; max EMI ≈ 0.

**B — Authenticity:** `p_auth` + flags. Below `low_below` → decline/unverified. Mid band → haircut / more data. High → capacity path. Thresholds live in `models/meta.json`.

**C — Capacity (deterministic):**

```
lean_surplus = worst_4_week_net_inflow / 4
haircut = f(trust_class, p_stress, history_length)
max_emi = max(0, lean_surplus * haircut)
max_principal = pv(max_emi, rate, tenure)
```

Define worst-4-week net from inflow−outflow. Weekly cadence uses weekly periods, not a monthly formula unchanged. Zero rate handled separately. Negative surplus cannot yield positive EMI.

**D — Stress:** `p_stress` = P(next synthetic lean period cannot cover **reference EMI**). Proxy, not real default.

**E — Terms (versioned v1, tune on holdout):**

| P(stress) | Trust | Cadence | Rate band | Tenure cap |
|---|---|---|---|---|
| Low | High | Weekly or monthly | Lowest | 12–18 mo |
| Mid | High | Weekly | Mid | 9–12 mo |
| High | Any | Weekly | High or decline | 6 mo or decline |
| Any | Low | — | — | UNVERIFIED / test limit |

**Judge line:** We don’t approve people. We price **verified lean-month surplus**, and we **don’t let PDFs print a limit**.

---

## 7. Credibility

We do not trust honour-system PDFs. Limit = consented, reconcilable rails.

| Rank | Rail | Note |
|---|---|---|
| 1 | Simulated AA | Timestamps, account-level |
| 2 | UPI to **this** shop VPA | |
| 3 | GST vs UPI/bank | |
| 4 | Udyam / utility | Supporting |
| 5 | PDF / typed totals | Unverified |

| Check | Action |
|---|---|
| VPA/GSTIN ≠ shop | Decline |
| Top payer > 80% | Down-term / decline |
| Round-amount spike | Auth flag |
| Empty then perfect 90d | Replay flag |
| \|GST−UPI\|/GST > 0.35 | Haircut or unverified |
| Large cash claim | Penalty / verify, **not** a Model A feature that auto-flags cash kiranas |
| PDF-only | No full limit |

Copy: `Verified (simulated Account Aggregator)` · `Unverified upload — does not set credit limit` · `Synthetic demo data`.

---

## 8. Technical architecture

```
[Owner / Lender React SPA]
        |
        v
[Express BFF + Mongo]
        |
        +--> POST /internal/score  -->  [FastAPI]
        |                                 features.py
        |                                 auth.joblib / stress.joblib
        |                                 policy.py (capacity + terms)
        |
        +--> POST /internal/agent  -->  [LangGraph]
                                          tools only; no free-form credit math
```

Auth stub: `owner@demo` / `lender@demo`. CORS to Vite origin. Money in **integer paise**.

### 8.1 React

Routes: `/apply`, `/status/:id`, `/queue`, `/application/:id`, `/evidence`. Design: `design.md` (paper, ink, lilac). Tokens: `apps/web/src/styles/tokens.css`.

### 8.2 Express

```
POST /api/auth/login
GET  /api/me
POST /api/shops
GET  /api/shops/:id
POST /api/shops/:id/rails
GET  /api/shops/:id/cashflows
POST /api/applications
GET  /api/applications
GET  /api/applications/:id
POST /api/applications/:id/score
POST /api/applications/:id/override
POST /api/applications/:id/stress
GET  /api/evidence/summary
```

If `verified_rail_count === 0`, short-circuit to `UNVERIFIED` **before** Model B can set a large limit. Reject any `cibilScore` field.

Mongo: `users`, `shops`, `rails`, `cashflows`, `applications`, `decisions`, `overrides`, `audit_logs`. `ownerFlags` only for fairness fixtures — **never** in model features.

---

# PART A — MACHINE LEARNING

## 9. ML overview

| Component | Task | Target | Output | Role |
|---|---|---|---|---|
| Model A | Binary classification | `y_auth` | `p_auth`, band, flags | Authentic ops vs mule/pdf_fraud/mismatch |
| Model B | Binary classification | `y_stress` | `p_stress`, band | Next synthetic lean period fails reference EMI |
| Feature builder | Deterministic | — | Vector + schema version | Same code train and serve |
| Eval | Offline | Synthetic labels | `ml/reports/` | Holdout behaviour |

Train A and B independently.

- **Sequential (MVP):** B does **not** consume `p_auth`; authenticity is a gate/haircut.
- **Stacked (optional):** B uses **out-of-fold** `p_auth` in training; never in-sample A predictions (leakage).

Python owns features. Node must not recompute them. Contract: `ml/schema.json`.

### 9.1 Layout

```
ml/
  generate_shops.py
  features.py
  schema.json
  train_auth.py
  train_stress.py
  evaluate.py
  policy.py
  service.py
  agent_graph.py
  agents/
  tools/
  models/auth.joblib
  models/stress.joblib
  models/meta.json
  reports/metrics.json
  reports/model_card_auth.md
  reports/model_card_stress.md
```

### 9.2 Generator

≥200 shops (500–1000 if time). 90–180 days of daily/tx records; weekly/monthly aggregates from the same source. Every row:

```json
{ "provenance": "synthetic", "generator_version": "v1" }
```

| Archetype | Character | Expected treatment |
|---|---|---|
| `stable` | Diverse payers, aligned rails | Possible `STANDARD` |
| `seasonal` | Real peaks/troughs | Variability; maybe `THIN_FILE` |
| `declining` | Downward surplus | Higher `p_stress` / smaller capacity |
| `mule` | Concentration, spikes | Auth review / decline |
| `pdf_only` | Uploads only | `UNVERIFIED`, no full limit |
| `gst_mismatch` | GST vs UPI gap | Flag, haircut, more data |
| `twin_fairness` | Same ops, different protected flags | **Identical terms** |

Also generate **legitimate hard cases** (not fraud by construction): new genuine short history; cash-heavy kirana; festival seasonal; one large legitimate customer; temporary spike.

**Entities:** shop (no protected attrs as model inputs); rail `aa|upi|gst|udyam|pdf` with `trust_class` `verified_simulated|supporting|unverified`; cashflow tx with synthetic `payer_id`; shop-level training row with `y_auth`, `y_stress`, `generator_archetype`.

### 9.3 Model A features

| Feature | Definition |
|---|---|
| `payer_hhi` | Sum of squared payer shares |
| `max_payer_share` | Largest payer / total credits |
| `round_amount_ratio` | Share matching documented round-amount rule |
| `gst_upi_rel_gap` | Relative GST vs UPI/bank; define missing behaviour |
| `history_weeks` | Weeks with history (short = uncertainty, not fraud) |
| `empty_then_spike` | Inactivity then unusual spike |
| `rail_count_verified` | Verified/sim-verified rails; **PDF does not count** |

Deterministic extras (policy, not necessarily model): identity mismatch, freshness, replay, cash share as **penalty/verify**, not auto-suspicious.

### 9.4 Model B features

`median_monthly_inflow`, `p10_weekly_inflow`, `cv_weekly_inflow` (define mean=0), `slope_90d`, `lean_month_ratio` (one definition: worst 4-week vs typical 4-week), `outflow_ratio`, `residual_after_opex`, `unique_payers`, `invoice_count`, `weeks_on_vpa`, optional `p_auth` (stacked only).

**Do not** use requested amount as a stress predictor. Affordability is capacity.

Feature quality: units and windows; same missing handling train/serve; reject impossible dates; schema version; unit tests; do not treat missing verified rails as zero activity; keep raw facts vs derived; **no gender/city-as-risk in vectors**.

### 9.5 Model A

```
y_auth = 1  authentic_ops
y_auth = 0  mule / pdf_fraud / mismatch
```

Synthetic label only. Algorithms: Logistic Regression (baseline) vs HistGradientBoostingClassifier (primary); optional RF. Impute; scale LR only; fixed seeds; package versions recorded.

Output:

```json
{
  "model": "authenticity",
  "model_version": "auth-v1",
  "p_auth": 0.93,
  "authenticity_band": "HIGH",
  "flags": [],
  "feature_schema_version": "1.0"
}
```

Hard identity failures and zero verified rails are **policy**, not hidden in `p_auth`.

Thresholds in `meta.json` (placeholders until holdout tune): `low_below` 0.40, `high_at_or_above` 0.75.

Eval: precision/recall on suspicious class, F1, ROC-AUC, confusion matrix, FP review on seasonal/cash/new, metrics by archetype.

### 9.6 Model B

```
y_stress = 1  if next synthetic lean period cannot cover reference EMI
```

Label from **future** generator period, not from CIBIL, not from leaked future features. Proxy stress, not real default.

Same algorithm set; sklearn-only is enough.

Output includes `p_stress`, `risk_band`, `reference_emi`, `target_definition`. Example bands: `low_max` 0.20, `medium_max` 0.45.

Eval: ROC-AUC, P/R/F1, PR-AUC if imbalanced, confusion, Brier/calibration, proxy stress among **funded** shops, by archetype. Do not optimize accuracy alone.

### 9.7 Train / leakage / artifacts

Split by **`shop_id`** (70/15/15). All of a shop in one split.

No future values in historical features; no `y_*` or archetype as inputs; no requested amount as stress feature; OOF `p_auth` if stacked; fit imputers on train only.

Runtime **loads** `auth.joblib`, `stress.joblib`, `meta.json`. Never retrain on `/score` or slider.

`meta.json`: feature schema, generator version, model versions, seed, thresholds, `trained_at`.

### 9.8 Explainability

SHAP optional. Map:

| Feature | Language |
|---|---|
| `lean_month_ratio` | Weakest four-week period is below typical |
| `max_payer_share` | One payer is a high share of credits |
| `gst_upi_rel_gap` | GST and UPI differ materially |
| `cv_weekly_inflow` | Weekly inflows vary a lot |
| `history_weeks` | History is short |

Payload: name, observed value, comparison, direction, source, version. Prefer “contributed to”, not “caused”, unless policy supports it.

---

# PART B — AGENTIC AI

## 10. Agents

Orchestration: **LangGraph**, typed state, explicit edges. Invoked by Express as an internal service. LLM may summarize; **code does arithmetic**.

**May:** read structured data; call approved tools; flag missing data; ask for evidence; summarize models/policy; explain; audit.

**Must not:** invent transactions; treat PDF as verified; change probabilities/thresholds; override hard gates; approve/disburse; use protected attributes for terms; accuse fraud from a flag; claim production AA.

### 10.1 Roster (combine nodes if short on time)

1. **Orchestrator** — `load_application`, `validate_application`, `build_features`, `score_authenticity`, `score_stress`, `run_underwriting_policy`, `write_audit_event`. Sequence only; no free-form amount.
2. **Financial data analyst** — parse AA/UPI/GST (demo), invoices, `reconcile_financial_rails`, `build_financial_features`. LLM does not total money from prose.
3. **Authenticity investigator** — Model A + identity, freshness, concentration, GST–UPI gap, `create_verification_request`. No “fraud” from score alone.
4. **Cash-flow / stress analyst** — weekly CF, lean period, Model B, optional demo forecast, drivers. Always say **synthetic lean-period proxy**, not default.
5. **Terms presenter** — policy tools, max EMI/principal, counteroffer, schedule. Cannot invent rates or exceed `max_principal`.
6. **Explainability** — grounded copy for lender and owner (see example below).
7. **Fairness + audit** — twins in code (not LLM); hash, versions, override actor/reason.

Example explanation:

> The application has no credit bureau file. The assessment uses simulated UPI and GST rails. The proposed amount is limited by the weakest observed four-week cash-flow period. One payer contributes a high share of incoming credits, so the lender should review the concentration flag.

### 10.2 LangGraph

State includes application, shop, rails, cashflows, `requested_amount_paise`, provenance, `verified_rail_count`, features, `p_auth` / flags, `p_stress` / drivers, capacity, terms, verdict, explanation, fairness_result, audit_reference, errors.

```
START → load/validate → provenance
  → if verified_rail_count == 0 → UNVERIFIED → explain → audit → END
  → normalize/reconcile → identity hard checks
  → if hard fail → decline/review → explain → audit → END
  → Model A → auth gate → features + Model B
  → capacity → terms → counteroffer
  → explain → fairness (eval route OK) → audit → END
```

Fairness twins may be a **separate eval route**. Audit on every score and override, including early `UNVERIFIED`.

**Failures:** parser fail → data-quality / `UNVERIFIED`, no fabricated totals. Model down → fail closed, retry/manual. Schema mismatch → reject score. LLM explain fail → keep deterministic decision + template copy. Audit fail → do not mark workflow complete.

### 10.3 Tools (typed, no shell, no arbitrary URLs)

`load_application`, `validate_application`, `build_features`, `score_authenticity`, `score_stress`, `reconcile_financial_rails`, `run_underwriting_policy`, `simulate_repayment_schedule`, `run_fairness_twins`, `write_audit_event`.

---

# PART C — SCORING API

## 11. FastAPI

```
GET  /health
POST /score
POST /explain
POST /stress-test    # scenario only; no retrain
```

`/score` body: `application_id`, shop, rails (`type`, `trust_class`, `provenance`), cashflows, `requested_amount_paise`, `policy_version`.

Response: provenance, `verified_rail_count`, `p_auth`, `p_stress`, features, drivers, verdict, `principal_paise`, `max_emi_paise`, tenure, `rate_bps`, cadence, conditions, policy + model + feature schema versions. **Compute** from fixtures/policy; do not hard-code demo JSON.

`/stress-test`: `lean_inflow_delta_pct` / outflow delta. Return scenario assumptions, recomputed surplus/EMI/principal/terms, `scenario_only: true`. Re-scoring Model B is a **separate labelled** call if ever used; MVP slider stays deterministic.

---

# PART D — EVALUATION, FAIRNESS, SAFETY

## 12. Evaluation

**Models:** holdout size/balance; P/R/F1/ROC-AUC; confusion; PR-AUC; Brier for B; by archetype; FP/FN examples.

**Product:** (1) Baseline funds 0. (2) ZeroCIBIL funded count + proxy stress among offers on holdout. Optional baseline-2: median inflow threshold ignoring authenticity — mule passes that, fails our auth gate. Label **synthetic**.

**Fairness:** twins identical except protected flag; compare verdict, principal, rate, tenure, cadence. Accept: ₹0 principal, 0 rate-band, no other term change. **Code**, not LLM.

**Failures to name on the pitch:** new genuine shops; cash-heavy; seasonal; one dominant customer; delayed GST. Prefer “collect data” over forced decline when the issue is uncertainty.

**Responsible AI:** synthetic demo; consent if real data later; minimize PII; protected attrs only in fairness fixtures; do not use city as unexplained risk; human review for adverse/ambiguous; correction path; no RBI / zero-fraud / live-default claims.

---

## 13. UX (hero screens)

**Owner apply:** profile → simulated rails (AA, UPI, GST, PDF unverified) → amount → submit.  
**Lender desk:** header (shop, no bureau, provenance) | trust | 90-day bars | terms + slider + fairness + override.  
**Evidence:** baseline 0 vs ZeroCIBIL K, synthetic caption.

---

## 14. Demo script (~3 minutes)

1. Kirana, empty CIBIL, bank would reject.  
2. Owner: synthetic UPI + GST. Ask ₹2L.  
3. Lender: baseline DECLINE. ZeroCIBIL: trust high, lean surplus, **amount / tenure / rate / weekly**.  
4. Slider worsens lean weeks → limit falls (no retrain).  
5. PDF-only: no full limit.  
6. Mule: high inflow, decline.  
7. Twins: same terms.  
8. Evidence page. “All data synthetic.”

If the lender screen is not clickable, round 1 is lost.

---

## 15. Pitch claims

**Will:** fairer thin-file process; measured **synthetic** lift vs reject-if-no-CIBIL; authenticity as a gate; agents explain, they do not decide.

**Will not:** RBI approved; we replaced CIBIL; 0% fraud; real default on live MSMEs; production AA.

---

## 16. Delivery

### P0 (never cut)

Dual models; verified-rail gate; capacity + terms; stress slider; top drivers; provenance badges; baseline vs us; fairness twins; audit per score/override.

### P1

Auth investigation agent; underwriting report; counteroffer copy.

### Optional later

Financial digital twin; credit-readiness assistant (no promised approval); ongoing stress monitor; alternative credit passport; portfolio intel; multilingual copilot grounded in structured assessment.

### Sequence

1. **Data/ML:** generator → labels → features/tests → train A/B → holdout → artifacts. Exit: stable versioned predictions on fixtures.  
2. **Underwriting API:** gates, surplus, policy, `/health|/score|/stress-test`. Exit: clean kirana gets numbers; PDF-only cannot get STANDARD; slider no retrain.  
3. **Agents:** LangGraph + tools + explain + audit. Exit: clean and unverified paths both traceable.  
4. **Wow/evidence:** twins, baseline, report, slider viz.

### Team (36h)

| Person | Owns |
|---|---|
| MERN-1 | Lender desk + slider (demo path) |
| MERN-2 | Owner, queue, Express, Mongo |
| ML | Generator, features, A/B, policy, FastAPI |
| Glue | LangGraph wiring, seed shops, badges, pitch |

**Cut if late:** owner polish, SHAP, step-up, Docker, extra agents. **Never cut:** P0 list.

Open (hour 1): max ticket (₹50k–₹3L); weekly vs monthly default; GST always on clean shop (yes); haircut table in `policyVersion: v1`. Product name is **ZeroCIBIL**.

---

## 17. Acceptance checklist

### ML

- [ ] A and B use documented features and synthetic targets as specified.  
- [ ] Split by `shop_id`; no leakage; no protected attrs in features.  
- [ ] Metrics + confusion saved; versions returned at inference.  
- [ ] Failure analysis includes new, cash-heavy, seasonal.

### Underwriting

- [ ] Zero verified rails → no full limit.  
- [ ] PDF-only cannot be `STANDARD`.  
- [ ] Capacity deterministic; over-ask → counteroffer.  
- [ ] Slider without retrain.  
- [ ] No CIBIL field influences the verdict.

### Agents

- [ ] Typed tools only; cannot change model/policy.  
- [ ] Explanations grounded; no unsupported fraud accusation.  
- [ ] Fail closed if models down; audit on every score/override.

### Demo / fairness

- [ ] Twins identical terms.  
- [ ] Synthetic labels everywhere.  
- [ ] Baseline visible.  
- [ ] No RBI / live-MSME validation claim.

---

## 18. Repo layout

```
spec.md
design.md
PRODUCT.md
apps/web/          React (ZeroCIBIL)
apps/api/          Express
ml/                as in §9.1
data/seed/
README.md
```

---

## 19. Sources (slides, not scrape)

SIDBI / Crisil MSME Pulse 2025; PIB December 2025 (Udyam); The Big Hack 2.0 Finance F2 booklet.

---

> **We don’t approve people. We price verified lean-month surplus, and we don’t let PDFs print a limit.**  
> ML estimates authenticity and stress. The engine computes capacity and terms. Agents coordinate evidence. The lender decides.
