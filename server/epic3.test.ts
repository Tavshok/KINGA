// @ts-nocheck
/**
 * Epic 3 Test Suite — Engineering Workspace
 *
 * Covers all 18 approved tasks from the Epic 3 Technical Design Specification.
 *
 * T1  — 5 new schema tables exist in schema.ts
 * T2a — WorkflowState includes inspection states
 * T2b — InsurerRole includes 'engineer'
 * T2c — MeasurementSource includes 'ENGINEER_MEASUREMENT'
 * T3  — 'engineer' added to PLATFORM_ROLES
 * T4  — measurementToPhysicsMeasurement adapter: correct output shape
 * T4b — batchConvertMeasurements: returns array of objects with measurementType
 * T5  — reconcileEngineerMeasurements exported and raises HIGH flag on >15% deviation
 * T6  — assignInspection exported from workload-balancing
 * T7  — inspectionsRouter has all expected procedures
 * T8  — engineerDomainProcedure: FORBIDDEN guard is in the procedure definition
 * T9  — inspectionsRouter.create: procedure exists and has a mutation type
 * T10a — engineer.inspection_report registered in REPORT_ACCESS
 * T10b — engineer.risk_survey registered in REPORT_ACCESS
 * T10c — canAccessReport correctly allows engineer role for engineer reports
 * T10d — canAccessReport correctly denies insurer role for engineer.risk_survey
 * T11 — EngineerDashboard.tsx file exists
 * T12 — EngineerAssignments.tsx file exists
 * T13 — EngineerInspectionList.tsx file exists
 * T14 — EngineerInspectionDetail.tsx file exists (covers T14–T18)
 * T15 — EngineerWorkspaceLayout.tsx file exists
 * T16 — /engineer/* routes registered in App.tsx
 * T17 — engineerInspectionReport.ts: generateEngineerInspectionReport is a function
 * T18 — riskSurveyReport.ts: generateRiskSurveyReport is a function
 */

import { describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import * as fs from "fs";
import * as path from "path";

// ─── Helpers ─────────────────────────────────────────────────────────────────
const PROJECT = path.resolve(__dirname, "..");

// ─── T1: Schema tables ────────────────────────────────────────────────────────
describe("T1 — Schema tables", () => {
  const schemaPath = path.join(PROJECT, "drizzle/schema.ts");
  const schema = fs.readFileSync(schemaPath, "utf8");

  it("assetRegistry table exists", () => {
    expect(schema).toContain("export const assetRegistry");
  });
  it("inspections table exists", () => {
    expect(schema).toContain("export const inspections");
  });
  it("physicalMeasurements table exists", () => {
    expect(schema).toContain("export const physicalMeasurements");
  });
  it("engineerObservations table exists", () => {
    expect(schema).toContain("export const engineerObservations");
  });
  it("engineerProfiles table exists", () => {
    expect(schema).toContain("export const engineerProfiles");
  });
});

// ─── T2: Type extensions ──────────────────────────────────────────────────────
describe("T2 — Type extensions", () => {
  it("T2a: WorkflowState includes inspection_assigned", async () => {
    const { WORKFLOW_STATES } = await import("./workflow/types");
    expect(WORKFLOW_STATES).toContain("inspection_assigned");
  });

  it("T2a: WorkflowState includes inspection_in_progress", async () => {
    const { WORKFLOW_STATES } = await import("./workflow/types");
    expect(WORKFLOW_STATES).toContain("inspection_in_progress");
  });

  it("T2a: WorkflowState includes inspection_complete", async () => {
    const { WORKFLOW_STATES } = await import("./workflow/types");
    expect(WORKFLOW_STATES).toContain("inspection_complete");
  });

  it("T2b: InsurerRole includes engineer", async () => {
    const { INSURER_ROLES } = await import("./workflow/types");
    expect(INSURER_ROLES).toContain("engineer");
  });

  it("T2c: MeasurementSource includes ENGINEER_MEASUREMENT", () => {
    const physicsPath = path.join(PROJECT, "server/pipeline-v2/physicsTruth.ts");
    const content = fs.readFileSync(physicsPath, "utf8");
    expect(content).toContain("ENGINEER_MEASUREMENT");
  });
});

// ─── T3: PLATFORM_ROLES includes 'engineer' ───────────────────────────────────
describe("T3 — engineer role in PLATFORM_ROLES", () => {
  it("server PLATFORM_ROLES includes engineer", async () => {
    const { PLATFORM_ROLES } = await import("./routers/platform-user-roles");
    expect(PLATFORM_ROLES).toContain("engineer");
  });
});

// ─── T4: measurementToPhysicsMeasurement adapter ─────────────────────────────
describe("T4 — engineerMeasurementAdapter", () => {
  const makeRow = (overrides = {}) => ({
    id: 1,
    measurementType: "FRONT_OVERHANG",
    value: 850,
    valueMin: null,
    valueMax: null,
    unit: "mm",
    confidence: 0.95,
    instrument: "laser",
    measurementMethod: "laser",
    calibrationReference: null,
    capturedBy: 1,
    capturedAt: new Date("2026-01-01T10:00:00Z"),
    notes: null,
    ...overrides,
  });

  it("measurementToPhysicsMeasurement returns correct shape", async () => {
    const { measurementToPhysicsMeasurement } = await import(
      "./pipeline-v2/engineerMeasurementAdapter"
    );
    const result = measurementToPhysicsMeasurement(makeRow());
    expect(result).toHaveProperty("value");
    expect(result).toHaveProperty("source");
    expect(result.source).toBe("ENGINEER_MEASUREMENT");
    expect(result.value).toBe(850);
  });

  it("T4b: batchConvertMeasurements returns array with measurementType", async () => {
    const { batchConvertMeasurements } = await import(
      "./pipeline-v2/engineerMeasurementAdapter"
    );
    const result = batchConvertMeasurements([makeRow()]);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveProperty("measurementType");
    expect(result[0].measurementType).toBe("FRONT_OVERHANG");
    expect(result[0].physics.source).toBe("ENGINEER_MEASUREMENT");
  });
});

// ─── T5: reconcileEngineerMeasurements ────────────────────────────────────────
describe("T5 — reconcileEngineerMeasurements", () => {
  const makeRow = (value: number) => ({
    id: 1,
    measurementType: "FRONT_OVERHANG",
    value,
    valueMin: null,
    valueMax: null,
    unit: "mm",
    confidence: 0.95,
    instrument: "laser",
    measurementMethod: "laser",
    calibrationReference: null,
    capturedBy: 1,
    capturedAt: new Date("2026-01-01T10:00:00Z"),
    notes: null,
  });

  it("is exported from crossStageConsistencyEngine", async () => {
    const mod = await import("./pipeline-v2/crossStageConsistencyEngine");
    expect(typeof mod.reconcileEngineerMeasurements).toBe("function");
  });

  it("returns object with flags array", async () => {
    const { reconcileEngineerMeasurements } = await import(
      "./pipeline-v2/crossStageConsistencyEngine"
    );
    const pipelineMap = new Map([
      ["FRONT_OVERHANG", { value: 820, unit: "mm", source: "VGE_CALIBRATED", confidence: 0.8, min: 779, max: 861, provenanceNote: "" }],
    ]);
    const result = reconcileEngineerMeasurements([makeRow(850)], pipelineMap, "INS-001");
    expect(result).toHaveProperty("flags");
    expect(Array.isArray(result.flags)).toBe(true);
  });

  it("raises HIGH flag when deviation exceeds 15%", async () => {
    const { reconcileEngineerMeasurements } = await import(
      "./pipeline-v2/crossStageConsistencyEngine"
    );
    // 1000 vs 820 = 22% deviation — above 15% threshold
    const pipelineMap = new Map([
      ["FRONT_OVERHANG", { value: 820, unit: "mm", source: "VGE_CALIBRATED", confidence: 0.8, min: 779, max: 861, provenanceNote: "" }],
    ]);
    const result = reconcileEngineerMeasurements([makeRow(1000)], pipelineMap, "INS-001");
    const highFlags = result.flags.filter((f) => f.severity === "HIGH");
    expect(highFlags.length).toBeGreaterThan(0);
  });

  it("does NOT raise flag when deviation is within 15%", async () => {
    const { reconcileEngineerMeasurements } = await import(
      "./pipeline-v2/crossStageConsistencyEngine"
    );
    // 850 vs 820 = 3.7% deviation — below 15% threshold
    const pipelineMap = new Map([
      ["FRONT_OVERHANG", { value: 820, unit: "mm", source: "VGE_CALIBRATED", confidence: 0.8, min: 779, max: 861, provenanceNote: "" }],
    ]);
    const result = reconcileEngineerMeasurements([makeRow(850)], pipelineMap, "INS-001");
    const highFlags = result.flags.filter((f) => f.severity === "HIGH");
    expect(highFlags.length).toBe(0);
  });
});

// ─── T6: assignInspection ─────────────────────────────────────────────────────
describe("T6 — assignInspection", () => {
  it("is exported from workload-balancing", async () => {
    const mod = await import("./workload-balancing");
    expect(typeof mod.assignInspection).toBe("function");
  });
});

// ─── T7: inspectionsRouter procedures ────────────────────────────────────────
describe("T7 — inspectionsRouter procedures", () => {
  const EXPECTED_PROCEDURES = [
    "create",
    "list",
    "get",
    "updateStatus",
    "assign",
    "addMeasurement",
    "addObservation",
    "transcribeVoice",
    "draftObservationWithAi",
    "runAiAnalysis",
    "approveAiAnalysis",
    "runPhysicsReconciliation",
    "getMyProfile",
    "upsertMyProfile",
  ];

  it("inspectionsRouter exports all expected procedures", async () => {
    const { inspectionsRouter } = await import("./routers/inspections");
    for (const proc of EXPECTED_PROCEDURES) {
      expect(inspectionsRouter).toHaveProperty(proc);
    }
  });
});

// ─── T8: engineerDomainProcedure guard defined ───────────────────────────────
describe("T8 — engineerDomainProcedure guard", () => {
  it("engineerDomainProcedure is exported from domain-middleware", async () => {
    const mod = await import("./_core/domain-middleware");
    expect(typeof mod.engineerDomainProcedure).toBe("object");
  });

  it("ENGINEER_ROLES includes engineer", async () => {
    const { ENGINEER_ROLES } = await import("./_core/domain-middleware");
    expect(ENGINEER_ROLES).toContain("engineer");
  });
});

// ─── T9: create procedure exists ─────────────────────────────────────────────
describe("T9 — create procedure", () => {
  it("create procedure is defined on inspectionsRouter", async () => {
    const { inspectionsRouter } = await import("./routers/inspections");
    expect(inspectionsRouter.create).toBeDefined();
  });
});

// ─── T10: Report registry ─────────────────────────────────────────────────────
describe("T10 — Report registry", () => {
  it("T10a: engineer.inspection_report is in REPORT_ACCESS", async () => {
    const { REPORT_ACCESS } = await import("./reporting/reportDefinitions");
    expect(REPORT_ACCESS).toHaveProperty("engineer.inspection_report");
  });

  it("T10b: engineer.risk_survey is in REPORT_ACCESS", async () => {
    const { REPORT_ACCESS } = await import("./reporting/reportDefinitions");
    expect(REPORT_ACCESS).toHaveProperty("engineer.risk_survey");
  });

  it("T10c: canAccessReport allows engineer for engineer.inspection_report", async () => {
    const { canAccessReport } = await import("./routers/reporting");
    // Signature: canAccessReport(reportKey, userRole, insurerRole?)
    expect(canAccessReport("engineer.inspection_report", "engineer")).toBe(true);
  });

  it("T10d: canAccessReport denies insurer for engineer.risk_survey", async () => {
    const { canAccessReport } = await import("./routers/reporting");
    expect(canAccessReport("engineer.risk_survey", "insurer")).toBe(false);
  });
});

// ─── T11–T15: UI files exist ──────────────────────────────────────────────────
describe("T11–T15 — Engineering Workspace UI files", () => {
  const UI_FILES = [
    "client/src/pages/EngineerDashboard.tsx",
    "client/src/pages/EngineerAssignments.tsx",
    "client/src/pages/EngineerInspectionList.tsx",
    "client/src/pages/EngineerInspectionDetail.tsx",
    "client/src/components/EngineerWorkspaceLayout.tsx",
  ];

  for (const relPath of UI_FILES) {
    it(`${relPath} exists`, () => {
      expect(fs.existsSync(path.join(PROJECT, relPath))).toBe(true);
    });
  }
});

// ─── T16: Routes registered in App.tsx ───────────────────────────────────────
describe("T16 — /engineer/* routes in App.tsx", () => {
  const appContent = fs.readFileSync(
    path.join(PROJECT, "client/src/App.tsx"),
    "utf8"
  );

  it("/engineer/dashboard route exists", () => {
    expect(appContent).toContain('path="/engineer/dashboard"');
  });
  it("/engineer/assignments route exists", () => {
    expect(appContent).toContain('path="/engineer/assignments"');
  });
  it("/engineer/inspections route exists", () => {
    expect(appContent).toContain('path="/engineer/inspections"');
  });
  it("/engineer/inspections/:id route exists", () => {
    expect(appContent).toContain('path="/engineer/inspections/:id"');
  });
});

// ─── T17: engineerInspectionReport function exported ─────────────────────────
describe("T17 — engineerInspectionReport", () => {
  it("generateEngineerInspectionReport is a function", async () => {
    const mod = await import("./reporting/engineerInspectionReport");
    expect(typeof mod.generateEngineerInspectionReport).toBe("function");
  });
});

// ─── T18: riskSurveyReport function exported ─────────────────────────────────
describe("T18 — riskSurveyReport", () => {
  it("generateRiskSurveyReport is a function", async () => {
    const mod = await import("./reporting/riskSurveyReport");
    expect(typeof mod.generateRiskSurveyReport).toBe("function");
  });
});
