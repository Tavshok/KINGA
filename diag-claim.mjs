import mysql from 'mysql2/promise';

const conn = mysql.createPool(process.env.DATABASE_URL);

const [rows] = await conn.query('SELECT pipeline_run_summary, forensic_audit_validation_json, stage2_raw_ocr_text, claim_record_json, damage_photos_json, assumption_registry_json FROM ai_assessments WHERE claim_id = 4410001 LIMIT 1');

if (!rows[0]) { console.log('No assessment found'); process.exit(0); }
const r = rows[0];

// Pipeline run summary
const prs = r.pipeline_run_summary ? JSON.parse(r.pipeline_run_summary) : null;
if (prs) {
  console.log('=== PIPELINE RUN SUMMARY ===');
  console.log('Total duration:', prs.totalDurationMs, 'ms');
  console.log('Stages:');
  for (const [k, v] of Object.entries(prs.stages || {})) {
    const s = v;
    const failed = s.status !== 'success' ? '*** FAILED ***' : '';
    console.log(' ', k, ':', s.status, failed, 'dur:', s.durationMs, 'ms', s.errorMessage ? 'ERR: ' + s.errorMessage : '');
  }
} else {
  console.log('No pipeline_run_summary');
}

// FAV critical failures
const fav = r.forensic_audit_validation_json ? JSON.parse(r.forensic_audit_validation_json) : null;
if (fav) {
  console.log('\n=== FAV CRITICAL FAILURES ===');
  console.log('Status:', fav.status, '| Score:', fav.consistencyScore);
  (fav.criticalFailures || []).forEach(f => console.log(' -', f));
  (fav.warnings || []).forEach(f => console.log('  WARN:', f));
}

// OCR text
console.log('\nOCR text length:', (r.stage2_raw_ocr_text || '').length);
console.log('OCR preview:', (r.stage2_raw_ocr_text || '').slice(0, 300));

// Claim record
const cr = r.claim_record_json ? JSON.parse(r.claim_record_json) : null;
console.log('\nClaim record vehicle:', cr?.vehicle?.make, cr?.vehicle?.model, cr?.vehicle?.registration);
console.log('Claim record claimant:', cr?.claimant?.name);
console.log('Claim record insurer:', cr?.insurer?.name);
console.log('Claim record incident type:', cr?.accidentDetails?.incidentType);
console.log('Claim record cost:', cr?.repairQuote?.totalAmount);

// Photos
const photos = r.damage_photos_json ? JSON.parse(r.damage_photos_json) : [];
console.log('\nPhotos in damage_photos_json:', photos.length);
if (photos.length > 0) console.log('First photo:', photos[0]);

// Assumptions
const assumptions = r.assumption_registry_json ? JSON.parse(r.assumption_registry_json) : [];
console.log('\nAssumptions count:', assumptions.length);
assumptions.slice(0, 5).forEach(a => console.log(' -', a.field, ':', a.reason));

process.exit(0);
