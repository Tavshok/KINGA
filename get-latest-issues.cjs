'use strict';
const mysql = require('mysql2/promise');

async function main() {
  const conn = await mysql.createConnection({ uri: process.env.DATABASE_URL });
  
  const [claims] = await conn.execute('SELECT id FROM claims WHERE vehicle_registration = ? ORDER BY id DESC LIMIT 1', ['ADP6423']);
  if (claims.length === 0) { console.log('No claim found'); await conn.end(); return; }
  const claimId = claims[0].id;
  console.log('Claim ID:', claimId);
  
  const [rows] = await conn.execute(
    'SELECT id, recommendation, fraud_score, forensic_audit_validation_json FROM ai_assessments WHERE claim_id = ? ORDER BY id DESC LIMIT 1',
    [claimId]
  );
  if (rows.length === 0) { console.log('No assessment found'); await conn.end(); return; }
  
  const row = rows[0];
  console.log('Assessment ID:', row.id);
  console.log('Recommendation:', row.recommendation);
  console.log('Fraud Score:', row.fraud_score);
  
  const fav = JSON.parse(row.forensic_audit_validation_json || '{}');
  const issues = fav.issues || [];
  console.log('\nForensic Issues (' + issues.length + '):');
  issues.forEach((issue, i) => {
    console.log(i + 1 + '. [' + issue.severity + '] ' + issue.code + ': ' + issue.description);
  });
  
  await conn.end();
}

main().catch(e => console.error('Error:', e.message));
