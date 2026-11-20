import { Shell } from "../components/Shell.jsx";
import { SHOPS } from "../data/seed.js";

export function Evidence() {
  const examples = SHOPS.filter((s) => !s.id.startsWith("twin"));
  const offers = examples.filter((s) => s.principal > 0);
  const [a, b] = SHOPS.filter((s) => s.id.startsWith("twin"));
  const sameTerms = a && b && ["verdict", "principal", "rateBps", "tenureMonths", "cadence"].every((key) => a[key] === b[key]);
  return (
    <Shell role="lender">
      <div className="page">
        <span className="sticker synth">Synthetic labels</span>
        <h1 className="page-title">Baseline versus ZeroCIBIL</h1>
        <p className="muted">
          Everyone in this seed set is credit-invisible. A no-CIBIL baseline offers nobody.
          These sample outcomes are illustrative, not holdout evaluation or actual lending.
        </p>
        <div className="evidence">
          <div className="panel">
            <p className="muted">Baseline · no CIBIL → reject</p>
            <p className="big">0</p>
            <p className="muted">offers among {examples.length} seed examples</p>
          </div>
          <div className="panel">
            <p className="muted">ZeroCIBIL · operations + trust</p>
            <p className="big">{offers.length}</p>
            <p className="muted">sample offers among {examples.length} seed examples; no funds disbursed</p>
          </div>
        </div>
        <section className="queue-twins">
          <h2>Fairness twins</h2>
          <p className="muted">Seed fixture comparison: {sameTerms ? "same verdict, principal, rate, tenure, and cadence" : "terms differ or a fixture is missing"}. These preset values do not prove fairness of a trained model.</p>
          <div className="twin-links">
            <a className="btn btn-secondary" href="/application/twin-a">Inspect twin A</a>
            <a className="btn btn-secondary" href="/application/twin-b">Inspect twin B</a>
          </div>
        </section>
      </div>
    </Shell>
  );
}
