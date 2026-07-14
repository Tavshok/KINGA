/**
 * Read VOLTRON claim physics data for P1/P2/P3 verification.
 * Run: cd /home/ubuntu/kinga-replit && npx tsx server/scripts/read-voltron-physics.ts
 */
import "dotenv/config";
import { getDb } from "../db";
import { sql } from "drizzle-orm";

async function main() {
  const db = await getDb();
  if (!db) { console.error("No DB"); process.exit(1); }

  // Physics data lives in ai_assessments, not claims
  const rows = await db.execute(sql`
    SELECT a.id, c.claim_number, c.status, a.physics_analysis
    FROM ai_assessments a
    INNER JOIN claims c ON c.id = a.claim_id
    WHERE a.claim_id = 8880001
    ORDER BY a.id DESC
    LIMIT 1
  `);
  const list = Array.isArray((rows as any)[0]) ? (rows as any)[0] : rows;
  const row = list[0] as any;
  if (!row) { console.log("Claim 8880001 not found in ai_assessments"); process.exit(1); }

  console.log("Claim:", row.id, row.claim_number, row.status);

  const pa = typeof row.physics_analysis === "string"
    ? JSON.parse(row.physics_analysis)
    : row.physics_analysis;

  if (!pa) { console.log("No physics_analysis"); process.exit(1); }

  const ens = pa.speedInferenceEnsemble;
  const sf = pa.speedForensics;

  console.log("\n=== Speed Inference Ensemble ===");
  console.log("consensusSpeedKmh:", ens?.consensusSpeedKmh);
  console.log("overallConfidence:", ens?.overallConfidence);
  console.log("confidenceInterval:", JSON.stringify(ens?.confidenceInterval));
  console.log("lowerBoundKmh:", ens?.lowerBoundKmh);
  console.log("availableMethods:", ens?.availableMethods?.length ?? "n/a");
  console.log("divergenceFlag:", ens?.divergenceFlag);

  console.log("\n=== Speed Forensics ===");
  console.log("claimedSpeedKmh:", sf?.claimedSpeedKmh);
  console.log("physicsSpeedKmh:", sf?.physicsSpeedKmh);
  console.log("deviationClass:", sf?.deviationClass);
  console.log("deviationPct:", sf?.deviationPct);
  console.log("deviationKmh:", sf?.deviationKmh);
  console.log("deviationLabel:", sf?.deviationLabel);
  console.log("riskScoreContribution:", sf?.riskScoreContribution);
  console.log("interpretation:", sf?.interpretation);

  // Compute P1 braking coherence
  const claimedSpeed = sf?.claimedSpeedKmh ?? 0;
  const displaySpeed = ens?.consensusSpeedKmh ?? 0;
  if (claimedSpeed > displaySpeed && displaySpeed > 0) {
    const mu = 0.7;
    const g = 9.81;
    const vStated = claimedSpeed / 3.6;
    const vImpact = displaySpeed / 3.6;
    const Z = (vStated * vStated - vImpact * vImpact) / (2 * mu * g);
    console.log("\n=== P1 Braking Coherence ===");
    console.log(`Z = ${Z.toFixed(1)} m`);
    console.log(`Note fires: ${Z > 5 ? "YES" : "NO (Z <= 5m)"}`);
    if (Z > 5) {
      console.log(`Note text: Stated travel speed ${claimedSpeed} km/h is consistent with the physics lower bound of ${Math.round(displaySpeed)} km/h if the vehicle decelerated over approximately ${Math.round(Z)} m before impact (assuming μ = 0.7 tarmac surface, no pre-impact braking modelled).`);
    }
  } else {
    console.log("\n=== P1 Braking Coherence ===");
    console.log("Note fires: NO (claimedSpeed <= displaySpeed or missing)");
  }

  // P1 velocity range
  const ciLow = ens?.confidenceInterval?.[0] ?? null;
  const ciHigh = ens?.confidenceInterval?.[1] ?? null;
  const lowerBound = ens?.lowerBoundKmh ?? null;
  console.log("\n=== P1 Velocity Range ===");
  if (ciLow != null && ciHigh != null) {
    console.log(`Range: ${Math.round(ciLow)}–${Math.round(ciHigh)} km/h (90% confidence interval)`);
  } else if (lowerBound != null) {
    console.log(`Range: ${Math.round(lowerBound)}–${Math.round(lowerBound * 1.5)} km/h (deployment floor range)`);
  } else {
    console.log("Range: NOT SHOWN (no CI or lowerBound)");
  }

  // P2 fraud indicator gate
  const confGate = ens?.overallConfidence?.toUpperCase() === "MEDIUM" || ens?.overallConfidence?.toUpperCase() === "HIGH";
  const devClass = sf?.deviationClass;
  console.log("\n=== P2 Fraud Indicator Gate ===");
  console.log(`Confidence gate passed: ${confGate} (${ens?.overallConfidence})`);
  console.log(`Deviation class: ${devClass}`);
  console.log(`Indicator fires: ${confGate && (devClass === "significant" || devClass === "critical") ? "YES" : "NO"}`);

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
