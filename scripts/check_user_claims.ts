// @ts-nocheck
import { getDb } from "../server/db";
import { sql } from "drizzle-orm";

async function main() {
  const db = await getDb();
  
  // Find ALL claims for the user's real tenant
  const [claims] = await db.execute(sql`
    SELECT c.id, c.claim_number, c.kinga_ref, c.tenant_id, c.source_document_id,
           c.claim_source, c.workflow_state, c.ai_assessment_triggered,
           c.ai_assessment_completed, c.document_processing_status,
           c.created_at, c.assigned_processor_id,
           LEFT(c.external_assessment_url, 100) as ext_url,
           LEFT(c.damage_photos, 100) as photos_preview
    FROM claims c
    WHERE c.tenant_id = 'tenant-1771335377063'
    ORDER BY c.id DESC
    LIMIT 30
  `);
  
  console.log("=== USER'S REAL CLAIMS (tenant-1771335377063) ===\n");
  for (const c of claims as any[]) {
    console.log(`Claim ${c.id} | ${c.claim_number} | ${c.kinga_ref || 'no-ref'}`);
    console.log(`  source: ${c.claim_source} | state: ${c.workflow_state} | docStatus: ${c.document_processing_status}`);
    console.log(`  sourceDocId: ${c.source_document_id} | aiTriggered: ${c.ai_assessment_triggered} | aiDone: ${c.ai_assessment_completed}`);
    console.log(`  processor: ${c.assigned_processor_id} | created: ${c.created_at}`);
    console.log(`  extUrl: ${c.ext_url || 'NULL'}`);
    console.log(`  photos: ${c.photos_preview || 'NULL'}`);
    console.log('');
  }
  
  // Check assessments for these claims
  const [assessments] = await db.execute(sql`
    SELECT a.id, a.claim_id, a.fraud_score, a.confidence_score, a.recommendation,
           a.fraud_risk_level, a.fcdi_score,
           CASE WHEN a.cost_intelligence_json IS NOT NULL THEN 'SET' ELSE 'NULL' END as cost_intel,
           CASE WHEN a.physics_analysis IS NOT NULL THEN 'SET' ELSE 'NULL' END as physics,
           CASE WHEN a.forensic_analysis_json IS NOT NULL THEN 'SET' ELSE 'NULL' END as forensic,
           CASE WHEN a.pipeline_run_summary IS NOT NULL THEN 'SET' ELSE 'NULL' END as pipeline_summary,
           CASE WHEN a.coherence_result_json IS NOT NULL THEN 'SET' ELSE 'NULL' END as coherence,
           CASE WHEN a.cost_realism_json IS NOT NULL THEN 'SET' ELSE 'NULL' END as cost_realism,
           CASE WHEN a.consistency_check_json IS NOT NULL THEN 'SET' ELSE 'NULL' END as consistency,
           CASE WHEN a.contradiction_gate_json IS NOT NULL THEN 'SET' ELSE 'NULL' END as contradiction,
           a.created_at
    FROM ai_assessments a
    JOIN claims c ON a.claim_id = c.id
    WHERE c.tenant_id = 'tenant-1771335377063'
    ORDER BY a.id DESC
    LIMIT 20
  `);
  
  console.log("\n=== ASSESSMENTS FOR USER'S CLAIMS ===\n");
  for (const a of assessments as any[]) {
    console.log(`Assessment ${a.id} | Claim ${a.claim_id}`);
    console.log(`  score: ${a.fraud_score} | conf: ${a.confidence_score} | rec: ${a.recommendation} | risk: ${a.fraud_risk_level} | fcdi: ${a.fcdi_score}`);
    console.log(`  cost_intel: ${a.cost_intel} | physics: ${a.physics} | forensic: ${a.forensic} | pipeline: ${a.pipeline_summary}`);
    console.log(`  coherence: ${a.coherence} | cost_realism: ${a.cost_realism} | consistency: ${a.consistency} | contradiction: ${a.contradiction}`);
    console.log(`  created: ${a.created_at}`);
    console.log('');
  }
  
  // Check claim 6090046 specifically
  const [claim6090046] = await db.execute(sql`
    SELECT id, claim_number, tenant_id, source_document_id, claim_source, workflow_state,
           ai_assessment_triggered, ai_assessment_completed, document_processing_status,
           LEFT(damage_photos, 200) as photos
    FROM claims WHERE id = 6090046
  `);
  console.log("\n=== CLAIM 6090046 ===");
  for (const c of claim6090046 as any[]) {
    console.log(`  tenant: ${c.tenant_id} | source: ${c.claim_source} | state: ${c.workflow_state}`);
    console.log(`  sourceDocId: ${c.source_document_id} | aiTriggered: ${c.ai_assessment_triggered}`);
    console.log(`  photos: ${c.photos}`);
  }
  
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
