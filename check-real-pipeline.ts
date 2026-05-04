import { createConnection } from "mysql2/promise";

async function main() {
  const db = await createConnection(process.env.DATABASE_URL!);
  
  // Count assessments with real pipeline data
  const [counts] = await db.execute(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN pipeline_run_summary IS NOT NULL AND pipeline_run_summary != 'null' THEN 1 ELSE 0 END) as has_summary,
      SUM(CASE WHEN fraud_score IS NOT NULL THEN 1 ELSE 0 END) as has_fraud_score,
      SUM(CASE WHEN recommendation IS NOT NULL THEN 1 ELSE 0 END) as has_recommendation,
      SUM(CASE WHEN model_version IS NOT NULL THEN 1 ELSE 0 END) as has_model_version,
      SUM(CASE WHEN model_version = 'pipeline-v2' THEN 1 ELSE 0 END) as real_pipeline_v2,
      SUM(CASE WHEN model_version LIKE '%-seed' OR model_version LIKE '%-simulation' THEN 1 ELSE 0 END) as seeded
    FROM ai_assessments
  `);
  console.log("=== ASSESSMENT PIPELINE STATUS ===");
  console.log(JSON.stringify(counts, null, 2));
  
  // Get a sample of real pipeline-v2 assessments
  const [samples] = await db.execute(`
    SELECT id, claim_id, fraud_score, recommendation, model_version, 
           LEFT(pipeline_run_summary, 100) as summary_preview,
           updated_at
    FROM ai_assessments 
    WHERE model_version = 'pipeline-v2'
    ORDER BY updated_at DESC LIMIT 5
  `);
  console.log("\n=== SAMPLE REAL PIPELINE-V2 ASSESSMENTS ===");
  console.log(JSON.stringify(samples, null, 2));
  
  // Check claims that are currently in pipeline states
  const [activePipeline] = await db.execute(`
    SELECT c.id, c.claim_number, c.status, c.document_processing_status, c.workflow_state,
           c.ai_assessment_triggered, c.updated_at
    FROM claims c
    WHERE c.document_processing_status IN ('parsing', 'extracting', 'analysing')
    ORDER BY c.updated_at DESC LIMIT 10
  `);
  console.log("\n=== CLAIMS CURRENTLY IN PIPELINE ===");
  console.log(JSON.stringify(activePipeline, null, 2));
  
  await db.end();
}
main().catch(console.error);
