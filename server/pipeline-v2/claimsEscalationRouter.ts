/**
 * claimsEscalationRouter.ts
 *
 * Claims Escalation Router — routes claims to the correct handling queue
 * based on the final recommendation, anomaly signals, and confidence level.
 *
 * Output:
 *   route_to:  AUTO_APPROVE | ADJUSTER_REVIEW | FRAUD_TEAM
 *   priority:  LOW | MEDIUM | HIGH
 *   reason:    Human-readable routing justification
 *
 * Routing Rules (priority order):
 *  1. REJECT + fraud indicators         → FRAUD_TEAM / HIGH
 *  2. REJECT (no fraud)                 → ADJUSTER_REVIEW / HIGH
 *  3. REVIEW + fraud indicators         → FRAUD_TEAM / HIGH
 *  4. REVIEW + critical anomalies       → ADJUSTER_REVIEW / HIGH
 *  5. REVIEW + moderate anomalies       → ADJUSTER_REVIEW / MEDIUM
 *  6. REVIEW (clean)                    → ADJUSTER_REVIEW / LOW
 *  7. APPROVE + confidence < 60         → ADJUSTER_REVIEW / MEDIUM
 *  8. APPROVE + anomalies present       → ADJUSTER_REVIEW / MEDIUM
 *  9. APPROVE + high confidence (≥ 75)  → AUTO_APPROVE / LOW
 * 10. APPROVE + medium confidence       → AUTO_APPROVE / MEDIUM
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type RouteDestination = "AUTO_APPROVE" | "ADJUSTER_REVIEW" | "FRAUD_TEAM";
export type RoutePriority = "LOW" | "MEDIUM" | "HIGH";

export interface AnomalySignal {
  /** Whether this anomaly is critical (blocks auto-approval) */
  is_critical?: boolean | null;
  /** Human-readable description of the anomaly */
  description?: string | null;
  /** Anomaly type tag */
  type?: string | null;
}

export interface EscalationInput {
  /** Final recommendation from the Claims Decision Authority */
  recommendation: "APPROVE" | "REVIEW" | "REJECT";
  /** Overall confidence score (0–100) */
  confidence?: number | null;
  /** List of detected anomalies */
  anomalies?: AnomalySignal[] | string[] | null;
  /** Fraud risk level from the fraud detection engine */
  fraud_risk_level?: string | null;
  /** Whether fraud was explicitly flagged by the scenario fraud engine */
  fraud_flagged?: boolean | null;
  /** Number of critical fraud flags */
  critical_fraud_flag_count?: number | null;
  /** Whether the claim is high-value (triggers mandatory review) */
  is_high_value?: boolean | null;
  /** Whether the claim has been assessor-validated */
  assessor_validated?: boolean | null;
  /** Claim reference for traceability */
  claim_reference?: string | null;
  /** Whether the cost decision was escalated */
  cost_escalated?: boolean | null;
  /** Whether there is a physics inconsistency */
  physics_inconsistency?: boolean | null;
  /** Whether damage is inconsistent */
  damage_inconsistent?: boolean | null;
}

export interface EscalationOutput {
  route_to: RouteDestination;
  priority: RoutePriority;
  reason: string;
  metadata: {
    recommendation: "APPROVE" | "REVIEW" | "REJECT";
    confidence: number | null;
    confidence_band: "HIGH" | "MEDIUM" | "LOW" | "INSUFFICIENT";
    fraud_detected: boolean;
    anomaly_count: number;
    critical_anomaly_count: number;
    routing_rule: string;
    claim_reference: string | null;
    routed_at: string;
  };
}

export interface BatchEscalationItem {
  claim_id: string | number;
  input: EscalationInput;
}

export interface BatchEscalationResult {
  claim_id: string | number;
  result: EscalationOutput;
}

export interface EscalationSummary {
  total: number;
  auto_approve_count: number;
  adjuster_review_count: number;
  fraud_team_count: number;
  high_priority_count: number;
  medium_priority_count: number;
  low_priority_count: number;
  auto_approve_rate_pct: number;
  fraud_team_rate_pct: number;
  adjuster_review_rate_pct: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const HIGH_FRAUD_LEVELS = new Set(["high", "critical", "elevated"]);
const MEDIUM_FRAUD_LEVELS = new Set(["medium"]);

function isFraudDetected(input: EscalationInput): boolean {
  if (input.fraud_flagged === true) return true;
  if (input.critical_fraud_flag_count != null && input.critical_fraud_flag_count > 0) return true;
  const level = (input.fraud_risk_level ?? "").toLowerCase();
  return HIGH_FRAUD_LEVELS.has(level);
}

function isMediumFraud(input: EscalationInput): boolean {
  const level = (input.fraud_risk_level ?? "").toLowerCase();
  return MEDIUM_FRAUD_LEVELS.has(level);
}

function normaliseAnomalies(anomalies: AnomalySignal[] | string[] | null | undefined): AnomalySignal[] {
  if (!anomalies || anomalies.length === 0) return [];
  return anomalies.map((a) => {
    if (typeof a === "string") return { description: a, is_critical: false };
    return a;
  });
}

function countCriticalAnomalies(anomalies: AnomalySignal[]): number {
  return anomalies.filter((a) => a.is_critical === true).length;
}

function confidenceBand(confidence: number | null | undefined): "HIGH" | "MEDIUM" | "LOW" | "INSUFFICIENT" {
  if (confidence == null) return "INSUFFICIENT";
  if (confidence >= 75) return "HIGH";
  if (confidence >= 55) return "MEDIUM";
  if (confidence >= 40) return "LOW";
  return "INSUFFICIENT";
}

function buildOutput(
  route_to: RouteDestination,
  priority: RoutePriority,
  reason: string,
  rule: string,
  input: EscalationInput,
  anomalies: AnomalySignal[]
): EscalationOutput {
  return {
    route_to,
    priority,
    reason,
    metadata: {
      recommendation: input.recommendation,
      confidence: input.confidence ?? null,
      confidence_band: confidenceBand(input.confidence),
      fraud_detected: isFraudDetected(input),
      anomaly_count: anomalies.length,
      critical_anomaly_count: countCriticalAnomalies(anomalies),
      routing_rule: rule,
      claim_reference: input.claim_reference ?? null,
      routed_at: new Date().toISOString(),
    },
  };
}

// ─── Core Engine ──────────────────────────────────────────────────────────────

/**
 * Route a single claim to the appropriate handling queue.
 */
export function routeClaim(input: EscalationInput): EscalationOutput {
  const rec = input.recommendation;
  const confidence = input.confidence ?? null;
  const anomalies = normaliseAnomalies(input.anomalies);
  const criticalAnomalyCount = countCriticalAnomalies(anomalies);
  const fraudDetected = isFraudDetected(input);
  const mediumFraud = isMediumFraud(input);
  const band = confidenceBand(confidence);

  // ── Rule 1: REJECT + fraud indicators → FRAUD_TEAM / HIGH ─────────────────
  if (rec === "REJECT" && fraudDetected) {
    return buildOutput(
      "FRAUD_TEAM",
      "HIGH",
      "Claim has been declined and exhibits confirmed fraud indicators. Referred to the Fraud Investigation Unit for formal review and potential recovery action.",
      "RULE_1_REJECT_FRAUD",
      input,
      anomalies
    );
  }

  // ── Rule 2: REJECT (no fraud) → ADJUSTER_REVIEW / HIGH ────────────────────
  if (rec === "REJECT") {
    const hasPhysicsIssue = input.physics_inconsistency === true;
    const hasDamageIssue = input.damage_inconsistent === true;
    const issueDesc =
      hasPhysicsIssue && hasDamageIssue
        ? "physical inconsistency and damage discrepancy"
        : hasPhysicsIssue
        ? "physical inconsistency"
        : hasDamageIssue
        ? "damage discrepancy"
        : "critical assessment findings";
    return buildOutput(
      "ADJUSTER_REVIEW",
      "HIGH",
      `Claim has been declined due to ${issueDesc}. Assigned to a senior adjuster for formal determination and policyholder notification.`,
      "RULE_2_REJECT_NO_FRAUD",
      input,
      anomalies
    );
  }

  // ── Rule 3: REVIEW + fraud indicators → FRAUD_TEAM / HIGH ─────────────────
  if (rec === "REVIEW" && (fraudDetected || mediumFraud)) {
    const level = fraudDetected ? "elevated" : "medium";
    return buildOutput(
      "FRAUD_TEAM",
      "HIGH",
      `Claim has been flagged for review and presents ${level} fraud risk indicators. Referred to the Fraud Investigation Unit for specialist assessment before any settlement decision.`,
      "RULE_3_REVIEW_FRAUD",
      input,
      anomalies
    );
  }

  // ── Rule 4: REVIEW + critical anomalies → ADJUSTER_REVIEW / HIGH ──────────
  if (rec === "REVIEW" && criticalAnomalyCount > 0) {
    return buildOutput(
      "ADJUSTER_REVIEW",
      "HIGH",
      `Claim requires manual review and presents ${criticalAnomalyCount} critical anomal${criticalAnomalyCount === 1 ? "y" : "ies"} that must be resolved before settlement can proceed. Assigned to a senior adjuster for urgent review.`,
      "RULE_4_REVIEW_CRITICAL_ANOMALIES",
      input,
      anomalies
    );
  }

  // ── Rule 5: REVIEW + moderate anomalies → ADJUSTER_REVIEW / MEDIUM ─────────
  if (rec === "REVIEW" && anomalies.length > 0) {
    return buildOutput(
      "ADJUSTER_REVIEW",
      "MEDIUM",
      `Claim requires manual review with ${anomalies.length} anomal${anomalies.length === 1 ? "y" : "ies"} noted. Assigned to an adjuster for standard review and verification.`,
      "RULE_5_REVIEW_ANOMALIES",
      input,
      anomalies
    );
  }

  // ── Rule 6: REVIEW (clean) → ADJUSTER_REVIEW / LOW ────────────────────────
  if (rec === "REVIEW") {
    const confidenceNote =
      band === "INSUFFICIENT"
        ? " Insufficient data was available to reach a fully automated determination."
        : band === "LOW"
        ? " Assessment confidence is limited; manual verification is required."
        : " The claim requires standard adjuster review to confirm the assessment findings.";
    return buildOutput(
      "ADJUSTER_REVIEW",
      "LOW",
      `Claim has been referred for manual review.${confidenceNote}`,
      "RULE_6_REVIEW_CLEAN",
      input,
      anomalies
    );
  }

  // ── From here: rec === "APPROVE" ───────────────────────────────────────────

  // ── Rule 7: APPROVE + insufficient confidence → ADJUSTER_REVIEW / MEDIUM ──
  if (band === "INSUFFICIENT" || (confidence != null && confidence < 40)) {
    return buildOutput(
      "ADJUSTER_REVIEW",
      "MEDIUM",
      `Claim is recommended for approval but assessment confidence is insufficient (${confidence ?? "unknown"}%). Referred to an adjuster for manual verification before settlement is authorised.`,
      "RULE_7_APPROVE_INSUFFICIENT_CONFIDENCE",
      input,
      anomalies
    );
  }

  // ── Rule 8: APPROVE + anomalies present → ADJUSTER_REVIEW / MEDIUM ─────────
  if (anomalies.length > 0) {
    return buildOutput(
      "ADJUSTER_REVIEW",
      "MEDIUM",
      `Claim is recommended for approval but ${anomalies.length} anomal${anomalies.length === 1 ? "y" : "ies"} require adjuster sign-off before settlement is processed.`,
      "RULE_8_APPROVE_ANOMALIES",
      input,
      anomalies
    );
  }

  // ── Rule 9: APPROVE + cost escalated → ADJUSTER_REVIEW / MEDIUM ────────────
  if (input.cost_escalated === true) {
    return buildOutput(
      "ADJUSTER_REVIEW",
      "MEDIUM",
      "Claim is recommended for approval but the estimated repair cost has been escalated beyond standard thresholds. Referred to an adjuster for cost verification before settlement.",
      "RULE_9_APPROVE_COST_ESCALATED",
      input,
      anomalies
    );
  }

  // ── Rule 10: APPROVE + high value → ADJUSTER_REVIEW / MEDIUM ───────────────
  if (input.is_high_value === true) {
    return buildOutput(
      "ADJUSTER_REVIEW",
      "MEDIUM",
      "Claim is recommended for approval but is classified as high-value. Mandatory adjuster sign-off is required before settlement is authorised.",
      "RULE_10_APPROVE_HIGH_VALUE",
      input,
      anomalies
    );
  }

  // ── Rule 11: APPROVE + low confidence (40–59) → AUTO_APPROVE / MEDIUM ──────
  if (band === "LOW") {
    return buildOutput(
      "AUTO_APPROVE",
      "MEDIUM",
      `Claim is approved for automated settlement processing. Assessment confidence is moderate (${confidence}%); standard post-settlement audit applies.`,
      "RULE_11_APPROVE_LOW_CONFIDENCE",
      input,
      anomalies
    );
  }

  // ── Rule 12: APPROVE + medium confidence (60–74) → AUTO_APPROVE / MEDIUM ───
  if (band === "MEDIUM") {
    return buildOutput(
      "AUTO_APPROVE",
      "MEDIUM",
      `Claim is approved for automated settlement processing with moderate confidence (${confidence}%). No anomalies or fraud indicators were detected.`,
      "RULE_12_APPROVE_MEDIUM_CONFIDENCE",
      input,
      anomalies
    );
  }

  // ── Rule 13: APPROVE + high confidence (≥ 75) → AUTO_APPROVE / LOW ─────────
  return buildOutput(
    "AUTO_APPROVE",
    "LOW",
    `Claim is approved for automated settlement processing. All assessment criteria were satisfied with high confidence (${confidence ?? "N/A"}%). No anomalies or fraud indicators were detected.`,
    "RULE_13_APPROVE_HIGH_CONFIDENCE",
    input,
    anomalies
  );
}

// ─── Batch Processing ─────────────────────────────────────────────────────────

/**
 * Route multiple claims in one pass.
 */
export function routeClaimBatch(items: BatchEscalationItem[]): BatchEscalationResult[] {
  return items.map((item) => ({
    claim_id: item.claim_id,
    result: routeClaim(item.input),
  }));
}

// ─── Aggregation ──────────────────────────────────────────────────────────────

/**
 * Aggregate routing statistics from a batch result.
 */
export function aggregateEscalationStats(results: BatchEscalationResult[]): EscalationSummary {
  const total = results.length;
  if (total === 0) {
    return {
      total: 0,
      auto_approve_count: 0,
      adjuster_review_count: 0,
      fraud_team_count: 0,
      high_priority_count: 0,
      medium_priority_count: 0,
      low_priority_count: 0,
      auto_approve_rate_pct: 0,
      fraud_team_rate_pct: 0,
      adjuster_review_rate_pct: 0,
    };
  }

  let autoApprove = 0;
  let adjusterReview = 0;
  let fraudTeam = 0;
  let highPriority = 0;
  let mediumPriority = 0;
  let lowPriority = 0;

  for (const r of results) {
    if (r.result.route_to === "AUTO_APPROVE") autoApprove++;
    else if (r.result.route_to === "ADJUSTER_REVIEW") adjusterReview++;
    else if (r.result.route_to === "FRAUD_TEAM") fraudTeam++;

    if (r.result.priority === "HIGH") highPriority++;
    else if (r.result.priority === "MEDIUM") mediumPriority++;
    else lowPriority++;
  }

  const pct = (n: number) => Math.round((n / total) * 100 * 10) / 10;

  return {
    total,
    auto_approve_count: autoApprove,
    adjuster_review_count: adjusterReview,
    fraud_team_count: fraudTeam,
    high_priority_count: highPriority,
    medium_priority_count: mediumPriority,
    low_priority_count: lowPriority,
    auto_approve_rate_pct: pct(autoApprove),
    fraud_team_rate_pct: pct(fraudTeam),
    adjuster_review_rate_pct: pct(adjusterReview),
  };
}
