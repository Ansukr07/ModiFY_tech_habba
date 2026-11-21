import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Shell } from "../components/Shell.jsx";
import { OwnerSidebar } from "../components/OwnerSidebar.jsx";
import { Skeleton, SkeletonBlock } from "../components/Skeleton.jsx";
import { api } from "../data/api.js";
import { paiseToInr } from "../data/seed.js";
import { ownerStatus } from "../data/ownerStatus.js";
import "../owner.css";

export function OwnerApplications() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    let refreshing = false;
    const refresh = async () => {
      if (!active || refreshing || document.visibilityState === "hidden") return;
      refreshing = true;
      try {
        const { items: rows } = await api("/applications");
        if (active) { setItems(rows); setError(""); }
      } catch (e) {
        if (active) setError(e.message);
      } finally {
        refreshing = false;
        if (active) setLoading(false);
      }
    };
    const onFocus = () => refresh();
    const onVisibility = () => { if (document.visibilityState === "visible") refresh(); };
    refresh();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    const timer = window.setInterval(refresh, 30000);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return <Shell role="owner"><div className="page owner-page"><div className="owner-workspace">
    <OwnerSidebar />
    <main className="owner-workspace-main">{error && <p role="alert">{error}</p>}<section className="owner-section"><div className="owner-section-head"><h1 className="page-title">Applications</h1><p>Open a request to see its timeline and details.</p></div>{loading ? <SkeletonBlock className="owner-list" label="Loading applications">{[0, 1, 2, 3].map((row) => <div className="owner-row owner-skeleton-row" key={row}><span><Skeleton /><Skeleton className="short" /></span><Skeleton /><Skeleton /><Skeleton className="owner-arrow-skeleton" /></div>)}</SkeletonBlock> : items.length ? <div className="owner-list">{items.map(item => { const status = ownerStatus(item); return <Link className="owner-row" key={item._id} to={`/owner/application/${item._id}${status.hash}`}><span><strong>{item.shop_name || item.shopId}</strong><small>Applied {new Date(item.createdAt).toLocaleDateString("en-IN")} · {item._id.slice(0, 8)}</small></span><span className="owner-amount">{paiseToInr(item.requested_amount_paise)}</span><span className="pill lilac">{status.label}<small>{status.next}</small></span><span aria-hidden="true">→</span></Link>; })}</div> : !error && <div className="owner-empty"><h2>No applications yet</h2><p>Start with your business details and choose simulated evidence.</p><Link className="btn btn-secondary" to="/apply">Start an application</Link></div>}</section></main>
  </div></div></Shell>;
}
