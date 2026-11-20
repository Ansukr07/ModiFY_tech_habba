import { useParams, Link } from "react-router-dom";
import { Shell } from "../components/Shell.jsx";
import { SHOPS, paiseToInr, verdictLabel } from "../data/seed.js";

export function OwnerStatus() {
  const { id } = useParams();
  const shop = SHOPS.find((s) => s.id === id);
  if (!shop) return <Shell role="owner"><div className="page"><h1>Sample not found</h1><Link to="/apply">Return to apply</Link></div></Shell>;
  return (
    <Shell role="owner">
      <div className="page form">
        <span className="sticker synth">Synthetic demo</span>
        <h1 className="page-title">{shop.name}</h1>
        <p className="muted">Fixed sample outcome. No application was submitted or loan disbursed.</p>
        <p className="muted">
          {shop.verdict === "UNVERIFIED" &&
            "We could not verify operations. Connect AA or UPI — a PDF will not unlock a full limit."}
          {shop.verdict === "DECLINE" &&
            "We cannot price this file from the rails we see. This is not a CIBIL score."}
          {(shop.verdict === "STANDARD" || shop.verdict === "THIN_FILE" || shop.verdict === "STEP_UP") &&
            "A lender can offer terms from your operations. Nothing has been disbursed — demo only."}
        </p>
        <p className="offer-amt">
          {shop.principal ? paiseToInr(shop.principal) : verdictLabel(shop.verdict)}
        </p>
        {shop.principal > 0 && (
          <>
            {shop.principal < shop.requestedAmount && <p className="muted">Sample counteroffer: you asked for {paiseToInr(shop.requestedAmount)}. This example proposes a smaller amount.</p>}
            <p className="muted">{shop.tenureMonths} months · {(shop.rateBps / 100).toFixed(1)}% p.a. · {shop.cadence} repayment of {paiseToInr(shop.weeklyRepayment)} (sample)</p>
          </>
        )}
        {shop.conditions.length > 0 && <ul className="muted">{shop.conditions.map((condition) => <li key={condition}>{condition}</li>)}</ul>}
        <Link className="btn btn-secondary" to="/queue">
          View as lender
        </Link>
      </div>
    </Shell>
  );
}
