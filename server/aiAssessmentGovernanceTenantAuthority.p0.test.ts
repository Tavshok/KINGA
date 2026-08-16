import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.resolve(process.cwd(), "server/routers/ai-assessments-core.ts"),
  "utf8",
);

function procedureBlock(start: string, end: string) {
  return source.slice(source.indexOf(start), source.indexOf(end));
}

describe("AI assessment governance tenant authority", () => {
  it("filters assessment enumeration and requires a tenant-owned claim before governing decision state", () => {
    const all = procedureBlock("all: protectedProcedure", "getSharedRoles:");
    const snapshot = procedureBlock("saveSnapshot: protectedProcedure", "getLatestSnapshot:");
    const replay = procedureBlock("replayDecision: protectedProcedure", "getLifecycle:");
    const review = procedureBlock("markReviewed: protectedProcedure", "finaliseDecision:");
    const finalise = procedureBlock("finaliseDecision: protectedProcedure", "lockDecision:");
    const lock = procedureBlock("lockDecision: protectedProcedure", "getAuditLog:");
    const auditReads = procedureBlock("getAuditLog: protectedProcedure", "validate: protectedProcedure");
    const validation = procedureBlock("validate: protectedProcedure", "getSnapshots:");
    const snapshots = procedureBlock("getSnapshots: protectedProcedure", "}),\n});");

    expect(all).toContain("eq(aiAssessments.tenantId, tenantId)");
    expect(snapshot).toContain("requireGovernedTenantClaim(input.claimId, ctx.user?.tenantId)");
    expect(replay).toContain("requireGovernedTenantClaim(input.claimId, ctx.user?.tenantId)");
    expect(review).toContain("requireGovernedTenantClaim(input.claimId, ctx.user?.tenantId)");
    expect(finalise).toContain("requireGovernedTenantClaim(input.claimId, ctx.user?.tenantId)");
    expect(lock).toContain("requireGovernedTenantClaim(input.claimId, ctx.user?.tenantId)");
    expect(auditReads).toContain("requireGovernedTenantClaim(input.claimId, ctx.user?.tenantId)");
    expect(validation).toContain("getAiAssessmentByClaimId(input.claimId, tenantId)");
    expect(validation).not.toContain("ctx.user.role === 'admin' ? undefined");
    expect(snapshots).toContain("requireGovernedTenantClaim(input.claimId, ctx.user?.tenantId)");
  });
});
