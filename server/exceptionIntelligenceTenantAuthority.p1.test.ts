import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.resolve(process.cwd(), "server/routers/exception-intelligence.ts"),
  "utf8",
);

describe("exception intelligence tenant authority", () => {
  it("derives queue and aggregate scope from the session tenant and retains parent claim scope", () => {
    expect(source).toContain("function requireExceptionIntelligenceTenant");
    expect(source).toContain("const tenantId = requireExceptionIntelligenceTenant(ctx);");
    expect(source).toContain("eq(aiAssessments.tenantId, tenantId)");
    expect(source).toContain("eq(claims.tenantId, tenantId)");
    expect(source).not.toContain("effectiveTenantId");
    expect(source).not.toContain("input.tenantId");
    expect(source).not.toContain("isAdminRole(ctx.user.role)");
  });

  it("requires a session tenant in drift comparisons and actionable recommendations", () => {
    expect(source).toContain("conditions.push(eq(aiAssessments.tenantId, tenantId));");
    expect(source).toContain("isNotNull(aiAssessments.ifeResultJson)");
    expect(source).toContain("throw new TRPCError({ code: \"FORBIDDEN\", message: \"A tenant-scoped session is required\" })");
    expect(source).not.toContain("tenantId: z.string().optional()");
  });
});
