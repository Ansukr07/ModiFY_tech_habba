import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Mark } from "../components/Mark.jsx";

export function Login() {
  const [params] = useSearchParams();
  const [role, setRole] = useState(params.get("role") === "lender" ? "lender" : "owner");
  const navigate = useNavigate();
  function enter(event) {
    event.preventDefault();
    sessionStorage.setItem("zerocibil-role", role);
    navigate(role === "owner" ? "/apply" : "/queue");
  }
  return <main className="login-page"><Link className="brand" to="/"><Mark /> ZeroCIBIL</Link><form className="login-card" onSubmit={enter}><span className="sticker synth">Product preview</span><h1>Welcome to ZeroCIBIL</h1><p>Choose your workspace to explore the product. Account authentication will be available when the service is connected.</p><fieldset><legend>Continue as</legend><label><input type="radio" name="role" value="owner" checked={role === "owner"} onChange={() => setRole("owner")} /> Business owner</label><label><input type="radio" name="role" value="lender" checked={role === "lender"} onChange={() => setRole("lender")} /> Lender</label></fieldset><button className="btn btn-primary" type="submit">Continue →</button></form></main>;
}
