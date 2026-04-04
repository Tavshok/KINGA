import { createConnection } from 'mysql2/promise';

const connStr = process.env.DATABASE_URL;
if (!connStr) { console.error('No DATABASE_URL'); process.exit(1); }

const conn = await createConnection(connStr);

// Get the most recent 3 assessments for any BT50/Mazda/CI-024 claim
const [rows] = await conn.execute(`
  SELECT a.id, a.claim_id, a.cost_intelligence_json, c.claim_number
  FROM ai_assessments a
  JOIN claims c ON c.id = a.claim_id
  WHERE c.claim_number LIKE '%BT50%' OR c.claim_number LIKE '%MAZDA%' OR c.claim_number LIKE '%CI-024%'
  ORDER BY a.id DESC LIMIT 5
`);

if (rows.length === 0) {
  // Try getting the last 3 assessments regardless
  const [all] = await conn.execute(`
    SELECT a.id, a.claim_id, a.cost_intelligence_json, c.claim_number
    FROM ai_assessments a
    JOIN claims c ON c.id = a.claim_id
    ORDER BY a.id DESC LIMIT 5
  `);
  rows.push(...all);
}

for (const r of rows) {
  let ci = null;
  try { ci = r.cost_intelligence_json ? JSON.parse(r.cost_intelligence_json) : null; } catch(e) { ci = { parseError: e.message }; }
  console.log('=== Assessment ID:', r.id, '| claim_id:', r.claim_id, '| claim_number:', r.claim_number);
  console.log('  documentedOriginalQuoteUsd:', ci?.documentedOriginalQuoteUsd ?? 'MISSING');
  console.log('  documentedAgreedCostUsd:', ci?.documentedAgreedCostUsd ?? 'MISSING');
  console.log('  panelBeaterName:', ci?.panelBeaterName ?? 'MISSING');
  console.log('  aiEstimatedCostUsd:', ci?.aiEstimatedCostUsd ?? 'MISSING');
  console.log('  quoteDeviationPct:', ci?.quoteDeviationPct ?? 'MISSING');
  console.log('  Full keys:', ci ? Object.keys(ci).join(', ') : 'null');
}

await conn.end();
