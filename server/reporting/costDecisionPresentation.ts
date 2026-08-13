import {
  buildCostDecisionPresentationContract,
  type CostDecisionPresentation,
} from "../../shared/costDecisionPresentation";
import type { ReportCostIntegrity } from "./costIntegrity";

export type { CostDecisionPresentation } from "../../shared/costDecisionPresentation";

export type RepairabilityVerdict = {
  label: "Repairable" | "Repairable with conditions" | "Further structural review required" | "Total loss indicated";
  detail: string;
};

export type RepairabilityEvidence = {
  totalLossIndicated: boolean;
  repairToValueRatio?: number | null;
  structuralReviewRequired?: boolean;
  structuralReviewDetail?: string | null;
};

/**
 * Reads only an explicit structural-review field recorded in repair intelligence.
 * It intentionally does not derive a structural-review outcome from pricing,
 * damage severity, component count, or any assumed repair threshold.
 */
export function extractExplicitStructuralReviewEvidence(rawRepairIntelligence: unknown): Pick<RepairabilityEvidence, "structuralReviewRequired" | "structuralReviewDetail"> {
  let source: any = rawRepairIntelligence;
  if (typeof source === "string") {
    try { source = JSON.parse(source); } catch { source = null; }
  }
  const review = source?.structuralReview;
  const structuralReviewRequired = source?.structuralReviewRequired === true
    || source?.requiresStructuralReview === true
    || review?.required === true;
  const structuralReviewDetail = [
    source?.structuralReviewDetail,
    source?.structuralReviewRationale,
    source?.structuralReviewNote,
    review?.detail,
    review?.rationale,
  ].find((value) => typeof value === "string" && value.trim()) ?? null;
  return { structuralReviewRequired, structuralReviewDetail };
}

/**
 * Repairability is separate from quotation verification and cost. It uses only
 * persisted repair-versus-replace evidence and never invents a ratio threshold.
 */
export function resolveRepairabilityVerdict(evidence: RepairabilityEvidence): RepairabilityVerdict {
  if (evidence.totalLossIndicated) {
    return { label: "Total loss indicated", detail: "Repair-versus-replace assessment indicates total loss." };
  }
  if (evidence.structuralReviewRequired) {
    return { label: "Further structural review required", detail: evidence.structuralReviewDetail ?? "Structural condition requires further review before final repairability confirmation." };
  }
  if (evidence.repairToValueRatio === null || evidence.repairToValueRatio === undefined || !Number.isFinite(evidence.repairToValueRatio)) {
    return { label: "Repairable with conditions", detail: "Repairability is subject to confirmation of the repair-to-value assessment." };
  }
  return { label: "Repairable", detail: "Repair-versus-replace assessment supports repair." };
}

/**
 * The concise insurer-facing contract. It reports submitted evidence first,
 * then verification, then L2 under its approved KINGA Optimised Quote name.
 * It does not expose benchmark values as a replacement cost or narrate L2 math.
 */
export function buildCostDecisionPresentation(cost: ReportCostIntegrity): CostDecisionPresentation {
  return buildCostDecisionPresentationContract({
    quoteReceiptStatus: cost.quoteReceiptStatus,
    activeQuoteCount: cost.activeQuotes.length,
    allInReconciliationRequired: cost.allInReconciliationRequired,
    unreconciledQuoteCount: cost.unreconciledQuoteCount,
    l2IsComplete: cost.l2IsComplete,
    l2OptimisedCostUsd: cost.l2OptimisedCostUsd,
    l2EvidenceQualifiedComparisonUsd: cost.l2EvidenceQualifiedComparisonUsd,
    missingRequiredComponents: cost.missingRequiredComponents,
    duplicateQuotesExcluded: cost.duplicateQuotesExcluded,
    reconciliationRepairers: cost.quoteReconciliations
      .filter((quote) => quote.status === "reconciliation_required")
      .map((quote) => quote.repairer),
  });
}

export function renderCostDecisionSummaryHtml(input: {
  costIntegrity: ReportCostIntegrity;
  formatAmount: (amount: number | null) => string;
  escapeHtml: (value: unknown) => string;
  repairability: RepairabilityEvidence;
}): string {
  const presentation = buildCostDecisionPresentation(input.costIntegrity);
  const repairability = resolveRepairabilityVerdict(input.repairability);
  const verificationGood = presentation.quoteVerification === "PASSED";
  const verificationColour = verificationGood ? "#14664f" : presentation.quoteVerification === "QUOTATION REQUIRED" ? "#526560" : "#8a5a00";
  const issueColour = verificationGood ? "#14664f" : "#8a5a00";
  const submittedQuotes = input.costIntegrity.activeQuotes.length > 0
    ? input.costIntegrity.activeQuotes.map((quote) => `<span style="display:inline-block;margin:4px 5px 0 0;padding:4px 6px;border:1px solid #d8e2df;font-size:8px;color:#35514a;">${input.escapeHtml(quote.repairer)} <b style="color:#15352f;">${quote.amountUsd === null ? "Amount unavailable" : input.formatAmount(quote.amountUsd)}</b></span>`).join("")
    : `<span style="font-size:10px;color:#62726e;">No submitted quotations</span>`;
  const optimisedAmount = presentation.optimisedQuoteAmount === null
    ? "Not published"
    : input.formatAmount(presentation.optimisedQuoteAmount);
  return `
<div style="margin:10px 0 12px;border:1px solid #d8e2df;background:#fff;font-family:'Helvetica Neue',Arial,sans-serif;">
  <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;border-bottom:1px solid #d8e2df;">
    <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#15352f;">Cost Decision Summary</div>
    <div style="font-size:8px;font-weight:700;color:${verificationColour};">KINGA Quote Verification · ${presentation.quoteVerification}</div>
  </div>
  <div style="display:grid;grid-template-columns:1.08fr 1fr .96fr .88fr .92fr;">
    <div style="padding:10px;border-right:1px solid #d8e2df;"><div style="font-size:7.5px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#62726e;">Submitted Quotations</div><div style="margin-top:4px;">${submittedQuotes}</div></div>
    <div style="padding:10px;border-right:1px solid #d8e2df;"><div style="font-size:7.5px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#62726e;">KINGA Quote Verification</div><div style="margin-top:5px;font-size:13px;font-weight:700;color:${verificationColour};">${presentation.quoteVerification}</div><div style="margin-top:3px;font-size:8px;color:#62726e;line-height:1.35;">${input.escapeHtml(presentation.quoteVerificationDetail)}</div></div>
    <div style="padding:10px;border-right:1px solid #d8e2df;"><div style="font-size:7.5px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#62726e;">${presentation.optimisedQuoteLabel}</div><div style="margin-top:5px;font-size:16px;font-weight:800;color:#0d5849;">${optimisedAmount}</div><div style="margin-top:3px;font-size:8px;color:#62726e;line-height:1.35;">${input.escapeHtml(presentation.optimisedQuoteDetail)}</div></div>
    <div style="padding:10px;"><div style="font-size:7.5px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#62726e;">Quote Issues</div><div style="margin-top:5px;font-size:11px;font-weight:700;color:${issueColour};">${verificationGood ? "None" : "Review required"}</div><div style="margin-top:3px;font-size:8px;color:#62726e;line-height:1.35;">${input.escapeHtml(presentation.quoteIssue)}</div></div>
    <div style="padding:10px;border-left:1px solid #d8e2df;"><div style="font-size:7.5px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#62726e;">Repairability</div><div style="margin-top:5px;font-size:11px;font-weight:700;color:#15352f;">${input.escapeHtml(repairability.label)}</div><div style="margin-top:3px;font-size:8px;color:#62726e;line-height:1.35;">${input.escapeHtml(repairability.detail)}</div></div>
  </div>
</div>`;
}
