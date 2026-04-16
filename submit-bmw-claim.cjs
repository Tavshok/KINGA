/**
 * Submit BMW 318i ADP6423 claim directly to the database
 * and trigger the AI assessment pipeline via the internal API.
 */
const mysql = require('mysql2/promise');

const PDF_URL = 'https://files.manuscdn.com/user_upload_by_module/session_file/310419663031527958/WWLhJworwBSkAGnb.pdf';
const OWNER_USER_ID = 1;
const DB_URL = process.env.DATABASE_URL;

async function main() {
  const conn = await mysql.createConnection(DB_URL);

  // Check if a fresh claim already exists
  const [existing] = await conn.execute(
    `SELECT id, claim_number, status, document_processing_status FROM claims 
     WHERE vehicle_registration = 'ADP6423' AND claim_number LIKE 'BMW318I-ADP6423-%'
     ORDER BY created_at DESC LIMIT 1`
  );
  
  if (existing.length > 0) {
    console.log('Found existing fresh claim:', JSON.stringify(existing[0]));
    await conn.end();
    return existing[0].id;
  }

  const claimNumber = 'BMW318I-ADP6423-' + Date.now();
  console.log('Creating new claim:', claimNumber);

  // Insert the claim record using correct column names
  const [result] = await conn.execute(
    `INSERT INTO claims (
      claim_number, status, document_processing_status, ai_assessment_triggered,
      incident_type, vehicle_registration, claimant_id,
      source_document_id, claim_source,
      created_at, updated_at
    ) VALUES (?, 'intake_pending', 'pending', 0, 'motor_vehicle', 'ADP6423', ?, NULL, 'pdf_upload', NOW(), NOW())`,
    [claimNumber, OWNER_USER_ID]
  );

  const claimId = result.insertId;
  console.log('Created claim ID:', claimId);

  // Insert into ingestion_documents
  const [docResult] = await conn.execute(
    `INSERT INTO ingestion_documents (claim_id, document_type, s3_url, processing_status, created_at, updated_at)
     VALUES (?, 'claim_form_pdf', ?, 'pending', NOW(), NOW())`,
    [claimId, PDF_URL]
  );
  const docId = docResult.insertId;
  console.log('Created ingestion document ID:', docId);

  // Link the document back to the claim
  await conn.execute(
    `UPDATE claims SET source_document_id = ? WHERE id = ?`,
    [docId, claimId]
  );

  await conn.end();
  return claimId;
}

main().then(id => {
  console.log('CLAIM_ID=' + id);
}).catch(err => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
