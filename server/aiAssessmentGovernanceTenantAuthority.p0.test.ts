import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.resolve(process.cwd(), "server/routers/ai-assessments-core.ts"),
  "utf8"
);
const claimDecisionReportSource = fs.readFileSync(
  path.resolve(process.cwd(), "client/src/pages/ClaimDecisionReport.page.tsx"),
  "utf8"
);

function procedureBlock(start: string, end: string) {
  return source.slice(source.indexOf(start), source.indexOf(end));
}

describe("AI assessment governance tenant authority", () => {
  it("filters assessment enumeration and requires a tenant-owned claim before governing decision state", () => {
    const all = procedureBlock("all: protectedProcedure", "getSharedRoles:");
    const snapshot = procedureBlock(
      "saveSnapshot: protectedProcedure",
      "getLatestSnapshot:"
    );
    const latestSnapshot = procedureBlock(
      "getLatestSnapshot: protectedProcedure",
      "replayDecision:"
    );
    const replay = procedureBlock(
      "replayDecision: protectedProcedure",
      "getLifecycle:"
    );
    const lifecycle = procedureBlock(
      "getLifecycle: protectedProcedure",
      "markReviewed:"
    );
    const review = procedureBlock(
      "markReviewed: protectedProcedure",
      "finaliseDecision:"
    );
    const finalise = procedureBlock(
      "finaliseDecision: protectedProcedure",
      "lockDecision:"
    );
    const lock = procedureBlock(
      "lockDecision: protectedProcedure",
      "getAuditLog:"
    );
    const replayLogs = procedureBlock(
      "getReplayLogs: protectedProcedure",
      "validate: protectedProcedure"
    );
    const auditReads = procedureBlock(
      "getAuditLog: protectedProcedure",
      "validate: protectedProcedure"
    );
    const validation = procedureBlock(
      "validate: protectedProcedure",
      "getSnapshots:"
    );
    const snapshots = procedureBlock(
      "getSnapshots: protectedProcedure",
      "}),\n});"
    );

    for (const [procedure, protectedCapability] of [
      [snapshot, /await import\((['"])\.\.\/db\1\)/],
      [replay, /await import\((['"])\.\.\/db\1\)/],
      [review, /await import\((['"])\.\.\/decision-governance\1\)/],
      [finalise, /await import\((['"])\.\.\/decision-governance\1\)/],
      [lock, /await import\((['"])\.\.\/decision-lifecycle\1\)/],
      [replayLogs, /await import\((['"])\.\.\/decision-lifecycle\1\)/],
      [auditReads, /await import\((['"])\.\.\/decision-governance\1\)/],
    ]) {
      const protectedCapabilityIndex = procedure.search(protectedCapability);
      expect(procedure.indexOf("if (p0B1FraudPolicyActive())")).toBeGreaterThan(
        procedure.indexOf("requireGovernedTenantClaim")
      );
      expect(procedure.indexOf("if (p0B1FraudPolicyActive())")).toBeLessThan(
        protectedCapabilityIndex
      );
    }

    expect(all).toContain("eq(aiAssessments.tenantId, tenantId)");
    for (const procedure of [
      snapshot,
      latestSnapshot,
      replay,
      lifecycle,
      review,
      finalise,
      lock,
      replayLogs,
      auditReads,
    ]) {
      expect(procedure).toContain("requireDecisionActionActor(ctx)");
      expect(procedure).toContain("requireGovernedTenantClaim(");
      expect(procedure).toContain("input.claimId");
      expect(procedure).toContain("ctx.user?.tenantId");
      expect(procedure.indexOf("requireDecisionActionActor(ctx)")).toBeLessThan(
        procedure.indexOf("requireGovernedTenantClaim(")
      );
    }
    expect(validation).toMatch(
      /requireGovernedTenantClaim\(\s*String\(input\.claimId\),\s*ctx\.user\.tenantId\s*\)/
    );
    expect(validation).toContain(
      "buildP0B1FraudDecisionHold({ claimId: input.claimId })"
    );
    expect(validation).not.toContain("runOutputValidation");
    expect(validation).not.toContain("fraudScore:");
    expect(validation).not.toContain("ctx.user.role === 'admin' ? undefined");
    expect(snapshots).toContain(
      "requireGovernedTenantClaim(input.claimId, ctx.user?.tenantId)"
    );
    expect(snapshots).toContain("requireDecisionActionActor(ctx)");
    expect(snapshots.indexOf("requireDecisionActionActor(ctx)")).toBeLessThan(
      snapshots.indexOf("requireGovernedTenantClaim(")
    );
    const heldSnapshotBranch = snapshots.slice(
      snapshots.indexOf("if (p0B1FraudPolicyActive())"),
      snapshots.indexOf("const { getDecisionSnapshots }")
    );
    expect(heldSnapshotBranch).toContain("buildP0B1FraudDecisionHold({");
    expect(heldSnapshotBranch).toContain("snapshots: []");
    expect(heldSnapshotBranch).toContain(
      "collisionPhysics: buildP0A2CollisionPhysicsHold()"
    );
    expect(heldSnapshotBranch).not.toContain("fraudScore");
    expect(heldSnapshotBranch).not.toContain("fraudLevel");
    expect(heldSnapshotBranch).not.toContain("getDecisionSnapshots");
  });

  it("derives every assessment fraud hold from the shared P0-B1 contract", () => {
    const enforcement = procedureBlock(
      "getEnforcement: protectedProcedure",
      "saveSnapshot: protectedProcedure"
    );
    const snapshot = procedureBlock(
      "saveSnapshot: protectedProcedure",
      "getLatestSnapshot:"
    );
    const latestSnapshot = procedureBlock(
      "getLatestSnapshot: protectedProcedure",
      "replayDecision:"
    );
    const replay = procedureBlock(
      "replayDecision: protectedProcedure",
      "getLifecycle:"
    );
    const finalise = procedureBlock(
      "finaliseDecision: protectedProcedure",
      "lockDecision:"
    );
    const shared = procedureBlock(
      "getSharedWithMe: protectedProcedure",
      "resolvePdfPhotoUrls:"
    );
    const auditReads = procedureBlock(
      "getAuditLog: protectedProcedure",
      "validate: protectedProcedure"
    );

    expect(source).toContain(
      'from "../evidence-governance/p0FraudDecisionHold"'
    );
    expect(source).not.toContain("P0_FRAUD_REVIEW_HOLD");
    expect(source).not.toContain("withP0FraudHold");
    expect(source).toContain("projectP0B1AssessmentHold");
    expect(enforcement).toContain("buildP0B1FraudDecisionHold()");
    expect(snapshot).toContain("buildP0B1FraudDecisionHold()");
    expect(latestSnapshot).toContain("buildP0B1FraudDecisionHold()");
    expect(replay).toContain("buildP0B1FraudDecisionHold()");
    expect(finalise).toContain("buildP0B1FraudDecisionHold()");
    expect(auditReads).toContain("buildP0B1FraudDecisionHold()");
    expect(shared).toContain("buildP0B1FraudDecisionHold()");
  });

  it("renders the canonical snapshot publication holds instead of assuming a historic array", () => {
    expect(claimDecisionReportSource).toContain(
      "const snapshotHistoryDecisionResponse = discriminateP0B1FraudDecisionResponse("
    );
    expect(claimDecisionReportSource).toContain(
      "const snapshotHistoryHold = snapshotHistoryDecisionResponse.hold"
    );
    expect(claimDecisionReportSource).toContain(
      "const snapshotHistory = Array.isArray(snapshotHistoryValue)"
    );
    expect(claimDecisionReportSource).toContain(
      "<P0FraudValidationHold hold={snapshotHistoryHold} />"
    );
    expect(claimDecisionReportSource).not.toContain(
      "normalizeP0FraudValidationHold(snapshotHistoryResponse)"
    );
    expect(claimDecisionReportSource).toContain(
      "Collision Physics Withheld — Manual Review Required"
    );
  });
});
