/**
 * Unit tests for mismatchNarrative.ts
 *
 * Tests cover:
 *   - All 8 mismatch types produce a non-empty narrative
 *   - Narratives mention the correct source_a / source_b / component values
 *   - LLM fallback: when LLM throws, template is returned with source: "template"
 *   - generateSingleNarrative convenience wrapper
 *   - Empty array input returns empty array
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  generateMismatchNarratives,
  generateSingleNarrative,
  type MismatchNarrative,
} from "./mismatchNarrative";
import type { DamageMismatch } from "./damageConsistency";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mismatch(
  type: DamageMismatch["type"],
  severity: DamageMismatch["severity"] = "high",
  overrides: Partial<DamageMismatch> = {}
): DamageMismatch {
  return {
    type,
    severity,
    details: `Test details for ${type}`,
    ...overrides,
  };
}

// ─── Template engine tests ────────────────────────────────────────────────────

describe("generateMismatchNarratives — template engine (useLlm: false)", () => {
  it("returns an empty array for empty input", async () => {
    const result = await generateMismatchNarratives([], { useLlm: false });
    expect(result).toEqual([]);
  });

  it("returns one narrative per mismatch", async () => {
    const mismatches: DamageMismatch[] = [
      mismatch("zone_mismatch"),
      mismatch("component_unreported"),
    ];
    const result = await generateMismatchNarratives(mismatches, { useLlm: false });
    expect(result).toHaveLength(2);
  });

  const ALL_TYPES: DamageMismatch["type"][] = [
    "zone_mismatch",
    "component_unreported",
    "component_not_visible",
    "severity_mismatch",
    "physics_zone_conflict",
    "photo_zone_conflict",
    "no_photo_evidence",
    "no_document_evidence",
  ];

  for (const type of ALL_TYPES) {
    it(`produces a non-empty explanation for type: ${type}`, async () => {
      const [result] = await generateMismatchNarratives([mismatch(type)], { useLlm: false });
      expect(result.explanation.length).toBeGreaterThan(20);
      expect(result.mismatch_type).toBe(type);
      expect(result.source).toBe("template");
    });
  }

  it("includes source_a in zone_mismatch narrative", async () => {
    const m = mismatch("zone_mismatch", "high", { source_a: "front", source_b: "rear" });
    const [result] = await generateMismatchNarratives([m], { useLlm: false });
    // Narrative should mention the zone values
    expect(result.explanation.toLowerCase()).toMatch(/front|rear/);
  });

  it("includes component name in component_unreported narrative", async () => {
    const m = mismatch("component_unreported", "medium", { component: "radiator" });
    const [result] = await generateMismatchNarratives([m], { useLlm: false });
    expect(result.explanation).toContain("radiator");
  });

  it("includes component name in component_not_visible narrative", async () => {
    const m = mismatch("component_not_visible", "medium", { component: "rear bumper" });
    const [result] = await generateMismatchNarratives([m], { useLlm: false });
    expect(result.explanation).toContain("rear bumper");
  });

  it("includes severity values in severity_mismatch narrative", async () => {
    const m = mismatch("severity_mismatch", "high", { source_a: "minor", source_b: "severe" });
    const [result] = await generateMismatchNarratives([m], { useLlm: false });
    expect(result.explanation.toLowerCase()).toMatch(/minor|severe/);
  });

  it("includes zone values in physics_zone_conflict narrative", async () => {
    const m = mismatch("physics_zone_conflict", "high", { source_a: "rear", source_b: "front" });
    const [result] = await generateMismatchNarratives([m], { useLlm: false });
    expect(result.explanation.toLowerCase()).toMatch(/rear|front/);
  });

  it("preserves severity on each narrative", async () => {
    const mismatches: DamageMismatch[] = [
      mismatch("zone_mismatch", "high"),
      mismatch("no_photo_evidence", "low"),
    ];
    const results = await generateMismatchNarratives(mismatches, { useLlm: false });
    expect(results[0].severity).toBe("high");
    expect(results[1].severity).toBe("low");
  });

  it("all narratives end with a period (complete sentences)", async () => {
    const results = await generateMismatchNarratives(
      ALL_TYPES.map(t => mismatch(t)),
      { useLlm: false }
    );
    for (const r of results) {
      expect(r.explanation.trimEnd()).toMatch(/[.!?]$/);
    }
  });
});// ─── LLM enrichment tests ──────────────────────────────────────────────────────────

describe("generateMismatchNarratives — LLM enrichment (JSON schema output)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  // ── Happy path: LLM returns valid JSON with preserves_meaning: true ────────
  it("uses LLM narrative when preserves_meaning is true and text differs from template", async () => {
    const enrichedText = "Front-end damage detected in submitted images does not correspond to the rear impact described in the claim. This inconsistency warrants a physical inspection to confirm the actual impact zone.";
    vi.doMock("../_core/llm", () => ({
      invokeLLM: vi.fn().mockResolvedValue({
        choices: [{ message: { content: JSON.stringify({
          enriched_narrative: enrichedText,
          preserves_meaning: true,
        }) } }],
      }),
    }));

    const { generateMismatchNarratives: gen } = await import("./mismatchNarrative");
    const [result] = await gen([mismatch("zone_mismatch")], { useLlm: true });

    expect(result.source).toBe("llm");
    expect(result.explanation).toBe(enrichedText);
    expect(result.preserves_meaning).toBe(true);
  });

  it("enriched narrative has at most 2 sentences", async () => {
    const twoSentences = "Damage photos show front-zone impact, while the claim document describes a rear impact. A physical inspection is recommended to confirm the actual impact location.";
    vi.doMock("../_core/llm", () => ({
      invokeLLM: vi.fn().mockResolvedValue({
        choices: [{ message: { content: JSON.stringify({
          enriched_narrative: twoSentences,
          preserves_meaning: true,
        }) } }],
      }),
    }));

    const { generateMismatchNarratives: gen } = await import("./mismatchNarrative");
    const [result] = await gen([mismatch("zone_mismatch")], { useLlm: true });

    // Count sentences by splitting on sentence-ending punctuation
    const sentences = result.explanation.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 0);
    expect(sentences.length).toBeLessThanOrEqual(2);
  });

  // ── Fallback: preserves_meaning is false ─────────────────────────────────
  it("falls back to template when preserves_meaning is false", async () => {
    vi.doMock("../_core/llm", () => ({
      invokeLLM: vi.fn().mockResolvedValue({
        choices: [{ message: { content: JSON.stringify({
          enriched_narrative: "Some narrative that contradicts the base.",
          preserves_meaning: false,
        }) } }],
      }),
    }));

    const { generateMismatchNarratives: gen } = await import("./mismatchNarrative");
    const [result] = await gen([mismatch("zone_mismatch")], { useLlm: true });

    expect(result.source).toBe("template");
    expect(result.preserves_meaning).toBe(false);
  });

  it("sets preserves_meaning: false on the result when LLM fails the check", async () => {
    vi.doMock("../_core/llm", () => ({
      invokeLLM: vi.fn().mockResolvedValue({
        choices: [{ message: { content: JSON.stringify({
          enriched_narrative: "Contradictory narrative.",
          preserves_meaning: false,
        }) } }],
      }),
    }));

    const { generateMismatchNarratives: gen } = await import("./mismatchNarrative");
    const [result] = await gen([mismatch("component_unreported")], { useLlm: true });

    expect(result.preserves_meaning).toBe(false);
  });

  // ── Fallback: LLM errors ──────────────────────────────────────────────────────
  it("falls back to template when LLM module throws", async () => {
    vi.doMock("../_core/llm", () => {
      throw new Error("LLM unavailable");
    });

    const { generateMismatchNarratives: gen } = await import("./mismatchNarrative");
    const [result] = await gen([mismatch("zone_mismatch")], { useLlm: true });

    expect(result.source).toBe("template");
    expect(result.explanation.length).toBeGreaterThan(20);
  });

  it("falls back to template when LLM returns empty JSON content", async () => {
    vi.doMock("../_core/llm", () => ({
      invokeLLM: vi.fn().mockResolvedValue({
        choices: [{ message: { content: "" } }],
      }),
    }));

    const { generateMismatchNarratives: gen } = await import("./mismatchNarrative");
    const [result] = await gen([mismatch("component_unreported")], { useLlm: true });

    expect(result.source).toBe("template");
  });

  it("falls back to template when LLM returns invalid JSON", async () => {
    vi.doMock("../_core/llm", () => ({
      invokeLLM: vi.fn().mockResolvedValue({
        choices: [{ message: { content: "not valid json" } }],
      }),
    }));

    const { generateMismatchNarratives: gen } = await import("./mismatchNarrative");
    const [result] = await gen([mismatch("no_photo_evidence")], { useLlm: true });

    expect(result.source).toBe("template");
  });

  it("falls back to template when enriched_narrative exceeds 500 chars", async () => {
    vi.doMock("../_core/llm", () => ({
      invokeLLM: vi.fn().mockResolvedValue({
        choices: [{ message: { content: JSON.stringify({
          enriched_narrative: "x".repeat(501),
          preserves_meaning: true,
        }) } }],
      }),
    }));

    const { generateMismatchNarratives: gen } = await import("./mismatchNarrative");
    const [result] = await gen([mismatch("no_photo_evidence")], { useLlm: true });

    expect(result.source).toBe("template");
  });

  it("does NOT set preserves_meaning on template-only results (useLlm: false)", async () => {
    const { generateMismatchNarratives: gen } = await import("./mismatchNarrative");
    const [result] = await gen([mismatch("zone_mismatch")], { useLlm: false });
    expect(result.preserves_meaning).toBeUndefined();
  });
});
// ─── generateSingleNarrative ──────────────────────────────────────────────────

describe("generateSingleNarrative", () => {
  it("returns a single MismatchNarrative", async () => {
    const result: MismatchNarrative = await generateSingleNarrative(
      mismatch("physics_zone_conflict", "medium", { source_a: "rear", source_b: "front" }),
      { useLlm: false }
    );
    expect(result).toBeDefined();
    expect(result.mismatch_type).toBe("physics_zone_conflict");
    expect(result.severity).toBe("medium");
    expect(result.explanation.length).toBeGreaterThan(20);
    expect(result.source).toBe("template");
  });
});
