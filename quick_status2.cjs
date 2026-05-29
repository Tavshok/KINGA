const mysql = require('mysql2/promise');
async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  const [rows] = await conn.query(`
    SELECT id, ai_assessment_completed, document_processing_status, updated_at
    FROM claims WHERE id = 6930001
  `);
  console.log('Claim status:', JSON.stringify(rows[0], null, 2));
  
  const [assessments] = await conn.query(`
    SELECT id, created_at FROM ai_assessments 
    WHERE claim_id = 6930001 ORDER BY id DESC LIMIT 3
  `);
  console.log('Latest assessments:', assessments.map(a => `ID=${a.id} ${a.created_at}`).join(', '));
  
  await conn.end();
}
main().catch(console.error);
