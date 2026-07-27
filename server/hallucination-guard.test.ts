/**
 * hallucination-guard.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Regression tests that verify fabricated / hallucinated car part names are
 * either stripped or normalised to canonical names by the hallucination guards
 * before they can reach the database or be returned to callers.
 *
 * Key insight: resolveComponent() uses fuzzy matching. Names that contain a
 * recognisable part keyword (e.g. "Fender", "Grille", "Exhaust") are mapped
 * to the nearest canonical part — this is CORRECT behaviour (the AI described
 * a real part with invented adjectives). Names that contain no recognisable
 * keyword (e.g. "Quantum Flux Array") are rejected and return null.
 *
 * Note: "Turbo Flux Capacitor" is NOT purely nonsensical — "turbo" is a valid
 * alias for Turbocharger, so it correctly fuzzy-matches to that part.
 *
 * Covers all four guard layers:
 *   1. quoteExtractionEngine  — components[] array
 *   2. quoteExtractionEngine  — line_items[].component
 *   3. assessment-processor   — damagedComponents[] (post-extraction filter)
 *   4. cross-validation       — visible_damage[].partName (photo analysis)
 *
 * The LLM is mocked so these tests run instantly without network calls.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { resolveComponent, VEHICLE_PARTS } from "../shared/vehicleParts";

// ─── Canonical part names for assertions ─────────────────────────────────────
const CANONICAL_NAMES = new Set(VEHICLE_PARTS.map(p => p.name));

/**
 * Completely nonsensical names — no recognisable automotive keyword.
 * These MUST be rejected (resolveComponent returns null).
 */
const PURELY_NONSENSICAL = [
  "Quantum Flux Array",     // no automotive keyword — purely fictional
  "Quantum Bumper Array",   // "Bumper" alone doesn't match — "Quantum" prefix breaks it
  "Neural Crumple Zone",
  "Nano-Carbon Door Skin",
  "Plasma Headlight Matrix",
  "Chrono-Suspension Unit",
  "Bio-Steel Quarter",
];

/**
 * Names with a real automotive keyword buried in sci-fi adjectives.
 * resolveComponent CORRECTLY maps these to the nearest canonical part.
 * e.g. "Hyper-Drive Fender" → "Front Fender (Left)"
 */
const FUZZY_MATCHED = [
  { raw: "Hyper-Drive Fender",    canonical: "Front Fender (Left)" },
  { raw: "Photon Grille Assembly", canonical: "Front Grille" },
  { raw: "Vortex Exhaust Manifold", canonical: "Exhaust System" },
  { raw: "Turbo Flux Capacitor",  canonical: "Turbocharger" }, // "turbo" is a valid alias
];

// ─── Helper: assert all names in array are canonical ─────────────────────────
function assertAllCanonical(parts: string[], context: string) {
  for (const part of parts) {
    expect(
      CANONICAL_NAMES.has(part),
      `${context}: "${part}" is not a canonical part name`
    ).toBe(true);
  }
}

// ─── 1 & 2. quoteExtractionEngine guard ──────────────────────────────────────
describe("Hallucination Guard — quoteExtractionEngine", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("strips purely nonsensical names from components[] and normalises fuzzy matches", async () => {
    vi.doMock("./_core/llm", () => ({
      invokeLLM: vi.fn().mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              panel_beater: "Test Panel Shop",
              total_cost: 15000,
              currency: "ZAR",
              components: [
                "Front Bumper",           // ✅ exact canonical
                "Quantum Flux Array",     // ❌ nonsensical → stripped
                "Bonnet (Hood)",          // ✅ exact canonical
                "Neural Crumple Zone",    // ❌ nonsensical → stripped
                "Hyper-Drive Fender",     // ⚠️  fuzzy → "Front Fender (Left)"
                "Headlight Assembly (Left)", // ✅ exact canonical
              ],
              line_items: [],
              labour_defined: false,
              parts_defined: true,
              confidence: "medium",
            })
          }
        }]
      }),
      withRetry: vi.fn(async (fn: () => Promise<unknown>) => fn()),
    }));

    const { extractQuoteFromText } = await import("./pipeline-v2/quoteExtractionEngine");
    const result = await extractQuoteFromText("Test quote text with fabricated parts");

    // 4 valid parts: 3 exact + 1 fuzzy-matched
    expect(result.components).toHaveLength(4);
    assertAllCanonical(result.components, "components[]");
    expect(result.components).toContain("Front Bumper");
    expect(result.components).toContain("Bonnet (Hood)");
    expect(result.components).toContain("Front Fender (Left)"); // fuzzy match
    expect(result.components).toContain("Headlight Assembly (Left)");
  });

  it("strips nonsensical names from line_items[].component", async () => {
    vi.doMock("./_core/llm", () => ({
      invokeLLM: vi.fn().mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              panel_beater: "Test Panel Shop",
              total_cost: 20000,
              currency: "ZAR",
              components: ["Rear Bumper"],
              line_items: [
                { component: "Rear Bumper", unit_cost: 5000, quantity: 1, line_total: 5000, action: "replace" },
                { component: "Chrono-Suspension Unit", unit_cost: 9999, quantity: 1, line_total: 9999, action: "replace" }, // ❌ nonsensical
                { component: "Front Fender (Left)", unit_cost: 3000, quantity: 1, line_total: 3000, action: "repair" },
                { component: "Plasma Headlight Matrix", unit_cost: 7777, quantity: 1, line_total: 7777, action: "replace" }, // ❌ nonsensical
              ],
              labour_defined: false,
              parts_defined: true,
              confidence: "medium",
            })
          }
        }]
      }),
      withRetry: vi.fn(async (fn: () => Promise<unknown>) => fn()),
    }));

    const { extractQuoteFromText } = await import("./pipeline-v2/quoteExtractionEngine");
    const result = await extractQuoteFromText("Test quote with hallucinated line items");

    expect(result.line_items).toHaveLength(2);
    const lineItemComponents = result.line_items.map(li => li.component);
    assertAllCanonical(lineItemComponents, "line_items[].component");
    expect(lineItemComponents).toContain("Rear Bumper");
    expect(lineItemComponents).toContain("Front Fender (Left)");
  });

  it("returns empty arrays when ALL components are purely nonsensical", async () => {
    vi.doMock("./_core/llm", () => ({
      invokeLLM: vi.fn().mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              panel_beater: "Shady Shop",
              total_cost: 50000,
              currency: "ZAR",
              components: PURELY_NONSENSICAL,
              line_items: PURELY_NONSENSICAL.map(name => ({
                component: name,
                unit_cost: 1000,
                quantity: 1,
                line_total: 1000,
                action: "replace",
              })),
              labour_defined: false,
              parts_defined: true,
              confidence: "high",
            })
          }
        }]
      }),
      withRetry: vi.fn(async (fn: () => Promise<unknown>) => fn()),
    }));

    const { extractQuoteFromText } = await import("./pipeline-v2/quoteExtractionEngine");
    const result = await extractQuoteFromText("Quote with entirely nonsensical parts");

    expect(result.components).toHaveLength(0);
    expect(result.line_items).toHaveLength(0);
  });
});

// ─── 3. assessment-processor damagedComponents guard ─────────────────────────
describe("Hallucination Guard — damagedComponents post-extraction filter", () => {
  it("resolveComponent returns null for purely nonsensical part names", () => {
    for (const name of PURELY_NONSENSICAL) {
      const result = resolveComponent(name);
      expect(
        result,
        `resolveComponent("${name}") should return null but returned ${JSON.stringify(result?.name)}`
      ).toBeNull();
    }
  });

  it("resolveComponent correctly fuzzy-matches plausible hallucinations to canonical names", () => {
    for (const { raw, canonical } of FUZZY_MATCHED) {
      const result = resolveComponent(raw);
      expect(result, `resolveComponent("${raw}") should not be null`).not.toBeNull();
      expect(result!.name).toBe(canonical);
    }
  });

  it("resolveComponent returns a canonical part for all 48 known parts", () => {
    for (const part of VEHICLE_PARTS) {
      const byName = resolveComponent(part.name);
      expect(byName, `resolveComponent("${part.name}") should not be null`).not.toBeNull();
      expect(byName!.id).toBe(part.id);
    }
  });

  it("resolveComponent normalises case and whitespace", () => {
    expect(resolveComponent("  front bumper  ")).not.toBeNull();
    expect(resolveComponent("FRONT BUMPER")).not.toBeNull();
    expect(resolveComponent("Front  Bumper")).not.toBeNull();
    expect(resolveComponent("bonnet")).not.toBeNull();
    expect(resolveComponent("BONNET (HOOD)")).not.toBeNull();
  });

  it("damagedComponents guard logic: strips nonsensical names, normalises fuzzy matches", () => {
    const rawComponents = [
      "Front Bumper",           // ✅ exact
      "Quantum Flux Array",     // ❌ nonsensical → null → stripped
      "Rear Bumper",            // ✅ exact
      "Neural Crumple Zone",    // ❌ nonsensical → null → stripped
      "Windscreen (Windshield)",// ✅ exact
      "Hyper-Drive Fender",     // ⚠️  fuzzy → "Front Fender (Left)"
    ];

    const filtered = rawComponents
      .map(name => {
        const resolved = resolveComponent(name);
        return resolved ? resolved.name : null;
      })
      .filter((name): name is string => name !== null);

    expect(filtered).toHaveLength(4); // 3 exact + 1 fuzzy
    assertAllCanonical(filtered, "damagedComponents guard");
    expect(filtered).toContain("Front Bumper");
    expect(filtered).toContain("Rear Bumper");
    expect(filtered).toContain("Windscreen (Windshield)");
    expect(filtered).toContain("Front Fender (Left)");
  });
});

// ─── 4. cross-validation visible_damage guard ────────────────────────────────
describe("Hallucination Guard — cross-validation visible_damage filter", () => {
  it("visible_damage guard: strips nonsensical parts, normalises fuzzy matches", () => {
    const rawVisibleDamage = [
      { part_name: "Front Bumper", damage_description: "Cracked", severity: "moderate", confidence: 0.9 },
      { part_name: "Neural Crumple Zone", damage_description: "Destroyed", severity: "severe", confidence: 0.8 }, // ❌
      { part_name: "Bonnet (Hood)", damage_description: "Dented", severity: "minor", confidence: 0.85 },
      { part_name: "Chrono-Suspension Unit", damage_description: "Bent", severity: "severe", confidence: 0.7 }, // ❌
      { part_name: "Photon Grille Assembly", damage_description: "Cracked", severity: "minor", confidence: 0.75 }, // ⚠️ fuzzy
      { part_name: "Headlight Assembly (Right)", damage_description: "Shattered", severity: "severe", confidence: 0.95 },
    ];

    const filtered = rawVisibleDamage
      .map(d => {
        const resolved = resolveComponent(d.part_name);
        if (!resolved) return null;
        return { partName: resolved.name, damageDescription: d.damage_description };
      })
      .filter((d): d is NonNullable<typeof d> => d !== null);

    // 4 survive: 3 exact + 1 fuzzy ("Photon Grille Assembly" → "Front Grille")
    expect(filtered).toHaveLength(4);
    const partNames = filtered.map(d => d.partName);
    assertAllCanonical(partNames, "visible_damage guard");
    expect(partNames).toContain("Front Bumper");
    expect(partNames).toContain("Bonnet (Hood)");
    expect(partNames).toContain("Front Grille"); // fuzzy match
    expect(partNames).toContain("Headlight Assembly (Right)");
  });

  it("visible_damage guard: returns empty array when all parts are purely nonsensical", () => {
    const rawVisibleDamage = PURELY_NONSENSICAL.map(name => ({
      part_name: name,
      damage_description: "Completely destroyed",
      severity: "severe",
      confidence: 0.99,
    }));

    const filtered = rawVisibleDamage
      .map(d => {
        const resolved = resolveComponent(d.part_name);
        return resolved ? { partName: resolved.name } : null;
      })
      .filter(Boolean);

    expect(filtered).toHaveLength(0);
  });
});

// ─── 5. End-to-end: canonical part names are stable ──────────────────────────
describe("Canonical Part Names — stability contract", () => {
  it("VEHICLE_PARTS contains exactly 194 parts", () => {
    expect(VEHICLE_PARTS).toHaveLength(194);
  });

  it("all canonical part names are unique", () => {
    const names = VEHICLE_PARTS.map(p => p.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it("all canonical part IDs are unique", () => {
    const ids = VEHICLE_PARTS.map(p => p.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it("all 48 known canonical names resolve correctly", () => {
    for (const part of VEHICLE_PARTS) {
      const resolved = resolveComponent(part.name);
      expect(resolved).not.toBeNull();
      expect(resolved!.name).toBe(part.name);
    }
  });

  it("common shorthand aliases resolve to canonical names", () => {
    const aliases: [string, string][] = [
      ["bonnet", "Bonnet (Hood)"],
      ["hood", "Bonnet (Hood)"],
      ["windshield", "Windscreen (Windshield)"],
      ["windscreen", "Windscreen (Windshield)"],
      ["front bumper", "Front Bumper"],
      ["rear bumper", "Rear Bumper"],
      ["boot lid", "Boot Lid (Trunk Lid)"],
      ["trunk lid", "Boot Lid (Trunk Lid)"],
    ];
    for (const [alias, expectedName] of aliases) {
      const resolved = resolveComponent(alias);
      expect(resolved, `alias "${alias}" should resolve`).not.toBeNull();
      expect(resolved!.name).toBe(expectedName);
    }
  });
});
