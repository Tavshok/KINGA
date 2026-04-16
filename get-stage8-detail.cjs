const mysql = require('mysql2/promise');

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  
  const [rows] = await conn.execute(
    'SELECT pipeline_run_summary FROM ai_assessments WHERE id = 3930001'
  );
  const prs = JSON.parse(rows[0].pipeline_run_summary);
  
  const stages = prs.stages || [];
  console.log('Total stages:', stages.length);
  
  stages.forEach(s => {
    const hasErrors = s.errors && s.errors.length > 0;
    const status = s.status || s.result || 'unknown';
    console.log(`\nStage ${s.stage || s.id || s.name}: status=${status}`);
    if (hasErrors) {
      console.log('  ERRORS:', JSON.stringify(s.errors, null, 2));
    }
    if (s.warnings && s.warnings.length > 0) {
      console.log('  warnings:', JSON.stringify(s.warnings, null, 2).substring(0, 200));
    }
  });
  
  await conn.end();
}

main().catch(e => console.error('ERROR:', e.message));
