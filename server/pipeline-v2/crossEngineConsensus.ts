/**
 * crossEngineConsensus.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Stage 42 — Cross-Engine Consensus Scorer
 *
 * After all engines have run, this module measures how well the four evidence
 * sources agree with each other:
 *
 *   Physics    — Stage 7 impact direction, severity, delta-V
 *   Damage     — Stage 6 damage zones, severity score
 *   Photos     — claimRecord.damage.imageUrls count + Stage 6 photo signals
 *   Document   — claimRecord police report, repair quote, description
 *
 * Agreement is measured across 8 independent dimensions. Each dimension
 * contributes a weighted sub-score. The composite consensus_score (0–100)
 * is then classified:
 *
 *   > 80  → STRONG    — all engines agree
 *   60–80 → MODERATE  — minor disagreements present
 *   < 60  → CONFLICTING — significant cross-engine conflicts
 *
 * Output contract:
 * {
 *   consensus_score: number,          // 0–100
 *   consensus_label: ConsensusLabel,  // "STRONG" | "MODERATE" | "CONFLICTING"
 *   conflict_present: boolean,
 *   dimensions: ConsensusAgreementDimension[],
 *   conflict_summary: string,
 *   narrative: string,
 * }
 */

import type {
  ClaimRecord,
  Stage6Output,
  Stage7Output,
  Stage8Output,
  Stage9Output,
  AccidentSeverity,
  CollisionDirection,
} from "./types";
import type { DamagePhysicsCoherenceResult } from "./damagePhysicsCoherence";
import type { TruthResolutionResult } from "./sourceTruthResolver";

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export type ConsensusLabel = "STRONG" | "MODERATE" | "CONFLICTING";

export interface ConsensusAgreementDimension {
  /** Unique identifier for this dimension */
  dimension_id: string;
  /** Human-readable label */
  label: string;
  /** Sources involved in this comparison */
  sources: string[];
  /** Raw agreement score for this dimension (0–100) */
  agreement_score: number;
  /** Weight of this dimension in the composite (0–1) */
  weight: number;
  /** Weighted contribution to composite */
  weighted_contribution: number;
  /** Whether this dimension has a conflict */
  conflict: boolean;
  /** Brief explanation of the agreement or conflict */
  detail: string;
}

export interface ConsensusResult {
  /** Composite consensus score (0–100) */
  consensus_score: number;
  /** Classification label */
  consensus_label: ConsensusLabel;
  /** True when consensus_score < 60 */
  conflict_present: boolean;
  /** Per-dimension breakdown */
  dimensions: ConsensusAgreementDimension[];
  /** Number of conflicting dimensions */
  conflict_dimension_count: number;
  /** One-line conflict summary (empty string when no conflicts) */
  conflict_summary: string;
  /** Full OEC narrative */
  narrative: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Thresholds
// ─────────────────────────────────────────────────────────────────────────────

export const STRONG_THRESHOLD = 80;
export const MODERATE_THRESHOLD = 60;

// ─────────────────────────────────────────────────────────────────────────────
// Severity ordinal (for numeric comparison)
// ─────────────────────────────────────────────────────────────────────────────

const SEVERITY_ORDINAL: Record<AccidentSeverity, number> = {
  none: 0,
  cosmetic: 1,
  minor: 2,
  moderate: 3,
  severe: 4,
  catastrophic: 5,
};

function severityOrdinal(s: AccidentSeverity | null | undefined): number {
  if (!s) return -1;
  return SEVERITY_ORDINAL[s] ?? -1;
}

/**
 * Maps a Stage 6 overallSeverityScore (0–100) to an AccidentSeverity band.
 */
function scoreToBand(score: number): AccidentSeverity {
  if (score >= 85) return "catastrophic";
  if (score >= 65) return "severe";
  if (score >= 45) return "moderate";
  if (score >= 25) return "minor";
  if (score >= 5) return "cosmetic";
  return "none";
}

/**
 * Agreement score for two severity values (0–100).
 * Exact match → 100. One band apart → 70. Two bands → 40. Three+ → 0.
 */
function severityAgreement(a: AccidentSeverity | null, b: AccidentSeverity | null): number {
  if (a === null || b === null) return 50; // Unknown — neutral
  const diff = Math.abs(severityOrdinal(a) - severityOrdinal(b));
  if (diff === 0) return 100;
  if (diff === 1) return 70;
  if (diff === 2) return 40;
  return 0;
}

/**
 * Agreement score for two collision directions (0–100).
 * Exact match → 100. Opposite (front vs rear) → 0. Orthogonal → 40.
 */
function directionAgreement(a: CollisionDirection | null, b: CollisionDirection | null): number {
  if (a === null || b === null) return 50;
  if (a === b) return 100;
  const opposites: Partial<Record<CollisionDirection, CollisionDirection>> = {
    frontal: "rear",
    rear: "frontal",
    side_driver: "side_passenger",
    side_passenger: "side_driver",
  };
  if (opposites[a] === b) return 0;
  // Both are side variants → partial agreement
  if ((a.startsWith("side") && b.startsWith("side"))) return 60;
  // One is rollover or multi_impact — partial
  if (a === "rollover" || b === "rollover") return 40;
  if (a === "multi_impact" || b === "multi_impact") return 50;
  return 30;
}

// ─────────────────────────────────────────────────────────────────────────────
// Dimension builders
// ─────────────────────────────────────────────────────────────────────────────

/**
 * D1 — Physics ↔ Damage severity agreement
 * Physics accidentSeverity vs Stage 6 overallSeverityScore band
 */
function d1_physicsVsDamageSeverity(
  stage6: Stage6Output | null,
  stage7: Stage7Output | null
): ConsensusAgreementDimension {
  const physSev = stage7?.accidentSeverity ?? null;
  const dmgBand = stage6 ? scoreToBand(stage6.overallSeverityScore) : null;
  const score = severityAgreement(physSev, dmgBand);
  const conflict = score < 60;
  return {
    dimension_id: "d1_physics_damage_severity",
    label: "Physics ↔ Damage Severity",
    sources: ["physics", "damage"],
    agreement_score: score,
    weight: 0.18,
    weighted_contribution: score * 0.18,
    conflict,
    detail: physSev && dmgBand
      ? `Physics severity=${physSev}, damage severity band=${dmgBand} (score=${stage6?.overallSeverityScore ?? "N/A"})`
      : "Insufficient data for physics-damage severity comparison",
  };
}

/**
 * D2 — Physics ↔ Document direction agreement
 * Physics impactVector.direction vs claimRecord.accidentDetails.collisionDirection
 */
function d2_physicsVsDocumentDirection(
  claimRecord: ClaimRecord | null,
  stage7: Stage7Output | null
): ConsensusAgreementDimension {
  const physDir = stage7?.impactVector?.direction ?? null;
  const docDir = claimRecord?.accidentDetails?.collisionDirection ?? null;
  const score = directionAgreement(physDir, docDir);
  const conflict = score < 60;
  return {
    dimension_id: "d2_physics_document_direction",
    label: "Physics ↔ Document Direction",
    sources: ["physics", "document"],
    agreement_score: score,
    weight: 0.18,
    weighted_contribution: score * 0.18,
    conflict,
    detail: physDir && docDir
      ? `Physics direction=${physDir}, document direction=${docDir}`
      : "Insufficient data for physics-document direction comparison",
  };
}

/**
 * D3 — Damage ↔ Document direction agreement
 * Stage 6 primary zone vs claimRecord.accidentDetails.collisionDirection
 */
function d3_damageVsDocumentDirection(
  claimRecord: ClaimRecord | null,
  stage6: Stage6Output | null
): ConsensusAgreementDimension {
  const docDir = claimRecord?.accidentDetails?.collisionDirection ?? null;
  // Infer direction from primary damage zone
  const primaryZone = stage6?.damageZones?.[0]?.zone?.toLowerCase() ?? null;
  let inferredDir: CollisionDirection | null = null;
  if (primaryZone) {
    if (primaryZone.includes("front")) inferredDir = "frontal";
    else if (primaryZone.includes("rear")) inferredDir = "rear";
    else if (primaryZone.includes("driver")) inferredDir = "side_driver";
    else if (primaryZone.includes("passenger")) inferredDir = "side_passenger";
    else if (primaryZone.includes("roll")) inferredDir = "rollover";
    else if (primaryZone.includes("multi")) inferredDir = "multi_impact";
  }
  const score = directionAgreement(inferredDir, docDir);
  const conflict = score < 60;
  return {
    dimension_id: "d3_damage_document_direction",
    label: "Damage Zone ↔ Document Direction",
    sources: ["damage", "document"],
    agreement_score: score,
    weight: 0.12,
    weighted_contribution: score * 0.12,
    conflict,
    detail: inferredDir && docDir
      ? `Damage zone inferred direction=${inferredDir}, document direction=${docDir}`
      : "Insufficient data for damage-document direction comparison",
  };
}

/**
 * D4 — Physics damageConsistencyScore (internal physics-damage agreement)
 * Stage 7 reports its own internal consistency score (0–1)
 */
function d4_physicsInternalConsistency(stage7: Stage7Output | null): ConsensusAgreementDimension {
  const rawScore = stage7?.damageConsistencyScore ?? null;
  const score = rawScore !== null ? Math.round(rawScore * 100) : 50;
  const conflict = score < 60;
  return {
    dimension_id: "d4_physics_internal_consistency",
    label: "Physics Internal Damage Consistency",
    sources: ["physics", "damage"],
    agreement_score: score,
    weight: 0.15,
    weighted_contribution: score * 0.15,
    conflict,
    detail: rawScore !== null
      ? `Physics engine damageConsistencyScore=${rawScore.toFixed(3)} (${score}/100)`
      : "Physics engine did not report a damage consistency score",
  };
}

/**
 * D5 — Fraud engine damage consistency score
 * Stage 8 reports its own damageConsistencyScore (0–1)
 */
function d5_fraudDamageConsistency(stage8: Stage8Output | null): ConsensusAgreementDimension {
  const rawScore = stage8?.damageConsistencyScore ?? null;
  const score = rawScore !== null ? Math.round(rawScore * 100) : 50;
  const conflict = score < 60;
  return {
    dimension_id: "d5_fraud_damage_consistency",
    label: "Fraud Engine Damage Consistency",
    sources: ["fraud", "damage"],
    agreement_score: score,
    weight: 0.12,
    weighted_contribution: score * 0.12,
    conflict,
    detail: rawScore !== null
      ? `Fraud engine damageConsistencyScore=${rawScore.toFixed(3)} (${score}/100)`
      : "Fraud engine did not report a damage consistency score",
  };
}

/**
 * D6 — Photo evidence presence
 * More photos → higher confidence that damage is real and observable.
 * 0 photos → 30 (low confidence). 1–2 → 60. 3–5 → 80. 6+ → 100.
 */
function d6_photoEvidencePresence(claimRecord: ClaimRecord | null): ConsensusAgreementDimension {
  const photoCount = claimRecord?.damage?.imageUrls?.length ?? 0;
  let score: number;
  if (photoCount === 0) score = 30;
  else if (photoCount <= 2) score = 60;
  else if (photoCount <= 5) score = 80;
  else score = 100;
  const conflict = score < 60;
  return {
    dimension_id: "d6_photo_evidence_presence",
    label: "Photo Evidence Presence",
    sources: ["photos"],
    agreement_score: score,
    weight: 0.10,
    weighted_contribution: score * 0.10,
    conflict,
    detail: `${photoCount} photo(s) attached to claim — evidence presence score=${score}`,
  };
}

/**
 * D7 — Document completeness (police report + repair quote)
 * Police report number present → +30. Repair quote total present → +30.
 * Incident description present → +20. Assessor name present → +20.
 */
function d7_documentCompleteness(claimRecord: ClaimRecord | null): ConsensusAgreementDimension {
  let score = 0;
  const details: string[] = [];
  if (claimRecord?.policeReport?.reportNumber) {
    score += 30;
    details.push("police report present");
  } else {
    details.push("no police report");
  }
  if (claimRecord?.repairQuote?.quoteTotalCents != null) {
    score += 30;
    details.push("repair quote present");
  } else {
    details.push("no repair quote");
  }
  if (claimRecord?.accidentDetails?.description) {
    score += 20;
    details.push("incident description present");
  } else {
    details.push("no incident description");
  }
  if (claimRecord?.repairQuote?.assessorName) {
    score += 20;
    details.push("assessor name present");
  } else {
    details.push("no assessor name");
  }
  const conflict = score < 60;
  return {
    dimension_id: "d7_document_completeness",
    label: "Document Completeness",
    sources: ["document"],
    agreement_score: score,
    weight: 0.08,
    weighted_contribution: score * 0.08,
    conflict,
    detail: details.join(", "),
  };
}

/**
 * D8 — Coherence mismatch penalty
 * Uses the DamagePhysicsCoherenceResult to penalise the consensus score.
 * No mismatch → 100. Low-severity mismatches → 70. High-severity → 20.
 */
function d8_coherenceMismatch(
  coherenceResult: DamagePhysicsCoherenceResult | null
): ConsensusAgreementDimension {
  let score: number;
  let detail: string;
  if (!coherenceResult || !coherenceResult.has_mismatch) {
    score = 100;
    detail = "No zone-direction mismatches detected";
  } else {
    const highCount = coherenceResult.high_severity_mismatch_count;
    const totalCount = coherenceResult.mismatches?.length ?? 0;
    if (highCount >= 2) {
      score = 10;
    } else if (highCount === 1) {
      score = 25;
    } else if (totalCount >= 2) {
      score = 50;
    } else {
      score = 70;
    }
    detail = `${totalCount} zone-direction mismatch(es) detected — ${highCount} high-severity`;
  }
  const conflict = score < 60;
  return {
    dimension_id: "d8_coherence_mismatch",
    label: "Zone-Direction Coherence",
    sources: ["physics", "damage"],
    agreement_score: score,
    weight: 0.07,
    weighted_contribution: score * 0.07,
    conflict,
    detail,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Label classifier
// ─────────────────────────────────────────────────────────────────────────────

export function classifyConsensus(score: number): ConsensusLabel {
  if (score > STRONG_THRESHOLD) return "STRONG";
  if (score >= MODERATE_THRESHOLD) return "MODERATE";
  return "CONFLICTING";
}

// ─────────────────────────────────────────────────────────────────────────────
// Narrative builder
// ─────────────────────────────────────────────────────────────────────────────

function buildNarrative(
  score: number,
  label: ConsensusLabel,
  dimensions: ConsensusAgreementDimension[],
  conflictCount: number
): string {
  const conflicting = dimensions.filter((d) => d.conflict);
  const topConflicts = conflicting
    .sort((a, b) => a.agreement_score - b.agreement_score)
    .slice(0, 3)
    .map((d) => d.label)
    .join(", ");

  if (label === "STRONG") {
    return (
      `Cross-engine consensus score is ${score}/100 (STRONG), based on ${dimensions.length} agreement dimensions — ` +
      `all sources are in agreement on impact direction, severity, and damage extent.`
    );
  }
  if (label === "MODERATE") {
    return (
      `Cross-engine consensus score is ${score}/100 (MODERATE), based on ${dimensions.length} agreement dimensions — ` +
      `${conflictCount} dimension(s) show minor disagreement: ${topConflicts || "none specified"}. ` +
      `Manual review is recommended for conflicting dimensions.`
    );
  }
  // CONFLICTING
  return (
    `Cross-engine consensus score is ${score}/100 (CONFLICTING), based on ${dimensions.length} agreement dimensions — ` +
    `${conflictCount} dimension(s) show significant disagreement: ${topConflicts || "none specified"}. ` +
    `Adjuster review is required before proceeding.`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main entry point
// ─────────────────────────────────────────────────────────────────────────────

/**
 * D9 — Damage-vs-Cost consistency
 * Checks whether the cost estimate is plausible given the damage severity.
 * Severe damage with very low cost, or minor damage with very high cost, is a conflict.
 */
function d9_damageCostConsistency(
  stage6: Stage6Output | null,
  stage9: Stage9Output | null
): ConsensusAgreementDimension {
  const severity = stage6?.overallSeverityScore ?? null;
  const totalCents = stage9?.breakdown?.totalCents ?? null;
  let score = 70;
  const details: string[] = [];

  if (severity === null || totalCents === null) {
    score = 50;
    details.push("insufficient data for damage-cost comparison");
  } else {
    const totalUsd = totalCents / 100;
    // Thresholds: minor (<40) should be <$3k, severe (>70) should be >$1k
    if (severity < 40 && totalUsd > 5000) {
      score = 20;
      details.push(`minor damage (severity=${severity}) but high cost ($${totalUsd.toFixed(0)}) — possible inflation`);
    } else if (severity > 70 && totalUsd < 500) {
      score = 25;
      details.push(`severe damage (severity=${severity}) but very low cost ($${totalUsd.toFixed(0)}) — possible underquote`);
    } else if (severity >= 40 && severity <= 70 && totalUsd >= 500 && totalUsd <= 15000) {
      score = 90;
      details.push(`moderate damage (severity=${severity}) with proportionate cost ($${totalUsd.toFixed(0)})`);
    } else {
      score = 70;
      details.push(`damage severity=${severity}, cost=$${totalUsd.toFixed(0)} — within expected range`);
    }
  }

  const conflict = score < 50;
  return {
    dimension_id: "d9_damage_cost_consistency",
    label: "Damage-Cost Consistency",
    sources: ["damage", "cost"],
    agreement_score: score,
    weight: 0.10,
    weighted_contribution: score * 0.10,
    conflict,
    detail: details.join("; "),
  };
}

/**
 * D10 — Cost-vs-Fraud consistency
 * High fraud risk with low cost deviation is suspicious (fraud without financial gain).
 * High cost deviation with low fraud risk may indicate legitimate complex repair.
 */
function d10_costFraudConsistency(
  stage8: Stage8Output | null,
  stage9: Stage9Output | null
): ConsensusAgreementDimension {
  const fraudScore = stage8?.fraudRiskScore ?? null;
  const deviationPct = stage9?.quoteDeviationPct ?? null;
  let score = 70;
  const details: string[] = [];

  if (fraudScore === null || deviationPct === null) {
    score = 50;
    details.push("insufficient data for cost-fraud comparison");
  } else {
    const absDev = Math.abs(deviationPct);
    // High fraud + low deviation: suspicious — fraud without financial motive
    if (fraudScore > 70 && absDev < 5) {
      score = 30;
      details.push(`high fraud risk (${fraudScore}) but quote deviation only ${absDev.toFixed(1)}% — inconsistent pattern`);
    }
    // High fraud + high deviation: consistent — financial motive present
    else if (fraudScore > 70 && absDev > 20) {
      score = 85;
      details.push(`high fraud risk (${fraudScore}) with significant deviation (${absDev.toFixed(1)}%) — consistent pattern`);
    }
    // Low fraud + high deviation: possible legitimate complex repair
    else if (fraudScore < 30 && absDev > 30) {
      score = 65;
      details.push(`low fraud risk (${fraudScore}) with high deviation (${absDev.toFixed(1)}%) — may be legitimate complex repair`);
    }
    // Normal range
    else {
      score = 80;
      details.push(`fraud risk=${fraudScore}, quote deviation=${absDev.toFixed(1)}% — within expected correlation`);
    }
  }

  const conflict = score < 50;
  return {
    dimension_id: "d10_cost_fraud_consistency",
    label: "Cost-Fraud Consistency",
    sources: ["cost", "fraud"],
    agreement_score: score,
    weight: 0.09,
    weighted_contribution: score * 0.09,
    conflict,
    detail: details.join("; "),
  };
}

export function computeConsensus(
  claimRecord: ClaimRecord | null,
  stage6: Stage6Output | null,
  stage7: Stage7Output | null,
  stage8: Stage8Output | null,
  coherenceResult: DamagePhysicsCoherenceResult | null,
  _truthResolution?: TruthResolutionResult | null,
  stage9?: Stage9Output | null
): ConsensusResult {
  const dimensions: ConsensusAgreementDimension[] = [
    d1_physicsVsDamageSeverity(stage6, stage7),
    d2_physicsVsDocumentDirection(claimRecord, stage7),
    d3_damageVsDocumentDirection(claimRecord, stage6),
    d4_physicsInternalConsistency(stage7),
    d5_fraudDamageConsistency(stage8),
    d6_photoEvidencePresence(claimRecord),
    d7_documentCompleteness(claimRecord),
    d8_coherenceMismatch(coherenceResult),
    d9_damageCostConsistency(stage6, stage9 ?? null),
    d10_costFraudConsistency(stage8, stage9 ?? null),
  ];

  // Weighted composite score
  const totalWeight = dimensions.reduce((acc, d) => acc + d.weight, 0);
  const rawScore = dimensions.reduce((acc, d) => acc + d.weighted_contribution, 0) / totalWeight;
  const consensus_score = Math.round(Math.min(100, Math.max(0, rawScore)));

  const consensus_label = classifyConsensus(consensus_score);
  const conflict_present = consensus_score < MODERATE_THRESHOLD;
  const conflictDimensions = dimensions.filter((d) => d.conflict);
  const conflict_dimension_count = conflictDimensions.length;

  const conflict_summary =
    conflict_dimension_count > 0
      ? `${conflict_dimension_count} dimension(s) in conflict: ${conflictDimensions.map((d) => d.label).join("; ")}`
      : "";

  const narrative = buildNarrative(consensus_score, consensus_label, dimensions, conflict_dimension_count);

  return {
    consensus_score,
    consensus_label,
    conflict_present,
    dimensions,
    conflict_dimension_count,
    conflict_summary,
    narrative,
  };
}
