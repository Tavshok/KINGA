/**
 * mechanicalAlignmentEvaluator.test.ts
 *
 * Unit tests for the forensic mechanical alignment evaluator.
 */

import { describe, it, expect } from "vitest";
import { evaluateMechanicalAlignment } from "./mechanicalAlignmentEvaluator";

// ─── Isuzu D-Max AEX 6208 real-world test ────────────────────────────────────

const ISUZU_DAMAGE = [
  "Rear Bumper",
  "Rear Bumper Sensors",
  "RHS Tail Lamp",
  "Tailgate",
  "Rear End Piece",
  "RHS Loading Panel",
  "Front Bumper",
  "Front Bumper Slides",
  "Grille",
  "Radiator Support Panel",
  "Tow Hinge",
  "Diff Connectors",
];

const ISUZU_QUOTE = [
  "rear bumper",
  "parking sensors",
  "rhs tail lamp",
  "tailgate",
  "rear end piece",
  "loading panel",
  "front bumper",
  "bumper slides",
  "grille",
  "radiator support panel",
  "tow hinge",
  "diff connectors",
];

const ISUZU_PHYSICS = "Rear chain collision — insured vehicle struck third party from behind; third party then struck vehicle ahead. Multi-zone damage: rear primary, front reaction load.";

describe("Isuzu D-Max AEX 6208 — real-world alignment", () => {
  it("should return FULLY_ALIGNED for the Isuzu claim", () => {
    const result = evaluateMechanicalAlignment(ISUZU_DAMAGE, ISUZU_QUOTE, ISUZU_PHYSICS);
    expect(result.alignment_status).toBe("FULLY_ALIGNED");
  });

  it("should have no critical missing components", () => {
    const result = evaluateMechanicalAlignment(ISUZU_DAMAGE, ISUZU_QUOTE, ISUZU_PHYSICS);
    expect(result.critical_missing).toHaveLength(0);
  });

  it("should have no unrelated items", () => {
    const result = evaluateMechanicalAlignment(ISUZU_DAMAGE, ISUZU_QUOTE, ISUZU_PHYSICS);
    expect(result.unrelated_items).toHaveLength(0);
  });

  it("should have high coverage ratio", () => {
    const result = evaluateMechanicalAlignment(ISUZU_DAMAGE, ISUZU_QUOTE, ISUZU_PHYSICS);
    expect(result.coverage_ratio).toBeGreaterThanOrEqual(0.9);
  });

  it("should confirm physics zones are covered", () => {
    const result = evaluateMechanicalAlignment(ISUZU_DAMAGE, ISUZU_QUOTE, ISUZU_PHYSICS);
    expect(result.physics_zones_covered).toBe(true);
  });
});

// ─── PARTIALLY_ALIGNED: structural component missing from quote ───────────────

describe("PARTIALLY_ALIGNED — structural component missing from quote", () => {
  it("should flag PARTIALLY_ALIGNED when radiator support panel is missing from quote", () => {
    const damage = ["Front Bumper", "Radiator Support Panel", "Grille"];
    const quote = ["front bumper", "grille"]; // radiator support panel missing
    const physics = "Front impact — head-on collision";
    const result = evaluateMechanicalAlignment(damage, quote, physics);
    expect(result.alignment_status).toBe("PARTIALLY_ALIGNED");
    expect(result.critical_missing.some(c =>
      c.component.toLowerCase().includes("radiator")
    )).toBe(true);
  });

  it("should flag PARTIALLY_ALIGNED when rear chassis rail is missing from quote", () => {
    const damage = ["Rear Bumper", "Rear Chassis Rail", "Tailgate"];
    const quote = ["rear bumper", "tailgate"]; // chassis rail missing
    const physics = "Rear impact — struck from behind";
    const result = evaluateMechanicalAlignment(damage, quote, physics);
    expect(result.alignment_status).toBe("PARTIALLY_ALIGNED");
    expect(result.critical_missing.some(c =>
      c.is_structural === true
    )).toBe(true);
  });
});

// ─── MISALIGNED: implausible component in quote ───────────────────────────────

describe("MISALIGNED — implausible component in quote", () => {
  it("should flag MISALIGNED when airbag is in quote for a minor rear impact", () => {
    const damage = ["Rear Bumper", "Tailgate"];
    const quote = ["rear bumper", "tailgate", "airbag"]; // airbag implausible
    const physics = "Minor rear impact — low speed";
    const result = evaluateMechanicalAlignment(damage, quote, physics);
    expect(result.alignment_status).toBe("MISALIGNED");
    expect(result.unrelated_items.some(u => u.risk_level === "high")).toBe(true);
  });

  it("should flag MISALIGNED when engine block is in quote for a side impact", () => {
    const damage = ["LHS Door", "LHS Mirror", "LHS Sill"];
    const quote = ["lhs door", "lhs mirror", "engine block"]; // engine block implausible
    const physics = "Side impact — left side";
    const result = evaluateMechanicalAlignment(damage, quote, physics);
    expect(result.alignment_status).toBe("MISALIGNED");
    expect(result.unrelated_items.some(u =>
      u.component.toLowerCase().includes("engine block")
    )).toBe(true);
  });
});

// ─── FULLY_ALIGNED: rear-only impact ─────────────────────────────────────────

describe("FULLY_ALIGNED — rear-only impact", () => {
  it("should return FULLY_ALIGNED for a clean rear impact with matching quote", () => {
    const damage = ["Rear Bumper", "Tail Lamp", "Tailgate", "Rear End Piece"];
    const quote = ["rear bumper", "tail lamp", "tailgate", "rear end piece"];
    const physics = "Rear impact — struck from behind at moderate speed";
    const result = evaluateMechanicalAlignment(damage, quote, physics);
    expect(result.alignment_status).toBe("FULLY_ALIGNED");
    expect(result.critical_missing).toHaveLength(0);
  });
});

// ─── PARTIALLY_ALIGNED: low coverage ratio ───────────────────────────────────

describe("PARTIALLY_ALIGNED — low coverage ratio", () => {
  it("should return PARTIALLY_ALIGNED when only 50% of damage components are quoted", () => {
    const damage = [
      "Front Bumper", "Grille", "Radiator Support Panel",
      "Hood", "Headlamp", "Front Fender",
    ];
    const quote = ["front bumper", "grille"]; // only 2 of 6 quoted
    const physics = "Front impact — head-on collision";
    const result = evaluateMechanicalAlignment(damage, quote, physics);
    expect(result.alignment_status).toBe("PARTIALLY_ALIGNED");
    expect(result.coverage_ratio).toBeLessThan(0.7);
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe("Edge cases", () => {
  it("should return FULLY_ALIGNED for empty damage and quote lists", () => {
    const result = evaluateMechanicalAlignment([], [], "Unknown impact");
    expect(result.alignment_status).toBe("FULLY_ALIGNED");
    expect(result.coverage_ratio).toBe(1);
  });

  it("should handle unknown physics summary gracefully", () => {
    const damage = ["Front Bumper"];
    const quote = ["front bumper"];
    const result = evaluateMechanicalAlignment(damage, quote, "Unknown");
    expect(result.alignment_status).toBe("FULLY_ALIGNED");
  });

  it("should detect cosmetic unrelated items as low risk", () => {
    const damage = ["Rear Bumper", "Tailgate"];
    const quote = ["rear bumper", "tailgate", "door handle"]; // door handle unrelated but cosmetic
    const physics = "Rear impact";
    const result = evaluateMechanicalAlignment(damage, quote, physics);
    // Cosmetic unrelated items should not cause MISALIGNED
    expect(result.alignment_status).not.toBe("MISALIGNED");
    const doorHandle = result.unrelated_items.find(u =>
      u.component.toLowerCase().includes("door handle")
    );
    if (doorHandle) {
      expect(doorHandle.risk_level).toBe("low");
    }
  });

  it("should produce a non-empty engineering comment in all cases", () => {
    const cases = [
      { d: ["Rear Bumper"], q: ["rear bumper"], p: "Rear impact" },
      { d: ["Front Bumper", "Radiator Support Panel"], q: ["front bumper"], p: "Front impact" },
      { d: ["Rear Bumper"], q: ["rear bumper", "engine block"], p: "Rear impact" },
    ];
    for (const c of cases) {
      const result = evaluateMechanicalAlignment(c.d, c.q, c.p);
      expect(result.engineering_comment.length).toBeGreaterThan(20);
    }
  });
});
