import { useNavigate } from "react-router-dom";
import { Mark } from "../components/Mark.jsx";

export function Gate() {
  const navigate = useNavigate();
  return (
    <div>
      <header className="topnav">
        <a className="brand" href="/">
          <Mark />
          ZeroCIBIL
        </a>
        <nav className="nav-mid" aria-label="Primary">
          <a href="#how">How it works</a>
          <a href="#desk">Lender desk</a>
        </nav>
        <button type="button" className="btn btn-primary" onClick={() => navigate("/queue")}>
          Open desk
          <span aria-hidden="true"> →</span>
        </button>
      </header>

      <section className="gate">
        <p className="stars">Hackathon demo · synthetic data</p>
        <h1>Credit for shops banks cannot see</h1>
        <p className="lede">
          No CIBIL, no collateral theatre. ZeroCIBIL prices a kirana from verified operations
          — how much, how long, at what rate.
        </p>
        <div className="cta-row">
          <button type="button" className="btn btn-primary" onClick={() => navigate("/apply")}>
            Apply as owner
            <span aria-hidden="true"> →</span>
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate("/queue")}>
            Lender queue
          </button>
        </div>

        <div className="float-row">
          <div>
            <span className="sticker blue">Verified rails</span>
            <div className="widget" style={{ marginTop: 12 }}>
              <div className="stat-num">99.9%</div>
              <p className="muted">Synthetic shops labelled for the demo</p>
              <div className="bars" aria-hidden="true">
                {[40, 70, 55, 90, 60, 75, 48].map((h, i) => (
                  <span key={i} style={{ height: `${h}%` }} />
                ))}
              </div>
            </div>
          </div>

          <div className="phone" aria-hidden="true">
            <p className="bal">Lean-month surplus</p>
            <p className="amt">₹14,000</p>
            <div className="cards-mini">
              <div className="mini">
                Offer
                <br />
                ₹1.2L · 10 mo
              </div>
              <div className="mini light">
                Baseline
                <br />
                Decline · no CIBIL
              </div>
            </div>
          </div>

          <div>
            <span className="sticker yellow">Unverified PDF</span>
            <div className="widget" style={{ marginTop: 12 }}>
              <h3>This month</h3>
              <p className="muted">Uploads never set the limit. AA / UPI / GST can.</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
