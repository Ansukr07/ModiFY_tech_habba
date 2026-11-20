import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { Shell } from "../components/Shell.jsx";
import { Skeleton, SkeletonBlock } from "../components/Skeleton.jsx";
import { api, idem } from "../data/api.js";
import { paiseToInr, verdictLabel } from "../data/seed.js";

export function LenderQueue() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [fairness, setFairness] = useState(null);
  const [working, setWorking] = useState(false);
  const refresh = () => api("/applications").then(({ items: rows }) => setItems(rows));
  useEffect(() => { refresh().catch((e) => setError(e.message)).finally(() => setLoading(false)); }, []);
  async function prepareDemoApplications() {
    setWorking(true);
    setError("");
    try {
      const seeded = await api("/admin/seed", { method: "POST" });
      const applications = Array.isArray(seeded.applications)
        ? seeded.applications
        : ((await api("/applications")).items || []);
      if (!applications.length) throw new Error("The API did not return seeded applications. Restart the API server and try again.");
      for (const application of applications) {
        if (!application.latest_decision_id) {
          await api(`/applications/${application._id}/score`, {
            method: "POST",
            headers: { "Idempotency-Key": idem() },
            body: JSON.stringify({ expected_input_revision: application.input_revision, policy_version: "v1" }),
          });
        }
      }
      await refresh();
    } catch (e) { setError(e.message); }
    finally { setWorking(false); }
  }
  return (
    <Shell role="lender">
      <div className="page">
        <div className="banner">
          <span className="pill outline">No bureau file on any row</span>
        </div>
        <h1 className="page-title">Thin-file queue</h1>
        <p className="muted">{items.length} applications from the backend.</p>
        {error && <p role="alert">{error}</p>}
        <div className="queue">
          {items.map((s) => (
            <Link key={s._id} className="q-row" to={`/application/${s._id}`}>
              <div>
                <strong>Shop {s.shopId.slice(0, 8)}</strong>
                <div className="muted">
                  {s.status} · {s.verified_rail_count} verified simulated rails
                </div>
              </div>
              <div className="muted">Asked {paiseToInr(s.requested_amount_paise)}</div>
              <span
                className={`pill ${
                  s.latest_verdict === "STANDARD"
                    ? "black"
                    : s.latest_verdict === "THIN_FILE"
                      ? "lilac"
                      : s.latest_verdict === "UNVERIFIED"
                        ? "yellow"
                        : "outline"
                }`}
              >
                {s.latest_verdict ? verdictLabel(s.latest_verdict) : s.status}
              </span>
              <span className="muted">Open application →</span>
            </Link>
          ))}
          {loading ? <SkeletonBlock className="queue-loading" label="Loading applications">{[0,1,2].map(i=><div className="q-row queue-skeleton-row" key={i}><Skeleton/><Skeleton/><Skeleton/></div>)}</SkeletonBlock> : !items.length && !error && <div><p className="muted">No applications in the queue yet.</p><button className="btn btn-secondary" disabled={working} onClick={prepareDemoApplications}>{working ? "Preparing demo…" : "Seed and score demo applications"}</button></div>}
        </div>
        <section className="queue-twins">
          <h2>Evidence and fairness</h2><p className="muted">Evaluation summary from the backend.</p><Summary /><p className="muted">The fairness check compares two applications with matched business evidence and different protected-group attributes. Matching terms mean the policy did not change its result for that attribute in this fixture.</p><button className="btn btn-secondary" disabled={working || !items.some((x) => x.shopId === "twin-a" && x.latest_decision_id) || !items.some((x) => x.shopId === "twin-b" && x.latest_decision_id)} onClick={() => api("/evidence/fairness", { method: "POST", body: JSON.stringify({ fixture_pair_id: "lakshmi-twins", policy_version: "v1" }) }).then(setFairness).catch((e) => setError(e.message))}>Compare fairness twins</button>{fairness && <p>{fairness.pass ? "Twin terms match." : "Twin comparison failed."} Audit: {fairness.audit_reference}</p>}
        </section>
      </div>
    </Shell>
  );
}

function Summary() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { api("/evidence/summary").then(setSummary).catch(() => {}).finally(() => setLoading(false)); }, []);
  return loading ? <SkeletonBlock className="summary-loading" label="Loading evidence summary"><Skeleton/><Skeleton className="short"/></SkeletonBlock> : summary ? <p>{summary.evaluation_note} Offers recorded: {summary.zerocibilFunded}.</p> : <p className="muted">Summary unavailable.</p>;
}
