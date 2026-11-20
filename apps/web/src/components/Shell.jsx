import { Link, NavLink, useNavigate } from "react-router-dom";
import { Mark } from "./Mark.jsx";

export function Shell({ role, children }) {
  const navigate = useNavigate();
  return (
    <div className="shell">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="topnav">
        <Link to="/" className="brand">
          <Mark />
          ZeroCIBIL
        </Link>
        {role === "lender" && (
          <nav className="nav-mid" aria-label="Lender">
            <NavLink to="/queue">Queue</NavLink>

          </nav>
        )}
        {role === "owner" && (
          <nav className="nav-mid" aria-label="Owner">
            <NavLink to="/apply">Apply</NavLink>

          </nav>
        )}
        <div className="nav-end">
          <span className="role-chip">{role === "lender" ? "Lender workspace" : "Owner workspace"}</span>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => { sessionStorage.removeItem("zerocibil-role"); navigate("/login"); }}
          >
            Sign out
            <span aria-hidden="true"> →</span>
          </button>
        </div>
      </header>
      <main id="main">{children}</main>
    </div>
  );
}
