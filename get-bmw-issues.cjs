const mysql = require('mysql2/promise');

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  const [rows] = await conn.execute('SELECT forensic_audit_validation_json FROM ai_assessments WHERE id = 3930001');
  const raw = rows[0].forensic_audit_validation_json;
  const fav = JSON.parse(raw);
  
  const sections = ['criticalFailures', 'highSeverityIssues', 'mediumIssues', 'lowIssues'];
  sections.forEach(section => {
    const items = fav[section];
    if (items && items.length > 0) {
      console.log('\n=== ' + section.toUpperCase() + ' (' + items.length + ') ===');
      items.forEach(item => {
        console.log('  Code:', item.code);
        console.log('  Desc:', (item.description || '').substring(0, 150));
        console.log('  Evidence:', (item.evidence || '').substring(0, 100));
        console.log();
      });
    }
  });
  
  await conn.end();
}

main().catch(e => console.error('ERROR:', e.message));
