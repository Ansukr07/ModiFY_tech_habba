import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { api } from "../data/api.js";
import { Shell } from "../components/Shell.jsx";
import "../owner.css";

export function SetuReturn() {
  const [id] = useState(() => sessionStorage.getItem("setu_application_id"));
  const cancelled = new URLSearchParams(window.location.search).get("success") === "false";
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (cancelled) { sessionStorage.removeItem("setu_application_id"); setDone(true); return; }
    if (!id) { setDone(true); return; }
    api(`/applications/${encodeURIComponent(id)}/aa/refresh`, { method: "POST", body: "{}" })
      .then(() => sessionStorage.removeItem("setu_application_id"))
      .catch((err) => setError(err.message))
      .finally(() => setDone(true));
  }, [id, cancelled]);
  if (!done) return <Shell role="owner"><div className="page owner-return"><p role="status">Checking Setu consent…</p></div></Shell>;
  if (cancelled || error) return <Shell role="owner"><div className="page owner-return" aria-labelledby="setu-return-title">
    <div className="owner-return-mark" aria-hidden="true"><svg viewBox="0 0 48 48" fill="none"><circle cx="24" cy="24" r="21" stroke="currentColor" strokeWidth="1.5"/><path d="M17 24h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg></div>
    <h1 id="setu-return-title" className="page-title">{cancelled ? "Bank data sharing was cancelled" : "We could not check bank consent"}</h1>
    <p>{cancelled ? "You chose to share your bank data later. Your application is saved, but bank evidence has not been connected." : "Your application is saved. Open it to check the connection again."}</p>
    {error && <p role="alert" className="owner-error">{error}</p>}
    <div className="owner-return-actions"><Link className="btn btn-primary" to={id ? `/owner/application/${encodeURIComponent(id)}` : "/owner/applications"}>{id ? "View saved application" : "View applications"}</Link><Link className="btn btn-secondary" to="/owner">Owner dashboard</Link></div>
    <p className="owner-return-note">Setu sandbox · No bank data was added to this application.</p>
  </div></Shell>;
  return <Navigate replace to={id ? `/owner/application/${encodeURIComponent(id)}` : "/owner/applications"} />;
}
