# ML and agent workflow

This document describes the implemented model training artifacts, LangGraph underwriting flow, and FastAPI scoring routes.
### Slide B — ML training and agent workflow

```mermaid
flowchart TB
  subgraph TRAIN["Offline training — implemented"]
    direction TB
    A["Berka PKDD'99 data<br/>Weekly stress features and next-four-week-net proxy label"]
    B["XGBoost stress model<br/>B-inflow and B-full variants"]
    C["IBM AML HI-Small<br/>Synthetic transaction labels"]
    D["XGBoost authenticity model<br/>Account-level suspicious-label target"]
    E[("joblib artifacts + meta.json<br/>Feature names and model versions")]
    F["Holdout reports and model cards<br/>Stress label is a proxy; scores uncalibrated"]
    A --> B --> E
    C --> D --> E
    E --> F
  end
  subgraph AGENT["LangGraph application workflow — implemented"]
    direction TB
    G["Validate schema, application and rails<br/>No verified rail → UNVERIFIED"]
    H["Optional bank statement intake<br/>Extract synthetic STMT rows<br/>Owner uploads remain unverified"]
    I["Normalize cashflows<br/>Quality checks, weekly features,<br/>reconciliation and B variant"]
    J["Authenticity model + evidence gate<br/>PASS, REVIEW or MORE_EVIDENCE"]
    K["Stress model: B-full with verified AA<br/>Otherwise B-inflow"]
    L["Capacity and versioned offer policy<br/>Terms or review outcome"]
    M["Reconstruct explanation and decision trace<br/>Append audit events"]
    N["Fail closed on validation, data quality<br/>or scoring errors; send to review"]
    G -->|Documents| H --> I
    G -->|No documents| I
    I --> J
    J -->|PASS| K --> L --> M
    J -->|REVIEW / MORE_EVIDENCE| L
    G -. Invalid .-> N --> M
    I -. Invalid data .-> N
    J -. Scoring failure .-> N
    K -. Scoring failure .-> N
  end
  subgraph SERVICE["FastAPI scoring and evaluation paths"]
    direction TB
    O["/internal/score<br/>Trained scores in response;<br/>heuristic policy sets verdict"]
    P["/internal/agent<br/>Invoke LangGraph; fallback to<br/>/score if graph raises"]
    Q["/internal/model-score<br/>Model + feature vector + variant"]
    R["/internal/fairness<br/>Compare paired verdicts and terms"]
    P --> O
    Q -. Loads artifacts .-> E
    R -. Separate evaluation .-> O
  end
  E -. Load artifacts .-> J
  E -. Load artifacts .-> K
  AGENT -->|Agent result| P
```

Training notebooks, saved artifacts and LangGraph are implemented. Berka stress labels are a proxy and IBM AML is synthetic. FastAPI heuristic-policy scoring and LangGraph model-driven gates are distinct paths.## Implementation notes

- Stress model artifacts are trained from Berka PKDD data using a next-four-week-net proxy target. The inference model supports `B-inflow` and `B-full` feature variants.
- The authenticity artifact is trained from IBM AML HI-Small account-level labels, which are synthetic.
- Model probabilities are not calibrated for Indian MSME or UPI outcomes.
- The LangGraph path applies the trained scores to authenticity and stress gates, then calculates capacity and policy terms.
- The FastAPI `/internal/score` path returns trained model scores as metadata while its verdict still uses heuristic policy. `/internal/agent` invokes the graph and falls back to ordinary scoring if graph execution raises.
- The lender remains responsible for the final credit decision.

## Code references

- `Agentic/graph.py` and `Agentic/agents/`
- `Agentic/tools/scoring.py` and `Agentic/tools/finance.py`
- `ml/artifacts.py`, `ml/model_features.py`, and `ml/models/meta.json`
- `ml/notebooks/` and `ml/reports/`

