import { createConnection } from 'mysql2/promise';
const conn = await createConnection(process.env.DATABASE_URL);

// Check what cost_intelligence_json actually contains for assessment 2550002
const [rows] = await conn.execute(
  'SELECT id, claim_id, cost_intelligence_json FROM ai_assessments WHERE id = 2550002'
);
const row = rows[0];
if (row?.cost_intelligence_json) {
  const cij = JSON.parse(row.cost_intelligence_json);
  console.log('Full cost_intelligence_json for assessment 2550002:');
  console.log(JSON.stringify(cij, null, 2));
} else {
  console.log('No cost_intelligence_json for assessment 2550002');
}

await conn.end();
