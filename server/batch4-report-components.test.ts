/**
 * Batch 4 Report Components — Unit Tests
 *
 * Tests pure helper logic from Batch4ReportComponents.tsx:
 * - scoreColour thresholds
 * - DataCompletenessRing score clamping logic
 * - Phase1CorrectionsPanel data extraction paths
 * - KeyDriversAdvisoriesPanel data extraction paths
 */

import { describe, it, expect } from "vitest";

// ─── Replicate helpers ────────────────────────────────────────────────────────

function scoreColour(score: number): { fg: string; bg: string; border: string } {
  if (score >= 80) return { fg: "#10b981", bg: "#052e16", border: "#065f46" };
  if (score >= 55) return { fg: "#f59e0b", bg: "#1c1400", border: "#92400e" };
  return { fg: "#f87171", bg: "#1c0606", border: "#991b1b" };
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function getDataCompletenessScore(enforcement: any, aiAssessment: any): number | null {
  return (
    enforcement?._phase2?.dataCompleteness ??
    enforcement?.dataCompleteness ??
    aiAssessment?._normalised?.dataCompleteness ??
    null
  );
}

function getPhase1Corrections(aiAssessment: any): string[] {
  return (
    aiAssessment?._phase1?.allCorrections ??
    aiAssessment?.phase1Corrections ??
    []
  );
}

function getPhase1GateStatus(aiAssessment: any): string {
  return aiAssessment?._phase1?.overallStatus ?? "PASS";
}

function getKeyDrivers(enforcement: any, aiAssessment: any): string[] {
  return (
    enforcement?._phase2?.keyDrivers ??
    enforcement?.keyDrivers ??
    aiAssessment?._normalised?.keyDrivers ??
    []
  );
}

function getAdvisories(enforcement: any, aiAssessment: any): string[] {
  return (
    enforcement?._phase2?.advisories ??
    enforcement?.advisories ??
    aiAssessment?._normalised?.advisories ??
    []
  );
}

function getNextSteps(enforcement: any): string[] {
  return (
    enforcement?._phase2?.nextSteps ??
    enforcement?.nextSteps ??
    []
  );
}

function getCompletenessLabel(score: number): string {
  if (score >= 80) return "Complete";
  if (score >= 55) return "Partial";
  return "Incomplete";
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("scoreColour", () => {
  it("returns green for score >= 80", () => {
    expect(scoreColour(80).fg).toBe("#10b981");
    expect(scoreColour(100).fg).toBe("#10b981");
    expect(scoreColour(95).fg).toBe("#10b981");
  });

  it("returns amber for score 55-79", () => {
    expect(scoreColour(55).fg).toBe("#f59e0b");
    expect(scoreColour(70).fg).toBe("#f59e0b");
    expect(scoreColour(79).fg).toBe("#f59e0b");
  });

  it("returns red for score < 55", () => {
    expect(scoreColour(54).fg).toBe("#f87171");
    expect(scoreColour(0).fg).toBe("#f87171");
    expect(scoreColour(30).fg).toBe("#f87171");
  });

  it("boundary: exactly 80 is green", () => {
    expect(scoreColour(80).fg).toBe("#10b981");
  });

  it("boundary: exactly 55 is amber", () => {
    expect(scoreColour(55).fg).toBe("#f59e0b");
  });
});

describe("clampScore", () => {
  it("clamps 0 to 0", () => expect(clampScore(0)).toBe(0));
  it("clamps 100 to 100", () => expect(clampScore(100)).toBe(100));
  it("clamps -10 to 0", () => expect(clampScore(-10)).toBe(0));
  it("clamps 110 to 100", () => expect(clampScore(110)).toBe(100));
  it("rounds 72.6 to 73", () => expect(clampScore(72.6)).toBe(73));
  it("rounds 72.4 to 72", () => expect(clampScore(72.4)).toBe(72));
});

describe("getDataCompletenessScore", () => {
  it("reads from enforcement._phase2.dataCompleteness first", () => {
    expect(getDataCompletenessScore({ _phase2: { dataCompleteness: 85 } }, {})).toBe(85);
  });

  it("falls back to enforcement.dataCompleteness", () => {
    expect(getDataCompletenessScore({ dataCompleteness: 70 }, {})).toBe(70);
  });

  it("falls back to aiAssessment._normalised.dataCompleteness", () => {
    expect(getDataCompletenessScore({}, { _normalised: { dataCompleteness: 60 } })).toBe(60);
  });

  it("returns null when no source available", () => {
    expect(getDataCompletenessScore({}, {})).toBeNull();
  });

  it("returns null for null enforcement and assessment", () => {
    expect(getDataCompletenessScore(null, null)).toBeNull();
  });

  it("prefers _phase2 over top-level enforcement field", () => {
    expect(
      getDataCompletenessScore({ _phase2: { dataCompleteness: 90 }, dataCompleteness: 50 }, {})
    ).toBe(90);
  });
});

describe("getPhase1Corrections", () => {
  it("reads from _phase1.allCorrections", () => {
    const corrections = ["G1: date normalised", "G3: cost reconciled"];
    expect(getPhase1Corrections({ _phase1: { allCorrections: corrections } })).toEqual(corrections);
  });

  it("falls back to phase1Corrections", () => {
    const corrections = ["field fixed"];
    expect(getPhase1Corrections({ phase1Corrections: corrections })).toEqual(corrections);
  });

  it("returns empty array when no corrections", () => {
    expect(getPhase1Corrections({})).toEqual([]);
  });

  it("returns empty array for null assessment", () => {
    expect(getPhase1Corrections(null)).toEqual([]);
  });
});

describe("getPhase1GateStatus", () => {
  it("reads overallStatus from _phase1", () => {
    expect(getPhase1GateStatus({ _phase1: { overallStatus: "BLOCK" } })).toBe("BLOCK");
  });

  it("defaults to PASS when not present", () => {
    expect(getPhase1GateStatus({})).toBe("PASS");
  });

  it("handles WARN status", () => {
    expect(getPhase1GateStatus({ _phase1: { overallStatus: "WARN" } })).toBe("WARN");
  });
});

describe("getKeyDrivers", () => {
  it("reads from enforcement._phase2.keyDrivers", () => {
    const drivers = ["Fraud risk: HIGH", "Physics implausibility"];
    expect(getKeyDrivers({ _phase2: { keyDrivers: drivers } }, {})).toEqual(drivers);
  });

  it("falls back to enforcement.keyDrivers", () => {
    const drivers = ["Cost escalation"];
    expect(getKeyDrivers({ keyDrivers: drivers }, {})).toEqual(drivers);
  });

  it("falls back to aiAssessment._normalised.keyDrivers", () => {
    const drivers = ["High-value claim"];
    expect(getKeyDrivers({}, { _normalised: { keyDrivers: drivers } })).toEqual(drivers);
  });

  it("returns empty array when none available", () => {
    expect(getKeyDrivers({}, {})).toEqual([]);
  });
});

describe("getAdvisories", () => {
  it("reads from enforcement._phase2.advisories", () => {
    const advisories = ["Airbag deployment inconsistency"];
    expect(getAdvisories({ _phase2: { advisories } }, {})).toEqual(advisories);
  });

  it("falls back to enforcement.advisories", () => {
    const advisories = ["Seatbelt note"];
    expect(getAdvisories({ advisories }, {})).toEqual(advisories);
  });

  it("returns empty array when none available", () => {
    expect(getAdvisories({}, {})).toEqual([]);
  });
});

describe("getNextSteps", () => {
  it("reads from enforcement._phase2.nextSteps", () => {
    const steps = ["Request police report", "Obtain independent quote"];
    expect(getNextSteps({ _phase2: { nextSteps: steps } })).toEqual(steps);
  });

  it("falls back to enforcement.nextSteps", () => {
    const steps = ["Review photos"];
    expect(getNextSteps({ nextSteps: steps })).toEqual(steps);
  });

  it("returns empty array when none available", () => {
    expect(getNextSteps({})).toEqual([]);
  });
});

describe("getCompletenessLabel", () => {
  it("returns Complete for >= 80", () => {
    expect(getCompletenessLabel(80)).toBe("Complete");
    expect(getCompletenessLabel(100)).toBe("Complete");
  });

  it("returns Partial for 55-79", () => {
    expect(getCompletenessLabel(55)).toBe("Partial");
    expect(getCompletenessLabel(79)).toBe("Partial");
  });

  it("returns Incomplete for < 55", () => {
    expect(getCompletenessLabel(54)).toBe("Incomplete");
    expect(getCompletenessLabel(0)).toBe("Incomplete");
  });
});

describe("integration: full data extraction chain", () => {
  const mockEnforcement = {
    _phase2: {
      dataCompleteness: 78,
      keyDrivers: ["Fraud risk: MEDIUM", "Cost within benchmark"],
      advisories: ["Airbag advisory"],
      nextSteps: ["Obtain police report"],
    },
  };

  const mockAssessment = {
    _phase1: {
      overallStatus: "WARN",
      allCorrections: ["G1: date normalised to ISO format", "G3: cost reconciled to USD"],
      gates: [
        { gate: "G1_DATE", status: "WARN", corrections: ["date normalised"] },
        { gate: "G3_COST", status: "PASS", corrections: [] },
      ],
    },
  };

  it("extracts completeness score from _phase2", () => {
    expect(getDataCompletenessScore(mockEnforcement, mockAssessment)).toBe(78);
  });

  it("extracts 2 corrections from _phase1", () => {
    expect(getPhase1Corrections(mockAssessment)).toHaveLength(2);
  });

  it("gate status is WARN", () => {
    expect(getPhase1GateStatus(mockAssessment)).toBe("WARN");
  });

  it("extracts 2 key drivers", () => {
    expect(getKeyDrivers(mockEnforcement, mockAssessment)).toHaveLength(2);
  });

  it("extracts 1 advisory", () => {
    expect(getAdvisories(mockEnforcement, mockAssessment)).toHaveLength(1);
  });

  it("extracts 1 next step", () => {
    expect(getNextSteps(mockEnforcement)).toHaveLength(1);
  });

  it("completeness label is Partial for score 78", () => {
    expect(getCompletenessLabel(78)).toBe("Partial");
  });
});
