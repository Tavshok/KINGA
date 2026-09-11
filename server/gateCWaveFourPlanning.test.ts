import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const analysisPath = path.join(repoRoot, "audit/gate-c-scratch-baseline/wave-04-planning-test-output.json");

afterEach(() => fs.rmSync(analysisPath, { force: true }));

describe("Gate C Wave 4 source planning contract", () => {
  it("holds SQL generation when any operational-table source key, identifier, or configured-source boundary is unresolved", () => {
    execFileSync(process.execPath, ["scripts/analyse-gate-c-wave-four-plan.mjs", analysisPath], {
      cwd: repoRoot,
      stdio: "pipe",
    });

    const analysis = JSON.parse(fs.readFileSync(analysisPath, "utf8"));
    expect(analysis.expectedTableCount).toBe(40);
    expect(analysis.inspectedTableCount).toBe(40);
    expect(analysis.requestedOperationalChannelExtension).toEqual([
      "recovery_cases",
      "recovery_correspondence_log",
      "whatsapp_sessions",
    ]);
    expect(analysis.heldTableOverlap).toEqual([]);
    expect(analysis.explicitPrimaryKeyGaps.map((row: { tableName: string }) => row.tableName)).toEqual(["tenant_workflow_configs"]);
    expect(analysis.emptyConfiguredIndexNames.map((row: { tableName: string }) => row.tableName)).toEqual(["workflow_audit_trail"]);
    expect(analysis.tablesOutsideConfiguredGenerationSource.map((row: { tableName: string }) => row.tableName)).toEqual(["claim_comment_reads"]);
    expect(analysis.readiness.readyForSqlGeneration).toBe(false);
  });
});
