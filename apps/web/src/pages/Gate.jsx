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
          <a href="/apply">Apply</a>
          <a href="/queue">Lender desk</a>
          <a href="/evidence">Evidence</a>
        </nav>
        <button type="button" className="btn btn-primary" onClick={() => navigate("/queue")}>
          Open desk
          <span aria-hidden="true"> →</span>
        </button>
      </header>

      <section className="gate">
        <p className="stars">Synthetic demo data · Built for credit-invisible shops</p>
        <h1>Good business deserves to be seen.</h1>
        <p className="lede">
          No bureau file? Show the business behind the number. ZeroCIBIL uses verified operations
          to propose an amount, a term, and a repayment plan.
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
              <div className="stat-num">90 days</div>
              <p className="muted">of shop activity in this synthetic example</p>
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
