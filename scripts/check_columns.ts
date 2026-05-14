// @ts-nocheck
import { getDb } from "../server/db";
import { sql } from "drizzle-orm";

async function main() {
  const db = await getDb();
  const [cols] = await db.execute(sql`SHOW COLUMNS FROM ai_assessments`);
  console.log("=== AI_ASSESSMENTS COLUMNS ===");
  for (const c of cols as any[]) {
    console.log(`  ${c.Field} | ${c.Type} | ${c.Null === 'YES' ? 'NULL' : 'NOT NULL'}`);
  }
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
