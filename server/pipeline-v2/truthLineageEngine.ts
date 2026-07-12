/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * TRUTH LINEAGE ENGINE — TRE v3.0 Enhancement 3
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Creates complete transformation history for every value in the CTO.
 * Every CTO value must expose: Origin → Transformation → Reconciliation → Certification
 *
 * Lineage records are immutable — once written, they are never overwritten.
 * New transformations create new lineage entries.
 *
 * Architecture position:
 *   All Analytical Engines → Truth Rule Engine → TRE → Evidence Graph + Truth Lineage → CTO
 */

// ─────────────────────────────────────────────────────────────────────────────
// LINEAGE TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type LineageStage =
  | "origin"          // Value first created by an engine
  | "transformation"  // Value modified by an engine or rule
  | "reconciliation"  // Value reconciled by the TRE
  | "certification";  // Value certified in the CTO

export type LineageChangeReason =
  | "initial_extraction"       // First extraction from source document
  | "engine_computation"       // Computed by an analytical engine
  | "rule_override"            // Overridden by a truth rule
  | "conflict_resolution"      // Resolved from a conflict between engines
  | "confidence_decay"         // Reduced due to confidence decay
  | "manual_correction"        // Corrected by a human analyst
  | "regulatory_requirement"   // Changed to meet regulatory profile
  | "missing_evidence_default" // Default value due to missing evidence
  | "tre_certification";       // Final certification by TRE

export interface LineageEntry {
  /** Unique entry ID */
  entryId: string;
  /** CTO field path this entry covers */
  ctoField: string;
  /** Stage in the lineage chain */
  stage: LineageStage;
  /** Engine or actor that produced this entry */
  engine: string;
  /** Engine version */
  engineVersion: string;
  /** ISO timestamp */
  timestamp: string;
  /** Reason for this lineage entry */
  reason: LineageChangeReason;
  /** Value before this transformation (null for origin) */
  previousValue: unknown;
  /** Value after this transformation */
  currentValue: unknown;
  /** Confidence before this transformation */
  previousConfidence: number | null;
  /** Confidence after this transformation */
  currentConfidence: number;
  /** Human-readable explanation */
  explanation: string;
  /** Rule ID if this was triggered by a truth rule */
  ruleId?: string;
  /** Evidence node IDs that support this value */
  supportingEvidenceIds: string[];
  /** Whether this entry is immutable (true once certified) */
  immutable: boolean;
}

export interface FieldLineage {
  /** CTO field path */
  ctoField: string;
  /** All lineage entries for this field, in chronological order */
  entries: LineageEntry[];
  /** The current certified value */
  certifiedValue: unknown;
  /** The original extracted value */
  originValue: unknown;
  /** Whether the value changed during reconciliation */
  wasReconciled: boolean;
  /** Whether the value was manually corrected */
  wasManuallyCorrect: boolean;
  /** Number of transformations */
  transformationCount: number;
  /** Final certified confidence */
  certifiedConfidence: number;
}

export interface TruthLineage {
  /** All field lineages, keyed by CTO field path */
  fields: Record<string, FieldLineage>;
  /** Total number of lineage entries across all fields */
  totalEntries: number;
  /** Fields that were reconciled (changed during TRE) */
  reconciledFields: string[];
  /** Fields that were manually corrected */
  manuallyCorrectFields: string[];
  /** Fields with complete lineage (origin → certification) */
  completeLineageFields: string[];
  /** Fields with incomplete lineage */
  incompleteLineageFields: string[];
  /** Lineage creation timestamp */
  createdAt: string;
  /** TRE version that produced this lineage */
  treVersion: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// LINEAGE BUILDER
// ─────────────────────────────────────────────────────────────────────────────

let _entryCounter = 0;
function generateEntryId(): string {
  return `lin_${Date.now()}_${++_entryCounter}`;
}

export class TruthLineageBuilder {
  private entries: Map<string, LineageEntry[]> = new Map();
  private readonly treVersion: string;

  constructor(treVersion = "3.0.0") {
    this.treVersion = treVersion;
  }

  /** Record the origin of a CTO field value */
  recordOrigin(
    ctoField: string,
    engine: string,
    value: unknown,
    confidence: number,
    explanation: string,
    evidenceIds: string[] = []
  ): this {
    const entry: LineageEntry = {
      entryId: generateEntryId(),
      ctoField,
      stage: "origin",
      engine,
      engineVersion: this.treVersion,
      timestamp: new Date().toISOString(),
      reason: "initial_extraction",
      previousValue: null,
      currentValue: value,
      previousConfidence: null,
      currentConfidence: confidence,
      explanation,
      supportingEvidenceIds: evidenceIds,
      immutable: false,
    };
    this._addEntry(ctoField, entry);
    return this;
  }

  /** Record a transformation of a CTO field value */
  recordTransformation(
    ctoField: string,
    engine: string,
    previousValue: unknown,
    currentValue: unknown,
    previousConfidence: number,
    currentConfidence: number,
    reason: LineageChangeReason,
    explanation: string,
    ruleId?: string,
    evidenceIds: string[] = []
  ): this {
    const entry: LineageEntry = {
      entryId: generateEntryId(),
      ctoField,
      stage: "transformation",
      engine,
      engineVersion: this.treVersion,
      timestamp: new Date().toISOString(),
      reason,
      previousValue,
      currentValue,
      previousConfidence,
      currentConfidence,
      explanation,
      ruleId,
      supportingEvidenceIds: evidenceIds,
      immutable: false,
    };
    this._addEntry(ctoField, entry);
    return this;
  }

  /** Record a reconciliation decision */
  recordReconciliation(
    ctoField: string,
    previousValue: unknown,
    currentValue: unknown,
    previousConfidence: number,
    currentConfidence: number,
    explanation: string,
    ruleId?: string
  ): this {
    const entry: LineageEntry = {
      entryId: generateEntryId(),
      ctoField,
      stage: "reconciliation",
      engine: "truth_reconciliation_engine",
      engineVersion: this.treVersion,
      timestamp: new Date().toISOString(),
      reason: ruleId ? "rule_override" : "conflict_resolution",
      previousValue,
      currentValue,
      previousConfidence,
      currentConfidence,
      explanation,
      ruleId,
      supportingEvidenceIds: [],
      immutable: false,
    };
    this._addEntry(ctoField, entry);
    return this;
  }

  /** Record final certification — makes all entries for this field immutable */
  recordCertification(
    ctoField: string,
    certifiedValue: unknown,
    certifiedConfidence: number,
    explanation: string
  ): this {
    const entry: LineageEntry = {
      entryId: generateEntryId(),
      ctoField,
      stage: "certification",
      engine: "truth_reconciliation_engine",
      engineVersion: this.treVersion,
      timestamp: new Date().toISOString(),
      reason: "tre_certification",
      previousValue: this._getCurrentValue(ctoField),
      currentValue: certifiedValue,
      previousConfidence: this._getCurrentConfidence(ctoField),
      currentConfidence: certifiedConfidence,
      explanation,
      supportingEvidenceIds: [],
      immutable: true,
    };
    this._addEntry(ctoField, entry);
    // Mark all entries for this field as immutable
    const fieldEntries = this.entries.get(ctoField) ?? [];
    for (const e of fieldEntries) {
      e.immutable = true;
    }
    return this;
  }

  private _addEntry(ctoField: string, entry: LineageEntry): void {
    if (!this.entries.has(ctoField)) {
      this.entries.set(ctoField, []);
    }
    this.entries.get(ctoField)!.push(entry);
  }

  private _getCurrentValue(ctoField: string): unknown {
    const fieldEntries = this.entries.get(ctoField) ?? [];
    return fieldEntries.length > 0 ? fieldEntries[fieldEntries.length - 1].currentValue : null;
  }

  private _getCurrentConfidence(ctoField: string): number | null {
    const fieldEntries = this.entries.get(ctoField) ?? [];
    return fieldEntries.length > 0 ? fieldEntries[fieldEntries.length - 1].currentConfidence : null;
  }

  build(): TruthLineage {
    const fields: Record<string, FieldLineage> = {};
    let totalEntries = 0;

    for (const [ctoField, entries] of this.entries) {
      const originEntry = entries.find(e => e.stage === "origin");
      const certEntry = entries.find(e => e.stage === "certification");
      const wasReconciled = entries.some(e => e.stage === "reconciliation");
      const wasManuallyCorrect = entries.some(e => e.reason === "manual_correction");

      fields[ctoField] = {
        ctoField,
        entries: [...entries].sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
        certifiedValue: certEntry?.currentValue ?? this._getCurrentValue(ctoField),
        originValue: originEntry?.currentValue ?? null,
        wasReconciled,
        wasManuallyCorrect,
        transformationCount: entries.filter(e => e.stage === "transformation" || e.stage === "reconciliation").length,
        certifiedConfidence: certEntry?.currentConfidence ?? (entries[entries.length - 1]?.currentConfidence ?? 0),
      };
      totalEntries += entries.length;
    }

    const allFields = Object.keys(fields);
    const completeLineageFields = allFields.filter(f => {
      const fl = fields[f];
      return fl.entries.some(e => e.stage === "origin") && fl.entries.some(e => e.stage === "certification");
    });
    const incompleteLineageFields = allFields.filter(f => !completeLineageFields.includes(f));

    return {
      fields,
      totalEntries,
      reconciledFields: allFields.filter(f => fields[f].wasReconciled),
      manuallyCorrectFields: allFields.filter(f => fields[f].wasManuallyCorrect),
      completeLineageFields,
      incompleteLineageFields,
      createdAt: new Date().toISOString(),
      treVersion: this.treVersion,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// LINEAGE UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a standard lineage record from TRE inputs.
 * Records origin, any reconciliation, and certification for key CTO fields.
 */
export function buildStandardLineage(params: {
  physicsSpeedKmh: number | null;
  physicsConfidence: number | null;
  extractionSpeedKmh: number | null;
  fraudScore: number;
  ctlFraudScore: number | null;
  costUsd: number;
  ctlCostUsd: number | null;
  finalDecision: string;
  ctlDecision: string | null;
  firedRuleIds: string[];
  treVersion: string;
}): TruthLineage {
  const builder = new TruthLineageBuilder(params.treVersion);

  // ── Speed lineage ─────────────────────────────────────────────────────────
  if (params.extractionSpeedKmh !== null) {
    builder.recordOrigin(
      "physics.estimatedSpeedKmh",
      "stage3_extraction",
      params.extractionSpeedKmh,
      60,
      `Speed extracted from driver statement: ${params.extractionSpeedKmh} km/h`
    );
  }
  if (params.physicsSpeedKmh !== null) {
    const wasReconciled = params.extractionSpeedKmh !== null && params.extractionSpeedKmh !== params.physicsSpeedKmh;
    if (params.extractionSpeedKmh === null) {
      builder.recordOrigin(
        "physics.estimatedSpeedKmh",
        "stage7_physics",
        params.physicsSpeedKmh,
        params.physicsConfidence ?? 50,
        `Speed computed by physics engine: ${params.physicsSpeedKmh} km/h`
      );
    } else if (wasReconciled) {
      const ruleId = params.firedRuleIds.includes("physics-speed-priority") ? "physics-speed-priority" : undefined;
      builder.recordReconciliation(
        "physics.estimatedSpeedKmh",
        params.extractionSpeedKmh,
        params.physicsSpeedKmh,
        60,
        params.physicsConfidence ?? 50,
        `Physics engine speed (${params.physicsSpeedKmh} km/h) reconciled over extraction speed (${params.extractionSpeedKmh} km/h) — physics has supporting evidence`,
        ruleId
      );
    }
    builder.recordCertification(
      "physics.estimatedSpeedKmh",
      params.physicsSpeedKmh,
      params.physicsConfidence ?? 50,
      `Speed certified at ${params.physicsSpeedKmh} km/h by TRE`
    );
  }

  // ── Fraud score lineage ───────────────────────────────────────────────────
  if (params.ctlFraudScore !== null) {
    builder.recordOrigin(
      "fraud.fraudRiskScore",
      "claim_truth_layer",
      params.ctlFraudScore,
      70,
      `Fraud score from CTL: ${params.ctlFraudScore}%`
    );
  }
  const fraudWasReconciled = params.ctlFraudScore !== null && params.ctlFraudScore !== params.fraudScore;
  if (fraudWasReconciled) {
    builder.recordReconciliation(
      "fraud.fraudRiskScore",
      params.ctlFraudScore,
      params.fraudScore,
      70,
      80,
      `Stage 8 fraud score (${params.fraudScore}%) reconciled over CTL score (${params.ctlFraudScore}%) — Stage 8 is canonical owner`
    );
  } else if (params.ctlFraudScore === null) {
    builder.recordOrigin(
      "fraud.fraudRiskScore",
      "stage8_fraud",
      params.fraudScore,
      80,
      `Fraud score from Stage 8: ${params.fraudScore}%`
    );
  }
  builder.recordCertification(
    "fraud.fraudRiskScore",
    params.fraudScore,
    80,
    `Fraud score certified at ${params.fraudScore}% by TRE`
  );

  // ── Cost lineage ──────────────────────────────────────────────────────────
  if (params.ctlCostUsd !== null) {
    builder.recordOrigin(
      "cost.optimisedCostUsd",
      "claim_truth_layer",
      params.ctlCostUsd,
      65,
      `Cost estimate from CTL: USD ${params.ctlCostUsd.toFixed(2)}`
    );
  }
  const costWasReconciled = params.ctlCostUsd !== null && Math.abs((params.ctlCostUsd ?? 0) - params.costUsd) > 1;
  if (costWasReconciled) {
    builder.recordReconciliation(
      "cost.optimisedCostUsd",
      params.ctlCostUsd,
      params.costUsd,
      65,
      75,
      `Stage 9 cost (USD ${params.costUsd.toFixed(2)}) reconciled over CTL cost (USD ${(params.ctlCostUsd ?? 0).toFixed(2)}) — Stage 9 is canonical owner`
    );
  } else if (params.ctlCostUsd === null) {
    builder.recordOrigin(
      "cost.optimisedCostUsd",
      "stage9_cost",
      params.costUsd,
      75,
      `Cost estimate from Stage 9: USD ${params.costUsd.toFixed(2)}`
    );
  }
  builder.recordCertification(
    "cost.optimisedCostUsd",
    params.costUsd,
    75,
    `Cost certified at USD ${params.costUsd.toFixed(2)} by TRE`
  );

  // ── Decision lineage ──────────────────────────────────────────────────────
  if (params.ctlDecision !== null) {
    builder.recordOrigin(
      "decision.recommendation",
      "claim_truth_layer",
      params.ctlDecision,
      70,
      `Decision from CTL: ${params.ctlDecision}`
    );
  }
  const decisionWasReconciled = params.ctlDecision !== null && params.ctlDecision !== params.finalDecision;
  if (decisionWasReconciled) {
    const firedRuleExplanation = params.firedRuleIds.length > 0
      ? ` Rules fired: ${params.firedRuleIds.join(", ")}`
      : "";
    builder.recordReconciliation(
      "decision.recommendation",
      params.ctlDecision,
      params.finalDecision,
      70,
      80,
      `Decision reconciled from ${params.ctlDecision} to ${params.finalDecision} by TRE.${firedRuleExplanation}`
    );
  } else if (params.ctlDecision === null) {
    builder.recordOrigin(
      "decision.recommendation",
      "truth_reconciliation_engine",
      params.finalDecision,
      80,
      `Decision produced by TRE: ${params.finalDecision}`
    );
  }
  builder.recordCertification(
    "decision.recommendation",
    params.finalDecision,
    80,
    `Decision certified as ${params.finalDecision} by TRE`
  );

  return builder.build();
}
