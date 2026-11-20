import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Shell } from "../components/Shell.jsx";
import { api } from "../data/api.js";
import { paiseToInr } from "../data/seed.js";
import "../owner.css";

const label = (value) => String(value || "Pending").replaceAll("_", " ");

export function OwnerDashboard() {
  const { id } = useParams();
  const [items, setItems] = useState([]);
  const [record, setRecord] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => { api("/applications").then(({ items: rows }) => setItems(rows)).catch(e => setError(e.message)); }, []);
  useEffect(() => { if (id) api("/applications/" + id).then(setRecord).catch(e => setError(e.message)); else setRecord(null); }, [id]);
  const reviewing = items.filter(item => ["submitted", "assessing", "awaiting_evidence"].includes(item.status)).length;
  const assessed = items.filter(item => ["assessed", "reviewed"].includes(item.status)).length;
  const interrupted = items.filter(item => item.status === "failed").length;

  return <Shell role="owner"><div className="page owner-page"><div className="owner-workspace">
    <aside className="owner-workspace-sidebar"><strong>Owner dashboard</strong><Link className={!id ? "active" : ""} to="/owner">Overview</Link><Link to="/owner/applications">Applications</Link>{id && <><a href="#owner-progress">Progress</a><a href="#owner-evidence">Evidence</a><a href="#owner-assessment">Assessment</a></>}<Link to="/apply">New application</Link><p>Synthetic demo data</p></aside>
    <div className="owner-workspace-main">{error && <p role="alert">{error}</p>}{id ? record ? <>
      <div className="owner-track-head"><div><h1 className="page-title">{record.shop.name}</h1><p>Application {record.application._id.slice(0, 8)} · {label(record.application.status)}</p></div><Link className="btn btn-secondary" to="/owner">All applications</Link></div>
      <div className="owner-progress" id="owner-progress"><div><strong>Submitted</strong><span className="done" /></div><div><strong>Bank review</strong><span className={record.verification?.status === "verified_simulated" ? "done" : ""} /></div><div><strong>Assessment ready</strong><span className={record.decision ? "done" : ""} /></div></div><p className="owner-progress-note">Current stage: {label(record.verification?.status || "not_requested")} · synthetic demo</p>
      <div className="owner-track-grid"><section className="panel"><h2>Current status</h2><ol className="owner-timeline"><li className="done"><strong>Application submitted</strong><span>{new Date(record.application.createdAt).toLocaleString("en-IN")}</span></li><li className={record.verification?.status === "verified_simulated" ? "done" : ""}><strong>Bank verification</strong><span>{record.verification?.result?.reason || "Waiting for bank admin review"}</span></li><li className={record.decision ? "done" : ""}><strong>Lender assessment</strong><span>{record.decision?.verdict || "Pending"}</span></li></ol></section><section className="panel" id="owner-evidence"><h2>Your request</h2><dl className="owner-details"><dt>Amount requested</dt><dd>{paiseToInr(record.application.requested_amount_paise)}</dd><dt>Business</dt><dd>{record.shop.name}</dd><dt>Type</dt><dd>{record.shop.business_type}</dd><dt>Evidence</dt><dd>{record.rails?.map(rail => rail.type.toUpperCase()).join(", ") || "Bank review pending"}</dd></dl></section></div>
      {record.latest_action?.action === "request_evidence" && <section className="panel owner-result"><h2>Your lender needs more evidence</h2><p>{record.latest_action.reason}</p></section>}
      {record.decision && <section className="panel owner-result" id="owner-assessment"><h2>Assessment result</h2><p><strong>{record.decision.verdict}</strong> · Proposed principal {paiseToInr(record.decision.principal_paise || 0)}</p><p>Assessment terms are not a loan offer.</p></section>}
    </> : <p>Loading application…</p> : <>
      <div className="owner-hero"><div><h1 className="page-title">Your credit workspace.</h1><p>See your requests, review progress, and apply using your shop activity.</p></div><div className="owner-actions"><Link className="btn btn-primary" to="/apply">New application →</Link></div></div>
      <div className="owner-dashboard-grid"><section className="owner-overview"><h2>Application overview</h2><div className="owner-summary">{[["Total applications", items.length], ["In review", reviewing], ["Assessed", assessed]].map(([name, value]) => <div key={name}><strong>{value}</strong><span>{name}</span></div>)}</div><div className="owner-status-chart" role="img" aria-label={`${reviewing} in review, ${assessed} assessed, ${interrupted} interrupted`}>{[["In review", reviewing], ["Assessed", assessed], ["Interrupted", interrupted]].map(([name, value]) => <div key={name}><span>{name}</span><i style={{ width: `${items.length ? value / items.length * 100 : 0}%` }} /><strong>{value}</strong></div>)}</div><p className="owner-chart-note">Share of your applications · demo data</p></section><aside className="owner-next"><h2>What happens next?</h2><ol><li><strong>Tell us about your shop</strong><span>Enter business details and the amount you need.</span></li><li><strong>Choose operating evidence</strong><span>Select a simulated bank account for review.</span></li><li><strong>Follow the assessment</strong><span>Return here to see the lender’s result.</span></li></ol><Link to="/apply">Start an application →</Link></aside></div>
    </>}</div>
  </div></div></Shell>;
}
