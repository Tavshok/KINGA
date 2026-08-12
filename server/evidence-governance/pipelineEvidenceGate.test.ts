import { describe, expect, it } from "vitest";
import { assessPipelineEvidenceGate } from "./pipelineEvidenceGate";

describe("pipeline evidence gate", () => {
  it("allows an L2 comparison only when every source quote is document and page locatable", () => {
    const result = assessPipelineEvidenceGate([{
      panel_beater: "Verified Repairer",
      source_document_index: 2,
      source_page_numbers: [7, 8],
      source_extraction_method: "vision",
      extraction_warnings: [],
    }]);
    expect(result.eligibleForL2).toBe(true);
    expect(result.findings).toEqual([]);
  });

  it("withholds L2 when a quote has no document or page provenance", () => {
    const result = assessPipelineEvidenceGate([{
      panel_beater: "Legacy Repairer",
      extraction_warnings: [],
    }]);
    expect(result.eligibleForL2).toBe(false);
    expect(result.findings[0]).toMatchObject({ code: "source_provenance_pending", severity: "blocking" });
  });

  it("withholds L2 when a historical proportional fallback warning is present", () => {
    const result = assessPipelineEvidenceGate([{
      panel_beater: "Quote With Unparsed Rows",
      source_document_index: 1,
      source_page_numbers: [3],
      extraction_warnings: ["proportional_fallback_used"],
    }]);
    expect(result.eligibleForL2).toBe(false);
    expect(result.findings[0]).toMatchObject({ code: "line_pricing_not_source_verified", status: "extraction_defect" });
  });
});
