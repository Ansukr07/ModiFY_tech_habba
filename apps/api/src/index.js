import { config } from "./config.js";
import { createApp, seedDb } from "./createApp.js";
import { memoryDb, mongoDb } from "./store.js";

async function openDb() {
  if (config.mongoUri === "memory") return memoryDb();
  return mongoDb(config.mongoUri, { requireTransactions: config.appEnv === "production" });
}

const db = await openDb();
await seedDb(db);
const app = createApp(db);
app.listen(config.port, () => {
  console.log(`ZeroCIBIL API http://127.0.0.1:${config.port} store=${db.kind}`);
});

