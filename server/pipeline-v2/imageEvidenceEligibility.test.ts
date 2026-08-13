import { describe, expect, it } from "vitest";
import {
  evidenceFromPdfDirectPage,
  evidenceFromScoredPdfPage,
  evidenceFromSemanticImage,
  removeIneligiblePhysicsMeasurements,
} from "./imageEvidenceEligibility";

describe("R2 image evidence eligibility", () => {
  it("keeps fallback PDF imagery available for damage context but excludes it from crush depth", () => {
    const evidence = evidenceFromScoredPdfPage({
      url: "https://example.test/page.png",
      pageNumber: 4,
      source: "page_render",
      damageLikelihoodScore: 0.61,
      qualityScore: 0.42,
      confidence: "MEDIUM",
      classification: "damage_photo",
      features: { textDensity: 0.2, colourVariance: 0.4, edgeDensity: 0.3, blurScore: 0.4, aspectRatio: 1, meanBrightness: 100 },
      selectionReason: "Fallback selection after no confirmed damage photo.",
      usedSelectionFallback: true,
    });

    expect(evidence.suitableForCrushDepth).toBe(false);
    expect(evidence.fallbackWarning).toContain("contextual damage analysis");
  });

  it("does not turn a low-confidence semantic fallback into an eligible physics image", () => {
    const evidence = evidenceFromSemanticImage({
      url: "https://example.test/direct.jpg",
      imageId: "direct.jpg",
      semanticType: "DAMAGE_PHOTO",
      quality: "good",
      qualityConfidence: 0.5,
      semanticConfidence: 0,
      eligibleStages: ["Stage6"],
      reasoning: "Classification unavailable — defaulting to DAMAGE_PHOTO (safe fallback)",
    });

    expect(evidence.suitableForCrushDepth).toBe(false);
    expect(evidence.exclusionReason).toContain("confidence");
  });

  it("keeps a PDF-direct fallback page as contextual evidence and excludes its numeric physics", () => {
    const evidence = evidenceFromPdfDirectPage({
      url: "https://example.test/claim.pdf#page=7",
      pageNumber: 7,
      pageType: "vehicle_damage",
      hasVisibleDamage: true,
      photoQuality: "clear",
      scanConfidence: "high",
      fallback: true,
      source: "pdf_direct_vision",
    });

    expect(evidence.suitableForCrushDepth).toBe(false);
    expect(evidence.fallbackWarning).toContain("contextual damage analysis");
    expect(evidence.exclusionReason).toContain("lacks page-level");
  });

  it("allows only a clear, identified targeted damage page with sufficient scan confidence into crush-depth physics", () => {
    const evidence = evidenceFromPdfDirectPage({
      url: "https://example.test/rendered-page-7.png",
      pageNumber: 7,
      pageType: "vehicle_damage",
      hasVisibleDamage: true,
      photoQuality: "clear",
      scanConfidence: "medium",
      fallback: false,
      source: "pdf_page_render",
    });

    expect(evidence.suitableForCrushDepth).toBe(true);
    expect(evidence.exclusionReason).toBeUndefined();
  });

  it("retains damage components but removes all physics fields from ineligible imagery", () => {
    const [damageOnly] = removeIneligiblePhysicsMeasurements([{
      name: "Front Bumper",
      location: "front",
      damageType: "impact",
      severity: "severe",
      visible: true,
      distanceFromImpact: 0,
      crushDepthM: 0.15,
      deformationEnergyJ: 12000,
      structuralDisplacementM: 0.04,
      visionConfidenceScore: 80,
      damageFractionEstimate: 0.55,
    }]);

    expect(damageOnly.name).toBe("Front Bumper");
    expect(damageOnly.crushDepthM).toBeUndefined();
    expect(damageOnly.deformationEnergyJ).toBeUndefined();
    expect(damageOnly.visionConfidenceScore).toBeUndefined();
  });
});
