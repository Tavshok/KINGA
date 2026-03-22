/**
 * pipeline-v2/stage-8-fraud.ts
 *
 * STAGE 8 — FRAUD ANALYSIS ENGINE (Self-Healing)
 *
 * Combines damage + physics + claim data to compute fraud risk.
 * NEVER halts — produces baseline fraud assessment even with missing data.
 */

import { ensureFraudContract } from "./engineFallback";
import type {
  PipelineContext,
  StageResult,
  ClaimRecord,
  Stage3Output,
  Stage6Output,
  Stage7Output,
  Stage8Output,
  FraudIndicator,
  FraudRiskLevel,
  Assumption,
  RecoveryAction,
  InputRecoveryOutput,
} from "./types";

function scoreToLevel(score: number): FraudRiskLevel {
  if (score >= 80) return "elevated";
  if (score >= 60) return "high";
  if (score >= 40) return "medium";
  if (score >= 20) return "low";
  return "minimal";
}

function analyseDamageConsistency(
  claimRecord: ClaimRecord,
  damageAnalysis: Stage6Output,
  physicsAnalysis: Stage7Output
): { score: number; notes: string; indicators: FraudIndicator[] } {
  const indicators: FraudIndicator[] = [];
  let consistencyScore = physicsAnalysis.damageConsistencyScore;
  const notes: string[] = [];

  const impactDir = claimRecord.accidentDetails.collisionDirection;
  const zones = damageAnalysis.damageZones.map(z => z.zone);

  if (impactDir === "frontal" && zones.length > 0 && !zones.includes("front")) {
    indicators.push({
      indicator: "damage_direction_mismatch",
      category: "consistency",
      score: 25,
      description: "Frontal collision reported but no front damage zone detected.",
    });
    consistencyScore = Math.max(0, consistencyScore - 20);
    notes.push("Impact direction inconsistent with damage zones.");
  }

  if (impactDir === "rear" && zones.length > 0 && !zones.includes("rear")) {
    indicators.push({
      indicator: "damage_direction_mismatch",
      category: "consistency",
      score: 25,
      description: "Rear collision reported but no rear damage zone detected.",
    });
    consistencyScore = Math.max(0, consistencyScore - 20);
    notes.push("Impact direction inconsistent with damage zones.");
  }

  if (physicsAnalysis.physicsExecuted) {
    const physSeverity = physicsAnalysis.accidentSeverity;
    const dmgSeverity = damageAnalysis.overallSeverityScore;

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

function analyseQuoteDeviation(claimRecord: ClaimRecord): {
  deviation: number | null;
  indicators: FraudIndicator[];
} {
  const indicators: FraudIndicator[] = [];
  const quotedCents = claimRecord.repairQuote.quoteTotalCents;

  if (!quotedCents) {
    return { deviation: null, indicators };
  }

  const componentCount = claimRecord.damage.components.length;
  const avgCostPerComponent = quotedCents / Math.max(1, componentCount);

  if (avgCostPerComponent > 50000) {
    indicators.push({
      indicator: "high_cost_per_component",
      category: "financial",
      score: 15,
      description: `Average cost per damaged component (${(avgCostPerComponent/100).toFixed(2)}) exceeds typical range.`,
    });
  }

  return { deviation: null, indicators };
}

function analyseDocumentation(
  claimRecord: ClaimRecord,
  inputRecovery?: InputRecoveryOutput
): FraudIndicator[] {
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
    // FIX (2026-03-21): If input recovery detected images present in the source
    // document (e.g. embedded in a PDF) but they were never extracted into the
    // imageUrls pipeline, the correct indicator is "photos_not_ingested" (score 5)
    // rather than "no_damage_photos" (score 15). The former is a system gap;
    // the latter implies the claimant failed to provide evidence.
    if (inputRecovery?.images_present) {
      indicators.push({
        indicator: "photos_not_ingested",
        category: "documentation",
        score: 5,
        description: "Damage photographs detected in source document but not yet processed through the photo analysis pipeline. Manual review recommended.",
      });
    } else {
      indicators.push({
        indicator: "no_damage_photos",
        category: "documentation",
        score: 15,
        description: "No damage photographs provided with the claim.",
      });
    }
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
  physicsAnalysis: Stage7Output,
  stage3?: Stage3Output
): Promise<StageResult<Stage8Output>> {
  const start = Date.now();
  ctx.log("Stage 8", "Fraud analysis starting");

  const assumptions: Assumption[] = [];
  const recoveryActions: RecoveryAction[] = [];
  let isDegraded = false;

  try {
    const allIndicators: FraudIndicator[] = [];

    // 1. Damage consistency
    let consistency: { score: number; notes: string; indicators: FraudIndicator[] };
    try {
      consistency = analyseDamageConsistency(claimRecord, damageAnalysis, physicsAnalysis);
      allIndicators.push(...consistency.indicators);
    } catch (e) {
      isDegraded = true;
      consistency = { score: 50, notes: "Consistency analysis failed.", indicators: [] };
      recoveryActions.push({
        target: "damageConsistency",
        strategy: "default_value",
        success: true,
        description: `Damage consistency analysis failed: ${String(e)}. Using neutral score of 50.`,
      });
    }

    // 2. Quote deviation
    try {
      const quoteAnalysis = analyseQuoteDeviation(claimRecord);
      allIndicators.push(...quoteAnalysis.indicators);
    } catch (e) {
      isDegraded = true;
      recoveryActions.push({
        target: "quoteDeviation",
        strategy: "default_value",
        success: true,
        description: `Quote deviation analysis failed: ${String(e)}. Skipping.`,
      });
    }

    // 3. Documentation
    try {
      const docIndicators = analyseDocumentation(claimRecord, stage3?.inputRecovery);
      allIndicators.push(...docIndicators);
    } catch (e) {
      isDegraded = true;
      recoveryActions.push({
        target: "documentation",
        strategy: "default_value",
        success: true,
        description: `Documentation analysis failed: ${String(e)}. Skipping.`,
      });
    }

    // 3b. Damage pattern validation — flag WEAK/NONE pattern matches as fraud indicators
    const damagePatternResult = physicsAnalysis.damagePatternValidation;
    if (damagePatternResult) {
      if (damagePatternResult.pattern_match === "NONE") {
        allIndicators.push({
          indicator: "damage_pattern_none",
          category: "consistency",
          score: 35,
          description: `Damage pattern validation returned NONE: no expected components for the claimed scenario were found. ` +
            `Scenario: ${damagePatternResult.reasoning.substring(0, 120)}.`,
        });
        consistency.score = Math.max(0, consistency.score - 25);
        consistency.notes = `${consistency.notes} Damage pattern validation: NONE match — damage components do not match the claimed incident scenario.`;
      } else if (damagePatternResult.pattern_match === "WEAK") {
        allIndicators.push({
          indicator: "damage_pattern_weak",
          category: "consistency",
          score: 20,
          description: `Damage pattern validation returned WEAK: very few expected components for the claimed scenario were found. ` +
            `Confidence: ${damagePatternResult.confidence}/100.`,
        });
        consistency.score = Math.max(0, consistency.score - 15);
        consistency.notes = `${consistency.notes} Damage pattern validation: WEAK match — limited damage components match the claimed incident scenario.`;
      }
      if (damagePatternResult.validation_detail.image_contradiction) {
        allIndicators.push({
          indicator: "damage_image_contradiction",
          category: "consistency",
          score: 30,
          description: `Image zones contradict the claimed damage pattern. ` +
            `${damagePatternResult.validation_detail.image_contradiction_reason || "Images show damage inconsistent with reported incident."}`,
        });
        consistency.score = Math.max(0, consistency.score - 20);
      }
      ctx.log("Stage 8", `Damage pattern: ${damagePatternResult.pattern_match} (confidence: ${damagePatternResult.confidence}/100, image_contradiction: ${damagePatternResult.validation_detail.image_contradiction})`);
    }

    // 4. Missing data penalty
    if (claimRecord.dataQuality.completenessScore < 30) {
      isDegraded = true;
      assumptions.push({
        field: "fraudRiskScore",
        assumedValue: "limited_data",
        reason: `Data completeness is only ${claimRecord.dataQuality.completenessScore}%. Fraud analysis has limited confidence.`,
        strategy: "partial_data",
        confidence: 30,
        stage: "Stage 8",
      });
    }

    const totalIndicatorScore = allIndicators.reduce((sum, i) => sum + i.score, 0);
    const fraudRiskScore = Math.min(100, totalIndicatorScore);
    const fraudRiskLevel = scoreToLevel(fraudRiskScore);

    // Stage 26: apply defensive contract — ensure score, level, and at least 1 indicator
    const output = ensureFraudContract({
      fraudRiskScore,
      fraudRiskLevel,
      indicators: allIndicators,
      quoteDeviation: null,
      repairerHistory: { flagged: false, notes: "No repairer history data available for analysis." },
      claimantClaimFrequency: { flagged: false, notes: "No historical claim frequency data available." },
      vehicleClaimHistory: { flagged: false, notes: "No vehicle claim history data available." },
      damageConsistencyScore: consistency.score,
      damageConsistencyNotes: consistency.notes,
    }, isDegraded ? "degraded_analysis" : "success");

    ctx.log("Stage 8", `Fraud analysis complete. Risk: ${fraudRiskLevel} (${fraudRiskScore}/100), Indicators: ${allIndicators.length}, Consistency: ${consistency.score}/100`);

    return {
      status: isDegraded ? "degraded" : "success",
      data: output,
      durationMs: Date.now() - start,
      savedToDb: false,
      assumptions,
      recoveryActions,
      degraded: isDegraded,
    };
  } catch (err) {
    ctx.log("Stage 8", `Fraud analysis failed: ${String(err)} — producing baseline assessment`);

    // Stage 26: apply defensive contract — mark all fallback fields
    return {
      status: "degraded",
      data: ensureFraudContract({}, `engine_failure: ${String(err)}`),
      error: String(err),
      durationMs: Date.now() - start,
      savedToDb: false,
      assumptions: [{
        field: "fraudRiskScore",
        assumedValue: 50,
        reason: `Fraud analysis failed: ${String(err)}. Defaulting to medium risk (50/100) to flag for manual review.`,
        strategy: "default_value",
        confidence: 20,
        stage: "Stage 8",
      }],
      recoveryActions: [{
        target: "fraud_analysis_error",
        strategy: "default_value",
        success: true,
        description: `Fraud analysis error caught. Defaulting to medium risk for manual review.`,
      }],
      degraded: true,
    };
  }
}
