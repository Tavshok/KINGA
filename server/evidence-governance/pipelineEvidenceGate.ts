import type { EvidenceFinding } from "./types";

type ExtractedQuoteEvidence = {
  panel_beater?: string | null;
  source_document_index?: number | null;
  source_page_numbers?: number[];
  source_extraction_method?: string;
  extraction_warnings?: string[];
};

export type PipelineEvidenceGate = {
  eligibleForL2: boolean;
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
  quotes.forEach((quote, index) => {
    const quoteLabel = quote.panel_beater?.trim() || `Quote ${index + 1}`;
    const pageNumbers = quote.source_page_numbers?.filter((page) => Number.isInteger(page) && page > 0) ?? [];
    const warnings = quote.extraction_warnings ?? [];

    if (quote.source_document_index === null || quote.source_document_index === undefined || pageNumbers.length === 0) {
      findings.push({
        code: "source_provenance_pending",
        status: "unresolved",
        severity: "blocking",
        title: `${quoteLabel} requires document and page provenance`,
        summary: "The submitted quotation cannot enter a verified L2 comparison until its source document and source page are recorded.",
        subjectKey: `quote-index:${index}`,
      });
    }

    if (warnings.includes("line_pricing_not_extracted") || warnings.includes("proportional_fallback_used")) {
      findings.push({
        code: "line_pricing_not_source_verified",
        status: "extraction_defect",
        severity: "blocking",
        title: `${quoteLabel} contains non-verifiable line pricing`,
        summary: "KINGA will not convert an unparsed quote total into component prices. Obtain a source-verified itemisation before L2 comparison.",
        subjectKey: `quote-index:${index}`,
      });
    }
  });

  return { eligibleForL2: findings.length === 0, findings };
}
