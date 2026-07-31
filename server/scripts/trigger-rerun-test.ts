/**
 * trigger-rerun-test.ts
 *
 * Creates a valid session token for the owner user and triggers a full pipeline
 * re-run on claim 6240003 (ISUZU MUX, 2 quotes) to test the hardened quote
 * line item extraction end-to-end.
 *
 * Run with: npx tsx server/trigger-rerun-test.ts
 */

import { sdk } from './_core/sdk';
import { COOKIE_NAME } from '../shared/const';

const CLAIM_ID = 6240003;
const BASE_URL = 'http://localhost:3000';

// Owner open ID from env
const OWNER_OPEN_ID = process.env.OWNER_OPEN_ID ?? '';
if (!OWNER_OPEN_ID) {
  console.error('OWNER_OPEN_ID not set in environment');
  process.exit(1);
}

async function main() {
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  KINGA Pipeline Re-Run Test — Claim', CLAIM_ID);
  console.log('══════════════════════════════════════════════════════════\n');

  // 1. Create a session token for the owner user
  console.log('Creating session token for owner:', OWNER_OPEN_ID);
  const sessionToken = await sdk.createSessionToken(OWNER_OPEN_ID);
  console.log('Session token created:', sessionToken ? '✅' : '❌');

  // 2. Call the tRPC triggerRerun mutation via HTTP
  const trpcUrl = `${BASE_URL}/api/trpc/aiAnalysis.triggerRerun`;
  console.log('\nTriggering pipeline re-run on claim', CLAIM_ID, '...');

  const response = await fetch(trpcUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': `${COOKIE_NAME}=${sessionToken}`,
    },
    body: JSON.stringify({
      json: {
        claimId: CLAIM_ID,
        reason: 'Quote line item hardening test — verifying NON_PART passthrough and multi-quote persistence',
      },
    }),
  });

  const responseText = await response.text();
  console.log('HTTP Status:', response.status);

  let parsed: any;
  try {
    parsed = JSON.parse(responseText);
  } catch {
    console.log('Raw response:', responseText.slice(0, 500));
    return;
  }

  if (parsed?.result?.data?.json) {
    const data = parsed.result.data.json;
    console.log('\nRe-run triggered successfully:');
    console.log('  status:', data.status);
    console.log('  message:', data.message);
    console.log('  assessmentId:', data.assessmentId);
    console.log('\n⏳ Pipeline is now running asynchronously.');
    console.log('   Watch server logs for: [KINGA Assessment] Claim 6240003');
    console.log('   Key log lines to look for:');
    console.log('   - "Persisting N quote(s) with line items"');
    console.log('   - "Quote[0] ... → panel_beater_quotes id=..."');
    console.log('   - "Quote[1] ... → panel_beater_quotes id=..."');
  } else if (parsed?.error) {
    console.error('\n❌ tRPC error:', JSON.stringify(parsed.error, null, 2));
  } else {
    console.log('\nUnexpected response:', JSON.stringify(parsed, null, 2).slice(0, 500));
  }
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
