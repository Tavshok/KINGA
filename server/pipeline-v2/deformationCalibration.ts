/**
 * Per-claim reference-dimension deformation calibration.
 *
 * This module is deliberately pure and unconnected to the live pipeline. It
 * preserves the raw measurement and returns an auditable proposed correction
 * only when two or more independent, undamaged reference dimensions agree.
 * Persistence, confidence-policy values, manufacturer-spec lookup, and pipeline
 * wiring are intentionally outside this first-pass module.
 */

export interface ReferenceDimensionMeasurement {
  /** Stable identifier for audit and later persistence. */
  referenceId: string;
  /** Human-readable dimension, such as "windshield width". */
  label: string;
  /** Distinct groups demonstrate independent reference dimensions. */
  independenceGroup: string;
  /** The dimension must be outside the measured damage area. */
  isUndamaged: boolean;
  /** Manufacturer- or engineer-verified real-world dimension. */
  trueValue: number;
  /** Value produced by the same photogrammetric method as the raw deformation. */
  measuredValue: number;
  unit: string;
}

export interface DeformationCalibrationInput {
  rawMeasuredValue: number;
  rawUnit: string;
  referenceDimensions: ReferenceDimensionMeasurement[];
  /**
   * Maximum allowed reference-factor spread relative to the mean factor.
   * This is required: the product calibration tolerance is not yet approved
   * and this module must never silently choose one.
   */
  agreementToleranceFraction: number;
}

export interface AppliedReferenceFactor {
  referenceId: string;
  label: string;
  independenceGroup: string;
  unit: string;
  trueValue: number;
  measuredValue: number;
  correctionFactor: number;
}

export type DeformationCalibrationStatus =
  | "CALIBRATED"
  | "HUMAN_REVIEW_REQUIRED"
  | "INSUFFICIENT_REFERENCE_DIMENSIONS"
  | "INVALID_INPUT";

export interface DeformationCalibrationResult {
  status: DeformationCalibrationStatus;
  rawMeasuredValue: number;
  rawUnit: string;
  correctedValue: number | null;
  correctionFactor: number | null;
  agreementToleranceFraction: number | null;
  observedFactorSpreadFraction: number | null;
  confidenceDisposition: "CALIBRATION_APPLIED" | "REDUCE_AND_REQUIRE_HUMAN_REVIEW";
  referenceFactors: AppliedReferenceFactor[];
  reasons: string[];
}

function invalidResult(input: DeformationCalibrationInput, reason: string): DeformationCalibrationResult {
  return {
    status: "INVALID_INPUT",
    rawMeasuredValue: input.rawMeasuredValue,
    rawUnit: input.rawUnit,
    correctedValue: null,
    correctionFactor: null,
    agreementToleranceFraction: null,
    observedFactorSpreadFraction: null,
    confidenceDisposition: "REDUCE_AND_REQUIRE_HUMAN_REVIEW",
    referenceFactors: [],
    reasons: [reason],
  };
}

/**
 * Compute a proposed calibration from independently measured, undamaged vehicle
 * dimensions. A failed agreement check never averages factors or substitutes an
 * uncorrected value; callers must route the result to human review.
 */
export function calibrateDeformationMeasurement(
  input: DeformationCalibrationInput,
): DeformationCalibrationResult {
  if (!Number.isFinite(input.rawMeasuredValue) || input.rawMeasuredValue <= 0) {
    return invalidResult(input, "Raw deformation measurement must be a positive finite number.");
  }
  if (!input.rawUnit.trim()) {
    return invalidResult(input, "Raw deformation measurement unit is required.");
  }
  if (!Number.isFinite(input.agreementToleranceFraction) || input.agreementToleranceFraction <= 0) {
    return invalidResult(input, "An explicit positive agreement tolerance fraction is required.");
  }

  const eligible = input.referenceDimensions.filter((reference) =>
    reference.isUndamaged &&
    reference.referenceId.trim() &&
    reference.label.trim() &&
    reference.independenceGroup.trim() &&
    reference.unit.trim() &&
    Number.isFinite(reference.trueValue) && reference.trueValue > 0 &&
    Number.isFinite(reference.measuredValue) && reference.measuredValue > 0,
  );
  const independentGroups = new Set(eligible.map((reference) => reference.independenceGroup));

  const factors = eligible.map((reference) => ({
    referenceId: reference.referenceId,
    label: reference.label,
    independenceGroup: reference.independenceGroup,
    unit: reference.unit,
    trueValue: reference.trueValue,
    measuredValue: reference.measuredValue,
    correctionFactor: reference.trueValue / reference.measuredValue,
  }));

  if (factors.length < 2 || independentGroups.size < 2) {
    return {
      status: "INSUFFICIENT_REFERENCE_DIMENSIONS",
      rawMeasuredValue: input.rawMeasuredValue,
      rawUnit: input.rawUnit,
      correctedValue: null,
      correctionFactor: null,
      agreementToleranceFraction: input.agreementToleranceFraction,
      observedFactorSpreadFraction: null,
      confidenceDisposition: "REDUCE_AND_REQUIRE_HUMAN_REVIEW",
      referenceFactors: factors,
      reasons: ["At least two valid, independent, undamaged reference dimensions are required before calibration."],
    };
  }

  const meanFactor = factors.reduce((sum, factor) => sum + factor.correctionFactor, 0) / factors.length;
  const minimumFactor = Math.min(...factors.map((factor) => factor.correctionFactor));
  const maximumFactor = Math.max(...factors.map((factor) => factor.correctionFactor));
  const observedFactorSpreadFraction = (maximumFactor - minimumFactor) / meanFactor;

  if (observedFactorSpreadFraction > input.agreementToleranceFraction) {
    return {
      status: "HUMAN_REVIEW_REQUIRED",
      rawMeasuredValue: input.rawMeasuredValue,
      rawUnit: input.rawUnit,
      correctedValue: null,
      correctionFactor: null,
      agreementToleranceFraction: input.agreementToleranceFraction,
      observedFactorSpreadFraction,
      confidenceDisposition: "REDUCE_AND_REQUIRE_HUMAN_REVIEW",
      referenceFactors: factors,
      reasons: ["Independent reference dimensions imply materially different correction factors; a single scalar correction is not valid for this photo set."],
    };
  }

  return {
    status: "CALIBRATED",
    rawMeasuredValue: input.rawMeasuredValue,
    rawUnit: input.rawUnit,
    correctedValue: input.rawMeasuredValue * meanFactor,
    correctionFactor: meanFactor,
    agreementToleranceFraction: input.agreementToleranceFraction,
    observedFactorSpreadFraction,
    confidenceDisposition: "CALIBRATION_APPLIED",
    referenceFactors: factors,
    reasons: ["Independent reference factors agree within the supplied tolerance."],
  };
}
