import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Shell } from "../components/Shell.jsx";
import { SHOPS, paiseToInr, verdictLabel } from "../data/seed.js";

export function LenderDesk() {
  const { id } = useParams();
  const shop = SHOPS.find((s) => s.id === id);
  const [lean, setLean] = useState(0);

  if (!shop) return <Shell role="lender"><div className="page"><h1>Sample not found</h1><Link to="/queue">Return to queue</Link></div></Shell>;

  const twins = SHOPS.filter((s) => s.id.startsWith("twin"));
  const twinSame = twins.length === 2 && ["verdict", "principal", "rateBps", "tenureMonths", "cadence"].every((key) => twins[0][key] === twins[1][key]);
  const hasVerifiedRail = shop.rails.some((rail) => rail.trustClass === "verified");

  return (
    <Shell role="lender">
      <div className="page">
        <div className="banner">
          <span className="sticker synth">Synthetic demo</span>
          <span className="pill outline">No bureau file</span>
          <span className="pill black">{verdictLabel(shop.verdict)}</span>
          <span className="muted">
            {shop.name} · {shop.category} · {shop.city}
          </span>
        </div>
        <h1 className="page-title">{shop.name}</h1>
        <p className="muted">Illustrative assessment from a synthetic seed fixture. Figures have not been calculated from a submitted application.</p>

        <div className="desk">
          <section className="panel">
            <h2>Data trust</h2>
            <p className="muted">{hasVerifiedRail ? `Sample authenticity estimate: ${Math.round(shop.pAuth * 100)}%.` : "Authenticity assessment skipped: no verified rail."} PDF uploads never set the limit.</p>
            {shop.rails.map((r) => (
              <div className="rail" key={r.type}>
                <span>{r.label}</span>
                <span>{r.trustClass === "verified" ? "Verified (sim)" : "Unverified"}</span>
              </div>
            ))}
            <p className="muted" style={{ marginTop: 12 }}>
              Review rail ownership, GST–UPI agreement, and payer concentration before considering terms.
            </p>
          </section>

          <section className="panel">
            <h2>Ninety-day operations</h2>
            <p className="muted">
              Sample lean-month ratio {Math.round(shop.leanMonthRatio * 100)}%. Black bar marks the lowest week.
            </p>
            <p className="muted">{hasVerifiedRail ? `Sample lean-period stress estimate: ${Math.round(shop.pStress * 100)}%. This is a synthetic proxy, not a real default probability.` : "Stress model skipped until operations are verified."}</p>
            <div className="weekbars" role="img" aria-label={`Synthetic weekly inflow index: ${shop.weeks.join(", ")}. Lowest week is ${Math.min(...shop.weeks)}.`}>
              {shop.weeks.map((w, i) => {
                const max = Math.max(...shop.weeks);
                const leanIdx = shop.weeks.indexOf(Math.min(...shop.weeks));
                return (
                  <span key={i} aria-hidden="true" className="weekbar">
                    <i
                      className={i === leanIdx ? "lean" : ""}
                      style={{ height: `${(w / max) * (i === leanIdx ? 1 - lean * 0.08 : 1) * 100}%` }}
                    />
                  </span>
                );
              })}
            </div>
            <label className="muted" htmlFor="lean">
              Explore lean-week reduction ({lean * 8}%)
            </label>
            <input
              id="lean"
              className="slider"
              type="range"
              min="0"
              max="6"
              value={lean}
              onChange={(e) => setLean(Number(e.target.value))}
            />
            <p className="muted">The slider changes the black bar only. A real scenario needs the underwriting API to recalculate capacity and terms; the sample offer stays unchanged.</p>
            <ul className="muted">
              {shop.drivers.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          </section>

          <section className="panel">
            <h2>Terms</h2>
            <p className="muted">Baseline: decline (no CIBIL). ZeroCIBIL prices capacity.</p>
            <p className="offer-amt">
              {shop.principal ? paiseToInr(shop.principal) : verdictLabel(shop.verdict)}
            </p>
            {shop.principal > 0 && shop.principal < shop.requestedAmount && <p className="muted">Sample counteroffer: {paiseToInr(shop.principal)} against {paiseToInr(shop.requestedAmount)} requested.</p>}
            <dl className="terms">
              <dt>Tenure</dt>
              <dd>{shop.tenureMonths ? `${shop.tenureMonths} months` : "—"}</dd>
              <dt>Rate</dt>
              <dd>{shop.rateBps ? `${(shop.rateBps / 100).toFixed(1)}% p.a.` : "—"}</dd>
              <dt>Cadence</dt>
              <dd>{shop.cadence}</dd>
              <dt>Maximum weekly repayment from lean surplus</dt>
              <dd>{shop.maxEmi ? paiseToInr(shop.maxEmi) : "—"}</dd>
              <dt>Asked</dt>
              <dd>{paiseToInr(shop.requestedAmount)}</dd>
            </dl>
            {shop.conditions.map((c) => (
              <p className="muted" key={c}>
                {c}
              </p>
            ))}
            <p className="muted">
              Seed twin comparison: {twinSame ? "same verdict, principal, rate, tenure and cadence." : "terms differ; review the fixtures."} This does not establish model fairness.
            </p>
          </section>
        </div>
      </div>
    </Shell>
  );
}
