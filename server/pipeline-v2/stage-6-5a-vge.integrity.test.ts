import { describe, expect, it } from "vitest";

import {
  bindKnownVehicleReferenceCalibration,
  collapseStoredProfileMeasurements,
  selectUnambiguousVehicleProfile,
} from "./stage-6-5a-vge";

describe("Stage 6.5A known-dimension VGE integrity", () => {
  const profileMeasurements = {
    wheel_diameter_mm: 700,
    headlamp_spacing_mm: 1400,
    overall_width_mm: 1800,
  };

  it("binds scale authority exclusively to stored vehicle measurements", () => {
    const result = bindKnownVehicleReferenceCalibration({
      rawCrushDepthPx: 50,
      profileMeasurements,
      agreementToleranceFraction: 0.15,
      candidates: [
        {
          type: "wheel",
          pixelMeasurementPx: 350,
          isUndamaged: true,
          // This extraneous field models a hostile/incorrect LLM output. It is
          // intentionally not part of LlmReferenceCandidate and must be ignored.
          physicalMeasurementMm: 70_000,
        } as unknown as {
          type: string;
          pixelMeasurementPx: number;
          isUndamaged: boolean;
        },
        {
          type: "headlamp_spacing",
          pixelMeasurementPx: 700,
          isUndamaged: true,
        },
      ],
    });

    expect(result.calibration.status).toBe("CALIBRATED");
    expect(result.calibration.correctedValue).toBeCloseTo(100, 8);
    expect(result.detections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "wheel",
          vehicleMeasurementType: "wheel_diameter_mm",
          physicalMeasurementMm: 700,
          physicalMeasurementSource: "VEHICLE_PROFILE",
        }),
        expect.objectContaining({
          type: "headlamp_spacing",
          vehicleMeasurementType: "headlamp_spacing_mm",
          physicalMeasurementMm: 1400,
        }),
      ])
    );
  });

  it("marks duplicate stored measurement rows unusable rather than overwriting one", () => {
    const measurements = collapseStoredProfileMeasurements([
      { measurement_type: "wheel_diameter_mm", value_mm: "700" },
      { measurement_type: "wheel_diameter_mm", value_mm: "760" },
      { measurement_type: "headlamp_spacing_mm", value_mm: "1400" },
    ]);

    expect(Number.isNaN(measurements.wheel_diameter_mm)).toBe(true);
    expect(measurements.headlamp_spacing_mm).toBe(1400);

    const result = bindKnownVehicleReferenceCalibration({
      rawCrushDepthPx: 50,
      profileMeasurements: measurements,
      agreementToleranceFraction: 0.15,
      candidates: [
        { type: "wheel", pixelMeasurementPx: 350, isUndamaged: true },
        {
          type: "headlamp_spacing",
          pixelMeasurementPx: 700,
          isUndamaged: true,
        },
      ],
    });

    expect(result.detections).toHaveLength(1);
    expect(result.calibration.status).toBe("INSUFFICIENT_REFERENCE_DIMENSIONS");
  });

  it("rejects a duplicate primary measurement even when an alternate is present", () => {
    const measurements = collapseStoredProfileMeasurements([
      { measurement_type: "wheel_diameter_mm", value_mm: "700" },
      { measurement_type: "wheel_diameter_mm", value_mm: "705" },
      { measurement_type: "wheel_diameter_alt_mm", value_mm: "760" },
      { measurement_type: "headlamp_spacing_mm", value_mm: "1400" },
    ]);
    const result = bindKnownVehicleReferenceCalibration({
      rawCrushDepthPx: 50,
      profileMeasurements: measurements,
      agreementToleranceFraction: 0.15,
      candidates: [
        { type: "wheel", pixelMeasurementPx: 350, isUndamaged: true },
        {
          type: "headlamp_spacing",
          pixelMeasurementPx: 700,
          isUndamaged: true,
        },
      ],
    });

    expect(result.detections).toEqual([
      expect.objectContaining({ type: "headlamp_spacing" }),
    ]);
    expect(result.calibration.status).toBe("INSUFFICIENT_REFERENCE_DIMENSIONS");
  });

  it("rejects equally plausible make/model/year profiles instead of choosing a ranked row", () => {
    const profiles = [
      { id: 101, variant: "Base", completeness_score: 0.95 },
      { id: 102, variant: "Sport", completeness_score: 0.9 },
    ];

    expect(selectUnambiguousVehicleProfile(profiles)).toBeNull();
    expect(selectUnambiguousVehicleProfile([profiles[0]])).toEqual(profiles[0]);
  });

  it("rejects a reference type without an allow-listed stored measurement", () => {
    const result = bindKnownVehicleReferenceCalibration({
      rawCrushDepthPx: 50,
      profileMeasurements,
      agreementToleranceFraction: 0.15,
      candidates: [
        { type: "badge", pixelMeasurementPx: 100, isUndamaged: true },
        { type: "wheel", pixelMeasurementPx: 350, isUndamaged: true },
      ],
    });

    expect(result.detections).toHaveLength(1);
    expect(result.calibration.status).toBe("INSUFFICIENT_REFERENCE_DIMENSIONS");
    expect(result.calibration.correctedValue).toBeNull();
  });

  it("rejects an ambiguous alternate stored dimension instead of selecting the first value", () => {
    const result = bindKnownVehicleReferenceCalibration({
      rawCrushDepthPx: 50,
      profileMeasurements: {
        ...profileMeasurements,
        wheel_diameter_alt_mm: 760,
      },
      agreementToleranceFraction: 0.15,
      candidates: [
        { type: "wheel", pixelMeasurementPx: 350, isUndamaged: true },
        {
          type: "headlamp_spacing",
          pixelMeasurementPx: 700,
          isUndamaged: true,
        },
      ],
    });

    expect(result.detections).toHaveLength(1);
    expect(result.detections[0]?.type).toBe("headlamp_spacing");
    expect(result.calibration.status).toBe("INSUFFICIENT_REFERENCE_DIMENSIONS");
    expect(result.calibration.correctedValue).toBeNull();
  });

  it("requires two independent undamaged references before producing a measurement", () => {
    const result = bindKnownVehicleReferenceCalibration({
      rawCrushDepthPx: 50,
      profileMeasurements,
      agreementToleranceFraction: 0.15,
      candidates: [
        { type: "wheel", pixelMeasurementPx: 350, isUndamaged: true },
        { type: "wheel", pixelMeasurementPx: 350, isUndamaged: true },
        {
          type: "headlamp_spacing",
          pixelMeasurementPx: 700,
          isUndamaged: false,
        },
      ],
    });

    expect(result.calibration.status).toBe("INSUFFICIENT_REFERENCE_DIMENSIONS");
    expect(result.calibration.correctedValue).toBeNull();
  });

  it("routes material reference disagreement to human review instead of averaging it", () => {
    const result = bindKnownVehicleReferenceCalibration({
      rawCrushDepthPx: 50,
      profileMeasurements,
      agreementToleranceFraction: 0.15,
      candidates: [
        { type: "wheel", pixelMeasurementPx: 350, isUndamaged: true }, // 2 mm/px
        {
          type: "headlamp_spacing",
          pixelMeasurementPx: 350,
          isUndamaged: true,
        }, // 4 mm/px
      ],
    });

    expect(result.calibration.status).toBe("HUMAN_REVIEW_REQUIRED");
    expect(result.calibration.correctedValue).toBeNull();
    expect(result.calibration.confidenceDisposition).toBe(
      "REDUCE_AND_REQUIRE_HUMAN_REVIEW"
    );
  });

  it("accepts the exact agreement tolerance boundary", () => {
    const result = bindKnownVehicleReferenceCalibration({
      rawCrushDepthPx: 50,
      profileMeasurements,
      agreementToleranceFraction: 0.15,
      candidates: [
        { type: "wheel", pixelMeasurementPx: 350, isUndamaged: true }, // 2 mm/px
        {
          type: "headlamp_spacing",
          pixelMeasurementPx: 651.1627906977,
          isUndamaged: true,
        }, // 2.15 mm/px
      ],
    });

    expect(result.calibration.observedFactorSpreadFraction).toBeLessThanOrEqual(
      0.15
    );
    expect(result.calibration.status).toBe("CALIBRATED");
  });
});
