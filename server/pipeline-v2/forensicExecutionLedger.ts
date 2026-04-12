/**
 * Forensic Execution Ledger (FEL)
 * ─────────────────────────────────
 * A court-grade per-stage audit record for every pipeline run.
 *
 * The FEL answers the question: "Given the same inputs, can we reproduce
 * exactly the same result?" If the answer is no, the system is probabilistic,
 * not forensic.
 *
 * Each stage record captures:
 *   - A hash of the stage's input (for deterministic replay verification)
 *   - The full output snapshot (for audit reconstruction)
 *   - Execution time, timeout flag, fallback used
 *   - Assumptions introduced at this stage
 *   - Confidence score produced by this stage
 *   - The model, prompt, and contract versions in use at execution time
 *
 * The FEL is stored as a JSON column in ai_assessments.forensicExecutionLedgerJson.
 */

import crypto from "crypto";

// ─── Version constants ────────────────────────────────────────────────────────
// These must be updated whenever the corresponding artefact changes.
// They are embedded in every FEL record so future audits can reconstruct
// the exact execution environment.

export const PIPELINE_CONTRACT_VERSION = "1.0.0";  // pipelineContractRegistry.ts version
export const PIPELINE_MODEL_VERSION    = "KINGA-v2.0";  // LLM model identifier
export const PIPELINE_PROMPT_VERSION   = "2.0.0";  // Prompt template version

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StageExecutionRecord {
  stageId: string;
  /** SHA-256 of the JSON-serialised stage input object */
  inputHash: string;
  /** Full stage output JSON (capped at 50KB to prevent excessive storage) */
  outputSnapshot: Record<string, unknown> | null;
  executionTimeMs: number;
  timedOut: boolean;
  /** Name of the engineFallback function called, or null if stage ran normally */
  fallbackUsed: string | null;
  /** Assumptions introduced specifically at this stage */
  assumptionsIntroduced: Array<{
    field: string;
    assumedValue: unknown;
    reason: string;
    strategy: string;
    confidence: number;
  }>;
  /** Confidence score produced by this stage (0–100), or null if not applicable */
  confidenceScore: number | null;
  modelVersion: string;
  promptVersion: string;
  contractVersion: string;
  status: "success" | "degraded" | "skipped" | "failed";
}

export interface ForensicExecutionLedger {
  version: string;
  claimId: number;
  pipelineRunAt: string;
  totalDurationMs: number;
  /** Ordered list of stage execution records */
  stages: StageExecutionRecord[];
  /** FCDI score for this run (0–100) */
  fcdiScorePercent: number;
  fcdiLabel: string;
  /** State machine final state */
  finalPipelineState: string;
  /** Whether this run can be deterministically replayed */
  replayable: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Compute a SHA-256 hash of any JSON-serialisable object.
 * Used to fingerprint stage inputs for deterministic replay verification.
 */
export function hashStageInput(input: unknown): string {
  try {
    const serialised = JSON.stringify(input, null, 0);
    return crypto.createHash("sha256").update(serialised).digest("hex").slice(0, 16);
  } catch {
    return "hash_error";
  }
}

/**
 * Cap an output snapshot at 50KB to prevent excessive storage.
 * If the snapshot exceeds the limit, it is replaced with a truncation notice.
 */
export function capOutputSnapshot(output: unknown): Record<string, unknown> | null {
  if (output == null) return null;
  try {
    const serialised = JSON.stringify(output);
    if (serialised.length > 50_000) {
      return {
        _truncated: true,
        _originalSizeBytes: serialised.length,
        _note: "Output snapshot truncated to prevent excessive storage. Full output is in the pipeline stage columns.",
      };
    }
    return output as Record<string, unknown>;
  } catch {
    return { _error: "Could not serialise output snapshot" };
  }
}

/**
 * Build a StageExecutionRecord from the orchestrator's stage result.
 */
export function buildStageRecord(params: {
  stageId: string;
  input: unknown;
  output: unknown;
  executionTimeMs: number;
  timedOut: boolean;
  fallbackUsed: string | null;
  assumptions: Array<{ field: string; assumedValue: unknown; reason: string; strategy: string; confidence: number }>;
  confidenceScore: number | null;
  status: "success" | "degraded" | "skipped" | "failed";
}): StageExecutionRecord {
  return {
    stageId: params.stageId,
    inputHash: hashStageInput(params.input),
    outputSnapshot: capOutputSnapshot(params.output),
    executionTimeMs: params.executionTimeMs,
    timedOut: params.timedOut,
    fallbackUsed: params.fallbackUsed,
    assumptionsIntroduced: params.assumptions,
    confidenceScore: params.confidenceScore,
    modelVersion: PIPELINE_MODEL_VERSION,
    promptVersion: PIPELINE_PROMPT_VERSION,
    contractVersion: PIPELINE_CONTRACT_VERSION,
    status: params.status,
  };
}

/**
 * Build the complete Forensic Execution Ledger from all stage records.
 */
export function buildForensicExecutionLedger(params: {
  claimId: number;
  pipelineRunAt: string;
  totalDurationMs: number;
  stageRecords: StageExecutionRecord[];
  fcdiScorePercent: number;
  fcdiLabel: string;
  finalPipelineState: string;
}): ForensicExecutionLedger {
  // A run is replayable if no stages timed out and all critical stages succeeded
  const replayable = params.stageRecords.every(
    r => !r.timedOut && r.status !== "failed"
  );

  return {
    version: "1.0.0",
    claimId: params.claimId,
    pipelineRunAt: params.pipelineRunAt,
    totalDurationMs: params.totalDurationMs,
    stages: params.stageRecords,
    fcdiScorePercent: params.fcdiScorePercent,
    fcdiLabel: params.fcdiLabel,
    finalPipelineState: params.finalPipelineState,
    replayable,
  };
}
