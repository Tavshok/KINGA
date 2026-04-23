import { createConnection } from 'mysql2/promise';

const dbUrl = process.env.DATABASE_URL;
const match = dbUrl.match(/mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);
const [, user, pass, host, port, db] = match;

const conn = await createConnection({
  host, port: parseInt(port), user, password: pass, database: db,
  ssl: { rejectUnauthorized: false }
});

const [rows] = await conn.execute(`
  SELECT id, claim_number, document_processing_status, ai_assessment_status,
         pipeline_current_stage, ai_assessment_started_at, updated_at, created_at
  FROM claims WHERE claim_number = 'DOC-20260423-60D9BD9A'
`);
console.log('Claim state:', JSON.stringify(rows[0], null, 2));

if (rows[0]) {
  const claimId = rows[0].id;
  // Check if assessment was inserted
  const [assessments] = await conn.execute(
    `SELECT id, created_at, processing_time FROM ai_assessments WHERE claim_id = ? ORDER BY created_at DESC LIMIT 3`,
    [claimId]
  );
  console.log('Assessments:', JSON.stringify(assessments, null, 2));
}

await conn.end();
