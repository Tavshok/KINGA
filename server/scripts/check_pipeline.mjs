import mysql from 'mysql2/promise';

const url = process.env.DATABASE_URL;
const match = url.match(/mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)/);
const [, user, pass, host, port, db] = match;

const conn = await mysql.createConnection({
  host, port: parseInt(port), user, password: pass, database: db,
  ssl: { rejectUnauthorized: false }
});

// Check claim 11349902
const [rows] = await conn.execute(
  `SELECT id, claim_id, pipeline_run_summary, created_at FROM ai_assessments WHERE claim_id = 11349902 ORDER BY created_at DESC LIMIT 3`
);
console.log('=== AI Assessments for claim 11349902 ===');
for (const r of rows) {
  console.log('ID:', r.id, 'Created:', r.created_at);
  if (r.pipeline_run_summary) {
    try { console.log('Summary:', JSON.parse(r.pipeline_run_summary)); } 
    catch { console.log('Summary (raw):', r.pipeline_run_summary?.substring(0, 500)); }
  }
}

// Check the claim itself
const [claims] = await conn.execute(
  `SELECT id, claim_number, status, workflow_state, document_processing_status, tenant_id, source_document_id FROM claims WHERE id = 11349902`
);
console.log('\n=== Claim 11349902 ===');
console.log(claims[0]);

// Check ingestion document
if (claims[0]?.source_document_id) {
  const [docs] = await conn.execute(
    `SELECT id, original_filename, s3_url, extraction_status, validation_status FROM ingestion_documents WHERE id = ?`,
    [claims[0].source_document_id]
  );
  console.log('\n=== Source Document ===');
  console.log(docs[0]);
}

await conn.end();
