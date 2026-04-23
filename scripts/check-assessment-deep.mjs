import { createConnection } from 'mysql2/promise';

const DATABASE_URL = process.env.DATABASE_URL;

async function main() {
  const conn = await createConnection(DATABASE_URL);

  const [rows] = await conn.execute(`
    SELECT 
      claim_record_json,
      forensic_audit_validation_json,
      claim_quality_json,
      forensic_analysis,
      narrative_analysis_json,
      stage2_raw_ocr_text,
      pipeline_run_summary
    FROM ai_assessments
    WHERE id = 4200002
  `);

  const row = rows[0];

  console.log('\n=== FORENSIC AUDIT VALIDATION ===');
  try { console.log(JSON.stringify(JSON.parse(row.forensic_audit_validation_json), null, 2)); }
  catch(e) { console.log(row.forensic_audit_validation_json?.substring(0, 2000)); }

  console.log('\n=== CLAIM RECORD (incident description) ===');
  try {
    const cr = JSON.parse(row.claim_record_json);
    console.log('Incident description:', cr.damage?.description ?? cr.incident?.description ?? 'NOT FOUND');
    console.log('Incident type:', cr.damage?.type ?? cr.incident?.type ?? 'NOT FOUND');
    console.log('Police report:', JSON.stringify(cr.policeReport ?? 'NOT FOUND'));
    console.log('Insurance context:', JSON.stringify(cr.insuranceContext ?? 'NOT FOUND'));
  } catch(e) { console.log('Parse error:', e.message); }

  console.log('\n=== PIPELINE RUN SUMMARY ===');
  try { console.log(JSON.stringify(JSON.parse(row.pipeline_run_summary), null, 2)); }
  catch(e) { console.log(row.pipeline_run_summary?.substring(0, 1000)); }

  console.log('\n=== STAGE 2 RAW OCR (first 500 chars) ===');
  console.log(row.stage2_raw_ocr_text?.substring(0, 500) ?? 'NULL');

  await conn.end();
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
