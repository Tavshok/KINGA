import { createConnection } from "mysql2/promise";
import * as dotenv from "dotenv";
dotenv.config();

async function main() {
  const db = await createConnection(process.env.DATABASE_URL!);
  
  // Check claims stuck in various states
  const [stuck] = await db.execute(`
    SELECT id, claim_number, status, document_processing_status, workflow_state, 
           pipeline_current_stage, ai_assessment_triggered, ai_assessment_completed,
           updated_at
    FROM claims 
    WHERE status IN ('ai_processing', 'intake_pending', 'assessment_complete')
    OR document_processing_status IN ('parsing', 'extracting', 'analysing')
    ORDER BY updated_at DESC
    LIMIT 20
  `);
  console.log("=== CLAIMS STATUS ===");
  console.log(JSON.stringify(stuck, null, 2));
  
  // Check ai_assessments for any with null pipeline_run_summary
  const [assessments] = await db.execute(`
    SELECT a.id, a.claim_id, a.fraud_score, a.recommendation, a.estimated_cost,
           a.model_version, a.processing_time,
           CASE WHEN a.pipeline_run_summary IS NULL THEN 'NULL' ELSE 'HAS_DATA' END as has_summary,
           a.updated_at
    FROM ai_assessments a
    ORDER BY a.updated_at DESC
    LIMIT 10
  `);
  console.log("\n=== AI ASSESSMENTS ===");
  console.log(JSON.stringify(assessments, null, 2));
  
  await db.end();
}

main().catch(console.error);
