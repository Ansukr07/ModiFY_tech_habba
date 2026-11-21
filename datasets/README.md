# LangSmith demo dataset

`langsmith_demo.json` contains small, hand-authored synthetic inputs for the
ZeroCIBIL LangGraph workflow. All identifiers, businesses, and transactions are
fictional. Amounts are in paise, dates are fixed, and the examples contain no
personal or real financial data.

## Cases included

- No verified rail: should stop before normalization and explain an unverified outcome.
- Invalid schema: should route through the fail-closed handler.
- Owner-uploaded statement: should stay unverified and exercise document intake.
- Verified clean history: supplies 26 synthetic cashflow records to reach both scoring nodes, policy terms, and explanation.
- Duplicate records: exercises the data-quality signal and authenticity review route.

Each example has `inputs` for `build_graph().invoke(...)` and an `expected`
object intended as a LangSmith reference output. Some model-dependent outcomes
are deliberately expressed as allowed values or presence checks. Model scores
and gates can vary with the configured model artifacts or scorer fallback.

The JSON is a portable source file, not an uploaded LangSmith dataset. A setup
or evaluation script can load `examples`, pass each `inputs` object to the
graph, and map the corresponding `expected` object to its reference output.

Example local invocation after installing the project dependencies:

```python
import json
from pathlib import Path
from zerocibil.graph import build_graph

dataset = json.loads(Path("datasets/langsmith_demo.json").read_text())
graph = build_graph()
for example in dataset["examples"]:
    result = graph.invoke(example["inputs"])
    print(example["name"], result.get("status"), result.get("verdict"))
```

This is demo/evaluation data only. It is not training data, a credit policy,
or evidence that the models are calibrated for real businesses.

## Timing dataset

`langsmith_timing_demo.json` contains five valid applications, each with a
verified synthetic rail and 26 clean synthetic cashflow rows. The financial
pattern is intentionally held constant across cases so repeat-run timing is
comparable. Run names in LangSmith use the `timing-v1-` prefix.

The first traced batch completed all five workflows successfully. Local graph
invocation averaged about 66 ms per run; LangSmith recorded a mean root-run
duration of about 64 ms. The first run included model initialization and took
about 236 ms, while the remaining four took about 20–22 ms each. These timings
are specific to this machine and warm process.
