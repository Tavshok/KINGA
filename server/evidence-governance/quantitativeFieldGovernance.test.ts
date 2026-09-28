import { describe, expect, it } from "vitest";

import {
  assessCrushDepthEligibility,
  hasGoverningCrushDepthEligibility,
  isGoverningQuantitativeField,
  isValidCrushDepthDecision,
  P0_QUANTITATIVE_EVIDENCE_CONTRACT_VERSION,
  preserveOrFailClosedCrushDepthDecision,
  assessFraudDecisionEligibility,
  resolvePersistableFraudValues,
} from "./quantitativeFieldGovernance";

const vgeVisualGeometry = {
  calibrationAvailable: true,
  calibratedCrushDepthM: 0.21,
  confidenceLevel: "HIGH",
} as const;

const vgrVisualGeometry = {
  reconciliationAvailable: true,
  consensusCrushDepthM: 0.23,
  confidenceLevel: "HIGH",
} as const;

describe("P0 quantitative field governance", () => {
  it("classifies even stored-dimension VGE/VGR geometry as advisory pending P1", () => {
    const decision = assessCrushDepthEligibility({
      vgeResult: vgeVisualGeometry as any,
      vgrResult: vgrVisualGeometry as any,
      rawStage6CrushDepthCandidatePresent: true,
    });

    expect(decision).toMatchObject({
      contractVersion: P0_QUANTITATIVE_EVIDENCE_CONTRACT_VERSION,
      field: "crush_depth_m",
      disposition: "ADVISORY",
      governing: null,
      reasonCode: "P0_ADVISORY_LLM_MEDIATED_VISUAL_GEOMETRY",
    });
    expect(decision.advisoryEvidence).toEqual(
      expect.arrayContaining([
        {
          sourceKind: "VGR_LLM_MEDIATED_VISUAL_GEOMETRY",
          reason: "VISUAL_GEOMETRY_REQUIRES_P1_QUALIFICATION",
          carriesNumericValue: false,
        },
        {
          sourceKind: "VGE_LLM_MEDIATED_VISUAL_GEOMETRY",
          reason: "VISUAL_GEOMETRY_REQUIRES_P1_QUALIFICATION",
          carriesNumericValue: false,
        },
        {
          sourceKind: "STAGE6_LLM_VISUAL_NUMERIC",
          reason: "RAW_STAGE6_NUMERIC_REMAINS_DESCRIPTIVE",
          carriesNumericValue: false,
        },
      ])
    );
    expect(isGoverningQuantitativeField(decision)).toBe(false);
  });

  it("does not promote raw Stage 6 crush without visual geometry", () => {
    const decision = assessCrushDepthEligibility({
      rawStage6CrushDepthCandidatePresent: true,
    });

    expect(decision).toMatchObject({
      disposition: "ADVISORY",
      governing: null,
      reasonCode: "P0_ADVISORY_RAW_STAGE6_ONLY",
    });
    expect(decision.advisoryEvidence).toEqual([
      {
        sourceKind: "STAGE6_LLM_VISUAL_NUMERIC",
        reason: "RAW_STAGE6_NUMERIC_REMAINS_DESCRIPTIVE",
        carriesNumericValue: false,
      },
    ]);
  });

  it("keeps bound advisory evidence ineligible for collision physics causation", () => {
    const snapshot = { rawStage6CrushDepthCandidatePresent: true };
    const decision = assessCrushDepthEligibility(snapshot);

    expect(hasGoverningCrushDepthEligibility(decision, snapshot)).toBe(false);
    expect(
      hasGoverningCrushDepthEligibility(
        { ...decision, disposition: "UNAVAILABLE" },
        snapshot
      )
    ).toBe(false);
  });

  it("does not mislabel energy or displacement as a crush-depth candidate", () => {
    const decision = assessCrushDepthEligibility({});
    expect(decision).toMatchObject({
      disposition: "UNAVAILABLE",
      governing: null,
      reasonCode: "P0_UNAVAILABLE_NO_CANDIDATE",
    });
  });

  it("rejects forged governing decisions at the persistence boundary", () => {
    const forged = {
      contractVersion: P0_QUANTITATIVE_EVIDENCE_CONTRACT_VERSION,
      field: "crush_depth_m",
      disposition: "GOVERNING",
      governing: {
        value: 0.23,
        unit: "m",
        sourceKind: "VGR_STORED_DIMENSION_CALIBRATION",
      },
      advisoryEvidence: [],
      reasonCode: "P0_GOVERNING_VGR_CALIBRATION",
      explanation: "Forged promotion.",
    };

    expect(isValidCrushDepthDecision(forged)).toBe(false);
    expect(preserveOrFailClosedCrushDepthDecision(forged)).toMatchObject({
      disposition: "UNAVAILABLE",
      governing: null,
      reasonCode: "P0_UNAVAILABLE_INCONSISTENT_PRESERVED_DECISION",
    });
  });

  it("rejects advisory payloads that retain an ungoverned numeric value", () => {
    const forged = {
      ...assessCrushDepthEligibility({
        rawStage6CrushDepthCandidatePresent: true,
      }),
      advisoryEvidence: [
        {
          sourceKind: "STAGE6_LLM_VISUAL_NUMERIC",
          reason: "RAW_STAGE6_NUMERIC_REMAINS_DESCRIPTIVE",
          carriesNumericValue: true,
          value: 0.45,
        },
      ],
    };

    expect(isValidCrushDepthDecision(forged)).toBe(false);
  });

  it("rejects numeric prose and source claims forged into advisory persistence", () => {
    const validVisual = assessCrushDepthEligibility({
      vgrResult: vgrVisualGeometry as any,
    });
    const numericExplanation = {
      ...validVisual,
      explanation: "Advisory crush depth is 0.45 m.",
    };
    expect(isValidCrushDepthDecision(numericExplanation)).toBe(false);
    expect(
      preserveOrFailClosedCrushDepthDecision(numericExplanation, {
        vgrResult: vgrVisualGeometry as any,
      })
    ).toMatchObject({
      disposition: "UNAVAILABLE",
      reasonCode: "P0_UNAVAILABLE_INCONSISTENT_PRESERVED_DECISION",
    });

    const sourceForged = assessCrushDepthEligibility({
      rawStage6CrushDepthCandidatePresent: true,
    });
    expect(isValidCrushDepthDecision(sourceForged)).toBe(true);
    expect(
      preserveOrFailClosedCrushDepthDecision(sourceForged, {
        rawStage6CrushDepthCandidatePresent: false,
      })
    ).toMatchObject({
      disposition: "UNAVAILABLE",
      reasonCode: "P0_UNAVAILABLE_INCONSISTENT_PRESERVED_DECISION",
    });
  });

  it("rejects decisions that omit present evidence or claim false unavailability", () => {
    const snapshot = {
      vgeResult: vgeVisualGeometry as any,
      vgrResult: vgrVisualGeometry as any,
      rawStage6CrushDepthCandidatePresent: true,
    };
    const expected = assessCrushDepthEligibility(snapshot);
    const omittedSources = {
      ...expected,
      advisoryEvidence: expected.advisoryEvidence.slice(0, 1),
    };
    const falseUnavailable = assessCrushDepthEligibility({});

    expect(
      preserveOrFailClosedCrushDepthDecision(omittedSources, snapshot)
    ).toMatchObject({
      disposition: "UNAVAILABLE",
      reasonCode: "P0_UNAVAILABLE_INCONSISTENT_PRESERVED_DECISION",
    });
    expect(
      preserveOrFailClosedCrushDepthDecision(falseUnavailable, snapshot)
    ).toMatchObject({
      disposition: "UNAVAILABLE",
      reasonCode: "P0_UNAVAILABLE_INCONSISTENT_PRESERVED_DECISION",
    });
  });
});

describe("P0-B1 fraud persistence governance", () => {
  it("never persists forged, advisory, or fallback fraud numbers", () => {
    const sources = {
      crushDepthDecision: assessCrushDepthEligibility({
        rawStage6CrushDepthCandidatePresent: true,
      }),
      advisoryEvidencePresent: true,
      fallbackOrDegraded: false,
    };
    const advisory = assessFraudDecisionEligibility(sources);

    const result = resolvePersistableFraudValues({
      decision: {
        ...advisory,
        governing: { score: 99, level: "elevated" },
      },
      sources,
      candidateScore: 99,
      candidateLevel: "elevated",
    });

    expect(result.eligibility).toMatchObject({
      disposition: "UNAVAILABLE",
      governing: null,
      reasonCode: "P0_UNAVAILABLE_MISSING_OR_INCONSISTENT_DECISION",
    });
    expect(result.fraudRiskScore).toBeNull();
    expect(result.fraudRiskLevel).toBeNull();
  });
});
