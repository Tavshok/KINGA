// Trigger the AI assessment pipeline for the Voltron claim
// Run from: /home/ubuntu/kinga-replit/
// Usage: node trigger_pipeline_run.mjs

import { SignJWT } from 'jose';

const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_OPEN_ID = 'YihPnA7MJmAvNyMeTe2HUX';
const APP_ID = process.env.VITE_APP_ID || '';
const CLAIM_ID = 6930001;

if (!JWT_SECRET) {
  console.error('JWT_SECRET not set');
  process.exit(1);
}

// Create a session token matching the SDK's signSession format
const secretKey = new TextEncoder().encode(JWT_SECRET);
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const issuedAt = Date.now();
const expirationSeconds = Math.floor((issuedAt + ONE_YEAR_MS) / 1000);

const token = await new SignJWT({
  openId: ADMIN_OPEN_ID,
  appId: APP_ID,
  name: 'Admin',
})
  .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
  .setExpirationTime(expirationSeconds)
  .sign(secretKey);

console.log('Token created, triggering pipeline for claim', CLAIM_ID);

// Call the tRPC mutation
const response = await fetch('http://localhost:3000/api/trpc/claims.triggerAiAssessment', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Cookie': `app_session_id=${token}`,
  },
  body: JSON.stringify({
    json: { claimId: CLAIM_ID }
  }),
});

const text = await response.text();
console.log('Response status:', response.status);
console.log('Response body:', text.substring(0, 1000));
