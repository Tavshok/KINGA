/**
 * claimsExplanationEngine.ts
 *
 * Insurance Claims Explanation Engine
 *
 * Translates structured decision outputs (recommendation, key_drivers, reasoning)
 * into professional insurance and engineering language suitable for adjusters,
 * auditors, and claims managers.
 *
 * Rules:
 * - Use insurance and engineering terminology throughout
 * - Do NOT reference AI, models, or automated systems
 * - Output must be suitable for formal claims files and audit trails
 * - Summary: 1–2 sentences, suitable for a claims register entry
 * - Detailed explanation: structured paragraphs covering decision basis,
 *   supporting evidence, and any conditions or caveats
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type Recommendation = "APPROVE" | "REVIEW" | "REJECT";

export type DecisionBasis =
  | "assessor_validated"
  | "system_validated"
  | "insufficient_data";

export interface ExplanationInput {
  recommendation: Recommendation;
  key_drivers: string[];
  reasoning: string;
  /** Optional enrichment fields */
  confidence?: number | null;
  decision_basis?: DecisionBasis | null;
  claim_reference?: string | null;
  incident_type?: string | null;
  severity?: string | null;
  estimated_cost?: number | null;
  currency?: string | null;
  fraud_risk_level?: string | null;
  physics_plausible?: boolean | null;
  damage_consistent?: boolean | null;
  consistency_status?: string | null;
  blocking_factors?: string[] | null;
  warnings?: string[] | null;
}

export interface ExplanationOutput {
  summary: string;
  detailed_explanation: string;
  /** Structured sections for rendering in the UI */
  sections: ExplanationSection[];
  metadata: {
    recommendation: Recommendation;
    decision_basis: DecisionBasis | null;
    confidence_band: "HIGH" | "MEDIUM" | "LOW" | "INSUFFICIENT";
    generated_at: string;
    engine: string;
    version: string;
  };
}

export interface ExplanationSection {
  heading: string;
  body: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ENGINE_NAME = "Claims Explanation Engine";
const ENGINE_VERSION = "1.0.0";

/** Maps raw driver keys to professional insurance terminology */
const DRIVER_LABELS: Record<string, string> = {
  // Fraud signals
  fraud_high: "elevated fraud risk indicators",
  fraud_elevated: "elevated fraud risk indicators",
  fraud_medium: "moderate fraud risk indicators",
  fraud_low: "no material fraud risk indicators",
  fraud_risk_high: "elevated fraud risk indicators",
  fraud_risk_elevated: "elevated fraud risk indicators",
  fraud_risk_medium: "moderate fraud risk indicators",
  fraud_risk_low: "no material fraud risk indicators",

  // Physics / mechanics
  physics_implausible: "physical inconsistency between reported impact and observed damage",
  physics_plausible: "damage pattern consistent with reported impact mechanics",
  physics_critical_inconsistency: "critical mechanical inconsistency identified",
  physics_low_confidence: "limited corroborating physical evidence",

  // Damage
  damage_inconsistent: "damage pattern inconsistency",
  damage_consistent: "damage pattern consistent with reported incident",
  unexplained_damage: "unexplained damage components identified",
  damage_high_severity: "high-severity structural damage",
  damage_moderate_severity: "moderate structural damage",
  damage_minor_severity: "minor cosmetic damage",

  // Cost
  cost_escalation: "cost estimate exceeds expected range for incident type",
  cost_within_range: "repair cost estimate within expected parameters",
  cost_anomaly: "cost anomaly detected",
  cost_negotiate: "cost negotiation recommended",

  // Consistency
  critical_conflicts: "critical data conflicts across claim documentation",
  moderate_conflicts: "moderate data conflicts across claim documentation",
  consistent: "claim documentation internally consistent",

  // Confidence
  confidence_high: "high assessment confidence",
  confidence_medium: "moderate assessment confidence",
  confidence_low: "low assessment confidence",
  confidence_insufficient: "insufficient data for reliable assessment",

  // Severity
  severity_critical: "critical damage severity",
  severity_high: "high damage severity",
  severity_moderate: "moderate damage severity",
  severity_minor: "minor damage severity",

  // Assessor
  assessor_validated: "assessor-validated claim",
  high_value_claim: "high-value claim requiring senior review",
  insufficient_data: "insufficient documentation for complete assessment",
  missing_documentation: "incomplete supporting documentation",
};

/** Maps recommendation to a formal disposition label */
const DISPOSITION_LABELS: Record<Recommendation, string> = {
  APPROVE: "Approved for Settlement",
  REVIEW: "Referred for Manual Review",
  REJECT: "Declined",
};

/** Maps recommendation to a formal opening phrase */
const DISPOSITION_OPENERS: Record<Recommendation, string> = {
  APPROVE:
    "Following a thorough technical and documentary review, this claim has been assessed as eligible for settlement.",
  REVIEW:
    "Following a preliminary technical and documentary review, this claim has been referred for manual assessment by a qualified claims adjuster.",
  REJECT:
    "Following a thorough technical and documentary review, this claim has been assessed as ineligible for settlement.",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function confidenceBand(
  confidence: number | null | undefined
): "HIGH" | "MEDIUM" | "LOW" | "INSUFFICIENT" {
  if (confidence == null) return "INSUFFICIENT";
  if (confidence >= 75) return "HIGH";
  if (confidence >= 55) return "MEDIUM";
  if (confidence >= 40) return "LOW";
  return "INSUFFICIENT";
}

function formatCurrency(amount: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

function humaniseDriver(driver: string): string {
  // Check direct lookup first
  const lower = driver.toLowerCase().replace(/[\s-]/g, "_");
  if (DRIVER_LABELS[lower]) return DRIVER_LABELS[lower];

  // Partial match
  for (const [key, label] of Object.entries(DRIVER_LABELS)) {
    if (lower.includes(key) || key.includes(lower)) return label;
  }

  // Fall back: convert snake_case to sentence case
  return driver
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase());
}

function buildDriverList(drivers: string[]): string {
  if (drivers.length === 0) return "no specific factors were identified";
  const humanised = drivers.map(humaniseDriver);
  if (humanised.length === 1) return humanised[0];
  if (humanised.length === 2) return `${humanised[0]} and ${humanised[1]}`;
  const last = humanised[humanised.length - 1];
  const rest = humanised.slice(0, -1).join(", ");
  return `${rest}, and ${last}`;
}

function incidentTypeLabel(type: string | null | undefined): string {
  if (!type) return "vehicle incident";
  const map: Record<string, string> = {
    frontal: "frontal collision",
    rear: "rear-end collision",
    side: "side-impact collision",
    rollover: "rollover incident",
    hail: "hail damage event",
    flood: "flood damage event",
    fire: "fire damage event",
    theft: "theft-related claim",
    vandalism: "vandalism incident",
    single_vehicle: "single-vehicle incident",
  };
  const key = type.toLowerCase().replace(/[\s-]/g, "_");
  return map[key] ?? type.replace(/_/g, " ").toLowerCase();
}

function severityLabel(severity: string | null | undefined): string {
  if (!severity) return null as unknown as string;
  const map: Record<string, string> = {
    critical: "critical",
    high: "high",
    moderate: "moderate",
    minor: "minor",
    none: "no structural",
  };
  return map[severity.toLowerCase()] ?? severity.toLowerCase();
}

// ─── Summary Generator ────────────────────────────────────────────────────────

function generateSummary(input: ExplanationInput): string {
  const disposition = DISPOSITION_LABELS[input.recommendation];
  const ref = input.claim_reference ? ` (Ref: ${input.claim_reference})` : "";
  const incident = incidentTypeLabel(input.incident_type);
  const driverPhrase = buildDriverList(input.key_drivers.slice(0, 3));

  if (input.recommendation === "APPROVE") {
    const costPart =
      input.estimated_cost != null
        ? ` with an estimated settlement value of ${formatCurrency(input.estimated_cost, input.currency ?? "USD")}`
        : "";
    return (
      `This ${incident} claim${ref} has been ${disposition.toLowerCase()}${costPart}, ` +
      `supported by ${driverPhrase}.`
    );
  }

  if (input.recommendation === "REJECT") {
    return (
      `This ${incident} claim${ref} has been ${disposition.toLowerCase()} on the basis of ${driverPhrase}.`
    );
  }

  // REVIEW
  return (
    `This ${incident} claim${ref} has been referred for manual review due to ${driverPhrase}, ` +
    `and requires adjuster assessment before a settlement determination can be made.`
  );
}

// ─── Section Generators ───────────────────────────────────────────────────────

function buildDecisionBasisSection(input: ExplanationInput): ExplanationSection {
  const opener = DISPOSITION_OPENERS[input.recommendation];
  const basisMap: Record<DecisionBasis, string> = {
    assessor_validated:
      "This determination has been confirmed by a qualified assessor and is supported by documentary evidence on file.",
    system_validated:
      "This determination is based on a comprehensive technical review of all available claim documentation, physical evidence, and supporting data.",
    insufficient_data:
      "This determination is provisional, as the available documentation does not fully support a definitive assessment. Additional evidence is required before a final determination can be issued.",
  };
  const basisStatement =
    input.decision_basis ? basisMap[input.decision_basis] : basisMap.system_validated;

  const confidenceStatement = (() => {
    const band = confidenceBand(input.confidence);
    if (band === "HIGH")
      return "The overall assessment confidence is high, indicating strong evidentiary support for this determination.";
    if (band === "MEDIUM")
      return "The overall assessment confidence is moderate; the determination is supported by the available evidence, though some data gaps remain.";
    if (band === "LOW")
      return "The overall assessment confidence is limited; the determination reflects the best available evidence, but material uncertainties remain.";
    return "Insufficient data was available to establish a reliable confidence level for this determination.";
  })();

  return {
    heading: "Decision Basis",
    body: `${opener} ${basisStatement} ${confidenceStatement}`,
  };
}

function buildTechnicalFindingsSection(input: ExplanationInput): ExplanationSection {
  const lines: string[] = [];

  // Physics
  if (input.physics_plausible === true) {
    lines.push(
      "The reported impact mechanics are consistent with the observed damage pattern. " +
      "The distribution and severity of structural damage align with the described incident dynamics."
    );
  } else if (input.physics_plausible === false) {
    lines.push(
      "A physical inconsistency has been identified between the reported impact and the observed damage pattern. " +
      "The nature and distribution of the damage are not consistent with the described incident dynamics, " +
      "which raises material questions regarding the accuracy of the reported circumstances."
    );
  }

  // Damage consistency
  if (input.damage_consistent === true) {
    lines.push(
      "The documented damage is internally consistent across all available evidence sources, " +
      "including photographic records, repair estimates, and incident reports."
    );
  } else if (input.damage_consistent === false) {
    lines.push(
      "Inconsistencies have been identified in the documented damage. " +
      "Discrepancies exist between the reported damage, photographic evidence, and/or repair estimates, " +
      "which require adjuster review and reconciliation."
    );
  }

  // Severity
  if (input.severity) {
    const sev = severityLabel(input.severity);
    lines.push(
      `The assessed damage severity is classified as ${sev}, based on the extent of structural and cosmetic damage identified.`
    );
  }

  // Cost
  if (input.estimated_cost != null) {
    const formatted = formatCurrency(input.estimated_cost, input.currency ?? "USD");
    lines.push(
      `The estimated repair or replacement cost is ${formatted}. ` +
      (input.key_drivers.some((d) => d.toLowerCase().includes("cost_escalation") || d.toLowerCase().includes("cost_anomaly"))
        ? "This figure has been flagged as exceeding the expected cost range for the incident type and severity classification, and is subject to further review."
        : "This figure falls within the expected cost range for the incident type and severity classification.")
    );
  }

  // Consistency status
  if (input.consistency_status === "CONFLICTED") {
    lines.push(
      "Data conflicts have been identified across the claim documentation. " +
      "These conflicts must be resolved prior to final settlement determination."
    );
  }

  if (lines.length === 0) {
    lines.push(
      "The technical review of the available evidence has been completed. " +
      "Findings are documented in the supporting assessment records."
    );
  }

  return {
    heading: "Technical Findings",
    body: lines.join(" "),
  };
}

function buildFraudRiskSection(input: ExplanationInput): ExplanationSection | null {
  if (!input.fraud_risk_level) return null;

  const level = input.fraud_risk_level.toLowerCase();

  const bodyMap: Record<string, string> = {
    high:
      "The claim exhibits multiple indicators consistent with potential misrepresentation or fraudulent submission. " +
      "These indicators have been identified through a systematic review of the claim documentation, incident circumstances, " +
      "and historical claim patterns. This claim must be referred to the Special Investigations Unit (SIU) prior to any " +
      "settlement action. No payment should be authorised until the SIU review is complete.",
    elevated:
      "The claim presents elevated indicators of potential misrepresentation. " +
      "While the evidence does not conclusively establish fraudulent intent, the combination of identified risk factors " +
      "warrants enhanced scrutiny. This claim should be reviewed by a senior adjuster with reference to the identified risk indicators " +
      "before any settlement determination is made.",
    medium:
      "Moderate risk indicators have been identified in the course of this review. " +
      "These indicators do not, individually, constitute grounds for referral; however, they should be noted in the claims file " +
      "and considered in the context of the overall assessment. The adjuster should verify the identified risk factors " +
      "before proceeding to settlement.",
    low:
      "No material fraud risk indicators were identified in the course of this review. " +
      "The claim documentation and incident circumstances are consistent with a bona fide loss event.",
    none:
      "No fraud risk indicators were identified. The claim has been assessed as a bona fide loss event.",
  };

  const body = bodyMap[level] ?? bodyMap.low;

  return {
    heading: "Fraud Risk Assessment",
    body,
  };
}

function buildKeyDriversSection(input: ExplanationInput): ExplanationSection {
  if (input.key_drivers.length === 0) {
    return {
      heading: "Assessment Factors",
      body: "No specific assessment factors were recorded for this determination.",
    };
  }

  const items = input.key_drivers
    .map((d, i) => `${i + 1}. ${humaniseDriver(d).replace(/^\w/, (c) => c.toUpperCase())}.`)
    .join(" ");

  return {
    heading: "Assessment Factors",
    body:
      `The following factors were determinative in reaching this assessment outcome: ${items}`,
  };
}

function buildBlockingFactorsSection(input: ExplanationInput): ExplanationSection | null {
  if (!input.blocking_factors || input.blocking_factors.length === 0) return null;

  const items = input.blocking_factors
    .map((f, i) => `${i + 1}. ${humaniseDriver(f).replace(/^\w/, (c) => c.toUpperCase())}.`)
    .join(" ");

  return {
    heading: "Conditions Preventing Settlement",
    body:
      `The following conditions must be resolved before this claim can proceed to settlement: ${items}`,
  };
}

function buildWarningsSection(input: ExplanationInput): ExplanationSection | null {
  if (!input.warnings || input.warnings.length === 0) return null;

  const items = input.warnings
    .map((w, i) => `${i + 1}. ${w.replace(/^\w/, (c) => c.toUpperCase())}.`)
    .join(" ");

  return {
    heading: "Advisory Notes",
    body:
      `The following advisory notes have been recorded and should be considered by the handling adjuster: ${items}`,
  };
}

function buildRecommendationSection(input: ExplanationInput): ExplanationSection {
  const actionMap: Record<Recommendation, string> = {
    APPROVE:
      "This claim is recommended for settlement in accordance with the applicable policy terms and conditions. " +
      "The handling adjuster should proceed with the preparation of the settlement offer and obtain the necessary " +
      "authorisation in accordance with the applicable delegated authority schedule.",
    REVIEW:
      "This claim requires manual review by a qualified claims adjuster before a settlement determination can be made. " +
      "The adjuster should review all available documentation, address the identified concerns, and document their findings " +
      "in the claims file before proceeding.",
    REJECT:
      "This claim is recommended for decline. The handling adjuster should prepare a formal decline letter, " +
      "referencing the specific policy provisions and factual grounds for the determination. " +
      "The claimant's right to dispute the determination should be communicated in accordance with applicable regulatory requirements.",
  };

  return {
    heading: "Recommended Action",
    body: actionMap[input.recommendation],
  };
}

// ─── Detailed Explanation Builder ─────────────────────────────────────────────

function buildDetailedExplanation(sections: ExplanationSection[]): string {
  return sections
    .map((s) => `**${s.heading}**\n\n${s.body}`)
    .join("\n\n---\n\n");
}

// ─── Main Engine ──────────────────────────────────────────────────────────────

export function generateClaimExplanation(input: ExplanationInput): ExplanationOutput {
  // Build sections
  const sections: ExplanationSection[] = [];

  sections.push(buildDecisionBasisSection(input));
  sections.push(buildTechnicalFindingsSection(input));

  const fraudSection = buildFraudRiskSection(input);
  if (fraudSection) sections.push(fraudSection);

  sections.push(buildKeyDriversSection(input));

  const blockingSection = buildBlockingFactorsSection(input);
  if (blockingSection) sections.push(blockingSection);

  const warningsSection = buildWarningsSection(input);
  if (warningsSection) sections.push(warningsSection);

  sections.push(buildRecommendationSection(input));

  const summary = generateSummary(input);
  const detailed_explanation = buildDetailedExplanation(sections);

  return {
    summary,
    detailed_explanation,
    sections,
    metadata: {
      recommendation: input.recommendation,
      decision_basis: input.decision_basis ?? null,
      confidence_band: confidenceBand(input.confidence),
      generated_at: new Date().toISOString(),
      engine: ENGINE_NAME,
      version: ENGINE_VERSION,
    },
  };
}

// ─── Batch Processor ─────────────────────────────────────────────────────────

export interface BatchExplanationInput {
  claim_id: number | string;
  input: ExplanationInput;
}

export interface BatchExplanationResult {
  claim_id: number | string;
  result: ExplanationOutput;
}

export function generateClaimExplanationBatch(
  items: BatchExplanationInput[]
): BatchExplanationResult[] {
  return items.map((item) => ({
    claim_id: item.claim_id,
    result: generateClaimExplanation(item.input),
  }));
}
