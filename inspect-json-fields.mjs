import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);

const [rows] = await conn.query(
  `SELECT 
    damaged_components_json,
    physics_analysis,
    causal_chain_json,
    fraud_score_breakdown_json,
    evidence_bundle_json,
    cost_intelligence_json,
    forensic_audit_validation_json,
    assumption_registry_json,
    claim_record_json,
    narrative_analysis_json
   FROM ai_assessments 
   ORDER BY id DESC LIMIT 1`
);

const row = rows[0];

function inspectTopKeys(label, jsonStr) {
  try {
    const obj = JSON.parse(jsonStr || '{}');
    console.log(`\n=== ${label} ===`);
    console.log('Top-level keys:', Object.keys(obj));
    return obj;
  } catch(e) {
    console.log(`\n=== ${label} === PARSE ERROR:`, e.message);
    return {};
  }
}

const damage = inspectTopKeys('damaged_components_json', row.damaged_components_json);
if (Array.isArray(damage)) {
  console.log('Array length:', damage.length);
  if (damage.length > 0) {
    console.log('damage[0] keys:', Object.keys(damage[0]));
    console.log('damage[0] sample:', JSON.stringify(damage[0], null, 2));
  }
} else if (damage.components) {
  console.log('damage.components[0] keys:', Object.keys(damage.components[0]));
  console.log('damage.components[0] sample:', JSON.stringify(damage.components[0], null, 2));
}

const physics = inspectTopKeys('physics_analysis', row.physics_analysis);
console.log('physics full:', JSON.stringify(physics, null, 2).substring(0, 3000));

const causal = inspectTopKeys('causal_chain_json', row.causal_chain_json);
console.log('causal_chain_json full:', JSON.stringify(causal, null, 2).substring(0, 3000));

const fraud = inspectTopKeys('fraud_score_breakdown_json', row.fraud_score_breakdown_json);
console.log('fraud full:', JSON.stringify(fraud, null, 2).substring(0, 2000));

const evidence = inspectTopKeys('evidence_bundle_json', row.evidence_bundle_json);
console.log('evidence full:', JSON.stringify(evidence, null, 2).substring(0, 3000));

const cost = inspectTopKeys('cost_intelligence_json', row.cost_intelligence_json);
console.log('cost full:', JSON.stringify(cost, null, 2).substring(0, 2000));

const forensic = inspectTopKeys('forensic_audit_validation_json', row.forensic_audit_validation_json);
console.log('forensic_audit full:', JSON.stringify(forensic, null, 2).substring(0, 2000));

const assumptions = inspectTopKeys('assumption_registry_json', row.assumption_registry_json);
if (Array.isArray(assumptions)) {
  console.log('assumptions[0]:', JSON.stringify(assumptions[0], null, 2));
} else if (assumptions.assumptions) {
  console.log('assumptions.assumptions[0]:', JSON.stringify(assumptions.assumptions[0], null, 2));
}

const narrative = inspectTopKeys('narrative_analysis_json', row.narrative_analysis_json);
console.log('narrative full:', JSON.stringify(narrative, null, 2).substring(0, 2000));

await conn.end();
