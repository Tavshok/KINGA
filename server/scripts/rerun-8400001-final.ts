/**
 * Final re-run for claim 8400001 (DOC-20260626-33B1FDFE) with all four fixes applied.
 * Fixes:
 * 1. Fraud score label calibration: C1 raw cap reduced 130→75, cross_validation→C1 mapping
 * 2. Crush depth: severity anchor (SEVERITY_DERIVED) verified
 * 3. Three-way speed comparison: persisted to cross_validation_json
 * 4. Cost benchmark modelSource: now propagated to compositeLineItems
 */
import "dotenv/config";
import { getClaimByNumber, triggerAiAssessment, getDb } from "../db";
import { aiAssessments } from "../../drizzle/schema";
import { eq, desc } from "drizzle-orm";

async function main() {
  console.log("=== KINGA Final Re-run: Claim 8400001 (DOC-20260626-33B1FDFE) ===\n");
  console.log("Fixes applied:");
  console.log("  1. Fraud score: C1 raw cap 130→75, cross_validation→C1 mapping, damage_pattern_unexplained C1 indicator");
  console.log("  2. Crush depth: SEVERITY_DERIVED anchor verified (55 km/h frontal → 12–32 cm)");
  console.log("  3. Three-way speed comparison: persisted to cross_validation_json");
  console.log("  4. Cost benchmark modelSource: propagated to compositeLineItems\n");

  const claim = await getClaimByNumber("DOC-20260626-33B1FDFE");
  if (!claim) {
    console.error("Claim DOC-20260626-33B1FDFE not found");
    process.exit(1);
  }
  console.log(`Claim found: id=${claim.id}, status=${claim.status}`);
  console.log("Starting pipeline...\n");

  await triggerAiAssessment(claim.id);

  const db = await getDb();
  if (!db) { console.error("No DB"); process.exit(1); }

  const [assessment] = await db.select()
    .from(aiAssessments)
    .where(eq(aiAssessments.claimId, claim.id))
    .orderBy(desc(aiAssessments.createdAt))
    .limit(1);

  if (!assessment) {
    console.error("No assessment found after pipeline run");
    process.exit(1);
  }

  console.log(`\n=== RESULTS: Assessment ${assessment.id} ===\n`);

  // Fraud score
  console.log("--- FRAUD SCORE ---");
  console.log(`fraudScore: ${assessment.fraudScore}`);
  console.log(`fraudRiskLevel: ${assessment.fraudRiskLevel}`);

  // Physics
  const physics = assessment.physicsTruthJson ? JSON.parse(assessment.physicsTruthJson as string) : null;
  if (physics) {
    console.log("\n--- PHYSICS ---");
    console.log(`impactVector.direction: ${physics.impactVector?.direction}`);
    console.log(`speedConsensusKmh: ${physics.speedConsensusKmh}`);
    console.log(`crushDepthPlausibilityCheck.consistent: ${physics.crushDepthPlausibilityCheck?.consistent}`);
    console.log(`crushDepthPlausibilityCheck.primaryAnchorSource: ${physics.crushDepthPlausibilityCheck?.primaryAnchorSource}`);
    console.log(`crushDepthPlausibilityCheck.observedCrushDepthM: ${physics.crushDepthPlausibilityCheck?.observedCrushDepthM}`);
    console.log(`crushDepthPlausibilityCheck.expectedMinM: ${physics.crushDepthPlausibilityCheck?.expectedMinM}`);
    console.log(`crushDepthPlausibilityCheck.expectedMaxM: ${physics.crushDepthPlausibilityCheck?.expectedMaxM}`);
  }

  // Damage classification
  const damageClass = assessment.damageClassificationJson ? JSON.parse(assessment.damageClassificationJson as string) : null;
  if (damageClass) {
    console.log("\n--- DAMAGE CLASSIFICATION ---");
    console.log(`overallClassification: ${damageClass.overallClassification}`);
    console.log(`counts.impossible: ${damageClass.counts?.impossible}`);
    console.log(`counts.possible: ${damageClass.counts?.possible}`);
    console.log(`counts.unexplained: ${damageClass.counts?.unexplained}`);
  }

  // Cross-validation
  const xv = assessment.crossValidationJson ? JSON.parse(assessment.crossValidationJson as string) : null;
  if (xv) {
    console.log("\n--- CROSS-VALIDATION ---");
    console.log(`overallRisk: ${xv.overallRisk}`);
    console.log(`threeWaySpeedComparison:`, JSON.stringify(xv.threeWaySpeedComparison ?? xv.speedComparison ?? 'not found'));
  }

  // Cost
  const ci = assessment.costIntelligenceJson ? JSON.parse(assessment.costIntelligenceJson as string) : null;
  if (ci) {
    console.log("\n--- COST INTELLIGENCE ---");
    console.log(`quoteDeviationPct: ${ci.quoteDeviationPct}`);
    console.log(`benchmarkCoverageComponents: ${ci.benchmarkCoverageComponents}`);
    const compositeItems = ci.compositeOptimisation?.compositeLineItems ?? [];
    const itemsWithModelSource = compositeItems.filter((i: any) => i.benchmarkModelSource != null);
    console.log(`compositeLineItems with benchmarkModelSource: ${itemsWithModelSource.length} / ${compositeItems.length}`);
    if (itemsWithModelSource.length > 0) {
      const sources = [...new Set(itemsWithModelSource.map((i: any) => i.benchmarkModelSource))];
      const vehicleFiltered = itemsWithModelSource.filter((i: any) => i.benchmarkVehicleMakeFiltered === true).length;
      console.log(`  modelSources present: ${sources.join(', ')}`);
      console.log(`  vehicle-make-filtered: ${vehicleFiltered} / ${itemsWithModelSource.length}`);
      console.log(`  first item: ${itemsWithModelSource[0]?.componentName} | modelSource=${itemsWithModelSource[0]?.benchmarkModelSource} | vehicleMakeFiltered=${itemsWithModelSource[0]?.benchmarkVehicleMakeFiltered} | sampleSize=${itemsWithModelSource[0]?.benchmarkSampleSize}`);
    }
  }

  console.log("\n=== DONE ===");
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
