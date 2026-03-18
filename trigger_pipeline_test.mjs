/**
 * Pipeline Test Trigger
 * Creates a new claim linked to the Toyota Fortuner ingestion document (id=510001)
 * and calls the triggerAiAssessment function to run the full pipeline.
 */
import mysql from 'mysql2/promise';

const db = await mysql.createConnection(process.env.DATABASE_URL);

// Use the Toyota Fortuner document (id=510001, AGA3895)
const DOC_ID = 510001;
const TENANT_ID = 1771335377063;

// Check the document exists and has S3 URL
const [docs] = await db.execute('SELECT * FROM ingestion_documents WHERE id = ?', [DOC_ID]);
if (!docs.length || !docs[0].s3_url) {
  console.error('❌ Document not found or no S3 URL');
  await db.end();
  process.exit(1);
}
console.log('✅ Document found:', docs[0].original_filename);
console.log('   S3 URL:', docs[0].s3_url.slice(0, 80) + '...');

// Get the first real user (processor) to assign the claim to
const [users] = await db.execute('SELECT id, name, role FROM users LIMIT 5');
console.log('Available users:', JSON.stringify(users));
const processor = users[0];
if (!processor) {
  console.error('❌ No users found');
  await db.end();
  process.exit(1);
}
console.log('✅ Using processor:', processor.name, '(id:', processor.id + ')');

// Generate a claim number
const claimNumber = `KINGA-TEST-${Date.now()}`;

// Insert a new claim linked to the ingestion document
const [insertResult] = await db.execute(`
  INSERT INTO claims (
    claimant_id, claim_number, tenant_id, status, workflow_state,
    source_document_id, claim_source, document_processing_status,
    assigned_processor_id, priority, early_fraud_suspicion,
    ai_assessment_triggered, ai_assessment_completed,
    vehicle_registration, created_at, updated_at
  ) VALUES (
    0, ?, ?, 'intake_pending', 'intake_queue',
    ?, 'document_ingestion', 'pending',
    ?, 'medium', 0,
    0, 0,
    'AGA3895', NOW(), NOW()
  )
`, [claimNumber, TENANT_ID, DOC_ID, processor.id]);

const claimId = insertResult.insertId;
console.log(`✅ Created claim id=${claimId}, claimNumber=${claimNumber}`);

// Update the ingestion document to point back to this claim
await db.execute('UPDATE ingestion_documents SET historical_claim_id = ? WHERE id = ?', [claimId, DOC_ID]);
console.log(`✅ Linked ingestion document ${DOC_ID} → claim ${claimId}`);

await db.end();

console.log('\n══════════════════════════════════════════════════════════════');
console.log('PIPELINE TRIGGER READY');
console.log('══════════════════════════════════════════════════════════════');
console.log(`Claim ID: ${claimId}`);
console.log(`Claim Number: ${claimNumber}`);
console.log(`Document: UNTU MICROFINANCE TOYOTA FORTUNER AGA3895`);
console.log('\nNow call the AI assessment via the API:');
console.log(`  POST /api/trpc/claims.triggerAiAssessment`);
console.log(`  Body: { "claimId": ${claimId} }`);
console.log('\nOr navigate to:');
console.log(`  /insurer/claims/${claimId}/comparison`);
console.log('  Then click "Re-run AI Assessment"');
