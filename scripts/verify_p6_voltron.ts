/**
 * verify_p6_voltron.ts
 * Re-runs LIVE-RUN-VOLTRON-001 (claim id=8880001) through the full pipeline
 * to verify P6 live: visionSourceReliability is stored in physics_analysis,
 * visionCrushDepthM is excluded when reliability is LOW/NONE.
 *
 * Run: npx tsx scripts/verify_p6_voltron.ts 2>&1 | tee /tmp/p6-verify.log
 */
import { triggerAiAssessment, getDb } from "../server/db";
import { aiAssessments } from "../drizzle/schema";
import { eq, desc } from "drizzle-orm";

const CLAIM_ID = 8880001;

async function main() {
  console.log(`[P6-Verify] Starting pipeline re-run for LIVE-RUN-VOLTRON-001 (claim ${CLAIM_ID})...`);
  console.log(`[P6-Verify] Watch for: [P6] visionSourceReliability=LOW`);
  console.log(`[P6-Verify] -------------------------------------------------`);
  const startTime = Date.now();

  try {
    await triggerAiAssessment(CLAIM_ID);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n[P6-Verify] Pipeline completed in ${elapsed}s`);
  } catch (err: any) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`\n[P6-Verify] Pipeline failed after ${elapsed}s: ${err?.message ?? err}`);
    process.exit(1);
  }

  const db = await getDb();
  if (!db) { console.log("[P6-Verify] No DB -- cannot check results"); process.exit(0); }

  // Get the latest assessment for this claim
  const [assessment] = await db.select({
    id: aiAssessments.id,
    claimId: aiAssessments.claimId,
    forensicAnalysis: aiAssessments.forensicAnalysis,
    physicsAnalysis: aiAssessments.physicsAnalysis,
  }).from(aiAssessments)
    .where(eq(aiAssessments.claimId, CLAIM_ID))
    .orderBy(desc(aiAssessments.id))
    .limit(1);

  if (!assessment) {
    console.error("[P6-Verify] No assessment found after re-run");
    process.exit(1);
  }

  console.log(`\n[P6-Verify] Assessment ID: ${assessment.id}`);

  // Parse physics_analysis JSON
  const physics = typeof assessment.physicsAnalysis === 'string'
    ? JSON.parse(assessment.physicsAnalysis)
    : assessment.physicsAnalysis;

  // Check 1: visionSourceReliability in physics_analysis
  // (stored here because Stage 7 reads it to gate the speed ensemble)
  const vsr = physics?.visionSourceReliability ?? null;
  console.log(`[P6-Verify] visionSourceReliability (physics_analysis): ${JSON.stringify(vsr)}`);
  if (vsr === 'HIGH' || vsr === 'MEDIUM' || vsr === 'LOW' || vsr === 'NONE') {
    console.log(`[P6-Verify] P6 PASS: visionSourceReliability correctly stored as '${vsr}'`);
    if (vsr === 'HIGH') {
      console.log('[P6-Verify] INFO: HIGH = confirmed damage photos (cache_rehydration path) -- amber banner will NOT show (correct)');
    } else if (vsr === 'LOW' || vsr === 'NONE') {
      console.log('[P6-Verify] INFO: LOW/NONE = fallback path -- amber banner WILL show (correct)');
    }
  } else {
    console.log(`[P6-Verify] FAIL: visionSourceReliability is null -- persistence fix not applied`);
  }

  // Check 2: consensusSpeedKmh in physics_analysis
  const ensemble = physics?.speedInferenceEnsemble;
  console.log(`[P6-Verify] consensusSpeedKmh: ${ensemble?.consensusSpeedKmh ?? 'null'}`);
  console.log(`[P6-Verify] methodsRan: ${ensemble?.methodsRan ?? 'null'}`);
  console.log(`[P6-Verify] overallConfidence: ${ensemble?.overallConfidence ?? 'null'}`);
  console.log(`[P6-Verify] Methods ran:`);
  (ensemble?.methods ?? []).forEach((m: any) => {
    if (m.ran) console.log(`  YES ${m.method}: ${m.speedKmh ?? m.lowerBoundKmh ?? 'lower-bound'} km/h (weight: ${m.confidenceWeight})`);
    else console.log(`  NO  ${m.method}: did not run`);
  });

  // Check 3: visionCrushDepthM should be null/excluded
  const visionCrushDepth = physics?.physicsNumerical?.visionCrushDepthM ?? physics?.visionCrushDepthM ?? null;
  console.log(`[P6-Verify] visionCrushDepthM in physics output: ${JSON.stringify(visionCrushDepth)}`);
  if (visionCrushDepth === null || visionCrushDepth === undefined) {
    console.log(`[P6-Verify] P6 PASS: visionCrushDepthM correctly excluded from physics consensus`);
  } else {
    console.log(`[P6-Verify] WARNING: visionCrushDepthM is still present: ${visionCrushDepth} -- P6 gating may not have fired`);
  }

  console.log(`\n[P6-Verify] -------------------------------------------------`);
  console.log(`[P6-Verify] Done.`);
}

main().catch(err => {
  console.error("[P6-Verify] Fatal:", err);
  process.exit(1);
});
