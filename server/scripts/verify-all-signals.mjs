/**
 * Final signal verification script — checks all 5 signals + cross-validation for claim 10719902
 * Run with: node server/scripts/verify-all-signals.mjs
 */
import "dotenv/config";
import mysql2 from "mysql2/promise";

const CLAIM_ID = 10719902;

async function main() {
  const conn = await mysql2.createConnection(process.env.DATABASE_URL);

  const [rows] = await conn.execute(`
    SELECT
      aa.id,
      aa.physics_analysis,
      aa.cross_validation_json,
      aa.direction_contradiction_flag_json,
      aa.fraud_score_breakdown_json,
      aa.fraud_score,
      aa.fraud_risk_level,
      aa.created_at,
      c.claim_number
    FROM ai_assessments aa
    JOIN claims c ON c.id = aa.claim_id
    WHERE c.id = ${CLAIM_ID}
    ORDER BY aa.created_at DESC
    LIMIT 1
  `);

  if (!rows.length) {
    console.error(`No assessment found for claim ${CLAIM_ID}`);
    process.exit(1);
  }

  const r = rows[0];
  const pa = typeof r.physics_analysis === "string" ? JSON.parse(r.physics_analysis) : r.physics_analysis || {};
  const xv = typeof r.cross_validation_json === "string" ? JSON.parse(r.cross_validation_json) : r.cross_validation_json || {};
  const df = typeof r.direction_contradiction_flag_json === "string" ? JSON.parse(r.direction_contradiction_flag_json) : r.direction_contradiction_flag_json || {};

  console.log("=".repeat(70));
  console.log(`VOLTRON-001 SIGNAL VERIFICATION — Assessment ${r.id}`);
  console.log(`Created: ${new Date(r.created_at).toString()}`);
  console.log("=".repeat(70));

  // ── M7: Claimant-Stated Speed ──────────────────────────────────────────────
  console.log("\n── M7: Claimant-Stated Speed ──");
  const ens = pa.speedInferenceEnsemble;
  const m7 = ens?.methods?.find(m => m.method === "CLAIMANT_STATED");
  const dev = ens?.claimedSpeedDeviationFlag;
  if (m7) {
    console.log(`  M7 method: speedKmh=${m7.speedKmh}, weight=${m7.confidenceWeight}, confidence=${m7.confidence}, ran=${m7.ran}`);
    console.log(`  M7 basis: ${m7.basis}`);
  } else {
    console.log("  ❌ M7 method NOT found in ensemble methods");
  }
  if (dev) {
    console.log(`  Deviation flag: class=${dev.deviationClass}, claimedKmh=${dev.claimedSpeedKmh}, consensusKmh=${dev.consensusSpeedKmh}`);
    console.log(`  Interpretation: ${dev.interpretation}`);
    if (dev.claimedSpeedKmh !== null) {
      console.log(`  ✅ M7 ACTIVE — claimant stated ${dev.claimedSpeedKmh} km/h vs physics ${dev.consensusSpeedKmh} km/h`);
    } else {
      console.log(`  ℹ️  M7 INACTIVE — no claimant-stated speed in documents (correct for this claim)`);
    }
  } else {
    console.log("  ❌ claimedSpeedDeviationFlag NOT found");
  }
  console.log(`  Ensemble consensus: ${ens?.consensusSpeedKmh} km/h (${ens?.overallConfidence} confidence)`);

  // ── S1: Quote-Photo Agreement ──────────────────────────────────────────────
  console.log("\n── S1: Quote-Photo Agreement ──");
  const qpa = xv?.quotePhotoAgreement;
  if (qpa) {
    console.log(`  ✅ FOUND in cross_validation_json`);
    console.log(`  Agreement score: ${qpa.agreementScore?.toFixed(2)}`);
    console.log(`  Quotes analysed: ${qpa.quotesAnalysed}`);
    console.log(`  Quoted but not visible in photos: ${qpa.quotedNotVisible?.length ?? 0} items`);
    console.log(`  Visible in photos but not quoted: ${qpa.visibleNotQuoted?.length ?? 0} items`);
    console.log(`  Structural gaps in quotes: ${qpa.structuralGapsInQuotes?.length ?? 0} items`);
    console.log(`  Summary: ${qpa.summary}`);
  } else {
    console.log("  ❌ quotePhotoAgreement NOT found in cross_validation_json");
    console.log("  Note: May be null if Stage 9 quote extraction found no matching photos");
  }

  // ── S2: Direction Contradiction Flag ──────────────────────────────────────
  console.log("\n── S2: Direction Contradiction Flag ──");
  if (df && Object.keys(df).length > 0) {
    console.log(`  ✅ FOUND in direction_contradiction_flag_json`);
    console.log(`  Contradiction detected: ${df.contradictionDetected}`);
    console.log(`  Narrative direction: ${df.narrativeDirection}`);
    console.log(`  Physics direction: ${df.physicsDirection}`);
    console.log(`  Confidence: ${df.confidence}`);
    console.log(`  Explanation: ${df.explanation}`);
  } else {
    // Also check inside cross_validation_json
    const dfXV = xv?.directionContradiction;
    if (dfXV) {
      console.log(`  ✅ FOUND in cross_validation_json.directionContradiction`);
      console.log(`  Contradiction: ${dfXV.contradictionDetected}, narrative=${dfXV.narrativeDirection}, physics=${dfXV.physicsDirection}`);
    } else {
      console.log("  ❌ directionContradictionFlag NOT found in either column");
    }
  }

  // ── S3: EXIF Vision Trust Downgrade ───────────────────────────────────────
  console.log("\n── S3: EXIF Vision Trust Downgrade ──");
  const baseVision = pa.visionSourceReliability;
  const adjVision = pa.visionSourceReliabilityAdjusted;
  const adjReason = pa.visionSourceReliabilityAdjustmentReason;
  console.log(`  Base visionSourceReliability: ${baseVision}`);
  if (adjVision && adjVision !== baseVision) {
    console.log(`  ✅ Adjusted to: ${adjVision}`);
    console.log(`  Reason: ${adjReason}`);
  } else if (adjVision === baseVision) {
    console.log(`  ℹ️  No downgrade applied (base=${baseVision}, adjusted=${adjVision})`);
  } else {
    console.log(`  ℹ️  visionSourceReliabilityAdjusted: ${adjVision}`);
  }

  // ── S4: Weather Cross-Check ────────────────────────────────────────────────
  console.log("\n── S4: Weather Cross-Check ──");
  const weather = xv?.weatherCrossCheck;
  if (weather) {
    console.log(`  Status: ${weather.status}`);
  } else {
    console.log("  Status: PENDING — external API dependency not yet activated");
    console.log("  Interface built: weatherCrossCheckEngine.ts (ready for Open-Meteo integration)");
  }

  // ── S5: Evidence Confidence Tiers ─────────────────────────────────────────
  console.log("\n── S5: Evidence Confidence Tiers ──");
  const tiers = xv?.evidenceTiers;
  if (tiers) {
    console.log(`  ✅ FOUND in cross_validation_json.evidenceTiers`);
    // EvidenceConfidenceTierResult uses independenceLevel (not overallEvidenceTier)
    // and items[] (not sources[])
    console.log(`  Independence level: ${tiers.independenceLevel}`);
    console.log(`  Has independent evidence: ${tiers.hasIndependentEvidence}`);
    const ts = tiers.tierSummary;
    if (ts) {
      console.log(`  Tier summary: T1=${ts.presentTier1Count}/${ts.tier1Count}, T2=${ts.presentTier2Count}/${ts.tier2Count}, T3=${ts.presentTier3Count}/${ts.tier3Count}, T4=${ts.presentTier4Count}/${ts.tier4Count}`);
    }
    const presentItems = (tiers.items ?? []).filter(i => i.present);
    console.log(`  Present evidence items: ${presentItems.length}`);
    presentItems.forEach(i => {
      console.log(`    [${i.tier}] ${i.sourceType}: ${i.description}`);
    });
    if (tiers.evidenceGaps?.length > 0) {
      console.log(`  Evidence gaps: ${tiers.evidenceGaps.join('; ')}`);
    }
    console.log(`  Independence note: ${tiers.independenceNote}`);
  } else {
    console.log("  ❌ evidenceTiers NOT found in cross_validation_json");
  }

  // ── Multi-Signal Cross-Validation ─────────────────────────────────────────
  console.log("\n── Multi-Signal Cross-Validation ──");
  if (xv && xv.overallRisk) {
    console.log(`  ✅ FOUND in cross_validation_json`);
    console.log(`  Overall risk: ${xv.overallRisk}`);
    console.log(`  Has material contradictions: ${xv.hasMaterialContradictions}`);
    console.log(`  Findings: ${xv.findings?.length ?? 0}`);
    const sev = xv.severitySummary;
    console.log(`  Severity summary: flag=${sev?.flag ?? 0}, concern=${sev?.concern ?? 0}, advisory=${sev?.advisory ?? 0}, info=${sev?.info ?? 0}`);
    if (xv.findings?.length > 0) {
      console.log("  Findings:");
      xv.findings.forEach(f => {
        const icon = f.severity === "FLAG" ? "🚩" : f.severity === "CONCERN" ? "⚠️" : f.severity === "ADVISORY" ? "ℹ️" : "✓";
        console.log(`    ${icon} [${f.severity}] ${f.category}: ${f.verdict}`);
        console.log(`       Fact: ${f.fact}`);
        console.log(`       ${f.explanation}`);
        if (f.recommendedAction) console.log(`       Action: ${f.recommendedAction}`);
      });
    }
  } else {
    console.log("  ❌ cross_validation_json is empty or missing overallRisk");
  }

  // ── Damage Classification Engine ──────────────────────────────────────────
  console.log("\n── Damage Classification Engine ──");
  const dc = pa.damageClassification;
  if (dc) {
    console.log(`  ✅ FOUND`);
    // DamageClassificationResult uses overallClassification (not overallVerdict)
    // and counts.possible/impossible/unexplained (not flat possibleCount etc.)
    console.log(`  Overall classification: ${dc.overallClassification ?? dc.overallVerdict}`);
    const possible = dc.counts?.possible ?? dc.possibleCount ?? 0;
    const impossible = dc.counts?.impossible ?? dc.impossibleCount ?? 0;
    const unexplained = dc.counts?.unexplained ?? dc.unexplainedCount ?? 0;
    console.log(`  Possible: ${possible}, Impossible: ${impossible}, Unexplained: ${unexplained}`);
    console.log(`  Restraint system check: ${dc.restraintConsistencyCheck?.verdict ?? dc.restraintSystemCheck?.verdict}`);
    console.log(`  Crush depth check: ${dc.crushDepthConsistencyCheck?.verdict ?? dc.crushDepthCheck?.verdict}`);
    if (dc.summary) console.log(`  Summary: ${dc.summary}`);
  } else {
    console.log("  ❌ damageClassification NOT found in physics_analysis");
  }

  // ── Fraud Score ────────────────────────────────────────────────────────────
  console.log("\n── Fraud Score ──");
  console.log(`  Score: ${r.fraud_score}`);
  console.log(`  Risk level: ${r.fraud_risk_level}`);
  const fsb = typeof r.fraud_score_breakdown_json === "string" ? JSON.parse(r.fraud_score_breakdown_json) : r.fraud_score_breakdown_json || {};
  console.log(`  Recommendation: ${fsb.recommendation ?? "N/A"}`);
  const xvIndicators = fsb.indicators?.filter(i => i?.category === "cross_validation") ?? [];
  if (xvIndicators.length > 0) {
    console.log(`  ✅ Cross-validation indicators injected: ${xvIndicators.length}`);
    xvIndicators.forEach(i => console.log(`    [${i.severity}] ${i.indicator}`));
  } else {
    console.log("  ℹ️  No cross-validation fraud indicators (no material contradictions detected)");
  }

  console.log("\n" + "=".repeat(70));
  await conn.end();
}

main().catch(e => { console.error(e); process.exit(1); });
