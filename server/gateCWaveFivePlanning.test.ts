import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const analysisPath = path.join(repoRoot, "audit/gate-c-scratch-baseline/wave-05-planning-test-output.json");

afterEach(() => fs.rmSync(analysisPath, { force: true }));

describe("Gate C Wave 5 source planning contract", () => {
  it("preserves the remaining final-wave scope, excludes operational channels already proven in Wave 4, and recognises the approved key reconciliation", () => {
    execFileSync(process.execPath, ["scripts/analyse-gate-c-wave-five-plan.mjs", analysisPath], { cwd: repoRoot, stdio: "pipe" });
    const analysis = JSON.parse(fs.readFileSync(analysisPath, "utf8"));
    expect(analysis.originalFinalWaveTableCount).toBe(78);
    expect(analysis.alreadyWavedOperationalChannels).toEqual(["recovery_cases", "recovery_correspondence_log", "whatsapp_sessions"]);
    expect(analysis.expectedTableCount).toBe(75);
    expect(analysis.inspectedTableCount).toBe(75);
    expect(analysis.heldTableOverlap).toEqual([]);
    expect(analysis.rows.map((row: { tableName: string }) => row.tableName)).not.toContain("recovery_cases");
    expect(analysis.rows.map((row: { tableName: string }) => row.tableName)).not.toContain("recovery_correspondence_log");
    expect(analysis.rows.map((row: { tableName: string }) => row.tableName)).not.toContain("whatsapp_sessions");
    expect(analysis.explicitPrimaryKeyGaps).toEqual([]);
    expect(analysis.missingSourceDeclarations).toEqual([]);
    expect(analysis.unresolvedDependencies).toEqual([]);
    expect(analysis.emptyConfiguredIndexNames).toEqual([]);
    expect(analysis.duplicateConfiguredIndexNames).toEqual([]);
    expect(analysis.readiness.readyForSqlGeneration).toBe(true);
  });
});
