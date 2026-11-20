import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Mark } from "../components/Mark.jsx";
import { SHOPS, paiseToInr, verdictLabel } from "../data/seed.js";
import "../dashboard.css";

const examples = SHOPS.filter((shop) => !shop.id.startsWith("twin"));

function SideIcon({ kind }) {
  const paths = {
    dashboard: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    queue: <><path d="M4 5h16M4 12h16M4 19h16"/><path d="M7 4v2M7 11v2M7 18v2"/></>,
    evidence: <><path d="M4 20V4h16v16H4Z"/><path d="m8 15 3-4 3 2 3-5"/></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[kind]}</svg>;
}

export function LenderDesk() {
  const { id } = useParams();
  const navigate = useNavigate();
  const shop = SHOPS.find((item) => item.id === id);
  const [lean, setLean] = useState(0);

  if (!shop) return <div className="dashboard-missing"><h1>Sample not found</h1><Link to="/queue">Return to queue</Link></div>;

  const verified = shop.rails.filter((rail) => rail.trustClass === "verified");
  const twins = SHOPS.filter((item) => item.id.startsWith("twin"));
  const twinSame = twins.length === 2 && ["verdict", "principal", "rateBps", "tenureMonths", "cadence"].every((key) => twins[0][key] === twins[1][key]);
  const lowest = shop.weeks.indexOf(Math.min(...shop.weeks));
  const stressedWeeks = shop.weeks.map((week, index) => index === lowest ? week * (1 - lean * 0.08) : week);
  const max = Math.max(...shop.weeks);
  const points = stressedWeeks.map((week, index) => `${24 + index * 672 / (shop.weeks.length - 1)},${202 - week / max * 160}`).join(" ");
  const chartLabel = `Synthetic weekly inflow index: ${stressedWeeks.map((value) => Math.round(value)).join(", ")}. Lowest observed week is ${Math.min(...shop.weeks)}.`;

  return (
    <div className="dashboard-frame">
      <a className="skip" href="#main">Skip to assessment</a>
      <div className="dashboard-window">
        <header className="dashboard-topbar">
          <Link to="/" className="dashboard-logo" aria-label="ZeroCIBIL home"><span><Mark size={20}/></span> ZeroCIBIL</Link>
          <span className="dashboard-workspace">Lender workspace <span>·</span> Synthetic demo</span>
          <div className="dashboard-top-actions"><Link to="/queue">All applications</Link><Link to="/evidence">Evidence</Link><Link className="dashboard-home" to="/">Switch role →</Link></div>
        </header>

        <aside className="dashboard-sidebar" aria-label="Lender navigation">
          <p>GENERAL</p>
          <Link className="dashboard-sidebar-active" to={`/application/${shop.id}`}><SideIcon kind="dashboard" /> Dashboard</Link>
          <Link to="/queue"><SideIcon kind="queue" /> Application queue</Link>
          <Link to="/evidence"><SideIcon kind="evidence" /> Evidence</Link>
          <p>SEED APPLICATIONS</p>
          {examples.map((example) => <Link key={example.id} className={`dashboard-seed-link ${example.id === shop.id ? "dashboard-current-shop" : ""}`} to={`/application/${example.id}`}>{example.name}</Link>)}
        </aside>

        <main id="main" className="dashboard-main">
          <div className="dashboard-heading">
            <div><h1>Assessment dashboard</h1><p>Review the shop’s trust, cashflow and proposed terms in one place.</p></div>
            <label className="dashboard-select">Sample shop <select value={shop.id} onChange={(event) => { setLean(0); navigate(`/application/${event.target.value}`); }}>{SHOPS.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
          </div>
          <div className="dashboard-case"><span className="dashboard-label">SYNTHETIC APPLICATION</span><span>{shop.name} · {shop.category} · {shop.city}</span><span className={`dashboard-verdict dashboard-verdict-${shop.verdict.toLowerCase()}`}>{verdictLabel(shop.verdict)}</span></div>
          <p className="dashboard-disclaimer">Illustrative fixture only. No submitted application, disbursal, live rail connection or trained-model result is shown.</p>

          <div className="dashboard-metrics">
            <section><h2>Requested amount</h2><strong>{paiseToInr(shop.requestedAmount)}</strong><p>Owner’s sample request</p></section>
            <section><h2>Proposed principal</h2><strong>{shop.principal ? paiseToInr(shop.principal) : "—"}</strong><p>{shop.principal ? "Capacity-constrained sample offer" : "No offer for this sample"}</p></section>
            <section><h2>Authenticity estimate</h2><strong>{verified.length ? `${Math.round(shop.pAuth * 100)}%` : "—"}</strong><p>{verified.length ? `${verified.length} simulated verified rail${verified.length === 1 ? "" : "s"}` : "No verified operational rail"}</p></section>
            <section><h2>Lean-period stress</h2><strong>{verified.length ? `${Math.round(shop.pStress * 100)}%` : "—"}</strong><p>Synthetic proxy, not real default</p></section>
          </div>

          <div className="dashboard-analysis">
            <section className="dashboard-chart-card">
              <div className="dashboard-card-heading"><div><h2>Weekly shop activity</h2><p>Synthetic inflow index · {shop.weeks.length} observed weeks</p></div><span className="dashboard-chart-tag">Lean ratio {Math.round(shop.leanMonthRatio * 100)}%</span></div>
              <svg className="dashboard-line-chart" viewBox="0 0 720 225" role="img" aria-label={chartLabel} preserveAspectRatio="none">
                {[42,82,122,162,202].map((y) => <line key={y} x1="24" x2="696" y1={y} y2={y} stroke="#e7eaf1" strokeWidth="1" />)}
                <polygon points={`24,202 ${points} 696,202`} fill="#425cff" opacity="0.08" />
                <polyline points={points} fill="none" stroke="#171f3d" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
                <circle cx={24 + lowest * 672 / (shop.weeks.length - 1)} cy={202 - stressedWeeks[lowest] / max * 160} r="6" fill="#425cff" stroke="white" strokeWidth="3" />
              </svg>
              <div className="dashboard-chart-axis"><span>Week 1</span><span>Week {Math.ceil(shop.weeks.length / 2)}</span><span>Week {shop.weeks.length}</span></div>
              <label className="dashboard-slider-label" htmlFor="dashboard-lean">Explore lowest-week reduction <strong>{lean * 8}%</strong></label>
              <input id="dashboard-lean" type="range" min="0" max="6" value={lean} onChange={(event) => setLean(Number(event.target.value))} />
              <p className="dashboard-chart-note">This slider changes the chart only. The sample terms below stay fixed until an underwriting API can recompute a scenario.</p>
            </section>
            <section className="dashboard-trust-card">
              <div className="dashboard-card-heading"><div><h2>Data trust</h2><p>Source and provenance</p></div></div>
              {shop.rails.map((rail) => <div className="dashboard-rail" key={rail.type}><span>{rail.label}</span><strong className={rail.trustClass === "verified" ? "dashboard-verified" : "dashboard-unverified"}>{rail.trustClass === "verified" ? "Verified (sim)" : "Unverified"}</strong></div>)}
              <p className="dashboard-trust-note">PDF uploads do not set the limit. A missing verified rail leads to collect-data status.</p>
            </section>
          </div>

          <div className="dashboard-detail-grid">
            <section className="dashboard-detail-card"><h2>Proposed terms</h2><dl><dt>Verdict</dt><dd>{verdictLabel(shop.verdict)}</dd><dt>Principal</dt><dd>{shop.principal ? paiseToInr(shop.principal) : "—"}</dd><dt>Tenure</dt><dd>{shop.tenureMonths ? `${shop.tenureMonths} months` : "—"}</dd><dt>Annual rate</dt><dd>{shop.rateBps ? `${(shop.rateBps / 100).toFixed(1)}%` : "—"}</dd><dt>Cadence</dt><dd>{shop.cadence}</dd><dt>Repayment</dt><dd>{shop.weeklyRepayment ? `${paiseToInr(shop.weeklyRepayment)} weekly` : "—"}</dd><dt>Maximum weekly capacity</dt><dd>{shop.maxEmi ? paiseToInr(shop.maxEmi) : "—"}</dd></dl>{shop.principal > 0 && shop.principal < shop.requestedAmount && <p className="dashboard-counteroffer">Counteroffer below the requested amount.</p>}</section>
            <section className="dashboard-detail-card"><h2>Why this result</h2><ul>{shop.drivers.map((driver) => <li key={driver}>{driver}</li>)}</ul><h3>Conditions and next steps</h3>{shop.conditions.length ? <ul>{shop.conditions.map((condition) => <li key={condition}>{condition}</li>)}</ul> : <p>No additional conditions in this fixture.</p>}</section>
          </div>

          <section className="dashboard-table-section"><div className="dashboard-card-heading"><div><h2>Sample applications</h2><p>Explore how different evidence affects the displayed outcome.</p></div><Link to="/queue">View queue →</Link></div><div className="dashboard-table-scroll"><table><thead><tr><th scope="col">Shop</th><th scope="col">Evidence</th><th scope="col">Requested</th><th scope="col">Proposed</th><th scope="col">Status</th></tr></thead><tbody>{examples.map((item) => <tr key={item.id}><th scope="row"><Link to={`/application/${item.id}`}>{item.name}</Link></th><td>{item.rails.map((rail) => rail.type.toUpperCase()).join(" · ")}</td><td>{paiseToInr(item.requestedAmount)}</td><td>{item.principal ? paiseToInr(item.principal) : "—"}</td><td>{verdictLabel(item.verdict)}</td></tr>)}</tbody></table></div></section>
          <p className="dashboard-chart-note">Seed twin comparison: {twinSame ? "same verdict, principal, rate, tenure and cadence." : "terms differ; review the fixtures."} This does not establish model fairness.</p>
        </main>
      </div>
    </div>
  );
}
