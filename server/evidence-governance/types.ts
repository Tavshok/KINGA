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
