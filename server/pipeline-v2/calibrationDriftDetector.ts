/**
 * calibrationDriftDetector.ts — Phase 3 Learning and Calibration Engine
 *
 * Compares AI-predicted values against actual validated outcomes to detect
 * systematic calibration drift. Returns a structured JSON report.
 *
 * Output contract:
 * {
 *   "drift_detected": true | false,
 *   "drift_areas": [],
 *   "severity": "LOW" | "MEDIUM" | "HIGH",
 *   "recommendation": ""
 * }
 *
 * Rules:
 *  - Cost drift > 20% of actual → flag
 *  - Severity mismatch rate > 20% → flag
 *  - Continuous drift (same direction across ≥3 consecutive windows) → HIGH severity
 *  - Multiple drift areas simultaneously → escalate severity
 */

// ─── Input Types ──────────────────────────────────────────────────────────────

/** A single validated outcome record for drift analysis */
export interface DriftRecord {
  /** Unique claim identifier */
  claim_id: number;
  /** Scenario type */
  scenario_type: string;
  /** AI-predicted cost (e.g. aiEstimatedCost) */
  ai_predicted_cost: number;
  /** Actual validated cost (assessor-approved or final approved amount) */
  actual_cost: number;
  /** AI-predicted severity: minor | moderate | severe */
  ai_predicted_severity: "minor" | "moderate" | "severe";
  /** Actual validated severity confirmed by assessor */
  actual_severity: "minor" | "moderate" | "severe";
  /** UTC timestamp in ms — used for trend windowing */
  timestamp_ms: number;
  /** Quality tier of this record */
  quality_tier?: "HIGH" | "MEDIUM" | "LOW" | null;
}

/** Input to the Calibration Drift Detector */
export interface CalibrationDriftInput {
  /** Validated outcome records to analyse */
  records: DriftRecord[];
  /**
   * Cost drift threshold as a fraction (default: 0.20 = 20%).
   * A record is considered drifted if |ai_cost - actual_cost| / actual_cost > threshold.
   */
  cost_drift_threshold?: number | null;
  /**
   * Severity mismatch rate threshold as a fraction (default: 0.20 = 20%).
   * Drift is flagged if mismatch_count / total > threshold.
   */
  severity_mismatch_threshold?: number | null;
  /**
   * Number of consecutive time windows required to classify drift as "continuous"
   * and escalate to HIGH severity (default: 3).
   */
  continuous_drift_window_count?: number | null;
  /**
   * Size of each time window in days for trend analysis (default: 30).
   */
  window_size_days?: number | null;
  /**
   * Optional: restrict analysis to a specific scenario type.
   */
  scenario_filter?: string | null;
}

// ─── Output Types ─────────────────────────────────────────────────────────────

/** A specific area where drift was detected */
export interface DriftArea {
  /** Dimension of drift: "cost" | "severity" | "cost_direction" */
  dimension: "cost" | "severity" | "cost_direction";
  /** Human-readable description of the drift */
  description: string;
  /** Measured drift value (e.g. 0.32 = 32% cost drift) */
  measured_value: number;
  /** Threshold that was exceeded */
  threshold: number;
  /** Direction of cost drift: "over_estimate" | "under_estimate" | "mixed" | null */
  direction: "over_estimate" | "under_estimate" | "mixed" | null;
  /** Scenario types most affected */
  affected_scenarios: string[];
  /** Number of records contributing to this drift */
  affected_record_count: number;
  /** Whether this drift is continuous across multiple time windows */
  is_continuous: boolean;
  /** Number of consecutive windows showing drift in the same direction */
  consecutive_window_count: number;
}

/** Output of the Calibration Drift Detector */
export interface CalibrationDriftOutput {
  /** Whether any drift was detected */
  drift_detected: boolean;
  /** Specific areas where drift was detected */
  drift_areas: DriftArea[];
  /** Overall severity of detected drift */
  severity: "LOW" | "MEDIUM" | "HIGH";
  /** Actionable recommendation */
  recommendation: string;
  /** Detailed statistics for transparency */
  statistics: {
    total_records: number;
    records_with_cost_drift: number;
    records_with_severity_mismatch: number;
    mean_cost_error_pct: number;
    median_cost_error_pct: number;
    mean_absolute_error_usd: number;
    over_estimate_count: number;
    under_estimate_count: number;
    severity_mismatch_rate: number;
    severity_confusion: SeverityConfusion;
    by_scenario: Record<string, ScenarioDriftStats>;
    windows_analysed: number;
    continuous_drift_detected: boolean;
  };
  /** Analysis metadata */
  metadata: {
    records_analysed: number;
    scenario_filter: string | null;
    cost_drift_threshold: number;
    severity_mismatch_threshold: number;
    continuous_drift_window_count: number;
    window_size_days: number;
    analysis_timestamp_ms: number;
  };
}

/** Confusion matrix for severity predictions */
export interface SeverityConfusion {
  minor_predicted_as_moderate: number;
  minor_predicted_as_severe: number;
  moderate_predicted_as_minor: number;
  moderate_predicted_as_severe: number;
  severe_predicted_as_minor: number;
  severe_predicted_as_moderate: number;
  correct: number;
}

/** Per-scenario drift statistics */
export interface ScenarioDriftStats {
  record_count: number;
  mean_cost_error_pct: number;
  severity_mismatch_rate: number;
  cost_drift_flagged: boolean;
  severity_drift_flagged: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_COST_DRIFT_THRESHOLD = 0.20;
const DEFAULT_SEVERITY_MISMATCH_THRESHOLD = 0.20;
const DEFAULT_CONTINUOUS_DRIFT_WINDOW_COUNT = 3;
const DEFAULT_WINDOW_SIZE_DAYS = 30;

// ─── Utility Functions ────────────────────────────────────────────────────────

/** Compute the signed cost error as a fraction of actual cost */
function costErrorFraction(predicted: number, actual: number): number {
  if (actual === 0) return predicted === 0 ? 0 : 1;
  return (predicted - actual) / actual;
}

/** Compute the absolute cost error as a fraction of actual cost */
function absCostErrorFraction(predicted: number, actual: number): number {
  return Math.abs(costErrorFraction(predicted, actual));
}

/** Compute median of a number array */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/** Assign records to time windows based on timestamp */
function assignToWindows(
  records: DriftRecord[],
  windowSizeDays: number
): Map<number, DriftRecord[]> {
  if (records.length === 0) return new Map();

  const windowMs = windowSizeDays * 24 * 60 * 60 * 1000;
  const minTs = Math.min(...records.map((r) => r.timestamp_ms));

  const windows = new Map<number, DriftRecord[]>();
  for (const record of records) {
    const windowIndex = Math.floor((record.timestamp_ms - minTs) / windowMs);
    if (!windows.has(windowIndex)) windows.set(windowIndex, []);
    windows.get(windowIndex)!.push(record);
  }
  return windows;
}

/** Detect continuous drift direction across consecutive windows */
function detectContinuousDrift(
  windows: Map<number, DriftRecord[]>,
  costThreshold: number,
  severityThreshold: number
): {
  cost_continuous: boolean;
  cost_consecutive_count: number;
  cost_direction: "over_estimate" | "under_estimate" | "mixed" | null;
  severity_continuous: boolean;
  severity_consecutive_count: number;
} {
  if (windows.size < 2) {
    return {
      cost_continuous: false,
      cost_consecutive_count: 0,
      cost_direction: null,
      severity_continuous: false,
      severity_consecutive_count: 0,
    };
  }

  const sortedWindowKeys = Array.from(windows.keys()).sort((a, b) => a - b);

  // Per-window cost direction and severity mismatch rate
  const windowStats = sortedWindowKeys.map((key) => {
    const recs = windows.get(key)!;
    const errors = recs.map((r) => costErrorFraction(r.ai_predicted_cost, r.actual_cost));
    const meanError = errors.reduce((a, b) => a + b, 0) / errors.length;
    const absMeanError = Math.abs(meanError);
    const direction: "over_estimate" | "under_estimate" | "none" =
      absMeanError > costThreshold
        ? meanError > 0
          ? "over_estimate"
          : "under_estimate"
        : "none";

    const mismatches = recs.filter(
      (r) => r.ai_predicted_severity !== r.actual_severity
    ).length;
    const mismatchRate = mismatches / recs.length;

    return { direction, mismatchRate, absMeanError };
  });

  // Find longest consecutive run of the same cost drift direction
  let maxCostRun = 0;
  let currentCostRun = 1;
  let currentCostDir = windowStats[0].direction;
  let bestCostDir: "over_estimate" | "under_estimate" | "mixed" | null = null;

  for (let i = 1; i < windowStats.length; i++) {
    if (
      windowStats[i].direction !== "none" &&
      windowStats[i].direction === currentCostDir
    ) {
      currentCostRun++;
    } else {
      if (currentCostRun > maxCostRun && currentCostDir !== "none") {
        maxCostRun = currentCostRun;
        bestCostDir = currentCostDir as "over_estimate" | "under_estimate";
      }
      currentCostRun = 1;
      currentCostDir = windowStats[i].direction;
    }
  }
  if (currentCostRun > maxCostRun && currentCostDir !== "none") {
    maxCostRun = currentCostRun;
    bestCostDir = currentCostDir as "over_estimate" | "under_estimate";
  }

  // Find longest consecutive run of severity drift
  let maxSeverityRun = 0;
  let currentSeverityRun = 1;
  for (let i = 1; i < windowStats.length; i++) {
    if (windowStats[i].mismatchRate > severityThreshold) {
      if (windowStats[i - 1].mismatchRate > severityThreshold) {
        currentSeverityRun++;
      } else {
        currentSeverityRun = 1;
      }
      maxSeverityRun = Math.max(maxSeverityRun, currentSeverityRun);
    }
  }
  if (windowStats[0].mismatchRate > severityThreshold) {
    maxSeverityRun = Math.max(maxSeverityRun, 1);
  }

  return {
    cost_continuous: maxCostRun >= 2,
    cost_consecutive_count: maxCostRun,
    cost_direction: bestCostDir,
    severity_continuous: maxSeverityRun >= 2,
    severity_consecutive_count: maxSeverityRun,
  };
}

/** Compute per-scenario drift statistics */
function computeScenarioStats(
  records: DriftRecord[],
  costThreshold: number,
  severityThreshold: number
): Record<string, ScenarioDriftStats> {
  const byScenario = new Map<string, DriftRecord[]>();
  for (const r of records) {
    if (!byScenario.has(r.scenario_type)) byScenario.set(r.scenario_type, []);
    byScenario.get(r.scenario_type)!.push(r);
  }

  const result: Record<string, ScenarioDriftStats> = {};
  for (const [scenario, recs] of byScenario) {
    const costErrors = recs.map((r) =>
      absCostErrorFraction(r.ai_predicted_cost, r.actual_cost)
    );
    const meanCostError =
      costErrors.reduce((a, b) => a + b, 0) / costErrors.length;
    const mismatches = recs.filter(
      (r) => r.ai_predicted_severity !== r.actual_severity
    ).length;
    const mismatchRate = mismatches / recs.length;

    result[scenario] = {
      record_count: recs.length,
      mean_cost_error_pct: Math.round(meanCostError * 1000) / 10, // as %
      severity_mismatch_rate: Math.round(mismatchRate * 1000) / 1000,
      cost_drift_flagged: meanCostError > costThreshold,
      severity_drift_flagged: mismatchRate > severityThreshold,
    };
  }
  return result;
}

/** Build the severity confusion matrix */
function buildSeverityConfusion(records: DriftRecord[]): SeverityConfusion {
  const confusion: SeverityConfusion = {
    minor_predicted_as_moderate: 0,
    minor_predicted_as_severe: 0,
    moderate_predicted_as_minor: 0,
    moderate_predicted_as_severe: 0,
    severe_predicted_as_minor: 0,
    severe_predicted_as_moderate: 0,
    correct: 0,
  };

  for (const r of records) {
    if (r.ai_predicted_severity === r.actual_severity) {
      confusion.correct++;
    } else if (r.ai_predicted_severity === "minor" && r.actual_severity === "moderate") {
      confusion.minor_predicted_as_moderate++;
    } else if (r.ai_predicted_severity === "minor" && r.actual_severity === "severe") {
      confusion.minor_predicted_as_severe++;
    } else if (r.ai_predicted_severity === "moderate" && r.actual_severity === "minor") {
      confusion.moderate_predicted_as_minor++;
    } else if (r.ai_predicted_severity === "moderate" && r.actual_severity === "severe") {
      confusion.moderate_predicted_as_severe++;
    } else if (r.ai_predicted_severity === "severe" && r.actual_severity === "minor") {
      confusion.severe_predicted_as_minor++;
    } else if (r.ai_predicted_severity === "severe" && r.actual_severity === "moderate") {
      confusion.severe_predicted_as_moderate++;
    }
  }
  return confusion;
}

/** Determine overall severity given drift areas and continuous drift flag */
function determineSeverity(
  driftAreas: DriftArea[],
  continuousDriftDetected: boolean
): "LOW" | "MEDIUM" | "HIGH" {
  if (driftAreas.length === 0) return "LOW";

  // Any continuous drift → HIGH
  if (continuousDriftDetected || driftAreas.some((a) => a.is_continuous)) {
    return "HIGH";
  }

  // Multiple drift areas simultaneously → HIGH
  if (driftAreas.length >= 2) return "HIGH";

  // Single drift area → MEDIUM
  return "MEDIUM";
}

/** Build a human-readable recommendation */
function buildRecommendation(
  driftAreas: DriftArea[],
  severity: "LOW" | "MEDIUM" | "HIGH",
  statistics: CalibrationDriftOutput["statistics"]
): string {
  if (driftAreas.length === 0) {
    return "No calibration drift detected. AI predictions are within acceptable thresholds. Continue monitoring as the dataset grows.";
  }

  const parts: string[] = [];

  const costArea = driftAreas.find((a) => a.dimension === "cost");
  const severityArea = driftAreas.find((a) => a.dimension === "severity");
  const directionArea = driftAreas.find((a) => a.dimension === "cost_direction");

  if (costArea) {
    const pct = Math.round(costArea.measured_value * 100);
    if (costArea.direction === "over_estimate") {
      parts.push(
        `AI is systematically over-estimating costs by ${pct}% on average. Review the repair cost model for ${costArea.affected_scenarios.join(", ") || "all scenarios"} and apply a downward calibration factor.`
      );
    } else if (costArea.direction === "under_estimate") {
      parts.push(
        `AI is systematically under-estimating costs by ${pct}% on average. The model may be missing hidden damage components for ${costArea.affected_scenarios.join(", ") || "all scenarios"}. Increase base cost weights.`
      );
    } else {
      parts.push(
        `Cost predictions show ${pct}% average deviation from validated outcomes. Review component pricing data and recalibrate the cost model.`
      );
    }
  }

  if (severityArea) {
    const pct = Math.round(severityArea.measured_value * 100);
    const confusion = statistics.severity_confusion;
    const dominantMismatch =
      confusion.moderate_predicted_as_minor > confusion.minor_predicted_as_moderate
        ? "AI is under-classifying severity (predicting minor when actual is moderate/severe)"
        : "AI is over-classifying severity (predicting moderate/severe when actual is minor)";
    parts.push(
      `Severity classification has a ${pct}% mismatch rate. ${dominantMismatch}. Retrain or recalibrate the severity consensus engine thresholds.`
    );
  }

  if (directionArea && directionArea.is_continuous) {
    parts.push(
      `Drift has been continuous across ${directionArea.consecutive_window_count} consecutive time windows — this indicates a systematic model degradation, not random noise. Immediate recalibration is required.`
    );
  }

  if (severity === "HIGH") {
    parts.push(
      "URGENT: Severity is HIGH. Escalate to the model calibration team and consider temporarily increasing manual review rates until recalibration is complete."
    );
  }

  return parts.join(" ");
}

// ─── Main Export ──────────────────────────────────────────────────────────────

/**
 * Detect calibration drift by comparing AI predictions against validated outcomes.
 */
export function detectCalibrationDrift(
  input: CalibrationDriftInput
): CalibrationDriftOutput {
  const {
    records: allRecords,
    cost_drift_threshold = DEFAULT_COST_DRIFT_THRESHOLD,
    severity_mismatch_threshold = DEFAULT_SEVERITY_MISMATCH_THRESHOLD,
    continuous_drift_window_count = DEFAULT_CONTINUOUS_DRIFT_WINDOW_COUNT,
    window_size_days = DEFAULT_WINDOW_SIZE_DAYS,
    scenario_filter = null,
  } = input;

  const costThreshold = cost_drift_threshold ?? DEFAULT_COST_DRIFT_THRESHOLD;
  const severityThreshold =
    severity_mismatch_threshold ?? DEFAULT_SEVERITY_MISMATCH_THRESHOLD;
  const continuousWindowCount =
    continuous_drift_window_count ?? DEFAULT_CONTINUOUS_DRIFT_WINDOW_COUNT;
  const windowSizeDays = window_size_days ?? DEFAULT_WINDOW_SIZE_DAYS;

  // Apply scenario filter
  const records = scenario_filter
    ? allRecords.filter((r) => r.scenario_type === scenario_filter)
    : allRecords;

  // ── Empty input guard ──────────────────────────────────────────────────────
  if (records.length === 0) {
    return {
      drift_detected: false,
      drift_areas: [],
      severity: "LOW",
      recommendation:
        "No validated outcome records available for drift analysis. Process more claims through the AI pipeline and have assessors validate them.",
      statistics: {
        total_records: 0,
        records_with_cost_drift: 0,
        records_with_severity_mismatch: 0,
        mean_cost_error_pct: 0,
        median_cost_error_pct: 0,
        mean_absolute_error_usd: 0,
        over_estimate_count: 0,
        under_estimate_count: 0,
        severity_mismatch_rate: 0,
        severity_confusion: {
          minor_predicted_as_moderate: 0,
          minor_predicted_as_severe: 0,
          moderate_predicted_as_minor: 0,
          moderate_predicted_as_severe: 0,
          severe_predicted_as_minor: 0,
          severe_predicted_as_moderate: 0,
          correct: 0,
        },
        by_scenario: {},
        windows_analysed: 0,
        continuous_drift_detected: false,
      },
      metadata: {
        records_analysed: 0,
        scenario_filter: scenario_filter ?? null,
        cost_drift_threshold: costThreshold,
        severity_mismatch_threshold: severityThreshold,
        continuous_drift_window_count: continuousWindowCount,
        window_size_days: windowSizeDays,
        analysis_timestamp_ms: Date.now(),
      },
    };
  }

  // ── Cost Error Analysis ────────────────────────────────────────────────────
  const costErrors = records.map((r) =>
    costErrorFraction(r.ai_predicted_cost, r.actual_cost)
  );
  const absCostErrors = costErrors.map(Math.abs);
  const absErrorsUsd = records.map((r) =>
    Math.abs(r.ai_predicted_cost - r.actual_cost)
  );

  const meanAbsCostError =
    absCostErrors.reduce((a, b) => a + b, 0) / absCostErrors.length;
  const medianAbsCostError = median(absCostErrors);
  const meanAbsErrorUsd =
    absErrorsUsd.reduce((a, b) => a + b, 0) / absErrorsUsd.length;

  const recordsWithCostDrift = records.filter(
    (_, i) => absCostErrors[i] > costThreshold
  );
  const overEstimateCount = costErrors.filter((e) => e > costThreshold).length;
  const underEstimateCount = costErrors.filter((e) => e < -costThreshold).length;

  // Overall cost drift direction
  const meanSignedError =
    costErrors.reduce((a, b) => a + b, 0) / costErrors.length;
  const overallCostDirection: "over_estimate" | "under_estimate" | "mixed" | null =
    meanAbsCostError > costThreshold
      ? Math.abs(meanSignedError) > costThreshold * 0.5
        ? meanSignedError > 0
          ? "over_estimate"
          : "under_estimate"
        : "mixed"
      : null;

  // ── Severity Mismatch Analysis ─────────────────────────────────────────────
  const severityMismatches = records.filter(
    (r) => r.ai_predicted_severity !== r.actual_severity
  );
  const severityMismatchRate = severityMismatches.length / records.length;
  const severityConfusion = buildSeverityConfusion(records);

  // ── Time Window Analysis ───────────────────────────────────────────────────
  const windows = assignToWindows(records, windowSizeDays);
  const continuousDrift = detectContinuousDrift(
    windows,
    costThreshold,
    severityThreshold
  );

  // ── Per-Scenario Stats ─────────────────────────────────────────────────────
  const scenarioStats = computeScenarioStats(
    records,
    costThreshold,
    severityThreshold
  );

  // ── Affected Scenarios ─────────────────────────────────────────────────────
  const scenariosWithCostDrift = Object.entries(scenarioStats)
    .filter(([, s]) => s.cost_drift_flagged)
    .map(([name]) => name);
  const scenariosWithSeverityDrift = Object.entries(scenarioStats)
    .filter(([, s]) => s.severity_drift_flagged)
    .map(([name]) => name);

  // ── Build Drift Areas ──────────────────────────────────────────────────────
  const driftAreas: DriftArea[] = [];

  // Cost drift area
  if (meanAbsCostError > costThreshold) {
    driftAreas.push({
      dimension: "cost",
      description: `Mean absolute cost error of ${Math.round(meanAbsCostError * 100)}% exceeds the ${Math.round(costThreshold * 100)}% threshold`,
      measured_value: Math.round(meanAbsCostError * 1000) / 1000,
      threshold: costThreshold,
      direction: overallCostDirection,
      affected_scenarios:
        scenariosWithCostDrift.length > 0
          ? scenariosWithCostDrift
          : Array.from(new Set(records.map((r) => r.scenario_type))),
      affected_record_count: recordsWithCostDrift.length,
      is_continuous: continuousDrift.cost_continuous && continuousDrift.cost_consecutive_count >= continuousWindowCount,
      consecutive_window_count: continuousDrift.cost_consecutive_count,
    });
  }
  // Severity drift areaa
  if (severityMismatchRate > severityThreshold) {
    driftAreas.push({
      dimension: "severity",
      description: `Severity mismatch rate of ${Math.round(severityMismatchRate * 100)}% exceeds the ${Math.round(severityThreshold * 100)}% threshold`,
      measured_value: Math.round(severityMismatchRate * 1000) / 1000,
      threshold: severityThreshold,
      direction: null,
      affected_scenarios:
        scenariosWithSeverityDrift.length > 0
          ? scenariosWithSeverityDrift
          : Array.from(new Set(records.map((r) => r.scenario_type))),
      affected_record_count: severityMismatches.length,
       is_continuous: continuousDrift.severity_continuous && continuousDrift.severity_consecutive_count >= continuousWindowCount,
      consecutive_window_count: continuousDrift.severity_consecutive_count,
    });
  }
  // Continuous cost direction drift area (separate entry for visibility)
  if (
    continuousDrift.cost_continuous &&
    continuousDrift.cost_consecutive_count >= continuousWindowCount
  ) {
    const alreadyHasCostArea = driftAreas.some((a) => a.dimension === "cost");
    if (!alreadyHasCostArea) {
      // Cost was below threshold on average but drifting continuously in one direction
      driftAreas.push({
        dimension: "cost_direction",
        description: `Continuous ${continuousDrift.cost_direction ?? "directional"} cost drift detected across ${continuousDrift.cost_consecutive_count} consecutive time windows`,
        measured_value: continuousDrift.cost_consecutive_count,
        threshold: continuousWindowCount,
        direction: continuousDrift.cost_direction,
        affected_scenarios: Array.from(new Set(records.map((r) => r.scenario_type))),
        affected_record_count: records.length,
        is_continuous: true,
        consecutive_window_count: continuousDrift.cost_consecutive_count,
      });
    } else {
      // Update the existing cost area to mark it as continuous
      const costArea = driftAreas.find((a) => a.dimension === "cost")!;
      costArea.is_continuous = true;
      costArea.consecutive_window_count = continuousDrift.cost_consecutive_count;
    }
  }

  // ── Severity and Recommendation ────────────────────────────────────────────
  const continuousDriftDetected =
    (continuousDrift.cost_continuous && continuousDrift.cost_consecutive_count >= continuousWindowCount) ||
    (continuousDrift.severity_continuous && continuousDrift.severity_consecutive_count >= continuousWindowCount);

  const statistics: CalibrationDriftOutput["statistics"] = {
    total_records: records.length,
    records_with_cost_drift: recordsWithCostDrift.length,
    records_with_severity_mismatch: severityMismatches.length,
    mean_cost_error_pct: Math.round(meanAbsCostError * 1000) / 10,
    median_cost_error_pct: Math.round(medianAbsCostError * 1000) / 10,
    mean_absolute_error_usd: Math.round(meanAbsErrorUsd * 100) / 100,
    over_estimate_count: overEstimateCount,
    under_estimate_count: underEstimateCount,
    severity_mismatch_rate: Math.round(severityMismatchRate * 1000) / 1000,
    severity_confusion: severityConfusion,
    by_scenario: scenarioStats,
    windows_analysed: windows.size,
    continuous_drift_detected: continuousDriftDetected,
  };

  const severity = determineSeverity(driftAreas, continuousDriftDetected);
  const recommendation = buildRecommendation(driftAreas, severity, statistics);

  return {
    drift_detected: driftAreas.length > 0,
    drift_areas: driftAreas,
    severity,
    recommendation,
    statistics,
    metadata: {
      records_analysed: records.length,
      scenario_filter: scenario_filter ?? null,
      cost_drift_threshold: costThreshold,
      severity_mismatch_threshold: severityThreshold,
      continuous_drift_window_count: continuousWindowCount,
      window_size_days: windowSizeDays,
      analysis_timestamp_ms: Date.now(),
    },
  };
}

/**
 * Build a DriftRecord from raw pipeline data.
 * Returns null if the record is not suitable for drift analysis.
 */
export function buildDriftRecord(
  claimId: number,
  scenarioType: string,
  aiPredictedCost: number | null | undefined,
  actualCost: number | null | undefined,
  aiPredictedSeverity: string | null | undefined,
  actualSeverity: string | null | undefined,
  timestampMs: number | null | undefined,
  qualityTier?: "HIGH" | "MEDIUM" | "LOW" | null
): DriftRecord | null {
  // Both cost values must be present and positive
  if (
    aiPredictedCost == null ||
    actualCost == null ||
    actualCost <= 0 ||
    aiPredictedCost < 0
  ) {
    return null;
  }

  // Severity values must be valid
  const validSeverities = ["minor", "moderate", "severe"];
  const aiSev = aiPredictedSeverity?.toLowerCase();
  const actSev = actualSeverity?.toLowerCase();
  if (!aiSev || !actSev || !validSeverities.includes(aiSev) || !validSeverities.includes(actSev)) {
    return null;
  }

  return {
    claim_id: claimId,
    scenario_type: scenarioType,
    ai_predicted_cost: aiPredictedCost,
    actual_cost: actualCost,
    ai_predicted_severity: aiSev as "minor" | "moderate" | "severe",
    actual_severity: actSev as "minor" | "moderate" | "severe",
    timestamp_ms: timestampMs ?? Date.now(),
    quality_tier: qualityTier ?? null,
  };
}
