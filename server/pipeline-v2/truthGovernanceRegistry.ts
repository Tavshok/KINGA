/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * TRUTH GOVERNANCE REGISTRY — TRE v2.0
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * This file is the single source of truth for:
 *   Enhancement 1  — Truth Governance Registry (ownership + precedence)
 *   Enhancement 3  — Confidence Decay Model (configurable penalties)
 *   Enhancement 4  — Truth Integrity Score (penalty weights)
 *   Enhancement 5  — Truth Stability Index (inputs + calculation)
 *   Enhancement 6  — CTO Schema Versioning
 *   Enhancement 9  — Reconciliation Analytics (aggregate structures)
 *   Enhancement 11 — Policy-Based Governance (configurable policies)
 *
 * Design principles:
 *   - No engine logic here — only configuration and data structures
 *   - Extensible without modifying the TRE engine
 *   - All penalty values are configurable per deployment
 */

import type { CanonicalOwner } from "./truthReconciliationEngine";

// ─────────────────────────────────────────────────────────────────────────────
// Enhancement 6 — CTO SCHEMA VERSION
// ─────────────────────────────────────────────────────────────────────────────

/** Current CTO schema version. Increment MINOR for new optional fields, MAJOR for breaking changes. */
export const CTO_SCHEMA_VERSION = "2.0.0";

/** TRE engine version — independent of CTO schema version */
export const TRE_ENGINE_VERSION = "2.0.0";

// ─────────────────────────────────────────────────────────────────────────────
// Enhancement 1 — TRUTH GOVERNANCE REGISTRY
// ─────────────────────────────────────────────────────────────────────────────

export type SourceEngine =
  | "PhysicsEngine"
  | "VisionEngine"
  | "DocumentExtraction"
  | "DriverStatement"
  | "Stage8FraudEngine"
  | "CrossStageConsistency"
  | "CTL"
  | "Stage9CostEngine"
  | "Stage6DamageAnalysis"
  | "Stage5Assembly"
  | "Stage3StructuredExtraction"
  | "ClaimTruthLayer"
  | "TRE"
  | "ManualOverride"
  | "ReconciliationEngine";

export interface FieldGovernanceRule {
  /** Canonical owner — the engine whose value wins in all non-override cases */
  canonicalOwner: CanonicalOwner;
  /** Ordered precedence list — first entry wins; used when canonical owner value is absent */
  precedence: SourceEngine[];
  /** Human-readable description of why this owner was chosen */
  ownershipRationale: string;
  /** Whether a manual override requires approval before being accepted */
  requiresApprovalForOverride: boolean;
  /** Minimum confidence required to accept a value from a non-canonical source */
  minConfidenceForFallback: number;
  /** Whether this field is immutable once certified */
  immutableAfterCertification: boolean;
  /** List of downstream consumers that must read from this field */
  consumers: string[];
}

/**
 * The Truth Governance Registry.
 *
 * To add a new canonical field:
 *   1. Add an entry here — no engine code changes required.
 *   2. The TRE will automatically include it in the ownership summary and analytics.
 */
export const TRUTH_GOVERNANCE_REGISTRY: Record<string, FieldGovernanceRule> = {
  "fraud.fraudRiskScore": {
    canonicalOwner: "stage8_fraud",
    precedence: ["Stage8FraudEngine", "CrossStageConsistency", "CTL"],
    ownershipRationale: "Stage 8 Fraud Engine is the dedicated fraud scoring model with the highest signal fidelity",
    requiresApprovalForOverride: true,
    minConfidenceForFallback: 75,
    immutableAfterCertification: true,
    consumers: ["report_section_fraud", "dashboard_fraud", "workflow_decision", "api_assessment"],
  },
  "fraud.fraudRiskLevel": {
    canonicalOwner: "stage8_fraud",
    precedence: ["Stage8FraudEngine", "CrossStageConsistency", "CTL"],
    ownershipRationale: "Derived from fraudRiskScore — same canonical owner",
    requiresApprovalForOverride: true,
    minConfidenceForFallback: 75,
    immutableAfterCertification: true,
    consumers: ["report_section_fraud", "dashboard_fraud", "workflow_decision"],
  },
  "fraud.indicators": {
    canonicalOwner: "stage8_fraud",
    precedence: ["Stage8FraudEngine", "CrossStageConsistency"],
    ownershipRationale: "Fraud indicators are exclusively produced by the Stage 8 Fraud Engine",
    requiresApprovalForOverride: false,
    minConfidenceForFallback: 70,
    immutableAfterCertification: true,
    consumers: ["report_section_fraud", "dashboard_fraud"],
  },
  "physics.estimatedSpeedKmh": {
    canonicalOwner: "stage7_physics",
    precedence: ["PhysicsEngine", "VisionEngine", "DocumentExtraction", "DriverStatement"],
    ownershipRationale: "Physics Engine derives speed from crush depth, deformation energy, and vehicle mass — highest physical accuracy",
    requiresApprovalForOverride: true,
    minConfidenceForFallback: 70,
    immutableAfterCertification: true,
    consumers: ["report_section_physics", "dashboard_physics", "workflow_decision", "api_assessment"],
  },
  "physics.deltaVKmh": {
    canonicalOwner: "stage7_physics",
    precedence: ["PhysicsEngine", "VisionEngine"],
    ownershipRationale: "Delta-V is derived from the physics ensemble — Stage 7 is the only engine that computes it",
    requiresApprovalForOverride: false,
    minConfidenceForFallback: 75,
    immutableAfterCertification: true,
    consumers: ["report_section_physics"],
  },
  "physics.impactForceKn": {
    canonicalOwner: "stage7_physics",
    precedence: ["PhysicsEngine"],
    ownershipRationale: "Impact force is exclusively computed by the Physics Engine",
    requiresApprovalForOverride: false,
    minConfidenceForFallback: 75,
    immutableAfterCertification: true,
    consumers: ["report_section_physics"],
  },
  "physics.kineticEnergyJ": {
    canonicalOwner: "stage7_physics",
    precedence: ["PhysicsEngine"],
    ownershipRationale: "Kinetic energy is exclusively computed by the Physics Engine",
    requiresApprovalForOverride: false,
    minConfidenceForFallback: 75,
    immutableAfterCertification: true,
    consumers: ["report_section_physics"],
  },
  "physics.decelerationG": {
    canonicalOwner: "stage7_physics",
    precedence: ["PhysicsEngine"],
    ownershipRationale: "Deceleration is exclusively computed by the Physics Engine",
    requiresApprovalForOverride: false,
    minConfidenceForFallback: 75,
    immutableAfterCertification: true,
    consumers: ["report_section_physics"],
  },
  "physics.damageConsistencyScore": {
    canonicalOwner: "stage7_physics",
    precedence: ["PhysicsEngine", "Stage6DamageAnalysis"],
    ownershipRationale: "Damage consistency is the Physics Engine's cross-validation of vision damage against physics predictions",
    requiresApprovalForOverride: false,
    minConfidenceForFallback: 70,
    immutableAfterCertification: true,
    consumers: ["report_section_physics", "dashboard_physics"],
  },
  "damage.severity": {
    canonicalOwner: "stage7_physics",
    precedence: ["PhysicsEngine", "Stage6DamageAnalysis", "DocumentExtraction"],
    ownershipRationale: "Physics Engine provides the highest-fidelity severity assessment using energy methods",
    requiresApprovalForOverride: false,
    minConfidenceForFallback: 65,
    immutableAfterCertification: true,
    consumers: ["report_section_damage", "dashboard_damage", "workflow_decision"],
  },
  "damage.visionSourceReliability": {
    canonicalOwner: "stage6_damage_analysis",
    precedence: ["Stage6DamageAnalysis"],
    ownershipRationale: "Stage 6 is the only engine that assesses vision source quality",
    requiresApprovalForOverride: false,
    minConfidenceForFallback: 90,
    immutableAfterCertification: true,
    consumers: ["report_section_disclosure", "dashboard_vision"],
  },
  "damage.components": {
    canonicalOwner: "stage6_damage_analysis",
    precedence: ["Stage6DamageAnalysis", "VisionEngine", "DocumentExtraction"],
    ownershipRationale: "Stage 6 provides the most detailed component-level damage analysis",
    requiresApprovalForOverride: false,
    minConfidenceForFallback: 65,
    immutableAfterCertification: true,
    consumers: ["report_section_damage", "dashboard_damage"],
  },
  "damage.zones": {
    canonicalOwner: "stage6_damage_analysis",
    precedence: ["Stage6DamageAnalysis", "VisionEngine"],
    ownershipRationale: "Stage 6 provides spatial damage zone mapping from vision analysis",
    requiresApprovalForOverride: false,
    minConfidenceForFallback: 65,
    immutableAfterCertification: true,
    consumers: ["report_section_damage"],
  },
  "cost.optimisedCostUsd": {
    canonicalOwner: "stage9_cost",
    precedence: ["Stage9CostEngine", "CTL"],
    ownershipRationale: "Stage 9 Cost Engine applies market-rate optimisation and negotiation guidance",
    requiresApprovalForOverride: true,
    minConfidenceForFallback: 70,
    immutableAfterCertification: true,
    consumers: ["report_section_cost", "dashboard_cost", "workflow_decision", "api_assessment"],
  },
  "cost.costRecommendation": {
    canonicalOwner: "stage9_cost",
    precedence: ["Stage9CostEngine", "CTL"],
    ownershipRationale: "Cost recommendation is derived from the Stage 9 cost decision",
    requiresApprovalForOverride: true,
    minConfidenceForFallback: 70,
    immutableAfterCertification: true,
    consumers: ["report_section_cost", "dashboard_cost", "workflow_decision"],
  },
  "decision.recommendation": {
    canonicalOwner: "truth_reconciliation_engine",
    precedence: ["TRE", "CTL", "Stage9CostEngine"],
    ownershipRationale: "The TRE is the final governing authority over the claim recommendation",
    requiresApprovalForOverride: true,
    minConfidenceForFallback: 80,
    immutableAfterCertification: true,
    consumers: ["report_section_decision", "dashboard_decision", "workflow_decision", "api_assessment", "notifications"],
  },
  "workflow.claimAgeDays": {
    canonicalOwner: "claim_truth_layer",
    precedence: ["ClaimTruthLayer", "Stage3StructuredExtraction"],
    ownershipRationale: "CTL has the most reliable timeline resolution across all document sources",
    requiresApprovalForOverride: false,
    minConfidenceForFallback: 60,
    immutableAfterCertification: false,
    consumers: ["report_section_workflow", "dashboard_workflow"],
  },
  "workflow.lateSubmission": {
    canonicalOwner: "claim_truth_layer",
    precedence: ["ClaimTruthLayer", "Stage3StructuredExtraction"],
    ownershipRationale: "CTL resolves submission timeline from multiple document sources",
    requiresApprovalForOverride: false,
    minConfidenceForFallback: 60,
    immutableAfterCertification: false,
    consumers: ["report_section_workflow", "workflow_decision"],
  },
  "vehicle.marketValueUsd": {
    canonicalOwner: "stage5_assembly",
    precedence: ["Stage5Assembly", "DocumentExtraction"],
    ownershipRationale: "Stage 5 Assembly performs market valuation using vehicle data and market indices",
    requiresApprovalForOverride: false,
    minConfidenceForFallback: 65,
    immutableAfterCertification: false,
    consumers: ["report_section_vehicle", "dashboard_vehicle"],
  },
  "vehicle.isEconomicWriteOff": {
    canonicalOwner: "stage9_cost",
    precedence: ["Stage9CostEngine", "TRE"],
    ownershipRationale: "Write-off determination is derived from the repair-to-value ratio computed by Stage 9",
    requiresApprovalForOverride: true,
    minConfidenceForFallback: 75,
    immutableAfterCertification: true,
    consumers: ["report_section_vehicle", "dashboard_vehicle", "workflow_decision"],
  },
  "confidence.overallConfidence": {
    canonicalOwner: "truth_reconciliation_engine",
    precedence: ["TRE"],
    ownershipRationale: "The TRE aggregates all engine confidences and applies reconciliation decay",
    requiresApprovalForOverride: false,
    minConfidenceForFallback: 100,
    immutableAfterCertification: true,
    consumers: ["report_section_confidence", "dashboard_confidence", "api_assessment"],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Enhancement 3 — CONFIDENCE DECAY MODEL
// ─────────────────────────────────────────────────────────────────────────────

export interface ConfidenceDecayConfig {
  /** Penalty applied when a numeric conflict is resolved */
  numericConflictPenalty: number;
  /** Penalty applied when a semantic contradiction is detected */
  semanticConflictPenalty: number;
  /** Penalty applied when a timeline inconsistency is detected */
  temporalConflictPenalty: number;
  /** Penalty applied when a logical conflict is detected */
  logicalConflictPenalty: number;
  /** Penalty applied when a manual override is accepted */
  manualOverridePenalty: number;
  /** Penalty applied per missing evidence item */
  missingEvidencePenalty: number;
  /** Penalty applied when engine agreement is below threshold */
  engineDisagreementPenalty: number;
  /** Maximum total decay (floor = 100 - maxDecay) */
  maxDecayPoints: number;
}

export const DEFAULT_CONFIDENCE_DECAY: ConfidenceDecayConfig = {
  numericConflictPenalty: 6,
  semanticConflictPenalty: 4,
  temporalConflictPenalty: 8,
  logicalConflictPenalty: 5,
  manualOverridePenalty: 10,
  missingEvidencePenalty: 2,
  engineDisagreementPenalty: 3,
  maxDecayPoints: 40,
};

// ─────────────────────────────────────────────────────────────────────────────
// Enhancement 4 — TRUTH INTEGRITY SCORE
// ─────────────────────────────────────────────────────────────────────────────

export interface IntegrityScoreConfig {
  /** Base score before penalties */
  base: number;
  /** Penalty per numeric conflict */
  numericConflictWeight: number;
  /** Penalty per semantic conflict */
  semanticConflictWeight: number;
  /** Penalty per temporal conflict */
  temporalConflictWeight: number;
  /** Penalty per logical conflict */
  logicalConflictWeight: number;
  /** Penalty per manual override */
  manualOverrideWeight: number;
  /** Penalty per missing evidence item */
  missingEvidenceWeight: number;
  /** Penalty per confidence decay point */
  confidenceDecayWeight: number;
  /** Penalty per provenance gap (field with no evidence) */
  provenanceGapWeight: number;
}

export const DEFAULT_INTEGRITY_SCORE_CONFIG: IntegrityScoreConfig = {
  base: 100,
  numericConflictWeight: 8,
  semanticConflictWeight: 5,
  temporalConflictWeight: 10,
  logicalConflictWeight: 7,
  manualOverrideWeight: 12,
  missingEvidenceWeight: 3,
  confidenceDecayWeight: 0.5,
  provenanceGapWeight: 2,
};

export interface TruthIntegrityScore {
  /** Final score 0–100 */
  score: number;
  /** Breakdown of penalties applied */
  penalties: Array<{
    category: string;
    count: number;
    weight: number;
    totalDeduction: number;
  }>;
  /** Interpretation label */
  label: "EXCELLENT" | "GOOD" | "FAIR" | "POOR" | "CRITICAL";
  /** Human-readable summary */
  summary: string;
}

export function computeIntegrityScore(
  numericConflicts: number,
  semanticConflicts: number,
  temporalConflicts: number,
  logicalConflicts: number,
  manualOverrides: number,
  missingEvidenceItems: number,
  confidenceDecayPoints: number,
  provenanceGaps: number,
  config: IntegrityScoreConfig = DEFAULT_INTEGRITY_SCORE_CONFIG
): TruthIntegrityScore {
  const penalties = [
    { category: "Numeric conflicts", count: numericConflicts, weight: config.numericConflictWeight, totalDeduction: numericConflicts * config.numericConflictWeight },
    { category: "Semantic conflicts", count: semanticConflicts, weight: config.semanticConflictWeight, totalDeduction: semanticConflicts * config.semanticConflictWeight },
    { category: "Temporal conflicts", count: temporalConflicts, weight: config.temporalConflictWeight, totalDeduction: temporalConflicts * config.temporalConflictWeight },
    { category: "Logical conflicts", count: logicalConflicts, weight: config.logicalConflictWeight, totalDeduction: logicalConflicts * config.logicalConflictWeight },
    { category: "Manual overrides", count: manualOverrides, weight: config.manualOverrideWeight, totalDeduction: manualOverrides * config.manualOverrideWeight },
    { category: "Missing evidence", count: missingEvidenceItems, weight: config.missingEvidenceWeight, totalDeduction: missingEvidenceItems * config.missingEvidenceWeight },
    { category: "Confidence decay", count: confidenceDecayPoints, weight: config.confidenceDecayWeight, totalDeduction: confidenceDecayPoints * config.confidenceDecayWeight },
    { category: "Provenance gaps", count: provenanceGaps, weight: config.provenanceGapWeight, totalDeduction: provenanceGaps * config.provenanceGapWeight },
  ];
  const totalDeduction = penalties.reduce((sum, p) => sum + p.totalDeduction, 0);
  const score = Math.max(0, Math.min(100, Math.round(config.base - totalDeduction)));
  const label: TruthIntegrityScore["label"] =
    score >= 90 ? "EXCELLENT" :
    score >= 75 ? "GOOD" :
    score >= 55 ? "FAIR" :
    score >= 35 ? "POOR" : "CRITICAL";
  const summary =
    score >= 90 ? "All engines agree with minimal reconciliation required" :
    score >= 75 ? "Minor conflicts resolved — high confidence in canonical values" :
    score >= 55 ? "Moderate reconciliation required — some engine disagreements" :
    score >= 35 ? "Significant conflicts detected — manual review recommended" :
    "Critical integrity issues — do not auto-approve";
  return { score, penalties, label, summary };
}

// ─────────────────────────────────────────────────────────────────────────────
// Enhancement 5 — TRUTH STABILITY INDEX
// ─────────────────────────────────────────────────────────────────────────────

export interface TruthStabilityIndex {
  /** Stability score 0–100 */
  score: number;
  /** Interpretation label */
  label: "STABLE" | "MOSTLY_STABLE" | "UNSTABLE" | "HIGHLY_UNSTABLE";
  /** Number of reconciliation events */
  reconciliationCount: number;
  /** Number of detected conflicts */
  conflictCount: number;
  /** Number of warnings */
  warningCount: number;
  /** Confidence spread (max - min across engine confidences) */
  confidenceSpread: number;
  /** Number of values overridden by the TRE */
  overriddenValueCount: number;
  /** Human-readable interpretation */
  interpretation: string;
}

export function computeStabilityIndex(
  reconciliationCount: number,
  conflictCount: number,
  warningCount: number,
  engineConfidences: number[],
  overriddenValueCount: number
): TruthStabilityIndex {
  const confidenceSpread = engineConfidences.length >= 2
    ? Math.max(...engineConfidences) - Math.min(...engineConfidences)
    : 0;

  // Stability decreases with more reconciliations, conflicts, warnings, spread, and overrides
  const rawScore = 100
    - reconciliationCount * 4
    - conflictCount * 8
    - warningCount * 3
    - confidenceSpread * 0.3
    - overriddenValueCount * 5;

  const score = Math.max(0, Math.min(100, Math.round(rawScore)));
  const label: TruthStabilityIndex["label"] =
    score >= 80 ? "STABLE" :
    score >= 60 ? "MOSTLY_STABLE" :
    score >= 35 ? "UNSTABLE" : "HIGHLY_UNSTABLE";

  const interpretation =
    score >= 80 ? "Strong agreement across all engines — minimal reconciliation required" :
    score >= 60 ? "Mostly consistent — minor reconciliation applied" :
    score >= 35 ? "Significant engine disagreements — extensive reconciliation required" :
    "Highly unstable — multiple critical conflicts, manual review required";

  return {
    score,
    label,
    reconciliationCount,
    conflictCount,
    warningCount,
    confidenceSpread,
    overriddenValueCount,
    interpretation,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Enhancement 9 — RECONCILIATION ANALYTICS
// ─────────────────────────────────────────────────────────────────────────────

export interface ReconciliationAnalyticsRecord {
  /** Assessment ID */
  assessmentId: number;
  /** Claim ID */
  claimId: number;
  /** TRE version used */
  treVersion: string;
  /** CTO schema version */
  ctoSchemaVersion: string;
  /** ISO-8601 timestamp */
  generatedAt: string;
  /** Truth Integrity Score */
  integrityScore: number;
  /** Truth Stability Index */
  stabilityScore: number;
  /** Total conflicts detected */
  conflictCount: number;
  /** Conflicts by type */
  conflictsByType: Record<string, number>;
  /** Confidence decay applied */
  confidenceDecayPoints: number;
  /** Overall confidence after decay */
  overallConfidence: number;
  /** Number of overridden values */
  overriddenValueCount: number;
  /** Certification status */
  certificationStatus: string;
  /** Fields that had conflicts */
  conflictingFields: string[];
  /** Engines that were overridden */
  overriddenEngines: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Enhancement 11 — POLICY-BASED GOVERNANCE
// ─────────────────────────────────────────────────────────────────────────────

export type GovernanceAction = "BLOCK" | "ESCALATE" | "WARNING" | "REQUIRE_APPROVAL" | "LOG_ONLY";

export interface GovernancePolicy {
  /** Policy name for identification */
  name: string;
  /** Human-readable description */
  description: string;
  /** Action to take on unresolved conflict */
  unresolvedConflict: GovernanceAction;
  /** Action to take on missing evidence */
  missingEvidence: GovernanceAction;
  /** Action to take on timeline conflict */
  timelineConflict: GovernanceAction;
  /** Action to take on manual override */
  manualOverride: GovernanceAction;
  /** Action to take when engine agreement is below threshold */
  engineDisagreement: GovernanceAction;
  /** Minimum integrity score required to certify */
  minIntegrityScoreForCertification: number;
  /** Minimum stability score required to auto-approve */
  minStabilityScoreForAutoApproval: number;
  /** Whether to block publication on any CRITICAL conflict */
  blockOnCriticalConflict: boolean;
  /** Whether to require human review when stability < threshold */
  requireReviewBelowStability: number;
}

/** Standard governance policy — balanced between strictness and throughput */
export const STANDARD_GOVERNANCE_POLICY: GovernancePolicy = {
  name: "STANDARD",
  description: "Standard governance policy for typical insurance claims",
  unresolvedConflict: "ESCALATE",
  missingEvidence: "WARNING",
  timelineConflict: "ESCALATE",
  manualOverride: "REQUIRE_APPROVAL",
  engineDisagreement: "WARNING",
  minIntegrityScoreForCertification: 40,
  minStabilityScoreForAutoApproval: 60,
  blockOnCriticalConflict: true,
  requireReviewBelowStability: 35,
};

/** Strict governance policy — for high-value or disputed claims */
export const STRICT_GOVERNANCE_POLICY: GovernancePolicy = {
  name: "STRICT",
  description: "Strict governance policy for high-value or disputed claims",
  unresolvedConflict: "BLOCK",
  missingEvidence: "ESCALATE",
  timelineConflict: "BLOCK",
  manualOverride: "REQUIRE_APPROVAL",
  engineDisagreement: "ESCALATE",
  minIntegrityScoreForCertification: 65,
  minStabilityScoreForAutoApproval: 75,
  blockOnCriticalConflict: true,
  requireReviewBelowStability: 55,
};

/** Lenient governance policy — for low-value or fast-track claims */
export const LENIENT_GOVERNANCE_POLICY: GovernancePolicy = {
  name: "LENIENT",
  description: "Lenient governance policy for low-value or fast-track claims",
  unresolvedConflict: "WARNING",
  missingEvidence: "LOG_ONLY",
  timelineConflict: "WARNING",
  manualOverride: "LOG_ONLY",
  engineDisagreement: "LOG_ONLY",
  minIntegrityScoreForCertification: 25,
  minStabilityScoreForAutoApproval: 40,
  blockOnCriticalConflict: true,
  requireReviewBelowStability: 20,
};

export const GOVERNANCE_POLICIES: Record<string, GovernancePolicy> = {
  STANDARD: STANDARD_GOVERNANCE_POLICY,
  STRICT: STRICT_GOVERNANCE_POLICY,
  LENIENT: LENIENT_GOVERNANCE_POLICY,
};

// ─────────────────────────────────────────────────────────────────────────────
// Enhancement 7 — HISTORICAL TRUTH RECONCILIATION TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface TruthDriftEntry {
  fieldPath: string;
  oldValue: unknown;
  newValue: unknown;
  oldTreVersion: string;
  newTreVersion: string;
  oldCtoSchemaVersion: string;
  newCtoSchemaVersion: string;
  changeReason: string;
  detectedAt: string;
}

export interface TruthDriftReport {
  assessmentId: number;
  claimId: number;
  generatedAt: string;
  previousCtoHash: string;
  currentCtoHash: string;
  previousTreVersion: string;
  currentTreVersion: string;
  driftEntries: TruthDriftEntry[];
  driftCount: number;
  hasMaterialDrift: boolean;
  summary: string;
}

/**
 * Generate a Truth Drift Report by comparing two CTO snapshots.
 * Never overwrites historical truth objects — always creates a new report.
 */
export function generateTruthDriftReport(
  assessmentId: number,
  claimId: number,
  previousSnapshot: Record<string, unknown>,
  currentSnapshot: Record<string, unknown>,
  previousTreVersion: string,
  currentTreVersion: string,
  previousCtoSchemaVersion: string,
  currentCtoSchemaVersion: string,
  previousCtoHash: string,
  currentCtoHash: string
): TruthDriftReport {
  const now = new Date().toISOString();
  const driftEntries: TruthDriftEntry[] = [];

  // Compare flat key paths
  const allKeys = new Set([...Object.keys(previousSnapshot), ...Object.keys(currentSnapshot)]);
  for (const key of allKeys) {
    const oldVal = previousSnapshot[key];
    const newVal = currentSnapshot[key];
    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      driftEntries.push({
        fieldPath: key,
        oldValue: oldVal ?? null,
        newValue: newVal ?? null,
        oldTreVersion: previousTreVersion,
        newTreVersion: currentTreVersion,
        oldCtoSchemaVersion: previousCtoSchemaVersion,
        newCtoSchemaVersion: currentCtoSchemaVersion,
        changeReason: previousTreVersion !== currentTreVersion
          ? `TRE version changed from ${previousTreVersion} to ${currentTreVersion}`
          : "Value updated during re-reconciliation",
        detectedAt: now,
      });
    }
  }

  const hasMaterialDrift = driftEntries.some(d =>
    ["fraud.fraudRiskScore", "physics.estimatedSpeedKmh", "cost.optimisedCostUsd", "decision.recommendation"].includes(d.fieldPath)
  );

  return {
    assessmentId,
    claimId,
    generatedAt: now,
    previousCtoHash,
    currentCtoHash,
    previousTreVersion,
    currentTreVersion,
    driftEntries,
    driftCount: driftEntries.length,
    hasMaterialDrift,
    summary: driftEntries.length === 0
      ? "No drift detected — CTO values are identical"
      : `${driftEntries.length} field(s) changed${hasMaterialDrift ? " — includes material fields (fraud/speed/cost/decision)" : ""}`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Enhancement 8 — CANONICAL PROVENANCE EXPANSION TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface ExpandedFieldProvenance {
  /** Canonical owner per the governance registry */
  canonicalOwner: CanonicalOwner;
  /** Source engine that produced the value */
  sourceEngine: SourceEngine;
  /** Version of the source engine */
  sourceVersion: string;
  /** Supporting evidence items */
  supportingEvidence: string[];
  /** Fields this value depends on */
  dependencies: string[];
  /** Confidence score 0–100 */
  confidence: number;
  /** History of resolution decisions for this field */
  resolutionHistory: Array<{
    timestamp: string;
    previousValue: unknown;
    newValue: unknown;
    reason: string;
    resolvedBy: CanonicalOwner;
  }>;
  /** ISO-8601 timestamp of last reconciliation */
  lastReconciledAt: string;
  /** List of downstream consumers */
  consumers: string[];
}
