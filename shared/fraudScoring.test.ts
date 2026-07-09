/**
 * shared/fraudScoring.test.ts
 *
 * Canonical boundary tests for scoreToFraudLevel() — KINGA-FSS-2026-001.
 *
 * These tests are the authoritative specification for the fraud scoring bands.
 * Every boundary point is tested explicitly. Any change to these thresholds
 * MUST be accompanied by a revision to docs/KINGA-FRAUD-SCORING-STANDARD.md
 * and a version bump to the standard identifier.
 *
 * Bands under test:
 *   0–19   → "minimal"
 *   20–39  → "low"
 *   40–60  → "moderate"
 *   61–80  → "high"
 *   81–100 → "elevated"
 */

import { describe, it, expect } from "vitest";
import { scoreToFraudLevel, type FraudRiskLevel } from "./fraudScoring";

// ─── Boundary tests ───────────────────────────────────────────────────────────

describe("scoreToFraudLevel — KINGA-FSS-2026-001 canonical band boundaries", () => {

  // ── Band 1: minimal (0–19) ──────────────────────────────────────────────────

  it("score=0 → minimal (lower bound of minimal band)", () => {
    expect(scoreToFraudLevel(0)).toBe("minimal");
  });

  it("score=1 → minimal (interior of minimal band)", () => {
    expect(scoreToFraudLevel(1)).toBe("minimal");
  });

  it("score=10 → minimal (midpoint of minimal band)", () => {
    expect(scoreToFraudLevel(10)).toBe("minimal");
  });

  it("score=18 → minimal (interior near upper bound)", () => {
    expect(scoreToFraudLevel(18)).toBe("minimal");
  });

  it("score=19 → minimal (upper bound of minimal band — CRITICAL BOUNDARY)", () => {
    expect(scoreToFraudLevel(19)).toBe("minimal");
  });

  // ── Band 2: low (20–39) ────────────────────────────────────────────────────

  it("score=20 → low (lower bound of low band — CRITICAL BOUNDARY)", () => {
    expect(scoreToFraudLevel(20)).toBe("low");
  });

  it("score=21 → low (interior of low band)", () => {
    expect(scoreToFraudLevel(21)).toBe("low");
  });

  it("score=29 → low (midpoint of low band)", () => {
    expect(scoreToFraudLevel(29)).toBe("low");
  });

  it("score=38 → low (interior near upper bound)", () => {
    expect(scoreToFraudLevel(38)).toBe("low");
  });

  it("score=39 → low (upper bound of low band — CRITICAL BOUNDARY)", () => {
    expect(scoreToFraudLevel(39)).toBe("low");
  });

  // ── Band 3: moderate (40–60) ───────────────────────────────────────────────

  it("score=40 → moderate (lower bound of moderate band — CRITICAL BOUNDARY)", () => {
    expect(scoreToFraudLevel(40)).toBe("moderate");
  });

  it("score=41 → moderate (interior of moderate band)", () => {
    expect(scoreToFraudLevel(41)).toBe("moderate");
  });

  it("score=50 → moderate (midpoint of moderate band)", () => {
    expect(scoreToFraudLevel(50)).toBe("moderate");
  });

  it("score=59 → moderate (interior near upper bound)", () => {
    expect(scoreToFraudLevel(59)).toBe("moderate");
  });

  it("score=60 → moderate (upper bound of moderate band — CRITICAL BOUNDARY)", () => {
    expect(scoreToFraudLevel(60)).toBe("moderate");
  });

  // ── Band 4: high (61–80) ───────────────────────────────────────────────────

  it("score=61 → high (lower bound of high band — CRITICAL BOUNDARY)", () => {
    expect(scoreToFraudLevel(61)).toBe("high");
  });

  it("score=62 → high (interior of high band)", () => {
    expect(scoreToFraudLevel(62)).toBe("high");
  });

  it("score=70 → high (midpoint of high band)", () => {
    expect(scoreToFraudLevel(70)).toBe("high");
  });

  it("score=79 → high (interior near upper bound)", () => {
    expect(scoreToFraudLevel(79)).toBe("high");
  });

  it("score=80 → high (upper bound of high band — CRITICAL BOUNDARY)", () => {
    expect(scoreToFraudLevel(80)).toBe("high");
  });

  // ── Band 5: elevated (81–100) ─────────────────────────────────────────────

  it("score=81 → elevated (lower bound of elevated band — CRITICAL BOUNDARY)", () => {
    expect(scoreToFraudLevel(81)).toBe("elevated");
  });

  it("score=82 → elevated (interior of elevated band)", () => {
    expect(scoreToFraudLevel(82)).toBe("elevated");
  });

  it("score=90 → elevated (midpoint of elevated band)", () => {
    expect(scoreToFraudLevel(90)).toBe("elevated");
  });

  it("score=99 → elevated (interior near upper bound)", () => {
    expect(scoreToFraudLevel(99)).toBe("elevated");
  });

  it("score=100 → elevated (upper bound of elevated band)", () => {
    expect(scoreToFraudLevel(100)).toBe("elevated");
  });

  // ── Cross-boundary non-regression ─────────────────────────────────────────
  // Ensure adjacent bands do not bleed into each other

  it("score=19 is NOT low (band 1 upper bound must not bleed into band 2)", () => {
    expect(scoreToFraudLevel(19)).not.toBe("low");
  });

  it("score=20 is NOT minimal (band 2 lower bound must not bleed into band 1)", () => {
    expect(scoreToFraudLevel(20)).not.toBe("minimal");
  });

  it("score=39 is NOT moderate (band 2 upper bound must not bleed into band 3)", () => {
    expect(scoreToFraudLevel(39)).not.toBe("moderate");
  });

  it("score=40 is NOT low (band 3 lower bound must not bleed into band 2)", () => {
    expect(scoreToFraudLevel(40)).not.toBe("low");
  });

  it("score=60 is NOT high (band 3 upper bound must not bleed into band 4)", () => {
    expect(scoreToFraudLevel(60)).not.toBe("high");
  });

  it("score=61 is NOT moderate (band 4 lower bound must not bleed into band 3)", () => {
    expect(scoreToFraudLevel(61)).not.toBe("moderate");
  });

  it("score=80 is NOT elevated (band 4 upper bound must not bleed into band 5)", () => {
    expect(scoreToFraudLevel(80)).not.toBe("elevated");
  });

  it("score=81 is NOT high (band 5 lower bound must not bleed into band 4)", () => {
    expect(scoreToFraudLevel(81)).not.toBe("high");
  });

  // ── Type safety ───────────────────────────────────────────────────────────

  it("return type is assignable to FraudRiskLevel", () => {
    const level: FraudRiskLevel = scoreToFraudLevel(50);
    expect(level).toBe("moderate");
  });

  it("never returns 'medium' (legacy alias — not part of KINGA-FSS-2026-001)", () => {
    const allScores = [0, 10, 19, 20, 30, 39, 40, 50, 60, 61, 70, 80, 81, 90, 100];
    for (const score of allScores) {
      expect(scoreToFraudLevel(score)).not.toBe("medium");
    }
  });

  // ── Input validation ──────────────────────────────────────────────────────

  it("throws RangeError for score=-1 (below valid range)", () => {
    expect(() => scoreToFraudLevel(-1)).toThrow(RangeError);
  });

  it("throws RangeError for score=101 (above valid range)", () => {
    expect(() => scoreToFraudLevel(101)).toThrow(RangeError);
  });

  it("throws RangeError for NaN", () => {
    expect(() => scoreToFraudLevel(NaN)).toThrow(RangeError);
  });

  it("throws RangeError for Infinity", () => {
    expect(() => scoreToFraudLevel(Infinity)).toThrow(RangeError);
  });

  it("throws RangeError for -Infinity", () => {
    expect(() => scoreToFraudLevel(-Infinity)).toThrow(RangeError);
  });

  // ── Decimal scores (real-world composite scores may not be integers) ───────

  it("score=19.9 → minimal (decimal just below band 2 boundary)", () => {
    expect(scoreToFraudLevel(19.9)).toBe("minimal");
  });

  it("score=20.0 → low (decimal at exact band 2 boundary)", () => {
    expect(scoreToFraudLevel(20.0)).toBe("low");
  });

  it("score=39.99 → low (decimal just below band 3 boundary)", () => {
    expect(scoreToFraudLevel(39.99)).toBe("low");
  });

  it("score=60.5 → moderate (decimal inside band 3)", () => {
    expect(scoreToFraudLevel(60.5)).toBe("moderate");
  });

  it("score=80.99 → high (decimal just below band 5 boundary)", () => {
    expect(scoreToFraudLevel(80.99)).toBe("high");
  });

});

// ─── Regression: legacy off-by-one guard ─────────────────────────────────────
// The legacy report-normalisation.ts used threshold >= 21 for "low" (off by one).
// These tests explicitly guard against that regression being re-introduced.

describe("scoreToFraudLevel — regression guard against legacy off-by-one errors", () => {

  it("score=20 returns 'low' not 'minimal' (legacy bug: >= 21 threshold would fail this)", () => {
    expect(scoreToFraudLevel(20)).toBe("low");
  });

  it("score=40 returns 'moderate' not 'low' (legacy bug: >= 41 threshold would fail this)", () => {
    expect(scoreToFraudLevel(40)).toBe("moderate");
  });

  it("score=61 returns 'high' not 'moderate' (legacy bug: >= 62 threshold would fail this)", () => {
    expect(scoreToFraudLevel(61)).toBe("high");
  });

  it("score=81 returns 'elevated' not 'high' (legacy bug: >= 82 threshold would fail this)", () => {
    expect(scoreToFraudLevel(81)).toBe("elevated");
  });

});
