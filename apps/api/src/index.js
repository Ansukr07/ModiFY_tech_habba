import { config } from "./config.js";
import { createApp, seedDb } from "./createApp.js";
import { memoryDb, mongoDb } from "./store.js";

async function openDb() {
  if (config.mongoUri === "memory") return memoryDb();
  try {
    return await mongoDb(config.mongoUri);
  } catch (err) {
    console.error("Mongo unavailable, using memory store:", err.message);
    return memoryDb();
  }
}

const db = await openDb();
await seedDb(db);
const app = createApp(db);
app.listen(config.port, () => {
  console.log(`ZeroCIBIL API http://127.0.0.1:${config.port} store=${db.kind}`);
});

