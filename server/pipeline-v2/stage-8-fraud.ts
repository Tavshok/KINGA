/**
 * pipeline-v2/stage-8-fraud.ts
 *
 * STAGE 8 — FRAUD ANALYSIS ENGINE
 *
 * Combines damage analysis and physics analysis with claim data
 * to compute fraud risk indicators and scores.
 *
 * Input: ClaimRecord + Stage6Output + Stage7Output
 * Output: Stage8Output (fraud_risk_score, indicators, consistency)
 */

import type {
  PipelineContext,
  StageResult,
  ClaimRecord,
  Stage6Output,
  Stage7Output,
  Stage8Output,
  FraudIndicator,
  FraudRiskLevel,
} from "./types";

/**
 * Compute fraud risk level from score (0-100).
 */
function scoreToLevel(score: number): FraudRiskLevel {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 40) return "medium";
  if (score >= 20) return "low";
  return "minimal";
}

/**
 * Analyse damage consistency between reported damage and physics.
 */
function analyseDamageConsistency(
  claimRecord: ClaimRecord,
  damageAnalysis: Stage6Output,
  physicsAnalysis: Stage7Output
): { score: number; notes: string; indicators: FraudIndicator[] } {
  const indicators: FraudIndicator[] = [];
  let consistencyScore = physicsAnalysis.damageConsistencyScore;
  const notes: string[] = [];

  // Check if damage zones are consistent with impact direction
  const impactDir = claimRecord.accidentDetails.collisionDirection;
  const zones = damageAnalysis.damageZones.map(z => z.zone);

  if (impactDir === "frontal" && !zones.includes("front")) {
    indicators.push({
      indicator: "damage_direction_mismatch",
      category: "consistency",
      score: 25,
      description: "Frontal collision reported but no front damage zone detected.",
    });
    consistencyScore = Math.max(0, consistencyScore - 20);
    notes.push("Impact direction inconsistent with damage zones.");
  }

  if (impactDir === "rear" && !zones.includes("rear")) {
    indicators.push({
      indicator: "damage_direction_mismatch",
      category: "consistency",
      score: 25,
      description: "Rear collision reported but no rear damage zone detected.",
    });
    consistencyScore = Math.max(0, consistencyScore - 20);
    notes.push("Impact direction inconsistent with damage zones.");
  }

  // Check if severity is consistent with physics
  if (physicsAnalysis.physicsExecuted) {
    const physSeverity = physicsAnalysis.accidentSeverity;
    const dmgSeverity = damageAnalysis.overallSeverityScore;

    // High damage severity but low physics severity = suspicious
    if (dmgSeverity > 70 && (physSeverity === "minor" || physSeverity === "cosmetic")) {
      indicators.push({
        indicator: "severity_physics_mismatch",
        category: "consistency",
        score: 30,
        description: `High damage severity (${dmgSeverity}/100) but physics indicates ${physSeverity} impact.`,
      });
      consistencyScore = Math.max(0, consistencyScore - 25);
      notes.push("Damage severity exceeds what physics analysis supports.");
    }
  }

  // Check for suspicious damage patterns
  if (damageAnalysis.damagedParts.length > 15) {
    indicators.push({
      indicator: "excessive_damage_count",
      category: "pattern",
      score: 15,
      description: `Unusually high number of damaged components (${damageAnalysis.damagedParts.length}).`,
    });
    notes.push("High component count may indicate pre-existing damage.");
  }

  return {
    score: consistencyScore,
    notes: notes.length > 0 ? notes.join(" ") : "Damage patterns are consistent with reported incident.",
    indicators,
  };
}

/**
 * Analyse quote deviation — compare quoted cost to expected cost.
 */
function analyseQuoteDeviation(claimRecord: ClaimRecord): {
  deviation: number | null;
  indicators: FraudIndicator[];
} {
  const indicators: FraudIndicator[] = [];
  const quotedCents = claimRecord.repairQuote.quoteTotalCents;

  if (!quotedCents) {
    return { deviation: null, indicators };
  }

  // We'll compute deviation later in Stage 9 when we have expected cost
  // For now, flag if quote seems unusually high for the damage described
  const componentCount = claimRecord.damage.components.length;
  const avgCostPerComponent = quotedCents / Math.max(1, componentCount);

  // Flag if average cost per component exceeds reasonable threshold
  // (Using ZAR/USD agnostic threshold — $500 per component is a rough flag)
  if (avgCostPerComponent > 50000) { // 500.00 in cents
    indicators.push({
      indicator: "high_cost_per_component",
      category: "financial",
      score: 15,
      description: `Average cost per damaged component (${(avgCostPerComponent/100).toFixed(2)}) exceeds typical range.`,
    });
  }

  return { deviation: null, indicators };
}

/**
 * Check for missing documentation flags.
 */
function analyseDocumentation(claimRecord: ClaimRecord): FraudIndicator[] {
  const indicators: FraudIndicator[] = [];

  if (!claimRecord.policeReport.reportNumber) {
    indicators.push({
      indicator: "missing_police_report",
      category: "documentation",
      score: 10,
      description: "No police report number provided.",
    });
  }

  if (claimRecord.damage.imageUrls.length === 0) {
    indicators.push({
      indicator: "no_damage_photos",
      category: "documentation",
      score: 15,
      description: "No damage photographs provided with the claim.",
    });
  }

  if (claimRecord.dataQuality.completenessScore < 50) {
    indicators.push({
      indicator: "low_data_completeness",
      category: "documentation",
      score: 10,
      description: `Data completeness score is low (${claimRecord.dataQuality.completenessScore}%).`,
    });
  }

  return indicators;
}

export async function runFraudAnalysisStage(
  ctx: PipelineContext,
  claimRecord: ClaimRecord,
  damageAnalysis: Stage6Output,
  physicsAnalysis: Stage7Output
): Promise<StageResult<Stage8Output>> {
  const start = Date.now();
  ctx.log("Stage 8", "Fraud analysis starting");

  try {
    // Collect all fraud indicators
    const allIndicators: FraudIndicator[] = [];

    // 1. Damage consistency analysis
    const consistency = analyseDamageConsistency(claimRecord, damageAnalysis, physicsAnalysis);
    allIndicators.push(...consistency.indicators);

    // 2. Quote deviation analysis
    const quoteAnalysis = analyseQuoteDeviation(claimRecord);
    allIndicators.push(...quoteAnalysis.indicators);

    // 3. Documentation analysis
    const docIndicators = analyseDocumentation(claimRecord);
    allIndicators.push(...docIndicators);

    // Calculate overall fraud risk score (weighted average of indicators)
    const totalIndicatorScore = allIndicators.reduce((sum, i) => sum + i.score, 0);
    const fraudRiskScore = Math.min(100, totalIndicatorScore);
    const fraudRiskLevel = scoreToLevel(fraudRiskScore);

    const output: Stage8Output = {
      fraudRiskScore,
      fraudRiskLevel,
      indicators: allIndicators,
      quoteDeviation: quoteAnalysis.deviation,
      repairerHistory: {
        flagged: false,
        notes: "No repairer history data available for analysis.",
      },
      claimantClaimFrequency: {
        flagged: false,
        notes: "No historical claim frequency data available.",
      },
      vehicleClaimHistory: {
        flagged: false,
        notes: "No vehicle claim history data available.",
      },
      damageConsistencyScore: consistency.score,
      damageConsistencyNotes: consistency.notes,
    };

    ctx.log("Stage 8", `Fraud analysis complete. Risk: ${fraudRiskLevel} (${fraudRiskScore}/100), Indicators: ${allIndicators.length}, Consistency: ${consistency.score}/100`);

    return {
      status: "success",
      data: output,
      durationMs: Date.now() - start,
      savedToDb: false,
    };
  } catch (err) {
    ctx.log("Stage 8", `Fraud analysis failed: ${String(err)}`);
    return {
      status: "failed",
      data: null,
      error: String(err),
      durationMs: Date.now() - start,
      savedToDb: false,
    };
  }
}
