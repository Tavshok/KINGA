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
import { computeSeverityConsensus, buildSeverityConsensusInput } from "./severityConsensusEngine";
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

  // ── STAGE 7: Physics Analysis ────────────────────────────────────────
  const s7 = await runPhysicsStage(ctx, claimRecord, stage6Data!);
  recordStage("7_physics", s7);
  stage7Data = s7.data; // Always has data (self-healing)

  // ── STAGE 7c: Severity Consensus Engine ──────────────────────────────────
  // Fuses physics severity, damage severity score, and image severity signals
  // into a single authoritative final_severity verdict.
  try {
    const enrichedPhotosForSeverity: string | null = (ctx as any).enrichedPhotosJson ?? null;
    const severityInput = buildSeverityConsensusInput(
      stage6Data,
      stage7Data,
      enrichedPhotosForSeverity
    );
    const severityConsensus = computeSeverityConsensus(severityInput);
    if (stage7Data) {
      (stage7Data as any).severityConsensus = severityConsensus;
    }
    ctx.log(
      "Stage 7c (SeverityConsensus)",
      `Final severity: ${severityConsensus.final_severity} (${severityConsensus.source_alignment}, ` +
      `confidence: ${severityConsensus.confidence}%). Sources: physics=${severityConsensus.source_signals.physics ?? "N/A"}, ` +
      `damage=${severityConsensus.source_signals.damage ?? "N/A"}, ` +
      `image=${severityConsensus.source_signals.image ?? "N/A"}.`
    );
  } catch (err) {
    ctx.log("Stage 7c (SeverityConsensus)", `Severity consensus failed (non-fatal): ${String(err)}`);
  }

  // ── STAGE 7b: Causal Reasoning Engine ──────────────────────────────────
  // Reads description + photos + physics + damage components and produces a
  // structured causal verdict: inferred cause, plausibility score, evidence,
  // contradictions, and an adjuster-style narrative conclusion.
  try {
    const enrichedPhotosJson: string | null = (ctx as any).enrichedPhotosJson ?? null;
    causalVerdict = await runCausalReasoningEngine(
      claimRecord!,
      stage6Data,
      stage7Data,
      enrichedPhotosJson
    );
    ctx.log(
      "Stage 7b",
      `Causal verdict: cause="${causalVerdict.inferredCause.substring(0, 80)}", ` +
      `plausibility=${causalVerdict.plausibilityScore}% (${causalVerdict.plausibilityBand}), ` +
      `direction=${causalVerdict.inferredCollisionDirection}, ` +
      `physics=${causalVerdict.physicsAlignment}, images=${causalVerdict.imageAlignment}, ` +
      `fraudFlag=${causalVerdict.flagForFraud}, llmUsed=${causalVerdict.llmUsed}`
    );
    // If causal engine inferred a better collision direction, update claimRecord
    if (
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
      ctx.log("Stage 7b", `Updated collision direction to '${causalVerdict.inferredCollisionDirection}' from causal reasoning.`);
    }
  } catch (err) {
    ctx.log("Stage 7b", `Causal reasoning engine failed (non-fatal): ${String(err)}`);
  }

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
  // Pass stage3Data so fraud engine can use inputRecovery (images_present flag)
  const s8 = await runFraudAnalysisStage(ctx, claimRecord, stage6Data!, stage7Data!, stage3Data ?? undefined);
  recordStage("8_fraud", s8);
  stage8Data = s8.data; // Always has data (self-healing)

  // ── STAGE 7d: Confidence Aggregation ────────────────────────────────────
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

  // ── STAGE 9: Cost Optimisation ───────────────────────────────────────
  // Pass stage3Data so cost engine can use inputRecovery.recovered_quote when quoteTotalCents is missing
  const s9 = await runCostOptimisationStage(ctx, claimRecord, stage6Data!, stage7Data!, stage3Data ?? undefined);
  recordStage("9_cost", s9);
  stage9Data = s9.data; // Always has data (self-healing)

  // ── STAGE 7b RE-RUN: Causal Reasoning with Downstream Scores ─────────────
  // After Stages 8 (fraud) and 9 (cost) complete, re-run Stage 7b with the
  // fraud risk score, fraud indicators, and quote deviation populated in
  // precomputedScores. This gives the causal engine a complete forensic picture.
  if (stage8Data && stage9Data) {
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

  // ── STAGE 10: Report Generation ──────────────────────────────────────
  const s10 = await runReportGenerationStage(
    ctx, claimRecord,
    stage6Data, stage7Data, stage8Data, stage9Data, stage9bData,
    allAssumptions,
    causalChain
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

  ctx.log("Pipeline", `Pipeline complete. Total: ${Date.now() - pipelineStart}ms, Assumptions: ${allAssumptions.length}, Recoveries: ${allRecoveryActions.length}`);

  return buildResult(
    stages, pipelineStart, ctx.claimId,
    claimRecord, stage10Data,
    stage6Data, stage7Data, stage8Data, stage9Data, stage9bData,
    causalChain, evidenceBundle, realismBundle, benchmarkBundle, consensusResult,
    causalVerdict, evidenceRegistryData, validatedOutcomeResult
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
  validatedOutcome: ValidatedOutcomeResult | null = null
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
    causalChain,
    evidenceBundle,
    realismBundle,
    benchmarkBundle,
    consensusResult,
    causalVerdict,
    evidenceRegistry,
    validatedOutcome,
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
      massKg: 1400, massTier: "not_available" as const, valueUsd: null,
    },
    driver: { name: ctx.claim.driverName || null, claimantName: ctx.claim.claimantName || null },
    accidentDetails: {
      date: ctx.claim.accidentDate || null, location: null, description: null,
      incidentType: "collision", incidentSubType: null, incidentClassification: null,
      collisionDirection: "unknown",
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
