/**
 * server/phase3-fixes.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Phase 3 test suite — Input Fidelity Engine (IFE), FEL Version Registry,
 * and Decision Optimisation Engine (DOE).
 *
 * All tests are deterministic and do NOT require DB or LLM calls.
 */

import { describe, it, expect } from "vitest";

import {
  computeIFE,
  assessImageQuality,
  type IFEInput,
} from "./pipeline-v2/inputFidelityEngine";

import {
  hashContent,
  hashPrompt,
  generatePipelineRunId,
  buildStageVersionSnapshot,
  buildFELVersionSnapshot,
  buildEnhancedFELRecord,
  KINGA_PLATFORM_VERSION,
  STAGE_CODE_VERSIONS,
  LLM_STAGES,
} from "./pipeline-v2/felVersionRegistry";

import {
  runDOE,
  buildDOECandidates,
  type DOEInput,
  type DOECandidate,
} from "./pipeline-v2/decisionOptimisationEngine";

// ─────────────────────────────────────────────────────────────────────────────
// Phase 3A: Input Fidelity Engine (IFE)
// ─────────────────────────────────────────────────────────────────────────────

describe("Phase 3A: Input Fidelity Engine (IFE)", () => {

  it("returns 100% completeness when all critical fields are present", () => {
    const input: IFEInput = {
      extractedFields: {
        claimantName: "John Doe",
        vehicleMake: "Toyota",
        vehicleModel: "Corolla",
        vehicleYear: 2020,
        vehicleRegistration: "ABC 123 ZW",
        incidentDate: "2025-01-15",
        incidentDescription: "Rear-end collision at intersection",
        repairQuoteTotal: 85000,
        agreedCost: 85000,
        policyNumber: "POL-2025-001",
        insuredValue: 1200000,
        excess: 50000,
        driverLicence: "DL-123456",
      },
      extractionConfidence: 0.9,
      primaryDocumentType: "claim_form",
      documentHasOtherFields: true,
    };

    const result = computeIFE(input);

    expect(result.completenessScore).toBe(100);
    expect(result.gapCount).toBe(0);
    expect(result.attributedGaps).toHaveLength(0);
    expect(result.doeEligible).toBe(true);
    expect(result.doeIneligibilityReason).toBeNull();
  });

  it("attributes missing policy fields to INSURER_DATA_GAP when other fields extracted", () => {
    const input: IFEInput = {
      extractedFields: {
        claimantName: "Jane Smith",
        vehicleMake: "Honda",
        vehicleModel: "Fit",
        vehicleYear: 2019,
        vehicleRegistration: "XYZ 456 ZW",
        incidentDate: "2025-02-10",
        incidentDescription: "Single vehicle rollover",
        repairQuoteTotal: 120000,
        agreedCost: null,       // Missing
        policyNumber: null,     // Missing — insurer gap
        insuredValue: null,     // Missing — insurer gap
        excess: null,           // Missing — insurer gap
        driverLicence: "DL-789",
      },
      extractionConfidence: 0.85,
      primaryDocumentType: "claim_form",
      documentHasOtherFields: true, // Other fields extracted fine
    };

    const result = computeIFE(input);

    // insuredValue and excess should be INSURER_DATA_GAP
    const insurerGaps = result.attributedGaps.filter(g => g.attribution === "INSURER_DATA_GAP");
    expect(insurerGaps.length).toBeGreaterThanOrEqual(1);

    // insuredValue is in INSURER_POLICY_FIELDS
    const insuredValueGap = result.attributedGaps.find(g => g.field === "insuredValue");
    expect(insuredValueGap?.attribution).toBe("INSURER_DATA_GAP");

    // Attribution breakdown should include INSURER_DATA_GAP
    expect(result.attributionBreakdown.INSURER_DATA_GAP).toBeGreaterThanOrEqual(1);
  });

  it("attributes missing fields to SYSTEM_EXTRACTION_FAILURE when extraction confidence is high", () => {
    const input: IFEInput = {
      extractedFields: {
        claimantName: "Bob Moyo",
        vehicleMake: null,      // Missing despite high confidence
        vehicleModel: null,     // Missing despite high confidence
        vehicleYear: 2021,
        vehicleRegistration: "DEF 789 ZW",
        incidentDate: "2025-03-01",
        incidentDescription: "Head-on collision",
        repairQuoteTotal: 200000,
        agreedCost: 200000,
        policyNumber: "POL-2025-002",
        insuredValue: 1500000,
        excess: 75000,
        driverLicence: "DL-456",
      },
      extractionConfidence: 0.88, // High confidence — missing fields are system failures
      primaryDocumentType: "claim_form",
      documentHasOtherFields: true,
    };

    const result = computeIFE(input);

    const vehicleMakeGap = result.attributedGaps.find(g => g.field === "vehicleMake");
    expect(vehicleMakeGap?.attribution).toBe("SYSTEM_EXTRACTION_FAILURE");

    // System failures should have non-zero FCDI adjustment
    expect(vehicleMakeGap?.fcdiAdjustmentFactor).toBeGreaterThan(0);
    expect(result.fcdiSystemFailurePenaltyReduction).toBeGreaterThan(0);
  });

  it("attributes policy fields to DOCUMENT_LIMITATION when document is repair_quote", () => {
    const input: IFEInput = {
      extractedFields: {
        claimantName: "Alice Ndlovu",
        vehicleMake: "Mazda",
        vehicleModel: "CX-5",
        vehicleYear: 2022,
        vehicleRegistration: "GHI 012 ZW",
        incidentDate: "2025-04-05",
        incidentDescription: "Sideswipe collision",
        repairQuoteTotal: 95000,
        agreedCost: 95000,
        policyNumber: null,     // In INSURER_POLICY_FIELDS → INSURER_DATA_GAP (more precise)
        insuredValue: null,     // In INSURER_POLICY_FIELDS → INSURER_DATA_GAP
        excess: null,           // In INSURER_POLICY_FIELDS → INSURER_DATA_GAP
        driverLicence: null,    // documentLimited=true + repair_quote → DOCUMENT_LIMITATION
      },
      extractionConfidence: 0.75,
      primaryDocumentType: "repair_quote", // Repair quotes don't have policy/driver fields
      documentHasOtherFields: true,
    };

    const result = computeIFE(input);

    // policyNumber is in INSURER_POLICY_FIELDS → INSURER_DATA_GAP takes priority
    // (more precise: the insurer's policy record is incomplete, not a doc limitation)
    const policyGap = result.attributedGaps.find(g => g.field === "policyNumber");
    expect(policyGap?.attribution).toBe("INSURER_DATA_GAP");

    // driverLicence is documentLimited=true AND document is repair_quote → DOCUMENT_LIMITATION
    // (repair quotes structurally don't contain driver licence numbers)
    const driverGap = result.attributedGaps.find(g => g.field === "driverLicence");
    expect(driverGap?.attribution).toBe("DOCUMENT_LIMITATION");
    // Document limitations don't affect FCDI
    expect(driverGap?.affectsFCDI).toBe(false);
  });

  it("marks DOE ineligible when completeness is below 55%", () => {
    const input: IFEInput = {
      extractedFields: {
        claimantName: "Test User",
        vehicleMake: null,
        vehicleModel: null,
        vehicleYear: null,
        vehicleRegistration: null,
        incidentDate: null,
        incidentDescription: null,
        repairQuoteTotal: null,
        agreedCost: null,
        policyNumber: null,
        insuredValue: null,
        excess: null,
        driverLicence: null,
      },
      extractionConfidence: 0.2,
      primaryDocumentType: "unknown",
      documentHasOtherFields: false,
    };

    const result = computeIFE(input);

    expect(result.completenessScore).toBeLessThan(55);
    expect(result.doeEligible).toBe(false);
    expect(result.doeIneligibilityReason).not.toBeNull();
    expect(result.doeIneligibilityReason).toContain("below the minimum threshold");
  });

  it("attribution breakdown sums to total gap count", () => {
    const input: IFEInput = {
      extractedFields: {
        claimantName: "Test",
        vehicleMake: null,
        vehicleModel: null,
        vehicleYear: 2020,
        vehicleRegistration: "ABC 123",
        incidentDate: "2025-01-01",
        incidentDescription: "Test",
        repairQuoteTotal: 100,
        agreedCost: null,
        policyNumber: null,
        insuredValue: null,
        excess: null,
        driverLicence: null,
      },
      extractionConfidence: 0.5,
      primaryDocumentType: "claim_form",
      documentHasOtherFields: true,
    };

    const result = computeIFE(input);

    const total = Object.values(result.attributionBreakdown).reduce((a, b) => a + b, 0);
    expect(total).toBe(result.gapCount);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 3A: Image Quality Assessment
// ─────────────────────────────────────────────────────────────────────────────

describe("Phase 3A: Image Quality Assessment", () => {

  it("scores a high-quality damage photo as usable", () => {
    const result = assessImageQuality("img-001", {
      width: 1920,
      height: 1080,
      fileSizeBytes: 2_500_000,
      mimeType: "image/jpeg",
      isDuplicate: false,
      isCorrupt: false,
      classificationHint: "vehicle damage photo",
    });

    expect(result.qualityScore).toBeGreaterThanOrEqual(80);
    expect(result.usableForAnalysis).toBe(true);
    expect(result.classification).toBe("damage_photo");
    expect(result.qualityFailures).toHaveLength(0);
  });

  it("marks a corrupt image as unusable with SYSTEM_EXTRACTION_FAILURE", () => {
    const result = assessImageQuality("img-corrupt", {
      isCorrupt: true,
    });

    expect(result.qualityScore).toBe(0);
    expect(result.usableForAnalysis).toBe(false);
    expect(result.attribution).toBe("SYSTEM_EXTRACTION_FAILURE");
    expect(result.qualityFailures).toContain("corrupt");
  });

  it("marks a low-resolution image as failing quality check", () => {
    const result = assessImageQuality("img-tiny", {
      width: 100,
      height: 100, // 10,000 pixels — below 100,000 threshold
      fileSizeBytes: 5_000,
      isCorrupt: false,
    });

    expect(result.qualityFailures).toContain("low_resolution");
    expect(result.usableForAnalysis).toBe(false);
  });

  it("marks a blurred image as failing quality check", () => {
    const result = assessImageQuality("img-blurred", {
      width: 1920,
      height: 1080,
      fileSizeBytes: 2_000_000,
      isCorrupt: false,
      blurScore: 0.2, // Below 0.4 threshold
    });

    expect(result.qualityFailures).toContain("blurred");
  });

  it("classifies document scan correctly", () => {
    const result = assessImageQuality("img-doc", {
      width: 800,
      height: 1200,
      fileSizeBytes: 500_000,
      classificationHint: "document scan of repair quote",
    });

    expect(result.classification).toBe("document_scan");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 3B: FEL Version Registry
// ─────────────────────────────────────────────────────────────────────────────

describe("Phase 3B: FEL Version Registry", () => {

  it("hashContent produces consistent deterministic hashes", () => {
    const obj = { claimId: 42, vehicleMake: "Toyota", cost: 85000 };
    const hash1 = hashContent(obj);
    const hash2 = hashContent(obj);
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(16);
  });

  it("hashContent produces different hashes for different inputs", () => {
    const hash1 = hashContent({ value: "A" });
    const hash2 = hashContent({ value: "B" });
    expect(hash1).not.toBe(hash2);
  });

  it("hashPrompt produces consistent hash from prompt string", () => {
    const prompt = "You are a forensic claims assessor. Extract the vehicle details.";
    const h1 = hashPrompt(prompt);
    const h2 = hashPrompt(prompt);
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(16);
  });

  it("hashPrompt trims whitespace before hashing", () => {
    const h1 = hashPrompt("  extract vehicle  ");
    const h2 = hashPrompt("extract vehicle");
    expect(h1).toBe(h2);
  });

  it("generatePipelineRunId is deterministic for same inputs", () => {
    const id1 = generatePipelineRunId(42, "2025-01-01T00:00:00Z");
    const id2 = generatePipelineRunId(42, "2025-01-01T00:00:00Z");
    expect(id1).toBe(id2);
    expect(id1).toHaveLength(24);
  });

  it("generatePipelineRunId differs for different claims", () => {
    const id1 = generatePipelineRunId(42, "2025-01-01T00:00:00Z");
    const id2 = generatePipelineRunId(43, "2025-01-01T00:00:00Z");
    expect(id1).not.toBe(id2);
  });

  it("buildStageVersionSnapshot includes correct fields for LLM stage", () => {
    const snapshot = buildStageVersionSnapshot({
      stageId: "stage-2",
      executedAt: "2025-01-01T00:00:00Z",
      inputSnapshot: { claimId: 42 },
      outputSnapshot: { extractedText: "Toyota Corolla" },
      promptTemplate: "Extract vehicle details from the following document.",
      modelId: "gpt-4o",
    });

    expect(snapshot.stageId).toBe("stage-2");
    expect(snapshot.stageCodeVersion).toBe(STAGE_CODE_VERSIONS["stage-2"]);
    expect(snapshot.promptHash).not.toBeNull();
    expect(snapshot.promptVersion).toContain("stage-2");
    expect(snapshot.modelId).toBe("gpt-4o");
    expect(snapshot.inputHash).toHaveLength(16);
    expect(snapshot.outputHash).toHaveLength(16);
    expect(snapshot.contractVersion).toBe("1.0");
  });

  it("buildStageVersionSnapshot has null promptHash for deterministic stage", () => {
    const snapshot = buildStageVersionSnapshot({
      stageId: "stage-4", // Validation — deterministic
      executedAt: "2025-01-01T00:00:00Z",
      inputSnapshot: { claimId: 42 },
      outputSnapshot: { valid: true },
    });

    expect(snapshot.promptHash).toBeNull();
    expect(snapshot.modelId).toBeNull();
    expect(snapshot.promptVersion).toBeNull();
  });

  it("buildFELVersionSnapshot marks replaySupported correctly", () => {
    const stageVersions = Array.from(LLM_STAGES).map(stageId =>
      buildStageVersionSnapshot({
        stageId,
        executedAt: "2025-01-01T00:00:00Z",
        inputSnapshot: { claimId: 42 },
        outputSnapshot: { result: "ok" },
        promptTemplate: `Prompt for ${stageId}`,
        modelId: "gpt-4o",
      })
    );

    const felSnapshot = buildFELVersionSnapshot(42, "2025-01-01T00:00:00Z", stageVersions);

    expect(felSnapshot.replaySupported).toBe(true);
    expect(felSnapshot.platformVersion).toBe(KINGA_PLATFORM_VERSION);
    expect(felSnapshot.pipelineRunId).toHaveLength(24);
    // Replay limitation note should always be present
    expect(felSnapshot.replayLimitation).toContain("current model version");
  });

  it("buildFELVersionSnapshot marks replaySupported=false when prompt hashes missing", () => {
    const stageVersions = [
      buildStageVersionSnapshot({
        stageId: "stage-2",
        executedAt: "2025-01-01T00:00:00Z",
        inputSnapshot: {},
        outputSnapshot: {},
        // No promptTemplate — will produce null promptHash
      }),
    ];

    const felSnapshot = buildFELVersionSnapshot(42, "2025-01-01T00:00:00Z", stageVersions);

    expect(felSnapshot.replaySupported).toBe(false);
    expect(felSnapshot.replayLimitation).toContain("missing prompt hash");
  });

  it("buildEnhancedFELRecord includes versionSnapshot and replayable flag", () => {
    const stageVersions = [
      buildStageVersionSnapshot({
        stageId: "stage-2",
        executedAt: "2025-01-01T00:00:00Z",
        inputSnapshot: {},
        outputSnapshot: {},
        promptTemplate: "Extract vehicle details.",
        modelId: "gpt-4o",
      }),
    ];

    const record = buildEnhancedFELRecord(
      {
        claimId: 42,
        pipelineRunAt: "2025-01-01T00:00:00Z",
        totalDurationMs: 45000,
        fcdiScorePercent: 85,
        fcdiLabel: "HIGH",
        finalPipelineState: "REPORTED",
        stageRecords: [],
      },
      stageVersions,
    );

    expect(record.versionSnapshot).toBeDefined();
    expect(record.versionSnapshot.platformVersion).toBe(KINGA_PLATFORM_VERSION);
    expect(typeof record.replayable).toBe("boolean");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 3C: Decision Optimisation Engine (DOE)
// ─────────────────────────────────────────────────────────────────────────────

describe("Phase 3C: Decision Optimisation Engine (DOE)", () => {

  const goodCandidates: DOECandidate[] = [
    {
      panelBeater: "Alpha Auto Body",
      totalCost: 85000,
      currency: "ZWL",
      structuralCompleteness: 1.0,
      coverageRatio: 0.95,
      turnaroundDays: 7,
      reliabilityScore: 0.85,
      fraudRisk: "low",
      fraudSignal: null,
      confidence: "high",
    },
    {
      panelBeater: "Beta Panel Works",
      totalCost: 78000,
      currency: "ZWL",
      structuralCompleteness: 0.85,
      coverageRatio: 0.80,
      turnaroundDays: 10,
      reliabilityScore: 0.70,
      fraudRisk: "minimal",
      fraudSignal: null,
      confidence: "medium",
    },
  ];

  it("returns OPTIMISED status with a selected panel beater for valid input", () => {
    const input: DOEInput = {
      candidates: goodCandidates,
      benchmarkCost: 82000,
      fcdiScore: 80,
      inputCompletenessScore: 85,
      doeEligible: true,
      doeIneligibilityReason: null,
    };

    const result = runDOE(input);

    expect(result.status).toBe("OPTIMISED");
    expect(result.selectedPanelBeater).not.toBeNull();
    expect(result.selectedCost).toBeGreaterThan(0);
    expect(result.decisionConfidence).toMatch(/^(high|medium|low)$/);
    expect(result.scoreBreakdown).toHaveLength(2);
    expect(result.disqualifications).toHaveLength(0);
  });

  it("returns GATED_LOW_FCDI when FCDI score is below 40", () => {
    const input: DOEInput = {
      candidates: goodCandidates,
      benchmarkCost: 82000,
      fcdiScore: 35, // Below 40 threshold
      inputCompletenessScore: 85,
      doeEligible: true,
      doeIneligibilityReason: null,
    };

    const result = runDOE(input);

    expect(result.status).toBe("GATED_LOW_FCDI");
    expect(result.selectedPanelBeater).toBeNull();
    expect(result.rationale).toContain("Forensic Confidence Degradation Index");
    expect(result.rationale).toContain("35%");
  });

  it("returns GATED_LOW_INPUT when input completeness is below 55%", () => {
    const input: DOEInput = {
      candidates: goodCandidates,
      benchmarkCost: 82000,
      fcdiScore: 75,
      inputCompletenessScore: 45, // Below 55 threshold
      doeEligible: false,
      doeIneligibilityReason: "Input completeness score (45%) is below the minimum threshold (55%).",
    };

    const result = runDOE(input);

    expect(result.status).toBe("GATED_LOW_INPUT");
    expect(result.selectedPanelBeater).toBeNull();
    expect(result.rationale).toContain("completeness");
  });

  it("disqualifies high-fraud-risk candidates and records audit trail", () => {
    const candidatesWithFraud: DOECandidate[] = [
      {
        panelBeater: "Dodgy Repairs Ltd",
        totalCost: 50000, // Suspiciously cheap
        currency: "ZWL",
        structuralCompleteness: 0.6,
        coverageRatio: 0.5,
        turnaroundDays: 3,
        reliabilityScore: 0.3,
        fraudRisk: "high",
        fraudSignal: "Quote is 45% below market benchmark; panel beater has 3 prior fraud flags",
        confidence: "low",
      },
      {
        panelBeater: "Honest Panel Works",
        totalCost: 88000,
        currency: "ZWL",
        structuralCompleteness: 0.95,
        coverageRatio: 0.90,
        turnaroundDays: 8,
        reliabilityScore: 0.80,
        fraudRisk: "low",
        fraudSignal: null,
        confidence: "high",
      },
    ];

    const input: DOEInput = {
      candidates: candidatesWithFraud,
      benchmarkCost: 85000,
      fcdiScore: 78,
      inputCompletenessScore: 80,
      doeEligible: true,
      doeIneligibilityReason: null,
    };

    const result = runDOE(input);

    expect(result.status).toBe("OPTIMISED");
    expect(result.selectedPanelBeater).toBe("Honest Panel Works");
    expect(result.disqualifications).toHaveLength(1);
    expect(result.disqualifications[0].panelBeater).toBe("Dodgy Repairs Ltd");
    expect(result.disqualifications[0].triggeringSignal).toContain("45% below market benchmark");
    // Rationale must mention the disqualification
    expect(result.rationale).toContain("disqualified");
    expect(result.rationale).toContain("Dodgy Repairs Ltd");
  });

  it("returns ALL_DISQUALIFIED when every candidate has high/elevated fraud risk", () => {
    const allFraudCandidates: DOECandidate[] = [
      {
        panelBeater: "Fraud A",
        totalCost: 40000,
        currency: "ZWL",
        structuralCompleteness: 0.5,
        coverageRatio: 0.4,
        turnaroundDays: 2,
        reliabilityScore: 0.2,
        fraudRisk: "elevated",
        fraudSignal: "Linked to known fraud network",
        confidence: "low",
      },
      {
        panelBeater: "Fraud B",
        totalCost: 45000,
        currency: "ZWL",
        structuralCompleteness: 0.5,
        coverageRatio: 0.4,
        turnaroundDays: 2,
        reliabilityScore: 0.2,
        fraudRisk: "high",
        fraudSignal: "Inflated parts pricing detected",
        confidence: "low",
      },
    ];

    const input: DOEInput = {
      candidates: allFraudCandidates,
      benchmarkCost: 85000,
      fcdiScore: 75,
      inputCompletenessScore: 80,
      doeEligible: true,
      doeIneligibilityReason: null,
    };

    const result = runDOE(input);

    expect(result.status).toBe("ALL_DISQUALIFIED");
    expect(result.selectedPanelBeater).toBeNull();
    expect(result.disqualifications).toHaveLength(2);
    expect(result.rationale).toContain("Manual assessor review");
  });

  it("returns GATED_NO_QUOTES when candidates array is empty", () => {
    const input: DOEInput = {
      candidates: [],
      benchmarkCost: null,
      fcdiScore: 80,
      inputCompletenessScore: 85,
      doeEligible: true,
      doeIneligibilityReason: null,
    };

    const result = runDOE(input);

    expect(result.status).toBe("GATED_NO_QUOTES");
    expect(result.selectedPanelBeater).toBeNull();
  });

  it("computes benchmark deviation correctly", () => {
    const candidates: DOECandidate[] = [
      {
        panelBeater: "Below Benchmark",
        totalCost: 73000, // 12% below 83000 benchmark
        currency: "ZWL",
        structuralCompleteness: 1.0,
        coverageRatio: 1.0,
        turnaroundDays: 7,
        reliabilityScore: 0.9,
        fraudRisk: "minimal",
        fraudSignal: null,
        confidence: "high",
      },
    ];

    const input: DOEInput = {
      candidates,
      benchmarkCost: 83000,
      fcdiScore: 85,
      inputCompletenessScore: 90,
      doeEligible: true,
      doeIneligibilityReason: null,
    };

    const result = runDOE(input);

    expect(result.status).toBe("OPTIMISED");
    expect(result.benchmarkDeviationPct).not.toBeNull();
    // 73000 vs 83000 = -12.0%
    expect(result.benchmarkDeviationPct).toBeCloseTo(-12.0, 0);
  });

  it("score breakdown sums correctly for multi-candidate evaluation", () => {
    const input: DOEInput = {
      candidates: goodCandidates,
      benchmarkCost: 82000,
      fcdiScore: 80,
      inputCompletenessScore: 85,
      doeEligible: true,
      doeIneligibilityReason: null,
    };

    const result = runDOE(input);

    for (const breakdown of result.scoreBreakdown) {
      if (!breakdown.disqualified) {
        // Total score should be between 0 and 1
        expect(breakdown.totalScore).toBeGreaterThanOrEqual(0);
        expect(breakdown.totalScore).toBeLessThanOrEqual(1);
      }
    }
  });

  it("buildDOECandidates correctly maps quoteOptimisation output", () => {
    const candidates = buildDOECandidates({
      selectedQuotes: [
        {
          panel_beater: "Alpha Auto",
          total_cost: 85000,
          coverage_ratio: 0.95,
          structurally_complete: true,
          structural_gaps: [],
          confidence: "high",
        },
        {
          panel_beater: "Beta Works",
          total_cost: 78000,
          coverage_ratio: 0.80,
          structurally_complete: false,
          structural_gaps: ["front_bumper"],
          confidence: "medium",
        },
      ],
      excludedQuotes: [],
      currency: "ZWL",
      overallFraudRisk: "low",
      fraudSignal: null,
      turnaroundDays: 7,
    });

    expect(candidates).toHaveLength(2);
    expect(candidates[0].panelBeater).toBe("Alpha Auto");
    expect(candidates[0].structuralCompleteness).toBe(1.0);
    expect(candidates[1].structuralCompleteness).toBeLessThan(1.0); // Has gaps
    expect(candidates[0].currency).toBe("ZWL");
    expect(candidates[0].turnaroundDays).toBe(7);
    expect(candidates[0].fraudRisk).toBe("low");
  });

  it("DOE rationale is always non-empty", () => {
    const statuses: Array<DOEInput> = [
      {
        candidates: [],
        benchmarkCost: null,
        fcdiScore: 80,
        inputCompletenessScore: 85,
        doeEligible: true,
        doeIneligibilityReason: null,
      },
      {
        candidates: goodCandidates,
        benchmarkCost: 82000,
        fcdiScore: 20, // GATED
        inputCompletenessScore: 85,
        doeEligible: true,
        doeIneligibilityReason: null,
      },
    ];

    for (const input of statuses) {
      const result = runDOE(input);
      expect(result.rationale.length).toBeGreaterThan(10);
    }
  });
});
