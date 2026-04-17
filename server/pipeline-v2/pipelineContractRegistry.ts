/**
 * pipelineContractRegistry.ts
 *
 * Per-Stage Contract Registry — KINGA Pipeline Integrity Layer
 *
 * Each stage declares:
 *   - id:            Unique stage key (matches recordStage keys in orchestrator)
 *   - label:         Human-readable name
 *   - type:          "llm" | "deterministic" — determines timeout budget
 *   - required:      Upstream data keys that MUST be non-null before execution
 *   - optional:      Upstream data keys that improve output but are not blockers
 *   - outputGuarantees: What this stage promises to produce (for downstream stages)
 *   - degradedAllowed: Whether the stage may run in a degraded/fallback mode
 *   - fallbackBehaviour: What happens when required inputs are missing
 *
 * Usage:
 *   import { checkStageContract, STAGE_CONTRACTS } from "./pipelineContractRegistry";
 *   const result = checkStageContract("7_unified", { stage1Data, stage3Data, stage6Data });
 *   if (!result.canProceed) { ... handle contract violation ... }
 *
 * This registry is the single source of truth for pipeline stage dependencies.
 * Adding a new stage requires registering it here before wiring it into the orchestrator.
 */

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type StageType = "llm" | "deterministic";

export interface StageContract {
  /** Unique stage key — must match the key used in recordStage() */
  id: string;
  /** Human-readable label */
  label: string;
  /** Whether this stage calls an LLM (longer timeout) or is deterministic */
  type: StageType;
  /** Timeout in milliseconds */
  timeoutMs: number;
  /**
   * Keys of upstream data variables that MUST be non-null before this stage runs.
   * These are checked by checkStageContract().
   */
  required: string[];
  /**
   * Keys of upstream data variables that improve output quality but are not blockers.
   * Missing optional inputs are logged as assumptions.
   */
  optional: string[];
  /**
   * What this stage guarantees to produce on success.
   * Used by downstream stages to validate their own required inputs.
   */
  outputGuarantees: string[];
  /**
   * Whether this stage is allowed to run in degraded mode when required inputs
   * are missing (e.g., by using a fallback/minimal output).
   */
  degradedAllowed: boolean;
  /**
   * Description of what happens when required inputs are missing.
   * If degradedAllowed=false, the stage is skipped entirely.
   */
  fallbackBehaviour: string;
}

export interface ContractCheckResult {
  /** Whether the stage can proceed (all required inputs present, or degraded allowed) */
  canProceed: boolean;
  /** Whether the stage is running in degraded mode (some required inputs missing) */
  isDegraded: boolean;
  /** List of required inputs that are missing */
  missingRequired: string[];
  /** List of optional inputs that are missing (logged as assumptions) */
  missingOptional: string[];
  /** Human-readable explanation */
  message: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// TIMEOUT BUDGETS
// ─────────────────────────────────────────────────────────────────────────────

export const TIMEOUT_LLM_MS = 60_000;        // 60 s for LLM stages (default)
export const TIMEOUT_LLM_EXTRACTION_MS = 180_000; // 180 s for Stage 2 — large PDF extraction with up to 3 retries
export const TIMEOUT_VISION_MS = 200_000;     // 200 s for Stage 6 — vision processes up to PER_RUN_VISION_BUDGET photos sequentially (~8s each, budget=20)
export const TIMEOUT_DETERMINISTIC_MS = 10_000; // 10 s for deterministic stages

// ─────────────────────────────────────────────────────────────────────────────
// STAGE CONTRACT REGISTRY
// ─────────────────────────────────────────────────────────────────────────────

export const STAGE_CONTRACTS: Record<string, StageContract> = {

  "1_ingestion": {
    id: "1_ingestion",
    label: "Stage 1 — Document Ingestion",
    type: "llm",
    timeoutMs: TIMEOUT_LLM_MS,
    required: [],  // No upstream dependencies — first stage
    optional: [],
    outputGuarantees: ["stage1Data"],
    degradedAllowed: false,
    fallbackBehaviour: "Stage 1 has no upstream dependencies. If it fails, the pipeline halts entirely — no documents to process.",
  },

  "2_extraction": {
    id: "2_extraction",
    label: "Stage 2 — Raw OCR Text Extraction",
    type: "llm",
    timeoutMs: TIMEOUT_LLM_EXTRACTION_MS, // 180s — allows 3 retry attempts on large PDFs
    required: ["stage1Data"],
    optional: [],
    outputGuarantees: ["stage2Data"],
    degradedAllowed: false,
    fallbackBehaviour: "Skip stage. All downstream stages that depend on raw OCR text will be skipped or degraded.",
  },

  "0_evidence_registry": {
    id: "0_evidence_registry",
    label: "Stage 0 — Evidence Registry",
    type: "deterministic",
    timeoutMs: TIMEOUT_DETERMINISTIC_MS,
    required: ["stage1Data"],
    optional: ["stage2Data"],
    outputGuarantees: ["evidenceRegistryData"],
    degradedAllowed: true,
    fallbackBehaviour: "Build minimal evidence registry from stage1Data alone. All items marked UNKNOWN.",
  },

  "0a_document_verification": {
    id: "0a_document_verification",
    label: "Stage 0a — Document Read Verification",
    type: "llm",
    timeoutMs: TIMEOUT_LLM_MS,
    required: ["stage2Data"],
    optional: [],
    outputGuarantees: ["documentVerificationResult"],
    degradedAllowed: true,
    fallbackBehaviour: "Skip verification. Document is assumed readable. Log assumption.",
  },

  "3_structured_extraction": {
    id: "3_structured_extraction",
    label: "Stage 3 — Structured Field Extraction",
    type: "llm",
    timeoutMs: TIMEOUT_LLM_MS,
    required: ["stage1Data", "stage2Data"],
    optional: ["documentVerificationResult"],
    outputGuarantees: ["stage3Data"],
    degradedAllowed: false,
    fallbackBehaviour: "Skip stage. Stage 4 will attempt DB fallback using any previously stored claim data.",
  },

  "4_validation": {
    id: "4_validation",
    label: "Stage 4 — Field Validation & Recovery",
    type: "llm",
    timeoutMs: TIMEOUT_LLM_MS,
    required: ["stage3Data"],
    optional: ["evidenceRegistryData"],
    outputGuarantees: ["stage4Data"],
    degradedAllowed: true,
    fallbackBehaviour: "Build minimal validation output from DB-stored claim data. Mark all fields as low-confidence.",
  },

  "5_assembly": {
    id: "5_assembly",
    label: "Stage 5 — ClaimRecord Assembly",
    type: "deterministic",
    timeoutMs: TIMEOUT_DETERMINISTIC_MS,
    required: ["stage4Data"],
    optional: ["stage3Data", "evidenceRegistryData"],
    outputGuarantees: ["claimRecord"],
    degradedAllowed: true,
    fallbackBehaviour: "Build minimal ClaimRecord from DB claim data. Physics and fraud engines will use defaults.",
  },

  "6_damage_analysis": {
    id: "6_damage_analysis",
    label: "Stage 6 — Damage Analysis",
    type: "llm",
    timeoutMs: TIMEOUT_VISION_MS, // Extended budget: processes up to PER_RUN_VISION_BUDGET photos sequentially
    required: ["claimRecord"],
    optional: ["stage1Data"],  // Photos improve damage analysis
    outputGuarantees: ["stage6Data"],
    degradedAllowed: true,
    fallbackBehaviour: "Use engineFallback.buildDamageFallback(). Sentinel zone added. All damage marked estimated.",
  },

  "7_unified": {
    id: "7_unified",
    label: "Stage 7 — Physics & Unified Analysis",
    type: "llm",
    timeoutMs: TIMEOUT_LLM_MS,
    required: ["claimRecord", "stage6Data"],
    optional: ["evidenceRegistryData"],
    outputGuarantees: ["stage7Data"],
    degradedAllowed: true,
    fallbackBehaviour: "Use engineFallback.buildPhysicsFallback(). Estimate delta_v from damage severity and vehicle class. Never return all-N/A.",
  },

  "8_fraud": {
    id: "8_fraud",
    label: "Stage 8 — Fraud Analysis",
    type: "llm",
    timeoutMs: TIMEOUT_LLM_MS,
    required: ["claimRecord", "stage6Data"],
    optional: ["stage7Data", "evidenceRegistryData"],
    outputGuarantees: ["stage8Data"],
    degradedAllowed: true,
    fallbackBehaviour: "Use engineFallback.buildFraudFallback(). Score defaults to 30 (low risk). All indicators marked estimated.",
  },

  "9_cost": {
    id: "9_cost",
    label: "Stage 9 — Cost Optimisation",
    type: "llm",
    timeoutMs: TIMEOUT_LLM_MS,
    required: ["claimRecord", "stage6Data"],
    optional: ["stage7Data", "stage8Data", "benchmarkBundle"],
    outputGuarantees: ["stage9Data"],
    degradedAllowed: true,
    fallbackBehaviour: "Use engineFallback.buildCostFallback(). Cost marked as AI estimate. No optimisation applied.",
  },

  "9b_turnaround": {
    id: "9b_turnaround",
    label: "Stage 9b — Turnaround Time Analysis",
    type: "deterministic",
    timeoutMs: TIMEOUT_DETERMINISTIC_MS,
    required: ["claimRecord"],
    optional: ["stage9Data"],
    outputGuarantees: ["stage9bData"],
    degradedAllowed: true,
    fallbackBehaviour: "Return default turnaround estimate based on damage severity. Mark as estimated.",
  },

  "10_report": {
    id: "10_report",
    label: "Stage 10 — Report Generation",
    type: "llm",
    timeoutMs: TIMEOUT_LLM_MS,
    required: ["claimRecord", "stage6Data", "stage7Data", "stage8Data", "stage9Data"],
    optional: ["stage9bData", "causalChain", "evidenceBundle"],
    outputGuarantees: ["stage10Data"],
    degradedAllowed: true,
    fallbackBehaviour: "Generate report with available data. Mark missing sections as 'Insufficient data — manual review required'.",
  },

};

// ─────────────────────────────────────────────────────────────────────────────
// CONTRACT CHECKER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Checks whether a stage's input contract is satisfied.
 *
 * @param stageId  The stage key (e.g. "7_unified")
 * @param inputs   An object mapping data key names to their current values.
 *                 A key is considered "present" if its value is non-null and non-undefined.
 * @returns ContractCheckResult
 */
export function checkStageContract(
  stageId: string,
  inputs: Record<string, unknown>
): ContractCheckResult {
  const contract = STAGE_CONTRACTS[stageId];
  if (!contract) {
    // Unknown stage — allow it to proceed (backward compatibility)
    return {
      canProceed: true,
      isDegraded: false,
      missingRequired: [],
      missingOptional: [],
      message: `No contract registered for stage "${stageId}" — proceeding without validation.`,
    };
  }

  const missingRequired = contract.required.filter(
    (key) => inputs[key] == null
  );
  const missingOptional = contract.optional.filter(
    (key) => inputs[key] == null
  );

  const hasRequiredGap = missingRequired.length > 0;
  const canProceed = !hasRequiredGap || contract.degradedAllowed;
  const isDegraded = hasRequiredGap && contract.degradedAllowed;

  let message: string;
  if (!hasRequiredGap) {
    message = `Stage "${contract.label}" contract satisfied. All required inputs present.`;
    if (missingOptional.length > 0) {
      message += ` Optional inputs missing: [${missingOptional.join(", ")}] — will use defaults.`;
    }
  } else if (isDegraded) {
    message = `Stage "${contract.label}" running in DEGRADED mode. Missing required: [${missingRequired.join(", ")}]. ${contract.fallbackBehaviour}`;
  } else {
    message = `Stage "${contract.label}" BLOCKED. Missing required inputs: [${missingRequired.join(", ")}]. ${contract.fallbackBehaviour}`;
  }

  return { canProceed, isDegraded, missingRequired, missingOptional, message };
}

/**
 * Returns the timeout budget for a given stage in milliseconds.
 * Falls back to LLM timeout if the stage is not registered.
 */
export function getStageTimeout(stageId: string): number {
  const contract = STAGE_CONTRACTS[stageId];
  return contract?.timeoutMs ?? TIMEOUT_LLM_MS;
}

// ─────────────────────────────────────────────────────────────────────────────
// STAGE TIMEOUT ERROR
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Typed error thrown when a stage exceeds its registered timeout budget.
 * Distinct from a general stage failure — the stage did not error, it simply
 * did not complete within its allocated time.
 *
 * Downstream catch blocks should check `err instanceof StageTimeoutError`
 * to distinguish a timeout from an internal engine failure, then call the
 * appropriate engineFallback function rather than returning null or hardcoded values.
 */
export class StageTimeoutError extends Error {
  readonly stageId: string;
  readonly budgetMs: number;
  readonly elapsedMs: number;

  constructor(stageId: string, budgetMs: number, elapsedMs: number) {
    super(
      `STAGE_TIMEOUT: Stage "${stageId}" exceeded its ${budgetMs}ms budget ` +
      `(elapsed: ${elapsedMs}ms). The stage did not complete — its output is absent, ` +
      `not degraded. Downstream stages must treat this as missing input.`
    );
    this.name = "StageTimeoutError";
    this.stageId = stageId;
    this.budgetMs = budgetMs;
    this.elapsedMs = elapsedMs;
  }
}

/**
 * Wraps a stage execution function with a timeout.
 *
 * If the stage does not complete within its registered budget:
 *   - Throws a StageTimeoutError (not a generic Error)
 *   - The orchestrator catch block is responsible for calling the correct
 *     engineFallback function and marking the output with { _timedOut: true }
 *   - The state machine is responsible for deciding whether to flag an exception
 *
 * The wrapper does NOT produce fallback output — that is the stage's responsibility.
 *
 * @param stageId   The stage key (used to look up the timeout budget)
 * @param fn        The async stage function to execute
 * @returns         The result of fn, or throws StageTimeoutError if timeout exceeded
 */
export async function runWithTimeout<T>(
  stageId: string,
  fn: () => Promise<T>
): Promise<T> {
  const budgetMs = getStageTimeout(stageId);
  const startMs = Date.now();

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      const elapsedMs = Date.now() - startMs;
      reject(new StageTimeoutError(stageId, budgetMs, elapsedMs));
    }, budgetMs);

    fn()
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}
