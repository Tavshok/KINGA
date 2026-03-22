/**
 * crossEngineConsistencyValidator.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Cross-Engine Consistency Validator
 *
 * Checks agreement between:
 *   - Physics output (Stage 7)
 *   - Damage validation (Stage 6 + Stage 7 damagePatternValidation)
 *   - Fraud analysis (Stage 8)
 *
 * Returns:
 *   {
 *     consistency_score: 0-100,
 *     agreements: [],
 *     conflicts: [],
 *     overall_status: "CONSISTENT" | "CONFLICTED",
 *     reasoning: ""
 *   }
 *
 * Rules:
 *   - If all engines align → CONSISTENT
 *   - If physics contradicts damage → CONFLICT
 *   - Do NOT average blindly — explain disagreements
 *   - NEVER halts — returns degraded output if inputs are missing
 */

import type { ClaimRecord, Stage6Output, Stage7Output, Stage8Output } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// INPUT / OUTPUT TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface CrossEngineValidatorInput {
  claimRecord: ClaimRecord | null;
  stage6: Stage6Output | null;
  stage7: Stage7Output | null;
  stage8: Pick<Stage8Output, "fraudRiskScore" | "fraudRiskLevel" | "indicators" | "damageConsistencyScore" | "scenarioFraudResult"> | null;
}

export interface ConsistencyAgreement {
  check_id: string;
  label: string;
  engines: string[];
  strength: "STRONG" | "MODERATE";
  score: number;
  detail: string;
}

export interface ConsistencyConflict {
  check_id: string;
  label: string;
  engines: string[];
  severity: "MINOR" | "SIGNIFICANT" | "CRITICAL";
  physics_says: string;
  damage_says: string;
  fraud_says: string;
  recommended_action: string;
}

export interface CrossEngineConsistencyResult {
  consistency_score: number;
  agreements: ConsistencyAgreement[];
  conflicts: ConsistencyConflict[];
  overall_status: "CONSISTENT" | "CONFLICTED";
  critical_conflict_count: number;
  reasoning: string;
  validator_metadata: {
    checks_run: number;
    agreements_found: number;
    conflicts_found: number;
    critical_conflicts: number;
    score_before_conflict_penalty: number;
    conflict_penalty_applied: number;
    inputs_available: Record<string, boolean>;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SEVERITY ORDINAL MAP
// ─────────────────────────────────────────────────────────────────────────────

const SEVERITY_ORDINAL: Record<string, number> = {
  none: 0,
  cosmetic: 1,
  minor: 2,
  moderate: 3,
  severe: 4,
  catastrophic: 5,
};

function scoreToDamageBand(score: number): string {
  if (score >= 85) return "catastrophic";
  if (score >= 65) return "severe";
  if (score >= 45) return "moderate";
  if (score >= 25) return "minor";
  if (score >= 5) return "cosmetic";
  return "none";
}

// ─────────────────────────────────────────────────────────────────────────────
// DIRECTION NORMALISATION
// ─────────────────────────────────────────────────────────────────────────────

function normaliseDirection(dir: string | null | undefined): string | null {
  if (!dir) return null;
  const d = dir.toLowerCase().trim();
  if (d === "front" || d === "frontal" || d === "head_on" || d === "head-on") return "frontal";
  if (d === "rear" || d === "rear_end" || d === "rear-end") return "rear";
  if (d === "side_driver" || d === "driver_side" || d === "left") return "side_driver";
  if (d === "side_passenger" || d === "passenger_side" || d === "right") return "side_passenger";
  if (d === "rollover" || d === "roll") return "rollover";
  if (d === "unknown" || d === "n/a" || d === "null") return null;
  return d;
}

// ─────────────────────────────────────────────────────────────────────────────
// ZONE → DIRECTION MAP
// ─────────────────────────────────────────────────────────────────────────────

const ZONE_TO_DIRECTION: Record<string, string[]> = {
  front: ["frontal"],
  hood: ["frontal"],
  bumper_front: ["frontal"],
  rear: ["rear"],
  boot: ["rear"],
  bumper_rear: ["rear"],
  trunk: ["rear"],
  side_driver: ["side_driver"],
  door_driver: ["side_driver"],
  quarter_panel_driver: ["side_driver"],
  side_passenger: ["side_passenger"],
  door_passenger: ["side_passenger"],
  quarter_panel_passenger: ["side_passenger"],
  roof: ["rollover", "frontal", "rear"],
  undercarriage: ["rollover", "frontal"],
  interior: ["flood", "fire", "theft"],
  engine: ["frontal", "flood", "fire"],
  electronics: ["flood", "fire"],
};

function zoneMatchesDirection(zone: string, direction: string): boolean {
  const compatible = ZONE_TO_DIRECTION[zone.toLowerCase()] ?? [];
  return compatible.includes(direction);
}

// ─────────────────────────────────────────────────────────────────────────────
// CHECK FUNCTIONS (C1–C9)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * C1: Physics severity vs Damage severity band
 */
function checkC1PhysicsDamageSeverity(
  stage6: Stage6Output | null,
  stage7: Stage7Output | null
): { agreement: ConsistencyAgreement | null; conflict: ConsistencyConflict | null } {
  const physSev = stage7?.accidentSeverity;
  const dmgScore = stage6?.overallSeverityScore;

  if (!physSev || dmgScore === undefined || dmgScore === null) {
    return { agreement: null, conflict: null };
  }

  const physOrdinal = SEVERITY_ORDINAL[physSev];
  if (physOrdinal === undefined) return { agreement: null, conflict: null };

  const dmgBand = scoreToDamageBand(dmgScore);
  const dmgOrdinal = SEVERITY_ORDINAL[dmgBand];
  const gap = Math.abs(physOrdinal - dmgOrdinal);

  if (gap === 0) {
    return {
      agreement: {
        check_id: "c1_physics_damage_severity",
        label: "Physics ↔ Damage Severity",
        engines: ["physics", "damage"],
        strength: "STRONG",
        score: 100,
        detail: `Both engines agree on ${physSev} severity (damage score: ${dmgScore}/100).`,
      },
      conflict: null,
    };
  }

  if (gap === 1) {
    return {
      agreement: {
        check_id: "c1_physics_damage_severity",
        label: "Physics ↔ Damage Severity",
        engines: ["physics", "damage"],
        strength: "MODERATE",
        score: 65,
        detail: `Physics says ${physSev}, damage band is ${dmgBand} (score: ${dmgScore}/100) — one band apart, within acceptable tolerance.`,
      },
      conflict: null,
    };
  }

  if (gap === 2) {
    return {
      agreement: null,
      conflict: {
        check_id: "c1_physics_damage_severity",
        label: "Physics ↔ Damage Severity",
        engines: ["physics", "damage"],
        severity: "SIGNIFICANT",
        physics_says: `Severity: ${physSev}`,
        damage_says: `Severity band: ${dmgBand} (score=${dmgScore}/100)`,
        fraud_says: "Not directly applicable",
        recommended_action: "Review damage component list against physics impact energy calculation. One engine may have incomplete input data.",
      },
    };
  }

  // gap >= 3 → CRITICAL
  return {
    agreement: null,
    conflict: {
      check_id: "c1_physics_damage_severity",
      label: "Physics ↔ Damage Severity",
      engines: ["physics", "damage"],
      severity: "CRITICAL",
      physics_says: `Severity: ${physSev} (ordinal ${physOrdinal})`,
      damage_says: `Severity band: ${dmgBand} (score=${dmgScore}/100, ordinal ${dmgOrdinal})`,
      fraud_says: "Severity mismatch of this magnitude is a strong fraud indicator.",
      recommended_action: "Escalate for manual review. Physics and damage engines are in fundamental disagreement about incident severity.",
    },
  };
}

/**
 * C2: Physics impact direction vs Document claimed direction
 */
function checkC2PhysicsDocumentDirection(
  claimRecord: ClaimRecord | null,
  stage7: Stage7Output | null
): { agreement: ConsistencyAgreement | null; conflict: ConsistencyConflict | null } {
  const physDir = normaliseDirection((stage7 as any)?.impactVector?.direction);
  const docDir = normaliseDirection((claimRecord as any)?.accidentDetails?.collisionDirection);

  if (!physDir || !docDir) return { agreement: null, conflict: null };

  if (physDir === docDir) {
    return {
      agreement: {
        check_id: "c2_physics_document_direction",
        label: "Physics ↔ Document Direction",
        engines: ["physics", "claim_record"],
        strength: "STRONG",
        score: 100,
        detail: `Physics and claim document both indicate ${physDir} impact direction.`,
      },
      conflict: null,
    };
  }

  // Opposite directions are CRITICAL
  const opposites: Record<string, string> = {
    frontal: "rear",
    rear: "frontal",
    side_driver: "side_passenger",
    side_passenger: "side_driver",
  };

  const isOpposite = opposites[physDir] === docDir || opposites[docDir] === physDir;

  return {
    agreement: null,
    conflict: {
      check_id: "c2_physics_document_direction",
      label: "Physics ↔ Document Direction",
      engines: ["physics", "claim_record"],
      severity: isOpposite ? "CRITICAL" : "SIGNIFICANT",
      physics_says: `Impact direction: ${physDir}`,
      damage_says: `Not directly applicable`,
      fraud_says: `Document claims ${docDir} impact but physics indicates ${physDir}. This is a strong fraud indicator.`,
      recommended_action: isOpposite
        ? "CRITICAL: Physics and document directions are opposite. Escalate immediately for manual review."
        : "Investigate discrepancy between physics-determined direction and claimed direction.",
    },
  };
}

/**
 * C3: Damage zone vs Document claimed direction
 */
function checkC3DamageZoneDocumentDirection(
  claimRecord: ClaimRecord | null,
  stage6: Stage6Output | null
): { agreement: ConsistencyAgreement | null; conflict: ConsistencyConflict | null } {
  const docDir = normaliseDirection((claimRecord as any)?.accidentDetails?.collisionDirection);
  const zones: any[] = (stage6 as any)?.damageZones ?? [];

  if (!docDir || zones.length === 0) return { agreement: null, conflict: null };

  // Find the primary zone (highest severity or first)
  const primaryZone = zones.reduce((best: any, z: any) => {
    const sev = SEVERITY_ORDINAL[z.severity?.toLowerCase() ?? "none"] ?? 0;
    const bestSev = SEVERITY_ORDINAL[best?.severity?.toLowerCase() ?? "none"] ?? 0;
    return sev > bestSev ? z : best;
  }, zones[0]);

  const zoneName = primaryZone?.zone?.toLowerCase() ?? "";
  const matches = zoneMatchesDirection(zoneName, docDir);

  if (matches) {
    return {
      agreement: {
        check_id: "c3_damage_zone_document_direction",
        label: "Damage Zone ↔ Document Direction",
        engines: ["damage", "claim_record"],
        strength: "STRONG",
        score: 100,
        detail: `Primary damage zone (${zoneName}) is consistent with claimed ${docDir} impact direction.`,
      },
      conflict: null,
    };
  }

  // Check if zone is completely incompatible
  const compatible = ZONE_TO_DIRECTION[zoneName] ?? [];
  const isDirectConflict = compatible.length > 0 && !compatible.includes(docDir);

  if (isDirectConflict) {
    return {
      agreement: null,
      conflict: {
        check_id: "c3_damage_zone_document_direction",
        label: "Damage Zone ↔ Document Direction",
        engines: ["damage", "claim_record"],
        severity: "CRITICAL",
        physics_says: "Not directly applicable",
        damage_says: `Primary damage zone: ${zoneName} (consistent with: ${compatible.join(", ")})`,
        fraud_says: `Document claims ${docDir} impact but damage is in ${zoneName} zone. Zones are incompatible.`,
        recommended_action: "Damage zone and claimed direction are incompatible. Escalate for manual photo review.",
      },
    };
  }

  return { agreement: null, conflict: null };
}

/**
 * C4: Damage pattern match vs Physics severity
 */
function checkC4DamagePatternPhysics(
  stage7: Stage7Output | null
): { agreement: ConsistencyAgreement | null; conflict: ConsistencyConflict | null } {
  const pattern = (stage7 as any)?.damagePatternValidation;
  const physSev = stage7?.accidentSeverity;

  if (!pattern || !physSev) return { agreement: null, conflict: null };

  const match = pattern.pattern_match as string;
  const confidence = pattern.confidence as number;
  const physOrdinal = SEVERITY_ORDINAL[physSev] ?? 0;

  // STRONG/MODERATE pattern + moderate/severe physics → agreement
  if ((match === "STRONG" || match === "MODERATE") && physOrdinal >= 2) {
    return {
      agreement: {
        check_id: "c4_damage_pattern_physics",
        label: "Damage Pattern ↔ Physics Severity",
        engines: ["damage_pattern", "physics"],
        strength: match === "STRONG" ? "STRONG" : "MODERATE",
        score: match === "STRONG" ? 95 : 70,
        detail: `Damage pattern ${match} match (confidence: ${confidence}%) is consistent with ${physSev} physics severity.`,
      },
      conflict: null,
    };
  }

  // NONE pattern + low energy physics → acceptable (cosmetic/minor)
  if (match === "NONE" && physOrdinal <= 1) {
    return {
      agreement: {
        check_id: "c4_damage_pattern_physics",
        label: "Damage Pattern ↔ Physics Severity",
        engines: ["damage_pattern", "physics"],
        strength: "MODERATE",
        score: 60,
        detail: `Damage pattern NONE match is consistent with low-energy ${physSev} physics (no expected scenario components required at this severity).`,
      },
      conflict: null,
    };
  }

  // NONE/WEAK pattern + significant physics → conflict
  if (match === "NONE" && physOrdinal >= 3) {
    return {
      agreement: null,
      conflict: {
        check_id: "c4_damage_pattern_physics",
        label: "Damage Pattern ↔ Physics Severity",
        engines: ["damage_pattern", "physics"],
        severity: "CRITICAL",
        physics_says: `Severity: ${physSev} — significant energy transfer expected`,
        damage_says: `Pattern match: NONE (confidence: ${confidence}%) — no expected components found`,
        fraud_says: "NONE pattern with significant physics severity is a strong fraud indicator.",
        recommended_action: "Damage pattern does not match the scenario at all despite significant physics severity. Escalate for manual review.",
      },
    };
  }

  if (match === "WEAK" && physOrdinal >= 2) {
    return {
      agreement: null,
      conflict: {
        check_id: "c4_damage_pattern_physics",
        label: "Damage Pattern ↔ Physics Severity",
        engines: ["damage_pattern", "physics"],
        severity: "SIGNIFICANT",
        physics_says: `Severity: ${physSev}`,
        damage_says: `Pattern match: WEAK (confidence: ${confidence}%)`,
        fraud_says: "Weak damage pattern with moderate/severe physics warrants investigation.",
        recommended_action: "Review damage components against expected scenario profile. Missing components may indicate pre-existing damage or staged incident.",
      },
    };
  }

  return { agreement: null, conflict: null };
}

/**
 * C5: Image contradiction vs Fraud score
 */
function checkC5ImageContradictionFraud(
  stage7: Stage7Output | null,
  stage8: Pick<Stage8Output, "fraudRiskScore" | "fraudRiskLevel" | "indicators" | "damageConsistencyScore" | "scenarioFraudResult"> | null
): { agreement: ConsistencyAgreement | null; conflict: ConsistencyConflict | null } {
  const pattern = (stage7 as any)?.damagePatternValidation;
  const fraudScore = stage8?.fraudRiskScore ?? 0;

  if (!pattern) return { agreement: null, conflict: null };

  const hasContradiction = pattern.validation_detail?.image_contradiction === true;
  const contradictionReason = pattern.validation_detail?.image_contradiction_reason ?? "";

  if (!hasContradiction && fraudScore < 40) {
    return {
      agreement: {
        check_id: "c5_image_contradiction_fraud",
        label: "Image Analysis ↔ Fraud Score",
        engines: ["damage_pattern", "fraud"],
        strength: "STRONG",
        score: 90,
        detail: `No image contradictions detected and fraud score is low (${fraudScore}/100). Both engines indicate legitimate claim.`,
      },
      conflict: null,
    };
  }

  if (hasContradiction && fraudScore >= 40) {
    return {
      agreement: {
        check_id: "c5_image_contradiction_fraud",
        label: "Image Analysis ↔ Fraud Score",
        engines: ["damage_pattern", "fraud"],
        strength: "MODERATE",
        score: 60,
        detail: `Both engines flag concerns: image contradiction detected ("${contradictionReason}") and fraud score is elevated (${fraudScore}/100).`,
      },
      conflict: null,
    };
  }

  if (hasContradiction && fraudScore < 40) {
    return {
      agreement: null,
      conflict: {
        check_id: "c5_image_contradiction_fraud",
        label: "Image Analysis ↔ Fraud Score",
        engines: ["damage_pattern", "fraud"],
        severity: "SIGNIFICANT",
        physics_says: "Not directly applicable",
        damage_says: `Image contradiction detected: "${contradictionReason}"`,
        fraud_says: `Fraud score is low (${fraudScore}/100) — fraud engine did not flag the image contradiction`,
        recommended_action: "Image analysis flagged a contradiction that the fraud engine missed. Review fraud indicators to ensure image contradiction is captured.",
      },
    };
  }

  return { agreement: null, conflict: null };
}

/**
 * C6: Scenario fraud risk vs Physics execution
 */
function checkC6ScenarioFraudPhysics(
  stage7: Stage7Output | null,
  stage8: Pick<Stage8Output, "fraudRiskScore" | "fraudRiskLevel" | "indicators" | "damageConsistencyScore" | "scenarioFraudResult"> | null
): { agreement: ConsistencyAgreement | null; conflict: ConsistencyConflict | null } {
  const scenarioFraud = stage8?.scenarioFraudResult;
  const physicsExecuted = stage7?.physicsExecuted;
  const physSev = stage7?.accidentSeverity;

  if (!scenarioFraud) return { agreement: null, conflict: null };

  const riskLevel = scenarioFraud.risk_level as string;
  const fraudScore = scenarioFraud.fraud_score as number;
  const physOrdinal = SEVERITY_ORDINAL[physSev ?? "none"] ?? 0;

  // Non-physical incident + LOW fraud → MODERATE agreement
  if (!physicsExecuted && riskLevel === "LOW") {
    return {
      agreement: {
        check_id: "c6_scenario_fraud_physics",
        label: "Scenario Fraud ↔ Physics",
        engines: ["scenario_fraud", "physics"],
        strength: "MODERATE",
        score: 70,
        detail: `Non-physical incident (physics engine skipped) with LOW scenario fraud risk (${fraudScore}/100). Consistent.`,
      },
      conflict: null,
    };
  }

  // Moderate/severe physics + LOW fraud → STRONG agreement
  if (physicsExecuted && physOrdinal >= 2 && riskLevel === "LOW") {
    return {
      agreement: {
        check_id: "c6_scenario_fraud_physics",
        label: "Scenario Fraud ↔ Physics",
        engines: ["scenario_fraud", "physics"],
        strength: "STRONG",
        score: 90,
        detail: `Physics confirms ${physSev} severity and scenario fraud risk is LOW (${fraudScore}/100). Engines are aligned.`,
      },
      conflict: null,
    };
  }

  // Significant physics + HIGH fraud → conflict
  if (physicsExecuted && physOrdinal >= 3 && riskLevel === "HIGH") {
    return {
      agreement: null,
      conflict: {
        check_id: "c6_scenario_fraud_physics",
        label: "Scenario Fraud ↔ Physics",
        engines: ["scenario_fraud", "physics"],
        severity: "SIGNIFICANT",
        physics_says: `Severity: ${physSev} — significant energy transfer confirmed`,
        damage_says: "Not directly applicable",
        fraud_says: `Scenario fraud risk is HIGH (${fraudScore}/100) despite confirmed physics. Review scenario-specific flags.`,
        recommended_action: "Physics confirms the incident occurred but scenario fraud engine flags HIGH risk. Review scenario-specific fraud flags for false positives.",
      },
    };
  }

  return { agreement: null, conflict: null };
}

/**
 * C7: Fraud consistency score vs Physics consistency score
 */
function checkC7FraudPhysicsConsistency(
  stage7: Stage7Output | null,
  stage8: Pick<Stage8Output, "fraudRiskScore" | "fraudRiskLevel" | "indicators" | "damageConsistencyScore" | "scenarioFraudResult"> | null
): { agreement: ConsistencyAgreement | null; conflict: ConsistencyConflict | null } {
  const physConsistency = stage7?.damageConsistencyScore;
  const fraudConsistency = stage8?.damageConsistencyScore;

  if (physConsistency === undefined || physConsistency === null) return { agreement: null, conflict: null };
  if (fraudConsistency === undefined || fraudConsistency === null) return { agreement: null, conflict: null };

  // Normalise to 0-100
  const physScore = physConsistency <= 1 ? physConsistency * 100 : physConsistency;
  const fraudScore = fraudConsistency <= 1 ? fraudConsistency * 100 : fraudConsistency;
  const gap = Math.abs(physScore - fraudScore);

  if (gap <= 5) {
    return {
      agreement: {
        check_id: "c7_fraud_physics_consistency",
        label: "Fraud ↔ Physics Consistency Score",
        engines: ["fraud", "physics"],
        strength: "STRONG",
        score: 95,
        detail: `Physics consistency (${physScore.toFixed(0)}/100) and fraud consistency (${fraudScore.toFixed(0)}/100) are within 5 points.`,
      },
      conflict: null,
    };
  }

  if (gap <= 15) {
    return {
      agreement: {
        check_id: "c7_fraud_physics_consistency",
        label: "Fraud ↔ Physics Consistency Score",
        engines: ["fraud", "physics"],
        strength: "MODERATE",
        score: 70,
        detail: `Physics consistency (${physScore.toFixed(0)}/100) and fraud consistency (${fraudScore.toFixed(0)}/100) are within 15 points — acceptable variance.`,
      },
      conflict: null,
    };
  }

  if (gap <= 30) {
    return {
      agreement: null,
      conflict: {
        check_id: "c7_fraud_physics_consistency",
        label: "Fraud ↔ Physics Consistency Score",
        engines: ["fraud", "physics"],
        severity: "MINOR",
        physics_says: `Consistency score: ${physScore.toFixed(0)}/100`,
        damage_says: "Not directly applicable",
        fraud_says: `Consistency score: ${fraudScore.toFixed(0)}/100 — ${gap.toFixed(0)} point gap`,
        recommended_action: "Minor consistency score divergence between engines. Review input data quality for both engines.",
      },
    };
  }

  return {
    agreement: null,
    conflict: {
      check_id: "c7_fraud_physics_consistency",
      label: "Fraud ↔ Physics Consistency Score",
      engines: ["fraud", "physics"],
      severity: "SIGNIFICANT",
      physics_says: `Consistency score: ${physScore.toFixed(0)}/100`,
      damage_says: "Not directly applicable",
      fraud_says: `Consistency score: ${fraudScore.toFixed(0)}/100 — ${gap.toFixed(0)} point gap`,
      recommended_action: "Significant consistency score divergence. One engine may have received incomplete or conflicting input data.",
    },
  };
}

/**
 * C8: Structural damage detection vs Physics severity
 */
function checkC8StructuralDamagePhysics(
  stage7: Stage7Output | null
): { agreement: ConsistencyAgreement | null; conflict: ConsistencyConflict | null } {
  const pattern = (stage7 as any)?.damagePatternValidation;
  const physSev = stage7?.accidentSeverity;

  if (!pattern || !physSev) return { agreement: null, conflict: null };

  const structuralDetected = pattern.structural_damage_detected === true;
  if (!structuralDetected) return { agreement: null, conflict: null };

  const physOrdinal = SEVERITY_ORDINAL[physSev] ?? 0;

  if (physOrdinal >= 3) {
    return {
      agreement: {
        check_id: "c8_structural_damage_physics",
        label: "Structural Damage ↔ Physics Severity",
        engines: ["damage_pattern", "physics"],
        strength: "STRONG",
        score: 90,
        detail: `Structural damage detected and physics confirms ${physSev} severity — consistent with high-energy impact.`,
      },
      conflict: null,
    };
  }

  // Structural damage with low physics → CRITICAL conflict
  return {
    agreement: null,
    conflict: {
      check_id: "c8_structural_damage_physics",
      label: "Structural Damage ↔ Physics Severity",
      engines: ["damage_pattern", "physics"],
      severity: "CRITICAL",
      physics_says: `Severity: ${physSev} — low energy impact`,
      damage_says: "Structural components (frame/chassis/radiator support) detected as damaged",
      fraud_says: "Structural damage with low-energy physics is a strong fraud indicator — damage may be pre-existing.",
      recommended_action: "Structural damage detected but physics indicates low-energy impact. Inspect for pre-existing structural damage. Escalate.",
    },
  };
}

/**
 * C9: Fraud indicators vs Damage pattern
 */
function checkC9FraudIndicatorsDamagePattern(
  stage7: Stage7Output | null,
  stage8: Pick<Stage8Output, "fraudRiskScore" | "fraudRiskLevel" | "indicators" | "damageConsistencyScore" | "scenarioFraudResult"> | null
): { agreement: ConsistencyAgreement | null; conflict: ConsistencyConflict | null } {
  const pattern = (stage7 as any)?.damagePatternValidation;

  if (!pattern) {
    return { agreement: null, conflict: null };
  }

  const fraudIndicators: any[] = (stage8 as any)?.indicators ?? [];
  const match = pattern.pattern_match as string;

  const fraudFlagsDamageIssue = fraudIndicators.some((i: any) =>
    ["damage_pattern_none", "damage_pattern_weak", "damage_image_contradiction", "damage_direction_mismatch"].includes(i.indicator)
  );

  const patternHasIssue = match === "NONE" || match === "WEAK";

  if (patternHasIssue && fraudFlagsDamageIssue) {
    return {
      agreement: {
        check_id: "c9_fraud_indicators_damage_pattern",
        label: "Fraud Indicators ↔ Damage Pattern",
        engines: ["fraud", "damage_pattern"],
        strength: "MODERATE",
        score: 65,
        detail: `Both fraud engine and damage pattern engine flag ${match} pattern match — consistent identification of damage inconsistency.`,
      },
      conflict: null,
    };
  }

  if (patternHasIssue && !fraudFlagsDamageIssue) {
    return {
      agreement: null,
      conflict: {
        check_id: "c9_fraud_indicators_damage_pattern",
        label: "Fraud Indicators ↔ Damage Pattern",
        engines: ["fraud", "damage_pattern"],
        severity: "MINOR",
        physics_says: "Not directly applicable",
        damage_says: `Pattern match: ${match} — expected components missing or wrong location`,
        fraud_says: "Fraud engine did not flag damage pattern issue",
        recommended_action: "Damage pattern engine flagged an issue that fraud engine did not capture. Review fraud indicator list for damage_pattern flags.",
      },
    };
  }

  return { agreement: null, conflict: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// SCORE COMPUTATION
// ─────────────────────────────────────────────────────────────────────────────

const AGREEMENT_SCORE_CONTRIBUTION: Record<"STRONG" | "MODERATE", number> = {
  STRONG: 12,
  MODERATE: 6,
};

const CONFLICT_PENALTY: Record<"MINOR" | "SIGNIFICANT" | "CRITICAL", number> = {
  MINOR: 8,
  SIGNIFICANT: 18,
  CRITICAL: 30,
};

function computeScore(
  agreements: ConsistencyAgreement[],
  conflicts: ConsistencyConflict[],
  checksRun: number
): { score: number; rawScore: number; penalty: number } {
  const baseScore = 50;
  let bonus = 0;
  for (const a of agreements) {
    bonus += AGREEMENT_SCORE_CONTRIBUTION[a.strength];
  }

  let penalty = 0;
  for (const c of conflicts) {
    penalty += CONFLICT_PENALTY[c.severity];
  }

  const rawScore = Math.min(100, Math.max(0, baseScore + bonus));
  const score = Math.min(100, Math.max(0, rawScore - penalty));

  return { score, rawScore, penalty };
}

// ─────────────────────────────────────────────────────────────────────────────
// REASONING NARRATIVE
// ─────────────────────────────────────────────────────────────────────────────

function buildReasoning(
  result: Omit<CrossEngineConsistencyResult, "reasoning">,
  inputsAvailable: Record<string, boolean>
): string {
  const availableEngines = Object.entries(inputsAvailable)
    .filter(([, v]) => v)
    .map(([k]) => k)
    .join(", ");

  const parts: string[] = [];

  parts.push(
    `Cross-engine consistency validation completed with score ${result.consistency_score}/100 (${result.overall_status}). ` +
    `Available engines: ${availableEngines}.`
  );

  if (result.agreements.length > 0) {
    const strongAgreements = result.agreements.filter(a => a.strength === "STRONG");
    parts.push(
      `${result.agreements.length} agreement${result.agreements.length > 1 ? "s" : ""} found ` +
      `(${strongAgreements.length} STRONG, ${result.agreements.length - strongAgreements.length} MODERATE): ` +
      result.agreements.map(a => a.label).join("; ") + "."
    );
  }

  if (result.conflicts.length > 0) {
    const criticals = result.conflicts.filter(c => c.severity === "CRITICAL");
    parts.push(
      `${result.conflicts.length} conflict${result.conflicts.length > 1 ? "s" : ""} detected ` +
      `(${criticals.length} CRITICAL): ` +
      result.conflicts.map(c => `${c.label} [${c.severity}]`).join("; ") + "."
    );

    if (criticals.length > 0) {
      parts.push(
        `CRITICAL conflicts: ${criticals.map(c => c.recommended_action).join(" | ")}`
      );
    }
  }

  if (result.overall_status === "CONSISTENT") {
    parts.push("All available engines are in agreement. The claim is CONSISTENT across physics, damage, and fraud analysis.");
  } else {
    parts.push(
      `The claim is CONFLICTED. ` +
      (result.critical_conflict_count > 0
        ? `${result.critical_conflict_count} CRITICAL conflict${result.critical_conflict_count > 1 ? "s" : ""} require immediate manual review.`
        : "Multiple significant conflicts reduce confidence in the claim's legitimacy.")
    );
  }

  return parts.join(" ");
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN EXPORT
// ─────────────────────────────────────────────────────────────────────────────

export function validateCrossEngineConsistency(
  input: CrossEngineValidatorInput
): CrossEngineConsistencyResult {
  const { claimRecord, stage6, stage7, stage8 } = input;

  const inputsAvailable: Record<string, boolean> = {
    physics: !!(stage7?.physicsExecuted !== undefined),
    damage: !!stage6,
    damage_pattern: !!(stage7 as any)?.damagePatternValidation,
    fraud: !!stage8,
    scenario_fraud: !!(stage8 as any)?.scenarioFraudResult,
    claim_record: !!claimRecord,
  };

  // If no inputs at all, return minimal result
  if (!stage6 && !stage7 && !stage8 && !claimRecord) {
    return {
      consistency_score: 50,
      agreements: [],
      conflicts: [],
      overall_status: "CONFLICTED",
      critical_conflict_count: 0,
      reasoning: "No engine outputs available for cross-engine consistency validation.",
      validator_metadata: {
        checks_run: 9,
        agreements_found: 0,
        conflicts_found: 0,
        critical_conflicts: 0,
        score_before_conflict_penalty: 50,
        conflict_penalty_applied: 0,
        inputs_available: inputsAvailable,
      },
    };
  }

  // Run all 9 checks
  const checks = [
    checkC1PhysicsDamageSeverity(stage6, stage7),
    checkC2PhysicsDocumentDirection(claimRecord, stage7),
    checkC3DamageZoneDocumentDirection(claimRecord, stage6),
    checkC4DamagePatternPhysics(stage7),
    checkC5ImageContradictionFraud(stage7, stage8),
    checkC6ScenarioFraudPhysics(stage7, stage8),
    checkC7FraudPhysicsConsistency(stage7, stage8),
    checkC8StructuralDamagePhysics(stage7),
    checkC9FraudIndicatorsDamagePattern(stage7, stage8),
  ];

  const agreements: ConsistencyAgreement[] = [];
  const conflicts: ConsistencyConflict[] = [];

  for (const check of checks) {
    if (check.agreement) agreements.push(check.agreement);
    if (check.conflict) conflicts.push(check.conflict);
  }

  const { score, rawScore, penalty } = computeScore(agreements, conflicts, 9);

  const criticalCount = conflicts.filter(c => c.severity === "CRITICAL").length;

  // Apply hard floors for critical conflicts
  let finalScore = score;
  if (criticalCount >= 2) {
    finalScore = Math.min(finalScore, 25);
  } else if (criticalCount === 1) {
    finalScore = Math.min(finalScore, 45);
  }

  const overallStatus: "CONSISTENT" | "CONFLICTED" =
    criticalCount > 0 || finalScore < 55 ? "CONFLICTED" : "CONSISTENT";

  const partialResult = {
    consistency_score: finalScore,
    agreements,
    conflicts,
    overall_status: overallStatus,
    critical_conflict_count: criticalCount,
    validator_metadata: {
      checks_run: 9,
      agreements_found: agreements.length,
      conflicts_found: conflicts.length,
      critical_conflicts: criticalCount,
      score_before_conflict_penalty: rawScore,
      conflict_penalty_applied: penalty,
      inputs_available: inputsAvailable,
    },
  };

  const reasoning = buildReasoning(partialResult, inputsAvailable);

  return { ...partialResult, reasoning };
}
