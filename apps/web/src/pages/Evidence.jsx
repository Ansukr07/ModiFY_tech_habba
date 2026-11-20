import { Shell } from "../components/Shell.jsx";
import { SHOPS } from "../data/seed.js";

export function Evidence() {
  const offers = SHOPS.filter((s) => s.principal > 0 && !s.id.startsWith("twin"));
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
            <p className="muted">offers among four seed examples</p>
          </div>
          <div className="panel">
            <p className="muted">ZeroCIBIL · operations + trust</p>
            <p className="big">{offers.length}</p>
            <p className="muted">sample offers among four seed examples; no funds disbursed</p>
          </div>
        </div>
      </div>
    </Shell>
  );
}
