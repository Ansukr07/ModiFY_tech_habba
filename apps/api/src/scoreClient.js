import { config } from "./config.js";

export async function scoreHealth() {
  try {
    const r = await fetch(`${config.scoreUrl}/health`, { headers: config.scorerApiKey ? { "x-scorer-key": config.scorerApiKey } : {}, signal: AbortSignal.timeout(3000) });
    if (!r.ok) return { ok: false };
    return { ok: true, ...(await r.json()) };
  } catch {
    return { ok: false };
  }
}

export async function postScore(path, body) {
  const r = await fetch(`${config.scoreUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(config.scorerApiKey ? { "x-scorer-key": config.scorerApiKey } : {}) },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(json.detail || json.error || "SCORE_UNAVAILABLE");
    err.status = r.status === 400 ? 400 : 503;
    err.retryable = r.status >= 500;
    throw err;
  }
  return json;
}
