/**
 * fraudPatternLearningEngine.ts — Phase 3 Learning and Calibration Engine
 *
 * Analyses past fraud-labelled claims to surface:
 *  - emerging_patterns: repeated fraud behaviours appearing in recent data
 *  - high_risk_indicators: signals with high precision (low false positive rate)
 *  - false_positive_patterns: signals that were flagged but later cleared by assessors
 *
 * Output contract:
 * {
 *   "emerging_patterns": [],
 *   "high_risk_indicators": [],
 *   "false_positive_patterns": []
 * }
 *
 * Design principles:
 *  - Improve precision, not just detection rate
 *  - Penalise indicators with high false positive rates
 *  - Surface scenario-specific patterns (animal_strike, theft, etc.)
 *  - Require minimum frequency before promoting a pattern
 */

// ─── Input Types ──────────────────────────────────────────────────────────────

/** A single fraud-labelled claim record for learning */
export interface FraudLearningRecord {
  /** Unique claim identifier */
  claim_id: number;
  /** Scenario type (animal_strike, vehicle_collision, theft, etc.) */
  scenario_type: string;
  /** Whether the claim was ultimately confirmed as fraudulent */
  confirmed_fraud: boolean;
  /** Whether the claim was cleared (not fraud) after assessor review */
  cleared_by_assessor: boolean;
  /** The fraud flags that were raised by the engine */
  raised_flags: FraudFlag[];
  /** The scenario fraud score (0-100) */
  fraud_score: number;
  /** The risk level assigned by the engine */
  risk_level: "LOW" | "MEDIUM" | "HIGH";
  /** Case signature for grouping */
  case_signature?: string | null;
  /** UTC timestamp in ms */
  timestamp_ms?: number | null;
  /** Quality tier from validated outcome recorder */
  quality_tier?: "HIGH" | "MEDIUM" | "LOW" | null;
}

/** A fraud flag raised by the scenario fraud engine */
export interface FraudFlag {
  /** Unique code for this flag (e.g., "no_police_report", "image_contradiction") */
  code: string;
  /** Human-readable label */
  label: string;
  /** Severity of the flag */
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  /** Score contribution of this flag */
  score_contribution: number;
  /** Whether this flag was suppressed by false positive protection */
  suppressed?: boolean;
  /** Scenario context */
  scenario_context?: string;
}

/** Input to the Fraud Pattern Learning Engine */
export interface FraudPatternInput {
  /** List of fraud-labelled learning records */
  records: FraudLearningRecord[];
  /** Optional: restrict analysis to a specific scenario type */
  scenario_filter?: string | null;
  /** Minimum number of occurrences before a pattern is surfaced */
  min_frequency?: number | null;
  /** Minimum precision (1 - FP rate) required to be a high_risk_indicator */
  min_precision?: number | null;
  /** Lookback window in days for "emerging" classification (default: 90) */
  emerging_window_days?: number | null;
}

// ─── Output Types ─────────────────────────────────────────────────────────────

/** An emerging fraud pattern detected in recent data */
export interface EmergingPattern {
  /** Unique pattern identifier */
  pattern_id: string;
  /** Human-readable description */
  description: string;
  /** Scenario types where this pattern appears */
  scenario_types: string[];
  /** The flag codes that define this pattern */
  flag_codes: string[];
  /** Number of claims exhibiting this pattern */
  frequency: number;
  /** Percentage of those claims confirmed as fraud */
  fraud_confirmation_rate: number;
  /** Whether this pattern is new (appeared only in the emerging window) */
  is_new: boolean;
  /** Trend: INCREASING | STABLE | DECREASING */
  trend: "INCREASING" | "STABLE" | "DECREASING";
  /** Example claim IDs */
  example_claim_ids: number[];
}

/** A high-precision fraud indicator */
export interface HighRiskIndicator {
  /** Flag code */
  flag_code: string;
  /** Human-readable label */
  label: string;
  /** Precision: proportion of times this flag correctly identified fraud */
  precision: number;
  /** Recall: proportion of fraud cases where this flag was raised */
  recall: number;
  /** F1 score combining precision and recall */
  f1_score: number;
  /** Total times this flag was raised */
  total_raised: number;
  /** Times raised on confirmed fraud claims */
  true_positives: number;
  /** Times raised on cleared (non-fraud) claims */
  false_positives: number;
  /** Scenario types where this indicator is most effective */
  effective_scenarios: string[];
  /** Recommended score weight adjustment */
  recommended_weight_adjustment: number;
}

/** A false positive pattern — flags that incorrectly identified fraud */
export interface FalsePositivePattern {
  /** Flag code */
  flag_code: string;
  /** Human-readable label */
  label: string;
  /** Number of times this flag was raised on cleared (non-fraud) claims */
  false_positive_count: number;
  /** Number of times this flag was raised on confirmed fraud claims */
  true_positive_count: number;
  /** False positive rate (FP / (FP + TP)) */
  false_positive_rate: number;
  /** Scenario types where false positives are most common */
  problematic_scenarios: string[];
  /** Recommended action */
  recommendation: string;
  /** Suggested score reduction to reduce false positives */
  suggested_score_reduction: number;
}

/** Output of the Fraud Pattern Learning Engine */
export interface FraudPatternOutput {
  /** Emerging fraud patterns in recent data */
  emerging_patterns: EmergingPattern[];
  /** High-precision fraud indicators */
  high_risk_indicators: HighRiskIndicator[];
  /** False positive patterns to suppress or reduce */
  false_positive_patterns: FalsePositivePattern[];
  /** Analysis metadata */
  metadata: {
    total_records_analysed: number;
    confirmed_fraud_count: number;
    cleared_count: number;
    unresolved_count: number;
    scenario_filter: string | null;
    min_frequency: number;
    min_precision: number;
    emerging_window_days: number;
    analysis_timestamp_ms: number;
  };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_MIN_FREQUENCY = 3;
const DEFAULT_MIN_PRECISION = 0.6;
const DEFAULT_EMERGING_WINDOW_DAYS = 90;

// Flag labels for display (populated from the scenario fraud engine's known flags)
const FLAG_LABELS: Record<string, string> = {
  no_police_report: "No Police Report",
  late_report: "Late Report",
  timeline_gap: "Timeline Gap",
  significant_gap: "Significant Timeline Gap",
  damage_pattern_none: "Damage Pattern: None",
  damage_pattern_weak: "Damage Pattern: Weak",
  damage_image_contradiction: "Damage Image Contradiction",
  image_contradiction: "Image Contradiction",
  high_value_claim: "High Value Claim",
  recently_purchased: "Recently Purchased Vehicle",
  vehicle_financed: "Vehicle Financed",
  prior_claims: "Prior Claims History",
  multiple_prior_claims: "Multiple Prior Claims",
  no_witnesses: "No Witnesses",
  single_vehicle: "Single Vehicle Incident",
  no_third_party: "No Third Party",
  no_repair_history: "No Repair History",
  theft_no_recovery: "Theft — No Recovery",
  fire_no_investigation: "Fire — No Investigation",
  flood_no_weather_data: "Flood — No Weather Data",
  vandalism_no_witnesses: "Vandalism — No Witnesses",
  windscreen_no_photos: "Windscreen — No Photos",
  cosmetic_high_cost: "Cosmetic — High Cost",
  animal_strike_no_evidence: "Animal Strike — No Evidence",
  days_to_report_excessive: "Excessive Days to Report",
  inconsistent_story: "Inconsistent Story",
  assessor_disputed: "Assessor Disputed Claim",
};

// ─── Core Analysis Functions ───────────────────────────────────────────────────

/**
 * Compute per-flag statistics across all records.
 */
function computeFlagStats(
  records: FraudLearningRecord[]
): Map<
  string,
  {
    label: string;
    total_raised: number;
    true_positives: number;
    false_positives: number;
    scenarios: Map<string, { tp: number; fp: number }>;
    score_contributions: number[];
  }
> {
  const stats = new Map<
    string,
    {
      label: string;
      total_raised: number;
      true_positives: number;
      false_positives: number;
      scenarios: Map<string, { tp: number; fp: number }>;
      score_contributions: number[];
    }
  >();

  for (const record of records) {
    for (const flag of record.raised_flags) {
      if (flag.suppressed) continue; // skip suppressed flags

      if (!stats.has(flag.code)) {
        stats.set(flag.code, {
          label: FLAG_LABELS[flag.code] ?? flag.label ?? flag.code,
          total_raised: 0,
          true_positives: 0,
          false_positives: 0,
          scenarios: new Map(),
          score_contributions: [],
        });
      }

      const s = stats.get(flag.code)!;
      s.total_raised++;
      s.score_contributions.push(flag.score_contribution);

      const scenarioKey = record.scenario_type;
      if (!s.scenarios.has(scenarioKey)) {
        s.scenarios.set(scenarioKey, { tp: 0, fp: 0 });
      }
      const sc = s.scenarios.get(scenarioKey)!;

      if (record.confirmed_fraud) {
        s.true_positives++;
        sc.tp++;
      } else if (record.cleared_by_assessor) {
        s.false_positives++;
        sc.fp++;
      }
      // unresolved claims are excluded from precision/recall calculations
    }
  }

  return stats;
}

/**
 * Identify high-risk indicators: flags with precision >= min_precision.
 */
function identifyHighRiskIndicators(
  flagStats: ReturnType<typeof computeFlagStats>,
  totalFraudCount: number,
  minFrequency: number,
  minPrecision: number
): HighRiskIndicator[] {
  const indicators: HighRiskIndicator[] = [];

  for (const [code, stats] of flagStats) {
    const resolved = stats.true_positives + stats.false_positives;
    if (resolved < minFrequency) continue;

    const precision = resolved > 0 ? stats.true_positives / resolved : 0;
    if (precision < minPrecision) continue;

    const recall =
      totalFraudCount > 0 ? stats.true_positives / totalFraudCount : 0;
    const f1 =
      precision + recall > 0
        ? (2 * precision * recall) / (precision + recall)
        : 0;

    // Find effective scenarios (where precision is highest)
    const effectiveScenarios: string[] = [];
    for (const [scenario, sc] of stats.scenarios) {
      const scenarioPrecision =
        sc.tp + sc.fp > 0 ? sc.tp / (sc.tp + sc.fp) : 0;
      if (scenarioPrecision >= minPrecision && sc.tp + sc.fp >= 2) {
        effectiveScenarios.push(scenario);
      }
    }

    // Recommend weight adjustment based on precision vs current average contribution
    const avgContribution =
      stats.score_contributions.length > 0
        ? stats.score_contributions.reduce((a, b) => a + b, 0) /
          stats.score_contributions.length
        : 0;
    const recommendedAdjustment =
      precision >= 0.85
        ? Math.min(5, Math.round(avgContribution * 0.1)) // high precision → small increase
        : 0;

    indicators.push({
      flag_code: code,
      label: stats.label,
      precision: Math.round(precision * 1000) / 1000,
      recall: Math.round(recall * 1000) / 1000,
      f1_score: Math.round(f1 * 1000) / 1000,
      total_raised: stats.total_raised,
      true_positives: stats.true_positives,
      false_positives: stats.false_positives,
      effective_scenarios: effectiveScenarios,
      recommended_weight_adjustment: recommendedAdjustment,
    });
  }

  // Sort by F1 score descending
  indicators.sort((a, b) => b.f1_score - a.f1_score);

  return indicators;
}

/**
 * Identify false positive patterns: flags with high FP rate.
 */
function identifyFalsePositivePatterns(
  flagStats: ReturnType<typeof computeFlagStats>,
  minFrequency: number
): FalsePositivePattern[] {
  const patterns: FalsePositivePattern[] = [];

  for (const [code, stats] of flagStats) {
    const resolved = stats.true_positives + stats.false_positives;
    if (resolved < minFrequency) continue;
    if (stats.false_positives === 0) continue;

    const fpRate = stats.false_positives / resolved;
    if (fpRate < 0.3) continue; // only surface if FP rate >= 30%

    // Find problematic scenarios
    const problematicScenarios: string[] = [];
    for (const [scenario, sc] of stats.scenarios) {
      const scenarioFpRate =
        sc.tp + sc.fp > 0 ? sc.fp / (sc.tp + sc.fp) : 0;
      if (scenarioFpRate >= 0.4 && sc.fp >= 2) {
        problematicScenarios.push(scenario);
      }
    }

    // Recommend action based on FP rate
    let recommendation: string;
    let suggestedScoreReduction: number;

    if (fpRate >= 0.7) {
      recommendation = `Consider removing or heavily suppressing "${stats.label}" — false positive rate is ${Math.round(fpRate * 100)}%. This flag is causing more harm than good.`;
      suggestedScoreReduction = Math.round(
        (stats.score_contributions.reduce((a, b) => a + b, 0) /
          Math.max(stats.score_contributions.length, 1)) *
          0.5
      );
    } else if (fpRate >= 0.5) {
      recommendation = `Reduce the score weight of "${stats.label}" by 30-40% — false positive rate is ${Math.round(fpRate * 100)}%. Add scenario-specific suppression for: ${problematicScenarios.join(", ") || "all scenarios"}.`;
      suggestedScoreReduction = Math.round(
        (stats.score_contributions.reduce((a, b) => a + b, 0) /
          Math.max(stats.score_contributions.length, 1)) *
          0.35
      );
    } else {
      recommendation = `Review "${stats.label}" in the context of ${problematicScenarios.join(", ") || "common scenarios"} — false positive rate of ${Math.round(fpRate * 100)}% suggests context-specific suppression is needed.`;
      suggestedScoreReduction = Math.round(
        (stats.score_contributions.reduce((a, b) => a + b, 0) /
          Math.max(stats.score_contributions.length, 1)) *
          0.2
      );
    }

    patterns.push({
      flag_code: code,
      label: stats.label,
      false_positive_count: stats.false_positives,
      true_positive_count: stats.true_positives,
      false_positive_rate: Math.round(fpRate * 1000) / 1000,
      problematic_scenarios: problematicScenarios,
      recommendation,
      suggested_score_reduction: suggestedScoreReduction,
    });
  }

  // Sort by false positive rate descending
  patterns.sort((a, b) => b.false_positive_rate - a.false_positive_rate);

  return patterns;
}

/**
 * Identify emerging fraud patterns from recent data.
 *
 * A pattern is a combination of 1-3 flags that co-occur on fraud-confirmed claims.
 * "Emerging" means it appears predominantly in the recent window.
 */
function identifyEmergingPatterns(
  records: FraudLearningRecord[],
  minFrequency: number,
  emergingWindowDays: number
): EmergingPattern[] {
  const nowMs = Date.now();
  const windowMs = emergingWindowDays * 24 * 60 * 60 * 1000;
  const cutoffMs = nowMs - windowMs;

  // Split records into recent and historical
  const recentRecords = records.filter(
    (r) => r.timestamp_ms != null && r.timestamp_ms >= cutoffMs
  );
  const historicalRecords = records.filter(
    (r) => r.timestamp_ms == null || r.timestamp_ms < cutoffMs
  );

  // Build co-occurrence map: flag_code_set → { frequency, fraud_count, scenarios, claim_ids, recent_count }
  type PatternData = {
    frequency: number;
    fraud_count: number;
    scenarios: Set<string>;
    claim_ids: number[];
    recent_count: number;
    historical_count: number;
  };

  const patternMap = new Map<string, PatternData>();

  const processRecord = (record: FraudLearningRecord, isRecent: boolean) => {
    const activeFlagCodes = record.raised_flags
      .filter((f) => !f.suppressed)
      .map((f) => f.code)
      .sort();

    if (activeFlagCodes.length === 0) return;

    // Generate all combinations of 1-3 flags
    const combinations: string[][] = [];
    for (let i = 0; i < activeFlagCodes.length; i++) {
      combinations.push([activeFlagCodes[i]]);
      for (let j = i + 1; j < activeFlagCodes.length; j++) {
        combinations.push([activeFlagCodes[i], activeFlagCodes[j]]);
        for (let k = j + 1; k < activeFlagCodes.length; k++) {
          combinations.push([
            activeFlagCodes[i],
            activeFlagCodes[j],
            activeFlagCodes[k],
          ]);
        }
      }
    }

    for (const combo of combinations) {
      const key = combo.join("+");
      if (!patternMap.has(key)) {
        patternMap.set(key, {
          frequency: 0,
          fraud_count: 0,
          scenarios: new Set(),
          claim_ids: [],
          recent_count: 0,
          historical_count: 0,
        });
      }
      const p = patternMap.get(key)!;
      p.frequency++;
      p.scenarios.add(record.scenario_type);
      if (record.confirmed_fraud) p.fraud_count++;
      if (p.claim_ids.length < 5) p.claim_ids.push(record.claim_id);
      if (isRecent) p.recent_count++;
      else p.historical_count++;
    }
  };

  for (const r of recentRecords) processRecord(r, true);
  for (const r of historicalRecords) processRecord(r, false);

  const emerging: EmergingPattern[] = [];

  for (const [key, data] of patternMap) {
    if (data.frequency < minFrequency) continue;
    if (data.fraud_count === 0) continue;

    const fraudConfirmationRate = data.fraud_count / data.frequency;
    if (fraudConfirmationRate < 0.5) continue; // require majority fraud confirmation

    const flagCodes = key.split("+");

    // Determine if this is "new" (only appears in recent window)
    const isNew = data.historical_count === 0 && data.recent_count >= minFrequency;

    // Determine trend
    let trend: "INCREASING" | "STABLE" | "DECREASING";
    if (data.recent_count === 0) {
      trend = "DECREASING";
    } else if (data.historical_count === 0) {
      trend = "INCREASING";
    } else {
      const recentRate = data.recent_count / Math.max(recentRecords.length, 1);
      const historicalRate =
        data.historical_count / Math.max(historicalRecords.length, 1);
      if (recentRate > historicalRate * 1.3) trend = "INCREASING";
      else if (recentRate < historicalRate * 0.7) trend = "DECREASING";
      else trend = "STABLE";
    }

    // Only include patterns that are recent or increasing
    if (trend === "DECREASING" && !isNew) continue;

    // Build description
    const flagLabels = flagCodes.map(
      (c) => FLAG_LABELS[c] ?? c
    );
    const scenarioList = Array.from(data.scenarios);
    const description =
      flagCodes.length === 1
        ? `${flagLabels[0]} appears in ${Math.round(fraudConfirmationRate * 100)}% of fraud-confirmed ${scenarioList.join("/")} claims`
        : `Co-occurrence of ${flagLabels.slice(0, -1).join(", ")} and ${flagLabels[flagLabels.length - 1]} — ${Math.round(fraudConfirmationRate * 100)}% fraud confirmation rate`;

    emerging.push({
      pattern_id: `PAT_${key.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`,
      description,
      scenario_types: scenarioList,
      flag_codes: flagCodes,
      frequency: data.frequency,
      fraud_confirmation_rate: Math.round(fraudConfirmationRate * 1000) / 1000,
      is_new: isNew,
      trend,
      example_claim_ids: data.claim_ids,
    });
  }

  // Sort: new patterns first, then by fraud confirmation rate
  emerging.sort((a, b) => {
    if (a.is_new !== b.is_new) return a.is_new ? -1 : 1;
    return b.fraud_confirmation_rate - a.fraud_confirmation_rate;
  });

  // Cap at top 20 patterns to avoid noise
  return emerging.slice(0, 20);
}

// ─── Main Export ──────────────────────────────────────────────────────────────

/**
 * Analyse past fraud-labelled claims to surface patterns, indicators, and false positives.
 */
export function analyseFraudPatterns(
  input: FraudPatternInput
): FraudPatternOutput {
  const {
    records: allRecords,
    scenario_filter = null,
    min_frequency = DEFAULT_MIN_FREQUENCY,
    min_precision = DEFAULT_MIN_PRECISION,
    emerging_window_days = DEFAULT_EMERGING_WINDOW_DAYS,
  } = input;

  const minFreq = min_frequency ?? DEFAULT_MIN_FREQUENCY;
  const minPrec = min_precision ?? DEFAULT_MIN_PRECISION;
  const windowDays = emerging_window_days ?? DEFAULT_EMERGING_WINDOW_DAYS;

  // Apply scenario filter
  const records = scenario_filter
    ? allRecords.filter((r) => r.scenario_type === scenario_filter)
    : allRecords;

  // Count resolved records
  const confirmedFraud = records.filter((r) => r.confirmed_fraud);
  const cleared = records.filter((r) => r.cleared_by_assessor);
  const unresolved = records.filter(
    (r) => !r.confirmed_fraud && !r.cleared_by_assessor
  );

  // Compute per-flag statistics
  const flagStats = computeFlagStats(records);

  // Identify high-risk indicators
  const highRiskIndicators = identifyHighRiskIndicators(
    flagStats,
    confirmedFraud.length,
    minFreq,
    minPrec
  );

  // Identify false positive patterns
  const falsePositivePatterns = identifyFalsePositivePatterns(
    flagStats,
    minFreq
  );

  // Identify emerging patterns
  const emergingPatterns = identifyEmergingPatterns(
    records,
    minFreq,
    windowDays
  );

  return {
    emerging_patterns: emergingPatterns,
    high_risk_indicators: highRiskIndicators,
    false_positive_patterns: falsePositivePatterns,
    metadata: {
      total_records_analysed: records.length,
      confirmed_fraud_count: confirmedFraud.length,
      cleared_count: cleared.length,
      unresolved_count: unresolved.length,
      scenario_filter: scenario_filter ?? null,
      min_frequency: minFreq,
      min_precision: minPrec,
      emerging_window_days: windowDays,
      analysis_timestamp_ms: Date.now(),
    },
  };
}

/**
 * Build a FraudLearningRecord from raw pipeline data.
 * Returns null if the record is not suitable for learning (not validated, no flags).
 */
export function buildFraudLearningRecord(
  claimId: number,
  scenarioType: string,
  fraudScoreBreakdownJson: string | object | null,
  validatedOutcomeJson: string | object | null,
  assessorOutcome?: "confirmed_fraud" | "cleared" | "unresolved" | null
): FraudLearningRecord | null {
  if (!fraudScoreBreakdownJson) return null;

  // Parse validated outcome
  let validatedOutcome: { store: boolean; quality_tier: string } | null = null;
  try {
    const raw = validatedOutcomeJson;
    validatedOutcome =
      typeof raw === "string" ? JSON.parse(raw) : (raw as unknown as typeof validatedOutcome);
  } catch {
    return null;
  }

  if (!validatedOutcome?.store) return null;

  // Parse fraud score breakdown
  let fraudBreakdown: {
    scenarioFraudResult?: {
      flags?: FraudFlag[];
      fraud_score?: number;
      risk_level?: string;
    };
    fraudScore?: number;
    riskLevel?: string;
  } | null = null;
  try {
    const raw = fraudScoreBreakdownJson;
    fraudBreakdown =
      typeof raw === "string"
        ? JSON.parse(raw)
        : (raw as unknown as typeof fraudBreakdown);
  } catch {
    return null;
  }

  if (!fraudBreakdown) return null;

  // Extract flags from scenario fraud result or top-level
  const scenarioResult = fraudBreakdown.scenarioFraudResult;
  const raisedFlags: FraudFlag[] = scenarioResult?.flags ?? [];
  const fraudScore =
    scenarioResult?.fraud_score ?? fraudBreakdown.fraudScore ?? 0;
  const riskLevel = (
    scenarioResult?.risk_level ?? fraudBreakdown.riskLevel ?? "LOW"
  ) as "LOW" | "MEDIUM" | "HIGH";

  // Determine confirmed_fraud and cleared_by_assessor from assessorOutcome
  const confirmedFraud = assessorOutcome === "confirmed_fraud";
  const clearedByAssessor = assessorOutcome === "cleared";

  return {
    claim_id: claimId,
    scenario_type: scenarioType,
    confirmed_fraud: confirmedFraud,
    cleared_by_assessor: clearedByAssessor,
    raised_flags: raisedFlags,
    fraud_score: fraudScore,
    risk_level: riskLevel,
    quality_tier: (validatedOutcome.quality_tier as "HIGH" | "MEDIUM" | "LOW") ?? null,
    timestamp_ms: null, // populated from DB when available
  };
}
