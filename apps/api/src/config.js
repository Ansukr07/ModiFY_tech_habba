import dotenv from "dotenv";
import { fileURLToPath } from "node:url";

dotenv.config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)) });

export const config = {
  port: Number(process.env.PORT || 4000),
  mongoUri: process.env.MONGODB_URI || process.env.MONGO_URI || "mongodb://127.0.0.1:27017/zerocibil",
  sessionSecret: process.env.JWT_SECRET || process.env.SESSION_SECRET || "dev-only-change-me",
  scoreUrl: process.env.SCORE_URL || "http://127.0.0.1:8000",
  corsOrigin: process.env.CORS_ORIGIN || "http://127.0.0.1:5173",
  policyVersion: process.env.POLICY_VERSION || "v1",
};
