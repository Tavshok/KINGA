import type { ReportCostIntegrity } from "./costIntegrity";

export type ReportDecisionStatus = "APPROVED" | "REJECTED" | "REVIEW_REQUIRED";

export interface ReportDecisionIntegrity {
  status: ReportDecisionStatus;
  chipClass: "approve" | "reject" | "review";
  icon: "✓" | "✗" | "⚠";
  rawRecommendation: string;
  holdReason: string | null;
}

/**
 * A report may never publish an approval, settlement-ready, or cost-safe state
 * when the canonical L2 contract is incomplete. This deliberately sits between
 * raw assessment persistence and every presentation tier.
 */
export function resolveReportDecisionIntegrity(input: {
  recommendation: unknown;
  workflowState?: unknown;
  costIntegrity: ReportCostIntegrity;
}): ReportDecisionIntegrity {
  const rawRecommendation = String(input.recommendation ?? "review").toLowerCase();
  const workflowState = String(input.workflowState ?? "").toLowerCase();
  const l2Hold = !input.costIntegrity.l2IsComplete;
  const workflowHold = ["manual_review", "internal_review", "technical_approval", "disputed"].includes(workflowState);

  if (l2Hold || workflowHold) {
    const holdReason = l2Hold
      ? input.costIntegrity.quoteReceiptStatus === "no_quotes"
        ? "No submitted repair quotation is available; cost recommendation withheld."
        : "Submitted quotations do not provide complete itemised repair scope; L2, savings, settlement, and approval are withheld."
      : `Workflow state ${workflowState.replaceAll("_", " ")} requires human review.`;
    return { status: "REVIEW_REQUIRED", chipClass: "review", icon: "⚠", rawRecommendation, holdReason };
  }

  if (rawRecommendation.includes("reject")) {
    return { status: "REJECTED", chipClass: "reject", icon: "✗", rawRecommendation, holdReason: null };
  }
  if (rawRecommendation.includes("approve") || rawRecommendation.includes("accept")) {
    return { status: "APPROVED", chipClass: "approve", icon: "✓", rawRecommendation, holdReason: null };
  }
  return { status: "REVIEW_REQUIRED", chipClass: "review", icon: "⚠", rawRecommendation, holdReason: "Human review remains required." };
}
