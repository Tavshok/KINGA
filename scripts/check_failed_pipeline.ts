// @ts-nocheck
import { getDb } from "../server/db";
import { sql } from "drizzle-orm";

async function main() {
  const db = await getDb();
  
  // Get the pipeline_run_summary for the failed claim
  const [result] = await db.execute(sql`
    SELECT id, pipeline_run_summary, stage2_raw_ocr_text IS NOT NULL as has_ocr,
           claim_record_json IS NOT NULL as has_claim_record,
           damaged_components_json IS NOT NULL as has_components,
           damage_photos_json IS NOT NULL as has_photos
    FROM ai_assessments WHERE claim_id = 6090046 ORDER BY id DESC LIMIT 1
  `);
  
  for (const a of result as any[]) {
    console.log(`Assessment ${a.id}:`);
    console.log(`  Has OCR: ${a.has_ocr}`);
    console.log(`  Has Claim Record: ${a.has_claim_record}`);
    console.log(`  Has Components: ${a.has_components}`);
    console.log(`  Has Photos: ${a.has_photos}`);
    
    if (a.pipeline_run_summary) {
      const summary = typeof a.pipeline_run_summary === 'string' 
        ? JSON.parse(a.pipeline_run_summary) 
        : a.pipeline_run_summary;
      console.log(`\n  Pipeline Run Summary:`);
      if (Array.isArray(summary)) {
        for (const stage of summary) {
          const status = stage.status || stage.result || 'unknown';
          const error = stage.error || stage.errorMessage || '';
          console.log(`    Stage ${stage.stage || stage.name || stage.id}: ${status} ${stage.duration ? `(${stage.duration}ms)` : ''} ${error ? `ERROR: ${error}` : ''}`);
        }
      } else {
        console.log(`    ${JSON.stringify(summary).slice(0, 2000)}`);
      }
    }
  }
  
  // Also check the ingestion documents for this claim
  console.log("\n=== INGESTION DOCUMENTS FOR CLAIM 6090046 ===");
  const [docs] = await db.execute(sql`
    SELECT id, file_name, file_type, file_size, status, s3_key, created_at
    FROM ingestion_documents WHERE claim_id = 6090046
  `);
  for (const d of docs as any[]) {
    console.log(`  Doc ${d.id}: ${d.file_name} | ${d.file_type} | ${d.file_size} bytes | Status: ${d.status} | ${d.created_at}`);
  }
  
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
