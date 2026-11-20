import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Mark } from "../components/Mark.jsx";

export function Login() {
  const [params] = useSearchParams();
  const [email, setEmail] = useState(params.get("role") === "lender" ? "lender@demo" : "owner@demo");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();
  function enter(event) {
    event.preventDefault();
    const role = email.trim().toLowerCase() === "owner@demo" ? "owner" : email.trim().toLowerCase() === "lender@demo" ? "lender" : null;
    if (!role || password !== "demo1234") { setError("Use one of the demo emails and the demo password shown below."); return; }
    sessionStorage.setItem("zerocibil-role", role);
    navigate(role === "owner" ? "/apply" : "/queue");
  }
  return <main className="login-page"><Link className="brand" to="/"><Mark /> ZeroCIBIL</Link><form className="login-card" onSubmit={enter}><span className="sticker synth">Product preview</span><h1>Welcome to ZeroCIBIL</h1><p>Use a demo account to explore the product. Authentication will move to the server when it is connected.</p><label className="login-field">Email<input type="email" value={email} onChange={(event) => { setEmail(event.target.value); setError(""); }} required autoComplete="username" /></label><label className="login-field">Password<input type="password" value={password} onChange={(event) => { setPassword(event.target.value); setError(""); }} required autoComplete="current-password" /></label>{error && <p className="login-error" role="alert">{error}</p>}<button className="btn btn-primary" type="submit">Continue →</button><div className="login-credentials"><strong>Demo credentials</strong><p>Business owner: <code>owner@demo</code><br />Lender: <code>lender@demo</code><br />Password for both: <code>demo1234</code></p></div></form></main>;
}
