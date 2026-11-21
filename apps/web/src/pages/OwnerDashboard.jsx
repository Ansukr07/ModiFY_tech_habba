import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { Shell } from "../components/Shell.jsx";
import { OwnerSidebar } from "../components/OwnerSidebar.jsx";
import Button from "../components/Button.jsx";
import { BackButton } from "../components/BackButton.jsx";
import { Skeleton, SkeletonBlock } from "../components/Skeleton.jsx";
import { api, idem } from "../data/api.js";
import { paiseToInr } from "../data/seed.js";
import { weeklyCashflow } from "../data/weeklyCashflow.js";
import { ownerStatus } from "../data/ownerStatus.js";
import { CashflowChart } from "../components/DeskCharts.jsx";
import "../owner.css";
import "../dashboard.css";

const label = (value) => String(value || "Pending").replaceAll("_", " ");

export function OwnerDashboard() {
  const { id } = useParams();
  const { hash } = useLocation();
  const applicationView = hash === "#owner-evidence" ? "evidence" : hash === "#owner-assessment" ? "assessment" : "progress";
  const [items, setItems] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [record, setRecord] = useState(null);
  const [error, setError] = useState("");
  const [aaBusy, setAaBusy] = useState(false);
  const [aaConnection, setAaConnection] = useState(null);
  useEffect(() => {
    if (!id || record?.verification?.source !== "aa_sandbox") { setAaConnection(null); return; }
    let active = true;
    api(`/applications/${id}/aa/connection`).then((connection) => { if (active) setAaConnection(connection); }).catch(() => {});
    return () => { active = false; };
  }, [id, record?.verification?.status]);
  useEffect(() => {
    let active = true;
    let refreshing = false;
    if (id) setRecord(null);
    const refresh = async () => {
      if (!active || refreshing || document.visibilityState === "hidden") return;
      refreshing = true;
      const results = await Promise.allSettled([
        api("/applications"),
        id ? api("/applications/" + id) : Promise.resolve(null),
      ]);
      if (active) {
        const errors = [];
        if (results[0].status === "fulfilled") setItems(results[0].value.items);
        else errors.push(results[0].reason.message);
        if (id && results[1].status === "fulfilled") setRecord(results[1].value);
        else if (id) errors.push(results[1].reason.message);
        setError(errors.join(" · "));
        setListLoading(false);
      }
      refreshing = false;
    };
    const onFocus = () => refresh();
    const onVisibility = () => { if (document.visibilityState === "visible") refresh(); };
    refresh();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    const timer = window.setInterval(refresh, 30000);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [id]);
  const reviewing = items.filter(item => ["submitted", "assessing", "awaiting_evidence", "awaiting_verification"].includes(item.status)).length;
  const assessed = items.filter(item => ["assessed", "reviewed"].includes(item.status)).length;
  const interrupted = items.filter(item => item.status === "failed").length;
  const lenderAsked = items.filter(item => item.status === "awaiting_evidence");
  const bankPending = items.filter(item => item.status === "awaiting_verification");
  const decisionCurrent = !!record?.decision && !record.assessment_stale;
  const verificationStatus = record?.verification?.status || "not_requested";
  const verificationFailed = ["mismatch", "insufficient_evidence", "rejected", "revoked", "expired", "stale"].includes(verificationStatus);
  const currentStatus = record && ownerStatus(record);
  async function refreshAa() {
    setAaBusy(true);
    try {
      await api(`/applications/${id}/aa/refresh`, { method: "POST", body: "{}" });
      setRecord(await api(`/applications/${id}`));
      setError("");
    } catch (e) { setError(e.message); }
    finally { setAaBusy(false); }
  }

  return <Shell role="owner"><div className="page owner-page"><div className="owner-workspace">
    <OwnerSidebar application={Boolean(id)} />
    <div className="owner-workspace-main">{error && <p role="alert">{error}</p>}{id ? record ? <>
      <div className="owner-track-head"><div><BackButton className="owner-back" to="/owner/applications">All applications</BackButton><h1 className="page-title">{record.shop.name}</h1><p>Application {record.application._id.slice(0, 8)} · {currentStatus.label}</p><p><a href={currentStatus.hash}>{currentStatus.next}</a></p>{record.verification?.source === "aa_sandbox" && <div role="status"><p>Setu sandbox bank data · {label(verificationStatus)}. After approval, check here to fetch the shared data.</p>{aaConnection?.consent_url && <a className="btn btn-secondary" href={aaConnection.consent_url}>Continue Setu consent</a>}{aaConnection?.covered_from && <p>Test activity: {aaConnection.covered_from} to {aaConnection.covered_to} � {aaConnection.transaction_count} rows</p>}{aaConnection?.reason && <p>{aaConnection.reason}</p>}{!["ready", "revoked", "rejected", "expired"].includes(verificationStatus) && <button className="btn btn-secondary" disabled={aaBusy} onClick={refreshAa}>{aaBusy ? "Checking…" : "Check bank consent and data"}</button>}</div>}</div></div>
      {applicationView === "progress" && <main id="owner-progress" className="owner-application-view"><h2>Progress</h2><p>Follow your request from submission through bank review and lender assessment.</p><div className="owner-progress"><div><strong>Submitted</strong><span className="done" /></div><div><strong>Bank review</strong><span className={["verified_simulated", "ready"].includes(verificationStatus) ? "done" : ""} /></div><div><strong>Assessment ready</strong><span className={decisionCurrent ? "done" : ""} /></div></div><p className="owner-progress-note">Current stage: {currentStatus.label}</p>{verificationFailed && <p role="status">This bank evidence is unavailable: {record.verification?.result?.reason || label(verificationStatus)}. The lender will see the application without this verified bank evidence.</p>}{record.application.status === "awaiting_evidence" && record.latest_action?.action === "request_evidence" && <p role="status">The lender asked for {label(record.latest_action.evidence_type)}. Open Request & evidence to respond.</p>}<section className="panel"><h2>Current status</h2><ol className="owner-timeline"><li className="done"><strong>Application submitted</strong><span>{new Date(record.application.createdAt).toLocaleString("en-IN")}</span></li><li className={["verified_simulated", "ready"].includes(verificationStatus) ? "done" : verificationFailed ? "failed" : ""}><strong>Bank evidence</strong><span>{record.verification?.result?.reason || (["verified_simulated", "ready"].includes(verificationStatus) ? "Reviewed synthetic bank activity" : verificationStatus === "not_requested" ? "No bank evidence selected yet" : "Waiting for bank review")}</span></li><li className={decisionCurrent ? "done" : ""}><strong>Lender assessment</strong><span>{decisionCurrent ? record.decision.verdict : record.decision ? "Reassessment pending after evidence update" : "Pending"}</span></li><li className={decisionCurrent && record.latest_action ? "done" : ""}><strong>Lender action</strong><span>{decisionCurrent && record.latest_action ? label(record.latest_action.action) : "Pending"}</span></li></ol></section></main>}
      {applicationView === "evidence" && <main id="owner-evidence" className="owner-application-view"><h2>Request & evidence</h2><p>Details submitted with this application and the operating evidence selected for review.</p><section className="panel"><h2>Your request</h2><dl className="owner-details"><dt>Amount requested</dt><dd>{paiseToInr(record.application.requested_amount_paise)}</dd><dt>Business</dt><dd>{record.shop.name}</dd><dt>Type</dt><dd>{record.shop.business_type}</dd></dl></section><OwnerEvidenceChecklist record={record} /><OwnerCashflow rows={record.cashflows} leanDates={decisionCurrent ? record.decision?.capacity?.worst_4_week_dates : []} />{verificationFailed && record.verification?.source !== "aa_sandbox" && <BankRetry applicationId={id} onUpdated={async () => setRecord(await api("/applications/" + id))} />}{record.application.status === "awaiting_evidence" && record.latest_action?.action === "request_evidence" ? <EvidenceResponse record={record} onUpdated={async () => setRecord(await api("/applications/" + id))} /> : record.application.latest_evidence_response && <p role="status">Your latest evidence response was submitted. The lender will review it and reassess before showing updated terms.</p>}</main>}
      {applicationView === "assessment" && <main id="owner-assessment" className="owner-application-view"><h2>Assessment</h2><section className="panel"><h2>{decisionCurrent ? "Assessment result" : "Assessment pending"}</h2>{decisionCurrent ? <><p>{record.decision.explanation?.owner || record.decision.agent_detail?.explanation?.owner_text || "The lender recorded an assessment."}</p><dl className="owner-details"><dt>Requested amount</dt><dd>{paiseToInr(record.application.requested_amount_paise)}</dd><dt>Policy result</dt><dd>{label(record.decision.verdict)}</dd><dt>Policy proposed principal</dt><dd>{record.decision.principal_paise ? paiseToInr(record.decision.principal_paise) : "No positive offer"}</dd><dt>Tenure</dt><dd>{record.decision.tenure_months ? `${record.decision.tenure_months} months` : "—"}</dd><dt>Annual rate</dt><dd>{record.decision.rate_bps ? `${(record.decision.rate_bps / 100).toFixed(1)}%` : "—"}</dd><dt>Cadence</dt><dd>{record.decision.cadence || "—"}</dd><dt>Installment</dt><dd>{record.decision.repayment_amount_paise ? paiseToInr(record.decision.repayment_amount_paise) : "—"}</dd><dt>Total repayment</dt><dd>{record.decision.total_repayment_paise ? paiseToInr(record.decision.total_repayment_paise) : "—"}</dd><dt>Total interest</dt><dd>{record.decision.principal_paise && record.decision.total_interest_paise != null ? paiseToInr(record.decision.total_interest_paise) : "—"}</dd>{record.decision.p_auth != null && <><dt>Authenticity estimate</dt><dd>{Math.round(record.decision.p_auth * 100)}%{record.decision.authenticity_band ? ` · ${label(record.decision.authenticity_band)}` : ""}</dd></>}{record.decision.p_stress != null && <><dt>Lean-period stress</dt><dd>{Math.round(record.decision.p_stress * 100)}%{record.decision.risk_band ? ` · ${label(record.decision.risk_band)}` : ""}</dd></>}</dl>{record.decision.conditions?.length > 0 && <p>Next step: {record.decision.conditions.join("; ")}.</p>}{record.decision.not_run_reason && <p>Why the amount is limited: {label(record.decision.not_run_reason)}.</p>}<p>These model signals are uncalibrated for real lending. Assessment terms are a policy recommendation, not a loan offer. This workspace does not send email or SMS.</p><OwnerLenderAction record={record} /></> : <p>{record.decision ? "Evidence changed after the previous assessment. The lender must reassess before these terms are current." : "The lender’s assessment will appear here when it is ready. Check Progress for the current stage."}</p>}</section></main>}
    </> : !error && <SkeletonBlock className="owner-track-skeleton" label="Loading application"><Skeleton className="owner-track-title" /><Skeleton className="owner-track-subtitle" /><Skeleton className="owner-track-line" /><Skeleton className="owner-track-line" /><section className="panel"><Skeleton className="owner-track-line" /><Skeleton className="owner-track-line" /><Skeleton className="owner-track-line" /></section></SkeletonBlock> : <>
      <div className="owner-hero"><div><h1 className="page-title">Your credit workspace.</h1><p>See your requests, review progress, and apply using your shop activity.</p></div><div className="owner-actions"><Button to="/apply" arrow>New application</Button></div></div>
      {lenderAsked.length > 0 && <p role="status">The lender asked for more evidence on {lenderAsked.length === 1 ? "one application" : `${lenderAsked.length} applications`}. Open {lenderAsked.length === 1 ? "it" : "them"} from Applications to respond. This workspace does not send email or SMS.</p>}
      {bankPending.length > 0 && <p role="status">Bank review is pending on {bankPending.length === 1 ? "one application" : `${bankPending.length} applications`}. Open {bankPending.length === 1 ? "it" : "them"} from Applications to follow. This workspace does not send email or SMS.</p>}
      <div className="owner-dashboard-grid"><section className="owner-overview"><h2>Application overview</h2><div className="owner-summary">{listLoading ? ["Total applications", "In review", "Assessed"].map((name) => <div key={name}><Skeleton className="owner-summary-skeleton" /><span>{name}</span></div>) : [["Total applications", items.length], ["In review", reviewing], ["Assessed", assessed]].map(([name, value]) => <div key={name}><strong>{value}</strong><span>{name}</span></div>)}</div>{listLoading ? <SkeletonBlock className="owner-status-chart" label="Loading application overview">{["In review", "Assessed", "Interrupted"].map((name) => <div key={name}><span>{name}</span><Skeleton className="owner-chart-skeleton" /><Skeleton className="owner-chart-count" /></div>)}</SkeletonBlock> : <div className="owner-status-chart" role="img" aria-label={`${reviewing} in review, ${assessed} assessed, ${interrupted} interrupted`}>{[["In review", reviewing], ["Assessed", assessed], ["Interrupted", interrupted]].map(([name, value]) => <div key={name}><span>{name}</span><i style={{ width: `${items.length ? value / items.length * 100 : 0}%` }} /><strong>{value}</strong></div>)}</div>}<p className="owner-chart-note">Share of your applications · demo data</p></section><aside className="owner-next"><h2>What happens next?</h2><ol><li><strong>Tell us about your shop</strong><span>Enter business details and the amount you need.</span></li><li><strong>Choose operating evidence</strong><span>Select a simulated bank account for review.</span></li><li><strong>Follow the assessment</strong><span>Return here to see the lender’s result.</span></li></ol><Link to="/apply">Start an application →</Link></aside></div>
    </>}</div>
  </div></div></Shell>;
}

function OwnerCashflow({ rows, leanDates = [] }) {
  const weeks = weeklyCashflow(rows);
  return <section className="panel owner-cashflow"><h2>Your shop cashflow</h2><p>Weekly synthetic money in and out. The lender uses the weakest four weeks to judge what your shop may afford to repay.</p>{weeks.length ? <><CashflowChart weeks={weeks} leanDates={leanDates || []} /><div className="owner-cashflow-scroll"><table><caption>Weekly synthetic cashflow in rupees</caption><thead><tr><th scope="col">Week starting</th><th scope="col">Money in</th><th scope="col">Money out</th><th scope="col">Left over</th></tr></thead><tbody>{weeks.map((week) => <tr key={week.date}><th scope="row">{new Date(`${week.date}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}{leanDates?.includes(week.date) ? <small>Weakest period</small> : null}</th><td>{week.missing ? "No records" : paiseToInr(week.inflow)}</td><td>{week.missing ? "No records" : paiseToInr(week.outflow)}</td><td>{week.missing ? "No records" : paiseToInr(week.inflow - week.outflow)}</td></tr>)}</tbody></table></div></> : <p>No dated bank activity is available yet. Bank review may add it later.</p>}</section>;
}

function OwnerEvidenceChecklist({ record }) {
  const requested = record.application.status === "awaiting_evidence" && record.latest_action?.action === "request_evidence" ? record.latest_action.evidence_type : null;
  const bank = record.verification?.status || "not_requested";
  const bankState = ["verified_simulated", "ready"].includes(bank) ? "Reviewed in demo" : ["pending", "pending_consent", "consent_active", "fetching"].includes(bank) ? "Awaiting bank review" : ["mismatch", "insufficient_evidence", "rejected", "revoked", "expired", "stale"].includes(bank) ? "Bank evidence unavailable" : "Not selected";
  const railState = (type) => {
    const rails = record.rails?.filter((rail) => rail.type === type) || [];
    if (rails.some((rail) => rail.trustClass === "verified_simulated")) return "Simulated verified evidence";
    if (rails.length) return "Supporting evidence only";
    if (requested === type) return "Requested by lender — respond below";
    return "Not attached";
  };
  return <section className="panel owner-evidence-checklist"><h2>Evidence checklist</h2><p>These sources are simulated. A listed source is not a live connection.</p><ul>{[["Bank account", bankState], ["UPI activity", railState("upi")], ["Account Aggregator", railState("aa")], ["GST summary", railState("gst")]].map(([name, state]) => <li key={name}><strong>{name}</strong><span>{state}</span></li>)}</ul>{requested && <p><a href="#owner-evidence-response">Lender requested {label(requested)}: {record.latest_action.reason}. Respond below.</a></p>}<p>PDF uploads can support context but cannot count as verified operating activity.</p></section>;
}

function OwnerLenderAction({ record }) {
  const action = record.latest_action;
  if (!action) return <p>Lender action: awaiting review.</p>;
  const effective = action.effective || {};
  return <div className="owner-lender-action"><h3>Recorded lender action</h3><p><strong>{label(action.action)}</strong>{action.createdAt ? ` · ${new Date(action.createdAt).toLocaleString("en-IN")}` : ""}</p>{action.reason && <p>Reason: {action.reason}</p>}{effective.verdict && <p>Effective result: {label(effective.verdict)}{effective.principal_paise > 0 ? ` · ${paiseToInr(effective.principal_paise)}` : ""}</p>}{effective.repayment_amount_paise != null && <p>Recorded terms: {paiseToInr(effective.repayment_amount_paise)} each {effective.cadence} for {effective.repayment_periods} payments · total repayment {paiseToInr(effective.total_repayment_paise)} · total interest {paiseToInr(effective.total_interest_paise)}.</p>}{action.action === "request_evidence" && <p><a href="#owner-evidence">Open Request & evidence to respond.</a></p>}</div>;
}

function BankRetry({ applicationId, onUpdated }) {
  const [accounts, setAccounts] = useState([]);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    api("/bank/demo-accounts").then((rows) => { if (active) { setAccounts(rows); setError(""); } }).catch((e) => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [retry]);
  async function submit(event) {
    event.preventDefault();
    if (!accounts.some((account) => account.public_ref === selected)) return;
    setBusy(true); setError("");
    try {
      await api(`/applications/${applicationId}/verification-requests`, { method: "POST", headers: { "Idempotency-Key": idem() }, body: JSON.stringify({ public_ref: selected }) });
      await onUpdated();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  return <section className="panel"><h2>Try another demo bank account</h2><p>The previous bank review did not verify this account. Choose a listed synthetic account for a new review.</p>{accounts.length ? <form onSubmit={submit}><label>Demo bank account<select value={selected} onChange={(event) => setSelected(event.target.value)} required><option value="">Choose an account</option>{accounts.map((account) => <option key={account.public_ref} value={account.public_ref}>{account.label} · {account.masked_number}</option>)}</select></label><button className="btn btn-secondary" disabled={!selected || busy}>{busy ? "Submitting…" : "Request another review"}</button></form> : <button className="btn btn-secondary" type="button" onClick={() => setRetry((value) => value + 1)}>Load demo accounts</button>}{error && <p role="alert">{error}</p>}</section>;
}

function EvidenceResponse({ record, onUpdated }) {
  const requested = record.latest_action.evidence_type;
  const bankPath = requested === "upi";
  const [options, setOptions] = useState([]);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [optionsRetry, setOptionsRetry] = useState(0);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setOptionsLoading(true);
    const path = bankPath ? "/bank/demo-accounts" : `/evidence/demo-fixtures?type=${encodeURIComponent(requested)}`;
    api(path).then((rows) => { if (active) setOptions(rows); }).catch((e) => { if (active) setError(e.message); }).finally(() => { if (active) setOptionsLoading(false); });
    return () => { active = false; };
  }, [bankPath, requested, optionsRetry]);
  const status = record.verification?.status;
  const awaitingReview = bankPath && status === "pending";
  const accepted = bankPath && status === "verified_simulated";
  const fixtureSubmitted = !bankPath && record.application.latest_evidence_response?.evidence_type === requested;
  async function submit(event) {
    event.preventDefault();
    if (!options.some((item) => item.public_ref === selected)) return;
    setBusy(true); setError("");
    try {
      await api(`/applications/${record.application._id}/${bankPath ? "verification-requests" : "evidence-responses"}`, {
        method: "POST", headers: { "Idempotency-Key": idem() },
        body: JSON.stringify({ public_ref: selected }),
      });
      await onUpdated();
      setSelected("");
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  const copy = {
    aa: "This attaches a listed synthetic Account Aggregator file. It is not a live AA consent.",
    gst: "This attaches a listed synthetic GST summary. It is not a live GST portal filing.",
    identity: "This attaches a listed synthetic identity record for the shop name check.",
    reconciliation: "This attaches an updated synthetic GST total so the lender can re-check the GST/UPI gap.",
    other: "This attaches supporting PDF context only. It cannot satisfy a verified operational rail.",
  };
  return <section id="owner-evidence-response" className="panel owner-result owner-evidence-request">
    <h2>Your lender needs more evidence</h2>
    <p><strong>Requested: {label(requested || "supporting evidence")}</strong></p>
    <p>{record.latest_action.reason}</p>
    <small>This request is linked to application {record.application._id.slice(0, 8)}.</small>
    {awaitingReview ? <p role="status">Your selected demo account is awaiting bank admin review.</p>
      : accepted ? <p role="status">Bank review is complete. The lender must reassess this application using the new evidence.</p>
      : fixtureSubmitted ? <p role="status">Your listed {label(requested)} fixture is attached. The previous assessment is not current until the lender reassesses.</p>
      : optionsLoading ? <SkeletonBlock label="Loading evidence options"><Skeleton className="owner-field-skeleton" /></SkeletonBlock>
      : error && !options.length ? <button className="btn btn-secondary" onClick={() => { setError(""); setOptionsLoading(true); setOptionsRetry((retry) => retry + 1); }}>Try loading evidence again</button>
      : <form className="owner-evidence-response" onSubmit={submit}>
        <label>{bankPath ? "Demo bank account for review" : `Listed ${label(requested)} fixture`}
          <select value={selected} onChange={(event) => setSelected(event.target.value)} required>
            <option value="">Choose a listed record</option>
            {options.map((item) => <option key={item.public_ref} value={item.public_ref}>{item.label || item.masked_number} · {item.public_ref}</option>)}
          </select>
        </label>
        <p>{bankPath ? "Bank review can add simulated merchant activity. It does not create an AA, GST, or identity rail." : copy[requested] || "Only a listed synthetic fixture can be submitted. You cannot mark it verified yourself."}</p>
        <button className="btn btn-secondary" disabled={!selected || busy}>{busy ? "Submitting…" : bankPath ? "Submit account for review" : "Submit listed fixture"}</button>
      </form>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
