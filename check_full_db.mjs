import { createConnection } from 'mysql2/promise';
const conn = await createConnection(process.env.DATABASE_URL);

// Get all assessments for the BT50 claim
const [rows] = await conn.execute(
  'SELECT id, claim_id, created_at, cost_intelligence_json FROM ai_assessments ORDER BY id DESC LIMIT 10'
);

for (const row of rows) {
  const cij = row.cost_intelligence_json ? JSON.parse(row.cost_intelligence_json) : null;
  console.log(`\nAssessment ${row.id} | claim: ${row.claim_id} | created: ${row.created_at}`);
  if (cij) {
    console.log('  documentedOriginalQuoteUsd:', cij.documentedOriginalQuoteUsd);
    console.log('  documentedAgreedCostUsd:', cij.documentedAgreedCostUsd);
    console.log('  panelBeaterName:', cij.panelBeaterName);
    console.log('  totalExpectedCents:', cij.totalExpectedCents);
    console.log('  totalExpectedUsd:', cij.totalExpectedUsd);
    console.log('  repairQuoteUsd:', cij.repairQuoteUsd);
  } else {
    console.log('  No cost_intelligence_json');
  }
}

// Also check which claim IDs exist
const [claims] = await conn.execute(
  'SELECT id, claim_reference, created_at FROM claims ORDER BY id DESC LIMIT 10'
);
console.log('\n=== Claims ===');
for (const c of claims) {
  console.log(`  ${c.id} | ${c.claim_reference} | ${c.created_at}`);
}

await conn.end();
