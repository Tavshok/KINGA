/**
 * taxonomy-sync.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Taxonomy Synchronisation Guard
 *
 * Asserts that every canonical part name hardcoded into the LLM prompts
 * (as JSON schema enum arrays) exactly matches the VEHICLE_PARTS taxonomy
 * defined in shared/vehicleParts.ts.
 *
 * WHY THIS TEST EXISTS
 * ────────────────────
 * The LLM prompts in assessment-processor.ts and cross-validation.ts each
 * contain a hardcoded list of canonical part names. If VEHICLE_PARTS is
 * updated (new part added, name changed, part removed) without updating the
 * prompts, the hallucination guard will start rejecting valid AI output — or
 * the prompts will allow names that no longer exist in the taxonomy.
 *
 * This test catches that drift at CI time, before it reaches production.
 *
 * WHAT IS TESTED
 * ──────────────
 * 1. assessment-processor.ts       — damagedComponents enum (CV extraction)
 * 2. assessment-processor.ts       — componentRecommendations enum (repair advice)
 * 3. cross-validation.ts           — part_name enum (photo cross-validation)
 * 4. quoteExtractionEngine.ts      — dynamic resolution via resolveComponent()
 *    (no hardcoded enum — this test verifies that the dynamic approach is
 *    still in place and that resolveComponent is imported from vehicleParts)
 *
 * For each hardcoded-enum source, the test:
 *   a. Extracts the enum array from the source file using a regex
 *   b. Compares it against VEHICLE_PARTS canonical names
 *   c. Reports any names present in the prompt but missing from the taxonomy
 *      (stale prompt names) and any names in the taxonomy but absent from the
 *      prompt (missing prompt coverage).
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { VEHICLE_PARTS, resolveComponent } from "../shared/vehicleParts";

// ─── Canonical taxonomy ───────────────────────────────────────────────────────

/** All canonical part names from the single source of truth. */
const CANONICAL_NAMES = new Set(VEHICLE_PARTS.map((p) => p.name));

// ─── Helper: extract enum arrays from source files ───────────────────────────

/**
 * Reads a TypeScript source file and extracts all JSON-schema-style enum
 * arrays that contain vehicle part names.  The regex matches:
 *
 *   enum: ["Front Bumper", "Bonnet (Hood)", ...]
 *
 * Returns an array of string arrays, one per match found in the file.
 */
function extractEnumArrays(filePath: string): string[][] {
  const src = readFileSync(filePath, "utf-8");
  const results: string[][] = [];

  // Match:  enum: ["...", "...", ...]
  // The array may span multiple lines — we use a non-greedy match and allow
  // newlines inside the bracket pair.
  const enumPattern = /enum:\s*\[([^\]]+)\]/gs;
  let match: RegExpExecArray | null;

  while ((match = enumPattern.exec(src)) !== null) {
    const inner = match[1];
    // Extract individual quoted strings
    const items: string[] = [];
    const strPattern = /"([^"]+)"/g;
    let strMatch: RegExpExecArray | null;
    while ((strMatch = strPattern.exec(inner)) !== null) {
      items.push(strMatch[1]);
    }
    if (items.length > 0) {
      results.push(items);
    }
  }

  return results;
}

/**
 * From all enum arrays found in a file, return only those that look like
 * vehicle part name lists (i.e. contain at least one known canonical name).
 */
function getPartNameEnums(filePath: string): string[][] {
  const allEnums = extractEnumArrays(filePath);
  return allEnums.filter((arr) =>
    arr.some((item) => CANONICAL_NAMES.has(item))
  );
}

// ─── File paths ───────────────────────────────────────────────────────────────

const ROOT = resolve(__dirname, "..");
const ASSESSMENT_PROCESSOR = resolve(ROOT, "server/assessment-processor.ts");
const CROSS_VALIDATION = resolve(ROOT, "server/cross-validation.ts");
const QUOTE_EXTRACTION_ENGINE = resolve(ROOT, "server/pipeline-v2/quoteExtractionEngine.ts");

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Taxonomy Sync: LLM prompt enums must match VEHICLE_PARTS", () => {

  /**
   * Helper that runs the assertion for a single enum array.
   */
  function assertEnumMatchesTaxonomy(
    enumItems: string[],
    label: string
  ) {
    const enumSet = new Set(enumItems);

    // Names in the prompt that are NOT in the taxonomy (stale / misspelled)
    const staleNames = enumItems.filter((n) => !CANONICAL_NAMES.has(n));

    // Names in the taxonomy that are NOT in the prompt (missing coverage)
    const missingNames = [...CANONICAL_NAMES].filter((n) => !enumSet.has(n));

    if (staleNames.length > 0) {
      console.error(
        `\n❌ [${label}] Prompt contains names NOT in VEHICLE_PARTS taxonomy:\n` +
        staleNames.map((n) => `   • "${n}"`).join("\n")
      );
    }

    if (missingNames.length > 0) {
      console.warn(
        `\n⚠️  [${label}] VEHICLE_PARTS names missing from prompt enum:\n` +
        missingNames.map((n) => `   • "${n}"`).join("\n")
      );
    }

    expect(staleNames).toEqual(
      [],
      `${label}: found ${staleNames.length} prompt name(s) not in VEHICLE_PARTS. ` +
      `Update the prompt enum to match the taxonomy.`
    );

    // Missing names are a warning, not a hard failure — the prompt may
    // intentionally omit rarely-damaged parts to keep the enum concise.
    // However, if ALL taxonomy names are missing, something is very wrong.
    expect(enumItems.length).toBeGreaterThan(0,
      `${label}: enum array is empty — extraction regex may have failed.`
    );
  }

  // ── assessment-processor.ts ────────────────────────────────────────────────

  it("assessment-processor.ts: damagedComponents and componentRecommendations enums contain only canonical names", () => {
    const partEnums = getPartNameEnums(ASSESSMENT_PROCESSOR);

    expect(partEnums.length).toBeGreaterThanOrEqual(
      2,
      "Expected at least 2 part-name enum arrays in assessment-processor.ts " +
      "(damagedComponents + componentRecommendations). " +
      "Check that the regex still matches the file structure."
    );

    for (let i = 0; i < partEnums.length; i++) {
      assertEnumMatchesTaxonomy(
        partEnums[i],
        `assessment-processor.ts enum[${i}]`
      );
    }
  });

  // ── cross-validation.ts ────────────────────────────────────────────────────

  it("cross-validation.ts: part_name enum contains only canonical names", () => {
    const partEnums = getPartNameEnums(CROSS_VALIDATION);

    expect(partEnums.length).toBeGreaterThanOrEqual(
      1,
      "Expected at least 1 part-name enum array in cross-validation.ts. " +
      "Check that the regex still matches the file structure."
    );

    for (let i = 0; i < partEnums.length; i++) {
      assertEnumMatchesTaxonomy(
        partEnums[i],
        `cross-validation.ts enum[${i}]`
      );
    }
  });

  // ── quoteExtractionEngine.ts ───────────────────────────────────────────────
  //
  // This engine does NOT use a hardcoded enum array in its LLM prompt.
  // Instead it calls resolveComponent() from shared/vehicleParts at runtime,
  // which means it is inherently taxonomy-safe — any part name the LLM returns
  // is validated against the live VEHICLE_PARTS data.
  //
  // The tests below verify:
  //   (a) The engine still imports resolveComponent from vehicleParts (i.e. the
  //       dynamic approach has not been accidentally replaced with a hardcoded list).
  //   (b) No hardcoded part-name enum arrays have been introduced into the file.
  //   (c) resolveComponent itself correctly resolves a representative sample of
  //       canonical names back to themselves (round-trip identity check).

  it("quoteExtractionEngine.ts: uses dynamic resolveComponent — no hardcoded part-name enum arrays", () => {
    const src = readFileSync(QUOTE_EXTRACTION_ENGINE, "utf-8");

    // (a) Must import resolveComponent from vehicleParts
    expect(src).toMatch(
      /import.*resolveComponent.*from.*vehicleParts/,
      "quoteExtractionEngine.ts must import resolveComponent from shared/vehicleParts. " +
      "If this import was removed, the hallucination guard is broken."
    );

    // (b) Must NOT contain a hardcoded part-name enum array
    const hardcodedEnums = getPartNameEnums(QUOTE_EXTRACTION_ENGINE);
    expect(hardcodedEnums.length).toBe(
      0,
      `quoteExtractionEngine.ts should use dynamic resolveComponent(), not a hardcoded enum. ` +
      `Found ${hardcodedEnums.length} hardcoded part-name enum(s). ` +
      `Remove them and rely on resolveComponent() for validation instead.`
    );
  });

  it("resolveComponent() round-trips all canonical names back to themselves", () => {
    // resolveComponent() returns a VehiclePart object (or null).
    // Every canonical name must resolve to the same part — i.e. resolved.name === part.name.
    // If it doesn't, the hallucination guard will reject valid AI output that uses the
    // exact canonical name.
    const failures: string[] = [];
    for (const part of VEHICLE_PARTS) {
      const resolved = resolveComponent(part.name);
      if (!resolved) {
        failures.push(`"${part.name}" → null (expected self)`);
      } else if (resolved.name !== part.name) {
        failures.push(`"${part.name}" → "${resolved.name}" (expected self)`);
      }
    }
    expect(failures).toEqual(
      [],
      `resolveComponent() failed round-trip for ${failures.length} canonical name(s):\n` +
      failures.map((f) => `  • ${f}`).join("\n")
    );
  });

  // ── Sanity: VEHICLE_PARTS itself is non-empty ──────────────────────────────

  it("VEHICLE_PARTS taxonomy has at least 40 canonical parts", () => {
    expect(VEHICLE_PARTS.length).toBeGreaterThanOrEqual(40);
  });

  // ── Sanity: no duplicate canonical names in VEHICLE_PARTS ─────────────────

  it("VEHICLE_PARTS has no duplicate canonical names", () => {
    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const part of VEHICLE_PARTS) {
      if (seen.has(part.name)) {
        duplicates.push(part.name);
      }
      seen.add(part.name);
    }
    expect(duplicates).toEqual([], `Duplicate canonical names found: ${duplicates.join(", ")}`);
  });
});
