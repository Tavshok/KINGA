import { describe, expect, it, vi } from "vitest";
import { runDamageAnalysisStage } from "./stage-6-damage-analysis.stage";
import type { ClaimRecord, PipelineContext } from "./types";

describe("Stage 6 damage-analysis coordinator", () => {
  it("uses the shared severity helpers for structured claim damage without invoking vision", async () => {
    const ctx = {
      damagePhotoUrls: [],
      pdfPageImageUrls: [],
      enrichedPhotosJson: null,
      log: vi.fn(),
    } as unknown as PipelineContext;
    const claimRecord = {
      damage: {
        components: [{
          name: "Front bumper",
          location: "front",
          damageType: "impact",
          severity: "major",
        }],
      },
      accidentDetails: {
        collisionDirection: "unknown",
        structuralDamage: false,
        totalDamageAreaM2: 1.5,
      },
    } as unknown as ClaimRecord;

    const result = await runDamageAnalysisStage(ctx, claimRecord);

    expect(result).toMatchObject({ status: "success", degraded: false });
    expect(result.data.damagedParts).toEqual([
      expect.objectContaining({ name: "Front bumper", severity: "severe" }),
    ]);
    expect(result.data.damageZones).toEqual([
      { zone: "front", componentCount: 1, maxSeverity: "severe" },
    ]);
    expect(result.data.overallSeverityScore).toBe(77);
  });
});
