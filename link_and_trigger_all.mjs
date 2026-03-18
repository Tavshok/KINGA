/**
 * Link all ingestion documents to real claims and trigger AI pipeline on each.
 * 
 * This script:
 * 1. Finds all ingestion documents whose historical_claim_id points to non-existent claims
 * 2. Creates new claims for those documents
 * 3. Triggers the AI pipeline on all claims that have source_document_id set
 */
import mysql from 'mysql2/promise';
import { SignJWT } from 'jose';

const db = await mysql.createConnection(process.env.DATABASE_URL);

// Get all ingestion documents
const [docs] = await db.execute('SELECT id, original_filename, historical_claim_id, s3_url FROM ingestion_documents ORDER BY id');

// Get all existing claim IDs
const [existingClaims] = await db.execute('SELECT id, source_document_id, ai_assessment_completed FROM claims');
const existingIds = new Set(existingClaims.map(c => c.id));

console.log(`Total ingestion docs: ${docs.length}`);
console.log(`Total claims: ${existingClaims.length}`);

// Find orphaned documents (historical_claim_id points to non-existent claim)
const orphaned = docs.filter(d => d.historical_claim_id && !existingIds.has(d.historical_claim_id));
const unlinked = docs.filter(d => !d.historical_claim_id);

console.log(`Orphaned docs (claim missing): ${orphaned.length}`);
console.log(`Unlinked docs (no claim ID): ${unlinked.length}`);

// Get admin user for assignment
const [users] = await db.execute('SELECT id FROM users WHERE role = "admin" LIMIT 1');
const adminId = users[0]?.id || 1;

// Get tenant ID from existing claims
const [tenantRow] = await db.execute('SELECT tenant_id FROM claims WHERE tenant_id IS NOT NULL LIMIT 1');
const TENANT_ID = tenantRow[0]?.tenant_id || '1771335377063';

// Create new claims for orphaned and unlinked documents
const docsToProcess = [...orphaned, ...unlinked];
console.log(`\nCreating ${docsToProcess.length} new claims for orphaned/unlinked documents...`);

const newClaimIds = [];

for (const doc of docsToProcess) {
  // Extract vehicle registration from filename if possible
  const regMatch = doc.original_filename?.match(/\b([A-Z]{2,3}\s?\d{3,4})\b/);
  const vehicleReg = regMatch ? regMatch[1].replace(/\s/g, '') : `DOC${doc.id}`;
  
  const claimNumber = `KINGA-${Date.now()}-${doc.id}`;
  
  try {
    const [result] = await db.execute(`
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
        ?, NOW(), NOW()
      )
    `, [claimNumber, TENANT_ID, doc.id, adminId, vehicleReg]);
    
    const claimId = result.insertId;
    
    // Update ingestion document to point to new claim
    await db.execute('UPDATE ingestion_documents SET historical_claim_id = ? WHERE id = ?', [claimId, doc.id]);
    
    newClaimIds.push(claimId);
    console.log(`✅ Created claim ${claimId} (${claimNumber}) for doc ${doc.id}: ${doc.original_filename?.slice(0, 50)}`);
  } catch (err) {
    console.error(`❌ Failed to create claim for doc ${doc.id}:`, err.message);
  }
}

// Now get ALL claims with source_document_id that haven't been AI-assessed
const [pendingClaims] = await db.execute(`
  SELECT id, vehicle_registration, source_document_id, ai_assessment_completed, status
  FROM claims 
  WHERE source_document_id IS NOT NULL 
  AND ai_assessment_completed = 0
  ORDER BY id
`);

console.log(`\n=== Claims ready for AI pipeline: ${pendingClaims.length} ===`);
pendingClaims.forEach(c => {
  console.log(`  Claim ${c.id} | reg: ${c.vehicle_registration} | doc: ${c.source_document_id} | status: ${c.status}`);
});

await db.end();

// Generate auth token
const secretKey = new TextEncoder().encode(process.env.JWT_SECRET);
const sessionToken = await new SignJWT({
  openId: process.env.OWNER_OPEN_ID,
  appId: process.env.VITE_APP_ID,
  name: 'Tavonga Shoko',
})
  .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
  .setExpirationTime(Math.floor(Date.now() / 1000) + 3600)
  .sign(secretKey);

// Trigger AI pipeline for each pending claim (one at a time to avoid overloading)
console.log('\n=== Triggering AI pipeline for all pending claims ===');

for (const claim of pendingClaims) {
  console.log(`\n🚀 Triggering pipeline for claim ${claim.id} (${claim.vehicle_registration})...`);
  
  try {
    const response = await fetch('http://localhost:3000/api/trpc/claims.triggerAiAssessment', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `app_session_id=${sessionToken}`,
      },
      body: JSON.stringify({ json: { claimId: claim.id } }),
    });
    
    if (response.ok) {
      console.log(`  ✅ Pipeline triggered for claim ${claim.id}`);
    } else {
      const text = await response.text();
      console.log(`  ❌ Error for claim ${claim.id}: ${response.status} - ${text.slice(0, 100)}`);
    }
    
    // Small delay between triggers to avoid overwhelming the server
    await new Promise(r => setTimeout(r, 2000));
  } catch (err) {
    console.error(`  ❌ Failed to trigger claim ${claim.id}:`, err.message);
  }
}

console.log('\n✅ All pipelines triggered! Check server logs for progress.');
console.log('Claims will complete in the background (typically 30-120 seconds each).');
