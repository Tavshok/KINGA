import { describe, expect, it } from "vitest";
import { photoZonePanel } from "./templates/kingaDesignSystem";
import { normaliseCanonicalPhotoEvidence } from "./photoEvidencePresentation";

describe("R0 canonical photo evidence presentation", () => {
  it("deduplicates source assets and preserves recorded zone, components, severity, and provenance", () => {
    const result = normaliseCanonicalPhotoEvidence([
      { url: "https://evidence.example/front.jpg", impactZone: "front-left", severity: "severe", confidenceScore: 0.91, detectedComponents: ["bumper", "headlamp"], classifier: "vision-v2", sourcePage: 2 },
      { url: "https://evidence.example/front.jpg", impactZone: "rear", severity: "minor", confidenceScore: 0.85 },
    ]);
    expect(result).toMatchObject({ totalPhotos: 1, usablePhotos: 1, unclassifiedZoneCount: 0, directionConflictCount: 0 });
    expect(result.photos[0]).toMatchObject({ zone: "front-left", severity: "severe", detectedComponents: ["bumper", "headlamp"], sourcePage: 2, classifier: "vision-v2" });
  });

  it("records an uncertainty instead of assigning a zone where evidence is missing or conflicting", () => {
    const result = normaliseCanonicalPhotoEvidence([
      { url: "https://evidence.example/unknown.jpg", confidenceScore: 0.8 },
      { url: "https://evidence.example/conflict.jpg", impactZone: "rear", directionContradiction: true, confidenceScore: 0.8 },
    ]);
    expect(result).toMatchObject({ totalPhotos: 2, unclassifiedZoneCount: 1, directionConflictCount: 1 });
    expect(result.photos.map((photo) => photo.uncertainty)).toEqual(["zone_unclassified", "direction_conflict"]);
  });

  it("retains a source-recorded conflicted zone only as a qualified label and never substitutes a new direction", () => {
    const result = normaliseCanonicalPhotoEvidence([
      { url: "https://evidence.example/reported-front.jpg", impactZone: "front", directionContradiction: true, confidenceScore: 0.88 },
    ]);
    expect(result.photos[0]).toMatchObject({
      zone: "front",
      uncertainty: "direction_conflict",
      directionContradiction: true,
    });
    const html = photoZonePanel(result.photos);
    expect(html).toContain("Recorded zone: front");
    expect(html).toContain("Zone label requires verification");
    expect(html).not.toContain("Recorded zone: rear");
  });
});
