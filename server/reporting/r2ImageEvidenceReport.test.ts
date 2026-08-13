import { describe, expect, it } from "vitest";
import { photoZonePanel } from "./templates/kingaDesignSystem";

describe("R2 PDF-direct evidence report disclosure", () => {
  it("keeps fallback imagery visible while disclosing that it cannot supply crush-depth physics", () => {
    const html = photoZonePanel([{
      url: "https://example.test/claim.pdf#page=7",
      zone: "front",
      caption: "PDF-direct damage analysis",
      sourcePage: 7,
      classifier: "pdf_direct_vision",
      classificationConfidence: 0.6,
      selectionReason: "PDF-direct fallback identified this page without a source-image eligibility envelope.",
      fallbackWarning: "PDF-direct fallback remains available for contextual damage analysis only.",
      suitableForCrushDepth: false,
      physicsExclusionReason: "PDF-direct fallback lacks page-level image eligibility evidence for crush-depth measurement.",
    }]);

    expect(html).toContain("claim.pdf#page=7");
    expect(html).toContain("Source p.7");
    expect(html).toContain("pdf_direct_vision");
    expect(html).toContain("contextual damage analysis only");
    expect(html).toContain("Physics: contextual only");
    expect(html).toContain("crush-depth measurement");
  });

  it("makes a no-photo or degraded path explicitly non-blocking and non-physics", () => {
    const html = photoZonePanel([]);

    expect(html).toContain("No photographs are available");
    expect(html).toContain("crush-depth physics are unavailable");
    expect(html).toContain("assessment and non-visual evidence processing continue");
  });
});
