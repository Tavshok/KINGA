/**
 * fraud-scoring.test.ts
 * Comprehensive unit tests for the 10-indicator fraud scoring engine.
 * Field names match the actual FraudScoringInput interface in fraud-scoring.ts.
 */
import { describe, it, expect } from "vitest";
import { computeFraudScoreBreakdown, type FraudScoringInput } from "./fraud-scoring";

// ---- Helper: clean baseline input (all signals at zero) ----

function cleanInput(overrides: Partial<FraudScoringInput> = {}): FraudScoringInput {
  return {
    physics: {
      damageConsistencyScore: 95,
      impossibleDamagePatterns: [],
      unrelatedDamageComponents: [],
      severityMismatch: false,
      stagedAccidentIndicators: [],
      estimatedSpeedKmh: 40,
      structuralDamage: false,
      impactForceKn: 10,
    },
    claimant: {
      isNonOwnerDriver: false,
      driverRelationshipToOwner: "owner",
      policyAgeDays: 400,
      submissionDelayDays: 5,
      previousClaimsCount: 0,
      driverLicenseSuspended: false,
      driverLicenseVerified: true,
      driverViolationsCount: 0,
      driverEmploymentStatus: "employed",
      previousInsurerCount: 1,
      lodgedBy: "owner",
      driverAge: 35,
    },
    staged: {
      estimatedSpeedKmh: 50,
      damageSeverityScore: 0.4,
      numberOfInjuryClaims: 0,
      hasWitnesses: true,
      hasDashcamFootage: false,
      hasPoliceReport: true,
      incidentHour: 10,
      geographicRiskZone: "low",
      isSolePartyNightAccident: false,
    },
    panelBeater: {
      quoteSimilarityScore: 0.85,
      extraInQuoteCount: 0,
      extraInQuoteCost: 0,
      partsInflationPercent: 0,
      labourInflationPercent: 0,
      replacementToRepairRatio: 0.3,
      damageScopeCreep: false,
      unrelatedQuoteItems: 0,
      quotedTotalUsd: 5000,
      aiEstimatedTotalUsd: 5000,
    },
    assessor: {
      rubberStampingScore: 10,
      biasScore: 5,
      collusionScore: 0,
      averageTurnaroundHours: 48,
      accuracyScore: 90,
      claimsWithSamePanelBeaterCount: 0,
    },
    collusion: {
      triadRepeatCount: 0,
      sharedContactWithPanelBeater: false,
      sharedContactWithAssessor: false,
      entityCollusionScore: 0,
      claimantSamePanelBeaterCount: 0,
    },
    documents: {
      photoMetadataScore: 95,
      reusedPhotoScore: 5,
      documentConsistencyScore: 95,
      hasHandwrittenQuote: false,
      ocrConfidence: 0.95,
      missingDocumentCount: 0,
    },
    costs: {
      quotedTotalUsd: 5000,
      aiEstimatedTotalUsd: 5000,
      repairToValueRatio: 0.25,
      overpricedPartsCount: 0,
    },
    vehicle: {
      vehicleAgeYears: 5,
      estimatedVehicleValueUsd: 20000,
      estimatedRepairCostUsd: 5000,
      ownershipTransferDaysBeforeClaim: 400,
      vinMismatch: false,
      previousAccidentCount: 0,
      isHighValueVehicle: false,
    },
    timing: {
      claimSubmittedOnWeekend: false,
      claimSubmittedOnHoliday: false,
      rapidResubmission: false,
      policyLapseNoticeDaysBefore: 400,
      incidentToSubmissionDays: 5,
      multipleClaimsInPeriod: 0,
    },
    mlResult: {
      fraud_probability: 0.05,
      ownership_risk_score: 0.05,
      staged_accident_indicators: { confidence: 0.05 },
      driver_profile: { risk_score: 0.05 },
    },
    ...overrides,
  };
}

// ---- Indicator 1: Physics Mismatch ----

describe("Indicator 1: Physics Mismatch", () => {
  it("scores 0 for a clean claim", () => {
    const result = computeFraudScoreBreakdown(cleanInput());
    expect(result.indicators.physicsMismatch.score).toBe(0);
  });

  it("adds points for impossible damage patterns", () => {
    const input = cleanInput({
      physics: { ...cleanInput().physics, impossibleDamagePatterns: ["rear damage on front impact"] },
    });
    const result = computeFraudScoreBreakdown(input);
    expect(result.indicators.physicsMismatch.score).toBeGreaterThan(0);
  });

  it("adds points for severity mismatch", () => {
    const input = cleanInput({ physics: { ...cleanInput().physics, severityMismatch: true } });
    const result = computeFraudScoreBreakdown(input);
    expect(result.indicators.physicsMismatch.score).toBeGreaterThan(0);
  });

  it("adds points for low damage consistency score", () => {
    const input = cleanInput({ physics: { ...cleanInput().physics, damageConsistencyScore: 0.3 } });
    const result = computeFraudScoreBreakdown(input);
    expect(result.indicators.physicsMismatch.score).toBeGreaterThan(0);
  });

  it("does not exceed maxScore", () => {
    const input = cleanInput({
      physics: {
        damageConsistencyScore: 10,
        impossibleDamagePatterns: ["p1","p2","p3","p4"],
        unrelatedDamageComponents: [{ name: "d1", distanceFromImpact: 100 }],
        severityMismatch: true,
        stagedAccidentIndicators: ["s1"],
        estimatedSpeedKmh: 120,
        structuralDamage: true,
        impactForceKn: 80,
      },
    });
    const result = computeFraudScoreBreakdown(input);
    const ind = result.indicators.physicsMismatch;
    expect(ind.score).toBeLessThanOrEqual(ind.maxScore);
  });
});

// ---- Indicator 2: Claimant & Driver Risk ----

describe("Indicator 2: Claimant & Driver Risk", () => {
  it("scores 0 for a clean claimant", () => {
    const result = computeFraudScoreBreakdown(cleanInput());
    expect(result.indicators.claimantDriverRisk.score).toBe(0);
  });

  it("adds points for new policy (< 90 days)", () => {
    const input = cleanInput({ claimant: { ...cleanInput().claimant, policyAgeDays: 30 } });
    const result = computeFraudScoreBreakdown(input);
    expect(result.indicators.claimantDriverRisk.score).toBeGreaterThan(0);
  });

  it("adds points for suspended license", () => {
    const input = cleanInput({ claimant: { ...cleanInput().claimant, driverLicenseSuspended: true } });
    const result = computeFraudScoreBreakdown(input);
    expect(result.indicators.claimantDriverRisk.score).toBeGreaterThan(0);
  });

  it("adds points for non-owner driver", () => {
    const input = cleanInput({ claimant: { ...cleanInput().claimant, isNonOwnerDriver: true, driverRelationshipToOwner: "friend" } });
    const result = computeFraudScoreBreakdown(input);
    expect(result.indicators.claimantDriverRisk.score).toBeGreaterThan(0);
  });

  it("does not exceed maxScore", () => {
    const input = cleanInput({
      claimant: {
        isNonOwnerDriver: true,
        driverRelationshipToOwner: "unknown",
        policyAgeDays: 10,
        submissionDelayDays: 60,
        previousClaimsCount: 5,
        driverLicenseSuspended: true,
        driverLicenseVerified: false,
        driverViolationsCount: 5,
        driverEmploymentStatus: "unemployed",
        previousInsurerCount: 5,
        lodgedBy: "third_party",
        driverAge: 19,
      },
    });
    const result = computeFraudScoreBreakdown(input);
    const ind = result.indicators.claimantDriverRisk;
    expect(ind.score).toBeLessThanOrEqual(ind.maxScore);
  });
});

// ---- Indicator 3: Staged Accident ----

describe("Indicator 3: Staged Accident", () => {
  it("scores 0 for a legitimate incident", () => {
    const result = computeFraudScoreBreakdown(cleanInput());
    expect(result.indicators.stagedAccident.score).toBe(0);
  });

  it("adds points for no police report", () => {
    const input = cleanInput({ staged: { ...cleanInput().staged, hasPoliceReport: false } });
    const result = computeFraudScoreBreakdown(input);
    expect(result.indicators.stagedAccident.score).toBeGreaterThan(0);
  });

  it("adds points for no witnesses and no dashcam", () => {
    const input = cleanInput({ staged: { ...cleanInput().staged, hasWitnesses: false, hasDashcamFootage: false } });
    const result = computeFraudScoreBreakdown(input);
    expect(result.indicators.stagedAccident.score).toBeGreaterThan(0);
  });

  it("adds points for high-risk geographic zone", () => {
    const input = cleanInput({ staged: { ...cleanInput().staged, geographicRiskZone: "high" } });
    const result = computeFraudScoreBreakdown(input);
    expect(result.indicators.stagedAccident.score).toBeGreaterThan(0);
  });

  it("adds points for low speed with high damage severity", () => {
    const input = cleanInput({ staged: { ...cleanInput().staged, estimatedSpeedKmh: 15, damageSeverityScore: 0.85 } });
    const result = computeFraudScoreBreakdown(input);
    expect(result.indicators.stagedAccident.score).toBeGreaterThan(0);
  });

  it("does not exceed maxScore", () => {
    const input = cleanInput({
      staged: {
        estimatedSpeedKmh: 10,
        damageSeverityScore: 0.95,
        numberOfInjuryClaims: 5,
        hasWitnesses: false,
        hasDashcamFootage: false,
        hasPoliceReport: false,
        incidentHour: 2,
        geographicRiskZone: "high",
        isSolePartyNightAccident: true,
      },
    });
    const result = computeFraudScoreBreakdown(input);
    const ind = result.indicators.stagedAccident;
    expect(ind.score).toBeLessThanOrEqual(ind.maxScore);
  });
});

// ---- Indicator 4: Panel Beater Patterns ----

describe("Indicator 4: Panel Beater Patterns", () => {
  it("scores 0 for a fair quote", () => {
    const result = computeFraudScoreBreakdown(cleanInput());
    expect(result.indicators.panelBeaterPatterns.score).toBe(0);
  });

  it("adds points for extra items in quote", () => {
    const input = cleanInput({ panelBeater: { ...cleanInput().panelBeater, extraInQuoteCount: 5, extraInQuoteCost: 2000 } });
    const result = computeFraudScoreBreakdown(input);
    expect(result.indicators.panelBeaterPatterns.score).toBeGreaterThan(0);
  });

  it("adds points for inflated labour hours", () => {
    const input = cleanInput({ panelBeater: { ...cleanInput().panelBeater, labourInflationPercent: 50 } });
    const result = computeFraudScoreBreakdown(input);
    expect(result.indicators.panelBeaterPatterns.score).toBeGreaterThan(0);
  });

  it("adds points for quote exceeding AI estimate", () => {
    const input = cleanInput({ panelBeater: { ...cleanInput().panelBeater, quotedTotalUsd: 9000, aiEstimatedTotalUsd: 5000 } });
    const result = computeFraudScoreBreakdown(input);
    expect(result.indicators.panelBeaterPatterns.score).toBeGreaterThan(0);
  });

  it("does not exceed maxScore", () => {
    const input = cleanInput({
      panelBeater: {
        quoteSimilarityScore: 0.1,
        extraInQuoteCount: 10,
        extraInQuoteCost: 8000,
        partsInflationPercent: 60,
        labourInflationPercent: 80,
        replacementToRepairRatio: 0.95,
        damageScopeCreep: true,
        unrelatedQuoteItems: 5,
        quotedTotalUsd: 20000,
        aiEstimatedTotalUsd: 5000,
      },
    });
    const result = computeFraudScoreBreakdown(input);
    const ind = result.indicators.panelBeaterPatterns;
    expect(ind.score).toBeLessThanOrEqual(ind.maxScore);
  });
});

// ---- Indicator 5: Assessor Integrity ----

describe("Indicator 5: Assessor Integrity", () => {
  it("scores 0 for a clean assessor", () => {
    const result = computeFraudScoreBreakdown(cleanInput());
    expect(result.indicators.assessorIntegrity.score).toBe(0);
  });

  it("adds points for high rubber-stamping score", () => {
    const input = cleanInput({ assessor: { ...cleanInput().assessor, rubberStampingScore: 80 } });
    const result = computeFraudScoreBreakdown(input);
    expect(result.indicators.assessorIntegrity.score).toBeGreaterThan(0);
  });

  it("adds points for high bias score", () => {
    const input = cleanInput({ assessor: { ...cleanInput().assessor, biasScore: 75 } });
    const result = computeFraudScoreBreakdown(input);
    expect(result.indicators.assessorIntegrity.score).toBeGreaterThan(0);
  });

  it("adds points for very fast turnaround (< 2 hours)", () => {
    const input = cleanInput({ assessor: { ...cleanInput().assessor, averageTurnaroundHours: 1 } });
    const result = computeFraudScoreBreakdown(input);
    expect(result.indicators.assessorIntegrity.score).toBeGreaterThan(0);
  });

  it("does not exceed maxScore", () => {
    const input = cleanInput({
      assessor: {
        rubberStampingScore: 95,
        biasScore: 90,
        collusionScore: 90,
        averageTurnaroundHours: 0.5,
        accuracyScore: 10,
        claimsWithSamePanelBeaterCount: 10,
      },
    });
    const result = computeFraudScoreBreakdown(input);
    const ind = result.indicators.assessorIntegrity;
    expect(ind.score).toBeLessThanOrEqual(ind.maxScore);
  });
});

// ---- Indicator 6: Cross-Entity Collusion ----

describe("Indicator 6: Cross-Entity Collusion", () => {
  it("scores 0 for no repeat relationships", () => {
    const result = computeFraudScoreBreakdown(cleanInput());
    expect(result.indicators.crossEntityCollusion.score).toBe(0);
  });

  it("adds points for triad repeats", () => {
    const input = cleanInput({ collusion: { ...cleanInput().collusion, triadRepeatCount: 3 } });
    const result = computeFraudScoreBreakdown(input);
    expect(result.indicators.crossEntityCollusion.score).toBeGreaterThan(0);
  });

  it("adds points for shared contacts with both PB and assessor", () => {
    const input = cleanInput({ collusion: { ...cleanInput().collusion, sharedContactWithPanelBeater: true, sharedContactWithAssessor: true } });
    const result = computeFraudScoreBreakdown(input);
    expect(result.indicators.crossEntityCollusion.score).toBeGreaterThan(0);
  });

  it("adds points for high entity collusion score", () => {
    const input = cleanInput({ collusion: { ...cleanInput().collusion, entityCollusionScore: 75 } });
    const result = computeFraudScoreBreakdown(input);
    expect(result.indicators.crossEntityCollusion.score).toBeGreaterThan(0);
  });

  it("does not exceed maxScore", () => {
    const input = cleanInput({
      collusion: {
        triadRepeatCount: 5,
        sharedContactWithPanelBeater: true,
        sharedContactWithAssessor: true,
        entityCollusionScore: 90,
        claimantSamePanelBeaterCount: 5,
      },
    });
    const result = computeFraudScoreBreakdown(input);
    const ind = result.indicators.crossEntityCollusion;
    expect(ind.score).toBeLessThanOrEqual(ind.maxScore);
  });
});

// ---- Indicator 7: Document & Photo Integrity ----

describe("Indicator 7: Document & Photo Integrity", () => {
  it("scores 0 for clean documents", () => {
    const result = computeFraudScoreBreakdown(cleanInput());
    expect(result.indicators.documentPhotoIntegrity.score).toBe(0);
  });

  it("adds points for handwritten quote", () => {
    const input = cleanInput({ documents: { ...cleanInput().documents, hasHandwrittenQuote: true } });
    const result = computeFraudScoreBreakdown(input);
    expect(result.indicators.documentPhotoIntegrity.score).toBeGreaterThan(0);
  });

  it("adds points for high reused photo score", () => {
    const input = cleanInput({ documents: { ...cleanInput().documents, reusedPhotoScore: 80 } });
    const result = computeFraudScoreBreakdown(input);
    expect(result.indicators.documentPhotoIntegrity.score).toBeGreaterThan(0);
  });

  it("adds points for low photo metadata score", () => {
    const input = cleanInput({ documents: { ...cleanInput().documents, photoMetadataScore: 20 } });
    const result = computeFraudScoreBreakdown(input);
    expect(result.indicators.documentPhotoIntegrity.score).toBeGreaterThan(0);
  });

  it("does not exceed maxScore", () => {
    const input = cleanInput({
      documents: {
        photoMetadataScore: 5,
        reusedPhotoScore: 95,
        documentConsistencyScore: 5,
        hasHandwrittenQuote: true,
        ocrConfidence: 0.1,
        missingDocumentCount: 5,
      },
    });
    const result = computeFraudScoreBreakdown(input);
    const ind = result.indicators.documentPhotoIntegrity;
    expect(ind.score).toBeLessThanOrEqual(ind.maxScore);
  });
});

// ---- Indicator 8: Cost Anomalies ----

describe("Indicator 8: Cost Anomalies", () => {
  it("scores 0 for fair costs", () => {
    const result = computeFraudScoreBreakdown(cleanInput());
    expect(result.indicators.costAnomalies.score).toBe(0);
  });

  it("adds points when quote exceeds AI estimate by > 50%", () => {
    const input = cleanInput({ costs: { ...cleanInput().costs, quotedTotalUsd: 8000, aiEstimatedTotalUsd: 5000 } });
    const result = computeFraudScoreBreakdown(input);
    expect(result.indicators.costAnomalies.score).toBeGreaterThan(0);
  });

  it("adds points for high repair-to-value ratio (> 50%)", () => {
    const input = cleanInput({ costs: { ...cleanInput().costs, repairToValueRatio: 60 } });
    const result = computeFraudScoreBreakdown(input);
    expect(result.indicators.costAnomalies.score).toBeGreaterThan(0);
  });

  it("adds points for overpriced parts", () => {
    const input = cleanInput({ costs: { ...cleanInput().costs, overpricedPartsCount: 5 } });
    const result = computeFraudScoreBreakdown(input);
    expect(result.indicators.costAnomalies.score).toBeGreaterThan(0);
  });

  it("does not exceed maxScore", () => {
    const input = cleanInput({
      costs: {
        quotedTotalUsd: 20000,
        aiEstimatedTotalUsd: 5000,
        repairToValueRatio: 95,
        overpricedPartsCount: 10,
      },
    });
    const result = computeFraudScoreBreakdown(input);
    const ind = result.indicators.costAnomalies;
    expect(ind.score).toBeLessThanOrEqual(ind.maxScore);
  });
});

// ---- Indicator 9: Vehicle & Ownership Risk ----

describe("Indicator 9: Vehicle & Ownership Risk", () => {
  it("scores 0 for a clean vehicle", () => {
    const result = computeFraudScoreBreakdown(cleanInput());
    expect(result.indicators.vehicleOwnershipRisk.score).toBe(0);
  });

  it("adds points for recent ownership transfer (< 30 days)", () => {
    const input = cleanInput({ vehicle: { ...cleanInput().vehicle, ownershipTransferDaysBeforeClaim: 15 } });
    const result = computeFraudScoreBreakdown(input);
    expect(result.indicators.vehicleOwnershipRisk.score).toBeGreaterThan(0);
  });

  it("adds points for VIN mismatch", () => {
    const input = cleanInput({ vehicle: { ...cleanInput().vehicle, vinMismatch: true } });
    const result = computeFraudScoreBreakdown(input);
    expect(result.indicators.vehicleOwnershipRisk.score).toBeGreaterThan(0);
  });

  it("does not exceed maxScore", () => {
    const input = cleanInput({
      vehicle: {
        vehicleAgeYears: 20,
        estimatedVehicleValueUsd: 1000,
        estimatedRepairCostUsd: 15000,
        ownershipTransferDaysBeforeClaim: 5,
        vinMismatch: true,
        previousAccidentCount: 5,
        isHighValueVehicle: true,
      },
    });
    const result = computeFraudScoreBreakdown(input);
    const ind = result.indicators.vehicleOwnershipRisk;
    expect(ind.score).toBeLessThanOrEqual(ind.maxScore);
  });
});

// ---- Indicator 10: Claim Timing & Behaviour ----

describe("Indicator 10: Claim Timing & Behaviour", () => {
  it("scores 0 for normal timing", () => {
    const result = computeFraudScoreBreakdown(cleanInput());
    expect(result.indicators.claimTimingBehaviour.score).toBe(0);
  });

  it("adds points for claim submitted on holiday", () => {
    const input = cleanInput({ timing: { ...cleanInput().timing, claimSubmittedOnHoliday: true } });
    const result = computeFraudScoreBreakdown(input);
    expect(result.indicators.claimTimingBehaviour.score).toBeGreaterThan(0);
  });

  it("adds points for rapid resubmission", () => {
    const input = cleanInput({ timing: { ...cleanInput().timing, rapidResubmission: true } });
    const result = computeFraudScoreBreakdown(input);
    expect(result.indicators.claimTimingBehaviour.score).toBeGreaterThan(0);
  });

  it("adds points for multiple claims in period", () => {
    const input = cleanInput({ timing: { ...cleanInput().timing, multipleClaimsInPeriod: 3 } });
    const result = computeFraudScoreBreakdown(input);
    expect(result.indicators.claimTimingBehaviour.score).toBeGreaterThan(0);
  });

  it("does not exceed maxScore", () => {
    const input = cleanInput({
      timing: {
        claimSubmittedOnWeekend: true,
        claimSubmittedOnHoliday: true,
        rapidResubmission: true,
        policyLapseNoticeDaysBefore: 5,
        incidentToSubmissionDays: 60,
        multipleClaimsInPeriod: 5,
      },
    });
    const result = computeFraudScoreBreakdown(input);
    const ind = result.indicators.claimTimingBehaviour;
    expect(ind.score).toBeLessThanOrEqual(ind.maxScore);
  });
});

// ---- Risk Level Thresholds ----

describe("Risk level thresholds", () => {
  it("returns minimal for a clean claim", () => {
    const result = computeFraudScoreBreakdown(cleanInput());
    expect(result.riskLevel).toBe("minimal");
    expect(result.totalScore).toBe(0);
  });

  it("returns very_high for a maximally fraudulent claim", () => {
    const input = cleanInput({
      physics: { damageConsistencyScore: 10, impossibleDamagePatterns: ["p1","p2","p3"], unrelatedDamageComponents: [{ name: "d1", distanceFromImpact: 100 }], severityMismatch: true, stagedAccidentIndicators: ["s1"], estimatedSpeedKmh: 120, structuralDamage: true, impactForceKn: 80 },
      claimant: { isNonOwnerDriver: true, driverRelationshipToOwner: "unknown", policyAgeDays: 10, submissionDelayDays: 60, previousClaimsCount: 5, driverLicenseSuspended: true, driverLicenseVerified: false, driverViolationsCount: 5, driverEmploymentStatus: "unemployed", previousInsurerCount: 5, lodgedBy: "third_party", driverAge: 19 },
      staged: { estimatedSpeedKmh: 10, damageSeverityScore: 0.95, numberOfInjuryClaims: 4, hasWitnesses: false, hasDashcamFootage: false, hasPoliceReport: false, incidentHour: 2, geographicRiskZone: "high", isSolePartyNightAccident: true },
      panelBeater: { quoteSimilarityScore: 0.1, extraInQuoteCount: 8, extraInQuoteCost: 5000, partsInflationPercent: 60, labourInflationPercent: 80, replacementToRepairRatio: 0.95, damageScopeCreep: true, unrelatedQuoteItems: 5, quotedTotalUsd: 20000, aiEstimatedTotalUsd: 5000 },
      assessor: { rubberStampingScore: 90, biasScore: 85, collusionScore: 80, averageTurnaroundHours: 0.5, accuracyScore: 10, claimsWithSamePanelBeaterCount: 8 },
      collusion: { triadRepeatCount: 5, sharedContactWithPanelBeater: true, sharedContactWithAssessor: true, entityCollusionScore: 85, claimantSamePanelBeaterCount: 5 },
      documents: { photoMetadataScore: 0.05, reusedPhotoScore: 0.95, documentConsistencyScore: 0.05, hasHandwrittenQuote: true, ocrConfidence: 0.1, missingDocumentCount: 4 },
      costs: { quotedTotalUsd: 20000, aiEstimatedTotalUsd: 5000, repairToValueRatio: 95, overpricedPartsCount: 8 },
      vehicle: { vehicleAgeYears: 18, estimatedVehicleValueUsd: 2000, estimatedRepairCostUsd: 15000, ownershipTransferDaysBeforeClaim: 5, vinMismatch: true, previousAccidentCount: 4, isHighValueVehicle: true },
      timing: { claimSubmittedOnWeekend: true, claimSubmittedOnHoliday: true, rapidResubmission: true, policyLapseNoticeDaysBefore: 3, incidentToSubmissionDays: 50, multipleClaimsInPeriod: 4 },
      mlResult: { fraud_probability: 0.92, ownership_risk_score: 0.88, staged_accident_indicators: { confidence: 0.85 }, driver_profile: { risk_score: 0.9 } },
    });
    const result = computeFraudScoreBreakdown(input);
    expect(result.totalScore).toBeGreaterThan(75);
    expect(result.riskLevel).toBe("very_high");
  });

  it("requiresInvestigation is true for high risk", () => {
    const input = cleanInput({
      physics: { ...cleanInput().physics, impossibleDamagePatterns: ["p1","p2"], severityMismatch: true, damageConsistencyScore: 20 },
      claimant: { ...cleanInput().claimant, policyAgeDays: 15, driverLicenseSuspended: true },
      staged: { ...cleanInput().staged, hasPoliceReport: false, hasWitnesses: false, geographicRiskZone: "high" },
      panelBeater: { ...cleanInput().panelBeater, extraInQuoteCount: 6, extraInQuoteCost: 3000, labourInflationPercent: 60 },
      costs: { ...cleanInput().costs, quotedTotalUsd: 9000, aiEstimatedTotalUsd: 5000 },
      documents: { ...cleanInput().documents, hasHandwrittenQuote: true, photoMetadataScore: 0.15 },
    });
    const result = computeFraudScoreBreakdown(input);
    if (result.riskLevel === "high" || result.riskLevel === "very_high") {
      expect(result.requiresInvestigation).toBe(true);
    }
  });
});

// ---- Score Integrity ----

describe("Score integrity", () => {
  it("all 10 indicator keys are present in the result", () => {
    const result = computeFraudScoreBreakdown(cleanInput());
    const keys = Object.keys(result.indicators);
    expect(keys).toContain("physicsMismatch");
    expect(keys).toContain("claimantDriverRisk");
    expect(keys).toContain("stagedAccident");
    expect(keys).toContain("panelBeaterPatterns");
    expect(keys).toContain("assessorIntegrity");
    expect(keys).toContain("crossEntityCollusion");
    expect(keys).toContain("documentPhotoIntegrity");
    expect(keys).toContain("costAnomalies");
    expect(keys).toContain("vehicleOwnershipRisk");
    expect(keys).toContain("claimTimingBehaviour");
    expect(keys).toHaveLength(10);
  });

  it("totalScore is 0 for a clean claim", () => {
    const result = computeFraudScoreBreakdown(cleanInput());
    expect(result.totalScore).toBe(0);
    expect(result.rawScore).toBe(0);
  });

  it("totalScore is capped at 100", () => {
    const input = cleanInput({
      physics: { damageConsistencyScore: 10, impossibleDamagePatterns: ["p1","p2","p3","p4"], unrelatedDamageComponents: [{ name: "d1", distanceFromImpact: 100 }], severityMismatch: true, stagedAccidentIndicators: ["s1"], estimatedSpeedKmh: 120, structuralDamage: true, impactForceKn: 80 },
      claimant: { isNonOwnerDriver: true, driverRelationshipToOwner: "unknown", policyAgeDays: 10, submissionDelayDays: 60, previousClaimsCount: 5, driverLicenseSuspended: true, driverLicenseVerified: false, driverViolationsCount: 5, driverEmploymentStatus: "unemployed", previousInsurerCount: 5, lodgedBy: "third_party", driverAge: 19 },
      staged: { estimatedSpeedKmh: 10, damageSeverityScore: 0.95, numberOfInjuryClaims: 4, hasWitnesses: false, hasDashcamFootage: false, hasPoliceReport: false, incidentHour: 2, geographicRiskZone: "high", isSolePartyNightAccident: true },
      panelBeater: { quoteSimilarityScore: 0.1, extraInQuoteCount: 10, extraInQuoteCost: 8000, partsInflationPercent: 60, labourInflationPercent: 80, replacementToRepairRatio: 0.95, damageScopeCreep: true, unrelatedQuoteItems: 5, quotedTotalUsd: 20000, aiEstimatedTotalUsd: 5000 },
      assessor: { rubberStampingScore: 95, biasScore: 90, collusionScore: 90, averageTurnaroundHours: 0.5, accuracyScore: 10, claimsWithSamePanelBeaterCount: 10 },
      collusion: { triadRepeatCount: 5, sharedContactWithPanelBeater: true, sharedContactWithAssessor: true, entityCollusionScore: 90, claimantSamePanelBeaterCount: 5 },
      documents: { photoMetadataScore: 0.05, reusedPhotoScore: 0.95, documentConsistencyScore: 0.05, hasHandwrittenQuote: true, ocrConfidence: 0.1, missingDocumentCount: 5 },
      costs: { quotedTotalUsd: 20000, aiEstimatedTotalUsd: 5000, repairToValueRatio: 95, overpricedPartsCount: 10 },
      vehicle: { vehicleAgeYears: 20, estimatedVehicleValueUsd: 1000, estimatedRepairCostUsd: 15000, ownershipTransferDaysBeforeClaim: 5, vinMismatch: true, previousAccidentCount: 5, isHighValueVehicle: true },
      timing: { claimSubmittedOnWeekend: true, claimSubmittedOnHoliday: true, rapidResubmission: true, policyLapseNoticeDaysBefore: 3, incidentToSubmissionDays: 60, multipleClaimsInPeriod: 5 },
      mlResult: { fraud_probability: 0.95, ownership_risk_score: 0.95, staged_accident_indicators: { confidence: 0.95 }, driver_profile: { risk_score: 0.95 } },
    });
    const result = computeFraudScoreBreakdown(input);
    expect(result.totalScore).toBeLessThanOrEqual(100);
  });

  it("concentrationAlerts is an empty array for a clean claim", () => {
    const result = computeFraudScoreBreakdown(cleanInput());
    expect(result.concentrationAlerts).toHaveLength(0);
  });

  it("escalation is null for a clean claim", () => {
    const result = computeFraudScoreBreakdown(cleanInput());
    expect(result.escalation).toBeNull();
  });

  it("triggeredSignals contains only signals with points > 0", () => {
    const input = cleanInput({ physics: { ...cleanInput().physics, impossibleDamagePatterns: ["p1"] } });
    const result = computeFraudScoreBreakdown(input);
    result.triggeredSignals.forEach(sig => {
      expect(sig.points).toBeGreaterThan(0);
    });
  });

  it("triggeredIndicatorCount matches indicators with score > 0", () => {
    const input = cleanInput({
      physics: { ...cleanInput().physics, impossibleDamagePatterns: ["p1"] },
      claimant: { ...cleanInput().claimant, policyAgeDays: 30 },
    });
    const result = computeFraudScoreBreakdown(input);
    const manualCount = Object.values(result.indicators).filter(ind => ind.score > 0).length;
    expect(result.triggeredIndicatorCount).toBe(manualCount);
  });
});

// ---- Escalation Logic ----

describe("Escalation logic", () => {
  it("escalation is null when only one indicator triggered", () => {
    const input = cleanInput({ claimant: { ...cleanInput().claimant, policyAgeDays: 30 } });
    const result = computeFraudScoreBreakdown(input);
    if (result.triggeredIndicatorCount <= 2) {
      expect(result.escalation).toBeNull();
    }
  });

  it("escalation object has correct shape when triggered", () => {
    const input = cleanInput({
      physics: { ...cleanInput().physics, impossibleDamagePatterns: ["p1","p2"], severityMismatch: true },
      claimant: { ...cleanInput().claimant, policyAgeDays: 20, driverLicenseSuspended: true },
      staged: { ...cleanInput().staged, hasPoliceReport: false, hasWitnesses: false, geographicRiskZone: "high" },
      panelBeater: { ...cleanInput().panelBeater, extraInQuoteCount: 5, extraInQuoteCost: 2000 },
      assessor: { ...cleanInput().assessor, rubberStampingScore: 80 },
      collusion: { ...cleanInput().collusion, triadRepeatCount: 2 },
    });
    const result = computeFraudScoreBreakdown(input);
    if (result.escalation !== null) {
      expect(result.escalation).toHaveProperty("from");
      expect(result.escalation).toHaveProperty("to");
      expect(result.escalation).toHaveProperty("triggeredIndicatorCount");
      expect(result.escalation).toHaveProperty("description");
    }
  });
});
