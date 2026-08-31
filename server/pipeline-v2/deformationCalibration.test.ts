import { describe, expect, it } from "vitest";
import { calibrateDeformationMeasurement } from "./deformationCalibration";

const referenceDimensions = [
  { referenceId: "windshield-width", label: "Windshield width", independenceGroup: "windshield", isUndamaged: true, trueValue: 1400, measuredValue: 1272.7272727, unit: "mm" },
  { referenceId: "door-height", label: "Front door height", independenceGroup: "door", isUndamaged: true, trueValue: 1000, measuredValue: 909.0909091, unit: "mm" },
];

describe("per-claim deformation calibration", () => {
  it("applies the averaged correction only when two independent reference factors agree", () => {
    const result = calibrateDeformationMeasurement({
      rawMeasuredValue: 90,
      rawUnit: "mm",
      referenceDimensions,
      agreementToleranceFraction: 0.02,
    });

    expect(result.status).toBe("CALIBRATED");
    expect(result.correctionFactor).toBeCloseTo(1.1, 6);
    expect(result.correctedValue).toBeCloseTo(99, 6);
    expect(result).toMatchObject({
      rawMeasuredValue: 90,
      rawUnit: "mm",
      confidenceDisposition: "CALIBRATION_APPLIED",
      referenceFactors: [
        expect.objectContaining({ referenceId: "windshield-width", correctionFactor: expect.any(Number) }),
        expect.objectContaining({ referenceId: "door-height", correctionFactor: expect.any(Number) }),
      ],
    });
  });

  it("requires human review and never averages disagreeing reference factors", () => {
    const result = calibrateDeformationMeasurement({
      rawMeasuredValue: 90,
      rawUnit: "mm",
      agreementToleranceFraction: 0.02,
      referenceDimensions: [
        referenceDimensions[0],
        { ...referenceDimensions[1], measuredValue: 700 },
      ],
    });

    expect(result).toMatchObject({
      status: "HUMAN_REVIEW_REQUIRED",
      correctedValue: null,
      correctionFactor: null,
      confidenceDisposition: "REDUCE_AND_REQUIRE_HUMAN_REVIEW",
    });
    expect(result.reasons[0]).toContain("single scalar correction is not valid");
  });

  it("does not calibrate from fewer than two independent undamaged reference dimensions", () => {
    const result = calibrateDeformationMeasurement({
      rawMeasuredValue: 90,
      rawUnit: "mm",
      agreementToleranceFraction: 0.02,
      referenceDimensions: [
        referenceDimensions[0],
        { ...referenceDimensions[1], independenceGroup: "windshield" },
      ],
    });

    expect(result).toMatchObject({
      status: "INSUFFICIENT_REFERENCE_DIMENSIONS",
      correctedValue: null,
      correctionFactor: null,
      confidenceDisposition: "REDUCE_AND_REQUIRE_HUMAN_REVIEW",
    });
  });

  it("requires an explicit positive tolerance rather than choosing a hidden default", () => {
    const result = calibrateDeformationMeasurement({
      rawMeasuredValue: 90,
      rawUnit: "mm",
      agreementToleranceFraction: 0,
      referenceDimensions,
    });

    expect(result).toMatchObject({
      status: "INVALID_INPUT",
      correctedValue: null,
      confidenceDisposition: "REDUCE_AND_REQUIRE_HUMAN_REVIEW",
    });
  });
});
