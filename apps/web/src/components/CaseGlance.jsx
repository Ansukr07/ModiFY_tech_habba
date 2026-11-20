import { Link } from "react-router-dom";
import { paiseToInr, verdictLabel } from "../data/seed.js";
import { CashflowChart } from "./DeskCharts.jsx";

function money(value) {
  return value == null || !Number.isFinite(value) ? "Unavailable" : paiseToInr(value);
}

function headlineFrom(narrative) {
  const parts = String(narrative || "").split(/(?<=\.)\s+/).filter(Boolean);
  return parts.find((part) => /^(We can give|No amount|Surplus is positive|No positive|Assessment stopped|Models were not)/.test(part)) || parts[0] || "";
}

function Meter({ label, value, max, caption, tone }) {
  const known = value != null && Number.isFinite(value) && max > 0;
  const width = known ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return <div className={`desk-meter is-${tone}`}>
    <div><span>{label}</span><strong>{caption}</strong></div>
    <span className="desk-meter-bar" aria-hidden="true"><i style={{ width: `${width}%` }} /></span>
  </div>;
}

export function AssessmentGlance({ decision, narrative, requested, verifiedRails, railCount, auditHref }) {
  const basis = decision.capacity?.retention_basis || {};
  const needed = basis.required_verified_rails || 2;
  const auth = decision.p_auth == null ? null : Math.round(decision.p_auth * 100);
  const stress = decision.p_stress == null ? null : Math.round(decision.p_stress * 100);
  const offer = decision.principal_paise == null ? null : (decision.principal_paise || 0);
  const headline = headlineFrom(narrative);
  return <section id="assessment-summary" className="dashboard-assessment-summary desk-glance" aria-label="Assessment summary">
    <div className="desk-glance-lead">
      <strong>{verdictLabel(decision.verdict)}</strong>
      <p>{headline}</p>
    </div>
    <div className="desk-figures" aria-label="Requested amount and amount we can give">
      <div><span>Requested</span><strong>{money(requested)}</strong></div>
      <div><span>We can give</span><strong>{money(offer)}</strong></div>
      <div><span>Lean weekly surplus</span><strong>{money(decision.capacity?.lean_surplus_paise)}</strong></div>
    </div>
    <div className="desk-meters" aria-label="Assessment signals">
      <Meter label="Authenticity" value={auth} max={100} tone="auth" caption={auth == null ? "Not scored" : `${auth}% · ${decision.authenticity_band || "band unavailable"}`} />
      <Meter label="Lean-period stress" value={stress} max={100} tone="stress" caption={stress == null ? "Not scored" : `${stress}% · ${decision.risk_band || "band unavailable"}`} />
      <Meter label="Verified rails" value={verifiedRails} max={Math.max(needed, railCount, 1)} tone="rails" caption={`${verifiedRails} of ${needed} for a full limit`} />
    </div>
    <details className="desk-fold">
      <summary>How this was read</summary>
      <p>{narrative}</p>
      <p>Policy {decision.versions?.policy || "unknown"} · Auth model {decision.versions?.model_auth || "unknown"} · Stress model {decision.versions?.model_stress || "unknown"} · Input revision {decision.input_revision ?? "unknown"} · Assessed {decision.assessed_at?.slice(0, 10) || "date unavailable"}{decision.audit_reference && auditHref ? <> · <Link to={auditHref}>Audit {decision.audit_reference}</Link></> : null}</p>
    </details>
  </section>;
}

function railStatus(rail) {
  if (rail.type === "pdf") return "Unverified upload";
  if (rail.trustClass === "supporting") return "Supporting only";
  return ["verified", "verified_simulated"].includes(rail.trustClass) ? "Simulated verified" : "Unverified";
}

function railNote(rail, observationAge) {
  const coverage = rail.coverage_from && rail.coverage_to ? `${rail.coverage_from} to ${rail.coverage_to}` : "unknown";
  const basis = rail.coverage_basis === "dated_transactions" ? "from dated transactions" : rail.coverage_basis === "fixture_declared_period" ? "fixture-declared period" : "source period unknown";
  const identity = rail.identity_match === false ? "mismatch" : rail.identity_match === true ? "matched" : "unknown";
  const counts = rail.type === "pdf"
    ? "Context only; does not satisfy the operational-rail gate."
    : ["verified", "verified_simulated"].includes(rail.trustClass)
      ? "Counts toward the verified-rail gate; limit still depends on capacity and policy."
      : "Does not satisfy the verified-rail gate.";
  return `${rail.provenance || "Unknown provenance"} · coverage ${coverage} (${basis}) · last observed ${rail.coverage_to || "unknown"} (${observationAge(rail.coverage_to)}; no freshness cutoff specified) · added ${rail.createdAt?.slice(0, 10) || "date unknown"} · identity ${identity}. ${counts}`;
}

function PairBars({ leftLabel, leftValue, rightLabel, rightValue }) {
  const max = Math.max(leftValue || 0, rightValue || 0, 1);
  const row = (label, value, tone) => <div className={`desk-pair-row is-${tone}`}>
    <span>{label}</span>
    <span className="desk-track-bar" aria-hidden="true"><i style={{ width: `${Math.max(0, value || 0) / max * 100}%` }} /></span>
    <strong>{money(value)}</strong>
  </div>;
  return <div className="desk-pair" aria-label="GST sales and UPI credits">
    {row(leftLabel, leftValue, "gst")}
    {row(rightLabel, rightValue, "upi")}
  </div>;
}

function ScenarioShift({ decision, scenario, lean, outflow, onStress }) {
  const rows = [
    ["Verdict", verdictLabel(decision.verdict), verdictLabel(scenario.verdict)],
    ["Weekly surplus", money(decision.capacity?.lean_surplus_paise), money(scenario.capacity?.lean_surplus_paise)],
    ["We can give", money(decision.principal_paise), money(scenario.principal_paise || 0)],
  ];
  const blocked = scenario.capacity?.max_principal_paise === 0;
  const why = scenario.verdict === "UNVERIFIED" || scenario.not_run_reason === "no_verified_rail"
    ? "No verified operational rail, so policy does not set a full limit."
    : scenario.not_run_reason
      ? scenario.not_run_reason.replaceAll("_", " ")
      : scenario.capacity?.lean_surplus_paise <= 0
        ? "The weakest four weeks have no positive surplus."
        : scenario.capacity?.max_emi_paise <= 0
          ? "Installment capacity after the haircut is zero."
          : "A policy gate prevents an offer.";
  return <div className="dashboard-scenario">
    <strong>Illustrative only. This does not change the saved decision.</strong>
    <small>Inflow −{lean * 8}% · outflow +{outflow * 5}%</small>
    <div className="desk-shift" aria-label="Scenario compared with the saved assessment">
      {rows.map(([label, before, after]) => <div key={label}><span>{label}</span><b>{before}</b><span aria-hidden="true">→</span><b>{after}</b></div>)}
    </div>
    {blocked && <p role="status">No supportable principal in this scenario. {why}</p>}
    <details className="desk-fold">
      <summary>Other scenario figures</summary>
      <p>Weekly capacity {money(decision.capacity?.max_emi_paise)} → {money(scenario.capacity?.max_emi_paise)}. Policy maximum {money(decision.capacity?.max_principal_paise)} → {money(scenario.capacity?.max_principal_paise)}. Rate and tenure {decision.rate_bps / 100}% / {decision.tenure_months} mo → {scenario.rate_bps / 100}% / {scenario.tenure_months} mo.</p>
    </details>
    <button className="btn btn-secondary" type="button" onClick={() => onStress(0, 0)}>Reset scenario</button>
  </div>;
}

export function EvidenceBoard({ weeks, leanDates, decision, rails, verified, shop, reconciliation, statement, lean, outflow, scenario, onStress, observationAge, applicationId }) {
  const observed = weeks.filter((week) => !week.missing).length;
  const pdfs = rails.filter((rail) => rail.type === "pdf").length;
  const gap = reconciliation ? Math.round(reconciliation.relative_gap * 100) : null;
  const reviewAt = decision?.policy_thresholds?.gst_upi_gap_review_above;
  return <>
    <div className="dashboard-analysis" id="evidence">
      <section className="dashboard-chart-card">
        <div className="dashboard-card-heading">
          <div>
            <h2>Weekly operating cashflow</h2>
            <p>{observed} of {weeks.length || "—"} weeks recorded · synthetic</p>
          </div>
        </div>
        {weeks.length > 0 && <div className="desk-ribbon" aria-hidden="true">
          {weeks.map((week) => <i key={week.date} className={week.missing ? "is-missing" : leanDates.includes(week.date) ? "is-lean" : "is-on"} />)}
        </div>}
        <p className="desk-ribbon-key"><span className="is-on">Recorded</span><span className="is-missing">Missing</span><span className="is-lean">Lean period</span><span>{verified.length} verified of {rails.length} sources · {pdfs} PDF</span></p>
        <CashflowChart weeks={weeks} leanDates={leanDates} />
        <details className="dashboard-week-table desk-fold">
          <summary>Weekly amounts</summary>
          <div className="dashboard-table-scroll">
            <table>
              <thead><tr><th>Week of</th><th>Inflow</th><th>Outflow</th><th>Net</th></tr></thead>
              <tbody>{weeks.map((week) => <tr key={week.date}><th>{week.date}{week.missing ? " · no records" : ""}{leanDates.includes(week.date) ? " · lean" : ""}</th><td>{week.missing ? "No records" : paiseToInr(week.inflow)}</td><td>{week.missing ? "No records" : paiseToInr(week.outflow)}</td><td>{week.missing ? "No records" : paiseToInr(week.inflow - week.outflow)}</td></tr>)}</tbody>
            </table>
          </div>
        </details>
        <div className="desk-sliders">
          <label className="dashboard-slider-label" htmlFor="dashboard-lean">Reduce inflow <strong>{lean * 8}%</strong></label>
          <input id="dashboard-lean" type="range" min="0" max="6" value={lean} onChange={(event) => onStress(Number(event.target.value), outflow)} disabled={!decision} />
          <label className="dashboard-slider-label" htmlFor="dashboard-outflow">Increase outflow <strong>{outflow * 5}%</strong></label>
          <input id="dashboard-outflow" type="range" min="0" max="6" value={outflow} onChange={(event) => onStress(lean, Number(event.target.value))} disabled={!decision} />
        </div>
        {scenario && <ScenarioShift decision={decision} scenario={scenario} lean={lean} outflow={outflow} onStress={onStress} />}
      </section>
      <section className="dashboard-trust-card">
        <h2>Sources</h2>
        <p>{verified.length ? `${verified.length} simulated verified rails. No bureau file.` : "No verified rail, so there is no full limit."}</p>
        {!verified.length && <p><Link to={`/application/${applicationId}/actions`}>Request evidence</Link></p>}
        <ul className="desk-sources">
          {rails.map((rail, index) => <li key={`${rail.type}-${index}`}>
            <div><strong>{rail.type.toUpperCase()}</strong><span>{railStatus(rail)}</span></div>
            <small>{rail.coverage_from && rail.coverage_to ? `${rail.coverage_from} – ${rail.coverage_to}` : "Coverage unknown"} · {rail.identity_match === false ? "Identity mismatch" : rail.identity_match === true ? "Identity matched" : "Identity unknown"}</small>
            <details className="desk-fold"><summary>Source notes</summary><p>{railNote(rail, observationAge)}</p></details>
          </li>)}
        </ul>
        {statement && <div className="desk-statement">
          <strong>{statement.quality_passed ? "Statement read passed" : statement.quality_passed == null ? "Statement quality not returned" : "Statement read did not pass"}</strong>
          <span>{statement.extracted_rows ?? "—"} rows · {statement.normalized_rows ?? "—"} normalized · {statement.week_count ?? "—"} weeks</span>
          <details className="desk-fold">
            <summary>Statement file</summary>
            <p>{statement.filename || "Statement PDF"} · document {statement.document_id || "id not returned"} · source {statement.source || "not returned"} · provenance {statement.provenance || "not returned"}.</p>
            <p>SHA-256 {statement.sha256 || "not returned"}. Synthetic bank-issued statement. An owner-uploaded PDF still does not verify activity.</p>
          </details>
        </div>}
        {reconciliation && <div className="dashboard-reconciliation">
          <strong>GST and UPI</strong>
          <PairBars leftLabel="GST sales" leftValue={reconciliation.gst_sales_paise} rightLabel="UPI credits" rightValue={reconciliation.upi_credits_paise} />
          <small>{gap}% difference. {reconciliation.period_note}. Review flag above {reviewAt == null ? "an unavailable threshold" : `${Math.round(reviewAt * 100)}%`}. A gap is not proof of fraud.</small>
        </div>}
        <p className="desk-vpa">UPI ID <strong>{shop.identity?.vpa || "Not provided"}</strong>. Owner submitted. This ID alone does not verify transactions.</p>
        <p className="dashboard-trust-note">A PDF cannot establish verified activity or set a full limit.</p>
      </section>
    </div>
  </>;
}
