import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { Mark } from "../components/Mark.jsx";
import { Skeleton, SkeletonBlock } from "../components/Skeleton.jsx";
import { useAuth } from "../auth.jsx";
import { api, idem } from "../data/api.js";
import { downloadTextPdf } from "../data/downloadPdf.js";
import { approvalPriority } from "../data/approvalPriority.js";
import { paiseToInr, verdictLabel } from "../data/seed.js";
import { weeklyCashflow } from "../data/weeklyCashflow.js";
import { AmountComparison } from "../components/DeskCharts.jsx";
import { AssessmentGlance, EvidenceBoard } from "../components/CaseGlance.jsx";
import { StatementGraph } from "../components/StatementGraph.jsx";
import "../dashboard.css";

function needsDecisionRefresh(decision) {
  if (!decision) return false;
  if (decision.capacity?.max_principal_paise == null) return true;
  return decision.principal_paise > 0 && [decision.tenure_months, decision.rate_bps, decision.cadence, decision.repayment_amount_paise, decision.repayment_periods, decision.total_repayment_paise, decision.total_interest_paise].some((value) => value == null || value === 0 || value === "");
}

function assessmentNarrative(decision, requestedPaise) {
  if (!decision) return "";
  const cap = decision.capacity || {};
  const basis = cap.retention_basis || {};
  const sentences = [];
  if (decision.p_auth == null && decision.p_stress == null) {
    sentences.push(decision.not_run_reason ? `Assessment stopped: ${decision.not_run_reason.replaceAll("_", " ")}.` : "Models were not run.");
  } else {
    const auth = decision.p_auth == null ? "not scored" : `${Math.round(decision.p_auth * 100)}% (${decision.authenticity_band || "band unavailable"})`;
    const stress = decision.p_stress == null ? "not scored" : `${Math.round(decision.p_stress * 100)}% (${decision.risk_band || "band unavailable"})`;
    sentences.push(`Authenticity is ${auth}. Lean-period stress is ${stress}.`);
  }
  if (decision.p_auth != null && decision.verified_rail_count != null) {
    const needed = basis.required_verified_rails || 2;
    const railLabel = decision.verified_rail_count === 1 ? "1 verified rail" : `${decision.verified_rail_count} verified rails`;
    const meet = decision.verified_rail_count >= needed ? (decision.verified_rail_count === 1 ? "meets" : "meet") : (decision.verified_rail_count === 1 ? "does not meet" : "do not meet");
    sentences.push(`${railLabel} ${meet} the high-trust requirement of ${needed}.`);
  }
  if (cap.lean_surplus_paise != null) sentences.push(`The weakest four weeks leave ${paiseToInr(cap.lean_surplus_paise)} of weekly surplus.`);
  if (decision.principal_paise > 0) {
    const terms = decision.tenure_months && decision.rate_bps ? ` over ${decision.tenure_months} months at ${(decision.rate_bps / 100).toFixed(1)}%, ${paiseToInr(decision.repayment_amount_paise)} each ${decision.cadence || "period"}` : "";
    const versus = requestedPaise > decision.principal_paise ? `, below the ${paiseToInr(requestedPaise)} request` : "";
    const conservative = basis.high_trust_gate_met === false ? " This keeps the conservative 18% share until a second verified rail is on file." : "";
    sentences.push(`We can give ${paiseToInr(decision.principal_paise)}${terms}${versus}.${conservative}`);
  } else if ((cap.lean_surplus_paise || 0) > 0 && decision.not_run_reason === "trust_gate_no_capacity") {
    sentences.push("Surplus is positive, but this saved result kept a zero share. Run the assessment again to calculate the conservative amount we can give.");
  } else if (decision.not_run_reason) {
    sentences.push(`No amount to give: ${decision.not_run_reason.replaceAll("_", " ")}.`);
  } else {
    sentences.push("No positive amount on this assessment.");
  }
  return sentences.join(" ");
}

const FEATURE_LABELS = {
  feature_schema_version: "Feature schema",
  payer_hhi: "Payer concentration",
  max_payer_share: "Largest payer share",
  round_amount_ratio: "Round-amount share",
  gst_upi_rel_gap: "GST versus UPI gap",
  history_weeks: "Weeks with activity",
  empty_then_spike: "Quiet period then a spike",
  rail_count_verified: "Verified rails used in features",
  median_monthly_inflow: "Median monthly inflow",
  p10_weekly_inflow: "Low weekly inflow",
  cv_weekly_inflow: "Week-to-week inflow variation",
  slope_90d: "Recent inflow slope",
  lean_month_ratio: "Lean period versus a typical period",
  outflow_ratio: "Outflow share of inflow",
  residual_after_opex: "Inflow left after outflows",
  unique_payers: "Unique payers",
  invoice_count: "GST records",
  weeks_on_vpa: "Weeks on the payment ID",
  worst_4_week_net_paise: "Weakest four-week net",
  worst_4_week_start: "Weakest period starts",
  worst_4_week_end: "Weakest period ends",
  worst_4_week_dates: "Weeks in the weakest period",
  typical_4_week_net_paise: "Typical four-week net",
};
const SHARE_FEATURES = new Set(["payer_hhi", "max_payer_share", "round_amount_ratio", "gst_upi_rel_gap", "cv_weekly_inflow", "lean_month_ratio", "outflow_ratio"]);

function showValue(key, value) {
  if (value == null || value === "") return "Not returned";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.length ? value.map((item) => typeof item === "object" ? (item.message || item.code || item.text || JSON.stringify(item)) : String(item)).join(", ") : "None";
  if (typeof value === "number" && (String(key).endsWith("_paise") || ["median_monthly_inflow", "p10_weekly_inflow", "residual_after_opex"].includes(key))) return paiseToInr(value);
  if (typeof value === "number" && SHARE_FEATURES.has(key)) return `${Math.round(value * 1000) / 10}%`;
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : String(Math.round(value * 1000) / 1000);
  return String(value).replaceAll("_", " ");
}

function ReturnedAssessment({ decision, scenario }) {
  if (!decision) return <section className="dashboard-detail-card"><h2>Model and agent return</h2><p>Run an assessment to see the fields the scorer returns.</p></section>;
  const features = decision.features || {};
  const explanation = decision.explanation || {};
  const intake = decision.statement_intake || {};
  const detail = decision.agent_detail || {};
  const agentExplanation = detail.explanation || {};
  const vectors = decision.model_input || {};
  const versions = decision.versions || {};
  return <div className="dashboard-detail-grid dashboard-payload">
    <section className="dashboard-detail-card"><h2>Model and agent return</h2>
      <p>Fields from the scoring response that sit outside the summary, terms, and capacity steps.</p>
      <dl>
        <dt>Application id</dt><dd>{decision.application_id || decision.applicationId || "Not returned"}</dd>
        <dt>Provenance</dt><dd>{decision.provenance || "Not returned"}</dd>
        <dt>Identity state</dt><dd>{showValue("identity_state", decision.identity_state)}</dd>
        <dt>Agent status</dt><dd>{showValue("agent_status", decision.agent_status)}</dd>
        <dt>Authenticity gate</dt><dd>{showValue("auth_gate", decision.auth_gate)}</dd>
        <dt>Counteroffer flag</dt><dd>{decision.counteroffer == null ? "Not returned" : decision.counteroffer ? "Yes" : "No"}</dd>
        <dt>Target definition</dt><dd>{showValue("target_definition", decision.target_definition)}</dd>
        <dt>Reference installment</dt><dd>{decision.reference_emi_paise == null ? "Not returned" : paiseToInr(decision.reference_emi_paise)}</dd>
        <dt>Feature schema</dt><dd>{versions.feature_schema || "Not returned"}</dd>
        <dt>Generator</dt><dd>{versions.generator || "Not returned"}</dd>
        <dt>Scenario only</dt><dd>{decision.scenario_only ? "Yes" : "No"}</dd>
        <dt>Input hash</dt><dd>{decision.input_hash || "Not returned"}</dd>
      </dl>
      <h3>Workflow</h3>
      {decision.workflow_trace?.length ? <ol>{decision.workflow_trace.map((step, index) => <li key={`${step}-${index}`}>{showValue("step", step)}</li>)}</ol> : <p>Workflow trace was not returned. Reassess to record the agent path.</p>}
      <details>
        <summary>Returned explanation text</summary>
        <p>{explanation.lender || "Lender explanation was not returned."}</p>
        <p>{explanation.owner || "Owner explanation was not returned."}</p>
        <p>Sources: {explanation.source_references?.join(", ") || "Not returned"}. Template fallback: {explanation.fallback_used == null ? "Not returned" : explanation.fallback_used ? "Yes" : "No"}.</p>
      </details>
      {agentExplanation.lender_text && <p>Agent lender text: {agentExplanation.lender_text}</p>}
      {agentExplanation.owner_text && <p>Agent owner text: {agentExplanation.owner_text}</p>}
      <h3>Flags and requests</h3>
      <p>Flags: {showValue("flags", decision.flags)}. Verification requests: {showValue("verification_requests", decision.verification_requests)}.</p>
    </section>
    <section className="dashboard-detail-card"><h2>Feature values</h2>
      <dl>{Object.keys(features).length ? Object.entries(features).map(([key, value]) => <div key={key}><dt>{FEATURE_LABELS[key] || key.replaceAll("_", " ")}</dt><dd>{showValue(key, value)}</dd></div>) : <div><dt>Features</dt><dd>Not returned</dd></div>}</dl>
      <h3>Model inputs</h3>
      <p>Rows excluded from authenticity: {vectors.auth_excluded_rows ?? "Not returned"}. Stress history insufficient: {vectors.stress_insufficient_history == null ? "Not returned" : vectors.stress_insufficient_history ? "Yes" : "No"}.</p>
      <dl>{Object.entries(vectors.auth || {}).map(([key, value]) => <div key={`auth-${key}`}><dt>Auth {FEATURE_LABELS[key] || key.replaceAll("_", " ")}</dt><dd>{showValue(key, value)}</dd></div>)}{Object.entries(vectors.stress || {}).map(([key, value]) => <div key={`stress-${key}`}><dt>Stress {key.replaceAll("_", " ")}</dt><dd>{showValue(key, value)}</dd></div>)}{!vectors.auth && !vectors.stress && <div><dt>Vectors</dt><dd>Not returned</dd></div>}</dl>
      {intake.document_id && <><h3>Statement intake</h3><dl><dt>Document</dt><dd>{intake.document_id}</dd><dt>Source</dt><dd>{showValue("source", intake.source)}</dd><dt>Provenance</dt><dd>{showValue("provenance", intake.provenance)}</dd><dt>SHA-256</dt><dd>{intake.sha256 || "Not returned"}</dd></dl></>}
    </section>
    {(Object.keys(detail).length > 0 || scenario) && <section className="dashboard-detail-card"><h2>Agent detail{scenario ? " and scenario" : ""}</h2>
      {detail.feature_variant && <p>Feature variant: {detail.feature_variant}.</p>}
      {detail.missing_features && <p>Missing features: {showValue("missing_features", detail.missing_features)}.</p>}
      {detail.data_quality && <p>Data quality: {detail.data_quality.passed == null ? "returned" : detail.data_quality.passed ? "passed" : "not passed"}{detail.data_quality.duplicate_count != null ? ` · duplicates ${detail.data_quality.duplicate_count}` : ""}{detail.data_quality.invalid_row_indexes?.length ? ` · invalid rows ${detail.data_quality.invalid_row_indexes.join(", ")}` : ""}.</p>}
      {detail.reconciliation && <p>Agent reconciliation: status {showValue("status", detail.reconciliation.status)}{detail.reconciliation.gap == null ? "" : ` · gap ${Math.round(detail.reconciliation.gap * 1000) / 10}%`}{detail.reconciliation.gst_paise != null ? ` · GST ${paiseToInr(detail.reconciliation.gst_paise)}` : ""}{detail.reconciliation.digital_paise != null ? ` · digital ${paiseToInr(detail.reconciliation.digital_paise)}` : ""}{detail.reconciliation.flag != null ? ` · review flag ${detail.reconciliation.flag ? "yes" : "no"}` : ""}.</p>}
      {detail.supporting_signals?.length > 0 && <ul>{detail.supporting_signals.map((signal, index) => <li key={index}>{signal.code || "Signal"}{signal.message ? `: ${signal.message}` : ""}{signal.gap != null ? ` · gap ${signal.gap}` : ""}</li>)}</ul>}
      {detail.authenticity_flags?.length > 0 && <p>Authenticity flags: {showValue("flags", detail.authenticity_flags)}.</p>}
      {detail.stress_drivers?.length > 0 && <p>Stress drivers: {showValue("drivers", detail.stress_drivers)}.</p>}
      {detail.invoice_evidence && <p>Documents seen: {detail.invoice_evidence.count ?? "unknown"} · trust {showValue("trust_class", detail.invoice_evidence.trust_class)}.</p>}
      {detail.invoice_evidence?.documents?.length > 0 && <ul>{detail.invoice_evidence.documents.map((document, index) => <li key={document.document_id || index}>{document.filename || document.document_id || "Document"} · {showValue("status", document.status)}{document.row_count != null ? ` · ${document.row_count} rows` : ""}</li>)}</ul>}
      {detail.human_review && <p>Human review: {detail.human_review.required ? "required" : "not required"}{detail.human_review.reason ? ` · ${detail.human_review.reason}` : ""}.</p>}
      {detail.errors?.length > 0 && <ul>{detail.errors.map((item, index) => <li key={index}>{item.code}: {item.message}</li>)}</ul>}
      {detail.model_versions && <p>Agent model versions: {Object.entries(detail.model_versions).map(([key, value]) => `${key} ${value}`).join(" · ")}.</p>}
      {detail.provenance_summary && <p>Provenance counts: {Object.entries(detail.provenance_summary).map(([key, value]) => `${key} ${value}`).join(" · ")}.</p>}
      {scenario && <><h3>Illustrative scenario return</h3><p>Scenario only: {scenario.scenario_only ? "Yes" : "Not returned"}. Assumptions: inflow {scenario.scenario_assumptions?.lean_inflow_delta_pct ?? "not returned"}% · outflow {scenario.scenario_assumptions?.outflow_delta_pct ?? "not returned"}% · base decision {scenario.scenario_assumptions?.base_decision_id || "not returned"}.</p><p>Scenario authenticity {scenario.p_auth == null ? "not returned" : `${Math.round(scenario.p_auth * 100)}% ${scenario.authenticity_band || ""}`.trim()} · stress {scenario.p_stress == null ? "not returned" : `${Math.round(scenario.p_stress * 100)}% ${scenario.risk_band || ""}`.trim()} · identity {showValue("identity_state", scenario.identity_state)}.</p>{scenario.model_scores && <p>Scenario trained scores: authenticity {scenario.model_scores.p_auth == null ? "unavailable" : `${Math.round(scenario.model_scores.p_auth * 100)}%`} · stress {scenario.model_scores.p_stress == null ? "unavailable" : `${Math.round(scenario.model_scores.p_stress * 100)}%`}.</p>}{scenario.explanation?.lender && <p>{scenario.explanation.lender}</p>}</>}
    </section>}
  </div>;
}

function PriorityRows({ rows, action }) {
  return <ol>{rows.map((row, index) => <li key={row.item._id}><Link className="dashboard-priority-row" to={row.ready ? `/application/${row.item._id}/actions` : `/application/${row.item._id}`}><span className="dashboard-priority-rank">{index + 1}</span><span className="dashboard-priority-business"><strong>{row.item.shop_name || row.item.shopId}</strong><small>{row.item.business_type || "Business"} · {row.item._id.slice(0, 8)}</small></span><span className="dashboard-priority-reasons">{row.reasons.join(" · ")}</span><span className="dashboard-priority-amount">{typeof row.amount === "number" ? paiseToInr(row.amount) : "Offer on file"}</span><span className={`dashboard-status ${row.ready ? "dashboard-status-assessed" : ""}`}>{action}</span><span className="dashboard-row-arrow" aria-hidden="true">→</span></Link></li>)}</ol>;
}

function ApprovalPriority({ items, loading }) {
  const { ready, waitingOnBank } = approvalPriority(items);
  const listed = ready.length + waitingOnBank.length;
  return <section className="dashboard-priority" aria-label="Best applications to approve">
    <div className="dashboard-queue-heading">
      <div>
        <h2>Best to approve on this page</h2>
        <p>Positive offers on the loaded page are ranked by verdict, authenticity, then lean-period stress. Approve now is available only when the assessment is current and the bank check is confirmed. These signals are uncalibrated.</p>
      </div>
      <span>{loading ? <Skeleton className="dashboard-queue-count" /> : `${ready.length} ready`}</span>
    </div>
    {loading && !items.length ? <SkeletonBlock className="dashboard-priority-skeleton" label="Loading approval priority">{[0, 1, 2].map((row) => <Skeleton key={row} />)}</SkeletonBlock> : listed ? <>
      {ready.length > 0 && <div><h3>Approve now</h3><PriorityRows rows={ready} action="Approve now" /></div>}
      {waitingOnBank.length > 0 && <div><h3>Confirm the bank check first</h3><PriorityRows rows={waitingOnBank} action="Confirm bank check" /></div>}
    </> : <p className="dashboard-priority-empty">No positive offer is waiting for a lender decision.</p>}
  </section>;
}

export function LenderDesk() {
  const { id: routeId, section: routeSection } = useParams();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { logout } = useAuth();
  const [items, setItems] = useState([]);
  const [queueTotal, setQueueTotal] = useState(0);
  const [queueMeta, setQueueMeta] = useState({ workflow_counts: {}, verified_rail_applications: 0 });
  const [queueCursor, setQueueCursor] = useState(null);
  const [queueNextCursor, setQueueNextCursor] = useState(null);
  const [queueCursors, setQueueCursors] = useState([null]);
  const [queuePage, setQueuePage] = useState(0);
  const [queueLoading, setQueueLoading] = useState(true);
  const [bundle, setBundle] = useState(null);
  const [lean, setLean] = useState(0);
  const [outflow, setOutflow] = useState(0);
  const [scenario, setScenario] = useState(null);
  const [error, setError] = useState("");
  const [queueError, setQueueError] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState("");
  const [reason, setReason] = useState("");
  const [reducedAmount, setReducedAmount] = useState("");
  const [evidenceType, setEvidenceType] = useState("");
  const [audit, setAudit] = useState(null);
  const [report, setReport] = useState(null);
  const section = routeSection || "evidence";
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [verdictFilter, setVerdictFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState("oldest_unreviewed");
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [fairness, setFairness] = useState(null);
  const scenarioRequest = useRef(0);
  const scenarioTimer = useRef(null);
  const decisionNeedsRefresh = needsDecisionRefresh(bundle?.decision);
  const id = routeId || "";
  const isQueue = pathname === "/queue";
  const refreshQueue = (cursor = queueCursor) => {
    const params = new URLSearchParams({ limit: "100" });
    if (cursor) params.set("cursor", cursor);
    return api(`/applications?${params}`).then((result) => {
      setItems(result.items);
      setQueueTotal(result.total ?? result.items.length);
      setQueueMeta({ workflow_counts: result.workflow_counts || {}, verified_rail_applications: result.verified_rail_applications ?? result.items.filter((item) => item.verified_rail_count > 0).length });
      setQueueCursor(cursor);
      setQueueNextCursor(result.next_cursor);
      setQueueError("");
    }).catch((e) => setQueueError(e.message)).finally(() => setQueueLoading(false));
  };
  const nextQueuePage = () => {
    if (!queueNextCursor) return;
    const cursors = [...queueCursors.slice(0, queuePage + 1), queueNextCursor];
    setQueueCursors(cursors);
    setQueuePage(queuePage + 1);
    refreshQueue(queueNextCursor);
  };
  const previousQueuePage = () => {
    if (!queuePage) return;
    const previousPage = queuePage - 1;
    setQueuePage(previousPage);
    refreshQueue(queueCursors[previousPage]);
  };
  const refresh = () => api(`/applications/${id}`).then(setBundle).catch((e) => setError(e.message));
  async function prepareDemo() {
    setBusy(true); setQueueError("");
    try {
      const seeded = await api("/admin/seed", { method: "POST" });
      for (const application of seeded.applications || []) {
        if (!application.latest_decision_id) await api(`/applications/${application._id}/score`, { method: "POST", headers: { "Idempotency-Key": idem() }, body: JSON.stringify({ expected_input_revision: application.input_revision }) });
      }
      await refreshQueue();
      setSummary(await api("/evidence/summary"));
      setSummaryLoading(false);
    } catch (e) { setQueueError(e.message); }
    finally { setBusy(false); }
  }
  useEffect(() => { refreshQueue(); }, []);
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  useEffect(() => { api("/evidence/summary").then(setSummary).catch(() => {}).finally(() => setSummaryLoading(false)); }, []);
  useEffect(() => { scenarioRequest.current++; clearTimeout(scenarioTimer.current); setBundle(null); setError(""); setScenario(null); setLean(0); setOutflow(0); setAudit(null); setReport(null); if (id) refresh(); return () => clearTimeout(scenarioTimer.current); }, [id]);
  useEffect(() => {
    if (!report || !id) return;
    const recheck = async () => {
      try {
        const [latest, currentReport] = await Promise.all([api(`/applications/${id}`), api(`/applications/${id}/report`)]);
        setBundle(latest);
        const matches = currentReport.decision_id === latest.decision?._id
          && currentReport.decision_input_revision === latest.application.input_revision
          && !currentReport.stale_evidence
          && (currentReport.effective_action?.audit_reference || null) === (latest.latest_action?.audit_reference || null);
        setReport((saved) => saved && { ...saved, stale_evidence: !matches });
      } catch { setReport((saved) => saved && { ...saved, stale_evidence: true }); }
    };
    const onVisibility = () => { if (document.visibilityState === "visible") recheck(); };
    window.addEventListener("focus", recheck);
    document.addEventListener("visibilitychange", onVisibility);
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") recheck(); }, 15000);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", recheck); document.removeEventListener("visibilitychange", onVisibility); };
  }, [!!report, id]);
  const weeks = useMemo(() => weeklyCashflow(bundle?.cashflows), [bundle]);
  async function score() {
    setBusy(true); setError("");
    try { await api(`/applications/${id}/score`, { method: "POST", headers: { "Idempotency-Key": idem() }, body: JSON.stringify({ expected_input_revision: bundle.application.input_revision, policy_version: "v1" }) }); await refresh(); await refreshQueue(); setReport(null); setAudit(null); if (section !== "reasons") navigate(`/application/${id}/reasons`); }
    catch (e) { setError(e.code === "STALE_REVISION" ? "Evidence changed. Refresh this case, then run the assessment again." : e.retryable ? `${e.message} You can retry this assessment.` : e.message); } finally { setBusy(false); }
  }
  function stress(leanValue, outflowValue) {
    const request = ++scenarioRequest.current;
    clearTimeout(scenarioTimer.current);
    setLean(leanValue); setOutflow(outflowValue); setScenario(null); setError("");
    if (!bundle?.decision) return;
    if (leanValue === 0 && outflowValue === 0) return;
    scenarioTimer.current = setTimeout(async () => {
      try { const result = await api(`/applications/${id}/stress`, { method: "POST", body: JSON.stringify({ decision_id: bundle.decision._id, lean_inflow_delta_pct: -leanValue * 8, outflow_delta_pct: outflowValue * 5 }) }); if (request === scenarioRequest.current) setScenario(result); }
      catch (e) { if (request === scenarioRequest.current) setError(e.message); }
    }, 250);
  }
  function reportIsCurrent(next) {
    const saved = bundle?.decision;
    return !!next && !decisionNeedsRefresh && !!saved && next.decision_id === saved._id && next.decision_input_revision === bundle.application.input_revision && !next.stale_evidence && (next.effective_action?.audit_reference || null) === (bundle.latest_action?.audit_reference || null);
  }
  async function paint() {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }
  async function override(action) {
    setError("");
    if (action === "decline" && !window.confirm("Record a lender decline for this application? This becomes the effective lender action.")) return;
    setActionBusy(action);
    await paint();
    try { await api(`/applications/${id}/override`, { method: "POST", headers: { "Idempotency-Key": idem() }, body: JSON.stringify({ decision_id: bundle.decision._id, action, reason, ...(action === "reduce_terms" ? { proposed_terms: { principal_paise: Math.round(Number(reducedAmount) * 100) } } : {}), ...(action === "request_evidence" ? { evidence_type: evidenceType } : {}) }) }); await refresh(); await refreshQueue(); setReport(null); setAudit(null); setReason(""); setReducedAmount(""); }
    catch (e) { setError(e.message); }
    finally { setActionBusy(""); }
  }
  async function loadReport() {
    setError("");
    setActionBusy("report");
    await paint();
    try {
      const next = await api(`/applications/${id}/report`);
      setReport(next);
      if (reportIsCurrent(next)) downloadTextPdf(pdfName("assessment-report", next.shop_name), reportParagraphs(next));
    } catch (e) { setError(e.message); }
    finally { setActionBusy(""); }
  }
  async function loadAudit() {
    setError("");
    setActionBusy("audit");
    await paint();
    try {
      const next = await api(`/applications/${id}/audit`);
      setAudit(next);
      downloadTextPdf(pdfName("audit", bundle?.shop?.name || id), auditParagraphs(next));
    } catch (e) { setError(e.message); }
    finally { setActionBusy(""); }
  }
  async function downloadCurrent(kind) {
    setActionBusy(kind);
    await paint();
    try {
      if (kind === "pdf-report" && report) {
        const [latest, currentReport] = await Promise.all([api(`/applications/${id}`), api(`/applications/${id}/report`)]);
        setBundle(latest);
        const matches = currentReport.decision_id === latest.decision?._id
          && currentReport.decision_input_revision === latest.application.input_revision
          && !currentReport.stale_evidence
          && (currentReport.effective_action?.audit_reference || null) === (latest.latest_action?.audit_reference || null);
        if (!matches) {
          setReport({ ...report, stale_evidence: true });
          setError("This report is out of date. Refresh the assessment before downloading it.");
          return;
        }
        setReport(currentReport);
        downloadTextPdf(pdfName("assessment-report", currentReport.shop_name), reportParagraphs(currentReport));
      }
      if (kind === "pdf-audit" && audit) downloadTextPdf(pdfName("audit", bundle?.shop?.name || id), auditParagraphs(audit));
    } catch (e) {
      if (kind === "pdf-report") setReport((saved) => saved && { ...saved, stale_evidence: true });
      setError(kind === "pdf-report" ? `Could not verify that this report is current. Download is blocked. ${e.message}` : e.message);
    } finally { setActionBusy(""); }
  }
  async function signOut(event) { event.preventDefault(); await logout(); navigate("/login", { replace: true }); }
  const nav = (name, label) => <Link className={section === name ? "dashboard-sidebar-active" : ""} to={name === "evidence" ? `/application/${id}` : `/application/${id}/${name}`}>{label}</Link>;
  const workflow = (item) => ["awaiting_evidence", "awaiting_verification"].includes(item.status) ? "needs_evidence" : item.assessment_stale ? "pending" : item.status === "reviewed" ? "reviewed" : !item.latest_verdict ? "pending" : item.effective_verdict === "UNVERIFIED" ? "needs_evidence" : "assessed";
  const visibleItems = items.filter((item) => (filter === "all" || workflow(item) === filter) && (verdictFilter === "all" || item.effective_verdict === verdictFilter) && `${item.shop_name} ${item.shopId} ${item._id} ${item.effective_verdict || item.status}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => {
    const time = (item) => Date.parse(item.updated_at || item.assessed_at || item.createdAt || "") || 0;
    if (sortOrder === "newest") return time(b) - time(a);
    if (sortOrder === "oldest") return time(a) - time(b);
    if (sortOrder === "synthetic_signals") return (b.p_auth ?? -1) - (a.p_auth ?? -1) || (a.p_stress ?? 2) - (b.p_stress ?? 2) || time(a) - time(b);
    return Number(workflow(a) === "reviewed") - Number(workflow(b) === "reviewed") || time(a) - time(b);
  });
  const basisNames = { identity_mismatch: "Identity mismatch · models not run", insufficient_evidence: "Insufficient history · models not run", no_verified_rail: "No verified rail · models not run" };
  const basisLabel = (item) => item.p_auth == null && item.p_stress == null ? (item.score_basis || basisNames[item.not_run_reason] || item.not_run_reason?.replaceAll("_", " ") || item.review_reason?.replaceAll("_", " ") || "Not assessed") : `Auth ${item.p_auth == null ? "not run" : `${Math.round(item.p_auth * 100)}%`} · Stress ${item.p_stress == null ? "not run" : `${Math.round(item.p_stress * 100)}%`}`;
  const queue = <section className="dashboard-queue" aria-label="Application list">
    <div className="dashboard-queue-heading"><div><h2>All applications</h2><p>Each row shows synthetic authenticity and lean-period stress estimates when those models ran. Search, filters, and sorting apply to the loaded page; these signals are not an urgency score.</p></div><span>{queueLoading ? <Skeleton className="dashboard-queue-count"/> : `${visibleItems.length} matches · ${queueTotal} total`}</span></div>
    <div className="dashboard-queue-tools">
      <label>Search this page<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Shop or application ID" /></label>
      <label>Workflow state<select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All states</option><option value="pending">Needs assessment</option><option value="assessed">Ready for review</option><option value="needs_evidence">Needs evidence</option><option value="reviewed">Reviewed</option></select></label>
      <label>Underwriting verdict<select value={verdictFilter} onChange={(event) => setVerdictFilter(event.target.value)}><option value="all">All verdicts</option>{["UNVERIFIED", "THIN_FILE", "STANDARD", "STEP_UP", "DECLINE"].map((value) => <option key={value} value={value}>{verdictLabel(value)}</option>)}</select></label>
      <label>Sort this page<select value={sortOrder} onChange={(event) => setSortOrder(event.target.value)}><option value="oldest_unreviewed">Oldest unreviewed first</option><option value="newest">Recently updated</option><option value="oldest">Oldest updated</option><option value="synthetic_signals">Synthetic authenticity then stress</option></select></label>
      {!queueLoading && !queueTotal && <button className="btn btn-secondary" disabled={busy} onClick={prepareDemo}>{busy ? "Preparing demo…" : "Seed and score demo applications"}</button>}
    </div>
    {queueError && <p role="alert">Could not load applications: {queueError}{items.length ? " Showing the last loaded queue." : ""} <button className="btn btn-secondary" type="button" onClick={() => { setQueueCursors([null]); setQueuePage(0); refreshQueue(null); }}>Reload first page</button></p>}
    {queueLoading && !items.length ? <><div className="dashboard-queue-labels" aria-hidden="true"><span>Business</span><span>Evidence</span><span>Requested</span><span>Synthetic signals</span><span>Status</span><span></span></div><SkeletonBlock label="Loading applications">{[0,1,2,3].map(i=><div className="dashboard-queue-row dashboard-queue-skeleton" key={i}><Skeleton/><Skeleton/><Skeleton/><Skeleton/><Skeleton/><Skeleton className="dashboard-nav-skeleton"/></div>)}</SkeletonBlock></> : <div className="dashboard-queue-list">
      <div className="dashboard-queue-labels" aria-hidden="true"><span>Business</span><span>Evidence</span><span>Requested</span><span>Synthetic signals</span><span>Status</span><span></span></div>
      {visibleItems.map((item) => <Link key={item._id} className={`dashboard-queue-row${item.pdf_only ? " dashboard-queue-pdf" : ""}`} to={`/application/${item._id}`}><span className="dashboard-queue-business"><strong>{item.shop_name || item.shopId}</strong><small>{item.business_type || "Business"} · {item._id.slice(0, 8)} · Synthetic demo · Updated {item.updated_at?.slice(0, 10) || "unknown"} · Assessed {item.assessed_at?.slice(0, 10) || "not yet"}</small></span><span>{item.pdf_only ? "PDF only · not a verified rail" : `${item.verified_rail_count} simulated verified rails`}<br /><small>Last activity {item.evidence_last_observed_at || "unknown"}{item.observation_age_days != null ? ` · ${item.observation_age_days} days ago` : ""}{item.freshness_review?.review_required ? ` · Review freshness (>${item.freshness_review.max_age_days} days)` : ""}{item.pdf_only ? " · distinct from verified rails" : ""}</small></span><span className="dashboard-queue-money">{paiseToInr(item.requested_amount_paise)}</span><span className="dashboard-queue-basis">{basisLabel(item)}</span><span className={`dashboard-status ${item.latest_verdict ? "dashboard-status-assessed" : ""}`}>{item.effective_action ? `${item.effective_action.replaceAll("_", " ")} · ` : ""}{item.assessment_stale && workflow(item) === "pending" ? "Reassess" : item.effective_verdict ? verdictLabel(item.effective_verdict) : workflow(item).replaceAll("_", " ")}</span><span className="dashboard-row-arrow" aria-hidden="true">→</span></Link>)}
      {!visibleItems.length && !queueError && <div className="dashboard-queue-empty"><strong>{queueTotal ? "No matching applications on this page" : "No applications yet"}</strong><p>{queueTotal ? "Try another search or status filter, or move to another page." : "New requests will appear here when owners submit them."}</p></div>}
    </div>}
    {queueTotal > 100 && <nav className="dashboard-queue-pagination" aria-label="Application pages"><button className="btn btn-secondary" type="button" onClick={previousQueuePage} disabled={!queuePage || queueLoading}>Previous</button><span>Page {queuePage + 1} · applications {queuePage * 100 + 1}–{Math.min((queuePage + 1) * 100, queueTotal)} of {queueTotal}</span><button className="btn btn-secondary" type="button" onClick={nextQueuePage} disabled={!queueNextCursor || queueLoading}>Next</button></nav>}
  </section>;
  const assessed = queueMeta.workflow_counts.assessed ?? items.filter((item) => workflow(item) === "assessed").length;
  const verifiedCount = queueMeta.verified_rail_applications;
  const pending = queueMeta.workflow_counts.pending ?? items.filter((item) => workflow(item) === "pending").length;
  const status = [{ key: "pending", label: "Needs assessment" }, { key: "needs_evidence", label: "Needs evidence" }, { key: "assessed", label: "Ready for review" }, { key: "reviewed", label: "Reviewed" }].map((entry) => ({ ...entry, count: queueMeta.workflow_counts[entry.key] ?? items.filter((item) => workflow(item) === entry.key).length }));
  const shell = (content) => <div className="dashboard-frame"><a className="skip" href="#main">Skip to dashboard</a><div className="dashboard-window"><header className="dashboard-topbar"><Link to="/" className="dashboard-logo"><span><Mark size={20}/></span> ZeroCIBIL</Link><span className="dashboard-workspace">Lender workspace</span><div className="dashboard-top-actions"><Link className="dashboard-home" to="/login" onClick={signOut}>Sign out →</Link></div></header><aside className="dashboard-sidebar" aria-label="Dashboard sections"><p>WORKSPACE</p><Link className={!id && !isQueue ? "dashboard-sidebar-active" : ""} to="/dashboard">Overview</Link><Link className={isQueue ? "dashboard-sidebar-active" : ""} to="/queue">Applications <span className="dashboard-nav-count">{queueLoading ? <Skeleton className="dashboard-nav-skeleton" /> : queueTotal}</span></Link><p>ASSESSMENT</p>{id ? <>{nav("evidence", "Evidence & activity")}{nav("relationships", "Relationships")}{nav("limit", "How the limit was set")}{nav("terms", "Proposed terms")}{nav("reasons", "Why this result")}{nav("actions", "Lender actions")}<div className="dashboard-sidebar-case"><span>Selected application</span><strong>{bundle?.shop?.name || "Loading…"}</strong><small>{id.slice(0, 8)}</small></div></> : <span className="dashboard-sidebar-hint">Select an application to view evidence, terms and lender actions.</span>}</aside><main id="main" className="dashboard-main">{content}</main></div></div>;
  if (isQueue) return shell(<><div className="dashboard-heading"><div><h1>Applications</h1><p>Review requests, compare verified evidence, and open an assessment.</p></div></div><ApprovalPriority items={items} loading={queueLoading} />{queue}</>);
  if (!id) return shell(<><div className="dashboard-heading" id="overview"><div><h1>Lender dashboard</h1><p>Review applications and the operating evidence behind each assessment.</p></div></div><div className="dashboard-overview-stats">{[["Applications", queueTotal, "Requests in this workspace"], ["Awaiting assessment", pending, "Need lender review"], ["Assessed", assessed, "Result available"], ["With verified rails", verifiedCount, "Simulated operating sources"]].map(([label, value, note]) => <div key={label}><span>{label}</span><strong>{queueLoading ? <Skeleton className="dashboard-stat-skeleton" /> : value}</strong><small>{note}</small></div>)}</div><section className="dashboard-overview-chart" aria-label="Application status chart"><h2>Assessment pipeline</h2><p>Share of applications by review status · synthetic demo data</p><div className="dashboard-pipeline" role={queueLoading ? "status" : undefined} aria-label={queueLoading ? "Loading assessment pipeline" : undefined}>{queueLoading ? status.map(({key,label}) => <div key={key}><span>{label}</span><span className="dashboard-pipeline-track"><Skeleton /></span><Skeleton className="dashboard-pipeline-skeleton" /></div>) : status.map(({key,label,count}) => <button type="button" key={key} onClick={() => { setFilter(key); setVerdictFilter("all"); setQueueCursors([null]); setQueuePage(0); refreshQueue(null); navigate("/queue"); }} aria-label={`Show ${count} ${label.toLowerCase()} applications`}><span>{label}</span><span className="dashboard-pipeline-track"><i style={{width: `${queueTotal ? count / queueTotal * 100 : 0}%`}} /></span><strong>{count}</strong></button>)}</div></section><PortfolioEvidence summary={summary} summaryLoading={summaryLoading} fairness={fairness} setFairness={setFairness} setError={setError} items={items} /><div className="dashboard-overview-link"><Link to="/queue">View all applications →</Link></div></>);
  if (!bundle && !error) return shell(<SkeletonBlock className="dashboard-detail-skeleton" label="Loading application"><Skeleton className="dashboard-skeleton-title"/><Skeleton className="dashboard-skeleton-copy"/><div className="dashboard-skeleton-case"><Skeleton/><Skeleton/></div><div className="dashboard-metrics"><Skeleton/><Skeleton/><Skeleton/></div><Skeleton className="dashboard-skeleton-chart"/><Skeleton className="dashboard-skeleton-row"/><Skeleton className="dashboard-skeleton-row"/></SkeletonBlock>);
  if (!bundle) return shell(<p role="alert">Could not load application: {error}. <Link to="/dashboard">Return to overview</Link></p>);
  const { application, shop, rails, decision, latest_action: latestAction, verification } = bundle;
  const stale = !!decision && bundle.assessment_stale;
  const approvable = !!decision?.principal_paise && !decisionNeedsRefresh && !["DECLINE", "UNVERIFIED"].includes(decision.verdict) && ["verified_simulated", "ready"].includes(verification?.status) && !stale && latestAction?.action !== "approve";
  const d = decision || {};
  const verified = rails.filter((r) => r.type !== "pdf" && ["verified", "verified_simulated"].includes(r.trustClass || r.trust_class));
  const capacity = d.capacity || {};
  const retentionBasis = capacity.retention_basis;
  const leanDates = decision?.capacity?.worst_4_week_dates || [];
  const drivers = d.drivers || [];
  const conditions = d.conditions || [];
  const observationAge = (date) => date && Number.isFinite(Date.parse(date)) ? `${Math.max(0, Math.floor((Date.now() - Date.parse(date)) / 86400000))} days ago` : "unknown";
  return shell(<><div className="dashboard-heading"><div><h1>{({ evidence: "Evidence & activity", relationships: "Relationships", limit: "How the limit was set", terms: "Proposed terms", reasons: "Why this result", actions: "Lender actions" })[section] || "Evidence & activity"}</h1><p>{shop.name} · {shop.business_type || shop.category || "Shop"}{shop.city ? ` · ${shop.city}` : ""} · synthetic demo data</p></div><span className="dashboard-verdict">{latestAction ? `Lender action · ${verdictLabel(latestAction.effective.verdict)}` : d.verdict ? verdictLabel(d.verdict) : application.status}</span></div><p className="dashboard-disclaimer">Assessment terms are not a final credit decision or disbursal.</p>{stale && <p role="alert">Evidence changed after the saved assessment. Reassess to use the latest shop records.</p>}{decisionNeedsRefresh && <p role="status">This saved assessment is missing current capacity or repayment details. Reassess before relying on its terms.</p>}{decision?.freshness_review?.review_required && <p role="status">Freshness review: latest verified activity was {decision.freshness_review.age_days} days ago. Review-only rule {decision.freshness_review.version} flags activity older than {decision.freshness_review.max_age_days} days; it does not affect eligibility, score, or terms.</p>}{verification?.source === "aa_sandbox" && verification.status !== "ready" && <p role="status">Setu bank evidence is {verification.status.replaceAll("_", " ")}. Ask the owner to open this application and use “Check bank consent and data” before assessment.</p>}<button className="btn btn-primary" onClick={score} disabled={busy || verification?.source === "aa_sandbox" && verification.status !== "ready"}>{busy ? "Scoring…" : stale || decisionNeedsRefresh ? "Reassess application" : decision ? "Run assessment again" : "Run assessment"}</button>{error && <p role="alert">{error}</p>}{section === "evidence" && (!decision ? <section id="assessment-summary" className="dashboard-assessment-summary" aria-label="Assessment summary"><div className="dashboard-summary-result"><strong>Not assessed</strong><p>{stale ? "Reassess after evidence update" : application.status === "awaiting_evidence" ? "Needs evidence" : "Run an assessment to see a verdict and the amount we can give."}</p></div></section> : decisionNeedsRefresh ? <section id="assessment-summary" className="dashboard-assessment-summary" aria-label="Assessment summary"><div className="dashboard-summary-result"><strong>Refresh required</strong><p>Saved terms are incomplete. Reassess this application to see a current amount and repayment schedule.</p></div></section> : <AssessmentGlance decision={decision} narrative={assessmentNarrative(decision, application.requested_amount_paise)} requested={application.requested_amount_paise} verifiedRails={verified.length} railCount={rails.length} auditHref={decision.audit_reference ? `/application/${id}/actions` : ""} />)}
    {section === "evidence" && <EvidenceBoard weeks={weeks} leanDates={leanDates} decision={decision} rails={rails} verified={verified} shop={shop} reconciliation={bundle.reconciliation} statement={d.statement_intake} lean={lean} outflow={outflow} scenario={scenario} onStress={stress} observationAge={observationAge} freshnessReview={bundle.freshness_review} applicationId={id} />}
    {section === "relationships" && <StatementGraph rows={bundle.cashflows || []} shopName={shop.name} vpa={shop.identity?.vpa || ""} />}
    {section === "limit" && !decision && <section className="dashboard-detail-card"><h2>How the limit was set</h2><p>Run an assessment to see the capacity calculation.</p></section>}{section === "limit" && decision && <section className="dashboard-detail-card dashboard-capacity"><h2>Amount comparison</h2><AmountComparison requested={application.requested_amount_paise} policyMax={decision.capacity?.max_principal_paise} offer={decision.principal_paise} /><h2>Calculation</h2><div className="dashboard-capacity-steps"><div><span>Weakest four-week net</span><strong>{capacity.worst_4_week_net_paise == null ? "Unavailable" : paiseToInr(capacity.worst_4_week_net_paise)}</strong><small>{capacity.worst_4_week_start || "Period unavailable"} to {capacity.worst_4_week_end || "—"}</small></div><div><span>Lean weekly surplus</span><strong>{capacity.lean_surplus_paise == null ? "Unavailable" : paiseToInr(capacity.lean_surplus_paise)}</strong><small>Weakest four-week net ÷ 4</small></div><div><span>Retained share of lean surplus</span><strong>{retentionBasis?.applied_factor == null && (capacity.retained_capacity_factor ?? capacity.haircut) == null ? "Unavailable" : `${Math.round((retentionBasis?.applied_factor ?? capacity.retained_capacity_factor ?? capacity.haircut) * 100)}%`}</strong><small>{retentionBasis ? (retentionBasis.high_trust_gate_met ? `High-trust gate met: ${retentionBasis.verified_rail_count}/${retentionBasis.required_verified_rails} rails and ${String(retentionBasis.authenticity_band || "unknown").toLowerCase()} authenticity. Stress ${String(retentionBasis.stress_band || "unknown").toLowerCase()} and ${retentionBasis.history_tier} history (${retentionBasis.history_weeks} weeks) select this share.` : `High-trust gate not met: ${retentionBasis.verified_rail_count}/${retentionBasis.required_verified_rails} rails and ${String(retentionBasis.authenticity_band || "unknown").toLowerCase()} authenticity (needs ${String(retentionBasis.required_authenticity_band || "high").toLowerCase()}). Policy keeps the recorded share until both conditions are met.`) : "Retention inputs unavailable"}</small></div><div><span>Maximum weekly installment</span><strong>{capacity.max_emi_paise == null ? "Unavailable" : paiseToInr(capacity.max_emi_paise)}</strong><small>{(capacity.retained_capacity_factor ?? capacity.haircut) == null ? "Retained factor unavailable" : `${Math.round((capacity.retained_capacity_factor ?? capacity.haircut) * 100)}% of lean surplus retained`} · reduction {capacity.haircut_amount_paise == null ? "unavailable" : paiseToInr(capacity.haircut_amount_paise)}</small></div><div><span>Cashflow-based principal ceiling</span><strong>{capacity.cashflow_max_principal_paise == null ? "Unavailable" : paiseToInr(capacity.cashflow_max_principal_paise)}</strong></div><div><span>Final policy maximum</span><strong>{capacity.max_principal_paise == null ? "Unavailable" : paiseToInr(capacity.max_principal_paise)}</strong><small>{capacity.cashflow_max_principal_paise != null && capacity.ticket_ceiling_paise != null && capacity.cashflow_max_principal_paise > capacity.ticket_ceiling_paise ? "Limited by portfolio ticket ceiling" : "Limited by cashflow-supported repayment"}</small></div></div>{decision.not_run_reason && <p>Policy reason: {decision.not_run_reason.replaceAll("_", " ")}.</p>}<small>Policy {decision.versions?.policy || "version unavailable"} · assessed {decision.assessed_at?.slice(0, 10) || "date unavailable"}</small></section>}
    {section === "terms" && (decisionNeedsRefresh ? <section className="dashboard-detail-card" id="terms"><h2>Terms need refreshing</h2><p>This saved assessment is missing current capacity or repayment details. Reassess the application to review a complete term sheet.</p></section> : <div className="dashboard-detail-grid" id="terms"><section className="dashboard-detail-card"><h2>Term sheet</h2><dl><dt>Verdict</dt><dd>{d.verdict ? verdictLabel(d.verdict) : "Not assessed"}</dd><dt>Principal</dt><dd>{d.principal_paise ? paiseToInr(d.principal_paise) : "—"}</dd><dt>Tenure</dt><dd>{d.tenure_months ? `${d.tenure_months} months` : "—"}</dd><dt>Annual rate</dt><dd>{d.rate_bps ? `${(d.rate_bps / 100).toFixed(1)}%` : "—"}</dd><dt>Policy rate band</dt><dd>{d.rate_band || "Not assessed"}{d.rate_bps ? " · v1 placeholder band, not a market benchmark" : ""}</dd><dt>Cadence</dt><dd>{d.cadence || "—"}</dd><dt>Installment cap</dt><dd>{d.max_emi_paise ? paiseToInr(d.max_emi_paise) : "—"} each {d.cadence || "period"}</dd></dl></section><section className="dashboard-detail-card"><h2>Repayment</h2><RepaymentTimeline decision={d} />{d.verdict === "STEP_UP" && <p role="status">Step-up is a policy label on this synthetic assessment. It does not guarantee a higher future limit.</p>}{decision && !d.principal_paise && <p role="status">No positive offer: {d.not_run_reason?.replaceAll("_", " ") || (d.capacity?.max_principal_paise === 0 ? "the policy maximum is zero after the capacity and eligibility checks." : "review the evidence and policy conditions.")}</p>}</section></div>)}{section === "reasons" && <><DecisionReasons decision={decision} verifiedCount={verified.length} conditions={conditions} applicationId={id} /><ReturnedAssessment decision={decision} scenario={scenario} /></>}
    {section === "actions" && <section className="dashboard-detail-card dashboard-actions" id="actions">{decision ? <>{latestAction && <div className="dashboard-effective"><strong>Recorded lender action: {latestAction.action.replaceAll("_", " ")}</strong><span>Effective verdict {verdictLabel(latestAction.effective.verdict)} · principal {paiseToInr(latestAction.effective.principal_paise)}</span>{latestAction.action === "reduce_terms" && <span>Terms changed: {paiseToInr(latestAction.previousTerms?.principal_paise)} → {paiseToInr(latestAction.effective.principal_paise)}</span>}{latestAction.effective?.repayment_amount_paise != null && <span>Recorded schedule: {paiseToInr(latestAction.effective.repayment_amount_paise)} each {latestAction.effective.cadence} · total {paiseToInr(latestAction.effective.total_repayment_paise)}</span>}<small>{latestAction.evidence_type ? `Evidence requested: ${latestAction.evidence_type}` : latestAction.reason} · {latestAction.createdAt?.slice(0, 10)} · Audit {latestAction.audit_reference}</small></div>}<label>Evidence needed<select value={evidenceType} onChange={(e) => setEvidenceType(e.target.value)} disabled={!!actionBusy}><option value="">Choose evidence type</option><option value="aa">Account records</option><option value="upi">UPI merchant activity</option><option value="gst">GST filing summary</option><option value="identity">Shop identity match</option><option value="reconciliation">Resolve rail mismatch</option><option value="other">Other supporting evidence</option></select></label><p>Approval requires a positive assessment and completed bank verification. Record a reason for the audit trail.</p><label>Reason (at least 8 characters)<input value={reason} onChange={(e) => setReason(e.target.value)} disabled={!!actionBusy} /></label><label>Reduced principal (₹, optional)<input type="number" min="0.01" max={(decision.principal_paise || 0) / 100} step="0.01" value={reducedAmount} onChange={(e) => setReducedAmount(e.target.value)} disabled={!!actionBusy} /></label><div className="dashboard-action-buttons"><button className="btn btn-primary" disabled={!approvable || busy || !!actionBusy || reason.trim().length < 8} aria-busy={actionBusy === "approve" || undefined} onClick={() => override("approve")}>{actionBusy === "approve" ? "Approving…" : latestAction?.action === "approve" ? "Approval recorded" : "Approve application"}</button><button className="btn btn-secondary" disabled={!!actionBusy || reason.trim().length < 8 || !evidenceType} aria-busy={actionBusy === "request_evidence" || undefined} onClick={() => override("request_evidence")}>{actionBusy === "request_evidence" ? "Requesting…" : "Request evidence"}</button><button className="btn btn-secondary" disabled={!!actionBusy || decisionNeedsRefresh || reason.trim().length < 8 || reducedAmount === "" || !Number.isFinite(Number(reducedAmount)) || Number(reducedAmount) <= 0 || Number(reducedAmount) * 100 > decision.principal_paise} aria-busy={actionBusy === "reduce_terms" || undefined} onClick={() => override("reduce_terms")}>{actionBusy === "reduce_terms" ? "Recording…" : "Record reduced terms"}</button><button className="btn btn-secondary" disabled={!!actionBusy || reason.trim().length < 8} aria-busy={actionBusy === "decline" || undefined} onClick={() => override("decline")}>{actionBusy === "decline" ? "Recording…" : "Record decline"}</button><button className="btn btn-secondary" disabled={!!actionBusy || decisionNeedsRefresh} aria-busy={actionBusy === "report" || undefined} onClick={loadReport}>{actionBusy === "report" ? "Loading report…" : "Load report"}</button><button className="btn btn-secondary" disabled={!!actionBusy} aria-busy={actionBusy === "audit" || undefined} onClick={loadAudit}>{actionBusy === "audit" ? "Loading audit…" : "Load audit"}</button></div>{actionBusy && <ActionLoading label={ACTION_LOADING[actionBusy] || "Working"} />}{!actionBusy && report && <ReportView report={report} currentDecision={decision} currentAction={latestAction} currentRevision={application.input_revision} onDownload={() => downloadCurrent("pdf-report")} />}{!actionBusy && audit && <div className="dashboard-readable"><h3>Audit timeline</h3><ol>{audit.items.slice().sort((a, b) => a.at.localeCompare(b.at)).map((event) => <li key={event._id}><strong>{event.action}</strong> · {event.at?.slice(0, 16).replace("T", " ")} · {event.actorId}{event.action_detail && <span> · {event.action_detail.replaceAll("_", " ")}</span>}{event.reason && <span> · {event.reason}</span>}<small>Input revision {event.input_revision ?? "unknown"} · Evidence revision {event.evidence_revision ?? "unknown"} · Policy {event.policyVersion || "unknown"} · Models {event.model_auth_version || "unknown"} / {event.model_stress_version || "unknown"} · Source {event.source_reference || event.source_references?.join(", ") || "unknown"} · Audit reference {event._id}</small><details><summary>Technical record</summary><pre>{JSON.stringify(event, null, 2)}</pre></details></li>)}</ol><button className="btn btn-secondary dashboard-download" onClick={() => downloadCurrent("pdf-audit")}>Download PDF</button></div>}</> : <p>Run an assessment to enable lender actions.</p>}</section>}</>);
}

function PortfolioEvidence({ summary, summaryLoading, fairness, setFairness, setError, items }) {
  const applications = summary?.application_count;
  const assessed = summary?.assessed_count;
  const renderCount = (value, denominator) => value == null || denominator == null ? "Unavailable" : `${value} of ${denominator}`;
  const formatValue = (key, value) => value == null ? "Unavailable" : key.includes("paise") ? paiseToInr(value) : key.includes("share") ? `${Math.round(value * 100)}%` : String(value);
  const canCompare = ["twin-a", "twin-b"].every((shopId) => items.some((item) => item.shopId === shopId && item.latest_decision_id && !item.assessment_stale));
  return <section className="dashboard-evidence-summary"><h2>Demo evidence</h2>
    <p>{summaryLoading ? <Skeleton className="dashboard-skeleton-copy" /> : `Operational counts from ${applications ?? "an unknown number of"} synthetic applications. Positive proposals are offers, not funded or disbursed loans.`}</p>
    <div className="dashboard-portfolio-counts">{[["Applications", applications, applications], ["Assessed", assessed, applications], ["Positive proposals", summary?.positive_offer_count, assessed], ["Unverified", summary?.byVerdict?.UNVERIFIED ?? 0, assessed], ["Declined", summary?.byVerdict?.DECLINE ?? 0, assessed], ["Pending", summary?.pending_count, applications]].map(([label, value, denominator]) => <span key={label}>{label}<strong>{summaryLoading ? <Skeleton className="dashboard-portfolio-skeleton" /> : renderCount(value, denominator)}</strong></span>)}</div>
    {summary?.byArchetype?.length > 0 && <div className="dashboard-archetype-counts"><h3>Counts by synthetic archetype</h3><p>Hard-case fixtures (PDF-only, mule-like, GST gap) are listed separately from twins. These are demo operating counts, not a fairness evaluation.</p><table><thead><tr><th>Archetype</th><th>Applications</th><th>Assessed</th><th>Positive offers</th><th>Unverified</th><th>Declined</th></tr></thead><tbody>{summary.byArchetype.map((row) => <tr key={row.archetype}><th>{row.archetype.replaceAll("_", " ")}</th><td>{row.application_count}</td><td>{row.assessed_count}</td><td>{row.positive_offer_count}</td><td>{row.unverified_count}</td><td>{row.declined_count}</td></tr>)}</tbody></table></div>}
    <p>Predictive performance: <strong>Not measured</strong>. Population fairness performance: <strong>Not measured</strong>.</p>
    <h3>Single synthetic fairness twin check</h3>
    <p>Two fixture applications have matched business evidence and changed owner attributes. This check cannot establish population fairness.</p>
    <button className="btn btn-secondary" disabled={!canCompare} onClick={() => api("/evidence/fairness", { method: "POST", body: JSON.stringify({ fixture_pair_id: "lakshmi-twins" }) }).then(setFairness).catch((e) => setError(e.message))}>Compare synthetic fairness twins</button>
    {fairness && <div className="dashboard-twin-result"><p role="status"><strong>{fairness.input_match !== true ? "Input match not verified" : fairness.pass ? "Terms match in this fixture" : "Twin comparison failed"}.</strong> {fairness.sample_size ?? 2} synthetic cases · Audit {fairness.audit_reference || "unavailable"}.</p>
      <p>Twins: {fairness.twin_names?.join(" / ") || "Twin A / Twin B"}. Changed attributes: {fairness.changed_attributes?.join(", ") || "unavailable"}.</p>
      {fairness.protected_attribute_values && <dl>{Object.entries(fairness.protected_attribute_values).map(([key, values]) => <div key={key}><dt>{key.replaceAll("_", " ")}</dt><dd>{values.map((value) => value ?? "unknown").join(" / ")}</dd></div>)}</dl>}
      <h4>Matched business inputs</h4>{fairness.matched_inputs ? <dl>{Object.entries(fairness.matched_inputs).map(([key, values]) => <div key={key}><dt>{key.replaceAll("_", " ")}</dt><dd>{values.map((value) => formatValue(key, value)).join(" / ")}</dd></div>)}</dl> : <p>Input values unavailable from this API version.</p>}
      <h4>Verdict and term comparison</h4><dl>{Object.entries(fairness.deltas || {}).map(([key, values]) => <div key={key} className={fairness.differing_terms?.includes(key) ? "dashboard-twin-difference" : ""}><dt>{key.replaceAll("_", " ")}</dt><dd>{values.map((value) => formatValue(key, value)).join(" / ")}{fairness.differing_terms?.includes(key) ? " · differs" : ""}</dd></div>)}</dl>
      {!fairness.pass && <p>{fairness.differing_terms?.length ? `Differing terms: ${fairness.differing_terms.map((key) => key.replaceAll("_", " ")).join(", ")}.` : "Business inputs did not match, so no fairness pass is claimed."}</p>}
    </div>}
  </section>;
}

function RepaymentTimeline({ decision }) {
  if (!decision.principal_paise) return null;
  const count = decision.repayment_periods;
  const installment = decision.repayment_amount_paise;
  if (!count || !installment || decision.total_repayment_paise == null || decision.total_interest_paise == null) {
    return <p role="status">Repayment sequence unavailable for this saved assessment. Reassess to refresh the terms.</p>;
  }
  const cadence = decision.cadence || "payment period";
  return <div className="dashboard-repayment" aria-label="Proposed repayment sequence">
    <h3>Repayment sequence</h3>
    <p>{count} {cadence} payments of {paiseToInr(installment)}. Payment dates are set later.</p>
    <ol>
      <li><strong>Payment 1</strong><span>{paiseToInr(installment)}</span></li>
      {count > 2 && <li><strong>Payments 2–{count - 1}</strong><span>{count - 2} more at {paiseToInr(installment)} each</span></li>}
      {count > 1 && <li><strong>Payment {count}</strong><span>{paiseToInr(installment)}</span></li>}
    </ol>
    <p><strong>Total repayment {paiseToInr(decision.total_repayment_paise)}</strong> · total interest {paiseToInr(decision.total_interest_paise)} · principal {paiseToInr(decision.principal_paise)}</p>
    <small>Backend policy figures for the saved recommendation; this is not a disbursal schedule.</small>
  </div>;
}

function DecisionReasons({ decision, verifiedCount, conditions, applicationId }) {
  const thresholds = decision?.policy_thresholds || {};
  const formatPercent = (value) => value == null ? "Unavailable" : `${Math.round(value * 100)}%`;
  const driverValue = (driver) => driver.value == null ? "Unavailable" : driver.feature === "history_weeks" ? `${driver.value} weeks` : `${Math.round(driver.value * 100)}%`;
  const driverThreshold = (driver) => {
    if (driver.feature === "gst_upi_rel_gap") return thresholds.gst_upi_gap_review_above == null ? "Policy threshold unavailable" : `Review above ${formatPercent(thresholds.gst_upi_gap_review_above)}`;
    if (driver.feature === "max_payer_share") return thresholds.payer_share_review_above == null ? "Policy threshold unavailable" : `Review above ${formatPercent(thresholds.payer_share_review_above)}`;
    if (driver.feature === "history_weeks") return thresholds.thin_history_below_weeks == null ? "Policy threshold unavailable" : `Thin history below ${thresholds.thin_history_below_weeks} weeks`;
    return "Compared with a typical period; no hard cutoff";
  };
  const direction = { risk_up_if_low: "Lower value contributes to review", auth_down_if_high: "Higher concentration contributes to review", haircut_if_high: "Higher gap contributes to review", thin_file_if_short: "Shorter history limits confidence" };
  return <div className="dashboard-detail-grid dashboard-reasons">
    <section className="dashboard-detail-card"><h2>Policy gates and capacity</h2>
      <p>Verified-rail minimum for a full assessment: {thresholds.verified_rail_minimum ?? "unavailable"}. Recorded rails: {decision?.verified_rail_count ?? verifiedCount}. Source: policy.py.</p>
      {decision?.not_run_reason && <p><strong>Policy result:</strong> {decision.not_run_reason.replaceAll("_", " ")}. The assessment stopped or limited the offer at this rule.</p>}
      {decision?.capacity && <p>The rupee steps from lean surplus to the policy maximum are on <Link to={`/application/${applicationId}/limit`}>How the limit was set</Link>. Source: policy.py.</p>}
      {!decision && <p>Not assessed. Run an assessment to see the policy result; lean-period stress was not run.</p>}
      <h3>Conditions and next steps</h3>{conditions.length ? <ul>{conditions.map((condition, i) => <li key={i}>{condition}</li>)}</ul> : <p>No conditions reported.</p>}
    </section>
    <section className="dashboard-detail-card"><h2>Synthetic model signals</h2>
      <p>Band cutoffs, not the observed scores: authenticity is low below {formatPercent(thresholds.auth_low_below)} and high from {formatPercent(thresholds.auth_high_at_or_above)}. Stress is low through {formatPercent(thresholds.stress_low_max)} and medium through {formatPercent(thresholds.stress_medium_max)}. These are not calibrated default probabilities.</p>
      <p>Models: {decision?.versions?.model_auth || "version unavailable"} / {decision?.versions?.model_stress || "version unavailable"}. Predictive performance: not measured.</p>
      {decision?.model_scores && <p>Trained-joblib scores (uncalibrated, not used as the policy verdict): authenticity {decision.model_scores.p_auth == null ? "unavailable" : formatPercent(decision.model_scores.p_auth)}; stress {decision.model_scores.p_stress == null ? "unavailable" : formatPercent(decision.model_scores.p_stress)}.</p>}
      <h3>Observed inputs</h3><p>Driver order is supplied by the scoring payload. It is not a verified ranking of materiality.</p>{decision?.drivers?.length ? <div className="dashboard-driver-list">{decision.drivers.slice(0, 3).map((driver, i) => <div key={`${driver.feature}-${i}`}><strong>{driver.text || driver.feature}</strong><span>Observed {driverValue(driver)} · {driverThreshold(driver)}</span><small>{direction[driver.direction] || "Contributed to review"} · Source: {driver.source || "unknown"}</small></div>)}</div> : <p>No model drivers available for this decision.</p>}
    </section>
  </div>;
}

const ACTION_LOADING = {
  approve: "Recording the approval",
  request_evidence: "Recording the evidence request",
  reduce_terms: "Recording the reduced terms",
  decline: "Recording the decline",
  report: "Loading the assessment report and preparing the PDF",
  audit: "Loading the audit timeline and preparing the PDF",
  "pdf-report": "Preparing the report PDF",
  "pdf-audit": "Preparing the audit PDF",
};

function pdfName(kind, name) {
  const slug = String(name || "application").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "application";
  return `${kind}-${slug}.pdf`;
}

function money(value) {
  return value == null ? "Unavailable" : paiseToInr(value).replaceAll("₹", "Rs ");
}

function reportParagraphs(report) {
  const factor = report.capacity?.retained_capacity_factor ?? report.capacity?.haircut;
  return [
    `Assessment report · ${report.shop_name || "Unknown shop"}`,
    `Generated ${report.generated_at?.slice(0, 16).replace("T", " ") || "time unknown"} · decision ${report.decision_id || "unknown"} · input revision ${report.decision_input_revision ?? "unknown"}.`,
    `Synthetic demo data · policy ${report.versions?.policy || "unknown"} · assessed ${report.assessed_at?.slice(0, 10) || "date unknown"}.`,
    report.explanation?.lender || "Explanation unavailable.",
    `Requested amount: ${money(report.requested_amount_paise)}`,
    `Policy verdict: ${verdictLabel(report.verdict)}`,
    `Proposed principal: ${money(report.terms?.principal_paise)}`,
    `Maximum policy principal: ${money(report.capacity?.max_principal_paise)}`,
    `Cashflow-based principal ceiling: ${money(report.capacity?.cashflow_max_principal_paise)}`,
    `Portfolio ticket ceiling: ${money(report.capacity?.ticket_ceiling_paise)}`,
    `Lean weekly surplus: ${money(report.capacity?.lean_surplus_paise)}`,
    `Maximum weekly installment: ${money(report.capacity?.max_emi_paise)}`,
    `Post-factor weekly capacity: ${money(report.capacity?.post_haircut_max_emi_paise)} (${factor == null ? "factor unavailable" : `${Math.round(factor * 100)}% retained`}; reduction ${money(report.capacity?.haircut_amount_paise)})`,
    `Annual rate: ${report.terms?.rate_bps == null ? "Unavailable" : `${report.terms.rate_bps / 100}%`}`,
    `Tenure: ${report.terms?.tenure_months ?? "Unavailable"} months`,
    `Repayment cadence: ${report.terms?.cadence || "Unavailable"}`,
    `Number of payments: ${report.terms?.repayment_periods || "Unavailable"}`,
    `Installment: ${report.terms?.total_repayment_paise ? money(report.terms.repayment_amount_paise) : "Unavailable"}`,
    `Total repayment: ${report.terms?.total_repayment_paise ? money(report.terms.total_repayment_paise) : "Unavailable"}`,
    `Total interest: ${report.terms?.total_interest_paise == null || !report.terms?.principal_paise ? "Unavailable" : money(report.terms.total_interest_paise)}`,
    `Operating evidence: ${report.rails?.map((rail) => `${String(rail.type).toUpperCase()} (${rail.trustClass}, ${rail.provenance})`).join(", ") || "None"}.`,
    report.conditions?.length ? `Conditions: ${report.conditions.join("; ")}.` : "Conditions: none reported.",
    report.effective_action ? `Recorded lender action: ${report.effective_action.action.replaceAll("_", " ")} · effective verdict ${verdictLabel(report.effective_action.effective?.verdict)} · effective principal ${money(report.effective_action.effective?.principal_paise)}. Reason: ${report.effective_action.reason}. Audit ${report.effective_action.audit_reference || "unavailable"}.` : "No recorded lender action.",
    ...(report.effective_action?.effective?.repayment_amount_paise != null ? [`Recorded terms: ${money(report.effective_action.effective.repayment_amount_paise)} each ${report.effective_action.effective.cadence} for ${report.effective_action.effective.repayment_periods} payments · total ${money(report.effective_action.effective.total_repayment_paise)} · interest ${money(report.effective_action.effective.total_interest_paise)}.`] : []),
    report.model_scores ? `Trained scores (uncalibrated): authenticity ${report.model_scores.p_auth ?? "unavailable"} · stress ${report.model_scores.p_stress ?? "unavailable"}.` : "Trained scores were not returned.",
    "This synthetic assessment is not a final credit decision or disbursal.",
  ];
}

function auditParagraphs(audit) {
  const events = (audit?.items || []).slice().sort((a, b) => String(a.at).localeCompare(String(b.at)));
  return [
    "Audit timeline",
    events.length ? `${events.length} recorded events.` : "No audit events.",
    ...events.map((event) => `${event.action} · ${event.at?.slice(0, 16).replace("T", " ") || "time unknown"} · ${event.actorId || "unknown actor"}${event.action_detail ? ` · ${String(event.action_detail).replaceAll("_", " ")}` : ""}${event.reason ? ` · ${event.reason}` : ""}. Input revision ${event.input_revision ?? "unknown"} · Evidence revision ${event.evidence_revision ?? "unknown"} · Policy ${event.policyVersion || "unknown"} · Models ${event.model_auth_version || "unknown"} / ${event.model_stress_version || "unknown"} · Source ${event.source_reference || event.source_references?.join(", ") || "unknown"} · Audit reference ${event._id}`),
  ];
}

function ActionLoading({ label }) {
  return <SkeletonBlock className="dashboard-action-loading" label={label}><p>{label}</p><Skeleton className="dashboard-skeleton-title" /><Skeleton className="dashboard-skeleton-copy" /><Skeleton className="dashboard-skeleton-row" /><Skeleton className="dashboard-skeleton-row" /></SkeletonBlock>;
}

function ReportView({ report, currentDecision, currentAction, currentRevision, onDownload }) {
  const current = report.decision_id === currentDecision?._id && report.decision_input_revision === currentRevision && !report.stale_evidence && (report.effective_action?.audit_reference || null) === (currentAction?.audit_reference || null);
  return <div className="dashboard-readable dashboard-report">
    <h3>Assessment report · {report.shop_name}</h3>
    <p role={current ? "status" : "alert"}>{current ? "Current snapshot" : "Report is stale. Reload it before downloading or treating it as the latest lender state."} Generated {report.generated_at?.slice(0, 16).replace("T", " ") || "time unknown"} · decision {report.decision_id || "unknown"} · input revision {report.decision_input_revision ?? "unknown"}.</p>
    <p>Synthetic demo data · policy {report.versions?.policy || "unknown"} · assessed {report.assessed_at?.slice(0, 10) || "date unknown"}</p>
    <p>{report.explanation?.lender || "Explanation unavailable"}</p>
    <dl>
      <dt>Requested amount</dt><dd>{paiseToInr(report.requested_amount_paise)}</dd>
      <dt>Policy verdict</dt><dd>{verdictLabel(report.verdict)}</dd>
      <dt>Proposed principal</dt><dd>{paiseToInr(report.terms.principal_paise)}</dd>
      <dt>Maximum policy principal</dt><dd>{report.capacity?.max_principal_paise == null ? "Unavailable" : paiseToInr(report.capacity.max_principal_paise)}</dd>
      <dt>Cashflow-based principal ceiling</dt><dd>{report.capacity?.cashflow_max_principal_paise == null ? "Unavailable" : paiseToInr(report.capacity.cashflow_max_principal_paise)}</dd>
      <dt>Portfolio ticket ceiling</dt><dd>{report.capacity?.ticket_ceiling_paise == null ? "Unavailable" : paiseToInr(report.capacity.ticket_ceiling_paise)}</dd>
      <dt>Lean weekly surplus</dt><dd>{report.capacity?.lean_surplus_paise == null ? "Unavailable" : paiseToInr(report.capacity.lean_surplus_paise)}</dd>
      <dt>Maximum weekly installment</dt><dd>{report.capacity?.max_emi_paise == null ? "Unavailable" : paiseToInr(report.capacity.max_emi_paise)}</dd>
      <dt>Post-factor weekly capacity</dt><dd>{report.capacity?.post_haircut_max_emi_paise == null ? "Unavailable" : paiseToInr(report.capacity.post_haircut_max_emi_paise)} ({(report.capacity?.retained_capacity_factor ?? report.capacity?.haircut) == null ? "factor unavailable" : `${Math.round((report.capacity.retained_capacity_factor ?? report.capacity.haircut) * 100)}% retained`}; reduction {report.capacity?.haircut_amount_paise == null ? "unavailable" : paiseToInr(report.capacity.haircut_amount_paise)})</dd>
      <dt>Annual rate</dt><dd>{report.terms.rate_bps == null ? "Unavailable" : `${report.terms.rate_bps / 100}%`}</dd>
      <dt>Tenure</dt><dd>{report.terms.tenure_months} months</dd>
      <dt>Repayment cadence</dt><dd>{report.terms.cadence || "Unavailable"}</dd>
      <dt>Number of payments</dt><dd>{report.terms.repayment_periods || "Unavailable"}</dd>
      <dt>Installment</dt><dd>{report.terms.total_repayment_paise ? paiseToInr(report.terms.repayment_amount_paise) : "Unavailable"}</dd>
      <dt>Total repayment</dt><dd>{report.terms.total_repayment_paise ? paiseToInr(report.terms.total_repayment_paise) : "Unavailable"}</dd>
      <dt>Total interest</dt><dd>{report.terms.total_interest_paise == null || !report.terms.principal_paise ? "Unavailable" : paiseToInr(report.terms.total_interest_paise)}</dd>
    </dl>
    <p>Operating evidence: {report.rails?.map((rail) => `${rail.type.toUpperCase()} (${rail.trustClass}, ${rail.provenance})`).join(", ") || "None"}.</p>
    {report.conditions?.length > 0 && <p>Conditions: {report.conditions.join("; ")}.</p>}
    {report.effective_action && <p>Recorded lender action: {report.effective_action.action.replaceAll("_", " ")} · effective verdict {verdictLabel(report.effective_action.effective?.verdict)} · effective principal {paiseToInr(report.effective_action.effective?.principal_paise)}. Reason: {report.effective_action.reason}. Audit {report.effective_action.audit_reference || "unavailable"}.</p>}
    {report.effective_action?.effective?.repayment_amount_paise != null && <p>Recorded terms: {paiseToInr(report.effective_action.effective.repayment_amount_paise)} each {report.effective_action.effective.cadence} for {report.effective_action.effective.repayment_periods} payments · total repayment {paiseToInr(report.effective_action.effective.total_repayment_paise)} · total interest {paiseToInr(report.effective_action.effective.total_interest_paise)}.</p>}
    {report.model_scores && <p>Trained-joblib scores (uncalibrated): authenticity {report.model_scores.p_auth ?? "unavailable"} · stress {report.model_scores.p_stress ?? "unavailable"}.</p>}
    <p>This synthetic assessment is not a final credit decision or disbursal.</p>
    <button className="btn btn-secondary dashboard-download" disabled={!current} onClick={onDownload}>Download PDF</button>
  </div>;
}
