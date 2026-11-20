import { Link, useLocation } from "react-router-dom";

export function OwnerSidebar({ application }) {
  const { hash, pathname } = useLocation();
  return <aside className="owner-workspace-sidebar" aria-label="Owner navigation">
    <strong>Owner workspace</strong>
    <span className="owner-nav-label">Workspace</span>
    <Link className={pathname === "/owner" ? "active" : ""} to="/owner">Overview</Link>
    <Link className={pathname === "/owner/applications" ? "active" : ""} to="/owner/applications">Applications</Link>
    {application && <><span className="owner-nav-label owner-nav-divider">This application</span>
      <Link className={!hash || hash === "#owner-progress" ? "active" : ""} to={`${pathname}#owner-progress`}>Progress</Link>
      <Link className={hash === "#owner-evidence" ? "active" : ""} to={`${pathname}#owner-evidence`}>Request & evidence</Link>
      <Link className={hash === "#owner-assessment" ? "active" : ""} to={`${pathname}#owner-assessment`}>Assessment</Link></>}
    <Link className="owner-nav-create" to="/apply">+ New application</Link>
  </aside>;
}
