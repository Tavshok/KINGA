/**
 * pipeline-v2/stage-8-fraud.ts
 *
 * STAGE 8 — FRAUD ANALYSIS ENGINE (Self-Healing)
 *
 * Combines damage + physics + claim data to compute fraud risk.
 * NEVER halts — produces baseline fraud assessment even with missing data.
 *
 * ── FRAUD ANALYSIS ARCHITECTURE ────────────────────────────────────────────────
 *
 * Stage 8 is a COMPOSITE of four independent fraud sub-engines, each
 * contributing a signal to the final weighted fraud score:
 *
 *   1. scenarioFraudEngine.ts — evaluateScenarioFraud()
 *      Scenario-aware rule evaluation. Applies different norms per incident
 *      type (collision, animal_strike, theft, etc.). Strongest signal (C2).
 *      Includes false-positive protection for African-market claim patterns.
 *
 *   2. photoForensicsEngine.ts — runPhotoForensics()
 *      EXIF metadata extraction + manipulation heuristics on each damage photo.
 *      Flags GPS anomalies, timestamp inconsistencies, and editing artefacts.
 *      Runs in parallel with scenarioFraud (both are awaited together).
 *
 *   3. quoteSimilarityEngine.ts — analyseQuoteSimilarity()
 *      Detects when multiple quotes are suspiciously similar (template fraud).
 *      Only runs when 2+ quotes are present.
 *
 *   4. accidentDateCrossCheckEngine.ts — runAccidentDateCrossCheck()
 *      Cross-checks the accident date against EXIF photo timestamps,
 *      police report date, and assessor report date.
 *
 * ── SCORE AGGREGATION ──────────────────────────────────────────────────────────
 *
 * The final fraud_score is a WEIGHTED COMPOSITE across 6 categories:
 *   C1 Physical Consistency  28 pts
 *   C2 Scenario Intelligence 22 pts
 *   C3 Financial Anomaly     20 pts
 *   C4 Documentation         15 pts
 *   C5 Entity Intelligence   10 pts
 *   C6 Photo Forensics        5 pts
 *
 * Score-to-level mapping is defined in shared/fraudScoring.ts (FSS-2026-001).
 * Do NOT define local score bands here — always import from shared/fraudScoring.ts.
 *
 * crossEngineConsistencyValidator.ts runs AFTER all four engines to detect
 * contradictions between Stage 6 (damage), Stage 7 (physics), and Stage 8
 * (fraud). Contradictions are surfaced as adjuster flags, not score penalties.
 *
 * PHYSICS_ONLY_SIGNAL_CODES: signals produced by Stage 7 that must NOT
 * contribute to the fraud score unless corroborated by independent indicators.
 * See the PHYSICS_ONLY_SIGNAL_CODES constant below.
 */

import { ensureFraudContract } from "./engineFallback";
import { analyseQuoteSimilarity, type QuoteSimilarityResult } from "./quoteSimilarityEngine";
import { runAccidentDateCrossCheck, type DateCrossCheckResult } from "./accidentDateCrossCheckEngine";
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
  Assumption,
  RecoveryAction,
  InputRecoveryOutput,
} from "./types";
import { scoreToFraudLevel, type FraudRiskLevel } from "../../shared/fraudScoring";

/**
 * R-D-05: Codes for signals that are PHYSICS FINDINGS, not fraud signals.
 *
 * Derivation rule: a signal code belongs here when it is produced exclusively by
 * the physics/narrative engine (Stage 7 / Stage 7e) and represents a measurement
 * inconsistency that can arise from innocent causes (e.g. claimant speed estimation
 * error in rear-end events). It must NOT contribute to the fraud score unless
 * corroborated by independent fraud indicators.
 *
 * To add a new physics-only code: append it here. The Stage 8 narrative-signal
 * injection loop (search for PHYSICS_ONLY_SIGNAL_CODES) will automatically exclude it.
 */
export const PHYSICS_ONLY_SIGNAL_CODES: ReadonlySet<string> = new Set([
  "NARRATIVE_PHYSICS_MISMATCH",
]);

/**
 * Maps a fraud score to the canonical FraudRiskLevel per KINGA-FSS-2026-001.
 * Delegates to shared/fraudScoring.ts — the single source of truth.
 * Clamps to [0,100] before delegating to handle any out-of-range composite scores.
 */
function scoreToLevel(score: number): FraudRiskLevel {
  const clamped = Math.max(0, Math.min(100, score));
  return scoreToFraudLevel(clamped);
}

/**
 * KINGA Weighted Fraud Scoring Framework
 *
 * Replaces the naive Math.min(100, rawSum) formula with a defensible,
 * category-weighted composite score. Five mathematical properties:
 *
 * 1. Compositionality — weighted sum of independently normalised category scores.
 *    No single category can dominate the final score.
 * 2. Proportionality — raw indicator points are normalised against a calibrated
 *    maximum per category (derived from actual indicator score ranges in the codebase).
 * 3. Corroboration bonus — convergence of evidence across ≥3 independent categories
 *    amplifies the score (up to ×1.20), reflecting that multi-category corroboration
 *    is a stronger signal than a single large flag.
 * 4. Trust signal reduction — verified police report and assessor confirmation reduce
 *    the score, reflecting real-world evidentiary weight.
 * 5. Auditability — every point in the final score traces to a specific indicator,
 *    category, raw score, and normalised contribution.
 *
 * Category weights (total budget = 100 pts):
 *   C1 Physical Consistency  28 pts — hardest to fabricate (physics, direction, pattern)
 *   C2 Scenario Intelligence 22 pts — context-aware engine flags
 *   C3 Financial Anomaly     20 pts — inflated quotes, copy-quotations, cost deviation
 *   C4 Documentation         15 pts — police report, photos, date cross-check
 *   C5 Entity Intelligence   10 pts — officer/assessor/driver history patterns
 *   C6 Photo Forensics        5 pts — EXIF manipulation, GPS inconsistency
 *
 * IMPORTANT: Missing police report (documentation category) has a low weight (max 15 pts
 * for the entire documentation category) because absence of a police report is a data
 * quality gap, NOT a standalone fraud signal. Many legitimate claimants in African markets
 * do not file police reports for minor incidents due to accessibility, cost, and time
 * constraints. The signal only becomes significant when corroborated by physical or
 * financial anomalies.
 */

/** Category budget allocations (sum = 100) */
const CATEGORY_BUDGET: Record<string, number> = {
  physical_consistency: 28,
  scenario_intelligence: 22,
  financial_anomaly: 20,
  documentation_integrity: 15,
  entity_intelligence: 10,
  photo_forensics: 5,
};

/**
 * Calibrated raw caps per category.
 * These are the maximum raw points that can realistically accumulate within each category.
 * Indicators above the cap are still counted but proportionally compressed.
 */
const CATEGORY_RAW_CAP: Record<string, number> = {
  // direction_mismatch(25) + severity_mismatch(30) + pattern_none(55) + 2×cross_engine_CRITICAL(40)
  physical_consistency: 75,  // CALIBRATED 2026-07-28: reduced from 130 → 75. The original cap of 130 assumed
  // every possible C1 violation fires simultaneously (direction mismatch + severity mismatch +
  // cross-engine conflicts + excessive damage + unexplained pattern). In practice a single claim
  // generates 50–90 raw pts in C1. A cap of 75 ensures a claim with CRITICAL XV risk (3 XV
  // indicators = 55 pts) + excessive damage (15) + unexplained pattern (20) = 90 pts reaches
  // the full C1 budget (28/28), producing a moderate-tier fraud score as intended.
  // Scenario engine internal score is already 0-100; narrative signals capped at 25 each
  scenario_intelligence: 100,
  // quote_similarity(40) + cost_deviation_extreme(20) + financed_vehicle(15)
  financial_anomaly: 60,
  // police_absent(10) + no_photos(15) + date_contradiction(20) + low_completeness(10) + late_submission(20)
  documentation_integrity: 65,
  // officer_concentration(40+25 collusion) + assessor_bias(30+15) + driver_history(30+20)
  entity_intelligence: 90,
  // photo_manipulation(25) + GPS_mismatch(20) + other_flags(15)
  photo_forensics: 50,
};

/**
 * Maps a FraudIndicator to one of the 6 composite categories.
 */
function mapIndicatorCategory(indicator: FraudIndicator): string {
  const cat = (indicator.category ?? '').toLowerCase();
  const code = (indicator.indicator ?? '').toLowerCase();

  // C6: Photo Forensics (check before C1 to avoid misclassifying forensics as consistency)
  if (cat === 'photo_forensics' || cat === 'forensics' || code.startsWith('photo_') ||
      code.startsWith('gps_') || code.startsWith('exif_') || code.includes('manipulation')) {
    return 'photo_forensics';
  }
  // C1: Physical Consistency
  // cross_validation indicators (speed contradiction, damage pattern mismatch from XV engine)
  // are physical consistency signals — they belong in C1, not C2.
  if (cat === 'consistency' || cat === 'cross_validation' ||
      code.startsWith('damage_direction') || code.startsWith('severity_physics') ||
      code.startsWith('damage_pattern') || code.startsWith('damage_image') || code.startsWith('cross_engine_') ||
      code.startsWith('[cross-validation]') || code.includes('cross-validation')) {
    return 'physical_consistency';
  }
  // C3: Financial Anomaly
  if (cat === 'financial' || code.startsWith('quote_similarity') || code.startsWith('cost_deviation') ||
      code.startsWith('inflated_') || code === 'financed_vehicle_total_loss_risk' ||
      code === 'non_panel_repairer_requested') {
    return 'financial_anomaly';
  }
  // C4: Documentation Integrity
  if (cat === 'documentation' || cat === 'date_crosscheck' || code.startsWith('missing_police') ||
      code.startsWith('police_report') || code.startsWith('no_damage_photos') ||
      code.startsWith('photos_not_ingested') || code.startsWith('low_data_completeness') ||
      code === 'accident_date_inconsistency' || code.startsWith('late_submission')) {
    return 'documentation_integrity';
  }
  // C5: Entity Intelligence
  if (cat === 'cross_entity_intelligence' || cat === 'entity' ||
      code === 'officer_concentration' || code === 'assessor_routing_bias' ||
      code === 'driver_history_pattern') {
    return 'entity_intelligence';
  }
  // C2: Scenario Intelligence — narrative, timeline, pattern (from scenario engine), behaviour
  if (cat === 'narrative' || cat === 'timeline' || cat === 'pattern' ||
      cat === 'behaviour' || cat === 'scenario') {
    return 'scenario_intelligence';
  }
  // Default: scenario intelligence
  return 'scenario_intelligence';
}

/**
 * Computes the weighted composite fraud score from a list of indicators.
 *
 * @param indicators - All fraud indicators collected across all engines
 * @param scenarioFraudScore - The scenario engine's own 0-100 score (used as a floor for C2)
 * @returns Normalised fraud score in [0, 100] and a category breakdown for the report
 */
function computeWeightedFraudScore(
  indicators: FraudIndicator[],
  scenarioFraudScore: number | null
): { score: number; categoryBreakdown: Record<string, { rawScore: number; normScore: number; budget: number }> } {
  // Step 1: Accumulate raw scores per category
  const rawScores: Record<string, number> = {};
  for (const cat of Object.keys(CATEGORY_BUDGET)) rawScores[cat] = 0;

  for (const ind of indicators) {
    const cat = mapIndicatorCategory(ind);
    rawScores[cat] = (rawScores[cat] ?? 0) + (ind.score ?? 0);
  }

  // Step 2: For scenario_intelligence, use the higher of:
  //   (a) sum of injected scenario/narrative indicators
  //   (b) the scenario engine's own fraud_score (already 0-100)
  // This ensures the scenario engine's holistic assessment is not lost when
  // only a subset of its flags are injected as individual indicators.
  if (scenarioFraudScore !== null && scenarioFraudScore > rawScores.scenario_intelligence) {
    rawScores.scenario_intelligence = scenarioFraudScore;
  }

  // Step 3: Normalise each category against its raw cap and scale to budget
  const categoryBreakdown: Record<string, { rawScore: number; normScore: number; budget: number }> = {};
  let baseScore = 0;
  let categoriesWithSignals = 0;

  for (const [cat, budget] of Object.entries(CATEGORY_BUDGET)) {
    const raw = rawScores[cat] ?? 0;
    const cap = CATEGORY_RAW_CAP[cat] ?? 100;
    const capped = Math.min(raw, cap);
    const normScore = (capped / cap) * budget;
    categoryBreakdown[cat] = { rawScore: raw, normScore, budget };
    baseScore += normScore;
    if (raw > 0) categoriesWithSignals++;
  }

  // Step 4: Corroboration multiplier
  // Convergence of evidence across ≥3 independent categories is a stronger signal
  // than a single large flag in one category.
  const corroborationFactor = Math.min(1.20, 1.0 + 0.04 * Math.max(0, categoriesWithSignals - 2));

  // Step 5: Compute final score
  const amplified = baseScore * corroborationFactor;
  const finalScore = Math.round(Math.max(0, Math.min(100, amplified)));

  return { score: finalScore, categoryBreakdown };
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

    // CALIBRATION: 70-point damage severity threshold for physics mismatch and
    // the 30-point indicator score and 25-point consistency penalty are engineering-judgment.
    /** Damage severity score above which a physics mismatch is flagged */
    const DMG_PHYSICS_MISMATCH_THRESHOLD = 70;
    /** Fraud indicator score for severity/physics mismatch */
    const DMG_PHYSICS_MISMATCH_SCORE     = 30;
    /** Consistency score penalty for severity/physics mismatch */
    const DMG_PHYSICS_MISMATCH_PENALTY   = 25;
    if (dmgSeverity > DMG_PHYSICS_MISMATCH_THRESHOLD && (physSeverity === "minor" || physSeverity === "cosmetic")) {
      indicators.push({
        indicator: "severity_physics_mismatch",
        category: "consistency",
        score: DMG_PHYSICS_MISMATCH_SCORE,
        description: `High damage severity (${dmgSeverity}/100) but physics indicates ${physSeverity} impact.`,
      });
      consistencyScore = Math.max(0, consistencyScore - DMG_PHYSICS_MISMATCH_PENALTY);
      notes.push("Damage severity exceeds what physics analysis supports.");
    }
  }

  // Threshold raised to >20: severe rear-end collisions routinely produce 15-20 components
  // (bumper, boot lid, tail lamps, quarter panels, chassis, wiring harness, etc.).
  // Flagging at >15 generates false positives for legitimate high-severity claims.
  if (damageAnalysis.damagedParts.length > 20) {
    indicators.push({
      indicator: "excessive_damage_count",
      category: "consistency", // C1: Physical Consistency — high component count is a physical pattern signal
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

  // CALIBRATION: 50% completeness threshold and 10-point score for low data completeness
  // are engineering-judgment.
  /** Completeness score below which a low-data-completeness indicator is raised */
  const LOW_COMPLETENESS_THRESHOLD = 50;
  /** Fraud indicator score for low data completeness */
  const LOW_COMPLETENESS_SCORE     = 10;
  if (claimRecord.dataQuality.completenessScore < LOW_COMPLETENESS_THRESHOLD) {
    indicators.push({
      indicator: "low_data_completeness",
      category: "documentation",
      score: LOW_COMPLETENESS_SCORE,
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
  // CALIBRATION: Timeline consistency bands (70/50/30) derived from completeness score
  // are engineering-judgment proxies. A dedicated timeline analysis stage would be more accurate.
  /** Completeness score at or above which timeline is 'consistent' */
  const TIMELINE_CONSISTENT_THRESHOLD    = 70;
  /** Completeness score at or above which timeline has 'minor_gap' */
  const TIMELINE_MINOR_GAP_THRESHOLD     = 50;
  /** Completeness score at or above which timeline has 'significant_gap' */
  const TIMELINE_SIGNIFICANT_GAP_THRESHOLD = 30;
  if (completeness >= TIMELINE_CONSISTENT_THRESHOLD) timelineConsistency = "consistent";
  else if (completeness >= TIMELINE_MINOR_GAP_THRESHOLD) timelineConsistency = "minor_gap";
  else if (completeness >= TIMELINE_SIGNIFICANT_GAP_THRESHOLD) timelineConsistency = "significant_gap";
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
      // C1 Physical Consistency: inject a scored indicator for the damage consistency score itself.
      // The consistency score represents how well the observed damage is explained by the stated
      // incident. A score below 70 means >30% of damage is unexplained — this is a physical
      // consistency signal and must contribute to C1, not just be stored as metadata.
      // Score mapping (calibrated against CATEGORY_RAW_CAP.physical_consistency = 75):
      //   score 50–69 (30–50% unexplained) → indicator score 20 (moderate concern)
      //   score 30–49 (50–70% unexplained) → indicator score 40 (significant concern)
      //   score  0–29 (>70% unexplained)   → indicator score 60 (critical concern)
      if (consistency.score < 70) {
        const unexplainedFraction = (100 - consistency.score) / 100;
        const indicatorScore = consistency.score < 30 ? 60 : consistency.score < 50 ? 40 : 20;
        allIndicators.push({
          indicator: 'damage_pattern_unexplained',
          category: 'consistency',
          score: indicatorScore,
          description: `Damage consistency score: ${consistency.score}/100 (${Math.round(unexplainedFraction * 100)}% of observed damage unexplained by stated incident). ${consistency.notes}`,
        });
      }
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
        // R-D-02: scenarioFraudEngine returns 3-tier risk_level ("LOW"|"MEDIUM"|"HIGH").
        // Stage 8 uses 5-tier FraudRiskLevel. Label the source tier to avoid confusion.
        `Scenario fraud engine (3-tier): ${scenarioFraudResult.risk_level} ` +
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

    // 3d. Speed-claim inconsistency — inject as physical_consistency indicator when
    //     speedForensics shows a significant or critical deviation AND the ensemble
    //     confidence is MEDIUM or HIGH (guards against low-confidence false positives).
    //
    // Design rationale:
    //   - Uses the pre-computed speedForensics.deviationClass from computeSpeedForensics()
    //     (accidentPhysics.ts) — consistent thresholds: significant ≥36%, critical >60%.
    //   - riskScoreContribution (15 for significant, 25 for critical) is already calibrated
    //     in accidentPhysics.ts; we reuse it directly.
    //   - Maps to physical_consistency (C1) via category='consistency'.
    //   - NOT added to PHYSICS_ONLY_SIGNAL_CODES because it requires corroboration
    //     (ensemble confidence gate) before contributing to the fraud score.
    try {
      const sf = physicsAnalysis.speedForensics;
      const ensembleConf: string = ((physicsAnalysis.speedInferenceEnsemble as any)?.overallConfidence ?? 'LOW').toUpperCase();
      const confGatePassed = ensembleConf === 'MEDIUM' || ensembleConf === 'HIGH';
      if (sf && sf.deviationClass && confGatePassed &&
          (sf.deviationClass === 'significant' || sf.deviationClass === 'critical')) {
        const alreadyPresent = allIndicators.some(i => i.indicator === 'speed_claim_inconsistency');
        if (!alreadyPresent && sf.claimedSpeedKmh != null && sf.claimedSpeedKmh > 0) {
          const isCritical = sf.deviationClass === 'critical';
          allIndicators.push({
            indicator: 'speed_claim_inconsistency',
            category: 'consistency',
            score: sf.riskScoreContribution,
            description:
              `Stated speed (${sf.claimedSpeedKmh} km/h) is ${sf.deviationPct}% ` +
              `${sf.deviationKmh != null && sf.deviationKmh < 0 ? 'above' : 'below'} the physics-inferred consensus ` +
              `(${sf.physicsSpeedKmh} km/h, ${ensembleConf.toLowerCase()} confidence ensemble). ` +
              `Deviation class: ${sf.deviationLabel}. ${sf.interpretation}`,
            severity: isCritical ? 'critical' : 'high',
          } as FraudIndicator);
          ctx.log('Stage 8', `Speed-claim inconsistency indicator injected: ${sf.deviationClass} (${sf.deviationPct}% deviation, +${sf.riskScoreContribution}pts, ensemble=${ensembleConf})`);
        }
      }
    } catch (speedErr) {
      ctx.log('Stage 8', `Speed-claim inconsistency check failed (non-fatal): ${String(speedErr)}`);
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
    // R-D-05: Use module-level constant instead of inline Set literal.
    const PHYSICS_ONLY_SIGNALS = PHYSICS_ONLY_SIGNAL_CODES;
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
        // Attach vision crush depth to claimRecord so Stage 7 ensemble can use it.
        // Stage 8 runs before Stage 7 in the pipeline, making this the correct injection point.
        if (forensics.visionCrushDepthM != null) {
          claimRecord._forensicAnalysis = claimRecord._forensicAnalysis ?? {};
          claimRecord._forensicAnalysis.visionCrushDepthM = forensics.visionCrushDepthM;
          ctx.log('Stage 8 (photo-forensics)', `Vision crush depth: ${(forensics.visionCrushDepthM * 100).toFixed(1)} cm (median across ${forensics.analysedCount} photos)`);
        }
        photoForensicsResult = {
          analysedCount: forensics.analysedCount,
          errorCount: forensics.errorCount,
          anyGpsPresent: forensics.anyGpsPresent,
          anySuspicious: forensics.anySuspicious,
          visionCrushDepthM: forensics.visionCrushDepthM ?? null,
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
              ai_vision_description: p.analysisResult.ai_vision_description,
              // Persist is_non_vehicle so the report can filter document/form images correctly
              is_non_vehicle: p.analysisResult.is_non_vehicle ?? false,
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

    // 3d. Quote Similarity & Copy-Quotation Detection
    let quoteSimilarityResult: QuoteSimilarityResult | null = null;
    try {
      // extracted_quotes is ExtractedQuote[] (canonical type from quoteExtractionEngine)
      // DB fallback: if Stage 3 degraded and produced no quotes, read from panel_beater_quotes
      // (same pattern as Stage 9 resolvedExtractedQuotes — see stage-9-cost.ts)
      let extractedQuotes: any[] = stage3?.inputRecovery?.extracted_quotes ?? [];
      if (extractedQuotes.length === 0 && ctx.db && claimRecord.claimId) {
        try {
          const { panelBeaterQuotes, panelBeaters } = await import("../../drizzle/schema");
          const { eq } = await import("drizzle-orm");
          const dbRows = await ctx.db
            .select({
              quotedAmount: panelBeaterQuotes.quotedAmount,
              laborCost: panelBeaterQuotes.laborCost,
              partsCost: panelBeaterQuotes.partsCost,
              currencyCode: panelBeaterQuotes.currencyCode,
              componentsJson: panelBeaterQuotes.componentsJson,
              panelBeaterName: panelBeaters.businessName,
            })
            .from(panelBeaterQuotes)
            .leftJoin(panelBeaters, eq(panelBeaterQuotes.panelBeaterId, panelBeaters.id))
            .where(eq(panelBeaterQuotes.claimId, claimRecord.claimId));
          if (dbRows.length > 0) {
            extractedQuotes = dbRows
              .filter((r: any) => (r.quotedAmount ?? 0) > 0)
              .map((r: any) => ({
                panel_beater: r.panelBeaterName ?? "Panel Beater",
                total_cost: r.quotedAmount / 100,
                currency: r.currencyCode ?? "USD",
                components: (() => { try { return r.componentsJson ? JSON.parse(r.componentsJson) : []; } catch { return []; } })(),
                labour_cost: r.laborCost ? r.laborCost / 100 : null,
                parts_cost: r.partsCost ? r.partsCost / 100 : null,
                confidence: "medium",
                quote_type: "repair",
              }));
            ctx.log("Stage 8", `DB fallback: loaded ${extractedQuotes.length} quote(s) from panel_beater_quotes for fraud analysis`);
          }
        } catch (dbErr) {
          ctx.log("Stage 8", `DB fallback query failed (non-fatal): ${String(dbErr)}`);
        }
      }
      if (extractedQuotes.length >= 2) {
        const damageComponents = damageAnalysis.damagedParts.map((p: any) => p.name ?? p.part ?? String(p));
        quoteSimilarityResult = analyseQuoteSimilarity(extractedQuotes, damageComponents);
        if (quoteSimilarityResult.should_flag) {
          allIndicators.push({
            indicator: "quote_similarity_detected",
            category: "financial",
            score: quoteSimilarityResult.fraud_score_contribution,
            description: quoteSimilarityResult.summary,
          });
        }
        ctx.log(
          "Stage 8 (quote-similarity)",
          `${extractedQuotes.length} quotes analysed. Verdict: ${quoteSimilarityResult.overall_verdict} ` +
          `(risk: ${quoteSimilarityResult.overall_risk_score}/100). ` +
          `Unquoted damage components: ${quoteSimilarityResult.unquoted_damage_components.length}. ` +
          `Extra quoted: ${quoteSimilarityResult.extra_quoted_components.length}.`
        );
      }
    } catch (simErr) {
      isDegraded = true;
      recoveryActions.push({
        target: "quoteSimilarityEngine",
        strategy: "default_value",
        success: true,
        description: `Quote similarity analysis failed: ${String(simErr)}. Skipping.`,
      });
    }

    // 3e. Accident Date Cross-Check (claim form vs police report vs image EXIF)
    let accidentDateCrossCheckResult: DateCrossCheckResult | null = null;
    try {
      const photoForensicsPhotos = photoForensicsResult?.photos ?? [];

      // SUBMISSION DATE LOGIC (Fix: C-05-LATE-SUBMISSION)
      // ctx.claim.createdAt is the KINGA system ingestion date (when the PDF was uploaded),
      // NOT the actual claim lodgement date. Using it causes false "359 days late" flags
      // when a claim is re-processed or uploaded retrospectively.
      //
      // Correct approach: use the earliest document-derived date as a proxy for when
      // the claim was actually registered with the insurer:
      //   1. Police report date (most reliable — issued at/near time of incident)
      //   2. Assessor inspection date (if extracted)
      //   3. null — suppress the late submission check entirely
      //
      // We deliberately do NOT fall back to ctx.claim.createdAt because it is the
      // KINGA ingestion timestamp, not the insurer's claim registration date.
      const policeReportDateStr = (claimRecord as any).policeReportDate ?? claimRecord.policeReport?.reportDate ?? null;
      const claimSubmissionDateForCrossCheck: string | null = policeReportDateStr ?? null;
      // Log the source so adjusters can audit the decision
      ctx.log(
        'Stage 8 (date-crosscheck)',
        claimSubmissionDateForCrossCheck
          ? `Submission date proxy: policeReportDate=${claimSubmissionDateForCrossCheck} (system createdAt suppressed to avoid false late-submission flags)`
          : `Submission date: not available from documents — late submission check suppressed (system createdAt not used as proxy)`
      );

      accidentDateCrossCheckResult = runAccidentDateCrossCheck({
        accidentDate: claimRecord.accidentDetails?.date ?? (claimRecord as any).accidentDate ?? null,
        policeReportDate: policeReportDateStr,
        // Use document-derived date only — never system ingestion timestamp
        claimSubmissionDate: claimSubmissionDateForCrossCheck,
        photoForensicsResults: photoForensicsPhotos.map((p: any) => ({
          url: p.url,
          analysisResult: p.analysisResult ? {
            capture_datetime: p.analysisResult.capture_datetime ?? null,
            is_non_vehicle: p.analysisResult.is_non_vehicle ?? false,
          } : null,
        })),
      });
      if (accidentDateCrossCheckResult.fraudScore > 0) {
        allIndicators.push({
          indicator: 'accident_date_inconsistency',
          category: 'documentation',
          score: accidentDateCrossCheckResult.fraudScore,
          description: accidentDateCrossCheckResult.summary,
          // CALIBRATION: 15-point threshold for 'high' vs 'medium' date-crosscheck severity
          // is engineering-judgment.
          severity: accidentDateCrossCheckResult.fraudScore >= 15 ? 'high' : 'medium',
        });
      }
      ctx.log(
        'Stage 8 (date-crosscheck)',
        `Verdict: ${accidentDateCrossCheckResult.verdict}. ` +
        `Fraud score: +${accidentDateCrossCheckResult.fraudScore}. ` +
        `Pre-incident images: ${accidentDateCrossCheckResult.preIncidentImages.length}. ` +
        `Photos with EXIF: ${accidentDateCrossCheckResult.photosWithExifDate}.`
      );
    } catch (dateErr) {
      isDegraded = true;
      recoveryActions.push({
        target: 'accidentDateCrossCheckEngine',
        strategy: 'default_value',
        success: true,
        description: `Accident date cross-check failed: ${String(dateErr)}. Skipping.`,
      });
    }

    // 4. Missing data penalty
    // CALIBRATION: 30% completeness threshold for degraded fraud analysis is engineering-judgment.
    /** Completeness score below which fraud analysis is flagged as degraded */
    const FRAUD_DEGRADED_COMPLETENESS_THRESHOLD = 30;
    if (claimRecord.dataQuality.completenessScore < FRAUD_DEGRADED_COMPLETENESS_THRESHOLD) {
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

    // ── Cross-Entity Intelligence Checks (Relationship Graph) ──────────────
    // Query entity registries built from historical claim data.
    // Non-blocking: silently skipped if registry is empty or unavailable.
    try {
      const { checkOfficerConcentration, checkAssessorRouting, checkDriverHistory } = await import('../services/entityRegistry');
      const tenantId = (claimRecord as any)?.tenantId ?? 'default';
      const policeReport = claimRecord?.policeReport as any;
      const assessorInfo = (claimRecord as any)?.assessorInfo;
      const driver = claimRecord?.driver as any;
      const accidentDetails = claimRecord?.accidentDetails as any;

      // 1. Officer concentration
      const officerCheck = await checkOfficerConcentration(
        policeReport?.officerName, policeReport?.officerBadgeNumber, tenantId
      );
      if (officerCheck && officerCheck.fraudPoints > 0) {
        const levelLabel = ['critical','high'].includes(officerCheck.riskLevel) ? officerCheck.riskLevel.toUpperCase() : 'ADVISORY';
        allIndicators.push({
          indicator: 'OFFICER_CONCENTRATION',
          description: `Officer ${officerCheck.officerName} has attended ${officerCheck.totalClaims} claims — ${levelLabel} concentration risk.${officerCheck.collusionWebDetected ? ` Collusion web: same officer+assessor on ${officerCheck.topAssessorCount}+ claims.` : ''}`,
          score: officerCheck.fraudPoints,
          severity: ['critical','high'].includes(officerCheck.riskLevel) ? 'high' : 'medium',
          category: 'cross_entity_intelligence',
          evidence: [`Officer total claims: ${officerCheck.totalClaims}`, `Collusion web: ${officerCheck.collusionWebDetected}`],
        });
        ctx.log('Stage 8 (entity)', `Officer concentration: ${officerCheck.officerName} — ${officerCheck.totalClaims} claims, +${officerCheck.fraudPoints}pts`);
      }

      // 2. Assessor routing bias
      const assessorCheck = await checkAssessorRouting(assessorInfo?.name, tenantId);
      if (assessorCheck && assessorCheck.fraudPoints > 0) {
        allIndicators.push({
          indicator: 'ASSESSOR_ROUTING_BIAS',
          description: `Assessor ${assessorCheck.assessorName} routes ${assessorCheck.topPanelBeaterPct}% of claims to a single panel beater (${assessorCheck.totalClaims} claims assessed).${assessorCheck.collusionSuspected ? ' Collusion suspected.' : ''}`,
          score: assessorCheck.fraudPoints,
          severity: assessorCheck.collusionSuspected ? 'high' : 'medium',
          category: 'cross_entity_intelligence',
          evidence: [`Routing concentration: ${assessorCheck.topPanelBeaterPct}%`, `Cost suppression claims: ${assessorCheck.costSuppressionClaims}`],
        });
        ctx.log('Stage 8 (entity)', `Assessor routing bias: ${assessorCheck.assessorName} — ${assessorCheck.topPanelBeaterPct}% to top panel beater, +${assessorCheck.fraudPoints}pts`);
      }

      // 3. Driver history
      const driverCheck = await checkDriverHistory(
        driver?.name, driver?.idNumber, driver?.licenceNumber, accidentDetails?.date, tenantId
      );
      if (driverCheck && driverCheck.fraudPoints > 0) {
        const desc = driverCheck.rapidReclaimFlag
          ? `Driver ${driverCheck.driverName} filed a claim ${driverCheck.daysSinceLastClaim} days ago — rapid re-claim pattern.`
          : `Driver ${driverCheck.driverName} has ${driverCheck.totalClaims} claims on record.${driverCheck.addressChangeCount >= 3 ? ` Address changed ${driverCheck.addressChangeCount} times.` : ''}`;
        allIndicators.push({
          indicator: 'DRIVER_HISTORY_PATTERN',
          description: desc,
          score: driverCheck.fraudPoints,
          severity: driverCheck.rapidReclaimFlag ? 'high' : 'medium',
          category: 'cross_entity_intelligence',
          evidence: [`Total claims: ${driverCheck.totalClaims}`, driverCheck.daysSinceLastClaim !== undefined ? `Days since last claim: ${driverCheck.daysSinceLastClaim}` : 'First claim on record', `Address changes: ${driverCheck.addressChangeCount}`],
        });
        ctx.log('Stage 8 (entity)', `Driver history: ${driverCheck.driverName} — ${driverCheck.totalClaims} claims, rapid reclaim: ${driverCheck.rapidReclaimFlag}, +${driverCheck.fraudPoints}pts`);
      }
    } catch (entityErr: any) {
      ctx.log('Stage 8 (entity)', `Cross-entity checks skipped (non-fatal): ${String(entityErr).substring(0, 80)}`);
    }

    // ── Weighted composite fraud scoring ───────────────────────────────────────
    // Use the 6-category weighted framework instead of the naive raw sum.
    // The scenario engine's fraud_score is passed as a floor for the scenario_intelligence
    // category to ensure its holistic assessment is not lost.
    const scenarioEngineScore = scenarioFraudResult?.fraud_score ?? null;
    const { score: fraudRiskScore, categoryBreakdown: fraudCategoryBreakdown } =
      computeWeightedFraudScore(allIndicators, scenarioEngineScore);
    const fraudRiskLevel = scoreToLevel(fraudRiskScore);
    ctx.log("Stage 8", `Weighted fraud score: ${fraudRiskScore}/100 (${fraudRiskLevel}). Category breakdown: ` +
      Object.entries(fraudCategoryBreakdown)
        .filter(([, v]) => v.rawScore > 0)
        .map(([k, v]) => `${k}=${v.normScore.toFixed(1)}/${v.budget}`)
        .join(', '));

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

        // ── STRATEGIC FIX: Feed C-check conflicts back into the fraud score ──
        // The cross-engine validator already detects physics↔damage↔fraud conflicts
        // (C1–C9) but previously these findings were stored and never counted.
        // We now inject each conflict as a FraudIndicator so the fraud score
        // reflects ALL detected inconsistencies, not just the legacy indicators.
        //
        // Score mapping (per conflict severity):
        //   CRITICAL    → 20 pts  (e.g. physics says minor, damage says catastrophic)
        //   SIGNIFICANT → 12 pts  (e.g. direction mismatch confirmed by two engines)
        //   MINOR       → 4 pts   (e.g. small severity band gap)
        //
        // Deduplication: skip if an indicator with the same check_id already exists
        // from the legacy analysers (e.g. damage_direction_mismatch from analyseDamageConsistency).
        const CONFLICT_SCORE: Record<string, number> = { CRITICAL: 20, SIGNIFICANT: 12, MINOR: 4 };
        for (const conflict of crossEngineConsistency.conflicts) {
          const indicatorId = `cross_engine_${conflict.check_id.toLowerCase()}`;
          const alreadyPresent = allIndicators.some(i => i.indicator === indicatorId);
          if (!alreadyPresent) {
            const score = CONFLICT_SCORE[conflict.severity] ?? 4;
            allIndicators.push({
              indicator: indicatorId,
              category: "consistency",
              score,
              description: `[${conflict.check_id}] ${conflict.label}: ${conflict.physics_says || conflict.damage_says || conflict.fraud_says || 'Cross-engine conflict detected'}. Recommended action: ${conflict.recommended_action}`,
            });
            ctx.log("Stage 8/43", `Injected cross-engine conflict indicator: ${indicatorId} (+${score}pts) — ${conflict.label}`);
          }
        }
      }
    } catch (crossErr) {
      ctx.log("Stage 8/43", `Cross-engine consistency validator failed: ${String(crossErr)} — skipping`);
    }

    // ── Recalculate final score AFTER cross-engine injection ──────────────────
    // The cross-engine loop may have pushed additional cross-engine conflict indicators.
    // We must recompute using the weighted framework so the stored fraudRiskScore matches
    // the full indicator set and the cover card, executive summary, and breakdown table
    // all read the same value.
    const { score: finalFraudRiskScore, categoryBreakdown: finalCategoryBreakdown } =
      computeWeightedFraudScore(allIndicators, scenarioEngineScore);
    const finalFraudRiskLevel = scoreToLevel(finalFraudRiskScore);
    if (finalFraudRiskScore !== fraudRiskScore) {
      ctx.log("Stage 8", `Fraud score updated after cross-engine injection: ${fraudRiskScore} → ${finalFraudRiskScore}/100`);
    }
    // Attach category breakdown to the output for the report UI
    void finalCategoryBreakdown; // will be attached to output below

    // Stage 26: apply defensive contract — ensure score, level, and at least 1 indicator
    const output = ensureFraudContract({
      fraudRiskScore: finalFraudRiskScore,
      fraudRiskLevel: finalFraudRiskLevel,
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
      quoteSimilarity: quoteSimilarityResult,
      accidentDateCrossCheck: accidentDateCrossCheckResult,
    }, isDegraded ? "degraded_analysis" : "success");

    // Attach weighted category breakdown to output for the report UI
    (output as any).fraudCategoryBreakdown = finalCategoryBreakdown;
    ctx.log("Stage 8", `Fraud analysis complete. Risk: ${finalFraudRiskLevel} (${finalFraudRiskScore}/100), Indicators: ${allIndicators.length}, Consistency: ${consistency.score}/100`);

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

/**
 * Exported helper: recompute the weighted fraud score from a full indicator list.
 * Used by the orchestrator after Signal-XV injects cross-validation indicators
 * into stage8Data.indicators, so the final stored score reflects all signals.
 *
 * @param indicators - Full indicator list (original Stage 8 + XV-injected)
 * @param scenarioFraudScore - The scenario engine's own 0-100 score
 * @returns { score, riskLevel }
 */
export function recomputeFraudScore(
  indicators: FraudIndicator[],
  scenarioFraudScore: number | null
): { score: number; riskLevel: FraudRiskLevel } {
  const { score } = computeWeightedFraudScore(indicators, scenarioFraudScore);
  return { score, riskLevel: scoreToLevel(score) };
}
