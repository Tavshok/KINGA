// @ts-nocheck
import { getDb } from "../server/db";
import { aiAssessments, claims } from "../drizzle/schema";
import { eq, desc, sql } from "drizzle-orm";

async function main() {
  const db = await getDb();
  
  // Get ALL recent assessments
  const assessments = await db
    .select({
      id: aiAssessments.id,
      claimId: aiAssessments.claimId,
      fraudScore: aiAssessments.fraudScore,
      fraudRiskLevel: aiAssessments.fraudRiskLevel,
      confidence: aiAssessments.confidence,
      recommendation: aiAssessments.recommendation,
      totalClaimAmount: aiAssessments.totalClaimAmount,
      currency: aiAssessments.currency,
      hasCompositeOpt: sql`CASE WHEN composite_optimisation IS NOT NULL THEN 1 ELSE 0 END`,
      hasCostDecision: sql`CASE WHEN cost_decision IS NOT NULL THEN 1 ELSE 0 END`,
      hasPhysics: sql`CASE WHEN physics_analysis IS NOT NULL THEN 1 ELSE 0 END`,
      hasFraud: sql`CASE WHEN fraud_analysis IS NOT NULL THEN 1 ELSE 0 END`,
      hasCoherence: sql`CASE WHEN coherence_result_json IS NOT NULL THEN 1 ELSE 0 END`,
      hasCostRealism: sql`CASE WHEN cost_realism_json IS NOT NULL THEN 1 ELSE 0 END`,
      hasConsistency: sql`CASE WHEN consistency_check_json IS NOT NULL THEN 1 ELSE 0 END`,
      hasContradiction: sql`CASE WHEN contradiction_gate_json IS NOT NULL THEN 1 ELSE 0 END`,
      hasForensic: sql`CASE WHEN forensic_analysis IS NOT NULL THEN 1 ELSE 0 END`,
      hasVehicle: sql`CASE WHEN vehicle_analysis IS NOT NULL THEN 1 ELSE 0 END`,
      hasDamage: sql`CASE WHEN damage_analysis IS NOT NULL THEN 1 ELSE 0 END`,
      hasNarrative: sql`CASE WHEN narrative_report IS NOT NULL THEN 1 ELSE 0 END`,
      createdAt: aiAssessments.createdAt,
    })
    .from(aiAssessments)
    .orderBy(desc(aiAssessments.id))
    .limit(10);
  
  console.log("=== RECENT ASSESSMENTS ===");
  for (const a of assessments) {
    const fields = [
      a.hasCompositeOpt, a.hasCostDecision, a.hasPhysics, a.hasFraud,
      a.hasCoherence, a.hasCostRealism, a.hasConsistency, a.hasContradiction,
      a.hasForensic, a.hasVehicle, a.hasDamage, a.hasNarrative
    ];
    const populated = fields.filter(f => f === 1 || f === '1').length;
    console.log(`  ID ${a.id} | Claim ${a.claimId} | Score: ${a.fraudScore ?? 'NULL'} | Risk: ${a.fraudRiskLevel ?? 'NULL'} | Conf: ${a.confidence ?? 'NULL'} | Amount: ${a.totalClaimAmount ?? 'NULL'} ${a.currency ?? ''} | Fields: ${populated}/12 | ${a.createdAt}`);
  }
  
  // Check claim 6150002 (our Voltron re-run) specifically
  console.log("\n=== VOLTRON CLAIM (6150002) ASSESSMENT ===");
  const voltronAssessments = await db
    .select()
    .from(aiAssessments)
    .where(eq(aiAssessments.claimId, 6150002))
    .orderBy(desc(aiAssessments.id));
  
  for (const a of voltronAssessments) {
    console.log(`  Assessment ${a.id}: score=${a.fraudScore}, risk=${a.fraudRiskLevel}, conf=${a.confidence}, rec=${a.recommendation}`);
    console.log(`    amount=${a.totalClaimAmount} ${a.currency}`);
    console.log(`    compositeOpt=${a.compositeOptimisation ? 'SET' : 'NULL'}`);
    console.log(`    costDecision=${a.costDecision ? 'SET' : 'NULL'}`);
    console.log(`    physics=${a.physicsAnalysis ? 'SET' : 'NULL'}`);
    console.log(`    fraud=${a.fraudAnalysis ? 'SET' : 'NULL'}`);
    console.log(`    coherence=${a.coherenceResultJson ? 'SET' : 'NULL'}`);
    console.log(`    costRealism=${a.costRealismJson ? 'SET' : 'NULL'}`);
    console.log(`    consistency=${a.consistencyCheckJson ? 'SET' : 'NULL'}`);
    console.log(`    contradiction=${a.contradictionGateJson ? 'SET' : 'NULL'}`);
    console.log(`    forensic=${a.forensicAnalysis ? 'SET' : 'NULL'}`);
    console.log(`    vehicle=${a.vehicleAnalysis ? 'SET' : 'NULL'}`);
    console.log(`    damage=${a.damageAnalysis ? 'SET' : 'NULL'}`);
    console.log(`    narrative=${a.narrativeReport ? 'SET' : 'NULL'}`);
  }
  
  // Also check the failed user claim (6090046)
  console.log("\n=== FAILED USER CLAIM (6090046) ===");
  const [failedClaim] = await db
    .select({
      id: claims.id,
      claimNumber: claims.claimNumber,
      status: claims.status,
      workflowState: claims.workflowState,
      documentProcessingStatus: claims.documentProcessingStatus,
      aiAssessmentTriggered: claims.aiAssessmentTriggered,
      aiAssessmentCompleted: claims.aiAssessmentCompleted,
    })
    .from(claims)
    .where(eq(claims.id, 6090046));
  
  if (failedClaim) {
    console.log(`  Status: ${failedClaim.status}`);
    console.log(`  Workflow: ${failedClaim.workflowState}`);
    console.log(`  DocProcessing: ${failedClaim.documentProcessingStatus}`);
    console.log(`  AI Triggered: ${failedClaim.aiAssessmentTriggered}`);
    console.log(`  AI Completed: ${failedClaim.aiAssessmentCompleted}`);
  } else {
    console.log("  Claim not found");
  }
  
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
