/**
 * phase4c-fixes.test.ts
 *
 * Phase 4C tests:
 *   - Data Responsibility Matrix (DRM) builder
 *   - Decision Transparency Layer (DTL) builder
 */

import { describe, it, expect } from "vitest";
import {
  buildDataResponsibilityMatrix,
} from "./pipeline-v2/dataResponsibilityMatrix";
import {
  buildDecisionTransparencyLayer,
} from "./pipeline-v2/decisionTransparencyLayer";
import type { IFEReport } from "./pipeline-v2/inputFidelityEngine";
import type { DOEResult } from "./pipeline-v2/decisionOptimisationEngine";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeIFEReport(overrides: Partial<IFEReport> = {}): IFEReport {
  return {
    totalFieldsAssessed: 10,
    gapCount: 3,
    completenessScore: 70,
    attributionBreakdown: {
      CLAIMANT_DEFICIENCY: 1,
      INSURER_DATA_GAP: 1,
      SYSTEM_EXTRACTION_FAILURE: 1,
      DOCUMENT_LIMITATION: 0,
    },
    attributedGaps: [
      {
        field: "incidentDescription",
        attribution: "CLAIMANT_DEFICIENCY",
        reason: "Not provided by claimant",
        attributionConfidence: 0.9,
        affectsFCDI: true,
        fcdiAdjustmentFactor: 1.0,
        detectedAtStage: "Stage2",
      },
      {
        field: "policyNumber",
        attribution: "INSURER_DATA_GAP",
        reason: "Not in policy record",
        attributionConfidence: 0.85,
        affectsFCDI: true,
        fcdiAdjustmentFactor: 0.0,
        detectedAtStage: "Stage2",
      },
      {
        field: "vehicleRegistration",
        attribution: "SYSTEM_EXTRACTION_FAILURE",
        reason: "OCR confidence below threshold",
        attributionConfidence: 0.7,
        affectsFCDI: true,
        fcdiAdjustmentFactor: 0.5,
        detectedAtStage: "Stage2",
      },
    ],
    imageAssessments: [],
    fcdiSystemFailurePenaltyReduction: 5,
    doeEligible: true,
    doeIneligibilityReason: null,
    narrative: "3 gaps identified.",
    computedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeDOEResult(overrides: Partial<DOEResult> = {}): DOEResult {
  return {
    status: "OPTIMISED",
    selectedPanelBeater: "ABC Panelbeaters",
    selectedCost: 3200,
    currency: "USD",
    benchmarkDeviationPct: -8.5,
    decisionConfidence: "high",
    fcdiScoreAtExecution: 82,
    scoreBreakdown: [
      {
        panelBeater: "ABC Panelbeaters",
        totalScore: 88,
        costScore: 90,
        qualityScore: 85,
        turnaroundScore: 88,
        reliabilityScore: 90,
        fraudRiskScore: 88,
        disqualified: false,
        disqualificationReason: null,
      },
      {
        panelBeater: "XYZ Repairs",
        totalScore: 62,
        costScore: 55,
        qualityScore: 70,
        turnaroundScore: 60,
        reliabilityScore: 65,
        fraudRiskScore: 58,
        disqualified: false,
        disqualificationReason: null,
      },
    ],
    disqualifications: [],
    rationale: "ABC Panelbeaters selected as optimal repairer.",
    ...overrides,
  };
}

// ─── DRM Tests ───────────────────────────────────────────────────────────────

describe("Phase 4C: Data Responsibility Matrix", () => {
  it("returns zero-gap matrix when IFE report is null", () => {
    const drm = buildDataResponsibilityMatrix(null);
    expect(drm.totalGaps).toBe(0);
    expect(drm.entries).toHaveLength(0);
    expect(drm.hasInsurerGaps).toBe(false);
    expect(drm.hasSystemFailures).toBe(false);
    expect(drm.narrative).toContain("No data gaps");
  });

  it("returns zero-gap matrix when IFE report has no gaps", () => {
    const ife = makeIFEReport({ gapCount: 0, attributedGaps: [] });
    const drm = buildDataResponsibilityMatrix(ife);
    expect(drm.totalGaps).toBe(0);
    expect(drm.entries).toHaveLength(0);
  });

  it("correctly counts gaps by attribution class", () => {
    const ife = makeIFEReport();
    const drm = buildDataResponsibilityMatrix(ife);
    expect(drm.totalGaps).toBe(3);
    expect(drm.byAttribution.CLAIMANT_DEFICIENCY).toBe(1);
    expect(drm.byAttribution.INSURER_DATA_GAP).toBe(1);
    expect(drm.byAttribution.SYSTEM_EXTRACTION_FAILURE).toBe(1);
    expect(drm.byAttribution.DOCUMENT_LIMITATION).toBe(0);
  });

  it("sets hasInsurerGaps when INSURER_DATA_GAP entries exist", () => {
    const ife = makeIFEReport();
    const drm = buildDataResponsibilityMatrix(ife);
    expect(drm.hasInsurerGaps).toBe(true);
  });

  it("sets hasSystemFailures when SYSTEM_EXTRACTION_FAILURE entries exist", () => {
    const ife = makeIFEReport();
    const drm = buildDataResponsibilityMatrix(ife);
    expect(drm.hasSystemFailures).toBe(true);
  });

  it("marks DOE-blocking fields correctly", () => {
    const ife = makeIFEReport();
    const drm = buildDataResponsibilityMatrix(ife);
    // policyNumber is in DOE_BLOCKING_FIELDS
    const policyEntry = drm.entries.find(e => e.field === "policyNumber");
    expect(policyEntry).toBeDefined();
    expect(policyEntry!.blocksDOE).toBe(true);
    // incidentDescription is NOT in DOE_BLOCKING_FIELDS
    const descEntry = drm.entries.find(e => e.field === "incidentDescription");
    expect(descEntry).toBeDefined();
    expect(descEntry!.blocksDOE).toBe(false);
  });

  it("includes explanation and remediation for each entry", () => {
    const ife = makeIFEReport();
    const drm = buildDataResponsibilityMatrix(ife);
    for (const entry of drm.entries) {
      expect(entry.explanation).toBeTruthy();
      expect(entry.remediation).toBeTruthy();
    }
  });

  it("narrative mentions insurer gap warning when INSURER_DATA_GAP exists", () => {
    const ife = makeIFEReport();
    const drm = buildDataResponsibilityMatrix(ife);
    expect(drm.narrative).toContain("insurer");
  });

  it("narrative mentions system failure warning when SYSTEM_EXTRACTION_FAILURE exists", () => {
    const ife = makeIFEReport();
    const drm = buildDataResponsibilityMatrix(ife);
    expect(drm.narrative).toContain("KINGA");
  });

  it("includes generatedAt timestamp", () => {
    const ife = makeIFEReport();
    const drm = buildDataResponsibilityMatrix(ife);
    expect(drm.generatedAt).toBeTruthy();
    expect(new Date(drm.generatedAt).getTime()).toBeGreaterThan(0);
  });
});

// ─── DTL Tests ───────────────────────────────────────────────────────────────

describe("Phase 4C: Decision Transparency Layer", () => {
  it("returns NOT_RUN DTL when DOE result is null", () => {
    const dtl = buildDecisionTransparencyLayer(null);
    expect(dtl.doeStatus).toBe("NOT_RUN");
    expect(dtl.decisionMode).toBe("MANUAL_REVIEW_REQUIRED");
    expect(dtl.selectedPanelBeater).toBeNull();
    expect(dtl.narrative).toContain("not executed");
  });

  it("returns AUTOMATED mode for OPTIMISED DOE status", () => {
    const doe = makeDOEResult({ status: "OPTIMISED" });
    const dtl = buildDecisionTransparencyLayer(doe);
    expect(dtl.decisionMode).toBe("AUTOMATED");
    expect(dtl.doeStatus).toBe("OPTIMISED");
  });

  it("returns MANUAL_REVIEW_REQUIRED for non-OPTIMISED DOE status", () => {
    const doe = makeDOEResult({ status: "GATED_LOW_FCDI" });
    const dtl = buildDecisionTransparencyLayer(doe);
    expect(dtl.decisionMode).toBe("MANUAL_REVIEW_REQUIRED");
  });

  it("surfaces selected panel beater and confidence", () => {
    const doe = makeDOEResult();
    const dtl = buildDecisionTransparencyLayer(doe);
    expect(dtl.selectedPanelBeater).toBe("ABC Panelbeaters");
    expect(dtl.decisionConfidence).toBe("high");
  });

  it("surfaces FCDI score at time of decision", () => {
    const doe = makeDOEResult({ fcdiScoreAtExecution: 82 });
    const dtl = buildDecisionTransparencyLayer(doe);
    expect(dtl.fcdiScoreAtDecision).toBe(82);
  });

  it("builds per-candidate summaries from scoreBreakdown", () => {
    const doe = makeDOEResult();
    const dtl = buildDecisionTransparencyLayer(doe);
    expect(dtl.candidates).toHaveLength(2);
    const selected = dtl.candidates.find(c => c.selected);
    expect(selected).toBeDefined();
    expect(selected!.panelBeater).toBe("ABC Panelbeaters");
  });

  it("marks disqualified candidates correctly", () => {
    const doe = makeDOEResult({
      status: "ALL_DISQUALIFIED",
      selectedPanelBeater: null,
      disqualifications: [
        { panelBeater: "ABC Panelbeaters", reason: "FRAUD_RISK_HIGH", severity: "hard", auditEntry: "Fraud risk score exceeds threshold" },
      ],
      scoreBreakdown: [
        {
          panelBeater: "ABC Panelbeaters",
          totalScore: 20,
          costScore: 20,
          qualityScore: 20,
          turnaroundScore: 20,
          reliabilityScore: 20,
          fraudRiskScore: 10,
          disqualified: true,
          disqualificationReason: "FRAUD_RISK_HIGH",
        },
      ],
    });
    const dtl = buildDecisionTransparencyLayer(doe);
    expect(dtl.disqualifications).toHaveLength(1);
    const disqCandidate = dtl.candidates.find(c => c.disqualified);
    expect(disqCandidate).toBeDefined();
    expect(disqCandidate!.disqualificationReason).toBeTruthy();
  });

  it("narrative mentions selected repairer for OPTIMISED status", () => {
    const doe = makeDOEResult();
    const dtl = buildDecisionTransparencyLayer(doe);
    expect(dtl.narrative).toContain("ABC Panelbeaters");
  });

  it("narrative mentions manual review for gated status", () => {
    const doe = makeDOEResult({ status: "GATED_LOW_FCDI", selectedPanelBeater: null });
    const dtl = buildDecisionTransparencyLayer(doe);
    expect(dtl.narrative).toContain("Manual assessor review");
  });

  it("narrative includes FCDI score", () => {
    const doe = makeDOEResult({ fcdiScoreAtExecution: 77 });
    const dtl = buildDecisionTransparencyLayer(doe);
    expect(dtl.narrative).toContain("77");
  });

  it("includes generatedAt timestamp", () => {
    const doe = makeDOEResult();
    const dtl = buildDecisionTransparencyLayer(doe);
    expect(dtl.generatedAt).toBeTruthy();
    expect(new Date(dtl.generatedAt).getTime()).toBeGreaterThan(0);
  });
});
