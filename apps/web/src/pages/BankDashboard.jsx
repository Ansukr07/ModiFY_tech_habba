import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Shell } from "../components/Shell.jsx";
import { BackButton } from "../components/BackButton.jsx";
import { Skeleton, SkeletonBlock } from "../components/Skeleton.jsx";
import { api, idem } from "../data/api.js";
import { paiseToInr } from "../data/seed.js";
import "../bank.css";

const statuses = { pending: "Pending review", verified_simulated: "Simulated verified", mismatch: "Identity mismatch", insufficient_evidence: "Insufficient evidence" };
const Page = ({ children }) => <Shell role="bank_admin"><div className="bank-page">{children}</div></Shell>;

export function BankDashboard() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [listLoading, setListLoading] = useState(true);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(Boolean(id));
  const [status, setStatus] = useState("pending");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const refresh = () => api("/bank/dashboard").then(setData).catch((e) => setError(e.message)).finally(() => setListLoading(false));
  const refreshDetail = () => { setError(""); setDetailLoading(true); return api("/bank/verification-requests/" + id).then(setDetail).catch((e) => setError(e.message)).finally(() => setDetailLoading(false)); };
  useEffect(() => { refresh(); }, []);
  useEffect(() => {
    if (!id) { setDetail(null); setDetailLoading(false); return; }
    let active = true;
    setDetail(null);
    setDetailLoading(true);
    api("/bank/verification-requests/" + id).then((row) => { if (active) setDetail(row); }).catch((e) => { if (active) setError(e.message); }).finally(() => { if (active) setDetailLoading(false); });
    return () => { active = false; };
  }, [id]);
  async function review(action) {
    setBusy(true); setError("");
    try { await api("/bank/verification-requests/" + id + "/decision", { method: "POST", headers: { "Idempotency-Key": idem() }, body: JSON.stringify({ action, reason }) }); await refresh(); setDetail(await api("/bank/verification-requests/" + id)); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <Page><header className="bank-heading"><div><h1>{id ? "Verification review" : "Bank simulation"}</h1><p>Compare the submitted business with independent, synthetic bank records. Confirmation is for this demo only.</p></div></header>{error && <p role="alert" className="bank-error">{error} <button className="btn btn-secondary" onClick={id ? refreshDetail : refresh}>Try again</button></p>}{id && !detail ? (detailLoading || !error ? <BankDetailSkeleton /> : null) : !detail ? <><div className="bank-counts">{listLoading ? Object.values(statuses).map((label) => <div key={label}><Skeleton className="bank-count-skeleton" /><span>{label}</span></div>) : Object.entries(data?.counts || {}).map(([key, value]) => <div key={key}><strong>{value}</strong><span>{statuses[key]}</span></div>)}</div><nav className="bank-filters" aria-label="Verification status">{["pending", "verified_simulated", "mismatch", "insufficient_evidence"].map((item) => <button type="button" key={item} className={status === item ? "selected" : ""} aria-pressed={status === item} onClick={() => setStatus(item)}>{statuses[item]}</button>)}</nav><section className="bank-queue"><div className="bank-queue-head"><h2>Verification requests</h2>{listLoading ? <Skeleton className="bank-queue-count" /> : <span>{data?.recent?.filter((x) => x.status === status).length || 0}</span>}</div>{listLoading ? <SkeletonBlock label="Loading verification requests">{[0, 1, 2, 3].map((row) => <div className="bank-row-skeleton" key={row}><span><Skeleton /><Skeleton className="short" /></span><Skeleton /><Skeleton className="bank-arrow-skeleton" /></div>)}</SkeletonBlock> : <>{(data?.recent || []).filter((x) => x.status === status).map((item) => <Link className="bank-row" key={item._id} to={'/bank/verification/' + item._id}><span><strong>{item.shop_id}</strong><small>{item.account_id} · {new Date(item.createdAt).toLocaleString("en-IN")}</small></span><span className={'bank-status bank-' + item.status}>{statuses[item.status]}</span><span aria-hidden="true">→</span></Link>)}{!error && !data?.recent?.some((x) => x.status === status) && <p className="bank-empty">No {statuses[status]?.toLowerCase()} requests.</p>}</>}</section></> : <><BackButton className="bank-back" to="/bank">Review queue</BackButton><div className="bank-case"><section><h2>Owner application</h2><dl><dt>Business name</dt><dd>{detail.shop?.name}</dd><dt>Business type</dt><dd>{detail.shop?.business_type}</dd><dt>Requested</dt><dd>{paiseToInr(detail.application?.requested_amount_paise)}</dd><dt>Submitted identity</dt><dd>{detail.shop?.name} · {detail.shop?.city}</dd></dl></section><section><h2>Synthetic bank record</h2><dl><dt>Account holder</dt><dd>{detail.account?.label}</dd><dt>Account</dt><dd>{detail.account?.public_ref} · {detail.account?.masked_number}</dd><dt>Source</dt><dd>Server held demo fixture · bank-v1</dd></dl></section></div><section className="bank-queue"><h2>What the admin verifies</h2><p className="bank-review-intro">Check that the business name matches the account holder, the account is active, and at least eight weeks of valid transactions are available.</p>{detail.checks?.map((check) => <div className="bank-check" key={check.name}><strong>{check.name.replaceAll("_", " ")}</strong><span>{check.reason}</span><b>{check.status === "pass" ? "Pass" : "Fail"}</b></div>)}<p className="bank-recommendation">Recommendation: <strong>{statuses[detail.recommendation] || detail.recommendation}</strong></p></section><section className="bank-queue"><div className="bank-queue-head"><h2>Transaction activity</h2><span>{detail.transaction_summary?.transaction_count || 0} rows</span></div><p>{detail.transaction_summary?.covered_from} — {detail.transaction_summary?.covered_to} · Credits {paiseToInr(detail.transaction_summary?.total_credit_paise || 0)} · Debits {paiseToInr(detail.transaction_summary?.total_debit_paise || 0)}</p><div className="bank-table-wrap"><table><thead><tr><th>Date</th><th>Credit</th><th>Debit</th><th>Payer</th><th>Source</th></tr></thead><tbody>{detail.transactions?.slice(0, 40).map((tx) => <tr key={tx._id}><td>{tx.posted_at}</td><td>{paiseToInr(tx.inflow_paise)}</td><td>{paiseToInr(tx.outflow_paise)}</td><td>{tx.payer_id}</td><td>{tx.source_rail}</td></tr>)}</tbody></table></div><small>Source hash {detail.source_hash}</small></section>{detail.status === "pending" ? <section className="bank-review"><h2>Record review outcome</h2>{detail.recommendation === "verified_simulated" ? <p>Confirming publishes a simulated verification result for lender assessment. It does not prove real account ownership.</p> : <p>Confirm is unavailable. {detail.checks?.filter((check) => check.status !== "pass").map((check) => check.reason).join(". ") || "Required checks did not pass"}. This record is not a verified rail. Send it to the agent so the lender sees an unscored application basis instead of an offer.</p>}<label>Rejection reason<input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Required when rejecting" /></label>{detail.recommendation === "verified_simulated" ? <button className="btn btn-primary" disabled={busy} onClick={() => review("confirm")}>{busy ? "Saving…" : "Confirm simulated verification"}</button> : <button className="btn btn-primary" disabled={busy} onClick={() => review("release")}>{busy ? "Saving…" : "Send to agent"}</button>}<button className="btn btn-secondary" disabled={busy || reason.trim().length < 8} onClick={() => review("reject")}>Reject request</button></section> : <section className="bank-review"><h2>{statuses[detail.status]}</h2><p>{detail.result?.reason}</p><p>Reviewed {detail.result?.reviewed_at}</p>{detail.result?.statement && <p>Statement issued for the analyst: {detail.result.statement.filename} · {detail.result.statement.row_count} rows · SHA-256 {detail.result.statement.sha256?.slice(0, 12)}</p>}    </section>}</>}</Page>;
}

function BankDetailSkeleton() {
  return <SkeletonBlock className="bank-detail-skeleton" label="Loading verification review">
    <div className="bank-case-skeleton"><section><Skeleton className="bank-skeleton-title" /><Skeleton /><Skeleton /><Skeleton /></section><section><Skeleton className="bank-skeleton-title" /><Skeleton /><Skeleton /><Skeleton /></section></div>
    <section className="bank-queue">{[0, 1, 2].map((row) => <div className="bank-check-skeleton" key={row}><Skeleton /><Skeleton /><Skeleton /></div>)}</section>
    <section className="bank-queue bank-table-skeleton"><Skeleton className="bank-skeleton-title" />{[0, 1, 2, 3, 5].map((row) => <Skeleton key={row} />)}</section>
  </SkeletonBlock>;
}
