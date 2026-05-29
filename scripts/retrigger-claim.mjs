// Script to trigger the AI assessment pipeline for a claim
// Uses the same JWT signing logic as the server auth

import { SignJWT } from 'jose';
import { createConnection } from 'mysql2/promise';

const JWT_SECRET = process.env.JWT_SECRET;
const VITE_APP_ID = process.env.VITE_APP_ID;
const CLAIM_ID = 6930001;

if (!JWT_SECRET) {
  console.error('JWT_SECRET not set');
  process.exit(1);
}

// Create a session token for the admin user
const secretKey = new TextEncoder().encode(JWT_SECRET);
const token = await new SignJWT({
  openId: 'YihPnA7MJmAvNyMeTe2HUX',
  appId: VITE_APP_ID || 'YbS42LwGroxbVepAMjk4bS',
  name: 'Tavonga Shoko',
})
  .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
  .setExpirationTime('1h')
  .sign(secretKey);

console.log('[RETRIGGER] Session token created, triggering pipeline for claim', CLAIM_ID);

// Call the tRPC endpoint
const response = await fetch('http://localhost:3000/api/trpc/claims.triggerAiAssessment', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Cookie': `app_session_id=${token}`,
  },
  body: JSON.stringify({ json: { claimId: CLAIM_ID, reason: 'Manual retrigger to verify fix' } }),
});

const text = await response.text();
console.log('[RETRIGGER] Response status:', response.status);
console.log('[RETRIGGER] Response:', text.slice(0, 500));
