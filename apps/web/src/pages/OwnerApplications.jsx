import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Shell } from "../components/Shell.jsx";
import { api } from "../data/api.js";
import { paiseToInr } from "../data/seed.js";
import "../owner.css";

const label = (value) => String(value || "Pending").replaceAll("_", " ");

export function OwnerApplications() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  useEffect(() => { api("/applications").then(({ items: rows }) => setItems(rows)).catch(e => setError(e.message)); }, []);

  return <Shell role="owner"><div className="page owner-page"><div className="owner-workspace">
    <aside className="owner-workspace-sidebar"><strong>Owner dashboard</strong><Link to="/owner">Overview</Link><Link className="active" to="/owner/applications">Applications</Link><Link to="/apply">New application</Link><p>Synthetic demo data</p></aside>
    <main className="owner-workspace-main">{error && <p role="alert">{error}</p>}<section className="owner-section"><div className="owner-section-head"><h1 className="page-title">Applications</h1><p>Open a request to see its timeline and details.</p></div>{items.length ? <div className="owner-list">{items.map(item => <Link className="owner-row" key={item._id} to={'/owner/application/' + item._id}><span><strong>{item.shop_name || item.shopId}</strong><small>Applied {new Date(item.createdAt).toLocaleDateString("en-IN")} · {item._id.slice(0, 8)}</small></span><span className="owner-amount">{paiseToInr(item.requested_amount_paise)}</span><span className="pill lilac">{label(item.status)}</span><span aria-hidden="true">→</span></Link>)}</div> : !error && <div className="owner-empty"><h2>No applications yet</h2><p>Start with your business details and choose simulated evidence.</p><Link className="btn btn-secondary" to="/apply">Start an application</Link></div>}</section></main>
  </div></div></Shell>;
}
