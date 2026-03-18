import { createConnection } from 'mysql2/promise';

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) { console.error('No DATABASE_URL found'); process.exit(1); }

const conn = await createConnection({ uri: dbUrl, ssl: { rejectUnauthorized: false } });

// Get AI assessment
const [rows] = await conn.query(`
  SELECT estimated_cost, estimated_parts_cost, estimated_labor_cost, 
         damage_description, currency_code, model_version, processing_time,
         confidence_score, fraud_risk_level, structural_damage_severity,
         LEFT(damaged_components_json, 2000) as components,
         LEFT(physics_analysis, 2000) as physics,
         LEFT(cost_intelligence_json, 2000) as cost_intel,
         LEFT(pipeline_run_summary, 2000) as pipeline_summary
  FROM ai_assessments WHERE claim_id = 2130345 ORDER BY id DESC LIMIT 1
`);

if (rows.length === 0) {
  console.log('No AI assessment found for claim 2130345');
} else {
  const r = rows[0];
  console.log('=== AI ASSESSMENT FOR CLAIM 2130345 ===');
  console.log(`Estimated Cost: ${r.estimated_cost}`);
  console.log(`Parts Cost: ${r.estimated_parts_cost}`);
  console.log(`Labor Cost: ${r.estimated_labor_cost}`);
  console.log(`Currency: ${r.currency_code}`);
  console.log(`Confidence: ${r.confidence_score}`);
  console.log(`Fraud Level: ${r.fraud_risk_level}`);
  console.log(`Structural Severity: ${r.structural_damage_severity}`);
  console.log(`Model: ${r.model_version}`);
  console.log(`Processing Time: ${r.processing_time}ms`);
  console.log(`\n=== DAMAGE DESCRIPTION ===\n${r.damage_description}`);
  console.log(`\n=== COMPONENTS ===\n${r.components}`);
  console.log(`\n=== PHYSICS ===\n${r.physics}`);
  console.log(`\n=== COST INTELLIGENCE ===\n${r.cost_intel}`);
  console.log(`\n=== PIPELINE SUMMARY ===\n${r.pipeline_summary}`);
}

// Also check the claim itself
const [claims] = await conn.query(`
  SELECT id, claim_number, status, document_processing_status, 
         ai_assessment_triggered, ai_assessment_completed,
         vehicle_make, vehicle_model, vehicle_registration,
         source_document_id
  FROM claims WHERE id = 2130345 LIMIT 1
`);
if (claims.length > 0) {
  console.log('\n=== CLAIM RECORD ===');
  console.log(JSON.stringify(claims[0], null, 2));
}

await conn.end();
