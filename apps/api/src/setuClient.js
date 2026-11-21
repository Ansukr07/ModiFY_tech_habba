import { config } from "./config.js";

let cached;
let expiresAt = 0;

export async function setuRequest(path, { method = "GET", body } = {}) {
  if (!config.setuClientId || !config.setuClientSecret || !config.setuProductInstanceId) throw new Error("Setu sandbox credentials are not configured");
  if (!cached || Date.now() >= expiresAt) {
    const auth = await fetch("https://uat.setu.co/api/v2/auth/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clientID: config.setuClientId, secret: config.setuClientSecret }),
      signal: AbortSignal.timeout(10000),
    });
    const result = await auth.json();
    if (!auth.ok || !result.data?.token) throw new Error("Setu authentication failed");
    cached = result.data.token;
    expiresAt = Date.now() + Math.max(0, Number(result.data.expiresIn || 0) - 60) * 1000;
  }
  const response = await fetch(`https://fiu-sandbox.setu.co/v2${path}`, {
    method,
    headers: { authorization: `Bearer ${cached}`, "x-product-instance-id": config.setuProductInstanceId, "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(15000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) { cached = null; expiresAt = 0; }
    if (response.status === 400 && result.errorCode === "InvalidRequest" && /Fair Usage Policy for purposeCode/.test(result.errorMsg || "")) throw new Error("SETU_FAIR_USE_POLICY");
    throw new Error(`Setu request failed (${response.status}): ${String(result.errorMsg || result.message || result.errorCode || "unknown provider error").slice(0, 240)}`);
  }
  return result;
}
