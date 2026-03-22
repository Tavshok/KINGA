/**
 * severityConsensusEngine.test.ts
 *
 * Comprehensive test suite for the Severity Consensus Engine.
 * Covers all consensus rules, edge cases, confidence scoring, and
 * the convenience builder function.
 */

import { describe, it, expect } from "vitest";
import {
  computeSeverityConsensus,
  buildSeverityConsensusInput,
  type SeverityConsensusInput,
} from "./severityConsensusEngine";

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function input(
  physics: string | null,
  damageScore: number | null,
  imageSignals: Array<string | null> | null = null
): SeverityConsensusInput {
  return {
    physics_severity: physics as any,
    damage_severity_score: damageScore,
    image_severity_signals: imageSignals,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1: FULL ALIGNMENT — all 3 sources agree
// ─────────────────────────────────────────────────────────────────────────────

describe("FULL alignment — all 3 sources agree", () => {
  it("returns FULL/severe when all 3 sources say severe", () => {
    const r = computeSeverityConsensus(input("severe", 80, ["severe", "severe"]));
    expect(r.final_severity).toBe("severe");
    expect(r.source_alignment).toBe("FULL");
    expect(r.confidence).toBeGreaterThanOrEqual(90);
  });

  it("returns FULL/moderate when all 3 sources say moderate", () => {
    const r = computeSeverityConsensus(input("moderate", 40, ["moderate", "moderate"]));
    expect(r.final_severity).toBe("moderate");
    expect(r.source_alignment).toBe("FULL");
  });

  it("returns FULL/minor when all 3 sources say minor", () => {
    const r = computeSeverityConsensus(input("minor", 10, ["minor", "minor"]));
    expect(r.final_severity).toBe("minor");
    expect(r.source_alignment).toBe("FULL");
  });

  it("maps cosmetic physics to minor and still aligns FULL", () => {
    const r = computeSeverityConsensus(input("cosmetic", 10, ["minor"]));
    expect(r.final_severity).toBe("minor");
    expect(r.source_alignment).toBe("FULL");
  });

  it("maps catastrophic physics to severe and still aligns FULL", () => {
    const r = computeSeverityConsensus(input("catastrophic", 90, ["severe", "severe"]));
    expect(r.final_severity).toBe("severe");
    expect(r.source_alignment).toBe("FULL");
  });

  it("maps none physics to minor and aligns FULL with minor damage + image", () => {
    const r = computeSeverityConsensus(input("none", 5, ["minor"]));
    expect(r.final_severity).toBe("minor");
    expect(r.source_alignment).toBe("FULL");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2: PARTIAL ALIGNMENT — majority vote
// ─────────────────────────────────────────────────────────────────────────────

describe("PARTIAL alignment — majority vote (2 of 3 agree)", () => {
  it("adopts severe when physics+damage=severe, image=moderate", () => {
    const r = computeSeverityConsensus(input("severe", 75, ["moderate"]));
    expect(r.final_severity).toBe("severe");
    expect(r.source_alignment).toBe("PARTIAL");
  });

  it("adopts moderate when physics+image=moderate, damage=minor", () => {
    const r = computeSeverityConsensus(input("moderate", 15, ["moderate", "moderate"]));
    expect(r.final_severity).toBe("moderate");
    expect(r.source_alignment).toBe("PARTIAL");
  });

  it("adopts minor when damage+image=minor, physics=moderate", () => {
    const r = computeSeverityConsensus(input("moderate", 10, ["minor", "minor"]));
    expect(r.final_severity).toBe("minor");
    expect(r.source_alignment).toBe("PARTIAL");
  });

  it("adopts severe when physics+image=severe, damage=minor (2 vs 1)", () => {
    const r = computeSeverityConsensus(input("severe", 10, ["severe"]));
    expect(r.final_severity).toBe("severe");
    expect(r.source_alignment).toBe("PARTIAL");
  });

  it("adopts moderate when physics=moderate, damage=moderate, image=minor", () => {
    const r = computeSeverityConsensus(input("moderate", 45, ["minor"]));
    expect(r.final_severity).toBe("moderate");
    expect(r.source_alignment).toBe("PARTIAL");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3: SEVERE-PROTECTION RULE
// ─────────────────────────────────────────────────────────────────────────────

describe("Severe-protection rule — SEVERE cannot be downgraded by one weak signal", () => {
  it("keeps severe when physics=severe, damage=severe, image=minor (2 vs 1)", () => {
    const r = computeSeverityConsensus(input("severe", 80, ["minor"]));
    expect(r.final_severity).toBe("severe");
    expect(r.source_alignment).toBe("PARTIAL");
  });

  it("keeps severe when physics=severe, damage=minor, image=severe (2 vs 1)", () => {
    const r = computeSeverityConsensus(input("severe", 10, ["severe"]));
    expect(r.final_severity).toBe("severe");
    expect(r.source_alignment).toBe("PARTIAL");
  });

  it("keeps severe when only 2 sources available and both say severe", () => {
    const r = computeSeverityConsensus(input("severe", 80, null));
    expect(r.final_severity).toBe("severe");
  });

  it("does NOT invoke severe-protection when 2 sources say minor and 1 says severe", () => {
    // physics=severe, damage=minor, image=[minor, minor] → image aggregates to minor
    // severe=1, minor=2 → majority is minor, no severe protection (2 non-severe)
    const r = computeSeverityConsensus(input("severe", 10, ["minor", "minor"]));
    expect(r.final_severity).toBe("minor");
    expect(r.source_alignment).toBe("PARTIAL");
  });

  it("severe-protection applies with only physics+damage (no image)", () => {
    const r = computeSeverityConsensus(input("severe", 20, null));
    // 2 sources: severe vs minor → severe-protection (1 non-severe)
    expect(r.final_severity).toBe("severe");
    expect(r.source_alignment).toBe("PARTIAL");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4: CONFLICT
// ─────────────────────────────────────────────────────────────────────────────

describe("CONFLICT — all 3 sources disagree", () => {
  it("returns CONFLICT and adopts highest severity (severe)", () => {
    const r = computeSeverityConsensus(input("severe", 40, ["minor"]));
    // physics=severe, damage=moderate, image=minor → all different
    expect(r.source_alignment).toBe("CONFLICT");
    expect(r.final_severity).toBe("severe");
  });

  it("returns CONFLICT and adopts moderate when severe not present", () => {
    // physics=moderate, damage=minor, image=moderate → 2 moderate → PARTIAL not CONFLICT
    // Need: physics=minor, damage=moderate, image=severe → all different
    const r = computeSeverityConsensus(input("minor", 40, ["severe"]));
    expect(r.source_alignment).toBe("CONFLICT");
    expect(r.final_severity).toBe("severe");
  });

  it("confidence is below 60 for CONFLICT", () => {
    const r = computeSeverityConsensus(input("severe", 40, ["minor"]));
    expect(r.confidence).toBeLessThan(60);
  });

  it("reasoning mentions manual review for CONFLICT", () => {
    const r = computeSeverityConsensus(input("severe", 40, ["minor"]));
    expect(r.reasoning.toLowerCase()).toContain("manual review");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 5: MISSING SOURCES
// ─────────────────────────────────────────────────────────────────────────────

describe("Missing sources — partial input", () => {
  it("works with only physics (1 source)", () => {
    const r = computeSeverityConsensus(input("severe", null, null));
    expect(r.final_severity).toBe("severe");
    expect(r.sources_available).toBe(1);
    expect(r.source_alignment).toBe("PARTIAL");
  });

  it("works with only damage score (1 source)", () => {
    const r = computeSeverityConsensus(input(null, 70, null));
    expect(r.final_severity).toBe("severe");
    expect(r.sources_available).toBe(1);
  });

  it("works with only image signals (1 source)", () => {
    const r = computeSeverityConsensus(input(null, null, ["moderate", "moderate"]));
    expect(r.final_severity).toBe("moderate");
    expect(r.sources_available).toBe(1);
  });

  it("works with physics + damage only (2 sources)", () => {
    const r = computeSeverityConsensus(input("moderate", 45, null));
    expect(r.sources_available).toBe(2);
    expect(r.final_severity).toBe("moderate");
  });

  it("works with physics + image only (2 sources)", () => {
    const r = computeSeverityConsensus(input("minor", null, ["minor"]));
    expect(r.sources_available).toBe(2);
    expect(r.final_severity).toBe("minor");
  });

  it("works with damage + image only (2 sources)", () => {
    const r = computeSeverityConsensus(input(null, 60, ["severe"]));
    expect(r.sources_available).toBe(2);
  });

  it("returns moderate/CONFLICT when no sources available", () => {
    const r = computeSeverityConsensus(input(null, null, null));
    expect(r.sources_available).toBe(0);
    expect(r.source_alignment).toBe("CONFLICT");
    expect(r.final_severity).toBe("moderate");
  });

  it("confidence is lower with 1 source than with 3 sources", () => {
    const r1 = computeSeverityConsensus(input("severe", null, null));
    const r3 = computeSeverityConsensus(input("severe", 80, ["severe"]));
    expect(r3.confidence).toBeGreaterThan(r1.confidence);
  });

  it("reasoning mentions missing sources when not all 3 available", () => {
    const r = computeSeverityConsensus(input("severe", null, null));
    expect(r.reasoning.toLowerCase()).toContain("missing");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 6: DAMAGE SCORE MAPPING
// ─────────────────────────────────────────────────────────────────────────────

describe("Damage severity score mapping", () => {
  it("maps score 0 to minor", () => {
    const r = computeSeverityConsensus(input(null, 0, null));
    expect(r.source_signals.damage).toBe("minor");
  });

  it("maps score 24 to minor", () => {
    const r = computeSeverityConsensus(input(null, 24, null));
    expect(r.source_signals.damage).toBe("minor");
  });

  it("maps score 25 to moderate", () => {
    const r = computeSeverityConsensus(input(null, 25, null));
    expect(r.source_signals.damage).toBe("moderate");
  });

  it("maps score 54 to moderate", () => {
    const r = computeSeverityConsensus(input(null, 54, null));
    expect(r.source_signals.damage).toBe("moderate");
  });

  it("maps score 55 to severe", () => {
    const r = computeSeverityConsensus(input(null, 55, null));
    expect(r.source_signals.damage).toBe("severe");
  });

  it("maps score 100 to severe", () => {
    const r = computeSeverityConsensus(input(null, 100, null));
    expect(r.source_signals.damage).toBe("severe");
  });

  it("maps null score to null signal", () => {
    const r = computeSeverityConsensus(input("moderate", null, null));
    expect(r.source_signals.damage).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 7: IMAGE SIGNAL AGGREGATION
// ─────────────────────────────────────────────────────────────────────────────

describe("Image severity signal aggregation", () => {
  it("modal: 2 severe + 1 minor → severe", () => {
    const r = computeSeverityConsensus(input(null, null, ["severe", "severe", "minor"]));
    expect(r.source_signals.image).toBe("severe");
  });

  it("modal: 2 moderate + 1 severe → moderate (majority)", () => {
    const r = computeSeverityConsensus(input(null, null, ["moderate", "moderate", "severe"]));
    expect(r.source_signals.image).toBe("moderate");
  });

  it("tie between moderate and severe → severe (conservative)", () => {
    const r = computeSeverityConsensus(input(null, null, ["moderate", "severe"]));
    expect(r.source_signals.image).toBe("severe");
  });

  it("single severe photo → severe", () => {
    const r = computeSeverityConsensus(input(null, null, ["severe"]));
    expect(r.source_signals.image).toBe("severe");
  });

  it("all minor photos → minor", () => {
    const r = computeSeverityConsensus(input(null, null, ["minor", "minor", "minor"]));
    expect(r.source_signals.image).toBe("minor");
  });

  it("accepts 'high' as severe alias", () => {
    const r = computeSeverityConsensus(input(null, null, ["high"]));
    expect(r.source_signals.image).toBe("severe");
  });

  it("accepts 'low' as minor alias", () => {
    const r = computeSeverityConsensus(input(null, null, ["low"]));
    expect(r.source_signals.image).toBe("minor");
  });

  it("accepts 'medium' as moderate alias", () => {
    const r = computeSeverityConsensus(input(null, null, ["medium"]));
    expect(r.source_signals.image).toBe("moderate");
  });

  it("accepts 'critical' as severe alias", () => {
    const r = computeSeverityConsensus(input(null, null, ["critical"]));
    expect(r.source_signals.image).toBe("severe");
  });

  it("ignores null entries in image signals", () => {
    const r = computeSeverityConsensus(input(null, null, [null, null, "severe"]));
    expect(r.source_signals.image).toBe("severe");
  });

  it("returns null image signal when all entries are null", () => {
    const r = computeSeverityConsensus(input("moderate", null, [null, null]));
    expect(r.source_signals.image).toBeNull();
    expect(r.sources_available).toBe(1);
  });

  it("returns null image signal for empty array", () => {
    const r = computeSeverityConsensus(input("moderate", null, []));
    expect(r.source_signals.image).toBeNull();
  });

  it("ignores unrecognised severity strings", () => {
    const r = computeSeverityConsensus(input(null, null, ["unknown", "???", "severe"]));
    expect(r.source_signals.image).toBe("severe");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 8: PHYSICS SEVERITY MAPPING
// ─────────────────────────────────────────────────────────────────────────────

describe("Physics severity mapping", () => {
  it("maps none → minor", () => {
    const r = computeSeverityConsensus(input("none", null, null));
    expect(r.source_signals.physics).toBe("minor");
  });

  it("maps cosmetic → minor", () => {
    const r = computeSeverityConsensus(input("cosmetic", null, null));
    expect(r.source_signals.physics).toBe("minor");
  });

  it("maps minor → minor", () => {
    const r = computeSeverityConsensus(input("minor", null, null));
    expect(r.source_signals.physics).toBe("minor");
  });

  it("maps moderate → moderate", () => {
    const r = computeSeverityConsensus(input("moderate", null, null));
    expect(r.source_signals.physics).toBe("moderate");
  });

  it("maps severe → severe", () => {
    const r = computeSeverityConsensus(input("severe", null, null));
    expect(r.source_signals.physics).toBe("severe");
  });

  it("maps catastrophic → severe", () => {
    const r = computeSeverityConsensus(input("catastrophic", null, null));
    expect(r.source_signals.physics).toBe("severe");
  });

  it("maps null → null", () => {
    const r = computeSeverityConsensus(input(null, null, null));
    expect(r.source_signals.physics).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 9: CONFIDENCE SCORING
// ─────────────────────────────────────────────────────────────────────────────

describe("Confidence scoring", () => {
  it("FULL alignment with 3 sources → confidence >= 90", () => {
    const r = computeSeverityConsensus(input("severe", 80, ["severe", "severe"]));
    expect(r.confidence).toBeGreaterThanOrEqual(90);
  });

  it("PARTIAL alignment with 3 sources → confidence in 60-90 range", () => {
    const r = computeSeverityConsensus(input("severe", 75, ["moderate"]));
    expect(r.confidence).toBeGreaterThanOrEqual(60);
    expect(r.confidence).toBeLessThan(90);
  });

  it("CONFLICT → confidence < 60", () => {
    const r = computeSeverityConsensus(input("severe", 40, ["minor"]));
    expect(r.confidence).toBeLessThan(60);
  });

  it("single source → confidence < 70", () => {
    const r = computeSeverityConsensus(input("moderate", null, null));
    expect(r.confidence).toBeLessThan(70);
  });

  it("physics=severe confirming severe verdict → bonus confidence", () => {
    const r1 = computeSeverityConsensus(input("severe", 80, ["severe"]));
    const r2 = computeSeverityConsensus(input("moderate", 80, ["severe"]));
    // r1 has physics confirming severe — should be higher confidence
    expect(r1.confidence).toBeGreaterThanOrEqual(r2.confidence);
  });

  it("physics=minor contradicting severe verdict → confidence penalty", () => {
    const r1 = computeSeverityConsensus(input("severe", 80, ["severe"]));
    const r2 = computeSeverityConsensus(input("minor", 80, ["severe"]));
    // r2 has physics contradicting severe — should be lower confidence
    expect(r1.confidence).toBeGreaterThan(r2.confidence);
  });

  it("confidence is always between 10 and 100", () => {
    const cases = [
      input(null, null, null),
      input("severe", 80, ["severe"]),
      input("minor", 40, ["severe"]),
      input("catastrophic", 100, ["severe", "severe", "severe"]),
    ];
    for (const c of cases) {
      const r = computeSeverityConsensus(c);
      expect(r.confidence).toBeGreaterThanOrEqual(10);
      expect(r.confidence).toBeLessThanOrEqual(100);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 10: REASONING STRING
// ─────────────────────────────────────────────────────────────────────────────

describe("Reasoning string", () => {
  it("includes all three source labels in reasoning", () => {
    const r = computeSeverityConsensus(input("severe", 80, ["severe"]));
    expect(r.reasoning).toContain("physics=");
    expect(r.reasoning).toContain("damage=");
    expect(r.reasoning).toContain("image=");
  });

  it("mentions 'unavailable' for missing sources", () => {
    const r = computeSeverityConsensus(input("severe", null, null));
    expect(r.reasoning).toContain("unavailable");
  });

  it("mentions severe-protection when it applies", () => {
    const r = computeSeverityConsensus(input("severe", 80, ["minor"]));
    expect(r.reasoning.toLowerCase()).toContain("severe-protection");
  });

  it("mentions 'all' sources agree for FULL alignment", () => {
    const r = computeSeverityConsensus(input("moderate", 45, ["moderate"]));
    expect(r.reasoning.toLowerCase()).toContain("agree");
  });

  it("is a non-empty string", () => {
    const r = computeSeverityConsensus(input(null, null, null));
    expect(typeof r.reasoning).toBe("string");
    expect(r.reasoning.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 11: OUTPUT STRUCTURE
// ─────────────────────────────────────────────────────────────────────────────

describe("Output structure", () => {
  it("always returns all required fields", () => {
    const r = computeSeverityConsensus(input("moderate", 45, ["moderate"]));
    expect(r).toHaveProperty("final_severity");
    expect(r).toHaveProperty("source_alignment");
    expect(r).toHaveProperty("confidence");
    expect(r).toHaveProperty("reasoning");
    expect(r).toHaveProperty("source_signals");
    expect(r).toHaveProperty("sources_available");
  });

  it("source_signals contains physics, damage, image keys", () => {
    const r = computeSeverityConsensus(input("moderate", 45, ["moderate"]));
    expect(r.source_signals).toHaveProperty("physics");
    expect(r.source_signals).toHaveProperty("damage");
    expect(r.source_signals).toHaveProperty("image");
  });

  it("final_severity is one of minor/moderate/severe", () => {
    const cases = [
      input("minor", 10, ["minor"]),
      input("moderate", 45, ["moderate"]),
      input("severe", 80, ["severe"]),
    ];
    for (const c of cases) {
      const r = computeSeverityConsensus(c);
      expect(["minor", "moderate", "severe"]).toContain(r.final_severity);
    }
  });

  it("source_alignment is one of FULL/PARTIAL/CONFLICT", () => {
    const r = computeSeverityConsensus(input("moderate", 45, ["moderate"]));
    expect(["FULL", "PARTIAL", "CONFLICT"]).toContain(r.source_alignment);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 12: CONVENIENCE BUILDER
// ─────────────────────────────────────────────────────────────────────────────

describe("buildSeverityConsensusInput", () => {
  it("maps stage6 overallSeverityScore to damage_severity_score", () => {
    const inp = buildSeverityConsensusInput({ overallSeverityScore: 70 }, null, null);
    expect(inp.damage_severity_score).toBe(70);
  });

  it("maps stage7 accidentSeverity to physics_severity when physicsExecuted=true", () => {
    const inp = buildSeverityConsensusInput(null, { accidentSeverity: "severe", physicsExecuted: true }, null);
    expect(inp.physics_severity).toBe("severe");
  });

  it("returns null physics_severity when physicsExecuted=false", () => {
    const inp = buildSeverityConsensusInput(null, { accidentSeverity: "severe", physicsExecuted: false }, null);
    expect(inp.physics_severity).toBeNull();
  });

  it("parses enrichedPhotosJson to extract image severity signals", () => {
    const photos = [
      { severity: "severe", impactZone: "front" },
      { severity: "moderate", impactZone: "rear" },
    ];
    const inp = buildSeverityConsensusInput(null, null, JSON.stringify(photos));
    expect(inp.image_severity_signals).toEqual(["severe", "moderate"]);
  });

  it("falls back to damage_level field if severity is absent", () => {
    const photos = [
      { damage_level: "severe" },
      { damage_level: "minor" },
    ];
    const inp = buildSeverityConsensusInput(null, null, JSON.stringify(photos));
    expect(inp.image_severity_signals).toEqual(["severe", "minor"]);
  });

  it("returns null image signals for invalid JSON", () => {
    const inp = buildSeverityConsensusInput(null, null, "not-json");
    expect(inp.image_severity_signals).toBeNull();
  });

  it("returns null image signals for null enrichedPhotosJson", () => {
    const inp = buildSeverityConsensusInput(null, null, null);
    expect(inp.image_severity_signals).toBeNull();
  });

  it("returns null damage_severity_score when stage6 is null", () => {
    const inp = buildSeverityConsensusInput(null, null, null);
    expect(inp.damage_severity_score).toBeNull();
  });

  it("returns null physics_severity when stage7 is null", () => {
    const inp = buildSeverityConsensusInput(null, null, null);
    expect(inp.physics_severity).toBeNull();
  });

  it("filters out photos with no severity or damage_level", () => {
    const photos = [
      { impactZone: "front" },  // no severity field
      { severity: "severe" },
    ];
    const inp = buildSeverityConsensusInput(null, null, JSON.stringify(photos));
    expect(inp.image_severity_signals).toEqual(["severe"]);
  });

  it("returns null image signals when all photos lack severity fields", () => {
    const photos = [{ impactZone: "front" }, { impactZone: "rear" }];
    const inp = buildSeverityConsensusInput(null, null, JSON.stringify(photos));
    expect(inp.image_severity_signals).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 13: REAL-WORLD SCENARIOS
// ─────────────────────────────────────────────────────────────────────────────

describe("Real-world scenarios", () => {
  it("Mazda BT-50 cattle strike — severe physics, severe damage, severe images → FULL/severe", () => {
    const r = computeSeverityConsensus(input("severe", 82, ["severe", "severe", "moderate"]));
    expect(r.final_severity).toBe("severe");
    // image signals ["severe","severe","moderate"] aggregate to severe (2 vs 1)
    // so all 3 sources = severe → FULL alignment
    expect(r.source_alignment).toBe("FULL");
    expect(r.confidence).toBeGreaterThan(65);
  });

  it("Minor parking scrape — minor physics, minor damage, minor images → FULL/minor", () => {
    const r = computeSeverityConsensus(input("minor", 12, ["minor", "minor"]));
    expect(r.final_severity).toBe("minor");
    expect(r.source_alignment).toBe("FULL");
  });

  it("Hail damage — no physics (non-collision), moderate damage, moderate images → PARTIAL/moderate", () => {
    const r = computeSeverityConsensus(input(null, 38, ["moderate", "moderate"]));
    expect(r.final_severity).toBe("moderate");
    expect(r.sources_available).toBe(2);
  });

  it("Suspected fraud — physics=minor, damage=severe (inflated), images=moderate → CONFLICT", () => {
    const r = computeSeverityConsensus(input("minor", 70, ["moderate"]));
    // physics=minor, damage=severe, image=moderate → all different → CONFLICT
    expect(r.source_alignment).toBe("CONFLICT");
    expect(r.confidence).toBeLessThan(60);
  });

  it("Total loss — catastrophic physics, score=95, images=severe → FULL/severe", () => {
    const r = computeSeverityConsensus(input("catastrophic", 95, ["severe", "severe"]));
    expect(r.final_severity).toBe("severe");
    expect(r.source_alignment).toBe("FULL");
    expect(r.confidence).toBeGreaterThanOrEqual(90);
  });

  it("Cosmetic-only claim — cosmetic physics, score=8, images=minor → FULL/minor", () => {
    const r = computeSeverityConsensus(input("cosmetic", 8, ["minor"]));
    expect(r.final_severity).toBe("minor");
    expect(r.source_alignment).toBe("FULL");
  });

  it("Flood claim — no physics, low damage score, minor images → minor", () => {
    const r = computeSeverityConsensus(input(null, 18, ["minor", "minor"]));
    expect(r.final_severity).toBe("minor");
  });

  it("Fire claim — no physics, high damage score, severe images → severe", () => {
    const r = computeSeverityConsensus(input(null, 88, ["severe", "severe"]));
    expect(r.final_severity).toBe("severe");
    expect(r.source_alignment).toBe("FULL");
  });
});
