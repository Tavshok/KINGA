import "dotenv/config";
import { getDb } from "../db";
import { claims } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

async function main() {
  const db = await getDb();
  const [row] = await db.select().from(claims).where(eq(claims.id, 8400001));
  console.log('estimatedSpeedKmh:', (row as any).estimatedSpeedKmh);
  console.log('incidentDescription:', (row as any).incidentDescription?.substring(0, 150));
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
