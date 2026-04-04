import { createConnection } from 'mysql2/promise';
const conn = await createConnection(process.env.DATABASE_URL);

// Check which claim IDs are linked to which assessments
const [rows] = await conn.execute(
  'SELECT a.id as assessment_id, a.claim_id, a.created_at, c.id as claim_id2 FROM ai_assessments a LEFT JOIN claims c ON a.claim_id = c.id ORDER BY a.id DESC LIMIT 10'
);
console.log('Assessment → Claim mapping:');
for (const r of rows) {
  console.log(`  Assessment ${r.assessment_id} → claim_id ${r.claim_id} (claim exists: ${r.claim_id2 ? 'YES' : 'NO'})`);
}

// Check if claim 3030001 exists and what its reference is
const [claims] = await conn.execute(
  'SELECT id, tenant_id, status, created_at FROM claims WHERE id IN (3030001, 3060001, 3000001, 2970001, 2940001) ORDER BY id DESC'
);
console.log('\nClaims:');
for (const c of claims) {
  console.log(`  ${c.id} | tenant: ${c.tenant_id} | status: ${c.status} | created: ${c.created_at}`);
}

await conn.end();
