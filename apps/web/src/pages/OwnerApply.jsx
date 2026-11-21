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
  const [form, setForm] = useState({ name: "", type: "", city: "", upi: "", amount: "", evidence: "", mobile: "", source: "demo" });
  const [accounts, setAccounts] = useState([]);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [accountsError, setAccountsError] = useState("");
  const [accountsRetry, setAccountsRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const key = useRef(idem());
  const shopKey = useRef(idem());
  const shopBody = useRef(null);
  const applicationBody = useRef(null);
  const createdShop = useRef(null);
  const createdApplication = useRef(null);
  useEffect(() => {
    let active = true;
    setAccountsLoading(true);
    setAccountsError("");
    api("/bank/demo-accounts")
      .then((rows) => { if (active) setAccounts(rows); })
      .catch((error) => { if (active) setAccountsError(error.message); })
      .finally(() => { if (active) setAccountsLoading(false); });
    return () => { active = false; };
  }, [accountsRetry]);
  const change = e => setForm({ ...form, [e.target.name]: e.target.value });
  const selectedAccount = accounts.find(account => account.public_ref === form.evidence);
  async function submit(e) {
    e.preventDefault();
    setError("");
    const amount = Number(form.amount);
    if (!Number.isSafeInteger(amount * 100) || amount <= 0 || (form.source === "demo" && !selectedAccount) || (form.source === "setu" && !/^\d{10}$/.test(form.mobile))) { setError("Enter a positive whole rupee amount and complete the chosen bank source."); return; }
    setBusy(true);
    try {
      shopBody.current ||= JSON.stringify({ name: form.name.trim(), business_type: form.type.trim(), identity: { city: form.city.trim(), vpa: form.upi.trim() } });
      const shop = createdShop.current || await api("/shops", { method: "POST", headers: { "Idempotency-Key": shopKey.current }, body: shopBody.current });
      createdShop.current = shop;
      applicationBody.current ||= JSON.stringify({ shop_id: shop._id, requested_amount_paise: amount * 100 });
      const application = createdApplication.current || await api("/applications", { method: "POST", headers: { "Idempotency-Key": key.current }, body: applicationBody.current });
      createdApplication.current = application;
      if (form.source === "setu") {
        const consent = await api(`/applications/${application._id}/aa/consents`, { method: "POST", headers: { "Idempotency-Key": idem() }, body: JSON.stringify({ mobile: form.mobile }) });
        sessionStorage.setItem("setu_application_id", application._id);
        window.location.assign(consent.consent_url);
        return;
      }
      await api(`/applications/${application._id}/verification-requests`, { method: "POST", headers: { "Idempotency-Key": idem() }, body: JSON.stringify({ public_ref: selectedAccount.public_ref }) });
      navigate(`/owner/application/${application._id}`);
    } catch (err) { setError(createdApplication.current ? `${err.message} Your application was saved. Retry the evidence step or open it from Applications.` : shopBody.current ? `${err.message} Retry to resume this request without creating another shop.` : err.message); }
    finally { setBusy(false); }
  }
  return <Shell role="owner"><div className="page owner-page">
    <BackButton className="owner-back" to="/owner">Owner dashboard</BackButton>
    <div className="owner-form-head"><h1 className="page-title">Apply using your shop activity</h1><p>Tell us about your business, attach a simulated bank account, and send a funding request for lender review.</p><button className="owner-demo-start" type="button" onClick={startApplyDemo}><span className="owner-demo-start-icon" aria-hidden="true"><svg viewBox="0 0 20 20" fill="none"><path d="m7.5 5.5 6 4.5-6 4.5v-9Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg></span><span>Watch full demo</span><svg className="owner-demo-start-arrow" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4 10h11m0 0-4.5-4.5M15 10l-4.5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg></button></div>
    <div className="owner-form-layout"><aside className="owner-form-map" aria-label="Application steps"><a href="#business">01 Business details</a><a href="#evidence">02 Evidence</a><a href="#funding">03 Funding request</a><p>Setu sandbox uses test bank data. The offline demo uses synthetic fixtures. No loan disbursal occurs.</p></aside>
    <form className="owner-application" onSubmit={submit}>
      <section id="business" data-demo="business"><div className="owner-step"><span>1</span><div><h2>Business details</h2><p>Start with the basics about your shop.</p></div></div><div className="owner-fields"><label>Business name<input required name="name" disabled={!!shopBody.current} value={form.name} onChange={change} autoComplete="organization" /></label><label>Business type<input required name="type" disabled={!!shopBody.current} value={form.type} onChange={change} placeholder="For example, kirana store" /></label><label>City<input required name="city" disabled={!!shopBody.current} value={form.city} onChange={change} /></label></div></section>
      <section id="evidence" data-demo="evidence"><fieldset className="owner-evidence-source"><legend>Bank evidence source</legend><div className="owner-evidence-options"><label className={form.source === "setu" ? "selected" : ""}><input type="radio" name="source" value="setu" checked={form.source === "setu"} onChange={change} /><span>Setu Account Aggregator sandbox</span></label><label className={form.source === "demo" ? "selected" : ""}><input type="radio" name="source" value="demo" checked={form.source === "demo"} onChange={change} /><span>Offline demo bank record</span></label></div></fieldset>{form.source === "setu" && <><label className="owner-consent-mobile">Mobile number for Setu consent<input name="mobile" inputMode="numeric" pattern="[0-9]{10}" maxLength="10" required value={form.mobile} onChange={change} autoComplete="tel-national" /></label><div className="owner-consent-action"><Button type="submit" disabled={busy} loading={busy} arrow>{busy ? "Connecting…" : "Verify bank account"}</Button><p>Complete the funding request below before continuing to Setu.</p></div></>}{form.source === "demo" && <><div className="owner-step"><span>2</span><div><h2>Attach a demo bank account</h2><p>Select the synthetic bank record for the admin to review.</p></div></div><div className="owner-fields"><label>UPI ID (optional)<input name="upi" disabled={!!shopBody.current} value={form.upi} onChange={change} placeholder="shop@upi" /></label><p className="owner-evidence-note">Submitted UPI ID is shown to the lender. It does not verify payment activity.</p>{accountsLoading ? <div aria-label="Demo bank account"><span>Loading demo bank accounts</span><SkeletonBlock label="Loading demo bank accounts"><Skeleton className="owner-field-skeleton" /></SkeletonBlock></div> : accountsError ? <div role="alert" className="owner-account-error"><p>Could not load demo bank accounts: {accountsError}</p><button type="button" className="btn btn-secondary" onClick={() => setAccountsRetry(retry => retry + 1)}>Try again</button></div> : <label>Demo bank account<select name="evidence" value={selectedAccount ? form.evidence : ""} onChange={change} required={form.source === "demo"}><option value="">Choose a demo account</option>{accounts.map(a => <option key={a.public_ref} value={a.public_ref}>{a.label} · {a.masked_number} · {a.public_ref}</option>)}</select></label>}<p className="owner-evidence-note">The admin checks the business name, account status, and transaction history. No live bank account is connected.</p>{selectedAccount && <p className="owner-evidence-note">The business name you enter above should match <strong>{selectedAccount.label}</strong> in the synthetic bank record. The admin makes the verification decision after submission.</p>}</div></>}</section>
      <section id="funding" data-demo="funding"><div className="owner-step"><span>3</span><div><h2>Funding request</h2><p>Tell the lender how much you need.</p></div></div><div className="owner-fields"><label>Requested amount (₹)<input required type="number" name="amount" disabled={!!applicationBody.current} min="1" step="1" value={form.amount} onChange={change} /></label></div></section>
      <div className="owner-review-summary"><h2>Before you submit</h2>{shopBody.current && <p>Business details are locked for this request. Retry to resume without creating a duplicate.</p>}<p><strong>{form.name.trim() || "Your business"}</strong> requests <strong>{form.amount ? `₹${Number(form.amount).toLocaleString("en-IN")}` : "an amount"}</strong>.</p><p>{form.source === "setu" ? "Setu sandbox: choose Setu FIP or Setu FIP-2 to link a mock deposit account. Its available transactions are dated January–June 2021." : selectedAccount ? `Bank admin will review ${selectedAccount.label} · ${selectedAccount.masked_number} against the submitted business and synthetic transactions.` : "Choose a demo bank account to continue."}</p></div>
      {form.source === "demo" && <div className="owner-submit" data-demo="submit"><p>Submitting starts a review. It is not an approval or loan offer.</p><Button type="submit" disabled={busy} loading={busy} arrow>{busy ? "Submitting…" : createdApplication.current ? "Retry evidence step" : "Submit for review"}</Button></div>}{error && <p className="owner-error" role="alert">{error}{createdApplication.current && <> <Link to={`/owner/application/${createdApplication.current._id}`}>Open saved application</Link></>}</p>}
    </form></div>
  </div></Shell>;
}
