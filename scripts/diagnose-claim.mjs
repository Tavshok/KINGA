import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

const claimNumber = 'DOC-20260420-C186AD2C';

// 1. Check claim record
const [claims] = await conn.query(
  `SELECT id, claim_number, status, workflow_state, document_processing_status, 
          ai_assessment_triggered, ai_assessment_completed, source_document_id,
          vehicle_make, vehicle_model, vehicle_year
   FROM claims WHERE claim_number = ?`,
  [claimNumber]
);
console.log('=== CLAIM RECORD ===');
console.log(JSON.stringify(claims, null, 2));

if (!claims.length) {
  console.log('Claim not found!');
  await conn.end();
  process.exit(1);
}

const claimId = claims[0].id;

// 2. Check ai_assessments record
const [assessments] = await conn.query(
  `SELECT id, claim_id, 
          CHAR_LENGTH(forensic_analysis_json) as forensic_json_length,
          CHAR_LENGTH(damage_analysis_json) as damage_json_length,
          CHAR_LENGTH(fraud_analysis_json) as fraud_json_length,
          decision_authority, report_readiness, consistency_score,
          created_at, updated_at
   FROM ai_assessments WHERE claim_id = ?`,
  [claimId]
);
console.log('\n=== AI ASSESSMENT RECORD ===');
console.log(JSON.stringify(assessments, null, 2));

// 3. Check if forensic_analysis_json is null or empty
if (assessments.length > 0) {
  const [faRows] = await conn.query(
    `SELECT 
       CASE WHEN forensic_analysis_json IS NULL THEN 'NULL' 
            WHEN forensic_analysis_json = '' THEN 'EMPTY'
            WHEN forensic_analysis_json = 'null' THEN 'STRING_NULL'
            ELSE 'HAS_DATA' END as forensic_status,
       CASE WHEN damage_analysis_json IS NULL THEN 'NULL'
            ELSE 'HAS_DATA' END as damage_status,
       CASE WHEN fraud_analysis_json IS NULL THEN 'NULL'
            ELSE 'HAS_DATA' END as fraud_status,
       CASE WHEN cost_analysis_json IS NULL THEN 'NULL'
            ELSE 'HAS_DATA' END as cost_status,
       CASE WHEN decision_authority_json IS NULL THEN 'NULL'
            ELSE 'HAS_DATA' END as decision_status
     FROM ai_assessments WHERE claim_id = ?`,
    [claimId]
  );
  console.log('\n=== JSON FIELD STATUS ===');
  console.log(JSON.stringify(faRows, null, 2));

  // 4. Peek at first 200 chars of forensic_analysis_json
  const [peek] = await conn.query(
    `SELECT LEFT(forensic_analysis_json, 200) as forensic_peek FROM ai_assessments WHERE claim_id = ?`,
    [claimId]
  );
  console.log('\n=== FORENSIC JSON PEEK (first 200 chars) ===');
  console.log(JSON.stringify(peek, null, 2));
}

// 5. Check the byClaim tRPC query — what does it return for this claim?
// Check what the routers.ts byClaim procedure selects
const [byClaimCheck] = await conn.query(
  `SELECT c.id, c.claim_number, c.status, c.ai_assessment_completed,
          a.id as assessment_id,
          CASE WHEN a.forensic_analysis_json IS NULL THEN 'NULL' ELSE 'HAS_DATA' END as fa_status,
          CASE WHEN a.damage_analysis_json IS NULL THEN 'NULL' ELSE 'HAS_DATA' END as da_status
   FROM claims c
   LEFT JOIN ai_assessments a ON a.claim_id = c.id
   WHERE c.claim_number = ?`,
  [claimNumber]
);
console.log('\n=== CLAIM + ASSESSMENT JOIN ===');
console.log(JSON.stringify(byClaimCheck, null, 2));

await conn.end();
