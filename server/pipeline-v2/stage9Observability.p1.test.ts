import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const read = (relativePath: string) => readFileSync(resolve(root, relativePath), "utf8");

describe("AUD-P1-008 Stage 9 observability registration", () => {
  it("starts Stage 9 before its parallel execution and records the completed result", () => {
    const source = read("server/pipeline-v2/orchestrator.ts");
    const start = source.indexOf('ctx.onStageStart?.("Stage 9 — Cost Optimisation")');
    const execution = source.indexOf('runWithTimeout("9_cost"');
    const completion = source.indexOf('recordStage("9_cost", s9)');

    expect(start).toBeGreaterThan(-1);
    expect(start).toBeLessThan(execution);
    expect(completion).toBeGreaterThan(execution);
  });

  it("maps Stage 9 to the canonical persistent pipeline-job key", () => {
    const source = read("server/db.ts");
    expect(source).toContain('"Stage 9 — Cost Optimisation":             { id: "9_cost",                index: 11 }');
    expect(source).toContain('"Stage 10 — Report Generation":            { id: "10_report",             index: 12 }');
  });
});
