import { createConnection } from 'mysql2/promise';
const dbUrl = process.env.DATABASE_URL;
const cleanUrl = dbUrl.split('?')[0];
const match = cleanUrl.match(/mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);
const [, user, pass, host, port, db] = match;
const conn = await createConnection({
  host, port: parseInt(port), user, password: pass, database: db,
  ssl: { rejectUnauthorized: false }
});
// Reset stuck claims (4590007, 4590008, 4590010) to intake_pending so they can be retried
const stuckIds = [4590007, 4590008, 4590010];
for (const id of stuckIds) {
  const [result] = await conn.execute(
    `UPDATE claims SET status='intake_pending', document_processing_status='pending', pipeline_current_stage=NULL, ai_assessment_started_at=NULL, updated_at=NOW() WHERE id=?`,
    [id]
  );
  console.log(`Reset claim ${id}: ${result.affectedRows} row(s) updated`);
}
await conn.end();
console.log('Done');
