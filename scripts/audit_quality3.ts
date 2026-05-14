// @ts-nocheck
import { getDb } from "../server/db";
import { sql } from "drizzle-orm";

async function main() {
  const db = await getDb();
  
  // Get recent assessments with field population check
  const assessments = await db.execute(sql`
    SELECT 
      id, claim_id, fraud_score, fraud_risk_level, confidence, recommendation,
      total_claim_amount, currency, created_at,
      (composite_optimisation IS NOT NULL) as has_composite_opt,
      (cost_decision IS NOT NULL) as has_cost_decision,
      (physics_analysis IS NOT NULL) as has_physics,
      (fraud_analysis IS NOT NULL) as has_fraud,
      (coherence_result_json IS NOT NULL) as has_coherence,
      (cost_realism_json IS NOT NULL) as has_cost_realism,
      (consistency_check_json IS NOT NULL) as has_consistency,
      (contradiction_gate_json IS NOT NULL) as has_contradiction,
      (forensic_analysis IS NOT NULL) as has_forensic,
      (vehicle_analysis IS NOT NULL) as has_vehicle,
      (damage_analysis IS NOT NULL) as has_damage,
      (narrative_report IS NOT NULL) as has_narrative,
      (physics_deviation_score IS NOT NULL) as has_physics_dev
    FROM ai_assessments
    ORDER BY id DESC
    LIMIT 10
  `);
  
  console.log("=== RECENT ASSESSMENTS ===");
  for (const a of assessments[0] as any[]) {
    const fields = [
      a.has_composite_opt, a.has_cost_decision, a.has_physics, a.has_fraud,
      a.has_coherence, a.has_cost_realism, a.has_consistency, a.has_contradiction,
      a.has_forensic, a.has_vehicle, a.has_damage, a.has_narrative, a.has_physics_dev
    ];
    const populated = fields.filter(f => f === 1).length;
    console.log(`  ID ${a.id} | Claim ${a.claim_id} | Score: ${a.fraud_score ?? 'NULL'} | Risk: ${a.fraud_risk_level ?? 'NULL'} | Conf: ${a.confidence ?? 'NULL'} | Amount: ${a.total_claim_amount ?? 'NULL'} ${a.currency ?? ''} | Fields: ${populated}/13 | ${a.created_at}`);
  }
  
  // Check the Voltron re-run assessment specifically
  console.log("\n=== VOLTRON CLAIM ASSESSMENTS ===");
  const voltron = await db.execute(sql`
    SELECT 
      a.id, a.claim_id, a.fraud_score, a.fraud_risk_level, a.confidence, a.recommendation,
      a.total_claim_amount, a.currency,
      (a.composite_optimisation IS NOT NULL) as has_co,
      (a.cost_decision IS NOT NULL) as has_cd,
      (a.physics_analysis IS NOT NULL) as has_pa,
      (a.fraud_analysis IS NOT NULL) as has_fa,
      (a.coherence_result_json IS NOT NULL) as has_cr,
      (a.cost_realism_json IS NOT NULL) as has_crj,
      (a.consistency_check_json IS NOT NULL) as has_cc,
      (a.contradiction_gate_json IS NOT NULL) as has_cg,
      (a.physics_deviation_score) as phys_dev,
      (a.forensic_analysis IS NOT NULL) as has_for,
      (a.vehicle_analysis IS NOT NULL) as has_va,
      (a.damage_analysis IS NOT NULL) as has_da,
      (a.narrative_report IS NOT NULL) as has_nr,
      a.created_at
    FROM ai_assessments a
    WHERE a.claim_id IN (6150002, 6120001)
    ORDER BY a.id DESC
  `);
  
  for (const a of (voltron[0] as any[])) {
    console.log(`  Assessment ${a.id} (Claim ${a.claim_id}):`);
    console.log(`    Score: ${a.fraud_score}, Risk: ${a.fraud_risk_level}, Conf: ${a.confidence}, Rec: ${a.recommendation}`);
    console.log(`    Amount: ${a.total_claim_amount} ${a.currency}`);
    console.log(`    CompositeOpt: ${a.has_co ? 'SET' : 'NULL'} | CostDecision: ${a.has_cd ? 'SET' : 'NULL'}`);
    console.log(`    Physics: ${a.has_pa ? 'SET' : 'NULL'} | PhysDev: ${a.phys_dev ?? 'NULL'}`);
    console.log(`    Fraud: ${a.has_fa ? 'SET' : 'NULL'}`);
    console.log(`    Coherence: ${a.has_cr ? 'SET' : 'NULL'} | CostRealism: ${a.has_crj ? 'SET' : 'NULL'}`);
    console.log(`    Consistency: ${a.has_cc ? 'SET' : 'NULL'} | Contradiction: ${a.has_cg ? 'SET' : 'NULL'}`);
    console.log(`    Forensic: ${a.has_for ? 'SET' : 'NULL'} | Vehicle: ${a.has_va ? 'SET' : 'NULL'} | Damage: ${a.has_da ? 'SET' : 'NULL'}`);
    console.log(`    Narrative: ${a.has_nr ? 'SET' : 'NULL'}`);
  }
  
  // Check the failed user claim
  console.log("\n=== FAILED USER CLAIM (6090046) ===");
  const failed = await db.execute(sql`
    SELECT id, claim_number, status, workflow_state, document_processing_status,
           ai_assessment_triggered, ai_assessment_completed, kinga_ref
    FROM claims WHERE id = 6090046
  `);
  for (const c of (failed[0] as any[])) {
    console.log(`  Claim ${c.id}: ${c.claim_number} | Status: ${c.status} | Workflow: ${c.workflow_state}`);
    console.log(`  DocProcessing: ${c.document_processing_status} | AI Triggered: ${c.ai_assessment_triggered} | AI Completed: ${c.ai_assessment_completed}`);
    console.log(`  KINGA Ref: ${c.kinga_ref}`);
  }
  
  // Check all claims in intake_pending or processing state
  console.log("\n=== CLAIMS IN PROCESSING STATE ===");
  const processing = await db.execute(sql`
    SELECT id, claim_number, status, workflow_state, document_processing_status, kinga_ref, created_at
    FROM claims 
    WHERE status IN ('intake_pending', 'processing', 'intake_queue')
    ORDER BY id DESC
    LIMIT 10
  `);
  for (const c of (processing[0] as any[])) {
    console.log(`  Claim ${c.id}: ${c.claim_number} | Status: ${c.status} | Workflow: ${c.workflow_state} | DocProc: ${c.document_processing_status} | ${c.created_at}`);
  }
  
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
