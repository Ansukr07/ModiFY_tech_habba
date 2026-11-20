import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Shell } from "../components/Shell.jsx";

export function OwnerApply() {
  const navigate = useNavigate();
  const [rails, setRails] = useState({ aa: true, upi: true, gst: true, pdf: false });
  const [shopName, setShopName] = useState("Lakshmi Stores");
  const [amount, setAmount] = useState("200000");
  const [notice, setNotice] = useState("");

  function toggle(key) {
    setRails((r) => ({ ...r, [key]: !r[key] }));
  }

  function submit(event) {
    event.preventDefault();
    if (!shopName.trim() || !Number.isSafeInteger(Number(amount)) || Number(amount) <= 0) {
      setNotice("Enter a shop name and a positive whole-rupee amount.");
      return;
    }
    const id = rails.aa || rails.upi || rails.gst ? "clean-kirana" : "pdf-only";
    navigate(`/status/${id}`, { state: { demoApplication: true, shopName, amount } });
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

        <p className="muted">Preview a sample outcome. This demo does not submit an application.</p>
        <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="shop">Shop name</label>
          <input id="shop" value={shopName} onChange={(e) => setShopName(e.target.value)} required />
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
          <input id="amt" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" type="number" min="1" step="1" required />
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

        {notice && <p role="alert">{notice}</p>}
        <button type="submit" className="btn btn-primary">
          Preview sample outcome
          <span aria-hidden="true"> →</span>
        </button>
        </form>
      </div>
    </Shell>
  );
}
