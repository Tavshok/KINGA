/**
 * trigger-bmw-now.mjs
 * Signs a JWT using the same logic as sdk.ts and calls claims.triggerAiAssessment
 * for claim 4380001 (BMW 318i ADP6423).
 */
import { SignJWT } from 'jose';

const JWT_SECRET = process.env.JWT_SECRET;
const APP_ID = process.env.VITE_APP_ID;
const OWNER_OPEN_ID = process.env.OWNER_OPEN_ID;
const OWNER_NAME = process.env.OWNER_NAME || 'Owner';
const CLAIM_ID = 4380001;
const BASE_URL = 'http://localhost:3000';

if (!JWT_SECRET || !APP_ID || !OWNER_OPEN_ID) {
  console.error('Missing required env vars: JWT_SECRET, VITE_APP_ID, OWNER_OPEN_ID');
  process.exit(1);
}

// Sign a JWT using the same algorithm as sdk.ts
const secretKey = new TextEncoder().encode(JWT_SECRET);
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const expirationSeconds = Math.floor((Date.now() + ONE_YEAR_MS) / 1000);

const token = await new SignJWT({
  openId: OWNER_OPEN_ID,
  appId: APP_ID,
  name: OWNER_NAME,
})
  .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
  .setExpirationTime(expirationSeconds)
  .sign(secretKey);

console.log('[trigger] JWT signed successfully');

// Cookie name from shared/const.ts
const cookieName = 'app_session_id';
console.log(`[trigger] Using cookie: ${cookieName}`);

// Call claims.triggerAiAssessment via tRPC
console.log(`[trigger] Calling claims.triggerAiAssessment for claim ${CLAIM_ID}...`);
const response = await fetch(`${BASE_URL}/api/trpc/claims.triggerAiAssessment`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Cookie': `${cookieName}=${token}`,
  },
  body: JSON.stringify({ json: { claimId: CLAIM_ID } }),
});

const text = await response.text();
console.log(`[trigger] HTTP ${response.status}`);
console.log('[trigger] Response:', text.substring(0, 500));

if (response.ok) {
  console.log('\n[trigger] Pipeline triggered successfully! Monitoring...');
  
  // Poll the claim status every 15 seconds for up to 10 minutes
  const mysql = await import('mysql2/promise');
  const conn = await mysql.default.createConnection(process.env.DATABASE_URL);
  
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 15000));
    const [rows] = await conn.execute(
      'SELECT status, document_processing_status, ai_assessment_completed FROM claims WHERE id = ?',
      [CLAIM_ID]
    );
    const claim = rows[0];
    console.log(`[monitor] ${new Date().toISOString()} — status: ${claim.status}, dps: ${claim.document_processing_status}, completed: ${claim.ai_assessment_completed}`);
    
    if (claim.ai_assessment_completed === 1 || claim.status === 'assessment_complete') {
      console.log('\n[monitor] Pipeline COMPLETED successfully!');
      
      // Get the assessment summary
      const [assessments] = await conn.execute(
        'SELECT id, recommendation, fraud_score, estimated_cost, data_completeness_score FROM ai_assessments WHERE claim_id = ? ORDER BY id DESC LIMIT 1',
        [CLAIM_ID]
      );
      if (assessments[0]) {
        console.log('[result] Assessment:', JSON.stringify(assessments[0], null, 2));
      }
      await conn.end();
      process.exit(0);
    }
    
    if (claim.document_processing_status === 'failed') {
      console.log('\n[monitor] Pipeline FAILED — checking error...');
      const [assessments] = await conn.execute(
        'SELECT id, pipeline_error FROM ai_assessments WHERE claim_id = ? ORDER BY id DESC LIMIT 1',
        [CLAIM_ID]
      );
      if (assessments[0]) {
        console.log('[error] Assessment error:', assessments[0].pipeline_error);
      }
      await conn.end();
      process.exit(1);
    }
  }
  
  console.log('[monitor] Timed out after 10 minutes');
  await conn.end();
} else {
  console.error('[trigger] Failed to trigger pipeline');
  process.exit(1);
}
