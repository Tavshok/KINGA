/**
 * KINGA repair-versus-replace recommendation policy.
 *
 * This reducer is recommendation-only. It never authorises settlement, payment,
 * disposal, or policy action. Those decisions remain separately controlled.
 */
export const KINGA_ECONOMIC_WRITE_OFF_THRESHOLD = 0.7;

export type KingaWriteOffRecommendationKind =
  | "economic_write_off_recommended"
  | "technical_write_off_recommended"
  | "economic_and_technical_write_off_recommended"
  | "human_review_required"
  | "repair_recommended";

export type KingaWriteOffRecommendation = {
  kind: KingaWriteOffRecommendationKind;
  label: string;
  detail: string;
  writeOffRecommended: boolean;
  repairToValueRatio: number | null;
  economicEvidenceComplete: boolean;
  technicalEvidenceComplete: boolean;
};

export type KingaWriteOffInput = {
  /** Complete supported KINGA Optimised Quote in whole currency units. */
  completeL2CostUsd?: number | null;
  /** Verified vehicle market value in whole currency units. */
  verifiedMarketValueUsd?: number | null;
  /** Dedicated KINGA structural-damage analysis output (Stage 6). */
  structuralDamageDetected?: boolean | null;
  /** KINGA physics analysis must have run to support a technical recommendation. */
  physicsExecuted?: boolean | null;
  /** KINGA physics accident severity (Stage 7). */
  physicsSeverity?: string | null;
};

function isPositiveFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isSeverePhysicsSeverity(value: string | null | undefined): boolean {
  return value === "severe" || value === "catastrophic";
}

/**
 * Produces a transparent recommendation using only KINGA's explicit analysis
 * outputs. Economic recommendation requires final L2 plus verified market value.
 * Technical recommendation requires both dedicated structural detection and
 * executed severe/catastrophic physics evidence. Missing or incomplete evidence
 * is a review state, never an invented cost or automatic settlement outcome.
 */
export function resolveKingaWriteOffRecommendation(input: KingaWriteOffInput): KingaWriteOffRecommendation {
  const economicEvidenceComplete = isPositiveFinite(input.completeL2CostUsd) && isPositiveFinite(input.verifiedMarketValueUsd);
  const repairToValueRatio = economicEvidenceComplete
    ? input.completeL2CostUsd / input.verifiedMarketValueUsd
    : null;
  const economicWriteOff = repairToValueRatio !== null && repairToValueRatio >= KINGA_ECONOMIC_WRITE_OFF_THRESHOLD;

  const structuralConfirmed = input.structuralDamageDetected === true;
  const physicsSeveritySupportsWriteOff = input.physicsExecuted === true && isSeverePhysicsSeverity(input.physicsSeverity);
  const technicalEvidenceComplete = structuralConfirmed && input.physicsExecuted === true;
  const technicalWriteOff = structuralConfirmed && physicsSeveritySupportsWriteOff;

  if (economicWriteOff && technicalWriteOff) {
    return {
      kind: "economic_and_technical_write_off_recommended",
      label: "Economic and technical write-off recommended",
      detail: `KINGA’s complete repair-to-value assessment is ${(repairToValueRatio * 100).toFixed(1)}%, meeting the ${Math.round(KINGA_ECONOMIC_WRITE_OFF_THRESHOLD * 100)}% economic threshold; dedicated structural analysis and ${input.physicsSeverity} physics evidence also support technical write-off.`,
      writeOffRecommended: true,
      repairToValueRatio,
      economicEvidenceComplete,
      technicalEvidenceComplete,
    };
  }

  if (economicWriteOff) {
    return {
      kind: "economic_write_off_recommended",
      label: "Economic write-off recommended",
      detail: `KINGA’s complete repair-to-value assessment is ${(repairToValueRatio * 100).toFixed(1)}%, meeting the ${Math.round(KINGA_ECONOMIC_WRITE_OFF_THRESHOLD * 100)}% economic threshold.`,
      writeOffRecommended: true,
      repairToValueRatio,
      economicEvidenceComplete,
      technicalEvidenceComplete,
    };
  }

  if (technicalWriteOff) {
    return {
      kind: "technical_write_off_recommended",
      label: "Technical write-off recommended",
      detail: `KINGA’s dedicated structural analysis confirmed structural damage and its executed physics analysis assessed the collision as ${input.physicsSeverity}.`,
      writeOffRecommended: true,
      repairToValueRatio,
      economicEvidenceComplete,
      technicalEvidenceComplete,
    };
  }

  if (!economicEvidenceComplete || structuralConfirmed || input.physicsExecuted !== true) {
    const reasons = [
      !economicEvidenceComplete ? "complete KINGA Optimised Quote and/or verified market value is unavailable" : null,
      structuralConfirmed && !physicsSeveritySupportsWriteOff ? "structural damage requires the completed KINGA physics threshold assessment" : null,
      input.physicsExecuted !== true ? "KINGA physics analysis has not completed" : null,
    ].filter((value): value is string => Boolean(value));
    return {
      kind: "human_review_required",
      label: "Repairability review required",
      detail: `KINGA cannot make a final write-off recommendation because ${reasons.join("; ")}.`,
      writeOffRecommended: false,
      repairToValueRatio,
      economicEvidenceComplete,
      technicalEvidenceComplete,
    };
  }

  return {
    kind: "repair_recommended",
    label: "Repair recommended",
    detail: `KINGA’s complete repair-to-value assessment is ${(repairToValueRatio! * 100).toFixed(1)}%, below the ${Math.round(KINGA_ECONOMIC_WRITE_OFF_THRESHOLD * 100)}% economic threshold, with no combined technical write-off evidence.`,
    writeOffRecommended: false,
    repairToValueRatio,
    economicEvidenceComplete,
    technicalEvidenceComplete,
  };
}
