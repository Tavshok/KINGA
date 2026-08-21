/**
 * KINGA repair-versus-replace recommendation policy.
 *
 * This reducer is decision support only. It never authorises settlement,
 * payment, disposal, or policy action; those decisions remain human-controlled.
 */
import {
  WRITE_OFF_RECOMMENDATION_THRESHOLD,
  WRITE_OFF_WARNING_THRESHOLD,
  classifyRepairToValueRatio,
} from "./writeOffPolicy";

/** @deprecated Use WRITE_OFF_RECOMMENDATION_THRESHOLD. */
export const KINGA_ECONOMIC_WRITE_OFF_THRESHOLD = WRITE_OFF_RECOMMENDATION_THRESHOLD;

export type KingaWriteOffRecommendationKind =
  | "economic_write_off_recommended"
  | "technical_write_off_recommended"
  | "economic_and_technical_write_off_recommended"
  | "economic_write_off_warning"
  | "human_review_required"
  | "repair_recommended";

export type KingaWriteOffRecommendation = {
  kind: KingaWriteOffRecommendationKind;
  label: string;
  detail: string;
  writeOffRecommended: boolean;
  writeOffWarning: boolean;
  repairToValueRatio: number | null;
  economicEvidenceComplete: boolean;
  technicalEvidenceComplete: boolean;
};

export type KingaWriteOffInput = {
  completeL2CostUsd?: number | null;
  verifiedMarketValueUsd?: number | null;
  structuralDamageDetected?: boolean | null;
  physicsExecuted?: boolean | null;
  physicsSeverity?: string | null;
};

function isPositiveFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isSeverePhysicsSeverity(value: string | null | undefined): boolean {
  return value === "severe" || value === "catastrophic";
}

/**
 * Produces a transparent repair-versus-replace outcome from explicit KINGA
 * evidence. A 65% ratio produces a warning only; a 70% ratio produces a
 * human-overridable recommendation only.
 */
export function resolveKingaWriteOffRecommendation(input: KingaWriteOffInput): KingaWriteOffRecommendation {
  const economicEvidenceComplete = isPositiveFinite(input.completeL2CostUsd) && isPositiveFinite(input.verifiedMarketValueUsd);
  const repairToValueRatio = economicEvidenceComplete
    ? input.completeL2CostUsd / input.verifiedMarketValueUsd
    : null;
  const repairToValueBand = classifyRepairToValueRatio(repairToValueRatio);
  const economicRecommendation = repairToValueBand === "RECOMMENDATION";
  const economicWarning = repairToValueBand === "WARNING";
  const structuralConfirmed = input.structuralDamageDetected === true;
  const physicsSeveritySupportsWriteOff = input.physicsExecuted === true && isSeverePhysicsSeverity(input.physicsSeverity);
  const technicalEvidenceComplete = structuralConfirmed && input.physicsExecuted === true;
  const technicalWriteOff = structuralConfirmed && physicsSeveritySupportsWriteOff;

  if (economicRecommendation && technicalWriteOff) {
    return {
      kind: "economic_and_technical_write_off_recommended",
      label: "Economic and technical write-off recommended",
      detail: `KINGA’s complete repair-to-value assessment is ${(repairToValueRatio * 100).toFixed(1)}%, meeting the ${Math.round(WRITE_OFF_RECOMMENDATION_THRESHOLD * 100)}% economic recommendation threshold; dedicated structural analysis and ${input.physicsSeverity} physics evidence also support technical write-off. Human assessor or insurer review remains required.`,
      writeOffRecommended: true,
      writeOffWarning: false,
      repairToValueRatio,
      economicEvidenceComplete,
      technicalEvidenceComplete,
    };
  }
  if (economicRecommendation) {
    return {
      kind: "economic_write_off_recommended",
      label: "Economic write-off recommended",
      detail: `KINGA’s complete repair-to-value assessment is ${(repairToValueRatio * 100).toFixed(1)}%, meeting the ${Math.round(WRITE_OFF_RECOMMENDATION_THRESHOLD * 100)}% economic recommendation threshold. Human assessor or insurer review remains required.`,
      writeOffRecommended: true,
      writeOffWarning: false,
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
      writeOffWarning: false,
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
      writeOffWarning: false,
      repairToValueRatio,
      economicEvidenceComplete,
      technicalEvidenceComplete,
    };
  }
  if (economicWarning) {
    return {
      kind: "economic_write_off_warning",
      label: "Approaching write-off territory — review required",
      detail: `KINGA’s complete repair-to-value assessment is ${(repairToValueRatio * 100).toFixed(1)}%, reaching the ${Math.round(WRITE_OFF_WARNING_THRESHOLD * 100)}% early-warning threshold but remaining below the ${Math.round(WRITE_OFF_RECOMMENDATION_THRESHOLD * 100)}% write-off recommendation threshold. Surface this to the assessor or reviewer; no write-off recommendation is made.`,
      writeOffRecommended: false,
      writeOffWarning: true,
      repairToValueRatio,
      economicEvidenceComplete,
      technicalEvidenceComplete,
    };
  }
  return {
    kind: "repair_recommended",
    label: "Repair recommended",
    detail: `KINGA’s complete repair-to-value assessment is ${(repairToValueRatio! * 100).toFixed(1)}%, below the ${Math.round(WRITE_OFF_WARNING_THRESHOLD * 100)}% early-warning threshold, with no combined technical write-off evidence.`,
    writeOffRecommended: false,
    writeOffWarning: false,
    repairToValueRatio,
    economicEvidenceComplete,
    technicalEvidenceComplete,
  };
}
