/**
 * KINGA Phase 2 – Decision & Consistency Engine
 *
 * Runs after Phase 1 (Data Integrity & Sanitisation) has completed.
 * Produces a single authoritative decision object that is the ONLY verdict
 * rendered in the report. All conflicting outputs from other engines are
 * suppressed in favour of this result.
 *
 * Sections:
 *  2.1  Physics Threshold Guard (suppress impossible constraints)
 *  2.2  Circular Logic Prevention (photos, police report)
 *  2.3  Single Decision Authority (first-match decision tree)
 *  2.4  Incident Type Classification (keyword mapping, extended for ZW/SA)
 *  2.5  Structured Decision Output
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type FinalDecision = 'APPROVE' | 'REVIEW' | 'ESCALATE' | 'REJECT';

export interface Phase2Input {
  /** From Phase 1 */
  authoritativeTotalUsd: number;
  incidentType: string | null;
  incidentDescription: string | null;
  photosDetected: boolean | null;
  photosProcessed: boolean | null;
  photosProcessedCount: number | null;
  /** Damage photo URLs — when present, photos MUST be analysed */
  damagePhotoUrls: string[];
  policeReportNumber: string | null;
  repairerQuoteTotal: number | null;

  /** From physics engine */
  deltaVKmh: number;
  physicsConsistencyScore: number;   // 0–100
  structuralDamageSeverity: 'none' | 'minor' | 'moderate' | 'severe' | string;

  /** From fraud scoring engine */
  fraudScore: number;                // 0–100

  /** From valuation engine (stored in cents in DB) */
  vehicleMarketValueCents: number | null;

  /** Computed by caller */
  dataCompletenessScore?: number;    // 0–100; computed here if not provided
}

export interface PhysicsConstraintResult {
  constraint: string;
  suppressed: boolean;
  advisory: string | null;
}

export interface PhotoAnalysisRequirement {
  /** true = photos are present and MUST be analysed before a final decision */
  analysisRequired: boolean;
  photoStatus: 'ANALYSED' | 'SYSTEM_FAILURE' | 'CLAIMANT_OMISSION' | 'NOT_APPLICABLE';
  fraudPointsAdded: number;
  systemNote: string;
}

export interface Phase2Output {
  finalDecision: FinalDecision;
  confidence: number;
  fraudScore: number;
  physicsConsistency: number;
  dataCompleteness: number;
  incidentType: string;
  photoAnalysis: PhotoAnalysisRequirement;
  physicsConstraints: PhysicsConstraintResult[];
  suppressedConstraints: string[];
  keyDrivers: string[];
  nextSteps: string[];
  advisories: string[];
  logs: string[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Required fields for data completeness scoring (Phase 2.3) */
const REQUIRED_FIELDS = [
  'incident_type',
  'authoritative_total',
  'repairer_quote_total',
  'photos_detected',
  'police_report_number',
] as const;

/** Physics constraint thresholds */
const PHYSICS_THRESHOLDS = {
  airbag_deployment: 25,         // km/h Delta-V minimum
  seatbelt_pretensioner: 15,     // km/h Delta-V minimum
  structural_deformation: 10,    // km/h Delta-V — if severe damage below this, flag inconsistency
} as const;

/** Fraud score band boundaries — aligned to weighted-fraud-scoring.ts */
const FRAUD_BANDS = {
  ESCALATE_THRESHOLD: 70,        // >= 70 → ESCALATE (HIGH band starts at 61)
  PHYSICS_ESCALATE_THRESHOLD: 30,// < 30 physics consistency → ESCALATE
} as const;

/** Total loss threshold — repair cost / market value */
const TOTAL_LOSS_RATIO = 0.60;

// ─── 2.4 Incident Type Keyword Mapping ───────────────────────────────────────
// Extended for Zimbabwe / Southern Africa context (en-ZW default).
// Road hazard collisions are treated as COLLISION events (physics applies).

const INCIDENT_KEYWORDS: Record<string, string[]> = {
  ANIMAL_STRIKE: [
    'hit an animal', 'animal strike', 'animal collision', 'struck animal',
    // Livestock
    'cow', 'cattle', 'bull', 'ox', 'goat', 'sheep', 'pig', 'donkey', 'horse',
    // Wildlife — Southern Africa
    'kudu', 'nyala', 'eland', 'bushbuck', 'waterbuck', 'reedbuck', 'steenbok',
    'duiker', 'impala', 'springbok', 'gemsbok', 'oryx', 'wildebeest', 'gnu',
    'zebra', 'buffalo', 'elephant', 'rhino', 'hippo', 'giraffe', 'warthog',
    'baboon', 'vervet monkey', 'dassie', 'rock rabbit', 'hyrax', 'bushpig',
    'porcupine', 'mongoose', 'caracal', 'jackal', 'hyena', 'cheetah',
    'leopard', 'lion', 'ostrich', 'guinea fowl', 'hadeda',
    // Global
    'deer', 'kangaroo', 'moose', 'elk', 'wildlife',
  ],
  ROAD_HAZARD_COLLISION: [
    'pothole', 'ditch', 'corrugated road', 'gravel road', 'dirt road',
    'sand drift', 'wash-away', 'washaway', 'flooded drift', 'donga',
    'speed hump', 'speed bump', 'loose gravel', 'road hazard',
    'hit a pothole', 'drove into a ditch',
  ],
  REAR_END: [
    'rear end', 'rear-end', 'rear ended', 'hit from behind', 'struck from behind',
    'back of vehicle', 'tailgated', 'shunted',
  ],
  SIDE_IMPACT: [
    'side impact', 'T-bone', 'T bone', 'broadside', 'side collision',
    'hit on the side', 'struck on the side',
  ],
  HEAD_ON: [
    'head on', 'head-on', 'frontal collision', 'frontal impact',
    'oncoming vehicle', 'opposite lane',
  ],
  PARKING_LOT: [
    'parking lot', 'car park', 'parking', 'reversing', 'reversed into',
    'backed into', 'low speed', 'low-speed',
  ],
  HIGHWAY: [
    'highway', 'motorway', 'freeway', 'high speed', 'high-speed',
    'overtaking', 'lane change',
  ],
  ROLLOVER: [
    'rollover', 'rolled over', 'overturned', 'flipped', 'roof damage',
  ],
  THEFT: ['theft', 'stolen', 'vehicle stolen', 'car stolen'],
  BREAK_IN: ['break in', 'break-in', 'broken into', 'smash and grab', 'window smashed'],
  VANDALISM: ['vandalism', 'vandalised', 'vandalized', 'keyed', 'scratched deliberately'],
  HIJACKING: ['hijacking', 'hijacked', 'carjacking', 'armed robbery'],
  FIRE: ['fire', 'burnt', 'burned', 'engine fire', 'electrical fire'],
  HAIL: ['hail', 'hailstorm', 'hail damage'],
  FLOOD: ['flood', 'flooded', 'water damage', 'submerged'],
  STORM: ['storm', 'storm damage', 'wind damage', 'fallen tree', 'tree fell'],
  FALLING_OBJECT: ['falling object', 'fell on', 'dropped on', 'object fell'],
};

// ─── 2.4 Classify Incident Type ───────────────────────────────────────────────

function classifyIncidentType(
  incidentType: string | null,
  incidentDescription: string | null,
): { type: string; source: 'stored' | 'description' | 'unclassified' } {
  // 1. Use stored type if it is already a known non-null value
  if (incidentType && incidentType !== 'N/A' && incidentType !== 'null' && incidentType !== '') {
    return { type: incidentType.toUpperCase(), source: 'stored' };
  }

  // 2. Attempt keyword classification from description
  if (incidentDescription) {
    const desc = incidentDescription.toLowerCase();
    for (const [type, keywords] of Object.entries(INCIDENT_KEYWORDS)) {
      if (keywords.some(kw => desc.includes(kw.toLowerCase()))) {
        return { type, source: 'description' };
      }
    }
  }

  // 3. Cannot classify
  return { type: 'REQUIRES_CLASSIFICATION', source: 'unclassified' };
}

// ─── 2.1 Physics Threshold Guard ─────────────────────────────────────────────

function runPhysicsThresholdGuard(
  deltaVKmh: number,
  structuralDamageSeverity: string,
): { constraints: PhysicsConstraintResult[]; suppressedConstraints: string[]; advisories: string[] } {
  const constraints: PhysicsConstraintResult[] = [];
  const suppressedConstraints: string[] = [];
  const advisories: string[] = [];

  // Airbag deployment
  const airbagSuppressed = deltaVKmh < PHYSICS_THRESHOLDS.airbag_deployment;
  const airbagAdvisory = airbagSuppressed
    ? `Airbag deployment unlikely at ${deltaVKmh.toFixed(1)} km/h Delta-V (threshold ${PHYSICS_THRESHOLDS.airbag_deployment} km/h). Constraint suppressed.`
    : null;
  constraints.push({ constraint: 'airbag_deployment', suppressed: airbagSuppressed, advisory: airbagAdvisory });
  if (airbagSuppressed && airbagAdvisory) {
    suppressedConstraints.push('airbag_deployment');
    advisories.push(airbagAdvisory);
  }

  // Seatbelt pre-tensioner
  const seatbeltSuppressed = deltaVKmh < PHYSICS_THRESHOLDS.seatbelt_pretensioner;
  const seatbeltAdvisory = seatbeltSuppressed
    ? `Seatbelt pre-tensioner activation requires verification at low Delta-V (${deltaVKmh.toFixed(1)} km/h).`
    : null;
  constraints.push({ constraint: 'seatbelt_pretensioner', suppressed: seatbeltSuppressed, advisory: seatbeltAdvisory });
  if (seatbeltSuppressed && seatbeltAdvisory) {
    suppressedConstraints.push('seatbelt_pretensioner');
    advisories.push(seatbeltAdvisory);
  }

  // Structural deformation inconsistency guard (additional improvement)
  // If severe structural damage is reported at very low Delta-V, this is a physics anomaly
  if (
    deltaVKmh < PHYSICS_THRESHOLDS.structural_deformation &&
    structuralDamageSeverity === 'severe'
  ) {
    const structAdvisory = `Severe structural damage reported at very low Delta-V (${deltaVKmh.toFixed(1)} km/h < ${PHYSICS_THRESHOLDS.structural_deformation} km/h threshold). Physics inconsistency flagged for manual review.`;
    constraints.push({ constraint: 'structural_deformation_anomaly', suppressed: false, advisory: structAdvisory });
    advisories.push(structAdvisory);
  }

  return { constraints, suppressedConstraints, advisories };
}

// ─── 2.2 Circular Logic Prevention ───────────────────────────────────────────

function resolvePhotoStatus(
  photosDetected: boolean | null,
  photosProcessed: boolean | null,
  photosProcessedCount: number | null,
  damagePhotoUrls: string[],
  policeReportNumber: string | null,
  currentFraudScore: number,
): { photoAnalysis: PhotoAnalysisRequirement; adjustedFraudScore: number; logs: string[] } {
  const logs: string[] = [];
  let adjustedFraudScore = currentFraudScore;

  // Determine effective detection status: use damagePhotoUrls as ground truth
  const photosActuallyPresent = damagePhotoUrls.length > 0 || photosDetected === true;
  const photosActuallyProcessed = (photosProcessedCount ?? 0) > 0 || photosProcessed === true;

  if (photosActuallyPresent && !photosActuallyProcessed) {
    // Photos are present but were not ingested — this is a SYSTEM FAILURE, not claimant omission
    // CRITICAL: Do NOT add fraud points for a system failure
    logs.push('[Phase2] PHOTO_STATUS=SYSTEM_FAILURE: Photos detected but not processed. No fraud points added.');
    return {
      photoAnalysis: {
        analysisRequired: true,  // Must be analysed before final decision
        photoStatus: 'SYSTEM_FAILURE',
        fraudPointsAdded: 0,
        systemNote: 'Photos present but not ingested — manual review required.',
      },
      adjustedFraudScore,
      logs,
    };
  }

  if (photosActuallyPresent && photosActuallyProcessed) {
    // Photos present AND processed — analysis has been completed
    logs.push(`[Phase2] PHOTO_STATUS=ANALYSED: ${damagePhotoUrls.length} photo(s) processed.`);
    return {
      photoAnalysis: {
        analysisRequired: false,
        photoStatus: 'ANALYSED',
        fraudPointsAdded: 0,
        systemNote: `${damagePhotoUrls.length} damage photo(s) analysed successfully.`,
      },
      adjustedFraudScore,
      logs,
    };
  }

  if (!photosActuallyPresent && photosDetected === false) {
    // No photos submitted — claimant omission
    // Conditional scoring: if police report is present, add 5 points; otherwise add 8 points
    const fraudAddition = policeReportNumber && policeReportNumber.trim() !== '' ? 5 : 8;
    adjustedFraudScore = Math.min(100, currentFraudScore + fraudAddition);
    const note = policeReportNumber
      ? `No photos submitted (police report present — +${fraudAddition} fraud points).`
      : `No photos submitted and no police report recorded (+${fraudAddition} fraud points).`;
    logs.push(`[Phase2] PHOTO_STATUS=CLAIMANT_OMISSION: ${note}`);
    return {
      photoAnalysis: {
        analysisRequired: false,
        photoStatus: 'CLAIMANT_OMISSION',
        fraudPointsAdded: fraudAddition,
        systemNote: note,
      },
      adjustedFraudScore,
      logs,
    };
  }

  // photos_detected is null — unknown state
  logs.push('[Phase2] PHOTO_STATUS=NOT_APPLICABLE: Photo detection status unknown.');
  return {
    photoAnalysis: {
      analysisRequired: false,
      photoStatus: 'NOT_APPLICABLE',
      fraudPointsAdded: 0,
      systemNote: 'Photo detection status could not be determined.',
    },
    adjustedFraudScore,
    logs,
  };
}

// ─── Data Completeness Score ──────────────────────────────────────────────────

function computeDataCompleteness(input: Phase2Input): number {
  let present = 0;
  const total = REQUIRED_FIELDS.length;

  if (input.incidentType && input.incidentType !== 'REQUIRES_CLASSIFICATION') present++;
  if (input.authoritativeTotalUsd > 0) present++;
  if (input.repairerQuoteTotal !== null) present++;
  else if (input.repairerQuoteTotal === null) {
    // Explicit absence is acceptable if documented — treat as present
    // (caller should pass null only when truly unknown, not when explicitly "no quote")
  }
  if (input.photosDetected !== null) present++;
  if (input.policeReportNumber !== null) present++;

  return Math.round((present / total) * 100);
}

// ─── 2.3 Single Decision Authority ───────────────────────────────────────────

function resolveVerdict(
  fraudScore: number,
  physicsConsistencyScore: number,
  dataCompletenessScore: number,
  authoritativeTotalUsd: number,
  vehicleMarketValueCents: number | null,
  incidentType: string,
): { decision: FinalDecision; primaryDriver: string } {
  // Rule 1: ESCALATE — high fraud or very low physics consistency
  if (fraudScore >= FRAUD_BANDS.ESCALATE_THRESHOLD || physicsConsistencyScore < FRAUD_BANDS.PHYSICS_ESCALATE_THRESHOLD) {
    const driver = fraudScore >= FRAUD_BANDS.ESCALATE_THRESHOLD
      ? `Fraud score ${fraudScore}/100 exceeds escalation threshold (${FRAUD_BANDS.ESCALATE_THRESHOLD})`
      : `Physics consistency ${physicsConsistencyScore}% below escalation threshold (${FRAUD_BANDS.PHYSICS_ESCALATE_THRESHOLD}%)`;
    return { decision: 'ESCALATE', primaryDriver: driver };
  }

  // Rule 2: REVIEW — incomplete data
  if (dataCompletenessScore < 90) {
    return {
      decision: 'REVIEW',
      primaryDriver: `Data completeness ${dataCompletenessScore}% below required threshold (90%)`,
    };
  }

  // Rule 3: REVIEW — incident type unclassified
  if (incidentType === 'REQUIRES_CLASSIFICATION') {
    return {
      decision: 'REVIEW',
      primaryDriver: 'Incident type could not be automatically classified.',
    };
  }

  // Rule 4: REJECT — total loss (repair cost exceeds 60% of market value)
  if (vehicleMarketValueCents !== null && vehicleMarketValueCents > 0) {
    const marketValueUsd = vehicleMarketValueCents / 100;
    const repairRatio = authoritativeTotalUsd / marketValueUsd;
    if (repairRatio > TOTAL_LOSS_RATIO) {
      return {
        decision: 'REJECT',
        primaryDriver: `Repair cost (US$${authoritativeTotalUsd.toFixed(2)}) exceeds ${(TOTAL_LOSS_RATIO * 100).toFixed(0)}% of vehicle market value (US$${marketValueUsd.toFixed(2)}) — total loss threshold reached.`,
      };
    }
  }
  // If vehicleMarketValue is null/zero, skip total-loss check and default to REVIEW
  if (vehicleMarketValueCents === null || vehicleMarketValueCents === 0) {
    // Only escalate to REVIEW if we can't do the total-loss check and cost is high
    if (authoritativeTotalUsd > 5000) {
      return {
        decision: 'REVIEW',
        primaryDriver: 'Vehicle market value unavailable — total loss check could not be performed. Manual review required.',
      };
    }
  }

  // Rule 5: APPROVE — all checks passed
  return { decision: 'APPROVE', primaryDriver: 'All validation checks passed.' };
}

// ─── Confidence Estimation ────────────────────────────────────────────────────

function estimateConfidence(
  physicsConsistencyScore: number,
  dataCompletenessScore: number,
  fraudScore: number,
  photoStatus: string,
): number {
  // Base: average of physics consistency and data completeness
  let confidence = (physicsConsistencyScore + dataCompletenessScore) / 2;
  // Penalise for high fraud score (uncertainty increases)
  if (fraudScore >= 70) confidence -= 15;
  else if (fraudScore >= 50) confidence -= 8;
  // Penalise for system photo failure (data gap)
  if (photoStatus === 'SYSTEM_FAILURE') confidence -= 10;
  // Penalise for claimant omission
  if (photoStatus === 'CLAIMANT_OMISSION') confidence -= 5;
  return Math.max(10, Math.min(99, Math.round(confidence)));
}

// ─── Key Drivers Builder ──────────────────────────────────────────────────────

function buildKeyDrivers(
  fraudScore: number,
  physicsConsistencyScore: number,
  dataCompletenessScore: number,
  photoAnalysis: PhotoAnalysisRequirement,
  primaryDriver: string,
  suppressedConstraints: string[],
): string[] {
  const drivers: string[] = [primaryDriver];

  if (fraudScore >= 50) {
    drivers.push(`Fraud risk score: ${fraudScore}/100 — elevated indicators detected.`);
  }
  if (physicsConsistencyScore < 60) {
    drivers.push(`Physics consistency anomaly (${physicsConsistencyScore}%) — damage pattern vs. reported direction.`);
  }
  if (dataCompletenessScore < 90) {
    drivers.push(`Data completeness: ${dataCompletenessScore}% — one or more required fields are missing.`);
  }
  if (photoAnalysis.photoStatus === 'SYSTEM_FAILURE') {
    drivers.push('Photos present but not ingested — system error, not claimant omission.');
  }
  if (photoAnalysis.photoStatus === 'CLAIMANT_OMISSION') {
    drivers.push(`No photos submitted by claimant (+${photoAnalysis.fraudPointsAdded} fraud points applied).`);
  }
  if (suppressedConstraints.length > 0) {
    drivers.push(`Physics constraints suppressed at low Delta-V: ${suppressedConstraints.join(', ')}.`);
  }

  return drivers.slice(0, 5); // cap at 5 key drivers
}

// ─── Next Steps Builder ───────────────────────────────────────────────────────

function buildNextSteps(
  decision: FinalDecision,
  photoAnalysis: PhotoAnalysisRequirement,
  suppressedConstraints: string[],
  policeReportNumber: string | null,
  repairerQuoteTotal: number | null,
  authoritativeTotalUsd: number,
  incidentType: string,
): string[] {
  const steps: string[] = [];

  if (photoAnalysis.analysisRequired) {
    steps.push('Manually review damage photos — system failed to ingest them during processing.');
  }
  if (suppressedConstraints.includes('seatbelt_pretensioner')) {
    steps.push('Manually verify seatbelt pre-tensioner activation (low Delta-V recorded).');
  }
  if (repairerQuoteTotal !== null && Math.abs(repairerQuoteTotal - authoritativeTotalUsd) > 50) {
    steps.push(`Reconcile cost difference: repairer quote US$${repairerQuoteTotal.toFixed(2)} vs. AI estimate US$${authoritativeTotalUsd.toFixed(2)}.`);
  }
  if (!policeReportNumber || policeReportNumber.trim() === '') {
    steps.push('Obtain police case number (not recorded on claim form).');
  }
  if (incidentType === 'REQUIRES_CLASSIFICATION') {
    steps.push('Manually classify incident type — automatic classification was not possible from the description provided.');
  }
  if (decision === 'ESCALATE') {
    steps.push('Route to senior assessor for manual review — escalation threshold exceeded.');
  }
  if (decision === 'REJECT') {
    steps.push('Initiate total loss assessment — repair cost exceeds 60% of vehicle market value.');
  }

  return steps.slice(0, 6);
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────

export function runPhase2(input: Phase2Input): Phase2Output {
  const logs: string[] = [];

  // 2.4 — Classify incident type
  const { type: resolvedIncidentType, source: incidentSource } = classifyIncidentType(
    input.incidentType,
    input.incidentDescription,
  );
  if (incidentSource === 'description') {
    logs.push(`[Phase2] Incident type inferred from description: "${resolvedIncidentType}"`);
  } else if (incidentSource === 'unclassified') {
    logs.push('[Phase2] Incident type could not be classified — forcing REVIEW.');
  }

  // 2.1 — Physics threshold guard
  const { constraints, suppressedConstraints, advisories: physicsAdvisories } = runPhysicsThresholdGuard(
    input.deltaVKmh,
    input.structuralDamageSeverity,
  );

  // 2.2 — Circular logic prevention (photos)
  const { photoAnalysis, adjustedFraudScore, logs: photoLogs } = resolvePhotoStatus(
    input.photosDetected,
    input.photosProcessed,
    input.photosProcessedCount,
    input.damagePhotoUrls,
    input.policeReportNumber,
    input.fraudScore,
  );
  logs.push(...photoLogs);

  // Data completeness
  const dataCompletenessScore = input.dataCompletenessScore
    ?? computeDataCompleteness({ ...input, incidentType: resolvedIncidentType });

  // 2.3 — Single decision authority
  const { decision, primaryDriver } = resolveVerdict(
    adjustedFraudScore,
    input.physicsConsistencyScore,
    dataCompletenessScore,
    input.authoritativeTotalUsd,
    input.vehicleMarketValueCents,
    resolvedIncidentType,
  );
  logs.push(`[Phase2] Final decision: ${decision} — ${primaryDriver}`);

  // Confidence
  const confidence = estimateConfidence(
    input.physicsConsistencyScore,
    dataCompletenessScore,
    adjustedFraudScore,
    photoAnalysis.photoStatus,
  );

  // Key drivers
  const keyDrivers = buildKeyDrivers(
    adjustedFraudScore,
    input.physicsConsistencyScore,
    dataCompletenessScore,
    photoAnalysis,
    primaryDriver,
    suppressedConstraints,
  );

  // Next steps
  const nextSteps = buildNextSteps(
    decision,
    photoAnalysis,
    suppressedConstraints,
    input.policeReportNumber,
    input.repairerQuoteTotal,
    input.authoritativeTotalUsd,
    resolvedIncidentType,
  );

  // Advisories = physics advisories + photo system note (if failure)
  const advisories: string[] = [...physicsAdvisories];
  if (photoAnalysis.photoStatus === 'SYSTEM_FAILURE') {
    advisories.push(photoAnalysis.systemNote);
  }

  return {
    finalDecision: decision,
    confidence,
    fraudScore: adjustedFraudScore,
    physicsConsistency: input.physicsConsistencyScore,
    dataCompleteness: dataCompletenessScore,
    incidentType: resolvedIncidentType,
    photoAnalysis,
    physicsConstraints: constraints,
    suppressedConstraints,
    keyDrivers,
    nextSteps,
    advisories,
    logs,
  };
}
