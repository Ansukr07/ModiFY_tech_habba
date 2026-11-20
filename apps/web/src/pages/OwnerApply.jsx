import { Link } from "react-router-dom";
import { Shell } from "../components/Shell.jsx";
import { SHOPS, paiseToInr } from "../data/seed.js";

const examples = ["clean-kirana", "pdf-only"];

export function OwnerApply() {
  return (
    <Shell role="owner">
      <div className="page form">
        <div className="banner">
          <span className="sticker synth">Synthetic demo</span>
          <span className="pill outline">No bureau file</span>
        </div>
        <h1 className="page-title">See how an application works</h1>
        <p className="muted">
          Choose a sample shop to see what verified operations change. These examples are fixed
          synthetic records; applications cannot be submitted until the underwriting service is connected.
        </p>
        <div className="example-list">
          {examples.map((id) => {
            const shop = SHOPS.find((item) => item.id === id);
            return (
              <section className="panel" key={id}>
                <span className="sticker synth">Sample shop</span>
                <h2>{shop.name}</h2>
                <p className="muted">{shop.category} · Asked {paiseToInr(shop.requestedAmount)}</p>
                <ul className="muted">
                  {shop.rails.map((rail) => (
                    <li key={rail.type}>
                      {rail.label} — {rail.trustClass === "verified" ? "verified in simulation" : "unverified upload"}
                    </li>
                  ))}
                </ul>
                <Link className="btn btn-primary" to={`/status/${id}`}>
                  View sample outcome <span aria-hidden="true">→</span>
                </Link>
              </section>
            );
          })}
        </div>
      </div>
    </Shell>
  );
}
