const mysql = require('mysql2/promise');

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  const [rows] = await conn.execute('SELECT forensic_audit_validation_json FROM ai_assessments WHERE id = 3930001');
  const raw = rows[0].forensic_audit_validation_json;
  if (!raw) { console.log('No forensic_audit_validation_json'); await conn.end(); return; }
  const fav = JSON.parse(raw);
  console.log('Keys:', Object.keys(fav));
  if (fav.flags) {
    console.log('Flags (' + fav.flags.length + '):');
    fav.flags.forEach(f => {
      console.log(' ', f.severity, f.code, ':', (f.description || '').substring(0, 120));
    });
  }
  if (fav.findings) {
    console.log('Findings (' + fav.findings.length + '):');
    fav.findings.forEach(f => {
      console.log(' ', f.severity, f.code, ':', (f.description || '').substring(0, 120));
    });
  }
  console.log('consistencyScore:', fav.consistencyScore);
  console.log('confidenceInAssessment:', fav.confidenceInAssessment);
  console.log('summary:', fav.summary ? fav.summary.substring(0, 300) : 'N/A');
  
  // Also check the decision readiness
  const [rows2] = await conn.execute('SELECT report_readiness_json FROM ai_assessments WHERE id = 3930001');
  const rr = JSON.parse(rows2[0].report_readiness_json);
  console.log('\nReport readiness:');
  console.log('export_allowed:', rr.export_allowed);
  console.log('status:', rr.status);
  console.log('hold_reasons:', rr.hold_reasons);
  
  await conn.end();
}

main().catch(e => console.error('ERROR:', e.message));
