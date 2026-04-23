import { createConnection } from 'mysql2/promise';

const DATABASE_URL = process.env.DATABASE_URL;

async function main() {
  const conn = await createConnection(DATABASE_URL);

  // Check claim 4590002
  const [claims] = await conn.execute(
    'SELECT id, claim_number, status, document_processing_status, ai_assessment_triggered, ai_assessment_completed, pipeline_current_stage, updated_at FROM claims WHERE id = 4590002 LIMIT 1'
  );
  console.log('\n=== Claim 4590002 ===');
  if (claims.length === 0) {
    console.log('NOT FOUND');
  } else {
    console.log(JSON.stringify(claims[0], null, 2));
  }

  // Check if there's an AI assessment for it
  const [assessments] = await conn.execute(
    'SELECT id, claim_id, created_at FROM ai_assessments WHERE claim_id = 4590002 ORDER BY id DESC LIMIT 3'
  );
  console.log('\n=== AI Assessments for claim 4590002 ===');
  console.log(assessments.length === 0 ? 'NONE' : JSON.stringify(assessments, null, 2));

  // Check recent claims with errors
  const [recentFailed] = await conn.execute(
    `SELECT id, claim_number, status, document_processing_status, ai_assessment_triggered, ai_assessment_completed, updated_at 
     FROM claims 
     WHERE status IN ('assessment_in_progress', 'intake_pending') 
       AND updated_at > DATE_SUB(NOW(), INTERVAL 2 HOUR)
     ORDER BY updated_at DESC LIMIT 10`
  );
  console.log('\n=== Recent claims in progress/pending (last 2h) ===');
  console.log(JSON.stringify(recentFailed, null, 2));

  // Check pipeline_incomplete assessments
  const [incomplete] = await conn.execute(
    `SELECT a.id, a.claim_id, a.created_at, LEFT(a.pipeline_incomplete_json, 200) as err
     FROM ai_assessments a
     WHERE a.pipeline_incomplete_json IS NOT NULL
     ORDER BY a.id DESC LIMIT 5`
  );
  console.log('\n=== Recent pipeline_incomplete assessments ===');
  console.log(JSON.stringify(incomplete, null, 2));

  await conn.end();
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
