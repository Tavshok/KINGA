import mysql from 'mysql2/promise';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load env
const envPath = resolve('/home/ubuntu/kinga-replit/.env');
try {
  const lines = readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
} catch {}

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Find claim
const [claims] = await conn.execute(
  "SELECT * FROM claims WHERE claim_number = 'CLM-3870001' LIMIT 1"
);
if (!claims.length) {
  console.log('Claim CLM-3870001 not found — trying by doc id');
  const [all] = await conn.execute(
    "SELECT claim_number, id, vehicle_make, vehicle_model, vehicle_year, vehicle_registration FROM claims ORDER BY created_at DESC LIMIT 10"
  );
  console.log('Recent claims:', JSON.stringify(all, null, 2));
  await conn.end();
  process.exit(0);
}

const claim = claims[0];
console.log('=== CLAIM ===');
console.log(JSON.stringify({
  id: claim.id,
  claimNumber: claim.claim_number,
  incidentType: claim.incident_type,
  vehicleYear: claim.vehicle_year,
  vehicleMake: claim.vehicle_make,
  vehicleModel: claim.vehicle_model,
  vehicleReg: claim.vehicle_registration,
  vehicleMileage: claim.vehicle_mileage,
  claimedAmount: claim.claimed_amount,
  repairQuote: claim.repair_quote,
  status: claim.status,
  createdAt: claim.created_at
}, null, 2));

// Get assessment
const [assessments] = await conn.execute(
  'SELECT id, claim_id, status, fraud_level, fraud_score, ai_cost_estimate, confidence_score, created_at FROM ai_assessments WHERE claim_id = ? ORDER BY created_at DESC LIMIT 1',
  [claim.id]
);
console.log('\n=== ASSESSMENT (summary) ===');
console.log(JSON.stringify(assessments[0] ?? 'NONE', null, 2));

if (assessments.length) {
  // Get full claim_record_json to inspect cost intelligence
  const [full] = await conn.execute(
    'SELECT claim_record_json, accuracy_report_json, narrative_analysis_json FROM ai_assessments WHERE id = ?',
    [assessments[0].id]
  );
  if (full.length) {
    const cr = typeof full[0].claim_record_json === 'string'
      ? JSON.parse(full[0].claim_record_json)
      : full[0].claim_record_json;

    // Cost intelligence
    const ci = cr?.costIntelligence ?? cr?.repairCostIntelligence ?? cr?.costEstimation;
    console.log('\n=== COST INTELLIGENCE ===');
    console.log(JSON.stringify(ci, null, 2));

    // Photos
    const photos = cr?.photos ?? cr?.images ?? cr?.attachments ?? cr?.photoAnalysis;
    console.log('\n=== PHOTOS/IMAGES ===');
    console.log(JSON.stringify(photos, null, 2));

    // Stage health
    const health = cr?.pipelineHealth ?? cr?.stageHealth ?? cr?.stages;
    console.log('\n=== PIPELINE STAGE HEALTH ===');
    console.log(JSON.stringify(health, null, 2));

    // Top-level keys
    console.log('\n=== CLAIM RECORD TOP-LEVEL KEYS ===');
    console.log(Object.keys(cr ?? {}).join(', '));
  }
}

await conn.end();
