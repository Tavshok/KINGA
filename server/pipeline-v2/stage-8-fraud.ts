/**
 * pipeline-v2/stage-8-fraud.ts
 *
 * STAGE 8 — FRAUD ANALYSIS ENGINE (Self-Healing)
 *
 * Combines damage + physics + claim data to compute fraud risk.
 * NEVER halts — produces baseline fraud assessment even with missing data.
 */

import { ensureFraudContract } from "./engineFallback";
import { validateCrossEngineConsistency } from "./crossEngineConsistencyValidator";
import { runPhotoForensics } from "./photoForensicsEngine";
import {
  evaluateScenarioFraud,
  type ScenarioFraudInput,
  type ScenarioType,
  type PoliceReportStatus,
  type TimelineConsistency,
  type AssessorConfirmation,
} from "./scenarioFraudEngine";
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

  // Threshold raised to >20: severe rear-end collisions routinely produce 15-20 components
  // (bumper, boot lid, tail lamps, quarter panels, chassis, wiring harness, etc.).
  // Flagging at >15 generates false positives for legitimate high-severity claims.
  if (damageAnalysis.damagedParts.length > 20) {
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

function analyseQuoteDeviation(
  claimRecord: ClaimRecord,
  _damageAnalysis?: Stage6Output  // reserved for future benchmark-backed deviation checks
): {
  deviation: number | null;
  indicators: FraudIndicator[];
} {
  // PERMANENT RULE (2026-04): Do NOT generate fraud indicators from total-cost ÷ component-count.
  // A total repair quote divided by the number of damaged parts is a meaningless ratio —
  // it produces false positives on every multi-component claim and has no grounding in
  // actual part-level pricing data. The ONLY valid cost fraud signal is a deviation from
  // a market benchmark for a SPECIFIC part (e.g., from the learning DB or industry catalogue).
  // Until per-part benchmarks are available, this function returns no indicators.
  return { deviation: null, indicators: [] };
}

function analyseDocumentation(
  claimRecord: ClaimRecord,
  inputRecovery?: InputRecoveryOutput
): FraudIndicator[] {
  const indicators: FraudIndicator[] = [];

  if (!claimRecord.policeReport.reportNumber) {
    // Check 1: Was extraction itself incomplete? If so, treat as system gap, not fraud.
    const extractionFailed = inputRecovery?.failure_flags?.some(
      f => f === 'ocr_failure' || f === 'quote_not_mapped'
    ) ?? false;

    // Check 2: Does the accident narrative confirm police were notified at scene?
    // This handles the common case where police were reported verbally but no case
    // number was recorded in the claim document (e.g. Mazda BT50 CI-024NATPHARM).
    const narrative = (claimRecord.accidentDetails.description || "").toLowerCase();
    const verbalPoliceReport = (
      /reported\s+(?:the\s+)?(?:issue|incident|accident|matter)\s+to\s+(?:the\s+)?police/i.test(narrative) ||
      /immediately\s+reported\s+(?:to\s+)?(?:the\s+)?police/i.test(narrative) ||
      /reported\s+to\s+(?:the\s+)?police/i.test(narrative) ||
      /notified\s+(?:the\s+)?police/i.test(narrative) ||
      /police\s+(?:were\s+)?(?:called|notified|informed|alerted)/i.test(narrative) ||
      /went\s+to\s+(?:the\s+)?police/i.test(narrative)
    );

    if (verbalPoliceReport) {
      // Driver narrative confirms police were notified — downgrade to low-score informational flag.
      // No case number was recorded but verbal reporting is confirmed.
      indicators.push({
        indicator: "police_report_verbal_only",
        category: "documentation",
        score: 3,
        description: "Driver narrative confirms police were notified at scene, but no case number was recorded in the claim document. Manual verification of police report number recommended.",
      });
    } else if (extractionFailed) {
      indicators.push({
        indicator: "police_report_extraction_uncertain",
        category: "documentation",
        score: 3,
        description: "Police report number could not be confirmed — document extraction was incomplete. Manual verification required.",
      });
    } else {
      indicators.push({
        indicator: "missing_police_report",
        category: "documentation",
        score: 10,
        description: "No police report number found in the claim document and driver narrative does not confirm police notification.",
      });
    }
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

/**
 * Maps a ClaimRecord + Stage7Output to a ScenarioFraudInput for the
 * Scenario-Aware Fraud Detection Engine.
 */
function buildScenarioFraudInput(
  claimRecord: ClaimRecord,
  physicsAnalysis: Stage7Output
): ScenarioFraudInput {
  // ── Scenario type ──────────────────────────────────────────────────────────
  // Priority 1: Use LLM-reasoned classification from Stage 5 (incidentClassification).
  // Priority 2: Fall back to raw claim form incidentType string.
  // This ensures the fraud engine uses the correct scenario profile even when
  // the claim form says "collision" but the engine classified it as "rollover".
  const classifiedType = claimRecord.accidentDetails.incidentClassification?.incident_type;
  const rawScenario = (classifiedType && classifiedType !== "unknown")
    ? classifiedType
    : (claimRecord.accidentDetails.incidentType ?? "unknown");
  const scenarioMap: Record<string, ScenarioType> = {
    // Animal strike variants
    animal_strike: "animal_strike",
    animal: "animal_strike",
    livestock: "animal_strike",
    wildlife: "animal_strike",
    // Collision sub-types — now first-class scenario types
    rollover: "rollover",
    rear_end: "rear_end",
    sideswipe: "sideswipe",
    side_swipe: "sideswipe",
    head_on: "head_on",
    head_on_collision: "head_on",
    single_vehicle: "single_vehicle",
    single_vehicle_accident: "single_vehicle",
    pedestrian_strike: "pedestrian_strike",
    pedestrian: "pedestrian_strike",
    // Generic collision fallback
    vehicle_collision: "vehicle_collision",
    collision: "vehicle_collision",
    third_party: "vehicle_collision",
    mva: "vehicle_collision",
    // Other types
    theft: "theft",
    stolen: "theft",
    smash_and_grab: "theft",
    fire: "fire",
    flood: "flood",
    water: "flood",
    vandalism: "vandalism",
    malicious_damage: "vandalism",
    windscreen: "windscreen",
    glass: "windscreen",
    cosmetic: "cosmetic",
    hail: "weather_event",
    weather: "weather_event",
    weather_event: "weather_event",
    storm: "weather_event",
  };
  const scenario: ScenarioType =
    scenarioMap[rawScenario.toLowerCase().replace(/[\s-]/g, "_")] ?? "unknown";

  // ── Police report status ───────────────────────────────────────────────────
  const hasPoliceReport = !!claimRecord.policeReport.reportNumber;
  const policeStatus: PoliceReportStatus = hasPoliceReport ? "present" : "absent";

  // ── Timeline consistency ───────────────────────────────────────────────────
  // Use the data quality score as a proxy for timeline consistency
  // (a more precise value would come from a dedicated timeline analysis stage)
  const completeness = claimRecord.dataQuality.completenessScore;
  let timelineConsistency: TimelineConsistency = "unknown";
  if (completeness >= 70) timelineConsistency = "consistent";
  else if (completeness >= 50) timelineConsistency = "minor_gap";
  else if (completeness >= 30) timelineConsistency = "significant_gap";
  else timelineConsistency = "unknown";

  // ── Damage pattern result ──────────────────────────────────────────────────
  const damagePatternResult = physicsAnalysis.damagePatternValidation
    ? {
        pattern_match: physicsAnalysis.damagePatternValidation.pattern_match as
          "STRONG" | "MODERATE" | "WEAK" | "NONE",
        structural_damage_detected:
          physicsAnalysis.damagePatternValidation.structural_damage_detected,
        confidence: physicsAnalysis.damagePatternValidation.confidence,
        validation_detail: {
          image_contradiction:
            physicsAnalysis.damagePatternValidation.validation_detail.image_contradiction,
          image_contradiction_reason:
            physicsAnalysis.damagePatternValidation.validation_detail.image_contradiction_reason,
          primary_coverage_pct:
            physicsAnalysis.damagePatternValidation.validation_detail.primary_coverage_pct,
          secondary_coverage_pct:
            physicsAnalysis.damagePatternValidation.validation_detail.secondary_coverage_pct,
        },
      }
    : null;

  // ── Assessor confirmation ──────────────────────────────────────────────────
  // Default to "not_yet" — a future stage (assessor review) will update this
  const assessorConfirmation: AssessorConfirmation = "not_yet";

  return {
    scenario_type: scenario,
    police_report_status: policeStatus,
    timeline_consistency: timelineConsistency,
    damage_pattern_result: damagePatternResult,
    assessor_confirmation: assessorConfirmation,
  };
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
      const quoteAnalysis = analyseQuoteDeviation(claimRecord, damageAnalysis);
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

    // 3b. Scenario-aware fraud detection engine
    let scenarioFraudResult: Stage8Output["scenarioFraudResult"] = null;
    try {
      const scenarioInput = buildScenarioFraudInput(claimRecord, physicsAnalysis);
      scenarioFraudResult = evaluateScenarioFraud(scenarioInput);

      // Blend scenario fraud score into the overall indicator score
      // by adding scenario-specific flags as FraudIndicators
      for (const flag of scenarioFraudResult.flags) {
        // Avoid double-counting flags already generated by the legacy analysers
        const alreadyPresent = allIndicators.some(i => i.indicator === flag.code);
        if (!alreadyPresent) {
          allIndicators.push({
            indicator: flag.code,
            category: flag.category as FraudIndicator["category"],
            score: flag.score_contribution,
            description: flag.description,
          });
        }
      }

      // Apply scenario trust reductions: if scenario engine reduced score,
      // subtract the same trust reduction from the legacy consistency score
      const trustReduction = scenarioFraudResult.engine_metadata.trust_reduction_applied;
      if (trustReduction > 0) {
        consistency.score = Math.min(100, consistency.score + Math.round(trustReduction / 3));
      }

      ctx.log(
        "Stage 8",
        `Scenario fraud engine: ${scenarioFraudResult.risk_level} ` +
        `(score: ${scenarioFraudResult.fraud_score}/100, ` +
        `flags: ${scenarioFraudResult.flags.length}, ` +
        `FPP: ${scenarioFraudResult.false_positive_protection.length})`
      );
    } catch (e) {
      isDegraded = true;
      recoveryActions.push({
        target: "scenarioFraudEngine",
        strategy: "default_value",
        success: true,
        description: `Scenario fraud engine failed: ${String(e)}. Continuing without scenario-aware scoring.`,
      });
    }

    // 3c. Damage pattern validation — flag WEAK/NONE pattern matches as fraud indicators
    const damagePatternResult = physicsAnalysis.damagePatternValidation;
    // PERMANENT FIX: Check whether image processing actually ran before treating
    // a NONE pattern match as a fraud signal. If photos were not ingested (e.g.
    // images_not_processed flag is set, or imageUrls is empty), the NONE result
    // simply means there were no photos to validate against — not actual fraud.
    //
    // CRITICAL BUG FIX (2026-04-14): The original logic was:
    //   imageUrls.length > 0 || !(failure_flags?.includes(...) ?? false)
    // When imageUrls is empty AND failure_flags is null/undefined, this evaluates to:
    //   false || !(false) = false || true = TRUE — incorrectly treating NONE as fraud.
    // Correct logic: images were processed ONLY if imageUrls actually has content.
    // The failure_flags check is a secondary signal (explicit failure marker), not
    // a fallback that makes the result true when data is absent.
    const hasImages = claimRecord.damage.imageUrls.length > 0;
    const explicitlyFailed = stage3?.inputRecovery?.failure_flags?.includes('images_not_processed') === true;
    const imagesWereProcessed = hasImages && !explicitlyFailed;
    if (damagePatternResult) {
      if (damagePatternResult.pattern_match === "NONE") {
        if (imagesWereProcessed) {
          allIndicators.push({
            indicator: "damage_pattern_none",
            category: "consistency",
            score: 35,
            description: `Damage pattern validation returned NONE: no expected components for the claimed scenario were found. ` +
              `Scenario: ${damagePatternResult.reasoning.substring(0, 120)}.`,
          });
          consistency.score = Math.max(0, consistency.score - 25);
          consistency.notes = `${consistency.notes} Damage pattern validation: NONE match — damage components do not match the claimed incident scenario.`;
        } else {
          // Images were not processed — NONE result is a system gap, not a fraud signal
          allIndicators.push({
            indicator: "damage_pattern_unverified",
            category: "consistency",
            score: 8,
            description: `Damage pattern could not be validated: photographs were not processed through the analysis pipeline. Manual photo review required.`,
          });
          consistency.notes = `${consistency.notes} Damage pattern validation skipped — photos not yet processed.`;
        }
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

    // 3b. Narrative Reasoning fraud signals (Stage 7e)
    // If the incident narrative engine detected inconsistencies, inject them
    // as FraudIndicator entries so they contribute to the overall risk score.
    //
    // PHYSICS vs FRAUD SEPARATION (per architecture spec):
    //   NARRATIVE_PHYSICS_MISMATCH — speed/force inconsistency is a PHYSICS FINDING,
    //   not a fraud signal. It should be noted but must NOT contribute to the fraud
    //   score unless corroborated by additional fraud indicators (e.g. staged collision
    //   pattern, witness contradiction, or photo manipulation). Escalating speed
    //   inconsistency directly to fraud produces false positives for legitimate claims
    //   where the claimant underestimates impact speed (very common in rear-end events).
    const PHYSICS_ONLY_SIGNALS = new Set(["NARRATIVE_PHYSICS_MISMATCH"]);
    const narrativeAnalysis = claimRecord.accidentDetails.narrativeAnalysis;
    if (narrativeAnalysis && narrativeAnalysis.fraud_signals.length > 0) {
      let injected = 0;
      let physicsOnly = 0;
      for (const sig of narrativeAnalysis.fraud_signals) {
        const alreadyPresent = allIndicators.some(i => i.indicator === sig.code);
        if (alreadyPresent) continue;
        if (PHYSICS_ONLY_SIGNALS.has(sig.code)) {
          // Log as physics finding — zero fraud score contribution
          physicsOnly++;
          ctx.log(
            "Stage 8 (narrative)",
            `Physics finding (not fraud): [${sig.code}] ${sig.description}`
          );
          continue;
        }
        allIndicators.push({
          indicator: sig.code,
          category: "narrative",
          score: Math.min(25, Math.max(0, sig.score_contribution)),
          description: sig.description,
          evidence: sig.evidence,
        } as any);
        injected++;
      }
      ctx.log(
        "Stage 8 (narrative)",
        `Injected ${injected} narrative fraud signal(s), ${physicsOnly} physics-only signal(s) excluded from score. ` +
        `Narrative verdict: ${narrativeAnalysis.consistency_verdict}. ` +
        `Contaminated: ${narrativeAnalysis.was_contaminated}.`
      );
    }

    // 3c. Photo Forensics — EXIF, GPS, manipulation detection
    // Use classified damage photos when available (from Stage 2.6 image classifier),
    // otherwise fall back to raw imageUrls. This ensures we only run forensics on
    // actual damage photos, not document pages or quotation scans.
    let photoForensicsResult: Stage8Output["photoForensics"] = null;
    const classifiedDamagePhotos = ctx.classifiedImages?.damagePhotos?.map(p => p.url) ?? [];
    const photoUrlsForForensics = classifiedDamagePhotos.length > 0
      ? classifiedDamagePhotos
      : (ctx.damagePhotoUrls ?? claimRecord.damage.imageUrls ?? []);
    if (photoUrlsForForensics.length > 0) {
      try {
        const forensics = await runPhotoForensics(photoUrlsForForensics);
        photoForensicsResult = {
          analysedCount: forensics.analysedCount,
          errorCount: forensics.errorCount,
          anyGpsPresent: forensics.anyGpsPresent,
          anySuspicious: forensics.anySuspicious,
          photos: forensics.photos.map(p => ({
            url: p.url,
            error: p.error,
            analysisResult: p.analysisResult ? {
              is_suspicious: p.analysisResult.is_suspicious,
              confidence: p.analysisResult.confidence,
              flags: p.analysisResult.flags,
              gps_coordinates: p.analysisResult.gps_coordinates,
              capture_datetime: p.analysisResult.capture_datetime,
              manipulation_indicators: p.analysisResult.manipulation_indicators,
              image_hash: p.analysisResult.image_hash,
              recommendations: p.analysisResult.recommendations,
            } : null,
          })),
        };
        // Inject photo forensics fraud indicators
        for (const ind of forensics.indicators) {
          const alreadyPresent = allIndicators.some(i => i.indicator === ind.indicator);
          if (!alreadyPresent) {
            allIndicators.push(ind);
          }
        }
        ctx.log(
          "Stage 8 (photo-forensics)",
          `Analysed ${forensics.analysedCount}/${photoUrlsForForensics.length} photo(s). ` +
          `GPS present: ${forensics.anyGpsPresent}. Suspicious: ${forensics.anySuspicious}. ` +
          `Indicators injected: ${forensics.indicators.length}. Errors: ${forensics.errorCount}.`
        );
      } catch (photoErr) {
        ctx.log("Stage 8 (photo-forensics)", `Photo forensics failed: ${String(photoErr)} — skipping`);
      }
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

    // Stage 43: Cross-Engine Consistency Validation
    let crossEngineConsistency: Stage8Output["crossEngineConsistency"] = null;
    try {
      crossEngineConsistency = validateCrossEngineConsistency({
        claimRecord,
        stage6: damageAnalysis,
        stage7: physicsAnalysis,
        stage8: {
          fraudRiskScore,
          fraudRiskLevel,
          indicators: allIndicators,
          damageConsistencyScore: consistency.score,
          scenarioFraudResult,
        },
      });
      if (crossEngineConsistency) {
        ctx.log("Stage 8/43", `Cross-engine consistency: ${crossEngineConsistency.overall_status} (${crossEngineConsistency.consistency_score}/100), ${crossEngineConsistency.agreements.length} agreements, ${crossEngineConsistency.conflicts.length} conflicts`);
      }
    } catch (crossErr) {
      ctx.log("Stage 8/43", `Cross-engine consistency validator failed: ${String(crossErr)} — skipping`);
    }

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
      scenarioFraudResult,
      crossEngineConsistency,
      photoForensics: photoForensicsResult,
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
