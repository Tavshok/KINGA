import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  getRegulatoryProfile,
  validateAgainstProfile,
} from "./regulatoryProfiles";

describe("P0-B1 residual fraud authority boundaries", () => {
  it("does not use an injected historic fraud score to alter regulatory compliance", () => {
    const profile = getRegulatoryProfile("ZA");
    const base = {
      photoCount: 2,
      hasQuotation: true,
      hasPoliceReport: true,
      hasDriverStatement: true,
      overallConfidence: 90,
      costUsd: 100,
      hasPhysicsAnalysis: true,
      hasCriticalConflicts: false,
      recommendation: "REVIEW" as const,
    };

    const low = validateAgainstProfile(profile, {
      ...base,
      fraudScore: 0,
    } as typeof base);
    const high = validateAgainstProfile(profile, {
      ...base,
      fraudScore: 100,
    } as typeof base);

    expect(high).toEqual(low);
    expect(
      high.violations.every(violation => !/fraud/i.test(violation.field))
    ).toBe(true);
  });

  it("contains no automatic learning fraud-score query or reconciliation score trigger", () => {
    const read = (relativePath: string) =>
      fs.readFileSync(path.resolve(process.cwd(), relativePath), "utf8");
    const learning = read("server/pipeline-v2/repairReplaceEngine.ts");
    const reconciliation = read(
      "server/pipeline-v2/truthReconciliationEngine.ts"
    );

    expect(learning).not.toMatch(
      /fraud_risk_score|isExcludedByFraudGuard|G-1 Fraud Guard/
    );
    expect(reconciliation).not.toContain("High fraud risk score:");
    expect(reconciliation).not.toMatch(/fraudScore\s*>=\s*70/);
  });
});
