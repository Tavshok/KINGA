/**
 * Seed script: Create BMW 318i claim (DIEFTRACK MARKETING) and trigger AI pipeline
 * 
 * This script:
 * 1. Uploads the PDF to S3
 * 2. Creates an ingestion_document record
 * 3. Creates the claim record with all known fields
 * 4. Triggers the AI assessment pipeline
 * 
 * Run with: node scripts/seed-bmw-claim.mjs
 */
import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL not set'); process.exit(1); }

const u = new URL(url);
const conn = await mysql.createConnection({
  host: u.hostname,
  port: parseInt(u.port || '4000'),
  user: u.username,
  password: decodeURIComponent(u.password),
  database: u.pathname.slice(1),
  ssl: { rejectUnauthorized: false },
});

// ── 1. Upload PDF to S3 ──────────────────────────────────────────────────────
const pdfPath = '/home/ubuntu/upload/DIEFTRACKMARKETINGBMW318iADP6423-audit-signed.pdf';
const pdfBuffer = fs.readFileSync(pdfPath);
const pdfHash = crypto.createHash('sha256').update(pdfBuffer).digest('hex');
const pdfSize = pdfBuffer.length;

console.log('PDF size:', pdfSize, 'bytes, SHA256:', pdfHash.slice(0, 16) + '...');

// Upload via the Forge storage API
const forgeUrl = process.env.BUILT_IN_FORGE_API_URL;
const forgeKey = process.env.BUILT_IN_FORGE_API_KEY;

if (!forgeUrl || !forgeKey) {
  console.error('BUILT_IN_FORGE_API_URL or BUILT_IN_FORGE_API_KEY not set');
  process.exit(1);
}

const fileKey = `claims/bmw318i-adp6423-${Date.now()}.pdf`;

// Use the storage upload endpoint
const uploadResponse = await fetch(`${forgeUrl}/storage/upload`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${forgeKey}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    key: fileKey,
    contentType: 'application/pdf',
    data: pdfBuffer.toString('base64'),
  }),
});

let s3Url = null;
if (uploadResponse.ok) {
  const uploadResult = await uploadResponse.json();
  s3Url = uploadResult.url || uploadResult.publicUrl || uploadResult.cdnUrl;
  console.log('Uploaded to S3:', s3Url);
} else {
  const errText = await uploadResponse.text();
  console.warn('S3 upload failed:', uploadResponse.status, errText.slice(0, 200));
  console.log('Proceeding without S3 URL (pipeline will use damage photos fallback)');
}

// ── 2. Create ingestion_document record ──────────────────────────────────────
let docId = null;
if (s3Url) {
  const docUuid = crypto.randomUUID();
  const [docResult] = await conn.execute(
    `INSERT INTO ingestion_documents 
     (tenant_id, document_id, original_filename, file_size_bytes, mime_type, s3_key, s3_url, 
      sha256_hash, hash_verified, document_type, classification_confidence, classification_method,
      extraction_status, validation_status, page_count, language_detected, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 'claim_form', 0.9500, 'ai_model', 'completed', 'approved', 14, 'en', NOW())`,
    [
      'kinga-default',
      docUuid,
      'DIEFTRACKMARKETINGBMW318iADP6423-audit-signed.pdf',
      pdfSize,
      'application/pdf',
      fileKey,
      s3Url,
      pdfHash,
    ]
  );
  docId = docResult.insertId;
  console.log('Created ingestion_document id:', docId);
}

// ── 3. Create claim record ────────────────────────────────────────────────────
const claimNumber = `CLM-BMW-${Date.now()}`;
const incidentDescription = `DRIVER WAS DRIVING DOWNHILL AT GHIDAMBA AREA TOWARDS MAZOE AND FAILED TO NOTICE THAT HIS VEHICLE WAS BRAKING TO AVOID POTHOLES AND RAMMED INTO THE BACK OF THAT BMW VEHICLE. MATTER WAS REPORTED TO THE POLICE AND THE DRIVER WAS CHARGED. The BMW sustained damages on the rear section including the boot and bumper, the rear screen was also damaged. Damages are consistent with the raised circumstances on the claim form. Cost verified and agreed with repairer.`;

const [claimResult] = await conn.execute(
  `INSERT INTO claims 
   (tenant_id, claim_number, vehicle_make, vehicle_model, vehicle_year, vehicle_registration,
    vehicle_color, vehicle_vin, incident_date, incident_description, incident_location,
    incident_type, incident_time, policy_number, police_report_number, police_station,
    third_party_name, third_party_registration, third_party_vehicle,
    lodger_name, lodger_phone, lodger_company,
    status, workflow_state, ai_assessment_triggered, ai_assessment_completed,
    source_document_id, claim_source, document_processing_status,
    currency_code, currency, estimated_claim_value,
    vehicle_mileage, vehicle_engine_capacity, vehicle_fuel_type,
    created_at, updated_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
  [
    'kinga-default',
    claimNumber,
    'BMW',          // Correct make (domain corrector will still log it if OCR had BMD)
    '318i',
    2004,
    'ADP6423',
    'SILVER',
    'WBAAN92040NTO5535',
    '2024-10-18',
    incidentDescription,
    '25KM PEG - HARARE-MUKUMBURA ROAD',
    'collision',
    '05:40',
    'NO',           // Intentionally "NO" to test policy number validation
    'MAZOWE-2024',
    'MAZOWE',
    'RUNJARADZO NYAGOPE',
    'ADP6423',      // Third party reg (same vehicle — insured hit the BMW)
    'BMW 318i',
    'DIEFTRACK MARKETING',
    '0772676296',
    'DIEFTRACK MARKETING',
    'intake_pending',
    'intake_pending',
    docId,
    'pdf_upload',
    docId ? 'completed' : 'pending',
    'USD',
    'USD',
    192280,         // $1922.80 in cents
    251388,
    1800,
    'petrol',
  ]
);

const claimId = claimResult.insertId;
console.log(`\nCreated claim: ${claimNumber} (id: ${claimId})`);
console.log(`  Make: BMW, Model: 318i, Year: 2004, Reg: ADP6423`);
console.log(`  Policy: "NO" (should be flagged by domain corrector)`);
console.log(`  Source doc: ${docId || 'none (no S3 upload)'}`);

await conn.end();

// ── 4. Trigger AI assessment via HTTP ────────────────────────────────────────
console.log('\nTriggering AI assessment pipeline...');

// Use the internal API to trigger the assessment
const triggerResponse = await fetch(`http://localhost:3000/api/trpc/claims.triggerAiAssessment`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    // Use a system-level trigger — no auth needed for internal calls
  },
  body: JSON.stringify({ json: { claimId } }),
});

if (triggerResponse.ok) {
  const result = await triggerResponse.json();
  console.log('Pipeline triggered:', JSON.stringify(result).slice(0, 200));
} else {
  const errText = await triggerResponse.text();
  console.log('HTTP trigger failed (expected — needs auth):', triggerResponse.status);
  console.log('Triggering directly via Node.js import...');
  
  // Direct trigger via Node.js
  const { default: dbModule } = await import('../server/db.ts');
}

console.log(`\nClaim ${claimId} created. To trigger pipeline, visit:`);
console.log(`  https://3000-i35v54ds8yc39oabmnjg6-c3e68f00.us2.manus.computer`);
console.log(`  Navigate to Claims > Find claim ${claimNumber} > Trigger AI Assessment`);
console.log(`\nOr run: node scripts/trigger-pipeline.mjs ${claimId}`);
