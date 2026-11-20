import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Shell } from "../components/Shell.jsx";
import { SHOPS, paiseToInr, verdictLabel } from "../data/seed.js";

export function LenderDesk() {
  const { id } = useParams();
  const shop = SHOPS.find((s) => s.id === id) || SHOPS[0];
  const [lean, setLean] = useState(0);
  const [fair, setFair] = useState(shop.ownerFlags?.gender || "woman");

  const priced = useMemo(() => {
    const factor = 1 - lean * 0.08;
    const principal = Math.round(shop.principal * Math.max(0, factor));
    return { principal, emi: Math.round(shop.maxEmi * Math.max(0, factor)) };
  }, [lean, shop]);

  const twinSame =
    shop.principal ===
    (SHOPS.find((s) => s.id === (shop.id === "twin-a" ? "twin-b" : "twin-a"))?.principal ??
      shop.principal);

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

        <div className="desk">
          <section className="panel">
            <h2>Data trust</h2>
            <p className="muted">PDFs never set the limit. P(shop-owned data) {Math.round(shop.pAuth * 100)}%.</p>
            {shop.rails.map((r) => (
              <div className="rail" key={r.type}>
                <span>{r.label}</span>
                <span>{r.trustClass === "verified" ? "Verified (sim)" : "Unverified"}</span>
              </div>
            ))}
            <p className="muted" style={{ marginTop: 12 }}>
              GST–UPI and payer mix live in the model. Mule-like files stay declined even with high inflow.
            </p>
          </section>

          <section className="panel">
            <h2>Ninety-day operations</h2>
            <p className="muted">
              Lean-month ratio {Math.round(shop.leanMonthRatio * 100)}%. Black bar is the stressed week.
            </p>
            <div className="weekbars" aria-label="Weekly inflows, synthetic">
              {shop.weeks.map((w, i) => {
                const max = Math.max(...shop.weeks);
                const leanIdx = shop.weeks.indexOf(Math.min(...shop.weeks));
                return (
                  <button type="button" key={i} tabIndex={-1} aria-hidden="true">
                    <i
                      className={i === leanIdx ? "lean" : ""}
                      style={{ height: `${(w / max) * 100}%` }}
                    />
                  </button>
                );
              })}
            </div>
            <label className="muted" htmlFor="lean">
              Stress lean weeks ({lean})
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
              {shop.principal ? paiseToInr(priced.principal) : verdictLabel(shop.verdict)}
            </p>
            <dl className="terms">
              <dt>Tenure</dt>
              <dd>{shop.tenureMonths ? `${shop.tenureMonths} months` : "—"}</dd>
              <dt>Rate</dt>
              <dd>{shop.rateBps ? `${(shop.rateBps / 100).toFixed(1)}% p.a.` : "—"}</dd>
              <dt>Cadence</dt>
              <dd>{shop.cadence}</dd>
              <dt>Max EMI from lean surplus</dt>
              <dd>{shop.maxEmi ? paiseToInr(priced.emi) : "—"}</dd>
              <dt>Asked</dt>
              <dd>{paiseToInr(shop.requestedAmount)}</dd>
            </dl>
            {shop.conditions.map((c) => (
              <p className="muted" key={c}>
                {c}
              </p>
            ))}
            <div className="field">
              <label htmlFor="fair">Fairness: owner flag (cashflow held)</label>
              <select id="fair" value={fair} onChange={(e) => setFair(e.target.value)}>
                <option value="woman">Woman-owned</option>
                <option value="man">Man-owned</option>
              </select>
            </div>
            <p className="muted">
              Terms do not move with the flag
              {twinSame ? " — twins priced equal." : "."} Current flag: {fair}.
            </p>
          </section>
        </div>
      </div>
    </Shell>
  );
}
