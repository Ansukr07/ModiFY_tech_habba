import { Link } from "react-router-dom";
import { Shell } from "../components/Shell.jsx";
import { SHOPS, paiseToInr, verdictLabel } from "../data/seed.js";

export function LenderQueue() {
  return (
    <Shell role="lender">
      <div className="page">
        <div className="banner">
          <span className="sticker synth">Synthetic demo</span>
          <span className="pill outline">No bureau file on any row</span>
        </div>
        <h1 className="page-title">Thin-file queue</h1>
        <p className="muted">Baseline policy rejects every row. Open a file to price terms.</p>
        <div className="queue">
          {SHOPS.filter((s) => !s.id.startsWith("twin")).map((s) => (
            <Link key={s.id} className="q-row" to={`/application/${s.id}`}>
              <div>
                <strong>{s.name}</strong>
                <div className="muted">
                  {s.category} · {s.city} · {s.tag}
                </div>
              </div>
              <div className="muted">Asked {paiseToInr(s.requestedAmount)}</div>
              <span
                className={`pill ${
                  s.verdict === "STANDARD"
                    ? "black"
                    : s.verdict === "THIN_FILE"
                      ? "lilac"
                      : s.verdict === "UNVERIFIED"
                        ? "yellow"
                        : "outline"
                }`}
              >
                {verdictLabel(s.verdict)}
              </span>
              <span className="muted">Baseline decline →</span>
            </Link>
          ))}
        </div>
      </div>
    </Shell>
  );
}
