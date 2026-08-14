import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(import.meta.dirname, "..");
const schemaSource = readFileSync(resolve(projectRoot, "drizzle/schema.ts"), "utf8");
const helperSource = readFileSync(resolve(projectRoot, "server/db-pipeline.ts"), "utf8");
const orchestrationSource = readFileSync(resolve(projectRoot, "server/db.ts"), "utf8");

describe("pipeline observability canonical boundary", () => {
  it("uses pipeline_runs and pipeline_jobs as the only canonical execution telemetry records", () => {
    expect(schemaSource).toContain('mysqlTable("pipeline_runs"');
    expect(schemaSource).toContain('mysqlTable("pipeline_jobs"');
    expect(schemaSource).not.toContain('mysqlTable("pipeline_execution_logs"');
    expect(helperSource).toContain("Tables: pipeline_runs, pipeline_jobs");
  });

  it("connects each stage to its canonical run, claim, tenant, index, and lifecycle status", () => {
    expect(helperSource).toContain("claimId: payload.claimId");
    expect(helperSource).toContain("tenantId: payload.tenantId ?? null");
    expect(helperSource).toContain("isDegraded: payload.isDegraded ? 1 : 0");
    expect(helperSource).toContain("recoveryActionCount: payload.recoveryActionCount ?? 0");
    expect(orchestrationSource).toContain("recordRunStart({");
    expect(orchestrationSource).toContain("recordStageStart({");
    expect(orchestrationSource).toContain("recordStageComplete({");
  });

  it("keeps observability failures non-blocking and does not create parallel execution truth", () => {
    expect(helperSource).toContain("Fire-and-forget: never throw");
    expect(helperSource).not.toContain("pipeline_execution_logs");
    expect(orchestrationSource).toContain("catch(() => {})");
  });
});
