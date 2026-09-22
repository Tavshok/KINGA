import { describe, expect, it, vi } from "vitest";

vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn(async () => ({
    choices: [
      {
        message: {
          content:
            "ADVERSARIAL: 91 km/h impact, physical impossibility, hidden damage, and C1–C9 collision coherence confirmed.",
        },
      },
    ],
  })),
}));

import { invokeLLM } from "./_core/llm";
import { generateReportNarrative } from "./report-narrative-generator";

describe("P0-A-2 report narrative publication boundary", () => {
  it("does not invoke the LLM or publish adversarial collision conclusions from legacy claim inputs", async () => {
    const narrative = await generateReportNarrative(
      {
        claim: {
          claimNumber: "P0-NARRATIVE-001",
          vehicleMake: "Kinga",
          vehicleModel: "Fixture",
          vehicleYear: 2024,
          status: "assessment_complete",
          incidentDate: "2026-09-22T00:00:00.000Z",
          incidentDescription:
            "ADVERSARIAL INCIDENT: 91 km/h impact direction confirms collision coherence.",
          incidentLocation: "Fixture road",
          createdAt: "2026-09-22T00:00:00.000Z",
        },
        aiAssessment: {
          estimatedCost: 4200,
          damageDescription:
            "ADVERSARIAL DAMAGE: physical impossibility and hidden damage from crush depth.",
          damagedComponentsJson: JSON.stringify(["rear bumper"]),
          physicsAnalysis: JSON.stringify({
            speed: 91,
            physicalImpossibility: true,
            hiddenDamage: "ADVERSARIAL HIDDEN DAMAGE",
          }),
          createdAt: "2026-09-22T00:00:00.000Z",
        },
        assessorEvaluation: null,
        panelBeaterQuotes: [],
        fraudDetection: {
          aiRiskScore: 0,
          assessorRiskLevel: "low",
          indicators: [],
          enhancedAnalysis: null,
        },
        physicsValidation: {
          impactAnalysis: "ADVERSARIAL IMPACT ANALYSIS",
          damageConsistency: "ADVERSARIAL C1–C9 COLLISION COHERENCE",
          validationConfidence: 100,
        },
        workflowAuditTrail: [],
        supportingEvidence: {
          damagePhotos: [],
          annotatedPhotos: [],
          policeReportUrl: null,
          quotePdfs: [],
        },
      } as any,
      "insurer"
    );

    expect(invokeLLM).not.toHaveBeenCalled();
    expect(narrative.physicsValidationSummary).toContain(
      "Collision Physics Withheld — Manual Review Required."
    );
    expect(narrative.executiveSummary).toContain(
      "Collision Physics Withheld — Manual Review Required."
    );
    expect(narrative.damageAssessmentAnalysis).toContain(
      "Collision Physics Withheld — Manual Review Required."
    );

    const publishedNarrative = Object.values(narrative).join("\n");
    expect(publishedNarrative).not.toContain("91 km/h");
    expect(publishedNarrative).not.toContain("physical impossibility");
    expect(publishedNarrative).not.toContain("ADVERSARIAL HIDDEN DAMAGE");
    expect(publishedNarrative).not.toContain("C1–C9 collision coherence");
    expect(publishedNarrative).not.toContain("ADVERSARIAL");
  });
});
