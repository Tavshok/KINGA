import { createConnection } from 'mysql2/promise';
const dbUrl = process.env.DATABASE_URL;
const cleanUrl = dbUrl.split('?')[0];
const match = cleanUrl.match(/mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);
const [, user, pass, host, port, db] = match;
const conn = await createConnection({
  host, port: parseInt(port), user, password: pass, database: db,
  ssl: { rejectUnauthorized: false }
});
const [rows] = await conn.execute(`
  SELECT id, claim_number, document_processing_status, status,
         pipeline_current_stage, ai_assessment_started_at, updated_at
  FROM claims ORDER BY id DESC LIMIT 15
`);
console.log('Recent claims:');
for (const r of rows) {
  console.log(JSON.stringify(r));
}
const [assessments] = await conn.execute(`
  SELECT claim_id, id, created_at, processing_time FROM ai_assessments ORDER BY created_at DESC LIMIT 10
`);
console.log('\nRecent assessments:');
for (const a of assessments) {
  console.log(JSON.stringify(a));
}
await conn.end();
