/**
 * AI Pipeline Trigger Script
 * Generates a valid session JWT and calls triggerAiAssessment for claim 2220001
 */
import { SignJWT } from 'jose';

const CLAIM_ID = 2220001;
const OWNER_OPEN_ID = process.env.OWNER_OPEN_ID;
const APP_ID = process.env.VITE_APP_ID;
const JWT_SECRET = process.env.JWT_SECRET;
const COOKIE_NAME = 'app_session_id';

if (!OWNER_OPEN_ID || !APP_ID || !JWT_SECRET) {
  console.error('❌ Missing required env vars');
  process.exit(1);
}

// Create a valid session JWT
const secretKey = new TextEncoder().encode(JWT_SECRET);
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const expirationSeconds = Math.floor((Date.now() + ONE_YEAR_MS) / 1000);

const sessionToken = await new SignJWT({
  openId: OWNER_OPEN_ID,
  appId: APP_ID,
  name: 'Tavonga Shoko',
})
  .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
  .setExpirationTime(expirationSeconds)
  .sign(secretKey);

console.log('✅ Session token created');

// Call the triggerAiAssessment endpoint
console.log(`\n🚀 Triggering AI pipeline for claim ${CLAIM_ID}...`);

const response = await fetch(`http://localhost:3000/api/trpc/claims.triggerAiAssessment`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Cookie': `${COOKIE_NAME}=${sessionToken}`,
  },
  body: JSON.stringify({ json: { claimId: CLAIM_ID } }),
});

const responseText = await response.text();
console.log(`HTTP Status: ${response.status}`);

if (response.ok) {
  try {
    const data = JSON.parse(responseText);
    console.log('✅ Pipeline triggered successfully!');
    console.log('Response:', JSON.stringify(data, null, 2).slice(0, 500));
  } catch {
    console.log('Response:', responseText.slice(0, 500));
  }
} else {
  console.log('❌ Error response:', responseText.slice(0, 500));
}

console.log('\n📊 The pipeline is now running in the background.');
console.log('Check the server logs for progress, or poll the claim status.');
console.log(`\nCheck status: GET /api/trpc/claims.getClaimById?input={"json":{"id":${CLAIM_ID}}}`);
