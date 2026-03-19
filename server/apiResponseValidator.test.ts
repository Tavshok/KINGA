/**
 * apiResponseValidator.test.ts
 *
 * Stage 27: API Response Validation & Auto-Healing Layer
 *
 * Tests for all five validation rules:
 *   1. Validate mapping: engine_output → api_response → ui_model
 *   2. Required UI fields: exists, correct type, non-null
 *   3. Auto-map known field renames (aliases)
 *   4. Log all mapping corrections: { field, original, corrected }
 *   5. Block ONLY if critical fields missing (claim_id, decision_verdict)
 *      Otherwise: auto-heal
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  getNestedValue,
  setNestedValue,
  matchesType,
  validateApiResponse,
  validateAiAssessmentResponse,
  validateClaimDetailResponse,
  validateAndHeal,
  getCorrectionLog,
  clearCorrectionLog,
  AI_ASSESSMENT_CONTRACT,
  CLAIM_DETAIL_CONTRACT,
  type FieldContract,
} from "./apiResponseValidator";

// ─── Utility tests ────────────────────────────────────────────────────────────

describe("getNestedValue", () => {
  it("reads a top-level field", () => {
    expect(getNestedValue({ a: 1 }, "a")).toBe(1);
  });

  it("reads a nested field", () => {
    expect(getNestedValue({ a: { b: { c: 42 } } }, "a.b.c")).toBe(42);
  });

  it("returns undefined for missing path", () => {
    expect(getNestedValue({ a: 1 }, "b")).toBeUndefined();
  });

  it("returns undefined when intermediate is null", () => {
    expect(getNestedValue({ a: null }, "a.b")).toBeUndefined();
  });

  it("returns undefined for null input", () => {
    expect(getNestedValue(null, "a")).toBeUndefined();
  });

  it("returns undefined for undefined input", () => {
    expect(getNestedValue(undefined, "a")).toBeUndefined();
  });
});

describe("setNestedValue", () => {
  it("sets a top-level field", () => {
    const obj: Record<string, unknown> = {};
    setNestedValue(obj, "a", 42);
    expect(obj.a).toBe(42);
  });

  it("sets a nested field, creating intermediate objects", () => {
    const obj: Record<string, unknown> = {};
    setNestedValue(obj, "a.b.c", "hello");
    expect((obj.a as any).b.c).toBe("hello");
  });

  it("overwrites an existing field", () => {
    const obj: Record<string, unknown> = { x: "old" };
    setNestedValue(obj, "x", "new");
    expect(obj.x).toBe("new");
  });
});

describe("matchesType", () => {
  it("validates string type", () => {
    expect(matchesType("hello", "string")).toBe(true);
    expect(matchesType(42, "string")).toBe(false);
    expect(matchesType(null, "string")).toBe(false);
  });

  it("validates number type", () => {
    expect(matchesType(42, "number")).toBe(true);
    expect(matchesType(NaN, "number")).toBe(false);
    expect(matchesType("42", "number")).toBe(false);
  });

  it("validates boolean type", () => {
    expect(matchesType(true, "boolean")).toBe(true);
    expect(matchesType(false, "boolean")).toBe(true);
    expect(matchesType(1, "boolean")).toBe(false);
  });

  it("validates array type", () => {
    expect(matchesType([], "array")).toBe(true);
    expect(matchesType([1, 2], "array")).toBe(true);
    expect(matchesType({}, "array")).toBe(false);
  });

  it("validates object type", () => {
    expect(matchesType({}, "object")).toBe(true);
    expect(matchesType([], "object")).toBe(false); // arrays are NOT objects
    expect(matchesType(null, "object")).toBe(false);
  });

  it("returns false for null/undefined regardless of type", () => {
    expect(matchesType(null, "string")).toBe(false);
    expect(matchesType(undefined, "number")).toBe(false);
  });
});

// ─── Core validator tests ─────────────────────────────────────────────────────

describe("validateApiResponse — Rule 2: required fields exist, correct type, non-null", () => {
  const contract: FieldContract[] = [
    { path: "score", type: "number", critical: false, fallback: 0 },
    { path: "label", type: "string", critical: false, fallback: "unknown" },
    { path: "tags", type: "array", critical: false, fallback: [] },
  ];

  it("passes when all fields are valid", () => {
    const result = validateApiResponse({ score: 80, label: "high", tags: ["a"] }, contract);
    expect(result.valid).toBe(true);
    expect(result.blocked).toBe(false);
    expect(result.corrections).toHaveLength(0);
  });

  it("applies fallback when field is missing", () => {
    const result = validateApiResponse({ score: 80 } as any, contract);
    expect(result.data.label).toBe("unknown");
    expect(result.data.tags).toEqual([]);
    expect(result.corrections.length).toBeGreaterThan(0);
  });

  it("applies fallback when field has wrong type", () => {
    const result = validateApiResponse({ score: "not-a-number", label: "ok", tags: [] } as any, contract);
    expect(result.data.score).toBe(0); // fallback applied
    expect(result.corrections.some(c => c.field === "score")).toBe(true);
  });

  it("NEVER returns null or undefined for the data field", () => {
    const result = validateApiResponse({} as any, contract);
    expect(result.data).not.toBeNull();
    expect(result.data).not.toBeUndefined();
  });
});

describe("validateApiResponse — Rule 3: auto-map known field renames (aliases)", () => {
  const contract: FieldContract[] = [
    {
      path: "physics.consistencyScore",
      type: "number",
      critical: false,
      fallback: 50,
      aliases: ["physics.damageConsistency.score", "consistencyScore", "damageConsistencyScore"],
    },
  ];

  it("auto-maps from legacy path physics.damageConsistency.score", () => {
    const data = { physics: { damageConsistency: { score: 75 } } };
    const result = validateApiResponse(data as any, contract);
    expect((result.data as any).physics.consistencyScore).toBe(75);
    expect(result.corrections.some(c => c.field === "physics.consistencyScore")).toBe(true);
    expect(result.corrections.find(c => c.field === "physics.consistencyScore")?.reason).toContain("auto-mapped from alias");
  });

  it("auto-maps from flat alias consistencyScore", () => {
    const data = { consistencyScore: 88 };
    const result = validateApiResponse(data as any, contract);
    expect((result.data as any).physics.consistencyScore).toBe(88);
  });

  it("uses fallback when no alias matches either", () => {
    const data = {};
    const result = validateApiResponse(data as any, contract);
    expect((result.data as any).physics.consistencyScore).toBe(50);
  });

  it("preserves original value when canonical path already has correct type", () => {
    const data = { physics: { consistencyScore: 92 } };
    const result = validateApiResponse(data as any, contract);
    expect((result.data as any).physics.consistencyScore).toBe(92);
    expect(result.corrections).toHaveLength(0);
  });
});

describe("validateApiResponse — Rule 4: log all mapping corrections", () => {
  beforeEach(() => clearCorrectionLog());

  const contract: FieldContract[] = [
    { path: "score", type: "number", critical: false, fallback: 0 },
    { path: "level", type: "string", critical: false, fallback: "low", aliases: ["fraudLevel", "risk_level"] },
  ];

  it("logs corrections with field, original, corrected, and timestamp", () => {
    validateApiResponse({ fraudLevel: "high" } as any, contract);
    const log = getCorrectionLog();
    expect(log.length).toBeGreaterThan(0);
    const correction = log.find(c => c.field === "level");
    expect(correction).toBeDefined();
    expect(correction?.original).toBeUndefined();
    expect(correction?.corrected).toBe("high");
    expect(correction?.timestamp).toBeDefined();
    expect(new Date(correction!.timestamp).getTime()).not.toBeNaN();
  });

  it("logs fallback corrections with reason", () => {
    validateApiResponse({} as any, contract);
    const log = getCorrectionLog();
    const fallbackCorrection = log.find(c => c.field === "score");
    expect(fallbackCorrection?.reason).toContain("fallback");
  });

  it("does NOT log corrections when all fields are valid", () => {
    clearCorrectionLog();
    validateApiResponse({ score: 80, level: "medium" }, contract);
    expect(getCorrectionLog()).toHaveLength(0);
  });
});

describe("validateApiResponse — Rule 5: block ONLY on critical missing fields", () => {
  const contract: FieldContract[] = [
    { path: "claimId", type: "number", critical: true },
    { path: "verdict", type: "string", critical: true },
    { path: "score", type: "number", critical: false, fallback: 0 },
  ];

  it("blocks when critical claimId is missing", () => {
    const result = validateApiResponse({ verdict: "FINALISE_CLAIM", score: 80 } as any, contract);
    expect(result.blocked).toBe(true);
    expect(result.unresolved).toContain("claimId");
  });

  it("blocks when critical verdict is missing", () => {
    const result = validateApiResponse({ claimId: 1, score: 80 } as any, contract);
    expect(result.blocked).toBe(true);
    expect(result.unresolved).toContain("verdict");
  });

  it("blocks when BOTH critical fields are missing", () => {
    const result = validateApiResponse({ score: 80 } as any, contract);
    expect(result.blocked).toBe(true);
    expect(result.unresolved).toContain("claimId");
    expect(result.unresolved).toContain("verdict");
  });

  it("does NOT block when only non-critical fields are missing", () => {
    const result = validateApiResponse({ claimId: 1, verdict: "FINALISE_CLAIM" } as any, contract);
    expect(result.blocked).toBe(false);
    expect(result.data.score).toBe(0); // fallback applied
  });

  it("auto-heals non-critical fields even when critical fields are present", () => {
    const result = validateApiResponse({ claimId: 1, verdict: "REVIEW_REQUIRED" } as any, contract);
    expect(result.blocked).toBe(false);
    expect(result.data.score).toBe(0);
    expect(result.corrections.some(c => c.field === "score")).toBe(true);
  });
});

// ─── AI Assessment contract tests ────────────────────────────────────────────

describe("AI_ASSESSMENT_CONTRACT — canonical field contract", () => {
  it("has exactly 2 critical fields: claimId and finalDecision.decision", () => {
    const criticalFields = AI_ASSESSMENT_CONTRACT.filter(f => f.critical);
    expect(criticalFields).toHaveLength(2);
    expect(criticalFields.map(f => f.path)).toContain("claimId");
    expect(criticalFields.map(f => f.path)).toContain("finalDecision.decision");
  });

  it("all non-critical fields have fallback values", () => {
    const nonCritical = AI_ASSESSMENT_CONTRACT.filter(f => !f.critical);
    for (const field of nonCritical) {
      expect(field.fallback).not.toBeUndefined();
    }
  });

  it("includes the canonical physics.damageConsistency.score → consistencyFlag.score mapping", () => {
    const consistencyField = AI_ASSESSMENT_CONTRACT.find(f => f.path === "consistencyFlag.score");
    expect(consistencyField).toBeDefined();
    expect(consistencyField?.aliases).toContain("physics.damageConsistency.score");
    expect(consistencyField?.aliases).toContain("physics.consistencyScore");
  });

  it("includes cost extraction required fields", () => {
    const paths = AI_ASSESSMENT_CONTRACT.map(f => f.path);
    expect(paths).toContain("costExtraction.ai_estimate");
    expect(paths).toContain("costExtraction.parts");
    expect(paths).toContain("costExtraction.labour");
    expect(paths).toContain("costExtraction.fair_range");
  });
});

describe("validateAiAssessmentResponse — full response validation", () => {
  const buildValidResponse = () => ({
    claimId: 42,
    finalDecision: {
      decision: "REVIEW_REQUIRED",
      label: "Review Required",
      color: "amber",
      primaryReason: "Additional verification needed.",
      recommendedActions: ["Review photos"],
      ruleTrace: [],
    },
    fraudLevelEnforced: "low",
    fraudLevelLabel: "Low Risk",
    fraudScoreBreakdown: { totalScore: 20, baseScore: 20, components: [], adjustments: [], level: "low", label: "Low Risk" },
    physicsInsight: "Impact consistent with reported damage.",
    consistencyFlag: { score: 80, flag: "consistent" },
    directionFlag: { flag: "consistent" },
    costExtraction: { ai_estimate: 3500, parts: 2000, labour: 1200, fair_range: { min: 2800, max: 4200 }, confidence: 75, itemised_parts: [], source: "extracted", basis: "AI extraction" },
    costBenchmark: { estimatedCostUsd: 3500 },
    costVerdict: { verdict: "within_range" },
    confidenceBreakdown: { finalScore: 75 },
    alerts: [],
    fraudScoreAdjustment: 0,
  });

  it("passes a fully valid response without corrections", () => {
    const response = buildValidResponse();
    const result = validateAiAssessmentResponse(response as any);
    expect(result).toBeDefined();
    expect((result as any).claimId).toBe(42);
  });

  it("auto-heals missing non-critical fields", () => {
    const response = buildValidResponse();
    delete (response as any).physicsInsight;
    delete (response as any).alerts;
    const result = validateAiAssessmentResponse(response as any, 42);
    expect((result as any).physicsInsight).toBe("Physics analysis data requires further review.");
    expect((result as any).alerts).toEqual([]);
  });

  it("throws when claimId is missing", () => {
    const response = buildValidResponse();
    delete (response as any).claimId;
    expect(() => validateAiAssessmentResponse(response as any)).toThrow();
  });

  it("throws when finalDecision.decision is missing", () => {
    const response = buildValidResponse();
    delete (response as any).finalDecision.decision;
    expect(() => validateAiAssessmentResponse(response as any)).toThrow();
  });

  it("auto-maps fraudRiskLevel alias to fraudLevelEnforced", () => {
    const response = buildValidResponse();
    delete (response as any).fraudLevelEnforced;
    (response as any).fraudRiskLevel = "medium";
    const result = validateAiAssessmentResponse(response as any, 42);
    expect((result as any).fraudLevelEnforced).toBe("medium");
  });

  it("auto-maps damageConsistencyScore alias to consistencyFlag.score", () => {
    const response = buildValidResponse();
    delete (response as any).consistencyFlag;
    (response as any).damageConsistencyScore = 65;
    const result = validateAiAssessmentResponse(response as any, 42);
    expect((result as any).consistencyFlag.score).toBe(65);
  });
});

// ─── Claim Detail contract tests ──────────────────────────────────────────────

describe("CLAIM_DETAIL_CONTRACT — canonical field contract", () => {
  it("has exactly 1 critical field: id", () => {
    const criticalFields = CLAIM_DETAIL_CONTRACT.filter(f => f.critical);
    expect(criticalFields).toHaveLength(1);
    expect(criticalFields[0].path).toBe("id");
  });

  it("all non-critical fields have fallback values", () => {
    const nonCritical = CLAIM_DETAIL_CONTRACT.filter(f => !f.critical);
    for (const field of nonCritical) {
      expect(field.fallback).not.toBeUndefined();
    }
  });
});

describe("validateClaimDetailResponse", () => {
  it("passes a valid claim detail response", () => {
    const claim = { id: 1, claimNumber: "CLM-001", status: "pending", currencyCode: "USD" };
    const result = validateClaimDetailResponse(claim as any, 1);
    expect((result as any).id).toBe(1);
  });

  it("auto-heals missing currencyCode with fallback USD", () => {
    const claim = { id: 1, claimNumber: "CLM-001", status: "pending" };
    const result = validateClaimDetailResponse(claim as any, 1);
    expect((result as any).currencyCode).toBe("USD");
  });

  it("throws when id is missing", () => {
    const claim = { claimNumber: "CLM-001", status: "pending" };
    expect(() => validateClaimDetailResponse(claim as any)).toThrow();
  });

  it("auto-maps claim_id alias to id", () => {
    const claim = { claim_id: 5, claimNumber: "CLM-005", status: "active" };
    const result = validateClaimDetailResponse(claim as any, 5);
    expect((result as any).id).toBe(5);
  });
});

// ─── validateAndHeal — never-block wrapper ────────────────────────────────────

describe("validateAndHeal", () => {
  const contract: FieldContract[] = [
    { path: "id", type: "number", critical: true }, // critical but validateAndHeal never blocks
    { path: "name", type: "string", critical: false, fallback: "unknown" },
  ];

  it("NEVER blocks even when critical fields are missing", () => {
    const result = validateAndHeal({ name: "test" } as any, contract);
    expect(result).toBeDefined();
    expect(result.name).toBe("test");
  });

  it("still applies fallbacks for non-critical fields", () => {
    const result = validateAndHeal({ id: 1 } as any, contract);
    expect(result.name).toBe("unknown");
  });
});

// ─── Summary string tests ─────────────────────────────────────────────────────

describe("ValidationResult.summary", () => {
  const contract: FieldContract[] = [
    { path: "id", type: "number", critical: true },
    { path: "score", type: "number", critical: false, fallback: 0 },
  ];

  it("returns 'All fields valid' when no corrections needed", () => {
    const result = validateApiResponse({ id: 1, score: 80 }, contract);
    expect(result.summary).toContain("All fields valid");
  });

  it("returns correction summary when fields were healed", () => {
    const result = validateApiResponse({ id: 1 } as any, contract);
    expect(result.summary).toContain("Auto-healed");
    expect(result.summary).toContain("score");
  });

  it("returns BLOCKED summary when critical field is missing", () => {
    const result = validateApiResponse({ score: 80 } as any, contract);
    expect(result.summary).toContain("BLOCKED");
    expect(result.summary).toContain("id");
  });
});
