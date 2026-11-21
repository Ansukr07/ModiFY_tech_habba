import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { api } from "../data/api.js";

export function SetuReturn() {
  const [id] = useState(() => sessionStorage.getItem("setu_application_id"));
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!id) { setDone(true); return; }
    api(`/applications/${encodeURIComponent(id)}/aa/refresh`, { method: "POST", body: "{}" })
      .then(() => sessionStorage.removeItem("setu_application_id"))
      .catch((err) => setError(err.message))
      .finally(() => setDone(true));
  }, [id]);
  if (!done) return <p role="status">Checking Setu consent…</p>;
  if (error) return <main aria-labelledby="setu-return-title"><h1 id="setu-return-title">Could not check Setu consent</h1><p role="alert">{error}</p>{id && <p>Your application is saved. You can retry the status check from its dashboard.</p>}<Link to={id ? `/owner/application/${encodeURIComponent(id)}` : "/owner/applications"}>Continue</Link></main>;
  return <Navigate replace to={id ? `/owner/application/${encodeURIComponent(id)}` : "/owner/applications"} />;
}
