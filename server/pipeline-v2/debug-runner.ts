/**
 * pipeline-v2/debug-runner.ts
 *
 * Debug Mode Pipeline Runner — runs the 10-stage self-healing pipeline
 * and captures ALL intermediate data at every stage for diagnostic display.
 *
 * This does NOT modify the database — it's a read-only diagnostic tool
 * that re-runs the pipeline on existing claim data.
 *
 * Updated for the Self-Healing Claim Processing Engine:
 *   - Supports "degraded" status on all stages
 *   - Tracks assumptions and recovery actions per stage
 *   - Includes Stage 9b (Turnaround Time Analysis)
 *   - Never halts — mirrors the production pipeline behaviour
 */

import type {
  PipelineContext,
  PipelineStageSummary,
  Stage1Output,
  Stage2Output,
  Stage3Output,
  Stage4Output,
  Stage5Output,
  Stage6Output,
  Stage7Output,
  Stage8Output,
  Stage9Output,
  Stage10Output,
  TurnaroundTimeOutput,
  ClaimRecord,
  ValidationIssue,
  Assumption,
  RecoveryAction,
  StageResult,
} from "./types";

import { runIngestionStage } from "./stage-1-ingestion";
import { runExtractionStage } from "./stage-2-extraction";
import { runStructuredExtractionStage } from "./stage-3-structured-extraction";
import { runValidationStage } from "./stage-4-validation";
import { runAssemblyStage } from "./stage-5-assembly";
import { runDamageAnalysisStage } from "./stage-6-damage-analysis";
import { runPhysicsStage } from "./stage-7-physics";
import { runFraudAnalysisStage } from "./stage-8-fraud";
import { runCostOptimisationStage } from "./stage-9-cost";
import { runTurnaroundTimeStage } from "./stage-9b-turnaround";
import { runReportGenerationStage } from "./stage-10-report";

// ─────────────────────────────────────────────────────────────────────────────
// DEBUG OUTPUT TYPES
// ─────────────────────────────────────────────────────────────────────────────

type StageStatus = "success" | "failed" | "skipped" | "degraded";

/** Step 1 — Document Registry */
export interface DebugDocumentEntry {
  documentId: string;
  fileName: string;
  detectedDocumentType: string;
  ocrStatus: "completed" | "failed" | "not_required";
  textExtractionStatus: "successful" | "partial" | "failed" | "not_started";
  mimeType: string;
  sourceUrl: string;
  containsImages: boolean;
  imageCount: number;
}

/** Step 2 — Raw Text Output */
export interface DebugRawTextEntry {
  documentId: string;
  fileName: string;
  rawText: string;
  textLength: number;
  tableCount: number;
  ocrConfidence: number;
  tables: Array<{ headers: string[]; rows: string[][]; context: string }>;
}

/** Step 3 — Structured Data Extraction */
export interface DebugExtractedField {
  fieldName: string;
  extractedValue: string | number | boolean | null;
  confidence: "high" | "medium" | "low" | "null";
  sourceDocument: string;
}

/** Step 5 — Engine Input Check */
export interface DebugEngineInput {
  engineName: string;
  inputs: Array<{
    fieldName: string;
    value: string | number | boolean | null;
    status: "present" | "missing" | "default";
  }>;
  missingRequiredFields: string[];
  canExecute: boolean;
}

/** Step 6 — Engine Execution Result */
export interface DebugEngineResult {
  engineName: string;
  executionStatus: StageStatus;
  durationMs: number;
  reason?: string;
  outputData: Record<string, any>;
  assumptionCount: number;
  recoveryActionCount: number;
}

/** Step 7 — Report Section Status */
export interface DebugReportSectionStatus {
  sectionName: string;
  status: "ok" | "partial" | "missing_inputs" | "empty";
  dataSource: string;
  fieldCount: number;
  populatedFieldCount: number;
}

/** Step 8 — Error Diagnostic */
export interface DebugErrorDiagnostic {
  stage: string;
  component: string;
  errorType: "missing_input" | "extraction_failure" | "engine_failure" | "data_quality";
  description: string;
  recommendation: string;
}

/** Step 9 — System Health Summary */
export interface DebugSystemHealth {
  dataExtractionCompleteness: number;
  engineSuccessRate: number;
  totalEngines: number;
  successfulEngines: number;
  failedEngines: number;
  skippedEngines: number;
  degradedEngines: number;
  missingFieldsList: string[];
  recommendedFixes: string[];
  overallStatus: "healthy" | "degraded" | "critical";
  totalAssumptions: number;
  totalRecoveryActions: number;
}

/** Full debug diagnostic output */
export interface DebugDiagnosticReport {
  claimId: number;
  runTimestamp: string;
  totalDurationMs: number;

  // Step 1
  documentRegistry: DebugDocumentEntry[];
  // Step 2
  rawTextOutputs: DebugRawTextEntry[];
  // Step 3
  structuredExtractions: DebugExtractedField[];
  // Step 4
  claimDataObject: ClaimRecord | null;
  validationIssues: ValidationIssue[];
  completenessScore: number;
  missingFields: string[];
  // Step 5
  engineInputChecks: DebugEngineInput[];
  // Step 6
  engineResults: DebugEngineResult[];
  // Step 7
  reportSectionStatuses: DebugReportSectionStatus[];
  // Step 8
  errorDiagnostics: DebugErrorDiagnostic[];
  // Step 9
  systemHealth: DebugSystemHealth;

  // Self-healing metadata
  allAssumptions: Assumption[];
  allRecoveryActions: RecoveryAction[];

  // Per-stage timing
  stageSummaries: Record<string, PipelineStageSummary>;
}

// ─────────────────────────────────────────────────────────────────────────────
// DEBUG PIPELINE RUNNER
// ─────────────────────────────────────────────────────────────────────────────

export async function runDebugPipeline(
  ctx: PipelineContext
): Promise<DebugDiagnosticReport> {
  const pipelineStart = Date.now();
  const stages: Record<string, PipelineStageSummary> = {};
  const errors: DebugErrorDiagnostic[] = [];
  const allAssumptions: Assumption[] = [];
  const allRecoveryActions: RecoveryAction[] = [];

  ctx.log("Debug", `Starting DEBUG MODE self-healing pipeline for claim ${ctx.claimId}`);

  let stage1Data: Stage1Output | null = null;
  let stage2Data: Stage2Output | null = null;
  let stage3Data: Stage3Output | null = null;
  let stage4Data: Stage4Output | null = null;
  let stage5Data: Stage5Output | null = null;
  let stage6Data: Stage6Output | null = null;
  let stage7Data: Stage7Output | null = null;
  let stage8Data: Stage8Output | null = null;
  let stage9Data: Stage9Output | null = null;
  let stage9bData: TurnaroundTimeOutput | null = null;
  let stage10Data: Stage10Output | null = null;

  /** Helper to record a stage result into the summary */
  const recordStage = <T>(name: string, result: StageResult<T>) => {
    stages[name] = {
      status: result.status,
      durationMs: result.durationMs,
      savedToDb: false,
      error: result.error,
      degraded: result.degraded || false,
      assumptionCount: result.assumptions?.length || 0,
      recoveryActionCount: result.recoveryActions?.length || 0,
    };
    if (result.assumptions) allAssumptions.push(...result.assumptions);
    if (result.recoveryActions) allRecoveryActions.push(...result.recoveryActions);
  };

  const skipStage = (name: string, error: string) => {
    stages[name] = {
      status: "skipped",
      durationMs: 0,
      savedToDb: false,
      error,
      degraded: true,
      assumptionCount: 0,
      recoveryActionCount: 0,
    };
  };

  // ── STAGE 1: Document Ingestion ──────────────────────────────────────
  try {
    const s1 = await runIngestionStage(ctx);
    recordStage("1_ingestion", s1);
    stage1Data = s1.data;
    if (s1.status === "failed") {
      errors.push({
        stage: "Stage 1 — Document Ingestion",
        component: "Document Classifier",
        errorType: "extraction_failure",
        description: `Document ingestion failed: ${s1.error || "Unknown error"}`,
        recommendation: "Check that the claim has valid documents uploaded and the S3 URLs are accessible.",
      });
    }
  } catch (err: any) {
    skipStage("1_ingestion", err.message);
    errors.push({
      stage: "Stage 1 — Document Ingestion",
      component: "Document Classifier",
      errorType: "engine_failure",
      description: `Stage 1 threw an exception: ${err.message}`,
      recommendation: "Check server logs for stack trace. Verify document URLs are valid.",
    });
  }

  // ── STAGE 2: OCR & Text Extraction ───────────────────────────────────
  if (stage1Data) {
    try {
      const s2 = await runExtractionStage(ctx, stage1Data);
      recordStage("2_extraction", s2);
      stage2Data = s2.data;
      if (s2.status === "failed") {
        errors.push({
          stage: "Stage 2 — OCR & Text Extraction",
          component: "OCR Engine",
          errorType: "extraction_failure",
          description: `Text extraction failed: ${s2.error || "Unknown error"}`,
          recommendation: "Check if the PDF is readable. Try re-uploading the document.",
        });
      }
    } catch (err: any) {
      skipStage("2_extraction", err.message);
      errors.push({
        stage: "Stage 2 — OCR & Text Extraction",
        component: "OCR Engine",
        errorType: "engine_failure",
        description: `Stage 2 threw an exception: ${err.message}`,
        recommendation: "Check LLM API availability. The PDF may be corrupted or too large.",
      });
    }
  } else {
    skipStage("2_extraction", "No documents from Stage 1");
  }

  // ── STAGE 3: Structured Data Extraction ──────────────────────────────
  if (stage1Data && stage2Data) {
    try {
      const s3 = await runStructuredExtractionStage(ctx, stage1Data, stage2Data);
      recordStage("3_structured_extraction", s3);
      stage3Data = s3.data;
      if (s3.status === "failed") {
        errors.push({
          stage: "Stage 3 — Structured Data Extraction",
          component: "Field Extractor",
          errorType: "extraction_failure",
          description: `Structured extraction failed: ${s3.error || "Unknown error"}`,
          recommendation: "The LLM may have failed to parse the document structure. Check raw text quality.",
        });
      }
    } catch (err: any) {
      skipStage("3_structured_extraction", err.message);
      errors.push({
        stage: "Stage 3 — Structured Data Extraction",
        component: "Field Extractor",
        errorType: "engine_failure",
        description: `Stage 3 threw an exception: ${err.message}`,
        recommendation: "Check LLM API. The JSON schema may be too complex for the extracted text.",
      });
    }
  } else {
    skipStage("3_structured_extraction", "Missing input from prior stages");
  }

  // ── STAGE 4: Data Validation ─────────────────────────────────────────
  if (stage3Data) {
    try {
      const s4 = await runValidationStage(ctx, stage3Data);
      recordStage("4_validation", s4);
      stage4Data = s4.data;
    } catch (err: any) {
      skipStage("4_validation", err.message);
      errors.push({
        stage: "Stage 4 — Data Validation",
        component: "Validator",
        errorType: "engine_failure",
        description: `Validation threw an exception: ${err.message}`,
        recommendation: "Check the extraction output format. Fields may have unexpected types.",
      });
    }
  } else {
    skipStage("4_validation", "No extraction data from Stage 3");
  }

  // ── STAGE 5: Claim Data Assembly ─────────────────────────────────────
  if (stage4Data) {
    try {
      const s5 = await runAssemblyStage(ctx, stage4Data);
      recordStage("5_assembly", s5);
      stage5Data = s5.data;
    } catch (err: any) {
      skipStage("5_assembly", err.message);
      errors.push({
        stage: "Stage 5 — Claim Data Assembly",
        component: "Assembler",
        errorType: "engine_failure",
        description: `Assembly threw an exception: ${err.message}`,
        recommendation: "Check validated fields. Vehicle make/model may be missing.",
      });
    }
  } else {
    skipStage("5_assembly", "No validated data from Stage 4");
  }

  const claimRecord = stage5Data?.claimRecord || null;

  // ── STAGE 6: Damage Analysis ─────────────────────────────────────────
  if (claimRecord) {
    try {
      const s6 = await runDamageAnalysisStage(ctx, claimRecord);
      recordStage("6_damage_analysis", s6);
      stage6Data = s6.data;
      if (s6.status === "failed") {
        errors.push({
          stage: "Stage 6 — Damage Analysis",
          component: "Damage Engine",
          errorType: "engine_failure",
          description: `Damage analysis failed: ${s6.error || "No damaged components found"}`,
          recommendation: "Verify that damaged components were extracted in Stage 3.",
        });
      }
    } catch (err: any) {
      skipStage("6_damage_analysis", err.message);
      errors.push({
        stage: "Stage 6 — Damage Analysis",
        component: "Damage Engine",
        errorType: "engine_failure",
        description: `Damage analysis threw an exception: ${err.message}`,
        recommendation: "Check the ClaimRecord damage components array.",
      });
    }
  } else {
    skipStage("6_damage_analysis", "No ClaimRecord from Stage 5");
  }

  // ── STAGE 7: Physics Analysis ────────────────────────────────────────
  if (claimRecord) {
    try {
      const s7 = await runPhysicsStage(ctx, claimRecord, stage6Data!);
      recordStage("7_physics", s7);
      stage7Data = s7.data;
      if (s7.status === "failed") {
        errors.push({
          stage: "Stage 7 — Physics Analysis",
          component: "Physics Engine",
          errorType: "missing_input",
          description: `Physics analysis failed: ${s7.error || "Missing vehicle mass or impact data"}`,
          recommendation: "Ensure vehicle_mass was resolved in Stage 5 and damage zones exist from Stage 6.",
        });
      }
    } catch (err: any) {
      skipStage("7_physics", err.message);
      errors.push({
        stage: "Stage 7 — Physics Analysis",
        component: "Physics Engine",
        errorType: "engine_failure",
        description: `Physics engine threw an exception: ${err.message}`,
        recommendation: "Check vehicle mass lookup and damage zone data.",
      });
    }
  } else {
    skipStage("7_physics", "Missing ClaimRecord");
    errors.push({
      stage: "Stage 7 — Physics Analysis",
      component: "Physics Engine",
      errorType: "missing_input",
      description: "Physics engine skipped because ClaimRecord was not available.",
      recommendation: "Fix upstream stages (5 and 6) first.",
    });
  }

  // ── STAGE 8: Fraud Analysis ──────────────────────────────────────────
  if (claimRecord) {
    try {
      const s8 = await runFraudAnalysisStage(ctx, claimRecord, stage6Data!, stage7Data!);
      recordStage("8_fraud", s8);
      stage8Data = s8.data;
      if (s8.status === "failed") {
        errors.push({
          stage: "Stage 8 — Fraud Analysis",
          component: "Fraud Engine",
          errorType: "engine_failure",
          description: `Fraud analysis failed: ${s8.error || "Unknown error"}`,
          recommendation: "Check repair quote data and damage consistency inputs.",
        });
      }
    } catch (err: any) {
      skipStage("8_fraud", err.message);
      errors.push({
        stage: "Stage 8 — Fraud Analysis",
        component: "Fraud Engine",
        errorType: "engine_failure",
        description: `Fraud engine threw an exception: ${err.message}`,
        recommendation: "Check the ClaimRecord, damage analysis, and physics analysis outputs.",
      });
    }
  } else {
    skipStage("8_fraud", "Missing upstream data");
  }

  // ── STAGE 9: Cost Optimisation ───────────────────────────────────────
  if (claimRecord) {
    try {
      const s9 = await runCostOptimisationStage(ctx, claimRecord, stage6Data!, stage7Data!);
      recordStage("9_cost", s9);
      stage9Data = s9.data;
      if (s9.status === "failed") {
        errors.push({
          stage: "Stage 9 — Cost Optimisation",
          component: "Cost Engine",
          errorType: "engine_failure",
          description: `Cost optimisation failed: ${s9.error || "Missing quote data"}`,
          recommendation: "Ensure quote_total was extracted in Stage 3 and repair line items are available.",
        });
      }
    } catch (err: any) {
      skipStage("9_cost", err.message);
      errors.push({
        stage: "Stage 9 — Cost Optimisation",
        component: "Cost Engine",
        errorType: "engine_failure",
        description: `Cost engine threw an exception: ${err.message}`,
        recommendation: "Check the ClaimRecord repair quote and damage analysis outputs.",
      });
    }
  } else {
    skipStage("9_cost", "Missing upstream data");
  }

  // ── STAGE 9b: Turnaround Time Analysis ───────────────────────────────
  if (claimRecord) {
    try {
      const s9b = await runTurnaroundTimeStage(ctx, claimRecord, stage6Data!, stage9Data!);
      recordStage("9b_turnaround", s9b);
      stage9bData = s9b.data;
    } catch (err: any) {
      skipStage("9b_turnaround", err.message);
    }
  } else {
    skipStage("9b_turnaround", "Missing upstream data");
  }

  // ── STAGE 10: Report Generation ──────────────────────────────────────
  try {
    const s10 = await runReportGenerationStage(
      ctx, claimRecord!, stage6Data!, stage7Data!, stage8Data!, stage9Data!, stage9bData!, allAssumptions
    );
    recordStage("10_report", s10);
    stage10Data = s10.data;
  } catch (err: any) {
    skipStage("10_report", err.message);
  }

  // ─────────────────────────────────────────────────────────────────────
  // BUILD DIAGNOSTIC REPORT
  // ─────────────────────────────────────────────────────────────────────

  // Step 1 — Document Registry
  const documentRegistry: DebugDocumentEntry[] = (stage1Data?.documents || []).map((doc, i) => {
    const extraction = stage2Data?.extractedTexts.find(t => t.documentIndex === doc.documentIndex);
    return {
      documentId: `Document_${i + 1}`,
      fileName: doc.fileName,
      detectedDocumentType: formatDocType(doc.documentType),
      ocrStatus: extraction
        ? (extraction.ocrApplied ? "completed" : "not_required")
        : "failed",
      textExtractionStatus: extraction
        ? (extraction.rawText.length > 100 ? "successful" : (extraction.rawText.length > 0 ? "partial" : "failed"))
        : "not_started",
      mimeType: doc.mimeType,
      sourceUrl: doc.sourceUrl,
      containsImages: doc.containsImages,
      imageCount: doc.imageUrls.length,
    };
  });

  // Step 2 — Raw Text Output
  const rawTextOutputs: DebugRawTextEntry[] = (stage2Data?.extractedTexts || []).map((ext, i) => {
    const doc = stage1Data?.documents.find(d => d.documentIndex === ext.documentIndex);
    return {
      documentId: `Document_${i + 1}`,
      fileName: doc?.fileName || `document_${ext.documentIndex}`,
      rawText: ext.rawText,
      textLength: ext.rawText.length,
      tableCount: ext.tables.length,
      ocrConfidence: ext.ocrConfidence,
      tables: ext.tables,
    };
  });

  // Step 3 — Structured Data Extraction
  const structuredExtractions: DebugExtractedField[] = [];
  if (stage3Data?.perDocumentExtractions?.length) {
    const ext = stage3Data.perDocumentExtractions[0];
    const doc = stage1Data?.documents[0];
    const sourceName = doc?.fileName || "primary_document";

    const fieldMap: Record<string, any> = {
      claim_id: ext.claimId,
      claimant_name: ext.claimantName,
      driver_name: ext.driverName,
      vehicle_registration: ext.vehicleRegistration,
      vehicle_make: ext.vehicleMake,
      vehicle_model: ext.vehicleModel,
      vehicle_year: ext.vehicleYear,
      vehicle_vin: ext.vehicleVin,
      vehicle_colour: ext.vehicleColour,
      vehicle_engine_number: ext.vehicleEngineNumber,
      vehicle_mileage: ext.vehicleMileage,
      accident_date: ext.accidentDate,
      accident_location: ext.accidentLocation,
      accident_description: ext.accidentDescription,
      incident_type: ext.incidentType,
      accident_type: ext.accidentType,
      impact_point: ext.impactPoint,
      estimated_speed_kmh: ext.estimatedSpeedKmh,
      police_report_number: ext.policeReportNumber,
      police_station: ext.policeStation,
      assessor_name: ext.assessorName,
      panel_beater: ext.panelBeater,
      repairer_company: ext.repairerCompany,
      quote_total_cents: ext.quoteTotalCents,
      labour_cost_cents: ext.labourCostCents,
      parts_cost_cents: ext.partsCostCents,
      damage_description: ext.damageDescription,
      structural_damage: ext.structuralDamage,
      airbag_deployment: ext.airbagDeployment,
      max_crush_depth_m: ext.maxCrushDepthM,
      total_damage_area_m2: ext.totalDamageAreaM2,
      third_party_vehicle: ext.thirdPartyVehicle,
      third_party_registration: ext.thirdPartyRegistration,
      damaged_components_count: ext.damagedComponents?.length ?? 0,
      uploaded_images_count: ext.uploadedImageUrls?.length ?? 0,
    };

    for (const [field, value] of Object.entries(fieldMap)) {
      structuredExtractions.push({
        fieldName: field,
        extractedValue: value,
        confidence: value === null || value === undefined ? "null" : (value === 0 || value === "" ? "low" : "high"),
        sourceDocument: sourceName,
      });
    }
  }

  // Step 4 — Claim Data Object
  const validationIssues = stage4Data?.issues || [];
  const completenessScore = stage4Data?.completenessScore || 0;
  const missingFields = stage4Data?.missingFields || [];

  // Step 5 — Engine Input Checks
  const engineInputChecks: DebugEngineInput[] = buildEngineInputChecks(claimRecord, stage6Data, stage7Data);

  // Step 6 — Engine Execution Results
  const engineResults: DebugEngineResult[] = buildEngineResults(
    stages, stage6Data, stage7Data, stage8Data, stage9Data, stage9bData, stage10Data
  );

  // Step 7 — Report Section Statuses
  const reportSectionStatuses: DebugReportSectionStatus[] = buildReportSectionStatuses(
    claimRecord, stage6Data, stage7Data, stage8Data, stage9Data, stage9bData, stage10Data
  );

  // Step 9 — System Health Summary
  const systemHealth = buildSystemHealth(
    stages, completenessScore, missingFields, errors, allAssumptions, allRecoveryActions
  );

  const totalDurationMs = Date.now() - pipelineStart;

  return {
    claimId: ctx.claimId,
    runTimestamp: new Date().toISOString(),
    totalDurationMs,
    documentRegistry,
    rawTextOutputs,
    structuredExtractions,
    claimDataObject: claimRecord,
    validationIssues,
    completenessScore,
    missingFields,
    engineInputChecks,
    engineResults,
    reportSectionStatuses,
    errorDiagnostics: errors,
    systemHealth,
    allAssumptions,
    allRecoveryActions,
    stageSummaries: stages,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

function formatDocType(type: string): string {
  const map: Record<string, string> = {
    claim_form: "Claim Form",
    police_report: "Police Report",
    repair_quote: "Repair Quote",
    vehicle_photos: "Vehicle Photos",
    supporting_document: "Supporting Document",
    unknown: "Unknown",
  };
  return map[type] || type;
}

function buildEngineInputChecks(
  claimRecord: ClaimRecord | null,
  stage6Data: Stage6Output | null,
  stage7Data: Stage7Output | null
): DebugEngineInput[] {
  const checks: DebugEngineInput[] = [];

  // Damage Engine
  const damageInputs: DebugEngineInput["inputs"] = [];
  const damageMissing: string[] = [];
  if (claimRecord) {
    const fields: Array<[string, any, boolean]> = [
      ["damage_description", claimRecord.damage.description, true],
      ["damaged_components", claimRecord.damage.components.length > 0 ? `${claimRecord.damage.components.length} components` : null, true],
      ["damage_images", claimRecord.damage.imageUrls.length > 0 ? `${claimRecord.damage.imageUrls.length} images` : null, false],
    ];
    for (const [name, value, required] of fields) {
      damageInputs.push({
        fieldName: name,
        value: value,
        status: value ? "present" : (required ? "missing" : "default"),
      });
      if (!value && required) damageMissing.push(name);
    }
  }
  checks.push({
    engineName: "Damage Analysis Engine",
    inputs: damageInputs,
    missingRequiredFields: damageMissing,
    canExecute: claimRecord !== null,
  });

  // Physics Engine
  const physicsInputs: DebugEngineInput["inputs"] = [];
  const physicsMissing: string[] = [];
  if (claimRecord) {
    const fields: Array<[string, any, boolean]> = [
      ["vehicle_mass_kg", claimRecord.vehicle.massKg, true],
      ["mass_tier", claimRecord.vehicle.massTier, false],
      ["impact_direction", claimRecord.accidentDetails.collisionDirection, true],
      ["estimated_speed_kmh", claimRecord.accidentDetails.estimatedSpeedKmh, false],
      ["max_crush_depth_m", claimRecord.accidentDetails.maxCrushDepthM, false],
      ["structural_damage", claimRecord.accidentDetails.structuralDamage, false],
      ["airbag_deployment", claimRecord.accidentDetails.airbagDeployment, false],
      ["damage_zones", stage6Data ? `${stage6Data.damageZones.length} zones` : null, true],
      ["damaged_parts", stage6Data ? `${stage6Data.damagedParts.length} parts` : null, true],
    ];
    for (const [name, value, required] of fields) {
      physicsInputs.push({
        fieldName: name,
        value: value,
        status: value !== null && value !== undefined ? "present" : (required ? "missing" : "default"),
      });
      if ((value === null || value === undefined) && required) physicsMissing.push(name);
    }
  }
  checks.push({
    engineName: "Physics Analysis Engine",
    inputs: physicsInputs,
    missingRequiredFields: physicsMissing,
    canExecute: claimRecord !== null && (claimRecord?.vehicle.massKg ?? 0) > 0,
  });

  // Fraud Engine
  const fraudInputs: DebugEngineInput["inputs"] = [];
  const fraudMissing: string[] = [];
  if (claimRecord) {
    const fields: Array<[string, any, boolean]> = [
      ["repair_quote_total", claimRecord.repairQuote.quoteTotalCents, false],
      ["vehicle_registration", claimRecord.vehicle.registration, false],
      ["panel_beater", claimRecord.repairQuote.repairerName || claimRecord.repairQuote.repairerCompany, false],
      ["damage_analysis", stage6Data ? "available" : null, true],
      ["physics_analysis", stage7Data ? "available" : null, true],
      ["damage_consistency_score", stage7Data?.damageConsistencyScore, false],
    ];
    for (const [name, value, required] of fields) {
      fraudInputs.push({
        fieldName: name,
        value: value,
        status: value !== null && value !== undefined ? "present" : (required ? "missing" : "default"),
      });
      if ((value === null || value === undefined) && required) fraudMissing.push(name);
    }
  }
  checks.push({
    engineName: "Fraud Analysis Engine",
    inputs: fraudInputs,
    missingRequiredFields: fraudMissing,
    canExecute: claimRecord !== null,
  });

  // Cost Engine
  const costInputs: DebugEngineInput["inputs"] = [];
  const costMissing: string[] = [];
  if (claimRecord) {
    const fields: Array<[string, any, boolean]> = [
      ["quote_total_cents", claimRecord.repairQuote.quoteTotalCents, false],
      ["labour_cost_cents", claimRecord.repairQuote.labourCostCents, false],
      ["parts_cost_cents", claimRecord.repairQuote.partsCostCents, false],
      ["line_items", claimRecord.repairQuote.lineItems.length > 0 ? `${claimRecord.repairQuote.lineItems.length} items` : null, false],
      ["damaged_parts", stage6Data ? `${stage6Data.damagedParts.length} parts` : null, true],
      ["market_region", claimRecord.marketRegion, true],
    ];
    for (const [name, value, required] of fields) {
      costInputs.push({
        fieldName: name,
        value: value,
        status: value !== null && value !== undefined ? "present" : (required ? "missing" : "default"),
      });
      if ((value === null || value === undefined) && required) costMissing.push(name);
    }
  }
  checks.push({
    engineName: "Cost Optimisation Engine",
    inputs: costInputs,
    missingRequiredFields: costMissing,
    canExecute: claimRecord !== null,
  });

  // Turnaround Time Engine
  checks.push({
    engineName: "Turnaround Time Engine",
    inputs: claimRecord ? [
      { fieldName: "market_region", value: claimRecord.marketRegion, status: "present" },
      { fieldName: "damage_severity", value: stage6Data?.overallSeverityScore ?? null, status: stage6Data ? "present" : "missing" },
      { fieldName: "cost_estimate", value: stage6Data ? "available" : null, status: stage6Data ? "present" : "missing" },
    ] : [],
    missingRequiredFields: [],
    canExecute: claimRecord !== null,
  });

  return checks;
}

function buildEngineResults(
  stages: Record<string, PipelineStageSummary>,
  stage6Data: Stage6Output | null,
  stage7Data: Stage7Output | null,
  stage8Data: Stage8Output | null,
  stage9Data: Stage9Output | null,
  stage9bData: TurnaroundTimeOutput | null,
  stage10Data: Stage10Output | null
): DebugEngineResult[] {
  const results: DebugEngineResult[] = [];

  // Damage Analysis
  const s6 = stages["6_damage_analysis"];
  results.push({
    engineName: "Damage Analysis Engine",
    executionStatus: s6?.status || "skipped",
    durationMs: s6?.durationMs || 0,
    reason: s6?.error,
    outputData: stage6Data ? {
      damaged_parts_count: stage6Data.damagedParts.length,
      damage_zones_count: stage6Data.damageZones.length,
      overall_severity_score: stage6Data.overallSeverityScore,
      structural_damage_detected: stage6Data.structuralDamageDetected,
      total_damage_area: stage6Data.totalDamageArea,
      parts: stage6Data.damagedParts.map(p => ({
        name: p.name, severity: p.severity, damageType: p.damageType, location: p.location,
      })),
    } : {},
    assumptionCount: s6?.assumptionCount || 0,
    recoveryActionCount: s6?.recoveryActionCount || 0,
  });

  // Physics Analysis
  const s7 = stages["7_physics"];
  results.push({
    engineName: "Physics Analysis Engine",
    executionStatus: s7?.status || "skipped",
    durationMs: s7?.durationMs || 0,
    reason: s7?.error,
    outputData: stage7Data ? {
      impact_force_kn: stage7Data.impactForceKn,
      impact_vector: stage7Data.impactVector,
      energy_distribution: stage7Data.energyDistribution,
      estimated_speed_kmh: stage7Data.estimatedSpeedKmh,
      delta_v_kmh: stage7Data.deltaVKmh,
      deceleration_g: stage7Data.decelerationG,
      accident_severity: stage7Data.accidentSeverity,
      damage_consistency_score: stage7Data.damageConsistencyScore,
      physics_executed: stage7Data.physicsExecuted,
    } : {},
    assumptionCount: s7?.assumptionCount || 0,
    recoveryActionCount: s7?.recoveryActionCount || 0,
  });

  // Fraud Analysis
  const s8 = stages["8_fraud"];
  results.push({
    engineName: "Fraud Analysis Engine",
    executionStatus: s8?.status || "skipped",
    durationMs: s8?.durationMs || 0,
    reason: s8?.error,
    outputData: stage8Data ? {
      fraud_risk_score: stage8Data.fraudRiskScore,
      fraud_risk_level: stage8Data.fraudRiskLevel,
      indicators_count: stage8Data.indicators.length,
      indicators: stage8Data.indicators,
      quote_deviation: stage8Data.quoteDeviation,
      damage_consistency_score: stage8Data.damageConsistencyScore,
    } : {},
    assumptionCount: s8?.assumptionCount || 0,
    recoveryActionCount: s8?.recoveryActionCount || 0,
  });

  // Cost Optimisation
  const s9 = stages["9_cost"];
  results.push({
    engineName: "Cost Optimisation Engine",
    executionStatus: s9?.status || "skipped",
    durationMs: s9?.durationMs || 0,
    reason: s9?.error,
    outputData: stage9Data ? {
      expected_repair_cost: (stage9Data.expectedRepairCostCents / 100).toFixed(2),
      quote_deviation_pct: stage9Data.quoteDeviationPct,
      recommended_range: {
        low: (stage9Data.recommendedCostRange.lowCents / 100).toFixed(2),
        high: (stage9Data.recommendedCostRange.highCents / 100).toFixed(2),
      },
      savings_opportunity: (stage9Data.savingsOpportunityCents / 100).toFixed(2),
      breakdown: {
        parts: (stage9Data.breakdown.partsCostCents / 100).toFixed(2),
        labour: (stage9Data.breakdown.labourCostCents / 100).toFixed(2),
        paint: (stage9Data.breakdown.paintCostCents / 100).toFixed(2),
        hidden_damage: (stage9Data.breakdown.hiddenDamageCostCents / 100).toFixed(2),
        total: (stage9Data.breakdown.totalCents / 100).toFixed(2),
      },
      market_region: stage9Data.marketRegion,
      currency: stage9Data.currency,
    } : {},
    assumptionCount: s9?.assumptionCount || 0,
    recoveryActionCount: s9?.recoveryActionCount || 0,
  });

  // Turnaround Time
  const s9b = stages["9b_turnaround"];
  results.push({
    engineName: "Turnaround Time Engine",
    executionStatus: s9b?.status || "skipped",
    durationMs: s9b?.durationMs || 0,
    reason: s9b?.error,
    outputData: stage9bData ? {
      estimated_repair_days: stage9bData.estimatedRepairDays,
      best_case_days: stage9bData.bestCaseDays,
      worst_case_days: stage9bData.worstCaseDays,
      confidence: stage9bData.confidence,
      breakdown: stage9bData.breakdown,
      bottlenecks: stage9bData.bottlenecks,
    } : {},
    assumptionCount: s9b?.assumptionCount || 0,
    recoveryActionCount: s9b?.recoveryActionCount || 0,
  });

  // Report Generation
  const s10 = stages["10_report"];
  results.push({
    engineName: "Report Generation",
    executionStatus: s10?.status || "skipped",
    durationMs: s10?.durationMs || 0,
    reason: s10?.error,
    outputData: stage10Data ? {
      sections_generated: 7,
      generated_at: stage10Data.generatedAt,
      confidence_score: stage10Data.confidenceScore,
      assumptions_count: stage10Data.assumptions.length,
      missing_documents_count: stage10Data.missingDocuments.length,
      missing_fields_count: stage10Data.missingFields.length,
      sections: [
        stage10Data.claimSummary.title,
        stage10Data.damageAnalysis.title,
        stage10Data.physicsReconstruction.title,
        stage10Data.costOptimisation.title,
        stage10Data.fraudRiskIndicators.title,
        stage10Data.turnaroundTimeEstimate.title,
        stage10Data.supportingImages.title,
      ],
    } : {},
    assumptionCount: s10?.assumptionCount || 0,
    recoveryActionCount: s10?.recoveryActionCount || 0,
  });

  return results;
}

function buildReportSectionStatuses(
  claimRecord: ClaimRecord | null,
  stage6Data: Stage6Output | null,
  stage7Data: Stage7Output | null,
  stage8Data: Stage8Output | null,
  stage9Data: Stage9Output | null,
  stage9bData: TurnaroundTimeOutput | null,
  stage10Data: Stage10Output | null
): DebugReportSectionStatus[] {
  const sections: DebugReportSectionStatus[] = [];

  // Claim Summary
  const claimFields = claimRecord ? [
    claimRecord.vehicle.make, claimRecord.vehicle.model,
    claimRecord.driver.claimantName, claimRecord.accidentDetails.date,
    claimRecord.accidentDetails.description, claimRecord.policeReport.reportNumber,
  ] : [];
  const claimPopulated = claimFields.filter(f => f !== null && f !== undefined).length;
  sections.push({
    sectionName: "Claim Summary",
    status: claimRecord ? (claimPopulated >= 4 ? "ok" : "partial") : "empty",
    dataSource: "Stage 5 — Claim Data Assembly",
    fieldCount: claimFields.length,
    populatedFieldCount: claimPopulated,
  });

  // Damage Analysis
  sections.push({
    sectionName: "Damage Analysis",
    status: stage6Data ? (stage6Data.damagedParts.length > 0 ? "ok" : "partial") : "missing_inputs",
    dataSource: "Stage 6 — Damage Analysis Engine",
    fieldCount: 5,
    populatedFieldCount: stage6Data ? 5 : 0,
  });

  // Physics Analysis
  sections.push({
    sectionName: "Physics Analysis",
    status: stage7Data?.physicsExecuted ? "ok" : (stage7Data ? "partial" : "missing_inputs"),
    dataSource: "Stage 7 — Physics Analysis Engine",
    fieldCount: 9,
    populatedFieldCount: stage7Data?.physicsExecuted ? 9 : (stage7Data ? 3 : 0),
  });

  // Cost Optimisation
  sections.push({
    sectionName: "Cost Optimisation",
    status: stage9Data ? (stage9Data.expectedRepairCostCents > 0 ? "ok" : "partial") : "missing_inputs",
    dataSource: "Stage 9 — Cost Optimisation Engine",
    fieldCount: 7,
    populatedFieldCount: stage9Data ? 7 : 0,
  });

  // Fraud Risk Indicators
  sections.push({
    sectionName: "Fraud Risk Indicators",
    status: stage8Data ? "ok" : "missing_inputs",
    dataSource: "Stage 8 — Fraud Analysis Engine",
    fieldCount: 6,
    populatedFieldCount: stage8Data ? 6 : 0,
  });

  // Turnaround Time Estimate
  sections.push({
    sectionName: "Turnaround Time Estimate",
    status: stage9bData ? "ok" : "missing_inputs",
    dataSource: "Stage 9b — Turnaround Time Analysis",
    fieldCount: 5,
    populatedFieldCount: stage9bData ? 5 : 0,
  });

  // Police Report Summary
  const hasPolice = claimRecord?.policeReport.reportNumber !== null;
  sections.push({
    sectionName: "Police Report Summary",
    status: hasPolice ? "ok" : (claimRecord ? "partial" : "empty"),
    dataSource: "Stage 3 — Structured Data Extraction",
    fieldCount: 2,
    populatedFieldCount: hasPolice ? 2 : (claimRecord?.policeReport.station ? 1 : 0),
  });

  return sections;
}

function buildSystemHealth(
  stages: Record<string, PipelineStageSummary>,
  completenessScore: number,
  missingFields: string[],
  errors: DebugErrorDiagnostic[],
  allAssumptions: Assumption[],
  allRecoveryActions: RecoveryAction[]
): DebugSystemHealth {
  const engineStages = ["6_damage_analysis", "7_physics", "8_fraud", "9_cost", "9b_turnaround", "10_report"];
  let successful = 0;
  let failed = 0;
  let skipped = 0;
  let degraded = 0;

  for (const key of engineStages) {
    const stage = stages[key];
    if (!stage || stage.status === "skipped") skipped++;
    else if (stage.status === "success") successful++;
    else if (stage.status === "degraded") degraded++;
    else failed++;
  }

  const total = engineStages.length;
  const successRate = total > 0 ? Math.round(((successful + degraded) / total) * 100) : 0;

  const recommendedFixes: string[] = [];
  if (completenessScore < 70) {
    recommendedFixes.push("Data extraction completeness is below 70%. Review the source documents for readability and re-upload if necessary.");
  }
  if (missingFields.includes("vehicleMake") || missingFields.includes("vehicleModel")) {
    recommendedFixes.push("Vehicle make/model not extracted. Ensure the claim form or assessment report contains vehicle details.");
  }
  if (missingFields.includes("quoteTotalCents")) {
    recommendedFixes.push("Quote total not detected. Cost optimisation will use estimated values. Upload a repair quotation document.");
  }
  if (missingFields.includes("policeReportNumber")) {
    recommendedFixes.push("Police report number not found. Upload the police report as a separate document.");
  }
  if (allAssumptions.length > 5) {
    recommendedFixes.push(`${allAssumptions.length} assumptions were made during processing. Review the assumptions list to verify accuracy.`);
  }
  for (const err of errors) {
    if (!recommendedFixes.includes(err.recommendation)) {
      recommendedFixes.push(err.recommendation);
    }
  }

  let overallStatus: "healthy" | "degraded" | "critical" = "healthy";
  if (failed > 0 || completenessScore < 50) overallStatus = "critical";
  else if (skipped > 0 || degraded > 0 || completenessScore < 70) overallStatus = "degraded";

  return {
    dataExtractionCompleteness: completenessScore,
    engineSuccessRate: successRate,
    totalEngines: total,
    successfulEngines: successful,
    failedEngines: failed,
    skippedEngines: skipped,
    degradedEngines: degraded,
    missingFieldsList: missingFields,
    recommendedFixes,
    overallStatus,
    totalAssumptions: allAssumptions.length,
    totalRecoveryActions: allRecoveryActions.length,
  };
}
