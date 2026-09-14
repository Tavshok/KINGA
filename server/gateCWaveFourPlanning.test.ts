import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const analysisPath = path.join(repoRoot, "audit/gate-c-scratch-baseline/wave-04-planning-test-output.json");

afterEach(() => fs.rmSync(analysisPath, { force: true }));

describe("Gate C Wave 4 source planning contract", () => {
  it("permits the reviewed 40-table source scope only after the approved key, index, and canonical-source reconciliation", () => {
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
    expect(analysis.explicitPrimaryKeyGaps).toEqual([]);
    expect(analysis.emptyConfiguredIndexNames).toEqual([]);
    expect(analysis.tablesOutsideConfiguredGenerationSource).toEqual([]);
    expect(analysis.duplicatePhysicalTableDeclarations).toEqual([]);
    expect(analysis.canonicalClaimCommentDeclarations).toHaveLength(1);
    expect(analysis.canonicalClaimCommentReadDeclarations).toHaveLength(1);
    expect(analysis.inlineUniqueColumns).toEqual([{ tableName: "notification_events", column: "idempotencyKey" }]);
    expect(analysis.retiredSupplementarySourcePresent).toBe(false);
    expect(analysis.readiness.readyForSqlGeneration).toBe(true);
  });
});
