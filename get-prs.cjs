const mysql = require('mysql2/promise');

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  const [rows] = await conn.execute('SELECT pipeline_run_summary FROM ai_assessments WHERE id = 3930001');
  const prs = JSON.parse(rows[0].pipeline_run_summary);
  console.log(JSON.stringify(prs, null, 2).substring(0, 3000));
  await conn.end();
}

main().catch(e => console.error('ERROR:', e.message));
