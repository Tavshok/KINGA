/**
 * Utility: check claim 6450001 status and trigger pipeline if needed
 * Run: npx tsx server/check-claim-status.ts
 */
import { createConnection } from 'mysql2/promise';

async function main() {
  const conn = await createConnection(process.env.DATABASE_URL as string);
  
  // Check claim status
  const [claims] = await conn.query(
    'SELECT id, status, claim_reference, vehicle_make, vehicle_model FROM claims WHERE id = 6450001'
  ) as any[];
  console.log('Claim:', JSON.stringify(claims, null, 2));
  
  // Check assessments
  const [asses] = await conn.query(
    'SELECT id, claim_id, created_at, CHAR_LENGTH(claim_truth_json) as ctlLen, decision_authority_json IS NOT NULL as hasDecision FROM ai_assessments WHERE claim_id = 6450001 ORDER BY created_at DESC LIMIT 3'
  ) as any[];
  console.log('Assessments:', JSON.stringify(asses, null, 2));
  
  // If claim is intake_pending, reset it to trigger pipeline
  if (claims[0]?.status === 'intake_pending') {
    console.log('Claim is intake_pending — pipeline will pick it up automatically');
  } else if (claims[0]?.status === 'completed' || claims[0]?.status === 'assessed') {
    console.log('Claim already processed — resetting to intake_pending for fresh run...');
    await conn.query("UPDATE claims SET status = 'intake_pending' WHERE id = 6450001");
    console.log('Reset done. Pipeline will pick it up on next cycle.');
  } else {
    console.log(`Claim status: ${claims[0]?.status}`);
  }
  
  await conn.end();
}

main().catch(console.error);
