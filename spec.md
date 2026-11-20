# F2 — Credit for the credit-invisible

**Hackathon:** The Big Hack 2.0 (Bengaluru)  
**Track:** 01 Finance  
**Code:** F2  
**Product name:** ZeroCIBIL  
**Stack:** MERN + Python ML  
**Edition:** Participant spec (internal). Not an official organiser document.

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

The product is **two-sided**. A owner-only budget app or a lender-only score widget does not cover the PS.

### 1.3 The problem (verbatim intent)

Lenders cannot tell a **healthy** small business from a **risky** one when there is no credit history. Good businesses are **denied credit or overcharged**.

### 1.4 The challenge (what we must answer)

> Design a **fairer** way to decide **which** small businesses get credit, **how much** they get, and **on what terms**, when the business has **no formal credit history**.

Three decisions, not one binary score:

| Decision | Meaning |
|---|---|
| Which | Eligible vs decline vs “collect more data” |
| How much | Principal / limit |
| On what terms | Tenure, interest band, repayment cadence, conditions, step-up |

### 1.5 Key terms (must appear correctly in UI and pitch)

| Term | Definition (booklet) |
|---|---|
| **MSME** | Micro, small or medium enterprise, classified under Indian law by investment and turnover. |
| **Credit history** | Record of past loans and repayments at bureaus such as CIBIL. |
| **Credit-invisible** | Borrower with **no** credit history; bureau cannot issue a score. |
| **Terms** | Interest rate, repayment schedule, and length of the loan. |

### 1.6 Track 01 rule (applies to every Finance submission)

- Submission must be a **working prototype**.
- **Synthetic data is allowed** where real data is not available.
- **Say clearly** which data in the demo is real and which is synthetic.
- Every cashflow, GST, and AA payload in v1 is **synthetic** unless we later add a real consented rail.

### 1.7 Judging map (100 points)

| Criterion | Weight | How F2 scores it |
|---|---|---|
| Innovation | 25 | Trust rails + **terms** (not yes/no) + fairness on same cashflow |
| Technical depth | 25 | Dual models (authenticity + risk), lean-month capacity math, audit log |
| Evidence | 20 | Baseline `no CIBIL → reject` vs our funded count + proxy default; labelled synthetic eval |
| Impact | 15 | Kirana / women-owned MSME in Bengaluru; credit gap narrative |
| Presentation | 15 | 3-minute two-role demo |

---

## 2. Product thesis

**We do not grant a loan because the owner looks honest or uploaded PDFs.**  
We grant **terms the shop’s lean month can pay**, using **rails that are hard to fake**, and we **shrink or refuse** when the data is not the shop’s or surplus cannot cover EMI.

Credit-invisible ≠ document-invisible. Self-uploaded bank PDFs are **unverified** and **must not set the limit**.

Product name: **ZeroCIBIL**.

---

## 3. Goals and non-goals

### 3.1 Goals

- Decide **which / how much / terms** with **zero CIBIL**.
- Separate **data authenticity** from **credit risk**.
- Show **why** (top drivers) and **what if** (lean-week sliders).
- Prove **fairness**: same cashflow, different protected attributes → same offer.
- Label **synthetic vs real** on every screen.
- Beat an explicit **baseline** with numbers.

### 3.2 Non-goals (hackathon)

- Real bank login, Account Aggregator production, GST portal login, Aadhaar, CKYC.
- Disbursal, NACH, collections ops, legal agreements.
- Consumer personal loans, credit cards, BNPL for individuals.
- Blockchain (Track 2).
- “ChatGPT decides the loan.”
- Scanning or using anyone’s real statements without consent (we only use seed synthetic shops).

---

## 4. Users and jobs-to-be-done

### 4.1 Primary user A — MSME owner (applicant)

**Persona (demo):** Kirana owner in Bengaluru, UPI QR on the counter, never had a formal loan, no CIBIL, optional Udyam.

**Jobs:**

- Apply without a bureau file.
- See what data is **verified** vs **unverified**.
- Understand that PDFs alone will not unlock a full limit.
- See application status (pending / offer / declined / need more rails).

### 4.2 Primary user B — Lender credit officer

**Persona:** Small-ticket MSME lender / NBFC officer.

**Jobs:**

- Open a queue of thin-file applications.
- See “no bureau file” immediately.
- See **data trust**, **capacity**, **proposed terms**, **drivers**.
- Stress-test lean weeks.
- Override with a reason (audit).
- Compare to baseline policy.

### 4.3 Secondary (pitch only)

- Auditor: every decision is logged.
- Policy: fairness report on synthetic cohort.

---

## 5. Features (PS-aligned)

Each feature traces to *which / how much / terms / fairer / no credit history / both users*.

### 5.1 Thin-file application (owner)

**Description:** Owner creates a shop profile **without** CIBIL/PAN-as-score. Fields: shop name, category, city, years operating, Udyam number (optional), merchant VPA (synthetic).

**PS link:** Credit-invisible applicant; MSME.

### 5.2 Explicit “no credit history” state

**Description:** Owner and lender UIs show a persistent banner: **No credit bureau file — underwriting from operations.** Never invent a fake CIBIL number.

**PS link:** Credit-invisible definition.

### 5.3 Dual-rail data intake

**Description:** Attach data as **verified rails** (simulated) vs **unverified uploads**.

| Rail | Trust class | Role in limit |
|---|---|---|
| Account Aggregator JSON (simulated) | Verified | Can drive terms |
| UPI merchant / QR credits (simulated) | Verified | Can drive terms |
| GSTIN + GSTR-1 / 3B summary (simulated) | Verified | Can drive terms + recon |
| Udyam | Supporting | Identity, not cashflow |
| Bank PDF / photo / Excel / typed totals | **Unverified** | Must **not** set full limit |

**PS link:** Lenders cannot measure risk; we measure from operations, not from honour-system PDFs.

### 5.4 Data trust / credibility panel (lender)

**Description:** Per application, show rail status, mismatches, and `P(data belongs to this shop)`.

- Identity match: GSTIN / Udyam / VPA vs applicant.
- Cross-rail consistency: GST taxable sales vs UPI credits vs claimed cash.
- Replay / mule heuristics: one payer dominance, round-number spikes, 90 “perfect” days after empty history.
- **Policy:** no verified rail → outcome **Collect more data** or **tiny test limit**, never a large principal.

**PS link:** Fairer *and* safer than treating uploads as truth. Innovation + technical depth.

### 5.5 Cashflow board (90 days)

**Description:** Weekly/daily inflow/outflow chart. Lean windows highlighted. **SYNTHETIC** watermark.

**PS link:** Healthy vs risky business when history is missing.

### 5.6 Lean-month capacity engine

**Description:** Compute max EMI from **worst 4-week surplus × haircut(trust)**. Convert to max principal given rate and tenure. Asked amount above max → **counter-offer**, not character judgement.

**PS link:** How much; terms that survive a bad month.

### 5.7 Terms engine (not a single score)

**Description:** Output:

- Eligible principal (₹)
- Tenure (months)
- Interest band (% p.a.)
- Repayment cadence (weekly recommended for irregular UPI)
- Conditions (e.g. cap at 1.5× median month; debit from merchant VPA)
- Optional **step-up**: start small, increase after N on-time weeks

Risk band only **moves haircut and rate**. It does not replace cashflow math.

**PS link:** “Terms” as defined in the booklet.

### 5.8 Four-way verdict (which)

| Code | Verdict | When |
|---|---|---|
| `DECLINE` | Decline | Fraud/identity fail, capacity ≈ 0 |
| `UNVERIFIED` | Collect more data / PDF-only block | No verified rail |
| `THIN_FILE` | Thin-file offer | Verified but short history |
| `STANDARD` | Standard offer | Capacity + trust pass |
| `STEP_UP` | Step-up facility | Standard but conservative start |

Binary approve/reject is **insufficient** for the PS.

### 5.9 Explainability

**Description:** Top 3 drivers (e.g. lean-month depth, payer concentration, GST–UPI gap). Lender can read without opening a notebook.

**PS link:** Technical depth; presentation; trust of the lender-user.

### 5.10 Stress slider (“what if”)

**Description:** Lender drags “lean weeks worse / better.” Terms reprice live. Demo-critical.

**PS link:** Distinguishing healthy vs risky under income variability.

### 5.11 Fairness check

**Description:** Hold cashflow fixed; toggle gender / area flags (synthetic). Offer must **not** move. Log the check. Women-owned gap from PS is **impact narrative**, not a reason to charge more.

**PS link:** “Fairer way”; 35% gap for women-owned MSMEs.

### 5.12 Baseline comparison (evidence)

**Description:** Policy `if no_cibil then reject`. Dashboard: shops funded under baseline vs us; proxy default on labelled synthetic holdout.

**PS link:** Track evidence criterion; Finance synthetic-data rule.

### 5.13 Human override + audit log

**Description:** Officer can change terms with a reason. Immutable-enough log: inputs hash, model versions, terms, override. Not Track 2 blockchain; Mongo + append-only collection is enough.

**PS link:** Lender as a user; technical depth.

### 5.14 Synthetic data labelling (compliance)

**Description:** Badge on every chart, API field `data_provenance: synthetic | simulated_rail | real`. Pitch slide repeats this.

**PS link:** Track 01 rule.

### 5.15 Owner status view

**Description:** After apply: pending / offer summary (amount, tenure, rate band) / declined with **non-stigmatising** copy (“we could not verify operations” vs “you are a bad business”).

**PS link:** Owner as affected user.

### 5.16 Seed gallery for demo

**Description:** At least:

- **Clean kirana:** AA + UPI + GST aligned → STANDARD offer.
- **PDF-only shop:** UNVERIFIED, no full limit.
- **Mule-like:** high inflow, one payer, round numbers → DECLINE or severe down-term.
- **GST mismatch:** credits vs GSTR gap → haircut or unverified.
- **Women-owned, same cashflow as a male-owned twin:** same terms (fairness).
- **Volatile but real UPI:** THIN_FILE, weekly debit, smaller ticket.

**PS link:** Healthy vs risky when both have no CIBIL.

---

## 6. Decision basis (underwriting policy)

### 6.1 Layer A — Hard gates (no ML)

Fail → `DECLINE` or `UNVERIFIED`:

1. Shop identity incomplete or contradictory.
2. Zero verified rails.
3. High authenticity risk (mule / replay / mismatch above threshold).
4. Max EMI ≈ 0 after haircut.

### 6.2 Layer B — Authenticity score

`P(shop_owned_data)` from heuristics + Model A.

- Below `T_auth_low` → decline or unverified.
- Between thresholds → extra haircut.
- High → full capacity path.

### 6.3 Layer C — Capacity (deterministic, shown to judges)

```
lean_surplus = worst_4_week_net_inflow / 4   # monthly equivalent
haircut = f(trust_class, P_stress, history_length)
max_emi = max(0, lean_surplus * haircut)
max_principal = pv(max_emi, rate, tenure)
```

If `requested > max_principal` → counter-offer `max_principal`, do not character-reject.

### 6.4 Layer D — Risk band (Model B)

`P(stress_next_lean)` from features in §9. Maps to rate band and haircut, not to a vanity 300–900 score.

### 6.5 Layer E — Terms mapping (rules, versioned)

Example v1 (tune with eval, document in README):

| P(stress) | Trust | Cadence | Rate band | Tenure cap |
|---|---|---|---|---|
| Low | High | Weekly or monthly | Lowest | 12–18 mo |
| Mid | High | Weekly | Mid | 9–12 mo |
| High | Any | Weekly | High or decline | 6 mo or decline |
| Any | Low | — | — | UNVERIFIED / test limit |

### 6.6 One-sentence policy for judges

> We don’t approve people. We price **verified lean-month surplus**, and we **don’t let PDFs print a limit**.

---

## 7. Credibility and authenticity (detailed)

### 7.1 Problem judges will ask

“How do you know the statements are real?”

**Answer:** We don’t. We **refuse to underwrite on honour**. Limit is a function of **consented, reconcilable rails**. Uploads are evidence of *intent to apply*, not of *income*.

### 7.2 Trust ranking (harder to fake → more weight)

1. Simulated **Account Aggregator** (bank-consented JSON, timestamps, account-level).
2. **UPI / QR** credits to **this shop VPA / merchant ID**.
3. **GSTIN + e-invoice / GSTR** vs bank/UPI.
4. Udyam, utility, rent (supporting).
5. User PDFs / WhatsApp photos / typed totals (**unverified**).

### 7.3 Checks to implement

| Check | Signal | Action |
|---|---|---|
| Rail identity | VPA/GSTIN ≠ shop | Decline |
| Concentration | Top payer > 80% credits | Down-term / decline |
| Roundness | Excess of round ₹ credits | Flag authenticity |
| Freshness | Long empty then perfect 90d | Flag replay |
| GST–bank gap | \|GST − UPI\| / GST > 0.35 | Haircut or unverified |
| Cash claim | Large cash share of sales | Penalty, not a feature |
| PDF-only | No AA/UPI/GST | No full limit |

### 7.4 UX copy (mandatory)

- `Verified (simulated Account Aggregator)`
- `Unverified upload — does not set credit limit`
- `Synthetic demo data`

Never hide provenance.

### 7.5 What we will not claim

- That we “detect all fake PDFs” with CV magic in 36 hours.
- That we have RBI AA production access.
- That a neural net “knows honesty.”

---

## 8. Technical architecture (MERN + ML)

### 8.1 High-level

```
[Owner Web : React]
[Lender Web : React]
        |  HTTPS JSON  JWT roles: owner | lender
        v
[API : Node.js + Express]
        |                    |
        |                    +--> [MongoDB]
        |                         shops, rails, cashflows,
        |                         applications, decisions, audit
        |
        +--> HTTP POST /internal/score
                    v
           [ML service : FastAPI / Python]
           Model A authenticity
           Model B stress
           Feature builder
           Terms mapper (can live in API if versioned)
```

Local docker-compose optional; for hackathon, two processes (`npm run server`, `uvicorn`) plus Mongo is enough.

### 8.2 React (frontend)

**Apps:** one SPA, two layouts by role (faster than two repos).

**Owner routes:** `/apply`, `/shop/:id/rails`, `/shop/:id/status`

**Lender routes:** `/queue`, `/application/:id` (trust + chart + terms + sliders + fairness), `/evidence` (baseline vs us)

**Libraries (suggested):** React, Vite, React Router, Recharts, a headless table. No MUI-for-everything requirement.

**Accessibility:** skip link, labelled inputs, contrast on primary actions, don’t encode status by colour alone.

### 8.3 Express (BFF)

**Responsibilities:**

- Auth stub: seed users `owner@demo` / `lender@demo` (clearly demo).
- CRUD shops, rails, applications.
- Orchestrate scoring: assemble feature payload, call Python, persist decision.
- Enforce policy: if `verified_rail_count === 0`, short-circuit to `UNVERIFIED` **before** Model B sets a large limit.
- Audit middleware: log decision writes.

**Suggested routes:**

```
POST   /api/auth/login
GET    /api/me

POST   /api/shops
GET    /api/shops/:id
POST   /api/shops/:id/rails          # type: aa|upi|gst|pdf
GET    /api/shops/:id/cashflows

POST   /api/applications
GET    /api/applications             # lender queue
GET    /api/applications/:id
POST   /api/applications/:id/score
POST   /api/applications/:id/override
POST   /api/applications/:id/stress  # slider recalc, no new ML train
GET    /api/evidence/summary
```

**Validation:** reject owner-submitted `cibilScore`. Field does not exist.

### 8.4 MongoDB collections

```
users           { role, email }
shops           { name, category, city, yearsOpen, udyam?, vpa?, gstin?,
                  ownerFlags: { gender?, area? }, provenance }
rails           { shopId, type, trustClass, payload, provenance }
cashflows       { shopId, sourceRailId, t, inflow, outflow, payerId? }
applications    { shopId, requestedAmount, status }
decisions       { applicationId, verdict, principal, tenureMonths, rateBps,
                  cadence, conditions[], drivers[],
                  pAuth, pStress, maxEmi, policyVersion, modelVersions }
overrides       { decisionId, userId, reason, newTerms }
audit_logs      { at, actor, action, entity, payloadHash }
```

All money fields integers (paise) to avoid float bugs.

### 8.5 Python ML service

**Stack:** FastAPI, pandas, scikit-learn (HistGradientBoosting or LogisticRegression), joblib. Optional shap or simple permutation for drivers.

**Endpoints:**

```
GET  /health
POST /score
     body: { shop, rails[], cashflows[], requestedAmount, stressDelta? }
     resp: { pAuth, pStress, features, drivers[3],
             verdict, principal, tenureMonths, rateBps, cadence,
             conditions, maxEmi, maxPrincipal, policyVersion }
POST /explain   # optional, same as drivers
```

**Training** is offline (`notebooks/train.ipynb` or `ml/train.py`). Runtime only loads `models/auth.joblib`, `models/stress.joblib`, `models/meta.json`.

### 8.6 Feature builder (shared contract)

Python owns feature code. Node must **not** recompute a second set of features. Document the JSON schema in `ml/schema.json`.

### 8.7 Security (prototype-grade)

- No real PII.
- Role checks on lender routes.
- Don’t store uploaded PDF bytes if we can store `unverified: true` + filename; if we store files, local disk only, no public bucket.
- CORS locked to the Vite origin.

---

## 9. ML specification

### 9.1 Hypothesis (one or two sentences — useful even though Track 01 is not the research track)

Operational cashflow **plus rail authenticity** can separate fundable thin-file MSMEs from unfundable ones **better than a no-CIBIL reject rule**, without using bureau data, at a **measured** proxy-default cost on synthetic labels.

### 9.2 Model A — Authenticity

**Target:** `y_auth = 1` if seed shop marked `authentic_ops`, else `0` (mule / pdf_fraud / mismatch).

**Inputs (examples):** payer HHI, max_payer_share, round_amount_ratio, gst_upi_rel_gap, history_weeks, empty_then_spike, cash_share, rail_count_verified.

**Output:** `p_auth`. Thresholds in `meta.json`.

### 9.3 Model B — Stress / thin-file risk

**Target:** `y_stress = 1` if next synthetic lean period cannot cover a **reference EMI** (label from generator, not from CIBIL).

**Inputs (examples):**

- median_monthly_inflow, p10_weekly_inflow
- cv_weekly_inflow, slope_90d
- lean_month_ratio (worst4 / median4)
- outflow_ratio, residual_after_opex
- unique_payers, invoice_count
- weeks_on_vpa
- p_auth (optional stacked; or keep sequential)

**Leakage:** do not include requested amount as a “risk” feature in a way that auto-rejects large asks; capacity handles that.

### 9.4 Baseline

`baseline_verdict = DECLINE if no_cibil else ...`  
In this product **everyone** has no CIBIL, so baseline funds **0**. Evidence chart: we fund N shops; proxy default D% on holdout.

Second baseline (optional): “approve if median inflow > X” ignoring authenticity — show mule shop gets through baseline-2 but not us.

### 9.5 Metrics

- Funding rate vs baseline.
- Proxy default among funded.
- Precision/recall of Model A on fraud shops.
- Fairness: terms delta on twin shops (gender/area) < ε (e.g. ₹0 principal delta).
- Calibration sketch: reliability of p_stress (even if rough).

### 9.6 Explainability

Tree importances or SHAP on Model B; map top features to human strings:

- `lean_month_ratio` → “Worst month is 42% of a typical month”
- `max_payer_share` → “One payer is 81% of credits”
- `gst_upi_rel_gap` → “GST and UPI disagree by 40%”

### 9.7 Failure analysis (pitch slide)

Where we fail: brand-new genuine shops (short history), heavy cash kiranas, seasonal festival spikes mistaken for mules. State this; do not hide it.

### 9.8 Synthetic generator

`ml/generate_shops.py` creates 200+ shops:

- Templates: stable, seasonal, declining, mule, pdf_only, gst_mismatch, twin_fairness.
- All rows `provenance: synthetic`.
- Train/holdout split by `shop_id`.

---

## 10. UX structure

### 10.1 Owner — Apply

1. Shop profile  
2. Connect rails (simulated buttons: “Link AA (demo)”, “Import UPI CSV (demo)”, “GST summary (demo)”, “Upload PDF (unverified)”)  
3. Requested amount  
4. Submit  

### 10.2 Lender — Application detail (hero screen)

Layout:

- Header: shop, category, **No bureau file**, provenance chips  
- Left: trust panel + fraud flags  
- Centre: 90-day cashflow + lean highlight  
- Right: verdict, principal, tenure, rate, cadence, conditions  
- Bottom: drivers, stress slider, fairness toggle, override  

### 10.3 Evidence page

Two bars: Baseline funded 0 / Ours funded K. Table of holdout shops. Caption: synthetic labels.

---

## 11. Demo script (rounds 1–2, ~3 minutes)

1. **Hook:** “This kirana has never had a loan. CIBIL is empty. A bank rejects them.”  
2. **Owner:** show synthetic UPI + GST (badges). Apply ₹2L.  
3. **Lender:** baseline stamp REJECT. Our desk: trust high, lean surplus, **₹1.2L / 10 mo / 16% / weekly**.  
4. **Slider:** worsen lean weeks → limit falls.  
5. **PDF-only shop:** no full limit.  
6. **Mule shop:** high revenue, decline/down-term.  
7. **Fairness:** twin shops, same terms.  
8. **Evidence:** baseline vs us. “All data synthetic.”

If the lender screen is not clickable, the round is lost.

---

## 12. Pitch claims we will and will not make

**Will:**

- Fairer **process** for thin-file MSMEs: operations + rails + terms.
- Measured lift vs reject-if-no-CIBIL on **synthetic** data.
- Authenticity is a **gate**, not a vibe.

**Will not:**

- “RBI approved.”
- “We replaced CIBIL.”
- “0% fraud.”
- Real default prediction on live Indian MSMEs.

---

## 13. Implementation plan (4 people, 36 hours)

| Person | Owns | Done when |
|---|---|---|
| MERN-1 | Lender detail + charts + sliders | Demo path works on seed shop |
| MERN-2 | Owner apply + queue + auth stub + Mongo | Two roles can complete apply→score |
| ML | Generator, features, A/B models, `/score`, eval table | Holdout metrics in `ml/metrics.json` |
| Glue | Seed 6 demo shops, policy copy, provenance badges, pitch | Script timed < 3:30 |

**Order:** generator → `/score` on fixtures → lender UI → owner UI → fairness + evidence → polish.

**Cut if late:** owner pretty UI, SHAP, step-up, Docker. **Never cut:** trust panel, terms, synthetic labels, baseline.

---

## 14. Acceptance criteria

- [ ] No CIBIL field anywhere that influences the verdict.  
- [ ] PDF-only application cannot receive STANDARD full limit.  
- [ ] Verified synthetic kirana receives numeric **amount + tenure + rate**.  
- [ ] Stress slider changes terms without retrain.  
- [ ] Fairness twins differ by ≤ ε on principal and rate.  
- [ ] Baseline comparison visible.  
- [ ] Every cashflow UI marked synthetic.  
- [ ] Audit log row per score and override.  
- [ ] Hypothesis/policy sentence on a slide.  
- [ ] Failure cases named (new shop, cash-heavy, seasonality).

---

## 15. Open questions (resolve in hour 1)

- Product name.  
- Max ticket for demo (suggest ₹50k–₹3L).  
- Weekly vs monthly debit as default.  
- Whether GST is always present in the clean shop (recommend yes).  
- Exact haircut table (put in `policyVersion: v1`).

---

## 16. Repo layout (target)

```
spec.md                 ← this file
apps/web/               React SPA
apps/api/               Express
ml/                     FastAPI, train, generate, models/
data/seed/              demo shops JSON
README.md               how to run + synthetic disclaimer
```

---

## 17. Sources cited by the PS (for the slide, not to scrape)

- SIDBI and Crisil MSME Pulse, 2025  
- Press Information Bureau, December 2025 (Udyam count)  
- Track booklet: Finance F2, participant edition  

We do not need those datasets in the repo. We need the **story** and our **synthetic generator**.
