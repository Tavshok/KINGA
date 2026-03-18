/**
 * KINGA Weighted Fraud Scoring Engine
 *
 * Deterministic, rule-based fraud score computation.
 * Base = 0, cap = 100.
 *
 * Rules:
 *   Damage inconsistency  (<50% consistency)  → +20
 *   Cost deviation        (>15% over AI est.) → +15
 *   Direction mismatch    (impact ≠ damage)   → +15
 *   Repeat claim          (prior claim exists)→ +20
 *   Missing data          (key fields absent) → +10
 */

export interface FraudContribution {
  factor: string;
  value: number;
  triggered: boolean;
  detail: string;
}

export interface WeightedFraudResult {
  score: number;
  level: "minimal" | "low" | "moderate" | "high" | "elevated";
  contributions: Array<{ factor: string; value: number }>;
  full_contributions: FraudContribution[];
  explanation: string;
}

export interface FraudScoringInput {
  /** Damage consistency score 0–100 (from physics engine) */
  consistencyScore: number;
  /** AI estimated cost in dollars */
  aiEstimatedCost: number;
  /** Quoted/claimed amount in dollars (0 if no quote) */
  quotedAmount: number;
  /** Impact direction from physics engine (e.g. "rear", "front", "side") */
  impactDirection: string;
  /** Primary damage zone(s) detected (e.g. ["front", "side"]) */
  damageZones: string[];
  /** Whether the claimant has prior claims on record */
  hasPreviousClaims: boolean;
  /** Number of missing critical data fields (0–5) */
  missingDataCount: number;
  /** Structural damage severity from AI pipeline */
  damageSeverity?: string;
  /** Delta-V from physics engine (0 = not calculated) */
  deltaVKmh?: number;
  /** AI confidence score (0–100) */
  aiConfidence?: number;
  /** Optional: AI-extracted fraud indicators for context */
  aiIndicators?: Array<{ label: string; points: number }>;
}

// ─── Level mapping (strict 5-band) ───────────────────────────────────────────
function scoreToLevel(score: number): WeightedFraudResult["level"] {
  if (score <= 20) return "minimal";
  if (score <= 40) return "low";
  if (score <= 60) return "moderate";
  if (score <= 80) return "high";
  return "elevated";
}

// ─── Direction vs damage zone alignment ──────────────────────────────────────
function directionMatchesDamage(direction: string, zones: string[]): boolean {
  if (!direction || direction === "unknown" || zones.length === 0) return true;
  const dir = direction.toLowerCase();
  const zoneArr = zones.map((z) => z.toLowerCase());

  if (zoneArr.includes(dir)) return true;

  const equivalences: Record<string, string[]> = {
    front: ["front", "frontal", "hood", "bumper", "grill", "nudge"],
    rear: ["rear", "back", "boot", "trunk", "tailgate"],
    side: ["side", "door", "pillar", "quarter", "left", "right"],
    left: ["left", "side", "driver"],
    right: ["right", "side", "passenger"],
    rollover: ["roof", "top", "rollover"],
  };

  const aliases = equivalences[dir] ?? [dir];
  return aliases.some((alias) =>
    zoneArr.some((zone) => zone.includes(alias) || alias.includes(zone))
  );
}

// ─── Main scoring function ────────────────────────────────────────────────────
export function computeWeightedFraudScore(
  input: FraudScoringInput
): WeightedFraudResult {
  const contributions: FraudContribution[] = [];
  let base = 0;

  // Factor 1: Damage inconsistency (<50%) → +20
  const consistencyTriggered = input.consistencyScore < 50;
  const consistencyValue = consistencyTriggered ? 20 : 0;
  contributions.push({
    factor: "Damage Inconsistency",
    value: consistencyValue,
    triggered: consistencyTriggered,
    detail: consistencyTriggered
      ? `Damage consistency score is ${input.consistencyScore}% (below 50% threshold). Pattern does not fully align with the reported impact.`
      : `Damage consistency score is ${input.consistencyScore}% — within acceptable range.`,
  });
  base += consistencyValue;

  // Factor 2: Cost deviation >15% → +15
  let deviation = 0;
  if (input.aiEstimatedCost > 0 && input.quotedAmount > 0) {
    deviation = ((input.quotedAmount - input.aiEstimatedCost) / input.aiEstimatedCost) * 100;
  }
  const costTriggered = Math.abs(deviation) > 15;
  const costValue = costTriggered ? 15 : 0;
  contributions.push({
    factor: "Cost Deviation",
    value: costValue,
    triggered: costTriggered,
    detail: costTriggered
      ? `Quoted amount deviates ${deviation > 0 ? "+" : ""}${deviation.toFixed(1)}% from AI estimate (threshold: ±15%).`
      : input.quotedAmount > 0
      ? `Cost deviation is ${deviation.toFixed(1)}% — within the ±15% acceptable range.`
      : "No quote submitted — cost deviation not applicable.",
  });
  base += costValue;

  // Factor 3: Direction mismatch → +15
  const directionMatch = directionMatchesDamage(input.impactDirection, input.damageZones);
  const directionTriggered = !directionMatch;
  const directionValue = directionTriggered ? 15 : 0;
  contributions.push({
    factor: "Direction Mismatch",
    value: directionValue,
    triggered: directionTriggered,
    detail: directionTriggered
      ? `Reported impact direction (${input.impactDirection}) does not align with detected damage zones (${input.damageZones.join(", ") || "none"}). Possible: secondary impact, misreported accident, or pre-existing damage.`
      : `Impact direction (${input.impactDirection}) is consistent with detected damage zones.`,
  });
  base += directionValue;

  // Factor 4: Repeat claim → +20
  const repeatValue = input.hasPreviousClaims ? 20 : 0;
  contributions.push({
    factor: "Repeat Claim",
    value: repeatValue,
    triggered: input.hasPreviousClaims,
    detail: input.hasPreviousClaims
      ? "Claimant has one or more prior claims on record. Elevated scrutiny warranted."
      : "No prior claims found for this claimant.",
  });
  base += repeatValue;

  // Factor 5: Missing data → +10
  const missingTriggered = input.missingDataCount > 0;
  const missingValue = missingTriggered ? 10 : 0;
  contributions.push({
    factor: "Missing Data",
    value: missingValue,
    triggered: missingTriggered,
    detail: missingTriggered
      ? `${input.missingDataCount} critical data field${input.missingDataCount > 1 ? "s are" : " is"} absent. Incomplete data reduces assessment confidence.`
      : "All critical data fields are present.",
  });
  base += missingValue;

  // Factor 6: Severity vs Physics Mismatch (+15)
  // Triggered when: severe/catastrophic damage + zero physics data + low AI confidence
  const isSevere = ["severe", "catastrophic", "total_loss"].includes(input.damageSeverity ?? "");
  const zeroPhysics = (input.deltaVKmh === 0 || input.deltaVKmh === undefined) && input.missingDataCount >= 3;
  const lowConfidence = (input.aiConfidence ?? 100) < 60;
  const severityPhysicsTriggered = isSevere && zeroPhysics && lowConfidence;
  const severityPhysicsValue = severityPhysicsTriggered ? 15 : 0;
  contributions.push({
    factor: "Severity vs Physics Mismatch",
    value: severityPhysicsValue,
    triggered: severityPhysicsTriggered,
    detail: severityPhysicsTriggered
      ? `${input.damageSeverity} damage reported but physics data is absent and AI confidence is ${input.aiConfidence ?? "unknown"}%. Manual inspection required.`
      : "Damage severity is consistent with available physics data.",
  });
  base += severityPhysicsValue;

  // Cap at 100
  const score = Math.min(100, base);
  const level = scoreToLevel(score);

  // Contributions array: only triggered factors (as required by spec)
  const triggeredContributions = contributions
    .filter((c) => c.triggered)
    .map((c) => ({ factor: c.factor, value: c.value }));

  // Explanation narrative
  const triggeredFactors = contributions.filter((c) => c.triggered);
  let explanation: string;
  if (triggeredFactors.length === 0) {
    explanation =
      "No fraud indicators detected. The claim is consistent with the reported incident, cost estimates are within range, and all data fields are present.";
  } else {
    const names = triggeredFactors.map((f) => f.factor.toLowerCase()).join(", ");
    explanation = `Fraud score ${score}/100 (${level}) driven by: ${names}. ${
      score >= 81
        ? "Escalation to a senior assessor is required before proceeding."
        : score >= 61
        ? "Escalation to a senior assessor is recommended before proceeding."
        : score >= 41
        ? "Additional verification is advised before approving this claim."
        : "Standard review process applies."
    }`;
  }

  return {
    score,
    level,
    contributions: triggeredContributions,
    full_contributions: contributions,
    explanation,
  };
}

// ─── Helper: count missing critical fields ────────────────────────────────────
export function countMissingFields(params: {
  estimatedSpeedKmh: number;
  impactForceKn: number;
  energyKj: number;
  vehicleMake: string;
  impactDirection: string;
  damageComponents: string[];
}): number {
  let missing = 0;
  if (!params.estimatedSpeedKmh || params.estimatedSpeedKmh === 0) missing++;
  if (!params.impactForceKn || params.impactForceKn === 0) missing++;
  if (!params.energyKj || params.energyKj === 0) missing++;
  if (!params.vehicleMake || params.vehicleMake.trim() === "") missing++;
  if (!params.impactDirection || params.impactDirection === "unknown") missing++;
  return missing;
}
