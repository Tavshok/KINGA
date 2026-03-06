/**
 * confidence-scoring.test.ts
 *
 * Comprehensive tests for the 8-input AI confidence scoring engine.
 * Uses the exact ConfidenceScoringInput / ConfidenceScoreBreakdown interfaces
 * as defined in confidence-scoring.ts.
 */

import { describe, it, expect } from "vitest";
import {
  computeConfidenceScore,
  buildConfidenceScoringInput,
  type ConfidenceScoringInput,
} from "./confidence-scoring";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeFullInput(overrides: Partial<ConfidenceScoringInput> = {}): ConfidenceScoringInput {
  return {
    image: {
      qualityScore: 90,
      scaleCalibrationConfidence: 85,
      photoAnglesCount: 4,
      referenceObjectsCount: 2,
      recommendResubmission: false,
      crushDepthConfidence: 88,
    },
    damage: {
      damagedComponentsCount: 8,
      crushDepthConfidence: 88,
      severitySpread: 80,
      hasStructuralDamage: true,
      missingDataFlagsCount: 0,
    },
    physics: {
      consistencyScore: 92,
      deviationScore: 10,
      speedEstimateConfidence: 85,
      massSource: "explicit",
      available: true,
    },
    quote: {
      totalComponents: 10,
      matchedCount: 10,
      extraInQuoteCount: 0,
      missingFromQuoteCount: 0,
      costDeviationPct: 5,
      available: true,
    },
    vehicle: {
      vinPresent: true,
      vinValidFormat: true,
      registrationPresent: true,
      engineNumberPresent: true,
      yearPresent: true,
      colourPresent: true,
      makePresent: true,
      modelPresent: true,
      massKg: 1500,
      massSource: "explicit",
    },
    document: {
      ownerNamePresent: true,
      incidentDatePresent: true,
      repairerNamePresent: true,
      incidentDescriptionPresent: true,
      incidentLocationPresent: true,
      thirdPartyDetailsPresent: true,
      policeReportPresent: true,
    },
    consistency: {
      makeModelMatchesClaim: true,
      incidentDatePlausible: true,
      vinFormatValid: true,
      registrationFormatValid: true,
    },
    fraud: {
      fraudScore: 10,
      fraudLevel: "minimal",
      indicatorCount: 1,
    },
    ...overrides,
  };
}

// ─── End-to-end score tests ───────────────────────────────────────────────────

describe("computeConfidenceScore — end-to-end", () => {
  it("returns a score between 0 and 100", () => {
    const result = computeConfidenceScore(makeFullInput());
    expect(result.finalScore).toBeGreaterThanOrEqual(0);
    expect(result.finalScore).toBeLessThanOrEqual(100);
  });

  it("returns very_high level for a perfect input", () => {
    const result = computeConfidenceScore(makeFullInput());
    expect(result.finalScore).toBeGreaterThanOrEqual(85);
    expect(result.level).toBe("very_high");
  });

  it("returns a lower score when image quality is poor", () => {
    const good = computeConfidenceScore(makeFullInput());
    const poor = computeConfidenceScore(makeFullInput({
      image: {
        qualityScore: 20,
        scaleCalibrationConfidence: 20,
        photoAnglesCount: 1,
        referenceObjectsCount: 0,
        recommendResubmission: true,
        crushDepthConfidence: 20,
      },
    }));
    expect(poor.finalScore).toBeLessThan(good.finalScore);
  });

  it("returns a lower score when physics consistency is poor", () => {
    const good = computeConfidenceScore(makeFullInput());
    const poor = computeConfidenceScore(makeFullInput({
      physics: {
        consistencyScore: 20,
        deviationScore: 80,
        speedEstimateConfidence: 30,
        massSource: "not_available",
        available: true,
      },
    }));
    expect(poor.finalScore).toBeLessThan(good.finalScore);
  });

  it("returns a lower score when quote reconciliation is poor", () => {
    const good = computeConfidenceScore(makeFullInput());
    const poor = computeConfidenceScore(makeFullInput({
      quote: {
        totalComponents: 10,
        matchedCount: 2,
        extraInQuoteCount: 5,
        missingFromQuoteCount: 3,
        costDeviationPct: 80,
        available: true,
      },
    }));
    expect(poor.finalScore).toBeLessThan(good.finalScore);
  });

  it("returns a lower score when vehicle data is incomplete", () => {
    const good = computeConfidenceScore(makeFullInput());
    const poor = computeConfidenceScore(makeFullInput({
      vehicle: {
        vinPresent: false,
        vinValidFormat: false,
        registrationPresent: false,
        engineNumberPresent: false,
        yearPresent: false,
        colourPresent: false,
        makePresent: false,
        modelPresent: false,
        massKg: null,
        massSource: "not_available",
      },
    }));
    expect(poor.finalScore).toBeLessThan(good.finalScore);
  });

  it("handles unavailable quote input gracefully (score > 0)", () => {
    const withoutQuote = computeConfidenceScore(makeFullInput({
      quote: {
        totalComponents: 0,
        matchedCount: 0,
        extraInQuoteCount: 0,
        missingFromQuoteCount: 0,
        costDeviationPct: 0,
        available: false,
      },
    }));
    expect(withoutQuote.finalScore).toBeGreaterThan(0);
    // Quote input should show as unavailable
    expect(withoutQuote.inputs["quote"]?.available).toBe(false);
  });

  it("returns a summary string", () => {
    const result = computeConfidenceScore(makeFullInput());
    expect(typeof result.summary).toBe("string");
    expect(result.summary.length).toBeGreaterThan(0);
  });
});

// ─── Confidence levels ────────────────────────────────────────────────────────

describe("computeConfidenceScore — confidence levels", () => {
  it("labels score >= 85 as very_high", () => {
    const result = computeConfidenceScore(makeFullInput());
    expect(result.finalScore).toBeGreaterThanOrEqual(85);
    expect(result.level).toBe("very_high");
  });

  it("labels a degraded input as a lower level", () => {
    const result = computeConfidenceScore(makeFullInput({
      image: { qualityScore: 45, scaleCalibrationConfidence: 40, photoAnglesCount: 1, referenceObjectsCount: 0, recommendResubmission: false, crushDepthConfidence: 40 },
      damage: { damagedComponentsCount: 2, crushDepthConfidence: 45, severitySpread: 30, hasStructuralDamage: false, missingDataFlagsCount: 2 },
      physics: { consistencyScore: 50, deviationScore: 50, speedEstimateConfidence: 50, massSource: "inferred_class", available: true },
      quote: { totalComponents: 10, matchedCount: 3, extraInQuoteCount: 3, missingFromQuoteCount: 4, costDeviationPct: 40, available: true },
      vehicle: { vinPresent: false, vinValidFormat: false, registrationPresent: true, engineNumberPresent: false, yearPresent: true, colourPresent: false, makePresent: true, modelPresent: false, massKg: null, massSource: "inferred_class" },
      document: { ownerNamePresent: true, incidentDatePresent: false, repairerNamePresent: false, incidentDescriptionPresent: true, incidentLocationPresent: false, thirdPartyDetailsPresent: false, policeReportPresent: false },
    }));
    expect(["moderate", "low", "very_low"]).toContain(result.level);
  });

  it("labels a very poor input as low or very_low", () => {
    const result = computeConfidenceScore(makeFullInput({
      image: { qualityScore: 10, scaleCalibrationConfidence: 10, photoAnglesCount: 0, referenceObjectsCount: 0, recommendResubmission: true, crushDepthConfidence: 10 },
      damage: { damagedComponentsCount: 0, crushDepthConfidence: 10, severitySpread: 0, hasStructuralDamage: false, missingDataFlagsCount: 6 },
      physics: { consistencyScore: 10, deviationScore: 90, speedEstimateConfidence: 10, massSource: "not_available", available: true },
      quote: { totalComponents: 10, matchedCount: 0, extraInQuoteCount: 8, missingFromQuoteCount: 2, costDeviationPct: 120, available: true },
      vehicle: { vinPresent: false, vinValidFormat: false, registrationPresent: false, engineNumberPresent: false, yearPresent: false, colourPresent: false, makePresent: false, modelPresent: false, massKg: null, massSource: "not_available" },
      document: { ownerNamePresent: false, incidentDatePresent: false, repairerNamePresent: false, incidentDescriptionPresent: false, incidentLocationPresent: false, thirdPartyDetailsPresent: false, policeReportPresent: false },
      consistency: { makeModelMatchesClaim: false, incidentDatePlausible: false, vinFormatValid: false, registrationFormatValid: false },
      fraud: { fraudScore: 85, fraudLevel: "very_high", indicatorCount: 9 },
    }));
    expect(["low", "very_low"]).toContain(result.level);
  });
});

// ─── Hard penalty gates ───────────────────────────────────────────────────────

describe("computeConfidenceScore — hard penalty gates", () => {
  it("caps score at 65% when recommendResubmission is true", () => {
    const result = computeConfidenceScore(makeFullInput({
      image: { qualityScore: 90, scaleCalibrationConfidence: 90, photoAnglesCount: 4, referenceObjectsCount: 2, recommendResubmission: true, crushDepthConfidence: 90 },
    }));
    expect(result.finalScore).toBeLessThanOrEqual(65);
    const penalty = result.activePenalties.find(p => p.cap === 65);
    expect(penalty).toBeDefined();
  });

  it("caps score at 55% when imageQualityScore < 40", () => {
    const result = computeConfidenceScore(makeFullInput({
      image: { qualityScore: 30, scaleCalibrationConfidence: 90, photoAnglesCount: 4, referenceObjectsCount: 2, recommendResubmission: false, crushDepthConfidence: 90 },
    }));
    expect(result.finalScore).toBeLessThanOrEqual(55);
    const penalty = result.activePenalties.find(p => p.cap === 55);
    expect(penalty).toBeDefined();
  });

  it("caps score at 70% when missingDataFlags >= 3", () => {
    const result = computeConfidenceScore(makeFullInput({
      damage: {
        damagedComponentsCount: 8,
        crushDepthConfidence: 88,
        severitySpread: 80,
        hasStructuralDamage: true,
        missingDataFlagsCount: 3,
      },
    }));
    expect(result.finalScore).toBeLessThanOrEqual(70);
    const penalty = result.activePenalties.find(p => p.cap === 70);
    expect(penalty).toBeDefined();
  });

  it("caps score at 75% when physicsDeviationScore > 70", () => {
    const result = computeConfidenceScore(makeFullInput({
      physics: {
        consistencyScore: 90,
        deviationScore: 75,
        speedEstimateConfidence: 90,
        massSource: "explicit",
        available: true,
      },
    }));
    expect(result.finalScore).toBeLessThanOrEqual(75);
    const penalty = result.activePenalties.find(p => p.cap === 75);
    expect(penalty).toBeDefined();
  });

  it("caps score at 80% when fraud score > 70", () => {
    const result = computeConfidenceScore(makeFullInput({
      fraud: { fraudScore: 75, fraudLevel: "high", indicatorCount: 7 },
    }));
    expect(result.finalScore).toBeLessThanOrEqual(80);
    const penalty = result.activePenalties.find(p => p.cap === 80);
    expect(penalty).toBeDefined();
  });

  it("applies the most restrictive cap when multiple penalties are active", () => {
    const result = computeConfidenceScore(makeFullInput({
      // imageQuality < 40 (cap 55) AND recommendResubmission (cap 65) both active
      image: { qualityScore: 30, scaleCalibrationConfidence: 90, photoAnglesCount: 4, referenceObjectsCount: 2, recommendResubmission: true, crushDepthConfidence: 90 },
    }));
    expect(result.finalScore).toBeLessThanOrEqual(55);
  });

  it("does not apply penalty gates when conditions are not met", () => {
    const result = computeConfidenceScore(makeFullInput());
    expect(result.activePenalties).toHaveLength(0);
  });
});

// ─── Vehicle data completeness ────────────────────────────────────────────────

describe("computeConfidenceScore — vehicle data completeness", () => {
  it("gives a higher vehicle score when mass is explicit vs inferred_model", () => {
    const explicit = computeConfidenceScore(makeFullInput({
      vehicle: { vinPresent: true, vinValidFormat: true, registrationPresent: true, engineNumberPresent: true, yearPresent: true, colourPresent: true, makePresent: true, modelPresent: true, massKg: 1500, massSource: "explicit" },
    }));
    const inferred = computeConfidenceScore(makeFullInput({
      vehicle: { vinPresent: true, vinValidFormat: true, registrationPresent: true, engineNumberPresent: true, yearPresent: true, colourPresent: true, makePresent: true, modelPresent: true, massKg: 1500, massSource: "inferred_model" },
    }));
    expect(inferred.finalScore).toBeLessThanOrEqual(explicit.finalScore);
  });

  it("gives lower score for inferred_class vs inferred_model", () => {
    const inferredModel = computeConfidenceScore(makeFullInput({
      vehicle: { vinPresent: true, vinValidFormat: true, registrationPresent: true, engineNumberPresent: true, yearPresent: true, colourPresent: true, makePresent: true, modelPresent: true, massKg: 1500, massSource: "inferred_model" },
    }));
    const inferredClass = computeConfidenceScore(makeFullInput({
      vehicle: { vinPresent: true, vinValidFormat: true, registrationPresent: true, engineNumberPresent: true, yearPresent: true, colourPresent: true, makePresent: true, modelPresent: false, massKg: null, massSource: "inferred_class" },
    }));
    expect(inferredClass.finalScore).toBeLessThan(inferredModel.finalScore);
  });

  it("penalises not_available mass source vs explicit", () => {
    const explicit = computeConfidenceScore(makeFullInput());
    const notAvailable = computeConfidenceScore(makeFullInput({
      vehicle: { vinPresent: false, vinValidFormat: false, registrationPresent: false, engineNumberPresent: false, yearPresent: false, colourPresent: false, makePresent: false, modelPresent: false, massKg: null, massSource: "not_available" },
      physics: { consistencyScore: 90, deviationScore: 10, speedEstimateConfidence: 90, massSource: "not_available", available: true },
    }));
    expect(notAvailable.finalScore).toBeLessThan(explicit.finalScore);
  });
});

// ─── Improvement comments ─────────────────────────────────────────────────────

describe("computeConfidenceScore — improvement comments", () => {
  it("returns improvement suggestions when data is missing", () => {
    const result = computeConfidenceScore(makeFullInput({
      vehicle: { vinPresent: false, vinValidFormat: false, registrationPresent: false, engineNumberPresent: false, yearPresent: false, colourPresent: false, makePresent: true, modelPresent: true, massKg: null, massSource: "inferred_model" },
      document: { ownerNamePresent: false, incidentDatePresent: false, repairerNamePresent: false, incidentDescriptionPresent: true, incidentLocationPresent: false, thirdPartyDetailsPresent: false, policeReportPresent: false },
    }));
    expect(result.allImprovements.length).toBeGreaterThan(0);
  });

  it("returns no improvements for a perfect input", () => {
    const result = computeConfidenceScore(makeFullInput());
    expect(result.allImprovements).toHaveLength(0);
  });

  it("marks VIN as improvement when missing", () => {
    const result = computeConfidenceScore(makeFullInput({
      vehicle: { vinPresent: false, vinValidFormat: false, registrationPresent: true, engineNumberPresent: true, yearPresent: true, colourPresent: true, makePresent: true, modelPresent: true, massKg: 1500, massSource: "explicit" },
    }));
    const vinImprovement = result.allImprovements.find(i =>
      i.action.toLowerCase().includes("vin")
    );
    expect(vinImprovement).toBeDefined();
  });

  it("marks image resubmission as high priority when recommendResubmission is true", () => {
    const result = computeConfidenceScore(makeFullInput({
      image: { qualityScore: 45, scaleCalibrationConfidence: 40, photoAnglesCount: 1, referenceObjectsCount: 0, recommendResubmission: true, crushDepthConfidence: 40 },
    }));
    const resubmitImprovement = result.allImprovements.find(i =>
      i.action.toLowerCase().includes("photo") || i.action.toLowerCase().includes("image") || i.action.toLowerCase().includes("resubmit")
    );
    expect(resubmitImprovement).toBeDefined();
    expect(["critical", "high"]).toContain(resubmitImprovement?.severity);
  });

  it("includes positive potentialGain for each improvement", () => {
    const result = computeConfidenceScore(makeFullInput({
      vehicle: { vinPresent: false, vinValidFormat: false, registrationPresent: false, engineNumberPresent: false, yearPresent: false, colourPresent: false, makePresent: true, modelPresent: true, massKg: null, massSource: "inferred_model" },
    }));
    result.allImprovements.forEach(imp => {
      expect(imp.potentialGain).toBeGreaterThanOrEqual(0);
    });
    // At least some improvements should have positive gain
    const positiveGains = result.allImprovements.filter(i => i.potentialGain > 0);
    expect(positiveGains.length).toBeGreaterThan(0);
  });

  it("improvements are sorted by potentialGain descending", () => {
    const result = computeConfidenceScore(makeFullInput({
      vehicle: { vinPresent: false, vinValidFormat: false, registrationPresent: false, engineNumberPresent: false, yearPresent: false, colourPresent: false, makePresent: false, modelPresent: false, massKg: null, massSource: "not_available" },
      document: { ownerNamePresent: false, incidentDatePresent: false, repairerNamePresent: false, incidentDescriptionPresent: false, incidentLocationPresent: false, thirdPartyDetailsPresent: false, policeReportPresent: false },
    }));
    for (let i = 1; i < result.allImprovements.length; i++) {
      expect(result.allImprovements[i - 1].potentialGain).toBeGreaterThanOrEqual(
        result.allImprovements[i].potentialGain
      );
    }
  });
});

// ─── Adaptive weighting ───────────────────────────────────────────────────────

describe("computeConfidenceScore — adaptive weighting", () => {
  it("marks quote as unavailable when available = false", () => {
    const result = computeConfidenceScore(makeFullInput({
      quote: { totalComponents: 0, matchedCount: 0, extraInQuoteCount: 0, missingFromQuoteCount: 0, costDeviationPct: 0, available: false },
    }));
    expect(result.inputs["quote"]?.available).toBe(false);
  });

  it("redistributes weight so contributions sum to approximately finalScore", () => {
    const withoutQuote = computeConfidenceScore(makeFullInput({
      quote: { totalComponents: 0, matchedCount: 0, extraInQuoteCount: 0, missingFromQuoteCount: 0, costDeviationPct: 0, available: false },
    }));
    // Sum of contributions should roughly equal rawWeightedScore (before penalties)
    const contributionSum = Object.values(withoutQuote.inputs).reduce((s, i) => s + i.contribution, 0);
    expect(Math.abs(contributionSum - withoutQuote.rawWeightedScore)).toBeLessThan(5);
  });

  it("score is still > 0 when physics is unavailable", () => {
    const result = computeConfidenceScore(makeFullInput({
      physics: { consistencyScore: 0, deviationScore: 0, speedEstimateConfidence: 0, massSource: "not_available", available: false },
    }));
    expect(result.finalScore).toBeGreaterThan(0);
    expect(result.inputs["physics"]?.available).toBe(false);
  });
});

// ─── Breakdown structure ──────────────────────────────────────────────────────

describe("computeConfidenceScore — breakdown structure", () => {
  it("returns exactly 8 input breakdowns", () => {
    const result = computeConfidenceScore(makeFullInput());
    expect(Object.keys(result.inputs)).toHaveLength(8);
  });

  it("returns all expected input keys", () => {
    const result = computeConfidenceScore(makeFullInput());
    const keys = Object.keys(result.inputs);
    ["image", "damage", "physics", "quote", "vehicle", "document", "consistency", "fraud"].forEach(k => {
      expect(keys).toContain(k);
    });
  });

  it("each input has score, maxScore, contribution, weight, available, improvements", () => {
    const result = computeConfidenceScore(makeFullInput());
    Object.values(result.inputs).forEach(input => {
      expect(typeof input.score).toBe("number");
      expect(typeof input.maxScore).toBe("number");
      expect(typeof input.contribution).toBe("number");
      expect(typeof input.weight).toBe("number");
      expect(typeof input.available).toBe("boolean");
      expect(Array.isArray(input.improvements)).toBe(true);
    });
  });

  it("contribution <= weight for each available input (since score <= 100)", () => {
    const result = computeConfidenceScore(makeFullInput());
    Object.values(result.inputs).forEach(input => {
      if (input.available) {
        // contribution = score * weight/100, so contribution <= weight
        expect(input.contribution).toBeLessThanOrEqual(input.weight + 1);
      }
    });
  });

  it("sum of weights equals 100 for all available inputs", () => {
    const result = computeConfidenceScore(makeFullInput());
    const sum = Object.values(result.inputs).reduce((s, i) => s + i.weight, 0);
    expect(Math.round(sum)).toBe(100);
  });

  it("sum of weights equals 100 when quote is unavailable (adaptive)", () => {
    const result = computeConfidenceScore(makeFullInput({
      quote: { totalComponents: 0, matchedCount: 0, extraInQuoteCount: 0, missingFromQuoteCount: 0, costDeviationPct: 0, available: false },
    }));
    const sum = Object.values(result.inputs).reduce((s, i) => s + i.weight, 0);
    expect(Math.round(sum)).toBe(100);
  });
});

// ─── buildConfidenceScoringInput ──────────────────────────────────────────────

describe("buildConfidenceScoringInput", () => {
  const fullPipelineData = {
    imageQuality: {
      score: 85,
      scaleCalibrationConfidence: 80,
      photoAnglesAvailable: ["front", "rear", "left", "right"],
      referenceObjectsDetected: ["ruler", "coin"],
      recommendResubmission: false,
      crushDepthConfidence: 88,
    },
    damagedComponents: [
      { severity: "moderate", damageType: "surface" },
      { severity: "severe", damageType: "structural" },
      { severity: "minor", damageType: "surface" },
    ],
    missingDataFlags: [],
    physicsAnalysis: {
      consistencyScore: 90,
      speedEstimate: { confidence: 85 },
      available: true,
    },
    physicsDeviationScore: 15,
    massSource: "explicit" as const,
    partsReconciliation: [
      { status: "matched", quotedCost: 500 },
      { status: "matched", quotedCost: 300 },
      { status: "quoted_not_detected", quotedCost: 200 },
      { status: "detected_not_quoted", quotedCost: 0 },
    ],
    estimatedRepairCost: 8000,
    quoteTotal: 8500,
    quoteAvailable: true,
    vehicle: {
      vin: "WBA3A5G59DNP26082",
      registration: "ABC123GP",
      engineNumber: "N52B30A",
      year: 2018,
      colour: "Silver",
      make: "BMW",
      model: "3 Series",
      massKg: 1500,
    },
    extractedVehicle: { make: "BMW", model: "3 Series" },
    claimVehicle: { make: "BMW", model: "3 Series" },
    document: {
      ownerName: "John Smith",
      incidentDate: "2024-01-15",
      repairerName: "ABC Panel Beaters",
      incidentDescription: "Rear-end collision at intersection",
      incidentLocation: "Sandton, Johannesburg",
      thirdPartyDetails: "Third party vehicle involved",
      policeReportUrl: "https://example.com/report.pdf",
    },
    fraudScore: 15,
    fraudLevel: "minimal",
    fraudIndicatorCount: 1,
  };

  it("builds a valid input from full pipeline data", () => {
    const input = buildConfidenceScoringInput(fullPipelineData);
    expect(input.image.qualityScore).toBe(85);
    expect(input.image.photoAnglesCount).toBe(4);
    expect(input.damage.damagedComponentsCount).toBe(3);
    expect(input.damage.hasStructuralDamage).toBe(true);
    expect(input.physics.consistencyScore).toBe(90);
    expect(input.physics.available).toBe(true);
    expect(input.quote.available).toBe(true);
    expect(input.quote.matchedCount).toBe(2);
    expect(input.quote.extraInQuoteCount).toBe(1);
    expect(input.vehicle.vinPresent).toBe(true);
    expect(input.vehicle.vinValidFormat).toBe(true);
    expect(input.vehicle.massSource).toBe("explicit");
    expect(input.document.ownerNamePresent).toBe(true);
    expect(input.document.policeReportPresent).toBe(true);
    expect(input.consistency.makeModelMatchesClaim).toBe(true);
    expect(input.fraud.fraudScore).toBe(15);
  });

  it("handles missing pipeline data gracefully", () => {
    const input = buildConfidenceScoringInput({
      imageQuality: { score: 0, scaleCalibrationConfidence: 0, photoAnglesAvailable: [], referenceObjectsDetected: [], recommendResubmission: false, crushDepthConfidence: 0 },
      damagedComponents: [],
      missingDataFlags: [],
      physicsAnalysis: null,
      physicsDeviationScore: 0,
      massSource: "not_available",
      partsReconciliation: [],
      estimatedRepairCost: 0,
      quoteTotal: 0,
      quoteAvailable: false,
      vehicle: {},
      extractedVehicle: {},
      claimVehicle: {},
      document: {},
      fraudScore: 0,
      fraudLevel: "minimal",
      fraudIndicatorCount: 0,
    });
    expect(input.image.qualityScore).toBe(0);
    expect(input.quote.available).toBe(false);
    expect(input.vehicle.vinPresent).toBe(false);
    expect(input.vehicle.massSource).toBe("not_available");
    expect(input.physics.available).toBe(false);
    expect(input.fraud.fraudScore).toBe(0);
  });

  it("detects invalid VIN format", () => {
    const input = buildConfidenceScoringInput({
      ...fullPipelineData,
      vehicle: { ...fullPipelineData.vehicle, vin: "INVALID_VIN" },
    });
    expect(input.vehicle.vinPresent).toBe(true);
    expect(input.vehicle.vinValidFormat).toBe(false);
  });

  it("marks quote as unavailable when quoteAvailable is false", () => {
    const input = buildConfidenceScoringInput({
      ...fullPipelineData,
      quoteAvailable: false,
    });
    expect(input.quote.available).toBe(false);
  });

  it("detects make/model mismatch between extracted and claim vehicle", () => {
    const input = buildConfidenceScoringInput({
      ...fullPipelineData,
      extractedVehicle: { make: "Toyota", model: "Corolla" },
      claimVehicle: { make: "BMW", model: "3 Series" },
    });
    expect(input.consistency.makeModelMatchesClaim).toBe(false);
  });
});
