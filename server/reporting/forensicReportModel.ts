/**
 * KINGA — ForensicReportModel
 *
 * PURPOSE
 * ───────
 * Builds the immutable, tenant-scoped data contract required by a future
 * forensic report split. It deliberately runs beside—not through—the current
 * forensicDecisionReport generator while field parity is being verified.
 *
 * CALLERS
 * ───────
 * Tests and future forensic presentation adapters only. The current generator
 * continues to use its existing path until the staging-gated split is approved.
 *
 * NEVER
 * ─────
 * Never accept an absent or caller-substituted tenant scope. Never expose a
 * database connection or a mutable database row to a renderer. Never use this
 * module to alter decision, cost, or evidence semantics.
 */

import mysql from "mysql2/promise";
import { resolveReportCostIntegrity, type ReportCostIntegrity } from "./costIntegrity";
import { resolveReportDecisionIntegrity, type ReportDecisionIntegrity } from "./reportDecisionIntegrity";
import { normaliseCanonicalPhotoEvidence, type CanonicalPhotoEvidenceSummary } from "./photoEvidencePresentation";
import { loadEvidenceGovernanceReportData } from "./evidenceGovernancePresentation";
import { resolveReportRecord, type JsonValue, type ReportAudience, type ResolvedReportRecord } from "./resolvedReportRecord";

const DB_URL = process.env.DATABASE_URL!;

export type ForensicAvailabilityState =
  | "available"
  | "not_produced"
  | "not_applicable"
  | "source_unavailable"
  | "legacy_partial";

export type JsonObject = Readonly<Record<string, unknown>>;

export interface ForensicAvailability<T> {
  readonly state: ForensicAvailabilityState;
  readonly value: T | null;
  readonly reason: string | null;
  readonly source: string | null;
}

export interface ForensicMeasurement {
  readonly value: number | null;
  readonly unit: string;
  readonly min: number | null;
  readonly max: number | null;
  readonly confidence: number | null;
  readonly source: string | null;
  readonly note: string | null;
}

export interface ForensicScore {
  readonly value: number | null;
  readonly outOf: 100;
  readonly band: string;
  readonly source: string | null;
}

export interface ForensicPhoto {
  readonly url: string | null;
  readonly caption: string | null;
  readonly impactZone: string | null;
  readonly severity: string | null;
  readonly usable: boolean;
  readonly confidenceScore: number | null;
  readonly componentCount: number | null;
  readonly directionContradiction: boolean;
  readonly semanticType: string | null;
  readonly detectedComponents: readonly string[];
  readonly classificationConfidence: number | null;
  readonly classifier: string | null;
  readonly selectionReason: string | null;
  readonly fallbackWarning: string | null;
  readonly suitableForCrushDepth: boolean | null;
  readonly physicsExclusionReason: string | null;
  readonly sourcePage: number | null;
}

export interface ForensicReportModel {
  readonly contractVersion: "1";
  readonly provenance: Readonly<{
    generatedAt: Date;
    selectedAssessmentId: number | null;
    selectedAssessmentCreatedAt: Date | string | null;
    selectedAssessmentModelVersion: string | null;
    assessmentSelection: "latest_created_at_then_id" | "no_assessment";
  }>;
  readonly scope: Readonly<{
    tenantId: string;
    claimId: number;
    audience: Extract<ReportAudience, "forensic">;
  }>;
  /** The common, already-authorised report projection; no raw SQL row escapes. */
  readonly reportRecord: ResolvedReportRecord;
  readonly availability: Readonly<{
    assessment: ForensicAvailability<true>;
    quotes: ForensicAvailability<true>;
    documents: ForensicAvailability<true>;
    auditTrail: ForensicAvailability<true>;
    disputes: ForensicAvailability<true>;
    preLossCondition: ForensicAvailability<true>;
    evidenceGovernance: ForensicAvailability<true>;
  }>;
  readonly identity: Readonly<{
    claimReference: string | null;
    documentReference: string;
    kingaReference: string | null;
    generatedDate: Date;
  }>;
  readonly executive: Readonly<{
    decision: ReportDecisionIntegrity;
    costVerdict: string | null;
    reviewTriggers: readonly string[];
    reviewTriggerSource: "claim_truth" | "legacy_derived" | "unavailable";
    fraud: ForensicScore;
    fraudScoreAdjusted: number | null;
    physicsConsistency: ForensicScore;
    forensicAudit: ForensicScore;
    dataCompleteness: ForensicScore;
    claimQuality: ForensicScore;
    marketValue: number | null;
    repairToValueRatioPercent: number | null;
    currency: string;
    costIntegrity: ReportCostIntegrity;
    physicsSnapshot: Readonly<{
      campbellSpeed: JsonObject | null;
      kineticEnergy: JsonObject | null;
      deltaV: JsonObject | null;
      deformationEfficiency: JsonObject | null;
      uncertaintyGrade: string | null;
      uncertaintySummary: string | null;
      verdictParagraph: string | null;
      integrityScore: number | null;
      integrityClean: boolean | null;
      criticalCount: number | null;
      warningCount: number | null;
      infoCount: number;
      totalFlagCount: number;
    }>;
  }>;
  readonly claimAndVehicle: Readonly<{
    claimantName: string | null;
    insurerName: string | null;
    policyNumber: string | null;
    policyExcess: number | null;
    incidentDate: Date | string | null;
    incidentType: string | null;
    vehicleDescription: string | null;
    vehicleRegistration: string | null;
    vehicleVin: string | null;
    vehicleOdometer: string | number | null;
    vehicleYear: number | null;
    dateAnomaly: Readonly<{ present: boolean; incidentYear: number | null; vehicleYear: number | null }>;
    driverName: string | null;
    driverLicence: string | null;
    assessorName: string | null;
    repairerName: string | null;
    policeCaseNumber: string | null;
    policeStatus: string | null;
    preLossCondition: ForensicAvailability<JsonObject>;
  }>;
  readonly narrative: Readonly<{
    reconstructedSequence: string | null;
    narrativeFlag: string | null;
    physicsVsNarrative: string;
    damageVsNarrative: string;
    damageVsNarrativeSource: "pipeline" | "photo_derived" | "not_assessed";
    crossEngineAgreement: number | null;
    policeAlignment: string;
    crossValidationNote: string | null;
    impactDirection: string;
  }>;
  readonly technical: Readonly<{
    deltaV: ForensicMeasurement;
    kineticEnergy: ForensicMeasurement;
    impactForce: ForensicMeasurement;
    vehicleMass: ForensicMeasurement;
    deceleration: ForensicMeasurement;
    crushDepth: ForensicMeasurement;
    impactSeverity: string | null;
    dataQualityScore: number | null;
    constraints: readonly JsonObject[];
    speed: Readonly<{
      consensus: number | null;
      consensusRounded: number | null;
      driverStated: number | null;
      discrepancyPercent: number | null;
      overallConfidence: string | null;
      methods: readonly JsonObject[];
      methodsRan: number;
      methodsTotal: number;
    }>;
    impactMap: Readonly<{
      direction: string;
      damageZones: readonly JsonObject[];
      frontZone: JsonObject | null;
      rearZone: JsonObject | null;
      underbodyAffected: boolean;
    }>;
    damageSeverity: Readonly<{
      totalComponents: number;
      severeCount: number;
      moderateCount: number;
      minorCount: number;
      severePercent: number;
      moderatePercent: number;
      minorPercent: number;
      summary: string | null;
    }>;
    causation: ForensicAvailability<Readonly<{
      classification: string;
      speedCeilingKmh: number | null;
      speedCeilingBreached: boolean;
      reversingNarrativeContradiction: boolean;
      brakingDistanceMetres: number | null;
      brakingFrictionCoefficient: number | null;
    }>>;
    threeWaySpeedComparison: ForensicAvailability<JsonObject>;
    evidenceQuality: ForensicAvailability<JsonObject>;
    integrityFlags: readonly JsonObject[];
    geometryCalibration: ForensicAvailability<JsonObject>;
    crossImageReconciliation: ForensicAvailability<JsonObject>;
  }>;
  readonly structural: Readonly<{
    loadPath: ForensicAvailability<Readonly<{
      penetratedComponents: readonly JsonObject[];
      latentDamageProbability: JsonObject | null;
      integrityRisk: string | null;
      confidence: number | null;
      warnings: readonly string[];
    }>>;
    vehicleProfile: Readonly<{
      ancapRating: string | null;
      vehicleClass: string | null;
      adultOccupantScore: string | null;
      childOccupantScore: string | null;
      crash3StiffnessA: string | null;
      crash3StiffnessB: string | null;
      typicalMassRange: string | null;
      safetyRisk: string | null;
      notes: string | null;
    }>;
    physicsEvidenceChain: ForensicAvailability<JsonObject>;
  }>;
  readonly financial: Readonly<{
    quotes: readonly JsonObject[];
    lowestQuote: number | null;
    highestQuote: number | null;
    kingaOptimised: number | null;
    l2EvidenceQualifiedComparison: number | null;
    l2Status: string;
    l2IntegrityNote: string;
    savings: number | null;
    savingsPercent: number | null;
    hasSavings: boolean;
    policyExcess: number | null;
    exclusions: readonly JsonObject[];
    totalExclusions: number;
    recommendedSettlement: number | null;
  }>;
  readonly reconciliation: Readonly<{
    matchedComponents: number;
    missingFromQuote: number;
    extraInQuote: number;
    structuralGaps: readonly JsonObject[];
    criticalStructuralGaps: readonly JsonObject[];
    copyQuotation: JsonObject | null;
    note: string | null;
  }>;
  readonly evidence: Readonly<{
    documents: readonly JsonObject[];
    documentCompleteness: JsonObject;
    coverageGapNote: string | null;
    photos: readonly ForensicPhoto[];
    totalPhotos: number;
    usablePhotos: number;
    uniqueComponents: number;
    zonesCovered: number;
    zonesTotal: 4;
    safetySystemActivation: string | null;
    damageZoneCoverage: readonly Readonly<{ zone: string; severity: string; photographed: boolean; note: string | null }>[];
    evidenceGovernance: unknown | null;
  }>;
  readonly risk: Readonly<{
    categoryBreakdown: ForensicAvailability<JsonObject>;
    categoryScores: Readonly<{
      physical: number | null;
      scenario: number | null;
      financial: number | null;
      documentation: number | null;
      entity: number | null;
      photo: number | null;
    }>;
    categoryBudgets: Readonly<{
      physical: number;
      scenario: number;
      financial: number;
      documentation: number;
      entity: number;
      photo: number;
    }>;
    linkedClaims: readonly string[];
    impossibilityFlag: boolean;
    riskSummary: string | null;
    dateDelta: string | null;
  }>;
  readonly contactGeometry: ForensicAvailability<JsonObject>;
  readonly interpretation: ForensicAvailability<JsonObject>;
  readonly validation: Readonly<{
    issues: readonly JsonObject[];
    highIssues: readonly JsonObject[];
    validationChecks: readonly JsonObject[];
    nextSteps: readonly string[];
  }>;
  readonly disputes: readonly JsonObject[];
  readonly approval: Readonly<{
    stages: readonly JsonObject[];
    completedStages: number;
    requiredStages: number;
    source: "forensic_audit" | "audit_log_derivation";
  }>;
}

type MutableRecord = Record<string, unknown>;

function object(value: unknown): JsonObject | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : null;
}

function array(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function read(objectValue: JsonObject | null, key: string): unknown {
  return objectValue?.[key] ?? null;
}

function number(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function string(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function bool(value: unknown): boolean | null {
  return value == null ? null : Boolean(value);
}

function objects(value: unknown): readonly JsonObject[] {
  return array(value).map(object).filter((item): item is JsonObject => item !== null);
}

function strings(value: unknown): readonly string[] {
  return array(value).filter((item): item is string => typeof item === "string");
}

function parseJson(value: unknown): JsonValue {
  if (value == null || value === "") return null;
  if (typeof value === "object") return value as JsonValue;
  if (typeof value !== "string") return null;
  try { return JSON.parse(value) as JsonValue; } catch { return null; }
}

function availability<T>(value: T | null, source: string | null, reason: string | null = null): ForensicAvailability<T> {
  return value === null
    ? { state: "not_produced", value: null, source, reason: reason ?? "The pipeline did not produce this evidence." }
    : { state: "available", value, source, reason: null };
}

function measurement(value: unknown, unit: string, source: string | null, extras: JsonObject | null = null): ForensicMeasurement {
  return {
    value: number(value),
    unit,
    min: number(read(extras, "min")),
    max: number(read(extras, "max")),
    confidence: number(read(extras, "confidence")),
    source,
    note: string(read(extras, "provenanceNote")),
  };
}

function fraudBand(value: number | null): string {
  if (value == null) return "unknown";
  return value >= 70 ? "high" : value >= 40 ? "moderate" : "low";
}

function confidenceBand(value: number | null): string {
  if (value == null) return "unknown";
  return value >= 70 ? "good" : value >= 40 ? "warning" : "critical";
}

function requireTenant(tenantId: string): string {
  const value = tenantId?.trim();
  if (!value) throw new Error("Tenant scope is required to resolve forensic report data");
  return value;
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  return value;
}

function deriveDamageVsNarrative(narrative: JsonObject | null, photos: readonly ForensicPhoto[], impactDirection: string): {
  value: string;
  source: "pipeline" | "photo_derived" | "not_assessed";
} {
  const crossValidation = object(read(narrative, "cross_validation"));
  const direct = string(read(crossValidation, "damage_verdict")) ?? string(read(narrative, "damageConsistency"));
  if (direct) return { value: direct, source: "pipeline" };
  const severe = photos.filter((photo) => ["severe", "high"].includes(String(photo.severity ?? "").toLowerCase()));
  const zones = severe.length > 0 ? severe : photos;
  const counts = new Map<string, number>();
  for (const photo of zones) {
    const zone = photo.impactZone?.toLowerCase();
    if (zone) counts.set(zone, (counts.get(zone) ?? 0) + 1);
  }
  const majority = [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0];
  if (!majority) return { value: "Not assessed", source: "not_assessed" };
  if (impactDirection === "unknown") return { value: "Not assessed — impact direction not determined", source: "photo_derived" };
  const rearNarrative = impactDirection.includes("rear") || impactDirection.includes("back");
  const frontNarrative = impactDirection.includes("front") || impactDirection.includes("head");
  const frontDamage = majority.includes("front") || majority.includes("hood") || majority.includes("bumper front");
  const rearDamage = majority.includes("rear") || majority.includes("boot") || majority.includes("bumper rear");
  if ((rearNarrative && frontDamage) || (frontNarrative && rearDamage)) {
    return { value: "Inconsistent — damage zone contradicts stated impact direction", source: "photo_derived" };
  }
  const matches = majority.includes(impactDirection) || impactDirection.includes(majority.split(" ")[0] ?? "");
  return { value: matches ? "Consistent (photo-derived)" : "Partial — damage zone partially matches stated direction", source: "photo_derived" };
}

async function loadForensicSupportingData(conn: mysql.Connection, claimId: number, tenantId: string, rawClaim: MutableRecord) {
  const [documentRows] = await conn.execute(
    `SELECT d.document_category, d.file_name, d.created_at, d.file_url
       FROM claim_documents d
       JOIN claims c ON c.id = d.claim_id
      WHERE d.claim_id = ? AND c.tenant_id = ?
      ORDER BY d.created_at DESC, d.id DESC`,
    [claimId, tenantId],
  ) as [MutableRecord[], unknown];
  const [auditRows] = await conn.execute(
    `SELECT l.action, l.user_role, l.user_id, l.timestamp, l.changes
       FROM insurance_audit_logs l
       JOIN claims c ON c.id = l.entity_id
      WHERE l.entity_id = ? AND l.entity_type = 'claim' AND c.tenant_id = ?
      ORDER BY l.timestamp ASC, l.id ASC`,
    [claimId, tenantId],
  ) as [MutableRecord[], unknown];

  let disputeRows: MutableRecord[] = [];
  let disputeAvailability: ForensicAvailability<true> = { state: "available", value: true, source: "claim_disputes", reason: null };
  try {
    const [rows] = await conn.execute(
      `SELECT d.id, d.dispute_reason, d.dispute_status, d.created_at, d.resolved_at, d.resolution_notes
         FROM claim_disputes d
         JOIN claims c ON c.id = d.claim_id
        WHERE d.claim_id = ? AND c.tenant_id = ?
        ORDER BY d.created_at DESC, d.id DESC`,
      [claimId, tenantId],
    ) as [MutableRecord[], unknown];
    disputeRows = rows;
  } catch (error) {
    disputeAvailability = {
      state: "source_unavailable",
      value: null,
      source: "claim_disputes",
      reason: error instanceof Error ? error.message : "Dispute history source could not be read.",
    };
  }

  let preLoss: JsonObject | null = null;
  const vehicleRegistryId = rawClaim.vehicle_registry_id;
  if (vehicleRegistryId != null) {
    const [rows] = await conn.execute(
      `SELECT vcs.snapshot_version, vcs.snapshot_date, vcs.exterior_condition, vcs.interior_condition,
              vcs.mechanical_condition, vcs.existing_damage_notes, vcs.odometer_km,
              asr.request_number, asr.valuation_date
         FROM vehicle_condition_snapshots vcs
         JOIN agency_insurance_service_requests asr ON asr.id = vcs.insurance_service_request_id
         JOIN agency_insurance_service_request_insurers asri ON asri.service_request_id = asr.id
        WHERE vcs.vehicle_registry_id = ? AND asri.insurer_tenant_id = ?
          AND asri.status IN ('invited','viewed','responded')
          AND (? IS NULL OR vcs.snapshot_date <= ?)
        ORDER BY vcs.snapshot_date DESC, vcs.id DESC LIMIT 1`,
      [vehicleRegistryId, tenantId, rawClaim.incident_date, rawClaim.incident_date],
    ) as [MutableRecord[], unknown];
    preLoss = object(rows[0]);
  }

  return { documentRows, auditRows, disputeRows, disputeAvailability, preLoss };
}

async function loadCurrentForensicRow(conn: mysql.Connection, claimId: number, tenantId: string): Promise<MutableRecord> {
  const [rows] = await conn.execute(
    `SELECT c.*,
            a.fraud_score, a.fraud_risk_level, a.recommendation, a.estimated_cost,
            a.total_loss_indicated, a.repair_to_value_ratio, a.cost_intelligence_json,
            a.repair_intelligence_json, a.fraud_score_breakdown_json, a.ife_result_json,
            a.narrative_analysis_json, a.physics_analysis, a.physics_truth_json,
            a.forensic_audit_validation_json, a.claim_quality_json, a.created_at AS assessment_date,
            a.model_version, a.enriched_photos_json, a.cross_validation_json, a.claim_truth_json,
            a.cgi_result_json, a.interpretation_result_json
       FROM claims c
       LEFT JOIN ai_assessments a ON a.claim_id = c.id AND a.tenant_id = c.tenant_id
      WHERE c.id = ? AND c.tenant_id = ?
      ORDER BY a.created_at DESC, a.id DESC LIMIT 1`,
    [claimId, tenantId],
  ) as [MutableRecord[], unknown];
  const row = rows[0];
  if (!row) throw new Error(`Claim ${claimId} not found in the current tenant scope`);
  return row;
}

export async function resolveForensicReportModel(input: Readonly<{
  claimId: number;
  tenantId: string;
  audience: Extract<ReportAudience, "forensic">;
  generatedAt?: Date;
}>): Promise<ForensicReportModel> {
  const tenantId = requireTenant(input.tenantId);
  const generatedAt = input.generatedAt ?? new Date();
  const reportRecord = await resolveReportRecord({ claimId: input.claimId, tenantId, audience: input.audience });
  const conn = await mysql.createConnection(DB_URL);
  try {
    const current = await loadCurrentForensicRow(conn, input.claimId, tenantId);
    const supporting = await loadForensicSupportingData(conn, input.claimId, tenantId, current);
    const evidenceGovernance = await loadEvidenceGovernanceReportData(conn, input.claimId, tenantId);

    const costIntel = object(parseJson(current.cost_intelligence_json));
    const repairIntel = object(parseJson(current.repair_intelligence_json));
    const fraudBreak = object(parseJson(current.fraud_score_breakdown_json));
    const ife = object(parseJson(current.ife_result_json));
    const physicsTruth = object(parseJson(current.physics_truth_json));
    const physics = object(parseJson(current.physics_analysis));
    const narrative = object(parseJson(current.narrative_analysis_json));
    const forensicAudit = object(parseJson(current.forensic_audit_validation_json));
    const claimTruth = object(parseJson(current.claim_truth_json));
    const claimQuality = object(parseJson(current.claim_quality_json));
    const crossValidation = object(parseJson(current.cross_validation_json));
    const cgi = object(parseJson(current.cgi_result_json));
    const interpretation = object(parseJson(current.interpretation_result_json));

    const quoteRows = reportRecord.evidence.quoteEvidence.map((quote) => ({
      id: quote.quoteId,
      quoted_amount: quote.quotedAmount,
      currency_code: quote.currencyCode,
      quote_type: quote.quoteType,
      parent_quote_id: quote.parentQuoteId,
      status: quote.status,
      panel_beater_name: quote.panelBeaterName,
    }));
    const costIntegrity = resolveReportCostIntegrity(costIntel, quoteRows);
    const decision = resolveReportDecisionIntegrity({
      recommendation: current.recommendation,
      workflowState: current.workflow_state,
      costIntegrity,
    });
    const photoSummary = normaliseCanonicalPhotoEvidence(reportRecord.evidence.enrichedPhotos);
    const photos: readonly ForensicPhoto[] = photoSummary.photos.map((photo) => ({
      url: string(photo.url),
      caption: string(photo.caption),
      impactZone: string(photo.impactZone),
      severity: string(photo.severity),
      usable: photo.usable,
      confidenceScore: number(photo.confidenceScore),
      componentCount: number(photo.componentCount),
      directionContradiction: photo.directionContradiction === true,
      semanticType: string(photo.semanticType),
      detectedComponents: strings(photo.detectedComponents),
      classificationConfidence: number(photo.classificationConfidence ?? photo.semanticConfidence),
      classifier: string(photo.classifier),
      selectionReason: string(photo.selectionReason),
      fallbackWarning: string(photo.fallbackWarning),
      suitableForCrushDepth: bool(photo.suitableForCrushDepth),
      physicsExclusionReason: string(photo.physicsExclusionReason),
      sourcePage: number(photo.sourcePage),
    }));

    const ptSpeed = object(read(object(read(physicsTruth, "speed")), "canonical"));
    const ptDeltaV = object(read(object(read(physicsTruth, "speed")), "deltaVKmh"));
    const ptEnergy = object(read(object(read(physicsTruth, "energy")), "kineticEnergyJ"));
    const ptCrush = object(read(object(read(physicsTruth, "geometry")), "crushDepth"));
    const ptEvidence = object(read(physicsTruth, "evidenceCompleteness"));
    const ptIntegrity = object(read(physicsTruth, "integrityCheck"));
    const wave3 = object(read(physicsTruth, "wave3"));
    const wave3Integrity = object(read(wave3, "integrity"));
    const wave3Uncertainty = object(read(wave3, "uncertainty"));
    const wave3Explainability = object(read(wave3, "explainability"));
    const structuralLoadPath = object(read(physicsTruth, "structuralLoadPath"));
    const speedEnsemble = object(read(physics, "speedInferenceEnsemble"));
    const geometryEvidence = object(read(physics, "geometryEvidenceBlock"));
    const vgr = object(read(physics, "vgrReconciliation"));
    const impactDirection = String(read(object(read(physics, "impactVector")), "direction") ?? read(physics, "impactDirection") ?? read(object(read(narrative, "extracted_facts")), "implied_direction") ?? "unknown").toLowerCase();
    const rawDamageZones = objects(read(physics, "damageZones"));
    const damageZones = rawDamageZones;

    const fraudScore = number(current.fraud_score);
    const linkedClaims = strings(read(forensicAudit, "linkedClaims")).length > 0
      ? strings(read(forensicAudit, "linkedClaims"))
      : strings(read(physics, "linkedClaims"));
    const impossibilityFlag = linkedClaims.length > 0 || bool(read(forensicAudit, "duplicateFlag")) === true;
    const adjustedFraud = fraudScore == null ? null : (impossibilityFlag ? Math.min(100, fraudScore + 30) : fraudScore);
    const repairRatio = number(current.repair_to_value_ratio);
    const marketValue = number(current.vehicle_market_value) == null ? null : Number(current.vehicle_market_value) / 100;
    const currency = String(read(costIntel, "currency") ?? costIntegrity.submittedQuotes[0]?.currency ?? current.currency_code ?? "USD").toUpperCase();
    const estimatedCost = number(current.estimated_cost);
    const estimatedCostMajor = estimatedCost == null ? null : estimatedCost / 100;
    const policyExcess = current.excess_amount_cents != null ? Number(current.excess_amount_cents) / 100 : number(current.policy_excess ?? current.deductible);
    const exclusions = objects(read(repairIntel, "policyExclusions"));
    const totalExclusions = exclusions.reduce((total, exclusion) => total + (number(read(exclusion, "amount")) ?? 0), 0);
    const kingaOptimised = costIntegrity.l2OptimisedCostUsd;
    // The forensic report displays submitted quotation history, whereas an L2
    // decision may use only canonical active comparison evidence.
    const quoteAmounts = costIntegrity.submittedQuotes.map((quote) => quote.amountUsd ?? 0).filter((amount) => amount > 0);
    const lowestQuote = quoteAmounts.length > 0 ? Math.min(...quoteAmounts) : null;
    const highestQuote = quoteAmounts.length > 0 ? Math.max(...quoteAmounts) : null;
    const savings = kingaOptimised !== null && lowestQuote !== null ? kingaOptimised - lowestQuote : null;
    const hasSavings = savings !== null && savings > 0 && kingaOptimised !== null && kingaOptimised > 0;
    const recommendedSettlement = kingaOptimised === null ? null : Math.max(0, kingaOptimised - totalExclusions - (policyExcess ?? 0));

    const deltaV = ptDeltaV && number(read(ptDeltaV, "value")) !== null
      ? measurement(read(ptDeltaV, "value"), "km/h", "physics_truth.speed.deltaVKmh", ptDeltaV)
      : measurement(read(physics, "deltaVKmh") ?? read(physics, "deltaV"), "km/h", "physics_analysis.legacy");
    const kineticEnergyValue = ptEnergy && number(read(ptEnergy, "value")) !== null
      ? Number(read(ptEnergy, "value")) / 1000
      : number(read(object(read(physics, "energyDistribution")), "kineticEnergyJ")) !== null
        ? Number(read(object(read(physics, "energyDistribution")), "kineticEnergyJ")) / 1000
        : number(read(physics, "kineticEnergy"));
    const kineticEnergy = measurement(kineticEnergyValue, "kJ", ptEnergy ? "physics_truth.energy.kineticEnergyJ" : "physics_analysis.legacy", ptEnergy);
    const preImpact = ptSpeed && number(read(ptSpeed, "value")) !== null
      ? measurement(read(ptSpeed, "value"), "km/h", "physics_truth.speed.canonical", ptSpeed)
      : measurement(read(physics, "estimatedSpeedKmh") ?? read(physics, "preImpactSpeed"), "km/h", "physics_analysis.legacy");
    const crushValue = ptCrush && number(read(ptCrush, "value")) !== null ? Number(read(ptCrush, "value")) * 1000 : null;
    const crushExtras = ptCrush ? { ...ptCrush, min: number(read(ptCrush, "min")) == null ? null : Number(read(ptCrush, "min")) * 1000, max: number(read(ptCrush, "max")) == null ? null : Number(read(ptCrush, "max")) * 1000 } : null;
    const crushDepth = measurement(crushValue, "mm", ptCrush ? "physics_truth.geometry.crushDepth" : null, crushExtras);
    const consensus = number(read(speedEnsemble, "consensusSpeedKmh")) ?? preImpact.value ?? deltaV.value;
    const consensusRounded = consensus == null ? null : Math.round(consensus * 10) / 10;
    const methods = objects(read(speedEnsemble, "methods"));
    const driverStated = preImpact.value;
    const discrepancy = driverStated !== null && consensusRounded !== null && consensusRounded > 0 && driverStated > consensusRounded
      ? Math.round(((driverStated - consensusRounded) / consensusRounded) * 100)
      : driverStated !== null && consensusRounded !== null ? 0 : null;
    const enrichedComponentCount = photos.reduce((total, photo) => total + (photo.componentCount ?? 0), 0);
    const totalComponents = number(read(repairIntel, "totalComponents")) ?? number(read(costIntel, "totalComponents")) ?? enrichedComponentCount;
    const severeCount = number(read(repairIntel, "severeCount")) ?? 0;
    const moderateCount = number(read(repairIntel, "moderateCount")) ?? 0;
    const minorCount = number(read(repairIntel, "minorCount")) ?? Math.max(0, totalComponents - severeCount - moderateCount);
    const severePercent = totalComponents > 0 ? Math.round((severeCount / totalComponents) * 100) : 0;
    const moderatePercent = totalComponents > 0 ? Math.round((moderateCount / totalComponents) * 100) : 0;
    const minorPercent = Math.max(0, 100 - severePercent - moderatePercent);
    const damageNarrative = deriveDamageVsNarrative(narrative, photos, impactDirection);

    const categoryBreakdown = object(read(fraudBreak, "fraudCategoryBreakdown"));
    const category = (name: string, legacyName: string): number | null => categoryBreakdown
      ? number(read(object(read(categoryBreakdown, name)), "normScore"))
      : number(read(fraudBreak, legacyName));
    const budget = (name: string, fallback: number): number => number(read(object(read(categoryBreakdown, name)), "budget")) ?? fallback;
    const validationIssues = objects(read(forensicAudit, "validationIssues"));
    const auditScore = number(read(forensicAudit, "overallScore")) ?? number(read(forensicAudit, "auditScore"));
    const auditGrade = auditScore == null ? "unknown" : auditScore >= 80 ? "High" : auditScore >= 60 ? "Medium" : "Low";
    const integrityFlags = objects(read(ptIntegrity, "flags"));
    const wave3Flags = objects(read(wave3Integrity, "flags"));
    const w3InfoCount = wave3Flags.filter((flag) => String(read(flag, "severity") ?? "").toUpperCase() === "INFO").length;
    const ctReviewTriggers = strings(read(object(read(claimTruth, "decision")), "reviewTriggers"));
    const fallbackTriggers: string[] = [];
    if (ctReviewTriggers.length === 0) {
      if ((adjustedFraud ?? 0) >= 50) fallbackTriggers.push(`fraud score ${adjustedFraud}/100 (threshold: 50)`);
      if ((number(read(physics, "damageConsistencyScore")) ?? number(read(physics, "physicsScore")) ?? number(read(physics, "anomalyScore")) ?? 0) < 70) fallbackTriggers.push("physics consistency below 70% threshold");
      if ((number(read(ife, "completenessScore")) ?? number(read(ife, "overallScore")) ?? 0) < 90) fallbackTriggers.push("data completeness below 90% threshold");
      if ((auditScore ?? 0) < 60) fallbackTriggers.push("forensic audit score below 60 threshold");
    }

    const auditStages = buildApprovalStages(forensicAudit, supporting.auditRows);
    const l2IntegrityNote = buildL2IntegrityNote(costIntegrity, currency);
    const incidentDate = reportRecord.incident.date;
    const vehicleRegistryId = current.vehicle_registry_id;
    const incidentYear = incidentDate ? new Date(String(incidentDate)).getFullYear() : null;
    const vehicleYear = reportRecord.vehicle.year;
    const documentReference = buildDocumentReference(reportRecord.scope.claimReference, reportRecord.claim.createdAt, input.claimId);
    const rawDocuments = supporting.documentRows.map((row) => object(row)!).filter(Boolean);
    const docCompleteness = object(read(ife, "documentCompleteness")) ?? {};
    const coveredZones = new Set(photos.map((photo) => photo.impactZone?.toLowerCase()).filter((zone): zone is string => Boolean(zone)));

    const model: ForensicReportModel = {
      contractVersion: "1",
      provenance: {
        generatedAt,
        selectedAssessmentId: reportRecord.assessment.assessmentId,
        selectedAssessmentCreatedAt: reportRecord.assessment.createdAt,
        selectedAssessmentModelVersion: reportRecord.assessment.modelVersion,
        assessmentSelection: reportRecord.assessment.assessmentId === null ? "no_assessment" : "latest_created_at_then_id",
      },
      scope: { tenantId, claimId: input.claimId, audience: input.audience },
      reportRecord,
      availability: {
        assessment: reportRecord.assessment.assessmentId === null
          ? { state: "not_produced", value: null, source: "ai_assessments", reason: "No assessment exists for the resolved claim." }
          : { state: "available", value: true, source: "ai_assessments", reason: null },
        quotes: { state: "available", value: true, source: "panel_beater_quotes", reason: null },
        documents: { state: "available", value: true, source: "claim_documents", reason: null },
        auditTrail: { state: "available", value: true, source: "insurance_audit_logs", reason: null },
        disputes: supporting.disputeAvailability,
        preLossCondition: vehicleRegistryId == null
          ? { state: "not_applicable", value: null, source: "vehicle_condition_snapshots", reason: "Claim has no vehicle registry reference." }
          : supporting.preLoss
            ? { state: "available", value: true, source: "vehicle_condition_snapshots", reason: null }
            : { state: "not_produced", value: null, source: "vehicle_condition_snapshots", reason: "No qualifying pre-loss snapshot was found." },
        evidenceGovernance: { state: "available", value: true, source: "evidence_governance", reason: null },
      },
      identity: {
        claimReference: reportRecord.scope.claimReference,
        documentReference,
        kingaReference: string(current.kinga_reference),
        generatedDate: generatedAt,
      },
      executive: {
        decision,
        costVerdict: string(current.cost_verdict) ?? string(read(object(read(claimTruth, "costBasis")), "costVerdict")),
        reviewTriggers: ctReviewTriggers.length > 0 ? ctReviewTriggers : fallbackTriggers,
        reviewTriggerSource: ctReviewTriggers.length > 0 ? "claim_truth" : fallbackTriggers.length > 0 ? "legacy_derived" : "unavailable",
        fraud: { value: fraudScore, outOf: 100, band: fraudBand(fraudScore), source: "ai_assessments.fraud_score" },
        fraudScoreAdjusted: adjustedFraud,
        physicsConsistency: { value: number(read(physics, "damageConsistencyScore")) ?? number(read(physics, "physicsScore")) ?? number(read(physics, "anomalyScore")), outOf: 100, band: confidenceBand(number(read(physics, "damageConsistencyScore")) ?? number(read(physics, "physicsScore")) ?? number(read(physics, "anomalyScore"))), source: "physics_analysis" },
        forensicAudit: { value: auditScore, outOf: 100, band: confidenceBand(auditScore), source: "forensic_audit_validation_json" },
        dataCompleteness: { value: number(read(ife, "completenessScore")) ?? number(read(ife, "overallScore")), outOf: 100, band: confidenceBand(number(read(ife, "completenessScore")) ?? number(read(ife, "overallScore"))), source: "ife_result_json" },
        claimQuality: { value: number(read(claimQuality, "overallScore")) ?? auditScore, outOf: 100, band: confidenceBand(number(read(claimQuality, "overallScore")) ?? auditScore), source: claimQuality ? "claim_quality_json" : "forensic_audit_validation_json" },
        marketValue,
        repairToValueRatioPercent: repairRatio,
        currency,
        costIntegrity,
        physicsSnapshot: {
          campbellSpeed: object(read(wave3Uncertainty, "campbellSpeed")),
          kineticEnergy: object(read(wave3Uncertainty, "kineticEnergy")),
          deltaV: object(read(wave3Uncertainty, "deltaV")),
          deformationEfficiency: object(read(wave3Uncertainty, "deformationEfficiency")),
          uncertaintyGrade: string(read(wave3Uncertainty, "overallGrade")),
          uncertaintySummary: string(read(wave3Uncertainty, "summary")),
          verdictParagraph: string(read(wave3Explainability, "verdictParagraph")),
          integrityScore: number(read(wave3Integrity, "integrityScore")),
          integrityClean: bool(read(wave3Integrity, "clean")),
          criticalCount: number(read(wave3Integrity, "criticalCount")),
          warningCount: number(read(wave3Integrity, "warningCount")),
          infoCount: w3InfoCount,
          totalFlagCount: (number(read(wave3Integrity, "criticalCount")) ?? 0) + (number(read(wave3Integrity, "warningCount")) ?? 0) + w3InfoCount,
        },
      },
      claimAndVehicle: {
        claimantName: string(current.lodger_name) ?? string(current.claimant_name),
        insurerName: string(current.insurer_name) ?? string(current.tenant_name),
        policyNumber: string(current.policy_number),
        policyExcess,
        incidentDate,
        incidentType: string(current.incident_type),
        vehicleDescription: reportRecord.vehicle.description,
        vehicleRegistration: string(current.vehicle_registration) ?? string(current.registration_number),
        vehicleVin: string(current.vin) ?? string(current.vehicle_vin),
        vehicleOdometer: current.odometer ?? current.vehicle_odometer ?? null,
        vehicleYear,
        dateAnomaly: { present: vehicleYear != null && incidentYear != null && incidentYear < vehicleYear, incidentYear, vehicleYear },
        driverName: string(current.driver_name) ?? string(current.lodger_name),
        driverLicence: string(current.driver_licence) ?? string(current.licence_number),
        assessorName: string(current.assessor_name),
        repairerName: costIntegrity.submittedQuotes[0]?.repairer ?? null,
        policeCaseNumber: string(current.police_case_number) ?? string(current.police_reference),
        policeStatus: string(current.police_status),
        preLossCondition: availability(supporting.preLoss, "vehicle_condition_snapshots", "No qualifying pre-loss snapshot was found."),
      },
      narrative: {
        reconstructedSequence: string(read(narrative, "reasoning_summary")) ?? string(read(narrative, "summary")) ?? string(read(narrative, "narrativeText")) ?? string(current.incident_description),
        narrativeFlag: string(read(narrative, "consistency_verdict")) ?? string(read(narrative, "flag")) ?? string(read(narrative, "consistencyNote")),
        physicsVsNarrative: string(read(object(read(narrative, "cross_validation")), "physics_verdict")) ?? string(read(narrative, "physicsConsistency")) ?? "Not assessed",
        damageVsNarrative: damageNarrative.value,
        damageVsNarrativeSource: damageNarrative.source,
        crossEngineAgreement: number(read(narrative, "crossEngineAgreement")),
        policeAlignment: object(read(narrative, "stakeholder_analysis"))
          ? bool(read(object(read(narrative, "stakeholder_analysis")), "claimant_charged")) ? "Charged at scene" : bool(read(object(read(narrative, "stakeholder_analysis")), "under_investigation")) ? "Under investigation" : "Not charged"
          : "Not assessed",
        crossValidationNote: string(read(narrative, "crossValidationNote")),
        impactDirection,
      },
      technical: {
        deltaV,
        kineticEnergy,
        impactForce: measurement(read(physics, "impactForceKn") ?? read(physics, "impactForce"), "kN", "physics_analysis"),
        vehicleMass: measurement(read(physics, "vehicleMass"), "kg", "physics_analysis"),
        deceleration: measurement(read(physics, "decelerationG") ?? read(physics, "deceleration"), "g", "physics_analysis"),
        crushDepth,
        impactSeverity: string(read(physics, "accidentSeverity")) ?? string(read(physics, "ebsSeverity")),
        dataQualityScore: number(read(ptEvidence, "dataQualityScore")),
        constraints: objects(read(physics, "constraints")).length > 0 ? objects(read(physics, "constraints")) : objects(read(physics, "physicsConstraints")),
        speed: {
          consensus,
          consensusRounded,
          driverStated,
          discrepancyPercent: discrepancy,
          overallConfidence: string(read(speedEnsemble, "overallConfidence")),
          methods,
          methodsRan: methods.filter((method) => bool(read(method, "ran")) === true && (number(read(method, "speedKmh")) ?? 0) > 0).length,
          methodsTotal: methods.length,
        },
        impactMap: {
          direction: impactDirection,
          damageZones,
          frontZone: damageZones.find((zone) => String(read(zone, "zone") ?? "").toLowerCase().includes("front")) ?? null,
          rearZone: damageZones.find((zone) => String(read(zone, "zone") ?? "").toLowerCase().includes("rear")) ?? null,
          underbodyAffected: damageZones.some((zone) => String(read(zone, "zone") ?? "").toLowerCase().includes("under")),
        },
        damageSeverity: { totalComponents, severeCount, moderateCount, minorCount, severePercent, moderatePercent, minorPercent, summary: string(read(repairIntel, "damageSummary")) },
        causation: availability(
          string(read(physicsTruth, "impactCausation")) ? {
            classification: String(read(physicsTruth, "impactCausation")),
            speedCeilingKmh: number(read(physicsTruth, "causationSpeedCeilingKmh")),
            speedCeilingBreached: bool(read(physicsTruth, "causationSpeedExceedsCeiling")) === true,
            reversingNarrativeContradiction: bool(read(physicsTruth, "reversingNarrativeContradiction")) === true,
            brakingDistanceMetres: number(read(physicsTruth, "brakingDistanceM")),
            brakingFrictionCoefficient: number(read(physicsTruth, "brakingFrictionCoefficient")),
          } : null,
          "physics_truth_json",
          "Impact causation was not applicable or was not produced.",
        ),
        threeWaySpeedComparison: availability(object(read(crossValidation, "threeWaySpeedComparison")), "cross_validation_json", "Three-way comparison was not produced."),
        evidenceQuality: availability(ptEvidence, "physics_truth_json", "Physics Truth evidence-quality data was not produced."),
        integrityFlags,
        geometryCalibration: availability(geometryEvidence, "physics_analysis.geometryEvidenceBlock", "Geometry calibration was not produced."),
        crossImageReconciliation: availability(vgr, "physics_analysis.vgrReconciliation", "Cross-image reconciliation was not produced."),
      },
      structural: {
        loadPath: availability(structuralLoadPath ? {
          penetratedComponents: objects(read(structuralLoadPath, "penetratedComponents")),
          latentDamageProbability: object(read(structuralLoadPath, "latentDamageProbability")),
          integrityRisk: string(read(structuralLoadPath, "structuralIntegrityRisk")),
          confidence: number(read(structuralLoadPath, "confidence")),
          warnings: strings(read(structuralLoadPath, "warnings")),
        } : null, "physics_truth_json.structuralLoadPath", "Structural load-path evidence was not produced."),
        vehicleProfile: {
          ancapRating: string(read(physics, "ancapRating")) ?? string(read(repairIntel, "ancapRating")),
          vehicleClass: string(read(physics, "vehicleClass")) ?? string(read(repairIntel, "vehicleClass")),
          adultOccupantScore: string(read(physics, "adultOccupantScore")),
          childOccupantScore: string(read(physics, "childOccupantScore")),
          crash3StiffnessA: string(read(physics, "crash3StiffnessA")),
          crash3StiffnessB: string(read(physics, "crash3StiffnessB")),
          typicalMassRange: string(read(physics, "typicalMassRange")),
          safetyRisk: string(read(physics, "safetyRisk")),
          notes: string(read(physics, "vehicleNotes")) ?? string(read(repairIntel, "vehicleNotes")),
        },
        physicsEvidenceChain: availability(wave3, "physics_truth_json.wave3", "Wave 3 explainability evidence was not produced."),
      },
      financial: {
        quotes: quoteRows.map((quote) => object(quote)!),
        lowestQuote,
        highestQuote,
        kingaOptimised,
        l2EvidenceQualifiedComparison: costIntegrity.l2EvidenceQualifiedComparisonUsd,
        l2Status: costIntegrity.l2Status,
        l2IntegrityNote,
        savings,
        savingsPercent: hasSavings && savings !== null && lowestQuote !== null ? Math.max(0, (savings / lowestQuote) * 100) : null,
        hasSavings,
        policyExcess,
        exclusions,
        totalExclusions,
        recommendedSettlement,
      },
      reconciliation: {
        matchedComponents: number(read(costIntel, "matchedComponents")) ?? number(read(repairIntel, "matchedComponents")) ?? 0,
        missingFromQuote: number(read(costIntel, "missingFromQuote")) ?? number(read(repairIntel, "missingFromQuote")) ?? 0,
        extraInQuote: number(read(costIntel, "extraInQuote")) ?? number(read(repairIntel, "extraInQuote")) ?? 0,
        structuralGaps: objects(read(repairIntel, "structuralGaps")).length > 0 ? objects(read(repairIntel, "structuralGaps")) : objects(read(costIntel, "missingComponents")),
        criticalStructuralGaps: (objects(read(repairIntel, "structuralGaps")).length > 0 ? objects(read(repairIntel, "structuralGaps")) : objects(read(costIntel, "missingComponents"))).filter((gap) => {
          const severity = String(read(gap, "severity") ?? "").toLowerCase();
          return severity.includes("critical") || severity.includes("structural");
        }),
        copyQuotation: object(read(fraudBreak, "quoteSimilarity")),
        note: string(read(repairIntel, "reconciliationNote")) ?? string(read(costIntel, "reconciliationNote")),
      },
      evidence: {
        documents: rawDocuments,
        documentCompleteness: docCompleteness,
        coverageGapNote: string(read(ife, "coverageGapNote")),
        photos,
        totalPhotos: photoSummary.totalPhotos,
        usablePhotos: photoSummary.usablePhotos,
        uniqueComponents: number(read(ife, "uniqueComponents")) ?? 0,
        zonesCovered: coveredZones.size > 0 ? coveredZones.size : number(read(ife, "zonesCovered")) ?? (photoSummary.totalPhotos > 0 ? 1 : 0),
        zonesTotal: 4,
        safetySystemActivation: string(read(ife, "safetySystemActivation")),
        damageZoneCoverage: damageZones.map((zone) => {
          const zoneName = String(read(zone, "zone") ?? "");
          const photographed = photos.some((photo) => photo.impactZone?.toLowerCase().includes(zoneName.toLowerCase().split(" ")[0] ?? ""));
          return { zone: zoneName, severity: String(read(zone, "severity") ?? ""), photographed, note: photographed ? null : "Damage classified without photographic corroboration." };
        }),
        evidenceGovernance,
      },
      risk: {
        categoryBreakdown: availability(categoryBreakdown, "fraud_score_breakdown_json.fraudCategoryBreakdown", "Category-level fraud scores were not produced."),
        categoryScores: {
          physical: category("physical_consistency", "damageInconsistency"),
          scenario: category("scenario_intelligence", "directionMismatch"),
          financial: category("financial_anomaly", "costDeviation"),
          documentation: category("documentation_integrity", "missingData"),
          entity: category("entity_intelligence", "repeatClaim"),
          photo: category("photo_forensics", "severityVsPhysics"),
        },
        categoryBudgets: { physical: budget("physical_consistency", 28), scenario: budget("scenario_intelligence", 22), financial: budget("financial_anomaly", 20), documentation: budget("documentation_integrity", 15), entity: budget("entity_intelligence", 10), photo: budget("photo_forensics", 5) },
        linkedClaims,
        impossibilityFlag,
        riskSummary: string(read(forensicAudit, "riskSummary")),
        dateDelta: string(read(forensicAudit, "dateDelta")),
      },
      contactGeometry: availability(cgi, "cgi_result_json", "Contact Geometry Intelligence was not produced."),
      interpretation: availability(interpretation, "interpretation_result_json", "Interpretation Engine output was not produced."),
      validation: {
        issues: validationIssues,
        highIssues: validationIssues.filter((issue) => String(read(issue, "severity") ?? "").toLowerCase() === "high"),
        validationChecks: objects(read(forensicAudit, "validationChecks")),
        nextSteps: strings(read(forensicAudit, "nextSteps")),
      },
      disputes: supporting.disputeRows.map((row) => object(row)!).filter(Boolean),
      approval: auditStages,
    };
    return deepFreeze(model);
  } finally {
    await conn.end();
  }
}

function buildDocumentReference(claimReference: string | null, createdAt: Date | string | null, claimId: number): string {
  if (claimReference?.startsWith("DOC-")) return claimReference;
  const submittedAt = createdAt ? new Date(String(createdAt)) : new Date();
  const datePart = Number.isNaN(submittedAt.getTime())
    ? new Date().toISOString().slice(0, 10).replace(/-/g, "")
    : submittedAt.toISOString().slice(0, 10).replace(/-/g, "");
  const referencePart = String(claimReference ?? claimId).replace(/[^A-Z0-9]/gi, "").slice(0, 8).toUpperCase();
  return `DOC-${datePart}-${referencePart}`;
}

function buildL2IntegrityNote(costIntegrity: ReportCostIntegrity, currency: string): string {
  if (costIntegrity.l2OptimisedCostUsd !== null) return `All-in payable repair-cost basis${costIntegrity.costBasis ? ` (${costIntegrity.costBasis.replaceAll("_", " ")})` : ""}.`;
  if (costIntegrity.l2EvidenceQualifiedComparisonUsd !== null) return `Evidence-qualified submitted-price comparison is available in ${currency}; complete source reconciliation remains required before a settlement recommendation.`;
  if (costIntegrity.l2Status === "reconciliation_required") return "Itemised submitted-price comparison is available, but quote headers do not reconcile to explicit submitted line totals.";
  return "L2 repair scope is incomplete; no savings or settlement recommendation is available.";
}

function buildApprovalStages(forensicAudit: JsonObject | null, auditRows: readonly MutableRecord[]): ForensicReportModel["approval"] {
  const supplied = objects(read(forensicAudit, "approvalWorkflow"));
  const findAudit = (keywords: readonly string[]) => auditRows.find((event) => keywords.some((keyword) => String(event.action ?? "").toLowerCase().includes(keyword)));
  const stages = supplied.length > 0 ? supplied : [
    stageFromAudit(1, "Claims Processor Review", findAudit(["claim_reviewed", "claim_processed", "claim_submitted", "claim_created"])),
    stageFromAudit(2, "Internal Assessor Assessment", findAudit(["claim_assessed", "assessment_complete", "assigned_to_assessor"])),
    stageFromAudit(3, "Risk Manager Sign-off", findAudit(["risk_signoff", "risk_approved", "risk_review"])),
    stageFromAudit(4, "Claims Manager Approval", findAudit(["claim_approved", "claim_rejected", "manager_approved", "claims_manager"])),
    stageFromAudit(5, "Executive / GM Sign-off", findAudit(["executive_approved", "gm_approved", "exec_signoff"])),
  ];
  const completed = stages.filter((stage) => String(read(stage, "status") ?? "").toLowerCase() === "complete").length;
  return { stages, completedStages: completed, requiredStages: stages.filter((stage) => (number(read(stage, "stage")) ?? 0) <= 4).length, source: supplied.length > 0 ? "forensic_audit" : "audit_log_derivation" };
}

function stageFromAudit(stage: number, role: string, event: MutableRecord | undefined): JsonObject {
  return {
    stage,
    role,
    status: event ? "Complete" : stage === 1 ? "Awaiting" : "Pending",
    officer: event ? String(event.user_role ?? "—") : null,
    date: event?.timestamp ? new Date(String(event.timestamp)).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : null,
  };
}
