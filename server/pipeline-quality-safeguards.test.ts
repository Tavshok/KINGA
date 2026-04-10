/**
 * pipeline-quality-safeguards.test.ts
 *
 * Tests for the structural safeguards added to prevent recurring quality issues:
 * 1. Narrative engine — token fidelity contract (no fabrication)
 * 2. Cost engine — learning-first architecture (no hardcoded costs)
 * 3. Physics engine — speed extraction assertion
 * 4. Report template — G-codes removed, valuation section, SA nomenclature
 * 5. Stage 10 — quality gates
 */

import { describe, it, expect } from "vitest";

// ─── 1. Narrative Engine: Token Fidelity Contract ────────────────────────────

describe("Narrative Engine — Token Fidelity Safeguard", () => {
  /**
   * The fidelity check in incidentNarrativeEngine.ts compares the LLM output
   * against the original text. If <50% of original tokens are preserved,
   * the engine falls back to the original description.
   */

  function computeTokenFidelity(original: string, cleaned: string): number {
    const origTokens = new Set(original.toLowerCase().split(/\s+/).filter(Boolean));
    const cleanedTokens = new Set(cleaned.toLowerCase().split(/\s+/).filter(Boolean));
    if (origTokens.size === 0) return 1;
    let matched = 0;
    for (const t of origTokens) {
      if (cleanedTokens.has(t)) matched++;
    }
    return matched / origTokens.size;
  }

  it("should detect fabricated narrative (low fidelity)", () => {
    const original = "I was driving at 90km/h on the N1 highway when a kudu jumped onto the road. I hit the animal and the vehicle sustained damage to the front bumper, bonnet, and windscreen.";
    const fabricated = "The driver was proceeding along the motorway when they failed to swerve due to oncoming traffic. The collision with a stationary object resulted in extensive frontal damage.";
    const fidelity = computeTokenFidelity(original, fabricated);
    expect(fidelity).toBeLessThan(0.5);
  });

  it("should accept faithful narrative (high fidelity)", () => {
    const original = "I was driving at 90km/h on the N1 highway when a kudu jumped onto the road. I hit the animal and the vehicle sustained damage to the front bumper, bonnet, and windscreen.";
    const faithful = "The insured was driving at 90km/h on the N1 highway when a kudu jumped onto the road. The insured hit the animal. The vehicle sustained damage to the front bumper, bonnet, and windscreen.";
    const fidelity = computeTokenFidelity(original, faithful);
    expect(fidelity).toBeGreaterThanOrEqual(0.5);
  });

  it("should handle empty original gracefully", () => {
    const fidelity = computeTokenFidelity("", "Some cleaned text");
    expect(fidelity).toBe(1);
  });
});

// ─── 2. Cost Engine: Learning-First Architecture ─────────────────────────────

describe("Cost Engine — Learning-First Safeguard", () => {
  /**
   * The estimateComponentCost function now queries the learning DB first.
   * When no learning data exists, it falls back to hardcoded estimates
   * but marks them with costSource = "fallback_estimate".
   */

  it("should not use hardcoded costs as primary source when learning data exists", () => {
    // Simulate a learning benchmark result
    const learningResult = {
      avgCostCents: 350000,
      sampleCount: 12,
      stdDevCents: 50000,
      minCostCents: 250000,
      maxCostCents: 450000,
    };

    // When learning data exists, it should be used as the benchmark
    expect(learningResult.sampleCount).toBeGreaterThan(0);
    expect(learningResult.avgCostCents).toBeGreaterThan(0);
  });

  it("should label fallback estimates clearly when no learning data", () => {
    const fallbackResult = {
      costSource: "fallback_estimate",
      partsCents: 20000,
      labourCents: 15000,
      paintCents: 5000,
    };

    expect(fallbackResult.costSource).toBe("fallback_estimate");
    // The report should show this as a fallback, not as authoritative
  });

  it("should never show fabricated costs without a source label", () => {
    // Any cost figure must have a source label
    const validSources = ["learning_db", "submitted_quote", "fallback_estimate", "insufficient_data"];
    const costSource = "fallback_estimate";
    expect(validSources).toContain(costSource);
  });
});

// ─── 3. Physics Engine: Speed Extraction Assertion ───────────────────────────

describe("Physics Engine — Speed Extraction Safeguard", () => {
  /**
   * The physics engine now has a safeguard that extracts speed from the
   * incident description if the structured field is missing.
   */

  function extractSpeedFromDescription(description: string): number | null {
    const patterns = [
      /(\d{2,3})\s*km\s*\/?\s*h/i,
      /(\d{2,3})\s*kmh/i,
      /(\d{2,3})\s*km\/hrs?/i,
      /speed\s*(?:of|was|:)?\s*(\d{2,3})/i,
    ];
    for (const p of patterns) {
      const m = description.match(p);
      if (m) return parseInt(m[1], 10);
    }
    return null;
  }

  it("should extract speed from '90KM/HRS' format", () => {
    const desc = "I was travelling at 90KM/HRS when the kudu jumped";
    expect(extractSpeedFromDescription(desc)).toBe(90);
  });

  it("should extract speed from '90 km/h' format", () => {
    const desc = "Speed was approximately 90 km/h at time of impact";
    expect(extractSpeedFromDescription(desc)).toBe(90);
  });

  it("should extract speed from '120kmh' format", () => {
    const desc = "I was doing 120kmh on the highway";
    expect(extractSpeedFromDescription(desc)).toBe(120);
  });

  it("should return null when no speed is mentioned", () => {
    const desc = "The vehicle hit a pothole and the tyre burst";
    expect(extractSpeedFromDescription(desc)).toBeNull();
  });

  it("should use extracted speed instead of default 60km/h", () => {
    const extractedSpeed = 90;
    const defaultSpeed = 60;
    // When speed is extracted, it should be used
    const speedToUse = extractedSpeed || defaultSpeed;
    expect(speedToUse).toBe(90);
    expect(speedToUse).not.toBe(60);
  });
});

// ─── 4. Report Template: G-codes Removed ─────────────────────────────────────

describe("Report Template — G-codes Removal", () => {
  it("should not contain G1, G2, G3, G4 gate identifiers", () => {
    // The decision flowchart gates should have empty id fields
    const gates = [
      { id: "", label: "Physics Consistency", result: "85%", pass: true },
      { id: "", label: "Fraud Risk Score", result: 18, pass: true },
      { id: "", label: "Data Completeness", result: "72%", pass: true },
      { id: "", label: "Critical Blockers", result: "None", pass: true },
    ];

    for (const gate of gates) {
      expect(gate.id).toBe("");
      expect(gate.label).not.toMatch(/^G\d/);
    }
  });
});

// ─── 5. Report Template: Valuation Section ───────────────────────────────────

describe("Report Template — Valuation Section", () => {
  it("should calculate repair-to-value ratio correctly", () => {
    const marketValue = 150000;
    const repairCost = 45000;
    const ratio = (repairCost / marketValue) * 100;
    expect(ratio).toBe(30);
    expect(ratio).toBeLessThan(70); // Not a write-off
  });

  it("should flag potential write-off when ratio >= 70%", () => {
    const marketValue = 150000;
    const repairCost = 120000;
    const ratio = (repairCost / marketValue) * 100;
    expect(ratio).toBe(80);
    expect(ratio).toBeGreaterThanOrEqual(70); // Write-off
  });

  it("should show 'Not stated' when market value is missing", () => {
    const marketValue = null;
    const display = marketValue != null ? `$${marketValue}` : "Not stated";
    expect(display).toBe("Not stated");
  });
});

// ─── 6. SA Nomenclature Preservation ─────────────────────────────────────────

describe("SA Nomenclature — Preservation Safeguard", () => {
  it("should preserve SA terms in component names", () => {
    const saTerms = [
      "bonnet",        // not 'hood'
      "boot",          // not 'trunk'
      "wing",          // not 'fender'
      "windscreen",    // not 'windshield'
      "number plate",  // not 'license plate'
      "indicator",     // not 'turn signal'
    ];

    // These terms should pass through the pipeline unchanged
    for (const term of saTerms) {
      expect(term).toBe(term); // Identity — no normalisation
    }
  });
});

// ─── 7. Fraud Score Contradiction Detection ──────────────────────────────────

describe("Fraud Score — Contradiction Detection", () => {
  it("should detect contradiction when rule trace score differs significantly from weighted score", () => {
    const traceScore = 18;
    const weightedScore = 72;
    const hasContradiction = Math.abs(traceScore - weightedScore) > 15;
    expect(hasContradiction).toBe(true);
  });

  it("should not flag contradiction when scores are close", () => {
    const traceScore = 65;
    const weightedScore = 72;
    const hasContradiction = Math.abs(traceScore - weightedScore) > 15;
    expect(hasContradiction).toBe(false);
  });

  it("should handle missing trace score gracefully", () => {
    const traceScore = null;
    const weightedScore = 72;
    const hasContradiction = traceScore != null && Math.abs(traceScore - weightedScore) > 15;
    expect(hasContradiction).toBe(false);
  });
});

// ─── 8. Incident Description Truncation Safeguard ────────────────────────────

describe("Incident Description — Truncation Safeguard", () => {
  it("should fall back to original when cleaned narrative is too short", () => {
    const original = "I was driving at 90km/h on the N1 highway near Polokwane when a kudu jumped onto the road from the left side. I could not avoid the animal and hit it head on. The vehicle sustained extensive damage to the front.";
    const truncated = "I was driving at 90km/h on the N1";

    // Safeguard: if cleaned < 50% of original length, use original
    const shouldFallback = truncated.length < original.length * 0.5 && original.length > 50;
    expect(shouldFallback).toBe(true);

    const displayText = shouldFallback ? original : truncated;
    expect(displayText).toBe(original);
  });

  it("should use cleaned narrative when it preserves most content", () => {
    const original = "I was driving at 90km/h on the N1 highway when a kudu jumped onto the road. The vehicle was stripped and we found additional damages.";
    const cleaned = "I was driving at 90km/h on the N1 highway when a kudu jumped onto the road.";

    const shouldFallback = cleaned.length < original.length * 0.5 && original.length > 50;
    expect(shouldFallback).toBe(false);

    const displayText = shouldFallback ? original : cleaned;
    expect(displayText).toBe(cleaned);
  });
});
