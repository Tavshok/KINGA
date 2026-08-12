import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("P0 Package 3 runtime — Executive UI integrity", () => {
  it("contains no active operational mock arrays or demo fallbacks", () => {
    const modal = read("client/src/components/ClaimDrillDownModal.tsx");
    const dashboard = read("client/src/pages/ExecutiveDashboard.tsx");
    expect(modal).not.toMatch(/mockClaims|mockOverrideHistory|demoClaim|sampleClaim/);
    expect(dashboard).not.toMatch(/DEMO_EXEC_SUMMARY|DEMO_KPI_SUMMARY|DEMO_FINANCIALS|DEMO_GOVERNANCE|DEMO_ASSESSORS|DEMO_PANEL_BEATERS|DEMO_BOTTLENECKS|DEMO_MONTH_COMPARISON/);
  });

  it("uses the authorised Executive detail procedure and visibly handles unavailable and error states", () => {
    const modal = read("client/src/components/ClaimDrillDownModal.tsx");
    expect(modal).toContain("trpc.executive.getOperationalClaimDetail.useQuery");
    expect(modal).toContain('data?.state === "unavailable"');
    expect(modal).toContain("detail.isError");
    expect(modal).toContain("No workflow history is available");
    expect(modal).toContain("No authorised executive override history");
  });
});
