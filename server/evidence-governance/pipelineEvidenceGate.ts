import type { EvidenceFinding } from "./types";

type ExtractedQuoteEvidence = {
  panel_beater?: string | null;
  source_document_index?: number | null;
  source_page_numbers?: number[];
  source_extraction_method?: string;
  extraction_warnings?: string[];
};

export type PipelineEvidenceGate = {
  /** Backwards-compatible alias for final, fully verified L2 eligibility. */
  eligibleForL2: boolean;
  eligibleForFinalL2: boolean;
  progressiveComparisonAvailable: boolean;
  evidenceCoverage: {
    submittedQuotes: number;
    sourceVerifiedQuotes: number;
    qualifiedQuotes: number;
    percentage: number;
  };
  findings: EvidenceFinding[];
};

/**
 * L2 is a comparison of submitted evidence, not a reconstruction engine. A
 * complete line-item matrix is therefore insufficient unless every candidate
 * quote is locatable in its document evidence and contains no inferred-price
 * fallback warning.
 */
export function assessPipelineEvidenceGate(quotes: ExtractedQuoteEvidence[]): PipelineEvidenceGate {
  const findings: EvidenceFinding[] = [];
  let sourceVerifiedQuotes = 0;
  let qualifiedQuotes = 0;
  quotes.forEach((quote, index) => {
    const quoteLabel = quote.panel_beater?.trim() || `Quote ${index + 1}`;
    const pageNumbers = quote.source_page_numbers?.filter((page) => Number.isInteger(page) && page > 0) ?? [];
    const warnings = quote.extraction_warnings ?? [];
    const hasSourceProvenance = quote.source_document_index !== null && quote.source_document_index !== undefined && pageNumbers.length > 0;
    const hasNonInferredRows = !warnings.includes("line_pricing_not_extracted") && !warnings.includes("proportional_fallback_used");
    if (hasSourceProvenance) sourceVerifiedQuotes += 1;
    if (hasSourceProvenance && hasNonInferredRows) qualifiedQuotes += 1;

    if (!hasSourceProvenance) {
      findings.push({
        code: "source_provenance_pending",
        status: "unresolved",
        severity: "review",
        title: `${quoteLabel} requires document and page provenance`,
        summary: "KINGA retains the submitted quote in evidence-qualified comparison intelligence, but it cannot be used in a final verified-equivalent L2 total until its source document and source page are recorded.",
        subjectKey: `quote-index:${index}`,
      });
    }

    if (warnings.includes("line_pricing_not_extracted") || warnings.includes("proportional_fallback_used")) {
      findings.push({
        code: "line_pricing_not_source_verified",
        status: "extraction_defect",
        severity: "review",
        title: `${quoteLabel} contains non-verifiable line pricing`,
        summary: "KINGA will not convert an unparsed quote total into component prices. The quote remains visible as submitted evidence; obtain a source-verified itemisation before using it in a final verified-equivalent L2 total.",
        subjectKey: `quote-index:${index}`,
      });
    }
  });

  const eligibleForFinalL2 = findings.length === 0;
  const submittedQuotes = quotes.length;
  return {
    eligibleForL2: eligibleForFinalL2,
    eligibleForFinalL2,
    progressiveComparisonAvailable: submittedQuotes > 0,
    evidenceCoverage: {
      submittedQuotes,
      sourceVerifiedQuotes,
      qualifiedQuotes,
      percentage: submittedQuotes === 0 ? 0 : Math.round((qualifiedQuotes / submittedQuotes) * 100),
    },
    findings,
  };
}
