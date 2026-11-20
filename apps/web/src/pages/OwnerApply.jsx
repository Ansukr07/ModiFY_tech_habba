import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Shell } from "../components/Shell.jsx";

export function OwnerApply() {
  const navigate = useNavigate();
  const [rails, setRails] = useState({ aa: true, upi: true, gst: true, pdf: false });

  function toggle(key) {
    setRails((r) => ({ ...r, [key]: !r[key] }));
  }

  return (
    <Shell role="owner">
      <div className="page form">
        <div className="banner">
          <span className="sticker synth">Synthetic demo</span>
          <span className="pill outline">No bureau file</span>
        </div>
        <h1 className="page-title">Apply without a credit history</h1>
        <p className="muted">
          PDFs you upload stay unverified. Connect a simulated rail if you want a full limit.
        </p>

        <div className="field">
          <label htmlFor="shop">Shop name</label>
          <input id="shop" defaultValue="Lakshmi Stores" />
        </div>
        <div className="field">
          <label htmlFor="cat">Category</label>
          <select id="cat" defaultValue="Kirana">
            <option>Kirana</option>
            <option>Tailor</option>
            <option>Repair</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="amt">Requested amount (₹)</label>
          <input id="amt" defaultValue="200000" inputMode="numeric" />
        </div>

        <p className="muted">Rails (all simulated)</p>
        <div className="checks">
          <label>
            <input type="checkbox" checked={rails.aa} onChange={() => toggle("aa")} />
            Account Aggregator — verified
          </label>
          <label>
            <input type="checkbox" checked={rails.upi} onChange={() => toggle("upi")} />
            UPI merchant credits — verified
          </label>
          <label>
            <input type="checkbox" checked={rails.gst} onChange={() => toggle("gst")} />
            GST summary — verified
          </label>
          <label>
            <input type="checkbox" checked={rails.pdf} onChange={() => toggle("pdf")} />
            Bank PDF — unverified, does not set limit
          </label>
        </div>

        <button
          type="button"
          className="btn btn-primary"
          onClick={() =>
            navigate(rails.aa || rails.upi || rails.gst ? "/status/clean-kirana" : "/status/pdf-only")
          }
        >
          Submit application
          <span aria-hidden="true"> →</span>
        </button>
      </div>
    </Shell>
  );
}
