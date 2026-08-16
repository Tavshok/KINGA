import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.resolve(process.cwd(), "server/routers/intelligence-platform.ts"),
  "utf8",
);

describe("intelligence platform P0 tenant authority", () => {
  it("requires a tenant-owned claim before reading workflow and fraud timeline evidence", () => {
    expect(source).toContain("function requireIntelligenceTenant");
    expect(source).toContain("eq(claims.id, input.claimId), eq(claims.tenantId, tenantId)");
    expect(source).toContain("if (!claim) throw new TRPCError({ code: \"NOT_FOUND\", message: \"Claim not found\" })");
    expect(source).toContain(".innerJoin(claims, eq(claims.id, workflowAuditTrail.claimId))");
    expect(source).toContain("eq(workflowAuditTrail.claimId, input.claimId)");
    expect(source).toContain(".innerJoin(claims, eq(claims.id, fraudAlerts.claimId))");
    expect(source).toContain("eq(fraudAlerts.claimId, input.claimId)");
  });

  it("binds fleet and engineering raw SQL summaries to the session tenant without tenantless rows", () => {
    expect(source).toContain("const tenantId = requireIntelligenceTenant(ctx);");
    expect(source).toContain("WHERE f.tenant_id = ${tenantId}");
    expect(source).toContain("fv.tenant_id = ${tenantId}");
    expect(source).toContain("frs.tenant_id = ${tenantId}");
    expect(source).toContain("WHERE i.tenant_id = ${tenantId}");
    expect(source).not.toContain("OR f.tenant_id IS NULL");
    expect(source).not.toContain("OR i.tenant_id IS NULL");
    expect(source).not.toContain("const tenantFilter = ctx.user.tenantId");
  });
});
