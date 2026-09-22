import type { VGECalibrationResult } from "../pipeline-v2/stage-6-5a-vge";
import type { VGRConsensusResult } from "../pipeline-v2/stage-6-5b-vgr";

/**
 * Versioned P0 field-evidence contract. P0-A activates the crush-depth adapter
 * only; later field families require their own explicit producer and consumer
 * matrices before they may enter this union.
 */
export const P0_QUANTITATIVE_EVIDENCE_CONTRACT_VERSION = "P0-1.0" as const;

export type QuantitativeFieldKey =
  | "crush_depth_m"
  | "speed_kmh"
  | "impact_force_kn"
  | "kinetic_energy_j"
  | "repair_cost_cents"
  | "fraud_risk_score"
  | "confidence_score"
  | "learning_record_eligibility";

export type QuantitativeFieldDisposition =
  | "GOVERNING"
  | "ADVISORY"
  | "UNAVAILABLE";

/**
 * Vocabulary is deliberately wider than P0-A's active adapter. Listing a
 * source does not grant it governing authority.
 */
export type QuantitativeEvidenceSourceKind =
  | "VGR_LLM_MEDIATED_VISUAL_GEOMETRY"
  | "VGE_LLM_MEDIATED_VISUAL_GEOMETRY"
  | "STAGE6_LLM_VISUAL_NUMERIC"
  | "DOCUMENT_DIRECT_MEASUREMENT"
  | "HUMAN_VERIFIED_MEASUREMENT"
  | "DETERMINISTIC_CALCULATION"
  | "VERIFIED_QUOTE_LEDGER"
  | "GOVERNED_HISTORICAL_LEARNING";

export type QuantitativeAdvisoryReason =
  | "VISUAL_GEOMETRY_REQUIRES_P1_QUALIFICATION"
  | "RAW_STAGE6_NUMERIC_REMAINS_DESCRIPTIVE";

/**
 * Advisory evidence may retain source and reason, but intentionally carries no
 * number. The source output remains available to human review through existing
 * descriptive artifacts and cannot be re-used as a computational operand.
 */
export interface AdvisoryQuantitativeEvidence {
  sourceKind:
    | "VGR_LLM_MEDIATED_VISUAL_GEOMETRY"
    | "VGE_LLM_MEDIATED_VISUAL_GEOMETRY"
    | "STAGE6_LLM_VISUAL_NUMERIC";
  reason: QuantitativeAdvisoryReason;
  carriesNumericValue: false;
}

interface CrushDepthDecisionBase {
  contractVersion: typeof P0_QUANTITATIVE_EVIDENCE_CONTRACT_VERSION;
  field: "crush_depth_m";
  governing: null;
  advisoryEvidence: AdvisoryQuantitativeEvidence[];
  explanation: string;
}

export interface AdvisoryCrushDepthDecision extends CrushDepthDecisionBase {
  disposition: "ADVISORY";
  reasonCode:
    | "P0_ADVISORY_LLM_MEDIATED_VISUAL_GEOMETRY"
    | "P0_ADVISORY_RAW_STAGE6_ONLY";
}

export interface UnavailableCrushDepthDecision extends CrushDepthDecisionBase {
  disposition: "UNAVAILABLE";
  reasonCode:
    | "P0_UNAVAILABLE_NO_CANDIDATE"
    | "P0_UNAVAILABLE_MISSING_PRESERVED_DECISION"
    | "P0_UNAVAILABLE_INCONSISTENT_PRESERVED_DECISION";
}

type CrushDepthReasonCode =
  | AdvisoryCrushDepthDecision["reasonCode"]
  | UnavailableCrushDepthDecision["reasonCode"];

/**
 * Persisted explanations are canonical, not caller-provided prose. This closes
 * the JSON boundary against smuggling an advisory numerical value into a field
 * that exists solely to explain why a value is non-governing.
 */
const CRUSH_DEPTH_EXPLANATIONS: Record<CrushDepthReasonCode, string> = {
  P0_ADVISORY_LLM_MEDIATED_VISUAL_GEOMETRY:
    "Stored vehicle dimensions constrain scale, but the current reference identity, pixel span, perspective and condition observations remain LLM-mediated. P1 visual-measurement qualification is required before collision physics may use this value.",
  P0_ADVISORY_RAW_STAGE6_ONLY:
    "A raw Stage 6 visual crush-depth number is descriptive evidence only. It cannot supply governing crush, force, energy, speed, delta-V, fraud, cost, confidence, or learning input.",
  P0_UNAVAILABLE_NO_CANDIDATE:
    "No crush-depth observation is available. Request suitable damage imagery or a separately eligible measurement source.",
  P0_UNAVAILABLE_MISSING_PRESERVED_DECISION:
    "The Stage 7 crush-depth eligibility decision was absent. P0 prevents missing provenance from being promoted to collision physics.",
  P0_UNAVAILABLE_INCONSISTENT_PRESERVED_DECISION:
    "The persisted Stage 7 crush-depth eligibility decision failed P0 validation. It is unavailable until the claim is reprocessed under a valid policy decision.",
};

/**
 * Current P0 policy intentionally contains no governing crush-depth variant.
 * Stored vehicle dimensions resolve the physical scale input but the reference
 * identity, pixel span, perspective and undamaged state remain LLM-mediated.
 * P1 must provide an approved visual-measurement qualification before a later
 * contract version can introduce a governing visual-geometry source.
 */
export type CrushDepthFieldDecision =
  | AdvisoryCrushDepthDecision
  | UnavailableCrushDepthDecision;

export type QuantitativeFieldDecision = CrushDepthFieldDecision;

export interface CrushDepthEligibilityInput {
  vgeResult?: VGECalibrationResult | null;
  vgrResult?: VGRConsensusResult | null;
  /**
   * True only for a Stage 6 raw crush-depth numeric. Structural displacement,
   * deformation energy and severity are separate fields and cannot be
   * re-labelled as a crush candidate.
   */
  rawStage6CrushDepthCandidatePresent?: boolean;
}

export type CrushDepthEvidenceSnapshot = Pick<
  CrushDepthEligibilityInput,
  "vgeResult" | "vgrResult" | "rawStage6CrushDepthCandidatePresent"
>;

function hasFinitePositive(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function vgeVisualGeometryPresent(
  result: VGECalibrationResult | null | undefined
): boolean {
  return Boolean(
    result?.calibrationAvailable &&
      hasFinitePositive(result.calibratedCrushDepthM)
  );
}

function vgrVisualGeometryPresent(
  result: VGRConsensusResult | null | undefined
): boolean {
  return Boolean(
    result?.reconciliationAvailable &&
      hasFinitePositive(result.consensusCrushDepthM)
  );
}

function advisoryVisualGeometry(
  input: CrushDepthEligibilityInput
): AdvisoryQuantitativeEvidence[] {
  const evidence: AdvisoryQuantitativeEvidence[] = [];
  if (vgrVisualGeometryPresent(input.vgrResult)) {
    evidence.push({
      sourceKind: "VGR_LLM_MEDIATED_VISUAL_GEOMETRY",
      reason: "VISUAL_GEOMETRY_REQUIRES_P1_QUALIFICATION",
      carriesNumericValue: false,
    });
  }
  if (vgeVisualGeometryPresent(input.vgeResult)) {
    evidence.push({
      sourceKind: "VGE_LLM_MEDIATED_VISUAL_GEOMETRY",
      reason: "VISUAL_GEOMETRY_REQUIRES_P1_QUALIFICATION",
      carriesNumericValue: false,
    });
  }
  if (input.rawStage6CrushDepthCandidatePresent) {
    evidence.push({
      sourceKind: "STAGE6_LLM_VISUAL_NUMERIC",
      reason: "RAW_STAGE6_NUMERIC_REMAINS_DESCRIPTIVE",
      carriesNumericValue: false,
    });
  }
  return evidence;
}

/**
 * Produces the only active P0-A crush-depth admission decision. The result is
 * intentionally advisory for all currently available visual geometry, including
 * VGE/VGR calibrations that use stored vehicle specifications: their visual
 * observations still require P1 qualification before they can govern physics.
 */
export function assessCrushDepthEligibility(
  input: CrushDepthEligibilityInput
): CrushDepthFieldDecision {
  const advisoryEvidence = advisoryVisualGeometry(input);
  if (advisoryEvidence.length === 0) {
    return unavailableCrushDepthDecision("P0_UNAVAILABLE_NO_CANDIDATE");
  }

  const visualGeometryPresent = advisoryEvidence.some(
    evidence =>
      evidence.sourceKind === "VGE_LLM_MEDIATED_VISUAL_GEOMETRY" ||
      evidence.sourceKind === "VGR_LLM_MEDIATED_VISUAL_GEOMETRY"
  );
  return {
    contractVersion: P0_QUANTITATIVE_EVIDENCE_CONTRACT_VERSION,
    field: "crush_depth_m",
    disposition: "ADVISORY",
    governing: null,
    advisoryEvidence,
    reasonCode: visualGeometryPresent
      ? "P0_ADVISORY_LLM_MEDIATED_VISUAL_GEOMETRY"
      : "P0_ADVISORY_RAW_STAGE6_ONLY",
    explanation:
      CRUSH_DEPTH_EXPLANATIONS[
        visualGeometryPresent
          ? "P0_ADVISORY_LLM_MEDIATED_VISUAL_GEOMETRY"
          : "P0_ADVISORY_RAW_STAGE6_ONLY"
      ],
  };
}

export function unavailableCrushDepthDecision(
  reasonCode: UnavailableCrushDepthDecision["reasonCode"]
): UnavailableCrushDepthDecision {
  return {
    contractVersion: P0_QUANTITATIVE_EVIDENCE_CONTRACT_VERSION,
    field: "crush_depth_m",
    disposition: "UNAVAILABLE",
    governing: null,
    advisoryEvidence: [],
    reasonCode,
    explanation: CRUSH_DEPTH_EXPLANATIONS[reasonCode],
  };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[]
): boolean {
  return Object.keys(value).every(key => allowedKeys.includes(key));
}

function isAdvisoryEvidence(
  value: unknown
): value is AdvisoryQuantitativeEvidence {
  if (
    !isPlainRecord(value) ||
    !hasOnlyKeys(value, ["sourceKind", "reason", "carriesNumericValue"])
  ) {
    return false;
  }
  const evidence = value as Partial<AdvisoryQuantitativeEvidence>;
  if (evidence.carriesNumericValue !== false) return false;
  return (
    (evidence.sourceKind === "STAGE6_LLM_VISUAL_NUMERIC" &&
      evidence.reason === "RAW_STAGE6_NUMERIC_REMAINS_DESCRIPTIVE") ||
    ((evidence.sourceKind === "VGE_LLM_MEDIATED_VISUAL_GEOMETRY" ||
      evidence.sourceKind === "VGR_LLM_MEDIATED_VISUAL_GEOMETRY") &&
      evidence.reason === "VISUAL_GEOMETRY_REQUIRES_P1_QUALIFICATION")
  );
}

/**
 * Runtime validation closes the JSON/persistence boundary. A caller cannot
 * promote numerical data by forging `GOVERNING`: P0-A has no governing visual
 * geometry source at all.
 */
export function isValidCrushDepthDecision(
  decision: unknown
): decision is CrushDepthFieldDecision {
  if (
    !isPlainRecord(decision) ||
    !hasOnlyKeys(decision, [
      "contractVersion",
      "field",
      "disposition",
      "governing",
      "advisoryEvidence",
      "reasonCode",
      "explanation",
    ])
  ) {
    return false;
  }
  const candidate = decision as Partial<CrushDepthFieldDecision>;
  if (
    candidate.contractVersion !== P0_QUANTITATIVE_EVIDENCE_CONTRACT_VERSION ||
    candidate.field !== "crush_depth_m" ||
    candidate.governing !== null ||
    !Array.isArray(candidate.advisoryEvidence) ||
    !candidate.advisoryEvidence.every(isAdvisoryEvidence) ||
    candidate.explanation !==
      CRUSH_DEPTH_EXPLANATIONS[candidate.reasonCode as CrushDepthReasonCode]
  ) {
    return false;
  }
  if (candidate.disposition === "ADVISORY") {
    const hasVisualGeometry = candidate.advisoryEvidence.some(
      evidence =>
        evidence.sourceKind === "VGE_LLM_MEDIATED_VISUAL_GEOMETRY" ||
        evidence.sourceKind === "VGR_LLM_MEDIATED_VISUAL_GEOMETRY"
    );
    return (
      (candidate.reasonCode === "P0_ADVISORY_LLM_MEDIATED_VISUAL_GEOMETRY" &&
        hasVisualGeometry) ||
      (candidate.reasonCode === "P0_ADVISORY_RAW_STAGE6_ONLY" &&
        !hasVisualGeometry &&
        candidate.advisoryEvidence.some(
          evidence => evidence.sourceKind === "STAGE6_LLM_VISUAL_NUMERIC"
        ))
    );
  }
  return (
    candidate.disposition === "UNAVAILABLE" &&
    candidate.advisoryEvidence.length === 0 &&
    (candidate.reasonCode === "P0_UNAVAILABLE_NO_CANDIDATE" ||
      candidate.reasonCode === "P0_UNAVAILABLE_MISSING_PRESERVED_DECISION" ||
      candidate.reasonCode === "P0_UNAVAILABLE_INCONSISTENT_PRESERVED_DECISION")
  );
}

function isDecisionBoundToSnapshot(
  decision: CrushDepthFieldDecision,
  sources: CrushDepthEvidenceSnapshot
): boolean {
  const expected = assessCrushDepthEligibility(sources);
  return (
    decision.contractVersion === expected.contractVersion &&
    decision.field === expected.field &&
    decision.disposition === expected.disposition &&
    decision.governing === expected.governing &&
    decision.reasonCode === expected.reasonCode &&
    decision.explanation === expected.explanation &&
    decision.advisoryEvidence.length === expected.advisoryEvidence.length &&
    decision.advisoryEvidence.every((evidence, index) => {
      const expectedEvidence = expected.advisoryEvidence[index];
      return (
        expectedEvidence != null &&
        evidence.sourceKind === expectedEvidence.sourceKind &&
        evidence.reason === expectedEvidence.reason &&
        evidence.carriesNumericValue === expectedEvidence.carriesNumericValue
      );
    })
  );
}

/** Converts a malformed, missing, or source-mismatched persisted decision into an explicit no-go state. */
export function preserveOrFailClosedCrushDepthDecision(
  decision: unknown,
  sources?: CrushDepthEvidenceSnapshot
): CrushDepthFieldDecision {
  if (
    isValidCrushDepthDecision(decision) &&
    (sources == null || isDecisionBoundToSnapshot(decision, sources))
  ) {
    return decision;
  }
  return unavailableCrushDepthDecision(
    decision == null
      ? "P0_UNAVAILABLE_MISSING_PRESERVED_DECISION"
      : "P0_UNAVAILABLE_INCONSISTENT_PRESERVED_DECISION"
  );
}

/**
 * Answers whether a persisted crush-depth decision may authorize collision
 * physics. Consumers should supply their live source snapshot whenever it is
 * available so an omitted, stale, or forged persisted decision fails closed.
 *
 * P0-A intentionally always returns false because it defines no governing
 * visual-geometry source. Keeping the check centralized prevents a future
 * policy version from being bypassed by consumers that only inspect a status
 * flag or a numerical-looking payload.
 */
export function hasGoverningCrushDepthEligibility(
  decision: unknown,
  sources?: CrushDepthEvidenceSnapshot
): boolean {
  return isGoverningQuantitativeField(
    preserveOrFailClosedCrushDepthDecision(decision, sources)
  );
}

/** P0-A exposes no governing crush-depth source; P1 may extend this in a new contract version. */
export function isGoverningQuantitativeField(
  _decision: unknown
): _decision is never {
  return false;
}
