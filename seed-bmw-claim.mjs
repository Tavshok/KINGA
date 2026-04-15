/**
 * seed-bmw-claim.mjs
 * Seeds the BMW 318i ADP6423 claim into the database and triggers the AI assessment pipeline.
 */
import mysql from 'mysql2/promise';
import { config } from 'dotenv';

config({ quiet: true });

const PDF_URL = 'https://files.manuscdn.com/user_upload_by_module/session_file/310419663031527958/UWgvQSKapGFFOOEs.pdf';

const claimData = {
  vehicle_make: 'BMW',
  vehicle_model: '318i',
  vehicle_year: 2004,
  vehicle_registration: 'ADP6423',
  vehicle_colour: 'Silver',
  vehicle_vin: 'WBAAN92040NJ05535',
  vehicle_odometer_km: 251388,
  incident_date: '2024-10-18',
  incident_location: '25KM PEG, HARARE-MUKUMBURA ROAD, MAZOWE',
  incident_description: 'Driver was driving downhill at Ghidamba area. Braking to avoid potholes, the insured vehicle rammed into the back of the BMW. The rear section including boot, bumper and rear screen sustained damage. The matter was reported to Mazowe Police and the driver (Sydney Dube) was charged with driving without due care and attention.',
  incident_speed_kmh: 30,
  incident_type: 'collision',
  damage_description: 'Rear section damage: bootlid, rear bumper, rear bumper frame, LHS rear fender, rear windscreen, taillamps x2, bootlights x2, number plate light, bootshocks x2, rear bumper slides x2, PAS rear fender. Paint and strip/assemble required.',
  claimant_name: 'DIEFTRACK MARKETING',
  claimant_phone: '0772676296',
  claimant_address: '12 GEORGE STREET, ARDBENNIE, HARARE',
  insurer_name: 'CELL INSURANCE',
  policy_number: 'IC 2IM 24 R 6 21 061',
  assessor_name: 'TRIPPLE T MAND',
  repairer_name: 'ROYAL AUTOBODY',
  market_value_usd: 3500,
  repair_cost_usd: 2087,
  agreed_cost_usd: 1922.80,
  currency_code: 'USD',
  status: 'submitted',
  ai_assessment_completed: 0,
  pdf_document_url: PDF_URL,
};

async function run() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  
  // Check schema columns available
  const [cols] = await conn.execute("SHOW COLUMNS FROM claims");
  const colNames = cols.map(c => c.Field);
  console.log('Available columns:', colNames.join(', '));

  // Build insert with only columns that exist
  const fieldMap = {
    claim_number: `CLM-BMW-${Date.now()}`,
    vehicle_make: claimData.vehicle_make,
    vehicle_model: claimData.vehicle_model,
    vehicle_year: claimData.vehicle_year,
    status: claimData.status,
    ai_assessment_completed: claimData.ai_assessment_completed,
  };

  // Add optional columns if they exist
  const optionalFields = {
    vehicle_registration: claimData.vehicle_registration,
    vehicle_colour: claimData.vehicle_colour,
    vehicle_vin: claimData.vehicle_vin,
    vehicle_odometer_km: claimData.vehicle_odometer_km,
    incident_date: claimData.incident_date,
    incident_location: claimData.incident_location,
    incident_description: claimData.incident_description,
    incident_speed_kmh: claimData.incident_speed_kmh,
    incident_type: 'collision',
    damage_description: claimData.damage_description,
    claimant_name: claimData.claimant_name,
    claimant_phone: claimData.claimant_phone,
    claimant_address: claimData.claimant_address,
    insurer_name: claimData.insurer_name,
    policy_number: claimData.policy_number,
    assessor_name: claimData.assessor_name,
    repairer_name: claimData.repairer_name,
    market_value_usd: claimData.market_value_usd,
    repair_cost_usd: claimData.repair_cost_usd,
    agreed_cost_usd: claimData.agreed_cost_usd,
    currency_code: claimData.currency_code,
    pdf_document_url: claimData.pdf_document_url,
    damage_photos: JSON.stringify([]),
  };

  for (const [k, v] of Object.entries(optionalFields)) {
    if (colNames.includes(k)) {
      fieldMap[k] = v;
    }
  }

  const keys = Object.keys(fieldMap);
  const vals = Object.values(fieldMap);
  const placeholders = keys.map(() => '?').join(', ');
  const sql = `INSERT INTO claims (${keys.join(', ')}) VALUES (${placeholders})`;
  
  const [result] = await conn.execute(sql, vals);
  const claimId = result.insertId;
  console.log(`✅ Claim inserted with ID: ${claimId}`);

  // Insert quote
  const quoteFields = {
    claim_id: claimId,
    repairer_name: 'ROYALTY AUTOBODY HOUSE',
    quote_total_cents: Math.round(2087 * 100),
    quote_currency: 'USD',
    quote_date: '2024-10-21',
    status: 'submitted',
  };
  
  const qCols = await conn.execute("SHOW COLUMNS FROM repair_quotes");
  const qColNames = qCols[0].map(c => c.Field);
  
  const qFieldMap = {};
  for (const [k, v] of Object.entries(quoteFields)) {
    if (qColNames.includes(k)) qFieldMap[k] = v;
  }
  
  if (Object.keys(qFieldMap).length > 1) {
    const qKeys = Object.keys(qFieldMap);
    const qVals = Object.values(qFieldMap);
    const qSql = `INSERT INTO repair_quotes (${qKeys.join(', ')}) VALUES (${qKeys.map(() => '?').join(', ')})`;
    const [qResult] = await conn.execute(qSql, qVals);
    console.log(`✅ Quote inserted with ID: ${qResult.insertId}`);
  }

  await conn.end();
  console.log(`\n🚀 Claim ID ${claimId} is ready. Trigger pipeline via: POST /api/trpc/aiAssessments.trigger with claimId=${claimId}`);
  return claimId;
}

run().catch(e => { console.error('❌ Error:', e.message); process.exit(1); });
