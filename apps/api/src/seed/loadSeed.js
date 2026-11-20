import { config } from "../config.js";
import { seedDb } from "../createApp.js";
import { mongoDb } from "../store.js";

const db = await mongoDb(config.mongoUri);
try {
  await seedDb(db);
  console.log("Demo data seeded");
} finally {
  await db.client.close();
}
