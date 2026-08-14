import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const read = (relativePath: string) => readFileSync(resolve(root, relativePath), "utf8");

describe("AUD-P1-008 Stage 9 canonical ledger persistence boundary", () => {
  it("restores the schema namespace required by both benchmark query helpers", () => {
    const source = read("server/db/intelligence-db.ts");
    expect(source).toContain('import * as schema from "../../drizzle/schema";');
    expect(source).toContain("schema.componentRepairOutcomes");
    expect(source).toContain("schema.componentBenchmarks");
  });

  it("persists canonical quote-state evidence before the non-fatal benchmark branch", () => {
    const source = read("server/pipeline-v2/stage-9-cost.ts");
    const outputPosition = source.indexOf('const output = ensureCostContract');
    const baselinePosition = source.indexOf('Persist the canonical quote-state baseline before optional benchmark enrichment.');
    const benchmarkPosition = source.indexOf('// ── Phase 2: Per-component KINGA benchmarks');

    expect(outputPosition).toBeGreaterThan(-1);
    expect(baselinePosition).toBeGreaterThan(outputPosition);
    expect(baselinePosition).toBeLessThan(benchmarkPosition);
    expect(source).toContain('canonicalQuoteLedger: canonicalQuoteLedger.entries');
    expect(source).toContain('quotesEvaluated: canonicalQuoteLedger.activeQuoteCount');
    expect(source).toContain('l1SubmittedCostUsd: baselineL1SubmittedCostUsd');
  });
});
