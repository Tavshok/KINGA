import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Reset the stuck claim so the user can re-trigger AI processing
await conn.query(
  `UPDATE claims SET 
    ai_assessment_triggered = 0, 
    ai_assessment_completed = 0, 
    document_processing_status = 'pending',
    status = 'intake_pending',
    workflow_state = 'intake_queue',
    updated_at = NOW()
  WHERE claim_number = 'DOC-20260418-818D666D'`
);

// Also reset the source document extraction status
await conn.query(
  `UPDATE ingestion_documents SET extraction_status = 'pending' 
   WHERE id = 1620001`
);

console.log('Claim DOC-20260418-818D666D reset to intake_pending. Ready for re-processing.');

// Verify the reset
const [rows] = await conn.query(
  `SELECT id, claim_number, status, workflow_state, document_processing_status, ai_assessment_triggered, ai_assessment_completed 
   FROM claims WHERE claim_number = 'DOC-20260418-818D666D'`
);
console.log(JSON.stringify(rows, null, 2));

await conn.end();
