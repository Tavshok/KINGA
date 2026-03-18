/**
 * pipeline-v2/types.ts
 *
 * Single source of truth for the KINGA Self-Healing Claim Processing Engine.
 *
 * Architecture:
 *   - Every stage imports ONLY from this file.
 *   - Each stage receives a typed input and returns a typed output.
 *   - The ClaimRecord is the assembled data object passed to all analysis engines.
 *   - Missing fields are explicitly NULL at extraction time.
 *   - Recovery strategies (estimation, inference, approximation) are applied
 *     at the assembly and analysis stages, with all assumptions tracked.
 *   - The pipeline NEVER halts — every stage produces output even if degraded.
 *   - The report (Stage 10) is ALWAYS generated with confidence scores,
 *     assumptions made, and missing data lists.
 */

// ─────────────────────────────────────────────────────────────────────────────
// SELF-HEALING PRIMITIVES
// ─────────────────────────────────────────────────────────────────────────────

export interface Assumption {
  field: string;
  assumedValue: any;
  reason: string;
  strategy: RecoveryStrategy;
  confidence: number;
  stage: string;
}

export type RecoveryStrategy =
  | "secondary_ocr"
  | "cross_document_search"
  | "historical_data"
  | "contextual_inference"
  | "manufacturer_lookup"
  | "industry_average"
  | "damage_based_estimate"
  | "typical_collision"
  | "default_value"
  | "partial_data"
  | "none";

export interface RecoveryAction {
  target: string;
  strategy: RecoveryStrategy;
  success: boolean;
  description: string;
  recoveredValue?: any;
}

export interface MissingDocument {
  documentType: DocumentType;
  impact: string;
  required?: boolean;
  recoveryApplied?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// ENUMS & CANONICAL TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type DocumentType =
  | "claim_form"
  | "police_report"
  | "repair_quote"
  | "vehicle_photos"
  | "supporting_document"
  | "unknown";

export type CanonicalIncidentType =
  | "collision"
  | "theft"
  | "vandalism"
  | "flood"
  | "fire"
  | "unknown";

export type CollisionDirection =
  | "frontal"
  | "rear"
  | "side_driver"
  | "side_passenger"
  | "rollover"
  | "multi_impact"
  | "unknown";

export type AccidentSeverity =
  | "none"
  | "cosmetic"
  | "minor"
  | "moderate"
  | "severe"
  | "catastrophic";

export type PowertrainType = "ice" | "bev" | "phev" | "hev";

export type VehicleBodyType =
  | "sedan"
  | "hatchback"
  | "suv"
  | "pickup"
  | "van"
  | "truck"
  | "sports"
  | "compact";

export type FraudRiskLevel = "minimal" | "low" | "medium" | "high" | "critical";

export type VarianceFlag = "within_range" | "overpriced" | "underpriced" | "no_quote";

// ─────────────────────────────────────────────────────────────────────────────
// STAGE 1 — DOCUMENT INGESTION
// ─────────────────────────────────────────────────────────────────────────────

export interface IngestedDocument {
  /** Unique identifier within this claim's document set */
  documentIndex: number;
  /** Classified document type */
  documentType: DocumentType;
  /** S3 URL or local path to the original file */
  sourceUrl: string;
  /** MIME type of the original file */
  mimeType: string;
  /** File name as uploaded */
  fileName: string;
  /** Whether this document contains images (photos or scanned pages) */
  containsImages: boolean;
  /** Extracted image URLs (from PDF pages or direct photo uploads) */
  imageUrls: string[];
}

export interface Stage1Output {
  documents: IngestedDocument[];
  primaryDocumentIndex: number;
  totalDocuments: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// STAGE 2 — OCR AND TEXT EXTRACTION
// ─────────────────────────────────────────────────────────────────────────────

export interface ExtractedText {
  documentIndex: number;
  rawText: string;
  /** Structured tables preserved from OCR */
  tables: ExtractedTable[];
  /** Whether OCR was needed (scanned/image-based) */
  ocrApplied: boolean;
  /** Confidence score of the OCR output (0-100) */
  ocrConfidence: number;
}

export interface ExtractedTable {
  headers: string[];
  rows: string[][];
  context: string;
}

export interface Stage2Output {
  extractedTexts: ExtractedText[];
  totalPagesProcessed: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// STAGE 3 — STRUCTURED DATA EXTRACTION
// ─────────────────────────────────────────────────────────────────────────────

export interface RepairLineItem {
  partName: string;
  partNumber: string | null;
  quantity: number;
  unitPriceCents: number;
  totalPriceCents: number;
  labourHours: number;
  labourRateCents: number;
  isOem: boolean;
  isAftermarket: boolean;
  isUsed: boolean;
  repairAction: string;
}

export interface DamagedComponentExtracted {
  name: string;
  location: string;
  damageType: string;
  severity: string;
  repairAction: string;
}

/**
 * Raw extracted fields from each document.
 * Missing fields are explicitly NULL — never guessed.
 */
export interface ExtractedClaimFields {
  // Identity
  claimId: string | null;
  claimantName: string | null;
  driverName: string | null;
  // Vehicle
  vehicleRegistration: string | null;
  vehicleMake: string | null;
  vehicleModel: string | null;
  vehicleYear: number | null;
  vehicleVin: string | null;
  vehicleColour: string | null;
  vehicleEngineNumber: string | null;
  vehicleMileage: number | null;
  // Incident
  accidentDate: string | null;
  accidentLocation: string | null;
  accidentDescription: string | null;
  incidentType: string | null;
  accidentType: string | null;
  impactPoint: string | null;
  estimatedSpeedKmh: number | null;
  // Police
  policeReportNumber: string | null;
  policeStation: string | null;
  // Repairer
  assessorName: string | null;
  panelBeater: string | null;
  repairerCompany: string | null;
  // Financial
  quoteTotalCents: number | null;
  labourCostCents: number | null;
  partsCostCents: number | null;
  // Damage
  damageDescription: string | null;
  damagedComponents: DamagedComponentExtracted[];
  structuralDamage: boolean | null;
  airbagDeployment: boolean | null;
  maxCrushDepthM: number | null;
  totalDamageAreaM2: number | null;
  // Third party
  thirdPartyVehicle: string | null;
  thirdPartyRegistration: string | null;
  // Images
  uploadedImageUrls: string[];
  // Source document reference
  sourceDocumentIndex: number;
}

export interface Stage3Output {
  /** One extraction per document */
  perDocumentExtractions: ExtractedClaimFields[];
}

// ─────────────────────────────────────────────────────────────────────────────
// STAGE 4 — DATA VALIDATION
// ─────────────────────────────────────────────────────────────────────────────

export interface ValidationIssue {
  field: string;
  severity: "critical" | "warning" | "info";
  message: string;
  /** Whether secondary extraction was attempted */
  secondaryExtractionAttempted: boolean;
  /** Whether secondary extraction resolved the issue */
  resolved: boolean;
}

export interface Stage4Output {
  /** Validated and merged extraction (best value from all documents) */
  validatedFields: ExtractedClaimFields;
  /** Issues found during validation */
  issues: ValidationIssue[];
  /** Overall data completeness score (0-100) */
  completenessScore: number;
  /** Fields that remain NULL after all extraction attempts */
  missingFields: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// STAGE 5 — CLAIM DATA ASSEMBLY (ClaimRecord)
// ─────────────────────────────────────────────────────────────────────────────

export interface VehicleRecord {
  make: string;
  model: string;
  year: number | null;
  registration: string | null;
  vin: string | null;
  colour: string | null;
  engineNumber: string | null;
  mileageKm: number | null;
  bodyType: VehicleBodyType;
  powertrain: PowertrainType;
  massKg: number;
  massTier: "explicit" | "inferred_model" | "inferred_class" | "not_available";
  valueUsd: number | null;
}

export interface DriverRecord {
  name: string | null;
  claimantName: string | null;
}

export interface AccidentDetails {
  date: string | null;
  location: string | null;
  description: string | null;
  incidentType: CanonicalIncidentType;
  collisionDirection: CollisionDirection;
  impactPoint: string | null;
  estimatedSpeedKmh: number | null;
  maxCrushDepthM: number | null;
  totalDamageAreaM2: number | null;
  structuralDamage: boolean;
  airbagDeployment: boolean;
}

export interface PoliceReportRecord {
  reportNumber: string | null;
  station: string | null;
}

export interface DamageRecord {
  description: string | null;
  components: DamagedComponentExtracted[];
  imageUrls: string[];
}

export interface RepairQuoteRecord {
  repairerName: string | null;
  repairerCompany: string | null;
  assessorName: string | null;
  quoteTotalCents: number | null;
  labourCostCents: number | null;
  partsCostCents: number | null;
  lineItems: RepairLineItem[];
}

/**
 * The assembled ClaimRecord — the single structured data object
 * passed to all analysis engines (Stages 6-9).
 */
export interface ClaimRecord {
  claimId: number;
  tenantId: number | null;
  vehicle: VehicleRecord;
  driver: DriverRecord;
  accidentDetails: AccidentDetails;
  policeReport: PoliceReportRecord;
  damage: DamageRecord;
  repairQuote: RepairQuoteRecord;
  /** Data quality metadata from Stage 4 */
  dataQuality: {
    completenessScore: number;
    missingFields: string[];
    validationIssues: ValidationIssue[];
  };
  /** Market region for cost benchmarking */
  marketRegion: string;
  /** Assumptions made during assembly */
  assumptions: Assumption[];
}

export interface Stage5Output {
  claimRecord: ClaimRecord;
}

// ─────────────────────────────────────────────────────────────────────────────
// STAGE 6 — DAMAGE ANALYSIS ENGINE
// ─────────────────────────────────────────────────────────────────────────────

export interface DamageAnalysisComponent {
  name: string;
  location: string;
  damageType: string;
  severity: AccidentSeverity;
  visible: boolean;
  distanceFromImpact: number;
}

export interface DamageZone {
  zone: string;
  componentCount: number;
  maxSeverity: AccidentSeverity;
}

export interface Stage6Output {
  damagedParts: DamageAnalysisComponent[];
  damageZones: DamageZone[];
  overallSeverityScore: number;
  structuralDamageDetected: boolean;
  totalDamageArea: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// STAGE 7 — PHYSICS ANALYSIS ENGINE
// ─────────────────────────────────────────────────────────────────────────────

export interface Stage7Input {
  vehicleMassKg: number;
  impactDirection: CollisionDirection;
  estimatedSpeedKmh: number | null;
  damageZones: DamageZone[];
  damagedComponents: DamageAnalysisComponent[];
  maxCrushDepthM: number | null;
  structuralDamage: boolean;
  airbagDeployment: boolean;
}

export interface Stage7Output {
  impactForceKn: number;
  impactVector: {
    direction: CollisionDirection;
    magnitude: number;
    angle: number;
  };
  energyDistribution: {
    kineticEnergyJ: number;
    energyDissipatedJ: number;
    energyDissipatedKj: number;
  };
  estimatedSpeedKmh: number;
  deltaVKmh: number;
  decelerationG: number;
  accidentSeverity: AccidentSeverity;
  accidentReconstructionSummary: string;
  damageConsistencyScore: number;
  latentDamageProbability: {
    engine: number;
    transmission: number;
    suspension: number;
    frame: number;
    electrical: number;
  };
  /** Whether physics engine was actually run (false for non-collision) */
  physicsExecuted: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// STAGE 8 — FRAUD ANALYSIS ENGINE
// ─────────────────────────────────────────────────────────────────────────────

export interface Stage8Input {
  claimRecord: ClaimRecord;
  damageAnalysis: Stage6Output;
  physicsAnalysis: Stage7Output;
}

export interface FraudIndicator {
  indicator: string;
  category: string;
  score: number;
  description: string;
}

export interface Stage8Output {
  fraudRiskScore: number;
  fraudRiskLevel: FraudRiskLevel;
  indicators: FraudIndicator[];
  quoteDeviation: number | null;
  repairerHistory: {
    flagged: boolean;
    notes: string;
  };
  claimantClaimFrequency: {
    flagged: boolean;
    notes: string;
  };
  vehicleClaimHistory: {
    flagged: boolean;
    notes: string;
  };
  damageConsistencyScore: number;
  damageConsistencyNotes: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// STAGE 9 — COST OPTIMISATION ENGINE
// ─────────────────────────────────────────────────────────────────────────────

export interface Stage9Input {
  claimRecord: ClaimRecord;
  damageAnalysis: Stage6Output;
  physicsAnalysis: Stage7Output;
}

export interface RepairIntelligenceItem {
  component: string;
  location: string;
  severity: string;
  recommendedAction: string;
  partsCost: number;
  labourCost: number;
  paintCost: number;
  totalCost: number;
  currency: string;
  notes: string | null;
}

export interface PartsReconciliationItem {
  component: string;
  aiEstimate: number;
  quotedAmount: number | null;
  variance: number | null;
  variancePct: number | null;
  flag: string | null;
}

export interface Stage9Output {
  expectedRepairCostCents: number;
  quoteDeviationPct: number | null;
  recommendedCostRange: {
    lowCents: number;
    highCents: number;
  };
  savingsOpportunityCents: number;
  breakdown: {
    partsCostCents: number;
    labourCostCents: number;
    paintCostCents: number;
    hiddenDamageCostCents: number;
    totalCents: number;
  };
  labourRateUsdPerHour: number;
  marketRegion: string;
  currency: string;
  repairIntelligence: RepairIntelligenceItem[];
  partsReconciliation: PartsReconciliationItem[];
}

// ─────────────────────────────────────────────────────────────────────────────
// STAGE 9b — TURNAROUND TIME ANALYSIS
// ─────────────────────────────────────────────────────────────────────────────

export interface TurnaroundMetric {
  entityName: string;
  entityType: "assessor" | "repair_shop";
  averageDays: number;
  claimCount: number;
  outlierFlag: boolean;
  outlierReason: string | null;
}

export interface TurnaroundTimeOutput {
  estimatedRepairDays: number;
  bestCaseDays: number;
  worstCaseDays: number;
  confidence: number;
  breakdown: {
    assessmentDays: number;
    partsSourcingDays: number;
    repairDays: number;
    paintDays: number;
    qualityCheckDays: number;
  };
  bottlenecks: string[];
  marketRegion: string;
}

/** @deprecated alias — use TurnaroundTimeOutput */
export type Stage9bOutput = TurnaroundTimeOutput;

// ─────────────────────────────────────────────────────────────────────────────
// STAGE 10 — REPORT GENERATION
// ─────────────────────────────────────────────────────────────────────────────

export interface ReportSection {
  title: string;
  content: Record<string, any>;
}

export interface Stage10Output {
  claimSummary: ReportSection;
  damageAnalysis: ReportSection;
  physicsReconstruction: ReportSection;
  costOptimisation: ReportSection;
  fraudRiskIndicators: ReportSection;
  turnaroundTimeEstimate: ReportSection;
  supportingImages: ReportSection;
  /** Full structured report as a single JSON object */
  fullReport: Record<string, any>;
  /** Generated at timestamp */
  generatedAt: string;
  /** Overall confidence score (0-100) */
  confidenceScore: number;
  /** All assumptions made during processing */
  assumptions: Assumption[];
  /** Documents that were expected but not provided */
  missingDocuments: MissingDocument[];
  /** Fields that remain NULL after all recovery attempts */
  missingFields: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// PIPELINE ORCHESTRATION
// ─────────────────────────────────────────────────────────────────────────────

export interface StageResult<T> {
  status: "success" | "failed" | "skipped" | "degraded";
  data: T | null;
  error?: string;
  durationMs: number;
  savedToDb: boolean;
  assumptions: Assumption[];
  recoveryActions: RecoveryAction[];
  degraded: boolean;
}

export interface PipelineStageSummary {
  status: "success" | "failed" | "skipped" | "degraded";
  durationMs: number;
  savedToDb: boolean;
  error?: string;
  degraded: boolean;
  assumptionCount: number;
  recoveryActionCount: number;
}

export interface PipelineRunSummary {
  claimId: number;
  stages: Record<string, PipelineStageSummary>;
  allSavedToDb: boolean;
  totalDurationMs: number;
  completedAt: string;
}

export interface PipelineContext {
  claimId: number;
  tenantId: number | null;
  assessmentId: number;
  claim: Record<string, any>;
  pdfUrl: string | null;
  damagePhotoUrls: string[];
  db: any;
  log: (stage: string, msg: string) => void;
}
