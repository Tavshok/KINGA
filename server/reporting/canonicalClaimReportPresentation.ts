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
    // P0-B1: historic/model fraud values are advisory-only and cannot enter a
    // normalisation path that can produce a threshold or recommendation.
    fraudScore: null,
    fraudRiskLevel: null,
    recommendation: null,
    currencyCode: typeof (row.currency_code ?? row.currencyCode) === "string"
      ? String(row.currency_code ?? row.currencyCode)
      : null,
    costIntelligenceJson: jsonValue(row.cost_intelligence_json ?? row.costIntelligenceJson),
    fraudScoreBreakdownJson: null,
    causalVerdictJson: null,
    validatedOutcomeJson: null,
    phase2Decision: null,
  };

  const canonicalAssessment = {
    ...row,
    estimatedCost: raw.estimatedCost,
    fraudScore: null,
    fraudRiskLevel: null,
    currencyCode: raw.currencyCode,
    claimRecordJson: row.claim_record_json ?? row.claimRecordJson,
    physicsAnalysis: row.physics_analysis ?? row.physicsAnalysis,
    fraudScoreBreakdownJson: null,
    damagedComponentsJson: row.damaged_components_json ?? row.damagedComponentsJson,
    damagePhotosJson: row.damage_photos_json ?? row.damagePhotosJson,
    enrichedPhotosJson: row.enriched_photos_json ?? row.enrichedPhotosJson,
  };

  return {
    claim: resolveClaimRecord(canonicalAssessment),
    report: normaliseReportData(raw),
  };
}
