import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.resolve(process.cwd(), "server/routers/claims-core.ts"), "utf8");

describe("claims assignment notification tenant authority", () => {
  it("passes the insurer-resolved tenant directly into optional assignment notification delivery", () => {
    const assignment = source.slice(source.indexOf("assignClaimToAssessor"), source.indexOf("// Create in-app notification for assessor"));
    expect(assignment).toContain("const tenantId = ctx.insurerTenantId");
    expect(assignment).toContain("tenantId,");
    expect(assignment).not.toMatch(/tenantId\s*\|\|\s*['"]default['"]/);
  });
});
