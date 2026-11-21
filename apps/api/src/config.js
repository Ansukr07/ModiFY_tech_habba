import dotenv from "dotenv";
import { fileURLToPath } from "node:url";

dotenv.config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)) });

const appEnv = (process.env.APP_ENV || "development").toLowerCase();
const scorerApiKey = process.env.SCORER_API_KEY || "";
const sessionSecret = process.env.JWT_SECRET || process.env.SESSION_SECRET || "dev-only-change-me";
const configuredMongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
const mongoUri = configuredMongoUri || "mongodb://127.0.0.1:27017/zerocibil";
const scoreUrl = process.env.SCORE_URL || "http://127.0.0.1:8000";
const corsOrigin = process.env.CORS_ORIGIN || "http://127.0.0.1:5173";
const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
const evidenceReviewAgeDays = Number(process.env.EVIDENCE_REVIEW_AGE_DAYS || 90);
if (!Number.isInteger(evidenceReviewAgeDays) || evidenceReviewAgeDays < 1) {
  throw new Error("EVIDENCE_REVIEW_AGE_DAYS must be a positive integer");
}
if (appEnv === "production" && scorerApiKey.length < 32) {
  throw new Error("SCORER_API_KEY must be at least 32 characters when APP_ENV=production");
}
if (appEnv === "production" && (sessionSecret === "dev-only-change-me" || sessionSecret.length < 32)) {
  throw new Error("Set JWT_SECRET or SESSION_SECRET to at least 32 characters in production");
}
if (appEnv === "production" && (!configuredMongoUri || mongoUri === "memory")) {
  throw new Error("Set MONGODB_URI to durable storage in production");
}
if (appEnv === "production") {
  const database = new URL(mongoUri);
  const scorer = new URL(scoreUrl);
  const browser = new URL(corsOrigin);
  const databaseIsLoopback = loopbackHosts.has(database.hostname);
  const databaseTls = database.protocol === "mongodb+srv:"
    ? database.searchParams.get("tls") !== "false" && database.searchParams.get("ssl") !== "false"
    : database.searchParams.get("tls") === "true" || database.searchParams.get("ssl") === "true";
  if (!databaseIsLoopback && !databaseTls) {
    throw new Error("Remote production MongoDB must enable TLS");
  }
  if (scorer.username || scorer.password || !["http:", "https:"].includes(scorer.protocol)
    || (scorer.protocol === "http:" && !loopbackHosts.has(scorer.hostname))) {
    throw new Error("SCORE_URL must use HTTPS unless the scoring service is on loopback");
  }
  if (browser.protocol !== "https:" || browser.username || browser.password || corsOrigin !== browser.origin) {
    throw new Error("CORS_ORIGIN must be a bare HTTPS origin in production");
  }
}

export const config = {
  appEnv,
  port: Number(process.env.PORT || 4000),
  mongoUri,
  sessionSecret,
  scoreUrl,
  scorerApiKey,
  corsOrigin,
  policyVersion: process.env.POLICY_VERSION || "v1",
  evidenceReviewAgeDays,
  evidenceFreshnessVersion: process.env.EVIDENCE_FRESHNESS_VERSION || "review-only-v1",
  setuClientId: process.env.SETU_CLIENT_ID || "",
  setuClientSecret: process.env.SETU_CLIENT_SECRET || "",
  setuProductInstanceId: process.env.SETU_PRODUCT_INSTANCE_ID || "",
  setuWebhookToken: process.env.SETU_AA_WEBHOOK_TOKEN || "",
};
