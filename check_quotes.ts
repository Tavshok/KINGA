import { getDb } from "./server/db";
import { sql } from "drizzle-orm";

async function main() {
  const db = await getDb();
  
  // Check cost_intelligence_json for quotes count after re-run
  const result = await db.execute(sql`
    SELECT 
      JSON_LENGTH(JSON_EXTRACT(cost_intelligence_json, '$.quotes')) as quotes_count,
      JSON_EXTRACT(cost_intelligence_json, '$.quotes[0].panel_beater') as q1_pb,
      JSON_EXTRACT(cost_intelligence_json, '$.quotes[0].total_cost') as q1_total,
      JSON_EXTRACT(cost_intelligence_json, '$.quotes[1].total_cost') as q2_total,
      JSON_EXTRACT(cost_intelligence_json, '$.quotes[2].total_cost') as q3_total,
      JSON_EXTRACT(cost_intelligence_json, '$.costDecision.true_cost_usd') as true_cost_usd,
      JSON_EXTRACT(cost_intelligence_json, '$.costDecision.no_cost_basis') as no_cost_basis,
      JSON_EXTRACT(cost_intelligence_json, '$.quotesReceived') as quotes_received,
      JSON_EXTRACT(cost_intelligence_json, '$.mode') as mode
    FROM ai_assessments WHERE claim_id = 8880001
  `);
  
  const rows = (result as any).rows ?? result;
  console.log("=== Stage 9 quotes after re-run ===");
  console.log(JSON.stringify(rows[0], null, 2));
  
  // Check pipeline_jobs status
  const jobs = await db.execute(sql`
    SELECT stage_id, status, duration_ms, created_at 
    FROM pipeline_jobs 
    WHERE claim_id = 8880001 
    ORDER BY created_at DESC LIMIT 11
  `);
  const jobRows = (jobs as any).rows ?? jobs;
  console.log("\n=== Pipeline jobs (latest run) ===");
  for (const j of jobRows) {
    console.log(`  ${j.stage_id}: ${j.status} (${j.duration_ms ?? 'null'}ms)`);
  }
  
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
