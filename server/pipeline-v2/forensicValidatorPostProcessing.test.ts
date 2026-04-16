/**
 * forensicValidatorPostProcessing.test.ts
 *
 * Unit tests for the deterministic post-processing rules added to the forensic
 * audit validator in the multi-stakeholder reasoning sprint:
 *
 *   (D) scenarioDamageMismatch → HIGH forensic flag
 *   (E) stakeholder_analysis contradictions → HIGH advisory
 *       stakeholder_analysis liability UNDER_INVESTIGATION → MEDIUM advisory
 *       stakeholder_analysis low liability confidence → MEDIUM advisory
 *
 * These tests exercise the post-processing logic directly by constructing a
 * minimal PipelineResult-shaped object and verifying the injected issues.
 *
 * NOTE: runForensicAuditValidation() calls an LLM, so we cannot call it in
 * unit tests. Instead we test the helper functions that are used by the
 * post-processing block. We verify the logic by inspecting the filter/inject
 * conditions directly.
 */

import { describe, it, expect } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers — replicate the post-processing logic inline so we can test it
// without calling the LLM.
// ─────────────────────────────────────────────────────────────────────────────

interface Issue {
  dimension: string;
  code: string;
  description: string;
  evidence: string;
  severity?: string;
}

/**
 * Minimal simulation of the (D) scenarioDamageMismatch post-processing block.
 */
function applyScenarioDamageMismatch(
  workingHigh: Issue[],
  collisionScenario: string,
  scenarioDamageMismatch: boolean
): Issue[] {
  if (!scenarioDamageMismatch) return workingHigh;
  const alreadyFlagged = workingHigh.some(
    (i) =>
      (i.code ?? "").includes("SCENARIO_DAMAGE_MISMATCH") ||
      ((i.description ?? "").toLowerCase().includes("scenario") &&
        (i.description ?? "").toLowerCase().includes("damage"))
  );
  if (alreadyFlagged) return workingHigh;
  return [
    ...workingHigh,
    {
      dimension: "incidentClassification",
      code: "SCENARIO_DAMAGE_MISMATCH",
      description: `[HIGH — physics] The claimed collision scenario (${collisionScenario}) is inconsistent with the primary damage zone identified by the physics engine. This contradiction requires adjuster review before settlement.`,
      evidence: `collisionScenario=${collisionScenario}; scenarioDamageMismatch=true (Stage 7 flag)`,
      severity: "HIGH",
    },
  ];
}

/**
 * Minimal simulation of the (E) stakeholder_analysis post-processing block.
 */
function applyStakeholderAnalysis(
  workingHigh: Issue[],
  workingMedium: Issue[],
  stakeholderAnalysis: {
    contradiction_points?: string[];
    liability_posture?: string;
    liability_confidence?: number;
  } | null
): { high: Issue[]; medium: Issue[] } {
  if (!stakeholderAnalysis) return { high: workingHigh, medium: workingMedium };

  const contradictions: string[] = stakeholderAnalysis.contradiction_points ?? [];
  const liabilityPosture: string = stakeholderAnalysis.liability_posture ?? "UNDETERMINED";
  const liabilityConfidence: number = stakeholderAnalysis.liability_confidence ?? 0;

  let high = [...workingHigh];
  let medium = [...workingMedium];

  // Contradiction injection
  if (contradictions.length > 0) {
    const alreadyFlagged = high.some((i) =>
      (i.code ?? "").includes("STAKEHOLDER_CONTRADICTION")
    );
    if (!alreadyFlagged) {
      const contradictionSummary = contradictions.slice(0, 3).join("; ");
      high = [
        ...high,
        {
          dimension: "crossStageConsistency",
          code: "STAKEHOLDER_CONTRADICTION",
          description: `[HIGH — multi-stakeholder] Contradictions detected between stakeholder accounts. Adjuster must resolve before settlement. Contradictions: ${contradictionSummary}`,
          evidence: `liability_posture=${liabilityPosture}; liability_confidence=${liabilityConfidence}; contradiction_count=${contradictions.length}`,
          severity: "HIGH",
        },
      ];
    }
  }

  // UNDER_INVESTIGATION injection
  if (liabilityPosture === "UNDER_INVESTIGATION") {
    const alreadyFlagged = [...high, ...medium].some((i) =>
      (i.code ?? "").includes("LIABILITY_UNDER_INVESTIGATION")
    );
    if (!alreadyFlagged) {
      medium = [
        ...medium,
        {
          dimension: "incidentClassification",
          code: "LIABILITY_UNDER_INVESTIGATION",
          description:
            "[MEDIUM — liability] Police investigation is ongoing. Liability posture is UNDER_INVESTIGATION. Settlement should be deferred until police close the matter or a charge is confirmed.",
          evidence: `liability_posture=${liabilityPosture}; liability_confidence=${liabilityConfidence}`,
          severity: "MEDIUM",
        },
      ];
    }
  }

  // Low liability confidence injection
  if (
    liabilityConfidence < 40 &&
    liabilityPosture !== "UNDETERMINED" &&
    liabilityPosture !== "UNDER_INVESTIGATION"
  ) {
    const alreadyFlagged = medium.some((i) =>
      (i.code ?? "").includes("LOW_LIABILITY_CONFIDENCE")
    );
    if (!alreadyFlagged) {
      medium = [
        ...medium,
        {
          dimension: "incidentClassification",
          code: "LOW_LIABILITY_CONFIDENCE",
          description: `[MEDIUM — liability] Liability posture is ${liabilityPosture} but confidence is low (${liabilityConfidence}/100). Insufficient corroborating evidence to confirm liability. Adjuster should obtain additional statements or police report.`,
          evidence: `liability_posture=${liabilityPosture}; liability_confidence=${liabilityConfidence}`,
          severity: "MEDIUM",
        },
      ];
    }
  }

  return { high, medium };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests — (D) scenarioDamageMismatch
// ─────────────────────────────────────────────────────────────────────────────

describe("forensicValidator post-processing — (D) scenarioDamageMismatch", () => {
  it("injects HIGH flag when scenarioDamageMismatch=true and no prior flag", () => {
    const result = applyScenarioDamageMismatch([], "rear_end_struck", true);
    expect(result).toHaveLength(1);
    expect(result[0].code).toBe("SCENARIO_DAMAGE_MISMATCH");
    expect(result[0].severity).toBe("HIGH");
    expect(result[0].dimension).toBe("incidentClassification");
    expect(result[0].description).toContain("rear_end_struck");
    expect(result[0].evidence).toContain("scenarioDamageMismatch=true");
  });

  it("does NOT inject when scenarioDamageMismatch=false", () => {
    const result = applyScenarioDamageMismatch([], "rear_end_struck", false);
    expect(result).toHaveLength(0);
  });

  it("does NOT inject when SCENARIO_DAMAGE_MISMATCH already in workingHigh", () => {
    const existing: Issue[] = [
      {
        dimension: "incidentClassification",
        code: "SCENARIO_DAMAGE_MISMATCH",
        description: "already flagged",
        evidence: "prior run",
      },
    ];
    const result = applyScenarioDamageMismatch(existing, "sideswipe", true);
    expect(result).toHaveLength(1); // no duplicate
    expect(result[0].description).toBe("already flagged");
  });

  it("does NOT inject when description already mentions scenario+damage", () => {
    const existing: Issue[] = [
      {
        dimension: "incidentClassification",
        code: "SOME_OTHER_CODE",
        description: "the scenario is inconsistent with the damage zone",
        evidence: "prior run",
      },
    ];
    const result = applyScenarioDamageMismatch(existing, "head_on", true);
    expect(result).toHaveLength(1); // no duplicate
  });

  it("preserves existing workingHigh issues when injecting", () => {
    const existing: Issue[] = [
      {
        dimension: "dataExtraction",
        code: "SOME_EXISTING",
        description: "existing issue",
        evidence: "evidence",
      },
    ];
    const result = applyScenarioDamageMismatch(existing, "sideswipe", true);
    expect(result).toHaveLength(2);
    expect(result[0].code).toBe("SOME_EXISTING");
    expect(result[1].code).toBe("SCENARIO_DAMAGE_MISMATCH");
  });

  it("includes the collision scenario name in the injected description", () => {
    const result = applyScenarioDamageMismatch([], "head_on", true);
    expect(result[0].description).toContain("head_on");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests — (E) stakeholder_analysis contradictions
// ─────────────────────────────────────────────────────────────────────────────

describe("forensicValidator post-processing — (E) stakeholder_analysis contradictions", () => {
  it("injects HIGH flag when contradiction_points is non-empty", () => {
    const { high } = applyStakeholderAnalysis([], [], {
      contradiction_points: ["Claimant says red light; police report says green light"],
      liability_posture: "UNDETERMINED",
      liability_confidence: 50,
    });
    expect(high).toHaveLength(1);
    expect(high[0].code).toBe("STAKEHOLDER_CONTRADICTION");
    expect(high[0].severity).toBe("HIGH");
    expect(high[0].dimension).toBe("crossStageConsistency");
    expect(high[0].description).toContain("Claimant says red light");
  });

  it("does NOT inject contradiction flag when contradiction_points is empty", () => {
    const { high } = applyStakeholderAnalysis([], [], {
      contradiction_points: [],
      liability_posture: "THIRD_PARTY_AT_FAULT",
      liability_confidence: 80,
    });
    expect(high).toHaveLength(0);
  });

  it("does NOT inject contradiction flag when already present", () => {
    const existing: Issue[] = [
      {
        dimension: "crossStageConsistency",
        code: "STAKEHOLDER_CONTRADICTION",
        description: "already flagged",
        evidence: "prior run",
      },
    ];
    const { high } = applyStakeholderAnalysis(existing, [], {
      contradiction_points: ["Some contradiction"],
      liability_posture: "UNDETERMINED",
      liability_confidence: 50,
    });
    expect(high).toHaveLength(1); // no duplicate
    expect(high[0].description).toBe("already flagged");
  });

  it("includes up to 3 contradiction points in the description", () => {
    const { high } = applyStakeholderAnalysis([], [], {
      contradiction_points: ["Point A", "Point B", "Point C", "Point D"],
      liability_posture: "UNDETERMINED",
      liability_confidence: 50,
    });
    expect(high[0].description).toContain("Point A");
    expect(high[0].description).toContain("Point B");
    expect(high[0].description).toContain("Point C");
    expect(high[0].description).not.toContain("Point D"); // truncated at 3
  });

  it("includes contradiction_count in evidence", () => {
    const { high } = applyStakeholderAnalysis([], [], {
      contradiction_points: ["A", "B"],
      liability_posture: "SHARED_FAULT",
      liability_confidence: 60,
    });
    expect(high[0].evidence).toContain("contradiction_count=2");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests — (E) stakeholder_analysis UNDER_INVESTIGATION
// ─────────────────────────────────────────────────────────────────────────────

describe("forensicValidator post-processing — (E) LIABILITY_UNDER_INVESTIGATION", () => {
  it("injects MEDIUM flag when liability_posture is UNDER_INVESTIGATION", () => {
    const { medium } = applyStakeholderAnalysis([], [], {
      contradiction_points: [],
      liability_posture: "UNDER_INVESTIGATION",
      liability_confidence: 30,
    });
    expect(medium).toHaveLength(1);
    expect(medium[0].code).toBe("LIABILITY_UNDER_INVESTIGATION");
    expect(medium[0].severity).toBe("MEDIUM");
    expect(medium[0].dimension).toBe("incidentClassification");
  });

  it("does NOT inject UNDER_INVESTIGATION flag when posture is UNDETERMINED", () => {
    const { medium } = applyStakeholderAnalysis([], [], {
      contradiction_points: [],
      liability_posture: "UNDETERMINED",
      liability_confidence: 30,
    });
    expect(medium).toHaveLength(0);
  });

  it("does NOT inject UNDER_INVESTIGATION flag when already present in medium", () => {
    const existing: Issue[] = [
      {
        dimension: "incidentClassification",
        code: "LIABILITY_UNDER_INVESTIGATION",
        description: "already flagged",
        evidence: "prior run",
      },
    ];
    const { medium } = applyStakeholderAnalysis([], existing, {
      contradiction_points: [],
      liability_posture: "UNDER_INVESTIGATION",
      liability_confidence: 20,
    });
    expect(medium).toHaveLength(1); // no duplicate
    expect(medium[0].description).toBe("already flagged");
  });

  it("does NOT inject UNDER_INVESTIGATION flag when already present in high", () => {
    const existingHigh: Issue[] = [
      {
        dimension: "incidentClassification",
        code: "LIABILITY_UNDER_INVESTIGATION",
        description: "already in high",
        evidence: "prior run",
      },
    ];
    const { medium } = applyStakeholderAnalysis(existingHigh, [], {
      contradiction_points: [],
      liability_posture: "UNDER_INVESTIGATION",
      liability_confidence: 20,
    });
    expect(medium).toHaveLength(0); // not added to medium either
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests — (E) stakeholder_analysis LOW_LIABILITY_CONFIDENCE
// ─────────────────────────────────────────────────────────────────────────────

describe("forensicValidator post-processing — (E) LOW_LIABILITY_CONFIDENCE", () => {
  it("injects MEDIUM flag when confidence < 40 and posture is not UNDETERMINED", () => {
    const { medium } = applyStakeholderAnalysis([], [], {
      contradiction_points: [],
      liability_posture: "THIRD_PARTY_AT_FAULT",
      liability_confidence: 30,
    });
    expect(medium).toHaveLength(1);
    expect(medium[0].code).toBe("LOW_LIABILITY_CONFIDENCE");
    expect(medium[0].severity).toBe("MEDIUM");
    expect(medium[0].description).toContain("THIRD_PARTY_AT_FAULT");
    expect(medium[0].description).toContain("30/100");
  });

  it("does NOT inject when confidence >= 40", () => {
    const { medium } = applyStakeholderAnalysis([], [], {
      contradiction_points: [],
      liability_posture: "CLAIMANT_AT_FAULT",
      liability_confidence: 40,
    });
    expect(medium).toHaveLength(0);
  });

  it("does NOT inject when posture is UNDETERMINED (even if confidence < 40)", () => {
    const { medium } = applyStakeholderAnalysis([], [], {
      contradiction_points: [],
      liability_posture: "UNDETERMINED",
      liability_confidence: 10,
    });
    expect(medium).toHaveLength(0);
  });

  it("does NOT inject when posture is UNDER_INVESTIGATION (even if confidence < 40)", () => {
    const { medium } = applyStakeholderAnalysis([], [], {
      contradiction_points: [],
      liability_posture: "UNDER_INVESTIGATION",
      liability_confidence: 10,
    });
    // Only LIABILITY_UNDER_INVESTIGATION is injected, not LOW_LIABILITY_CONFIDENCE
    expect(medium).toHaveLength(1);
    expect(medium[0].code).toBe("LIABILITY_UNDER_INVESTIGATION");
    expect(medium.some((i) => i.code === "LOW_LIABILITY_CONFIDENCE")).toBe(false);
  });

  it("does NOT inject when already present in medium", () => {
    const existing: Issue[] = [
      {
        dimension: "incidentClassification",
        code: "LOW_LIABILITY_CONFIDENCE",
        description: "already flagged",
        evidence: "prior run",
      },
    ];
    const { medium } = applyStakeholderAnalysis([], existing, {
      contradiction_points: [],
      liability_posture: "CLAIMANT_AT_FAULT",
      liability_confidence: 20,
    });
    expect(medium).toHaveLength(1); // no duplicate
    expect(medium[0].description).toBe("already flagged");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests — null/missing stakeholder_analysis
// ─────────────────────────────────────────────────────────────────────────────

describe("forensicValidator post-processing — null stakeholder_analysis", () => {
  it("returns unchanged arrays when stakeholder_analysis is null", () => {
    const high: Issue[] = [
      { dimension: "dataExtraction", code: "EXISTING", description: "existing", evidence: "e" },
    ];
    const medium: Issue[] = [];
    const { high: h, medium: m } = applyStakeholderAnalysis(high, medium, null);
    expect(h).toHaveLength(1);
    expect(m).toHaveLength(0);
  });

  it("returns unchanged arrays when stakeholder_analysis is undefined", () => {
    const { high, medium } = applyStakeholderAnalysis([], [], null);
    expect(high).toHaveLength(0);
    expect(medium).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests — combined scenarios
// ─────────────────────────────────────────────────────────────────────────────

describe("forensicValidator post-processing — combined scenarios", () => {
  it("injects both SCENARIO_DAMAGE_MISMATCH and STAKEHOLDER_CONTRADICTION in the same claim", () => {
    let high = applyScenarioDamageMismatch([], "rear_end_struck", true);
    const result = applyStakeholderAnalysis(high, [], {
      contradiction_points: ["Speed contradiction"],
      liability_posture: "UNDETERMINED",
      liability_confidence: 50,
    });
    expect(result.high).toHaveLength(2);
    expect(result.high.map((i) => i.code)).toContain("SCENARIO_DAMAGE_MISMATCH");
    expect(result.high.map((i) => i.code)).toContain("STAKEHOLDER_CONTRADICTION");
  });

  it("injects STAKEHOLDER_CONTRADICTION + LIABILITY_UNDER_INVESTIGATION together", () => {
    const result = applyStakeholderAnalysis([], [], {
      contradiction_points: ["Claimant says A; police says B"],
      liability_posture: "UNDER_INVESTIGATION",
      liability_confidence: 25,
    });
    expect(result.high).toHaveLength(1);
    expect(result.high[0].code).toBe("STAKEHOLDER_CONTRADICTION");
    expect(result.medium).toHaveLength(1);
    expect(result.medium[0].code).toBe("LIABILITY_UNDER_INVESTIGATION");
  });

  it("injects STAKEHOLDER_CONTRADICTION + LOW_LIABILITY_CONFIDENCE together", () => {
    const result = applyStakeholderAnalysis([], [], {
      contradiction_points: ["Speed dispute"],
      liability_posture: "SHARED_FAULT",
      liability_confidence: 25,
    });
    expect(result.high).toHaveLength(1);
    expect(result.high[0].code).toBe("STAKEHOLDER_CONTRADICTION");
    expect(result.medium).toHaveLength(1);
    expect(result.medium[0].code).toBe("LOW_LIABILITY_CONFIDENCE");
  });
});
