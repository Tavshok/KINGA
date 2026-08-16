import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.resolve(process.cwd(), "server/routers/claims-core.ts"),
  "utf8",
);

function block(start: string, end: string) {
  return source.slice(source.indexOf(start), source.indexOf(end));
}

describe("claims-core tenant authority", () => {
  it("requires a tenant-scoped claim before policy verification and adjuster sign-off reads or writes", () => {
    const policy = block("verifyPolicy: protectedProcedure", "triggerAiAssessment: protectedProcedure");
    const saveSignOff = block("saveAdjusterSignOff: protectedProcedure", "getAdjusterSignOff: protectedProcedure");
    const getSignOff = block("getAdjusterSignOff: protectedProcedure", "acceptSettlement: protectedProcedure");
    expect(policy).toContain("requireTenantScopedClaim(ctx, input.claimId)");
    expect(policy).toContain("updateClaimPolicyVerification(input.claimId, input.verified, tenantId)");
    expect(saveSignOff).toContain("requireTenantScopedClaim(ctx, input.claimId)");
    expect(getSignOff).toContain("requireTenantScopedClaim(ctx, input.claimId)");
  });

  it("guards settlement, dispute, payment, rejection, and override actions before tenant-bound writes", () => {
    const settlement = block("acceptSettlement: protectedProcedure", "initiateDispute: protectedProcedure");
    const dispute = block("initiateDispute: protectedProcedure", "getDisputeInfo: protectedProcedure");
    const disputeInfo = block("getDisputeInfo: protectedProcedure", "authorizePayment: protectedProcedure");
    const payment = block("authorizePayment: protectedProcedure", "rejectClaim: protectedProcedure");
    const rejection = block("rejectClaim: protectedProcedure", "insurerOverride: protectedProcedure");
    const override = block("insurerOverride: protectedProcedure", "recordInvestigation: protectedProcedure");
    for (const procedure of [settlement, dispute, disputeInfo, payment, rejection, override]) {
      expect(procedure).toContain("requireTenantScopedClaim(ctx, input.claimId)");
    }
    for (const mutation of [settlement, dispute, payment, rejection, override]) {
      expect(mutation).toContain("eq(claims.tenantId, tenantId)");
    }
  });

  it("requires a session tenant or tenant-owned claim across remaining direct claim reads and workflow actions", () => {
    const detail = block("getById: protectedProcedure", "assignToAssessor: insurerDomainProcedure");
    const assessment = block("triggerAiAssessment: protectedProcedure", "resetStuckClaim: protectedProcedure");
    const reset = block("resetStuckClaim: protectedProcedure", "debugPipeline: protectedProcedure");
    const debug = block("debugPipeline: protectedProcedure", "approveClaim: protectedProcedure");
    const approval = block("approveClaim: protectedProcedure", "sendBackClaim: protectedProcedure");
    const sendBack = block("sendBackClaim: protectedProcedure", "closeForProcessing: protectedProcedure");
    const close = block("closeForProcessing: protectedProcedure", "escalateClaim: protectedProcedure");
    const escalation = block("escalateClaim: protectedProcedure", "reopenClaim: protectedProcedure");
    const reopening = block("reopenClaim: protectedProcedure", "financialApproval: protectedProcedure");
    const financial = block("financialApproval: protectedProcedure", "getPanelBeaterChoices: protectedProcedure");
    const choices = block("getPanelBeaterChoices: protectedProcedure", "updateCurrency: protectedProcedure");
    const currency = block("updateCurrency: protectedProcedure", "assignClaimToRepairer: protectedProcedure");

    expect(detail).toContain("requireTenantScopedClaim(ctx, input.id)");
    for (const procedure of [assessment, reset, debug, approval, sendBack, close, escalation, reopening, financial, choices, currency]) {
      expect(procedure).toContain("requireTenantScopedClaim(ctx, input.claimId)");
      expect(procedure).not.toContain('|| "default"');
    }
    expect(detail).not.toContain('|| "default"');
    expect(assessment).toContain("eq(claims.tenantId, claimTenantId)");
    for (const mutation of [reset, close, financial, currency]) {
      expect(mutation).toContain("eq(claims.tenantId, tenantId)");
    }
    expect(currency).toContain("eq(aiAssessmentsTable.tenantId, tenantId)");
    expect(currency).toContain("eq(panelBeaterQuotesTable.tenantId, tenantId)");
  });
});
