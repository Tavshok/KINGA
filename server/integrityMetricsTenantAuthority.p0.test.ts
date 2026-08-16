import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.resolve(process.cwd(), "server/routers.ts"), "utf8");

describe("Integrity Metrics tenant authority", () => {
  it("binds ordinary callers to their session tenant and requires explicit platform selection", () => {
    const region = source.slice(source.indexOf("export const integrityRouter"), source.indexOf("export const integrityRouter") + 2800);
    expect(region).toContain('ctx.user.role === "platform_super_admin"');
    expect(region).toContain("Tenant selection must match the authenticated session.");
    expect(region).toContain("eq(aiAssessmentsTable.tenantId, effectiveTenantId)");
    expect(region).not.toContain("ctx.user.role === 'admin' ? null");
  });
});
