/**
 * Canonical Claim Report Presentation
 *
 * Purpose: convert one report query row into the two canonical report contracts.
 * Called by individual-claim renderers before displaying shared fraud, cost, or
 * decision values. Never add renderer-specific fallback priorities here; extend
 * `resolveClaimRecord()` or `normaliseReportData()` instead.
 */
import { resolveClaimRecord } from "../claim-record-bridge";
import { normaliseReportData, type NormalisedReportData, type RawAssessmentData } from "../report-normalisation";
import type { ResolvedClaimRecord } from "../claim-record-bridge";

export interface CanonicalClaimReportPresentation {
  claim: ResolvedClaimRecord;
  report: NormalisedReportData;
}

function asNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

/**
 * `reportDefinitions` historically reads `estimated_cost`, `parts_cost`, and
 * `labor_cost` in cents. The normalisation contract accepts whole-currency
 * first-class fields, so this is the sole adapter boundary for those raw rows.
 */
function centsToUsd(value: unknown): number | null {
  const cents = asNumber(value);
  return cents == null ? null : cents / 100;
}

function jsonValue<T>(value: unknown): T | null {
  if (value == null) return null;
  if (typeof value === "object") return value as T;
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export function resolveCanonicalClaimReportPresentation(row: Record<string, unknown>): CanonicalClaimReportPresentation {
  const raw: RawAssessmentData = {
    estimatedCost: centsToUsd(row.estimated_cost ?? row.estimatedCost),
    estimatedPartsCost: centsToUsd(row.estimated_parts_cost ?? row.parts_cost ?? row.estimatedPartsCost),
    estimatedLaborCost: centsToUsd(row.estimated_labor_cost ?? row.labor_cost ?? row.estimatedLaborCost),
    fraudScore: asNumber(row.fraud_score ?? row.fraudScore),
    fraudRiskLevel: typeof (row.fraud_risk_level ?? row.fraudRiskLevel) === "string"
      ? String(row.fraud_risk_level ?? row.fraudRiskLevel)
      : null,
    recommendation: typeof row.recommendation === "string" ? row.recommendation : null,
    currencyCode: typeof (row.currency_code ?? row.currencyCode) === "string"
      ? String(row.currency_code ?? row.currencyCode)
      : null,
    costIntelligenceJson: jsonValue(row.cost_intelligence_json ?? row.costIntelligenceJson),
    fraudScoreBreakdownJson: jsonValue(row.fraud_score_breakdown_json ?? row.fraudScoreBreakdownJson),
    causalVerdictJson: jsonValue(row.causal_verdict_json ?? row.causalVerdictJson),
    validatedOutcomeJson: jsonValue(row.validated_outcome_json ?? row.validatedOutcomeJson),
    phase2Decision: typeof (row.phase2_decision ?? row.phase2Decision) === "string"
      ? String(row.phase2_decision ?? row.phase2Decision) as RawAssessmentData["phase2Decision"]
      : null,
  };

  const canonicalAssessment = {
    ...row,
    estimatedCost: raw.estimatedCost,
    fraudScore: raw.fraudScore,
    fraudRiskLevel: raw.fraudRiskLevel,
    currencyCode: raw.currencyCode,
    claimRecordJson: row.claim_record_json ?? row.claimRecordJson,
    physicsAnalysis: row.physics_analysis ?? row.physicsAnalysis,
    fraudScoreBreakdownJson: row.fraud_score_breakdown_json ?? row.fraudScoreBreakdownJson,
    damagedComponentsJson: row.damaged_components_json ?? row.damagedComponentsJson,
    damagePhotosJson: row.damage_photos_json ?? row.damagePhotosJson,
    enrichedPhotosJson: row.enriched_photos_json ?? row.enrichedPhotosJson,
  };

  return {
    claim: resolveClaimRecord(canonicalAssessment),
    report: normaliseReportData(raw),
  };
}
