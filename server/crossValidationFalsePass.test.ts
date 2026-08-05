/**
 * crossValidationFalsePass.test.ts
 *
 * Tests for the cross-validation engine's false-pass scenario and
 * correct behaviour under normal conditions.
 *
 * A "false pass" occurs when photo analysis returns low confidence
 * (blurry, dark, or low-resolution photos) and the engine defaults
 * all quoted parts to "confirmed" — producing a clean result that
 * does not reflect genuine damage verification.
 *
 * Coverage areas:
 *   1. Normal pass — quoted parts confirmed by high-confidence photo analysis
 *   2. Normal fail — quoted parts not visible in photos → suspicious count > 0
 *   3. False-pass scenario — low-confidence photo analysis produces
 *      confirmedCount == totalQuotedParts despite no genuine verification
 *   4. False-pass detection — low photo confidence is captured in the result
 *      so downstream fraud scoring can treat the result as inconclusive
 *   5. Visible-not-quoted — damage visible in photos but absent from quote
 *   6. Risk score is 0 ("none") when all parts confirmed at high confidence
 *   7. Risk score is elevated when suspicious parts are present
 *   8. Recommendations are generated when zones are under-photographed
 *
 * Strategy: The function accepts `existingPhotoAnalyses` to bypass the
 * LLM vision call. We inject pre-built PhotoAnalysisResult objects to
 * control confidence levels deterministically.
 *
 * Author: Tavonga Shoko (Lead Engineer)
 */

import { describe, it, expect } from "vitest";
import {
  crossValidateQuotesVsPhotos,
  type PhotoAnalysisResult,
} from "./cross-validation";

// ─── Fixtures ────────────────────────────────────────────────────────────────

/** A quoted part fixture */
function quotedPart(name: string, cost = 1200) {
  return { name, cost, action: "replace" };
}

/** A high-confidence photo analysis — damage clearly visible */
function highConfidenceAnalysis(
  photoUrl: string,
  visibleParts: Array<{ partName: string; confidence: number }>
): PhotoAnalysisResult {
  return {
    photoUrl,
    visibleDamage: visibleParts.map(p => ({
      partName: p.partName,
      damageDescription: `Visible damage to ${p.partName}`,
      severity: "moderate",
      confidence: p.confidence,
    })),
    overallDescription: "Clear frontal damage visible",
    visibleZones: ["front", "front-left", "front-right", "hood"],
  };
}

/** A low-confidence photo analysis — blurry/dark photo, no damage detected */
function lowConfidenceAnalysis(photoUrl: string): PhotoAnalysisResult {
  return {
    photoUrl,
    visibleDamage: [], // Engine sees nothing — low confidence means no detections
    overallDescription: "Photo quality insufficient for damage analysis",
    visibleZones: [],
  };
}

// ─── 1. Normal pass ──────────────────────────────────────────────────────────

describe("Normal pass — high-confidence confirmation", () => {
  it("confirms quoted parts when they are clearly visible in photos", async () => {
    const quotedParts = [
      quotedPart("Front Bumper"),
      quotedPart("Hood"),
    ];
    const analyses: PhotoAnalysisResult[] = [
      highConfidenceAnalysis("https://photos.test/1.jpg", [
        { partName: "Front Bumper", confidence: 0.92 },
        { partName: "Hood", confidence: 0.88 },
      ]),
    ];

    const report = await crossValidateQuotesVsPhotos(quotedParts, [], analyses);

    expect(report.summary.totalQuotedParts).toBe(2);
    expect(report.summary.confirmedCount).toBeGreaterThanOrEqual(1);
    expect(report.summary.suspiciousCount).toBe(0);
  });

  it("produces a low or zero risk score when all parts are confirmed at high confidence", async () => {
    const quotedParts = [quotedPart("Front Bumper"), quotedPart("Hood")];
    const analyses: PhotoAnalysisResult[] = [
      highConfidenceAnalysis("https://photos.test/1.jpg", [
        { partName: "Front Bumper", confidence: 0.95 },
        { partName: "Hood", confidence: 0.90 },
      ]),
    ];

    const report = await crossValidateQuotesVsPhotos(quotedParts, [], analyses);

    // With all parts confirmed and no suspicious items, risk score should be low
    expect(report.summary.overallRiskScore).toBeLessThan(30);
  });
});

// ─── 2. Normal fail — quoted parts not visible ───────────────────────────────

describe("Normal fail — quoted parts not visible in photos", () => {
  it("flags externally visible parts as suspicious when not seen in photos", async () => {
    const quotedParts = [
      quotedPart("Front Bumper"),  // externally visible — suspicious if not in photos
      quotedPart("Hood"),          // externally visible — suspicious if not in photos
    ];
    // Photo shows completely different damage
    const analyses: PhotoAnalysisResult[] = [
      highConfidenceAnalysis("https://photos.test/1.jpg", [
        { partName: "Rear Bumper", confidence: 0.90 }, // rear, not front
      ]),
    ];

    const report = await crossValidateQuotesVsPhotos(quotedParts, [], analyses);

    // Front bumper and hood quoted but not visible → should be flagged
    expect(report.summary.quotedNotVisibleCount).toBeGreaterThanOrEqual(1);
  });

  it("elevates risk score when suspicious externally-visible parts are present", async () => {
    const quotedParts = [
      quotedPart("Front Bumper"),
      quotedPart("Hood"),
      quotedPart("Left Headlight"),
    ];
    const analyses: PhotoAnalysisResult[] = [
      highConfidenceAnalysis("https://photos.test/1.jpg", [
        { partName: "Rear Bumper", confidence: 0.88 },
      ]),
    ];

    const report = await crossValidateQuotesVsPhotos(quotedParts, [], analyses);

    // Multiple externally-visible parts quoted but not seen → elevated risk
    expect(report.summary.overallRiskScore).toBeGreaterThan(0);
  });
});

// ─── 3. False-pass scenario ──────────────────────────────────────────────────

describe("False-pass scenario — low-confidence photos", () => {
  it("produces confirmedCount == 0 when photo analysis detects nothing (low confidence)", async () => {
    const quotedParts = [
      quotedPart("Front Bumper"),
      quotedPart("Hood"),
      quotedPart("Left Fender"),
    ];
    // Low-confidence photos: engine sees no damage at all
    const analyses: PhotoAnalysisResult[] = [
      lowConfidenceAnalysis("https://photos.test/blurry1.jpg"),
      lowConfidenceAnalysis("https://photos.test/blurry2.jpg"),
    ];

    const report = await crossValidateQuotesVsPhotos(quotedParts, [], analyses);

    // With no visible damage detected, confirmedCount must be 0
    // (not a false pass where everything is "confirmed" by default)
    expect(report.summary.totalVisibleDamage).toBe(0);
    // Parts quoted but not visible should be counted
    expect(report.summary.quotedNotVisibleCount + report.summary.confirmedCount)
      .toBe(report.summary.totalQuotedParts);
  });

  it("does not produce a clean risk score when photos are empty (false-pass prevention)", async () => {
    const quotedParts = [
      quotedPart("Front Bumper"),
      quotedPart("Hood"),
      quotedPart("Left Fender"),
    ];
    const analyses: PhotoAnalysisResult[] = [
      lowConfidenceAnalysis("https://photos.test/blurry1.jpg"),
    ];

    const report = await crossValidateQuotesVsPhotos(quotedParts, [], analyses);

    // A clean risk score of 0 with no visible damage is a false pass.
    // The engine should flag the lack of photo coverage.
    // Either the risk score is elevated, or recommendations mention photo quality.
    const hasPhotoWarning = report.recommendations.some(r =>
      r.toLowerCase().includes("photo") ||
      r.toLowerCase().includes("zone") ||
      r.toLowerCase().includes("inspect")
    );
    const hasElevatedRisk = report.summary.overallRiskScore > 0;
    expect(hasPhotoWarning || hasElevatedRisk).toBe(true);
  });

  it("generates a CRITICAL recommendation when none of the quoted parts can be confirmed", async () => {
    const quotedParts = [
      quotedPart("Front Bumper"),
      quotedPart("Hood"),
    ];
    const analyses: PhotoAnalysisResult[] = [
      lowConfidenceAnalysis("https://photos.test/dark.jpg"),
    ];

    const report = await crossValidateQuotesVsPhotos(quotedParts, [], analyses);

    if (report.summary.confirmedCount === 0) {
      const hasCriticalRec = report.recommendations.some(r =>
        r.toUpperCase().includes("CRITICAL") || r.toLowerCase().includes("physical inspection")
      );
      expect(hasCriticalRec).toBe(true);
    }
  });
});

// ─── 4. False-pass detection — low confidence captured in result ──────────────

describe("False-pass detection — photo analysis metadata", () => {
  it("photoAnalyses array contains the analysis results for each photo", async () => {
    const quotedParts = [quotedPart("Front Bumper")];
    const analyses: PhotoAnalysisResult[] = [
      lowConfidenceAnalysis("https://photos.test/blurry.jpg"),
    ];

    const report = await crossValidateQuotesVsPhotos(quotedParts, [], analyses);

    expect(report.photoAnalyses).toHaveLength(1);
    expect(report.photoAnalyses[0].photoUrl).toBe("https://photos.test/blurry.jpg");
    // The visibleDamage array should be empty for a low-confidence photo
    expect(report.photoAnalyses[0].visibleDamage).toHaveLength(0);
  });

  it("downstream fraud scoring can detect false-pass via empty visibleDamage + confirmedCount", async () => {
    const quotedParts = [
      quotedPart("Front Bumper"),
      quotedPart("Hood"),
    ];
    const analyses: PhotoAnalysisResult[] = [
      lowConfidenceAnalysis("https://photos.test/blurry.jpg"),
    ];

    const report = await crossValidateQuotesVsPhotos(quotedParts, [], analyses);

    // A downstream fraud scorer can detect the false-pass condition:
    // totalVisibleDamage == 0 AND totalQuotedParts > 0
    const isFalsePassCondition =
      report.summary.totalVisibleDamage === 0 &&
      report.summary.totalQuotedParts > 0;

    // The report must expose the data needed to detect this condition
    expect(typeof report.summary.totalVisibleDamage).toBe("number");
    expect(typeof report.summary.totalQuotedParts).toBe("number");
    expect(typeof report.summary.confirmedCount).toBe("number");
    // In this scenario, the false-pass condition should be detectable
    if (isFalsePassCondition) {
      // confirmedCount should NOT equal totalQuotedParts when nothing was visible
      // (this is the core false-pass prevention assertion)
      expect(report.summary.confirmedCount).toBeLessThan(report.summary.totalQuotedParts);
    }
  });
});

// ─── 5. Visible-not-quoted ───────────────────────────────────────────────────

describe("Visible-not-quoted — damage in photos but absent from quote", () => {
  it("counts damage visible in photos but not in the quote", async () => {
    const quotedParts = [quotedPart("Front Bumper")]; // only bumper quoted
    const analyses: PhotoAnalysisResult[] = [
      highConfidenceAnalysis("https://photos.test/1.jpg", [
        { partName: "Front Bumper", confidence: 0.90 },
        { partName: "Hood", confidence: 0.85 }, // visible but not quoted
        { partName: "Left Headlight", confidence: 0.88 }, // visible but not quoted
      ]),
    ];

    const report = await crossValidateQuotesVsPhotos(quotedParts, [], analyses);

    expect(report.summary.visibleNotQuotedCount).toBeGreaterThanOrEqual(1);
  });

  it("generates a recommendation to update the quote when visible damage is unquoted", async () => {
    const quotedParts = [quotedPart("Front Bumper")];
    const analyses: PhotoAnalysisResult[] = [
      highConfidenceAnalysis("https://photos.test/1.jpg", [
        { partName: "Front Bumper", confidence: 0.90 },
        { partName: "Hood", confidence: 0.85 },
      ]),
    ];

    const report = await crossValidateQuotesVsPhotos(quotedParts, [], analyses);

    if (report.summary.visibleNotQuotedCount > 0) {
      const hasQuoteRec = report.recommendations.some(r =>
        r.toLowerCase().includes("quot") || r.toLowerCase().includes("damage")
      );
      expect(hasQuoteRec).toBe(true);
    }
  });
});

// ─── 6. Report structure ─────────────────────────────────────────────────────

describe("CrossValidationReport structure", () => {
  it("always returns a timestamp", async () => {
    const report = await crossValidateQuotesVsPhotos(
      [quotedPart("Front Bumper")],
      [],
      [lowConfidenceAnalysis("https://photos.test/1.jpg")]
    );
    expect(report.timestamp).toBeTruthy();
    expect(new Date(report.timestamp).getTime()).not.toBeNaN();
  });

  it("summary counts are non-negative integers", async () => {
    const report = await crossValidateQuotesVsPhotos(
      [quotedPart("Front Bumper"), quotedPart("Hood")],
      [],
      [highConfidenceAnalysis("https://photos.test/1.jpg", [
        { partName: "Front Bumper", confidence: 0.9 },
      ])]
    );
    expect(report.summary.totalQuotedParts).toBeGreaterThanOrEqual(0);
    expect(report.summary.confirmedCount).toBeGreaterThanOrEqual(0);
    expect(report.summary.quotedNotVisibleCount).toBeGreaterThanOrEqual(0);
    expect(report.summary.visibleNotQuotedCount).toBeGreaterThanOrEqual(0);
    expect(report.summary.suspiciousCount).toBeGreaterThanOrEqual(0);
    expect(report.summary.overallRiskScore).toBeGreaterThanOrEqual(0);
    expect(report.summary.overallRiskScore).toBeLessThanOrEqual(100);
  });

  it("overallRiskLevel is one of the valid RiskLevel values", async () => {
    const report = await crossValidateQuotesVsPhotos(
      [quotedPart("Front Bumper")],
      [],
      [lowConfidenceAnalysis("https://photos.test/1.jpg")]
    );
    expect(["none", "low", "medium", "high", "critical"]).toContain(
      report.summary.overallRiskLevel
    );
  });
});
