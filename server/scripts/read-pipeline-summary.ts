import "dotenv/config";
import { getDb } from "../db";
import { sql } from "drizzle-orm";

async function main() {
  const db = await getDb();
  if (!db) { console.error("No DB"); process.exit(1); }

  const r = await db.execute(sql`
    SELECT id, pipeline_run_summary FROM ai_assessments
    WHERE claim_id = 6990001 ORDER BY created_at DESC LIMIT 1
  `);
  const rows = (r as any)[0] || r;
  const row = Array.isArray(rows) ? rows[0] : rows;
  const prs = row ? (row as any).pipeline_run_summary : null;
  
  if (prs === null || prs === undefined) {
    console.log("pipeline_run_summary is NULL — no error was recorded");
  } else {
    try {
      const parsed = JSON.parse(prs as string);
      console.log("=== PIPELINE RUN SUMMARY ===");
      console.log(JSON.stringify(parsed, null, 2));
    } catch (e) {
      console.log("Raw pipeline_run_summary (first 1000 chars):");
      console.log((prs as string).substring(0, 1000));
    }
  }
  
  process.exit(0);
}

main().catch(e => { console.error(e.message || e); process.exit(1); });
