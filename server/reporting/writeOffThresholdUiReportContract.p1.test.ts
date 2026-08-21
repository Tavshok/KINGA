import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { resolveKingaWriteOffRecommendation } from "../../shared/writeOffRecommendation";
import { WRITE_OFF_UI_LABELS } from "../../shared/writeOffPolicy";
import { resolveRepairabilityVerdict } from "./costDecisionPresentation";

describe("write-off warning and recommendation UI/report contract", () => {
  const warning = resolveKingaWriteOffRecommendation({ completeL2CostUsd: 6700, verifiedMarketValueUsd: 10000, structuralDamageDetected: false, physicsExecuted: true, physicsSeverity: "moderate" });
  const recommendation = resolveKingaWriteOffRecommendation({ completeL2CostUsd: 7000, verifiedMarketValueUsd: 10000, structuralDamageDetected: false, physicsExecuted: true, physicsSeverity: "moderate" });

  it("renders a review-only report verdict at 65% and a separate recommendation verdict at 70%", () => {
    expect(resolveRepairabilityVerdict({ totalLossIndicated: false, kingaRecommendation: warning })).toMatchObject({ label: "Approaching write-off territory — review required", detail: expect.stringContaining("no write-off recommendation is made") });
    expect(resolveRepairabilityVerdict({ totalLossIndicated: false, kingaRecommendation: recommendation })).toMatchObject({ label: "Economic write-off recommended", detail: expect.stringContaining("Human assessor or insurer review remains required") });
  });

  it("keeps the shared marker labels distinct and non-empty", () => {
    // The exact wording lives in one place (shared/writeOffPolicy.ts) so the two UI
    // surfaces below cannot drift apart in spelling; this only pins the wording itself.
    expect(WRITE_OFF_UI_LABELS.warning).toBe("65% review warning");
    expect(WRITE_OFF_UI_LABELS.recommendation).toBe("70% recommendation");
  });

  it("keeps the live forensic UI and report chart on distinct named policy markers, sourced from the shared policy module", () => {
    const forensicPanel = fs.readFileSync(path.resolve(__dirname, "../../client/src/components/ForensicDecisionPanel.tsx"), "utf8");
    const reportComponents = fs.readFileSync(path.resolve(__dirname, "../../client/src/components/ReportComponents.tsx"), "utf8");
    for (const source of [forensicPanel, reportComponents]) {
      expect(source).toContain("WRITE_OFF_WARNING_THRESHOLD");
      expect(source).toContain("WRITE_OFF_RECOMMENDATION_THRESHOLD");
      // Both surfaces render the marker text via the shared WRITE_OFF_UI_LABELS
      // constant (checked above) rather than each re-typing the literal wording.
      expect(source).toContain("WRITE_OFF_UI_LABELS");
    }
  });
});
