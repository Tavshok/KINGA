/**
 * fraud-scoring.ts — KINGA AI Fraud Scoring Engine
 *
 * 10 indicators, 5-level risk scale, multi-indicator escalation.
 * Total max = 100 pts.
 *
 * Risk levels:
 *   0–15   Minimal Risk
 *   16–35  Low Risk
 *   36–55  Moderate Risk
 *   56–75  High Risk
 *   76–100 Very High Risk
 *
 * Escalation: raw score bumped one level when enough indicators are
 * simultaneously triggered (breadth penalty).
 *
 * Indicators and max scores:
 *  1. physicsMismatch         (15 pts)
 *  2. claimantDriverRisk      (12 pts)
 *  3. stagedAccident          (12 pts)
 *  4. panelBeaterPatterns     (12 pts)
 *  5. assessorIntegrity       (10 pts)
 *  6. crossEntityCollusion    (10 pts)
 *  7. documentPhotoIntegrity  (10 pts)
 *  8. costAnomalies           ( 8 pts)
 *  9. vehicleOwnershipRisk    ( 6 pts)
 * 10. claimTimingBehaviour    ( 5 pts)
 */

export type FraudRiskLevel =
  | "minimal"
  | "low"
  | "moderate"
  | "high"
  | "elevated";

export type IndicatorKey =
  | "physicsMismatch"
  | "claimantDriverRisk"
  | "stagedAccident"
  | "panelBeaterPatterns"
  | "assessorIntegrity"
  | "crossEntityCollusion"
  | "documentPhotoIntegrity"
  | "costAnomalies"
  | "vehicleOwnershipRisk"
  | "claimTimingBehaviour";

export interface SignalResult {
  id: string;
  label: string;
  points: number;
  evidence: string;
  indicator: IndicatorKey;
}

export interface IndicatorResult {
  score: number;
  maxScore: number;
  percentage: number;
  signals: SignalResult[];
  /** true when score >= 80% of maxScore */
  concentrationAlert: boolean;
}

export interface EscalationReason {
  from: FraudRiskLevel;
  to: FraudRiskLevel;
  triggeredIndicatorCount: number;
  threshold: number;
  description: string;
}

export interface RecommendedAction {
  code: string;
  description: string;
  urgency: "immediate" | "within_48h" | "standard";
  indicator?: IndicatorKey;
}

export interface FraudScoreBreakdown {
  rawScore: number;
  totalScore: number;
  riskLevel: FraudRiskLevel;
  riskLevelLabel: string;
  triggeredIndicatorCount: number;
  indicators: Record<IndicatorKey, IndicatorResult>;
  triggeredSignals: SignalResult[];
  concentrationAlerts: IndicatorKey[];
  escalation: EscalationReason | null;
  recommendedActions: RecommendedAction[];
  requiresInvestigation: boolean;
}

export interface FraudScoringInput {
  physics?: {
    damageConsistencyScore?: number;
    impossibleDamagePatterns?: string[];
    unrelatedDamageComponents?: Array<{ name: string; distanceFromImpact: number }>;
    severityMismatch?: boolean;
    stagedAccidentIndicators?: string[];
    estimatedSpeedKmh?: number;
    structuralDamage?: boolean;
    impactForceKn?: number;
  };
  claimant?: {
    isNonOwnerDriver?: boolean;
    driverRelationshipToOwner?: string;
    policyAgeDays?: number;
    submissionDelayDays?: number;
    previousClaimsCount?: number;
    driverLicenseSuspended?: boolean;
    driverLicenseVerified?: boolean;
    driverViolationsCount?: number;
    driverEmploymentStatus?: string;
    previousInsurerCount?: number;
    lodgedBy?: string;
    driverAge?: number;
  };
  staged?: {
    estimatedSpeedKmh?: number;
    damageSeverityScore?: number;
    numberOfInjuryClaims?: number;
    hasWitnesses?: boolean;
    hasDashcamFootage?: boolean;
    hasPoliceReport?: boolean;
    incidentHour?: number;
    geographicRiskZone?: string;
    isSolePartyNightAccident?: boolean;
  };
  panelBeater?: {
    quoteSimilarityScore?: number;
    extraInQuoteCount?: number;
    extraInQuoteCost?: number;
    partsInflationPercent?: number;
    labourInflationPercent?: number;
    replacementToRepairRatio?: number;
    damageScopeCreep?: boolean;
    unrelatedQuoteItems?: number;
    quotedTotalUsd?: number;
    aiEstimatedTotalUsd?: number;
  };
  assessor?: {
    rubberStampingScore?: number;
    biasScore?: number;
    collusionScore?: number;
    averageTurnaroundHours?: number;
    accuracyScore?: number;
    claimsWithSamePanelBeaterCount?: number;
  };
  collusion?: {
    triadRepeatCount?: number;
    sharedContactWithPanelBeater?: boolean;
    sharedContactWithAssessor?: boolean;
    entityCollusionScore?: number;
    claimantSamePanelBeaterCount?: number;
  };
  documents?: {
    photoMetadataScore?: number;
    reusedPhotoScore?: number;
    documentConsistencyScore?: number;
    hasHandwrittenQuote?: boolean;
    ocrConfidence?: number;
    missingDocumentCount?: number;
  };
  costs?: {
    quotedTotalUsd?: number;
    aiEstimatedTotalUsd?: number;
    repairToValueRatio?: number;
    overpricedPartsCount?: number;
  };
  vehicle?: {
    vehicleAgeYears?: number;
    estimatedVehicleValueUsd?: number;
    estimatedRepairCostUsd?: number;
    ownershipTransferDaysBeforeClaim?: number;
    vinMismatch?: boolean;
    previousAccidentCount?: number;
    isHighValueVehicle?: boolean;
  };
  timing?: {
    claimSubmittedOnWeekend?: boolean;
    claimSubmittedOnHoliday?: boolean;
    rapidResubmission?: boolean;
    policyLapseNoticeDaysBefore?: number;
    incidentToSubmissionDays?: number;
    multipleClaimsInPeriod?: number;
  };
  mlResult?: {
    fraud_probability?: number;
    ownership_risk_score?: number;
    staged_accident_indicators?: { confidence?: number };
    driver_profile?: { risk_score?: number };
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function cap(value: number, max: number): number {
  return Math.min(Math.max(0, Math.round(value)), max);
}

function sig(
  id: string,
  label: string,
  points: number,
  evidence: string,
  indicator: IndicatorKey
): SignalResult {
  return { id, label, points, evidence, indicator };
}

function buildIndicator(signals: SignalResult[], maxScore: number): IndicatorResult {
  const raw = signals.reduce((acc, x) => acc + x.points, 0);
  const score = cap(raw, maxScore);
  return {
    score,
    maxScore,
    percentage: maxScore > 0 ? Math.round((score / maxScore) * 1000) / 10 : 0,
    signals,
    concentrationAlert: score >= Math.ceil(maxScore * 0.8),
  };
}

function rawRiskLevel(score: number): FraudRiskLevel {
  if (score >= 76) return "elevated";
  if (score >= 56) return "high";
  if (score >= 36) return "moderate";
  if (score >= 16) return "low";
  return "minimal";
}

export const RISK_LEVEL_LABELS: Record<FraudRiskLevel, string> = {
  minimal:   "Minimal Risk",
  low:       "Low Risk",
  moderate:  "Moderate Risk",
  high:      "High Risk",
  elevated: "Elevated Risk",
};

const LEVEL_ORDER: FraudRiskLevel[] = ["minimal", "low", "moderate", "high", "elevated"];

function bumpLevel(level: FraudRiskLevel): FraudRiskLevel {
  const idx = LEVEL_ORDER.indexOf(level);
  return idx < LEVEL_ORDER.length - 1 ? LEVEL_ORDER[idx + 1] : level;
}

// ─── Indicator 1: Physics Mismatch (max 15 pts) ───────────────────────────────

function scorePhysicsMismatch(input: FraudScoringInput): IndicatorResult {
  const p = input.physics ?? {};
  const signals: SignalResult[] = [];

  const cs = p.damageConsistencyScore ?? 100;
  if (cs < 30) {
    signals.push(sig("phys.cs.severe", "Severe physics inconsistency (score < 30)", 6,
      `Damage consistency score: ${cs}/100 — damage pattern highly inconsistent with reported impact`, "physicsMismatch"));
  } else if (cs < 55) {
    signals.push(sig("phys.cs.moderate", "Moderate physics inconsistency (score 30–55)", 3,
      `Damage consistency score: ${cs}/100`, "physicsMismatch"));
  } else {
    signals.push(sig("phys.cs.ok", "Damage pattern consistent with reported impact", 0,
      `Damage consistency score: ${cs}/100`, "physicsMismatch"));
  }

  const impossible = p.impossibleDamagePatterns ?? [];
  if (impossible.length >= 2) {
    signals.push(sig("phys.imp.multi", `Multiple impossible damage patterns (${impossible.length})`, 5,
      impossible.slice(0, 2).join("; "), "physicsMismatch"));
  } else if (impossible.length === 1) {
    signals.push(sig("phys.imp.single", "Impossible damage pattern detected", 3,
      impossible[0], "physicsMismatch"));
  } else {
    signals.push(sig("phys.imp.none", "No impossible damage patterns", 0,
      "All damage patterns are physically consistent", "physicsMismatch"));
  }

  const unrelated = p.unrelatedDamageComponents ?? [];
  if (unrelated.length > 0) {
    signals.push(sig("phys.unrelated", `${unrelated.length} component(s) outside impact zone`,
      Math.min(4, unrelated.length * 2),
      unrelated.map(c => `${c.name} (${c.distanceFromImpact.toFixed(1)}m from impact)`).join("; "),
      "physicsMismatch"));
  } else {
    signals.push(sig("phys.unrelated.none", "No unrelated damage components", 0,
      "All damaged components within expected impact zone", "physicsMismatch"));
  }

  if (p.severityMismatch) {
    signals.push(sig("phys.sev.mismatch", "Speed/damage severity mismatch", 5,
      "Reported impact speed inconsistent with observed damage severity", "physicsMismatch"));
  } else {
    signals.push(sig("phys.sev.ok", "Speed/damage severity consistent", 0,
      "No severity mismatch detected", "physicsMismatch"));
  }

  const staged = p.stagedAccidentIndicators ?? [];
  if (staged.length >= 2) {
    signals.push(sig("phys.staged.multi", `Multiple physics-based staging indicators (${staged.length})`, 4,
      staged.slice(0, 2).join("; "), "physicsMismatch"));
  } else if (staged.length === 1) {
    signals.push(sig("phys.staged.single", "Physics-based staging indicator detected", 2,
      staged[0], "physicsMismatch"));
  } else {
    signals.push(sig("phys.staged.none", "No physics-based staging indicators", 0,
      "Physics analysis found no staging indicators", "physicsMismatch"));
  }

  return buildIndicator(signals, 15);
}

// ─── Indicator 2: Claimant & Driver Risk (max 12 pts) ─────────────────────────

function scoreClaimantDriverRisk(input: FraudScoringInput): IndicatorResult {
  const c = input.claimant ?? {};
  const signals: SignalResult[] = [];

  const age = c.policyAgeDays ?? 365;
  if (age < 30) {
    signals.push(sig("cdr.policy.veryNew", "Very new policy (< 30 days)", 5,
      `Policy is ${age} days old — claim filed very shortly after inception`, "claimantDriverRisk"));
  } else if (age < 90) {
    signals.push(sig("cdr.policy.new", "New policy (30–90 days)", 2,
      `Policy is ${age} days old`, "claimantDriverRisk"));
  } else {
    signals.push(sig("cdr.policy.ok", "Policy age acceptable", 0,
      `Policy is ${age} days old`, "claimantDriverRisk"));
  }

  const delay = c.submissionDelayDays ?? 0;
  if (delay > 60) {
    signals.push(sig("cdr.delay.severe", "Severely delayed submission (> 60 days)", 4,
      `Claim submitted ${delay} days after incident`, "claimantDriverRisk"));
  } else if (delay > 30) {
    signals.push(sig("cdr.delay.moderate", "Delayed submission (30–60 days)", 2,
      `Claim submitted ${delay} days after incident`, "claimantDriverRisk"));
  } else {
    signals.push(sig("cdr.delay.ok", "Timely submission", 0,
      `Claim submitted ${delay} days after incident`, "claimantDriverRisk"));
  }

  const prev = c.previousClaimsCount ?? 0;
  if (prev >= 3) {
    signals.push(sig("cdr.prev.high", `High previous claims count (${prev})`, 4,
      `Claimant has ${prev} previous claims on record`, "claimantDriverRisk"));
  } else if (prev === 2) {
    signals.push(sig("cdr.prev.moderate", "2 previous claims on record", 2,
      "Claimant has 2 previous claims", "claimantDriverRisk"));
  } else {
    signals.push(sig("cdr.prev.ok", "No significant previous claims history", 0,
      `${prev} previous claim(s)`, "claimantDriverRisk"));
  }

  if (c.driverLicenseSuspended) {
    signals.push(sig("cdr.lic.suspended", "Driver license is suspended", 4,
      "Driver was operating vehicle with a suspended license", "claimantDriverRisk"));
  } else {
    signals.push(sig("cdr.lic.ok", "Driver license is valid", 0,
      "No license suspension on record", "claimantDriverRisk"));
  }

  if (c.driverLicenseVerified === false) {
    signals.push(sig("cdr.lic.unverified", "Driver license could not be verified", 2,
      "License verification failed or was not completed", "claimantDriverRisk"));
  } else {
    signals.push(sig("cdr.lic.verified", "Driver license verified", 0,
      "License successfully verified", "claimantDriverRisk"));
  }

  const violations = c.driverViolationsCount ?? 0;
  if (violations >= 3) {
    signals.push(sig("cdr.violations.high", `High violation count (${violations})`, 2,
      `${violations} traffic violations on record`, "claimantDriverRisk"));
  } else {
    signals.push(sig("cdr.violations.ok", "No significant violation history", 0,
      `${violations} violation(s)`, "claimantDriverRisk"));
  }

  if (c.isNonOwnerDriver) {
    signals.push(sig("cdr.nonOwner", "Driver is not the vehicle owner", 1,
      `Driver relationship to owner: ${c.driverRelationshipToOwner ?? "unknown"}`, "claimantDriverRisk"));
  } else {
    signals.push(sig("cdr.nonOwner.none", "Driver is the vehicle owner", 0,
      "Driver and owner are the same person", "claimantDriverRisk"));
  }

  return buildIndicator(signals, 12);
}

// ─── Indicator 3: Staged Accident (max 12 pts) ────────────────────────────────

function scoreStagedAccident(input: FraudScoringInput): IndicatorResult {
  const st = input.staged ?? {};
  const ml = input.mlResult ?? {};
  const signals: SignalResult[] = [];

  const speed = st.estimatedSpeedKmh ?? 50;
  const dmg = st.damageSeverityScore ?? 0.5;
  if (speed < 30 && dmg > 0.7) {
    signals.push(sig("stg.lowSpeedHighDmg.severe", "Low speed with high damage severity", 6,
      `Speed: ${speed} km/h, damage severity: ${(dmg * 100).toFixed(0)}% — inconsistent combination`, "stagedAccident"));
  } else if (speed < 20 && dmg > 0.5) {
    signals.push(sig("stg.lowSpeedHighDmg.moderate", "Very low speed with moderate damage", 3,
      `Speed: ${speed} km/h, damage severity: ${(dmg * 100).toFixed(0)}%`, "stagedAccident"));
  } else {
    signals.push(sig("stg.lowSpeedHighDmg.none", "Speed/damage combination plausible", 0,
      `Speed: ${speed} km/h, damage severity: ${(dmg * 100).toFixed(0)}%`, "stagedAccident"));
  }

  const injuries = st.numberOfInjuryClaims ?? 0;
  if (injuries > 2) {
    signals.push(sig("stg.injuries.high", `Multiple injury claims (${injuries})`, 5,
      `${injuries} injury claims filed — elevated staging indicator`, "stagedAccident"));
  } else if (injuries > 0) {
    signals.push(sig("stg.injuries.low", "Injury claim filed", 2,
      `${injuries} injury claim(s) filed`, "stagedAccident"));
  } else {
    signals.push(sig("stg.injuries.none", "No injury claims", 0,
      "No injury claims filed", "stagedAccident"));
  }

  const noWitnesses = !(st.hasWitnesses ?? false);
  const noDashcam = !(st.hasDashcamFootage ?? false);
  if (noWitnesses && noDashcam) {
    signals.push(sig("stg.noCorroboration", "No witnesses and no dashcam footage", 3,
      "Accident has no independent corroboration — circumstances cannot be independently verified", "stagedAccident"));
  } else {
    signals.push(sig("stg.noCorroboration.none", "Corroborating evidence present", 0,
      `Witnesses: ${!noWitnesses}, Dashcam: ${!noDashcam}`, "stagedAccident"));
  }

  if (!(st.hasPoliceReport ?? false)) {
    signals.push(sig("stg.noPoliceReport", "No police report filed", 2,
      "No police report was filed for this incident", "stagedAccident"));
  } else {
    signals.push(sig("stg.noPoliceReport.none", "Police report on file", 0,
      "Police report filed", "stagedAccident"));
  }

  const hour = st.incidentHour;
  if (hour !== undefined && hour >= 0 && hour <= 5) {
    signals.push(sig("stg.lateNight", "Late-night incident (00:00–05:00)", 2,
      `Incident at ${hour.toString().padStart(2, "0")}:00 — elevated staging risk during late-night hours`, "stagedAccident"));
  } else {
    signals.push(sig("stg.lateNight.none", "Incident time not a risk factor", 0,
      hour !== undefined ? `Incident hour: ${hour}:00` : "Incident time not recorded", "stagedAccident"));
  }

  const geo = st.geographicRiskZone ?? "low";
  if (geo === "high") {
    signals.push(sig("stg.geo.high", "High-risk geographic zone", 3,
      "Incident location is in a known fraud hotspot zone", "stagedAccident"));
  } else if (geo === "medium") {
    signals.push(sig("stg.geo.medium", "Medium-risk geographic zone", 1,
      "Incident location is in a medium-risk zone", "stagedAccident"));
  } else {
    signals.push(sig("stg.geo.none", "Low-risk geographic zone", 0,
      "Incident location is not a known fraud hotspot", "stagedAccident"));
  }

  if (st.isSolePartyNightAccident) {
    signals.push(sig("stg.solePartyNight", "Sole-party night accident", 3,
      "Single-vehicle accident at night with no witnesses — elevated staging risk", "stagedAccident"));
  } else {
    signals.push(sig("stg.solePartyNight.none", "Not a sole-party night accident", 0,
      "Accident involves multiple parties or occurred during daylight", "stagedAccident"));
  }

  const stagedConf = ml.staged_accident_indicators?.confidence ?? 0;
  if (stagedConf > 0.6) {
    signals.push(sig("stg.ml.high", "ML model: high staged accident confidence", 2,
      `ML staged accident confidence: ${(stagedConf * 100).toFixed(0)}%`, "stagedAccident"));
  } else if (stagedConf > 0.35) {
    signals.push(sig("stg.ml.medium", "ML model: moderate staged accident confidence", 1,
      `ML staged accident confidence: ${(stagedConf * 100).toFixed(0)}%`, "stagedAccident"));
  } else {
    signals.push(sig("stg.ml.none", "ML model: low staged accident confidence", 0,
      `ML staged accident confidence: ${(stagedConf * 100).toFixed(0)}%`, "stagedAccident"));
  }

  return buildIndicator(signals, 12);
}

// ─── Indicator 4: Panel Beater Patterns (max 12 pts) ─────────────────────────

function scorePanelBeaterPatterns(input: FraudScoringInput): IndicatorResult {
  const pb = input.panelBeater ?? {};
  const signals: SignalResult[] = [];

  const extraCount = pb.extraInQuoteCount ?? 0;
  const extraCost = pb.extraInQuoteCost ?? 0;
  if (extraCount >= 5) {
    signals.push(sig("pb.extra.high", `High undetected items in quote (${extraCount})`, 5,
      `${extraCount} items quoted but not detected by AI — value: $${extraCost.toFixed(0)}`, "panelBeaterPatterns"));
  } else if (extraCount >= 2) {
    signals.push(sig("pb.extra.moderate", `Undetected items in quote (${extraCount})`, 2,
      `${extraCount} items not detected by AI — value: $${extraCost.toFixed(0)}`, "panelBeaterPatterns"));
  } else {
    signals.push(sig("pb.extra.none", "Quote items match AI-detected damage", 0,
      "No significant discrepancy between quoted and detected items", "panelBeaterPatterns"));
  }

  const partsInfl = pb.partsInflationPercent ?? 0;
  if (partsInfl > 50) {
    signals.push(sig("pb.parts.high", `Severe parts price inflation (${partsInfl.toFixed(0)}% above market)`, 4,
      `Parts quoted at ${partsInfl.toFixed(0)}% above market baseline`, "panelBeaterPatterns"));
  } else if (partsInfl > 25) {
    signals.push(sig("pb.parts.moderate", `Moderate parts inflation (${partsInfl.toFixed(0)}%)`, 2,
      `Parts quoted at ${partsInfl.toFixed(0)}% above market baseline`, "panelBeaterPatterns"));
  } else {
    signals.push(sig("pb.parts.none", "Parts pricing within market range", 0,
      `Parts inflation: ${partsInfl.toFixed(0)}%`, "panelBeaterPatterns"));
  }

  const labourInfl = pb.labourInflationPercent ?? 0;
  if (labourInfl > 40) {
    signals.push(sig("pb.labour.high", `Excessive labour hours (${labourInfl.toFixed(0)}% above benchmark)`, 3,
      `Labour quoted at ${labourInfl.toFixed(0)}% above industry benchmark`, "panelBeaterPatterns"));
  } else if (labourInfl > 20) {
    signals.push(sig("pb.labour.moderate", `Elevated labour hours (${labourInfl.toFixed(0)}%)`, 1,
      `Labour quoted at ${labourInfl.toFixed(0)}% above benchmark`, "panelBeaterPatterns"));
  } else {
    signals.push(sig("pb.labour.none", "Labour hours within benchmark", 0,
      `Labour inflation: ${labourInfl.toFixed(0)}%`, "panelBeaterPatterns"));
  }

  const unrelatedItems = pb.unrelatedQuoteItems ?? 0;
  if (unrelatedItems >= 3) {
    signals.push(sig("pb.unrelated.high", `Multiple unrelated items in quote (${unrelatedItems})`, 3,
      `${unrelatedItems} quoted items outside expected impact zone`, "panelBeaterPatterns"));
  } else if (unrelatedItems >= 1) {
    signals.push(sig("pb.unrelated.low", `Unrelated item(s) in quote (${unrelatedItems})`, 1,
      `${unrelatedItems} item(s) outside impact zone`, "panelBeaterPatterns"));
  } else {
    signals.push(sig("pb.unrelated.none", "All quoted items within impact zone", 0,
      "No unrelated items detected", "panelBeaterPatterns"));
  }

  const quoted = pb.quotedTotalUsd ?? 0;
  const estimated = pb.aiEstimatedTotalUsd ?? 0;
  if (estimated > 0 && quoted > 0) {
    const overage = ((quoted - estimated) / estimated) * 100;
    if (overage > 80) {
      signals.push(sig("pb.overage.severe", `Quote severely exceeds AI estimate (${overage.toFixed(0)}% over)`, 4,
        `Quoted: $${quoted.toFixed(0)} vs AI estimate: $${estimated.toFixed(0)} — ${overage.toFixed(0)}% overage`, "panelBeaterPatterns"));
    } else if (overage > 40) {
      signals.push(sig("pb.overage.moderate", `Quote exceeds AI estimate (${overage.toFixed(0)}% over)`, 2,
        `Quoted: $${quoted.toFixed(0)} vs AI estimate: $${estimated.toFixed(0)}`, "panelBeaterPatterns"));
    } else {
      signals.push(sig("pb.overage.none", "Quote within acceptable range of AI estimate", 0,
        `Quoted: $${quoted.toFixed(0)} vs AI estimate: $${estimated.toFixed(0)}`, "panelBeaterPatterns"));
    }
  }

  if (pb.damageScopeCreep) {
    signals.push(sig("pb.scopeCreep", "Damage scope creep detected", 2,
      "Quoted damage scope has expanded beyond initial assessment without new incident", "panelBeaterPatterns"));
  }

  return buildIndicator(signals, 12);
}

// ─── Indicator 5: Assessor Integrity (max 10 pts) ─────────────────────────────

function scoreAssessorIntegrity(input: FraudScoringInput): IndicatorResult {
  const a = input.assessor;
  const signals: SignalResult[] = [];

  if (!a) {
    signals.push(sig("asr.noData", "No assessor data available", 0,
      "Assessor integrity cannot be evaluated — no assessor assigned or data unavailable", "assessorIntegrity"));
    return buildIndicator(signals, 10);
  }

  const rs = a.rubberStampingScore ?? 0;
  if (rs >= 70) {
    signals.push(sig("asr.rubber.high", `High rubber-stamping score (${rs}/100)`, 4,
      `Assessor rubber-stamping score: ${rs}/100 — consistently approves without adequate scrutiny`, "assessorIntegrity"));
  } else if (rs >= 40) {
    signals.push(sig("asr.rubber.moderate", `Moderate rubber-stamping (${rs}/100)`, 2,
      `Rubber-stamping score: ${rs}/100`, "assessorIntegrity"));
  } else {
    signals.push(sig("asr.rubber.ok", "Assessor applies appropriate scrutiny", 0,
      `Rubber-stamping score: ${rs}/100`, "assessorIntegrity"));
  }

  const bias = a.biasScore ?? 0;
  if (bias >= 60) {
    signals.push(sig("asr.bias.high", `High assessor bias score (${bias}/100)`, 3,
      `Bias score: ${bias}/100 — consistently favours claimants or specific panel beaters`, "assessorIntegrity"));
  } else if (bias >= 35) {
    signals.push(sig("asr.bias.moderate", `Moderate assessor bias (${bias}/100)`, 1,
      `Bias score: ${bias}/100`, "assessorIntegrity"));
  } else {
    signals.push(sig("asr.bias.ok", "Assessor bias within acceptable range", 0,
      `Bias score: ${bias}/100`, "assessorIntegrity"));
  }

  const turnaround = a.averageTurnaroundHours ?? 24;
  if (turnaround < 2) {
    signals.push(sig("asr.turnaround.fast", `Suspiciously fast turnaround (${turnaround.toFixed(1)} hrs)`, 3,
      `Average assessment completed in ${turnaround.toFixed(1)} hours — insufficient time for thorough review`, "assessorIntegrity"));
  } else if (turnaround < 4) {
    signals.push(sig("asr.turnaround.moderate", `Very fast turnaround (${turnaround.toFixed(1)} hrs)`, 1,
      `Average turnaround: ${turnaround.toFixed(1)} hours`, "assessorIntegrity"));
  } else {
    signals.push(sig("asr.turnaround.ok", "Assessment turnaround time is reasonable", 0,
      `Average turnaround: ${turnaround.toFixed(1)} hours`, "assessorIntegrity"));
  }

  const samePB = a.claimsWithSamePanelBeaterCount ?? 0;
  if (samePB >= 5) {
    signals.push(sig("asr.samePB.high", `Assessor repeatedly uses same panel beater (${samePB} claims)`, 3,
      `${samePB} claims sent to the same panel beater by this assessor`, "assessorIntegrity"));
  } else if (samePB >= 3) {
    signals.push(sig("asr.samePB.moderate", `Assessor frequently uses same panel beater (${samePB} claims)`, 1,
      `${samePB} claims with same panel beater`, "assessorIntegrity"));
  } else {
    signals.push(sig("asr.samePB.ok", "No unusual panel beater concentration", 0,
      `${samePB} claims with same panel beater`, "assessorIntegrity"));
  }

  const accuracy = a.accuracyScore ?? 80;
  if (accuracy < 50) {
    signals.push(sig("asr.accuracy.low", `Low assessor accuracy score (${accuracy}/100)`, 2,
      `Accuracy score: ${accuracy}/100 — high rate of incorrect assessments`, "assessorIntegrity"));
  } else {
    signals.push(sig("asr.accuracy.ok", "Assessor accuracy acceptable", 0,
      `Accuracy score: ${accuracy}/100`, "assessorIntegrity"));
  }

  return buildIndicator(signals, 10);
}

// ─── Indicator 6: Cross-Entity Collusion (max 10 pts) ────────────────────────

function scoreCrossEntityCollusion(input: FraudScoringInput): IndicatorResult {
  const col = input.collusion;
  const signals: SignalResult[] = [];

  if (!col) {
    signals.push(sig("col.noData", "No collusion data available", 0,
      "Cross-entity collusion cannot be evaluated — entity relationship data unavailable", "crossEntityCollusion"));
    return buildIndicator(signals, 10);
  }

  const triad = col.triadRepeatCount ?? 0;
  if (triad >= 3) {
    signals.push(sig("col.triad.high", `Claimant–PB–Assessor triad repeated ${triad} times`, 5,
      `This exact claimant–panel beater–assessor combination has appeared ${triad} times — strong collusion indicator`, "crossEntityCollusion"));
  } else if (triad >= 2) {
    signals.push(sig("col.triad.moderate", `Triad repeated ${triad} times`, 3,
      `Same triad appeared ${triad} times`, "crossEntityCollusion"));
  } else {
    signals.push(sig("col.triad.none", "No triad repeat detected", 0,
      "This claimant–panel beater–assessor combination is unique", "crossEntityCollusion"));
  }

  if (col.sharedContactWithPanelBeater && col.sharedContactWithAssessor) {
    signals.push(sig("col.contacts.both", "Claimant shares contacts with both panel beater and assessor", 5,
      "Network analysis detected shared contacts between claimant, panel beater, and assessor", "crossEntityCollusion"));
  } else if (col.sharedContactWithPanelBeater) {
    signals.push(sig("col.contacts.pb", "Claimant shares contacts with panel beater", 3,
      "Network analysis detected shared contacts between claimant and panel beater", "crossEntityCollusion"));
  } else if (col.sharedContactWithAssessor) {
    signals.push(sig("col.contacts.asr", "Claimant shares contacts with assessor", 3,
      "Network analysis detected shared contacts between claimant and assessor", "crossEntityCollusion"));
  } else {
    signals.push(sig("col.contacts.none", "No shared contacts detected", 0,
      "No network connections between claimant and panel beater/assessor", "crossEntityCollusion"));
  }

  const entityScore = col.entityCollusionScore ?? 0;
  if (entityScore >= 70) {
    signals.push(sig("col.entity.high", `High entity collusion score (${entityScore}/100)`, 4,
      `Entity relationship analysis: ${entityScore}/100`, "crossEntityCollusion"));
  } else if (entityScore >= 40) {
    signals.push(sig("col.entity.moderate", `Moderate entity collusion score (${entityScore}/100)`, 2,
      `Entity collusion score: ${entityScore}/100`, "crossEntityCollusion"));
  } else {
    signals.push(sig("col.entity.ok", "Entity collusion score is low", 0,
      `Entity collusion score: ${entityScore}/100`, "crossEntityCollusion"));
  }

  const samePB = col.claimantSamePanelBeaterCount ?? 0;
  if (samePB >= 3) {
    signals.push(sig("col.claimantPB.high", `Claimant repeatedly uses same panel beater (${samePB} claims)`, 3,
      `Claimant has used this panel beater for ${samePB} previous claims`, "crossEntityCollusion"));
  } else if (samePB >= 2) {
    signals.push(sig("col.claimantPB.moderate", `Claimant has used same panel beater before (${samePB} claims)`, 1,
      `${samePB} previous claims with same panel beater`, "crossEntityCollusion"));
  } else {
    signals.push(sig("col.claimantPB.none", "No unusual panel beater repeat pattern", 0,
      `${samePB} previous claims with same panel beater`, "crossEntityCollusion"));
  }

  return buildIndicator(signals, 10);
}

// ─── Indicator 7: Document & Photo Integrity (max 10 pts) ────────────────────

function scoreDocumentPhotoIntegrity(input: FraudScoringInput): IndicatorResult {
  const d = input.documents;
  const signals: SignalResult[] = [];

  if (!d) {
    signals.push(sig("doc.noData", "No document integrity data available", 0,
      "Document/photo integrity cannot be evaluated", "documentPhotoIntegrity"));
    return buildIndicator(signals, 10);
  }

  const meta = d.photoMetadataScore ?? 100;
  if (meta < 30) {
    signals.push(sig("doc.meta.severe", "Severe photo metadata anomaly", 4,
      `Photo metadata score: ${meta}/100 — timestamps, GPS, or device data are inconsistent`, "documentPhotoIntegrity"));
  } else if (meta < 60) {
    signals.push(sig("doc.meta.moderate", "Moderate photo metadata anomaly", 2,
      `Photo metadata score: ${meta}/100`, "documentPhotoIntegrity"));
  } else {
    signals.push(sig("doc.meta.ok", "Photo metadata is consistent", 0,
      `Photo metadata score: ${meta}/100`, "documentPhotoIntegrity"));
  }

  const reused = d.reusedPhotoScore ?? 0;
  if (reused >= 70) {
    signals.push(sig("doc.reused.high", "High probability of reused/recycled photos", 4,
      `Reused photo score: ${reused}/100 — images may have been used in previous claims`, "documentPhotoIntegrity"));
  } else if (reused >= 40) {
    signals.push(sig("doc.reused.moderate", "Possible reused photos detected", 2,
      `Reused photo score: ${reused}/100`, "documentPhotoIntegrity"));
  } else {
    signals.push(sig("doc.reused.none", "No photo reuse detected", 0,
      `Reused photo score: ${reused}/100`, "documentPhotoIntegrity"));
  }

  const docCs = d.documentConsistencyScore ?? 100;
  if (docCs < 40) {
    signals.push(sig("doc.consistency.low", "Low document consistency score", 3,
      `Document consistency: ${docCs}/100 — dates, names, or values inconsistent across documents`, "documentPhotoIntegrity"));
  } else if (docCs < 70) {
    signals.push(sig("doc.consistency.moderate", "Moderate document consistency issues", 1,
      `Document consistency: ${docCs}/100`, "documentPhotoIntegrity"));
  } else {
    signals.push(sig("doc.consistency.ok", "Documents are consistent", 0,
      `Document consistency: ${docCs}/100`, "documentPhotoIntegrity"));
  }

  if (d.hasHandwrittenQuote) {
    signals.push(sig("doc.handwritten", "Handwritten quote submitted", 2,
      "Quote submitted in handwritten form — harder to verify and more susceptible to manipulation", "documentPhotoIntegrity"));
  } else {
    signals.push(sig("doc.handwritten.none", "Typed/digital quote submitted", 0,
      "Quote is in typed or digital format", "documentPhotoIntegrity"));
  }

  const missing = d.missingDocumentCount ?? 0;
  if (missing >= 3) {
    signals.push(sig("doc.missing.high", `Multiple missing documents (${missing})`, 2,
      `${missing} required documents are missing from the claim`, "documentPhotoIntegrity"));
  } else if (missing >= 1) {
    signals.push(sig("doc.missing.low", `Missing document(s) (${missing})`, 1,
      `${missing} document(s) missing`, "documentPhotoIntegrity"));
  } else {
    signals.push(sig("doc.missing.none", "All required documents present", 0,
      "No missing documents", "documentPhotoIntegrity"));
  }

  return buildIndicator(signals, 10);
}

// ─── Indicator 8: Cost Anomalies (max 8 pts) ──────────────────────────────────

function scoreCostAnomalies(input: FraudScoringInput): IndicatorResult {
  const c = input.costs ?? {};
  const signals: SignalResult[] = [];

  const quoted = c.quotedTotalUsd ?? 0;
  const estimated = c.aiEstimatedTotalUsd ?? 0;
  if (estimated > 0 && quoted > 0) {
    const overage = ((quoted - estimated) / estimated) * 100;
    if (overage > 100) {
      signals.push(sig("cost.overage.extreme", `Quote more than double AI estimate (${overage.toFixed(0)}% over)`, 4,
        `Quoted: $${quoted.toFixed(0)} vs AI estimate: $${estimated.toFixed(0)} — ${overage.toFixed(0)}% overage`, "costAnomalies"));
    } else if (overage > 50) {
      signals.push(sig("cost.overage.high", `Quote significantly exceeds AI estimate (${overage.toFixed(0)}% over)`, 2,
        `Quoted: $${quoted.toFixed(0)} vs AI estimate: $${estimated.toFixed(0)}`, "costAnomalies"));
    } else {
      signals.push(sig("cost.overage.ok", "Quote within acceptable range of AI estimate", 0,
        `Quoted: $${quoted.toFixed(0)} vs AI estimate: $${estimated.toFixed(0)}`, "costAnomalies"));
    }
  }

  const rtv = c.repairToValueRatio ?? 0;
  if (rtv > 75) {
    signals.push(sig("cost.rtv.extreme", `Extreme repair-to-value ratio (${rtv.toFixed(0)}%)`, 4,
      `Repair cost is ${rtv.toFixed(0)}% of vehicle value — total loss threshold exceeded`, "costAnomalies"));
  } else if (rtv > 50) {
    signals.push(sig("cost.rtv.high", `High repair-to-value ratio (${rtv.toFixed(0)}%)`, 2,
      `Repair cost is ${rtv.toFixed(0)}% of vehicle value`, "costAnomalies"));
  } else {
    signals.push(sig("cost.rtv.ok", "Repair-to-value ratio is acceptable", 0,
      `Repair-to-value ratio: ${rtv.toFixed(0)}%`, "costAnomalies"));
  }

  const overpriced = c.overpricedPartsCount ?? 0;
  if (overpriced >= 4) {
    signals.push(sig("cost.overpriced.high", `Multiple overpriced parts (${overpriced})`, 3,
      `${overpriced} parts priced > 50% above market rate`, "costAnomalies"));
  } else if (overpriced >= 2) {
    signals.push(sig("cost.overpriced.moderate", `Overpriced parts detected (${overpriced})`, 1,
      `${overpriced} parts above market rate`, "costAnomalies"));
  } else {
    signals.push(sig("cost.overpriced.none", "Parts pricing within market range", 0,
      `${overpriced} overpriced part(s)`, "costAnomalies"));
  }

  return buildIndicator(signals, 8);
}

// ─── Indicator 9: Vehicle & Ownership Risk (max 6 pts) ───────────────────────

function scoreVehicleOwnershipRisk(input: FraudScoringInput): IndicatorResult {
  const v = input.vehicle ?? {};
  const signals: SignalResult[] = [];

  const transferDays = v.ownershipTransferDaysBeforeClaim;
  if (transferDays !== undefined && transferDays < 30) {
    signals.push(sig("veh.transfer.recent", `Ownership transferred ${transferDays} days before claim`, 4,
      `Vehicle ownership was transferred only ${transferDays} days before the claim was filed`, "vehicleOwnershipRisk"));
  } else if (transferDays !== undefined && transferDays < 90) {
    signals.push(sig("veh.transfer.moderate", `Ownership transferred ${transferDays} days before claim`, 2,
      `Vehicle ownership transferred ${transferDays} days before claim`, "vehicleOwnershipRisk"));
  } else {
    signals.push(sig("veh.transfer.ok", "Ownership transfer timing is not a risk factor", 0,
      transferDays !== undefined ? `Ownership transferred ${transferDays} days before claim` : "No recent ownership transfer", "vehicleOwnershipRisk"));
  }

  if (v.vinMismatch) {
    signals.push(sig("veh.vin.mismatch", "VIN mismatch detected", 5,
      "VIN on documents does not match VIN on vehicle — potential identity fraud", "vehicleOwnershipRisk"));
  } else {
    signals.push(sig("veh.vin.ok", "VIN verified and consistent", 0,
      "VIN matches across all documents", "vehicleOwnershipRisk"));
  }

  const vehicleValue = v.estimatedVehicleValueUsd ?? 0;
  const repairCost = v.estimatedRepairCostUsd ?? 0;
  if (v.isHighValueVehicle && repairCost > vehicleValue * 0.6) {
    signals.push(sig("veh.highValue.disproportionate", "High-value vehicle with disproportionate repair cost", 3,
      `Vehicle value: $${vehicleValue.toFixed(0)}, repair cost: $${repairCost.toFixed(0)} — ${((repairCost / vehicleValue) * 100).toFixed(0)}% of value`, "vehicleOwnershipRisk"));
  } else {
    signals.push(sig("veh.highValue.ok", "Vehicle value vs repair cost is proportionate", 0,
      vehicleValue > 0 ? `Vehicle value: $${vehicleValue.toFixed(0)}, repair cost: $${repairCost.toFixed(0)}` : "Vehicle value not available", "vehicleOwnershipRisk"));
  }

  const prevAccidents = v.previousAccidentCount ?? 0;
  if (prevAccidents >= 2) {
    signals.push(sig("veh.prevAccidents.high", `Multiple previous accidents (${prevAccidents})`, 2,
      `Vehicle has been involved in ${prevAccidents} previous accidents`, "vehicleOwnershipRisk"));
  } else {
    signals.push(sig("veh.prevAccidents.ok", "No significant previous accident history", 0,
      `${prevAccidents} previous accident(s)`, "vehicleOwnershipRisk"));
  }

  return buildIndicator(signals, 6);
}

// ─── Indicator 10: Claim Timing & Behaviour (max 5 pts) ──────────────────────

function scoreClaimTimingBehaviour(input: FraudScoringInput): IndicatorResult {
  const t = input.timing ?? {};
  const signals: SignalResult[] = [];

  const lapseNoticeDays = t.policyLapseNoticeDaysBefore;
  if (lapseNoticeDays !== undefined && lapseNoticeDays >= 0 && lapseNoticeDays <= 14) {
    signals.push(sig("timing.lapse.close", `Claim filed ${lapseNoticeDays} days after policy lapse notice`, 4,
      `Policy lapse notice was issued ${lapseNoticeDays} days before the incident — elevated risk of pre-meditated claim`, "claimTimingBehaviour"));
  } else {
    signals.push(sig("timing.lapse.ok", "No policy lapse notice proximity detected", 0,
      "Claim timing is not associated with a policy lapse notice", "claimTimingBehaviour"));
  }

  if (t.rapidResubmission) {
    signals.push(sig("timing.resubmit", "Rapid claim re-submission detected", 3,
      "Claim was resubmitted very quickly after initial rejection — may indicate coaching or coordination", "claimTimingBehaviour"));
  } else {
    signals.push(sig("timing.resubmit.none", "No rapid re-submission detected", 0,
      "Claim submission pattern is normal", "claimTimingBehaviour"));
  }

  if (t.claimSubmittedOnWeekend || t.claimSubmittedOnHoliday) {
    signals.push(sig("timing.weekend", "Claim submitted on weekend or public holiday", 1,
      "Weekend/holiday submissions can indicate an attempt to avoid immediate scrutiny", "claimTimingBehaviour"));
  } else {
    signals.push(sig("timing.weekend.none", "Claim submitted on a business day", 0,
      "Submission timing is unremarkable", "claimTimingBehaviour"));
  }

  const multiClaims = t.multipleClaimsInPeriod ?? 0;
  if (multiClaims >= 2) {
    signals.push(sig("timing.multiClaims", `Multiple claims in short period (${multiClaims})`, 3,
      `${multiClaims} claims filed within a 6-month period`, "claimTimingBehaviour"));
  } else {
    signals.push(sig("timing.multiClaims.none", "No unusual claim frequency", 0,
      `${multiClaims} claim(s) in recent period`, "claimTimingBehaviour"));
  }

  return buildIndicator(signals, 5);
}

// ─── Escalation Logic ─────────────────────────────────────────────────────────

function computeEscalation(
  rawLevel: FraudRiskLevel,
  rawScore: number,
  triggeredCount: number
): EscalationReason | null {
  const rules: Array<{ minScore: number; minIndicators: number; description: string }> = [
    { minScore: 36, minIndicators: 5, description: "5 or more indicators triggered simultaneously at Moderate Risk" },
    { minScore: 56, minIndicators: 6, description: "6 or more indicators triggered simultaneously at High Risk" },
    { minScore: 16, minIndicators: 7, description: "7 or more indicators triggered — breadth penalty applied" },
  ];

  for (const rule of rules) {
    if (rawScore >= rule.minScore && triggeredCount >= rule.minIndicators) {
      const bumped = bumpLevel(rawLevel);
      if (bumped !== rawLevel) {
        return {
          from: rawLevel,
          to: bumped,
          triggeredIndicatorCount: triggeredCount,
          threshold: rule.minIndicators,
          description: rule.description,
        };
      }
    }
  }
  return null;
}

// ─── Recommended Actions ──────────────────────────────────────────────────────

function buildRecommendations(
  breakdown: Record<IndicatorKey, IndicatorResult>,
  level: FraudRiskLevel
): RecommendedAction[] {
  const actions: RecommendedAction[] = [];

  if (level === "elevated") {
    actions.push({ code: "ESCALATE", description: "Refer immediately to the Fraud Investigation Unit", urgency: "immediate" });
    actions.push({ code: "SUSPEND", description: "Place claim on hold pending investigation", urgency: "immediate" });
  } else if (level === "high") {
    actions.push({ code: "FLAG", description: "Assign to senior assessor for manual review", urgency: "within_48h" });
    actions.push({ code: "VERIFY", description: "Request additional supporting documentation", urgency: "within_48h" });
  } else if (level === "moderate") {
    actions.push({ code: "MONITOR", description: "Process with enhanced scrutiny", urgency: "standard" });
  } else {
    actions.push({ code: "STANDARD", description: "Process claim through normal workflow", urgency: "standard" });
  }

  if (breakdown.physicsMismatch.score >= 10)
    actions.push({ code: "PHYSICS", description: "Commission independent accident reconstruction assessment", urgency: "within_48h", indicator: "physicsMismatch" });
  if (breakdown.claimantDriverRisk.score >= 8)
    actions.push({ code: "DRIVER", description: "Conduct thorough driver background and license verification", urgency: "within_48h", indicator: "claimantDriverRisk" });
  if (breakdown.stagedAccident.score >= 8)
    actions.push({ code: "STAGED", description: "Interview claimant and any witnesses; review dashcam / CCTV footage", urgency: "within_48h", indicator: "stagedAccident" });
  if (breakdown.panelBeaterPatterns.score >= 8)
    actions.push({ code: "QUOTE", description: "Request itemised quote from an independent panel beater for comparison", urgency: "within_48h", indicator: "panelBeaterPatterns" });
  if (breakdown.assessorIntegrity.score >= 6)
    actions.push({ code: "ASSESSOR", description: "Reassign to a different assessor and request a second opinion", urgency: "within_48h", indicator: "assessorIntegrity" });
  if (breakdown.crossEntityCollusion.score >= 6)
    actions.push({ code: "NETWORK", description: "Conduct entity relationship investigation across all linked parties", urgency: "immediate", indicator: "crossEntityCollusion" });
  if (breakdown.documentPhotoIntegrity.score >= 6)
    actions.push({ code: "DOCUMENTS", description: "Submit photos and documents for forensic metadata analysis", urgency: "within_48h", indicator: "documentPhotoIntegrity" });
  if (breakdown.costAnomalies.score >= 5)
    actions.push({ code: "COSTS", description: "Obtain independent parts pricing from approved supplier database", urgency: "within_48h", indicator: "costAnomalies" });
  if (breakdown.vehicleOwnershipRisk.score >= 4)
    actions.push({ code: "VEHICLE", description: "Conduct VIN verification and ownership history check", urgency: "within_48h", indicator: "vehicleOwnershipRisk" });
  if (breakdown.claimTimingBehaviour.score >= 3)
    actions.push({ code: "TIMING", description: "Review claim submission timeline against policy events", urgency: "standard", indicator: "claimTimingBehaviour" });

  return actions;
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────

export function computeFraudScoreBreakdown(
  input: FraudScoringInput
): FraudScoreBreakdown {
  const indicators: Record<IndicatorKey, IndicatorResult> = {
    physicsMismatch:        scorePhysicsMismatch(input),
    claimantDriverRisk:     scoreClaimantDriverRisk(input),
    stagedAccident:         scoreStagedAccident(input),
    panelBeaterPatterns:    scorePanelBeaterPatterns(input),
    assessorIntegrity:      scoreAssessorIntegrity(input),
    crossEntityCollusion:   scoreCrossEntityCollusion(input),
    documentPhotoIntegrity: scoreDocumentPhotoIntegrity(input),
    costAnomalies:          scoreCostAnomalies(input),
    vehicleOwnershipRisk:   scoreVehicleOwnershipRisk(input),
    claimTimingBehaviour:   scoreClaimTimingBehaviour(input),
  };

  const rawTotal = Object.values(indicators).reduce((acc, ind) => acc + ind.score, 0);
  const rawScore = cap(rawTotal, 100);
  const rawLevel = rawRiskLevel(rawScore);

  const triggeredIndicatorCount = Object.values(indicators).filter(ind => ind.score > 0).length;
  const concentrationAlerts = (Object.keys(indicators) as IndicatorKey[]).filter(
    key => indicators[key].concentrationAlert
  );

  const escalation = computeEscalation(rawLevel, rawScore, triggeredIndicatorCount);
  const finalLevel = escalation ? escalation.to : rawLevel;
  const totalScore = escalation ? Math.min(rawScore + 5, 100) : rawScore;

  const triggeredSignals = Object.values(indicators)
    .flatMap(ind => ind.signals)
    .filter(s => s.points > 0)
    .sort((a, b) => b.points - a.points);

  return {
    rawScore,
    totalScore,
    riskLevel: finalLevel,
    riskLevelLabel: RISK_LEVEL_LABELS[finalLevel],
    triggeredIndicatorCount,
    indicators,
    triggeredSignals,
    concentrationAlerts,
    escalation,
    recommendedActions: buildRecommendations(indicators, finalLevel),
    requiresInvestigation: finalLevel === "high" || finalLevel === "elevated",
  };
}

// ─── Pipeline Adapter ─────────────────────────────────────────────────────────

export function buildFraudScoringInput(params: {
  claim: any;
  physicsAnalysis?: any;
  forensicAnalysis?: any;
  mlResult?: any;
  partsReconciliation?: Array<{ status: string; component?: string; quotedCost?: number }>;
  extraInQuoteCount?: number;
  extraInQuoteCost?: number;
  estimatedRepairCost?: number;
  estimatedVehicleValue?: number;
  assessorData?: any;
  collusionData?: any;
}): FraudScoringInput {
  const {
    claim,
    physicsAnalysis,
    forensicAnalysis,
    mlResult,
    partsReconciliation = [],
    extraInQuoteCount = 0,
    extraInQuoteCost = 0,
    estimatedRepairCost = 0,
    estimatedVehicleValue = 0,
    assessorData,
    collusionData,
  } = params;

  const safeClaim = claim ?? {};

  const physics = physicsAnalysis ? {
    damageConsistencyScore: physicsAnalysis.damageConsistency?.score,
    impossibleDamagePatterns: physicsAnalysis.fraudIndicators?.impossibleDamagePatterns ?? [],
    unrelatedDamageComponents: (physicsAnalysis.fraudIndicators?.unrelatedDamage ?? []).map(
      (msg: string) => {
        const match = msg.match(/(.+?) is ([\d.]+)m from impact/);
        return match
          ? { name: match[1], distanceFromImpact: parseFloat(match[2]) }
          : { name: msg, distanceFromImpact: 4.0 };
      }
    ),
    severityMismatch: physicsAnalysis.fraudIndicators?.severityMismatch ?? false,
    stagedAccidentIndicators: physicsAnalysis.fraudIndicators?.stagedAccidentIndicators ?? [],
    estimatedSpeedKmh: physicsAnalysis.estimatedSpeed,
    structuralDamage: physicsAnalysis.damage?.structuralDamage,
    impactForceKn: physicsAnalysis.impactForce?.magnitude,
  } : undefined;

  const submissionDelay = safeClaim.incidentDate
    ? Math.floor((new Date(safeClaim.createdAt ?? Date.now()).getTime() - new Date(safeClaim.incidentDate).getTime()) / 86400000)
    : 0;

  const claimant = {
    isNonOwnerDriver: safeClaim.isNonOwnerDriver === 1,
    driverRelationshipToOwner: safeClaim.driverRelationshipToOwner ?? "unknown",
    policyAgeDays: safeClaim.daysSincePolicyStart ?? 365,
    submissionDelayDays: Math.max(0, submissionDelay),
    previousClaimsCount: safeClaim.previousClaimsCount ?? 0,
    driverLicenseSuspended: safeClaim.driverLicenseSuspended === 1,
    driverLicenseVerified: safeClaim.driverLicenseVerified !== 0,
    driverViolationsCount: safeClaim.driverViolationsCount ?? 0,
    driverEmploymentStatus: safeClaim.driverEmploymentStatus ?? "unknown",
    previousInsurerCount: safeClaim.previousInsurerCount ?? 0,
    lodgedBy: safeClaim.lodgedBy ?? "self",
    driverAge: safeClaim.driverAge,
  };

  let incidentHour: number | undefined;
  if (safeClaim.incidentTime) {
    const parts = (safeClaim.incidentTime as string).split(":");
    if (parts.length >= 1) incidentHour = parseInt(parts[0], 10);
  }

  const staged = {
    estimatedSpeedKmh: physicsAnalysis?.estimatedSpeed ?? safeClaim.estimatedImpactSpeedKmh,
    damageSeverityScore: physicsAnalysis?.damage?.structuralDamage ? 0.8 : 0.4,
    numberOfInjuryClaims: safeClaim.numberOfInjuryClaims ?? 0,
    hasWitnesses: !!(safeClaim.witnessName),
    hasDashcamFootage: false,
    hasPoliceReport: !!(safeClaim.policeReportNumber),
    incidentHour,
    geographicRiskZone: safeClaim.geographicRiskZone ?? "low",
    isSolePartyNightAccident: !!(safeClaim.isSolePartyNightAccident),
  };

  const quotedLineItems: any[] = (() => {
    try { return JSON.parse(safeClaim.extractedQuoteLineItems ?? "[]"); } catch { return []; }
  })();
  const quotedTotal = quotedLineItems.reduce((acc: number, item: any) => acc + (item.lineTotal ?? 0), 0);

  const panelBeater = {
    quoteSimilarityScore: safeClaim.quoteSimilarityScore ?? 0,
    extraInQuoteCount,
    extraInQuoteCost,
    partsInflationPercent: forensicAnalysis?.partsPricing?.overallInflation ?? 0,
    labourInflationPercent: 0,
    replacementToRepairRatio: safeClaim.replacementToRepairRatio ?? 0,
    damageScopeCreep: safeClaim.damageScopeCreep === 1,
    unrelatedQuoteItems: (partsReconciliation ?? []).filter(r => r.status === "quoted_not_detected").length,
    quotedTotalUsd: quotedTotal || estimatedRepairCost,
    aiEstimatedTotalUsd: estimatedRepairCost,
  };

  const assessor = assessorData ? {
    rubberStampingScore: assessorData.rubberStampingScore ?? 0,
    biasScore: assessorData.biasScore ?? 0,
    collusionScore: assessorData.collusionScore ?? 0,
    averageTurnaroundHours: parseFloat(assessorData.averageTurnaroundHours ?? "24"),
    accuracyScore: parseFloat(assessorData.averageAccuracyScore ?? "80"),
    claimsWithSamePanelBeaterCount: assessorData.claimsWithSamePanelBeaterCount ?? 0,
  } : undefined;

  const collusion = collusionData ? {
    triadRepeatCount: collusionData.triadRepeatCount ?? 0,
    sharedContactWithPanelBeater: collusionData.sharedContactWithPanelBeater ?? false,
    sharedContactWithAssessor: collusionData.sharedContactWithAssessor ?? false,
    entityCollusionScore: collusionData.entityCollusionScore ?? 0,
    claimantSamePanelBeaterCount: collusionData.claimantSamePanelBeaterCount ?? 0,
  } : undefined;

  const documents = {
    photoMetadataScore: forensicAnalysis?.photoMetadataScore ?? 100,
    reusedPhotoScore: forensicAnalysis?.reusedPhotoScore ?? 0,
    documentConsistencyScore: forensicAnalysis?.documentConsistencyScore ?? 100,
    hasHandwrittenQuote: safeClaim.hasHandwrittenQuote === 1,
    ocrConfidence: safeClaim.ocrConfidence ?? 100,
    missingDocumentCount: safeClaim.missingDocumentCount ?? 0,
  };

  const repairToValue = estimatedVehicleValue > 0
    ? (estimatedRepairCost / estimatedVehicleValue) * 100
    : 0;

  const costs = {
    quotedTotalUsd: quotedTotal || estimatedRepairCost,
    aiEstimatedTotalUsd: estimatedRepairCost,
    repairToValueRatio: repairToValue,
    overpricedPartsCount: forensicAnalysis?.partsPricing?.quotedParts?.filter(
      (p: any) => p.priceDeviation > 50
    ).length ?? 0,
  };

  const vehicle = {
    vehicleAgeYears: safeClaim.vehicleYear
      ? new Date().getFullYear() - parseInt(safeClaim.vehicleYear)
      : undefined,
    estimatedVehicleValueUsd: estimatedVehicleValue,
    estimatedRepairCostUsd: estimatedRepairCost,
    ownershipTransferDaysBeforeClaim: safeClaim.ownershipTransferDaysBeforeClaim,
    vinMismatch: safeClaim.vinMismatch === 1,
    previousAccidentCount: safeClaim.previousAccidentCount ?? 0,
    isHighValueVehicle: estimatedVehicleValue > 50000,
  };

  const incidentDate = safeClaim.incidentDate ? new Date(safeClaim.incidentDate) : null;
  const timing = {
    claimSubmittedOnWeekend: incidentDate ? [0, 6].includes(incidentDate.getDay()) : false,
    claimSubmittedOnHoliday: false,
    rapidResubmission: safeClaim.rapidResubmission === 1,
    policyLapseNoticeDaysBefore: safeClaim.policyLapseNoticeDaysBefore,
    incidentToSubmissionDays: Math.max(0, submissionDelay),
    multipleClaimsInPeriod: safeClaim.claimsInLast6Months ?? 0,
  };

  return {
    physics,
    claimant,
    staged,
    panelBeater,
    assessor,
    collusion,
    documents,
    costs,
    vehicle,
    timing,
    mlResult,
  };
}
