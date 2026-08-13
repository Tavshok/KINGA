import { describe, expect, it } from "vitest";
import { evidenceFromPdfDirectPage } from "./imageEvidenceEligibility";
import { readDamageFromPhotos } from "./stage-6-damage-analysis";

describe("Stage 6 R2 degraded vision path", () => {
  it("records a failed PDF-direct item, preserves its evidence envelope, and does not emit physics components", async () => {
    const url = "https://fixture.invalid/unavailable-page.png";
    const evidence = evidenceFromPdfDirectPage({
      url,
      pageNumber: 9,
      pageType: "vehicle_damage",
      fallback: true,
      source: "pdf_direct_vision",
    });
    const assumptions: any[] = [];
    const recoveryActions: any[] = [];
    const output = await readDamageFromPhotos(
      [url],
      {
        vehicle: { make: "Fixture", model: "Vehicle", year: 2024 },
        accidentDetails: { collisionDirection: "front" },
      } as any,
      { log: () => undefined } as any,
      assumptions,
      recoveryActions,
      undefined,
      undefined,
      new Map([[url, evidence]]),
      async () => {
        throw new Error("controlled vision failure");
      },
    );

    expect(output.components).toEqual([]);
    expect(output.photosProcessed).toBe(1);
    expect(output.photosFailed).toBe(1);
    expect(output.perPhotoResults[0]).toMatchObject({
      url,
      status: "PROCESSED",
      succeeded: false,
      evidence: {
        pageNumber: 9,
        classifier: "pdf_direct_vision",
        suitableForCrushDepth: false,
      },
    });
    expect(assumptions).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "crushDepthImageEligibility" }),
    ]));
    expect(recoveryActions).toEqual(expect.arrayContaining([
      expect.objectContaining({ target: "vision_success_threshold", strategy: "partial_data" }),
    ]));
  });
});
