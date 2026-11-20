import { useParams, Link, useLocation } from "react-router-dom";
import { Shell } from "../components/Shell.jsx";
import { SHOPS, paiseToInr, verdictLabel } from "../data/seed.js";

export function OwnerStatus() {
  const { id } = useParams();
  const location = useLocation();
  const shop = SHOPS.find((s) => s.id === id);
  if (!shop) return <Shell role="owner"><div className="page"><h1>Sample not found</h1><Link to="/apply">Return to apply</Link></div></Shell>;
  return (
    <Shell role="owner">
      <div className="page form">
        <span className="sticker synth">Synthetic demo</span>
        <h1 className="page-title">{shop.name}</h1>
        {location.state?.demoApplication && <p className="muted">Sample outcome for {location.state.shopName}, requesting ₹{Number(location.state.amount).toLocaleString("en-IN")}. The figures below belong to {shop.name}; no application was saved.</p>}
        <p className="muted">
          {shop.verdict === "UNVERIFIED" &&
            "We could not verify operations. Connect AA or UPI — a PDF will not unlock a full limit."}
          {shop.verdict === "DECLINE" &&
            "We cannot price this file from the rails we see. This is not a CIBIL score."}
          {(shop.verdict === "STANDARD" || shop.verdict === "THIN_FILE") &&
            "A lender can offer terms from your operations. Nothing has been disbursed — demo only."}
        </p>
        <p className="offer-amt">
          {shop.principal ? paiseToInr(shop.principal) : verdictLabel(shop.verdict)}
        </p>
        {shop.principal > 0 && (
          <p className="muted">
            {shop.tenureMonths} months · {(shop.rateBps / 100).toFixed(1)}% · {shop.cadence}
          </p>
        )}
        <Link className="btn btn-secondary" to="/queue">
          View as lender
        </Link>
      </div>
    </Shell>
  );
}
