const mysql = require('mysql2/promise');

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  
  const [rows] = await conn.execute(
    'SELECT enriched_photos_json, pipeline_run_summary, fraud_score, fraud_risk_level, image_analysis_total_count, image_analysis_success_count, image_analysis_failed_count FROM ai_assessments WHERE id = 3930001'
  );
  const r = rows[0];
  
  console.log('=== IMAGE ANALYSIS COUNTS ===');
  console.log('total:', r.image_analysis_total_count);
  console.log('success:', r.image_analysis_success_count);
  console.log('failed:', r.image_analysis_failed_count);
  console.log('fraud_score:', r.fraud_score);
  console.log('fraud_risk_level:', r.fraud_risk_level);
  
  if (r.enriched_photos_json) {
    const ep = JSON.parse(r.enriched_photos_json);
    console.log('\n=== ENRICHED PHOTOS ===');
    console.log('count:', Array.isArray(ep) ? ep.length : 'not array');
    if (Array.isArray(ep) && ep.length > 0) {
      console.log('sample[0]:', JSON.stringify(ep[0], null, 2).substring(0, 300));
    }
  } else {
    console.log('\nenriched_photos_json: NULL');
  }
  
  if (r.pipeline_run_summary) {
    const prs = JSON.parse(r.pipeline_run_summary);
    console.log('\n=== PIPELINE RUN SUMMARY ===');
    // Find stage 8 errors
    const keys = Object.keys(prs);
    console.log('keys:', keys.slice(0, 10));
    if (prs.stageResults) {
      const s8 = prs.stageResults['stage8'] || prs.stageResults['8'] || null;
      if (s8) console.log('stage8:', JSON.stringify(s8, null, 2).substring(0, 500));
    }
    if (prs.errors) {
      console.log('errors:', JSON.stringify(prs.errors, null, 2).substring(0, 500));
    }
  }
  
  await conn.end();
}

main().catch(e => console.error('ERROR:', e.message));
