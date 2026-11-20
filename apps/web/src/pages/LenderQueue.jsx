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
        <p className="muted">Four fixed synthetic assessments. Open a shop to inspect its sample terms and evidence.</p>
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
              <span className="muted">Open sample →</span>
            </Link>
          ))}
        </div>
        <section className="queue-twins">
          <h2>Fairness fixtures</h2>
          <p className="muted">The two synthetic twins have the same operating data and different protected flags. Compare their recorded terms; the model fairness test is still pending.</p>
          <div className="twin-links">
            <Link className="btn btn-secondary" to="/application/twin-a">Open twin A</Link>
            <Link className="btn btn-secondary" to="/application/twin-b">Open twin B</Link>
          </div>
        </section>
      </div>
    </Shell>
  );
}
