import { Link } from "react-router-dom";
import { Mark } from "../components/Mark.jsx";
import { SHOPS, paiseToInr } from "../data/seed.js";
import "../landing.css";

const clean = SHOPS.find((shop) => shop.id === "clean-kirana");
const examples = SHOPS.filter((shop) => !shop.id.startsWith("twin"));
const offers = examples.filter((shop) => shop.principal > 0).length;
const bars = [42, 64, 52, 81, 57, 73, 48];

function Arrow() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d="M4 12h15m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}

export function Gate() {
  return (
    <div className="landing-frame">
      <div className="landing-sheet">
        <header className="landing-nav">
          <Link className="landing-brand" to="/" aria-label="ZeroCIBIL home"><Mark size={32} /><span>ZeroCIBIL</span></Link>
          <nav aria-label="Primary">
            <a href="#features">How it works</a>
            <a href="#evidence">Evidence</a>
            <Link to="/login">For owners</Link>
            <Link to="/login?role=lender">For lenders</Link>

          </nav>
          <Link className="landing-button landing-button-dark landing-nav-cta" to="/login">Get started <Arrow /></Link>
        </header>

        <main>
          <section className="landing-hero" aria-labelledby="landing-title">
            <h1 id="landing-title">Empowering your<br />financial future</h1>
            <p className="landing-subtitle">Credit terms shaped by your shop’s verified operations, even without a bureau file.</p>
            <div className="landing-actions">
              <Link className="landing-button landing-button-dark" to="/login">Explore as owner <Arrow /></Link>
              <Link className="landing-button landing-button-light" to="/login?role=lender">Open lender desk <Arrow /></Link>
            </div>

            <div className="landing-stage" aria-label="Synthetic ZeroCIBIL product preview">
              <div className="landing-orbit landing-orbit-one" aria-hidden="true" />
              <div className="landing-orbit landing-orbit-two" aria-hidden="true" />
              <div className="landing-stage-ground" aria-hidden="true" />
              <div className="landing-sticker landing-sticker-blue">Verified shop activity<span aria-hidden="true">◢</span></div>
              <div className="landing-sticker landing-sticker-yellow">PDF stays unverified<span aria-hidden="true">◥</span></div>

              <div className="landing-activity" aria-label="Synthetic weekly activity illustration">
                <div className="landing-activity-top"><span>Lean-period view</span><strong>12 weeks</strong></div>
                <div className="landing-activity-bars" aria-hidden="true">
                  {bars.map((height, index) => <span key={index}><i style={{ height: `${height}%` }} /></span>)}
                </div>
                <div className="landing-week-labels" aria-hidden="true"><span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span></div>
              </div>

              <div className="landing-phone" aria-label="Sample ZeroCIBIL offer preview">
                <div className="landing-phone-content">
                <div className="landing-phone-status"><span>9:41</span><span className="landing-phone-notch" aria-hidden="true" /><span className="landing-signal" aria-hidden="true">▮▮▮ ▰</span></div>
                <div className="landing-phone-header"><span aria-hidden="true">☰</span><span><Mark size={19} /> ZeroCIBIL</span><span className="landing-phone-dot" aria-hidden="true" /></div>
                <p className="landing-phone-label">Sample offer from shop activity</p>
                <p className="landing-phone-amount">{paiseToInr(clean.principal)}<span> proposed</span></p>
                <div className="landing-phone-terms"><span>{clean.tenureMonths} months</span><span>{(clean.rateBps / 100).toFixed(0)}% p.a.</span><span>Weekly</span></div>
                <div className="landing-phone-black">
                  <div className="landing-phone-black-heading"><strong>Evidence considered</strong><span>Simulated</span></div>
                  <div className="landing-rail-cards"><div><Mark size={17}/><span>UPI merchant</span><strong>Verified</strong></div><div><Mark size={17}/><span>GST summary</span><strong>Verified</strong></div></div>
                </div>
                <div className="landing-phone-feed"><strong>What set this amount</strong><p>Weakest four-week cashflow</p><p>Repayment capacity</p><p>Verified shop rails</p></div>
                </div>
              </div>

              <div className="landing-transactions">
                <h3>Shop activity</h3>
                <div><span className="landing-avatar">UP</span><span>Merchant UPI<small>Simulated rail</small></span><strong>Verified</strong></div>
                <div><span className="landing-avatar landing-avatar-lilac">GS</span><span>GST summary<small>Simulated rail</small></span><strong>Aligned</strong></div>
              </div>
            </div>
          </section>

          <section className="landing-rail-band" aria-label="Sources in this demonstration">
            <p>Built around shop operations</p>
            <div><span>Account Aggregator</span><span>Merchant UPI</span><span>GST summary</span><span>Lean cashflow</span></div>
          </section>

          <section className="landing-growth" id="features">
            <h2>Every feature supports a fairer credit decision.</h2>
            <div className="landing-growth-stat"><strong>{offers}<span> / {examples.length}</span></strong><p>seed examples have sample offers, compared with zero under a no-CIBIL baseline. All outcomes are synthetic.</p></div>
          </section>
          <section className="landing-steps" aria-label="How ZeroCIBIL works">
            <article><span>01</span><h3>Verify the source</h3><p>Simulated AA, UPI and GST rails can support an assessment. A PDF upload stays unverified.</p></article>
            <article><span>02</span><h3>Find the lean period</h3><p>The weakest four weeks shape repayment capacity.</p></article>
            <article><span>03</span><h3>Review the terms</h3><p>A lender can inspect the amount, rate, tenure and reasons.</p></article>
          </section>
          <section className="landing-evidence" id="evidence" aria-labelledby="evidence-title">
            <div>
              <h2 id="evidence-title">A clearer picture of the shop.</h2>
              <p>ZeroCIBIL uses operating signals to make a case visible when a bureau file is not. Lenders can see what supports a decision and what still needs review.</p>
            </div>
            <dl>
              <div><dt>Account activity</dt><dd>Cashflow across strong and lean weeks</dd></div>
              <div><dt>Merchant payments</dt><dd>Shop transactions from simulated UPI rails</dd></div>
              <div><dt>GST summary</dt><dd>Business activity to support the assessment</dd></div>
              <div><dt>Uploaded PDFs</dt><dd>Visible for context, never treated as verified</dd></div>
            </dl>
          </section>
          <section className="landing-cta" aria-labelledby="landing-cta-title">
            <h2 id="landing-cta-title">See the shop beyond its bureau file.</h2>
            <p>Explore a sample owner journey or review the evidence as a lender.</p>
            <div className="landing-actions">
              <Link className="landing-button landing-button-dark" to="/login">Start as an owner <Arrow /></Link>
              <Link className="landing-button landing-button-light" to="/login?role=lender">Review as a lender <Arrow /></Link>
            </div>
          </section>
        </main>
        <footer className="landing-footer">
          <Link className="landing-brand" to="/" aria-label="ZeroCIBIL home"><Mark size={28} /><span>ZeroCIBIL</span></Link>
          <p>Credit decisions grounded in shop operations.</p>
          <nav aria-label="Footer">
            <a href="#features">How it works</a>
            <a href="#evidence">Evidence</a>
            <Link to="/login">Owner access</Link>
            <Link to="/login?role=lender">Lender desk</Link>
          </nav>
          <small>Prototype demonstration · all sample outcomes are synthetic</small>
        </footer>
      </div>
    </div>
  );
}
