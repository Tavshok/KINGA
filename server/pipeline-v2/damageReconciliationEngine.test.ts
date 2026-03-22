/**
 * damageReconciliationEngine.test.ts
 *
 * Unit tests for the vehicle damage reconciliation engine.
 * All tests are deterministic — no LLM calls required.
 */

import { describe, it, expect } from "vitest";
import {
  reconcileDamageComponents,
  normalise,
  isStructural,
  similarity,
} from "./damageReconciliationEngine";

// ─── normalise ────────────────────────────────────────────────────────────────

describe("normalise", () => {
  it("lowercases and trims input", () => {
    expect(normalise("  Rear Bumper  ")).toBe("rear bumper");
  });

  it("maps B/bar to rear bumper", () => {
    expect(normalise("B/bar")).toBe("rear bumper");
  });

  it("maps F/bar to front bumper", () => {
    expect(normalise("F/bar")).toBe("front bumper");
  });

  it("maps R/H tail lamp to rhs tail lamp", () => {
    expect(normalise("R/H tail lamp")).toBe("rhs tail lamp");
  });

  it("maps W/screen to windscreen", () => {
    expect(normalise("W/screen")).toBe("windscreen");
  });

  it("maps rad support panel to radiator support panel", () => {
    expect(normalise("rad support panel")).toBe("radiator support panel");
  });

  it("removes trailing assembly noise word", () => {
    expect(normalise("front bumper assembly")).toBe("front bumper");
  });

  it("maps tow hinge to tow hitch", () => {
    expect(normalise("tow hinge")).toBe("tow hitch");
  });
});

// ─── isStructural ─────────────────────────────────────────────────────────────

describe("isStructural", () => {
  it("identifies radiator support panel as structural", () => {
    expect(isStructural("radiator support panel")).toBe(true);
  });

  it("identifies diff connector as structural", () => {
    expect(isStructural("differential connector")).toBe(true);
  });

  it("identifies bumper bracket as structural", () => {
    expect(isStructural("bumper bracket")).toBe(true);
  });

  it("does NOT mark tail lamp as structural", () => {
    expect(isStructural("rhs tail lamp")).toBe(false);
  });

  it("does NOT mark grille as structural", () => {
    expect(isStructural("grille")).toBe(false);
  });
});

// ─── similarity ───────────────────────────────────────────────────────────────

describe("similarity", () => {
  it("returns 1.0 for identical strings", () => {
    expect(similarity("rear bumper", "rear bumper")).toBe(1.0);
  });

  it("returns 0.9 when one contains the other", () => {
    expect(similarity("rear bumper", "rear bumper cover")).toBe(0.9);
  });

  it("returns a Jaccard score for partial token overlap", () => {
    const score = similarity("rhs tail lamp", "tail lamp");
    expect(score).toBeGreaterThan(0.5);
    expect(score).toBeLessThan(1.0);
  });

  it("returns 0 for completely unrelated strings", () => {
    expect(similarity("grille", "axle")).toBe(0);
  });
});

// ─── reconcileDamageComponents ────────────────────────────────────────────────

describe("reconcileDamageComponents", () => {
  it("matches exact components correctly", () => {
    const result = reconcileDamageComponents(
      ["rear bumper", "grille", "rhs tail lamp"],
      ["rear bumper", "grille", "rhs tail lamp"]
    );
    expect(result.matched).toHaveLength(3);
    expect(result.missing).toHaveLength(0);
    expect(result.extra).toHaveLength(0);
    expect(result.coverage_ratio).toBe(1.0);
  });

  it("matches shorthand quote components to normalised damage list", () => {
    const result = reconcileDamageComponents(
      ["rear bumper", "rhs tail lamp", "radiator support panel"],
      ["B/bar", "R/H tail lamp", "rad support panel"]
    );
    expect(result.matched).toHaveLength(3);
    expect(result.missing).toHaveLength(0);
    expect(result.coverage_ratio).toBe(1.0);
  });

  it("flags structural components that are missing from quote", () => {
    const result = reconcileDamageComponents(
      ["rear bumper", "radiator support panel", "grille"],
      ["rear bumper", "grille"]
    );
    expect(result.missing).toHaveLength(1);
    expect(result.missing[0].component).toBe("radiator support panel");
    expect(result.missing[0].is_structural).toBe(true);
    expect(result.structural_gaps).toContain("radiator support panel");
  });

  it("flags extra components in quote not in damage list", () => {
    const result = reconcileDamageComponents(
      ["rear bumper", "grille"],
      ["rear bumper", "grille", "windscreen"]
    );
    expect(result.extra).toHaveLength(1);
    expect(result.extra[0].component).toBe("windscreen");
  });

  it("computes correct coverage_ratio when some components are missing", () => {
    const result = reconcileDamageComponents(
      ["rear bumper", "grille", "rhs tail lamp", "radiator support panel"],
      ["rear bumper", "grille"]
    );
    expect(result.coverage_ratio).toBe(0.5);
  });

  it("returns coverage_ratio 1.0 when damage list is empty", () => {
    const result = reconcileDamageComponents([], ["rear bumper"]);
    expect(result.coverage_ratio).toBe(1.0);
    expect(result.extra).toHaveLength(1);
  });

  it("handles the Isuzu D-Max AEX6208 real-world case", () => {
    // Official damage list (12 components from assessor report)
    const damageComponents = [
      "rear bumper",
      "rear bumper sensors",
      "rhs tail lamp",
      "tailgate",
      "rear end piece",
      "rhs loading panel",
      "front bumper",
      "front bumper slides",
      "grille",
      "radiator support panel",
      "tow hitch",
      "differential connector",
    ];

    // Quote components (as they might appear in a panel beater quote)
    const quoteComponents = [
      "B/bar",
      "parking sensors",
      "R/H tail lamp",
      "tailgate",
      "rear end panel",
      "loading panel",
      "F/bar",
      "bumper slides",
      "front grille",
      "rad support panel",
      "tow hinge",
      "diff connector",
    ];

    const result = reconcileDamageComponents(damageComponents, quoteComponents);

    expect(result.matched.length).toBeGreaterThanOrEqual(10);
    expect(result.coverage_ratio).toBeGreaterThanOrEqual(0.83);
    expect(result.structural_gaps).toHaveLength(0); // all structural components should be matched
    expect(result.missing).toHaveLength(0);
  });

  it("does not match unrelated components", () => {
    const result = reconcileDamageComponents(
      ["radiator support panel", "rear bumper"],
      ["windscreen", "door panel"]
    );
    expect(result.matched).toHaveLength(0);
    expect(result.missing).toHaveLength(2);
    expect(result.coverage_ratio).toBe(0.0);
    expect(result.structural_gaps).toContain("radiator support panel");
  });

  it("includes a non-empty summary string", () => {
    const result = reconcileDamageComponents(
      ["rear bumper", "grille"],
      ["rear bumper"]
    );
    expect(result.summary.length).toBeGreaterThan(0);
    expect(result.summary).toContain("1 of 2");
  });
});
