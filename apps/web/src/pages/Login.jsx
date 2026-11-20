import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Mark } from "../components/Mark.jsx";
import { BackButton } from "../components/BackButton.jsx";
import { useAuth } from "../auth.jsx";

export function Login() {
  const [params] = useSearchParams();
  const [email, setEmail] = useState(params.get("role") === "lender" ? "lender@demo" : "owner@demo");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const { user, ready, login } = useAuth();
  useEffect(() => { if (ready && user) navigate(user.role === "owner" ? "/owner" : user.role === "bank_admin" ? "/bank" : "/dashboard", { replace: true }); }, [ready, user, navigate]);
  async function enter(event, identity = email) {
    event?.preventDefault();
    setBusy(true); setError("");
    try { const user = await login(identity.trim().toLowerCase()); navigate(user.role === "owner" ? "/owner" : user.role === "bank_admin" ? "/bank" : "/dashboard", { replace: true }); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <main className="login-page">
    <header className="login-nav">
      <Link className="brand" to="/"><Mark size={20} /> ZeroCIBIL</Link>
      <BackButton to="/">Back to home</BackButton>
    </header>
    <div className="login-layout">
      <section className="login-intro" aria-labelledby="login-title">
        <h1 id="login-title">Credit starts with a fuller picture.</h1>
        <p>See the business behind the numbers. Shop activity helps lenders assess capacity when bureau history is limited.</p>
        <div className="login-journey" aria-label="Assessment journey">
          <div className="login-journey-line" aria-hidden="true" />
          <div className="login-journey-step"><span className="login-journey-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 19.5h16M6 16V9m6 7V4m6 12v-5" /></svg></span><div><strong>Shop activity</strong><span>Sales and cash flow</span></div></div>
          <div className="login-journey-step"><span className="login-journey-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3 20 6v5c0 5-3.5 8.2-8 10-4.5-1.8-8-5-8-10V6l8-3Z" /><path d="m9 12 2 2 4-4" /></svg></span><div><strong>Evidence trust</strong><span>Review what can be verified</span></div></div>
          <div className="login-journey-step"><span className="login-journey-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 19V5m0 14h15M9 15l3-4 3 2 5-7" /></svg></span><div><strong>Assessment terms</strong><span>Grounded in lean-month capacity</span></div></div>
        </div>
      </section>
      <section className="login-panel" aria-labelledby="login-form-title">
        <h2 id="login-form-title">Sign in to your workspace</h2>
        <p>Use an allowlisted owner or lender identity.</p>
        <form onSubmit={enter}>
          <label className="login-field"><span>Email address</span><input type="email" value={email} onChange={(event) => { setEmail(event.target.value); setError(""); }} required autoComplete="username" /></label>
          {error && <p className="login-error" role="alert">{error}</p>}
          <button className="btn btn-primary login-submit" type="submit" disabled={busy || !ready}><span>{!ready ? "Checking session…" : busy ? "Signing in…" : "Continue"}</span><span aria-hidden="true">→</span></button>
          <div className="login-demo-actions" aria-label="Quick demo sign in">
            <button className="btn btn-secondary" type="button" disabled={busy || !ready} onClick={() => enter(null, "owner@demo")}>Continue as owner</button>
            <button className="btn btn-secondary" type="button" disabled={busy || !ready} onClick={() => enter(null, "lender@demo")}>Continue as lender</button>
            <button className="btn btn-secondary" type="button" disabled={busy || !ready} onClick={() => enter(null, "bank@demo")}>Continue as bank admin</button>
          </div>
        </form>
        <div className="login-credentials"><strong>Sign-in identities</strong><div><span>Business owner</span><code>owner@demo</code></div><div><span>Lender</span><code>lender@demo</code></div></div>
      </section>
    </div>
    <p className="login-footnote">Shop evidence informs an assessment. It does not guarantee a loan.</p>
  </main>;
}
