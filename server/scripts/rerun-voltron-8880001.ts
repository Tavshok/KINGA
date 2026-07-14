/**
 * Re-run VOLTRON claim 8880001 (LIVE-RUN-VOLTRON-001) directly.
 * Run: cd /home/ubuntu/kinga-replit && npx tsx server/scripts/rerun-voltron-8880001.ts
 */
import "dotenv/config";
import { getDb } from "../db";
import { triggerAiAssessment } from "../db";
import { sql } from "drizzle-orm";

const CLAIM_ID = 8880001;

async function main() {
  const db = await getDb();
  if (!db) { console.error("No DB"); process.exit(1); }

  const rows = await db.execute(sql`
    SELECT id, claim_number, status, document_processing_status
    FROM claims WHERE id = ${CLAIM_ID}
  `);
  const list = Array.isArray((rows as any)[0]) ? (rows as any)[0] : rows;
  const row = list[0] as any;
  if (!row) { console.error(`Claim ${CLAIM_ID} not found`); process.exit(1); }
  console.log(`Found: ${row.id} | ${row.claim_number} | status=${row.status} | doc_status=${row.document_processing_status}`);
  console.log(`\nTriggering AI assessment for claim ${CLAIM_ID}...`);
  console.log("This will take 3-5 minutes. Watch for Stage 7 speed inference output.\n");

  await triggerAiAssessment(CLAIM_ID);
  console.log(`\n✅ Assessment complete for claim ${CLAIM_ID}`);

  // Read back the new physics data
  const physRows = await db.execute(sql`
    SELECT a.id,
      JSON_EXTRACT(a.physics_analysis, '$.speedInferenceEnsemble.consensusSpeedKmh') as consensus_speed,
      JSON_EXTRACT(a.physics_analysis, '$.speedInferenceEnsemble.overallConfidence') as confidence,
      JSON_EXTRACT(a.physics_analysis, '$.speedInferenceEnsemble.confidenceInterval') as ci,
      JSON_EXTRACT(a.physics_analysis, '$.speedInferenceEnsemble.lowerBoundKmh') as lower_bound,
      JSON_EXTRACT(a.physics_analysis, '$.speedForensics.claimedSpeedKmh') as claimed_speed,
      JSON_EXTRACT(a.physics_analysis, '$.speedForensics.deviationClass') as deviation_class,
      JSON_EXTRACT(a.physics_analysis, '$.speedForensics.deviationPct') as deviation_pct,
      JSON_EXTRACT(a.physics_analysis, '$.speedForensics.riskScoreContribution') as risk_contribution,
      JSON_EXTRACT(a.physics_analysis, '$.speedForensics.interpretation') as interpretation
    FROM ai_assessments a
    WHERE a.claim_id = ${CLAIM_ID}
    ORDER BY a.id DESC LIMIT 1
  `);
  const pList = Array.isArray((physRows as any)[0]) ? (physRows as any)[0] : physRows;
  const p = pList[0] as any;
  if (!p) { console.log("No physics data found after re-run"); process.exit(1); }

  console.log("\n=== NEW PHYSICS DATA ===");
  console.log("consensusSpeedKmh:", p.consensus_speed);
  console.log("overallConfidence:", p.confidence);
  console.log("confidenceInterval:", p.ci);
  console.log("lowerBoundKmh:", p.lower_bound);
  console.log("claimedSpeedKmh:", p.claimed_speed);
  console.log("deviationClass:", p.deviation_class);
  console.log("deviationPct:", p.deviation_pct);
  console.log("riskScoreContribution:", p.risk_contribution);
  console.log("interpretation:", p.interpretation);

  // Compute P1 braking coherence
  const claimedSpeed = parseFloat(p.claimed_speed ?? "0");
  const displaySpeed = parseFloat(p.consensus_speed ?? "0");
  if (claimedSpeed > displaySpeed && displaySpeed > 0) {
    const mu = 0.7, g = 9.81;
    const vStated = claimedSpeed / 3.6;
    const vImpact = displaySpeed / 3.6;
    const Z = (vStated * vStated - vImpact * vImpact) / (2 * mu * g);
    console.log("\n=== P1 BRAKING COHERENCE ===");
    console.log(`Z = ${Z.toFixed(1)} m  →  Note fires: ${Z > 5 ? "YES ✅" : "NO (Z ≤ 5m)"}`);
    if (Z > 5) {
      console.log(`Text: "Stated travel speed ${claimedSpeed} km/h is consistent with the physics lower bound of ${Math.round(displaySpeed)} km/h if the vehicle decelerated over approximately ${Math.round(Z)} m before impact (assuming μ = 0.7 tarmac surface, no pre-impact braking modelled)."`);
    }
  } else {
    console.log("\n=== P1 BRAKING COHERENCE ===");
    console.log("Note fires: NO (claimedSpeed ≤ displaySpeed or missing)");
  }

  // P1 velocity range
  let ci: number[] | null = null;
  try { ci = JSON.parse(p.ci ?? "null"); } catch {}
  const lb = parseFloat(p.lower_bound ?? "0") || null;
  console.log("\n=== P1 VELOCITY RANGE ===");
  if (ci && ci.length === 2) {
    console.log(`Range: ${Math.round(ci[0])}–${Math.round(ci[1])} km/h  (label: "90% confidence interval")`);
  } else if (lb) {
    console.log(`Range: ${Math.round(lb)}–${Math.round(lb * 1.5)} km/h  (label: "deployment floor range")`);
  } else {
    console.log("Range: NOT SHOWN (no CI or lowerBound)");
  }

  // P2 gate
  const conf = (p.confidence ?? "").toUpperCase();
  const devClass = (p.deviation_class ?? "").replace(/"/g, "");
  const confGate = conf === "MEDIUM" || conf === "HIGH";
  const devGate = devClass === "significant" || devClass === "critical";
  console.log("\n=== P2 FRAUD INDICATOR GATE ===");
  console.log(`Confidence gate: ${confGate ? "PASSED ✅" : "FAILED"} (${conf})`);
  console.log(`Deviation gate: ${devGate ? "PASSED ✅" : "FAILED"} (${devClass})`);
  console.log(`Indicator fires: ${confGate && devGate ? "YES ✅" : "NO"}`);

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
