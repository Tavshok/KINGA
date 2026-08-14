import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("AUD-P1-002 Stage 9 workflow status propagation", () => {
  it("carries persisted workflow status into normalized database-fallback quote evidence before canonical ledger construction", () => {
    const source = readFileSync(resolve(process.cwd(), "server/pipeline-v2/stage-9-cost.ts"), "utf8");
    expect(source).toContain("workflow_status: row.status ?? \"submitted\"");
    expect(source.indexOf("workflow_status: row.status ?? \"submitted\"")).toBeLessThan(source.indexOf("buildCanonicalQuoteLedger(resolvedExtractedQuotes)"));
  });

  it("feeds only canonical active eligible repair quotes into L2 and persists the same eligible quote count", () => {
    const source = readFileSync(resolve(process.cwd(), "server/pipeline-v2/stage-9-cost.ts"), "utf8");
    expect(source).toContain("selectFinalL2RepairQuoteEvidence(canonicalQuoteLedger)");
    expect(source).toContain("const optimisationInputQuotes: InputQuote[] = activeRepairQuotes");
    expect(source).toContain("quotesEvaluated: canonicalQuoteLedger.activeQuoteCount");
  });

  it("reuses canonical active repair evidence for the later composite matrix, evidence gate, and L1 baseline", () => {
    const source = readFileSync(resolve(process.cwd(), "server/pipeline-v2/stage-9-cost.ts"), "utf8");
    expect(source).toContain("const repairQuotes = activeRepairQuotes.filter((q: any) => {");
    expect(source).toContain("const evidenceGate = assessPipelineEvidenceGate(repairQuotes);");
    expect(source).toContain("const compositeInputQuotes: InputQuoteWithLineItems[] = repairQuotes.map((q: any) => {");
    expect(source).toContain("const allSubmittedTotalsForL1 = activeRepairQuotes");
    expect(source).not.toContain("const repairQuotes = allQuotes.filter((q: any) => {");
    expect(source).not.toContain("const allSubmittedTotalsForL1 = allQuotes");
  });

  it("uses the confirmed P50/30-percent policy rather than the retired P25/P75 credibility gate", () => {
    const engine = readFileSync(resolve(process.cwd(), "server/pipeline-v2/quoteOptimisationEngine.ts"), "utf8");
    expect(engine).toContain("benchmarkWithinTolerance");
    expect(engine).toContain("BENCHMARK_WITHIN_30_PCT");
    expect(engine).toContain("LOWER_OF_BENCHMARK_AND_SUBMITTED_OUTSIDE_30_PCT");
    expect(engine).not.toContain("applyCredibilityGate");
    expect(engine).not.toContain("CG_P25_FLOOR_FACTOR");
    expect(engine).not.toContain("CG_P75_CEILING_FACTOR");
  });
});
