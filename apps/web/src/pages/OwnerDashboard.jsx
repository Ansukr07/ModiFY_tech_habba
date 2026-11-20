import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { Shell } from "../components/Shell.jsx";
import { OwnerSidebar } from "../components/OwnerSidebar.jsx";
import Button from "../components/Button.jsx";
import { BackButton } from "../components/BackButton.jsx";
import { Skeleton, SkeletonBlock } from "../components/Skeleton.jsx";
import { api, idem } from "../data/api.js";
import { paiseToInr } from "../data/seed.js";
import "../owner.css";

const label = (value) => String(value || "Pending").replaceAll("_", " ");

export function OwnerDashboard() {
  const { id } = useParams();
  const { hash } = useLocation();
  const applicationView = hash === "#owner-evidence" ? "evidence" : hash === "#owner-assessment" ? "assessment" : "progress";
  const [items, setItems] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [record, setRecord] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => { api("/applications").then(({ items: rows }) => setItems(rows)).catch(e => setError(e.message)).finally(() => setListLoading(false)); }, []);
  useEffect(() => {
    if (!id) { setRecord(null); return; }
    let active = true;
    setRecord(null);
    api("/applications/" + id).then((row) => { if (active) setRecord(row); }).catch((e) => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [id]);
  const reviewing = items.filter(item => ["submitted", "assessing", "awaiting_evidence", "awaiting_verification"].includes(item.status)).length;
  const assessed = items.filter(item => ["assessed", "reviewed"].includes(item.status)).length;
  const interrupted = items.filter(item => item.status === "failed").length;
  const lenderAsked = items.filter(item => item.status === "awaiting_evidence");
  const bankPending = items.filter(item => item.status === "awaiting_verification");
  const decisionCurrent = !!record?.decision && record.decision.input_revision === record.application.input_revision;

  return <Shell role="owner"><div className="page owner-page"><div className="owner-workspace">
    <OwnerSidebar application={Boolean(id)} />
    <div className="owner-workspace-main">{error && <p role="alert">{error}</p>}{id ? record ? <>
      <div className="owner-track-head"><div><BackButton className="owner-back" to="/owner/applications">All applications</BackButton><h1 className="page-title">{record.shop.name}</h1><p>Application {record.application._id.slice(0, 8)} · {label(record.application.status)}</p></div></div>
      {applicationView === "progress" && <main id="owner-progress" className="owner-application-view"><h2>Progress</h2><p>Follow your request from submission through bank review and lender assessment.</p><div className="owner-progress"><div><strong>Submitted</strong><span className="done" /></div><div><strong>Bank review</strong><span className={record.verification?.status === "verified_simulated" ? "done" : ""} /></div><div><strong>Assessment ready</strong><span className={decisionCurrent ? "done" : ""} /></div></div><p className="owner-progress-note">Current stage: {label(record.verification?.status || "not_requested")}</p>{record.latest_action?.action === "request_evidence" && <p role="status">The lender asked for {label(record.latest_action.evidence_type)}. Open Request & evidence to respond.</p>}<section className="panel"><h2>Current status</h2><ol className="owner-timeline"><li className="done"><strong>Application submitted</strong><span>{new Date(record.application.createdAt).toLocaleString("en-IN")}</span></li><li className={record.verification?.status === "verified_simulated" ? "done" : ""}><strong>Bank verification</strong><span>{record.verification?.result?.reason || "Waiting for bank admin review"}</span></li><li className={decisionCurrent ? "done" : ""}><strong>Lender assessment</strong><span>{decisionCurrent ? record.decision.verdict : record.decision ? "Reassessment pending after evidence update" : "Pending"}</span></li></ol></section></main>}
      {applicationView === "evidence" && <main id="owner-evidence" className="owner-application-view"><h2>Request & evidence</h2><p>Details submitted with this application and the operating evidence selected for review.</p><section className="panel"><h2>Your request</h2><dl className="owner-details"><dt>Amount requested</dt><dd>{paiseToInr(record.application.requested_amount_paise)}</dd><dt>Business</dt><dd>{record.shop.name}</dd><dt>Type</dt><dd>{record.shop.business_type}</dd><dt>Evidence</dt><dd>{record.rails?.map(rail => rail.type.toUpperCase()).join(", ") || "Bank review pending"}</dd></dl></section>{record.latest_action?.action === "request_evidence" && <EvidenceResponse record={record} onUpdated={async () => setRecord(await api("/applications/" + id))} />}</main>}
      {applicationView === "assessment" && <main id="owner-assessment" className="owner-application-view"><h2>Assessment</h2><section className="panel"><h2>{decisionCurrent ? "Assessment result" : "Assessment pending"}</h2>{decisionCurrent ? <><p>{record.decision.explanation?.owner || record.decision.agent_detail?.explanation?.owner_text || "The lender recorded an assessment."}</p><dl className="owner-details"><dt>Result</dt><dd>{label(record.decision.verdict)}</dd><dt>Proposed principal</dt><dd>{record.decision.principal_paise ? paiseToInr(record.decision.principal_paise) : "No positive offer"}</dd><dt>Tenure</dt><dd>{record.decision.tenure_months ? `${record.decision.tenure_months} months` : "—"}</dd><dt>Annual rate</dt><dd>{record.decision.rate_bps ? `${(record.decision.rate_bps / 100).toFixed(1)}%` : "—"}</dd><dt>Cadence</dt><dd>{record.decision.cadence || "—"}</dd><dt>Installment</dt><dd>{record.decision.repayment_amount_paise ? paiseToInr(record.decision.repayment_amount_paise) : "—"}</dd><dt>Total repayment</dt><dd>{record.decision.total_repayment_paise ? paiseToInr(record.decision.total_repayment_paise) : "—"}</dd><dt>Total interest</dt><dd>{record.decision.principal_paise && record.decision.total_interest_paise != null ? paiseToInr(record.decision.total_interest_paise) : "—"}</dd>{record.decision.p_auth != null && <><dt>Authenticity estimate</dt><dd>{Math.round(record.decision.p_auth * 100)}%{record.decision.authenticity_band ? ` · ${label(record.decision.authenticity_band)}` : ""}</dd></>}{record.decision.p_stress != null && <><dt>Lean-period stress</dt><dd>{Math.round(record.decision.p_stress * 100)}%{record.decision.risk_band ? ` · ${label(record.decision.risk_band)}` : ""}</dd></>}</dl>{record.decision.conditions?.length > 0 && <p>Next step: {record.decision.conditions.join("; ")}.</p>}{record.decision.not_run_reason && <p>Why the amount is limited: {label(record.decision.not_run_reason)}.</p>}<p>Assessment terms are not a loan offer. This workspace does not send email or SMS.</p></> : <p>{record.decision ? "Evidence changed after the previous assessment. The lender must reassess before these terms are current." : "The lender’s assessment will appear here when it is ready. Check Progress for the current stage."}</p>}</section></main>}
    </> : !error && <SkeletonBlock className="owner-track-skeleton" label="Loading application"><Skeleton className="owner-track-title" /><Skeleton className="owner-track-subtitle" /><Skeleton className="owner-track-line" /><Skeleton className="owner-track-line" /><section className="panel"><Skeleton className="owner-track-line" /><Skeleton className="owner-track-line" /><Skeleton className="owner-track-line" /></section></SkeletonBlock> : <>
      <div className="owner-hero"><div><h1 className="page-title">Your credit workspace.</h1><p>See your requests, review progress, and apply using your shop activity.</p></div><div className="owner-actions"><Button to="/apply" arrow>New application</Button></div></div>
      {lenderAsked.length > 0 && <p role="status">The lender asked for more evidence on {lenderAsked.length === 1 ? "one application" : `${lenderAsked.length} applications`}. Open {lenderAsked.length === 1 ? "it" : "them"} from Applications to respond. This workspace does not send email or SMS.</p>}
      {bankPending.length > 0 && <p role="status">Bank review is pending on {bankPending.length === 1 ? "one application" : `${bankPending.length} applications`}. Open {bankPending.length === 1 ? "it" : "them"} from Applications to follow. This workspace does not send email or SMS.</p>}
      <div className="owner-dashboard-grid"><section className="owner-overview"><h2>Application overview</h2><div className="owner-summary">{listLoading ? ["Total applications", "In review", "Assessed"].map((name) => <div key={name}><Skeleton className="owner-summary-skeleton" /><span>{name}</span></div>) : [["Total applications", items.length], ["In review", reviewing], ["Assessed", assessed]].map(([name, value]) => <div key={name}><strong>{value}</strong><span>{name}</span></div>)}</div>{listLoading ? <SkeletonBlock className="owner-status-chart" label="Loading application overview">{["In review", "Assessed", "Interrupted"].map((name) => <div key={name}><span>{name}</span><Skeleton className="owner-chart-skeleton" /><Skeleton className="owner-chart-count" /></div>)}</SkeletonBlock> : <div className="owner-status-chart" role="img" aria-label={`${reviewing} in review, ${assessed} assessed, ${interrupted} interrupted`}>{[["In review", reviewing], ["Assessed", assessed], ["Interrupted", interrupted]].map(([name, value]) => <div key={name}><span>{name}</span><i style={{ width: `${items.length ? value / items.length * 100 : 0}%` }} /><strong>{value}</strong></div>)}</div>}<p className="owner-chart-note">Share of your applications · demo data</p></section><aside className="owner-next"><h2>What happens next?</h2><ol><li><strong>Tell us about your shop</strong><span>Enter business details and the amount you need.</span></li><li><strong>Choose operating evidence</strong><span>Select a simulated bank account for review.</span></li><li><strong>Follow the assessment</strong><span>Return here to see the lender’s result.</span></li></ol><Link to="/apply">Start an application →</Link></aside></div>
    </>}</div>
  </div></div></Shell>;
}

function EvidenceResponse({ record, onUpdated }) {
  const requested = record.latest_action.evidence_type;
  const bankPath = requested === "upi";
  const [options, setOptions] = useState([]);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setOptionsLoading(true);
    const path = bankPath ? "/bank/demo-accounts" : `/evidence/demo-fixtures?type=${encodeURIComponent(requested)}`;
    api(path).then((rows) => { if (active) setOptions(rows); }).catch((e) => { if (active) setError(e.message); }).finally(() => { if (active) setOptionsLoading(false); });
    return () => { active = false; };
  }, [bankPath, requested]);
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
  return <section className="panel owner-result owner-evidence-request">
    <h2>Your lender needs more evidence</h2>
    <p><strong>Requested: {label(requested || "supporting evidence")}</strong></p>
    <p>{record.latest_action.reason}</p>
    <small>This request is linked to application {record.application._id.slice(0, 8)}.</small>
    {awaitingReview ? <p role="status">Your selected demo account is awaiting bank admin review.</p>
      : accepted ? <p role="status">Bank review is complete. The lender must reassess this application using the new evidence.</p>
      : fixtureSubmitted ? <p role="status">Your listed {label(requested)} fixture is attached. The previous assessment is not current until the lender reassesses.</p>
      : optionsLoading ? <SkeletonBlock label="Loading evidence options"><Skeleton className="owner-field-skeleton" /></SkeletonBlock>
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
