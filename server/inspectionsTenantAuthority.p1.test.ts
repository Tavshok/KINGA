import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.resolve(process.cwd(), "server/routers/inspections.ts"), "utf8");

describe("inspections tenant authority", () => {
  it("requires a session tenant and retains it for list, engineer assignment, and claim linkage", () => {
    const listToLinkRegion = source.slice(source.indexOf("list: engineerDomainProcedure"), source.indexOf("createProject: engineerDomainProcedure"));
    expect((listToLinkRegion.match(/A tenant-scoped session is required/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(listToLinkRegion).toContain("eq(inspections.tenantId, tenantId)");
    expect(listToLinkRegion).toContain("eq(engineerProfiles.tenantId, tenantId)");
    expect(listToLinkRegion).toContain("eq(claims.tenantId, tenantId)");
    expect(listToLinkRegion).not.toContain("ctx.user!.tenantId ?? \"\"");
  });
});
