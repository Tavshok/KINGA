import { describe, expect, it } from "vitest";
import {
  evidenceFromPdfDirectPage,
  isPhysicsEligibleVisionComponent,
  removeIneligiblePhysicsMeasurements,
} from "./imageEvidenceEligibility";
import type { DamageAnalysisComponent } from "./types";
import { photoZonePanel } from "../reporting/templates/kingaDesignSystem";

describe("R2 isolated PDF-direct operational acceptance", () => {
  it("keeps PDF-direct damage context, excludes its numeric physics, and renders the report boundary without persistence", () => {
    const evidence = evidenceFromPdfDirectPage({
      url: "https://fixture.invalid/source-claim.pdf#page=7",
      pageNumber: 7,
      pageType: "vehicle_damage",
      fallback: true,
      source: "pdf_direct_vision",
    });
    const directComponent: DamageAnalysisComponent = {
      name: "Radiator support",
      location: "front",
      damageType: "deformation",
      severity: "severe",
      visible: true,
      distanceFromImpact: 0,
      inputSource: "pdf_direct_vision",
      crushDepthM: 0.31,
      deformationEnergyJ: 45500,
      structuralDisplacementM: 0.04,
    };

    const damageOnly = removeIneligiblePhysicsMeasurements([directComponent])[0];
    const reportHtml = photoZonePanel([{
      url: evidence.url,
      zone: directComponent.location,
      sourcePage: evidence.pageNumber,
      classifier: evidence.classifier,
      classificationConfidence: evidence.classificationConfidence,
      selectionReason: evidence.selectionReason,
      fallbackWarning: evidence.fallbackWarning,
      suitableForCrushDepth: evidence.suitableForCrushDepth,
      physicsExclusionReason: evidence.exclusionReason,
    }]);

    expect(evidence.suitableForCrushDepth).toBe(false);
    expect(damageOnly.name).toBe("Radiator support");
    expect(damageOnly.crushDepthM).toBeUndefined();
    expect(damageOnly.deformationEnergyJ).toBeUndefined();
    expect(isPhysicsEligibleVisionComponent(damageOnly)).toBe(false);
    expect(reportHtml).toContain("Source p.7");
    expect(reportHtml).toContain("pdf_direct_vision");
    expect(reportHtml).toContain("Physics: contextual only");
    expect(reportHtml).toContain("contextual damage analysis only");
  });

  it("accepts numeric physics only from an explicitly confirmed image source", () => {
    const confirmedComponent: DamageAnalysisComponent = {
      name: "Front bumper",
      location: "front",
      damageType: "crush",
      severity: "severe",
      visible: true,
      distanceFromImpact: 0,
      inputSource: "confirmed_damage_photo",
      crushDepthM: 0.31,
    };

    expect(isPhysicsEligibleVisionComponent(confirmedComponent)).toBe(true);
  });

  it("keeps document-description inference available for damage context but excludes it from image physics", () => {
    const inferredComponent: DamageAnalysisComponent = {
      name: "Front grille",
      location: "front",
      damageType: "damage_reported",
      severity: "moderate",
      visible: false,
      distanceFromImpact: 0,
      inputSource: "document_inferred",
      source: "inferred",
    };

    expect(isPhysicsEligibleVisionComponent(inferredComponent)).toBe(false);
    expect(photoZonePanel([])).toContain("non-visual evidence processing continue");
  });

  it("keeps a Stage 6 degraded output non-blocking when no image component is available", () => {
    const degradedComponents: DamageAnalysisComponent[] = [];
    const reportHtml = photoZonePanel([]);

    expect(degradedComponents.filter(isPhysicsEligibleVisionComponent)).toEqual([]);
    expect(reportHtml).toContain("Visual damage analysis and image-based crush-depth physics are unavailable");
    expect(reportHtml).toContain("assessment and non-visual evidence processing continue");
  });
});
