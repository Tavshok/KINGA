const mysql = require('mysql2/promise');

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  const [full] = await conn.execute('SELECT * FROM ai_assessments WHERE id = 3930001');
  const a = full[0];
  
  const jsonFields = ['damage_components_json','physics_analysis','narrative_analysis','cost_breakdown_json','fraud_indicators_json','report_readiness_json','causal_chain_json','stakeholder_analysis_json'];
  
  // Print all non-JSON fields first
  Object.keys(a).forEach(k => {
    const isJson = jsonFields.indexOf(k) >= 0;
    if (!isJson && a[k] !== null && a[k] !== undefined) {
      console.log(k + ':', a[k]);
    }
  });
  
  // Print JSON fields parsed
  jsonFields.forEach(k => {
    if (a[k]) {
      try {
        console.log('\n--- ' + k + ' ---');
        const parsed = JSON.parse(a[k]);
        console.log(JSON.stringify(parsed, null, 2).substring(0, 1200));
      } catch(e) {
        console.log('(parse error)');
      }
    }
  });
  
  await conn.end();
}

main().catch(e => console.error(e.message));
