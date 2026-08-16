import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const routerSource = fs.readFileSync(
  path.resolve(process.cwd(), "server/routers/workflow-audit.ts"),
  "utf8",
);
const utilitySource = fs.readFileSync(
  path.resolve(process.cwd(), "server/utils/workflow-audit.ts"),
  "utf8",
);

describe("workflow audit tenant authority", () => {
  it("derives a mandatory session tenant before each router operation", () => {
    expect(routerSource).toContain("function requireWorkflowAuditTenant");
    expect(routerSource).toContain("const tenantId = requireWorkflowAuditTenant(ctx);");
    expect(routerSource).toContain("tenantId,");
    expect(routerSource).toContain("getClaimWorkflowHistory(input.claimId, requireWorkflowAuditTenant(ctx))");
  });

  it("retains tenant scope through transition logging claim update and workflow history", () => {
    expect(utilitySource).toContain("tenantId: string;");
    expect(utilitySource).toContain("eq(claims.id, input.claimId), eq(claims.tenantId, input.tenantId)");
    expect(utilitySource).toContain(".where(and(eq(claims.id, input.claimId), eq(claims.tenantId, input.tenantId)))");
    expect(utilitySource).toContain("export async function getClaimWorkflowHistory(claimId: number, tenantId: string)");
    expect(utilitySource).toContain("eq(workflowAuditTrail.claimId, claimId), eq(claims.tenantId, tenantId)");
    expect(utilitySource).not.toContain("export async function getClaimWorkflowHistory(claimId: number) {");
  });
});
