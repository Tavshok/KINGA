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
  PipelineResult,
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
import { applyAutomotiveDomainCorrections } from "./automotiveDomainCorrector";
import { runDamageAnalysisStage } from "./stage-6-damage-analysis";
import { runUnifiedStage7 } from "./stage-7-unified";
import { scoreClaimComplexity, type ComplexityScore } from "./claimComplexityScorer";
import { runFraudAnalysisStage } from "./stage-8-fraud";
import { aggregateConfidence, buildConfidenceAggregationInput } from "./confidenceAggregationEngine";
import { runCostOptimisationStage } from "./stage-9-cost";
import { runTurnaroundTimeStage } from "./stage-9b-turnaround";
import { runReportGenerationStage } from "./stage-10-report";
import { runReconciliationPass, type ReconciliationLog } from "./reconciliation-engine";
import { validateClaimRecordSchema, type ClaimRecordValidationResult } from "../claim-record-schema";
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
import {
  checkStageContract,
  runWithTimeout,
  StageTimeoutError,
} from "./pipelineContractRegistry";
import {
  buildDamageFallback,
  buildPhysicsFallback,
  buildFraudFallback,
  buildCostFallback,
  ensureDamageContract,
  ensurePhysicsContract,
  ensureFraudContract,
  ensureCostContract,
} from "./engineFallback";
import {
  createPipelineStateMachine,
  runAnomalySentinels,
  CRITICAL_STAGES,
} from "./pipelineStateMachine";
import { computeFCDI, type FCDIResult, type DomainPenalty } from "./forensicCDI";
import {
  buildForensicExecutionLedger,
  buildStageRecord,
  type ForensicExecutionLedger,
  type StageExecutionRecord,
} from "./forensicExecutionLedger";
import {
  buildFELVersionSnapshot,
  buildStageVersionSnapshot,
  STAGE_CODE_VERSIONS,
  KINGA_PLATFORM_VERSION,
} from "./felVersionRegistry";
import { enforceCompletenessOrThrow, PipelineIncompleteError } from "./pipelineCompletenessGuard";
export { PipelineIncompleteError };
import { estimateMileageFromYear } from "../services/mileageEstimation";
import {
  createVehicleMarketValuation,
  getAssessorEvaluationByClaimId,
  getDb,
} from "../db";
import { claims } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { calculatePhysicsDeviationScore, parsePhysicsAnalysis } from "../physics-deviation-calculator";
import { checkClaimConsistency } from "./claimConsistencyChecker";
import { detectContradictions } from "./contradictionDetectionEngine";
import { buildClaimTruth, enrichClaimTruthWithPhysics, type ClaimTruth } from "./claimTruthLayer";
import {
  checkStage6Inputs,
  checkStage7Inputs,
  checkStage8Inputs,
  checkStage9Inputs,
  type StageInputReport,
} from "./stageInputGuards";
import {
  saveStageResult,
  loadCompletedStages,
} from "../db-pipeline";


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
  log: (stage: string, msg: string) => void,
  claimRecord?: ClaimRecord | null
): Promise<void> {
  try {
    const claimId = ctx.claimId;
    const claim = ctx.claim;
    // Prefer freshly extracted vehicle data from claimRecord (Stage 5 output),
    // fall back to the original DB claim record (which may be stale/empty on first run).
    const vehicleMake = claimRecord?.vehicle?.make || claim.vehicleMake;
    const vehicleModel = claimRecord?.vehicle?.model || claim.vehicleModel;
    const vehicleYear = claimRecord?.vehicle?.year || claim.vehicleYear;
    const vehicleMileageRaw = claimRecord?.vehicle?.mileageKm != null
      ? String(claimRecord.vehicle.mileageKm)
      : claim.vehicleMileage;
    const vehicleRegistration = claimRecord?.vehicle?.registration || claim.vehicleRegistration;
    if (!vehicleMake || !vehicleModel) {
      log("VALUATION", "Skipping auto-valuation: vehicle make/model not available");
      return;
    }
    const parsedMileage = parseMileageString(vehicleMileageRaw);
    let resolvedMileage: number;
    let mileageEstimated = false;
    let mileageWarning: string | null = null;
    if (parsedMileage && parsedMileage > 0) {
      resolvedMileage = parsedMileage;
      log("VALUATION", `Using claim form mileage: ${resolvedMileage.toLocaleString()} km`);
    } else {
      const year = vehicleYear || new Date().getFullYear();
      const estimation = estimateMileageFromYear(year, vehicleMake, vehicleModel);
      resolvedMileage = estimation.assumed_mileage_used;
      mileageEstimated = true;
      mileageWarning = estimation.warning_message;
      log("VALUATION", `Mileage not on claim form — estimated ${resolvedMileage.toLocaleString()} km from year/model`);
    }
    const evaluation = await getAssessorEvaluationByClaimId(claimId);
    const repairCost = evaluation?.estimatedRepairCost;
    const valuation = await valuateVehicle(
      {
        make: vehicleMake,
        model: vehicleModel,
        year: vehicleYear || new Date().getFullYear(),
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
      vehicleMake,
      vehicleModel,
      vehicleYear: vehicleYear || new Date().getFullYear(),
      vehicleRegistration: vehicleRegistration ?? undefined,
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
    const claimCurrency = (ctx.claim as any).currencyCode || "USD";
    log("VALUATION", `Auto-valuation complete: ${claimCurrency} ${(valuation.finalAdjustedValue / 100).toFixed(2)}${valuation.isTotalLoss ? " — TOTAL LOSS" : ""}${mileageEstimated ? " (mileage estimated)" : ""}`);
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
): Promise<PipelineResult> {
  const pipelineStart = Date.now();
  const stages: Record<string, PipelineStageSummary> = {};
  const allAssumptions: Assumption[] = [];
  const allRecoveryActions: RecoveryAction[] = [];

  // ── PIPELINE STATE MACHINE ───────────────────────────────────────────────
  // Tracks execution state and enforces allowed transitions.
  const psm = createPipelineStateMachine();

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
  let costRealismResult: import('./costRealismValidator').CostRealismResult | null = null;
  let consistencyCheckResult: import('./claimConsistencyChecker').ConsistencyCheckResult | null = null;
  let contradictionGateResult: import('./contradictionDetectionEngine').ContradictionResult | null = null;
  let physicsDeviationScoreValue: number | null = null;
  let stage10Data: Stage10Output | null = null;
  let claimRecord: ClaimRecord | null = null;
  let evidenceRegistryData: EvidenceRegistry | null = null;
  let validatedOutcomeResult: ValidatedOutcomeResult | null = null;
  let caseSignatureResult: CaseSignatureOutput | null = null;
  let documentVerificationResult: DocumentReadVerificationResult | null = null;
  let reconciliationLog: ReconciliationLog | null = null;
  let schemaValidationResult: ClaimRecordValidationResult | null = null;
  let claimTruth: ClaimTruth | null = null;
  // Per-stage input validation reports (Phase 2 guards)
  const stageInputReports: Record<string, StageInputReport> = {};
  // Assign to ctx so stage engines can read ctx.stageInputReports?.[stageKey]?.promptPreamble
  ctx.stageInputReports = stageInputReports;

  // ── PARTIAL RESUME (Phase 5) ─────────────────────────────────────────────
  // On retry, load any previously completed stage results from the DB so we
  // can skip those stages and avoid redundant LLM calls.
  // This map is keyed by stageId and contains the deserialised stage output.
  let _resumeCache: Record<string, unknown> = {};
  if (ctx.runId) {
    try {
      _resumeCache = await loadCompletedStages(ctx.runId);
      const cachedCount = Object.keys(_resumeCache).length;
      if (cachedCount > 0) {
        ctx.log("PartialResume", `Loaded ${cachedCount} cached stage(s) from prior run: ${Object.keys(_resumeCache).join(", ")}`);
      }
    } catch { /* resume cache load must never block the pipeline */ }
  }

  // Helper to record stage summary
  const recordStage = (key: string, result: { status: string; durationMs: number; savedToDb: boolean; error?: string; assumptions?: Assumption[]; recoveryActions?: RecoveryAction[]; degraded?: boolean; isTimeout?: boolean }) => {
    stages[key] = {
      status: result.status as any,
      durationMs: result.durationMs,
      savedToDb: result.savedToDb,
      error: result.error,
      degraded: result.degraded || false,
      assumptionCount: result.assumptions?.length || 0,
      recoveryActionCount: result.recoveryActions?.length || 0,
    };
    // ── Observability hook (Phase 1) ─────────────────────────────────────────
    // Fire-and-forget: never awaited, never allowed to throw into the pipeline.
    if (ctx.onStageComplete) {
      try {
        ctx.onStageComplete(key, {
          durationMs: result.durationMs,
          status: result.status === 'success' ? 'completed'
            : result.status === 'degraded' ? 'degraded'
            : result.status === 'failed' ? 'failed'
            : 'skipped',
          isDegraded: result.degraded ?? false,
          isTimeout: result.isTimeout ?? false,
          errorMessage: result.error ?? null,
          assumptionCount: result.assumptions?.length ?? 0,
          recoveryActionCount: result.recoveryActions?.length ?? 0,
        });
      } catch { /* observability must never break the pipeline */ }
    }
    // Advance state machine based on completed stage
    psm.markStageCompleted(key);
    if (result.status === "success" || result.status === "degraded") {
      psm.advanceForStage(key, `Stage "${key}" ${result.status}`);
    } else if (result.status === "failed" && CRITICAL_STAGES.has(key)) {
      psm.flagException(`Critical stage "${key}" failed: ${result.error ?? "unknown error"}`);
    }
    if (result.assumptions) {
      allAssumptions.push(...result.assumptions);
      // Phase 2C: Assumption Registry — FLAGGED_EXCEPTION routing
      // HIGH-impact assumptions (confidence < 30) trigger a flag so the report
      // and dashboard surface them for manual review. The pipeline still completes.
      const highImpact = result.assumptions.filter((a: Assumption) => (a.confidence ?? 50) < 30);
      for (const ha of highImpact) {
        psm.flagException(
          `HIGH-impact assumption in ${key}: field="${ha.field ?? 'unknown'}" assumed="${ha.assumedValue ?? 'unknown'}" confidence=${ha.confidence ?? 0}% — ${ha.reason ?? 'no reason'}`
        );
      }
    }
    if (result.recoveryActions) allRecoveryActions.push(...result.recoveryActions);
  };

  // ── STAGE 1: Document Ingestion ──────────────────────────────────────
  ctx.onStageStart?.("Stage 1 — Ingestion");
  const s1 = await runWithTimeout("1_ingestion", () => runIngestionStage(ctx)).catch((err) => {
    const isTimeout = err instanceof StageTimeoutError;
    const reason = isTimeout
      ? `stage_timeout: exceeded ${err.budgetMs}ms budget`
      : `engine_failure: ${String(err)}`;
    ctx.log("Stage 1", `${isTimeout ? "TIMEOUT" : "ERROR"}: ${err.message} — producing empty document set`);
    // Stage 1 has no fallback data to work from — empty set is the only honest output.
    // The pipeline will continue but all downstream stages will run in degraded mode.
    return {
      status: "degraded" as const,
      data: { documents: [], primaryDocumentIndex: -1, totalDocuments: 0 },
      error: err.message,
      durationMs: isTimeout ? err.budgetMs : 0,
      savedToDb: false,
      _timedOut: isTimeout,
      assumptions: [{
        field: "documents",
        assumedValue: "empty",
        reason: `Stage 1 ${isTimeout ? "timed out" : "failed"}: ${reason}. Continuing with empty document set.`,
        strategy: "default_value" as const,
        confidence: 5,
        stage: "Stage 1",
      }],
      recoveryActions: [{
        target: "ingestion_recovery",
        strategy: "default_value" as const,
        success: true,
        description: `Stage 1 ${isTimeout ? "timeout" : "error"} caught. Empty document set produced. All downstream stages will use claim database fields.`,
      }],
      degraded: true,
    };
  });
  recordStage("1_ingestion", s1);
  stage1Data = s1.data; // May be degraded but always has data

  // ── POST-STAGE 1: Persist embedded image URLs to DB ────────────────────────
  // Stage 1 extracts embedded images via pdfimages CLI (works in production) and
  // uploads them to S3. Persist the extracted URLs back to claims.damagePhotos so
  // that future re-runs have a populated DB cache and imageNormSource is set
  // correctly. Without this, the DB cache is never updated from Stage 1 extractions
  // and every re-run starts with an empty cache (triggering re-extraction, which is
  // fine but wastes time). We only persist when Stage 1 found new images AND the
  // current DB cache is empty or stale (fewer URLs than what Stage 1 found).
  if (ctx.extractedImagesWithMetadata && ctx.extractedImagesWithMetadata.length > 0) {
    try {
      const stage1ImageUrls = ctx.extractedImagesWithMetadata.map((img: any) => img.url).filter(Boolean);
      const existingCacheSize = ctx.damagePhotoUrls?.length ?? 0;
      // Only update if Stage 1 found MORE images than the current DB cache
      // (avoids overwriting a richer cache with a partial Stage 1 result)
      if (stage1ImageUrls.length > 0 && stage1ImageUrls.length >= existingCacheSize) {
        const { getDb: _getDb } = await import('../db');
        const dbInst = await _getDb();
        if (dbInst) {
          const { claims: claimsTable } = await import('../../drizzle/schema');
          const { eq } = await import('drizzle-orm');
          await dbInst.update(claimsTable)
            .set({ damagePhotos: JSON.stringify(stage1ImageUrls) })
            .where(eq(claimsTable.id, ctx.claimId))
            .catch(() => {});
          ctx.log('Stage 1', `Persisted ${stage1ImageUrls.length} embedded image URL(s) to DB cache (was ${existingCacheSize})`);
        }
      }
    } catch (persistErr: any) {
      ctx.log('Stage 1', `Non-fatal: failed to persist embedded image URLs to DB: ${persistErr.message}`);
    }
  }

  // ── STAGE 2: OCR & Text Extraction ─────────────────────────────────────────
  if (stage1Data) {
    ctx.onStageStart?.("Stage 2 — Extracting");
    const s2 = await runWithTimeout("2_extraction", () => runExtractionStage(ctx, stage1Data!)).catch((err) => {
      const isTimeout = err instanceof StageTimeoutError;
      // Quota exhaustion is a transient infrastructure failure — re-throw so the
      // pipeline orchestrator's outer catch stores it as a retriable error and
      // preserves the existing complete assessment data instead of overwriting it.
      const errMsg = String(err);
      if (!isTimeout && (errMsg.includes('quota exhausted') || errMsg.includes('usage exhausted') || errMsg.includes('412') || errMsg.includes('Precondition Failed'))) {
        throw err;
      }
      const reason = isTimeout
        ? `stage_timeout: exceeded ${err.budgetMs}ms budget`
        : `engine_failure: ${String(err)}`;
      ctx.log("Stage 2", `${isTimeout ? "TIMEOUT" : "ERROR"}: ${err.message} — producing empty text set`);
      // Stage 2 has no fallback text to produce — empty set is the only honest output.
      // Downstream stages (3, 4, 5) will rely on claim database fields instead of OCR text.
      return {
        status: "degraded" as const,
        data: { extractedTexts: [], totalPagesProcessed: 0 },
        error: err.message,
        durationMs: isTimeout ? err.budgetMs : 0,
        savedToDb: false,
        _timedOut: isTimeout,
        assumptions: [{
          field: "extractedTexts",
          assumedValue: "empty",
          reason: `Stage 2 ${isTimeout ? "timed out" : "failed"}: ${reason}. Pipeline will rely on claim database fields.`,
          strategy: "default_value" as const,
          confidence: 5,
          stage: "Stage 2",
        }],
        recoveryActions: [{
          target: "extraction_recovery",
          strategy: "default_value" as const,
          success: true,
          description: `Stage 2 ${isTimeout ? "timeout" : "error"} caught. Empty text set produced. Downstream stages will use claim database fields.`,
        }],
        degraded: true,
      };
    });
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
        // STRATEGIC CHANGE: Never return claimRecord: null due to extraction failure.
        // A blank report is worse than a partial report — the adjuster has no context at all.
        // Instead, log the failure and continue in DEGRADED mode using Stage 1 metadata.
        // Downstream stages will produce minimal output from claim DB fields.
        // The report will show a prominent "Document extraction failed — manual review required" banner.
        ctx.log(
          "Stage 0a (Document Verification)",
          `DEGRADED (not halting): Document verification ${v.status} (confidence ${v.confidence}) — ` +
          `continuing pipeline in degraded mode with Stage 1 metadata only. ` +
          `Missing: ${v.missing_critical_fields.join(", ") || "none"}. Reason: ${v.reason}`
        );
        // Mark Stage 2 as degraded but allow downstream stages to run with empty text
        if (stages["2_extraction"]) {
          stages["2_extraction"].degraded = true;
          stages["2_extraction"].error = `Document verification ${v.status}: ${v.reason}`;
        }
        // Inject a clear extraction failure notice into the stage 2 text so downstream
        // stages know to use claim DB fields as the primary data source.
        if (stage2Data && stage2Data.extractedTexts.length > 0) {
          stage2Data.extractedTexts[0].rawText =
            `[EXTRACTION_FAILED] Document text could not be extracted from the PDF. ` +
            `Reason: ${v.reason}. ` +
            `All analysis below is based on claim registration data only. ` +
            `Manual document review is required.`;
        }
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

    // ── STAGE 3: Structured Data Extraction ──────────────────────────
  ctx.onStageStart?.("Stage 3 — Extraction");
  if (stage1Data && stage2Data) {
    const s3 = await runStructuredExtractionStage(ctx, stage1Data, stage2Data);
    recordStage("3_structured_extraction", s3);
    stage3Data = s3.data;
  } else {
    stages["3_structured_extraction"] = { status: "skipped", durationMs: 0, savedToDb: false, error: "No Stage 1/2 data", degraded: true, assumptionCount: 0, recoveryActionCount: 0 };
  }

  // ── STAGE 4: Data Validation ─────────────────────────────────────────
  ctx.onStageStart?.("Stage 4 — Validation");
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
  ctx.onStageStart?.("Stage 5 — Assembly");
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
   } // end if (!claimRecord)

  // ── STAGE 0.5: Scenario-Conditional Evidence Notes ──────────────────────────
  // Now that claimRecord is available, enrich the Evidence Registry with
  // scenario-specific notes about missing third-party claims, hit-and-run
  // flags, and parking lot damage. These notes are advisory — they do not
  // block the pipeline but surface as recommendations in the forensic report.
  if (evidenceRegistryData && claimRecord) {
    const scenario = claimRecord.accidentDetails.collisionScenario;
    const thirdPartyRequired = claimRecord.accidentDetails.thirdPartyClaimRequired;
    const hitAndRun = claimRecord.accidentDetails.isHitAndRun;
    const parkingLot = claimRecord.accidentDetails.isParkingLotDamage;
    const isStruckParty = claimRecord.accidentDetails.isStruckParty;
    const hasThirdPartyInfo = !!claimRecord.accidentDetails.description?.toLowerCase().includes("third party") ||
      !!(claimRecord as any).thirdParty?.vehicleRegistration;

    if (isStruckParty && thirdPartyRequired && !hasThirdPartyInfo) {
      evidenceRegistryData.notes.push(
        `[SCENARIO: ${scenario.toUpperCase()}] Claimant was the struck party. ` +
        "A third-party claim or statement from the at-fault driver is required to corroborate " +
        "the physics reconstruction and confirm liability. " +
        "Request: third-party claim form, third-party insurer details, and police report."
      );
    }
    if (hitAndRun) {
      evidenceRegistryData.notes.push(
        "[SCENARIO: HIT_AND_RUN] The at-fault vehicle fled the scene. " +
        "A police report is mandatory for hit-and-run claims. " +
        "Request: police report number, CCTV or witness statements, and any available third-party vehicle description."
      );
    }
    if (parkingLot) {
      evidenceRegistryData.notes.push(
        "[SCENARIO: PARKING_LOT] Damage occurred in a stationary/parking context. " +
        "Speed assumptions are capped at 15 km/h. " +
        "If another vehicle was involved, request parking lot CCTV footage or a witness statement."
      );
    }
    if (scenario === "sideswipe") {
      evidenceRegistryData.notes.push(
        "[SCENARIO: SIDESWIPE] Lateral glancing contact. " +
        "Verify that damage components are consistent with a side-impact pattern (door panels, mirrors, sills). " +
        "If another vehicle was involved, request third-party registration and insurer details."
      );
    }
    if (evidenceRegistryData.notes.some(n => n.startsWith("[SCENARIO:"))) {
      ctx.log("Stage 0.5", `Scenario evidence notes added: scenario=${scenario}, struckParty=${isStruckParty}, hitAndRun=${hitAndRun}, parkingLot=${parkingLot}`);
    }
  }

  // ── STAGE 2.5: Automotive Domain Corrector ──────────────────────────────────────
  // Fixes OCR/handwriting misreads: BMD→BMW, TOYATA→Toyota, policy label fragments, etc.
  if (claimRecord) {
    try {
      const domainCorrResult = applyAutomotiveDomainCorrections(claimRecord);
      if (domainCorrResult.correctionCount > 0) {
        claimRecord = domainCorrResult.claimRecord;
        ctx.log("Stage 2.5", `Applied ${domainCorrResult.correctionCount} domain correction(s): ${domainCorrResult.corrections.map(c => `${c.field}: '${c.original}' → '${c.corrected}'`).join(', ')}`);
        for (const corr of domainCorrResult.corrections) {
          allAssumptions.push({
            field: corr.field,
            assumedValue: corr.corrected,
            reason: `OCR/handwriting correction: '${corr.original}' → '${corr.corrected}' (rule: ${corr.rule})`,
            strategy: 'domain_correction',
            confidence: Math.round(corr.confidence * 100),
            stage: 'Stage 2.5',
          });
        }
      } else {
        ctx.log("Stage 2.5", "No domain corrections needed — all extracted values passed validation");
      }
      if (domainCorrResult.policyNumberInvalid) {
        ctx.log("Stage 2.5", "Policy number flagged as label fragment — cleared for re-extraction");
      }
      if (domainCorrResult.thirdPartyDetectedFromNarrative) {
        ctx.log("Stage 2.5", "Third-party vehicle detected from narrative text");
      }
    } catch (domainCorrErr) {
      ctx.log("Stage 2.5", `Domain corrector error (non-fatal): ${String(domainCorrErr)}`);
    }
  }

  // ── STAGE 2.6: Image Classification Layer ─────────────────────────────────
  // Classifies extracted images into damage_photo, vehicle_overview, quotation_scan,
  // document_page, or fallback. Uses 3-tier system: heuristic scoring → LLM classification
  // → quality-based selection. No images are ever discarded — low-confidence go to fallbackPool.
  //
  // NORMALISATION GATE: When imageNormSource === 'cache_rehydration', the photos were
  // already classified and trusted in a previous pipeline run. Bypass the classifier
  // entirely — re-classifying with synthetic metadata produces worse selections.
  //
  // IMPORTANT: Stage 1 always re-extracts embedded images via pdfimages CLI (works in
  // production) and populates ctx.extractedImagesWithMetadata with fresh metadata.
  // If Stage 1 found fresh images, we MUST run the classifier regardless of
  // imageNormSource — otherwise quotation_scan images (e.g. Swiss Motors CamScanner
  // pages) are never classified and Stage 2.7 quote extraction is skipped.
  // Only bypass when Stage 1 produced no fresh metadata (truly a cache-only run).
  const _hasFreshEmbeddedImages = (ctx.extractedImagesWithMetadata?.length ?? 0) > 0;
  if (ctx.imageNormSource === 'cache_rehydration' && ctx.damagePhotoUrls.length > 0 && !_hasFreshEmbeddedImages) {
    ctx.log('Stage 2.6', `Bypassing classifier — cache_rehydration: ${ctx.damagePhotoUrls.length} trusted cached photo(s) used directly (no fresh embedded images from Stage 1)`);
    // Record as assumption so the forensic report knows the source
    allAssumptions.push({
      field: 'imageClassification',
      assumedValue: JSON.stringify({ source: 'cache_rehydration', count: ctx.damagePhotoUrls.length }),
      reason: `Image classifier bypassed — photos were already classified and trusted in a previous run (cache_rehydration). Using ${ctx.damagePhotoUrls.length} cached damage photo(s) directly.`,
      strategy: 'domain_correction',
      confidence: 90,
      stage: 'Stage 2.6',
    });
  } else if (ctx.extractedImagesWithMetadata && ctx.extractedImagesWithMetadata.length > 0) {
    try {
      const { classifyExtractedImages, selectBestImagesForVision } = await import('./imageClassifier');
      const classified = await classifyExtractedImages(
        ctx.extractedImagesWithMetadata,
        (msg: string) => ctx.log('Stage 2.6', msg)
      );
      ctx.classifiedImages = classified;

      // Replace damagePhotoUrls with quality-ranked classified damage photos
      const { urls: bestUrls, selectionLog } = selectBestImagesForVision(classified);
      if (bestUrls.length > 0) {
        ctx.damagePhotoUrls = bestUrls;
        ctx.log('Stage 2.6', `Selected ${bestUrls.length} best images for vision analysis (from ${classified.summary.totalInput} total)`);
      } else if (classified.summary.fallbackCount > 0) {
        // No confident damage photos — use fallback pool
        ctx.damagePhotoUrls = classified.fallbackPool.map(img => img.url).slice(0, 6);
        ctx.log('Stage 2.6', `No confident damage photos — using ${ctx.damagePhotoUrls.length} fallback image(s)`);
      } else {
        ctx.log('Stage 2.6', `NO_DAMAGE_PHOTOS_PROVIDED: ${classified.summary.documentPageCount} document pages, ${classified.summary.quotationCount} quotation scans, 0 damage photos`);
        // Don't clear damagePhotoUrls — let Stage 6 handle the empty case
      }

      for (const line of selectionLog) {
        ctx.log('Stage 2.6', line);
      }

      // Log classification summary as an assumption for the forensic report
      allAssumptions.push({
        field: 'imageClassification',
        assumedValue: JSON.stringify(classified.summary),
        reason: `Image classifier: ${classified.summary.damagePhotoCount} damage photos, ${classified.summary.vehicleOverviewCount} overviews, ${classified.summary.quotationCount} quotations, ${classified.summary.documentPageCount} documents, ${classified.summary.fallbackCount} fallback (${classified.summary.duplicatesRemoved} duplicates removed, avg confidence: ${classified.summary.averageConfidence})`,
        strategy: 'domain_correction',
        confidence: Math.round(classified.summary.averageConfidence * 100),
        stage: 'Stage 2.6',
      });
    } catch (classifierErr) {
      ctx.log('Stage 2.6', `Image classifier error (non-fatal): ${String(classifierErr)} — using unclassified images`);
    }
  } else {
    ctx.log('Stage 2.6', 'No extracted image metadata available — skipping classification (using raw damagePhotoUrls)');
  }

  // ── STAGE 2.7: Embedded Quote Extraction from Quotation Scan Images ────────
  // After Stage 2.6 classifies embedded images, any images classified as
  // 'quotation_scan' may contain repair quotes that were not captured by Stage 2
  // OCR (because they were raster images, not text). Extract quotes from each
  // quotation_scan image and merge them into stage3Data.inputRecovery.extracted_quotes
  // so Stage 9 can compare all available quotes.
  if (ctx.classifiedImages && ctx.classifiedImages.quotationImages.length > 0 && stage3Data) {
    const quotationImages = ctx.classifiedImages.quotationImages;
    ctx.log('Stage 2.7', `Found ${quotationImages.length} quotation scan image(s) — extracting quotes from each`);
    try {
      const { extractQuoteFromImageUrl } = await import('./quoteExtractionEngine');
      const imageQuotes: import('./quoteExtractionEngine').ExtractedQuote[] = [];
      // Process up to 5 quotation images (cost guard)
      const MAX_QUOTATION_IMAGES = 5;
      const toProcess = quotationImages.slice(0, MAX_QUOTATION_IMAGES);
      for (const img of toProcess) {
        try {
          ctx.log('Stage 2.7', `Extracting quote from image: ${img.url}`);
          const q = await extractQuoteFromImageUrl(
            img.url,
            null,   // panel_beater hint — not available at this stage
            null,   // total_cost hint — not available at this stage
            ctx.tenantCountry
          );
          const hasPrices = q.line_items.some(li => (li.line_total ?? 0) > 0 || (li.unit_cost ?? 0) > 0);
          const hasTotal = q.total_cost !== null && q.total_cost > 0;
          if (hasPrices || hasTotal) {
            ctx.log('Stage 2.7', `Quote extracted: panel_beater=${q.panel_beater}, total=${q.total_cost}, line_items=${q.line_items.length}, confidence=${q.confidence}`);
            imageQuotes.push(q);
          } else {
            ctx.log('Stage 2.7', `No prices found in image — skipping`);
          }
        } catch (imgErr) {
          ctx.log('Stage 2.7', `Failed to extract quote from image: ${String(imgErr)}`);
        }
      }
      if (imageQuotes.length > 0) {
        // Merge into stage3Data.inputRecovery.extracted_quotes
        // Deduplicate by panel_beater name (case-insensitive) to avoid double-counting
        // quotes that were also captured by Stage 2 OCR text extraction.
        // Ensure inputRecovery exists with all required fields
        if (!stage3Data.inputRecovery) {
          stage3Data.inputRecovery = {
            accident_description: null,
            recovered_quote: null,
            extracted_quotes: [],
            images_present: true,
            damage_hints: { zones: [], components: [] },
            failure_flags: [],
            recovered_at: new Date().toISOString(),
          };
        }
        // Non-null assertion safe: we just initialised it above if it was null
        const ir = stage3Data.inputRecovery!;
        // Fuzzy panel beater name normaliser:
        // Strips common business suffixes and punctuation so that
        // "Cedric Jonker Spraypaints" and "Cedric Jonker" match as the same repairer.
        // Resolve "X T/A Y" → "Y" before normalising to prevent T/A alias pairs
        // from being treated as different companies during image-quote dedup.
        const resolvePbTa = (name: string): string => {
          const m = name.match(/\bT\/A\b|\btrading\s+as\b/i);
          if (m && m.index !== undefined) return name.slice(m.index + m[0].length).trim();
          return name;
        };
        // Returns raw T/A suffix for prefix matching (handles LLM truncation of trading name).
        const getPbTaSuffix = (name: string): string | null => {
          const m = name.match(/\bT\/A\b|\btrading\s+as\b/i);
          if (m && m.index !== undefined)
            return name.slice(m.index + m[0].length).trim().toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
          return null;
        };
        const normPb = (name: string): string =>
          resolvePbTa(name).toLowerCase()
            .replace(/\b(spraypaints?|spray paint|auto|motors?|panel|beaters?|body|works?|repairs?|services?|cc|pty|ltd|\(pty\)|\(cc\)|\.)/gi, '')
            .replace(/[^a-z0-9\s]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
        const pbFuzzyMatch = (a: string, b: string): boolean => {
          const na = normPb(a);
          const nb = normPb(b);
          if (!na || !nb) return false;
          // Exact match after normalisation
          if (na === nb) return true;
          // One is a prefix/suffix of the other (handles "Cedric Jonker" vs "Cedric Jonker Spraypaints")
          if (na.startsWith(nb) || nb.startsWith(na)) return true;
          // Token overlap ≥ 60% of the shorter name's tokens
          const ta = na.split(' ').filter(t => t.length > 1);
          const tb = nb.split(' ').filter(t => t.length > 1);
          const overlap = ta.filter(t => tb.includes(t)).length;
          const minLen = Math.min(ta.length, tb.length);
          if (minLen > 0 && overlap / minLen >= 0.6) return true;
          // T/A suffix prefix check — handles LLM truncation of the trading name.
          const suffixA = getPbTaSuffix(a);
          const suffixB = getPbTaSuffix(b);
          const plainB = b.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
          const plainA = a.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
          if (suffixA && (plainB.startsWith(suffixA) || suffixA.startsWith(plainB.split(' ').slice(0, 2).join(' ')))) return true;
          if (suffixB && (plainA.startsWith(suffixB) || suffixB.startsWith(plainA.split(' ').slice(0, 2).join(' ')))) return true;
          return false;
        };

        let mergedCount = 0;
        for (const q of imageQuotes) {
          const pb = (q.panel_beater ?? '').toLowerCase().trim();
          // Check if this panel_beater already exists in extracted_quotes (fuzzy match)
          const existingQuotes = ir.extracted_quotes ?? [];
          const existingIdx = existingQuotes.findIndex(
            (e) => pb !== '' && pbFuzzyMatch(q.panel_beater ?? '', e.panel_beater ?? '')
          );
          if (existingIdx >= 0) {
            const existing = existingQuotes[existingIdx];
            const existingPriced = (existing.line_items ?? []).filter((li) => (li.line_total ?? 0) > 0).length;
            const imagePriced = q.line_items.filter(li => (li.line_total ?? 0) > 0).length;
            const existingTotal = existing.total_cost ?? 0;
            const imageTotal = q.total_cost ?? 0;
            // Prefer image extraction ONLY if it has more priced line items.
            // IMPORTANT: Never replace an existing quote with a higher-cost image version.
            // The previous condition (imageTotal > existingTotal) was intended to handle
            // OCR reading the wrong column (unit price vs line total), but in practice
            // it caused image scans to overwrite lower-cost OCR quotes with inflated
            // image totals, corrupting the savings calculation and cost optimisation.
            const preferImage = imagePriced > existingPriced;
            if (preferImage) {
              // Image extraction gave more priced line items — replace
              existingQuotes[existingIdx] = q;
              ir.extracted_quotes = existingQuotes;
              ctx.log('Stage 2.7', `Replaced existing quote for "${q.panel_beater}" with image-extracted version (priced: ${imagePriced} vs ${existingPriced}, total: ${imageTotal} vs ${existingTotal})`);
              mergedCount++;
            } else {
              ctx.log('Stage 2.7', `Skipping image quote for "${q.panel_beater}" — existing OCR quote preferred (priced: ${existingPriced} vs ${imagePriced}, total: ${existingTotal} vs ${imageTotal})`);
            }
          } else {
            ir.extracted_quotes = [...existingQuotes, q];
            mergedCount++;
            ctx.log('Stage 2.7', `Added new quote from image: "${q.panel_beater}" (total=${q.total_cost})`);
          }
        }
        ctx.log('Stage 2.7', `Embedded quote extraction complete: ${mergedCount} quote(s) merged. Total quotes now: ${(ir.extracted_quotes ?? []).length}`);
      } else {
        ctx.log('Stage 2.7', `No priced quotes found in ${toProcess.length} quotation scan image(s)`);
      }
    } catch (stage27Err) {
      ctx.log('Stage 2.7', `Embedded quote extraction failed (non-fatal): ${String(stage27Err)}`);
    }
  } else {
    const reason = !ctx.classifiedImages
      ? 'no classified images available'
      : ctx.classifiedImages.quotationImages.length === 0
        ? 'no quotation scan images found'
        : 'no stage3Data to merge into';
    ctx.log('Stage 2.7', `Skipped — ${reason}`);
  }

  // ── STAGE 0b: Evidence Registry Update (post-classification) ─────────────────
  // After Stage 2.6 classifies images, update the evidence registry's damage_photos
  // status to reflect actual classified results rather than Stage 1 metadata alone.
  // This ensures the forensic report shows "Photos: PRESENT" when damage photos were
  // found in embedded images, even if Stage 1 didn't flag containsImages.
  if (evidenceRegistryData && ctx.classifiedImages) {
    const _cls = ctx.classifiedImages;
    const _hasDamagePhotos = _cls.damagePhotos.length > 0 || _cls.vehicleOverviews.length > 0;
    const _hasQuotationScans = _cls.quotationImages.length > 0;
    if (_hasDamagePhotos && evidenceRegistryData.evidence_registry.damage_photos !== 'PRESENT') {
      evidenceRegistryData.evidence_registry.damage_photos = 'PRESENT';
      evidenceRegistryData.document_summary.has_images = true;
      evidenceRegistryData.document_summary.estimated_image_pages = Math.max(
        evidenceRegistryData.document_summary.estimated_image_pages,
        _cls.damagePhotos.length + _cls.vehicleOverviews.length
      );
      ctx.log('Stage 0b', `Evidence registry updated: damage_photos=PRESENT (${_cls.damagePhotos.length} damage photos, ${_cls.vehicleOverviews.length} vehicle overviews)`);
    }
    if (_hasQuotationScans && evidenceRegistryData.evidence_registry.repair_quote !== 'PRESENT') {
      evidenceRegistryData.evidence_registry.repair_quote = 'PRESENT';
      ctx.log('Stage 0b', `Evidence registry updated: repair_quote=PRESENT (${_cls.quotationImages.length} quotation scan(s) found by classifier)`);
    }
    (ctx as any).evidenceRegistry = evidenceRegistryData;
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

  // ── GC HINT: Release memory from extraction stages before heavy vision work ──
  // Stage 6 (damage analysis) processes images which are memory-intensive.
  // Releasing garbage from stages 1-5 prevents OOM during concurrent vision calls.
  if (typeof globalThis.gc === 'function') { globalThis.gc(); }

  // ── STAGE 6: Damage Analysis ─────────────────────────────────────────
  ctx.onStageStart?.("Stage 6 — Damage Analysis");
  // Input validation guard (Phase 2) — never blocks, annotates prompt preamble only
  try {
    const s6Guard = checkStage6Inputs(claimRecord);
    stageInputReports["6_damage_analysis"] = s6Guard;
    if (s6Guard.hasCriticalGaps) {
      ctx.log("Stage6Guard", `CRITICAL gaps: ${s6Guard.gaps.filter(g => g.severity === "critical").map(g => g.field).join(", ")}`);
    } else if (s6Guard.hasMajorGaps) {
      ctx.log("Stage6Guard", `Major gaps: ${s6Guard.gaps.filter(g => g.severity === "major").map(g => g.field).join(", ")}`);
    }
  } catch { /* guard must never break the pipeline */ }
  // claimRecord is guaranteed non-null here: Stage 5 (assembly) either
  // produced a valid ClaimRecord or the pipeline would have flagged an exception.
  // The non-null assertion is intentional — if claimRecord is null, Stage 5 failed
  // and the pipeline state machine will have already flagged FLAGGED_EXCEPTION.
  // Partial resume: if this stage completed in a prior run, restore its output and skip re-running.
  const _s6Cached = _resumeCache["6_damage_analysis"] as Stage6Output | undefined;
  const s6 = _s6Cached
    ? (() => {
        ctx.log("PartialResume", "Stage 6 — restoring from cache, skipping re-run");
        return { status: "success" as const, data: _s6Cached, durationMs: 0, savedToDb: true, degraded: false };
      })()
    : await runWithTimeout("6_damage_analysis", () => runDamageAnalysisStage(ctx, claimRecord!)).catch((err) => {
    const isTimeout = err instanceof StageTimeoutError;
    const reason = isTimeout
      ? `stage_timeout: exceeded ${err.budgetMs}ms budget`
      : `engine_failure: ${String(err)}`;
    ctx.log("Stage 6", `${isTimeout ? "TIMEOUT" : "ERROR"}: ${err.message} — invoking damage engine fallback`);
    // Call the same fallback the stage's own catch block uses — no hardcoded values.
    // ensureDamageContract({}) produces a sentinel zone with _fallback markers.
    return {
      status: "degraded" as const,
      data: ensureDamageContract({}, reason),
      error: err.message,
      durationMs: isTimeout ? err.budgetMs : 0,
      savedToDb: false,
      _timedOut: isTimeout,
      assumptions: [{
        field: "damageAnalysis",
        assumedValue: "sentinel_zone",
        reason: `Stage 6 ${isTimeout ? "timed out" : "failed"}: ${reason}. Damage analysis unavailable — sentinel zone produced for downstream integrity.`,
        strategy: "default_value" as const,
        confidence: 5,
        stage: "Stage 6",
      }],
      recoveryActions: [{
        target: "damage_analysis_recovery",
        strategy: "default_value" as const,
        success: true,
        description: `Stage 6 ${isTimeout ? "timeout" : "error"} caught. ensureDamageContract fallback applied. All damage fields marked as estimated.`,
      }],
      degraded: true,
    };
  });
  recordStage("6_damage_analysis", s6);
  stage6Data = s6.data; // Always has data (self-healing)
  // Partial resume: persist result for potential retry (fire-and-forget).
  // QUALITY GATE: only cache clean successful runs — never cache degraded/fallback output.
  // A degraded result (sentinel zone, estimated values) must always be re-run on retry.
  if (ctx.runId && s6.status === "success" && !s6.degraded && !_s6Cached) {
    saveStageResult(ctx.runId, "6_damage_analysis", stage6Data).catch(() => {});
  }

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
  ctx.onStageStart?.("Stage 7 — Physics & Causality");
  // Input validation guard (Phase 2) — never blocks, annotates prompt preamble only
  try {
    const s7Guard = checkStage7Inputs(claimRecord, stage6Data);
    stageInputReports["7_unified"] = s7Guard;
    if (s7Guard.hasCriticalGaps) {
      ctx.log("Stage7Guard", `CRITICAL gaps: ${s7Guard.gaps.filter(g => g.severity === "critical").map(g => g.field).join(", ")}`);
    } else if (s7Guard.hasMajorGaps) {
      ctx.log("Stage7Guard", `Major gaps: ${s7Guard.gaps.filter(g => g.severity === "major").map(g => g.field).join(", ")}`);
    }
  } catch { /* guard must never break the pipeline */ }
  // Partial resume: if this stage completed in a prior run, restore its output and skip re-running.
  const _s7Cached = _resumeCache["7_unified"] as import("./stage-7-unified").UnifiedStage7Output | undefined;
  // Single function call replacing the sequential cluster of:
  //   Stage 7 (physics), Stage 7b Pass 1 (causal), Stage 7c (severity), Stage 7e (narrative)
  // Stage 7b Pass 2 (re-run with fraud+cost scores) remains separate below.
  const s7Unified = _s7Cached
    ? (() => {
        ctx.log("PartialResume", "Stage 7 — restoring from cache, skipping re-run");
        return { status: "success" as const, data: _s7Cached, durationMs: 0, savedToDb: true, degraded: false };
      })()
    : await runWithTimeout("7_unified", () => runUnifiedStage7(
    ctx,
    claimRecord!,
    stage6Data!,
    null, // preRunPattern — computed inside physics engine
    null, // preRunAnimal — computed inside physics engine
    ctx.damagePhotoUrls ?? []
  )).catch((err) => {
    const isTimeout = err instanceof StageTimeoutError;
    const reason = isTimeout
      ? `stage_timeout: exceeded ${err.budgetMs}ms budget`
      : `engine_failure: ${String(err)}`;
    ctx.log("Stage 7", `${isTimeout ? "TIMEOUT" : "ERROR"}: ${err.message} — invoking physics/causal engine fallbacks`);
    // Call the same fallback functions the stage's own catch blocks use — no hardcoded values.
    // ensurePhysicsContract({}) produces a physics output with all fields marked as estimated.
    return {
      status: "degraded" as const,
      data: {
        physicsAnalysis: ensurePhysicsContract({}, reason),
        causalVerdict: null,
        narrativeAnalysis: null,
      },
      error: err.message,
      durationMs: isTimeout ? err.budgetMs : 0,
      savedToDb: false,
      _timedOut: isTimeout,
      assumptions: [{
        field: "physicsAnalysis",
        assumedValue: "physics_fallback",
        reason: `Stage 7 ${isTimeout ? "timed out" : "failed"}: ${reason}. Physics/causal analysis unavailable — fallback applied.`,
        strategy: "default_value" as const,
        confidence: 5,
        stage: "Stage 7",
      }],
      recoveryActions: [{
        target: "physics_recovery",
        strategy: "default_value" as const,
        success: true,
        description: `Stage 7 ${isTimeout ? "timeout" : "error"} caught. ensurePhysicsContract fallback applied. All physics fields marked as estimated.`,
      }],
      degraded: true,
    };
  });
  recordStage("7_unified", s7Unified);
  stage7Data = s7Unified.data?.physicsAnalysis ?? null;
  causalVerdict = s7Unified.data?.causalVerdict ?? null;
  // Partial resume: persist result for potential retry (fire-and-forget).
  // QUALITY GATE: only cache clean successful runs — never cache degraded/fallback output.
  if (ctx.runId && s7Unified.status === "success" && !s7Unified.degraded && !_s7Cached) {
    saveStageResult(ctx.runId, "7_unified", s7Unified.data).catch(() => {});
  }

  // Attach narrative analysis to claimRecord so Stage 8 fraud engine can consume it
  if (s7Unified.data?.narrativeAnalysis && claimRecord) {
    const narrativeAnalysis = s7Unified.data.narrativeAnalysis;
    // SPEED RECONCILIATION: if structured extraction did not find a speed value
    // (estimatedSpeedKmh is null or was a Stage 5 heuristic estimate of 30/45/60),
    // and the narrative engine extracted a higher-confidence implied speed, write it
    // back so the structured section of the report reflects the narrative-derived value.
    const narrativeSpeed: number | null =
      (narrativeAnalysis as any)?.extracted_facts?.implied_speed_kmh ?? null;
    const currentSpeed = claimRecord.accidentDetails?.estimatedSpeedKmh ?? null;
    const isHeuristicSpeed = currentSpeed === 30 || currentSpeed === 45 || currentSpeed === 60;
    const shouldOverrideSpeed =
      narrativeSpeed !== null && (currentSpeed === null || isHeuristicSpeed);
    if (shouldOverrideSpeed) {
      ctx.log(
        "Stage 7 (Unified)",
        `Speed reconciliation: narrative implied_speed_kmh=${narrativeSpeed} km/h overrides ` +
        `structured estimatedSpeedKmh=${currentSpeed === null ? 'null' : currentSpeed + ' (heuristic)'}.`
      );
    }
    claimRecord = {
      ...claimRecord,
      accidentDetails: {
        ...claimRecord.accidentDetails,
        narrativeAnalysis,
        ...(shouldOverrideSpeed ? { estimatedSpeedKmh: narrativeSpeed } : {}),
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
  // Input validation guards (Phase 2) for S8 and S9 — run before parallel block
  try {
    const s8Guard = checkStage8Inputs(claimRecord, stage6Data, stage7Data);
    stageInputReports["8_fraud"] = s8Guard;
    if (s8Guard.hasCriticalGaps) {
      ctx.log("Stage8Guard", `CRITICAL gaps: ${s8Guard.gaps.filter(g => g.severity === "critical").map(g => g.field).join(", ")}`);
    } else if (s8Guard.hasMajorGaps) {
      ctx.log("Stage8Guard", `Major gaps: ${s8Guard.gaps.filter(g => g.severity === "major").map(g => g.field).join(", ")}`);
    }
  } catch { /* guard must never break the pipeline */ }
  try {
    const s9Guard = checkStage9Inputs(claimRecord, stage6Data, stage7Data);
    stageInputReports["9_cost"] = s9Guard;
    if (s9Guard.hasCriticalGaps) {
      ctx.log("Stage9Guard", `CRITICAL gaps: ${s9Guard.gaps.filter(g => g.severity === "critical").map(g => g.field).join(", ")}`);
    } else if (s9Guard.hasMajorGaps) {
      ctx.log("Stage9Guard", `Major gaps: ${s9Guard.gaps.filter(g => g.severity === "major").map(g => g.field).join(", ")}`);
    }
  } catch { /* guard must never break the pipeline */ }
  ctx.log("Pipeline", "Starting S8 (fraud) ‖ S9 (cost) in parallel...");
  ctx.onStageStart?.("Stage 8 — Analysis");
  // Partial resume: check cache for both stages before launching the parallel block
  const _s8Cached = _resumeCache["8_fraud"] as Stage8Output | undefined;
  const _s9Cached = _resumeCache["9_cost"] as Stage9Output | undefined;
  const [s8, s9] = await Promise.all([
    _s8Cached
      ? Promise.resolve((() => {
          ctx.log("PartialResume", "Stage 8 — restoring from cache, skipping re-run");
          return { status: "success" as const, data: _s8Cached, durationMs: 0, savedToDb: true, degraded: false };
        })())
      : runWithTimeout("8_fraud", () => runFraudAnalysisStage(ctx, claimRecord!, stage6Data!, stage7Data!, stage3Data ?? undefined)).catch((err) => {
      const isTimeout = err instanceof StageTimeoutError;
      const reason = isTimeout
        ? `stage_timeout: exceeded ${err.budgetMs}ms budget`
        : `engine_failure: ${String(err)}`;
      ctx.log("Stage 8", `${isTimeout ? "TIMEOUT" : "ERROR"}: ${err.message} — invoking fraud engine fallback`);
      // ensureFraudContract({}) produces the same output as the stage's own catch block.
      // Score defaults to medium risk (50) with all indicators marked as estimated.
      return {
        status: "degraded" as const,
        data: ensureFraudContract({}, reason),
        error: err.message,
        durationMs: isTimeout ? err.budgetMs : 0,
        savedToDb: false,
        _timedOut: isTimeout,
        assumptions: [{
          field: "fraudRiskScore",
          assumedValue: "medium_risk_50",
          reason: `Stage 8 ${isTimeout ? "timed out" : "failed"}: ${reason}. Fraud score unavailable — medium risk applied to flag for manual review.`,
          strategy: "default_value" as const,
          confidence: 10,
          stage: "Stage 8",
        }],
        recoveryActions: [{
          target: "fraud_analysis_recovery",
          strategy: "default_value" as const,
          success: true,
          description: `Stage 8 ${isTimeout ? "timeout" : "error"} caught. ensureFraudContract fallback applied. All fraud indicators marked as estimated.`,
        }],
        degraded: true,
      };
    }),
    _s9Cached
      ? Promise.resolve((() => {
          ctx.log("PartialResume", "Stage 9 — restoring from cache, skipping re-run");
          return { status: "success" as const, data: _s9Cached, durationMs: 0, savedToDb: true, degraded: false };
        })())
      : runWithTimeout("9_cost", () => runCostOptimisationStage(ctx, claimRecord!, stage6Data!, stage7Data!, stage3Data ?? undefined)).catch((err) => {
      const isTimeout = err instanceof StageTimeoutError;
      const reason = isTimeout
        ? `stage_timeout: exceeded ${err.budgetMs}ms budget`
        : `engine_failure: ${String(err)}`;
      ctx.log("Stage 9", `${isTimeout ? "TIMEOUT" : "ERROR"}: ${err.message} — invoking cost engine fallback`);
      // ensureCostContract({}) produces the same output as the stage's own catch block.
      // Cost is marked as AI estimate with no optimisation applied.
      return {
        status: "degraded" as const,
        data: ensureCostContract({}, reason),
        error: err.message,
        durationMs: isTimeout ? err.budgetMs : 0,
        savedToDb: false,
        _timedOut: isTimeout,
        assumptions: [{
          field: "costEstimate",
          assumedValue: "baseline_estimate",
          reason: `Stage 9 ${isTimeout ? "timed out" : "failed"}: ${reason}. Cost optimisation unavailable — baseline estimate applied.`,
          strategy: "default_value" as const,
          confidence: 10,
          stage: "Stage 9",
        }],
        recoveryActions: [{
          target: "cost_optimisation_recovery",
          strategy: "default_value" as const,
          success: true,
          description: `Stage 9 ${isTimeout ? "timeout" : "error"} caught. ensureCostContract fallback applied. All cost fields marked as estimated.`,
        }],
        degraded: true,
      };
    }),
  ]);
  recordStage("8_fraud", s8);
  stage8Data = s8.data; // Always has data (self-healing)
  // QUALITY GATE: only cache clean successful runs — never cache degraded/fallback output.
  if (ctx.runId && s8.status === "success" && !s8.degraded && !_s8Cached) {
    saveStageResult(ctx.runId, "8_fraud", stage8Data).catch(() => {});
  }
  recordStage("9_cost", s9);
  stage9Data = s9.data; // Always has data (self-healing)
  if (ctx.runId && s9.status === "success" && !s9.degraded && !_s9Cached) {
    saveStageResult(ctx.runId, "9_cost", stage9Data).catch(() => {});
  }
  ctx.log("Pipeline", `S8 fraud: ${stage8Data?.fraudRiskLevel ?? "N/A"} (score=${stage8Data?.fraudRiskScore ?? "N/A"}). S9 cost: deviation=${stage9Data?.quoteDeviationPct?.toFixed(1) ?? "N/A"}%.`);

  // ── GC HINT: Release memory from parallel S8+S9 before final aggregation ──
  if (typeof globalThis.gc === 'function') { globalThis.gc(); }

  // ── STAGE 7d: Confidence Aggregation ──────────────────────────────────────────
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
    if (stage8Data) stage8Data.confidenceAggregation = confResult;
    ctx.log?.("7d_confidence", `overall=${confResult.overall_confidence} (${confResult.confidence_level}), weakest=${confResult.weakest_component}`);
  } catch (err) {
    ctx.log?.("7d_confidence", `failed: ${err}`);
  }

  // ── POST-S8/S9 PARALLEL BLOCK ────────────────────────────────────────────
  // Stage 7b re-run (LLM, ~15-30s) and all deterministic post-processing stages
  // (36, 37, 38, 40, 41, 42, 9b) share the same inputs (stage8Data, stage9Data,
  // stage6Data, stage7Data, claimRecord) and have NO dependency on each other.
  // Running them concurrently saves ~15-30s per claim.
  //
  // DEPENDENCY NOTE: The reconciliation pass (below) needs causalVerdict from
  // Stage 7b re-run, so it runs AFTER this Promise.all resolves.
  ctx.log("Pipeline", "Starting Stage 7b re-run ‖ deterministic post-processing (36,37,38,40,41,42,9b) in parallel...");

  // Stage 7b re-run task
  const stage7bRerunTask = async (): Promise<CausalVerdict | null> => {
    if (!(stage8Data && stage9Data && !complexityScore?.skipStage7bPass2)) return null;
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
      ctx.log(
        "Stage 7b (re-run)",
        `Updated causal verdict with downstream scores: ` +
        `plausibility=${updatedVerdict.plausibilityScore}% (${updatedVerdict.plausibilityBand}), ` +
        `fraudFlag=${updatedVerdict.flagForFraud}, ` +
        `fraudScore=${precomputedScores.fraudRiskScore ?? 'N/A'}, ` +
        `quoteDeviation=${precomputedScores.quoteDeviationPct != null ? precomputedScores.quoteDeviationPct.toFixed(1) + '%' : 'N/A'}`
      );
      return updatedVerdict;
    } catch (err) {
      ctx.log("Stage 7b (re-run)", `Re-run with downstream scores failed (non-fatal): ${String(err)}`);
      return null;
    }
  };

  // Deterministic post-processing task (stages 36, 37, 38, 40, 41, 42, 9b)
  const deterministicPostTask = async () => {
    // Stage 36: Cost Realism Validation
    let validatedStage9Data = stage9Data;
    let localCostRealismResult: import('./costRealismValidator').CostRealismResult | null = null;
    let localConsistencyCheckResult: import('./claimConsistencyChecker').ConsistencyCheckResult | null = null;
    let localContradictionGateResult: import('./contradictionDetectionEngine').ContradictionResult | null = null;
    let localPhysicsDeviationScore: number | null = null;
    try {
      const componentCount = stage6Data?.damagedParts?.length ?? 0;
      const overallSeverity = stage7Data?.accidentSeverity ?? null;
      const costValidation = validateCostRealism(stage9Data, componentCount, overallSeverity);
      localCostRealismResult = costValidation;
      if (stage9Data) {
        validatedStage9Data = mergeValidatedCost(stage9Data, costValidation) as typeof stage9Data;
      }
      ctx.log("Stage 36", `Cost realism: validated=${costValidation.validated_cost}, adjustments=${costValidation.adjustments_applied}, confidence=×${costValidation.confidence_multiplier.toFixed(2)}. ${costValidation.summary}`);
    } catch (err) {
      ctx.log("Stage 36", `Cost realism validation failed (non-fatal): ${String(err)}`);
    }

    // Stage 37: Causal Chain Builder
    let localCausalChain: typeof causalChain = null;
    try {
      const preliminaryConfidence = claimRecord?.dataQuality?.completenessScore ?? 50;
      localCausalChain = buildCausalChain(claimRecord, stage6Data, stage7Data, stage8Data, validatedStage9Data, preliminaryConfidence);
      ctx.log("Stage 37", `Causal chain built: ${localCausalChain.step_count} steps, outcome=${localCausalChain.decision_outcome}, escalation=${localCausalChain.escalation_required}, critical=${localCausalChain.critical_step_count}`);
    } catch (err) {
      ctx.log("Stage 37", `Causal chain build failed (non-fatal): ${String(err)}`);
    }

    // Stage 38: Evidence Strength Scorer
    let localEvidenceBundle: typeof evidenceBundle = null;
    if (claimRecord && stage6Data && stage7Data && stage8Data && validatedStage9Data) {
      try {
        localEvidenceBundle = computeEvidenceBundle(claimRecord, stage6Data, stage7Data, stage8Data, validatedStage9Data);
        ctx.log("Stage 38", `Evidence bundle computed: composite=${localEvidenceBundle.composite.evidence_label}(${localEvidenceBundle.composite.evidence_strength.toFixed(2)}), damage=${localEvidenceBundle.damage.evidence_label}, physics=${localEvidenceBundle.physics.evidence_label}, fraud=${localEvidenceBundle.fraud.evidence_label}, cost=${localEvidenceBundle.cost.evidence_label}`);
      } catch (err) {
        ctx.log("Stage 38", `Evidence scoring failed (non-fatal): ${String(err)}`);
      }
    }

    // Stage 40: Output Realism Validator
    let localRealismBundle: typeof realismBundle = null;
    if (stage7Data && stage8Data && validatedStage9Data) {
      try {
        const componentCount = stage6Data?.damageZones?.reduce((acc, z) => acc + (z.componentCount ?? 0), 0) ?? 0;
        localRealismBundle = buildRealismBundle(stage7Data, validatedStage9Data, stage8Data, componentCount);
        ctx.log("Stage 40", `Realism bundle: overall=${localRealismBundle.overall_realism_flag}, confidence_multiplier=${localRealismBundle.overall_confidence_multiplier.toFixed(3)}, physics=${localRealismBundle.physics.realism_flag}, cost=${localRealismBundle.cost.realism_flag}, fraud=${localRealismBundle.fraud.realism_flag}`);
      } catch (err) {
        ctx.log("Stage 40", `Realism validation failed (non-fatal): ${String(err)}`);
      }
    }

    // Stage 41: Benchmark Deviation Engine
    let localBenchmarkBundle: typeof benchmarkBundle = null;
    if (stage7Data && stage8Data && validatedStage9Data) {
      try {
        const bCtx: BenchmarkInputContext = {
          vehicleMassKg: claimRecord?.vehicle?.massKg ?? null,
          vehicleMake: claimRecord?.vehicle?.make ?? null,
          vehicleModel: claimRecord?.vehicle?.model ?? null,
          vehicleYear: claimRecord?.vehicle?.year ?? null,
          incidentType: claimRecord?.accidentDetails?.incidentType ?? null,
          severity: stage7Data?.accidentSeverity ?? null,
          impactDirection: stage7Data?.impactVector?.direction ?? null,
          marketRegion: validatedStage9Data?.marketRegion ?? null,
        };
        const liveStats: LiveBenchmarkStats = { comparableClaimCount: 0 };
        localBenchmarkBundle = buildBenchmarkBundle(stage7Data, stage8Data, validatedStage9Data, bCtx, liveStats);
        ctx.log("Stage 41", `Benchmark bundle: source=${localBenchmarkBundle.benchmark_source}, cost_flag=${localBenchmarkBundle.cost.deviation_flag}(${localBenchmarkBundle.cost.deviation_percent.toFixed(1)}%), physics_flag=${localBenchmarkBundle.physics.deviation_flag}(${localBenchmarkBundle.physics.deviation_percent.toFixed(1)}%), fraud_flag=${localBenchmarkBundle.fraud.deviation_flag}(${localBenchmarkBundle.fraud.deviation_percent.toFixed(1)}%), overall=${localBenchmarkBundle.overall_deviation_flag}`);
      } catch (err) {
        ctx.log("Stage 41", `Benchmark deviation failed (non-fatal): ${String(err)}`);
      }
    }

    // Stage 42: Cross-Engine Consensus Scorer
    let localConsensusResult: typeof consensusResult = null;
    try {
      localConsensusResult = computeConsensus(claimRecord, stage6Data, stage7Data, stage8Data, coherenceResult, undefined, validatedStage9Data);
      ctx.log("Stage 42", `Consensus: score=${localConsensusResult.consensus_score}, label=${localConsensusResult.consensus_label}, conflict=${localConsensusResult.conflict_present}, conflicts=${localConsensusResult.conflict_dimension_count}`);
      if (localConsensusResult.conflict_present && localConsensusResult.consensus_label === "CONFLICTING") {
        psm.flagException(`Cross-engine consensus CONFLICTING (score=${localConsensusResult.consensus_score}/100): ${localConsensusResult.conflict_summary}`);
        ctx.log("Stage 42", `FLAGGED_EXCEPTION: ${localConsensusResult.conflict_summary}`);
      }
    } catch (err) {
      ctx.log("Stage 42", `Cross-engine consensus failed (non-fatal): ${String(err)}`);
    }

    // Stage 43: Physics Deviation Score
    try {
      const parsedPhysics = stage7Data ? parsePhysicsAnalysis(JSON.stringify(stage7Data)) : null;
      const claimDataForPhysics = {
        declaredImpactAngle: (claimRecord as any)?.accidentDetails?.impactAngle ?? undefined,
        declaredSeverity: stage7Data?.accidentSeverity ?? undefined,
        damagedZones: (stage6Data?.damagedParts ?? []).map((p: any) => p.location ?? p.name),
      };
      localPhysicsDeviationScore = calculatePhysicsDeviationScore(parsedPhysics, claimDataForPhysics as any);
      ctx.log("Stage 43", `Physics deviation score: ${localPhysicsDeviationScore ?? 'N/A (non-quantitative mode)'}`);
    } catch (err) {
      ctx.log("Stage 43", `Physics deviation score failed (non-fatal): ${String(err)}`);
    }
    // Stage 44: Claim Consistency Check
    try {
      const consistencyInput = {
        stated_speed_kmh: (claimRecord as any)?.accidentDetails?.vehicleSpeed ?? null,
        estimated_speed_kmh: stage7Data?.estimatedSpeedKmh ?? null,
        classified_incident_type: (claimRecord as any)?.accidentDetails?.incidentClassification?.classified_type ?? null,
        narrative_text: (claimRecord as any)?.accidentDetails?.narrativeAnalysis?.rawText ?? null,
        claim_form_incident_type: (claimRecord as any)?.accidentDetails?.incidentType ?? null,
        damage_severity: stage7Data?.accidentSeverity as any ?? null,
        structural_component_count: (stage6Data?.damagedParts ?? []).filter((p: any) => p.isStructural).length || null,
        airbag_deployed: (claimRecord as any)?.accidentDetails?.airbagDeployed ?? null,
        max_crush_depth_m: (stage7Data as any)?.maxCrushDepthM ?? null,
      };
      localConsistencyCheckResult = checkClaimConsistency(consistencyInput);
      ctx.log("Stage 44", `Consistency check: conflicts=${localConsistencyCheckResult.critical_conflicts.length}, proceed=${localConsistencyCheckResult.proceed}`);  
    } catch (err) {
      ctx.log("Stage 44", `Claim consistency check failed (non-fatal): ${String(err)}`);
    }
    // Stage 45: Contradiction Detection Gate
    try {
      const contradictionInput = {
        recommendation: ((localConsensusResult?.consensus_label as string) === 'STRONG' ? 'APPROVE' : 'REVIEW') as any,
        overall_confidence: claimRecord ? Math.max(0, Math.min(100, claimRecord.dataQuality.completenessScore)) : null,
        fraud_result: stage8Data ? {
          fraud_risk_level: stage8Data.fraudRiskLevel,
          fraud_risk_score: stage8Data.fraudRiskScore,
          critical_flag_count: stage8Data.indicators?.filter((i: any) => i.severity === 'critical').length ?? 0,
          scenario_fraud_flagged: stage8Data.fraudRiskScore > 70,
        } : null,
        physics_result: stage7Data ? {
          is_plausible: stage7Data.isPhysicallyPlausible ?? (stage7Data.physicsStatus === 'EXECUTED'),
          confidence: stage7Data.physicsConfidence ?? null,
          has_critical_inconsistency: stage7Data.hasCriticalInconsistency ?? false,
        } : null,
        consistency_status: localConsistencyCheckResult ? {
          overall_status: (localConsistencyCheckResult.critical_conflicts.length === 0 ? 'CONSISTENT' : 'CONFLICTED') as any,
          critical_conflict_count: localConsistencyCheckResult.critical_conflicts.filter((c: any) => c.severity === 'HIGH').length,
          proceed: localConsistencyCheckResult.proceed,
        } : null,
      };
      localContradictionGateResult = detectContradictions(contradictionInput);
      ctx.log("Stage 45", `Contradiction gate: action=${localContradictionGateResult.action}, valid=${localContradictionGateResult.valid}, contradictions=${localContradictionGateResult.contradictions.length}`);
    } catch (err) {
      ctx.log("Stage 45", `Contradiction detection failed (non-fatal): ${String(err)}`);
    }
    // Stage 9b: Turnaround Time Analysis
    const localS9b = await runTurnaroundTimeStage(ctx, claimRecord!, stage6Data!, validatedStage9Data);

    return { validatedStage9Data, localCausalChain, localEvidenceBundle, localRealismBundle, localBenchmarkBundle, localConsensusResult, localS9b, localCostRealismResult, localConsistencyCheckResult, localContradictionGateResult, localPhysicsDeviationScore };
  };

  // Fire Stage 7b re-run and all deterministic post-processing concurrently
  const [updatedCausalVerdict, deterministicResults] = await Promise.all([
    stage7bRerunTask(),
    deterministicPostTask(),
  ]);

  // Apply results from Stage 7b re-run
  if (updatedCausalVerdict) causalVerdict = updatedCausalVerdict;

  // Apply results from deterministic post-processing
  const { validatedStage9Data, localCausalChain, localEvidenceBundle, localRealismBundle, localBenchmarkBundle, localConsensusResult, localS9b, localCostRealismResult, localConsistencyCheckResult, localContradictionGateResult, localPhysicsDeviationScore } = deterministicResults;
  costRealismResult = localCostRealismResult;
  consistencyCheckResult = localConsistencyCheckResult;
  contradictionGateResult = localContradictionGateResult;
  physicsDeviationScoreValue = localPhysicsDeviationScore;
  stage9Data = validatedStage9Data;
  causalChain = localCausalChain;
  evidenceBundle = localEvidenceBundle;
  realismBundle = localRealismBundle;
  benchmarkBundle = localBenchmarkBundle;
  consensusResult = localConsensusResult;
  recordStage("9b_turnaround", localS9b);
  stage9bData = localS9b.data;

  ctx.log("Pipeline", `Post-S8/S9 parallel block complete. causalVerdict updated=${!!updatedCausalVerdict}, stage9b=${localS9b.status}`);

  // ── CROSS-STAGE RECONCILIATION PASS ──────────────────────────────────────
  // Arbitrates conflicts between stages and patches claimRecord with the
  // highest-confidence value for each field. Every override is logged in
  // reconciliationLog so the report can explain every value it shows.
  if (claimRecord) {
    try {
      const narrativeAnalysis = claimRecord.accidentDetails?.narrativeAnalysis ?? null;
      const { patchedRecord, reconciliationLog: rLog } = runReconciliationPass(
        claimRecord,
        stage6Data,
        stage7Data,
        stage8Data,
        stage9Data,
        narrativeAnalysis
      );
      claimRecord = patchedRecord as ClaimRecord;
      reconciliationLog = rLog;
      ctx.log(
        "Reconciliation",
        `Congruency: ${rLog.congruencyScore}% — ${rLog.overrideCount} override(s), ` +
        `${rLog.agreementCount} agreement(s) across ${rLog.overrideCount + rLog.agreementCount} fields.`
      );
    } catch (err) {
      ctx.log("Reconciliation", `Reconciliation pass failed (non-fatal): ${String(err)}`);
    }
  }

  // ── ZOD SCHEMA VALIDATION ────────────────────────────────────────────────────
  // Validate the claimRecord against the schema contract before generating
  // the report. Blocking issues become CG-2 integrity gate violations.
  if (claimRecord) {
    try {
      schemaValidationResult = validateClaimRecordSchema({
        vehicleRegistration: claimRecord.vehicle?.registration ?? null,
        vehicleMake: claimRecord.vehicle?.make ?? null,
        vehicleModel: claimRecord.vehicle?.model ?? null,
        accidentDate: claimRecord.accidentDetails?.date ?? null,
        incidentType: claimRecord.accidentDetails?.incidentType ?? null,
        estimatedCostUsd: stage9Data?.costDecision?.true_cost_usd ?? null,
        vehicleYear: claimRecord.vehicle?.year ?? null,
        estimatedSpeedKmh: claimRecord.accidentDetails?.estimatedSpeedKmh ?? null,
        policyNumber: claimRecord.insuranceContext?.policyNumber ?? null,
        excessAmountUsd: claimRecord.insuranceContext?.excessAmountUsd ?? null,
        insurer: claimRecord.insuranceContext?.insurerName ?? null,
        policeReportNumber: (claimRecord as any)?.insuranceContext?.policeReportNumber ?? null,
        fraudScore: stage8Data?.fraudRiskScore ?? null,
        physicsConsistencyScore: stage7Data?.damageConsistencyScore ?? null,
        dataCompletenessScore: claimRecord.dataQuality?.completenessScore ?? null,
        photosDetected: (claimRecord as any)?._photosDetected ?? null,
        photosIngested: (claimRecord as any)?._photosIngested ?? null,
      });
      ctx.log(
        "SchemaValidation",
        `Compliance: ${schemaValidationResult.complianceScore}% — ` +
        `${schemaValidationResult.blockingIssues.length} blocking, ` +
        `${schemaValidationResult.warnings.length} warning(s). ` +
        (schemaValidationResult.blockingIssues.length > 0
          ? `Blocking: ${schemaValidationResult.blockingIssues.map(i => i.field).join(", ")}`
          : "All required fields present.")
      );
    } catch (err) {
      ctx.log("SchemaValidation", `Schema validation failed (non-fatal): ${String(err)}`);
    }
  }

  // ── CLAIM TRUTH LAYER ─────────────────────────────────────────────────────
  // Unifies all extraction and analysis outputs into a single authoritative
  // claim picture. Resolves contradictions between engines (evidence registry
  // vs image classifier, multiple quotes, timeline dates) BEFORE report generation.
  // Both reports (Forensic + Claims) read from this unified truth.
  try {
    // Build CTL input from all available stage outputs
    const ctlExtractedQuotes = stage3Data?.inputRecovery?.extracted_quotes ?? [];
    const ctlKingaEstimate = stage9Data?.expectedRepairCostCents
      ? stage9Data.expectedRepairCostCents / 100
      : null;
    const ctlKingaEstimateSource = stage9Data?.costDecision?.cost_basis ?? "ai_estimate";

    // Parse enrichedPhotosJson from ctx for CTL fallback (Stage 6 vision output)
    const ctlEnrichedPhotos: { url: string; confidenceScore?: number }[] = (() => {
      try {
        const raw = (ctx as any).enrichedPhotosJson;
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed.filter((p: any) => p?.url) : [];
      } catch { return []; }
    })();
    claimTruth = buildClaimTruth({
      claimRecord: claimRecord!,
      stage3Data: stage3Data ?? null,
      evidenceRegistry: evidenceRegistryData ?? null,
      classifiedImages: ctx.classifiedImages ?? null,
      enrichedPhotos: ctlEnrichedPhotos.length > 0 ? ctlEnrichedPhotos : null,
      extractedQuotes: ctlExtractedQuotes,
      kingaEstimateUsd: ctlKingaEstimate,
      kingaEstimateSource: ctlKingaEstimateSource,
      systemCreatedAt: ctx.claim?.createdAt ? new Date(ctx.claim.createdAt) : null,
      totalPages: (stage1Data as any)?.totalPages ?? (ctx as any).totalPages ?? 0,
    });
    ctx.log("CTL", `Claim Truth Layer resolved: quotes=${claimTruth.costBasis.quotes.length}, ` +
      `optimisedCost=$${claimTruth.costBasis.optimisedCostUsd.toFixed(2)}, ` +
      `photos=${claimTruth.evidence.photoCount}, ` +
      `decision=${claimTruth.decision.recommendation}, ` +
      `conflicts=${claimTruth.meta.conflictsResolved.length}`);
    if (claimTruth.meta.conflictsResolved.length > 0) {
      for (const c of claimTruth.meta.conflictsResolved) {
        ctx.log("CTL", `  CONFLICT [${c.field}]: chose "${c.chosen}" over "${c.rejected}" \u2014 ${c.reason}`);
      }
    }
    // Enrich with physics results (Stage 7 already ran)
    if (stage7Data && claimTruth) {
      const airbagDeployed = claimRecord?.accidentDetails?.airbagDeployment === true;
      claimTruth = enrichClaimTruthWithPhysics(claimTruth, {
        deltaVKmh: stage7Data.deltaVKmh ?? null,
        airbagDeployed,
        airbagThresholdKmh: 25,
        estimatedSpeedKmh: stage7Data.estimatedSpeedKmh ?? null,
        damageConsistencyScore: stage7Data.damageConsistencyScore ?? null,
      });
      if (claimTruth.fraudSignals.physicsAnomalies.length > 0) {
        ctx.log("CTL", `Physics enrichment: ${claimTruth.fraudSignals.physicsAnomalies.length} anomaly(ies) detected. ` +
          claimTruth.fraudSignals.physicsAnomalies.map(a => `[${a.severity}] ${a.type}`).join(", "));
      }
    }
    // Attach to context so downstream consumers (Stage 10, reports) can access it
    (ctx as any).claimTruth = claimTruth;
  } catch (ctlErr) {
    ctx.log("CTL", `Claim Truth Layer error (non-fatal): ${ctlErr instanceof Error ? ctlErr.message : String(ctlErr)}`);
  }

  // ── PRE-REPORT INTEGRITY GATE ─────────────────────────────────────────────
  // Hard checks before Stage 10. If any CRITICAL check fails, the report is
  // generated in BLOCKED mode — it is produced but stamped as NOT READY FOR
  // DECISION and the blocking reasons are surfaced prominently.
  const integrityGateResult = (() => {
    const blockingReasons: string[] = [];
    const warnings: string[] = [];

    // Promote Zod schema blocking issues to CG-2 violations
    if (schemaValidationResult && !schemaValidationResult.valid) {
      for (const issue of schemaValidationResult.blockingIssues) {
        blockingReasons.push(`CG-2 [${issue.field}]: ${issue.message}`);
      }
    }
    // Promote Zod schema warnings to gate warnings
    if (schemaValidationResult) {
      for (const w of schemaValidationResult.warnings) {
        warnings.push(`Schema [${w.field}]: ${w.message}`);
      }
    }

    // CG-1: FCDI floor — if FCDI < 40%, the pipeline ran with too many fallbacks
    // to produce a reliable report. The report is blocked.
    // (FCDI is computed in Stage 13 after Stage 10, so we use the consensus score
    //  as a proxy here — if consensus is CONFLICTING, treat as low-confidence.)
    if (consensusResult?.consensus_label === "CONFLICTING" && (consensusResult?.consensus_score ?? 100) < 40) {
      blockingReasons.push(
        `CG-1: Cross-engine consensus CONFLICTING with score ${consensusResult.consensus_score}/100 — ` +
        `multiple engines fundamentally disagree. Manual review required before decision.`
      );
    }

    // CG-2: Critical fields — vehicle registration and incident date are required
    // for a legally defensible report.
    const reg = claimRecord?.vehicle?.registration ?? (claimRecord as any)?.vehicleRegistration;
    if (!reg) {
      blockingReasons.push(
        `CG-2: Vehicle registration not extracted. Report cannot be used for repudiation decisions.`
      );
    }
    const incDate = claimRecord?.accidentDetails?.date;
    if (!incDate) {
      blockingReasons.push(
        `CG-2: Incident date not extracted. Chronological analysis is unreliable.`
      );
    }

    // CG-3: Photos detected but not ingested — flag as warning (not blocking)
    const photosDetected = (claimRecord as any)?._photosDetected;
    const photosIngested = (claimRecord as any)?._photosIngested;
    if (photosDetected && !photosIngested) {
      warnings.push(
        `CG-3: Damage photographs detected in source document but not processed. ` +
        `Damage analysis is based on text description only.`
      );
    }

    // CG-4: Reconciliation congruency — if congruency < 50%, too many fields
    // were overridden between stages, indicating data quality issues.
    if (reconciliationLog && reconciliationLog.congruencyScore < 50) {
      warnings.push(
        `CG-4: Cross-stage congruency score is ${reconciliationLog.congruencyScore}% — ` +
        `multiple fields were revised between pipeline stages. Review reconciliation log.`
      );
    }

    const blocked = blockingReasons.length > 0;
    if (blocked) {
      ctx.log("IntegrityGate", `BLOCKED — ${blockingReasons.length} critical issue(s): ${blockingReasons.join(" | ")}`);
    } else if (warnings.length > 0) {
      ctx.log("IntegrityGate", `PROCEED WITH WARNINGS — ${warnings.join(" | ")}`);
    } else {
      ctx.log("IntegrityGate", `CLEAR — all critical checks passed.`);
    }

    return { blocked, blockingReasons, warnings };
  })();

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

  ctx.onStageStart?.("Stage 10 — Report Generation");
  const s10 = await runWithTimeout("10_report", () => runReportGenerationStage(
    ctx, claimRecord,
    stage6Data, stage7Data, stage8Data, stage9Data, stage9bData,
    allAssumptions,
    causalChain,
    evidenceTrace
  )).catch((err) => {
    const isTimeout = err instanceof StageTimeoutError;
    const reason = isTimeout
      ? `stage_timeout: exceeded ${err.budgetMs}ms budget`
      : `engine_failure: ${String(err)}`;
    ctx.log("Stage 10", `${isTimeout ? "TIMEOUT" : "ERROR"}: ${err.message} — producing minimal report from available data`);
    // Stage 10 has no engineFallback equivalent — it is a report assembler, not an engine.
    // The minimal report is built from claimRecord (always available) and marks all
    // analysis sections as unavailable. This is the same output the stage's own catch block produces.
    const minimalReport = {
      claimSummary: {
        title: "Claim Summary",
        content: {
          claimId: claimRecord?.claimId ?? ctx.claimId,
          status: "report_generation_failed",
          note: `Report generation ${isTimeout ? "timed out" : "failed"}: ${reason}. Manual review required.`,
        },
      },
      damageAnalysis: { title: "Damage Analysis", content: { available: false, note: "Report generation failed." } },
      physicsReconstruction: { title: "Physics Reconstruction", content: { available: false, note: "Report generation failed." } },
      costOptimisation: { title: "Cost Optimisation", content: { available: false, note: "Report generation failed." } },
      fraudRiskIndicators: { title: "Fraud Risk Indicators", content: { available: false, note: "Report generation failed." } },
      turnaroundTimeEstimate: { title: "Turnaround Time Estimate", content: { available: false, note: "Report generation failed." } },
      supportingImages: { title: "Supporting Images", content: { available: false } },
      fullReport: {
        reportVersion: "3.0",
        generatedAt: new Date().toISOString(),
        claimId: claimRecord?.claimId ?? ctx.claimId,
        overallConfidence: 5,
        error: reason,
        sections: {},
      },
      generatedAt: new Date().toISOString(),
      confidenceScore: 5,
      assumptions: allAssumptions,
      missingDocuments: [],
      missingFields: claimRecord?.dataQuality?.missingFields ?? [],
      evidenceTrace: null,
      decisionReadiness: null,
      degradationReasons: [reason],
    };
    return {
      status: "degraded" as const,
      data: minimalReport,
      error: err.message,
      durationMs: isTimeout ? err.budgetMs : 0,
      savedToDb: false,
      _timedOut: isTimeout,
      assumptions: [{
        field: "report",
        assumedValue: "minimal_report",
        reason: `Stage 10 ${isTimeout ? "timed out" : "failed"}: ${reason}. Minimal report produced from claimRecord only.`,
        strategy: "default_value" as const,
        confidence: 5,
        stage: "Stage 10",
      }],
      recoveryActions: [{
        target: "report_generation_recovery",
        strategy: "default_value" as const,
        success: true,
        description: `Stage 10 ${isTimeout ? "timeout" : "error"} caught. Minimal report produced. All analysis sections marked as unavailable.`,
      }],
      degraded: true,
    };
  });
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
  await runAutoValuation(ctx, (stage, msg) => ctx.log(stage, msg), claimRecord);

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
      // Cross-stage reconciliation log — every field override between stages
      reconciliationLog: reconciliationLog ?? null,
      // Pre-report integrity gate result
      integrityGate: integrityGateResult,
      // Photo ingestion quality log — extraction method, quality gate results, scanned PDF flag
      photoIngestionLog: (ctx as any).photoIngestionLog ?? null,
      // Pipeline state machine summary — for audit trail and health dashboard
      pipelineStateMachine: psm.toSummary(),
      // Anomaly sentinels — named invariant violations
      anomalySentinelViolations: runAnomalySentinels({
        trueCostUsd: stage9Data?.costDecision?.true_cost_usd ?? null,
        damageComponentCount: stage6Data?.damagedParts?.length ?? 0,
        fraudScore: stage8Data?.fraudRiskScore ?? null,
        physicsPlausibilityScore: stage7Data?.damageConsistencyScore ?? null,
        photosProcessed: (ctx.damagePhotoUrls?.length ?? 0) > 0,
        photoCount: ctx.damagePhotoUrls?.length ?? 0,
        incidentTypeKnown: !!(claimRecord?.accidentDetails?.incidentType),
        fraudScoreRuleTrace: (stage8Data as any)?.ruleTraceScore ?? null,
        fraudScoreWeighted: stage8Data?.fraudRiskScore ?? null,
      }),
    };
    // ── FCDI: Forensic Confidence Degradation Index ──────────────────────────────────────────
    // Compute how far this pipeline run is from being fully reliable.
    // Penalises fallbacks, timeouts, assumptions, low-confidence stages, skipped critical stages,
    // and named domain penalties (IMAGE_PIPELINE_FAILURE, MISSING_POLICY_NUMBER, etc.).

    // Domain Penalty Engine — compute named penalties from pipeline state
    const domainPenalties: DomainPenalty[] = [];
    // IMAGE_PIPELINE_FAILURE: no photos extracted or Stage 6 degraded
    const _s2Status = stages['2_extraction']?.status;
    const _s6Status = stages['6_damage_analysis']?.status;
    const _photosAvailable = (ctx.damagePhotoUrls ?? []).length > 0;
    if (!_photosAvailable || _s6Status === 'degraded' || _s2Status === 'failed') {
      domainPenalties.push({
        code: 'IMAGE_PIPELINE_FAILURE',
        reason: !_photosAvailable
          ? 'No damage photos were extracted from the submitted documents. Visual damage analysis could not be performed.'
          : _s6Status === 'degraded'
          ? 'Stage 6 (damage vision analysis) ran on fallback output. Visual damage analysis is unreliable.'
          : 'Stage 2 (text extraction) failed. Document images could not be extracted for damage analysis.',
      });
    }
    // MISSING_POLICY_NUMBER: policy number absent from all extracted documents
    if (claimRecord && !claimRecord.insuranceContext?.policyNumber) {
      domainPenalties.push({
        code: 'MISSING_POLICY_NUMBER',
        reason: 'Policy number could not be extracted from any submitted document. Coverage verification is not possible without a policy reference.',
      });
    }
    // PHYSICS_INCONSISTENCY: Stage 7 physics analysis flagged a speed/delta-V mismatch
    if (stage7Data && (stage7Data as any).physicsInconsistency === true) {
      domainPenalties.push({
        code: 'PHYSICS_INCONSISTENCY',
        reason: 'Stage 7 physics analysis detected a mismatch between the claimed impact speed and the delta-V implied by the observed damage pattern.',
      });
    }
    // MULTI_EVENT_UNRESOLVED: multi-event sequence detected but causal chain unconfirmed
    const _multiEventData = (claimRecord as any)?.accidentDetails?.multiEventSequence;
    if (_multiEventData && _multiEventData.is_multi_event === true && _multiEventData.causal_chain_confirmed === false) {
      domainPenalties.push({
        code: 'MULTI_EVENT_UNRESOLVED',
        reason: 'A multi-event incident sequence was detected but the causal chain between events could not be confirmed. The damage apportionment between events is uncertain.',
      });
    }
    if (domainPenalties.length > 0) {
      ctx.log('Stage13', `Domain penalties applied: ${domainPenalties.map(dp => dp.code).join(', ')}`);
    }

    const fcdiInput = {
      stages: Object.fromEntries(
        Object.entries(stages).map(([id, s]) => [
          id,
          {
            status: s.status,
            degraded: s.status === "degraded",
            _timedOut: (s as any)._timedOut ?? false,
            assumptionCount: (s as any).assumptionCount ?? 0,
            confidenceScore: (s as any).confidenceScore ?? null,
          },
        ])
      ),
      totalAssumptionCount: allAssumptions.length,
      domainPenalties,
    };
    const fcdiResult = computeFCDI(fcdiInput);
    forensicAnalysisResult.fcdi = fcdiResult;
    ctx.log("Stage13", `FCDI: ${fcdiResult.scorePercent}% (${fcdiResult.label}) — ${fcdiResult.explanation.slice(0, 100)}`);
    // ── FEL: Forensic Execution Ledger ─────────────────────────────────────────────────────────
    // Build a per-stage audit record for court-grade traceability.
    // Each record captures: input hash, output snapshot, fallback used,
    // assumptions introduced, confidence score, model/prompt/contract versions.
    const felStageRecords: StageExecutionRecord[] = Object.entries(stages).map(([stageId, s]) => {
      return buildStageRecord({
        stageId,
        input: null, // Input hashing requires stage-level instrumentation (Phase 2B)
        output: (s as any).outputSnapshot ?? null,
        executionTimeMs: s.durationMs ?? 0,
        timedOut: (s as any)._timedOut ?? false,
        fallbackUsed: s.status === "degraded" ? (s as any).fallbackFunction ?? "unknown_fallback" : null,
        assumptions: allAssumptions.filter((a: any) => a.stageId === stageId),
        confidenceScore: (s as any).confidenceScore ?? null,
        status: (s.status === "success" || s.status === "degraded" || s.status === "skipped" || s.status === "failed")
          ? s.status as "success" | "degraded" | "skipped" | "failed"
          : "success",
      });
    });
    const fel = buildForensicExecutionLedger({
      claimId: ctx.claimId,
      pipelineRunAt: new Date().toISOString(),
      totalDurationMs: Date.now() - pipelineStart,
      stageRecords: felStageRecords,
      fcdiScorePercent: fcdiResult.scorePercent,
      fcdiLabel: fcdiResult.label,
      finalPipelineState: psm.toSummary().currentState,
    });
    forensicAnalysisResult.forensicExecutionLedger = fel;
    ctx.log("Stage13", `FEL built: ${felStageRecords.length} stage records, replayable=${fel.replayable}`);

    // ── Phase 4B: FEL Version Snapshot ────────────────────────────────────────
    // Build per-stage version snapshots for deterministic replay tracking.
    try {
      const pipelineRunAt = new Date().toISOString();
      const stageVersionSnapshots = Object.entries(stages).map(([stageId, s]) =>
        buildStageVersionSnapshot({
          stageId,
          executedAt: pipelineRunAt,
          inputSnapshot: null,
          outputSnapshot: (s as any).outputSnapshot ?? null,
        })
      );
      const felVersionSnapshot = buildFELVersionSnapshot(
        ctx.claimId,
        pipelineRunAt,
        stageVersionSnapshots
      );
      forensicAnalysisResult.felVersionSnapshot = felVersionSnapshot;
      ctx.log("Stage13", `FEL version snapshot: platform=${KINGA_PLATFORM_VERSION}, stages=${stageVersionSnapshots.length}, replaySupported=${felVersionSnapshot.replaySupported}`);
    } catch (felVersionErr) {
      ctx.log("Stage13", `FEL version snapshot build failed (non-fatal): ${String(felVersionErr)}`);
    }
    // ── Phase 4A: IFE + DOE results — add to forensicAnalysisResult for db.ts persistence ──
    forensicAnalysisResult.ifeResult = stage9Data?.ifeResult ?? null;
    forensicAnalysisResult.doeResult = stage9Data?.doeResult ?? null;
    ctx.log("Stage13", `IFE result: ${forensicAnalysisResult.ifeResult ? 'present' : 'absent'}, DOE result: ${forensicAnalysisResult.doeResult ? 'present' : 'absent'}`);
     ctx.log("Stage13", `Forensic analysis built: ${Object.keys(forensicAnalysisResult).length} sections`);
  } catch (err) {
    ctx.log("Stage13", `Forensic analysis build error (non-fatal): ${err instanceof Error ? err.message : String(err)}`);
  }


  // ── Phase 6: Pipeline Completeness Guard ─────────────────────────────────
  // Throws PipelineIncompleteError if IFE or DOE is absent.
  const _guardResult = enforceCompletenessOrThrow(ctx.claimId, {
    ifeResult: stage9Data?.ifeResult ?? null,
    doeResult: stage9Data?.doeResult ?? null,
    felVersionSnapshot: forensicAnalysisResult?.felVersionSnapshot ?? null,
    // DOE is only required when the claim has repair quotes submitted.
    // Claims without quotes (theft, total loss, early-stage) skip DOE entirely.
    claimHasQuotes: (stage9Data?.quoteCount ?? 0) > 0,
  });
  if (_guardResult.failureState === "REPLAY_INCOMPLETE") {
    ctx.log("Stage13", `REPLAY_INCOMPLETE: ${_guardResult.exceptionReason}`);
  }

  return buildResult(
    stages, pipelineStart, ctx.claimId,
    claimRecord, stage10Data,
    stage6Data, stage7Data, stage8Data, stage9Data,
    /* turnaroundAnalysis */ stage9bData,
    /* stage4Output */ stage4Data,
    causalChain, evidenceBundle, realismBundle, benchmarkBundle, consensusResult,
    causalVerdict, evidenceRegistryData, validatedOutcomeResult, caseSignatureResult,
    documentVerificationResult, stage2RawOcrText,
    decisionAuthorityResult, reportReadinessResult, forensicAnalysisResult,
    (ctx as any).enrichedPhotosJson ?? null,
    ctx.classifiedImages ?? null,
    coherenceResult,
    costRealismResult,
    consistencyCheckResult,
    contradictionGateResult,
    physicsDeviationScoreValue,
    claimTruth
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
  stage4Output: Stage4Output | null = null,
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
  enrichedPhotosJson: string | null = null,
  classifiedImages: import('./imageClassifier').ClassificationResult | null = null,
  coherenceResult: import('./damagePhysicsCoherence').DamagePhysicsCoherenceResult | null = null,
  costRealismResult: import('./costRealismValidator').CostRealismResult | null = null,
  consistencyCheckResult: import('./claimConsistencyChecker').ConsistencyCheckResult | null = null,
  contradictionGateResult: import('./contradictionDetectionEngine').ContradictionResult | null = null,
  physicsDeviationScoreValue: number | null = null,
  claimTruthResult: ClaimTruth | null = null
) {
  const allSaved = Object.values(stages).every(s => s.savedToDb || s.status === "skipped");

  // ── System Intervention Tracker ───────────────────────────────────────────
  // Records every deterministic correction applied by the pipeline so auditors
  // can distinguish "clean extraction" from "system-corrected output".
  // This keeps the system honest: corrections are visible, not hidden.
  const interventionSummary: string[] = [];

  // 1. Classification fallback applied (incident_type was 'unknown', defaulted to 'collision')
  const classificationFallbackApplied =
    (claimRecord as any)?.accidentDetails?.incidentType === 'collision' &&
    (claimRecord as any)?.accidentDetails?.incidentClassification?.confidence <= 30;
  if (classificationFallbackApplied) {
    interventionSummary.push('classification fallback applied (unknown → collision)');
  }

  // 2. Policy number cleared (domain corrector detected a label fragment)
  const policyNumberCleared =
    (claimRecord as any)?.insuranceContext?.policyNumber === 'INVALID_EXTRACTION';
  if (policyNumberCleared) {
    interventionSummary.push('policy number cleared (label fragment detected)');
  }

  // 3. Physics skipped due to missing speed
  const physicsSkipped = physicsAnalysis?.physicsStatus === 'SKIPPED_NO_SPEED';
  if (physicsSkipped) {
    interventionSummary.push('physics skipped (speed not in document)');
  }

  // 4. Physics fallback (engine failed, simplified estimate used)
  const physicsFallback = physicsAnalysis?.physicsStatus === 'ESTIMATED_FALLBACK';
  if (physicsFallback) {
    interventionSummary.push('physics estimated fallback (engine unavailable)');
  }

  // 5. Any stage ran in degraded mode
  const degradedStages = Object.entries(stages)
    .filter(([, s]) => s.degraded)
    .map(([name]) => name);
  if (degradedStages.length > 0) {
    interventionSummary.push(`degraded stages: ${degradedStages.join(', ')}`);
  }

  const systemInterventionCount = interventionSummary.length;

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
    stage4Output,
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
    // Image classification results from Stage 2.6 — used by forensic validator and claim quality scorer
    classifiedImages,
    // System intervention tracking — counts and describes every deterministic correction applied
    // Allows auditors to distinguish clean extraction from system-corrected output
    systemInterventionCount,
    interventionSummary,
    // Phase 3: Missing analytics fields — now computed and returned
    coherenceResult,
    costRealismResult,
    consistencyCheckResult,
    contradictionGateResult,
    physicsDeviationScoreValue,
    claimTruth: claimTruthResult,
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
      accidentDate: ctx.claim.incidentDate || null,
      accidentLocation: ctx.claim.incidentLocation || null,
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
      policeOfficerName: null,
      policeChargeNumber: null,
      policeFineAmountCents: null,
      policeReportDate: null,
      policeChargedParty: null,
      policeInvestigationStatus: null,
      policeOfficerFindings: null,
      thirdPartyAccountSummary: null,
      thirdPartyName: null,
      thirdPartyIdNumber: null,
      thirdPartyAddress: null,
      thirdPartyPhone: null,
      thirdPartyInsurerName: null,
      thirdPartyInsurerAddress: null,
      thirdPartyInsurerPhone: null,
      thirdPartyPolicyNumber: null,
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
      productType: null,
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
      repairCountry: null,
      quoteCurrency: null,
      policyExclusions: null,
      assessorInspectionDate: null,
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
      collisionScenario: "unknown" as const, isStruckParty: false,
      thirdPartyClaimRequired: false, isHitAndRun: false, isParkingLotDamage: false,
      multiEventSequence: null,
    },
    policeReport: { reportNumber: null, station: null, officerName: null, chargeNumber: null, fineAmountCents: null, reportDate: null },
    damage: { description: null, components: [], imageUrls: ctx.damagePhotoUrls || [] },
    repairQuote: {
      repairerName: null, repairerCompany: null, assessorName: null,
      quoteTotalCents: null, agreedCostCents: null, labourCostCents: null, partsCostCents: null, lineItems: [],
    },
    insuranceContext: {
      insurerName: null,
      policyNumber: ctx.claim.policyNumber || null,
      productType: null,
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
