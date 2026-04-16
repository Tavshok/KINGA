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

/** Phase 2C — Classification of the assumption source type */
export type AssumptionType =
  | "SYSTEM_ESTIMATE"       // AI/model-generated estimate with no document basis
  | "MARKET_DEFAULT"        // Industry average or market benchmark used as proxy
  | "DOCUMENT_INFERENCE"    // Inferred from document context (not explicitly stated)
  | "HISTORICAL_PROXY"      // Based on historical claim patterns
  | "CLAIMANT_STATED"       // Taken from claimant narrative without independent verification
  | "REGULATORY_DEFAULT";   // Regulatory or statutory default value applied

/** Phase 2C — Impact level of this assumption on the final decision */
export type AssumptionImpact = "HIGH" | "MEDIUM" | "LOW";

export interface Assumption {
  field: string;
  assumedValue: any;
  reason: string;
  strategy: RecoveryStrategy;
  confidence: number;
  stage: string;
  /** Phase 2C: Classification of the assumption source type */
  assumptionType?: AssumptionType;
  /** Phase 2C: Impact level of this assumption on the final decision */
  impact?: AssumptionImpact;
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
  | "llm_vision"
  | "skip"
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
  | "animal_strike"
  | "rollover"
  | "rear_end"
  | "head_on"
  | "sideswipe"
  | "single_vehicle"
  | "pedestrian_strike"
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

export type FraudRiskLevel = "minimal" | "low" | "medium" | "high" | "elevated";

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
  policeOfficerName: string | null;     // Name of attending officer
  policeChargeNumber: string | null;    // TAB number / charge number
  policeFineAmountCents: number | null; // Traffic fine in cents
  policeReportDate: string | null;      // Date of police/traffic report (YYYY-MM-DD)
  policeChargedParty: string | null;    // Name/identity of the party charged at the scene
  policeInvestigationStatus: string | null; // CHARGED | UNDER_INVESTIGATION | NO_CHARGE | CASE_WITHDRAWN | UNKNOWN
  policeOfficerFindings: string | null; // Verbatim factual findings recorded by the attending officer
  thirdPartyAccountSummary: string | null; // Third party's own version of events (if present in documents)
  // Repairer
  assessorName: string | null;
  panelBeater: string | null;
  repairerCompany: string | null;
  // Financial
  quoteTotalCents: number | null;
  /** Agreed/settled/negotiated repair cost — may differ from original quote total */
  agreedCostCents: number | null;
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
  thirdPartyName: string | null;          // Name of third-party driver/owner
  thirdPartyInsurerName: string | null;   // Third party's insurer name
  thirdPartyPolicyNumber: string | null;  // Third party's policy number
  // Insurance / Policy
  insurerName: string | null;
  policyNumber: string | null;
  /** Insurance product/coverage type — distinct from policyNumber. E.g. 'EXCESS', 'COMPREHENSIVE', 'THIRD PARTY'. Set when the policy number field contains a product type rather than a policy identifier. */
  productType: string | null;
  claimReference: string | null;  // Insurer's claim reference (e.g. CI-024NATPHARM)
  // Incident context
  incidentTime: string | null;    // Time of accident (HH:MM)
  animalType: string | null;      // Type of animal struck (e.g. cow, kudu)
  weatherConditions: string | null;
  visibilityConditions: string | null; // Visibility at time of accident (DARK, DUSK, DAWN, DAYLIGHT)
  roadSurface: string | null;
  // Financial extras
  marketValueCents: number | null; // Vehicle market/retail value in cents
  excessAmountCents: number | null; // Insurance excess/deductible in cents
  bettermentCents: number | null;   // Betterment/depreciation in cents
  // Driver
  driverLicenseNumber: string | null;
  // Cross-border
  repairCountry: string | null;   // ISO 3166-1 alpha-2 country where repair is happening (e.g. 'ZA', 'ZW')
  quoteCurrency: string | null;   // Currency of the repair quote (e.g. 'ZAR', 'USD', 'ZWL')
  // Images
  uploadedImageUrls: string[];
  // Source document reference
  sourceDocumentIndex: number;
}

export interface Stage3Output {
  /** One extraction per document */
  perDocumentExtractions: ExtractedClaimFields[];
  /** Input recovery output — populated after the 5-step recovery pass */
  inputRecovery?: InputRecoveryOutput;
}

// ────────────────────────────────────────────────────────────────────────────────
// INPUT RECOVERY OUTPUT (produced at end of Stage 3)
// ────────────────────────────────────────────────────────────────────────────────

export interface RecoveredQuote {
  total: number;        // USD
  parts: number | null;
  labour: number | null;
  confidence: "high" | "medium" | "low";
  source: string;       // e.g. "agreed_cost", "original_quote", "lowest_of_three"
}

export interface DamageHints {
  zones: string[];       // e.g. ["front", "rear"]
  components: string[];  // e.g. ["bumper", "grille", "bonnet"]
}

export type InputRecoveryFailureFlag =
  | "ocr_failure"
  | "quote_not_mapped"
  | "description_not_mapped"
  | "images_not_processed";

export interface ExtractedQuoteRecord {
  panel_beater: string | null;
  total_cost: number | null;
  currency: string;
  components: string[];
  labour_defined: boolean;
  parts_defined: boolean;
  confidence: "high" | "medium" | "low";
  extraction_warnings: string[];
}

export interface InputRecoveryOutput {
  /** STEP 1 — Accident description recovered from raw text */
  accident_description: string | null;
  /** STEP 2 — Quote figures recovered from raw text (regex fallback) */
  recovered_quote: RecoveredQuote | null;
  /** STEP 2b — Structured quotes extracted by LLM quote engine (one per quote block) */
  extracted_quotes?: ExtractedQuoteRecord[];
  /** STEP 3 — Whether images are present in the document set */
  images_present: boolean;
  /** STEP 4 — Damage keywords extracted from text */
  damage_hints: DamageHints;
  /** STEP 5 — Failure flags for downstream consumers */
  failure_flags: InputRecoveryFailureFlag[];
  /** Timestamp of this recovery pass */
  recovered_at: string;
}

// ────────────────────────────────────────────────────────────────────────────────
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
  /**
   * Source-priority arbitration result for the four focus fields.
   * Resolves the authoritative value and flags conflicts between
   * stated values and AI-inferred values.
   */
  fieldValidation: import("./fieldValidationEngine").FieldValidationResult | null;
  /**
   * Pre-analysis consistency check result.
   * If proceed = false, downstream models must not issue a final decision.
   */
  consistencyCheck: import("./claimConsistencyChecker").ConsistencyCheckResult | null;
  /**
   * Pipeline Gate Controller decision.
   * If status = "HOLD", the pipeline must not proceed to analytical stages.
   */
  gateDecision: import("./pipelineGateController").GateControllerResult | null;
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
  marketValueUsd: number | null;  // Stated market/retail value from claim form
}

export interface DriverRecord {
  name: string | null;
  claimantName: string | null;
  licenseNumber: string | null;
}

/**
 * Collision scenario classification — determined in Stage 5 from narrative + collisionDirection.
 * Drives physics routing, evidence requirements, and forensic validator checks.
 */
export type CollisionScenario =
  | "rear_end_struck"     // Claimant was hit from behind by another vehicle
  | "rear_end_striking"   // Claimant drove into the back of another vehicle
  | "sideswipe"           // Lateral glancing contact with another vehicle
  | "hit_and_run"         // Third party fled the scene; no third-party details available
  | "parking_lot"         // Low-speed stationary/parking damage; no moving collision
  | "head_on"             // Frontal collision with oncoming vehicle
  | "single_vehicle"      // No other vehicle involved (e.g. hit a wall, pothole, rollover)
  | "rollover"            // Vehicle rolled; may or may not involve another party
  | "unknown";            // Could not be determined from available evidence

export interface AccidentDetails {
  date: string | null;
  time: string | null;          // Time of accident (HH:MM)
  location: string | null;
  description: string | null;
  incidentType: CanonicalIncidentType;
  /** Specific sub-type from the Incident Classification Engine (e.g. 'animal_strike') */
  incidentSubType: string | null;
  /** Full classification result from the Incident Classification Engine */
  incidentClassification: {
    incident_type: string;
    confidence: number;
    sources_used: string[];
    conflict_detected: boolean;
    reasoning: string;
  } | null;
  collisionDirection: CollisionDirection;
  impactPoint: string | null;
  estimatedSpeedKmh: number | null;
  maxCrushDepthM: number | null;
  totalDamageAreaM2: number | null;
  structuralDamage: boolean;
  airbagDeployment: boolean;
  animalType: string | null;       // Type of animal struck (e.g. cow, kudu)
  weatherConditions: string | null;
  visibilityConditions: string | null; // Visibility at time of accident (DARK, DUSK, DAWN, DAYLIGHT)
  roadSurface: string | null;
  /** Reasoned narrative analysis — produced by incidentNarrativeEngine after Stage 7 */
  narrativeAnalysis: import('./incidentNarrativeEngine').NarrativeAnalysis | null;
  /**
   * Granular collision scenario — set by Stage 5 from narrative + collisionDirection.
   * More specific than incidentType; drives physics routing and evidence requirements.
   */
  collisionScenario: CollisionScenario;
  /**
   * True when the claimant was the struck (non-at-fault) party.
   * Affects physics: the energy input came from the other vehicle, not the claimant's speed.
   */
  isStruckParty: boolean;
  /**
   * True when the third-party claim/statement should be requested as corroborating evidence.
   * Set for rear_end_struck, sideswipe, and head_on where a third party is known to exist.
   */
  thirdPartyClaimRequired: boolean;
  /**
   * True when narrative indicates the third party fled without leaving details.
   * Triggers mandatory police report requirement in Evidence Registry.
   */
  isHitAndRun: boolean;
  /**
   * True when damage occurred while vehicle was stationary/parked.
   * Triggers low-speed physics cap and CCTV/witness evidence recommendation.
   */
  isParkingLotDamage: boolean;
  /**
   * Confidence score (0.0–1.0) for the detected collision scenario.
   * Derived from the number of independent signal sources that corroborate the scenario:
   * narrative keywords, collisionDirection field, incidentType field, third-party details.
   * Below 0.50 = low confidence; pipeline applies conservative assumptions.
   */
  scenarioConfidence?: number;
  /**
   * True when the detected collision scenario contradicts the primary damage zone.
   * E.g. scenario = rear_end_struck but primary damage is frontal.
   * Triggers a HIGH forensic flag and conservative physics interpretation.
   */
  scenarioDamageMismatch?: boolean;
  /**
   * Confidence score (0.0–1.0) for the availability of third-party evidence.
   * Derived from: third-party name/vehicle present, narrative names other party.
   * Below 0.40 = insufficient third-party evidence to request corroboration.
   * At or above 0.40 = request third-party insurer claim reference before settlement.
   */
  thirdPartyConfidence?: number;
}

export interface PoliceReportRecord {
  reportNumber: string | null;
  station: string | null;
  /** Name of the attending police/traffic officer */
  officerName: string | null;
  /** TAB number or traffic charge number issued at the scene */
  chargeNumber: string | null;
  /** Traffic fine amount in cents (if issued at scene) */
  fineAmountCents: number | null;
  /** Date the police/traffic report was issued (YYYY-MM-DD) */
  reportDate: string | null;
  /** Who was charged at the scene — may be the claimant, the third party, or 'unknown' */
  chargedParty?: string | null;
  /** Status of the police investigation: CHARGED | UNDER_INVESTIGATION | NO_CHARGE | CASE_WITHDRAWN | UNKNOWN */
  investigationStatus?: string | null;
  /** Verbatim factual findings recorded by the attending officer */
  officerFindings?: string | null;
  /** Third party's own account of events, if present in the claim documents */
  thirdPartyAccountSummary?: string | null;
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
  /** Agreed/settled/negotiated repair cost — may differ from original quote total */
  agreedCostCents: number | null;
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
  /** Insurance / policy context */
  insuranceContext: {
    insurerName: string | null;
    policyNumber: string | null;
    /** Insurance product/coverage type — distinct from policyNumber. E.g. 'EXCESS', 'COMPREHENSIVE'. */
    productType: string | null;
    claimReference: string | null;
    excessAmountUsd: number | null;
    bettermentUsd: number | null;
  };
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
  /** Evidence Registry from Stage 0 — available after Stage 2 */
  evidenceRegistry?: import("./evidenceRegistryEngine").EvidenceRegistry | null;
}

export interface Stage5Output {
  claimRecord: ClaimRecord;
  scenarioSelection: {
    selected_engine: string;
    detected_sub_type: string;
    confidence: number;
    reasoning: string;
    is_minor_claim: boolean;
    requires_specialist: boolean;
    engine_parameters: Record<string, unknown>;
  } | null;
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
  /** Number of photos that were successfully processed by the vision engine */
  photosProcessed: number;
  /** Aggregate image quality/confidence score (0–100). 0 = no photos or all unusable. */
  imageConfidenceScore: number;
  /** Whether damage analysis was derived from photos (true) or text-only fallback (false) */
  analysisFromPhotos: boolean;
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
  /**
   * Detailed status of the physics execution:
   * - 'EXECUTED'          — physics ran successfully with real speed input
   * - 'SKIPPED_NO_SPEED'  — speed not present in document; force/energy calculations skipped
   * - 'SKIPPED_NON_PHYSICAL' — incident type is non-physical (theft, fire, flood, vandalism)
   * - 'ESTIMATED_FALLBACK'   — physics engine failed; simplified fallback used
   */
  physicsStatus: 'EXECUTED' | 'SKIPPED_NO_SPEED' | 'SKIPPED_NON_PHYSICAL' | 'ESTIMATED_FALLBACK';
  /** Animal strike physics result — populated when incident_type = animal_strike */
  animalStrikePhysics?: import('./animalStrikePhysicsEngine').AnimalStrikePhysicsOutput | null;
  /** Damage pattern validation result — populated by Stage 7 for all incident types */
  damagePatternValidation?: import('./damagePatternValidationEngine').DamagePatternOutput | null;
  /** Severity consensus result — fuses physics, damage, and image severity signals */
  severityConsensus?: import('./severityConsensusEngine').SeverityConsensusOutput | null;
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
  /** Scenario-aware fraud detection result — null if engine was skipped */
  scenarioFraudResult: {
    fraud_score: number;
    risk_level: "LOW" | "MEDIUM" | "HIGH";
    flags: Array<{
      code: string;
      category: string;
      severity: "LOW" | "MEDIUM" | "HIGH";
      score_contribution: number;
      description: string;
      scenario_specific: boolean;
    }>;
    false_positive_protection: Array<{
      suppressed_flag: string;
      reason: string;
      scenario_context: string;
    }>;
    reasoning: string;
    engine_metadata: {
      scenario_type: string;
      scenario_profile_applied: string;
      trust_signals_applied: string[];
      score_before_trust_reduction: number;
      trust_reduction_applied: number;
      false_positives_suppressed: number;
      inputs_missing: string[];
    };
  } | null;
  crossEngineConsistency: {
    consistency_score: number;
    overall_status: "CONSISTENT" | "CONFLICTED";
    agreements: Array<{
      check_id: string;
      label: string;
      engines: string[];
      strength: "STRONG" | "MODERATE";
      score: number;
      detail: string;
    }>;
    conflicts: Array<{
      check_id: string;
      label: string;
      engines: string[];
      severity: "CRITICAL" | "SIGNIFICANT" | "MINOR";
      physics_says: string;
      damage_says: string;
      fraud_says: string;
      recommended_action: string;
    }>;
    critical_conflict_count: number;
    reasoning: string;
    validator_metadata: {
      checks_run: number;
      agreements_found: number;
      conflicts_found: number;
      critical_conflicts: number;
      score_before_conflict_penalty: number;
      conflict_penalty_applied: number;
      inputs_available: Record<string, boolean>;
    };
  } | null;
  /**
   * Photo forensics results — EXIF, GPS, manipulation detection per photo.
   * Null when no damage photos were available or forensics was skipped.
   */
  photoForensics?: {
    analysedCount: number;
    errorCount: number;
    anyGpsPresent: boolean;
    anySuspicious: boolean;
    photos: Array<{
      url: string;
      error?: string;
      analysisResult?: {
        is_suspicious: boolean;
        confidence: number;
        flags: string[];
        gps_coordinates: { latitude: number; longitude: number } | null;
        capture_datetime: string | null;
        manipulation_indicators: { manipulation_score?: number };
        image_hash: string;
        recommendations: string[];
      } | null;
    }>;
  } | null;
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
  reconciliationSummary: {
    matched_count: number;
    missing_count: number;
    extra_count: number;
    coverage_ratio: number;
    structural_gaps: string[];
    summary: string;
    missing: Array<{ component: string; is_structural: boolean; reason: string }>;
    extra: Array<{ component: string; reason: string }>;
  } | null;
  alignmentResult: {
    alignment_status: "FULLY_ALIGNED" | "PARTIALLY_ALIGNED" | "MISALIGNED";
    critical_missing: Array<{ component: string; reason: string; is_structural: boolean; expected_zone: string }>;
    unrelated_items: Array<{ component: string; reason: string; is_structural: boolean; risk_level: "low" | "medium" | "high" }>;
    engineering_comment: string;
    coverage_ratio: number;
    structural_coverage_ratio: number;
    physics_zones_covered: boolean;
  } | null;
  costNarrative: {
    narrative: string;
    recommendation: "APPROVE" | "REVIEW" | "REJECT";
    recommendation_reason: string;
    flags_addressed: string[];
    confidence: "high" | "medium" | "low";
  } | null;
  costReliability: {
    confidence_level: "HIGH" | "MEDIUM" | "LOW";
    confidence_score: number;
    reason: string;
    score_breakdown: {
      base_score: number;
      assessor_bonus: number;
      quote_count_bonus: number;
      alignment_modifier: number;
      flag_penalty: number;
      final_score: number;
    };
  } | null;
  /** Stage 9c: Claims Cost Decision Engine output — true cost basis, deviations, anomalies, recommendation */
  costDecision: {
    true_cost_usd: number;
    cost_basis: "assessor_validated" | "system_optimised";
    mode: "PRE_ASSESSMENT" | "POST_ASSESSMENT";
    deviation_analysis: {
      highest_quote_usd: number | null;
      highest_quote_deviation_pct: number | null;
      highest_quote_panel_beater: string | null;
      optimised_vs_true_pct: number | null;
      ai_estimate_usd: number | null;
      ai_vs_true_pct: number | null;
      quote_spread_pct: number | null;
    };
    anomalies: Array<{
      category: "overpricing" | "under_quoting" | "misaligned_components" | "low_reliability" | "spread_warning" | "structural_gap" | "no_cost_basis";
      severity: "low" | "medium" | "high" | "critical";
      description: string;
      affected_quotes?: string[];
      affected_components?: string[];
      deviation_pct?: number;
    }>;
    recommendation: "APPROVE" | "REVIEW" | "REJECT" | "NEGOTIATE" | "PROCEED_TO_ASSESSMENT" | "ESCALATE";
    confidence: number;
    reasoning: string;
    decision_trace: string[];
    negotiation_guidance: {
      target_usd: number;
      floor_usd: number;
      ceiling_usd: number;
      overpriced_quotes: Array<{ panel_beater: string; total_cost: number; deviation_pct: number; recommended_reduction_usd: number }>;
      missing_components: string[];
      strategy: string;
    } | null;
    negotiation_efficiency: {
      agreed_vs_optimised_pct: number | null;
      efficiency_label: "optimal" | "acceptable" | "overpaid" | "under_repaired" | "unknown";
      overpayment_risk: boolean;
      under_repair_risk: boolean;
      summary: string;
    } | null;
  } | null;
  /** Stage 9b: Quote Optimisation Engine output — weighted baseline cost from multiple quotes */
  quoteOptimisation: {
    optimised_cost_usd: number;
    selected_quotes: Array<{
      quote_index: number;
      panel_beater: string;
      total_cost: number;
      coverage_ratio: number;
      structurally_complete: boolean;
      structural_gaps: string[];
      extra_components: string[];
      confidence: "high" | "medium" | "low";
      weight: number;
      is_outlier: boolean;
      outlier_reason: string | null;
      structural_penalty: number;
    }>;
    excluded_quotes: Array<{
      quote_index: number;
      panel_beater: string;
      total_cost: number | null;
      reason: string;
      exclusion_category: "no_cost" | "outlier_inflated" | "zero_coverage" | "invalid";
    }>;
    cost_spread_pct: number;
    confidence: number;
    justification: string;
    median_cost_usd: number | null;
    quotes_evaluated: number;
    total_structural_gaps: number;
  } | null;
  /** Documented quote values from the extracted claim document — used by db.ts to populate costIntelligenceJson */
  documentedOriginalQuoteUsd: number | null;
  documentedAgreedCostUsd: number | null;
  panelBeaterName: string | null;
  documentedLabourCostUsd: number | null;
  documentedPartsCostUsd: number | null;
  /** Phase 2B: Economic Context Engine output — policy-based currency, PPP, NCI */
  economicContext: import('./economicContextEngine').EconomicContext | null;
  /** Phase 4A: Input Fidelity Engine result — 4-class attribution, completeness score, DOE eligibility */
  ifeResult: import('./inputFidelityEngine').IFEReport | null;
  /** Phase 4A: Decision Optimisation Engine result — multi-objective scoring, fraud-aware disqualification */
  doeResult: import('./decisionOptimisationEngine').DOEResult | null;
}

// ────────────────────────────────────────────────────────────────────────────────
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
  /**
   * Evidence trace — a structured audit trail linking each conclusion to its
   * source evidence, engine, and confidence level. Designed for regulatory
   * review, legal dispute, and insurer transparency.
   */
  evidenceTrace?: {
    /** Claim tier assigned by the complexity gate */
    claimTier: "SIMPLE" | "STANDARD" | "COMPLEX";
    /** Complexity score (0–100) */
    complexityScore: number;
    /** Reasons for the tier assignment */
    complexityReasons: string[];
    /** Whether Stage 7b Pass 2 (re-run with fraud+cost scores) was executed */
    stage7bPass2Executed: boolean;
    /** Stages that ran concurrently (for audit transparency) */
    parallelStages: Array<{ stages: string[]; rationale: string }>;
    /** Total pipeline duration in milliseconds */
    totalDurationMs: number;
    /** Per-stage duration summary */
    stageDurations: Record<string, number>;
  } | null;
  /** Decision Readiness Engine result — null if not yet evaluated */
  decisionReadiness: {
    decision_ready: boolean;
    confidence: number;
    blocking_issues: Array<{
      check_id: string;
      description: string;
      resolution: string;
      severity: "CRITICAL" | "HIGH" | "MEDIUM";
    }>;
    checks: Array<{
      check_id: string;
      label: string;
      status: "PASS" | "FAIL" | "WARN";
      detail: string;
      is_critical: boolean;
    }>;
    summary: string;
  } | null;
  /** Cross-stage consistency check result — named contradiction flags between pipeline stages */
  consistencyCheck?: import('./crossStageConsistencyEngine').ConsistencyCheckResult | null;
  /** Multi-dimensional claim quality score for adjuster guidance */
  claimQuality?: import('./claimQualityScorer').ClaimQualityResult | null;
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

/** Per-tenant overrides for cost rates — loaded from tenants.configJson at pipeline start */
export interface TenantRates {
  /** Labour rate in USD per hour (overrides regional default) */
  labourRateUsdPerHour?: number;
  /** Paint cost per panel in USD (overrides global default) */
  paintCostPerPanelUsd?: number;
  /** Currency code for display (e.g. 'ZAR', 'USD') */
  currencyCode?: string;
  /** Currency symbol for display (e.g. 'R', '$') */
  currencySymbol?: string;
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
  /** Set by Stage 1 — PDF pages rendered to images for vision analysis (fallback when no damagePhotoUrls) */
  pdfPageImageUrls?: string[];
  /** Set by Stage 0 (Evidence Registry Engine) — available to all downstream stages */
  evidenceRegistry?: import("./evidenceRegistryEngine").EvidenceRegistry | null;
  /** Per-tenant cost rate overrides — loaded from tenants.configJson at pipeline start */
  tenantRates?: TenantRates | null;
  /** Full ExtractedImage metadata from PDF extraction — used by the image classifier */
  extractedImagesWithMetadata?: any[];
  /** Photo ingestion log from pre-pipeline PDF extraction */
  photoIngestionLog?: any;
  /** Set by image classifier — classified images with confidence scores and quality rankings */
  classifiedImages?: import('./imageClassifier').ClassificationResult | null;
}
