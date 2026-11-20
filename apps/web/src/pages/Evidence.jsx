import { Shell } from "../components/Shell.jsx";
import { SHOPS, paiseToInr, verdictLabel } from "../data/seed.js";

export function Evidence() {
  const examples = SHOPS.filter((s) => !s.id.startsWith("twin"));
  const offers = examples.filter((s) => s.principal > 0);
  const [a, b] = SHOPS.filter((s) => s.id.startsWith("twin"));
  const sameTerms = a && b && ["verdict", "principal", "rateBps", "tenureMonths", "cadence", "weeklyRepayment"].every((key) => a[key] === b[key]) && JSON.stringify(a.conditions) === JSON.stringify(b.conditions);
  const twinRows = a && b ? [
    ["Owner flag", a.ownerFlags.gender, b.ownerFlags.gender],
    ["Area flag", a.ownerFlags.area, b.ownerFlags.area],
    ["Verdict", verdictLabel(a.verdict), verdictLabel(b.verdict)],
    ["Principal", paiseToInr(a.principal), paiseToInr(b.principal)],
    ["Annual rate", `${(a.rateBps / 100).toFixed(1)}%`, `${(b.rateBps / 100).toFixed(1)}%`],
    ["Tenure", `${a.tenureMonths} months`, `${b.tenureMonths} months`],
    ["Cadence", a.cadence, b.cadence],
    ["Weekly repayment", paiseToInr(a.weeklyRepayment), paiseToInr(b.weeklyRepayment)],
    ["Conditions", a.conditions.join("; "), b.conditions.join("; ")],
  ] : [];
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
          {twinRows.length > 0 && <div className="table-scroll" role="region" aria-label="Fairness twin terms" tabIndex="0">
            <table className="twin-table">
              <thead><tr><th scope="col">Measure</th><th scope="col">Twin A</th><th scope="col">Twin B</th></tr></thead>
              <tbody>{twinRows.map(([label, left, right]) => <tr key={label}><th scope="row">{label}</th><td>{left}</td><td>{right}</td></tr>)}</tbody>
            </table>
          </div>}
          <div className="twin-links">
            <a className="btn btn-secondary" href="/application/twin-a">Inspect twin A</a>
            <a className="btn btn-secondary" href="/application/twin-b">Inspect twin B</a>
          </div>
        </section>
      </div>
    </Shell>
  );
}
