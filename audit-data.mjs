import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [rows] = await conn.execute(
  `SELECT claim_record_json, decision_authority_json, cost_intelligence_json,
          estimated_vehicle_value, repair_to_value_ratio, total_loss_indicated,
          total_loss_reasoning, fraud_score, fraud_risk_level, physics_deviation_score,
          fcdi_score, recommendation
   FROM ai_assessments ORDER BY created_at DESC LIMIT 1`
);
if (!rows[0]) { console.log('No assessments'); conn.end(); process.exit(0); }

const cr = JSON.parse(rows[0].claim_record_json || '{}');
const da = JSON.parse(rows[0].decision_authority_json || '{}');
const ci = JSON.parse(rows[0].cost_intelligence_json || '{}');

console.log('=== CLAIM RECORD TOP-LEVEL KEYS ===');
console.log(Object.keys(cr).join(', '));
console.log('\n=== driver ===');
console.log(JSON.stringify(cr.driver, null, 2));
console.log('\n=== thirdParty ===');
console.log(JSON.stringify(cr.thirdParty, null, 2));
console.log('\n=== policeReport ===');
console.log(JSON.stringify(cr.policeReport, null, 2));
console.log('\n=== witness ===');
console.log(JSON.stringify(cr.witness, null, 2));
console.log('\n=== VALUATION (direct columns) ===');
console.log('estimated_vehicle_value:', rows[0].estimated_vehicle_value);
console.log('repair_to_value_ratio:', rows[0].repair_to_value_ratio);
console.log('total_loss_indicated:', rows[0].total_loss_indicated);
console.log('total_loss_reasoning:', rows[0].total_loss_reasoning);
console.log('\n=== COST INTELLIGENCE ===');
console.log(JSON.stringify(ci, null, 2));
console.log('\n=== DECISION AUTHORITY TOP-LEVEL KEYS ===');
console.log(Object.keys(da).join(', '));
console.log('\n=== fraud_score ===', rows[0].fraud_score);
console.log('=== fraud_risk_level ===', rows[0].fraud_risk_level);
console.log('=== physics_deviation_score ===', rows[0].physics_deviation_score);
console.log('=== fcdi_score ===', rows[0].fcdi_score);
console.log('=== recommendation ===', rows[0].recommendation);

conn.end();
