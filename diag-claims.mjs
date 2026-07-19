import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Get newest claims with status
const [claims] = await conn.execute(`
  SELECT c.id, c.claim_reference, c.status, c.workflow_state, 
    c.document_processing_status, c.ai_assessment_triggered, 
    c.ai_assessment_completed, c.pipeline_current_stage, c.source_document_id
  FROM claims c
  ORDER BY c.id DESC LIMIT 10
`);

for (const c of claims) {
  // Check ingestion_documents for this claim
  const [docs] = await conn.execute(
    'SELECT id, s3_url, file_name, processing_status FROM ingestion_documents WHERE claim_id = ? LIMIT 3',
    [c.id]
  );
  console.log(JSON.stringify({
    id: c.id,
    ref: c.claim_reference,
    status: c.status,
    workflow: c.workflow_state,
    doc_proc: c.document_processing_status,
    ai_triggered: c.ai_assessment_triggered,
    ai_done: c.ai_assessment_completed,
    stage: c.pipeline_current_stage,
    src_doc_id: c.source_document_id,
    doc_count: docs.length,
    docs: docs.map(d => ({ id: d.id, has_s3: !!d.s3_url, name: d.file_name, proc: d.processing_status }))
  }));
}

await conn.end();
