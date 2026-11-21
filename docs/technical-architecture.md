# ZeroCIBIL technical architecture

## Full product architecture

```mermaid
flowchart LR
  Owner[MSME owner] --> Web[React web app<br/>Owner, bank and lender portals]
  Bank[Bank administrator] --> Web
  Lender[Lender analyst] --> Web
  Web --> API[Express API<br/>Access control, applications,<br/>verification and lender actions]
  API --> DB[(MongoDB<br/>Applications, evidence,<br/>decisions and audit)]
  API --> Score[FastAPI scoring service<br/>LangGraph intake and analysis,<br/>policy, explanation and scenarios]
  Models[(Trained model artifacts)] --> Score
  Score -->|Assessment and scenarios| API
  DB -->|Application and verified evidence| API
```

The bank account, transaction, rail, and statement data in this repository are synthetic. The trained authenticity and stress scores are exposed by the scoring service, while the policy verdict still uses versioned heuristics pending domain calibration. The lender makes the final credit decision; the scenario result does not overwrite the base assessment. MongoDB is the durable store when configured, with a process-local memory fallback for demos.

Source: the current React, Express and Python code, and `spec-new.md`. The full product diagram above reflects the current service boundaries. The older diagrams below retain their original prototype and proposed-target captions. Demo rail verification is simulated, not a production UPI, bank or Account Aggregator connection.

## Slide-ready versions

Use one diagram per 16:9 slide. The Mermaid versions run left to right in three columns. The exported images use a fixed 1920 × 1080 landscape canvas with three horizontal lanes. The full diagrams remain below for reference. Keep the caption under each diagram on its slide.


Landscape exports for PowerPoint (1920 × 1080):

- [Application and service flow — PNG](../output/architecture/application-service-flow-landscape.png) · [SVG](../output/architecture/application-service-flow-landscape.svg)
- [Proposed training and agents — PNG](../output/architecture/training-agent-architecture-landscape.png) · [SVG](../output/architecture/training-agent-architecture-landscape.svg)

SVG keeps lines and text sharp when resized. Each numbered lane continues left to right; error handling and evaluation boxes summarize separate branches.

### Slide A — Application and service flow

```mermaid
flowchart LR
  subgraph WEB["React 19 + Vite"]
    direction TB
    A["Owner application<br/>Shop details, demo rails<br/>Requested amount in paise"]
    B["Lender workspace<br/>Queue, evidence, assessment<br/>Scenarios, report and audit"]
    C["Browser API client<br/>Credentialed JSON requests<br/>Cookie session"]
    A --> C
    B --> C
  end
  subgraph API["Express API :4000"]
    direction TB
    D["Session, role and ownership<br/>Reject bureau fields<br/>Validate idempotency and revision"]
    E["Load application bundle<br/>Shop, rails and cashflows<br/>Call scoring with 8-second timeout"]
    F["Persist audit, then decision<br/>Update latest decision and status<br/>Cache idempotent response"]
    D --> E --> F
  N["Side paths<br/>No verified rail: UNVERIFIED<br/>Policy failure: DECLINE<br/>Service failure: audit + retryable 503<br/>Scenario: rescore copy, base unchanged<br/>Override: restricted action + reason + audit"]
    F -.-> N
  end
  subgraph SCORE["FastAPI :8000 + persistence"]
    direction TB
    G["POST /internal/agent: scoring alias<br/>Weekly features and evidence gates<br/>Authenticity, then stress heuristics"]
    H["Deterministic underwriting<br/>Lean surplus, haircut, capped principal<br/>Terms, drivers, template explanation"]
    I[("MongoDB / memory fallback<br/>Applications, rails, cashflows<br/>Decisions, overrides and audit")]
    G --> H
    H --> I
  end
  WEB -->|"HTTP"| API
  API -->|"Scoring"| SCORE
```

Implemented prototype with simulated evidence and heuristic-v0.

### Slide B — Proposed training and agent architecture

```mermaid
flowchart LR
  subgraph TRAIN["Offline Model B training â€” proposed"]
    direction TB
    A["Berka bank data: Czech, CZK<br/>Canonical weekly, scale-free features<br/>Stress label: next 4-week net below<br/>35% of own monthly inflow"]
    B["Account split 70 / 15 / 15, seed 42<br/>Logistic baseline + gradient boosting<br/>Grouped CV, validation calibration"]
    C[("Holdout ROC-AUC, PR-AUC, Brier<br/>Class balance + loan sanity check<br/>Joblib, metadata and model card")]
    A --> B --> C
  end
  subgraph AGENT["Typed LangGraph tools â€” proposed"]
    direction TB
    D["Validate application and pin versions<br/>Provenance, verified rails, identity<br/>Normalize and build weekly features"]
    E["Load versioned stress artifacts<br/>Model B-inflow or B-full by outflow rail<br/>Then authenticity: Model A or rules"]
    F["Investigate exceptions if needed<br/>GST / bank / UPI reconciliation<br/>Concentration, invoices, missing evidence"]
    G["Deterministic capacity and terms<br/>Lean month = worst 4-week net / 4 Ã— 52 / 12<br/>Policy haircut, EMI, principal, counteroffer"]
    D --> E --> F --> G
  end
  subgraph DELIVERY["Explanation, audit and evaluation"]
    direction TB
    H["Grounded explanation agent<br/>Drivers + versioned policy outputs<br/>Template fallback if LLM fails"]
    I["Audit before completion<br/>Hash, provenance, outputs, versions<br/>Lender owns final credit decision"]
    J["Separate evaluation routes<br/>Financial twins: identical terms<br/>Labelled baseline + scenario-only stress"]
    H --> I
    I -.-> J
  N["Failure controls<br/>No verified rail: UNVERIFIED<br/>Identity failure: review / decline<br/>Model or schema failure: fail closed<br/>Audit failure: retry, no completion"]
    I -.-> N
  end
  TRAIN -->|"Artifacts"| AGENT
  AGENT -->|"Result"| DELIVERY
```

Proposed target. Berka proxy data, trained models and LangGraph are not implemented claims.

## 1. Application and service flow — full detail

```mermaid
flowchart TB
  subgraph UI[React 19 + Vite browser application]
    OWNER[Shop owner]
    LENDER[Lender]
    LOGIN[Login and session restoration]
    APPLY[Owner application form\nShop details, demo rail, requested INR amount]
    QUEUE[Application queue]
    DESK[Assessment dashboard\nEvidence, terms, scenarios, audit and report]
    CLIENT[Credentialed fetch client\nINR converted to integer paise]
    OWNER --> LOGIN
    LENDER --> LOGIN
    LOGIN --> APPLY
    LOGIN --> QUEUE --> DESK
    APPLY --> CLIENT
    DESK --> CLIENT
  end

  subgraph API[Express API :4000]
    AUTH[Cookie session + role checks\nOwner isolation + request IDs]
    CREATE[POST /api/shops\nPOST /api/shops/:id/rails\nPOST /api/applications]
    READ[GET /api/applications\nGET /api/applications/:id]
    CHECK[Reject bureau fields\nIdempotency-Key + input revision check]
    SCORE[POST /api/applications/:id/score\nLoad shop, rails and cash flows]
    SCENARIO[POST /api/applications/:id/stress]
    OVERRIDE[POST /api/applications/:id/override\nReason required, restricted actions]
    SC[scoreClient.js\n8-second scoring timeout]
    WRITE[Audit success + insert decision\nSet latest_decision_id and assessed status\nCache idempotent response]
    FAIL[Mark application failed\nAudit failure + retryable 503]
    REPORT[Report + audit history\nEvidence summary + fairness evaluation]
  end
  CLIENT -->|HTTP /api with session cookie| AUTH
  AUTH --> CREATE
  AUTH --> READ
  AUTH --> CHECK --> SCORE --> SC
  AUTH --> SCENARIO --> SC
  AUTH --> OVERRIDE
  AUTH --> REPORT

  subgraph PY[FastAPI scoring service :8000]
    ENTRY[POST /internal/agent\nCurrent alias for run_score]
    VALIDATE[Pydantic request schema\nShop, rails, cashflows, requested paise]
    FEATURES[features.py\nWeekly aggregation and cash-flow features]
    POLICY[policy.py\nIdentity and verified-rail gates\nAuthenticity and stress heuristics\nCapacity and terms]
    EXPLAIN[explain.py\nDeterministic drivers + template explanation]
    RESULT[Structured result\nVerdict, principal, rate, tenure, cadence\nInput hash and version metadata]
    STRESS[POST /stress-test\nCopy and adjust cash-flow rows\nRescore with scenario_only true]
    HEALTH[GET /health\nheuristic-v0, policy v1, schema 1.0]
    ENTRY --> VALIDATE --> FEATURES --> POLICY --> EXPLAIN --> RESULT
    STRESS --> VALIDATE
  end
  SC -->|Assessment| ENTRY
  SC -->|Scenario| STRESS
  SC -->|Health probe, 3-second timeout| HEALTH
  RESULT -->|Assessment result| WRITE
  RESULT -->|Scenario result, no saved base decision| DESK
  SC -->|Unavailable or invalid service response| FAIL
  WRITE --> DESK
  OVERRIDE --> WRITEOV[Store override + audit\nRetain original decision linkage]

  DB[(MongoDB\nusers, shops, rails, cashflows\napplications, decisions, overrides\naudit_logs, idempotency)]
  MEMORY[(In-memory fallback\nProcess-local and non-durable)]
  CREATE --> DB
  READ --> DB
  SCORE -->|Read bundle| DB
  WRITE --> DB
  WRITEOV --> DB
  REPORT --> DB
  DB -. Startup connection failure .-> MEMORY
```

## 2. Current scoring and underwriting decisions

This is the implemented policy order, including early returns. It differs from the target spec: low authenticity currently stops evaluation before the stress heuristic runs.

```mermaid
flowchart TD
  INPUT[Application payload\nAll monetary values in paise]
  FEATURE[Weekly features\nRolling four-week net, history length\nPayer concentration, GST gap and rail count]
  ID{Identity mismatch?}
  COMPLETE{Identity complete?}
  VERIFIED{At least one verified rail?}
  AUTH[heuristic_p_auth\nAuthenticity band from metadata]
  LOW{Authenticity LOW?}
  STRESS[heuristic_p_stress\nStress band from metadata]
  TRUST[trust_high = at least two verified rails\nand HIGH authenticity]
  CAP[Worst rolling four-week net / 4\nWeekly capacity × policy haircut]
  POS{Positive repayment capacity?}
  RISK{HIGH stress and weak trust?}
  TERMS[Map trust, history and stress\nto verdict, rate, tenure and cadence]
  PV[Present value of affordable repayments\nApply ticket ceiling]
  MIN[Principal = min requested, maximum principal\nFlag counteroffer when requested exceeds capacity]
  CONDITIONS[Conditions from trust, GST mismatch\nand payer concentration]
  DECLINE[DECLINE\nZero principal and repayment terms]
  UNVERIFIED[UNVERIFIED\nZero offer, request evidence]
  RESPONSE[Explain and return structured result\nAPI writes audit and decision]
  INPUT --> FEATURE --> ID
  ID -->|Yes| DECLINE
  ID -->|No| COMPLETE
  COMPLETE -->|No| UNVERIFIED
  COMPLETE -->|Yes| VERIFIED
  VERIFIED -->|No| UNVERIFIED
  VERIFIED -->|Yes| AUTH --> LOW
  LOW -->|Yes| DECLINE
  LOW -->|No| STRESS --> TRUST --> CAP --> POS
  POS -->|No| DECLINE
  POS -->|Yes| RISK
  RISK -->|Yes| DECLINE
  RISK -->|No| TERMS --> PV --> MIN --> CONDITIONS --> RESPONSE
  DECLINE --> RESPONSE
  UNVERIFIED --> RESPONSE
```

## 3. Proposed training and agent architecture

Everything in this diagram is a target from `spec-new.md`, except the shared feature and deterministic policy components that already have prototype implementations. No trained-model accuracy or live MSME outcome is asserted.

```mermaid
flowchart TB
  subgraph TRAIN[Offline training, never on an inference request]
    BERKA[Public Berka bank transactions\nAnonymized Czech accounts, CZK, 1993–98]
    CANON[Canonical schema\nWeekly series and scale-free features]
    LABEL[Proxy stress label\nNext four-week net below reference EMI\nReference EMI = 0.35 × own monthly inflow]
    SPLIT[Account-group split\n70% train / 15% validation / 15% test\nSeed 42, cutoff weights]
    FIT[Logistic regression baseline\nHistogram gradient boosting\nGrouped cross-validation]
    CAL[Validation calibration + thresholds]
    EVAL[Held-out ROC-AUC, PR-AUC, Brier\nClass balance and account counts\nLoan-status sanity check]
    ART[(stress.joblib + meta.json\nSchema and model versions\nMetrics and model card)]
    ADATA[Authenticity labels unresolved\nIBM synthetic AML or explicit rule fallback]
    AMODEL[Model A or documented rules\nIndependent authenticity estimate]
    BERKA -.-> CANON -.-> LABEL -.-> SPLIT -.-> FIT -.-> CAL -.-> EVAL -.-> ART
    ADATA -.-> AMODEL
  end

  subgraph AGENT[Proposed LangGraph typed state and allowlisted tools]
    LOAD[Load and validate application\nPin input, schema and policy versions]
    PROV{Verified rails present?}
    MORE[UNVERIFIED or data-quality result\nRequest additional evidence]
    WEEK[Normalize rails and build weekly features]
    IDENT{Identity and rail hard checks pass?}
    REVIEW[Human review or policy decline]
    VARIANT{Outflow rail available?}
    BINFLOW[Model B-inflow\nMissing-expense flags + inflow-only label]
    BFULL[Model B-full\nNet cash-flow dynamics]
    AUTH2[Authenticity tool\nModel A or explicit rules]
    EXCEPT[Investigator agent\nReconcile GST / bank / UPI mismatches\nCheck concentration and invoice evidence]
    ENGINE[Deterministic underwriting tool\nLean monthly surplus = worst four-week net / 4 × 52 / 12\nPolicy haircut, affordable EMI, capped principal]
    TERM[Versioned terms and counteroffer]
    PRESENT[Explanation agent / terms presenter\nUse structured drivers and policy outputs]
    FALLBACK[Template explanation if LLM fails]
    AUDIT[Write audit event\nInput hash, versions, outputs, provenance]
    DONE[Lender assessment\nLender remains accountable for final decision]
    LOAD -.-> PROV
    PROV -. No .-> MORE
    PROV -. Yes .-> WEEK -.-> IDENT
    IDENT -. No .-> REVIEW
    IDENT -. Yes .-> VARIANT
    VARIANT -. No .-> BINFLOW
    VARIANT -. Yes .-> BFULL
    BINFLOW -.-> AUTH2
    BFULL -.-> AUTH2
    AUTH2 -. Exceptions .-> EXCEPT
    AUTH2 -. Clear .-> ENGINE
    EXCEPT -. Structured findings .-> ENGINE
    ENGINE -.-> TERM -.-> PRESENT
    MORE -.-> PRESENT
    REVIEW -.-> PRESENT
    PRESENT -. LLM unavailable .-> FALLBACK -.-> AUDIT
    PRESENT -. Grounded explanation .-> AUDIT -. Success .-> DONE
    AUDIT -. Write failed .-> RETRY[Operational error and retry\nDo not report completion]
    LOAD -. Parser or schema failure .-> MORE
    BINFLOW -. Model unavailable .-> CLOSED[Retry or manual review\nFail closed for full underwriting]
    BFULL -. Model unavailable .-> CLOSED
  end
  ART -. Load versioned artifacts .-> BINFLOW
  ART -. Load versioned artifacts .-> BFULL
  AMODEL -.-> AUTH2

  subgraph EVALUATION[Separate evaluation and scenario routes]
    TWINS[Exact financial twins\nChange protected fixture flags only]
    SAME[Compare verdict, principal, rate, tenure, cadence\nTarget zero differences]
    BASE[Baseline: no bureau history means decline\nCompare funded counts on labelled demo cohort]
    WHATIF[Revenue or expense scenario\nRecalculate capacity, scenario_only true\nNo retraining or base-loan mutation]
    TWINS -.-> SAME
  end
  ENGINE -. Separate fairness evaluation .-> TWINS
  TERM -.-> BASE
  ENGINE -.-> WHATIF
```

## Boundaries and implementation gaps

- Browser route guards support navigation; the Express API enforces sessions, roles and ownership on its routes.
- FastAPI currently exposes scoring routes without its own authentication. Internal network restriction or service authentication is a deployment requirement, not an implemented control shown here.
- MongoDB failure currently falls back to non-durable memory. Audit and decision writes are sequential, not a database transaction.
- The current stress endpoint adjusts every supplied cash-flow row. A lean-window-only adjustment is a proposed refinement, not current behavior.
- The current service labels results synthetic and uses `heuristic-v0`. Trained B-inflow/B-full artifacts, calibration and LangGraph agents remain proposed.
- Protected attributes belong only in fairness fixtures. Agents must never change probabilities, thresholds, haircuts or credit decisions.
- There is no live disbursal, production AA/GST integration or validated Indian MSME default prediction in this architecture.

## Code references

- `apps/web/src/data/api.js`, `apps/web/src/pages/OwnerApply.jsx`, `apps/web/src/pages/LenderDesk.jsx`
- `apps/api/src/createApp.js`, `apps/api/src/scoreClient.js`, `apps/api/src/store.js`, `apps/api/src/index.js`
- `ml/service.py`, `ml/features.py`, `ml/policy.py`, `ml/explain.py`, `ml/models/meta.json`
- `spec-new.md`, sections 3–8, 10–18 and 22–24
