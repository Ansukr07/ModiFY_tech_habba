import { Shell } from "../components/Shell.jsx";
import { SHOPS } from "../data/seed.js";

export function Evidence() {
  const funded = SHOPS.filter((s) => s.principal > 0 && !s.id.startsWith("twin-b")).length;
  return (
    <Shell role="lender">
      <div className="page">
        <span className="sticker synth">Synthetic labels</span>
        <h1 className="page-title">Baseline versus ZeroCIBIL</h1>
        <p className="muted">
          Everyone in this set is credit-invisible. The baseline funds nobody. We fund shops whose
          verified lean month can pay, and we refuse PDF-only and mule-like files.
        </p>
        <div className="evidence">
          <div className="panel">
            <p className="muted">Baseline · no CIBIL → reject</p>
            <p className="big">0</p>
            <p className="muted">shops funded</p>
          </div>
          <div className="panel">
            <p className="muted">ZeroCIBIL · operations + trust</p>
            <p className="big">{funded}</p>
            <p className="muted">shops funded in the seed set (demo)</p>
          </div>
        </div>
      </div>
    </Shell>
  );
}
