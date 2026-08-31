import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildCostDecisionPresentation, extractExplicitStructuralReviewEvidence, resolveRepairabilityVerdict } from "./costDecisionPresentation";
import type { ReportCostIntegrity } from "./costIntegrity";
import { normaliseCanonicalPhotoEvidence } from "./photoEvidencePresentation";

const root = resolve(import.meta.dirname, "../..");
const read = (relativePath: string) => readFileSync(resolve(root, relativePath), "utf8");

function cost(overrides: Partial<ReportCostIntegrity> = {}): ReportCostIntegrity {
  return {
    activeQuotes: [
      { repairer: "Repairer North", amountUsd: 4280, currency: "USD", status: "active", sourceReference: "quote-n", statusReason: "Active" },
      { repairer: "Repairer Central", amountUsd: 3890, currency: "USD", status: "active", sourceReference: "quote-c", statusReason: "Active" },
      { repairer: "Repairer South", amountUsd: 4010, currency: "USD", status: "active", sourceReference: "quote-s", statusReason: "Active" },
    ],
    sourceQuoteCount: 3,
    quoteReceiptStatus: "quotes_received",
    quoteScopeStatus: "complete",
    l2Status: "complete",
    duplicateQuotesExcluded: 0,
    supersededQuotesExcluded: 0,
    l1SubmittedCostUsd: 3890,
    l2OptimisedCostUsd: 3615,
    l2EvidenceQualifiedComparisonUsd: null,
    l2EvidenceCoveragePercent: 100,
    l3BenchmarkReferenceCostUsd: 3770,
    partialPricedScopeUsd: null,
    l2IsComplete: true,
    missingRequiredComponents: [],
    costBasis: "submitted_price_composite",
    assessorCalibrationCostUsd: null,
    allInReconciliationRequired: false,
    unreconciledQuoteCount: 0,
    quoteReconciliations: [
      { repairer: "Repairer North", quoteId: "quote-n", submittedHeaderTotalUsd: 4280, submittedItemisedTotalUsd: 4280, unexplainedResidualUsd: null, residualCategory: null, status: "reconciled" },
      { repairer: "Repairer Central", quoteId: "quote-c", submittedHeaderTotalUsd: 3890, submittedItemisedTotalUsd: 3890, unexplainedResidualUsd: null, residualCategory: null, status: "reconciled" },
      { repairer: "Repairer South", quoteId: "quote-s", submittedHeaderTotalUsd: 4010, submittedItemisedTotalUsd: 4010, unexplainedResidualUsd: null, residualCategory: null, status: "reconciled" },
    ],
    ...overrides,
  };
}

const canonicalPhotos = [
  { url: "https://evidence.example/front-left.jpg", impactZone: "front-left", severity: "severe", confidenceScore: 0.94, detectedComponents: ["bumper", "headlamp"], sourcePage: 2 },
  { url: "https://evidence.example/rear.jpg", impactZone: "rear", severity: "moderate", confidenceScore: 0.86, detectedComponents: ["bumper rear"], sourcePage: 3 },
  { url: "https://evidence.example/rear.jpg", impactZone: "rear", severity: "moderate", confidenceScore: 0.86, detectedComponents: ["bumper rear"], sourcePage: 3 },
];

describe("R0 immutable combined rendered-report acceptance", () => {
  it("presents one complete verified evidence state without independently recomputing cost or photo intelligence", () => {
    const decision = buildCostDecisionPresentation(cost());
    const repairability = resolveRepairabilityVerdict({ totalLossIndicated: false, repairToValueRatio: 42 });
    const photos = normaliseCanonicalPhotoEvidence(canonicalPhotos);

    expect(decision).toMatchObject({ quoteVerification: "PASSED", optimisedQuoteLabel: "KINGA Optimised Quote", optimisedQuoteAmount: 3615, quoteIssue: "No material quote issue identified." });
    expect(repairability.label).toBe("Repairable");
    expect(photos).toMatchObject({ totalPhotos: 2, usablePhotos: 2, unclassifiedZoneCount: 0, directionConflictCount: 0 });
    expect(photos.photos.map((photo) => photo.zone)).toEqual(["front-left", "rear"]);
  });

  it("retains submitted evidence and suppresses only unsupported all-in conclusions for a named scope gap", () => {
    const decision = buildCostDecisionPresentation(cost({
      quoteScopeStatus: "incomplete_scope",
      l2Status: "incomplete_scope",
      l2IsComplete: false,
      l2OptimisedCostUsd: null,
      l2EvidenceQualifiedComparisonUsd: 3290,
      partialPricedScopeUsd: 3290,
      missingRequiredComponents: ["Front bumper garnish"],
    }));
    expect(decision).toMatchObject({ quoteVerification: "SCOPE GAP", optimisedQuoteAmount: 3290, quoteIssue: "Missing submitted price: Front bumper garnish." });
    expect(decision.optimisedQuoteLabel).toBe("KINGA Optimised Quote");
    expect(decision.optimisedQuoteState).toBe("human_review_required");
    expect(decision.optimisedQuoteDetail).toContain("Review-required priced submitted component scope");
  });

  it("keeps a concrete quote reconciliation exception separate from repairability and cost invention", () => {
    const decision = buildCostDecisionPresentation(cost({
      quoteScopeStatus: "reconciliation_required",
      l2Status: "reconciliation_required",
      l2IsComplete: false,
      l2OptimisedCostUsd: null,
      l2EvidenceQualifiedComparisonUsd: 3340,
      allInReconciliationRequired: true,
      unreconciledQuoteCount: 1,
      quoteReconciliations: [{ repairer: "Repairer North", quoteId: "quote-n", submittedHeaderTotalUsd: 4280, submittedItemisedTotalUsd: 3980, unexplainedResidualUsd: 300, residualCategory: "source_to_ledger_reconciliation", status: "reconciliation_required" }],
    }));
    expect(decision.quoteIssue).toBe("Repairer North: submitted total requires line-item reconciliation.");
    expect(decision.quoteIssue).not.toMatch(/labour|VAT|fee|paint/i);
  });

  it("renders structural review only from explicit persisted evidence and retains photo uncertainty without relabelling", () => {
    const repairEvidence = extractExplicitStructuralReviewEvidence({ structuralReviewRequired: true, structuralReviewRationale: "Front rail alignment measurement is required." });
    expect(resolveRepairabilityVerdict({ totalLossIndicated: false, repairToValueRatio: 42, ...repairEvidence }))
      .toMatchObject({ label: "Further structural review required", detail: "Front rail alignment measurement is required." });
    const photos = normaliseCanonicalPhotoEvidence([{ url: "https://evidence.example/unclassified.jpg", confidenceScore: 0.83 }]);
    expect(photos.photos[0]).toMatchObject({ zone: undefined, uncertainty: "zone_unclassified" });
  });

  it("uses the same shared decision and canonical-photo contracts in CL, CI, and FR", () => {
    for (const file of ["server/reporting/reportDefinitions.ts", "server/reporting/claimsIntelligenceReport.ts"]) {
      const source = read(file);
      expect(source).toContain("renderCostDecisionSummaryHtml");
      expect(source).toContain("extractExplicitStructuralReviewEvidence");
      expect(source).toContain("normaliseCanonicalPhotoEvidence");
    }
    const forensicRenderer = read("server/reporting/forensicDecisionReport.ts");
    const forensicModel = read("server/reporting/forensicReportModel.ts");
    expect(forensicRenderer).toContain("resolveForensicReportModel");
    expect(forensicRenderer).toContain("renderCostDecisionSummaryHtml");
    expect(forensicRenderer).toContain("extractExplicitStructuralReviewEvidence");
    expect(forensicRenderer).toContain("photoZonePanel");
    expect(forensicModel).toContain("normaliseCanonicalPhotoEvidence");
  });
});
