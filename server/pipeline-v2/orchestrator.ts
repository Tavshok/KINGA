/**
 * pipeline-v2/orchestrator.ts
 *
 * Pipeline Orchestrator — Self-Healing Edition
 *
 * Wires all stages together. NEVER aborts — every stage either succeeds,
 * degrades, or produces default output. Assumptions and recovery actions
 * are collected from all stages and passed to Stage 10 for the final report.
 */

import type {
  PipelineContext,
  PipelineRunSummary,
  PipelineStageSummary,
  ClaimRecord,
  Stage1Output,
  Stage2Output,
  Stage3Output,
  Stage4Output,
  Stage5Output,
  Stage6Output,
  Stage7Output,
  Stage8Output,
  Stage9Output,
  TurnaroundTimeOutput,
  Stage10Output,
  Assumption,
  RecoveryAction,
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

/**
 * Run the full self-healing pipeline.
 * NEVER throws — always returns a result with whatever data was produced.
 */
export async function runPipelineV2(
  ctx: PipelineContext
): Promise<{
  summary: PipelineRunSummary;
  claimRecord: ClaimRecord | null;
  report: Stage10Output | null;
  damageAnalysis: Stage6Output | null;
  physicsAnalysis: Stage7Output | null;
  fraudAnalysis: Stage8Output | null;
  costAnalysis: Stage9Output | null;
  turnaroundAnalysis: TurnaroundTimeOutput | null;
}> {
  const pipelineStart = Date.now();
  const stages: Record<string, PipelineStageSummary> = {};
  const allAssumptions: Assumption[] = [];
  const allRecoveryActions: RecoveryAction[] = [];

  ctx.log("Pipeline", `Starting self-healing pipeline for claim ${ctx.claimId}`);

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
  let claimRecord: ClaimRecord | null = null;

  // Helper to record stage summary
  const recordStage = (key: string, result: { status: string; durationMs: number; savedToDb: boolean; error?: string; assumptions?: Assumption[]; recoveryActions?: RecoveryAction[]; degraded?: boolean }) => {
    stages[key] = {
      status: result.status as any,
      durationMs: result.durationMs,
      savedToDb: result.savedToDb,
      error: result.error,
      degraded: result.degraded || false,
      assumptionCount: result.assumptions?.length || 0,
      recoveryActionCount: result.recoveryActions?.length || 0,
    };
    if (result.assumptions) allAssumptions.push(...result.assumptions);
    if (result.recoveryActions) allRecoveryActions.push(...result.recoveryActions);
  };

  // ── STAGE 1: Document Ingestion ──────────────────────────────────────
  const s1 = await runIngestionStage(ctx);
  recordStage("1_ingestion", s1);
  stage1Data = s1.data; // May be degraded but always has data

  // ── STAGE 2: OCR & Text Extraction ───────────────────────────────────
  if (stage1Data) {
    const s2 = await runExtractionStage(ctx, stage1Data);
    recordStage("2_extraction", s2);
    stage2Data = s2.data;
  } else {
    stages["2_extraction"] = { status: "skipped", durationMs: 0, savedToDb: false, error: "No Stage 1 data", degraded: true, assumptionCount: 0, recoveryActionCount: 0 };
  }

  // ── STAGE 3: Structured Data Extraction ──────────────────────────────
  if (stage1Data && stage2Data) {
    const s3 = await runStructuredExtractionStage(ctx, stage1Data, stage2Data);
    recordStage("3_structured_extraction", s3);
    stage3Data = s3.data;
  } else {
    stages["3_structured_extraction"] = { status: "skipped", durationMs: 0, savedToDb: false, error: "No Stage 1/2 data", degraded: true, assumptionCount: 0, recoveryActionCount: 0 };
  }

  // ── STAGE 4: Data Validation ─────────────────────────────────────────
  if (stage3Data) {
    const s4 = await runValidationStage(ctx, stage3Data);
    recordStage("4_validation", s4);
    stage4Data = s4.data;
  } else {
    // Self-healing: build minimal Stage4 from DB claim data
    ctx.log("Stage 4", "DEGRADED: No Stage 3 data — building minimal validation from DB");
    stage4Data = buildMinimalStage4(ctx);
    stages["4_validation"] = { status: "degraded", durationMs: 0, savedToDb: false, error: "No Stage 3 data — used DB fallback", degraded: true, assumptionCount: 1, recoveryActionCount: 1 };
    allAssumptions.push({
      field: "validatedFields",
      assumedValue: "minimal_from_db",
      reason: "Structured extraction failed. Built minimal validated fields from database claim record.",
      strategy: "default_value",
      confidence: 20,
      stage: "Stage 4",
    });
  }

  // ── STAGE 5: Claim Data Assembly ─────────────────────────────────────
  if (stage4Data) {
    const s5 = await runAssemblyStage(ctx, stage4Data);
    recordStage("5_assembly", s5);
    stage5Data = s5.data;
    if (stage5Data) {
      claimRecord = stage5Data.claimRecord;
    }
  }

  if (!claimRecord) {
    // Last resort: build minimal ClaimRecord from DB
    ctx.log("Stage 5", "DEGRADED: Assembly failed — building minimal ClaimRecord from DB");
    claimRecord = buildMinimalClaimRecord(ctx);
    stages["5_assembly"] = { status: "degraded", durationMs: 0, savedToDb: false, error: "Assembly failed — used DB fallback", degraded: true, assumptionCount: 1, recoveryActionCount: 1 };
    allAssumptions.push({
      field: "claimRecord",
      assumedValue: "minimal_from_db",
      reason: "Claim assembly failed completely. Built minimal ClaimRecord from database fields only.",
      strategy: "default_value",
      confidence: 10,
      stage: "Stage 5",
    });
  }

  // ── STAGE 6: Damage Analysis ─────────────────────────────────────────
  const s6 = await runDamageAnalysisStage(ctx, claimRecord);
  recordStage("6_damage_analysis", s6);
  stage6Data = s6.data; // Always has data (self-healing)

  // ── STAGE 7: Physics Analysis ────────────────────────────────────────
  const s7 = await runPhysicsStage(ctx, claimRecord, stage6Data!);
  recordStage("7_physics", s7);
  stage7Data = s7.data; // Always has data (self-healing)

  // ── STAGE 8: Fraud Analysis ──────────────────────────────────────────
  const s8 = await runFraudAnalysisStage(ctx, claimRecord, stage6Data!, stage7Data!);
  recordStage("8_fraud", s8);
  stage8Data = s8.data; // Always has data (self-healing)

  // ── STAGE 9: Cost Optimisation ───────────────────────────────────────
  const s9 = await runCostOptimisationStage(ctx, claimRecord, stage6Data!, stage7Data!);
  recordStage("9_cost", s9);
  stage9Data = s9.data; // Always has data (self-healing)

  // ── STAGE 9b: Turnaround Time Analysis ───────────────────────────────
  const s9b = await runTurnaroundTimeStage(ctx, claimRecord, stage6Data!, stage9Data);
  recordStage("9b_turnaround", s9b);
  stage9bData = s9b.data; // Always has data (self-healing)

  // ── STAGE 10: Report Generation ──────────────────────────────────────
  const s10 = await runReportGenerationStage(
    ctx, claimRecord,
    stage6Data, stage7Data, stage8Data, stage9Data, stage9bData,
    allAssumptions
  );
  recordStage("10_report", s10);
  stage10Data = s10.data;

  ctx.log("Pipeline", `Pipeline complete. Total: ${Date.now() - pipelineStart}ms, Assumptions: ${allAssumptions.length}, Recoveries: ${allRecoveryActions.length}`);

  return buildResult(
    stages, pipelineStart, ctx.claimId,
    claimRecord, stage10Data,
    stage6Data, stage7Data, stage8Data, stage9Data, stage9bData
  );
}

function buildResult(
  stages: Record<string, PipelineStageSummary>,
  pipelineStart: number,
  claimId: number,
  claimRecord: ClaimRecord | null,
  report: Stage10Output | null,
  damageAnalysis: Stage6Output | null,
  physicsAnalysis: Stage7Output | null,
  fraudAnalysis: Stage8Output | null,
  costAnalysis: Stage9Output | null,
  turnaroundAnalysis: TurnaroundTimeOutput | null = null
) {
  const allSaved = Object.values(stages).every(s => s.savedToDb || s.status === "skipped");
  return {
    summary: {
      claimId,
      stages,
      allSavedToDb: allSaved,
      totalDurationMs: Date.now() - pipelineStart,
      completedAt: new Date().toISOString(),
    },
    claimRecord,
    report,
    damageAnalysis,
    physicsAnalysis,
    fraudAnalysis,
    costAnalysis,
    turnaroundAnalysis,
  };
}

/**
 * Build minimal Stage4Output from DB claim data when extraction pipeline fails.
 */
function buildMinimalStage4(ctx: PipelineContext): Stage4Output {
  return {
    validatedFields: {
      claimId: String(ctx.claimId),
      claimantName: ctx.claim.claimantName || null,
      driverName: ctx.claim.driverName || null,
      vehicleMake: ctx.claim.vehicleMake || null,
      vehicleModel: ctx.claim.vehicleModel || null,
      vehicleYear: ctx.claim.vehicleYear || null,
      vehicleRegistration: ctx.claim.vehicleRegistration || null,
      vehicleVin: null,
      vehicleColour: null,
      vehicleEngineNumber: null,
      vehicleMileage: ctx.claim.vehicleMileage || null,
      accidentDate: ctx.claim.accidentDate || null,
      accidentLocation: ctx.claim.accidentLocation || null,
      accidentDescription: ctx.claim.incidentDescription || null,
      accidentType: null,
      incidentType: ctx.claim.incidentType || null,
      impactPoint: null,
      estimatedSpeedKmh: null,
      maxCrushDepthM: null,
      totalDamageAreaM2: null,
      structuralDamage: null,
      airbagDeployment: null,
      policeReportNumber: null,
      policeStation: null,
      damageDescription: null,
      damagedComponents: [],
      panelBeater: null,
      repairerCompany: null,
      assessorName: null,
      quoteTotalCents: null,
      labourCostCents: null,
      partsCostCents: null,
      uploadedImageUrls: [],
      thirdPartyVehicle: null,
      thirdPartyRegistration: null,
      sourceDocumentIndex: 0,
    },
    completenessScore: 10,
    missingFields: ["most_fields"],
    issues: [{
      field: "all",
      severity: "critical" as const,
      message: "Extraction pipeline failed \u2014 using database fields only",
      secondaryExtractionAttempted: false,
      resolved: false,
    }],
  };
}

/**
 * Build minimal ClaimRecord from DB claim data when assembly fails.
 */
function buildMinimalClaimRecord(ctx: PipelineContext): ClaimRecord {
  return {
    claimId: ctx.claimId,
    tenantId: ctx.tenantId,
    vehicle: {
      make: ctx.claim.vehicleMake || "Unknown",
      model: ctx.claim.vehicleModel || "Unknown",
      year: ctx.claim.vehicleYear || null,
      registration: ctx.claim.vehicleRegistration || null,
      vin: null, colour: null, engineNumber: null,
      mileageKm: null, bodyType: "sedan" as any, powertrain: "ice" as any,
      massKg: 1400, massTier: "not_available" as const, valueUsd: null,
    },
    driver: { name: ctx.claim.driverName || null, claimantName: ctx.claim.claimantName || null },
    accidentDetails: {
      date: ctx.claim.accidentDate || null, location: null, description: null,
      incidentType: "collision", collisionDirection: "unknown",
      impactPoint: null, estimatedSpeedKmh: null,
      maxCrushDepthM: null, totalDamageAreaM2: null,
      structuralDamage: false, airbagDeployment: false,
    },
    policeReport: { reportNumber: null, station: null },
    damage: { description: null, components: [], imageUrls: ctx.damagePhotoUrls || [] },
    repairQuote: {
      repairerName: null, repairerCompany: null, assessorName: null,
      quoteTotalCents: null, labourCostCents: null, partsCostCents: null, lineItems: [],
    },
    dataQuality: { completenessScore: 5, missingFields: ["all"], validationIssues: [] },
    marketRegion: "ZW",
    assumptions: [{
      field: "claimRecord",
      assumedValue: "minimal_from_db",
      reason: "Claim assembly failed completely. Built minimal ClaimRecord from database fields only.",
      strategy: "default_value" as const,
      confidence: 10,
      stage: "Stage 5",
    }],
  };
}
