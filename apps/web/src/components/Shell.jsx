import { Link, NavLink, useNavigate } from "react-router-dom";
import { Mark } from "./Mark.jsx";
import { useAuth } from "../auth.jsx";

export function Shell({ role, children }) {
  const navigate = useNavigate();
  const { logout } = useAuth();
  return (
    <div className={`shell shell-${role}`}>
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
            <NavLink to="/owner">Dashboard</NavLink>
            <NavLink to="/apply">Apply</NavLink>

          </nav>
        )}
        <div className="nav-end">
          <span className="role-chip">{role === "lender" ? "Lender workspace" : role === "bank_admin" ? "Bank admin workspace" : "Owner workspace"}</span>
          <button
            type="button"
            className="btn btn-primary"
            onClick={async () => { await logout(); navigate("/login", { replace: true }); }}
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
