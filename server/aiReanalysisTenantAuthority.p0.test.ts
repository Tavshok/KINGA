import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.resolve(process.cwd(), "server/routers/ai-reanalysis.ts"),
  "utf8",
);

describe("AI reanalysis tenant authority", () => {
  it("requires a tenant-scoped session for every exposed reanalysis operation", () => {
    const reRun = source.slice(source.indexOf("reRunAiAnalysis:"), source.indexOf("getVersionHistory:"));
    const history = source.slice(source.indexOf("getVersionHistory:"), source.indexOf("compareVersions:"));
    const compare = source.slice(source.indexOf("compareVersions:"), source.indexOf("getReanalysisStats:"));
    const stats = source.slice(source.indexOf("getReanalysisStats:"));

    expect(reRun).toContain("requireReanalysisTenant(ctx.user.tenantId)");
    expect(reRun).toContain("eq(claims.tenantId, tenantId)");
    expect(reRun).toContain("eq(aiAssessments.tenantId, tenantId)");
    expect(history).toContain("requireReanalysisTenant(ctx.user.tenantId)");
    expect(history).toContain("eq(claims.tenantId, tenantId)");
    expect(history).toContain("eq(aiAssessments.tenantId, tenantId)");
    expect(compare).toContain("requireReanalysisTenant(ctx.user.tenantId)");
    expect(compare).toContain("eq(aiAssessments.tenantId, tenantId)");
    expect(stats).toContain("requireReanalysisTenant(ctx.user.tenantId)");
    expect(stats).toContain("eq(aiAssessments.tenantId, tenantId)");
    expect(source).not.toContain("tenantId ? eq(aiAssessments.tenantId, tenantId) : undefined");
    expect(source).not.toContain("tenantId ? eq(claims.tenantId, tenantId) : undefined");
  });
});
