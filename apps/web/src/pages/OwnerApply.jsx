import { startApplyDemo } from "../components/DemoPlayer.jsx";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Shell } from "../components/Shell.jsx";
import Button from "../components/Button.jsx";
import { BackButton } from "../components/BackButton.jsx";
import { Skeleton, SkeletonBlock } from "../components/Skeleton.jsx";
import { api, idem } from "../data/api.js";
import "../owner.css";

export function OwnerApply() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", type: "", city: "", upi: "", amount: "", evidence: "" });
  const [accounts, setAccounts] = useState([]);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const key = useRef(idem());
  useEffect(() => { api("/bank/demo-accounts").then(setAccounts).catch(() => setAccounts([])).finally(() => setAccountsLoading(false)); }, []);
  const change = e => setForm({ ...form, [e.target.name]: e.target.value });
  const selectedAccount = accounts.find(account => account.public_ref === form.evidence);
  async function submit(e) {
    e.preventDefault();
    setError("");
    const amount = Number(form.amount);
    if (!Number.isSafeInteger(amount * 100) || amount <= 0 || !selectedAccount) { setError("Enter a positive whole rupee amount and choose a demo bank account."); return; }
    setBusy(true);
    try {
      const shop = await api("/shops", { method: "POST", body: JSON.stringify({ name: form.name.trim(), business_type: form.type.trim(), identity: { city: form.city.trim(), vpa: form.upi.trim() } }) });
      const application = await api("/applications", { method: "POST", headers: { "Idempotency-Key": key.current }, body: JSON.stringify({ shop_id: shop._id, requested_amount_paise: amount * 100 }) });
      await api(`/applications/${application._id}/verification-requests`, { method: "POST", headers: { "Idempotency-Key": idem() }, body: JSON.stringify({ public_ref: selectedAccount.public_ref }) });
      navigate(`/owner/application/${application._id}`);
    } catch (err) { setError(err.message); key.current = idem(); }
    finally { setBusy(false); }
  }
  return <Shell role="owner"><div className="page owner-page">
    <BackButton className="owner-back" to="/owner">Owner dashboard</BackButton>
    <div className="owner-form-head"><h1 className="page-title">Apply using your shop activity</h1><p>Tell us about your business, attach a simulated bank account, and send a funding request for lender review.</p><button className="owner-demo-start" type="button" onClick={startApplyDemo}><span className="owner-demo-start-icon" aria-hidden="true"><svg viewBox="0 0 20 20" fill="none"><path d="m7.5 5.5 6 4.5-6 4.5v-9Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg></span><span>Watch full demo</span><svg className="owner-demo-start-arrow" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4 10h11m0 0-4.5-4.5M15 10l-4.5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg></button></div>
    <div className="owner-form-layout"><aside className="owner-form-map" aria-label="Application steps"><a href="#business">01 Business details</a><a href="#evidence">02 Evidence</a><a href="#funding">03 Funding request</a><p>No live bank connection or loan disbursal occurs in this demo.</p></aside>
    <form className="owner-application" onSubmit={submit}>
      <section id="business" data-demo="business"><div className="owner-step"><span>1</span><div><h2>Business details</h2><p>Start with the basics about your shop.</p></div></div><div className="owner-fields"><label>Business name<input required name="name" value={form.name} onChange={change} autoComplete="organization" /></label><label>Business type<input required name="type" value={form.type} onChange={change} placeholder="For example, kirana store" /></label><label>City<input required name="city" value={form.city} onChange={change} /></label></div></section>
      <section id="evidence" data-demo="evidence"><div className="owner-step"><span>2</span><div><h2>Attach a demo bank account</h2><p>Select the synthetic bank record for the admin to review.</p></div></div><div className="owner-fields"><label>UPI ID (optional)<input name="upi" value={form.upi} onChange={change} placeholder="shop@upi" /></label><p className="owner-evidence-note">Submitted UPI ID is shown to the lender. It does not verify payment activity.</p><label>Demo bank account{accountsLoading ? <SkeletonBlock label="Loading demo bank accounts"><Skeleton className="owner-field-skeleton" /></SkeletonBlock> : <select name="evidence" value={selectedAccount ? form.evidence : ""} onChange={change} required><option value="">Choose a demo account</option>{accounts.map(a => <option key={a.public_ref} value={a.public_ref}>{a.label} · {a.masked_number} · {a.public_ref}</option>)}</select>}</label><p className="owner-evidence-note">The admin checks the business name, account status, and transaction history. No live bank account is connected.</p>{selectedAccount && <p className="owner-evidence-note">The business name you enter above should match <strong>{selectedAccount.label}</strong> in the synthetic bank record. The admin makes the verification decision after submission.</p>}</div></section>
      <section id="funding" data-demo="funding"><div className="owner-step"><span>3</span><div><h2>Funding request</h2><p>Tell the lender how much you need.</p></div></div><div className="owner-fields"><label>Requested amount (₹)<input required type="number" name="amount" min="1" step="1" value={form.amount} onChange={change} /></label></div></section>
      <div className="owner-review-summary"><h2>Before you submit</h2><p><strong>{form.name.trim() || "Your business"}</strong> requests <strong>{form.amount ? `₹${Number(form.amount).toLocaleString("en-IN")}` : "an amount"}</strong>.</p><p>{selectedAccount ? `Bank admin will review ${selectedAccount.label} · ${selectedAccount.masked_number} against the submitted business and synthetic transactions.` : "Choose a demo bank account to continue."}</p></div>
      <div className="owner-submit" data-demo="submit"><p>Submitting starts a review. It is not an approval or loan offer.</p><Button type="submit" disabled={busy} loading={busy} arrow>{busy ? "Submitting…" : "Submit for review"}</Button></div>{error && <p className="owner-error" role="alert">{error}</p>}
    </form></div>
  </div></Shell>;
}
