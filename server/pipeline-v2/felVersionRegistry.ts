/**
 * pipeline-v2/felVersionRegistry.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * FORENSIC EXECUTION LEDGER — VERSION REGISTRY (Phase 3B)
 *
 * Tracks the exact model version, prompt version, and contract version used
 * at each pipeline stage. This is the foundation for court-grade audit trails:
 * every output can be traced back to the exact code + model that produced it.
 *
 * DESIGN RULES:
 *   - Version IDs are deterministic: derived from content hashes, not timestamps
 *   - Prompt versions are hashed from the prompt template string
 *   - Model versions are read from the LLM response metadata (or defaulted)
 *   - Contract versions are read from pipelineContractRegistry
 *   - The full version snapshot is persisted with every FEL record
 *
 * NOTE ON REPLAY:
 *   Full deterministic replay (using the exact model version that produced the
 *   original result) is a Phase 4 item. Phase 3B provides the version tracking
 *   infrastructure that makes replay possible. Current re-runs use the current
 *   model, which is explicitly flagged in the FEL record.
 */

import { createHash } from "crypto";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface StageVersionSnapshot {
  /** Stage identifier e.g. "stage-2", "stage-7" */
  stageId: string;
  /** Semantic version of the stage implementation */
  stageCodeVersion: string;
  /** Hash of the prompt template used (null for deterministic stages) */
  promptHash: string | null;
  /** Human-readable prompt version label */
  promptVersion: string | null;
  /** Model identifier used for LLM calls (null for deterministic stages) */
  modelId: string | null;
  /** Contract version from pipelineContractRegistry */
  contractVersion: string;
  /** ISO timestamp when this stage ran */
  executedAt: string;
  /** Input hash — SHA-256 of the serialised stage input (for replay verification) */
  inputHash: string;
  /** Output hash — SHA-256 of the serialised stage output */
  outputHash: string | null;
}

export interface FELVersionSnapshot {
  /** Pipeline run identifier */
  pipelineRunId: string;
  /** KINGA platform version */
  platformVersion: string;
  /** Per-stage version snapshots */
  stages: StageVersionSnapshot[];
  /** Whether this record supports deterministic replay */
  replaySupported: boolean;
  /** Reason replay is not fully supported (if applicable) */
  replayLimitation: string | null;
  /** ISO timestamp */
  snapshotAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

/** Current KINGA platform version — increment on each release */
export const KINGA_PLATFORM_VERSION = "3.0.0";

/** Stage code versions — increment when stage logic changes */
export const STAGE_CODE_VERSIONS: Record<string, string> = {
  "stage-1":  "2.1.0",
  "stage-2":  "3.2.0", // OCR with field-level confidence + deterministic triggers
  "stage-3":  "2.0.0",
  "stage-4":  "1.5.0",
  "stage-5":  "1.5.0",
  "stage-6":  "3.1.0", // Vision with retry + URL pre-validation
  "stage-7":  "2.3.0", // Unified stage-7 (physics + severity + causal + narrative)
  "stage-7b": "2.0.0",
  "stage-7e": "2.0.0",
  "stage-8":  "2.1.0",
  "stage-9":  "3.0.0", // ECE wired + DOE gated
  "stage-9b": "1.2.0",
  "stage-10": "2.0.0",
  "stage-11": "1.3.0",
  "stage-12": "1.2.0",
  "stage-13": "1.0.0",
};

/** Contract versions from pipelineContractRegistry (Phase 1) */
export const CONTRACT_VERSIONS: Record<string, string> = {
  "stage-1":  "1.0",
  "stage-2":  "1.0",
  "stage-3":  "1.0",
  "stage-4":  "1.0",
  "stage-5":  "1.0",
  "stage-6":  "1.0",
  "stage-7":  "1.0",
  "stage-7b": "1.0",
  "stage-7e": "1.0",
  "stage-8":  "1.0",
  "stage-9":  "1.0",
  "stage-9b": "1.0",
  "stage-10": "1.0",
  "stage-11": "1.0",
  "stage-12": "1.0",
  "stage-13": "1.0",
};

/** Default model identifier used by invokeLLM */
export const DEFAULT_MODEL_ID = "gpt-4o";

/** LLM-calling stages */
export const LLM_STAGES = new Set([
  "stage-1", "stage-2", "stage-3", "stage-6", "stage-7", "stage-7b", "stage-7e",
  "stage-8", "stage-9", "stage-10",
]);

// ─────────────────────────────────────────────────────────────────────────────
// HASH UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute a deterministic SHA-256 hash of any serialisable value.
 * Returns the first 16 hex chars for readability.
 */
export function hashContent(content: unknown): string {
  try {
    const serialised = JSON.stringify(content, Object.keys(content as object ?? {}).sort());
    return createHash("sha256").update(serialised).digest("hex").slice(0, 16);
  } catch {
    return createHash("sha256").update(String(content)).digest("hex").slice(0, 16);
  }
}

/**
 * Compute a prompt hash from a prompt template string.
 * Used to detect when prompts change between pipeline runs.
 */
export function hashPrompt(promptTemplate: string): string {
  return createHash("sha256").update(promptTemplate.trim()).digest("hex").slice(0, 16);
}

/**
 * Generate a unique pipeline run ID.
 */
export function generatePipelineRunId(claimId: number, runAt: string): string {
  return createHash("sha256")
    .update(`${claimId}:${runAt}`)
    .digest("hex")
    .slice(0, 24);
}

// ─────────────────────────────────────────────────────────────────────────────
// VERSION SNAPSHOT BUILDER
// ─────────────────────────────────────────────────────────────────────────────

export interface StageVersionInput {
  stageId: string;
  executedAt: string;
  /** Serialised stage input (for hashing) */
  inputSnapshot: unknown;
  /** Serialised stage output (for hashing) — null if stage failed */
  outputSnapshot: unknown | null;
  /** Prompt template used (for LLM stages) */
  promptTemplate?: string;
  /** Model ID from LLM response (if available) */
  modelId?: string;
}

export function buildStageVersionSnapshot(input: StageVersionInput): StageVersionSnapshot {
  const { stageId, executedAt, inputSnapshot, outputSnapshot, promptTemplate, modelId } = input;
  const isLLMStage = LLM_STAGES.has(stageId);

  return {
    stageId,
    stageCodeVersion: STAGE_CODE_VERSIONS[stageId] ?? "1.0.0",
    promptHash: isLLMStage && promptTemplate ? hashPrompt(promptTemplate) : null,
    promptVersion: isLLMStage && promptTemplate
      ? `${stageId}-v${STAGE_CODE_VERSIONS[stageId] ?? "1.0"}`
      : null,
    modelId: isLLMStage ? (modelId ?? DEFAULT_MODEL_ID) : null,
    contractVersion: CONTRACT_VERSIONS[stageId] ?? "1.0",
    executedAt,
    inputHash: hashContent(inputSnapshot),
    outputHash: outputSnapshot != null ? hashContent(outputSnapshot) : null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// FEL VERSION SNAPSHOT BUILDER
// ─────────────────────────────────────────────────────────────────────────────

export function buildFELVersionSnapshot(
  claimId: number,
  pipelineRunAt: string,
  stageVersions: StageVersionSnapshot[],
): FELVersionSnapshot {
  const pipelineRunId = generatePipelineRunId(claimId, pipelineRunAt);

  // Replay is supported when all LLM stages have prompt hashes recorded.
  // Full deterministic replay (pinned model version) is a Phase 4 capability.
  const llmStagesWithHashes = stageVersions.filter(
    s => LLM_STAGES.has(s.stageId) && s.promptHash != null
  );
  const llmStagesTotal = stageVersions.filter(s => LLM_STAGES.has(s.stageId)).length;
  // replaySupported: true when all LLM stages have hashes, OR when no LLM stages were tracked
  // (llmStagesTotal === 0 means no stages to check — nothing is missing).
  const missingCount = llmStagesTotal - llmStagesWithHashes.length;
  const replaySupported = missingCount === 0;

  return {
    pipelineRunId,
    platformVersion: KINGA_PLATFORM_VERSION,
    stages: stageVersions,
    replaySupported,
    replayLimitation: replaySupported
      ? null
      : `${missingCount} LLM stage(s) are missing prompt hash records — full audit replay is not available for this assessment.`,
    snapshotAt: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ENHANCED FEL RECORD (extends existing FEL with version data)
// ─────────────────────────────────────────────────────────────────────────────

export interface EnhancedFELRecord {
  /** Claim ID */
  claimId: number;
  /** Pipeline run timestamp */
  pipelineRunAt: string;
  /** Total pipeline duration in ms */
  totalDurationMs: number;
  /** FCDI score percent */
  fcdiScorePercent: number;
  /** FCDI label */
  fcdiLabel: string;
  /** Final pipeline state */
  finalPipelineState: string;
  /** Per-stage execution records (from existing FEL) */
  stageRecords: Array<{
    stageId: string;
    status: string;
    durationMs: number;
    confidenceScore: number | null;
    fallbackInvoked: boolean;
    timedOut: boolean;
    assumptionCount: number;
    fcdiContribution: number;
    inputCompletenessScore: number | null;
    economicContextSnapshot: string | null;
  }>;
  /** Version snapshot for audit/replay */
  versionSnapshot: FELVersionSnapshot;
  /** Whether this record is replayable */
  replayable: boolean;
}

export function buildEnhancedFELRecord(
  base: Omit<EnhancedFELRecord, "versionSnapshot" | "replayable">,
  stageVersions: StageVersionSnapshot[],
): EnhancedFELRecord {
  const versionSnapshot = buildFELVersionSnapshot(
    base.claimId,
    base.pipelineRunAt,
    stageVersions,
  );

  return {
    ...base,
    versionSnapshot,
    replayable: versionSnapshot.replaySupported,
  };
}
