// @ts-nocheck
import { getDb } from "../server/db";
import { sql } from "drizzle-orm";

async function main() {
  const db = await getDb();
  
  // Find ALL recent claims ordered by ID desc
  const [claims] = await db.execute(sql`
    SELECT id, claim_number, kinga_ref, tenant_id, source_document_id, 
           claim_source, workflow_state, ai_assessment_triggered,
           ai_assessment_completed, created_at,
           LEFT(external_assessment_url, 100) as ext_url,
           LEFT(damage_photos, 100) as photos_preview
    FROM claims 
    ORDER BY id DESC 
    LIMIT 20
  `);
  
  console.log("=== RECENT CLAIMS (newest first) ===\n");
  for (const c of claims as any[]) {
    console.log(`Claim ${c.id} | ${c.claim_number} | ${c.kinga_ref || 'no-ref'}`);
    console.log(`  tenant: ${c.tenant_id} | source: ${c.claim_source} | state: ${c.workflow_state}`);
    console.log(`  sourceDocId: ${c.source_document_id} | aiTriggered: ${c.ai_assessment_triggered} | aiDone: ${c.ai_assessment_completed}`);
    console.log(`  created: ${c.created_at}`);
    console.log(`  extUrl: ${c.ext_url || 'NULL'}`);
    console.log(`  photos: ${c.photos_preview || 'NULL'}`);
    console.log('');
  }
  
  // Check ingestion_documents table columns
  const [cols] = await db.execute(sql`SHOW COLUMNS FROM ingestion_documents`);
  console.log("\n=== INGESTION_DOCUMENTS COLUMNS ===");
  for (const c of cols as any[]) {
    console.log(`  ${c.Field} (${c.Type}) ${c.Null === 'YES' ? 'nullable' : 'NOT NULL'} ${c.Default ? 'default=' + c.Default : ''}`);
  }
  
  // Check recent ingestion documents
  const [docs] = await db.execute(sql`
    SELECT id, tenant_id, original_filename, s3_url, s3_key, 
           extraction_status, historical_claim_id, file_size_bytes, created_at
    FROM ingestion_documents 
    ORDER BY id DESC 
    LIMIT 10
  `);
  
  console.log("\n=== RECENT INGESTION DOCUMENTS ===");
  for (const d of docs as any[]) {
    console.log(`Doc ${d.id} | ${d.original_filename} | ${d.extraction_status} | claim=${d.historical_claim_id}`);
    console.log(`  tenant: ${d.tenant_id} | size: ${d.file_size_bytes} | created: ${d.created_at}`);
    console.log(`  s3_url: ${d.s3_url ? d.s3_url.substring(0, 100) : 'NULL'}`);
    console.log('');
  }
  
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
