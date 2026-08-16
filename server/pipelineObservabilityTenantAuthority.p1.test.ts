import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.resolve(process.cwd(), "server/routers/pipeline-observability.ts"), "utf8");

describe("pipeline observability tenant authority", () => {
  it("requires shared administrative role and a session tenant for every exposed observability query", () => {
    expect(source).toContain("isAdminRole(user.role)");
    expect(source.match(/const tenantId = requireTenantId\(ctx\.user\);/g)?.length).toBe(5);
  });

  it("scopes runs jobs stage health claim history and dashboard aggregates by tenant", () => {
    expect(source).toContain("eq(pipelineRuns.tenantId, tenantId)");
    expect(source).toContain("eq(pipelineJobs.tenantId, tenantId)");
    expect(source).toContain("if (!run) return { run: null, jobs: [] };");
    expect(source).not.toContain("ADMIN_ROLES");
  });
});
