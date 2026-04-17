import { config } from "dotenv";
config();
import { getDb } from "./server/db";

async function main() {
  const db = await getDb();
  const [rows] = await db.execute("DESCRIBE claims");
  (rows as any[]).forEach(r => console.log(r.Field));
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
