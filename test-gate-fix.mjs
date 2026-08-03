/**
 * Gate fix verification script.
 * Finds the most recently blocked document_failed claim with a sourceDocumentId,
 * resets it to assessment_in_progress, and triggers the pipeline.
 * Watches the gate result for 90 seconds.
 */
import { createConnection } from 'mysql2/promise';

const conn = await createConnection(process.env.DATABASE_URL);

// 1. Find a recently blocked document_failed claim with a source document
const [rows] = await conn.execute(`
  SELECT c.id, c.claim_reference, c.status, c.source_document_id, c.ai_assessment_triggered,
         d.s3_key, d.s3_url
  FROM claims c
  JOIN ingestion_documents d ON d.id = c.source_document_id
  WHERE c.status = 'document_failed'
    AND c.source_document_id IS NOT NULL
    AND d.s3_url IS NOT NULL
  ORDER BY c.updated_at DESC
  LIMIT 1
`);

if (!rows.length) {
  console.log('No document_failed claims with source documents found.');
  await conn.end();
  process.exit(0);
}

const claim = rows[0];
console.log(`\n=== TEST CLAIM ===`);
console.log(`ID: ${claim.id}`);
console.log(`Reference: ${claim.claim_reference}`);
console.log(`Status: ${claim.status}`);
console.log(`AI assessment triggered: ${claim.ai_assessment_triggered}`);
console.log(`Source document S3 key: ${claim.s3_key}`);

// 2. Reset the claim to assessment_in_progress and clear pipeline_attempts
await conn.execute(`
  UPDATE claims
  SET status = 'assessment_in_progress',
      document_processing_status = 'PROCESSING',
      ai_assessment_triggered = 0,
      updated_at = NOW()
  WHERE id = ?
`, [claim.id]);
console.log(`\n✓ Reset claim ${claim.id} to assessment_in_progress`);

await conn.end();

// 3. Trigger the pipeline via the internal triggerAiAssessment function
console.log(`\n=== TRIGGERING PIPELINE ===`);
const { triggerAiAssessment } = await import('./server/db.ts');
console.log(`Calling triggerAiAssessment(${claim.id})...`);

try {
  const result = await triggerAiAssessment(claim.id);
  console.log(`\n=== GATE RESULT ===`);
  if (result?.gateResult) {
    console.log(`Score: ${result.gateResult.overallScore}%`);
    console.log(`Decision: ${result.gateResult.decision}`);
    console.log(`May proceed: ${result.gateResult.mayProceed}`);
    console.log(`Failure modes: ${result.gateResult.detectedFailureModes.join(', ') || 'none'}`);
    console.log(`Summary: ${result.gateResult.summary}`);
  } else {
    console.log('Result:', JSON.stringify(result, null, 2).substring(0, 500));
  }
} catch (err) {
  console.error('Pipeline error:', err.message);
}
