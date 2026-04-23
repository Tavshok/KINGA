import mysql2 from './node_modules/.pnpm/mysql2@3.14.0/node_modules/mysql2/promise/index.js';

const dbUrl = process.env.DATABASE_URL;
const match = dbUrl.match(/mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);
const [, user, pass, host, port, db] = match;

const conn = await mysql2.createConnection({
  host, port: parseInt(port), user, password: pass, database: db,
  ssl: { rejectUnauthorized: false }
});

const [rows] = await conn.execute(`
  SELECT id, claim_number, document_processing_status, ai_assessment_status,
         pipeline_current_stage, pipeline_stage_count, ai_assessment_started_at,
         updated_at, created_at
  FROM claims WHERE claim_number = 'DOC-20260423-60D9BD9A'
`);

console.log(JSON.stringify(rows, null, 2));

// Also get pipeline logs if any
const [logs] = await conn.execute(`
  SELECT stage_name, status, started_at, completed_at, error_message
  FROM pipeline_stage_logs WHERE claim_id = ?
  ORDER BY started_at ASC
`, [rows[0]?.id]);

console.log('\nPipeline logs:');
console.log(JSON.stringify(logs, null, 2));

await conn.end();
