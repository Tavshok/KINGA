/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * TRUTH RECONCILIATION ENGINE (TRE) — v2.0
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Architectural position: FINAL synthesis stage — runs after ALL analytical
 * engines (Stages 1–9, CTL, reconciliation, consistency) and BEFORE every
 * downstream consumer (reports, dashboards, APIs, workflow, notifications).
 *
 * Responsibilities:
 *   1. Establish canonical field ownership (one owner per field)
 *   2. Reconcile numeric values (fraud score, speed, cost, age)
 *   3. Reconcile semantic statements (severity labels, narrative vs physics)
 *   4. Reconcile logical decisions (BLOCK vs PASS, APPROVE vs REJECT)
 *   5. Reconcile temporal data (single canonical timeline)
 *   6. Reconcile confidence (physics vs narrative vs summary) with decay model
 *   7. Generate a Truth Certificate before any report is released
 *   8. Build a TruthGraph with full provenance for every published field
 *
 * v2.0 Enhancements:
 *   E1.  Truth Governance Registry (external, see truthGovernanceRegistry.ts)
 *   E2.  Reconciliation Explainability — plain-language explanation per decision
 *   E3.  Confidence Decay Model — conflict-driven confidence penalty
 *   E4.  Truth Integrity Score — composite quality metric
 *   E5.  Truth Stability Index — cross-engine agreement metric
 *   E6.  CTO Schema Versioning — ctoSchemaVersion field on every CTO
 *   E7.  Historical Truth Reconciliation — drift detection hooks
 *   E8.  Canonical Provenance Expansion — per-field expanded provenance
 *   E9.  Reconciliation Analytics — analytics snapshot in every certificate
 *   E10. Truth Governance Dashboard (see client/src/pages/TruthGovernance.tsx)
 *   E11. Policy-Based Governance — pluggable GovernancePolicy
 *   E12. Certification Expansion — per-section certification status
 *
 * Design principles:
 *   Deterministic · Explainable · Auditable · Immutable after certification
 *   Fully versioned · Engine-agnostic · Independent of presentation layers
 */

import type {
  ClaimRecord,
  Stage6Output,
  Stage7Output,
  Stage8Output,
  Stage9Output,
  Stage10Output,
  TurnaroundTimeOutput,
  FraudRiskLevel,
  AccidentSeverity,
} from "./types";
import type { ClaimTruth } from "./claimTruthLayer";
import type { ReconciliationLog } from "./reconciliation-engine";
import type { ClaimQualityResult } from "./claimQualityScorer";
import type { SpeedInferenceResult } from "./speedInferenceEnsemble";
import type { ConsensusResult } from "./crossEngineConsensus";
import {
  TRUTH_GOVERNANCE_REGISTRY,
  DEFAULT_CONFIDENCE_DECAY,
  DEFAULT_INTEGRITY_SCORE_CONFIG,
  computeIntegrityScore,
  computeStabilityIndex,
  CTO_SCHEMA_VERSION,
  TRE_ENGINE_VERSION,
  type TruthIntegrityScore,
  type TruthStabilityIndex,
  type GovernancePolicy,
  STANDARD_GOVERNANCE_POLICY,
  type ReconciliationAnalyticsRecord,
} from "./truthGovernanceRegistry";

// ─────────────────────────────────────────────────────────────────────────────
// TRE VERSION
// ─────────────────────────────────────────────────────────────────────────────
const TRE_VERSION = TRE_ENGINE_VERSION;

// ─────────────────────────────────────────────────────────────────────────────
// PROVENANCE — every published field carries full lineage
// ─────────────────────────────────────────────────────────────────────────────

export type CanonicalOwner =
  | "stage1_ingestion"
  | "stage2_extraction"
  | "stage3_structured_extraction"
  | "stage4_validation"
  | "stage5_assembly"
  | "stage6_damage_analysis"
  | "stage7_physics"
  | "stage8_fraud"
  | "stage9_cost"
  | "stage9b_turnaround"
  | "stage10_report"
  | "claim_truth_layer"
  | "reconciliation_engine"
  | "cross_stage_consistency"
  | "claim_quality_scorer"
  | "truth_reconciliation_engine";

export interface FieldProvenance {
  canonicalOwner: CanonicalOwner;
  rawValue: unknown;
  confidence: number;
  computedAt: string;
  evidence: string[];
  alternativeSources: Array<{
    owner: CanonicalOwner;
    value: unknown;
    confidence: number;
    overriddenReason: string;
  }>;
  consumers: string[];
  treVersion: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// TRUTH GRAPH
// ─────────────────────────────────────────────────────────────────────────────

export interface TruthGraphNode {
  fieldPath: string;
  canonicalOwner: CanonicalOwner;
  value: unknown;
  confidence: number;
  computedAt: string;
  evidence: string[];
  dependencies: string[];
  consumers: string[];
  conflictCount: number;
}

export interface TruthGraph {
  nodes: Record<string, TruthGraphNode>;
  edges: Array<{ from: string; to: string; type: "depends_on" | "consumed_by" }>;
  generatedAt: string;
  totalNodes: number;
  totalConflicts: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONFLICT RECORD
// ─────────────────────────────────────────────────────────────────────────────

export type ConflictType =
  | "numeric_divergence"
  | "semantic_contradiction"
  | "logical_contradiction"
  | "temporal_inconsistency"
  | "confidence_mismatch"
  | "ownership_violation";

export type ConflictSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export type ConflictResolution =
  | "canonical_owner_wins"
  | "highest_confidence_wins"
  | "physics_wins"
  | "conservative_wins"
  | "analyst_required"
  | "suppressed_advisory";

export interface TruthConflict {
  conflictId: string;
  type: ConflictType;
  severity: ConflictSeverity;
  fieldPath: string;
  description: string;
  values: Array<{ source: CanonicalOwner; value: unknown; confidence: number }>;
  resolution: ConflictResolution;
  resolvedValue: unknown;
  resolvedBy: CanonicalOwner;
  resolutionReason: string;
  blocksPublication: boolean;
  fixSuggestion: string;
  detectedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// TRUTH CERTIFICATE (v2.0 — expanded)
// ─────────────────────────────────────────────────────────────────────────────

export type CertificationStatus = "CERTIFIED" | "BLOCKED" | "CERTIFIED_WITH_WARNINGS";

export interface TruthCertificate {
  certificateId: string;
  claimId: number;
  assessmentId: number;
  treVersion: string;
  /** Enhancement 6: CTO schema version */
  ctoSchemaVersion: string;
  generatedAt: string;
  consistencyScore: number;
  conflictsDetected: number;
  conflictsResolved: number;
  outstandingConflicts: number;
  canonicalFieldCount: number;
  overallConfidence: number;
  certified: CertificationStatus;
  blockingReasons: string[];
  warnings: string[];
  ownershipSummary: Partial<Record<CanonicalOwner, number>>;
  ctoHash: string;
  /** Enhancement 4: Truth Integrity Score */
  integrityScore: TruthIntegrityScore;
  /** Enhancement 5: Truth Stability Index */
  stabilityIndex: TruthStabilityIndex;
  /** Enhancement 9: Reconciliation analytics snapshot */
  analytics: Omit<ReconciliationAnalyticsRecord, "assessmentId" | "claimId" | "generatedAt">;
  /** Enhancement 11: Governance policy applied */
  governancePolicyName: string;
  /** Enhancement 2: Plain-language reconciliation explanation */
  reconciliationExplanation: string[];
  /** Enhancement 12: Per-section certification */
  sectionCertification: Record<string, { certified: boolean; reason: string }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// CLAIM TRUTH OBJECT (CTO) — canonical output of the TRE
// ─────────────────────────────────────────────────────────────────────────────

export interface CTOClaimIdentity {
  claimId: number;
  assessmentId: number;
  policyNumber: string | null;
  insurer: string | null;
  claimReference: string | null;
  _provenance: FieldProvenance;
}

export interface CTOVehicle {
  make: string;
  model: string;
  year: number | null;
  vin: string | null;
  registration: string | null;
  bodyType: string | null;
  massKg: number | null;
  marketValueUsd: number;
  marketValueSource: string;
  repairToValueRatio: number;
  isEconomicWriteOff: boolean;
  _provenance: FieldProvenance;
}

export interface CTODriver {
  name: string | null;
  licenseNumber: string | null;
  idNumber: string | null;
  _provenance: FieldProvenance;
}

export interface CTOIncident {
  date: string | null;
  location: string | null;
  incidentType: string | null;
  collisionDirection: string | null;
  claimedSpeedKmh: number | null;
  narrativeDescription: string | null;
  _provenance: FieldProvenance;
}

export interface CTODamage {
  severity: AccidentSeverity;
  severitySource: CanonicalOwner;
  zones: string[];
  components: Array<{
    name: string;
    location: string;
    damageType: string;
    severity: string;
    crushDepthM: number | null;
    deformationEnergyJ: number | null;
    structuralDisplacementM: number | null;
    inputSource: string | null;
  }>;
  structuralDamageDetected: boolean;
  damageAreaM2: number | null;
  visionSourceReliability: "HIGH" | "MEDIUM" | "LOW" | "NONE";
  _provenance: FieldProvenance;
}

export interface CTOPhysics {
  estimatedSpeedKmh: number | null;
  deltaVKmh: number | null;
  impactForceKn: number | null;
  kineticEnergyJ: number | null;
  decelerationG: number | null;
  physicsStatus: "EXECUTED" | "SKIPPED_NO_SPEED" | "SKIPPED_NON_PHYSICAL" | "ESTIMATED_FALLBACK";
  damageConsistencyScore: number;
  physicsConfidence: number | null;
  speedInferenceEnsemble: SpeedInferenceResult | null;
  _provenance: FieldProvenance;
}

export interface CTOFraud {
  fraudRiskScore: number;
  fraudRiskLevel: FraudRiskLevel;
  indicators: Array<{
    indicator: string;
    category: string;
    score: number;
    severity: string;
    evidence: string[];
  }>;
  quoteDeviation: number | null;
  _provenance: FieldProvenance;
}

export interface CTOCost {
  optimisedCostUsd: number;
  optimisedCostSource: string;
  expectedRepairCostCents: number;
  costRecommendation: "APPROVE" | "REVIEW" | "REJECT" | "NEGOTIATE" | "PROCEED_TO_ASSESSMENT" | "ESCALATE";
  quoteDeviationPct: number | null;
  recommendedCostRange: { lowCents: number; highCents: number };
  currency: string;
  _provenance: FieldProvenance;
}

export interface CTOWorkflow {
  claimAgeDays: number | null;
  submissionDate: string | null;
  incidentDate: string | null;
  lateSubmission: boolean;
  estimatedTurnaroundDays: number | null;
  _provenance: FieldProvenance;
}

export interface CTODecision {
  recommendation: "APPROVE" | "REVIEW" | "ESCALATE" | "REJECT";
  primaryReason: string;
  confidence: number;
  reviewTriggers: string[];
  approvalConditions: string[];
  isBlocked: boolean;
  blockingReasons: string[];
  _provenance: FieldProvenance;
}

export interface CTOEvidence {
  photoCount: number;
  documentCount: number;
  quotationCount: number;
  completenessScore: number;
  completenessBreakdown: Array<{ item: string; present: boolean; weight: number }>;
  _provenance: FieldProvenance;
}

export interface CTOConfidence {
  overallConfidence: number;
  physicsConfidence: number | null;
  fraudConfidence: number | null;
  costConfidence: number | null;
  evidenceConfidence: number | null;
  /** Enhancement 3: Confidence decay breakdown */
  decayApplied: number;
  decayBreakdown: {
    numericConflicts: number;
    semanticConflicts: number;
    temporalConflicts: number;
    logicalConflicts: number;
    missingEvidence: number;
  };
  _provenance: FieldProvenance;
}

export interface CTOConsistency {
  consistencyScore: number;
  blockAutoApproval: boolean;
  criticalConflictCount: number;
  highConflictCount: number;
  flagSummary: string;
  _provenance: FieldProvenance;
}

export interface CTOAuditTrail {
  conflicts: TruthConflict[];
  reconciliationEvents: Array<{
    field: string;
    winner: CanonicalOwner;
    loser: CanonicalOwner;
    reason: string;
    timestamp: string;
  }>;
  systemInterventions: Array<{ type: string; description: string; impact: string }>;
  recoveryActions: Array<{ field: string; strategy: string; result: string }>;
  stageDurations: Record<string, number>;
  pipelineRunId: string | null;
}

export interface CTOCertification {
  certificate: TruthCertificate;
  truthGraph: TruthGraph;
}

/**
 * ClaimTruthObject (CTO) v2.0 — the canonical output of the Truth Reconciliation Engine.
 *
 * This is the ONLY object any downstream consumer (reports, dashboards, APIs,
 * workflow, notifications, analytics) may read from.
 *
 * Immutable after certification. Versioned. Fully auditable.
 */
export interface ClaimTruthObject {
  claimIdentity: CTOClaimIdentity;
  vehicle: CTOVehicle;
  driver: CTODriver;
  incident: CTOIncident;
  damage: CTODamage;
  physics: CTOPhysics;
  fraud: CTOFraud;
  cost: CTOCost;
  workflow: CTOWorkflow;
  decision: CTODecision;
  evidence: CTOEvidence;
  confidence: CTOConfidence;
  consistency: CTOConsistency;
  auditTrail: CTOAuditTrail;
  certification: CTOCertification;
  /** TRE engine version */
  treVersion: string;
  /** Enhancement 6: CTO schema version */
  ctoSchemaVersion: string;
  /** ISO-8601 timestamp when this CTO was generated */
  generatedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// TRE INPUT CONTRACT
// ─────────────────────────────────────────────────────────────────────────────

export interface TREInput {
  claimRecord: ClaimRecord;
  damageAnalysis: Stage6Output | null;
  physicsAnalysis: Stage7Output | null;
  fraudAnalysis: Stage8Output | null;
  costAnalysis: Stage9Output | null;
  turnaroundAnalysis: TurnaroundTimeOutput | null;
  reportOutput: Stage10Output | null;
  claimTruth: ClaimTruth | null;
  // Typed as `any` because two separate engines export incompatible ConsistencyCheckResult shapes.
  // The TRE accesses all fields via optional chaining.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  consistencyCheck: any | null;
  reconciliationLog: ReconciliationLog | null;
  claimQuality: ClaimQualityResult | null;
  consensusResult: ConsensusResult | null;
  runId: string | null;
  stageDurations: Record<string, number>;
  assumptions: Array<{ type: string; description: string; impact: string }>;
  recoveryActions: Array<{ field: string; strategy: string; result: string }>;
  integrityGateBlocked: boolean;
  integrityGateBlockingReasons: string[];
  integrityGateWarnings: string[];
  /** Enhancement 11: Governance policy to apply (default: STANDARD) */
  governancePolicy?: GovernancePolicy;
}

// ─────────────────────────────────────────────────────────────────────────────
// CANONICAL OWNERSHIP REGISTRY (local — mirrors truthGovernanceRegistry.ts)
// ─────────────────────────────────────────────────────────────────────────────

export const CANONICAL_OWNERSHIP: Record<string, CanonicalOwner> = {
  "fraud.fraudRiskScore":           "stage8_fraud",
  "fraud.fraudRiskLevel":           "stage8_fraud",
  "fraud.indicators":               "stage8_fraud",
  "physics.estimatedSpeedKmh":      "stage7_physics",
  "physics.deltaVKmh":              "stage7_physics",
  "physics.impactForceKn":          "stage7_physics",
  "physics.kineticEnergyJ":         "stage7_physics",
  "physics.decelerationG":          "stage7_physics",
  "physics.damageConsistencyScore": "stage7_physics",
  "damage.severity":                "stage7_physics",
  "damage.visionSourceReliability": "stage6_damage_analysis",
  "damage.components":              "stage6_damage_analysis",
  "damage.zones":                   "stage6_damage_analysis",
  "cost.optimisedCostUsd":          "stage9_cost",
  "cost.costRecommendation":        "stage9_cost",
  "decision.recommendation":        "truth_reconciliation_engine",
  "workflow.claimAgeDays":          "claim_truth_layer",
  "workflow.lateSubmission":        "claim_truth_layer",
  "vehicle.marketValueUsd":         "stage5_assembly",
  "vehicle.isEconomicWriteOff":     "stage9_cost",
  "confidence.overallConfidence":   "truth_reconciliation_engine",
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function makeProvenance(
  owner: CanonicalOwner,
  value: unknown,
  confidence: number,
  now: string,
  evidence: string[] = [],
  alternatives: FieldProvenance["alternativeSources"] = [],
  consumers: string[] = []
): FieldProvenance {
  return {
    canonicalOwner: owner,
    rawValue: value,
    confidence,
    computedAt: now,
    evidence,
    alternativeSources: alternatives,
    consumers,
    treVersion: TRE_VERSION,
  };
}

function makeConflict(
  id: string,
  type: ConflictType,
  severity: ConflictSeverity,
  fieldPath: string,
  description: string,
  values: TruthConflict["values"],
  resolution: ConflictResolution,
  resolvedValue: unknown,
  resolvedBy: CanonicalOwner,
  resolutionReason: string,
  blocksPublication: boolean,
  fixSuggestion: string,
  now: string
): TruthConflict {
  return {
    conflictId: id,
    type,
    severity,
    fieldPath,
    description,
    values,
    resolution,
    resolvedValue,
    resolvedBy,
    resolutionReason,
    blocksPublication,
    fixSuggestion,
    detectedAt: now,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// RECONCILIATION PASSES
// ─────────────────────────────────────────────────────────────────────────────

/** Pass 1: Numeric reconciliation — fraud score, speed, cost */
function reconcileNumeric(
  input: TREInput,
  conflicts: TruthConflict[],
  now: string
): {
  fraudRiskScore: number;
  fraudRiskLevel: FraudRiskLevel;
  estimatedSpeedKmh: number | null;
  optimisedCostUsd: number;
} {
  const s8 = input.fraudAnalysis;
  const s7 = input.physicsAnalysis;
  const s9 = input.costAnalysis;
  const ctl = input.claimTruth;

  // ── Fraud score: Stage 8 is canonical owner ───────────────────────────────
  const s8Score = s8?.fraudRiskScore ?? 0;
  const ctlScore = ctl?.meta?.stage8FraudScore ?? null;
  const fraudRiskScore = s8Score;
  if (ctlScore !== null && Math.abs(ctlScore - s8Score) > 10) {
    conflicts.push(makeConflict(
      `C-FRAUD-${Date.now()}`,
      "numeric_divergence",
      "MEDIUM",
      "fraud.fraudRiskScore",
      `Stage 8 fraud score (${s8Score}) diverges from CTL score (${ctlScore}) by ${Math.abs(ctlScore - s8Score).toFixed(1)} points`,
      [
        { source: "stage8_fraud", value: s8Score, confidence: 85 },
        { source: "claim_truth_layer", value: ctlScore, confidence: 70 },
      ],
      "canonical_owner_wins",
      s8Score,
      "stage8_fraud",
      "Stage 8 is the canonical owner of fraudRiskScore per ownership registry",
      false,
      "Verify that CTL is receiving the Stage 8 score via the stage8FraudScore input field",
      now
    ));
  }
  const fraudRiskLevel: FraudRiskLevel = s8?.fraudRiskLevel ?? "minimal";

  // ── Speed: Stage 7 is canonical owner ────────────────────────────────────
  const s7Speed = s7?.estimatedSpeedKmh ?? null;
  const recLog = input.reconciliationLog;
  const recSpeed = (recLog?.events?.find(e => e.field === "estimatedSpeedKmh")?.adoptedValue as number | null) ?? null;
  const estimatedSpeedKmh = s7Speed;
  if (recSpeed !== null && s7Speed !== null && Math.abs(recSpeed - s7Speed) > 5) {
    conflicts.push(makeConflict(
      `C-SPEED-${Date.now()}`,
      "numeric_divergence",
      "MEDIUM",
      "physics.estimatedSpeedKmh",
      `Stage 7 speed (${s7Speed} km/h) diverges from reconciliation engine speed (${recSpeed} km/h)`,
      [
        { source: "stage7_physics", value: s7Speed, confidence: 80 },
        { source: "reconciliation_engine", value: recSpeed, confidence: 75 },
      ],
      "physics_wins",
      s7Speed,
      "stage7_physics",
      "Physics engine is the canonical owner of speed estimates",
      false,
      "Check reconciliation engine speed inputs — it may be using a different ensemble method",
      now
    ));
  }

  // ── Cost: Stage 9 is canonical owner ─────────────────────────────────────
  const s9Cost = s9?.costDecision?.true_cost_usd ?? s9?.quoteOptimisation?.optimised_cost_usd ?? (s9?.expectedRepairCostCents ? s9.expectedRepairCostCents / 100 : 0);
  const ctlCost = (ctl?.costBasis as any)?.optimisedCostUsd ?? null;
  const optimisedCostUsd = s9Cost;
  if (ctlCost !== null && s9Cost > 0 && Math.abs(ctlCost - s9Cost) / Math.max(s9Cost, 1) > 0.15) {
    conflicts.push(makeConflict(
      `C-COST-${Date.now()}`,
      "numeric_divergence",
      "HIGH",
      "cost.optimisedCostUsd",
      `Stage 9 cost ($${s9Cost.toFixed(0)}) diverges from CTL cost ($${ctlCost.toFixed(0)}) by >15%`,
      [
        { source: "stage9_cost", value: s9Cost, confidence: 85 },
        { source: "claim_truth_layer", value: ctlCost, confidence: 70 },
      ],
      "canonical_owner_wins",
      s9Cost,
      "stage9_cost",
      "Stage 9 is the canonical owner of optimisedCostUsd",
      false,
      "Verify CTL cost basis is receiving Stage 9 output correctly",
      now
    ));
  }

  return { fraudRiskScore, fraudRiskLevel, estimatedSpeedKmh, optimisedCostUsd };
}

/** Pass 2: Semantic reconciliation — severity labels */
function reconcileSemantic(
  input: TREInput,
  conflicts: TruthConflict[],
  now: string
): { severity: AccidentSeverity; severitySource: CanonicalOwner } {
  const s7 = input.physicsAnalysis;
  const s6 = input.damageAnalysis;
  const ctl = input.claimTruth;

  const s7Severity = s7?.accidentSeverity ?? null;
  const s6Severity = (s6 as any)?.overallSeverity ?? null;
  const ctlSeverity = (ctl as any)?.vehicle?.severity ?? null;

  // Physics wins for severity
  const severity: AccidentSeverity = s7Severity ?? s6Severity ?? ctlSeverity ?? "minor";
  const severitySource: CanonicalOwner = s7Severity ? "stage7_physics" : s6Severity ? "stage6_damage_analysis" : "claim_truth_layer";

  if (s7Severity && s6Severity && s7Severity !== s6Severity) {
    const severityOrder = ["minor", "moderate", "severe", "catastrophic"];
    const s7Idx = severityOrder.indexOf(s7Severity);
    const s6Idx = severityOrder.indexOf(s6Severity);
    const gap = Math.abs(s7Idx - s6Idx);
    conflicts.push(makeConflict(
      `C-SEV-${Date.now()}`,
      "semantic_contradiction",
      gap >= 2 ? "HIGH" : "MEDIUM",
      "damage.severity",
      `Stage 7 severity (${s7Severity}) contradicts Stage 6 severity (${s6Severity})`,
      [
        { source: "stage7_physics", value: s7Severity, confidence: 85 },
        { source: "stage6_damage_analysis", value: s6Severity, confidence: 75 },
      ],
      "physics_wins",
      s7Severity,
      "stage7_physics",
      "Physics engine severity is canonical — it fuses damage, speed, and structural signals",
      gap >= 2,
      "Review Stage 6 damage component list — severity mismatch may indicate missing structural components",
      now
    ));
  }

  return { severity, severitySource };
}

/** Pass 3: Temporal reconciliation — claim age, dates */
function reconcileTemporal(
  input: TREInput,
  conflicts: TruthConflict[],
  now: string
): { claimAgeDays: number | null; submissionDate: string | null; incidentDate: string | null; lateSubmission: boolean } {
  const ctl = input.claimTruth;
  const cr = input.claimRecord;

  const claimAgeDays = ctl?.timeline?.daysToLodge ?? null;
  const submissionDate = ctl?.timeline?.claimRegistrationDate ?? cr.accidentDetails?.date ?? null;
  const incidentDate = ctl?.timeline?.incidentDate ?? cr.accidentDetails?.date ?? null;
  const lateSubmission = ctl?.timeline?.lateSubmission ?? false;

  // Temporal sanity check: incident must precede submission
  if (incidentDate && submissionDate && incidentDate !== submissionDate) {
    const iDate = new Date(incidentDate).getTime();
    const sDate = new Date(submissionDate).getTime();
    if (!isNaN(iDate) && !isNaN(sDate) && iDate > sDate) {
      conflicts.push(makeConflict(
        `C-TEMP-${Date.now()}`,
        "temporal_inconsistency",
        "CRITICAL",
        "workflow.incidentDate",
        `Incident date (${incidentDate}) is AFTER submission date (${submissionDate}) — impossible timeline`,
        [
          { source: "claim_truth_layer", value: incidentDate, confidence: 60 },
          { source: "claim_truth_layer", value: submissionDate, confidence: 60 },
        ],
        "analyst_required",
        null,
        "truth_reconciliation_engine",
        "Impossible timeline detected — analyst must verify dates from source documents",
        true,
        "Check Stage 3 date extraction — OCR may have transposed day/month in one of the dates",
        now
      ));
    }
  }

  return { claimAgeDays, submissionDate, incidentDate, lateSubmission };
}

/** Pass 4: Logical reconciliation — final decision */
function reconcileDecision(
  input: TREInput,
  conflicts: TruthConflict[],
  now: string
): { recommendation: CTODecision["recommendation"]; primaryReason: string; confidence: number; reviewTriggers: string[]; approvalConditions: string[]; isBlocked: boolean; blockingReasons: string[] } {
  const ctl = input.claimTruth;
  const s9 = input.costAnalysis;
  const cc = input.consistencyCheck;

  const ctlDecision = ctl?.decision?.recommendation ?? null;
  const s9Decision = s9?.costDecision?.recommendation ?? null;
  const blockAutoApproval: boolean = cc?.blockAutoApproval ?? (cc?.proceed === false ? true : false);

  // Collect blocking reasons
  const blockingReasons: string[] = [...(input.integrityGateBlockingReasons ?? [])];
  const reviewTriggers: string[] = [];
  const approvalConditions: string[] = [];

  // Temporal impossibility blocks publication
  const temporalConflict = conflicts.find(c => c.type === "temporal_inconsistency" && c.blocksPublication);
  if (temporalConflict) {
    blockingReasons.push("Impossible timeline detected — incident date after submission date");
  }

  // Consistency engine block
  if (blockAutoApproval) {
    reviewTriggers.push("Cross-stage consistency engine flagged contradictions");
  }

  // Fraud escalation
  const fraudScore = input.fraudAnalysis?.fraudRiskScore ?? 0;
  if (fraudScore >= 70) {
    reviewTriggers.push(`High fraud risk score: ${fraudScore}`);
  }

  // Reconcile CTL vs Stage 9 decision
  let recommendation: CTODecision["recommendation"] = "REVIEW";
  let primaryReason = "Default review — insufficient data for auto-decision";
  let confidence = 50;

  if (blockingReasons.length > 0) {
    recommendation = "ESCALATE";
    primaryReason = blockingReasons[0];
    confidence = 95;
  } else if (ctlDecision === "ESCALATE" || s9Decision === "ESCALATE") {
    recommendation = "ESCALATE";
    primaryReason = ctlDecision === "ESCALATE" ? "CTL decision: ESCALATE" : "Stage 9 cost decision: ESCALATE";
    confidence = 90;
    if (ctlDecision !== s9Decision && ctlDecision !== null && s9Decision !== null) {
      conflicts.push(makeConflict(
        `C-DEC-${Date.now()}`,
        "logical_contradiction",
        "HIGH",
        "decision.recommendation",
        `CTL decision (${ctlDecision}) contradicts Stage 9 decision (${s9Decision})`,
        [
          { source: "claim_truth_layer", value: ctlDecision, confidence: 80 },
          { source: "stage9_cost", value: s9Decision, confidence: 75 },
        ],
        "conservative_wins",
        "ESCALATE",
        "truth_reconciliation_engine",
        "When CTL and Stage 9 disagree, TRE escalates to analyst review",
        false,
        "Review CTL decision logic and Stage 9 cost recommendation — they may be using different thresholds",
        now
      ));
    }
  } else if (ctlDecision === ("REJECT" as string) || s9Decision === "REJECT") {
    recommendation = "REJECT";
    primaryReason = "Claim rejected by decision engine";
    confidence = 85;
  } else if (blockAutoApproval || reviewTriggers.length > 0) {
    recommendation = "REVIEW";
    primaryReason = reviewTriggers[0] ?? "Consistency flags require analyst review";
    confidence = 75;
  } else if (ctlDecision === "APPROVE" && (s9Decision === "APPROVE" || s9Decision === null)) {
    recommendation = "APPROVE";
    primaryReason = "Both CTL and Stage 9 recommend approval";
    confidence = 85;
    approvalConditions.push("No blocking consistency flags");
    approvalConditions.push("No high fraud risk");
  } else if (ctlDecision === "REVIEW" || s9Decision === "REVIEW") {
    recommendation = "REVIEW";
    primaryReason = "Decision engine recommends analyst review";
    confidence = 75;
  }

  const isBlocked = blockingReasons.length > 0;

  return { recommendation, primaryReason, confidence, reviewTriggers, approvalConditions, isBlocked, blockingReasons };
}

/** Pass 5: Confidence reconciliation with Enhancement 3 decay model */
function reconcileConfidence(input: TREInput, conflicts: TruthConflict[]): CTOConfidence {
  const s7 = input.physicsAnalysis;
  const s8 = input.fraudAnalysis;
  const s9 = input.costAnalysis;
  const now = new Date().toISOString();

  const physicsConfidence = s7?.physicsConfidence ?? (s7?.damageConsistencyScore ?? null);
  const fraudConfidence = s8 ? 85 : null;
  const costConfidence = s9?.costReliability?.confidence_score ?? null;
  const evidenceConfidence = input.claimTruth?.evidence?.completenessScore ?? null;

  const scores = [physicsConfidence, fraudConfidence, costConfidence, evidenceConfidence].filter((s): s is number => s !== null);
  const rawConfidence = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 50;

  // Enhancement 3: Confidence Decay Model
  const decay = DEFAULT_CONFIDENCE_DECAY;
  const numericConflicts = conflicts.filter(c => c.type === "numeric_divergence").length;
  const semanticConflicts = conflicts.filter(c => c.type === "semantic_contradiction").length;
  const temporalConflicts = conflicts.filter(c => c.type === "temporal_inconsistency").length;
  const logicalConflicts = conflicts.filter(c => c.type === "logical_contradiction").length;
  const missingEvidence = Math.max(0, 4 - scores.length);

  const totalDecay = Math.min(
    decay.maxDecayPoints,
    numericConflicts * decay.numericConflictPenalty +
    semanticConflicts * decay.semanticConflictPenalty +
    temporalConflicts * decay.temporalConflictPenalty +
    logicalConflicts * decay.logicalConflictPenalty +
    missingEvidence * decay.missingEvidencePenalty
  );
  const overallConfidence = Math.max(0, Math.min(100, rawConfidence - totalDecay));

  return {
    overallConfidence,
    physicsConfidence: physicsConfidence ?? null,
    fraudConfidence,
    costConfidence,
    evidenceConfidence,
    decayApplied: totalDecay,
    decayBreakdown: { numericConflicts, semanticConflicts, temporalConflicts, logicalConflicts, missingEvidence },
    _provenance: makeProvenance(
      "truth_reconciliation_engine",
      overallConfidence,
      overallConfidence,
      now,
      [`Raw confidence: ${rawConfidence}, decay applied: ${totalDecay} (${numericConflicts} numeric, ${semanticConflicts} semantic, ${temporalConflicts} temporal, ${logicalConflicts} logical conflicts, ${missingEvidence} missing evidence sources)`]
    ),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION BUILDERS
// ─────────────────────────────────────────────────────────────────────────────

function buildClaimIdentity(input: TREInput, now: string): CTOClaimIdentity {
  const cr = input.claimRecord;
  return {
    claimId: cr.claimId,
    assessmentId: 0, // Set by orchestrator after DB insert
    policyNumber: cr.insuranceContext?.policyNumber ?? null,
    insurer: cr.insuranceContext?.insurerName ?? null,
    claimReference: cr.insuranceContext?.claimReference ?? null,
    _provenance: makeProvenance("stage3_structured_extraction", cr.claimId, 95, now, ["ClaimRecord.insuranceContext"]),
  };
}

function buildVehicle(input: TREInput, now: string): CTOVehicle {
  const cr = input.claimRecord;
  const v = cr.vehicle;
  const val = cr.valuation;
  const s9 = input.costAnalysis;

  const marketValueUsd = val?.marketValueUsd ?? 0;
  const optimisedCost = s9?.costDecision?.true_cost_usd ?? s9?.quoteOptimisation?.optimised_cost_usd ?? (s9?.expectedRepairCostCents ? s9.expectedRepairCostCents / 100 : 0);
  const repairToValueRatio = marketValueUsd > 0 ? optimisedCost / marketValueUsd : 0;
  const isEconomicWriteOff = repairToValueRatio >= 0.75;

  return {
    make: v?.make ?? "Unknown",
    model: v?.model ?? "Unknown",
    year: v?.year ? parseInt(String(v.year), 10) || null : null,
    vin: v?.vin ?? null,
    registration: v?.registration ?? null,
    bodyType: v?.bodyType ?? null,
    massKg: v?.massKg ?? null,
    marketValueUsd,
    marketValueSource: val ? "stage5_valuation" : "not_available",
    repairToValueRatio,
    isEconomicWriteOff,
    _provenance: makeProvenance("stage5_assembly", v, 90, now, ["ClaimRecord.vehicle", "ClaimRecord.valuation"]),
  };
}

function buildDriver(input: TREInput, now: string): CTODriver {
  const cr = input.claimRecord;
  const d = cr.driver;
  return {
    name: d?.name ?? null,
    licenseNumber: d?.licenseNumber ?? null,
    idNumber: d?.idNumber ?? null,
    _provenance: makeProvenance("stage3_structured_extraction", d, 85, now, ["ClaimRecord.driver"]),
  };
}

function buildIncident(input: TREInput, now: string): CTOIncident {
  const cr = input.claimRecord;
  const ad = cr.accidentDetails;
  return {
    date: ad?.date ?? null,
    location: ad?.location ?? null,
    incidentType: ad?.incidentType ?? null,
    collisionDirection: ad?.collisionDirection ?? null,
    claimedSpeedKmh: ad?.estimatedSpeedKmh ?? null,
    narrativeDescription: ad?.description ?? null,
    _provenance: makeProvenance("stage3_structured_extraction", ad, 80, now, ["ClaimRecord.accidentDetails"]),
  };
}

function buildDamage(input: TREInput, now: string): CTODamage {
  const s6 = input.damageAnalysis;
  const s7 = input.physicsAnalysis;
  const severity: AccidentSeverity = s7?.accidentSeverity ?? (s6 as any)?.overallSeverity ?? "minor";
  const severitySource: CanonicalOwner = s7?.accidentSeverity ? "stage7_physics" : "stage6_damage_analysis";

  const components = (s6?.damagedParts ?? []).map((c: any) => ({
    name: c.componentName ?? c.name ?? "unknown",
    location: c.location ?? "unknown",
    damageType: c.damageType ?? "unknown",
    severity: c.severity ?? "unknown",
    crushDepthM: c.crushDepthM ?? null,
    deformationEnergyJ: c.deformationEnergyJ ?? null,
    structuralDisplacementM: c.structuralDisplacementM ?? null,
    inputSource: c.inputSource ?? null,
  }));

  return {
    severity,
    severitySource,
    zones: (s6?.damageZones ?? []).map((z: any) => z.zone ?? String(z)),
    components,
    structuralDamageDetected: s6?.structuralDamageDetected ?? false,
    damageAreaM2: null,
    visionSourceReliability: s6?.visionSourceReliability ?? "NONE",
    _provenance: makeProvenance("stage6_damage_analysis", s6, 80, now, ["Stage6Output.damagedComponents", "Stage6Output.visionSourceReliability"]),
  };
}

function buildPhysics(input: TREInput, estimatedSpeedKmh: number | null, now: string): CTOPhysics {
  const s7 = input.physicsAnalysis;
  return {
    estimatedSpeedKmh,
    deltaVKmh: s7?.deltaVKmh ?? null,
    impactForceKn: s7?.impactForceKn ?? null,
    kineticEnergyJ: s7?.energyDistribution?.kineticEnergyJ ?? null,
    decelerationG: s7?.decelerationG ?? null,
    physicsStatus: s7?.physicsStatus ?? "SKIPPED_NO_SPEED",
    damageConsistencyScore: s7?.damageConsistencyScore ?? 0,
    physicsConfidence: s7?.physicsConfidence ?? null,
    speedInferenceEnsemble: s7?.speedInferenceEnsemble ?? null,
    _provenance: makeProvenance("stage7_physics", s7, s7?.physicsConfidence ?? 70, now, ["Stage7Output"]),
  };
}

function buildFraud(input: TREInput, fraudRiskScore: number, fraudRiskLevel: FraudRiskLevel, now: string): CTOFraud {
  const s8 = input.fraudAnalysis;
  const indicators = (s8?.indicators ?? []).map((ind: any) => ({
    indicator: ind.indicator ?? ind.description ?? "unknown",
    category: ind.category ?? "unknown",
    score: ind.score ?? 0,
    severity: ind.severity ?? "LOW",
    evidence: ind.evidence ?? [],
  }));

  return {
    fraudRiskScore,
    fraudRiskLevel,
    indicators,
    quoteDeviation: (s8 as any)?.quoteDeviation ?? null,
    _provenance: makeProvenance("stage8_fraud", s8, 85, now, ["Stage8Output.fraudRiskScore", "Stage8Output.indicators"]),
  };
}

function buildCost(input: TREInput, optimisedCostUsd: number, now: string): CTOCost {
  const s9 = input.costAnalysis;
  const costDecision = s9?.costDecision;

  const costRecommendation = costDecision?.recommendation ?? "PROCEED_TO_ASSESSMENT";
  const expectedRepairCostCents = s9?.expectedRepairCostCents ?? Math.round(optimisedCostUsd * 100);
  const quoteDeviationPct = costDecision?.deviation_analysis?.optimised_vs_true_pct ?? s9?.quoteDeviationPct ?? null;

  const negotiation = costDecision?.negotiation_guidance;
  const lowCents = negotiation ? Math.round(negotiation.floor_usd * 100) : Math.round(optimisedCostUsd * 90);
  const highCents = negotiation ? Math.round(negotiation.ceiling_usd * 100) : Math.round(optimisedCostUsd * 110);

  return {
    optimisedCostUsd,
    optimisedCostSource: costDecision?.cost_basis ?? "system_optimised",
    expectedRepairCostCents,
    costRecommendation,
    quoteDeviationPct,
    recommendedCostRange: { lowCents, highCents },
    currency: "USD",
    _provenance: makeProvenance("stage9_cost", s9, costDecision?.confidence ?? 70, now, ["Stage9Output.costDecision"]),
  };
}

function buildWorkflow(
  input: TREInput,
  claimAgeDays: number | null,
  submissionDate: string | null,
  incidentDate: string | null,
  lateSubmission: boolean,
  now: string
): CTOWorkflow {
  const s9b = input.turnaroundAnalysis;
  return {
    claimAgeDays,
    submissionDate,
    incidentDate,
    lateSubmission,
    estimatedTurnaroundDays: s9b?.estimatedRepairDays ?? null,
    _provenance: makeProvenance("claim_truth_layer", { claimAgeDays, lateSubmission }, 80, now, ["ClaimTruth.timeline"]),
  };
}

function buildEvidence(input: TREInput, now: string): CTOEvidence {
  const ctl = input.claimTruth;
  const ev = ctl?.evidence;

  return {
    photoCount: ev?.photoCount ?? 0,
    documentCount: ev?.documents?.length ?? 0,
    quotationCount: ev?.quotationScans?.length ?? 0,
    completenessScore: ev?.completenessScore ?? 0,
    completenessBreakdown: ev?.completenessBreakdown ?? [],
    _provenance: makeProvenance("claim_truth_layer", ev, ev?.completenessScore ?? 50, now, ["ClaimTruth.evidence"]),
  };
}

function buildConsistency(input: TREInput, now: string): CTOConsistency {
  const cc = input.consistencyCheck;
  // Support both claimConsistencyChecker shape and crossStageConsistencyEngine shape
  const blockAutoApproval = cc?.blockAutoApproval ?? (cc?.proceed === false ? true : false);
  const criticalConflictCount = cc?.criticalCount ?? (cc?.critical_conflicts?.length ?? 0);
  const highConflictCount = cc?.highCount ?? 0;
  const consistencyScore = cc?.flags
    ? Math.max(0, 100 - criticalConflictCount * 20 - highConflictCount * 10)
    : cc?.proceed !== false ? 80 : 40;

  return {
    consistencyScore,
    blockAutoApproval,
    criticalConflictCount,
    highConflictCount,
    flagSummary: cc?.summary ?? "No consistency check available",
    _provenance: makeProvenance("cross_stage_consistency", cc, consistencyScore, now, ["ConsistencyCheckResult"]),
  };
}

function buildAuditTrail(
  input: TREInput,
  conflicts: TruthConflict[]
): CTOAuditTrail {
  const recLog = input.reconciliationLog;
  const reconciliationEvents = (recLog?.events ?? []).map((e: any) => ({
    field: e.field,
    winner: (e.winner ?? "reconciliation_engine") as CanonicalOwner,
    loser: (e.loser ?? "reconciliation_engine") as CanonicalOwner,
    reason: e.reason ?? "reconciliation_engine arbitration",
    timestamp: e.timestamp ?? new Date().toISOString(),
  }));

  return {
    conflicts,
    reconciliationEvents,
    systemInterventions: input.assumptions.map(a => ({
      type: a.type,
      description: a.description,
      impact: a.impact,
    })),
    recoveryActions: input.recoveryActions,
    stageDurations: input.stageDurations,
    pipelineRunId: input.runId,
  };
}

function buildTruthGraph(cto: Omit<ClaimTruthObject, "certification" | "treVersion" | "ctoSchemaVersion" | "generatedAt">, now: string): TruthGraph {
  const nodes: Record<string, TruthGraphNode> = {};
  const edges: Array<{ from: string; to: string; type: "depends_on" | "consumed_by" }> = [];
  let totalConflicts = 0;

  const addNode = (path: string, owner: CanonicalOwner, value: unknown, confidence: number, evidence: string[], deps: string[] = []) => {
    nodes[path] = {
      fieldPath: path,
      canonicalOwner: owner,
      value,
      confidence,
      computedAt: now,
      evidence,
      dependencies: deps,
      consumers: [],
      conflictCount: 0,
    };
    for (const dep of deps) {
      edges.push({ from: dep, to: path, type: "depends_on" });
    }
  };

  addNode("fraud.fraudRiskScore", "stage8_fraud", cto.fraud.fraudRiskScore, 85, ["Stage8Output"]);
  addNode("physics.estimatedSpeedKmh", "stage7_physics", cto.physics.estimatedSpeedKmh, 80, ["Stage7Output"]);
  addNode("damage.visionSourceReliability", "stage6_damage_analysis", cto.damage.visionSourceReliability, 90, ["Stage6Output"]);
  addNode("cost.optimisedCostUsd", "stage9_cost", cto.cost.optimisedCostUsd, 80, ["Stage9Output"]);
  addNode("decision.recommendation", "truth_reconciliation_engine", cto.decision.recommendation, cto.decision.confidence, ["TRE reconciliation"], ["fraud.fraudRiskScore", "physics.estimatedSpeedKmh", "cost.optimisedCostUsd"]);

  // Count conflicts per node
  for (const conflict of cto.auditTrail.conflicts) {
    if (nodes[conflict.fieldPath]) {
      nodes[conflict.fieldPath].conflictCount++;
      totalConflicts++;
    }
  }

  return {
    nodes,
    edges,
    generatedAt: now,
    totalNodes: Object.keys(nodes).length,
    totalConflicts,
  };
}

function generateCertificate(
  input: TREInput,
  cto: Omit<ClaimTruthObject, "certification" | "treVersion" | "ctoSchemaVersion" | "generatedAt">,
  conflicts: TruthConflict[],
  now: string
): TruthCertificate {
  const blockingConflicts = conflicts.filter(c => c.blocksPublication);
  const integrityBlocked = input.integrityGateBlocked;
  const blockingReasons = [
    ...blockingConflicts.map(c => c.description),
    ...input.integrityGateBlockingReasons,
  ];
  const warnings = [...input.integrityGateWarnings];

  // Add visionSourceReliability warning
  if (cto.damage.visionSourceReliability === "LOW" || cto.damage.visionSourceReliability === "NONE") {
    warnings.push(`[P6] visionSourceReliability=${cto.damage.visionSourceReliability} — physics crush-depth estimates excluded from ensemble`);
  }

  const certified: CertificationStatus =
    blockingReasons.length > 0 || integrityBlocked
      ? "BLOCKED"
      : warnings.length > 0
        ? "CERTIFIED_WITH_WARNINGS"
        : "CERTIFIED";

  const conflictsResolved = conflicts.filter(c => c.resolution !== "analyst_required").length;
  const outstandingConflicts = conflicts.filter(c => c.resolution === "analyst_required").length;

  const consistencyScore = Math.max(0, 100 - blockingConflicts.length * 25 - outstandingConflicts * 10 - warnings.length * 5);

  // Ownership summary
  const ownershipSummary: Partial<Record<CanonicalOwner, number>> = {};
  for (const owner of Object.values(CANONICAL_OWNERSHIP)) {
    ownershipSummary[owner] = (ownershipSummary[owner] ?? 0) + 1;
  }

  // Simple hash of key CTO values for immutability tracking
  const hashInput = `${cto.claimIdentity.claimId}:${cto.fraud.fraudRiskScore}:${cto.physics.estimatedSpeedKmh}:${cto.cost.optimisedCostUsd}:${cto.decision.recommendation}`;
  const ctoHash = Buffer.from(hashInput).toString("base64").slice(0, 32);

  // Enhancement 4: Truth Integrity Score
  const numericConflicts = conflicts.filter(c => c.type === "numeric_divergence").length;
  const semanticConflicts = conflicts.filter(c => c.type === "semantic_contradiction").length;
  const temporalConflicts = conflicts.filter(c => c.type === "temporal_inconsistency").length;
  const logicalConflicts = conflicts.filter(c => c.type === "logical_contradiction").length;
  const missingEvidenceItems = [cto.physics.physicsConfidence, cto.fraud.fraudRiskScore, cto.cost.optimisedCostUsd, cto.evidence.completenessScore].filter(v => !v).length;
  const confidenceDecayPoints = cto.confidence.decayApplied;
  const provenanceGaps = 0; // All sections have _provenance in v2.0
  const integrityScore = computeIntegrityScore(
    numericConflicts, semanticConflicts, temporalConflicts, logicalConflicts,
    0, missingEvidenceItems, confidenceDecayPoints, provenanceGaps,
    DEFAULT_INTEGRITY_SCORE_CONFIG
  );

  // Enhancement 5: Truth Stability Index
  const engineConfidences = [
    cto.confidence.physicsConfidence,
    cto.confidence.fraudConfidence,
    cto.confidence.costConfidence,
    cto.confidence.evidenceConfidence,
  ].filter((c): c is number => c !== null);
  const stabilityIndex = computeStabilityIndex(
    cto.auditTrail.reconciliationEvents.length,
    conflicts.length,
    warnings.length,
    engineConfidences,
    conflicts.filter(c => c.resolution === "canonical_owner_wins" || c.resolution === "physics_wins").length
  );

  // Enhancement 2: Reconciliation Explainability
  const reconciliationExplanation: string[] = [
    `TRE v${TRE_VERSION} (schema ${CTO_SCHEMA_VERSION}) processed ${Object.keys(CANONICAL_OWNERSHIP).length} canonical fields.`,
    `Detected ${conflicts.length} conflict(s): ${numericConflicts} numeric, ${semanticConflicts} semantic, ${temporalConflicts} temporal, ${logicalConflicts} logical.`,
    ...conflicts.map(c => `[${c.severity}] ${c.fieldPath}: ${c.description} → resolved by ${c.resolvedBy} (${c.resolutionReason})`),
    `Confidence decay applied: ${confidenceDecayPoints} points (raw → ${cto.confidence.overallConfidence + confidenceDecayPoints}, final → ${cto.confidence.overallConfidence}).`,
    `Truth Integrity Score: ${integrityScore.score}/100 (${integrityScore.label}) — ${integrityScore.summary}`,
    `Truth Stability Score: ${stabilityIndex.score}/100 (${stabilityIndex.label}) — ${stabilityIndex.interpretation}`,
    `Final decision: ${cto.decision.recommendation} (confidence: ${cto.decision.confidence}%)`,
    `Certification: ${certified}${blockingReasons.length > 0 ? ` — blocked by: ${blockingReasons.join("; ")}` : ""}`,
  ];

  // Enhancement 9: Reconciliation Analytics
  const analytics: Omit<ReconciliationAnalyticsRecord, "assessmentId" | "claimId" | "generatedAt"> = {
    treVersion: TRE_VERSION,
    ctoSchemaVersion: CTO_SCHEMA_VERSION,
    integrityScore: integrityScore.score,
    stabilityScore: stabilityIndex.score,
    conflictCount: conflicts.length,
    conflictsByType: {
      numeric_divergence: numericConflicts,
      semantic_contradiction: semanticConflicts,
      temporal_inconsistency: temporalConflicts,
      logical_conflict: logicalConflicts,
    },
    confidenceDecayPoints,
    overallConfidence: cto.confidence.overallConfidence,
    overriddenValueCount: conflicts.filter(c => c.resolution === "canonical_owner_wins" || c.resolution === "physics_wins").length,
    certificationStatus: certified,
    conflictingFields: conflicts.map(c => c.fieldPath),
    overriddenEngines: [...new Set(conflicts.map(c => c.values[1]?.source ?? "").filter(Boolean))],
  };

  // Enhancement 11: Governance policy
  const policy = input.governancePolicy ?? STANDARD_GOVERNANCE_POLICY;
  if (policy.blockOnCriticalConflict && conflicts.some(c => c.severity === "CRITICAL")) {
    blockingReasons.push(`[POLICY:${policy.name}] Critical conflict detected — publication blocked per governance policy`);
  }

  // Enhancement 12: Per-section certification
  const sectionCertification: Record<string, { certified: boolean; reason: string }> = {
    fraud: {
      certified: cto.fraud.fraudRiskScore !== null && !conflicts.some(c => c.fieldPath.startsWith("fraud") && c.blocksPublication),
      reason: cto.fraud.fraudRiskScore !== null ? "Stage 8 fraud score available" : "No fraud analysis available",
    },
    physics: {
      certified: cto.physics.estimatedSpeedKmh !== null && !conflicts.some(c => c.fieldPath.startsWith("physics") && c.blocksPublication),
      reason: cto.physics.estimatedSpeedKmh !== null ? "Physics engine speed estimate available" : "No physics analysis available",
    },
    cost: {
      certified: cto.cost.optimisedCostUsd > 0 && !conflicts.some(c => c.fieldPath.startsWith("cost") && c.blocksPublication),
      reason: cto.cost.optimisedCostUsd > 0 ? "Stage 9 cost estimate available" : "No cost analysis available",
    },
    damage: {
      certified: cto.damage.visionSourceReliability !== "NONE" && !conflicts.some(c => c.fieldPath.startsWith("damage") && c.blocksPublication),
      reason: cto.damage.visionSourceReliability !== "NONE" ? `Vision source: ${cto.damage.visionSourceReliability}` : "No vision analysis available",
    },
    decision: {
      certified: blockingReasons.length === 0,
      reason: blockingReasons.length > 0 ? `Blocked: ${blockingReasons[0]}` : "Decision certified by TRE",
    },
  };

  return {
    certificateId: `TRE-${input.claimRecord.claimId}-${Date.now()}`,
    claimId: input.claimRecord.claimId,
    assessmentId: 0,
    treVersion: TRE_VERSION,
    ctoSchemaVersion: CTO_SCHEMA_VERSION,
    generatedAt: now,
    consistencyScore,
    conflictsDetected: conflicts.length,
    conflictsResolved,
    outstandingConflicts,
    canonicalFieldCount: Object.keys(CANONICAL_OWNERSHIP).length,
    overallConfidence: cto.confidence.overallConfidence,
    certified,
    blockingReasons,
    warnings,
    ownershipSummary,
    ctoHash,
    integrityScore,
    stabilityIndex,
    analytics,
    governancePolicyName: policy.name,
    reconciliationExplanation,
    sectionCertification,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN ENTRY POINT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run the Truth Reconciliation Engine v2.0.
 *
 * Call this after ALL analytical engines have completed.
 * The resulting CTO is the single source of truth for all downstream consumers.
 */
export function runTruthReconciliationEngine(input: TREInput): ClaimTruthObject {
  const now = new Date().toISOString();
  const conflicts: TruthConflict[] = [];

  // ── 1. NUMERIC RECONCILIATION ──────────────────────────────────────────────
  const { fraudRiskScore, fraudRiskLevel, estimatedSpeedKmh, optimisedCostUsd } =
    reconcileNumeric(input, conflicts, now);

  // ── 2. SEMANTIC RECONCILIATION ────────────────────────────────────────────
  const { severity: _severity, severitySource: _severitySource } =
    reconcileSemantic(input, conflicts, now);

  // ── 3. TEMPORAL RECONCILIATION ────────────────────────────────────────────
  const { claimAgeDays, submissionDate, incidentDate, lateSubmission } =
    reconcileTemporal(input, conflicts, now);

  // ── 4. LOGICAL RECONCILIATION (DECISION) ─────────────────────────────────
  const decisionResult = reconcileDecision(input, conflicts, now);

  // ── 5. CONFIDENCE RECONCILIATION (with E3 decay model) ───────────────────
  const confidenceResult = reconcileConfidence(input, conflicts);

  // ── BUILD CTO SECTIONS ────────────────────────────────────────────────────
  const claimIdentity = buildClaimIdentity(input, now);
  const vehicle = buildVehicle(input, now);
  const driver = buildDriver(input, now);
  const incident = buildIncident(input, now);
  const damage = buildDamage(input, now);
  const physics = buildPhysics(input, estimatedSpeedKmh, now);
  const fraud = buildFraud(input, fraudRiskScore, fraudRiskLevel, now);
  const cost = buildCost(input, optimisedCostUsd, now);
  const workflow = buildWorkflow(input, claimAgeDays, submissionDate, incidentDate, lateSubmission, now);
  const evidence = buildEvidence(input, now);
  const consistency = buildConsistency(input, now);

  const decision: CTODecision = {
    ...decisionResult,
    _provenance: makeProvenance("truth_reconciliation_engine", decisionResult.recommendation, decisionResult.confidence, now, ["TRE reconciliation passes 1–4"]),
  };

  const auditTrail = buildAuditTrail(input, conflicts);

  // Partial CTO for certificate and truth graph generation
  const partialCto = {
    claimIdentity, vehicle, driver, incident, damage, physics, fraud, cost,
    workflow, decision, evidence, confidence: confidenceResult, consistency, auditTrail,
  };

  // ── TRUTH CERTIFICATE (E2, E4, E5, E9, E11, E12) ─────────────────────────
  const certificate = generateCertificate(input, partialCto, conflicts, now);
  const truthGraph = buildTruthGraph(partialCto, now);

  return {
    ...partialCto,
    certification: { certificate, truthGraph },
    treVersion: TRE_VERSION,
    ctoSchemaVersion: CTO_SCHEMA_VERSION,
    generatedAt: now,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// DEVELOPER REPORT
// ─────────────────────────────────────────────────────────────────────────────

export interface TREDeveloperReport {
  certificateId: string;
  claimId: number;
  certified: CertificationStatus;
  consistencyScore: number;
  overallConfidence: number;
  conflictsDetected: number;
  conflictsResolved: number;
  outstandingConflicts: number;
  blockingReasons: string[];
  warnings: string[];
  topConflicts: Array<{
    fieldPath: string;
    severity: ConflictSeverity;
    description: string;
    resolution: ConflictResolution;
    blocksPublication: boolean;
  }>;
  ownershipViolations: string[];
  canonicalFieldCount: number;
  certificationStatus: CertificationStatus;
  /** Enhancement 4 */
  integrityScore: TruthIntegrityScore;
  /** Enhancement 5 */
  stabilityIndex: TruthStabilityIndex;
  /** Enhancement 2 */
  reconciliationExplanation: string[];
}

export function generateTREDeveloperReport(cto: ClaimTruthObject): TREDeveloperReport {
  const cert = cto.certification.certificate;
  const conflicts = cto.auditTrail.conflicts;

  return {
    certificateId: cert.certificateId,
    claimId: cert.claimId,
    certified: cert.certified,
    consistencyScore: cert.consistencyScore,
    overallConfidence: cert.overallConfidence,
    conflictsDetected: cert.conflictsDetected,
    conflictsResolved: cert.conflictsResolved,
    outstandingConflicts: cert.outstandingConflicts,
    blockingReasons: cert.blockingReasons,
    warnings: cert.warnings,
    topConflicts: conflicts
      .sort((a, b) => {
        const order: Record<ConflictSeverity, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
        return order[a.severity] - order[b.severity];
      })
      .slice(0, 5)
      .map(c => ({
        fieldPath: c.fieldPath,
        severity: c.severity,
        description: c.description,
        resolution: c.resolution,
        blocksPublication: c.blocksPublication,
      })),
    ownershipViolations: conflicts
      .filter(c => c.type === "ownership_violation")
      .map(c => c.description),
    canonicalFieldCount: cert.canonicalFieldCount,
    certificationStatus: cert.certified,
    integrityScore: cert.integrityScore,
    stabilityIndex: cert.stabilityIndex,
    reconciliationExplanation: cert.reconciliationExplanation,
  };
}
