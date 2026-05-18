import { getDb } from "../server/db";
import { sql } from "drizzle-orm";

async function main() {
  const db = await getDb();
  if (!db) { console.log("No DB"); return; }
  const rows = await db.execute(sql`SELECT id, claim_number, document_processing_status, ai_assessment_triggered, ai_assessment_completed, source_document_id FROM claims ORDER BY id DESC LIMIT 10`);
  console.log(JSON.stringify(rows, null, 2));
  process.exit(0);
}
main().catch(err => { console.error(err); process.exit(1); });
