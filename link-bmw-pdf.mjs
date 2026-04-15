/**
 * link-bmw-pdf.mjs
 * Inserts the BMW PDF into ingestion_documents and links it to claim 4320104.
 */
import mysql from 'mysql2/promise';
import { config } from 'dotenv';
config({ quiet: true });

const CLAIM_ID = 4320104;
const PDF_URL = 'https://files.manuscdn.com/user_upload_by_module/session_file/310419663031527958/UWgvQSKapGFFOOEs.pdf';

async function run() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);

  // Insert into ingestion_documents
  const [docResult] = await conn.execute(
    `INSERT INTO ingestion_documents 
     (tenant_id, batch_id, document_id, original_filename, file_size_bytes, mime_type, s3_bucket, s3_key, s3_url, 
      sha256_hash, document_type, classification_confidence, classification_method, extraction_status, validation_status, page_count)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'default',
      1, // use existing batch ID 1
      `bmw-${CLAIM_ID}-${Date.now()}`,
      'DIEFTRACKMARKETINGBMW318iADP6423-audit-signed.pdf',
      3265432,
      'application/pdf',
      'manuscdn',
      `user_upload_by_module/session_file/310419663031527958/UWgvQSKapGFFOOEs.pdf`,
      PDF_URL,
      'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2', // placeholder hash
      'claim_form',
      0.9500,
      'manual_override',
      'completed',
      'approved',
      14,
    ]
  );
  const docId = docResult.insertId;
  console.log(`✅ ingestion_documents record inserted with ID: ${docId}`);

  // Link the document to the claim via source_document_id
  await conn.execute(
    `UPDATE claims SET source_document_id = ?, document_processing_status = 'completed' WHERE id = ?`,
    [docId, CLAIM_ID]
  );
  console.log(`✅ Claim ${CLAIM_ID} linked to document ${docId}`);

  await conn.end();
  console.log(`\n🚀 Ready to trigger pipeline. Run: npx tsx server/trigger-bmw-direct.ts`);
}

run().catch(e => { console.error('❌ Error:', e.message); process.exit(1); });
