import { describe, expect, it } from "vitest";
import { canTransitionTo } from "./rbac";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = (path: string) => readFileSync(resolve(__dirname, path), "utf8");

describe("controlled KINGA assessment re-runs", () => {
  it("permits canonical re-entry from every supported post-assessment state", () => {
    expect(canTransitionTo("under_assessment", "under_assessment")).toBe(true);
    expect(canTransitionTo("internal_review", "under_assessment")).toBe(true);
    expect(canTransitionTo("technical_approval", "under_assessment")).toBe(true);
    expect(canTransitionTo("financial_decision", "under_assessment")).toBe(true);
    expect(canTransitionTo("ai_assessment_completed", "under_assessment")).toBe(true);
  });

  it("does not allow payment-authorized or closed claims to bypass governance through a re-run", () => {
    expect(canTransitionTo("payment_authorized", "under_assessment")).toBe(false);
    expect(canTransitionTo("closed", "under_assessment")).toBe(false);
  });

  it("keeps claims-core re-run branches aligned with the canonical controlled paths", () => {
    const claimsCore = source("routers/claims-core.ts");
    expect(claimsCore).toContain('currentStatus as string) === "financial_decision"');
    expect(claimsCore).toContain('updateClaimStatus(input.claimId, "assessment_in_progress"');
  });

  it("makes claims-processor re-run permissions explicit rather than relying on missing permission entries", () => {
    const workflowEngine = source("workflow-engine.ts");
    expect(workflowEngine).toContain('"technical_approval → under_assessment": ["claims_processor"]');
    expect(workflowEngine).toContain('"financial_decision → under_assessment": ["claims_processor"]');
    expect(workflowEngine).toContain('"ai_assessment_completed → under_assessment": ["claims_processor"]');
  });
});
