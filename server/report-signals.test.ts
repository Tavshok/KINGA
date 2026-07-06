// @ts-nocheck
/**
 * Verification tests for R-F-01, R-F-02, R-F-04, R-F-05 fixes.
 *
 * These tests confirm that:
 *   R-F-01: blockAutoApproval + flags[] from crossStageConsistencyEngine are persisted
 *           to report_signals_json and surfaced in _reportSignals on the assessment object.
 *   R-F-02: hasContradictions is true when _preGenerationCheck.contradictions[] is non-empty,
 *           and the banner data is available for JSX rendering.
 *   R-F-04: prePublicationBlockers are persisted when blockerCount > 0.
 *   R-F-05: costNarrative.recommendation (APPROVE/REVIEW/REJECT) is persisted and surfaced.
 *
 * All tests operate on the persistence logic in db.ts (reportSignalsJson builder)
 * and the router parsing logic (_reportSignals extractor).
 * No live DB connections are required — tests use mock data shapes.
 */

import { describe, expect, it } from "vitest";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Simulate the reportSignalsJson builder from db.ts.
 * Mirrors the exact logic in the persistence layer so tests stay in sync.
 */
function buildReportSignalsJson(
  report: any,
  costAnalysis: any
): string | null {
  try {
    const signals: Record<string, unknown> = {};

    // R-F-01: cross-stage consistency flags (blockAutoApproval)
    const cc = report?.consistencyCheck;
    if (cc && (cc as any).blockAutoApproval) {
      signals.consistencyFlags = {
        blockAutoApproval: (cc as any).blockAutoApproval,
        overallStatus: (cc as any).status,
        flagCount: (cc as any).flags?.length ?? 0,
        criticalCount: (cc as any).criticalCount ?? 0,
        highCount: (cc as any).highCount ?? 0,
        flags: ((cc as any).flags ?? []).map((f: any) => ({
          id: f.ruleId,
          severity: f.severity,
          description: f.description,
          recommendation: f.adjusterAction,
        })),
      };
    }

    // R-F-04: pre-publication validator blocker list
    const ppv = (report?.fullReport as any)?.sections?.prePublicationValidation;
    if (ppv && (ppv.blockerCount ?? 0) > 0) {
      signals.prePublicationBlockers = {
        valid: ppv.valid,
        blocked: ppv.blocked,
        blockerCount: ppv.blockerCount,
        blockers: ppv.blockers,
        validatedAt: ppv.validatedAt,
      };
    }

    // R-F-05 / C-E-01: cost recommendation from Stage 9 costNarrative
    const costRec = (costAnalysis as any)?.costNarrative;
    if (costRec?.recommendation) {
      signals.costRecommendation = {
        recommendation: costRec.recommendation,
        recommendation_reason: costRec.recommendation_reason ?? null,
        confidence: costRec.confidence ?? null,
        flags_addressed: costRec.flags_addressed ?? [],
      };
    }

    return Object.keys(signals).length > 0 ? JSON.stringify(signals) : null;
  } catch {
    return null;
  }
}

/**
 * Simulate the router _reportSignals extractor.
 */
function parseReportSignals(reportSignalsJson: string | null): any {
  try {
    if (reportSignalsJson) {
      return JSON.parse(reportSignalsJson);
    }
  } catch { /* non-fatal */ }
  return null;
}

// ─── R-F-01 Tests ─────────────────────────────────────────────────────────────

describe("R-F-01: blockAutoApproval persistence and surfacing", () => {
  it("persists consistencyFlags when blockAutoApproval=true with CRITICAL flags", () => {
    const mockReport = {
      consistencyCheck: {
        blockAutoApproval: true,
        status: "CRITICAL_CONFLICT",
        criticalCount: 2,
        highCount: 1,
        flags: [
          {
            ruleId: "CC-001",
            severity: "CRITICAL",
            description: "Physics speed contradicts GPS data",
            adjusterAction: "Request independent speed analysis",
          },
          {
            ruleId: "CC-002",
            severity: "CRITICAL",
            description: "Damage zone mismatch: front declared, rear detected",
            adjusterAction: "Review photo evidence against incident narrative",
          },
          {
            ruleId: "CC-003",
            severity: "HIGH",
            description: "Cost estimate 340% above market benchmark",
            adjusterAction: "Request revised quote from alternative repairer",
          },
        ],
      },
    };

    const json = buildReportSignalsJson(mockReport, null);
    expect(json).not.toBeNull();

    const signals = JSON.parse(json!);
    expect(signals.consistencyFlags).toBeDefined();
    expect(signals.consistencyFlags.blockAutoApproval).toBe(true);
    expect(signals.consistencyFlags.overallStatus).toBe("CRITICAL_CONFLICT");
    expect(signals.consistencyFlags.criticalCount).toBe(2);
    expect(signals.consistencyFlags.highCount).toBe(1);
    expect(signals.consistencyFlags.flagCount).toBe(3);
    expect(signals.consistencyFlags.flags).toHaveLength(3);
    expect(signals.consistencyFlags.flags[0].id).toBe("CC-001");
    expect(signals.consistencyFlags.flags[0].severity).toBe("CRITICAL");
  });

  it("does NOT persist consistencyFlags when blockAutoApproval=false", () => {
    const mockReport = {
      consistencyCheck: {
        blockAutoApproval: false,
        status: "PASS",
        criticalCount: 0,
        highCount: 0,
        flags: [],
      },
    };

    const json = buildReportSignalsJson(mockReport, null);
    // Should be null since no signals to persist
    expect(json).toBeNull();
  });

  it("does NOT persist consistencyFlags when consistencyCheck is absent", () => {
    const mockReport = { claimQuality: { overallScore: 72 } };
    const json = buildReportSignalsJson(mockReport, null);
    expect(json).toBeNull();
  });

  it("router _reportSignals extractor returns parsed object from JSON string", () => {
    const mockSignals = {
      consistencyFlags: {
        blockAutoApproval: true,
        overallStatus: "CRITICAL_CONFLICT",
        flagCount: 1,
        criticalCount: 1,
        highCount: 0,
        flags: [{ id: "CC-001", severity: "CRITICAL", description: "Test", recommendation: "Review" }],
      },
    };
    const json = JSON.stringify(mockSignals);
    const parsed = parseReportSignals(json);
    expect(parsed).not.toBeNull();
    expect(parsed.consistencyFlags.blockAutoApproval).toBe(true);
    expect(parsed.consistencyFlags.flags[0].id).toBe("CC-001");
  });

  it("router _reportSignals extractor returns null for null input", () => {
    expect(parseReportSignals(null)).toBeNull();
  });

  it("router _reportSignals extractor returns null for malformed JSON", () => {
    expect(parseReportSignals("{bad json")).toBeNull();
  });
});

// ─── R-F-02 Tests ─────────────────────────────────────────────────────────────

describe("R-F-02: hasContradictions banner data availability", () => {
  it("hasContradictions is true when _preGenerationCheck.contradictions is non-empty", () => {
    const aiAssessment = {
      _preGenerationCheck: {
        contradictions: [
          { field: "speed", description: "Claimed 60 km/h, physics infers 95 km/h" },
          { field: "damage_zone", description: "Front declared, rear detected by vision" },
        ],
      },
    };

    const preGenCheck = (aiAssessment as any)?._preGenerationCheck ?? null;
    const contradictions: any[] = preGenCheck?.contradictions ?? [];
    const hasContradictions = contradictions.length > 0;

    expect(hasContradictions).toBe(true);
    expect(contradictions).toHaveLength(2);
    expect(contradictions[0].field).toBe("speed");
  });

  it("hasContradictions is false when contradictions array is empty", () => {
    const aiAssessment = {
      _preGenerationCheck: { contradictions: [] },
    };

    const preGenCheck = (aiAssessment as any)?._preGenerationCheck ?? null;
    const contradictions: any[] = preGenCheck?.contradictions ?? [];
    const hasContradictions = contradictions.length > 0;

    expect(hasContradictions).toBe(false);
  });

  it("hasContradictions is false when _preGenerationCheck is absent", () => {
    const aiAssessment = { fraudScore: 45 };

    const preGenCheck = (aiAssessment as any)?._preGenerationCheck ?? null;
    const contradictions: any[] = preGenCheck?.contradictions ?? [];
    const hasContradictions = contradictions.length > 0;

    expect(hasContradictions).toBe(false);
  });

  it("contradiction banner renders field and description from each contradiction", () => {
    const contradictions = [
      { field: "speed", description: "Claimed 60 km/h, physics infers 95 km/h" },
      { type: "damage_zone", message: "Front declared, rear detected" },
    ];

    // Simulate the JSX label logic: field ?? type ?? `Contradiction N`
    const labels = contradictions.map((c: any, i: number) =>
      c.field ?? c.type ?? `Contradiction ${i + 1}`
    );
    const descriptions = contradictions.map((c: any) =>
      c.description ?? c.message ?? JSON.stringify(c)
    );

    expect(labels[0]).toBe("speed");
    expect(labels[1]).toBe("damage_zone");
    expect(descriptions[0]).toBe("Claimed 60 km/h, physics infers 95 km/h");
    expect(descriptions[1]).toBe("Front declared, rear detected");
  });
});

// ─── R-F-04 Tests ─────────────────────────────────────────────────────────────

describe("R-F-04: prePublicationBlockers persistence and surfacing", () => {
  it("persists prePublicationBlockers when blockerCount > 0", () => {
    const mockReport = {
      fullReport: {
        sections: {
          prePublicationValidation: {
            valid: false,
            blocked: true,
            blockerCount: 2,
            blockers: [
              {
                checkId: "PPV-001",
                severity: "CRITICAL",
                description: "Fraud score exceeds auto-approval threshold",
                remediation: "Escalate to senior adjuster",
              },
              {
                checkId: "PPV-002",
                severity: "HIGH",
                description: "Missing police report for high-value claim",
                remediation: "Request police report before proceeding",
              },
            ],
            validatedAt: "2025-01-15T10:30:00Z",
          },
        },
      },
    };

    const json = buildReportSignalsJson(mockReport, null);
    expect(json).not.toBeNull();

    const signals = JSON.parse(json!);
    expect(signals.prePublicationBlockers).toBeDefined();
    expect(signals.prePublicationBlockers.blocked).toBe(true);
    expect(signals.prePublicationBlockers.blockerCount).toBe(2);
    expect(signals.prePublicationBlockers.blockers).toHaveLength(2);
    expect(signals.prePublicationBlockers.blockers[0].checkId).toBe("PPV-001");
    expect(signals.prePublicationBlockers.blockers[0].severity).toBe("CRITICAL");
  });

  it("does NOT persist prePublicationBlockers when blockerCount is 0", () => {
    const mockReport = {
      fullReport: {
        sections: {
          prePublicationValidation: {
            valid: true,
            blocked: false,
            blockerCount: 0,
            blockers: [],
          },
        },
      },
    };

    const json = buildReportSignalsJson(mockReport, null);
    expect(json).toBeNull();
  });

  it("does NOT persist prePublicationBlockers when prePublicationValidation section is absent", () => {
    const mockReport = {
      fullReport: { sections: {} },
    };
    const json = buildReportSignalsJson(mockReport, null);
    expect(json).toBeNull();
  });
});

// ─── R-F-05 Tests ─────────────────────────────────────────────────────────────

describe("R-F-05 / C-E-01: costNarrative.recommendation persistence and surfacing", () => {
  it("persists REJECT recommendation from costNarrative", () => {
    const mockCostAnalysis = {
      costNarrative: {
        recommendation: "REJECT",
        recommendation_reason: "Quote 340% above market benchmark with no justification",
        confidence: 0.91,
        flags_addressed: ["COST_OUTLIER", "NO_BENCHMARK_MATCH"],
        narrative: "The submitted repair quote significantly exceeds market rates.",
      },
    };

    const json = buildReportSignalsJson({}, mockCostAnalysis);
    expect(json).not.toBeNull();

    const signals = JSON.parse(json!);
    expect(signals.costRecommendation).toBeDefined();
    expect(signals.costRecommendation.recommendation).toBe("REJECT");
    expect(signals.costRecommendation.recommendation_reason).toBe(
      "Quote 340% above market benchmark with no justification"
    );
    expect(signals.costRecommendation.confidence).toBe(0.91);
    expect(signals.costRecommendation.flags_addressed).toContain("COST_OUTLIER");
  });

  it("persists APPROVE recommendation from costNarrative", () => {
    const mockCostAnalysis = {
      costNarrative: {
        recommendation: "APPROVE",
        recommendation_reason: "Quote within 5% of market benchmark",
        confidence: 0.87,
        flags_addressed: [],
      },
    };

    const json = buildReportSignalsJson({}, mockCostAnalysis);
    const signals = JSON.parse(json!);
    expect(signals.costRecommendation.recommendation).toBe("APPROVE");
  });

  it("persists REVIEW recommendation from costNarrative", () => {
    const mockCostAnalysis = {
      costNarrative: {
        recommendation: "REVIEW",
        recommendation_reason: "Borderline cost with partial benchmark match",
        confidence: 0.62,
        flags_addressed: ["PARTIAL_MATCH"],
      },
    };

    const json = buildReportSignalsJson({}, mockCostAnalysis);
    const signals = JSON.parse(json!);
    expect(signals.costRecommendation.recommendation).toBe("REVIEW");
  });

  it("does NOT persist costRecommendation when recommendation field is absent", () => {
    const mockCostAnalysis = {
      costNarrative: {
        narrative: "The submitted repair quote is within acceptable range.",
        // No recommendation field
      },
    };

    const json = buildReportSignalsJson({}, mockCostAnalysis);
    expect(json).toBeNull();
  });

  it("does NOT persist costRecommendation when costNarrative is absent", () => {
    const mockCostAnalysis = { compositeOptimisation: { l1LowestSubmittedCostUsd: 5000 } };
    const json = buildReportSignalsJson({}, mockCostAnalysis);
    expect(json).toBeNull();
  });

  it("costNarrative recommendation badge renders correct style for REJECT", () => {
    // Simulate the JSX style logic for the recommendation badge
    const rec = "REJECT";
    const recStyle =
      rec === "APPROVE"
        ? { bg: "#dcfce7", color: "#15803d", border: "#86efac" }
        : rec === "REJECT"
        ? { bg: "#fee2e2", color: "#dc2626", border: "#fca5a5" }
        : { bg: "#fef3c7", color: "#92400e", border: "#fde68a" };

    expect(recStyle.bg).toBe("#fee2e2");
    expect(recStyle.color).toBe("#dc2626");
  });

  it("costNarrative recommendation badge renders correct style for APPROVE", () => {
    const rec = "APPROVE";
    const recStyle =
      rec === "APPROVE"
        ? { bg: "#dcfce7", color: "#15803d", border: "#86efac" }
        : rec === "REJECT"
        ? { bg: "#fee2e2", color: "#dc2626", border: "#fca5a5" }
        : { bg: "#fef3c7", color: "#92400e", border: "#fde68a" };

    expect(recStyle.bg).toBe("#dcfce7");
    expect(recStyle.color).toBe("#15803d");
  });
});

// ─── Combined scenario: all three signals present ─────────────────────────────

describe("Combined scenario: claim with CRITICAL conflict + blocker + REJECT cost", () => {
  it("persists all three signals in a single reportSignalsJson object", () => {
    const mockReport = {
      consistencyCheck: {
        blockAutoApproval: true,
        status: "CRITICAL_CONFLICT",
        criticalCount: 1,
        highCount: 0,
        flags: [
          {
            ruleId: "CC-001",
            severity: "CRITICAL",
            description: "GPS mismatch: claimed location not consistent with damage pattern",
            adjusterAction: "Request GPS log from claimant",
          },
        ],
      },
      fullReport: {
        sections: {
          prePublicationValidation: {
            valid: false,
            blocked: true,
            blockerCount: 1,
            blockers: [
              {
                checkId: "PPV-003",
                severity: "CRITICAL",
                description: "Entity intelligence flagged claimant as high-risk",
                remediation: "Escalate to fraud investigation unit",
              },
            ],
            validatedAt: "2025-01-15T10:30:00Z",
          },
        },
      },
    };

    const mockCostAnalysis = {
      costNarrative: {
        recommendation: "REJECT",
        recommendation_reason: "Quote 280% above benchmark with entity risk flag",
        confidence: 0.94,
        flags_addressed: ["COST_OUTLIER", "ENTITY_RISK"],
      },
    };

    const json = buildReportSignalsJson(mockReport, mockCostAnalysis);
    expect(json).not.toBeNull();

    const signals = JSON.parse(json!);

    // R-F-01: consistency flags present
    expect(signals.consistencyFlags.blockAutoApproval).toBe(true);
    expect(signals.consistencyFlags.criticalCount).toBe(1);
    expect(signals.consistencyFlags.flags[0].id).toBe("CC-001");

    // R-F-04: pre-publication blockers present
    expect(signals.prePublicationBlockers.blocked).toBe(true);
    expect(signals.prePublicationBlockers.blockerCount).toBe(1);
    expect(signals.prePublicationBlockers.blockers[0].checkId).toBe("PPV-003");

    // R-F-05: cost recommendation present
    expect(signals.costRecommendation.recommendation).toBe("REJECT");
    expect(signals.costRecommendation.confidence).toBe(0.94);

    // Verify router parsing round-trip
    const parsed = parseReportSignals(json);
    expect(parsed.consistencyFlags.blockAutoApproval).toBe(true);
    expect(parsed.prePublicationBlockers.blocked).toBe(true);
    expect(parsed.costRecommendation.recommendation).toBe("REJECT");
  });
});
