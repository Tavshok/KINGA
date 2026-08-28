/**
 * KINGA — ResolvedReportRecord
 *
 * PURPOSE
 * ───────
 * Provides the sole tenant-scoped read model for claim report renderers. It
 * composes the decision-focused `resolveClaimRecord()` / `normaliseReportData()`
 * contracts with report-only operational context, PII, audit provenance and
 * stored evidence JSON.
 *
 * CALLERS
 * ───────
 * Claim, forensic, audit, cost, repair and portfolio report generators.
 *
 * NEVER
 * ─────
 * Never call this without the caller's session-derived tenantId. Never expose
 * the `raw` data outside report presentation adapters. Never add renderer-local
 * reads of `claims` or `ai_assessments`; add a typed field here instead.
 */

import mysql from "mysql2/promise";
import { normaliseReportData, type NormalisedReportData } from "../report-normalisation";
import { resolveClaimRecord, type ResolvedClaimRecord } from "../claim-record-bridge";
import {
  loadEvidenceGovernanceReportData,
  type EvidenceGovernanceReportData,
} from "./evidenceGovernancePresentation";

export type ReportAudience =
  | "claim_assessment"
  | "forensic"
  | "audit"
  | "cost_comparison"
  | "repair_decision"
  | "portfolio"
  | "governance"
  | "executive";

export type JsonValue = Record<string, unknown> | unknown[] | string | number | boolean | null;

export interface ResolvedReportRecord {
  scope: Readonly<{
    tenantId: string;
    claimId: number;
    claimReference: string | null;
  }>;
  claim: Readonly<{
    status: string | null;
    workflowState: string | null;
    confidenceScore: number | null;
    createdAt: Date | string | null;
    updatedAt: Date | string | null;
    lodgerName: string | null;
    claimantName: string | null;
    policyNumber: string | null;
    insurerName: string | null;
    tenantName: string | null;
    currencyCode: string | null;
    excessAmountCents: number | null;
    coverType: string | null;
    policyType: string | null;
    sumInsured: number | null;
    policyExcess: number | null;
    deductible: number | null;
  }>;
  incident: Readonly<{
    type: string | null;
    date: Date | string | null;
    location: string | null;
    description: string | null;
    weatherConditions: string | null;
    roadSurface: string | null;
    gpsLatitude: number | null;
    gpsLongitude: number | null;
    policeReportDate: Date | string | null;
  }>;
  vehicle: Readonly<{
    make: string | null;
    model: string | null;
    year: number | null;
    description: string | null;
    registration: string | null;
    vin: string | null;
    marketValue: number | null;
    registryId: number | null;
  }>;
  driver: Readonly<{
    licenceNumber: string | null;
    licenceAgeRange: string | null;
    isPolicyholder: boolean | null;
  }>;
  decision: Readonly<{
    resolved: ResolvedClaimRecord;
    normalised: NormalisedReportData;
    totalLossIndicated: boolean | null;
    repairToValueRatio: number | null;
    costVerdict: string | null;
    repairIntelligence: JsonValue;
    decisionAuthority: JsonValue;
  }>;
  assessment: Readonly<{
    assessmentId: number | null;
    createdAt: Date | string | null;
    modelVersion: string | null;
    triggeredRole: string | null;
    damageDescription: string | null;
  }>;
  evidence: Readonly<{
    physicsAnalysis: JsonValue;
    physicsTruth: JsonValue;
    claimTruth: JsonValue;
    crossValidation: JsonValue;
    forensicAuditValidation: JsonValue;
    inputFidelityResult: JsonValue;
    enrichedPhotos: JsonValue;
    /** Latest AI assessment JSON; never substitute persisted component-cost rows. */
    aiDetectedDamageComponents: JsonValue;
    /** Submitted panel-beater quotation and line-item evidence. */
    quoteEvidence: readonly QuoteEvidence[];
    fraudScoreBreakdown: JsonValue;
    costIntelligence: JsonValue;
    narrativeAnalysis: JsonValue;
    contactGeometry: JsonValue;
    interpretation: JsonValue;
    documents: readonly ClaimDocumentEvidence[];
    evidenceGovernance: EvidenceGovernanceReportData;
  }>;
  history: Readonly<{
    assessmentHistory: readonly AssessmentHistoryEntry[];
    /** Recorded events only; not a claimed-complete status-transition ledger. */
    recordedClaimEvents: readonly RecordedClaimEvent[];
    vehicleClaimHistory: readonly VehicleClaimHistoryEntry[];
  }>;
  preLossCondition: Readonly<{
    state: "available" | "not_produced";
    value: PreLossConditionSnapshot | null;
  }>;
  audit: Readonly<{
    claimCreatedAt: Date | string | null;
    claimUpdatedAt: Date | string | null;
    assessmentCreatedAt: Date | string | null;
    assessmentPipelineVersion: string | null;
    assessmentTriggeredRole: string | null;
  }>;
}

export interface AssessmentHistoryEntry {
  assessmentId: number;
  createdAt: Date | string | null;
  modelVersion: string | null;
  fraudScore: number | null;
  fraudRiskLevel: string | null;
  recommendation: string | null;
  triggeredRole: string | null;
}

export interface RecordedClaimEvent {
  eventType: string | null;
  eventPayload: JsonValue;
  userId: number | null;
  userRole: string | null;
  emittedAt: Date | string | null;
}

export interface QuoteLineEvidence {
  description: string | null;
  category: string | null;
  unitPrice: number | null;
  lineTotal: number | null;
}

export interface QuoteEvidence {
  quoteId: number;
  quotedAmount: number | null;
  partsCost: number | null;
  labourCost: number | null;
  status: string | null;
  quoteType: string | null;
  parentQuoteId: number | null;
  currencyCode: string | null;
  panelBeaterName: string | null;
  quoteCongruencyScore: number | null;
  createdAt: Date | string | null;
  lineItems: readonly QuoteLineEvidence[];
}

export interface ClaimDocumentEvidence {
  documentCategory: string | null;
  fileName: string | null;
  fileUrl: string | null;
  createdAt: Date | string | null;
}

export interface VehicleClaimHistoryEntry {
  claimReference: string | null;
  incidentDate: Date | string | null;
  incidentType: string | null;
  workflowState: string | null;
  createdAt: Date | string | null;
}

export interface PreLossConditionSnapshot {
  snapshotVersion: string | number | null;
  snapshotDate: Date | string | null;
  exteriorCondition: string | null;
  interiorCondition: string | null;
  mechanicalCondition: string | null;
  existingDamageNotes: string | null;
  odometerKm: number | null;
  requestNumber: string | null;
  valuationDate: Date | string | null;
}

export interface ReportCollectionFilters {
  from?: Date | string | number;
  to?: Date | string | number;
  statuses?: string[];
}

export interface ResolvedReportCollection {
  tenantId: string;
  records: readonly ResolvedReportRecord[];
}

export interface ResolvedReportCollectionSummary {
  claimCount: number;
  estimatedCostUsd: number;
  fraud: { averageScore: number; highRiskCount: number };
  verdicts: Record<string, number>;
}

const DB_URL = process.env.DATABASE_URL!;

function requireTenant(tenantId: string | undefined): string {
  const value = tenantId?.trim();
  if (!value) throw new Error("Tenant scope is required to resolve report data");
  return value;
}

function asNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asBoolean(value: unknown): boolean | null {
  if (value == null) return null;
  return Boolean(value);
}

function parseJson(value: unknown): JsonValue {
  if (value == null || value === "") return null;
  if (typeof value === "object") return value as JsonValue;
  if (typeof value !== "string") return null;
  try { return JSON.parse(value) as JsonValue; } catch { return null; }
}

function displayVehicle(make: unknown, model: unknown, year: unknown): string | null {
  const value = [make, model, year].filter((part) => part != null && String(part).trim() !== "").join(" ").trim();
  return value || null;
}

interface ReportChildren {
  assessmentHistory: readonly AssessmentHistoryEntry[];
  recordedClaimEvents: readonly RecordedClaimEvent[];
  quoteEvidence: readonly QuoteEvidence[];
  documents: readonly ClaimDocumentEvidence[];
  vehicleClaimHistory: readonly VehicleClaimHistoryEntry[];
  preLossCondition: PreLossConditionSnapshot | null;
  evidenceGovernance: EvidenceGovernanceReportData;
}

const EMPTY_REPORT_CHILDREN: ReportChildren = {
  assessmentHistory: [],
  recordedClaimEvents: [],
  quoteEvidence: [],
  documents: [],
  vehicleClaimHistory: [],
  preLossCondition: null,
  evidenceGovernance: { ledger: [], findings: [], gaps: [] },
};

async function loadReportChildren(
  conn: mysql.Connection,
  claimId: number,
  tenantId: string,
  claim: Record<string, unknown>,
): Promise<ReportChildren> {
  const [assessmentRows] = await conn.execute(
    `SELECT a.id, a.created_at, a.model_version, a.fraud_score, a.fraud_risk_level,
            a.recommendation, a.triggered_role
       FROM ai_assessments a
       JOIN claims c ON c.id = a.claim_id AND c.tenant_id = a.tenant_id
      WHERE a.claim_id = ? AND a.tenant_id = ?
      ORDER BY a.created_at ASC, a.id ASC`,
    [claimId, tenantId],
  ) as [Record<string, unknown>[], unknown];

  const [eventRows] = await conn.execute(
    `SELECT e.event_type, e.event_payload, e.user_id, e.user_role, e.emitted_at
       FROM claim_events e
       JOIN claims c ON c.id = e.claim_id AND c.tenant_id = e.tenant_id
      WHERE e.claim_id = ? AND e.tenant_id = ?
      ORDER BY e.emitted_at ASC, e.id ASC`,
    [claimId, tenantId],
  ) as [Record<string, unknown>[], unknown];

  const [quoteRows] = await conn.execute(
    `SELECT q.id AS quote_id, q.quoted_amount, q.parts_cost, q.labor_cost, q.status, q.created_at,
            q.quote_type, q.parent_quote_id, q.currency_code, q.quote_congruency_score, q.components_json,
            q.itemized_breakdown, pb.business_name AS panel_beater_name
       FROM panel_beater_quotes q
       JOIN claims c ON c.id = q.claim_id
       LEFT JOIN panel_beaters pb ON pb.id = q.panel_beater_id
      WHERE q.claim_id = ? AND c.tenant_id = ?
      ORDER BY q.created_at ASC, q.id ASC`,
    [claimId, tenantId],
  ) as [Record<string, unknown>[], unknown];

  const quoteEvidence: QuoteEvidence[] = [];
  for (const quote of quoteRows) {
    const [lineRows] = await conn.execute(
      `SELECT description, category, unit_price, line_total
         FROM quote_line_items
        WHERE quote_id = ?
        ORDER BY item_number ASC, id ASC`,
      [quote.quote_id],
    ) as [Record<string, unknown>[], unknown];
    quoteEvidence.push({
      quoteId: Number(quote.quote_id),
      quotedAmount: asNumber(quote.quoted_amount),
      partsCost: asNumber(quote.parts_cost),
      labourCost: asNumber(quote.labor_cost),
      status: quote.status as string | null,
      quoteType: quote.quote_type as string | null,
      parentQuoteId: asNumber(quote.parent_quote_id),
      currencyCode: quote.currency_code as string | null,
      panelBeaterName: quote.panel_beater_name as string | null,
      quoteCongruencyScore: asNumber(quote.quote_congruency_score),
      createdAt: quote.created_at as Date | string | null,
      lineItems: lineRows.map((line) => ({
        description: line.description as string | null,
        category: line.category as string | null,
        unitPrice: asNumber(line.unit_price),
        lineTotal: asNumber(line.line_total),
      })),
    });
  }

  const [documentRows] = await conn.execute(
    `SELECT d.document_category, d.file_name, d.file_url, d.created_at
       FROM claim_documents d
       JOIN claims c ON c.id = d.claim_id
      WHERE d.claim_id = ? AND c.tenant_id = ?
      ORDER BY d.created_at DESC, d.id DESC`,
    [claimId, tenantId],
  ) as [Record<string, unknown>[], unknown];

  const vehicleRegistration = asString(claim.vehicle_registration ?? claim.registration_number);
  const [vehicleHistoryRows] = vehicleRegistration
    ? await conn.execute(
      `SELECT c2.claim_reference, c2.incident_date, c2.incident_type, c2.workflow_state, c2.created_at
         FROM claims c2
        WHERE c2.vehicle_registration = ? AND c2.id != ? AND c2.tenant_id = ?
        ORDER BY c2.created_at DESC
        LIMIT 5`,
      [vehicleRegistration, claimId, tenantId],
    ) as [Record<string, unknown>[], unknown]
    : [[], null] as [Record<string, unknown>[], unknown];

  const vehicleRegistryId = asNumber(claim.vehicle_registry_id);
  const [preLossRows] = vehicleRegistryId !== null
    ? await conn.execute(
      `SELECT vcs.snapshot_version, vcs.snapshot_date, vcs.exterior_condition, vcs.interior_condition,
              vcs.mechanical_condition, vcs.existing_damage_notes, vcs.odometer_km,
              asr.request_number, asr.valuation_date
         FROM vehicle_condition_snapshots vcs
         JOIN agency_insurance_service_requests asr ON asr.id = vcs.insurance_service_request_id
         JOIN agency_insurance_service_request_insurers asri ON asri.service_request_id = asr.id
        WHERE vcs.vehicle_registry_id = ? AND asri.insurer_tenant_id = ?
          AND asri.status IN ('invited','viewed','responded')
          AND (? IS NULL OR vcs.snapshot_date <= ?)
        ORDER BY vcs.snapshot_date DESC
        LIMIT 1`,
      [vehicleRegistryId, tenantId, claim.incident_date ?? null, claim.incident_date ?? null],
    ) as [Record<string, unknown>[], unknown]
    : [[], null] as [Record<string, unknown>[], unknown];

  const preLoss = preLossRows[0] ?? null;
  const evidenceGovernance = await loadEvidenceGovernanceReportData(conn, claimId, tenantId);

  return {
    assessmentHistory: assessmentRows.map((row) => ({
      assessmentId: Number(row.id),
      createdAt: row.created_at as Date | string | null,
      modelVersion: row.model_version as string | null,
      fraudScore: asNumber(row.fraud_score),
      fraudRiskLevel: row.fraud_risk_level as string | null,
      recommendation: row.recommendation as string | null,
      triggeredRole: row.triggered_role as string | null,
    })),
    recordedClaimEvents: eventRows.map((row) => ({
      eventType: row.event_type as string | null,
      eventPayload: parseJson(row.event_payload),
      userId: asNumber(row.user_id),
      userRole: row.user_role as string | null,
      emittedAt: row.emitted_at as Date | string | null,
    })),
    quoteEvidence,
    documents: documentRows.map((row) => ({
      documentCategory: asString(row.document_category),
      fileName: asString(row.file_name),
      fileUrl: asString(row.file_url),
      createdAt: row.created_at as Date | string | null,
    })),
    vehicleClaimHistory: vehicleHistoryRows.map((row) => ({
      claimReference: asString(row.claim_reference),
      incidentDate: row.incident_date as Date | string | null,
      incidentType: asString(row.incident_type),
      workflowState: asString(row.workflow_state),
      createdAt: row.created_at as Date | string | null,
    })),
    preLossCondition: preLoss === null ? null : {
      snapshotVersion: (preLoss.snapshot_version as string | number | null) ?? null,
      snapshotDate: preLoss.snapshot_date as Date | string | null,
      exteriorCondition: asString(preLoss.exterior_condition),
      interiorCondition: asString(preLoss.interior_condition),
      mechanicalCondition: asString(preLoss.mechanical_condition),
      existingDamageNotes: asString(preLoss.existing_damage_notes),
      odometerKm: asNumber(preLoss.odometer_km),
      requestNumber: asString(preLoss.request_number),
      valuationDate: preLoss.valuation_date as Date | string | null,
    },
    evidenceGovernance,
  };
}

/**
 * Narrow presentation adapter for legacy report templates during their migration.
 * It is intentionally derived only from the typed contract above; it is not a
 * second database model and must not be used outside report presentation code.
 */
export function toReportDefinitionRow(record: ResolvedReportRecord): Record<string, unknown> {
  const { decision, evidence, assessment, claim, incident, vehicle, driver, scope } = record;
  return {
    id: scope.claimId,
    tenant_id: scope.tenantId,
    claim_reference: scope.claimReference,
    status: claim.status,
    workflow_state: claim.workflowState,
    created_at: claim.createdAt,
    updated_at: claim.updatedAt,
    lodger_name: claim.lodgerName,
    claimant_name: claim.claimantName,
    policy_number: claim.policyNumber,
    insurer_name: claim.insurerName,
    tenant_name: claim.tenantName,
    currency_code: claim.currencyCode,
    excess_amount_cents: claim.excessAmountCents,
    cover_type: claim.coverType,
    policy_type: claim.policyType,
    sum_insured: claim.sumInsured,
    policy_excess: claim.policyExcess,
    deductible: claim.deductible,
    incident_type: incident.type,
    incident_date: incident.date,
    incident_location: incident.location,
    incident_description: incident.description,
    weather_conditions: incident.weatherConditions,
    road_surface: incident.roadSurface,
    gps_lat: incident.gpsLatitude,
    gps_lng: incident.gpsLongitude,
    police_report_date: incident.policeReportDate,
    vehicle_make: vehicle.make,
    vehicle_model: vehicle.model,
    vehicle_year: vehicle.year,
    vehicle_description: vehicle.description,
    vehicle_registration: vehicle.registration,
    registration_number: vehicle.registration,
    vehicle_vin: vehicle.vin,
    vehicle_market_value: vehicle.marketValue,
    vehicle_registry_id: vehicle.registryId,
    driver_licence_number: driver.licenceNumber,
    licence_age_range: driver.licenceAgeRange,
    driver_is_self: driver.isPolicyholder,
    confidence_score: decision.resolved.dataCompletenessScore,
    fraud_score: decision.normalised.fraud.score,
    fraud_risk_level: decision.normalised.fraud.level,
    recommendation: decision.normalised.verdict.verdict,
    estimated_cost: decision.normalised.costs.aiEstimateUsd == null ? null : Math.round(decision.normalised.costs.aiEstimateUsd * 100),
    parts_cost: decision.normalised.costs.partsUsd,
    labor_cost: decision.normalised.costs.labourUsd,
    total_loss_indicated: decision.totalLossIndicated,
    repair_to_value_ratio: decision.repairToValueRatio,
    cost_verdict: decision.costVerdict,
    repair_intelligence_json: decision.repairIntelligence,
    decision_authority_json: decision.decisionAuthority,
    damage_description: assessment.damageDescription,
    assessment_id: assessment.assessmentId,
    assessment_date: assessment.createdAt,
    model_version: assessment.modelVersion,
    triggered_role: assessment.triggeredRole,
    physics_analysis: evidence.physicsAnalysis,
    physics_truth_json: evidence.physicsTruth,
    claim_truth_json: evidence.claimTruth,
    cross_validation_json: evidence.crossValidation,
    forensic_audit_validation_json: evidence.forensicAuditValidation,
    ife_result_json: evidence.inputFidelityResult,
    enriched_photos_json: evidence.enrichedPhotos,
    damaged_components_json: evidence.aiDetectedDamageComponents,
    fraud_score_breakdown_json: evidence.fraudScoreBreakdown,
    cost_intelligence_json: evidence.costIntelligence,
    narrative_analysis_json: evidence.narrativeAnalysis,
    cgi_result_json: evidence.contactGeometry,
    interpretation_result_json: evidence.interpretation,
  };
}

function toResolvedRecord(row: Record<string, unknown>, tenantId: string, children: ReportChildren): ResolvedReportRecord {
  const rawAssessment = {
    claimRecordJson: row.claim_record_json,
    incidentType: row.incident_type,
    incidentDescription: row.incident_description,
    accidentDate: row.incident_date,
    accidentLocation: row.incident_location,
    vehicleMake: row.vehicle_make,
    vehicleModel: row.vehicle_model,
    vehicleYear: row.vehicle_year,
    vehicleRegistration: row.vehicle_registration,
    policyNumber: row.policy_number,
    insurer: row.insurer_name,
    confidence_score: row.confidence_score,
    estimatedCost: row.estimated_cost,
    estimatedPartsCost: row.parts_cost,
    estimatedLaborCost: row.labor_cost,
    currencyCode: row.assessment_currency_code ?? row.currency_code,
    fraudScore: row.fraud_score,
    fraudRiskLevel: row.fraud_risk_level,
    fraudScoreBreakdownJson: row.fraud_score_breakdown_json,
    recommendation: asString(row.recommendation),
    costIntelligenceJson: parseJson(row.cost_intelligence_json),
    physicsAnalysis: row.physics_analysis,
    narrativeAnalysisJson: row.narrative_analysis_json,
    damagedComponentsJson: row.damaged_components_json,
    enrichedPhotosJson: row.enriched_photos_json,
  } as Record<string, unknown>;

  const resolved = resolveClaimRecord(rawAssessment);
  const normalised = normaliseReportData({
    estimatedCost: asNumber(row.estimated_cost),
    estimatedPartsCost: asNumber(row.parts_cost),
    estimatedLaborCost: asNumber(row.labor_cost),
    fraudScore: asNumber(row.fraud_score),
    fraudRiskLevel: row.fraud_risk_level as string | null,
    recommendation: asString(row.recommendation),
    currencyCode: (row.assessment_currency_code ?? row.currency_code) as string | null,
    costIntelligenceJson: parseJson(row.cost_intelligence_json) as any,
    fraudScoreBreakdownJson: parseJson(row.fraud_score_breakdown_json) as any,
    causalVerdictJson: parseJson(row.claim_truth_json) as any,
    validatedOutcomeJson: parseJson(row.decision_authority_json) as any,
  });

  return {
    scope: { tenantId, claimId: Number(row.id), claimReference: row.claim_reference as string | null },
    claim: {
      status: row.status as string | null,
      workflowState: row.workflow_state as string | null,
      confidenceScore: asNumber(row.confidence_score),
      createdAt: row.created_at as Date | string | null,
      updatedAt: row.updated_at as Date | string | null,
      lodgerName: row.lodger_name as string | null,
      claimantName: row.claimant_name as string | null,
      policyNumber: resolved.policyNumber,
      insurerName: resolved.insurer,
      tenantName: row.tenant_name as string | null,
      currencyCode: resolved.currencyCode,
      excessAmountCents: asNumber(row.excess_amount_cents),
      coverType: asString(row.cover_type),
      policyType: asString(row.policy_type),
      sumInsured: asNumber(row.sum_insured),
      policyExcess: asNumber(row.policy_excess),
      deductible: asNumber(row.deductible),
    },
    incident: {
      type: resolved.incidentType,
      date: resolved.accidentDate,
      location: resolved.accidentLocation,
      description: asString(row.incident_description),
      weatherConditions: row.weather_conditions as string | null,
      roadSurface: row.road_surface as string | null,
      gpsLatitude: asNumber(row.gps_lat),
      gpsLongitude: asNumber(row.gps_lng),
      policeReportDate: row.police_report_date as Date | string | null,
    },
    vehicle: {
      make: resolved.vehicleMake,
      model: resolved.vehicleModel,
      year: resolved.vehicleYear,
      description: displayVehicle(resolved.vehicleMake, resolved.vehicleModel, resolved.vehicleYear),
      registration: resolved.vehicleRegistration,
      vin: (row.vehicle_vin ?? row.vin) as string | null,
      marketValue: asNumber(row.vehicle_market_value),
      registryId: asNumber(row.vehicle_registry_id),
    },
    driver: {
      licenceNumber: row.driver_licence_number as string | null,
      licenceAgeRange: row.licence_age_range as string | null,
      isPolicyholder: asBoolean(row.driver_is_self),
    },
    decision: {
      resolved,
      normalised,
      totalLossIndicated: asBoolean(row.total_loss_indicated),
      repairToValueRatio: asNumber(row.repair_to_value_ratio),
      costVerdict: asString(row.cost_verdict),
      repairIntelligence: parseJson(row.repair_intelligence_json),
      decisionAuthority: parseJson(row.decision_authority_json),
    },
    assessment: {
      assessmentId: asNumber(row.assessment_id),
      createdAt: row.assessment_created_at as Date | string | null,
      modelVersion: row.model_version as string | null,
      triggeredRole: row.triggered_role as string | null,
      damageDescription: row.damage_description as string | null,
    },
    evidence: {
      physicsAnalysis: parseJson(row.physics_analysis),
      physicsTruth: parseJson(row.physics_truth_json),
      claimTruth: parseJson(row.claim_truth_json),
      crossValidation: parseJson(row.cross_validation_json),
      forensicAuditValidation: parseJson(row.forensic_audit_validation_json),
      inputFidelityResult: parseJson(row.ife_result_json),
      enrichedPhotos: parseJson(row.enriched_photos_json),
      aiDetectedDamageComponents: parseJson(row.damaged_components_json),
      quoteEvidence: children.quoteEvidence,
      fraudScoreBreakdown: parseJson(row.fraud_score_breakdown_json),
      costIntelligence: parseJson(row.cost_intelligence_json),
      narrativeAnalysis: parseJson(row.narrative_analysis_json),
      contactGeometry: parseJson(row.cgi_result_json),
      interpretation: parseJson(row.interpretation_result_json),
      documents: children.documents,
      evidenceGovernance: children.evidenceGovernance,
    },
    history: {
      assessmentHistory: children.assessmentHistory,
      recordedClaimEvents: children.recordedClaimEvents,
      vehicleClaimHistory: children.vehicleClaimHistory,
    },
    preLossCondition: {
      state: children.preLossCondition === null ? "not_produced" : "available",
      value: children.preLossCondition,
    },
    audit: {
      claimCreatedAt: row.created_at as Date | string | null,
      claimUpdatedAt: row.updated_at as Date | string | null,
      assessmentCreatedAt: row.assessment_created_at as Date | string | null,
      assessmentPipelineVersion: row.model_version as string | null,
      assessmentTriggeredRole: row.triggered_role as string | null,
    },
  };
}

const ASSESSMENT_COLUMNS = `
         a.id AS assessment_id,
         a.created_at AS assessment_created_at,
         a.model_version,
         a.triggered_role,
         a.fraud_score,
         a.fraud_risk_level,
         a.recommendation,
         a.estimated_cost,
         a.parts_cost,
         a.labor_cost,
         a.currency_code AS assessment_currency_code,
         a.damage_description,
         a.total_loss_indicated,
         a.repair_to_value_ratio,
         a.claim_record_json,
         a.decision_authority_json,
         a.physics_analysis,
         a.physics_truth_json,
         a.fraud_score_breakdown_json,
         a.cost_intelligence_json,
         a.cross_validation_json,
         a.claim_truth_json,
         a.enriched_photos_json,
         a.damaged_components_json,
         a.repair_intelligence_json,
         a.narrative_analysis_json,
         a.forensic_audit_validation_json,
         a.ife_result_json,
         a.cgi_result_json,
         a.interpretation_result_json`;

async function loadLatestAssessment(
  conn: mysql.Connection,
  claimId: number,
  tenantId: string,
): Promise<Record<string, unknown>> {
  const [rows] = await conn.execute(
    `SELECT ${ASSESSMENT_COLUMNS}
       FROM ai_assessments a
      WHERE a.claim_id = ? AND a.tenant_id = ?
      ORDER BY a.created_at DESC, a.id DESC
      LIMIT 1`,
    [claimId, tenantId],
  ) as [Record<string, unknown>[], unknown];
  return rows[0] ?? {};
}

export async function resolveReportRecord(input: {
  claimId: number;
  tenantId: string;
  audience: ReportAudience;
}): Promise<ResolvedReportRecord> {
  const tenantId = requireTenant(input.tenantId);
  const conn = await mysql.createConnection(DB_URL);
  try {
    const [rows] = await conn.execute(
      `SELECT c.* FROM claims c WHERE c.id = ? AND c.tenant_id = ?`,
      [input.claimId, tenantId],
    ) as [Record<string, unknown>[], unknown];
    const row = rows[0];
    if (!row) throw new Error(`Claim ${input.claimId} not found in the current tenant scope`);
    Object.assign(row, await loadLatestAssessment(conn, input.claimId, tenantId));
    const children = await loadReportChildren(conn, input.claimId, tenantId, row);
    return toResolvedRecord(row, tenantId, children);
  } finally {
    await conn.end();
  }
}

export async function resolveReportCollection(input: {
  tenantId: string;
  audience: ReportAudience;
  filters?: ReportCollectionFilters;
  /** Aggregate helpers may avoid non-essential child evidence loading. */
  includeChildren?: boolean;
}): Promise<ResolvedReportCollection> {
  const tenantId = requireTenant(input.tenantId);
  const conditions = ["c.tenant_id = ?"];
  const values: unknown[] = [tenantId];
  if (input.filters?.from) { conditions.push("c.created_at >= ?"); values.push(input.filters.from); }
  if (input.filters?.to) { conditions.push("c.created_at <= ?"); values.push(input.filters.to); }
  if (input.filters?.statuses?.length) {
    conditions.push(`c.status IN (${input.filters.statuses.map(() => "?").join(",")})`);
    values.push(...input.filters.statuses);
  }
  const conn = await mysql.createConnection(DB_URL);
  try {
    const [rows] = await conn.execute(
      `SELECT c.* FROM claims c WHERE ${conditions.join(" AND ")} ORDER BY c.created_at DESC`,
      values,
    ) as [Record<string, unknown>[], unknown];
    const records = await Promise.all(rows.map(async (row) => {
      const claimId = Number(row.id);
      Object.assign(row, await loadLatestAssessment(conn, claimId, tenantId));
      const children = input.includeChildren === false
        ? EMPTY_REPORT_CHILDREN
        : await loadReportChildren(conn, claimId, tenantId, row);
      return toResolvedRecord(row, tenantId, children);
    }));
    return { tenantId, records };
  } finally {
    await conn.end();
  }
}

export function summariseResolvedReportRecords(records: readonly ResolvedReportRecord[]): ResolvedReportCollectionSummary {
  const verdicts: Record<string, number> = {};
  let estimatedCostUsd = 0;
  let totalFraudScore = 0;
  let highRiskCount = 0;
  for (const record of records) {
    const verdict = record.decision.normalised.verdict.verdict;
    verdicts[verdict] = (verdicts[verdict] ?? 0) + 1;
    estimatedCostUsd += record.decision.normalised.costs.totalUsd ?? 0;
    totalFraudScore += record.decision.normalised.fraud.score;
    if (["high", "elevated"].includes(record.decision.normalised.fraud.level)) highRiskCount += 1;
  }
  return {
    claimCount: records.length,
    estimatedCostUsd,
    fraud: { averageScore: records.length ? totalFraudScore / records.length : 0, highRiskCount },
    verdicts,
  };
}
