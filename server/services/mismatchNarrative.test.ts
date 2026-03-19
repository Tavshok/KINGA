/**
 * Unit tests for mismatchNarrative.ts
 *
 * Tests cover:
 *   - All 8 mismatch types produce a non-empty narrative
 *   - Narratives mention the correct source_a / source_b / component values
 *   - LLM fallback: when LLM throws, template is returned with source: "template"
 *   - generateSingleNarrative convenience wrapper
 *   - Empty array input returns empty array
 *   - External narrative hardening (Stage 22):
 *       - No suspicion language in any external narrative
 *       - No scoring / internal logic references
 *       - No wrongdoing implication
 *       - Always contains a neutral anchor phrase
 *       - LLM post-generation guard rejects forbidden phrases
 *       - LLM post-generation guard rejects output missing neutral anchor
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
    // Internal explanation should mention the zone values
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
});

// ─── LLM enrichment tests ──────────────────────────────────────────────────────────

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

// ─── External narrative — Stage 22 hardened tests ────────────────────────────
//
// Three absolute rules:
//   A) No suspicion language
//   B) No scoring / internal logic references
//   C) No wrongdoing implication
//   + Must contain a neutral anchor phrase

describe("external_narrative — Stage 22 hardened rules", () => {

  // ── A) Suspicion language — must never appear ─────────────────────────────
  const SUSPICION_PATTERNS: [string, RegExp][] = [
    ["fraud",                /\bfraud(ulent)?\b/i],
    ["misrepresent",         /\bmisrepresent/i],
    ["misreporting",         /\bmisreport/i],
    ["dishonest",            /\bdishonest/i],
    ["deliberate",           /\bdeliberate/i],
    ["intentional",          /\bintentional/i],
    ["suspect",              /\bsuspect(ed|ious)?\b/i],
    ["false",                /\bfalse\b/i],
    ["fabricate",            /\bfabricat/i],
    ["tamper",               /\btamper/i],
    ["conceal",              /\bconceal/i],
    ["omit",                 /\bomit(ted|ting)?\b/i],
    ["undisclosed",          /\bundisclos/i],
    ["inflated",             /\binflat/i],
    ["exaggerated",          /\bexaggerat/i],
    ["staged",               /\bstaged?\b/i],
    ["collusion",            /\bcollusion\b/i],
    ["deceptive",            /\bdecepti/i],
    ["misleading",           /\bmislead/i],
    ["forged",               /\bforged?\b/i],
    ["scheme",               /\bscheme\b/i],
    ["pre-existing condition", /\bpre[- ]existing condition\b/i],
  ];

  for (const type of ALL_TYPES) {
    for (const [label, pattern] of SUSPICION_PATTERNS) {
      it(`external_narrative for ${type} must NOT contain suspicion word: "${label}"`, async () => {
        const [result] = await generateMismatchNarratives([mismatch(type)], { useLlm: false });
        expect(result.external_narrative).not.toMatch(pattern);
      });
    }
  }

  // ── B) Scoring / internal logic — must never appear ───────────────────────
  const SCORING_PATTERNS: [string, RegExp][] = [
    ["score",             /\bscore\b/i],
    ["weight",            /\bweight(ed)?\b/i],
    ["confidence",        /\bconfidence\b/i],
    ["severity level",    /\bseverity (level|score|rating)\b/i],
    ["high/medium/low risk", /\b(high|medium|low)[- ]risk\b/i],
    ["physics engine",    /\bphysics engine\b/i],
    ["delta-V",           /\bdelta[- ]?v\b/i],
    ["impact vector",     /\bimpact vector\b/i],
    ["consistency check", /\bconsistency (check|score)\b/i],
    ["algorithm",         /\balgorithm\b/i],
    ["machine learning",  /\bmachine learning\b/i],
    ["fraud score",       /\bfraud score\b/i],
    ["risk score",        /\brisk score\b/i],
    ["penalty",           /\bpenalty\b/i],
    ["AI analysis",       /\bai analysis\b/i],
    ["investigat",        /\binvestigat/i],
  ];

  for (const type of ALL_TYPES) {
    for (const [label, pattern] of SCORING_PATTERNS) {
      it(`external_narrative for ${type} must NOT contain internal logic term: "${label}"`, async () => {
        const [result] = await generateMismatchNarratives([mismatch(type)], { useLlm: false });
        expect(result.external_narrative).not.toMatch(pattern);
      });
    }
  }

  // ── C) Neutral anchor phrase — must always appear ─────────────────────────
  const NEUTRAL_ANCHOR = /further review (is )?(required|recommended)|additional verification (is )?needed|additional documentation may be required/i;

  for (const type of ALL_TYPES) {
    it(`external_narrative for ${type} must contain a neutral anchor phrase`, async () => {
      const [result] = await generateMismatchNarratives([mismatch(type)], { useLlm: false });
      expect(result.external_narrative).toMatch(NEUTRAL_ANCHOR);
    });
  }

  // ── Non-empty and ends with punctuation ───────────────────────────────────
  for (const type of ALL_TYPES) {
    it(`produces a non-empty external_narrative for type: ${type}`, async () => {
      const [result] = await generateMismatchNarratives([mismatch(type)], { useLlm: false });
      expect(result.external_narrative.length).toBeGreaterThan(20);
    });
  }

  it("all external narratives end with a period", async () => {
    const results = await generateMismatchNarratives(
      ALL_TYPES.map((t) => mismatch(t)),
      { useLlm: false }
    );
    for (const r of results) {
      expect(r.external_narrative.trimEnd()).toMatch(/[.!?]$/);
    }
  });

  // ── Component name preserved in external narrative ────────────────────────
  it("external_narrative for component_unreported includes component name", async () => {
    const m = mismatch("component_unreported", "medium", { component: "radiator" });
    const [result] = await generateMismatchNarratives([m], { useLlm: false });
    expect(result.external_narrative.toLowerCase()).toContain("radiator");
  });

  it("external_narrative for component_not_visible includes component name", async () => {
    const m = mismatch("component_not_visible", "medium", { component: "rear bumper" });
    const [result] = await generateMismatchNarratives([m], { useLlm: false });
    expect(result.external_narrative.toLowerCase()).toContain("rear bumper");
  });

  it("external_narrative for no_photo_evidence includes component name", async () => {
    const m = mismatch("no_photo_evidence", "low", { component: "rear bumper" });
    const [result] = await generateMismatchNarratives([m], { useLlm: false });
    expect(result.external_narrative.toLowerCase()).toContain("rear bumper");
  });

  // ── Zone_mismatch external narrative must NOT expose raw source labels ─────
  it("zone_mismatch external_narrative does NOT expose raw internal source labels", async () => {
    const m = mismatch("zone_mismatch", "high", { source_a: "Document", source_b: "Photo" });
    const [result] = await generateMismatchNarratives([m], { useLlm: false });
    // The new template uses generic "area" language — it must not include raw source labels
    expect(result.external_narrative).not.toMatch(/\bDocument\b/);
    expect(result.external_narrative).not.toMatch(/\bPhoto\b/);
  });

  // ── severity_mismatch external narrative must NOT expose source labels ─────
  it("severity_mismatch external_narrative does NOT expose internal source labels", async () => {
    const m = mismatch("severity_mismatch", "high", { source_a: "minor", source_b: "severe" });
    const [result] = await generateMismatchNarratives([m], { useLlm: false });
    // Should not expose the raw severity labels from internal sources
    expect(result.external_narrative).not.toMatch(/\bminor\b/i);
    expect(result.external_narrative).not.toMatch(/\bsevere\b/i);
  });

  // ── physics_zone_conflict must NOT expose "physics analysis" label ─────────
  it("physics_zone_conflict external_narrative does NOT mention physics analysis", async () => {
    const m = mismatch("physics_zone_conflict", "high", { source_a: "rear", source_b: "front" });
    const [result] = await generateMismatchNarratives([m], { useLlm: false });
    expect(result.external_narrative).not.toMatch(/physics analysis/i);
    expect(result.external_narrative).not.toMatch(/physics engine/i);
    expect(result.external_narrative).not.toMatch(/delta[- ]?v/i);
  });

  // ── External narrative must differ from internal explanation ──────────────
  it("external_narrative is different from internal explanation", async () => {
    const m = mismatch("zone_mismatch", "high", { source_a: "front", source_b: "rear" });
    const [result] = await generateMismatchNarratives([m], { useLlm: false });
    expect(result.external_narrative).not.toBe(result.explanation);
  });
});

// ─── External narrative — LLM post-generation guard ──────────────────────────

describe("external_narrative — LLM post-generation guard (Stage 22)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("falls back to template when LLM external narrative contains 'fraud'", async () => {
    vi.doMock("../_core/llm", () => ({
      invokeLLM: vi.fn().mockResolvedValue({
        choices: [{ message: { content: JSON.stringify({
          enriched_narrative: "Damage photos show front-zone impact.",
          preserves_meaning: true,
          external_narrative: "The claimant appears to have committed fraud.",
        }) } }],
      }),
    }));
    const { generateMismatchNarratives: gen } = await import("./mismatchNarrative");
    const [result] = await gen([mismatch("zone_mismatch")], { useLlm: true });
    expect(result.external_narrative).not.toMatch(/\bfraud\b/i);
    expect(result.external_narrative).toMatch(NEUTRAL_ANCHOR);
  });

  it("falls back to template when LLM external narrative contains 'misrepresent'", async () => {
    vi.doMock("../_core/llm", () => ({
      invokeLLM: vi.fn().mockResolvedValue({
        choices: [{ message: { content: JSON.stringify({
          external_narrative: "The claimant may have misrepresented the damage location.",
        }) } }],
      }),
    }));
    const { generateMismatchNarratives: gen } = await import("./mismatchNarrative");
    const [result] = await gen([mismatch("zone_mismatch")], { useLlm: true });
    expect(result.external_narrative).not.toMatch(/misrepresent/i);
    expect(result.external_narrative).toMatch(NEUTRAL_ANCHOR);
  });

  it("falls back to template when LLM external narrative contains 'score'", async () => {
    vi.doMock("../_core/llm", () => ({
      invokeLLM: vi.fn().mockResolvedValue({
        choices: [{ message: { content: JSON.stringify({
          external_narrative: "The fraud score for this claim is elevated. Further review is required.",
        }) } }],
      }),
    }));
    const { generateMismatchNarratives: gen } = await import("./mismatchNarrative");
    const [result] = await gen([mismatch("zone_mismatch")], { useLlm: true });
    expect(result.external_narrative).not.toMatch(/\bscore\b/i);
    expect(result.external_narrative).toMatch(NEUTRAL_ANCHOR);
  });

  it("falls back to template when LLM external narrative contains 'delta-V'", async () => {
    vi.doMock("../_core/llm", () => ({
      invokeLLM: vi.fn().mockResolvedValue({
        choices: [{ message: { content: JSON.stringify({
          external_narrative: "The delta-V calculation indicates a different impact zone. Further review is required.",
        }) } }],
      }),
    }));
    const { generateMismatchNarratives: gen } = await import("./mismatchNarrative");
    const [result] = await gen([mismatch("physics_zone_conflict")], { useLlm: true });
    expect(result.external_narrative).not.toMatch(/delta[- ]?v/i);
    expect(result.external_narrative).toMatch(NEUTRAL_ANCHOR);
  });

  it("falls back to template when LLM external narrative contains 'confidence'", async () => {
    vi.doMock("../_core/llm", () => ({
      invokeLLM: vi.fn().mockResolvedValue({
        choices: [{ message: { content: JSON.stringify({
          external_narrative: "The confidence level for this assessment is low. Further review is required.",
        }) } }],
      }),
    }));
    const { generateMismatchNarratives: gen } = await import("./mismatchNarrative");
    const [result] = await gen([mismatch("severity_mismatch")], { useLlm: true });
    expect(result.external_narrative).not.toMatch(/\bconfidence\b/i);
    expect(result.external_narrative).toMatch(NEUTRAL_ANCHOR);
  });

  it("falls back to template when LLM external narrative contains 'investigat'", async () => {
    vi.doMock("../_core/llm", () => ({
      invokeLLM: vi.fn().mockResolvedValue({
        choices: [{ message: { content: JSON.stringify({
          external_narrative: "This claim requires investigation. Further review is recommended.",
        }) } }],
      }),
    }));
    const { generateMismatchNarratives: gen } = await import("./mismatchNarrative");
    const [result] = await gen([mismatch("no_photo_evidence")], { useLlm: true });
    expect(result.external_narrative).not.toMatch(/\binvestigat/i);
    expect(result.external_narrative).toMatch(NEUTRAL_ANCHOR);
  });

  it("falls back to template when LLM external narrative contains 'tamper'", async () => {
    vi.doMock("../_core/llm", () => ({
      invokeLLM: vi.fn().mockResolvedValue({
        choices: [{ message: { content: JSON.stringify({
          external_narrative: "Evidence of tampering has been observed. Further review is required.",
        }) } }],
      }),
    }));
    const { generateMismatchNarratives: gen } = await import("./mismatchNarrative");
    const [result] = await gen([mismatch("component_unreported")], { useLlm: true });
    expect(result.external_narrative).not.toMatch(/\btamper/i);
    expect(result.external_narrative).toMatch(NEUTRAL_ANCHOR);
  });

  it("falls back to template when LLM external narrative has no neutral anchor phrase", async () => {
    vi.doMock("../_core/llm", () => ({
      invokeLLM: vi.fn().mockResolvedValue({
        choices: [{ message: { content: JSON.stringify({
          external_narrative: "A discrepancy was noted between the submitted documents.",
        }) } }],
      }),
    }));
    const { generateMismatchNarratives: gen } = await import("./mismatchNarrative");
    const [result] = await gen([mismatch("zone_mismatch")], { useLlm: true });
    // No neutral anchor → must fall back to template which always has one
    expect(result.external_narrative).toMatch(NEUTRAL_ANCHOR);
  });

  it("falls back to template when LLM external narrative is too short (<20 chars)", async () => {
    vi.doMock("../_core/llm", () => ({
      invokeLLM: vi.fn().mockResolvedValue({
        choices: [{ message: { content: JSON.stringify({
          external_narrative: "Short.",
        }) } }],
      }),
    }));
    const { generateMismatchNarratives: gen } = await import("./mismatchNarrative");
    const [result] = await gen([mismatch("zone_mismatch")], { useLlm: true });
    expect(result.external_narrative.length).toBeGreaterThan(20);
  });

  it("falls back to template when LLM external narrative throws", async () => {
    vi.doMock("../_core/llm", () => {
      throw new Error("LLM unavailable");
    });
    const { generateMismatchNarratives: gen } = await import("./mismatchNarrative");
    const [result] = await gen([mismatch("zone_mismatch")], { useLlm: true });
    expect(result.external_narrative.length).toBeGreaterThan(20);
    expect(result.external_narrative).not.toMatch(/\bfraud\b/i);
  });

  it("accepts valid LLM external narrative that passes all guards", async () => {
    const validExternal = "An inconsistency has been observed between the submitted evidence and the claim documentation. Further review is required to confirm the affected area.";
    vi.doMock("../_core/llm", () => ({
      invokeLLM: vi.fn().mockResolvedValue({
        choices: [{ message: { content: JSON.stringify({
          enriched_narrative: "Damage photos show front-zone impact.",
          preserves_meaning: true,
          external_narrative: validExternal,
        }) } }],
      }),
    }));
    const { generateMismatchNarratives: gen } = await import("./mismatchNarrative");
    const [result] = await gen([mismatch("zone_mismatch")], { useLlm: true });
    // Should use the LLM output since it passes all guards
    expect(result.external_narrative).toBe(validExternal);
  });
});

// Helper constant for neutral anchor check (reused across describe blocks)
const NEUTRAL_ANCHOR = /further review (is )?(required|recommended)|additional verification (is )?needed|additional documentation may be required/i;
