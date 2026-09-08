import { describe, expect, it, vi } from "vitest";
import type { ClaimRecord, PipelineContext } from "./types";

const mocks = vi.hoisted(() => ({
  readDamageFromPdf: vi.fn(async () => ({
    components: [{
      name: "Front bumper",
      location: "front",
      damageType: "impact",
      severity: "moderate" as const,
      visible: true,
      distanceFromImpact: 0,
    }],
    perPhotoResults: [],
    photosProcessed: 1,
    photosDeferred: 0,
    photosFailed: 0,
    enrichedPhotosJson: "[]",
  })),
  readDamageFromPhotos: vi.fn(),
}));

vi.mock("./stage-6-damage-analysis.vision", () => ({
  readDamageFromPdf: mocks.readDamageFromPdf,
  readDamageFromPhotos: mocks.readDamageFromPhotos,
}));

const { runDamageAnalysisStage } = await import("./stage-6-damage-analysis.stage");

describe("Stage 6 PDF-direct bridge", () => {
  it("uses the exported PDF-direct reader when no photo render is available instead of raising a ReferenceError", async () => {
    const ctx = {
      damagePhotoUrls: [],
      pdfPageImageUrls: [],
      pdfUrl: "https://example.test/owned-fixture.pdf",
      enrichedPhotosJson: null,
      log: vi.fn(),
    } as unknown as PipelineContext;
    const claimRecord = {
      damage: { components: [] },
      vehicle: { make: "Toyota", model: "Corolla", year: 2020, colour: "White" },
      accidentDetails: {
        collisionDirection: "unknown",
        structuralDamage: false,
        totalDamageAreaM2: 0,
      },
    } as unknown as ClaimRecord;

    const result = await runDamageAnalysisStage(ctx, claimRecord);

    expect(mocks.readDamageFromPdf).toHaveBeenCalledWith(
      ctx.pdfUrl,
      claimRecord,
      ctx,
      expect.any(Array),
      expect.any(Array),
    );
    expect(result).toMatchObject({ status: "success", degraded: false });
    expect(result.data).toMatchObject({
      photosProcessed: 1,
      overallSeverityScore: 52,
      damagedParts: [expect.objectContaining({ name: "Front bumper", severity: "moderate" })],
    });
  });
});
