import { describe, expect, it } from "vitest";
import { assessPipelineEvidenceGate } from "./pipelineEvidenceGate";

describe("pipeline evidence gate", () => {
  it("marks a fully source-verified quote eligible for a final L2 total", () => {
    const result = assessPipelineEvidenceGate([{
      panel_beater: "Verified Repairer",
      source_document_index: 2,
      source_page_numbers: [7, 8],
      source_extraction_method: "vision",
      extraction_warnings: [],
    }]);
    expect(result.eligibleForL2).toBe(true);
    expect(result.eligibleForFinalL2).toBe(true);
    expect(result.progressiveComparisonAvailable).toBe(true);
    expect(result.evidenceCoverage).toEqual({ submittedQuotes: 1, sourceVerifiedQuotes: 1, qualifiedQuotes: 1, percentage: 100 });
    expect(result.findings).toEqual([]);
  });

  it("keeps L2 intelligence available while source provenance prevents a final total", () => {
    const result = assessPipelineEvidenceGate([{
      panel_beater: "Legacy Repairer",
      extraction_warnings: [],
    }]);
    expect(result.eligibleForL2).toBe(false);
    expect(result.eligibleForFinalL2).toBe(false);
    expect(result.progressiveComparisonAvailable).toBe(true);
    expect(result.evidenceCoverage).toEqual({ submittedQuotes: 1, sourceVerifiedQuotes: 0, qualifiedQuotes: 0, percentage: 0 });
    expect(result.findings[0]).toMatchObject({ code: "source_provenance_pending", severity: "review" });
  });

  it("qualifies a historical proportional fallback while retaining the submitted quote as evidence", () => {
    const result = assessPipelineEvidenceGate([{
      panel_beater: "Quote With Unparsed Rows",
      source_document_index: 1,
      source_page_numbers: [3],
      extraction_warnings: ["proportional_fallback_used"],
    }]);
    expect(result.eligibleForL2).toBe(false);
    expect(result.progressiveComparisonAvailable).toBe(true);
    expect(result.evidenceCoverage).toEqual({ submittedQuotes: 1, sourceVerifiedQuotes: 1, qualifiedQuotes: 0, percentage: 0 });
    expect(result.findings[0]).toMatchObject({ code: "line_pricing_not_source_verified", status: "extraction_defect" });
  });
});
