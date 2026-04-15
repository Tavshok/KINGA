/**
 * BMW 318i claim seed + pipeline trigger
 * Fully self-contained CommonJS script — no TypeScript imports needed
 */
const mysql = require('mysql2/promise');
const { execSync } = require('child_process');

const S3_URL = 'https://d2xsxph8kpxj0f.cloudfront.net/310419663031527958/YbS42LwGroxbVepAMjk4bS/claims/bmw318i-adp6423-1744731977543.pdf';
const S3_KEY = 'claims/bmw318i-adp6423-1744731977543.pdf';

async function run() {
  const url = process.env.DATABASE_URL;
  const u = new URL(url);
  const conn = await mysql.createConnection({
    host: u.hostname, port: parseInt(u.port || '4000'),
    user: u.username, password: decodeURIComponent(u.password),
    database: u.pathname.slice(1), ssl: { rejectUnauthorized: false }
  });

  // Check claims table columns
  const [claimCols] = await conn.execute('SHOW COLUMNS FROM claims');
  const claimColNames = claimCols.map(c => c.Field);
  console.log('Claims table has', claimColNames.length, 'columns');

  // Check ingestion_documents columns
  const [docCols] = await conn.execute('SHOW COLUMNS FROM ingestion_documents');
  const docColNames = docCols.map(c => c.Field);
  console.log('ingestion_documents columns:', docColNames.join(', '));

  // Find required (NOT NULL, no default) columns in ingestion_documents
  const required = docCols.filter(c => c.Null === 'NO' && c.Default === null && c.Extra !== 'auto_increment');
  console.log('Required ingestion_documents columns:', required.map(c => c.Field).join(', '));

  // Create ingestion_document - include batch_id = 0 (nullable workaround)
  const crypto = require('crypto');
  const docUuid = crypto.randomUUID();
  const [docResult] = await conn.execute(
    `INSERT INTO ingestion_documents 
     (tenant_id, batch_id, document_id, original_filename, file_size_bytes, mime_type,
      s3_bucket, s3_key, s3_url, sha256_hash, hash_verified, document_type, 
      classification_confidence, classification_method, extraction_status, 
      validation_status, page_count, language_detected)
     VALUES (?, 0, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'claim_form', 0.9500, 'ai_model', 'completed', 'approved', 14, 'en')`,
    [
      'kinga-default', docUuid,
      'DIEFTRACKMARKETINGBMW318iADP6423-audit-signed.pdf',
      3265432, 'application/pdf',
      'd2xsxph8kpxj0f.cloudfront.net',
      S3_KEY, S3_URL,
      '6ebd52f90cec39ebef75d875e07cca51acfce9e5817eebf38b9d93fb69e38084'
    ]
  );
  const docId = docResult.insertId;
  console.log('\n✓ Created ingestion_document id:', docId);

  // Create claim
  const claimNumber = 'CLM-BMW318I-' + Date.now();
  const incidentDesc = 'DRIVER WAS DRIVING DOWNHILL AT GHIDAMBA AREA TOWARDS MAZOE AND FAILED TO NOTICE THAT HIS VEHICLE WAS BRAKING TO AVOID POTHOLES AND RAMMED INTO THE BACK OF THAT BMW VEHICLE. MATTER WAS REPORTED TO THE POLICE AND THE DRIVER WAS CHARGED. The BMW sustained damages on the rear section including the boot and bumper, the rear screen was also damaged. Insured vehicle hit the BMW from the back as it had braked to avoid a pothole. Third party vehicle BMW 318i registration ADP6423 was hit from the back. Third party driver RUNJARADZO NYAGOPE, 8995 Glen Norah C, Harare. Police report filed at Mazowe. Driver SYDNEY DUNG charged for driving without due care and attention.';

  // Build INSERT with only columns that exist in the table
  const claimData = {
    tenant_id: 'kinga-default',
    claim_number: claimNumber,
    vehicle_make: 'BMW',
    vehicle_model: '318i',
    vehicle_year: 2004,
    vehicle_registration: 'ADP6423',
    vehicle_color: 'SILVER',
    vehicle_vin: 'WBAAN92040NTO5535',
    incident_date: '2024-10-18',
    incident_description: incidentDesc,
    incident_location: '25KM PEG - HARARE-MUKUMBURA ROAD',
    incident_type: 'collision',
    incident_time: '05:40',
    policy_number: 'NO',
    police_report_number: 'MAZOWE-2024-001',
    police_station: 'MAZOWE',
    third_party_name: 'RUNJARADZO NYAGOPE',
    third_party_registration: 'ADP6423',
    third_party_vehicle: 'BMW 318i',
    lodger_name: 'DIEFTRACK MARKETING',
    lodger_phone: '0772676296',
    lodger_company: 'DIEFTRACK MARKETING',
    status: 'intake_pending',
    workflow_state: 'created',
    ai_assessment_triggered: 0,
    ai_assessment_completed: 0,
    source_document_id: docId,
    claim_source: 'pdf_upload',
    document_processing_status: 'completed',
    vehicle_mileage: 251388,
    vehicle_engine_capacity: 1800,
    vehicle_fuel_type: 'petrol',
  };

  // Only insert columns that actually exist in the table
  const validData = {};
  for (const [k, v] of Object.entries(claimData)) {
    if (claimColNames.includes(k)) validData[k] = v;
  }

  // Add currency columns if they exist
  if (claimColNames.includes('currency_code')) validData['currency_code'] = 'USD';
  if (claimColNames.includes('currency')) validData['currency'] = 'USD';
  if (claimColNames.includes('estimated_claim_value')) validData['estimated_claim_value'] = 192280;

  const cols = Object.keys(validData).join(', ');
  const placeholders = Object.keys(validData).map(() => '?').join(', ');
  const vals = Object.values(validData);

  const [claimResult] = await conn.execute(
    `INSERT INTO claims (${cols}) VALUES (${placeholders})`,
    vals
  );
  const claimId = claimResult.insertId;
  console.log(`✓ Created claim: ${claimNumber} (id: ${claimId})`);
  console.log(`  Make: BMW, Model: 318i, Reg: ADP6423`);
  console.log(`  Policy: "NO" (domain corrector should flag this)`);
  console.log(`  Source doc: ${docId}, S3: ${S3_URL.slice(0, 70)}...`);

  await conn.end();

  // Now trigger pipeline via tsx
  console.log(`\nTriggering pipeline for claim ${claimId}...`);
  console.log('(This runs in background — check /tmp/bmw-pipeline-final.log for progress)\n');

  // Write a minimal trigger script
  const fs = require('fs');
  fs.writeFileSync('/tmp/trigger-claim.ts', `
import { triggerAiAssessment } from "/home/ubuntu/kinga-replit/server/db";
console.log("[BMW] Starting pipeline for claim ${claimId}...");
try {
  await triggerAiAssessment(${claimId});
  console.log("[BMW] ✅ Pipeline complete for claim ${claimId}");
} catch(e) {
  console.error("[BMW] ❌ Pipeline failed:", e.message);
  process.exit(1);
}
`);

  const { spawn } = require('child_process');
  const proc = spawn('npx', ['tsx', '/tmp/trigger-claim.ts'], {
    cwd: '/home/ubuntu/kinga-replit',
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });

  const logStream = fs.createWriteStream('/tmp/bmw-pipeline-final.log');
  proc.stdout.pipe(logStream);
  proc.stderr.pipe(logStream);

  proc.on('exit', (code) => {
    logStream.end();
    console.log(`[BMW] Pipeline process exited with code ${code}`);
  });

  // Wait for pipeline to complete (up to 5 min)
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Pipeline timeout after 5 min')), 300000);
    proc.on('exit', (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve();
      else reject(new Error(`Pipeline exited with code ${code}`));
    });
  });

  console.log('\n=== PIPELINE COMPLETE ===');
  console.log('Log saved to /tmp/bmw-pipeline-final.log');

  // Read results
  const conn2 = await mysql.createConnection({
    host: u.hostname, port: parseInt(u.port || '4000'),
    user: u.username, password: decodeURIComponent(u.password),
    database: u.pathname.slice(1), ssl: { rejectUnauthorized: false }
  });

  const [aiRows] = await conn2.execute(
    'SELECT id, confidence_score, fraud_risk_level, fraud_score, recommendation, assumption_registry_json FROM ai_assessments WHERE claim_id = ? ORDER BY id DESC LIMIT 1',
    [claimId]
  );

  if (aiRows.length > 0) {
    const ai = aiRows[0];
    console.log(`\nResults for claim ${claimId}:`);
    console.log(`  Confidence: ${ai.confidence_score}`);
    console.log(`  Fraud: ${ai.fraud_risk_level} (score: ${ai.fraud_score})`);
    console.log(`  Recommendation: ${ai.recommendation}`);

    if (ai.assumption_registry_json) {
      const registry = JSON.parse(ai.assumption_registry_json);
      const domainCorrs = (registry.assumptions || []).filter(a => a.strategy === 'domain_correction');
      if (domainCorrs.length > 0) {
        console.log(`\n✓ Domain corrections (${domainCorrs.length}):`);
        domainCorrs.forEach(a => console.log(`  - ${a.field}: ${a.reason}`));
      } else {
        console.log('\n  No domain corrections needed (data was already correct)');
      }
    }
  }

  await conn2.end();
}

run().catch(e => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
