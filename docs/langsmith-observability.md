# LangSmith observability

The agent graph and ML service emit LangSmith runs when tracing is enabled.
The graph records node and routing runs; nested spans identify scoring,
feature construction, finance, audit, document, and decision-trace reconstruction operations.

## Configure

Install the Python service dependencies, then set these variables in the
environment that runs `ml/service.py`:

```text
LANGSMITH_TRACING=true
LANGSMITH_API_KEY=<workspace API key>
LANGSMITH_PROJECT=zerocibil
LANGSMITH_ENDPOINT=https://api.smith.langchain.com
```

LangSmith also recognizes the legacy `LANGCHAIN_TRACING_V2`,
`LANGCHAIN_API_KEY`, and `LANGCHAIN_PROJECT` names. Keep keys in the runtime
environment or secret manager; never commit them.

By default, trace metadata includes a one-way application ID hash, policy and
feature schema versions, and node/tool names. Decorated function inputs are
scrubbed before they reach LangSmith. Model inference spans retain only the
prediction and model version; the scoring node retains its score, band, and
gate. Feature vectors and raw statement/document inputs are omitted. Review
your organization's data handling requirements before enabling tracing on
real applications.

## Prepare runs for evaluation

Use a stable `LANGSMITH_PROJECT` per environment. Graph runs are tagged with
`zerocibil`, `agentic`, and `ml`; add comma-separated values in
`LANGSMITH_TAGS` to distinguish experiments. Run metadata records the policy
version, feature schema, and a hashed application identifier so datasets can
be linked to reproducible synthetic cases without exposing the raw ID.

LangSmith tracing does not create evaluation datasets or run evaluators.
Once representative labeled cases are ready, create datasets and attach
evaluators to these named traces.
