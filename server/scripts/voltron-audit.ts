/**
 * VOLTRON-001 Physics Audit Script
 * Pulls raw field values from assessment 15720001 to answer the 6 audit items.
 */
import "dotenv/config";
import { getDb } from "../db";
import { sql } from "drizzle-orm";

async function main() {
  const db = await getDb();
  if (!db) { console.error("No DB"); process.exit(1); }

  const rows = await db.execute(sql`SELECT claim_truth_object_json, physics_truth_json, cross_validation_json, damaged_components_json FROM ai_assessments WHERE id = 15720001`);
  const row = (rows as any)[0][0];

  const cto = typeof row.claim_truth_object_json === "string" ? JSON.parse(row.claim_truth_object_json) : row.claim_truth_object_json;
  const pt = typeof row.physics_truth_json === "string" ? JSON.parse(row.physics_truth_json) : row.physics_truth_json;
  const xv = typeof row.cross_validation_json === "string" ? JSON.parse(row.cross_validation_json) : row.cross_validation_json;
  const dc: any[] = typeof row.damaged_components_json === "string" ? JSON.parse(row.damaged_components_json) : row.damaged_components_json;

  // ── ITEM 2: M7 field name check ──────────────────────────────────────────
  console.log("\n══════════════════════════════════════════════════");
  console.log("ITEM 2: M7 CLAIMANT-STATED SPEED");
  console.log("══════════════════════════════════════════════════");
  const speedSection = pt?.speed;
  const methods = speedSection?.methods ?? [];
  const m7 = methods.find((m: any) => m.method === "CLAIMANT_STATED");
  console.log("accidentDetails.estimatedSpeedKmh (from claim_record_json):", "PULLED SEPARATELY");
  console.log("physics_truth_json.speed.claimedSpeedKmh:", speedSection?.claimedSpeedKmh);
  console.log("M7 method entry:", JSON.stringify(m7, null, 2));
  console.log("M7 ran:", m7?.ran, "| speedKmh:", m7?.speedKmh, "| basis:", m7?.basis);

  // ── ITEM 4: Full ensemble breakdown ──────────────────────────────────────
  console.log("\n══════════════════════════════════════════════════");
  console.log("ITEM 4: FULL SPEED ENSEMBLE BREAKDOWN");
  console.log("══════════════════════════════════════════════════");
  methods.forEach((m: any) => {
    console.log(`  ${m.method}: speedKmh=${m.speedKmh}, weight=${m.confidenceWeight}, confidence=${m.confidence}, ran=${m.ran}`);
    if (m.basis) console.log(`    basis: ${m.basis}`);
  });
  console.log(`  methodsRan: ${speedSection?.methodsRan}`);
  console.log(`  CONSENSUS: ${speedSection?.consensusSpeedKmh ?? "(check pt.speed directly)"} km/h`);
  // The consensus may be at pt.speed.consensusSpeedKmh
  console.log("  pt.speed top-level keys:", Object.keys(speedSection || {}));
  // Find consensus
  const str = JSON.stringify(speedSection || {});
  const cidx = str.indexOf("consensus");
  if (cidx >= 0) console.log("  consensus context:", str.substring(Math.max(0, cidx - 20), cidx + 200));

  // ── ITEM 5: M7 weight ────────────────────────────────────────────────────
  console.log("\n══════════════════════════════════════════════════");
  console.log("ITEM 5: M7 WEIGHT");
  console.log("══════════════════════════════════════════════════");
  console.log("M7 confidenceWeight in DB:", m7?.confidenceWeight);

  // ── ITEM 1: Airbag contradiction ─────────────────────────────────────────
  console.log("\n══════════════════════════════════════════════════");
  console.log("ITEM 1: AIRBAG CONTRADICTION");
  console.log("══════════════════════════════════════════════════");
  // damageClassification is nested inside cto.physics._provenance or elsewhere — search for it
  // From the DB search we know it's at cto.physics.damageClassification but the CTO physics keys show it's not there
  // Let's find it by searching the full CTO
  const ctoStr = JSON.stringify(cto || {});
  const dmgIdx = ctoStr.indexOf('"damageClassification"');
  let dmgClass: any = null;
  if (dmgIdx >= 0) {
    // Extract the damageClassification object
    const sub = ctoStr.substring(dmgIdx + '"damageClassification":'.length);
    // Find the matching closing brace
    try {
      // Use a simple approach: find the key in the parsed object
      const findDmgClass = (obj: any): any => {
        if (!obj || typeof obj !== 'object') return null;
        if (obj.damageClassification) return obj.damageClassification;
        for (const key of Object.keys(obj)) {
          const found = findDmgClass(obj[key]);
          if (found) return found;
        }
        return null;
      };
      dmgClass = findDmgClass(cto);
    } catch(e) { console.log('parse error:', e); }
  }
  if (dmgClass) {
    console.log("overallClassification:", dmgClass.overallClassification);
    console.log("counts:", JSON.stringify(dmgClass.counts));
    console.log("restraintSystemCheck:", JSON.stringify(dmgClass.restraintSystemCheck));
    console.log("crushDepthCheck:", JSON.stringify(dmgClass.crushDepthCheck));
    console.log("\nAll UNEXPLAINED components:");
    (dmgClass.components || []).filter((c: any) => c.classification === "UNEXPLAINED").forEach((c: any) => {
      console.log(`  [UNEXPLAINED] ${c.partName} — ${c.reason}`);
    });
    console.log("\nAll POSSIBLE components:");
    (dmgClass.components || []).filter((c: any) => c.classification === "POSSIBLE").forEach((c: any) => {
      console.log(`  [POSSIBLE] ${c.partName} — ${c.reason}`);
    });
    console.log("\nAll IMPOSSIBLE components:");
    (dmgClass.components || []).filter((c: any) => c.classification === "IMPOSSIBLE").forEach((c: any) => {
      console.log(`  [IMPOSSIBLE] ${c.partName} — ${c.reason}`);
    });
    console.log("\nExpected profile airbagExpected:", dmgClass.expectedProfile?.airbagExpected);
    console.log("Expected profile pretensionerExpected:", dmgClass.expectedProfile?.pretensionerExpected);
  } else {
    console.log("damageClassification NOT FOUND at cto.physics.damageClassification");
    console.log("cto.physics keys:", Object.keys(cto?.physics || {}));
  }

  // ── ITEM 3: Crush depth tolerance ────────────────────────────────────────
  console.log("\n══════════════════════════════════════════════════");
  console.log("ITEM 3: CRUSH DEPTH TOLERANCE BAND");
  console.log("══════════════════════════════════════════════════");
  const crushDepth = pt?.geometry?.crushDepth;
  console.log("geometry.crushDepth.canonical:", crushDepth?.canonical);
  console.log("geometry.crushDepth.vgrConsensus:", crushDepth?.vgrConsensus);
  if (dmgClass?.crushDepthCheck) {
    console.log("crushDepthCheck:", JSON.stringify(dmgClass.crushDepthCheck, null, 2));
  }
  console.log("expectedProfile.minCrushDepthM:", dmgClass?.expectedProfile?.minCrushDepthM);
  console.log("expectedProfile.maxCrushDepthM:", dmgClass?.expectedProfile?.maxCrushDepthM);

  // ── ITEM 6: Deduplication ─────────────────────────────────────────────────
  console.log("\n══════════════════════════════════════════════════");
  console.log("ITEM 6: DAMAGED COMPONENT DEDUPLICATION");
  console.log("══════════════════════════════════════════════════");
  console.log("Total damaged_components_json entries:", dc?.length ?? 0);
  const names = (dc || []).map((c: any) => (c.name || c.partName || String(c)).toLowerCase().trim());
  const unique = [...new Set(names)];
  console.log("Unique names:", unique.length);
  const dupes = names.filter((n: string, i: number) => names.indexOf(n) !== i);
  console.log("Duplicate names:", [...new Set(dupes)]);
  console.log("\nFull list (raw):");
  (dc || []).forEach((c: any, i: number) => console.log(`  ${i+1}. ${c.name || c.partName || c}`));

  // What did the classifier actually receive?
  if (dmgClass) {
    const classifiedNames = (dmgClass.components || []).map((c: any) => c.partName);
    console.log("\nClassifier received", classifiedNames.length, "components:");
    classifiedNames.forEach((n: string, i: number) => console.log(`  ${i+1}. ${n}`));
    const classUnique = [...new Set(classifiedNames.map((n: string) => n.toLowerCase().trim()))];
    console.log("Unique in classifier input:", classUnique.length);
  }
}

main().catch(console.error).finally(() => process.exit(0));
