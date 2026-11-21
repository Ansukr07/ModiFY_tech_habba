import test from "node:test";
import assert from "node:assert/strict";
import { config } from "./config.js";
import { setuRequest } from "./setuClient.js";

test("Setu fair use rejection has a stable error", async () => {
  const oldFetch = globalThis.fetch;
  const old = [config.setuClientId, config.setuClientSecret, config.setuProductInstanceId];
  config.setuClientId = "test";
  config.setuClientSecret = "test";
  config.setuProductInstanceId = "test";
  globalThis.fetch = async (url) => url.includes("/auth/token")
    ? new Response(JSON.stringify({ data: { token: "test", expiresIn: 1800 } }), { status: 200 })
    : new Response(JSON.stringify({ errorCode: "InvalidRequest", errorMsg: "Consent parameters are not as per Fair Usage Policy for purposeCode:" }), { status: 400 });
  try {
    await assert.rejects(setuRequest("/consents", { method: "POST", body: {} }), { message: "SETU_FAIR_USE_POLICY" });
  } finally {
    globalThis.fetch = oldFetch;
    [config.setuClientId, config.setuClientSecret, config.setuProductInstanceId] = old;
  }
});
