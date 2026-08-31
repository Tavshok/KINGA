import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { normaliseCanonicalPhotoEvidence } from "./photoEvidencePresentation";
import { photoZonePanel } from "./templates/kingaDesignSystem";

const projectRoot = resolve(import.meta.dirname, "../..");
const read = (relativePath: string) => readFileSync(resolve(projectRoot, relativePath), "utf8");

describe("P0 raw image-to-label report evidence audit", () => {
  it("preserves source image, zone, classifier and provenance while qualifying a contradictory direction label", () => {
    const photos = normaliseCanonicalPhotoEvidence([{
      url: "https://evidence.example/source-side-view.jpg",
      impactZone: "front",
      directionContradiction: true,
      classifier: "vision-v2",
      sourcePage: 4,
      confidenceScore: 0.91,
    }]);
    expect(photos).toMatchObject({ totalPhotos: 1, directionConflictCount: 1 });
    expect(photos.photos[0]).toMatchObject({
      url: "https://evidence.example/source-side-view.jpg",
      sourceKey: "https://evidence.example/source-side-view.jpg",
      zone: "front",
      classifier: "vision-v2",
      sourcePage: 4,
      uncertainty: "direction_conflict",
    });
    const html = photoZonePanel(photos.photos);
    expect(html).toContain("Recorded zone: front");
    expect(html).toContain("Zone label requires verification");
    expect(html).toContain("Source p.4");
    expect(html).not.toContain("Recorded zone: side");
  });

  it("keeps the same shared qualified evidence path in CL, CI, and FR without independently relabelling the image", () => {
    for (const file of ["server/reporting/reportDefinitions.ts", "server/reporting/claimsIntelligenceReport.ts"]) {
      const source = read(file);
      expect(source).toContain("normaliseCanonicalPhotoEvidence");
      expect(source).toContain("directionContradiction");
      expect(source).toContain("photoZonePanel");
      expect(source).not.toContain("replaceImpactZone");
    }
    const forensicRenderer = read("server/reporting/forensicDecisionReport.ts");
    const forensicModel = read("server/reporting/forensicReportModel.ts");
    expect(forensicRenderer).toContain("resolveForensicReportModel");
    expect(forensicRenderer).toContain("photoZonePanel");
    expect(forensicRenderer).not.toContain("replaceImpactZone");
    expect(forensicModel).toContain("normaliseCanonicalPhotoEvidence");
  });
});
