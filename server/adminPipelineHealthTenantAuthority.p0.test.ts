import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.resolve(process.cwd(), "server/routers/admin.ts"), "utf8");
const pipelineHealth = source.slice(source.indexOf("getPipelineHealth: protectedProcedure"));

describe("administrative pipeline health tenant authority", () => {
  it("requires an authorised role and session tenant before pipeline evidence reads", () => {
    expect(pipelineHealth).toContain("Pipeline health requires an authorised administrative role.");
    expect(pipelineHealth).toContain("A tenant-scoped session is required for pipeline health.");
    expect(pipelineHealth).toContain("isAdminRole(ctx.user.role)");
  });

  it("filters pipeline assessments by the authenticated tenant", () => {
    expect(pipelineHealth).toContain(".where(eq(aiAssessments.tenantId, tenantId))");
  });
});
