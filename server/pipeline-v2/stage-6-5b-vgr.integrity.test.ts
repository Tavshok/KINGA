import { describe, expect, it } from "vitest";

import { runVGRReconciliation } from "./stage-6-5b-vgr";
import type { PerImageCalibrationResult } from "./stage-6-5a-vge";

function calibratedImage(
  index: number,
  confidence = 0.9
): PerImageCalibrationResult {
  return {
    imageUrl: `https://evidence.example/${index}.jpg`,
    imageIndex: index,
    scaleAvailable: true,
    referenceObjects: [],
    overallCalibrationConfidence: confidence,
    perspectiveCorrected: false,
    perspectiveCorrectionMethod: "none",
    rawCrushDepthMm: null,
    calibratedCrushDepthMm: 100 + index * 5,
    calibratedCrushDepthMinMm: 90 + index * 5,
    calibratedCrushDepthMaxMm: 110 + index * 5,
    calibrationDecision: "CALIBRATED",
    imageViewAngle: index === 0 ? "front" : "45_degree_front",
  };
}

describe("Stage 6.5B VGR consensus threshold", () => {
  it("does not describe one calibrated image as a cross-image consensus", () => {
    const result = runVGRReconciliation([calibratedImage(0)]);

    expect(result?.reconciliationAvailable).toBe(false);
    expect(result?.consensusCrushDepthM).toBeNull();
    expect(result?.failureReason).toMatch(/at least two qualified/i);
  });

  it("requires two qualified contributing images even when two images were calibrated", () => {
    const result = runVGRReconciliation([
      calibratedImage(0, 0.9),
      calibratedImage(1, 0.01),
    ]);

    expect(result?.reconciliationAvailable).toBe(false);
    expect(result?.agreementAssessment.contributingImages).toBe(1);
    expect(result?.failureReason).toMatch(/at least two qualified/i);
  });

  it("produces consensus only when two qualified calibrated images contribute", () => {
    const result = runVGRReconciliation([
      calibratedImage(0),
      calibratedImage(1),
    ]);

    expect(result?.reconciliationAvailable).toBe(true);
    expect(result?.agreementAssessment.contributingImages).toBe(2);
    expect(result?.consensusCrushDepthM).toBeGreaterThan(0);
  });
});
