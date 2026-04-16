const mysql = require('mysql2/promise');

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  const [full] = await conn.execute('SELECT claim_record_json, accuracy_report_json, economic_context_json FROM ai_assessments WHERE id = 3930001');
  const a = full[0];
  
  if (a.claim_record_json) {
    const cr = JSON.parse(a.claim_record_json);
    console.log('=== CLAIM RECORD ===');
    console.log(JSON.stringify(cr, null, 2).substring(0, 2000));
  }
  
  if (a.economic_context_json) {
    const ec = JSON.parse(a.economic_context_json);
    console.log('\n=== ECONOMIC CONTEXT ===');
    console.log(JSON.stringify(ec, null, 2).substring(0, 800));
  }
  
  if (a.accuracy_report_json) {
    const ar = JSON.parse(a.accuracy_report_json);
    console.log('\n=== ACCURACY REPORT ===');
    console.log(JSON.stringify(ar, null, 2).substring(0, 800));
  }
  
  await conn.end();
}

main().catch(e => console.error('ERROR:', e.message));
