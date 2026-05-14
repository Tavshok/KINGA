// @ts-nocheck
import { getDb } from "../server/db";
import { sql } from "drizzle-orm";

async function main() {
  const db = await getDb();
  
  // Get the Voltron claim assessments using only real DB columns
  console.log("=== VOLTRON CLAIM (6150002) ASSESSMENTS ===");
  const [voltron] = await db.execute(sql`
    SELECT 
      id, claim_id, fraud_score, fraud_risk_level, confidence_score, recommendation,
      estimated_cost, currency_code, created_at,
      (cost_intelligence_json IS NOT NULL) as has_cost_intel,
      (fraud_score_breakdown_json IS NOT NULL) as has_fraud_breakdown,
      (physics_analysis IS NOT NULL) as has_physics,
      (forensic_analysis IS NOT NULL) as has_forensic,
      (coherence_result_json IS NOT NULL) as has_coherence,
      (cost_realism_json IS NOT NULL) as has_cost_realism,
      (consistency_check_json IS NOT NULL) as has_consistency,
      (contradiction_gate_json IS NOT NULL) as has_contradiction,
      (physics_deviation_score) as phys_dev,
      (damage_photos_json IS NOT NULL) as has_photos,
      (enriched_photos_json IS NOT NULL) as has_enriched,
      (pipeline_run_summary IS NOT NULL) as has_pipeline_summary,
      (claim_record_json IS NOT NULL) as has_claim_record,
      (narrative_analysis_json IS NOT NULL) as has_narrative,
      (damaged_components_json IS NOT NULL) as has_components,
      (repair_intelligence_json IS NOT NULL) as has_repair_intel,
      (parts_reconciliation_json IS NOT NULL) as has_parts_recon,
      (inferred_hidden_damages_json IS NOT NULL) as has_hidden_dmg,
      (photo_inconsistencies_json IS NOT NULL) as has_photo_incon,
      (causal_chain_json IS NOT NULL) as has_causal,
      (evidence_bundle_json IS NOT NULL) as has_evidence,
      (realism_bundle_json IS NOT NULL) as has_realism,
      (benchmark_bundle_json IS NOT NULL) as has_benchmark,
      (consensus_result_json IS NOT NULL) as has_consensus,
      (decision_authority_json IS NOT NULL) as has_decision_auth,
      (report_readiness_json IS NOT NULL) as has_report_ready,
      (fcdi_score) as fcdi,
      (forensic_execution_ledger_json IS NOT NULL) as has_fel,
      (assumption_registry_json IS NOT NULL) as has_assumptions,
      (economic_context_json IS NOT NULL) as has_economic,
      (ife_result_json IS NOT NULL) as has_ife,
      (doe_result_json IS NOT NULL) as has_doe,
      (claim_quality_json IS NOT NULL) as has_quality,
      (forensic_audit_validation_json IS NOT NULL) as has_validation,
      (accuracy_report_json IS NOT NULL) as has_accuracy,
      image_analysis_total_count, image_analysis_success_count, image_analysis_success_rate
    FROM ai_assessments
    WHERE claim_id = 6150002
    ORDER BY id DESC
  `);
  
  for (const a of voltron as any[]) {
    console.log(`\n  Assessment ${a.id} (Claim ${a.claim_id}):`);
    console.log(`    Core: score=${a.fraud_score}, risk=${a.fraud_risk_level}, conf=${a.confidence_score}, rec=${a.recommendation}`);
    console.log(`    Cost: estimated=${a.estimated_cost} ${a.currency_code}`);
    console.log(`    FCDI: ${a.fcdi}, PhysDev: ${a.phys_dev}`);
    console.log(`    Images: total=${a.image_analysis_total_count}, success=${a.image_analysis_success_count}, rate=${a.image_analysis_success_rate}%`);
    
    const fields = {
      'Cost Intelligence': a.has_cost_intel,
      'Fraud Breakdown': a.has_fraud_breakdown,
      'Physics Analysis': a.has_physics,
      'Forensic Analysis': a.has_forensic,
      'Coherence': a.has_coherence,
      'Cost Realism': a.has_cost_realism,
      'Consistency': a.has_consistency,
      'Contradiction': a.has_contradiction,
      'Damage Photos': a.has_photos,
      'Enriched Photos': a.has_enriched,
      'Pipeline Summary': a.has_pipeline_summary,
      'Claim Record': a.has_claim_record,
      'Narrative Analysis': a.has_narrative,
      'Damaged Components': a.has_components,
      'Repair Intelligence': a.has_repair_intel,
      'Parts Reconciliation': a.has_parts_recon,
      'Hidden Damages': a.has_hidden_dmg,
      'Photo Inconsistencies': a.has_photo_incon,
      'Causal Chain': a.has_causal,
      'Evidence Bundle': a.has_evidence,
      'Realism Bundle': a.has_realism,
      'Benchmark Bundle': a.has_benchmark,
      'Consensus': a.has_consensus,
      'Decision Authority': a.has_decision_auth,
      'Report Readiness': a.has_report_ready,
      'FEL': a.has_fel,
      'Assumptions': a.has_assumptions,
      'Economic Context': a.has_economic,
      'IFE': a.has_ife,
      'DOE': a.has_doe,
      'Claim Quality': a.has_quality,
      'Forensic Validation': a.has_validation,
      'Accuracy Report': a.has_accuracy,
    };
    
    let populated = 0;
    let missing = 0;
    const missingList: string[] = [];
    for (const [name, val] of Object.entries(fields)) {
      if (val === 1) { populated++; } else { missing++; missingList.push(name); }
    }
    console.log(`    Fields: ${populated}/${populated + missing} populated`);
    if (missingList.length > 0) {
      console.log(`    Missing: ${missingList.join(', ')}`);
    }
  }
  
  // Check the user's failed claim
  console.log("\n\n=== USER'S FAILED CLAIM (6090046) ===");
  const [failedClaim] = await db.execute(sql`
    SELECT id, claim_number, status, workflow_state, document_processing_status,
           ai_assessment_triggered, ai_assessment_completed, kinga_ref, created_at
    FROM claims WHERE id = 6090046
  `);
  for (const c of failedClaim as any[]) {
    console.log(`  Claim ${c.id}: ${c.claim_number}`);
    console.log(`  Status: ${c.status} | Workflow: ${c.workflow_state}`);
    console.log(`  DocProcessing: ${c.document_processing_status}`);
    console.log(`  AI Triggered: ${c.ai_assessment_triggered} | AI Completed: ${c.ai_assessment_completed}`);
    console.log(`  KINGA Ref: ${c.kinga_ref}`);
    console.log(`  Created: ${c.created_at}`);
  }
  
  // Check the assessment for the failed claim
  console.log("\n=== ASSESSMENT FOR FAILED CLAIM ===");
  const [failedAssess] = await db.execute(sql`
    SELECT id, claim_id, fraud_score, fraud_risk_level, confidence_score, recommendation,
           (cost_intelligence_json IS NOT NULL) as has_cost,
           (physics_analysis IS NOT NULL) as has_physics,
           (forensic_analysis IS NOT NULL) as has_forensic,
           (pipeline_run_summary IS NOT NULL) as has_pipeline,
           created_at
    FROM ai_assessments WHERE claim_id = 6090046 ORDER BY id DESC
  `);
  for (const a of failedAssess as any[]) {
    console.log(`  Assessment ${a.id}: score=${a.fraud_score}, risk=${a.fraud_risk_level}, conf=${a.confidence_score}, rec=${a.recommendation}`);
    console.log(`  Cost: ${a.has_cost ? 'SET' : 'NULL'} | Physics: ${a.has_physics ? 'SET' : 'NULL'} | Forensic: ${a.has_forensic ? 'SET' : 'NULL'} | Pipeline: ${a.has_pipeline ? 'SET' : 'NULL'}`);
  }
  
  // Check recent claims to see if any are stuck
  console.log("\n\n=== RECENT CLAIMS (last 10) ===");
  const [recent] = await db.execute(sql`
    SELECT c.id, c.claim_number, c.status, c.workflow_state, c.document_processing_status,
           c.ai_assessment_triggered, c.ai_assessment_completed, c.created_at,
           (SELECT COUNT(*) FROM ai_assessments a WHERE a.claim_id = c.id) as assess_count
    FROM claims c
    ORDER BY c.id DESC
    LIMIT 10
  `);
  for (const c of recent as any[]) {
    console.log(`  Claim ${c.id}: ${c.claim_number} | Status: ${c.status} | Workflow: ${c.workflow_state} | DocProc: ${c.document_processing_status} | Assessments: ${c.assess_count} | ${c.created_at}`);
  }
  
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
