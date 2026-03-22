/**
 * pipeline-v2/scenarioFraudEngine.ts
 *
 * SCENARIO-AWARE FRAUD DETECTION ENGINE
 *
 * Evaluates fraud risk using scenario-specific rule sets, false positive
 * protection logic, and a structured JSON output.
 *
 * Design principles:
 *   - Every scenario type has its own expected norms (police report, timeline,
 *     damage pattern, assessor behaviour) so that a missing police report for
 *     an animal strike is NOT treated the same as a missing police report for
 *     a staged collision.
 *   - False positive protection rules are applied AFTER scoring to suppress
 *     flags that are known to be benign in the current scenario context.
 *   - Physical consistency (damage pattern match + assessor confirmation) is
 *     the strongest trust signal and can significantly reduce the fraud score.
 *   - The engine never blocks the pipeline — it returns a result even when
 *     inputs are missing or partially populated.
 */

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type ScenarioType =
  | "animal_strike"
  | "vehicle_collision"
  | "theft"
  | "fire"
  | "flood"
  | "vandalism"
  | "windscreen"
  | "cosmetic"
  | "weather_event"
  | "unknown";

export type PoliceReportStatus =
  | "present"          // Report number confirmed
  | "absent"           // Explicitly no report
  | "pending"          // Claimant says report filed, number not yet available
  | "not_applicable"   // Scenario does not require police report
  | "unknown";         // Not stated

export type TimelineConsistency =
  | "consistent"       // Dates, times, and sequence all align
  | "minor_gap"        // Small discrepancy (< 48 h) — likely administrative
  | "significant_gap"  // Large discrepancy (> 48 h) or unexplained delay
  | "contradictory"    // Dates or sequence directly contradict each other
  | "unknown";

export type PatternMatchStrength = "STRONG" | "MODERATE" | "WEAK" | "NONE";

export interface DamagePatternResult {
  pattern_match: PatternMatchStrength;
  structural_damage_detected: boolean;
  confidence: number;
  validation_detail: {
    image_contradiction: boolean;
    image_contradiction_reason?: string;
    primary_coverage_pct: number;
    secondary_coverage_pct: number;
  };
}

export type AssessorConfirmation =
  | "confirmed"        // Assessor physically inspected and confirmed damage
  | "partial"          // Assessor confirmed some but not all damage
  | "not_yet"          // Assessor has not yet reviewed
  | "disputed"         // Assessor disputes the claimed damage
  | "unknown";

export interface ScenarioFraudInput {
  scenario_type: ScenarioType;
  police_report_status: PoliceReportStatus;
  timeline_consistency: TimelineConsistency;
  damage_pattern_result: DamagePatternResult | null;
  assessor_confirmation: AssessorConfirmation;
  /** Optional enrichment fields for deeper analysis */
  enrichment?: {
    /** Days between incident and claim lodgement */
    days_to_report?: number;
    /** Whether the claimant has prior claims in the last 24 months */
    prior_claims_count?: number;
    /** Whether the vehicle is financed / under credit agreement */
    vehicle_financed?: boolean;
    /** Whether the repairer is on the insurer's preferred panel */
    preferred_repairer?: boolean;
    /** Whether the claim was lodged outside business hours */
    after_hours_lodgement?: boolean;
    /** Whether the claimant requested a specific repairer */
    specific_repairer_requested?: boolean;
    /** Whether the incident occurred near a known high-fraud location */
    high_fraud_location?: boolean;
    /** Whether the vehicle was recently purchased (< 90 days) */
    recently_purchased?: boolean;
  };
}

export interface FraudFlag {
  code: string;
  category: "documentation" | "timeline" | "pattern" | "financial" | "behaviour" | "scenario";
  severity: "LOW" | "MEDIUM" | "HIGH";
  score_contribution: number;
  description: string;
  scenario_specific: boolean;
}

export interface FalsePositiveProtection {
  suppressed_flag: string;
  reason: string;
  scenario_context: string;
}

export interface ScenarioFraudOutput {
  fraud_score: number;
  risk_level: "LOW" | "MEDIUM" | "HIGH";
  flags: FraudFlag[];
  false_positive_protection: FalsePositiveProtection[];
  reasoning: string;
  /** Internal metadata for audit trail */
  engine_metadata: {
    scenario_type: ScenarioType;
    scenario_profile_applied: string;
    trust_signals_applied: string[];
    score_before_trust_reduction: number;
    trust_reduction_applied: number;
    false_positives_suppressed: number;
    inputs_missing: string[];
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO PROFILES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Each scenario profile defines:
 *   - police_report_required: whether absence of a police report is a fraud signal
 *   - police_report_score: fraud score contribution if report is absent and required
 *   - typical_delay_days: maximum days between incident and report before flagging
 *   - pattern_mismatch_multiplier: how hard to penalise a WEAK/NONE pattern match
 *   - assessor_trust_weight: how much assessor confirmation reduces the score
 *   - known_false_positives: flags that are commonly benign for this scenario
 *   - description: human-readable profile name
 */
interface ScenarioProfile {
  description: string;
  police_report_required: boolean;
  police_report_score: number;
  typical_delay_days: number;
  pattern_mismatch_multiplier: number;
  assessor_trust_weight: number;
  known_false_positives: string[];
  high_risk_modifiers: string[];
}

const SCENARIO_PROFILES: Record<ScenarioType, ScenarioProfile> = {
  animal_strike: {
    description: "Animal Strike (livestock, wildlife)",
    police_report_required: false,
    police_report_score: 0,
    typical_delay_days: 14,
    pattern_mismatch_multiplier: 1.2,
    assessor_trust_weight: 35,
    known_false_positives: [
      "missing_police_report",
      "no_third_party_details",
      "single_witness",
      "remote_location",
    ],
    high_risk_modifiers: [
      "image_contradiction",
      "damage_pattern_none",
      "contradictory_timeline",
    ],
  },

  vehicle_collision: {
    description: "Vehicle Collision (third-party or single vehicle)",
    police_report_required: true,
    police_report_score: 20,
    typical_delay_days: 7,
    pattern_mismatch_multiplier: 1.5,
    assessor_trust_weight: 25,
    known_false_positives: [
      "minor_timeline_gap",
    ],
    high_risk_modifiers: [
      "missing_police_report",
      "no_third_party_details",
      "image_contradiction",
      "damage_pattern_none",
      "contradictory_timeline",
      "recently_purchased_vehicle",
    ],
  },

  theft: {
    description: "Theft (vehicle or contents)",
    police_report_required: true,
    police_report_score: 35,
    typical_delay_days: 3,
    pattern_mismatch_multiplier: 1.8,
    assessor_trust_weight: 20,
    known_false_positives: [
      "no_damage_photos",  // Stolen vehicle may have no photos
    ],
    high_risk_modifiers: [
      "missing_police_report",
      "recently_purchased_vehicle",
      "vehicle_financed",
      "contradictory_timeline",
      "specific_repairer_requested",
    ],
  },

  fire: {
    description: "Fire (vehicle fire or arson)",
    police_report_required: true,
    police_report_score: 30,
    typical_delay_days: 5,
    pattern_mismatch_multiplier: 1.6,
    assessor_trust_weight: 20,
    known_false_positives: [
      "no_damage_photos",  // Fire may destroy evidence
      "low_data_completeness",  // Fire destroys documentation
    ],
    high_risk_modifiers: [
      "missing_police_report",
      "recently_purchased_vehicle",
      "vehicle_financed",
      "after_hours_lodgement",
      "contradictory_timeline",
    ],
  },

  flood: {
    description: "Flood / Water Damage",
    police_report_required: false,
    police_report_score: 0,
    typical_delay_days: 21,
    pattern_mismatch_multiplier: 1.3,
    assessor_trust_weight: 25,
    known_false_positives: [
      "missing_police_report",
      "significant_delay",  // Flood recovery takes time
      "low_data_completeness",
    ],
    high_risk_modifiers: [
      "image_contradiction",
      "damage_pattern_none",
      "contradictory_timeline",
    ],
  },

  vandalism: {
    description: "Vandalism",
    police_report_required: true,
    police_report_score: 25,
    typical_delay_days: 7,
    pattern_mismatch_multiplier: 1.4,
    assessor_trust_weight: 25,
    known_false_positives: [
      "no_third_party_details",
      "single_witness",
    ],
    high_risk_modifiers: [
      "missing_police_report",
      "image_contradiction",
      "damage_pattern_none",
      "contradictory_timeline",
    ],
  },

  windscreen: {
    description: "Windscreen / Glass Damage",
    police_report_required: false,
    police_report_score: 0,
    typical_delay_days: 30,
    pattern_mismatch_multiplier: 1.0,
    assessor_trust_weight: 30,
    known_false_positives: [
      "missing_police_report",
      "significant_delay",
      "no_third_party_details",
    ],
    high_risk_modifiers: [
      "image_contradiction",
      "damage_pattern_none",
      "multiple_windscreen_claims",
    ],
  },

  cosmetic: {
    description: "Cosmetic / Minor Damage",
    police_report_required: false,
    police_report_score: 0,
    typical_delay_days: 60,
    pattern_mismatch_multiplier: 1.0,
    assessor_trust_weight: 30,
    known_false_positives: [
      "missing_police_report",
      "significant_delay",
      "no_third_party_details",
    ],
    high_risk_modifiers: [
      "image_contradiction",
      "excessive_damage_count",
    ],
  },

  weather_event: {
    description: "Weather Event (hail, storm, falling tree)",
    police_report_required: false,
    police_report_score: 0,
    typical_delay_days: 30,
    pattern_mismatch_multiplier: 1.2,
    assessor_trust_weight: 25,
    known_false_positives: [
      "missing_police_report",
      "significant_delay",
      "no_third_party_details",
    ],
    high_risk_modifiers: [
      "image_contradiction",
      "damage_pattern_none",
      "contradictory_timeline",
    ],
  },

  unknown: {
    description: "Unknown Scenario",
    police_report_required: false,
    police_report_score: 5,
    typical_delay_days: 14,
    pattern_mismatch_multiplier: 1.0,
    assessor_trust_weight: 20,
    known_false_positives: [],
    high_risk_modifiers: [],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// SCORING HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function scoreToRiskLevel(score: number): "LOW" | "MEDIUM" | "HIGH" {
  if (score >= 55) return "HIGH";
  if (score >= 25) return "MEDIUM";
  return "LOW";
}

function buildFlag(
  code: string,
  category: FraudFlag["category"],
  severity: FraudFlag["severity"],
  score_contribution: number,
  description: string,
  scenario_specific: boolean
): FraudFlag {
  return { code, category, severity, score_contribution, description, scenario_specific };
}

function buildFPP(
  suppressed_flag: string,
  reason: string,
  scenario_context: string
): FalsePositiveProtection {
  return { suppressed_flag, reason, scenario_context };
}

// ─────────────────────────────────────────────────────────────────────────────
// RULE EVALUATORS
// ─────────────────────────────────────────────────────────────────────────────

/** Rule 1: Police report evaluation — scenario-aware */
function evaluatePoliceReport(
  input: ScenarioFraudInput,
  profile: ScenarioProfile,
  suppressedFlags: Set<string>,
  suppressionReasons: Map<string, string>
): FraudFlag[] {
  const flags: FraudFlag[] = [];
  const { police_report_status, scenario_type } = input;

  if (police_report_status === "absent" || police_report_status === "unknown") {
    if (!profile.police_report_required) {
      // This scenario does not require a police report — suppress the flag
      suppressedFlags.add("missing_police_report");
      suppressionReasons.set(
        "missing_police_report",
        `Police report is not required for ${scenario_type.replace(/_/g, " ")} claims. ` +
        `Absence is expected and does not indicate fraud in this scenario context.`
      );
      return [];
    }

    // Required but absent
    if (police_report_status === "absent") {
      flags.push(buildFlag(
        "missing_police_report",
        "documentation",
        profile.police_report_score >= 30 ? "HIGH" : "MEDIUM",
        profile.police_report_score,
        `Police report is absent. For ${scenario_type.replace(/_/g, " ")} claims, a police report is ` +
        `required to establish the incident on record. Absence is a material fraud indicator.`,
        true
      ));
    } else {
      // Unknown — softer flag
      flags.push(buildFlag(
        "police_report_status_unknown",
        "documentation",
        "LOW",
        Math.round(profile.police_report_score * 0.4),
        `Police report status not confirmed. For ${scenario_type.replace(/_/g, " ")} claims, ` +
        `a police report is expected. Pending confirmation.`,
        true
      ));
    }
  }

  if (police_report_status === "pending") {
    // Pending is not a fraud signal — it is a normal administrative state
    suppressedFlags.add("missing_police_report");
    suppressionReasons.set(
      "missing_police_report",
      "Police report is pending — this is a normal administrative state and not a fraud signal."
    );
  }

  return flags;
}

/** Rule 2: Timeline consistency evaluation */
function evaluateTimeline(
  input: ScenarioFraudInput,
  profile: ScenarioProfile,
  suppressedFlags: Set<string>,
  suppressionReasons: Map<string, string>
): FraudFlag[] {
  const flags: FraudFlag[] = [];
  const { timeline_consistency, enrichment } = input;

  if (timeline_consistency === "contradictory") {
    flags.push(buildFlag(
      "contradictory_timeline",
      "timeline",
      "HIGH",
      30,
      "Dates or sequence of events directly contradict each other across documents. " +
      "This is a strong indicator of a fabricated or staged claim.",
      false
    ));
  } else if (timeline_consistency === "significant_gap") {
    // Check if this scenario has a known tolerance for delays
    const isFloodOrWeather = ["flood", "weather_event", "cosmetic", "windscreen"].includes(input.scenario_type);
    if (isFloodOrWeather) {
      suppressedFlags.add("significant_delay");
      suppressionReasons.set(
        "significant_delay",
        `Reporting delays are expected for ${input.scenario_type.replace(/_/g, " ")} claims ` +
        `due to displacement, infrastructure disruption, or low urgency. Extended timelines are not inherently suspicious.`
      );
    } else {
      flags.push(buildFlag(
        "significant_timeline_gap",
        "timeline",
        "MEDIUM",
        15,
        `A significant gap exists in the incident timeline (> 48 hours unexplained). ` +
        `For ${input.scenario_type.replace(/_/g, " ")} claims, this warrants clarification.`,
        true
      ));
    }
  } else if (timeline_consistency === "minor_gap") {
    // Minor gaps are generally benign — suppress for most scenarios
    suppressedFlags.add("minor_timeline_gap");
    suppressionReasons.set(
      "minor_timeline_gap",
      "Minor timeline gaps (< 48 hours) are common administrative discrepancies and are not fraud signals."
    );
  }

  // Enrichment: days to report
  if (enrichment?.days_to_report !== undefined) {
    const days = enrichment.days_to_report;
    if (days > profile.typical_delay_days * 3) {
      flags.push(buildFlag(
        "extreme_reporting_delay",
        "timeline",
        "HIGH",
        25,
        `Claim lodged ${days} days after the incident — significantly beyond the typical ` +
        `${profile.typical_delay_days}-day window for ${input.scenario_type.replace(/_/g, " ")} claims.`,
        true
      ));
    } else if (days > profile.typical_delay_days) {
      flags.push(buildFlag(
        "late_reporting",
        "timeline",
        "LOW",
        8,
        `Claim lodged ${days} days after the incident (typical: ≤ ${profile.typical_delay_days} days ` +
        `for ${input.scenario_type.replace(/_/g, " ")} claims).`,
        true
      ));
    }
  }

  return flags;
}

/** Rule 3: Damage pattern evaluation — scenario-aware */
function evaluateDamagePattern(
  input: ScenarioFraudInput,
  profile: ScenarioProfile
): FraudFlag[] {
  const flags: FraudFlag[] = [];
  const { damage_pattern_result, scenario_type } = input;

  if (!damage_pattern_result) return flags;

  const { pattern_match, confidence, validation_detail } = damage_pattern_result;
  const mult = profile.pattern_mismatch_multiplier;

  if (pattern_match === "NONE") {
    // NONE pattern is always HIGH severity regardless of scenario multiplier
    const baseScore = Math.max(42, Math.round(35 * mult));
    flags.push(buildFlag(
      "damage_pattern_none",
      "pattern",
      "HIGH",
      Math.min(55, baseScore),
      `No expected damage components for a ${scenario_type.replace(/_/g, " ")} scenario were found ` +
      `(primary coverage: ${validation_detail.primary_coverage_pct}%, confidence: ${confidence}/100). ` +
      `The damage profile does not match the claimed incident type.`,
      true
    ));
  } else if (pattern_match === "WEAK") {
    const baseScore = Math.round(20 * mult);
    flags.push(buildFlag(
      "damage_pattern_weak",
      "pattern",
      "MEDIUM",
      Math.min(35, baseScore),
      `Very few expected damage components for a ${scenario_type.replace(/_/g, " ")} scenario were found ` +
      `(primary coverage: ${validation_detail.primary_coverage_pct}%, confidence: ${confidence}/100). ` +
      `Physical consistency is below the expected threshold.`,
      true
    ));
  }

  // Image contradiction — always a strong signal regardless of scenario
  // Minimum score of 32 ensures that image contradiction alone reaches HIGH threshold
  if (validation_detail.image_contradiction) {
    flags.push(buildFlag(
      "image_contradiction",
      "pattern",
      "HIGH",
      32,
      `Image-detected damage zones contradict the claimed damage pattern. ` +
      `${validation_detail.image_contradiction_reason ?? "Images show damage inconsistent with the reported incident."}`,
      false
    ));
  }

  return flags;
}

/** Rule 4: Assessor confirmation — trust signal */
function evaluateAssessorConfirmation(
  input: ScenarioFraudInput,
  profile: ScenarioProfile
): { trustReduction: number; trustSignals: string[] } {
  const { assessor_confirmation, damage_pattern_result } = input;
  const trustSignals: string[] = [];
  let trustReduction = 0;

  if (assessor_confirmation === "confirmed") {
    // Assessor physically confirmed damage — strong trust signal
    // Weight is higher when damage pattern is also consistent
    const patternBonus = damage_pattern_result?.pattern_match === "STRONG" ? 10 :
                         damage_pattern_result?.pattern_match === "MODERATE" ? 5 : 0;
    trustReduction = profile.assessor_trust_weight + patternBonus;
    trustSignals.push(
      `Assessor physically confirmed damage (trust reduction: ${trustReduction} pts).`
    );
  } else if (assessor_confirmation === "partial") {
    trustReduction = Math.round(profile.assessor_trust_weight * 0.5);
    trustSignals.push(
      `Assessor partially confirmed damage (trust reduction: ${trustReduction} pts).`
    );
  } else if (assessor_confirmation === "disputed") {
    // Assessor disputes damage — this is a fraud signal, not a trust signal
    trustReduction = 0;
    // No trust signal — the disputed flag is added elsewhere
  }

  // Damage pattern STRONG is itself a trust signal even without assessor
  if (damage_pattern_result?.pattern_match === "STRONG" && assessor_confirmation !== "confirmed") {
    const patternTrust = Math.round(profile.assessor_trust_weight * 0.4);
    trustReduction += patternTrust;
    trustSignals.push(
      `Strong damage pattern match provides independent physical consistency (trust reduction: ${patternTrust} pts).`
    );
  }

  // Structural damage confirmed by assessor is a strong legitimacy signal
  if (assessor_confirmation === "confirmed" && damage_pattern_result?.structural_damage_detected) {
    trustReduction += 5;
    trustSignals.push("Structural damage confirmed by assessor — consistent with high-energy impact.");
  }

  return { trustReduction, trustSignals };
}

/** Rule 5: Assessor dispute flag */
function evaluateAssessorDispute(input: ScenarioFraudInput): FraudFlag[] {
  if (input.assessor_confirmation === "disputed") {
    return [buildFlag(
      "assessor_disputed_damage",
      "behaviour",
      "HIGH",
      40,
      "The assessor has disputed the claimed damage upon physical inspection. " +
      "This is a strong indicator of inflated or fabricated damage.",
      false
    )];
  }
  return [];
}

/** Rule 6: Behavioural enrichment flags */
function evaluateBehaviouralEnrichment(input: ScenarioFraudInput): FraudFlag[] {
  const flags: FraudFlag[] = [];
  const { enrichment, scenario_type } = input;
  if (!enrichment) return flags;

  if (enrichment.prior_claims_count !== undefined && enrichment.prior_claims_count >= 3) {
    flags.push(buildFlag(
      "high_prior_claim_frequency",
      "behaviour",
      enrichment.prior_claims_count >= 5 ? "HIGH" : "MEDIUM",
      enrichment.prior_claims_count >= 5 ? 25 : 15,
      `Claimant has ${enrichment.prior_claims_count} prior claims in the last 24 months. ` +
      `High claim frequency is a recognised fraud indicator.`,
      false
    ));
  }

  if (enrichment.recently_purchased && ["theft", "fire", "vehicle_collision"].includes(scenario_type)) {
    flags.push(buildFlag(
      "recently_purchased_vehicle",
      "behaviour",
      "MEDIUM",
      20,
      `Vehicle was recently purchased (< 90 days) and is now subject to a ${scenario_type.replace(/_/g, " ")} claim. ` +
      `This combination is a recognised fraud pattern.`,
      true
    ));
  }

  if (enrichment.vehicle_financed && ["theft", "fire"].includes(scenario_type)) {
    flags.push(buildFlag(
      "financed_vehicle_total_loss_risk",
      "financial",
      "MEDIUM",
      15,
      `Vehicle is under a finance agreement. ${scenario_type === "theft" ? "Theft" : "Fire"} of a financed vehicle ` +
      `carries elevated fraud risk due to financial motive.`,
      true
    ));
  }

  if (enrichment.specific_repairer_requested && !enrichment.preferred_repairer) {
    flags.push(buildFlag(
      "non_panel_repairer_requested",
      "financial",
      "LOW",
      8,
      "Claimant has specifically requested a repairer not on the insurer's preferred panel. " +
      "This may indicate a pre-arranged repair relationship.",
      false
    ));
  }

  if (enrichment.after_hours_lodgement && ["theft", "fire"].includes(scenario_type)) {
    flags.push(buildFlag(
      "after_hours_lodgement",
      "behaviour",
      "LOW",
      5,
      `Claim lodged outside business hours for a ${scenario_type.replace(/_/g, " ")} incident. ` +
      `Alone this is not significant, but in combination with other flags it warrants attention.`,
      true
    ));
  }

  if (enrichment.high_fraud_location) {
    flags.push(buildFlag(
      "high_fraud_location",
      "behaviour",
      "MEDIUM",
      15,
      "Incident location is in a zone with elevated historical fraud frequency. " +
      "This is a contextual risk factor, not a standalone indicator.",
      false
    ));
  }

  return flags;
}

// ─────────────────────────────────────────────────────────────────────────────
// FALSE POSITIVE PROTECTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Applies false positive protection rules after all flags are collected.
 * Returns the filtered flag list and a list of suppression records.
 * Also emits FPP records for flags that were pre-suppressed before generation.
 */
function applyFalsePositiveProtection(
  flags: FraudFlag[],
  input: ScenarioFraudInput,
  profile: ScenarioProfile,
  suppressedFlagCodes: Set<string>,
  suppressionReasons: Map<string, string>
): { filteredFlags: FraudFlag[]; protections: FalsePositiveProtection[] } {
  const protections: FalsePositiveProtection[] = [];
  const filteredFlags: FraudFlag[] = [];

  // Emit FPP records for flags that were pre-suppressed before flag generation
  for (const [code, reason] of suppressionReasons.entries()) {
    protections.push(buildFPP(code, reason, profile.description));
  }

  for (const flag of flags) {
    // Check if this flag was pre-suppressed by a rule evaluator
    if (suppressedFlagCodes.has(flag.code)) {
      // Already recorded above via suppressionReasons — skip duplicate
      continue;
    }

    // Check if this flag is in the scenario's known false positives list
    if (profile.known_false_positives.includes(flag.code)) {
      protections.push(buildFPP(
        flag.code,
        `"${flag.code}" is a known false positive for ${input.scenario_type.replace(/_/g, " ")} claims. ` +
        `This flag is expected and does not indicate fraud in this scenario context.`,
        profile.description
      ));
      continue;
    }

    // Special rule: if damage pattern is STRONG and assessor confirmed,
    // suppress LOW-severity documentation flags (they are administrative gaps, not fraud)
    const isStrongAndConfirmed =
      input.damage_pattern_result?.pattern_match === "STRONG" &&
      input.assessor_confirmation === "confirmed";
    if (isStrongAndConfirmed && flag.severity === "LOW" && flag.category === "documentation") {
      protections.push(buildFPP(
        flag.code,
        `Strong physical consistency (STRONG pattern match + assessor confirmation) suppresses ` +
        `low-severity documentation flag "${flag.code}". Physical evidence outweighs administrative gaps.`,
        profile.description
      ));
      continue;
    }

    filteredFlags.push(flag);
  }

  return { filteredFlags, protections };
}

// ─────────────────────────────────────────────────────────────────────────────
// MISSING INPUT TRACKER
// ─────────────────────────────────────────────────────────────────────────────

function trackMissingInputs(input: ScenarioFraudInput): string[] {
  const missing: string[] = [];
  if (input.police_report_status === "unknown") missing.push("police_report_status");
  if (input.timeline_consistency === "unknown") missing.push("timeline_consistency");
  if (!input.damage_pattern_result) missing.push("damage_pattern_result");
  if (input.assessor_confirmation === "unknown") missing.push("assessor_confirmation");
  return missing;
}

// ─────────────────────────────────────────────────────────────────────────────
// REASONING BUILDER
// ─────────────────────────────────────────────────────────────────────────────

function buildReasoning(
  input: ScenarioFraudInput,
  profile: ScenarioProfile,
  rawScore: number,
  finalScore: number,
  trustReduction: number,
  trustSignals: string[],
  flags: FraudFlag[],
  protections: FalsePositiveProtection[],
  missingInputs: string[]
): string {
  const parts: string[] = [];

  parts.push(
    `Scenario: ${profile.description}. ` +
    `Scenario profile applied: ${input.scenario_type}.`
  );

  if (flags.length === 0) {
    parts.push("No fraud indicators detected for this scenario.");
  } else {
    const highFlags = flags.filter(f => f.severity === "HIGH");
    const medFlags = flags.filter(f => f.severity === "MEDIUM");
    parts.push(
      `${flags.length} fraud indicator(s) detected: ` +
      `${highFlags.length} HIGH, ${medFlags.length} MEDIUM, ${flags.length - highFlags.length - medFlags.length} LOW.`
    );
    parts.push(
      `Active flags: ${flags.map(f => f.code).join(", ")}.`
    );
  }

  if (trustSignals.length > 0) {
    parts.push(`Trust signals: ${trustSignals.join(" ")}`);
    if (trustReduction > 0) {
      parts.push(
        `Score reduced from ${rawScore} to ${finalScore} after applying trust signal reductions (−${trustReduction} pts).`
      );
    }
  }

  if (protections.length > 0) {
    parts.push(
      `${protections.length} false positive protection(s) applied: ` +
      `${protections.map(p => p.suppressed_flag).join(", ")} suppressed as benign in this scenario context.`
    );
  }

  // Scenario-specific notes
  if (input.scenario_type === "animal_strike") {
    parts.push(
      "Note: For animal strike claims, absence of a police report is NOT a fraud signal. " +
      "Rural incidents frequently occur without police attendance. " +
      "Physical damage consistency and assessor confirmation are the primary trust anchors."
    );
  } else if (input.scenario_type === "theft") {
    parts.push(
      "Note: For theft claims, a police report is mandatory as it establishes the incident on record. " +
      "Absence of a police report for a theft claim is a material fraud indicator."
    );
  } else if (input.scenario_type === "fire") {
    parts.push(
      "Note: For fire claims, fire may destroy physical evidence and documentation. " +
      "Low data completeness and absence of photos are known false positives for fire incidents."
    );
  } else if (input.scenario_type === "flood") {
    parts.push(
      "Note: For flood claims, reporting delays are common due to displacement and infrastructure disruption. " +
      "Extended timelines are not inherently suspicious for flood events."
    );
  }

  if (missingInputs.length > 0) {
    parts.push(
      `Missing inputs (reduced confidence): ${missingInputs.join(", ")}. ` +
      `Fraud score may be underestimated — additional data collection recommended.`
    );
  }

  parts.push(
    `Final fraud score: ${finalScore}/100. Risk level: ${scoreToRiskLevel(finalScore)}.`
  );

  return parts.join(" ");
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN ENGINE
// ─────────────────────────────────────────────────────────────────────────────

export function evaluateScenarioFraud(input: ScenarioFraudInput): ScenarioFraudOutput {
  const profile = SCENARIO_PROFILES[input.scenario_type] ?? SCENARIO_PROFILES.unknown;
  const suppressedFlagCodes = new Set<string>();
  const missingInputs = trackMissingInputs(input);

  // Suppression reasons map: code → human-readable reason (for FPP records)
  const suppressionReasons = new Map<string, string>();

  // ── 1. Collect all raw flags ───────────────────────────────────────────────
  const rawFlags: FraudFlag[] = [
    ...evaluatePoliceReport(input, profile, suppressedFlagCodes, suppressionReasons),
    ...evaluateTimeline(input, profile, suppressedFlagCodes, suppressionReasons),
    ...evaluateDamagePattern(input, profile),
    ...evaluateAssessorDispute(input),
    ...evaluateBehaviouralEnrichment(input),
  ];

  // ── 2. Apply false positive protection ────────────────────────────────────
  const { filteredFlags, protections } = applyFalsePositiveProtection(
    rawFlags,
    input,
    profile,
    suppressedFlagCodes,
    suppressionReasons
  );

  // ── 3. Compute raw score from filtered flags ───────────────────────────────
  const rawScore = Math.min(100, filteredFlags.reduce((sum, f) => sum + f.score_contribution, 0));

  // ── 4. Apply trust signal reductions ──────────────────────────────────────
  const { trustReduction, trustSignals } = evaluateAssessorConfirmation(input, profile);
  const finalScore = Math.max(0, Math.min(100, rawScore - trustReduction));

  // ── 5. Determine risk level ────────────────────────────────────────────────
  const riskLevel = scoreToRiskLevel(finalScore);

  // ── 6. Build reasoning ────────────────────────────────────────────────────
  const reasoning = buildReasoning(
    input, profile, rawScore, finalScore,
    trustReduction, trustSignals,
    filteredFlags, protections, missingInputs
  );

  return {
    fraud_score: finalScore,
    risk_level: riskLevel,
    flags: filteredFlags,
    false_positive_protection: protections,
    reasoning,
    engine_metadata: {
      scenario_type: input.scenario_type,
      scenario_profile_applied: profile.description,
      trust_signals_applied: trustSignals,
      score_before_trust_reduction: rawScore,
      trust_reduction_applied: trustReduction,
      false_positives_suppressed: protections.length,
      inputs_missing: missingInputs,
    },
  };
}
