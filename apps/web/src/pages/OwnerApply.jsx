import { useState } from "react";
import { Shell } from "../components/Shell.jsx";

export function OwnerApply() {
  const [draft, setDraft] = useState(() => JSON.parse(localStorage.getItem("zerocibil-draft") || "{}"));
  const [saved, setSaved] = useState(false);
  function update(event) { setDraft({ ...draft, [event.target.name]: event.target.value }); setSaved(false); }
  function save(event) { event.preventDefault(); localStorage.setItem("zerocibil-draft", JSON.stringify(draft)); setSaved(true); }
  return <Shell role="owner"><div className="page form"><span className="sticker synth">Product preview</span><h1 className="page-title">Apply using your shop activity</h1><p className="muted">Start with your business details. Your draft stays in this browser until secure application submission is available.</p><form className="owner-form" onSubmit={save}><label>Business name<input required name="name" value={draft.name || ""} onChange={update} autoComplete="organization" /></label><label>Business type<input required name="type" value={draft.type || ""} onChange={update} placeholder="For example, kirana store" /></label><label>City<input required name="city" value={draft.city || ""} onChange={update} /></label><label>Requested amount (₹)<input required name="amount" type="number" min="1" value={draft.amount || ""} onChange={update} /></label><button className="btn btn-primary" type="submit">Save draft</button>{saved && <p role="status">Draft saved in this browser.</p>}</form><section className="panel"><h2>Next: verify operations</h2><p className="muted">Connect merchant UPI, Account Aggregator, or GST data with consent. Uploaded PDFs can support review but cannot establish a credit limit. Connections and submission will open when the backend is available.</p></section></div></Shell>;
}
