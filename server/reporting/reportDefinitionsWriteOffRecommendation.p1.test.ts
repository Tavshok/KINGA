import { describe, expect, it } from "vitest";
import { parseKingaWriteOffRecommendation } from "./reportDefinitions";

describe("reportDefinitions persisted repairability recommendation", () => {
  it("preserves a complete canonical recommendation for report presentation", () => {
    const recommendation = {
      kind: "economic_write_off_recommended",
      label: "Economic write-off recommended",
      detail: "Complete evidence meets the recommendation threshold.",
      writeOffRecommended: true,
      writeOffWarning: false,
      repairToValueRatio: 0.72,
      economicEvidenceComplete: true,
      technicalEvidenceComplete: false,
    } as const;

    expect(parseKingaWriteOffRecommendation(recommendation)).toEqual(recommendation);
  });

  it("rejects incomplete or legacy-shaped persisted values rather than inventing a recommendation", () => {
    expect(parseKingaWriteOffRecommendation({ kind: "economic_write_off_recommended" })).toBeNull();
    expect(parseKingaWriteOffRecommendation({
      kind: "not_a_kinda_recommendation",
      label: "Invalid",
      detail: "Invalid",
      writeOffRecommended: false,
      writeOffWarning: false,
      repairToValueRatio: null,
      economicEvidenceComplete: false,
      technicalEvidenceComplete: false,
    })).toBeNull();
  });
});
