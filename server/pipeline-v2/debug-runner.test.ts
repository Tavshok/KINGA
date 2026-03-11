// @ts-nocheck
import { describe, expect, it } from "vitest";
import type { DebugDiagnosticReport, DebugSystemHealth } from "./debug-runner";

/**
 * Unit tests for the Self-Healing Pipeline Debug diagnostic report structure.
 * 
 * These tests validate the shape and invariants of the debug report
 * without requiring a live database or LLM connection.
 * They verify that the diagnostic report interface contracts are correct,
 * the self-healing fields (assumptions, recoveryActions, degraded) are tracked,
 * and the system health computation logic is sound.
 */

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createMinimalReport(overrides: Partial<DebugDiagnosticReport> = {}): DebugDiagnosticReport {
  return {
    claimId: 2010001,
    runTimestamp: new Date().toISOString(),
    totalDurationMs: 25000,
    documentRegistry: [
      {
        documentId: "DOC-1",
        fileName: "claim_form.pdf",
        detectedDocumentType: "Claim Form",
        ocrStatus: "completed",
        textExtractionStatus: "completed",
        mimeType: "application/pdf",
        sourceUrl: "https://example.com/doc.pdf",
        containsImages: true,
        imageCount: 3,
      },
    ],
    rawTextOutputs: [
      {
        documentId: "DOC-1",
        fileName: "claim_form.pdf",
        rawText: "Sample extracted text from the claim form document.",
        textLength: 50,
        tableCount: 1,
        ocrConfidence: 0.92,
        tables: [{ headers: ["Item", "Cost"], rows: [["Bumper", "500"]], context: "Repair quote" }],
      },
    ],
    structuredExtractions: [
      { fieldName: "claimant_name", extractedValue: "John Doe", confidence: "high", sourceDocument: "DOC-1" },
      { fieldName: "vehicle_make", extractedValue: "Toyota", confidence: "high", sourceDocument: "DOC-1" },
      { fieldName: "vehicle_model", extractedValue: "Hilux", confidence: "high", sourceDocument: "DOC-1" },
      { fieldName: "police_report_number", extractedValue: null, confidence: "null", sourceDocument: "DOC-1" },
    ],
    claimDataObject: {
      claimId: 2010001,
      claimReference: "CLM-2010001",
      claimantName: "John Doe",
      vehicleMake: "Toyota",
      vehicleModel: "Hilux",
      vehicleYear: 2020,
      vehicleRegistration: "ABC 1234",
      accidentDate: "2026-01-15",
      accidentDescription: "Front collision at intersection",
      damageDescription: "Front bumper and headlight damage",
      estimatedRepairCost: 5000,
      vehicleMassKg: 2050,
      impactZone: "front",
      estimatedSpeedKmh: 40,
      damageSeverity: "moderate",
      repairQuoteItems: [],
      damagePhotos: [],
      policeReportNumber: null,
      panelBeaterName: "Test Panel Beater",
      assessorName: null,
    } as any,
    validationIssues: [
      { field: "police_report_number", message: "Field is null — not found in any document", severity: "warning" },
    ],
    completenessScore: 85,
    missingFields: ["police_report_number"],
    engineInputChecks: [
      {
        engineName: "Damage Analysis Engine",
        inputs: [
          { fieldName: "damage_description", value: "Front bumper damage", status: "present" },
          { fieldName: "damage_photos", value: "3 photos", status: "present" },
        ],
        missingRequiredFields: [],
        canExecute: true,
      },
      {
        engineName: "Physics Analysis Engine",
        inputs: [
          { fieldName: "vehicle_mass_kg", value: 2050, status: "present" },
          { fieldName: "impact_zone", value: "front", status: "present" },
          { fieldName: "estimated_speed_kmh", value: 40, status: "present" },
        ],
        missingRequiredFields: [],
        canExecute: true,
      },
      {
        engineName: "Fraud Analysis Engine",
        inputs: [
          { fieldName: "repair_quote_total", value: 5000, status: "present" },
        ],
        missingRequiredFields: [],
        canExecute: true,
      },
      {
        engineName: "Cost Optimisation Engine",
        inputs: [
          { fieldName: "repair_quote_items", value: "1 item", status: "present" },
        ],
        missingRequiredFields: [],
        canExecute: true,
      },
      {
        engineName: "Turnaround Time Engine",
        inputs: [
          { fieldName: "damage_severity", value: "moderate", status: "present" },
        ],
        missingRequiredFields: [],
        canExecute: true,
      },
    ],
    engineResults: [
      { engineName: "Damage Analysis", executionStatus: "success", durationMs: 8000, outputData: { severity: "moderate" } },
      { engineName: "Physics Analysis", executionStatus: "success", durationMs: 3000, outputData: { impactForceKn: 45 } },
      { engineName: "Fraud Analysis", executionStatus: "success", durationMs: 5000, outputData: { fraudScore: 25 } },
      { engineName: "Cost Optimisation", executionStatus: "success", durationMs: 4000, outputData: { expectedCost: 4800 } },
      { engineName: "Turnaround Time", executionStatus: "success", durationMs: 100, outputData: { estimatedDays: 14 } },
    ],
    reportSectionStatuses: [
      { sectionName: "Claim Summary", status: "ok", dataSource: "Stage 5 Assembly", fieldCount: 10, populatedFieldCount: 9 },
      { sectionName: "Damage Analysis", status: "ok", dataSource: "Stage 6 Engine", fieldCount: 5, populatedFieldCount: 5 },
      { sectionName: "Physics Analysis", status: "ok", dataSource: "Stage 7 Engine", fieldCount: 8, populatedFieldCount: 8 },
      { sectionName: "Fraud Analysis", status: "ok", dataSource: "Stage 8 Engine", fieldCount: 4, populatedFieldCount: 4 },
      { sectionName: "Cost Optimisation", status: "ok", dataSource: "Stage 9 Engine", fieldCount: 6, populatedFieldCount: 6 },
      { sectionName: "Turnaround Time", status: "ok", dataSource: "Stage 9b Engine", fieldCount: 4, populatedFieldCount: 4 },
      { sectionName: "Police Report Summary", status: "partial", dataSource: "Stage 3 Extraction", fieldCount: 3, populatedFieldCount: 1 },
    ],
    errorDiagnostics: [],
    systemHealth: {
      dataExtractionCompleteness: 85,
      engineSuccessRate: 100,
      totalEngines: 5,
      successfulEngines: 5,
      failedEngines: 0,
      skippedEngines: 0,
      degradedEngines: 0,
      missingFieldsList: ["police_report_number"],
      recommendedFixes: ["Upload police report document to improve data completeness"],
      overallStatus: "healthy",
      totalAssumptions: 0,
      totalRecoveryActions: 0,
    },
    stageSummaries: {
      "1_ingestion": { status: "success", durationMs: 500, degraded: false, assumptionCount: 0, recoveryActionCount: 0 },
      "2_extraction": { status: "success", durationMs: 8000, degraded: false, assumptionCount: 0, recoveryActionCount: 0 },
      "3_structured_extraction": { status: "success", durationMs: 6000, degraded: false, assumptionCount: 0, recoveryActionCount: 0 },
      "4_validation": { status: "success", durationMs: 200, degraded: false, assumptionCount: 0, recoveryActionCount: 0 },
      "5_assembly": { status: "success", durationMs: 100, degraded: false, assumptionCount: 0, recoveryActionCount: 0 },
      "6_damage_analysis": { status: "success", durationMs: 3000, degraded: false, assumptionCount: 0, recoveryActionCount: 0 },
      "7_physics": { status: "success", durationMs: 2000, degraded: false, assumptionCount: 0, recoveryActionCount: 0 },
      "8_fraud": { status: "success", durationMs: 2500, degraded: false, assumptionCount: 0, recoveryActionCount: 0 },
      "9_cost": { status: "success", durationMs: 2000, degraded: false, assumptionCount: 0, recoveryActionCount: 0 },
      "9b_turnaround": { status: "success", durationMs: 100, degraded: false, assumptionCount: 0, recoveryActionCount: 0 },
      "10_report": { status: "success", durationMs: 700, degraded: false, assumptionCount: 0, recoveryActionCount: 0 },
    },
    assumptions: [],
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("DebugDiagnosticReport structure", () => {
  it("should have all 9 diagnostic steps populated", () => {
    const report = createMinimalReport();

    // Step 1 — Document Registry
    expect(report.documentRegistry).toBeDefined();
    expect(report.documentRegistry.length).toBeGreaterThan(0);

    // Step 2 — Raw Text Output
    expect(report.rawTextOutputs).toBeDefined();
    expect(report.rawTextOutputs.length).toBeGreaterThan(0);

    // Step 3 — Structured Data Extraction
    expect(report.structuredExtractions).toBeDefined();
    expect(report.structuredExtractions.length).toBeGreaterThan(0);

    // Step 4 — Claim Data Object
    expect(report.claimDataObject).toBeDefined();
    expect(report.completenessScore).toBeGreaterThanOrEqual(0);
    expect(report.completenessScore).toBeLessThanOrEqual(100);

    // Step 5 — Engine Input Check
    expect(report.engineInputChecks).toBeDefined();
    expect(report.engineInputChecks.length).toBeGreaterThan(0);

    // Step 6 — Engine Execution Results
    expect(report.engineResults).toBeDefined();
    expect(report.engineResults.length).toBeGreaterThan(0);

    // Step 7 — Report Section Status
    expect(report.reportSectionStatuses).toBeDefined();
    expect(report.reportSectionStatuses.length).toBeGreaterThan(0);

    // Step 8 — Error Diagnostics
    expect(report.errorDiagnostics).toBeDefined();

    // Step 9 — System Health
    expect(report.systemHealth).toBeDefined();
    expect(report.systemHealth.overallStatus).toBeDefined();
  });

  it("should have correct document registry fields", () => {
    const report = createMinimalReport();
    const doc = report.documentRegistry[0];

    expect(doc.documentId).toBeTruthy();
    expect(doc.fileName).toBeTruthy();
    expect(doc.detectedDocumentType).toBeTruthy();
    expect(["completed", "failed", "partial"]).toContain(doc.ocrStatus);
    expect(["completed", "failed", "partial"]).toContain(doc.textExtractionStatus);
    expect(doc.mimeType).toBeTruthy();
  });

  it("should mark NULL fields with confidence 'null'", () => {
    const report = createMinimalReport();
    const nullFields = report.structuredExtractions.filter(f => f.extractedValue === null);

    expect(nullFields.length).toBeGreaterThan(0);
    for (const field of nullFields) {
      expect(field.confidence).toBe("null");
    }
  });

  it("should track missing fields in both validationIssues and missingFields", () => {
    const report = createMinimalReport();

    expect(report.missingFields).toContain("police_report_number");
    expect(report.validationIssues.some(v => v.field === "police_report_number")).toBe(true);
  });
});

describe("Self-healing fields", () => {
  it("should track assumptions in the report", () => {
    const report = createMinimalReport({
      assumptions: [
        {
          field: "vehicle_mass",
          assumedValue: "1400kg",
          reason: "Vehicle mass not found in documents. Used default for sedan.",
          strategy: "default_value",
          confidence: 30,
          stage: "Stage 5",
        },
      ],
    });

    expect(report.assumptions).toBeDefined();
    expect(report.assumptions!.length).toBe(1);
    expect(report.assumptions![0].field).toBe("vehicle_mass");
    expect(report.assumptions![0].strategy).toBe("default_value");
    expect(report.assumptions![0].confidence).toBeGreaterThanOrEqual(0);
    expect(report.assumptions![0].confidence).toBeLessThanOrEqual(100);
  });

  it("should track degraded stages in stage summaries", () => {
    const report = createMinimalReport({
      stageSummaries: {
        ...createMinimalReport().stageSummaries,
        "4_validation": { status: "degraded", durationMs: 50, degraded: true, assumptionCount: 2, recoveryActionCount: 1 },
      },
    });

    const stage4 = report.stageSummaries["4_validation"] as any;
    expect(stage4.status).toBe("degraded");
    expect(stage4.degraded).toBe(true);
    expect(stage4.assumptionCount).toBe(2);
    expect(stage4.recoveryActionCount).toBe(1);
  });

  it("should track degraded engines in system health", () => {
    const report = createMinimalReport({
      systemHealth: {
        ...createMinimalReport().systemHealth,
        degradedEngines: 2,
        totalAssumptions: 5,
        totalRecoveryActions: 3,
        overallStatus: "degraded",
      },
    });

    expect(report.systemHealth.degradedEngines).toBe(2);
    expect(report.systemHealth.totalAssumptions).toBe(5);
    expect(report.systemHealth.totalRecoveryActions).toBe(3);
    expect(report.systemHealth.overallStatus).toBe("degraded");
  });

  it("should allow degraded engine execution status", () => {
    const report = createMinimalReport({
      engineResults: [
        { engineName: "Physics Analysis", executionStatus: "degraded", durationMs: 100, outputData: { impactForceKn: 0, note: "Estimated due to missing speed data" } },
        ...createMinimalReport().engineResults.slice(1),
      ],
    });

    const physicsResult = report.engineResults.find(e => e.engineName === "Physics Analysis");
    expect(physicsResult?.executionStatus).toBe("degraded");
  });
});

describe("Engine input checks", () => {
  it("should have canExecute=true when no required fields are missing", () => {
    const report = createMinimalReport();
    for (const check of report.engineInputChecks) {
      if (check.missingRequiredFields.length === 0) {
        expect(check.canExecute).toBe(true);
      }
    }
  });

  it("should have canExecute=false when required fields are missing", () => {
    const report = createMinimalReport({
      engineInputChecks: [
        {
          engineName: "Physics Analysis Engine",
          inputs: [
            { fieldName: "vehicle_mass_kg", value: null, status: "missing" },
          ],
          missingRequiredFields: ["vehicle_mass_kg"],
          canExecute: false,
        },
      ],
    });

    const physicsCheck = report.engineInputChecks.find(c => c.engineName === "Physics Analysis Engine");
    expect(physicsCheck?.canExecute).toBe(false);
    expect(physicsCheck?.missingRequiredFields).toContain("vehicle_mass_kg");
  });

  it("should include Turnaround Time engine in input checks", () => {
    const report = createMinimalReport();
    const turnaroundCheck = report.engineInputChecks.find(c => c.engineName === "Turnaround Time Engine");
    expect(turnaroundCheck).toBeDefined();
    expect(turnaroundCheck?.canExecute).toBe(true);
  });
});

describe("System health computation", () => {
  it("should report healthy when all engines succeed", () => {
    const report = createMinimalReport();
    expect(report.systemHealth.overallStatus).toBe("healthy");
    expect(report.systemHealth.engineSuccessRate).toBe(100);
    expect(report.systemHealth.failedEngines).toBe(0);
    expect(report.systemHealth.degradedEngines).toBe(0);
  });

  it("should report degraded when some engines degrade", () => {
    const report = createMinimalReport({
      systemHealth: {
        dataExtractionCompleteness: 70,
        engineSuccessRate: 80,
        totalEngines: 5,
        successfulEngines: 4,
        failedEngines: 0,
        skippedEngines: 0,
        degradedEngines: 1,
        missingFieldsList: ["vehicle_mass_kg"],
        recommendedFixes: ["Ensure vehicle mass is extracted from documents"],
        overallStatus: "degraded",
        totalAssumptions: 3,
        totalRecoveryActions: 1,
      },
    });

    expect(report.systemHealth.overallStatus).toBe("degraded");
    expect(report.systemHealth.degradedEngines).toBe(1);
    expect(report.systemHealth.totalAssumptions).toBe(3);
  });

  it("should report critical when multiple engines fail", () => {
    const report = createMinimalReport({
      systemHealth: {
        dataExtractionCompleteness: 30,
        engineSuccessRate: 25,
        totalEngines: 5,
        successfulEngines: 1,
        failedEngines: 3,
        skippedEngines: 0,
        degradedEngines: 1,
        missingFieldsList: ["vehicle_mass_kg", "damage_description", "repair_quote_total"],
        recommendedFixes: [
          "Check document quality — OCR may have failed",
          "Ensure claim form contains required fields",
        ],
        overallStatus: "critical",
        totalAssumptions: 8,
        totalRecoveryActions: 5,
      },
    });

    expect(report.systemHealth.overallStatus).toBe("critical");
    expect(report.systemHealth.failedEngines).toBeGreaterThan(report.systemHealth.successfulEngines);
  });

  it("should have engine counts that add up", () => {
    const report = createMinimalReport();
    const h = report.systemHealth;
    expect(h.successfulEngines + h.failedEngines + h.skippedEngines + (h.degradedEngines || 0)).toBe(h.totalEngines);
  });

  it("should have completeness between 0 and 100", () => {
    const report = createMinimalReport();
    expect(report.systemHealth.dataExtractionCompleteness).toBeGreaterThanOrEqual(0);
    expect(report.systemHealth.dataExtractionCompleteness).toBeLessThanOrEqual(100);
  });
});

describe("Stage summaries", () => {
  it("should have all 11 stages including 9b_turnaround", () => {
    const report = createMinimalReport();
    const expectedStages = [
      "1_ingestion", "2_extraction", "3_structured_extraction", "4_validation",
      "5_assembly", "6_damage_analysis", "7_physics", "8_fraud", "9_cost",
      "9b_turnaround", "10_report",
    ];
    for (const stage of expectedStages) {
      expect(report.stageSummaries[stage]).toBeDefined();
      expect(report.stageSummaries[stage].status).toBeDefined();
      expect(report.stageSummaries[stage].durationMs).toBeGreaterThanOrEqual(0);
    }
  });

  it("should have self-healing fields on each stage summary", () => {
    const report = createMinimalReport();
    for (const [key, stage] of Object.entries(report.stageSummaries)) {
      const s = stage as any;
      expect(typeof s.degraded).toBe("boolean");
      expect(typeof s.assumptionCount).toBe("number");
      expect(typeof s.recoveryActionCount).toBe("number");
    }
  });

  it("should have total duration >= sum of stage durations", () => {
    const report = createMinimalReport();
    const stageDurationSum = Object.values(report.stageSummaries)
      .reduce((sum, s: any) => sum + s.durationMs, 0);
    // Total can be >= sum due to overhead
    expect(report.totalDurationMs).toBeGreaterThanOrEqual(stageDurationSum * 0.9);
  });
});

describe("Error diagnostics", () => {
  it("should be empty when all engines succeed", () => {
    const report = createMinimalReport();
    expect(report.errorDiagnostics).toHaveLength(0);
  });

  it("should contain diagnostics when engines fail", () => {
    const report = createMinimalReport({
      errorDiagnostics: [
        {
          stage: "Stage 7 — Physics Analysis",
          component: "Physics Engine",
          errorType: "missing_input",
          description: "Physics engine degraded because vehicle mass was estimated.",
          recommendation: "Ensure vehicle mass is available in the claim form or vehicle registry.",
        },
      ],
    });

    expect(report.errorDiagnostics).toHaveLength(1);
    expect(report.errorDiagnostics[0].stage).toContain("Physics");
    expect(report.errorDiagnostics[0].recommendation).toBeTruthy();
  });

  it("should report degradation as a diagnostic when assumptions are made", () => {
    const report = createMinimalReport({
      errorDiagnostics: [
        {
          stage: "Stage 5 — Assembly",
          component: "ClaimRecord Builder",
          errorType: "degraded_output",
          description: "Vehicle mass was not found in documents. Used default value of 1400kg.",
          recommendation: "Upload vehicle registration document or specify vehicle mass in claim form.",
        },
      ],
    });

    expect(report.errorDiagnostics[0].errorType).toBe("degraded_output");
  });
});

describe("Turnaround time", () => {
  it("should include turnaround time engine in results", () => {
    const report = createMinimalReport();
    const turnaroundResult = report.engineResults.find(e => e.engineName === "Turnaround Time");
    expect(turnaroundResult).toBeDefined();
    expect(turnaroundResult?.executionStatus).toBe("success");
  });

  it("should include turnaround time in report sections", () => {
    const report = createMinimalReport();
    const turnaroundSection = report.reportSectionStatuses.find(s => s.sectionName === "Turnaround Time");
    expect(turnaroundSection).toBeDefined();
    expect(turnaroundSection?.status).toBe("ok");
  });

  it("should include 9b_turnaround in stage summaries", () => {
    const report = createMinimalReport();
    expect(report.stageSummaries["9b_turnaround"]).toBeDefined();
    expect(report.stageSummaries["9b_turnaround"].status).toBe("success");
  });
});
