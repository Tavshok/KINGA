/**
 * KINGA — ClaimRecordBridge
 *
 * ARCHITECTURAL PURPOSE
 * ─────────────────────
 * The pipeline writes authoritative, richly-structured data to `claim_record_json`
 * (and related JSON columns). Historically, the report generator and enforcement
 * engine read from flat DB columns that are populated by a separate, incomplete
 * code path — creating a "split-brain" data source problem where the same field
 * could show different values depending on which consumer read it.
 *
 * This module is the SINGLE point of truth resolution. Every downstream consumer
 * (getEnforcement, getAssessment, report generator, UI) MUST call `resolveClaimRecord`
 * to obtain a `ResolvedClaimRecord` before accessing any field. The resolver always
 * prefers `claim_record_json` over flat DB columns, and flat DB columns over defaults.
 *
 * RESOLUTION PRIORITY (highest → lowest)
 * 1. `claim_record_json` (pipeline output, richest, most accurate)
 * 2. Dedicated JSON columns (physics_analysis, fraud_score_breakdown_json, etc.)
 * 3. Flat DB columns (legacy, may be null/stale for newer incident types)
 * 4. Typed defaults (never null/undefined in the resolved object)
 *
 * ADDING NEW FIELDS
 * ─────────────────
 * 1. Add the field to `ResolvedClaimRecord` with its type.
 * 2. Add resolution logic in `resolveClaimRecord` following the priority order above.
 * 3. Update `syncResolvedToDb` to write the field back to the DB flat column if one exists.
 * 4. Never add ad-hoc `?? null` chains in routers.ts — put them here instead.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type CanonicalIncidentType =
  | "collision"
  | "animal_strike"
  | "theft"
  | "vandalism"
  | "flood"
  | "fire"
  | "hail"
  | "rollover"
  | "mechanical_failure"
  | "hijacking"
  // Granular collision sub-types from incidentClassificationEngine
  | "rear_end"
  | "vehicle_collision"
  | "head_on"
  | "sideswipe"
  | "single_vehicle"
  | "pedestrian_strike"
  | "unknown";

export interface ResolvedClaimRecord {
  // ── Incident ──────────────────────────────────────────────────────────────
  incidentType: CanonicalIncidentType;
  incidentTypeConfidence: number;           // 0–100
  incidentDescription: string | null;
  accidentDate: string | null;
  accidentLocation: string | null;
  collisionDirection: string;
  estimatedSpeedKmh: number;                // 0 if unknown
  animalType: string | null;                // only for animal_strike

  // ── Vehicle ───────────────────────────────────────────────────────────────
  vehicleMake: string | null;
  vehicleModel: string | null;
  vehicleYear: number | null;
  vehicleRegistration: string | null;
  vehicleMassKg: number;                    // 1600 default

  // ── Insurance ─────────────────────────────────────────────────────────────
  policyNumber: string | null;              // null if "EXCESS" or product type
  excessAmountUsd: number | null;           // null if not a real excess value
  insurer: string | null;
  productType: string | null;               // e.g. "EXCESS", "COMPREHENSIVE"

  // ── Damage ────────────────────────────────────────────────────────────────
  damagedComponents: string[];
  structuralDamageSeverity: string;
  airbagDeployed: boolean;

  // ── Cost ──────────────────────────────────────────────────────────────────
  estimatedCostUsd: number;                 // whole dollars
  quotedAmountUsd: number | null;
  currencyCode: string;                     // "USD", "ZAR", "ZIG", etc.

  // ── Fraud ─────────────────────────────────────────────────────────────────
  fraudScore: number;                       // 0–100, pipeline Stage 8 score
  fraudRiskLevel: string;                   // "low" | "medium" | "high" | "critical"
  fraudIndicators: Array<{ indicator: string; score: number; description?: string }>;

  // ── Physics ───────────────────────────────────────────────────────────────
  physicsConsistencyScore: number;          // 0–100
  deltaVKmh: number;
  impactForceKn: number;
  energyKj: number;
  impactDirection: string;

  // ── Data Quality ──────────────────────────────────────────────────────────
  dataCompletenessScore: number;            // 0–100, from claimRecord.dataQuality
  missingFields: string[];
  assumptions: Array<{ field: string; assumedValue: unknown; reason: string }>;

  // ── Photos ────────────────────────────────────────────────────────────────
  photosDetected: boolean;                  // true if photos exist in source document
  photosIngested: boolean;                  // true if photos were successfully processed
  photosIngestionFailed: boolean;           // true if detected but not ingested
  photoUrls: string[];

  // ── Narrative ─────────────────────────────────────────────────────────────
  narrativeAnalysis: Record<string, unknown> | null;
  impliedSpeedKmh: number | null;           // from narrative engine

  // ── Police ────────────────────────────────────────────────────────────────
  policeReportNumber: string | null;

  // ── Speed Inference Ensemble ───────────────────────────────────────────
  /** Multi-method speed inference result from Stage 7. Null for pre-feature claims. */
  speedInferenceEnsemble: {
    consensusKmh: number;
    confidenceLevel: string;
    methodCount: number;
    divergenceFlag: boolean;
    methods: Array<{
      id: string;
      name: string;
      estimateKmh: number | null;
      confidenceWeight: number;
      available: boolean;
      note?: string;
    }>;
    crossValidation: {
      spread: number;
      outlierMethods: string[];
      recommendation: string;
    };
  } | null;
}

// ─── Resolution Logic ─────────────────────────────────────────────────────────

const VALID_INCIDENT_TYPES = new Set<CanonicalIncidentType>([
  "collision", "animal_strike", "theft", "vandalism",
  "flood", "fire", "hail", "rollover", "mechanical_failure", "hijacking",
  // Granular collision sub-types
  "rear_end", "vehicle_collision", "head_on", "sideswipe", "single_vehicle", "pedestrian_strike",
  "unknown",
]);

/** Map legacy DB enum values and aliases to canonical types */
const DB_INCIDENT_TYPE_MAP: Record<string, CanonicalIncidentType> = {
  collision: "collision",
  theft: "theft",
  vandalism: "vandalism",
  flood: "flood",
  fire: "fire",
  hijacking: "hijacking",
  animal_strike: "animal_strike",
  hail: "hail",
  rollover: "rollover",
  mechanical_failure: "mechanical_failure",
  // Granular collision sub-types from incidentClassificationEngine
  rear_end: "rear_end",
  vehicle_collision: "vehicle_collision",
  head_on: "head_on",
  sideswipe: "sideswipe",
  single_vehicle: "single_vehicle",
  pedestrian_strike: "pedestrian_strike",
  // Legacy / user-submitted aliases
  other: "collision",
  accident: "collision",
  storm: "collision",  // storm is not a canonical type; map to collision
  weather: "flood",
};

function toCanonical(raw: string | null | undefined): CanonicalIncidentType {
  if (!raw) return "unknown";
  const lower = raw.toLowerCase().replace(/[- ]/g, "_");
  return VALID_INCIDENT_TYPES.has(lower as CanonicalIncidentType)
    ? (lower as CanonicalIncidentType)
    : (DB_INCIDENT_TYPE_MAP[lower] ?? "unknown");
}

/**
 * Resolve a fully-typed `ResolvedClaimRecord` from a raw assessment DB row.
 *
 * @param assessment  Raw row from `getAiAssessmentByClaimId` (any shape)
 * @returns           Fully resolved, never-null record
 */
export function resolveClaimRecord(assessment: Record<string, unknown>): ResolvedClaimRecord {
  // ── Parse JSON columns ──────────────────────────────────────────────────
  const cr = parseJson(assessment.claimRecordJson) ?? parseJson(assessment.claim_record_json);
  const physicsRaw = parseJson(assessment.physicsAnalysis) ?? parseJson(assessment.physics_analysis);
  const fraudBd = parseJson(assessment.fraudScoreBreakdownJson) ?? parseJson(assessment.fraud_score_breakdown_json);
  const narrativeRaw = parseJson(assessment.narrativeAnalysisJson) ?? parseJson(assessment.narrative_analysis_json)
    ?? cr?.accidentDetails?.narrativeAnalysis ?? null;

  // ── Incident Type ────────────────────────────────────────────────────────
  // Priority: claimRecord → DB column (mapped) → "unknown"
  const crIncidentType = toCanonical(cr?.accidentDetails?.incidentType);
  const dbIncidentType = toCanonical(assessment.incidentType as string);
  const incidentType: CanonicalIncidentType =
    crIncidentType !== "unknown" ? crIncidentType :
    dbIncidentType !== "unknown" ? dbIncidentType :
    "unknown";
  const incidentTypeConfidence: number =
    cr?.accidentDetails?.incidentClassification?.confidence ?? 50;

  // ── Policy / Insurance ───────────────────────────────────────────────────
  // If policyNumber looks like a product type (EXCESS, COMPREHENSIVE, etc.) treat it as productType
  const rawPolicyNumber = cr?.insuranceContext?.policyNumber
    ?? (assessment.policyNumber as string)
    ?? null;
  const PRODUCT_TYPE_KEYWORDS = ["EXCESS", "COMPREHENSIVE", "THIRD PARTY", "FIRE", "THEFT"];
  const isProductType = rawPolicyNumber
    ? PRODUCT_TYPE_KEYWORDS.some(k => rawPolicyNumber.toUpperCase().includes(k))
    : false;
  const policyNumber = isProductType ? null : rawPolicyNumber;
  const productType = isProductType ? rawPolicyNumber : (cr?.insuranceContext?.productType ?? null);

  // Excess: only trust if it differs from the repair cost (common LLM confusion)
  const rawExcess = cr?.insuranceContext?.excessAmountUsd ?? null;
  const rawRepairCost = cr?.costAnalysis?.documentedAgreedCostUsd ?? (assessment.estimatedCost as number) ?? null;
  const excessAmountUsd = (rawExcess !== null && rawRepairCost !== null && Math.abs(rawExcess - rawRepairCost) < 1)
    ? null  // Same value → LLM confused excess with repair cost
    : rawExcess;

  // ── Data Quality ─────────────────────────────────────────────────────────
  // Priority: claimRecord.dataQuality.completenessScore → DB column → 0
  const dataCompletenessScore: number =
    cr?.dataQuality?.completenessScore
    ?? (assessment.dataCompletenessScore as number)
    ?? (assessment.confidence_score as number)
    ?? 0;
  const missingFields: string[] = cr?.dataQuality?.missingFields ?? [];
  const assumptions: Array<{ field: string; assumedValue: unknown; reason: string }> =
    cr?.assumptions ?? [];

  // ── Photos ───────────────────────────────────────────────────────────────
  // photos_not_ingested indicator = photos were detected but ingestion failed
  const indicators: Array<{ indicator: string; score: number; description?: string }> =
    Array.isArray(fraudBd?.indicators) ? fraudBd.indicators : [];
  const photosIngestionFailed = indicators.some(i => i?.indicator === "photos_not_ingested");
  const photoUrls: string[] = (() => {
    const raw = parseJson(assessment.damagePhotosJson) ?? parseJson(assessment.damage_photos_json);
    return Array.isArray(raw) ? raw.filter((u: unknown) => typeof u === "string") : [];
  })();
  const photosIngested = photoUrls.length > 0;
  const photosDetected = photosIngested || photosIngestionFailed;

  // ── Physics ──────────────────────────────────────────────────────────────
  const physNum = physicsRaw?.physicsNumerical ?? null;
  const velRange = physicsRaw?.velocityRange ?? physNum?.velocity_range ?? null;
  const estimatedSpeedKmh: number =
    (cr?.accidentDetails?.estimatedSpeedKmh ?? 0) > 0
      ? cr.accidentDetails.estimatedSpeedKmh
      : (physicsRaw?.estimatedSpeedKmh ?? physicsRaw?.estimatedSpeed?.value ?? 0) > 0
        ? (physicsRaw?.estimatedSpeedKmh ?? physicsRaw?.estimatedSpeed?.value)
        : (velRange?.mid_kmh ?? physNum?.velocity_range?.mid_kmh ?? 0);

  // ── Fraud ────────────────────────────────────────────────────────────────
  // Priority: pipeline Stage 8 score (assessment.fraudScore) → breakdown overallScore → 0
  const fraudScore: number =
    (assessment.fraudScore as number)
    ?? (fraudBd?.overallScore as number)
    ?? 0;
  const fraudRiskLevel: string =
    (assessment.fraudRiskLevel as string)
    ?? (fraudBd?.level as string)
    ?? "low";
  const fraudIndicators = indicators.map(i => ({
    indicator: i.indicator ?? "unknown",
    score: Number(i.score ?? 0),
    description: i.description,
  }));

  // ── Narrative ────────────────────────────────────────────────────────────
  const impliedSpeedKmh: number | null =
    narrativeRaw?.extracted_facts?.implied_speed_kmh ?? null;

  // ── Build result ─────────────────────────────────────────────────────────
  return {
    incidentType,
    incidentTypeConfidence,
    incidentDescription: cr?.accidentDetails?.description
      ?? (assessment.incidentDescription as string)
      ?? (assessment.accidentDescription as string)
      ?? null,
    accidentDate: cr?.accidentDetails?.date ?? (assessment.accidentDate as string) ?? null,
    accidentLocation: cr?.accidentDetails?.location ?? (assessment.accidentLocation as string) ?? null,
    collisionDirection: cr?.accidentDetails?.collisionDirection
      ?? physicsRaw?.impactVector?.direction
      ?? physicsRaw?.impactDirection
      ?? "unknown",
    estimatedSpeedKmh,
    animalType: cr?.accidentDetails?.animalType ?? null,

    vehicleMake: cr?.vehicle?.make ?? (assessment.vehicleMake as string) ?? null,
    vehicleModel: cr?.vehicle?.model ?? (assessment.vehicleModel as string) ?? null,
    vehicleYear: cr?.vehicle?.year ?? (assessment.vehicleYear as number) ?? null,
    vehicleRegistration: cr?.vehicle?.registration ?? (assessment.vehicleRegistration as string) ?? null,
    vehicleMassKg: cr?.vehicle?.massKg ?? physicsRaw?.vehicleMassKg ?? physNum?.estimation_detail?.mass_kg ?? 1600,

    policyNumber,
    excessAmountUsd,
    insurer: cr?.insuranceContext?.insurer ?? (assessment.insurer as string) ?? null,
    productType,

    damagedComponents: (() => {
      const raw = parseJson(assessment.damagedComponentsJson) ?? parseJson(assessment.damaged_components_json);
      if (Array.isArray(raw)) return raw.map((c: unknown) => typeof c === "string" ? c : (c as any)?.name ?? "").filter(Boolean);
      return cr?.damage?.components?.map((c: any) => c?.name ?? c) ?? [];
    })(),
    structuralDamageSeverity: (assessment.structuralDamageSeverity as string)
      ?? physicsRaw?.accidentSeverity
      ?? "minor",
    airbagDeployed: cr?.accidentDetails?.airbagDeployment ?? false,

    estimatedCostUsd: Number(assessment.estimatedCost ?? 0),
    quotedAmountUsd: null, // populated by caller from quotes table
    currencyCode: cr?.costAnalysis?.currency
      ?? (assessment.currencyCode as string)
      ?? "USD",

    fraudScore,
    fraudRiskLevel,
    fraudIndicators,

    physicsConsistencyScore: physicsRaw?.damageConsistencyScore ?? 50,
    deltaVKmh: (physicsRaw?.deltaVKmh ?? physicsRaw?.deltaV ?? 0) > 0
      ? (physicsRaw?.deltaVKmh ?? physicsRaw?.deltaV)
      : (physNum?.delta_v ?? 0),
    impactForceKn: (physicsRaw?.impactForceKn ?? 0) > 0
      ? physicsRaw.impactForceKn
      : (physNum?.impact_force_kn ?? 0),
    energyKj: (physicsRaw?.energyDistribution?.energyDissipatedKj ?? 0) > 0
      ? physicsRaw.energyDistribution.energyDissipatedKj
      : (physNum?.energy_kj ?? 0),
    impactDirection: physicsRaw?.impactVector?.direction ?? physicsRaw?.impactDirection ?? "unknown",

    dataCompletenessScore,
    missingFields,
    assumptions,

    photosDetected,
    photosIngested,
    photosIngestionFailed,
    photoUrls,

    narrativeAnalysis: narrativeRaw,
    impliedSpeedKmh,

    policeReportNumber: cr?.insuranceContext?.policeReportNumber
      ?? (assessment.policeReportNumber as string)
      ?? null,
    speedInferenceEnsemble: physicsRaw?.speedInferenceEnsemble ?? null,
  };
}

/**
 * Sync resolved fields back to the flat DB columns so the DB stays consistent
 * with the JSON. Call this at the end of every pipeline run.
 *
 * Returns a partial update object ready to be passed to `db.update(claims).set(...)`.
 */
export function buildClaimSyncUpdate(resolved: ResolvedClaimRecord): Record<string, unknown> {
  const update: Record<string, unknown> = {};

  // Map canonical incident type → DB enum (all types now supported)
  const CANONICAL_TO_DB: Record<CanonicalIncidentType, string | null> = {
    collision: "collision",
    animal_strike: "animal_strike",
    theft: "theft",
    vandalism: "vandalism",
    flood: "flood",
    fire: "fire",
    hail: "hail",
    rollover: "rollover",
    mechanical_failure: "mechanical_failure",
    hijacking: "hijacking",
    // Granular sub-types → map to "collision" in DB (DB enum doesn't have sub-types)
    rear_end: "collision",
    vehicle_collision: "collision",
    head_on: "collision",
    sideswipe: "collision",
    single_vehicle: "collision",
    pedestrian_strike: "collision",
    unknown: null,
  };

  const dbIncidentType = CANONICAL_TO_DB[resolved.incidentType];
  if (dbIncidentType) update.incidentType = dbIncidentType;
  if (resolved.incidentDescription) update.incidentDescription = resolved.incidentDescription;
  if (resolved.accidentDate) update.incidentDate = resolved.accidentDate;
  if (resolved.vehicleMake) update.vehicleMake = resolved.vehicleMake;
  if (resolved.vehicleModel) update.vehicleModel = resolved.vehicleModel;
  if (resolved.vehicleRegistration) update.vehicleRegistration = resolved.vehicleRegistration;
  if (resolved.policeReportNumber) update.policeReportNumber = resolved.policeReportNumber;

  return update;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseJson(value: unknown): any {
  if (value == null) return null;
  if (typeof value === "object") return value;
  if (typeof value === "string") {
    try { return JSON.parse(value); } catch { return null; }
  }
  return null;
}
