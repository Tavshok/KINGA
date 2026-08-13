import { describe, expect, it } from "vitest";
import {
  buildEvidenceGapFinding,
  buildHumanVerificationRequest,
  buildUncertaintyEnvelope,
} from "./evidenceGapIntelligence";
import type { EvidenceGap } from "./types";

const ambiguousAmountGap: EvidenceGap = {
  tenantId: "tenant-a",
  claimId: 12909902,
  quoteId: 10620003,
  sourceDocumentId: 4650001,
  sourcePage: 13,
  sourceLocation: "repairs-table:row-17",
  sourceCropRef: "document:4650001/page:13/crop:repairs-row-17",
  sourceText: "Front ___  1 x $8?0",
  observableCharacters: "Front; quantity 1; amount starts with 8 and ends with 0",
  ambiguityDescription: "The handwritten unit price has overlapping final digits.",
  componentConfidence: 0.94,
  quantityConfidence: 0.99,
  unitPriceConfidence: 0.41,
  extendedAmountConfidence: 0.41,
  transcriptionMethod: "human_verified",
  candidates: [
    { field: "extended_amount", displayValue: "$180", amountCents: 18000, confidence: 0.3, method: "vision", rationale: "OCR and visual review both support the first digit as 1." },
    { field: "extended_amount", displayValue: "$780", amountCents: 78000, confidence: 0.41, method: "vision", rationale: "The leading handwritten character can be read as 7." },
    { field: "extended_amount", displayValue: "$880", amountCents: 88000, confidence: 0.29, method: "vision", rationale: "The leading handwritten character can also be read as 8." },
  ],
  arithmeticResidualCents: 55000,
  currency: "USD",
  impact: {
    affectsVerifiedArithmetic: true,
    affectsFinalAllInTotal: true,
    affectsSavings: true,
    affectsSettlement: true,
    explanation: "The row is excluded from verified arithmetic; final financial outputs remain qualified only to its impact.",
  },
  requiredReviewFields: ["unit_price", "extended_amount"],
};

describe("Evidence Gap Intelligence", () => {
  it("preserves an ambiguous row as an evidence gap without converting its residual into a source value", () => {
    const finding = buildEvidenceGapFinding(ambiguousAmountGap);
    expect(finding).toMatchObject({ code: "ambiguous_source_row", status: "evidence_gap", severity: "blocking" });
    expect(finding.summary).toContain("unit_price, extended_amount");
    expect(finding.summary).not.toContain("550.00");
  });

  it("builds a non-payable envelope only from directly supported candidate amounts", () => {
    const envelope = buildUncertaintyEnvelope(425000, "USD", [ambiguousAmountGap]);
    expect(envelope).toMatchObject({
      minimumCandidateExposureCents: 18000,
      maximumCandidateExposureCents: 88000,
      minimumPossibleSubtotalCents: 443000,
      maximumPossibleSubtotalCents: 513000,
      isPayable: false,
    });
  });

  it("does not manufacture a range when no direct amount candidate exists", () => {
    const noAmountCandidates: EvidenceGap = {
      ...ambiguousAmountGap,
      candidates: [{ field: "component", displayValue: "Front ___", confidence: 0.4, method: "ocr", rationale: "Only partial label characters are observable." }],
    };
    expect(buildUncertaintyEnvelope(425000, "USD", [noAmountCandidates])).toBeNull();
  });

  it("requests only the fields that require human verification", () => {
    const request = buildHumanVerificationRequest(ambiguousAmountGap);
    expect(request.fields).toEqual(["unit_price", "extended_amount"]);
    expect(request.sourceLocation).toBe("repairs-table:row-17");
    expect(request.candidateReadings).toHaveLength(3);
  });
});
