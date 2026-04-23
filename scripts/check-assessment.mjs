import { createConnection } from 'mysql2/promise';

const DATABASE_URL = process.env.DATABASE_URL;

async function main() {
  const conn = await createConnection(DATABASE_URL);

  // Get column names for ai_assessments
  const [cols] = await conn.execute('SHOW COLUMNS FROM ai_assessments');
  const colNames = cols.map(c => c.Field);
  console.log('=== ai_assessments columns ===');
  console.log(colNames.join(', '));

  // Get assessment 4200002 key fields
  const [rows] = await conn.execute(`
    SELECT 
      id, claim_id, confidence_score, estimated_cost,
      accident_type,
      LEFT(claim_record_json, 300) as cr_snippet,
      LEFT(cost_intelligence_json, 300) as ci_snippet,
      LEFT(forensic_analysis, 300) as fa_snippet,
      LEFT(claim_quality_json, 300) as cq_snippet,
      LEFT(forensic_audit_validation_json, 300) as fav_snippet
    FROM ai_assessments
    WHERE id = 4200002
  `);
  console.log('\n=== Assessment 4200002 ===');
  console.log(JSON.stringify(rows[0], null, 2));

  // Check if pipeline_incomplete_json column exists
  if (colNames.includes('pipeline_incomplete_json')) {
    const [inc] = await conn.execute('SELECT LEFT(pipeline_incomplete_json, 300) as inc FROM ai_assessments WHERE id = 4200002');
    console.log('\n=== pipeline_incomplete_json ===');
    console.log(inc[0]?.inc ?? 'NULL');
  }

  await conn.end();
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
