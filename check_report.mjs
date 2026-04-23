import { createConnection } from 'mysql2/promise';
const dbUrl = process.env.DATABASE_URL;
const cleanUrl = dbUrl.split('?')[0];
const match = cleanUrl.match(/mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);
const [, user, pass, host, port, db] = match;
const conn = await createConnection({
  host, port: parseInt(port), user, password: pass, database: db,
  ssl: { rejectUnauthorized: false }
});
// Check the most recent completed assessment
const [rows] = await conn.execute(`
  SELECT a.id, a.claim_id, a.created_at, a.processing_time,
         c.claim_number, c.status, c.document_processing_status
  FROM ai_assessments a
  JOIN claims c ON c.id = a.claim_id
  ORDER BY a.created_at DESC LIMIT 3
`);
console.log('Recent completed assessments:');
for (const r of rows) {
  console.log(JSON.stringify(r));
}
// Check if the most recent assessment has the key fields
if (rows.length > 0) {
  const [detail] = await conn.execute(`
    SELECT id, claim_id, fraud_risk_level, recommendation, confidence_score,
           total_loss_indicated, estimated_cost, model_version,
           LENGTH(fraud_score_breakdown_json) as fraud_json_len,
           LENGTH(damaged_components_json) as dmg_json_len,
           LENGTH(physics_analysis) as physics_len,
           LENGTH(claim_quality_json) as cq_len,
           LENGTH(forensic_execution_ledger_json) as fel_len
    FROM ai_assessments WHERE id = ?
  `, [rows[0].id]);
  console.log('\nAssessment detail:', JSON.stringify(detail[0], null, 2));
}
await conn.end();
