import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [rows] = await conn.query(
  `SELECT id, claim_number, status, workflow_state, document_processing_status, 
   ai_assessment_triggered, ai_assessment_completed, extraction_retry_count, 
   source_document_id, created_at, updated_at 
   FROM claims 
   WHERE claim_number LIKE '%818D666D%' 
   LIMIT 5`
);
console.log("=== Stuck Claim Status ===");
console.log(JSON.stringify(rows, null, 2));

// Also check all recent claims in ai_processing state
const [processing] = await conn.query(
  `SELECT id, claim_number, status, workflow_state, document_processing_status, 
   ai_assessment_triggered, ai_assessment_completed, created_at, updated_at 
   FROM claims 
   WHERE document_processing_status IN ('parsing', 'pending') 
   OR (ai_assessment_triggered = 1 AND ai_assessment_completed = 0)
   ORDER BY created_at DESC LIMIT 10`
);
console.log("\n=== All Claims in Processing State ===");
console.log(JSON.stringify(processing, null, 2));

// Check if source document extraction status is blocking
if (rows.length > 0 && rows[0].source_document_id) {
  const [docs] = await conn.query(
    `SELECT id, extraction_status, validation_status, original_filename, created_at 
     FROM ingestion_documents WHERE id = ?`,
    [rows[0].source_document_id]
  );
  console.log("\n=== Source Document Status ===");
  console.log(JSON.stringify(docs, null, 2));
}

await conn.end();
