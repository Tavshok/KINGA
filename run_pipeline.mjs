/**
 * Direct Pipeline Runner
 * Calls triggerAiAssessment for claim 2220001 (Toyota Fortuner)
 * by importing the server module directly.
 */
import { createRequire } from 'module';

// We need to use tsx to run TypeScript directly
// This script is meant to be run with: npx tsx run_pipeline.mjs
// But since we can't import TS directly from mjs, we'll use the HTTP approach
// with a special internal endpoint

// Instead, let's call the internal endpoint that bypasses auth
const CLAIM_ID = 2220001;

console.log(`Triggering AI pipeline for claim ${CLAIM_ID}...`);

// Try calling the internal admin endpoint
const response = await fetch('http://localhost:3000/api/internal/trigger-pipeline', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Internal-Key': process.env.JWT_SECRET || 'internal' },
  body: JSON.stringify({ claimId: CLAIM_ID }),
});

if (response.ok) {
  const data = await response.json();
  console.log('✅ Pipeline triggered:', JSON.stringify(data, null, 2));
} else {
  const text = await response.text();
  console.log('❌ HTTP error:', response.status, text.slice(0, 200));
  console.log('\nFalling back to direct DB trigger...');
  
  // Check if the claim exists and has source_document_id
  const mysql = await import('mysql2/promise');
  const db = await mysql.default.createConnection(process.env.DATABASE_URL);
  const [claim] = await db.execute('SELECT id, source_document_id, ai_assessment_triggered, document_processing_status FROM claims WHERE id = ?', [CLAIM_ID]);
  console.log('Claim state:', JSON.stringify(claim[0], null, 2));
  await db.end();
}
