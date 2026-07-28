import "dotenv/config";
import { getDb } from "../db";
import { aiAssessments } from "../../drizzle/schema";
import { desc, eq } from "drizzle-orm";

async function main() {
  const db = await getDb();
  const rows = await db.select({ id: aiAssessments.id, physicsTruthJson: aiAssessments.physicsTruthJson })
    .from(aiAssessments)
    .where(eq(aiAssessments.claimId, 8400001))
    .orderBy(desc(aiAssessments.createdAt))
    .limit(5);
  for (const row of rows) {
    if (!row.physicsTruthJson) { console.log('id:', row.id, '- no physicsTruthJson'); continue; }
    const parsed = JSON.parse(row.physicsTruthJson as string);
    const speed = parsed.speed;
    console.log('id:', row.id, '| claimedSpeedKmh:', speed?.claimedSpeedKmh, '| canonical:', speed?.canonical?.value);
  }
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
