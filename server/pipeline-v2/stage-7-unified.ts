/*
 * pipeline-v2/stage-7-unified.ts
 *
 * STAGE 7 — UNIFIED FORENSIC REASONING ENGINE
 *
 * Replaces the sequential cluster of:
 *   - Stage 7  (physics analysis)
 *   - Stage 7b Pass 1 (causal reasoning — first pass, before fraud/cost scores)
 *   - Stage 7c (severity consensus)
 *   - Stage 7e (incident narrative engine)
 *
 * These four stages share the same inputs (ClaimRecord + Stage6Output) and were
 * called sequentially, each making a separate LLM call. This engine merges them
 * into a single orchestrated call that produces all required downstream fields
 * in one pass by delegating to the existing engines in the correct order.
 *
 * PRESERVED SEPARATELY (not merged):
 *   - Stage 7b Pass 2: re-run of causal reasoning AFTER Stage 8 fraud scores and
 *     Stage 9 cost deviation are known. This must remain separate because it needs
 *     outputs that don't exist when Stage 7 runs.
 *
 * DOWNSTREAM CONTRACTS PRESERVED:
 *   - Stage7Output: all fields including latentDamageProbability (5 floats),
 *     damageConsistencyScore, accidentSeverity, physicsExecuted, deltaVKmh,
 *     impactForceKn, damagePatternValidation (computed inside physics engine)
 *   - CausalVerdict: all fields including inferredCollisionDirection, flagForFraud,
 *     plausibilityScore, supportingEvidence, contradictions, alternativeCauses
 *   - NarrativeAnalysis: all fields including cleaned_incident_narrative,
 *     fraud_signals, consistency_verdict, stripped_content
 */

import { runPhysicsStage } from "./stage-7-physics";
import { runCausalReasoningEngine } from "./stage-7b-causal-reasoning";
import { computeSeverityConsensus, buildSeverityConsensusInput } from "./severityConsensusEngine";
import { runIncidentNarrativeEngine } from "./incidentNarrativeEngine";
import type {
  PipelineContext,
  Stage6Output,
  Stage7Output,
  ClaimRecord,
  StageResult,
} from "./types";
import type { CausalVerdict } from "./stage-7b-causal-reasoning";
import type { NarrativeAnalysis } from "./incidentNarrativeEngine";
import type { DamagePatternOutput } from "./damagePatternValidationEngine";
import type { AnimalStrikePhysicsOutput } from "./animalStrikePhysicsEngine";
import type { SeverityConsensusOutput } from "./severityConsensusEngine";

// ─────────────────────────────────────────────────────────────────────────────
// Output type — carries all three merged outputs
// ─────────────────────────────────────────────────────────────────────────────

export interface UnifiedStage7Output {
  physicsAnalysis: Stage7Output;
  causalVerdict: CausalVerdict;
  narrativeAnalysis: NarrativeAnalysis;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main entry point
// ─────────────────────────────────────────────────────────────────────────────

/**
 * runUnifiedStage7
 *
 * Orchestrates Stage 7 (physics), Stage 7c (severity consensus),
 * Stage 7b Pass 1 (causal reasoning), and Stage 7e (narrative analysis).
 *
 * Execution order:
 *   1. Stage 7  (physics) — deterministic, must run first
 *   2. Stage 7c (severity consensus) — deterministic, needs physics output
 *   3. Stage 7b (causal) ‖ Stage 7e (narrative) — both need physics output,
 *      neither needs the other's output, so they run concurrently.
 *
 * @param ctx            Pipeline context (logging, claim ID, photo URLs)
 * @param claimRecord    Assembled claim record from Stage 5
 * @param damageAnalysis Stage 6 damage analysis output
 * @param preRunPattern  Optional pre-computed damage pattern (pass null; computed inside physics engine)
 * @param preRunAnimal   Optional pre-computed animal strike physics (pass null; computed inside physics engine)
 * @param photoUrls      Damage photo URLs for causal reasoning vision context
 */
export async function runUnifiedStage7(
  ctx: PipelineContext,
  claimRecord: ClaimRecord,
  damageAnalysis: Stage6Output,
  preRunPattern: DamagePatternOutput | null,
  preRunAnimal: AnimalStrikePhysicsOutput | null,
  photoUrls: string[]
): Promise<StageResult<UnifiedStage7Output>> {
  const start = Date.now();

  // ── STEP 1: Physics Analysis (Stage 7) ──────────────────────────────────
  // Deterministic engine — no LLM call. Runs animal strike or collision physics.
  // Includes damage pattern validation internally.
  const physicsResult = await runPhysicsStage(ctx, claimRecord, damageAnalysis);
  const physicsAnalysis = physicsResult.data!;

  // ── STEP 2: Severity Consensus (Stage 7c) ────────────────────────────────
  // Deterministic engine — fuses physics, damage, and image severity signals.
  // Attaches result to physicsAnalysis.severityConsensus for downstream consumers.
  try {
    const enrichedPhotosJson: string | null = (ctx as any).enrichedPhotosJson ?? null;
    const severityInput = buildSeverityConsensusInput(damageAnalysis, physicsAnalysis, enrichedPhotosJson);
    const severityConsensus: SeverityConsensusOutput = computeSeverityConsensus(severityInput);
    physicsAnalysis.severityConsensus = severityConsensus;
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

  // ── STEPS 3 & 4 (concurrent): Causal Reasoning + Narrative Analysis ─────
  //
  // Stage 7b (causal reasoning) and Stage 7e (narrative analysis) both depend
  // only on physicsAnalysis (Step 2 output) and claimRecord/damageAnalysis.
  // Neither depends on the other's output, so they run concurrently.
  //
  // This saves approximately 8–12 seconds per claim (the time Stage 7e was
  // previously waiting for Stage 7b's definePhysicsConstraints + constraintNarrative
  // LLM calls to complete before it could start).
  const enrichedPhotosJson: string | null = (ctx as any).enrichedPhotosJson ?? null;
  const rawDescription = claimRecord.accidentDetails?.description ?? "";

  const causalReasoningTask = async (): Promise<CausalVerdict> => {
    try {
      const verdict = await runCausalReasoningEngine(
        claimRecord,
        damageAnalysis,
        physicsAnalysis,
        enrichedPhotosJson
        // No precomputedScores — this is Pass 1 (fraud/cost scores not yet available)
      );
      ctx.log(
        "Stage 7b (CausalReasoning)",
        `Causal verdict: cause="${verdict.inferredCause.substring(0, 80)}", ` +
        `plausibility=${verdict.plausibilityScore}% (${verdict.plausibilityBand}), ` +
        `direction=${verdict.inferredCollisionDirection}, ` +
        `physics=${verdict.physicsAlignment}, images=${verdict.imageAlignment}, ` +
        `fraudFlag=${verdict.flagForFraud}, llmUsed=${verdict.llmUsed}`
      );
      return verdict;
    } catch (err) {
      ctx.log("Stage 7b (CausalReasoning)", `Causal reasoning failed — using fallback: ${String(err)}`);
      return buildDefaultCausalVerdict(claimRecord);
    }
  };

  const narrativeTask = async (): Promise<NarrativeAnalysis> => {
    try {
      if (rawDescription && rawDescription.trim().length > 10) {
        const animalPhysics = physicsAnalysis.animalStrikePhysics ?? null;
        const result = await runIncidentNarrativeEngine({
          raw_description: rawDescription,
          incident_type: claimRecord.accidentDetails?.incidentType ?? "collision",
          claimed_speed_kmh: claimRecord.accidentDetails?.estimatedSpeedKmh ?? null,
          physics_plausibility_score: animalPhysics?.plausibility_score ?? physicsAnalysis.damageConsistencyScore ?? null,
          physics_delta_v_kmh: animalPhysics?.delta_v_kmh ?? physicsAnalysis.deltaVKmh ?? null,
          physics_impact_force_kn: animalPhysics?.impact_force_kn ?? physicsAnalysis.impactForceKn ?? null,
          structural_damage: claimRecord.accidentDetails?.structuralDamage ?? false,
          airbag_deployment: claimRecord.accidentDetails?.airbagDeployment ?? false,
          crush_depth_m: claimRecord.accidentDetails?.maxCrushDepthM ?? null,
          damage_components: (damageAnalysis.damagedParts ?? []).map((p) => ({
            name: p.name,
            severity: p.severity,
            location: p.location,
          })),
          vision_summary: enrichedPhotosJson
            ? (() => {
                try {
                  const parsed = JSON.parse(enrichedPhotosJson);
                  return parsed?.summary ?? parsed?.overall_assessment ?? null;
                } catch {
                  return null;
                }
              })()
            : null,
          vehicle_make_model:
            `${claimRecord.vehicle?.make ?? ""} ${claimRecord.vehicle?.model ?? ""}`.trim() || "Unknown vehicle",
          // Stakeholder context — wired from Stage 3 extraction and Stage 5 scenario detection
          police_charged_party: claimRecord.accidentDetails?.policeReport?.chargedParty ?? null,
          police_investigation_status: claimRecord.accidentDetails?.policeReport?.investigationStatus ?? null,
          police_officer_findings: claimRecord.accidentDetails?.policeReport?.officerFindings ?? null,
          third_party_account: claimRecord.accidentDetails?.policeReport?.thirdPartyAccountSummary ?? null,
          collision_scenario: claimRecord.accidentDetails?.collisionScenario ?? null,
          is_struck_party: claimRecord.accidentDetails?.isStruckParty ?? false,
        });
        ctx.log(
          "Stage 7e (NarrativeReasoning)",
          `Verdict: ${result.consistency_verdict}, ` +
          `contaminated: ${result.was_contaminated}, ` +
          `stripped: ${result.stripped_content.length} segment(s), ` +
          `fraud signals: ${result.fraud_signals.length}, ` +
          `confidence: ${result.confidence}%.`
        );
        return result;
      } else {
        ctx.log("Stage 7e (NarrativeReasoning)", "Skipped — no incident description available.");
        return buildDefaultNarrativeAnalysis(rawDescription);
      }
    } catch (err) {
      ctx.log("Stage 7e (NarrativeReasoning)", `Narrative reasoning failed — using fallback: ${String(err)}`);
      return buildDefaultNarrativeAnalysis(rawDescription);
    }
  };

  // Fire Stage 7b and Stage 7e concurrently
  ctx.log("Stage 7 (Unified)", "Firing causal reasoning (7b) and narrative analysis (7e) in parallel");
  const [causalVerdict, narrativeAnalysis] = await Promise.all([
    causalReasoningTask(),
    narrativeTask(),
  ]);

  return {
    status: physicsResult.status === "failed" ? "degraded" : physicsResult.status,
    data: {
      physicsAnalysis,
      causalVerdict,
      narrativeAnalysis,
    },
    durationMs: Date.now() - start,
    savedToDb: false,
    assumptions: physicsResult.assumptions ?? [],
    recoveryActions: physicsResult.recoveryActions ?? [],
    degraded: physicsResult.degraded ?? false,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Fallback builders — used when LLM calls fail
// ─────────────────────────────────────────────────────────────────────────────

function buildDefaultCausalVerdict(claimRecord: ClaimRecord): CausalVerdict {
  return {
    inferredCause: "Unable to determine — causal reasoning engine failed",
    plausibilityScore: 50,
    plausibilityBand: "moderate",
    inferredCollisionDirection: claimRecord.accidentDetails?.collisionDirection ?? "unknown",
    physicsAlignment: "not_applicable",
    imageAlignment: "no_photos",
    supportingEvidence: [],
    contradictions: [],
    alternativeCauses: [],
    narrativeVerdict: "Causal reasoning engine encountered an error. Manual review required.",
    flagForFraud: false,
    fraudFlagReason: null,
    reasoningTrace: "Engine failure — fallback verdict applied",
    llmUsed: false,
    constraintValidation: null,
    constraintNarrative: null,
    generatedAt: new Date().toISOString(),
  };
}

function buildDefaultNarrativeAnalysis(rawDescription: string): NarrativeAnalysis {
  return {
    raw_description: rawDescription,
    cleaned_incident_narrative: rawDescription,
    stripped_content: [],
    was_contaminated: false,
    segments: [],
    extracted_facts: {
      implied_speed_kmh: null,
      implied_direction: null,
      implied_severity: null,
      animal_mentioned: false,
      animal_type: null,
      third_party_involved: false,
      road_condition_mentioned: false,
      time_of_day_mentioned: false,
      police_mentioned: false,
      evasive_action_taken: false,
      sequence_of_events: "Insufficient data to reconstruct sequence of events.",
    },
    fraud_signals: [],
    cross_validation: {
      physics_verdict: "NOT_ASSESSED",
      physics_notes: "",
      damage_verdict: "NOT_ASSESSED",
      damage_notes: "",
      crush_depth_verdict: "NOT_ASSESSED",
      crush_depth_notes: "",
    },
    consistency_verdict: "INSUFFICIENT_DATA",
    reasoning_summary: "Narrative analysis skipped — no description available or engine failed.",
    confidence: 0,
  };
}
