import "dotenv/config";
import { getDb } from '../db';
import { sql } from 'drizzle-orm';

async function main() {
  const db = await getDb();

  // 1. Check claim_documents
  const docs = await db.execute(sql`
    SELECT id, claim_id, file_name, file_url, document_category, created_at
    FROM claim_documents
    WHERE claim_id = 10719902
    ORDER BY created_at DESC
    LIMIT 10
  `);
  console.log('\n=== CLAIM DOCUMENTS ===');
  console.log(JSON.stringify(docs, null, 2));

  // 2. Check ingestion_documents
  const ingestion = await db.execute(sql`
    SELECT id, claim_id, file_name, file_url, status, created_at
    FROM ingestion_documents
    WHERE claim_id = 10719902
    ORDER BY created_at DESC
    LIMIT 10
  `);
  console.log('\n=== INGESTION DOCUMENTS ===');
  console.log(JSON.stringify(ingestion, null, 2));

  // 3. Check the claims table for the document_url field
  const claim = await db.execute(sql`
    SELECT id, claim_reference, document_url, claim_pack_url, created_at
    FROM claims
    WHERE id = 10719902
    LIMIT 1
  `);
  console.log('\n=== CLAIM DOCUMENT URL ===');
  console.log(JSON.stringify(claim, null, 2));

  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
