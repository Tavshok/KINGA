/**
 * trigger-rerun-direct.ts
 *
 * Directly invokes triggerAIAnalysis for claim 6240003 (ISUZU MUX, 2 quotes)
 * using user ID 1 (Tavonga Shoko, claims_processor, tenant-1771335377063).
 *
 * Run with: npx tsx server/trigger-rerun-direct.ts
 */

import { triggerAIAnalysis } from './ai-rerun-service';

const CLAIM_ID = 6240003;
const USER_ID = 1;
const USER_ROLE = 'claims_processor';
const TENANT_ID = 'tenant-1771335377063';

async function main() {
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  KINGA Pipeline Re-Run — Claim', CLAIM_ID, '(ISUZU MUX, 2 quotes)');
  console.log('══════════════════════════════════════════════════════════\n');
  console.log('User:', USER_ID, '|', USER_ROLE, '| Tenant:', TENANT_ID);
  console.log('Triggering pipeline re-run...\n');

  try {
    const result = await triggerAIAnalysis(
      CLAIM_ID,
      USER_ID,
      USER_ROLE,
      TENANT_ID,
      'Quote line item hardening test — verifying NON_PART passthrough and multi-quote persistence'
    );
    console.log('✅ Re-run triggered successfully:');
    console.log(JSON.stringify(result, null, 2));
    console.log('\n⏳ Pipeline is now running asynchronously.');
    console.log('   Watch server logs for: [KINGA Assessment] Claim', CLAIM_ID);
    console.log('   Key log lines to look for:');
    console.log('   - "Persisting N quote(s) with line items"');
    console.log('   - "Quote[0] ... → panel_beater_quotes id=..."');
    console.log('   - "Quote[1] ... → panel_beater_quotes id=..."');
  } catch (err: any) {
    console.error('❌ Error:', err.message ?? err);
    if (err.code) console.error('   Code:', err.code);
  }
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
