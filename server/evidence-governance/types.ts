export const EVIDENCE_STATUSES = [
  "verified",
  "reconstructed",
  "documented_revision",
  "scope_difference",
  "extraction_defect",
  "evidence_gap",
  "pricing_variance_review_signal",
  "unresolved",
] as const;

export type EvidenceStatus = (typeof EVIDENCE_STATUSES)[number];

export type TaxBasis =
  | "included"
  | "excluded"
  | "separately_stated"
  | "not_stated"
  | "not_applicable";

export type RevisionStatus = "original" | "revised" | "superseded" | "unknown";

export type MonetaryEvidence = {
  id?: number;
  quoteId?: number | null;
  quoteLineItemId?: number | null;
  sourceDocumentId?: number | null;
  sourcePage?: number | null;
  sourceLocation?: string | null;
  description: string;
  canonicalComponent?: string | null;
  financialRole: "quote_total" | "subtotal" | "vat" | "parts" | "labour" | "paint" | "sundries" | "component" | "discount" | "fee" | "other";
  amountCents: number;
  currency: string;
  taxBasis: TaxBasis;
  scopeFingerprint?: string | null;
  revisionStatus: RevisionStatus;
  evidenceStatus: EvidenceStatus;
  extractionMethod: "document_direct" | "ocr" | "vision" | "human_verified" | "system_reconstruction";
  extractionConfidence?: number | null;
};

export type EvidenceFinding = {
  code: string;
  status: EvidenceStatus;
  severity: "info" | "review" | "blocking";
  title: string;
  summary: string;
  sourceDocumentId?: number | null;
  sourcePage?: number | null;
  sourceLocation?: string | null;
  subjectKey?: string | null;
};

export type EvidenceGapCandidate = {
  field: "component" | "quantity" | "unit_price" | "extended_amount";
  displayValue: string;
  amountCents?: number | null;
  confidence: number;
  method: "document_direct" | "ocr" | "vision" | "human_verified";
  rationale: string;
};

export type EvidenceGap = {
  tenantId: string;
  claimId: number;
  quoteId?: number | null;
  quoteLineItemId?: number | null;
  sourceDocumentId: number;
  sourcePage?: number | null;
  sourceLocation?: string | null;
  sourceCropRef?: string | null;
  sourceText?: string | null;
  observableCharacters?: string | null;
  ambiguityDescription: string;
  componentConfidence?: number | null;
  quantityConfidence?: number | null;
  unitPriceConfidence?: number | null;
  extendedAmountConfidence?: number | null;
  transcriptionMethod: "document_direct" | "ocr" | "vision" | "human_verified";
  candidates: EvidenceGapCandidate[];
  arithmeticResidualCents?: number | null;
  currency?: string | null;
  impact: {
    affectsVerifiedArithmetic: boolean;
    affectsFinalAllInTotal: boolean;
    affectsSavings: boolean;
    affectsSettlement: boolean;
    explanation: string;
  };
  resolutionStatus?: "open" | "human_verification_requested" | "human_verified" | "superseded" | "not_resolvable_from_source";
  requiredReviewFields: Array<"component" | "quantity" | "unit_price" | "extended_amount">;
};

export type UncertaintyEnvelope = {
  currency: string;
  verifiedSubtotalCents: number;
  minimumCandidateExposureCents: number;
  maximumCandidateExposureCents: number;
  minimumPossibleSubtotalCents: number;
  maximumPossibleSubtotalCents: number;
  includedGapCount: number;
  isPayable: false;
};

export type HumanVerificationRequest = {
  sourceDocumentId: number;
  sourcePage: number | null;
  sourceLocation: string | null;
  fields: EvidenceGap["requiredReviewFields"];
  reason: string;
  consequence: string;
  candidateReadings: EvidenceGapCandidate[];
};
