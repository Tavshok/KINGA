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
import { runUnifiedStage7 } from "./stage-7-unified";
import { scoreClaimComplexity, type ComplexityScore } from "./claimComplexityScorer";
import { runFraudAnalysisStage } from "./stage-8-fraud";
import { aggregateConfidence, buildConfidenceAggregationInput } from "./confidenceAggregationEngine";
import { runCostOptimisationStage } from "./stage-9-cost";
import { runTurnaroundTimeStage } from "./stage-9b-turnaround";
import { runReportGenerationStage } from "./stage-10-report";
import { resolveSourceTruth, getResolvedDirection } from "./sourceTruthResolver";
import {
  validateDamagePhysicsCoherence,
  buildCoherenceConsistencyInput,
  buildCoherenceFraudInput,
  type DamagePhysicsCoherenceResult,
} from "./damagePhysicsCoherence";
import {
  validateCostRealism,
  mergeValidatedCost,
} from "./costRealismValidator";
import {
  buildCausalChain,
  type CausalChainOutput,
} from "./causalChainBuilder";
import {
  computeEvidenceBundle,
  type EvidenceBundle,
} from "./evidenceStrengthScorer";
import { buildRealismBundle, type RealismBundle } from "./outputRealismValidator";
import {
  buildBenchmarkBundle,
  type BenchmarkBundle,
  type BenchmarkInputContext,
  type LiveBenchmarkStats,
} from "./benchmarkDeviationEngine";
import {
  computeConsensus,
  type ConsensusResult,
} from "./crossEngineConsensus";
import {
  runCausalReasoningEngine,
  type CausalVerdict,
} from "./stage-7b-causal-reasoning";
import {
  buildEvidenceRegistry,
  type EvidenceRegistry,
} from "./evidenceRegistryEngine";
import {
  buildValidatedOutcomeInput,
  recordValidatedOutcome,
  type ValidatedOutcomeResult,
} from "./validatedOutcomeRecorder";
import {
  generateCaseSignature,
  inferCostTier,
  type CaseSignatureOutput,
} from "./caseSignatureGenerator";
import {
  verifyDocumentRead,
  shouldHaltPipeline,
  type DocumentReadVerificationResult,
} from "./documentReadVerificationEngine";
import {
  runPreGenerationConsistencyCheck,
  type PreGenerationCheckResult,
} from "./preGenerationConsistencyCheck";
import {
  evaluateClaimDecision,
  type ClaimsDecisionOutput,
} from "./claimsDecisionAuthority";
import {
  checkReportReadiness,
  type ReportReadinessResult,
} from "./reportReadinessGate";
// runIncidentNarrativeEngine is now called inside runUnifiedStage7
import { valuateVehicle } from "../services/vehicleValuation";
import { estimateMileageFromYear } from "../services/mileageEstimation";
import {
  createVehicleMarketValuation,
  getAssessorEvaluationByClaimId,
  getDb,
} from "../db";
import { claims } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

/**
 * Parse a mileage string like "85 000 km", "85000", "85,000 km" → number (km).
 * Returns null if unparseable.
 */
function parseMileageString(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^\d.]/g, "");
  const n = parseFloat(cleaned);
  if (isNaN(n) || n <= 0 || n > 2_000_000) return null;
  return Math.round(n);
}

/**
 * Auto-trigger vehicle valuation at the end of the pipeline.
 * Uses actual mileage from claim form if available, otherwise estimates.
 * Non-fatal — any error is logged and ignored.
 */
async function runAutoValuation(
  ctx: PipelineContext,
  log: (stage: string, msg: string) => void
): Promise<void> {
  try {
    const claimId = ctx.claimId;
    const claim = ctx.claim;
    if (!claim.vehicleMake || !claim.vehicleModel) {
      log("VALUATION", "Skipping auto-valuation: vehicle make/model not available");
      return;
    }
    const parsedMileage = parseMileageString(claim.vehicleMileage);
    let resolvedMileage: number;
    let mileageEstimated = false;
    let mileageWarning: string | null = null;
    if (parsedMileage && parsedMileage > 0) {
      resolvedMileage = parsedMileage;
      log("VALUATION", `Using claim form mileage: ${resolvedMileage.toLocaleString()} km`);
    } else {
      const vehicleYear = claim.vehicleYear || new Date().getFullYear();
      const estimation = estimateMileageFromYear(vehicleYear, claim.vehicleMake, claim.vehicleModel);
      resolvedMileage = estimation.assumed_mileage_used;
      mileageEstimated = true;
      mileageWarning = estimation.warning_message;
      log("VALUATION", `Mileage not on claim form — estimated ${resolvedMileage.toLocaleString()} km from year/model`);
    }
    const evaluation = await getAssessorEvaluationByClaimId(claimId);
    const repairCost = evaluation?.estimatedRepairCost;
    const valuation = await valuateVehicle(
      {
        make: claim.vehicleMake,
        model: claim.vehicleModel,
        year: claim.vehicleYear || new Date().getFullYear(),
        mileage: resolvedMileage,
        condition: "good",
        country: "Zimbabwe",
      },
      repairCost ?? undefined
    );
    if (mileageEstimated && mileageWarning) {
      valuation.confidenceScore = Math.max(10, (valuation.confidenceScore ?? 50) - 20);
      valuation.notes = [`⚠️ MILEAGE ESTIMATED: ${mileageWarning}`, ...valuation.notes];
    }
    await createVehicleMarketValuation({
      claimId,
      vehicleMake: claim.vehicleMake,
      vehicleModel: claim.vehicleModel,
      vehicleYear: claim.vehicleYear || new Date().getFullYear(),
      vehicleRegistration: claim.vehicleRegistration ?? undefined,
      mileage: resolvedMileage,
      condition: "good",
      estimatedMarketValue: valuation.estimatedMarketValue,
      valuationMethod: valuation.valuationMethod,
      confidenceScore: valuation.confidenceScore,
      dataPointsCount: valuation.dataPointsCount,
      priceRange: JSON.stringify(valuation.priceRange),
      conditionAdjustment: valuation.conditionAdjustment,
      mileageAdjustment: valuation.mileageAdjustment,
      marketTrendAdjustment: valuation.marketTrendAdjustment,
      finalAdjustedValue: valuation.finalAdjustedValue,
      isTotalLoss: valuation.isTotalLoss ? 1 : 0,
      totalLossThreshold: valuation.totalLossThreshold.toString(),
      repairCostToValueRatio: valuation.repairCostToValueRatio?.toString(),
      valuationDate: valuation.valuationDate,
      validUntil: valuation.validUntil,
      valuedBy: 0, // 0 = system/pipeline
      notes: valuation.notes.join("\n"),
    });
    const db = await getDb();
    if (db) {
      await db.update(claims).set({ vehicleMarketValue: valuation.finalAdjustedValue }).where(eq(claims.id, claimId));
    }
    log("VALUATION", `Auto-valuation complete: $${(valuation.finalAdjustedValue / 100).toFixed(2)} ZAR${valuation.isTotalLoss ? " — TOTAL LOSS" : ""}${mileageEstimated ? " (mileage estimated)" : ""}`);
  } catch (err) {
    log("VALUATION", `Auto-valuation error (non-fatal): ${String(err)}`);
  }
}

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
  causalVerdict: CausalVerdict | null;
  enrichedPhotosJson: string | null;
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
  let causalChain: CausalChainOutput | null = null;
  let evidenceBundle: EvidenceBundle | null = null;
  let realismBundle: RealismBundle | null = null;
  let benchmarkBundle: BenchmarkBundle | null = null;
  let consensusResult: ConsensusResult | null = null;
  let causalVerdict: CausalVerdict | null = null;
  let stage10Data: Stage10Output | null = null;
  let claimRecord: ClaimRecord | null = null;
  let evidenceRegistryData: EvidenceRegistry | null = null;
  let validatedOutcomeResult: ValidatedOutcomeResult | null = null;
  let caseSignatureResult: CaseSignatureOutput | null = null;
  let documentVerificationResult: DocumentReadVerificationResult | null = null;

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
  // ── STAGE 2: OCR & Text Extraction ─────────────────────────────────────
  if (stage1Data) {
    // Update status to 'extracting' so the UI shows progress (not stuck at 'parsing')
    try {
      const dbInst = await getDb();
      if (dbInst) {
        await dbInst.update(claims).set({ documentProcessingStatus: 'extracting', updatedAt: new Date().toISOString() }).where(eq(claims.id, ctx.claimId));
      }
    } catch (_statusErr) { /* non-fatal */ }
    const s2 = await runExtractionStage(ctx, stage1Data);
    recordStage("2_extraction", s2);
    stage2Data = s2.data;
  } else {
    stages["2_extraction"] = { status: "skipped", durationMs: 0, savedToDb: false, error: "No Stage 1 data", degraded: true, assumptionCount: 0, recoveryActionCount: 0 };
  }

  // ── STAGE 0a: Document Read Verification ───────────────────────────
  // Runs BEFORE any analysis. Confirms the document was successfully
  // read and understood. Halts pipeline if document is unreadable.
  if (stage2Data && stage2Data.extractedTexts.length > 0) {
    try {
      const combinedText = stage2Data.extractedTexts
        .map((et) => et.rawText ?? "")
        .join("\n\n");
      documentVerificationResult = await verifyDocumentRead(combinedText);
      const v = documentVerificationResult;
      ctx.log(
        "Stage 0a (Document Verification)",
        `status=${v.status}, confidence=${v.confidence}, pages=${v.pages_detected}, ` +
        `fields=${Object.entries(v.key_fields_detected).filter(([, ok]) => ok).map(([k]) => k).join(",") || "none"}, ` +
        `missing=${v.missing_critical_fields.join(",") || "none"}, reason="${v.reason}"`
      );
      if (shouldHaltPipeline(documentVerificationResult)) {
        ctx.log(
          "Stage 0a (Document Verification)",
          `HALT: Document verification ${v.status} (confidence ${v.confidence}) — pipeline halted. ` +
          `Missing: ${v.missing_critical_fields.join(", ") || "none"}. Reason: ${v.reason}`
        );
        // Mark all remaining stages as skipped and return early
        const haltMsg = `Document read ${v.status.toLowerCase()} — ${v.reason}`;
        for (const sk of ["0_evidence_registry", "3_structured_extraction", "4_validation", "5_assembly", "6_damage", "7_physics", "8_fraud", "9_cost", "9b_turnaround", "10_report"]) {
          stages[sk] = { status: "skipped", durationMs: 0, savedToDb: false, error: haltMsg, degraded: true, assumptionCount: 0, recoveryActionCount: 0 };
        }
        return {
          summary: {
            claimId: ctx.claimId,
            pipelineVersion: "v2",
            totalDurationMs: Date.now() - pipelineStart,
            stages,
            totalAssumptions: 0,
            totalRecoveryActions: 0,
            overallStatus: "failed",
            failureReason: haltMsg,
            documentVerification: documentVerificationResult,
          } as any,
          claimRecord: null,
          report: null,
          damageAnalysis: null,
          physicsAnalysis: null,
          fraudAnalysis: null,
          costAnalysis: null,
          turnaroundAnalysis: null,
          causalVerdict: null,
          enrichedPhotosJson: null,
        };
      }
    } catch (err) {
      ctx.log("Stage 0a (Document Verification)", `Verification failed (non-fatal): ${String(err)} — continuing pipeline`);
    }
  } else {
    ctx.log("Stage 0a (Document Verification)", "Skipped — no Stage 2 text available.");
  }

  // ── STAGE 0: Evidence Registry ─────────────────────────────────────
  // Pure document inventory — classifies each evidence item as PRESENT,
  // ABSENT, or UNKNOWN. Runs after Stage 2 so raw text is available.
  // Does NOT interpret or analyse — only inventories.
  if (stage1Data) {
    try {
      evidenceRegistryData = buildEvidenceRegistry(stage1Data, stage2Data ?? null);
      (ctx as any).evidenceRegistry = evidenceRegistryData;
      const reg = evidenceRegistryData.evidence_registry;
      const comp = evidenceRegistryData.completeness_check;
      ctx.log(
        "Stage 0 (Evidence Registry)",
        `Registry built: pages=${evidenceRegistryData.document_summary.total_pages}, ` +
        `images=${evidenceRegistryData.document_summary.estimated_image_pages}, ` +
        `claim_form=${reg.claim_form}, driver_stmt=${reg.driver_statement}, ` +
        `photos=${reg.damage_photos}, quote=${reg.repair_quote}, ` +
        `assessor=${reg.assessor_report}, police=${reg.police_report_info}, ` +
        `signature=${reg.digital_signature}. ` +
        `Completeness: ${comp.recommended_action} ` +
        `(missing=${comp.missing_mandatory_items.join(",") || "none"}, ` +
        `unknown=${comp.unknown_items.join(",") || "none"})`
      );
    } catch (err) {
      ctx.log("Stage 0 (Evidence Registry)", `Evidence registry build failed (non-fatal): ${String(err)}`);
    }
  } else {
    ctx.log("Stage 0 (Evidence Registry)", "Skipped — no Stage 1 data available.");
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
    const s4 = await runValidationStage(ctx, stage3Data, stage2Data ?? undefined);
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

  // ── COMPLEXITY GATE: Classify claim tier after assembly ─────────────────
  // Deterministic, <1ms. Controls which optional stages are skipped.
  let complexityScore: ComplexityScore | null = null;
  if (claimRecord) {
    complexityScore = scoreClaimComplexity(claimRecord);
    ctx.log(
      "ComplexityGate",
      `Tier: ${complexityScore.tier} (score: ${complexityScore.score}/100). ` +
      `Skip 7b Pass 2: ${complexityScore.skipStage7bPass2}. ` +
      `Reasons: ${complexityScore.reasons.join("; ")}`
    );
  }

  // ── STAGE 6: Damage Analysis ─────────────────────────────────────────
  const s6 = await runDamageAnalysisStage(ctx, claimRecord);
  recordStage("6_damage_analysis", s6);
  stage6Data = s6.data; // Always has data (self-healing)

  // ── SOURCE TRUTH RESOLUTION (Stage 6 → Stage 7) ─────────────────────
  // Resolve direction/zone/severity conflicts across photo and document sources.
  // Physics is not yet available; will re-resolve with full priority after Stage 7.
  const preTruthResolution = resolveSourceTruth({
    physicsOutput: null,
    damageAnalysis: stage6Data,
    claimRecord,
  });
  if (claimRecord && preTruthResolution.resolution_applied) {
    claimRecord = {
      ...claimRecord,
      accidentDetails: {
        ...claimRecord.accidentDetails,
        collisionDirection: getResolvedDirection(preTruthResolution),
      },
    };
    ctx.log(
      "TruthResolver",
      `Pre-physics: ${preTruthResolution.conflicts.length} conflict(s). Dominant: ${preTruthResolution.dominant_source}. ` +
        preTruthResolution.conflicts.map((c) => `[${c.source}] ${c.issue} -> ${c.resolution}`).join(" | ")
    );
  }

  // ── STAGE 7 (UNIFIED): Physics + Severity Consensus + Causal Reasoning + Narrative ───
  // Single function call replacing the sequential cluster of:
  //   Stage 7 (physics), Stage 7b Pass 1 (causal), Stage 7c (severity), Stage 7e (narrative)
  // Stage 7b Pass 2 (re-run with fraud+cost scores) remains separate below.
  const s7Unified = await runUnifiedStage7(
    ctx,
    claimRecord!,
    stage6Data!,
    null, // preRunPattern — computed inside physics engine
    null, // preRunAnimal — computed inside physics engine
    ctx.damagePhotoUrls ?? []
  );
  recordStage("7_unified", s7Unified);
  stage7Data = s7Unified.data?.physicsAnalysis ?? null;
  causalVerdict = s7Unified.data?.causalVerdict ?? null;

  // Attach narrative analysis to claimRecord so Stage 8 fraud engine can consume it
  if (s7Unified.data?.narrativeAnalysis && claimRecord) {
    claimRecord = {
      ...claimRecord,
      accidentDetails: {
        ...claimRecord.accidentDetails,
        narrativeAnalysis: s7Unified.data.narrativeAnalysis,
      },
    };
  }

  // If causal engine inferred a better collision direction, update claimRecord
  if (
    causalVerdict?.inferredCollisionDirection &&
    causalVerdict.inferredCollisionDirection !== "unknown" &&
    claimRecord?.accidentDetails?.collisionDirection === "unknown"
  ) {
    claimRecord = {
      ...claimRecord,
      accidentDetails: {
        ...claimRecord.accidentDetails,
        collisionDirection: causalVerdict.inferredCollisionDirection,
      },
    };
    ctx.log("Stage 7 (Unified)", `Updated collision direction to '${causalVerdict.inferredCollisionDirection}' from causal reasoning.`);
  }

  ctx.log(
    "Stage 7 (Unified)",
    `Physics: severity=${stage7Data?.accidentSeverity ?? "N/A"}, force=${stage7Data?.impactForceKn?.toFixed(1) ?? "N/A"} kN. ` +
    `Causal: cause="${causalVerdict?.inferredCause?.substring(0, 60) ?? "N/A"}", ` +
    `plausibility=${causalVerdict?.plausibilityScore ?? "N/A"}% (${causalVerdict?.plausibilityBand ?? "N/A"}), ` +
    `fraudFlag=${causalVerdict?.flagForFraud ?? false}. ` +
    `Narrative: verdict=${s7Unified.data?.narrativeAnalysis?.consistency_verdict ?? "N/A"}, ` +
    `signals=${s7Unified.data?.narrativeAnalysis?.fraud_signals?.length ?? 0}. ` +
    `Status: ${s7Unified.status}.`
  );

  // ── POST-PHYSICS TRUTH RE-RESOLUTION ─────────────────────────────────
  // Now that physics output is available, re-resolve with all three sources.
  // Physics (HIGH priority) overrides photo/document on any conflict.
  // Downstream stages 8, 9, 9b, 10 MUST use the resolved claimRecord.
  const postTruthResolution = resolveSourceTruth({
    physicsOutput: stage7Data,
    damageAnalysis: stage6Data,
    claimRecord,
  });
  if (claimRecord && postTruthResolution.resolution_applied) {
    claimRecord = {
      ...claimRecord,
      accidentDetails: {
        ...claimRecord.accidentDetails,
        collisionDirection: getResolvedDirection(postTruthResolution),
      },
    };
    ctx.log(
      "TruthResolver",
      `Post-physics: ${postTruthResolution.conflicts.length} conflict(s). Dominant: ${postTruthResolution.dominant_source}. ` +
        postTruthResolution.conflicts.map((c) => `[${c.source}] ${c.issue} -> ${c.resolution}`).join(" | ")
    );
  }

  // ── STAGE 35: Damage-Physics Coherence Validation ───────────────────
  // Validates that detected damage zones are physically consistent with the
  // impact direction from Stage 7. Results feed into consistency and fraud engines.
  const coherenceResult: DamagePhysicsCoherenceResult = validateDamagePhysicsCoherence(
    stage6Data,
    stage7Data
  );
  if (coherenceResult.has_mismatch) {
    const consistencyInput = buildCoherenceConsistencyInput(coherenceResult);
    const fraudInput = buildCoherenceFraudInput(coherenceResult);
    ctx.log(
      "CoherenceValidator",
      `${coherenceResult.mismatches.length} zone-direction mismatch(es). ` +
        `High-severity: ${coherenceResult.high_severity_mismatch_count}. ` +
        `Confidence reduction: ×${coherenceResult.confidence_reduction_factor}. ` +
        `Fraud penalty: ${coherenceResult.fraud_penalty_triggered}. ` +
        `ConsistencyInput.highSeverityCount=${consistencyInput.highSeverityMismatchCount}. ` +
        `FraudInput.highConflicts=${fraudInput.high_severity_conflicts.length}.`
    );
  }

  // ── STAGE 8: Fraud Analysis ──────────────────────────────────────────
  // ── STAGE 8 ‖ STAGE 9: Fraud Analysis and Cost Optimisation (PARALLEL) ──────────
  // S8 and S9 share identical inputs (ClaimRecord + S6 + S7 + S3) and have no
  // dependency on each other. Running them in parallel saves ~15–30s per claim.
  // Stage 7d (confidence aggregation) and Stage 7b re-run both need S8 output
  // and therefore run AFTER this Promise.all resolves.
  ctx.log("Pipeline", "Starting S8 (fraud) ‖ S9 (cost) in parallel...");
  const [s8, s9] = await Promise.all([
    runFraudAnalysisStage(ctx, claimRecord, stage6Data!, stage7Data!, stage3Data ?? undefined),
    runCostOptimisationStage(ctx, claimRecord, stage6Data!, stage7Data!, stage3Data ?? undefined),
  ]);
  recordStage("8_fraud", s8);
  stage8Data = s8.data; // Always has data (self-healing)
  recordStage("9_cost", s9);
  stage9Data = s9.data; // Always has data (self-healing)
  ctx.log("Pipeline", `S8 fraud: ${stage8Data?.fraudRiskLevel ?? "N/A"} (score=${stage8Data?.fraudRiskScore ?? "N/A"}). S9 cost: deviation=${stage9Data?.quoteDeviationPct?.toFixed(1) ?? "N/A"}%.`);

  // ── STAGE 7d: Confidence Aggregation ──────────────────────────────────────
  // Run after Stage 8 so all engine outputs (physics, damage, fraud,
  // consistency) are available for the weakest-link calculation.
  try {
    const confInput = buildConfidenceAggregationInput(
      stage6Data as Record<string, any> | null,
      stage7Data as Record<string, any> | null,
      stage8Data as Record<string, any> | null
    );
    const confResult = aggregateConfidence(confInput);
    // Attach to stage8Data so it flows through to db.ts persistence
    (stage8Data as any).confidenceAggregation = confResult;
    ctx.log?.("7d_confidence", `overall=${confResult.overall_confidence} (${confResult.confidence_level}), weakest=${confResult.weakest_component}`);
  } catch (err) {
    ctx.log?.("7d_confidence", `failed: ${err}`);
  }

  // ── STAGE 7b RE-RUN: Causal Reasoning with Downstream Scores ─────────────
  // After Stages 8 (fraud) and 9 (cost) complete, re-run Stage 7b with the
  // fraud risk score, fraud indicators, and quote deviation populated in
  // precomputedScores. This gives the causal engine a complete forensic picture.
  //
  // COMPLEXITY GATE: Skipped for SIMPLE tier claims (low value, clean data,
  // no fraud pre-signals). All 13 fraud detection layers remain fully active.
  // The primary Stage 7b Pass 1 verdict is already captured above.
  if (stage8Data && stage9Data && !complexityScore?.skipStage7bPass2) {
    try {
      const enrichedPhotosJsonRerun: string | null = (ctx as any).enrichedPhotosJson ?? null;
      const precomputedScores = {
        damageConsistencyScore: stage8Data.damageConsistencyScore ?? null,
        fraudRiskScore: stage8Data.fraudRiskScore ?? null,
        fraudRiskLevel: stage8Data.fraudRiskLevel ?? null,
        fraudIndicators: stage8Data.indicators?.map((i: any) => i.indicator ?? i.description ?? String(i)) ?? [],
        quoteDeviationPct: stage9Data.quoteDeviationPct ?? null,
        estimatedCostCents: stage9Data.expectedRepairCostCents ?? null,
        currency: stage9Data.currency ?? null,
      };
      const updatedVerdict = await runCausalReasoningEngine(
        claimRecord!,
        stage6Data,
        stage7Data,
        enrichedPhotosJsonRerun,
        precomputedScores
      );
      causalVerdict = updatedVerdict;
      ctx.log(
        "Stage 7b (re-run)",
        `Updated causal verdict with downstream scores: ` +
        `plausibility=${causalVerdict.plausibilityScore}% (${causalVerdict.plausibilityBand}), ` +
        `fraudFlag=${causalVerdict.flagForFraud}, ` +
        `fraudScore=${precomputedScores.fraudRiskScore ?? 'N/A'}, ` +
        `quoteDeviation=${precomputedScores.quoteDeviationPct != null ? precomputedScores.quoteDeviationPct.toFixed(1) + '%' : 'N/A'}`
      );
    } catch (err) {
      ctx.log("Stage 7b (re-run)", `Re-run with downstream scores failed (non-fatal): ${String(err)}`);
    }
  }

  // ── STAGE 36: Cost Realism Validationn ────────────────────────────────
  try {
    const componentCount = stage6Data?.damagedParts?.length ?? 0;
    const overallSeverity = stage7Data?.accidentSeverity ?? null;
    const costValidation = validateCostRealism(
      stage9Data,
      componentCount,
      overallSeverity
    );
    if (stage9Data) {
      stage9Data = mergeValidatedCost(stage9Data, costValidation) as typeof stage9Data;
    }
    ctx.log("Stage 36", `Cost realism: validated=${costValidation.validated_cost}, adjustments=${costValidation.adjustments_applied}, confidence=×${costValidation.confidence_multiplier.toFixed(2)}. ${costValidation.summary}`);
  } catch (err) {
    ctx.log("Stage 36", `Cost realism validation failed (non-fatal): ${String(err)}`);
  }

  // ── STAGE 37: Causal Chain Builder ──────────────────────────────────────
  try {
    const preliminaryConfidence = claimRecord?.dataQuality?.completenessScore ?? 50;
    causalChain = buildCausalChain(
      claimRecord,
      stage6Data,
      stage7Data,
      stage8Data,
      stage9Data,
      preliminaryConfidence
    );
    ctx.log("Stage 37", `Causal chain built: ${causalChain.step_count} steps, outcome=${causalChain.decision_outcome}, escalation=${causalChain.escalation_required}, critical=${causalChain.critical_step_count}`);
  } catch (err) {
    ctx.log("Stage 37", `Causal chain build failed (non-fatal): ${String(err)}`);
  }

  // ── STAGE 38: Evidence Strength Scorer ──────────────────────────────────
  if (claimRecord && stage6Data && stage7Data && stage8Data && stage9Data) {
    try {
      evidenceBundle = computeEvidenceBundle(
        claimRecord,
        stage6Data,
        stage7Data,
        stage8Data,
        stage9Data
      );
      ctx.log("Stage 38", `Evidence bundle computed: composite=${evidenceBundle.composite.evidence_label}(${evidenceBundle.composite.evidence_strength.toFixed(2)}), damage=${evidenceBundle.damage.evidence_label}, physics=${evidenceBundle.physics.evidence_label}, fraud=${evidenceBundle.fraud.evidence_label}, cost=${evidenceBundle.cost.evidence_label}`);
    } catch (err) {
      ctx.log("Stage 38", `Evidence scoring failed (non-fatal): ${String(err)}`);
    }
  }  // ── STAGE 40: Output Realism Validator ─────────────────────────────────
  if (stage7Data && stage8Data && stage9Data) {
    try {
      const componentCount = stage6Data?.damageZones?.reduce(
        (acc, z) => acc + (z.componentCount ?? 0), 0
      ) ?? 0;
      realismBundle = buildRealismBundle(stage7Data, stage9Data, stage8Data, componentCount);
      ctx.log("Stage 40", `Realism bundle: overall=${realismBundle.overall_realism_flag}, confidence_multiplier=${realismBundle.overall_confidence_multiplier.toFixed(3)}, physics=${realismBundle.physics.realism_flag}, cost=${realismBundle.cost.realism_flag}, fraud=${realismBundle.fraud.realism_flag}`);
    } catch (err) {
      ctx.log("Stage 40", `Realism validation failed (non-fatal): ${String(err)}`);
    }
  }

  // ── STAGE 41: Benchmark Deviation Engine ──────────────────────────────
  if (stage7Data && stage8Data && stage9Data) {
    try {
      const bCtx: BenchmarkInputContext = {
        vehicleMassKg: claimRecord?.vehicle?.massKg ?? null,
        vehicleMake: claimRecord?.vehicle?.make ?? null,
        vehicleModel: claimRecord?.vehicle?.model ?? null,
        vehicleYear: claimRecord?.vehicle?.year ?? null,
        incidentType: claimRecord?.accidentDetails?.incidentType ?? null,
        severity: stage7Data?.accidentSeverity ?? null,
        impactDirection: stage7Data?.impactVector?.direction ?? null,
        marketRegion: stage9Data?.marketRegion ?? null,
      };
      const liveStats: LiveBenchmarkStats = { comparableClaimCount: 0 };
      benchmarkBundle = buildBenchmarkBundle(stage7Data, stage8Data, stage9Data, bCtx, liveStats);
      ctx.log("Stage 41", `Benchmark bundle: source=${benchmarkBundle.benchmark_source}, cost_flag=${benchmarkBundle.cost.deviation_flag}(${benchmarkBundle.cost.deviation_percent.toFixed(1)}%), physics_flag=${benchmarkBundle.physics.deviation_flag}(${benchmarkBundle.physics.deviation_percent.toFixed(1)}%), fraud_flag=${benchmarkBundle.fraud.deviation_flag}(${benchmarkBundle.fraud.deviation_percent.toFixed(1)}%), overall=${benchmarkBundle.overall_deviation_flag}`);
    } catch (err) {
      ctx.log("Stage 41", `Benchmark deviation failed (non-fatal): ${String(err)}`);
    }
  }

  // ── STAGE 42: Cross-Engine Consensus Scorer ───────────────────────────
  try {
    consensusResult = computeConsensus(
      claimRecord,
      stage6Data,
      stage7Data,
      stage8Data,
      coherenceResult,
    );
    ctx.log("Stage 42", `Consensus: score=${consensusResult.consensus_score}, label=${consensusResult.consensus_label}, conflict=${consensusResult.conflict_present}, conflicts=${consensusResult.conflict_dimension_count}`);
  } catch (err) {
    ctx.log("Stage 42", `Cross-engine consensus failed (non-fatal): ${String(err)}`);
  }

  // ── STAGE 9b: Turnaround Time Analysis ─────────────────────────────────
  const s9b = await runTurnaroundTimeStage(ctx, claimRecord, stage6Data!, stage9Data);
  recordStage("9b_turnaround", s9b);
  stage9bData = s9b.data; // Always has data (self-healing)

  // ── STAGE 10: Report Generation ───────────────────────────────────────────────
  // Build evidenceTrace for audit transparency
  const stage7bPass2Executed = !!(stage8Data && stage9Data && !complexityScore?.skipStage7bPass2);
  const evidenceTrace: import('./types').Stage10Output['evidenceTrace'] = complexityScore ? {
    claimTier: complexityScore.tier,
    complexityScore: complexityScore.score,
    complexityReasons: complexityScore.reasons,
    stage7bPass2Executed,
    parallelStages: [
      { stages: ["3_pdf_extraction", "3_photo_extraction", "3_quote_extraction"], rationale: "Document extraction passes are independent — all read from the same raw text/image bytes" },
      { stages: ["7_causal_reasoning", "7e_narrative"], rationale: "Stage 7e (narrative) only needs physics output, not the causal verdict" },
      { stages: ["8_fraud", "9_cost"], rationale: "Fraud and cost engines have identical inputs and no mutual dependency" },
    ],
    totalDurationMs: Date.now() - pipelineStart,
    stageDurations: Object.fromEntries(
      Object.entries(stages).map(([k, v]) => [k, (v as any).durationMs ?? 0])
    ),
  } : null;

  const s10 = await runReportGenerationStage(
    ctx, claimRecord,
    stage6Data, stage7Data, stage8Data, stage9Data, stage9bData,
    allAssumptions,
    causalChain,
    evidenceTrace
  );
  recordStage("10_report", s10);
  stage10Data = s10.data;

  // ── STAGE 11: Validated Outcome Recorder (Learning Gate) ────────────────
  // Runs after Stage 10 — decides if this outcome should be stored for learning.
  if (stage9Data?.costDecision && stage10Data) {
    try {
      const isAssessorValidated = stage9Data.costDecision.cost_basis === "assessor_validated";
      const outcomeInput = buildValidatedOutcomeInput({
        trueCostUsd: stage9Data.costDecision.true_cost_usd,
        decisionConfidence: stage9Data.costDecision.confidence,
        recommendation: stage9Data.costDecision.recommendation,
        assessorPresent: isAssessorValidated,
      });
      validatedOutcomeResult = recordValidatedOutcome(outcomeInput);
      ctx.log("Stage11", `Learning gate: store=${validatedOutcomeResult.store}, tier=${validatedOutcomeResult.quality_tier}`);
    } catch (err) {
      ctx.log("Stage11", `Learning gate error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ── STAGE 11.5: Case Signature Generator ────────────────────────────────
  // Generates a standardised case signature for grouping and learning.
  try {
    const costTier = stage9Data?.costDecision?.true_cost_usd != null
      ? inferCostTier(stage9Data.costDecision.true_cost_usd)
      : null;
    caseSignatureResult = generateCaseSignature({
      vehicle_type: claimRecord?.vehicle?.make
        ? `${claimRecord.vehicle.make} ${claimRecord.vehicle.model}`
        : null,
      scenario_type: claimRecord?.accidentDetails?.incidentType ?? null,
      impact_direction: stage7Data?.impactVector?.direction
        ?? claimRecord?.accidentDetails?.collisionDirection
        ?? null,
      severity: (stage7Data?.severityConsensus as any)?.final_severity
        ?? stage7Data?.accidentSeverity
        ?? null,
      component_count: stage6Data?.damagedParts?.length ?? null,
      cost_tier: costTier ?? null,
    });
    ctx.log("Stage11.5", `Case signature: ${caseSignatureResult.case_signature}`);
  } catch (err) {
    ctx.log("Stage11.5", `Case signature error: ${err instanceof Error ? err.message : String(err)}`);
  }

  ctx.log("Pipeline", `Pipeline complete. Total: ${Date.now() - pipelineStart}ms, Assumptions: ${allAssumptions.length}, Recoveries: ${allRecoveryActions.length}`);

  // ── WI-5: Pre-Generation Consistency Check ────────────────────────────────
  // Detects self-contradicting report states and applies automatic corrections
  // before the result is returned to the caller.
  let preGenCheck: PreGenerationCheckResult | null = null;
  try {
    const physicsBasedFraudIndicators: string[] = [];
    if (stage8Data?.indicators) {
      for (const ind of stage8Data.indicators) {
        const id = (ind as any).indicator ?? "";
        if (
          id === "physics_inconsistency" ||
          id === "damage_direction_mismatch" ||
          id === "speed_inconsistency" ||
          id === "impact_force_mismatch"
        ) {
          physicsBasedFraudIndicators.push(id);
        }
      }
    }
    preGenCheck = runPreGenerationConsistencyCheck({
      recommendation: stage9Data?.costDecision?.recommendation ?? null,
      fraud_score: stage8Data?.fraudRiskScore ?? null,
      fraud_score_cover: stage8Data?.fraudRiskScore ?? null,
      physics_plausibility_score: stage7Data?.animalStrikePhysics?.plausibility_score ?? stage7Data?.damageConsistencyScore ?? null,
      physics_based_fraud_indicators: physicsBasedFraudIndicators,
      cost_basis: stage9Data?.costDecision?.cost_basis ?? null,
      quotation_present: (claimRecord?.repairQuote?.quoteTotalCents ?? 0) > 0 ||
        (claimRecord?.repairQuote?.agreedCostCents ?? 0) > 0,
      photo_count: ctx.damagePhotoUrls?.length ?? 0,
      damage_component_count: stage6Data?.damagedParts?.length ?? 0,
    });
    if (!preGenCheck.passed) {
      ctx.log("WI-5", `Pre-generation consistency check FAILED: ${preGenCheck.contradictions.length} contradiction(s) detected.`);
      for (const c of preGenCheck.contradictions) {
        ctx.log("WI-5", `  [${c.rule_id}] ${c.description.substring(0, 120)}`);
      }
      // Apply recommendation override if R1 triggered
      if (preGenCheck.recommendation_override && stage9Data?.costDecision) {
        ctx.log("WI-5", `Overriding recommendation: ${stage9Data.costDecision.recommendation} → ${preGenCheck.recommendation_override}`);
        (stage9Data.costDecision as any).recommendation = preGenCheck.recommendation_override;
      }
    } else {
      ctx.log("WI-5", "Pre-generation consistency check passed — no contradictions detected.");
    }
  } catch (preGenErr) {
    ctx.log("WI-5", `Pre-generation consistency check error (non-fatal): ${String(preGenErr)}`);
  }

  // Collect raw OCR text from Stage 2 for audit persistence
  const stage2RawOcrText = stage2Data?.extractedTexts
    ? stage2Data.extractedTexts.map(et => et.rawText ?? "").filter(Boolean).join("\n\n---\n\n")
    : null;

  // ── AUTO-VALUATION ────────────────────────────────────────────────────
  // Runs after all analysis stages. Uses mileage from claim form if
  // available, otherwise estimates from vehicle year/model.
  await runAutoValuation(ctx, (stage, msg) => ctx.log(stage, msg));

  // ── STAGE 12: Claims Decision Authority ─────────────────────────────────
  // Synthesises all upstream signals into a single non-contradictory decision.
  let decisionAuthorityResult: ClaimsDecisionOutput | null = null;
  try {
    const overallConfidence = claimRecord
      ? Math.max(0, Math.min(100, claimRecord.dataQuality.completenessScore))
      : null;
    decisionAuthorityResult = evaluateClaimDecision({
      scenario_type: claimRecord?.accidentDetails?.incidentType ?? null,
      severity: stage7Data?.accidentSeverity ?? null,
      physics_result: stage7Data ? {
        is_plausible: (stage7Data.damageConsistencyScore ?? 0) >= 50,
        confidence: stage7Data.damageConsistencyScore ?? null,
        has_critical_inconsistency: (stage7Data.damageConsistencyScore ?? 100) < 30,
        summary: stage7Data.impactVector?.direction
          ? `Impact from ${stage7Data.impactVector.direction} at ${(stage7Data.impactVector as any).estimatedSpeedKmh ?? 'unknown'} km/h`
          : null,
      } : null,
      damage_validation: stage6Data ? {
        is_consistent: true,
        consistency_score: stage7Data?.damageConsistencyScore ?? null,
        has_unexplained_damage: false,
        summary: `${stage6Data.damagedParts?.length ?? 0} damaged components identified`,
      } : null,
      fraud_result: stage8Data ? {
        fraud_risk_level: stage8Data.fraudRiskLevel ?? null,
        fraud_risk_score: stage8Data.fraudRiskScore ?? null,
        critical_flag_count: stage8Data.indicators?.filter((i: any) => i.severity === 'critical').length ?? 0,
        scenario_fraud_flagged: (stage8Data.fraudRiskScore ?? 0) >= 70,
        reasoning: (stage8Data as any).fraudSummary ?? null,
      } : null,
      costDecision: stage9Data?.costDecision ? {
        recommendation: stage9Data.costDecision.recommendation === 'APPROVE' ? 'PROCEED_TO_ASSESSMENT'
          : stage9Data.costDecision.recommendation === 'REJECT' ? 'ESCALATE'
          : 'NEGOTIATE',
        is_within_range: stage9Data.costDecision.confidence >= 60,
        confidence: stage9Data.costDecision.confidence,
        has_anomalies: (stage9Data.costDecision.confidence ?? 100) < 50,
        reasoning: stage9Data.costDecision.reasoning ?? null,
      } : null,
      overall_confidence: overallConfidence,
      consistency_status: consensusResult ? {
        overall_status: consensusResult.conflict_present ? 'CONFLICTED' : 'CONSISTENT',
        critical_conflict_count: consensusResult.conflict_dimension_count ?? 0,
        proceed: !consensusResult.conflict_present,
        summary: `Consensus score: ${consensusResult.consensus_score}, label: ${consensusResult.consensus_label}`,
      } : null,
    });
    ctx.log("Stage12", `Decision Authority: ${decisionAuthorityResult.recommendation} (confidence: ${decisionAuthorityResult.confidence}, basis: ${decisionAuthorityResult.decision_basis})`);
  } catch (err) {
    ctx.log("Stage12", `Decision Authority error (non-fatal): ${err instanceof Error ? err.message : String(err)}`);
  }

  // ── STAGE 12.5: Report Readiness Gate ────────────────────────────────────
  // Determines whether the claim can be exported as a report.
  let reportReadinessResult: ReportReadinessResult | null = null;
  try {
    const overallConfidence = claimRecord
      ? Math.max(0, Math.min(100, claimRecord.dataQuality.completenessScore))
      : null;
    reportReadinessResult = checkReportReadiness({
      decision_ready: {
        is_ready: decisionAuthorityResult != null,
        recommendation: decisionAuthorityResult?.recommendation ?? null,
        decision_basis: decisionAuthorityResult?.decision_basis ?? null,
        assessor_validated: decisionAuthorityResult?.decision_basis === 'assessor_validated',
        has_blocking_factors: (decisionAuthorityResult?.blocking_factors?.length ?? 0) > 0,
      },
      contradiction_check: preGenCheck ? {
        valid: preGenCheck.passed,
        action: preGenCheck.passed ? 'ALLOW' : 'BLOCK',
        critical_count: preGenCheck.contradictions?.filter((c: any) => c.severity === 'critical').length ?? 0,
        major_count: preGenCheck.contradictions?.filter((c: any) => c.severity === 'major').length ?? 0,
        minor_count: preGenCheck.contradictions?.filter((c: any) => c.severity === 'minor').length ?? 0,
      } : { valid: true, action: 'ALLOW', critical_count: 0, major_count: 0, minor_count: 0 },
      overall_confidence: overallConfidence,
      documents_attached: (ctx.damagePhotoUrls?.length ?? 0) > 0,
    });
    ctx.log("Stage12.5", `Report Readiness: ${reportReadinessResult.status} (export_allowed: ${reportReadinessResult.export_allowed}, reason: ${reportReadinessResult.reason.substring(0, 100)})`);
  } catch (err) {
    ctx.log("Stage12.5", `Report Readiness error (non-fatal): ${err instanceof Error ? err.message : String(err)}`);
  }

  // ── STAGE 13: Forensic Analysis Summary ─────────────────────────────────
  // Builds a comprehensive forensic analysis object from all stage data.
  let forensicAnalysisResult: Record<string, any> | null = null;
  try {
    forensicAnalysisResult = {
      version: '2.0.0',
      generatedAt: new Date().toISOString(),
      claimId: ctx.claimId,
      // Vehicle & incident context
      vehicle: claimRecord?.vehicle ?? null,
      accidentDetails: claimRecord?.accidentDetails ?? null,
      // Damage assessment
      damagedComponents: stage6Data?.damagedParts ?? [],
      damageComponentCount: stage6Data?.damagedParts?.length ?? 0,
      // Physics analysis
      physicsPlausibility: stage7Data?.damageConsistencyScore ?? null,
      impactVector: stage7Data?.impactVector ?? null,
      accidentSeverity: stage7Data?.accidentSeverity ?? null,
      physicsViolations: (stage7Data as any)?.physicsViolations ?? [],
      // Fraud analysis
      fraudRiskLevel: stage8Data?.fraudRiskLevel ?? null,
      fraudRiskScore: stage8Data?.fraudRiskScore ?? null,
      fraudIndicators: stage8Data?.indicators ?? [],
      fraudSummary: (stage8Data as any)?.fraudSummary ?? null,
      // Cost analysis
      costDecision: stage9Data?.costDecision ?? null,
      estimatedRepairCost: stage9Data?.costDecision?.true_cost_usd ?? null,
      costBreakdown: stage9Data?.breakdown ?? null,
      partsReconciliation: stage9Data?.partsReconciliation ?? null,
      // Repair quote from claim
      repairQuote: claimRecord?.repairQuote ?? null,
      // Narrative analysis
      narrativeAnalysis: claimRecord?.accidentDetails?.narrativeAnalysis ?? null,
      // Turnaround time
      turnaroundEstimate: stage9bData ?? null,
      // Decision
      decisionAuthority: decisionAuthorityResult ?? null,
      reportReadiness: reportReadinessResult ?? null,
      // Causal chain
      causalChain: causalChain ?? null,
      // Evidence
      evidenceBundle: evidenceBundle ?? null,
      // Consistency
      preGenerationCheck: preGenCheck ?? null,
      consensusResult: consensusResult ?? null,
      // Data quality
      dataQuality: claimRecord?.dataQuality ?? null,
      assumptions: allAssumptions,
      recoveryActions: allRecoveryActions,
    };
    ctx.log("Stage13", `Forensic analysis built: ${Object.keys(forensicAnalysisResult).length} sections`);
  } catch (err) {
    ctx.log("Stage13", `Forensic analysis build error (non-fatal): ${err instanceof Error ? err.message : String(err)}`);
  }

  return buildResult(
    stages, pipelineStart, ctx.claimId,
    claimRecord, stage10Data,
    stage6Data, stage7Data, stage8Data, stage9Data, stage9bData,
    causalChain, evidenceBundle, realismBundle, benchmarkBundle, consensusResult,
    causalVerdict, evidenceRegistryData, validatedOutcomeResult, caseSignatureResult,
    documentVerificationResult, stage2RawOcrText,
    decisionAuthorityResult, reportReadinessResult, forensicAnalysisResult,
    (ctx as any).enrichedPhotosJson ?? null
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
  turnaroundAnalysis: TurnaroundTimeOutput | null = null,
  causalChain: CausalChainOutput | null = null,
  evidenceBundle: EvidenceBundle | null = null,
  realismBundle: RealismBundle | null = null,
  benchmarkBundle: BenchmarkBundle | null = null,
  consensusResult: ConsensusResult | null = null,
  causalVerdict: CausalVerdict | null = null,
  evidenceRegistry: EvidenceRegistry | null = null,
  validatedOutcome: ValidatedOutcomeResult | null = null,
  caseSignature: CaseSignatureOutput | null = null,
  docVerification: DocumentReadVerificationResult | null = null,
  stage2RawOcrText: string | null = null,
  decisionAuthority: ClaimsDecisionOutput | null = null,
  reportReadiness: ReportReadinessResult | null = null,
  forensicAnalysis: Record<string, any> | null = null,
  enrichedPhotosJson: string | null = null
) {
  const allSaved = Object.values(stages).every(s => s.savedToDb || s.status === "skipped");
  return {
    summary: {
      claimId,
      stages,
      allSavedToDb: allSaved,
      totalDurationMs: Date.now() - pipelineStart,
      completedAt: new Date().toISOString(),
      documentVerification: docVerification ? {
        status: docVerification.status,
        confidence: docVerification.confidence,
        keyFieldsDetected: Object.entries(docVerification.key_fields_detected)
          .filter(([, ok]) => ok)
          .map(([k]) => k),
        missingCriticalFields: docVerification.missing_critical_fields,
        pdfReadConfirmed: docVerification.method === "llm",
        reason: docVerification.reason,
      } : null,
    },
    claimRecord,
    report,
    damageAnalysis,
    physicsAnalysis,
    fraudAnalysis,
    costAnalysis,
    turnaroundAnalysis,
    causalChain,
    evidenceBundle,
    realismBundle,
    benchmarkBundle,
    consensusResult,
    causalVerdict,
    evidenceRegistry,
    validatedOutcome,
    caseSignature,
    stage2RawOcrText,
    decisionAuthority,
    reportReadiness,
    forensicAnalysis,
    // Image analysis monitoring — enriched photo metadata from Stage 6 vision analysis
    // Passed to db.ts so it can compute imageAnalysisSuccessCount/FailedCount/SuccessRate.
    enrichedPhotosJson,
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
      agreedCostCents: null,
      labourCostCents: null,
      partsCostCents: null,
      uploadedImageUrls: [],
      thirdPartyVehicle: null,
      thirdPartyRegistration: null,
      // New fields — insurance context, incident context, financial extras, driver
      insurerName: null,
      policyNumber: null,
      claimReference: null,
      incidentTime: null,
      animalType: null,
      weatherConditions: null,
      visibilityConditions: null,
      roadSurface: null,
      marketValueCents: null,
      excessAmountCents: null,
      bettermentCents: null,
      driverLicenseNumber: null,
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
    fieldValidation: null,
    consistencyCheck: null,
    gateDecision: null,
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
      massKg: 1400, massTier: "not_available" as const, valueUsd: null, marketValueUsd: null,
    },
    driver: { name: ctx.claim.driverName || null, claimantName: ctx.claim.claimantName || null, licenseNumber: null },
      accidentDetails: {
      date: ctx.claim.accidentDate || null, location: null, description: null,
      incidentType: "collision", incidentSubType: null, incidentClassification: null,
      collisionDirection: "unknown",
      impactPoint: null, estimatedSpeedKmh: null,
      maxCrushDepthM: null, totalDamageAreaM2: null,
      structuralDamage: false, airbagDeployment: false,
      time: null, animalType: null, weatherConditions: null, visibilityConditions: null, roadSurface: null,
      narrativeAnalysis: null,
    },
    policeReport: { reportNumber: null, station: null },
    damage: { description: null, components: [], imageUrls: ctx.damagePhotoUrls || [] },
    repairQuote: {
      repairerName: null, repairerCompany: null, assessorName: null,
      quoteTotalCents: null, agreedCostCents: null, labourCostCents: null, partsCostCents: null, lineItems: [],
    },
    insuranceContext: {
      insurerName: null,
      policyNumber: ctx.claim.policyNumber || null,
      claimReference: ctx.claim.claimNumber || null,
      excessAmountUsd: null,
      bettermentUsd: null,
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
