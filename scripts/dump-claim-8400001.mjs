import { createConnection } from 'mysql2/promise';
import fs from 'fs';

const url = process.env.DATABASE_URL;
if (!url) { console.error('No DATABASE_URL'); process.exit(1); }

const conn = await createConnection(url);

// Claim (note: claimant_id not user_id)
const [claims] = await conn.execute(`
  SELECT id, claim_number, tenant_id, status, workflow_state,
    vehicle_make, vehicle_model, vehicle_year, vehicle_registration, vehicle_vin, vehicle_color, vehicle_mileage,
    vehicle_market_value, vehicle_engine_capacity, vehicle_fuel_type, vehicle_first_registration_date,
    incident_date, incident_time, incident_description, incident_location, incident_type,
    policy_number, currency_code, estimated_claim_value, final_approved_amount, approved_amount,
    fraud_risk_score, fraud_risk_level, fraud_flags, early_fraud_suspicion,
    claimant_id, claimant_id_number, claimant_phone, claimant_email, claimant_address,
    lodger_name, lodger_phone, lodger_email, lodger_relationship,
    police_report_number, police_station,
    assigned_assessor_id, assigned_panel_beater_id,
    created_at, updated_at, kinga_ref, product_type, excess_amount_cents
  FROM claims WHERE id = 8400001 LIMIT 1
`);

// Assessment
const [assessments] = await conn.execute(`
  SELECT 
    id, claim_id, fraud_score, fraud_risk_level, recommendation,
    fraud_score_breakdown_json, enriched_photos_json, photo_inconsistencies_json,
    estimated_cost, estimated_parts_cost, estimated_labor_cost, currency_code,
    damage_description, detected_damage_types, confidence_score,
    total_loss_indicated, structural_damage_severity, estimated_vehicle_value,
    repair_to_value_ratio, accident_type, structural_damage, airbag_deployment,
    cost_intelligence_json, repair_intelligence_json, parts_reconciliation_json,
    narrative_analysis_json, consistency_check_json, cost_realism_json,
    pipeline_run_summary, created_at, updated_at
  FROM ai_assessments WHERE claim_id = 8400001 LIMIT 1
`);

// Quote line items (via quote_id from panel_beater_quotes)
const [pbQuotes] = await conn.execute('SELECT * FROM panel_beater_quotes WHERE claim_id = 8400001 LIMIT 3');
let quoteLines = [];
if (pbQuotes[0]) {
  const [ql] = await conn.execute('SELECT * FROM quote_line_items WHERE quote_id = ? LIMIT 20', [pbQuotes[0].id]);
  quoteLines = ql;
}

// Claim documents
const [docs] = await conn.execute('SELECT id, file_name, document_category, created_at FROM claim_documents WHERE claim_id = 8400001 LIMIT 10');

// Fraud alerts
const [fraudAlerts] = await conn.execute('SELECT alert_type, alert_severity, alert_title, alert_description, fraud_score, status FROM fraud_alerts WHERE claim_id = 8400001 LIMIT 10');

// Extracted document data
const [extractedData] = await conn.execute(`
  SELECT insured_name, vehicle_make, vehicle_model, vehicle_year, vehicle_vin, vehicle_license_plate,
    incident_date, incident_location, incident_description, damage_severity,
    repair_cost_estimate, assessor_name, assessor_observations, extraction_confidence
  FROM extracted_document_data WHERE document_id IN (
    SELECT id FROM claim_documents WHERE claim_id = 8400001 LIMIT 5
  ) LIMIT 3
`);

// Claimant user
let claimant = null;
let prevClaims = [];
if (claims[0]) {
  const cid = claims[0].claimant_id;
  if (cid) {
    const [users] = await conn.execute('SELECT id, name, email, created_at FROM users WHERE id = ? LIMIT 1', [cid]);
    claimant = users[0] || null;
    const [prev] = await conn.execute('SELECT id, claim_number, status, incident_date FROM claims WHERE claimant_id = ? AND id != 8400001 ORDER BY created_at DESC LIMIT 5', [cid]);
    prevClaims = prev;
  }
}

const data = { 
  claim: claims[0], 
  assessment: assessments[0], 
  pbQuotes,
  quoteLines, 
  docs,
  fraudAlerts,
  claimant, 
  prevClaims,
  extractedData
};

fs.writeFileSync('/tmp/claim-8400001.json', JSON.stringify(data, null, 2));

console.log('=== CLAIM ===');
const c = claims[0];
if (c) {
  console.log('claim_number:', c.claim_number);
  console.log('kinga_ref:', c.kinga_ref);
  console.log('status:', c.status);
  console.log('vehicle:', c.vehicle_make, c.vehicle_model, c.vehicle_year, c.vehicle_registration);
  console.log('incident:', c.incident_date, c.incident_location);
  console.log('fraud_risk_level:', c.fraud_risk_level, 'score:', c.fraud_risk_score);
  console.log('estimated_claim_value:', c.estimated_claim_value, c.currency_code);
}
const a = assessments[0];
if (a) {
  console.log('\n=== ASSESSMENT ===');
  console.log('fraud_score:', a.fraud_score, 'risk_level:', a.fraud_risk_level);
  console.log('recommendation:', a.recommendation);
  console.log('estimated_cost:', a.estimated_cost, a.currency_code);
  console.log('parts_cost:', a.estimated_parts_cost, 'labor_cost:', a.estimated_labor_cost);
  console.log('photos:', JSON.parse(a.enriched_photos_json || '[]').length);
  console.log('inconsistencies:', JSON.parse(a.photo_inconsistencies_json || '[]').length);
  const fsd = JSON.parse(a.fraud_score_breakdown_json || '{}');
  console.log('fraud breakdown keys:', Object.keys(fsd));
}
console.log('\npbQuotes:', pbQuotes.length);
console.log('quoteLines:', quoteLines.length);
console.log('fraudAlerts:', fraudAlerts.length);
console.log('prevClaims:', prevClaims.length);

await conn.end();
