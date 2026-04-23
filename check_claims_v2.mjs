import { createConnection } from 'mysql2/promise';

const dbUrl = process.env.DATABASE_URL;
const url = new URL(dbUrl.replace('mysql://', 'http://'));
const port = url.port || 3306;
const database = url.pathname.slice(1).split('?')[0];

const conn = await createConnection({
  host: url.hostname, port: parseInt(port), user: url.username, 
  password: decodeURIComponent(url.password), database,
  ssl: { rejectUnauthorized: false }
});

// First check the actual column names
const [cols] = await conn.query(`SHOW COLUMNS FROM claims`);
console.log('COLUMNS:', cols.map(c => c.Field).join(', '));

const [rows] = await conn.query(`
  SELECT id, status, document_processing_status, 
         pipeline_current_stage, ai_assessment_started_at, updated_at
  FROM claims 
  ORDER BY created_at DESC LIMIT 10
`);
console.log(JSON.stringify(rows, null, 2));
await conn.end();
