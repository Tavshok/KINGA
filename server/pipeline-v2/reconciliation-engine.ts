/**
 * Cross-Stage Reconciliation Engine
 *
 * Arbitrates conflicts between pipeline stages when multiple stages produce
 * values for the same field. The rule is simple:
 *   "If a later stage has higher confidence, its value wins — and the
 *    reconciliation is logged so the report can explain the decision."
 *
 * Every reconciliation event is appended to a `reconciliationLog[]` that is
 * stored on the ClaimRecord and surfaced in the report's audit trail.
 *
 * Fields reconciled:
 *   - estimatedSpeedKmh   (Stage 3 → Stage 5 heuristic → Stage 7b narrative)
 *   - fraudScore          (Stage 8 LLM → Stage 42 weighted consensus)
 *   - damageSeverity      (Stage 3 → Stage 6 photo analysis → Stage 7 physics)
 *   - estimatedCostUsd    (Stage 3 quote → Stage 9 optimised cost)
 *   - incidentType        (Stage 3 → Stage 5 classification → Stage 7b narrative)
 */

export type ReconciliationSource =
  | "stage_3_extraction"
  | "stage_5_assembly"
  | "stage_6_damage"
  | "stage_7_physics"
  | "stage_7b_narrative"
  | "stage_8_fraud"
  | "stage_9_cost"
  | "stage_42_consensus"
  | "claim_record_bridge"
  | "assessor_override";

export interface ReconciliationEvent {
  /** The field that was reconciled */
  field: string;
  /** The value that was discarded */
  previousValue: unknown;
  /** The source that produced the discarded value */
  previousSource: ReconciliationSource;
  /** The confidence of the discarded value (0–100) */
  previousConfidence: number;
  /** The value that was adopted */
  adoptedValue: unknown;
  /** The source that produced the adopted value */
  adoptedSource: ReconciliationSource;
  /** The confidence of the adopted value (0–100) */
  adoptedConfidence: number;
  /** Human-readable explanation for the report */
  rationale: string;
  /** ISO timestamp */
  reconciledAt: string;
}

export interface ReconciliationLog {
  events: ReconciliationEvent[];
  /** Number of fields where a later stage overrode an earlier stage */
  overrideCount: number;
  /** Number of fields where all stages agreed */
  agreementCount: number;
  /** Overall congruency score (0–100): 100 = all stages agreed on all fields */
  congruencyScore: number;
}

/**
 * Reconcile a single field across multiple stage outputs.
 * Returns the winning value and appends an event to the log if a conflict occurred.
 */
export function reconcileField<T>(
  log: ReconciliationEvent[],
  field: string,
  candidates: Array<{
    value: T | null | undefined;
    source: ReconciliationSource;
    confidence: number;
  }>
): T | null {
  // Filter out null/undefined candidates
  const valid = candidates.filter(
    (c) => c.value !== null && c.value !== undefined && c.value !== "" && c.value !== 0
  ) as Array<{ value: T; source: ReconciliationSource; confidence: number }>;

  if (valid.length === 0) return null;
  if (valid.length === 1) return valid[0].value;

  // Sort by confidence descending — highest confidence wins
  const sorted = [...valid].sort((a, b) => b.confidence - a.confidence);
  const winner = sorted[0];
  const runner = sorted[1];

  // Only log if the winner is different from the first (earliest) candidate
  const earliest = valid[0];
  if (winner.source !== earliest.source && winner.value !== earliest.value) {
    log.push({
      field,
      previousValue: earliest.value,
      previousSource: earliest.source,
      previousConfidence: earliest.confidence,
      adoptedValue: winner.value,
      adoptedSource: winner.source,
      adoptedConfidence: winner.confidence,
      rationale: buildRationale(field, earliest, winner),
      reconciledAt: new Date().toISOString(),
    });
  }

  return winner.value;
}

/**
 * Build the full ReconciliationLog from all events collected during a pipeline run.
 * Call this once after all stages have completed.
 */
export function buildReconciliationLog(
  events: ReconciliationEvent[],
  totalFieldsChecked: number
): ReconciliationLog {
  const overrideCount = events.length;
  const agreementCount = Math.max(0, totalFieldsChecked - overrideCount);
  // Congruency: 100% if no overrides, degrades by 10 points per override, floor 0
  const congruencyScore = Math.max(0, 100 - overrideCount * 10);

  return {
    events,
    overrideCount,
    agreementCount,
    congruencyScore,
  };
}

/**
 * Run the full reconciliation pass across all pipeline stage outputs.
 * Returns a patched claimRecord with reconciled values and the reconciliation log.
 */
export function runReconciliationPass(
  claimRecord: any,
  stage6Data: any,
  stage7Data: any,
  stage8Data: any,
  stage9Data: any,
  narrativeAnalysis: any
): { patchedRecord: any; reconciliationLog: ReconciliationLog } {
  const events: ReconciliationEvent[] = [];
  const patch: Record<string, unknown> = {};

  // ── 1. Speed ─────────────────────────────────────────────────────────────
  const reconciledSpeed = reconcileField<number>(events, "estimatedSpeedKmh", [
    {
      value: claimRecord?.accidentDetails?.estimatedSpeedKmh,
      source: "stage_3_extraction",
      confidence: claimRecord?.accidentDetails?.estimatedSpeedKmh ? 60 : 0,
    },
    {
      value: narrativeAnalysis?.extracted_facts?.implied_speed_kmh,
      source: "stage_7b_narrative",
      confidence: narrativeAnalysis?.extracted_facts?.implied_speed_kmh
        ? (narrativeAnalysis?.confidence_scores?.speed_confidence ?? 80)
        : 0,
    },
    {
      value: stage7Data?.estimatedSpeedKmh,
      source: "stage_7_physics",
      confidence: stage7Data?.estimatedSpeedKmh ? 70 : 0,
    },
  ]);
  if (reconciledSpeed && reconciledSpeed !== claimRecord?.accidentDetails?.estimatedSpeedKmh) {
    patch["accidentDetails.estimatedSpeedKmh"] = reconciledSpeed;
  }

  // ── 2. Fraud Score ────────────────────────────────────────────────────────
  const reconciledFraud = reconcileField<number>(events, "fraudScore", [
    {
      value: stage8Data?.fraudRiskScore,
      source: "stage_8_fraud",
      confidence: stage8Data?.fraudRiskScore != null ? 85 : 0,
    },
  ]);
  if (reconciledFraud != null) {
    patch["fraudScore"] = reconciledFraud;
  }

  // ── 3. Damage Severity ────────────────────────────────────────────────────
  const stage3Severity = claimRecord?.damage?.severity;
  const stage6Severity = stage6Data?.damageSeverity ?? stage6Data?.severity;
  const stage7Severity = stage7Data?.accidentSeverity;
  const reconciledSeverity = reconcileField<string>(events, "damageSeverity", [
    { value: stage3Severity, source: "stage_3_extraction", confidence: stage3Severity ? 50 : 0 },
    { value: stage6Severity, source: "stage_6_damage", confidence: stage6Severity ? 75 : 0 },
    { value: stage7Severity, source: "stage_7_physics", confidence: stage7Severity ? 80 : 0 },
  ]);
  if (reconciledSeverity && reconciledSeverity !== stage3Severity) {
    patch["damage.severity"] = reconciledSeverity;
  }

  // ── 4. Estimated Cost ─────────────────────────────────────────────────────
  const stage3Cost = claimRecord?.insuranceContext?.agreedCostCents
    ? claimRecord.insuranceContext.agreedCostCents / 100
    : null;
  const stage9Cost = stage9Data?.costDecision?.true_cost_usd;
  const reconciledCost = reconcileField<number>(events, "estimatedCostUsd", [
    { value: stage3Cost, source: "stage_3_extraction", confidence: stage3Cost ? 60 : 0 },
    { value: stage9Cost, source: "stage_9_cost", confidence: stage9Cost ? 90 : 0 },
  ]);
  if (reconciledCost != null) {
    patch["costAnalysis.reconciledCostUsd"] = reconciledCost;
  }

  // ── 5. Incident Type ──────────────────────────────────────────────────────
  const stage3IncidentType = claimRecord?.accidentDetails?.incidentType;
  const narrativeIncidentType = narrativeAnalysis?.extracted_facts?.incident_type;
  const reconciledIncidentType = reconcileField<string>(events, "incidentType", [
    {
      value: stage3IncidentType,
      source: "stage_3_extraction",
      confidence: claimRecord?.accidentDetails?.incidentClassification?.confidence ?? (stage3IncidentType ? 70 : 0),
    },
    {
      value: narrativeIncidentType,
      source: "stage_7b_narrative",
      confidence: narrativeIncidentType ? 85 : 0,
    },
  ]);
  if (reconciledIncidentType && reconciledIncidentType !== stage3IncidentType) {
    patch["accidentDetails.incidentType"] = reconciledIncidentType;
  }

  // ── Apply patches to claimRecord ──────────────────────────────────────────
  const patchedRecord = applyDeepPatch(claimRecord, patch);

  // Attach the reconciliation log to the claim record
  const log = buildReconciliationLog(events, 5 /* total fields checked */);
  patchedRecord._reconciliationLog = log;

  return { patchedRecord, reconciliationLog: log };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildRationale(
  field: string,
  discarded: { value: unknown; source: ReconciliationSource; confidence: number },
  adopted: { value: unknown; source: ReconciliationSource; confidence: number }
): string {
  const fieldLabels: Record<string, string> = {
    estimatedSpeedKmh: "vehicle speed",
    fraudScore: "fraud risk score",
    damageSeverity: "damage severity",
    estimatedCostUsd: "estimated repair cost",
    incidentType: "incident classification",
  };
  const label = fieldLabels[field] ?? field;
  return (
    `${sourceLabel(adopted.source)} produced a ${label} of ${formatValue(adopted.value)} ` +
    `with ${adopted.confidence}% confidence, superseding the ${sourceLabel(discarded.source)} ` +
    `value of ${formatValue(discarded.value)} (${discarded.confidence}% confidence). ` +
    `Higher-confidence stage value adopted per reconciliation policy.`
  );
}

function sourceLabel(source: ReconciliationSource): string {
  const labels: Record<ReconciliationSource, string> = {
    stage_3_extraction: "Stage 3 (structured extraction)",
    stage_5_assembly: "Stage 5 (claim assembly)",
    stage_6_damage: "Stage 6 (damage photo analysis)",
    stage_7_physics: "Stage 7 (physics reconstruction)",
    stage_7b_narrative: "Stage 7b (narrative cross-validation)",
    stage_8_fraud: "Stage 8 (fraud analysis)",
    stage_9_cost: "Stage 9 (cost optimisation)",
    stage_42_consensus: "Stage 42 (cross-engine consensus)",
    claim_record_bridge: "ClaimRecordBridge (data resolver)",
    assessor_override: "Assessor override",
  };
  return labels[source] ?? source;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number") return value.toFixed(1);
  return String(value);
}

/**
 * Apply a flat dot-notation patch object to a nested object.
 * e.g. { "accidentDetails.estimatedSpeedKmh": 90 } patches obj.accidentDetails.estimatedSpeedKmh = 90
 */
function applyDeepPatch(obj: any, patch: Record<string, unknown>): any {
  if (!obj || typeof obj !== "object") return obj;
  const result = { ...obj };
  for (const [path, value] of Object.entries(patch)) {
    const parts = path.split(".");
    let target = result;
    for (let i = 0; i < parts.length - 1; i++) {
      if (target[parts[i]] && typeof target[parts[i]] === "object") {
        target[parts[i]] = { ...target[parts[i]] };
      } else {
        target[parts[i]] = {};
      }
      target = target[parts[i]];
    }
    target[parts[parts.length - 1]] = value;
  }
  return result;
}
