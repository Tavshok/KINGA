/**
 * Stage 10-I: Claim Interpretation Engine
 *
 * Sits between all analysis stages and the report generator.
 * Transforms raw engineering outputs (numbers, statuses, scores) into
 * structured, plain-English findings that a claims manager can act on
 * without any engineering background.
 *
 * Architecture:
 *   Stage 6 (Vision) ──┐
 *   Stage 7 (Physics) ──┤
 *   Stage 8 (Fraud) ────┤──▶ Stage 10-I ──▶ InterpretedClaim ──▶ Report
 *   Stage 9 (Cost) ─────┤
 *   Stage 9.5 (CGI) ────┘
 *
 * Each engine contributes a section of InterpretedFindings.
 * The LLM is called ONCE per claim to generate:
 *   - Per-engine summaries (2–3 sentences each)
 *   - Cross-engine overall narrative (what the whole picture means)
 *   - Top 3 recommended actions for the adjuster
 *
 * Individual findings (classification + interpretation + business impact +
 * recommended action) are generated deterministically from the raw outputs,
 * then enriched by the LLM narrative.
 */

import { invokeLLM } from "../_core/llm";
import type { Stage6Output, Stage7Output, Stage8Output, Stage9Output, ClaimRecord } from "./types";
import type { Stage9_5Output } from "./stage-9-5-cgi";

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export type FindingClassification =
  | "NORMAL"
  | "ATTENTION"
  | "CONCERN"
  | "CRITICAL"
  | "UNAVAILABLE";

export interface InterpretedFinding {
  /** Short label, e.g. "Crush Depth" */
  label: string;
  /** Formatted value with unit, e.g. "128 mm" or "N/A" */
  value: string;
  /** Traffic-light classification */
  classification: FindingClassification;
  /** Plain-English meaning of the value in context */
  interpretation: string;
  /** How this finding affects the claim decision */
  businessImpact: string;
  /** What the adjuster should do — null for NORMAL/ATTENTION */
  recommendedAction: string | null;
  /** Source engine that produced this finding */
  sourceEngine: "VISION" | "PHYSICS" | "FRAUD" | "COST" | "CGI";
}

export interface InterpretedEngineSection {
  engine: "VISION" | "PHYSICS" | "FRAUD" | "COST" | "CGI";
  engineLabel: string;
  findings: InterpretedFinding[];
  /** LLM-generated 2–3 sentence summary of this engine's contribution */
  summary: string;
  /** The most important risk signal from this engine, or null if none */
  keyRisk: string | null;
  /** Whether this engine ran and produced usable output */
  available: boolean;
}

export interface InterpretedClaim {
  /** Ordered sections, one per engine */
  sections: InterpretedEngineSection[];
  /** LLM-generated cross-engine narrative (3–5 sentences) */
  overallNarrative: string;
  /** Top 3 actions the adjuster should take, in priority order */
  topThreeActions: [string, string, string] | [string, string] | [string] | [];
  /** Overall claim risk classification derived from all engines */
  overallClassification: FindingClassification;
  /** ISO timestamp when this interpretation was generated */
  generatedAt: string;
  /** Engine version */
  engineVersion: string;
  /** Whether the LLM call succeeded or fell back to deterministic summaries */
  llmEnriched: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const ENGINE_VERSION = "1.0.0";

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic finding extractors — one per engine
// These produce the structured findings WITHOUT any LLM call.
// ─────────────────────────────────────────────────────────────────────────────

function classifyScore(
  score: number,
  thresholds: { concern: number; critical: number },
  invert = false
): FindingClassification {
  const v = invert ? 100 - score : score;
  if (v >= thresholds.critical) return "CRITICAL";
  if (v >= thresholds.concern) return "CONCERN";
  if (v >= thresholds.concern * 0.6) return "ATTENTION";
  return "NORMAL";
}

function fmt(value: number | null | undefined, unit: string, decimals = 0): string {
  if (value == null || isNaN(value)) return "N/A";
  return `${value.toFixed(decimals)} ${unit}`.trim();
}

// ── Vision (Stage 6) ─────────────────────────────────────────────────────────

function extractVisionFindings(s6: Stage6Output): InterpretedFinding[] {
  const findings: InterpretedFinding[] = [];

  // Overall severity score
  const sev = s6.overallSeverityScore ?? null;
  const sevClass: FindingClassification =
    sev == null ? "UNAVAILABLE"
    : sev >= 80 ? "CRITICAL"
    : sev >= 60 ? "CONCERN"
    : sev >= 40 ? "ATTENTION"
    : "NORMAL";
  findings.push({
    label: "Visual Damage Severity",
    value: sev != null ? `${sev}/100` : "N/A",
    classification: sevClass,
    interpretation:
      sev == null ? "Severity score could not be computed from available images."
      : sev >= 80 ? "Damage is visually severe across multiple panels. This level of damage typically indicates significant structural loading."
      : sev >= 60 ? "Moderate-to-high visual damage. Multiple components are affected and repair scope is likely to be substantial."
      : sev >= 40 ? "Moderate visual damage. Damage is localised and consistent with a low-to-medium speed impact."
      : "Visual damage is minor. Consistent with a low-speed or glancing impact.",
    businessImpact:
      sev == null ? "Severity cannot be used to validate the claim narrative."
      : sev >= 80 ? "High probability of hidden structural damage beyond visible surface repairs."
      : sev >= 60 ? "Repair costs are likely to be above average for this vehicle class."
      : sev >= 40 ? "Repair costs are within the expected range for this type of incident."
      : "Repair costs should be modest. Scrutinise any quote that significantly exceeds the visual damage.",
    recommendedAction:
      sev != null && sev >= 80 ? "Commission a structural inspection before approving any repair authorisation."
      : sev != null && sev >= 60 ? "Verify that the repair quote covers all visually damaged components."
      : null,
    sourceEngine: "VISION",
  });

  // Structural damage flag
  findings.push({
    label: "Structural Damage Detected",
    value: s6.structuralDamageDetected ? "Yes" : "No",
    classification: s6.structuralDamageDetected ? "CRITICAL" : "NORMAL",
    interpretation: s6.structuralDamageDetected
      ? "Vision analysis identified damage patterns consistent with structural compromise — deformation beyond the outer skin panels."
      : "No structural damage indicators detected in the available images.",
    businessImpact: s6.structuralDamageDetected
      ? "Structural damage significantly increases total repair cost and may affect the vehicle's roadworthiness and resale value."
      : "Repairs are likely to be cosmetic or panel-level, limiting the scope for hidden cost escalation.",
    recommendedAction: s6.structuralDamageDetected
      ? "Require a structural assessment report from a certified repairer before approving the claim."
      : null,
    sourceEngine: "VISION",
  });

  // Photo coverage
  const photosCovered = s6.photosProcessed ?? 0;
  const photosAvail = s6.photosAvailable ?? 0;
  const coveragePct = photosAvail > 0 ? Math.round((photosCovered / photosAvail) * 100) : null;
  const coverageClass: FindingClassification =
    coveragePct == null ? "UNAVAILABLE"
    : coveragePct >= 80 ? "NORMAL"
    : coveragePct >= 50 ? "ATTENTION"
    : "CONCERN";
  findings.push({
    label: "Photo Evidence Coverage",
    value: coveragePct != null ? `${photosCovered}/${photosAvail} images (${coveragePct}%)` : "N/A",
    classification: coverageClass,
    interpretation:
      coveragePct == null ? "Photo coverage could not be assessed."
      : coveragePct >= 80 ? "Good photo coverage. The damage assessment is based on a representative set of images."
      : coveragePct >= 50 ? "Partial photo coverage. Some damage areas may not have been captured."
      : "Limited photo coverage. The damage assessment may be incomplete.",
    businessImpact:
      coveragePct != null && coveragePct < 50
        ? "Low photo coverage increases the risk of undiscovered damage being approved without visual evidence."
        : "Photo coverage is sufficient to support the damage assessment.",
    recommendedAction:
      coveragePct != null && coveragePct < 50
        ? "Request additional photographs covering all four vehicle quadrants before approving repairs."
        : null,
    sourceEngine: "VISION",
  });

  // Damaged parts count
  const partCount = s6.damagedParts?.length ?? 0;
  findings.push({
    label: "Damaged Components Identified",
    value: `${partCount} component${partCount !== 1 ? "s" : ""}`,
    classification: partCount === 0 ? "UNAVAILABLE" : "NORMAL",
    interpretation:
      partCount === 0 ? "No individual damaged components were identified from the images."
      : `Vision analysis identified ${partCount} damaged component${partCount !== 1 ? "s" : ""}.`,
    businessImpact:
      partCount === 0 ? "Without component-level identification, the repair quote cannot be validated against visual evidence."
      : "Component list can be cross-referenced against the repair quote to identify any scope gaps or over-billing.",
    recommendedAction:
      partCount === 0 ? "Request clearer photographs and resubmit for analysis." : null,
    sourceEngine: "VISION",
  });

  return findings;
}

// ── Physics (Stage 7) ────────────────────────────────────────────────────────

function extractPhysicsFindings(s7: Stage7Output): InterpretedFinding[] {
  const findings: InterpretedFinding[] = [];

  if (!s7.physicsExecuted || s7.physicsStatus === "SKIPPED_NO_SPEED") {
    findings.push({
      label: "Physics Reconstruction",
      value: "Not executed",
      classification: "UNAVAILABLE",
      interpretation: "Physics reconstruction was not performed because the impact speed could not be determined from the available documents.",
      businessImpact: "Without physics reconstruction, the consistency between the claimed damage and the collision energy cannot be independently verified.",
      recommendedAction: "Obtain the police accident report or witness statements to establish the impact speed.",
      sourceEngine: "PHYSICS",
    });
    return findings;
  }

  // Estimated speed
  const speed = s7.estimatedSpeedKmh ?? null;
  const speedClass: FindingClassification =
    speed == null ? "UNAVAILABLE"
    : speed >= 100 ? "CRITICAL"
    : speed >= 60 ? "CONCERN"
    : speed >= 30 ? "ATTENTION"
    : "NORMAL";
  findings.push({
    label: "Reconstructed Impact Speed",
    value: fmt(speed, "km/h"),
    classification: speedClass,
    interpretation:
      speed == null ? "Impact speed could not be reconstructed."
      : speed >= 100 ? `The reconstructed impact speed of ${speed} km/h is very high. This level of energy is consistent with severe structural damage and potential total loss.`
      : speed >= 60 ? `The reconstructed impact speed of ${speed} km/h is significant. Damage patterns are consistent with a moderate-to-high energy collision.`
      : speed >= 30 ? `The reconstructed impact speed of ${speed} km/h is moderate. Damage is consistent with an urban or low-speed road collision.`
      : `The reconstructed impact speed of ${speed} km/h is low. Damage should be limited to cosmetic or minor structural components.`,
    businessImpact:
      speed != null && speed >= 60
        ? "High-speed impacts carry elevated risk of hidden structural and mechanical damage not visible in photographs."
        : speed != null
        ? "Speed is consistent with the claimed incident type. No speed-based anomaly detected."
        : "Speed-based validation is unavailable.",
    recommendedAction:
      speed != null && speed >= 100 ? "Conduct a total loss assessment before authorising repairs."
      : speed != null && speed >= 60 ? "Ensure the repair scope includes inspection of suspension, chassis, and drivetrain components."
      : null,
    sourceEngine: "PHYSICS",
  });

  // Delta-V
  const dv = s7.deltaVKmh ?? null;
  findings.push({
    label: "Velocity Change (ΔV)",
    value: fmt(dv, "km/h"),
    classification: dv == null ? "UNAVAILABLE" : dv >= 50 ? "CRITICAL" : dv >= 25 ? "CONCERN" : dv >= 10 ? "ATTENTION" : "NORMAL",
    interpretation:
      dv == null ? "Velocity change could not be calculated."
      : dv >= 50 ? `A ΔV of ${dv} km/h represents a severe change in momentum. Occupant injury risk is high and structural damage is expected to be extensive.`
      : dv >= 25 ? `A ΔV of ${dv} km/h is significant. This level of momentum change is associated with moderate-to-severe vehicle damage.`
      : dv >= 10 ? `A ΔV of ${dv} km/h is moderate. Consistent with a typical urban collision.`
      : `A ΔV of ${dv} km/h is low. Structural damage should be minimal.`,
    businessImpact:
      dv != null && dv >= 50 ? "High ΔV increases the likelihood of injury claims and total loss."
      : dv != null ? "ΔV is within the expected range for the reported incident type."
      : "ΔV-based validation unavailable.",
    recommendedAction: dv != null && dv >= 50 ? "Review for injury claims and consider total loss assessment." : null,
    sourceEngine: "PHYSICS",
  });

  // Damage consistency score
  const dcs = s7.damageConsistencyScore ?? null;
  const dcsClass: FindingClassification =
    dcs == null ? "UNAVAILABLE"
    : dcs >= 80 ? "NORMAL"
    : dcs >= 60 ? "ATTENTION"
    : dcs >= 40 ? "CONCERN"
    : "CRITICAL";
  findings.push({
    label: "Damage–Physics Consistency",
    value: dcs != null ? `${dcs}/100` : "N/A",
    classification: dcsClass,
    interpretation:
      dcs == null ? "Consistency between the damage and physics could not be assessed."
      : dcs >= 80 ? "The observed damage pattern is highly consistent with the reconstructed collision physics. No anomalies detected."
      : dcs >= 60 ? "The damage is broadly consistent with the physics, though minor discrepancies exist."
      : dcs >= 40 ? "Significant discrepancies exist between the observed damage and what the physics predicts. This warrants investigation."
      : "The damage pattern is substantially inconsistent with the reconstructed collision physics. This is a strong indicator of either pre-existing damage or a misrepresented incident.",
    businessImpact:
      dcs != null && dcs < 60
        ? "Low consistency scores are a key fraud indicator. The claim may require enhanced scrutiny."
        : "Damage and physics are consistent. No anomaly-based concern.",
    recommendedAction:
      dcs != null && dcs < 60 ? "Escalate to senior assessor for manual review. Request additional evidence including police report and witness statements." : null,
    sourceEngine: "PHYSICS",
  });

  // Accident severity
  const accSev = s7.accidentSeverity ?? null;
  findings.push({
    label: "Accident Severity Classification",
    value: accSev ?? "N/A",
    classification:
      accSev == null ? "UNAVAILABLE"
      : accSev === "severe" || accSev === "catastrophic" ? "CRITICAL"
      : accSev === "moderate" ? "CONCERN"
      : accSev === "minor" ? "ATTENTION"
      : "NORMAL",
    interpretation:
      accSev == null ? "Accident severity could not be classified."
      : accSev === "severe" || accSev === "catastrophic" ? "The collision has been classified as severe based on reconstructed energy and damage patterns."
      : accSev === "moderate" ? "The collision has been classified as moderate. Significant damage is expected but total loss is unlikely."
      : accSev === "minor" ? "The collision has been classified as minor. Damage should be limited to outer panels."
      : "The collision has been classified as low severity.",
    businessImpact:
      accSev === "severe" || accSev === "catastrophic" ? "Severe accidents carry elevated risk of structural damage, injury claims, and total loss."
      : accSev === "moderate" ? "Moderate accidents may involve hidden damage beyond the visible repair scope."
      : "Severity is consistent with a straightforward repair claim.",
    recommendedAction:
      accSev === "severe" || accSev === "catastrophic" ? "Conduct a total loss assessment and review for injury claims." : null,
    sourceEngine: "PHYSICS",
  });

  return findings;
}

// ── Fraud (Stage 8) ──────────────────────────────────────────────────────────

function extractFraudFindings(s8: Stage8Output): InterpretedFinding[] {
  const findings: InterpretedFinding[] = [];

  // Fraud risk score
  const score = s8.fraudRiskScore ?? null;
  const level = s8.fraudRiskLevel ?? null;
  const fraudClass: FindingClassification =
    score == null ? "UNAVAILABLE"
    : score >= 75 ? "CRITICAL"
    : score >= 50 ? "CONCERN"
    : score >= 30 ? "ATTENTION"
    : "NORMAL";
  findings.push({
    label: "Fraud Risk Score",
    value: score != null ? `${score}/100 (${level ?? "Unknown"})` : "N/A",
    classification: fraudClass,
    interpretation:
      score == null ? "Fraud risk could not be assessed."
      : score >= 75 ? `The fraud risk score of ${score}/100 is high. Multiple indicators have been triggered that are associated with fraudulent or inflated claims.`
      : score >= 50 ? `The fraud risk score of ${score}/100 is elevated. Some indicators suggest the claim may warrant closer scrutiny.`
      : score >= 30 ? `The fraud risk score of ${score}/100 is moderate. A small number of indicators have been triggered, but the overall pattern is not strongly suspicious.`
      : `The fraud risk score of ${score}/100 is low. No significant fraud indicators have been detected.`,
    businessImpact:
      score != null && score >= 75 ? "High fraud risk scores are associated with a significantly elevated probability of claim manipulation. Approval without investigation carries financial and regulatory risk."
      : score != null && score >= 50 ? "Elevated fraud risk warrants additional verification before approval."
      : "Fraud risk is within acceptable parameters for standard processing.",
    recommendedAction:
      score != null && score >= 75 ? "Refer to the Special Investigations Unit (SIU) before making any payment decision."
      : score != null && score >= 50 ? "Request additional supporting documentation and conduct a site inspection."
      : null,
    sourceEngine: "FRAUD",
  });

  // Active fraud indicators
  const activeIndicators = (s8.indicators ?? []).filter((i: any) => i.triggered || i.status === "FLAG" || i.status === "CONCERN");
  findings.push({
    label: "Active Fraud Indicators",
    value: `${activeIndicators.length} triggered`,
    classification:
      activeIndicators.length === 0 ? "NORMAL"
      : activeIndicators.length >= 4 ? "CRITICAL"
      : activeIndicators.length >= 2 ? "CONCERN"
      : "ATTENTION",
    interpretation:
      activeIndicators.length === 0 ? "No individual fraud indicators have been triggered. The claim pattern is consistent with a genuine incident."
      : activeIndicators.length >= 4 ? `${activeIndicators.length} fraud indicators have been triggered simultaneously. This pattern is strongly associated with organised fraud or significant claim inflation.`
      : activeIndicators.length >= 2 ? `${activeIndicators.length} fraud indicators have been triggered. While individual indicators can occur in genuine claims, the combination warrants review.`
      : `${activeIndicators.length} fraud indicator has been triggered. This is a minor signal that should be noted but does not alone indicate fraud.`,
    businessImpact:
      activeIndicators.length >= 4 ? "Multiple simultaneous fraud indicators significantly increase the probability of a fraudulent claim."
      : activeIndicators.length >= 2 ? "Multiple indicators increase the risk of claim manipulation."
      : "Single indicator is a low-level signal.",
    recommendedAction:
      activeIndicators.length >= 4 ? "Do not approve. Refer to SIU immediately."
      : activeIndicators.length >= 2 ? "Place the claim on hold and request a site inspection."
      : null,
    sourceEngine: "FRAUD",
  });

  // Quote deviation (plain number — percentage deviation from expected cost)
  const qd = s8.quoteDeviation;
  if (qd != null) {
    const devPct = Math.abs(qd);
    findings.push({
      label: "Quote vs. Expected Cost Deviation",
      value: `${qd > 0 ? "+" : ""}${qd.toFixed(1)}%`,
      classification:
        devPct >= 50 ? "CRITICAL"
        : devPct >= 25 ? "CONCERN"
        : devPct >= 10 ? "ATTENTION"
        : "NORMAL",
      interpretation:
        devPct >= 50 ? `The submitted quote is ${devPct.toFixed(0)}% ${qd > 0 ? "above" : "below"} the expected cost for this type of damage. This is a significant deviation that requires explanation.`
        : devPct >= 25 ? `The submitted quote deviates ${devPct.toFixed(0)}% from the expected cost. This is above the normal tolerance range.`
        : devPct >= 10 ? `The submitted quote is ${devPct.toFixed(0)}% from the expected cost. This is within a borderline range.`
        : "The submitted quote is within the expected cost range for this type of damage.",
      businessImpact:
        devPct >= 25 ? "Large quote deviations are a key indicator of inflated billing or scope creep."
        : "Quote is within acceptable parameters.",
      recommendedAction:
        devPct >= 50 ? "Negotiate the quote down to within 20% of the expected cost before authorising repairs."
        : devPct >= 25 ? "Request a detailed line-item breakdown and compare against market rates."
        : null,
      sourceEngine: "FRAUD",
    });
  }

  return findings;
}

// ── Cost (Stage 9) ───────────────────────────────────────────────────────────

function extractCostFindings(s9: Stage9Output): InterpretedFinding[] {
  const findings: InterpretedFinding[] = [];

  // Expected repair cost
  const expected = s9.expectedRepairCostCents != null ? s9.expectedRepairCostCents / 100 : null;
  findings.push({
    label: "KINGA Expected Repair Cost",
    value: expected != null ? `USD ${expected.toFixed(2)}` : "N/A",
    classification: expected == null ? "UNAVAILABLE" : "NORMAL",
    interpretation:
      expected == null ? "Expected repair cost could not be calculated."
      : `KINGA's cost model estimates the fair repair cost at USD ${expected.toFixed(2)} based on the identified damage, local labour rates, and parts pricing.`,
    businessImpact:
      expected != null ? "This figure is the benchmark against which all submitted quotes should be evaluated."
      : "Without a cost benchmark, quote validation must rely on market comparisons alone.",
    recommendedAction: null,
    sourceEngine: "COST",
  });

  // Quote deviation
  const devPct = s9.quoteDeviationPct ?? null;
  if (devPct != null) {
    const absDev = Math.abs(devPct);
    findings.push({
      label: "Submitted Quote Deviation",
      value: `${devPct > 0 ? "+" : ""}${devPct.toFixed(1)}%`,
      classification:
        absDev >= 50 ? "CRITICAL"
        : absDev >= 25 ? "CONCERN"
        : absDev >= 10 ? "ATTENTION"
        : "NORMAL",
      interpretation:
        absDev >= 50 ? `The submitted quote is ${absDev.toFixed(0)}% ${devPct > 0 ? "above" : "below"} KINGA's expected cost. This is a very large deviation that is inconsistent with a fair market quote.`
        : absDev >= 25 ? `The submitted quote deviates ${absDev.toFixed(0)}% from the expected cost. This exceeds the acceptable tolerance of ±20%.`
        : absDev >= 10 ? `The submitted quote is ${absDev.toFixed(0)}% from the expected cost. This is within a borderline range.`
        : "The submitted quote is within the acceptable range of KINGA's expected cost.",
      businessImpact:
        absDev >= 25 ? "Approving an inflated quote directly increases the insurer's loss ratio."
        : "Quote is within acceptable parameters.",
      recommendedAction:
        absDev >= 50 ? "Reject the quote and request a revised submission. Target a maximum deviation of ±20%."
        : absDev >= 25 ? "Negotiate with the repairer to bring the quote within the acceptable range."
        : null,
      sourceEngine: "COST",
    });
  }

  // Savings opportunity
  const savings = s9.savingsOpportunityCents != null ? s9.savingsOpportunityCents / 100 : null;
  if (savings != null && savings > 0) {
    findings.push({
      label: "Savings Opportunity",
      value: `USD ${savings.toFixed(2)}`,
      classification: savings >= 500 ? "CONCERN" : "ATTENTION",
      interpretation: `KINGA has identified a potential saving of USD ${savings.toFixed(2)} through quote negotiation, alternative parts sourcing, or scope adjustment.`,
      businessImpact: `Realising this saving would reduce the claim payout by USD ${savings.toFixed(2)}.`,
      recommendedAction: "Review the repair intelligence recommendations to identify specific negotiation points.",
      sourceEngine: "COST",
    });
  }

  // Cost decision
  const decision = (s9 as any).costDecision?.recommendation ?? null;
  if (decision) {
    findings.push({
      label: "Cost Decision",
      value: decision,
      classification:
        decision === "REJECT" ? "CRITICAL"
        : decision === "NEGOTIATE" ? "CONCERN"
        : decision === "APPROVE_WITH_CONDITIONS" ? "ATTENTION"
        : "NORMAL",
      interpretation:
        decision === "REJECT" ? "KINGA's cost analysis recommends rejecting the submitted quote. The quote significantly exceeds the expected cost and cannot be justified by the identified damage."
        : decision === "NEGOTIATE" ? "KINGA recommends negotiating the submitted quote before approval. Specific line items are above market rates."
        : decision === "APPROVE_WITH_CONDITIONS" ? "KINGA recommends conditional approval, subject to verification of specific line items."
        : "KINGA recommends approving the submitted quote. It is within the expected cost range.",
      businessImpact:
        decision === "REJECT" ? "Approving this quote without negotiation would result in an overpayment."
        : decision === "NEGOTIATE" ? "Negotiation can reduce the payout to within the fair market range."
        : "No adverse cost impact identified.",
      recommendedAction:
        decision === "REJECT" ? "Return the quote to the repairer with a counter-offer based on KINGA's expected cost."
        : decision === "NEGOTIATE" ? "Use the repair intelligence line items as the basis for negotiation."
        : null,
      sourceEngine: "COST",
    });
  }

  return findings;
}

// ── CGI (Stage 9.5) ──────────────────────────────────────────────────────────

function extractCGIFindings(cgi: Stage9_5Output): InterpretedFinding[] {
  const findings: InterpretedFinding[] = [];

  // Overall CGI verdict
  const verdict = cgi.conclusion?.verdict ?? null;
  findings.push({
    label: "Geometry Coherence Verdict",
    value: verdict ?? "N/A",
    classification:
      verdict == null ? "UNAVAILABLE"
      : verdict === "INCOHERENT" ? "CRITICAL"
      : verdict === "ANOMALOUS" ? "CONCERN"
      : "NORMAL",
    interpretation:
      verdict == null ? "Geometry coherence could not be assessed."
      : verdict === "INCOHERENT" ? "The physical geometry of the damage is incoherent with the claimed collision scenario. Multiple geometric indicators are inconsistent with the reported impact."
      : verdict === "ANOMALOUS" ? "The damage geometry shows anomalies that are not fully consistent with the claimed collision scenario. This warrants further investigation."
      : "The damage geometry is coherent with the claimed collision scenario. No geometric inconsistencies detected.",
    businessImpact:
      verdict === "INCOHERENT" ? "Geometric incoherence is a strong indicator of either pre-existing damage, a staged collision, or a misrepresented incident."
      : verdict === "ANOMALOUS" ? "Geometric anomalies increase the probability of undisclosed pre-existing damage or an inaccurate incident description."
      : "Geometry is consistent. No geometric-based concern.",
    recommendedAction:
      verdict === "INCOHERENT" ? "Do not approve until a physical inspection confirms the damage is consistent with the claimed incident."
      : verdict === "ANOMALOUS" ? "Request a site inspection to verify the damage pattern against the incident description."
      : null,
    sourceEngine: "CGI",
  });

  // Hidden damage probability
  const hdp = cgi.conclusion?.hiddenDamageProbabilityOverride ?? null;
  if (hdp != null) {
    const hdpPct = Math.round(hdp * 100);
    findings.push({
      label: "Hidden Damage Probability",
      value: `${hdpPct}%`,
      classification:
        hdpPct >= 70 ? "CRITICAL"
        : hdpPct >= 50 ? "CONCERN"
        : hdpPct >= 30 ? "ATTENTION"
        : "NORMAL",
      interpretation:
        hdpPct >= 70 ? `There is a ${hdpPct}% probability of significant hidden damage beyond what is visible in photographs. This is driven by the collision geometry and energy analysis.`
        : hdpPct >= 50 ? `There is a ${hdpPct}% probability of hidden damage. The collision geometry suggests loading patterns that may have caused internal damage.`
        : hdpPct >= 30 ? `There is a ${hdpPct}% probability of some hidden damage. This is within the normal range for this type of collision.`
        : `Hidden damage probability is low at ${hdpPct}%. The damage is likely limited to what is visible.`,
      businessImpact:
        hdpPct >= 50 ? "High hidden damage probability means the approved repair scope may need to be extended after disassembly, increasing the final cost."
        : "Hidden damage risk is manageable.",
      recommendedAction:
        hdpPct >= 70 ? "Include a contingency allowance in the repair authorisation for hidden damage discovery."
        : hdpPct >= 50 ? "Instruct the repairer to report any hidden damage found during disassembly before proceeding."
        : null,
      sourceEngine: "CGI",
    });
  }

  // CGI availability summary
  const avail = cgi.availabilitySummary;
  if (avail) {
    const totalAvail = avail.core.available + avail.conditional.available + avail.advanced.available;
    const totalPossible = avail.core.total + avail.conditional.total + avail.advanced.total;
    findings.push({
      label: "Geometry Indicator Coverage",
      value: `${totalAvail}/${totalPossible} indicators evaluated`,
      classification: totalAvail < avail.core.total ? "ATTENTION" : "NORMAL",
      interpretation: `${avail.core.available}/${avail.core.total} core, ${avail.conditional.available}/${avail.conditional.total} conditional, and ${avail.advanced.available}/${avail.advanced.total} advanced geometry indicators were evaluated.`,
      businessImpact:
        totalAvail < avail.core.total
          ? "Some core geometry indicators could not be evaluated due to missing upstream data. The geometry assessment is based on partial evidence."
          : "Full core geometry coverage achieved. The assessment is based on complete evidence.",
      recommendedAction:
        totalAvail < avail.core.total ? "Ensure all required data fields are populated in future claims to maximise geometry indicator coverage." : null,
      sourceEngine: "CGI",
    });
  }

  // Flagged indicators
  const flaggedIndicators = cgi.allIndicators?.filter(i => i.status === "FLAG") ?? [];
  if (flaggedIndicators.length > 0) {
    findings.push({
      label: "Geometry Flags",
      value: `${flaggedIndicators.length} flag${flaggedIndicators.length !== 1 ? "s" : ""}`,
      classification: flaggedIndicators.length >= 3 ? "CRITICAL" : flaggedIndicators.length >= 2 ? "CONCERN" : "ATTENTION",
      interpretation: `${flaggedIndicators.length} geometry indicator${flaggedIndicators.length !== 1 ? "s have" : " has"} been flagged: ${flaggedIndicators.map(i => i.name).join(", ")}.`,
      businessImpact: "Flagged geometry indicators represent specific physical inconsistencies that cannot be explained by the claimed collision scenario.",
      recommendedAction: "Review each flagged indicator in the CGI section and address the specific inconsistency before approving the claim.",
      sourceEngine: "CGI",
    });
  }

  return findings;
}

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic section summaries (fallback when LLM is unavailable)
// ─────────────────────────────────────────────────────────────────────────────

function deterministicSummary(
  engine: InterpretedEngineSection["engine"],
  findings: InterpretedFinding[]
): { summary: string; keyRisk: string | null } {
  const critical = findings.filter(f => f.classification === "CRITICAL");
  const concern = findings.filter(f => f.classification === "CONCERN");
  const attention = findings.filter(f => f.classification === "ATTENTION");

  if (critical.length > 0) {
    return {
      summary: `${engine} analysis identified ${critical.length} critical finding${critical.length > 1 ? "s" : ""}: ${critical.map(f => f.label).join(", ")}. Immediate action is required before this claim can be approved.`,
      keyRisk: critical[0].interpretation,
    };
  }
  if (concern.length > 0) {
    return {
      summary: `${engine} analysis identified ${concern.length} concern${concern.length > 1 ? "s" : ""} that warrant review: ${concern.map(f => f.label).join(", ")}.`,
      keyRisk: concern[0].interpretation,
    };
  }
  if (attention.length > 0) {
    return {
      summary: `${engine} analysis is broadly consistent with the claim, with ${attention.length} minor point${attention.length > 1 ? "s" : ""} to note.`,
      keyRisk: null,
    };
  }
  return {
    summary: `${engine} analysis found no anomalies. All indicators are within normal parameters for this type of claim.`,
    keyRisk: null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Overall classification
// ─────────────────────────────────────────────────────────────────────────────

function computeOverallClassification(sections: InterpretedEngineSection[]): FindingClassification {
  const allFindings = sections.flatMap(s => s.findings);
  if (allFindings.some(f => f.classification === "CRITICAL")) return "CRITICAL";
  if (allFindings.some(f => f.classification === "CONCERN")) return "CONCERN";
  if (allFindings.some(f => f.classification === "ATTENTION")) return "ATTENTION";
  return "NORMAL";
}

// ─────────────────────────────────────────────────────────────────────────────
// LLM enrichment
// ─────────────────────────────────────────────────────────────────────────────

interface LLMEnrichmentResult {
  visionSummary: string;
  physicsSummary: string;
  fraudSummary: string;
  costSummary: string;
  cgiSummary: string;
  overallNarrative: string;
  topThreeActions: string[];
}

function buildLLMPrompt(
  claimRecord: ClaimRecord,
  sections: InterpretedEngineSection[]
): string {
  const vehicle = `${claimRecord.vehicle?.year ?? ""} ${claimRecord.vehicle?.make ?? ""} ${claimRecord.vehicle?.model ?? ""}`.trim();
  const incident = claimRecord.accidentDetails?.description ?? "Not provided";
  const direction = claimRecord.accidentDetails?.collisionDirection ?? "unknown";
  const speed = claimRecord.accidentDetails?.estimatedSpeedKmh ?? null;

  const findingLines = sections
    .filter(s => s.available)
    .flatMap(s =>
      s.findings
        .filter(f => f.classification !== "UNAVAILABLE")
        .map(f => `[${s.engine}] ${f.label}: ${f.value} — ${f.classification} — ${f.interpretation}`)
    )
    .join("\n");

  return `You are KINGA, an AI-powered motor insurance claims assessment system. You are generating the interpretation section of a forensic claim report. Your audience is a claims manager or adjuster who has no engineering background. Write in plain, professional English. Be specific, concise, and actionable.

CLAIM CONTEXT:
Vehicle: ${vehicle || "Unknown"}
Incident: ${incident}
Collision direction: ${direction}
Stated speed: ${speed != null ? `${speed} km/h` : "Not stated"}

ANALYSIS FINDINGS:
${findingLines}

Generate a JSON response with exactly this structure:
{
  "visionSummary": "2-3 sentence summary of what the vision analysis found and what it means for this claim",
  "physicsSummary": "2-3 sentence summary of what the physics reconstruction found and what it means",
  "fraudSummary": "2-3 sentence summary of the fraud risk assessment and what the adjuster should know",
  "costSummary": "2-3 sentence summary of the cost analysis and what action is recommended",
  "cgiSummary": "2-3 sentence summary of the geometry coherence analysis",
  "overallNarrative": "3-5 sentence cross-engine narrative that synthesises all findings into a single coherent picture of this claim. Highlight the most important risk or concern. Do not repeat individual findings — synthesise them.",
  "topThreeActions": ["First priority action the adjuster must take", "Second priority action", "Third priority action"]
}

Rules:
- Write as if speaking directly to the adjuster: "The damage shows...", "You should...", "This claim requires..."
- Do not use engineering jargon without explanation
- Be specific: name the actual values, not just "high" or "low"
- topThreeActions must be concrete, actionable instructions — not vague advice
- If a section's engine was not available, write "Insufficient data for [engine] analysis."`;
}

async function callLLMForEnrichment(
  claimRecord: ClaimRecord,
  sections: InterpretedEngineSection[]
): Promise<LLMEnrichmentResult | null> {
  try {
    const prompt = buildLLMPrompt(claimRecord, sections);
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: "You are KINGA, a motor insurance claims AI. Respond only with valid JSON matching the requested schema.",
        },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    });

        const content = response?.choices?.[0]?.message?.content;
    if (!content || typeof content !== "string") return null;
    const parsed = JSON.parse(content) as LLMEnrichmentResult;

    // Validate required fields
    if (
      typeof parsed.overallNarrative !== "string" ||
      !Array.isArray(parsed.topThreeActions)
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main entry point
// ─────────────────────────────────────────────────────────────────────────────

export interface Stage10IInput {
  claimRecord: ClaimRecord;
  stage6Data: Stage6Output | null;
  stage7Data: Stage7Output | null;
  stage8Data: Stage8Output | null;
  stage9Data: Stage9Output | null;
  stage9_5Data: Stage9_5Output | null;
}

export async function runInterpretationEngine(
  input: Stage10IInput
): Promise<InterpretedClaim> {
  const { claimRecord, stage6Data, stage7Data, stage8Data, stage9Data, stage9_5Data } = input;

  // ── 1. Extract deterministic findings from each engine ────────────────────
  const visionFindings  = stage6Data ? extractVisionFindings(stage6Data)   : [];
  const physicsFindings = stage7Data ? extractPhysicsFindings(stage7Data)  : [];
  const fraudFindings   = stage8Data ? extractFraudFindings(stage8Data)    : [];
  const costFindings    = stage9Data ? extractCostFindings(stage9Data)     : [];
  const cgiFindings     = stage9_5Data ? extractCGIFindings(stage9_5Data) : [];

  // ── 2. Build sections with deterministic summaries ────────────────────────
  const sections: InterpretedEngineSection[] = [
    {
      engine: "VISION",
      engineLabel: "Vision & Damage Analysis",
      findings: visionFindings,
      available: stage6Data != null,
      ...deterministicSummary("VISION", visionFindings),
    },
    {
      engine: "PHYSICS",
      engineLabel: "Physics Reconstruction",
      findings: physicsFindings,
      available: stage7Data != null,
      ...deterministicSummary("PHYSICS", physicsFindings),
    },
    {
      engine: "FRAUD",
      engineLabel: "Fraud Risk Assessment",
      findings: fraudFindings,
      available: stage8Data != null,
      ...deterministicSummary("FRAUD", fraudFindings),
    },
    {
      engine: "COST",
      engineLabel: "Cost Optimisation",
      findings: costFindings,
      available: stage9Data != null,
      ...deterministicSummary("COST", costFindings),
    },
    {
      engine: "CGI",
      engineLabel: "Contact Geometry Intelligence",
      findings: cgiFindings,
      available: stage9_5Data != null && stage9_5Data.available,
      ...deterministicSummary("CGI", cgiFindings),
    },
  ];

  // ── 3. Compute overall classification ────────────────────────────────────
  const overallClassification = computeOverallClassification(sections);

  // ── 4. LLM enrichment ────────────────────────────────────────────────────
  let llmEnriched = false;
  let overallNarrative = buildFallbackNarrative(sections, overallClassification);
  let topThreeActions = buildFallbackActions(sections);

  try {
    const llmResult = await callLLMForEnrichment(claimRecord, sections);
    if (llmResult) {
      // Replace deterministic summaries with LLM-generated ones
      for (const section of sections) {
        const key = `${section.engine.toLowerCase()}Summary` as keyof LLMEnrichmentResult;
        const llmSummary = llmResult[key];
        if (typeof llmSummary === "string" && llmSummary.length > 0) {
          section.summary = llmSummary;
        }
      }
      overallNarrative = llmResult.overallNarrative;
      const actions = llmResult.topThreeActions.filter(a => typeof a === "string" && a.length > 0).slice(0, 3);
      topThreeActions = actions as InterpretedClaim["topThreeActions"];
      llmEnriched = true;
    }
  } catch {
    // LLM enrichment is non-fatal — deterministic summaries are already set
  }

  return {
    sections,
    overallNarrative,
    topThreeActions,
    overallClassification,
    generatedAt: new Date().toISOString(),
    engineVersion: ENGINE_VERSION,
    llmEnriched,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Fallback narrative and actions (deterministic, no LLM)
// ─────────────────────────────────────────────────────────────────────────────

function buildFallbackNarrative(
  sections: InterpretedEngineSection[],
  overall: FindingClassification
): string {
  const criticalSections = sections.filter(s =>
    s.findings.some(f => f.classification === "CRITICAL")
  );
  const concernSections = sections.filter(s =>
    s.findings.some(f => f.classification === "CONCERN")
  );

  if (overall === "CRITICAL") {
    return `This claim has been flagged as high risk by ${criticalSections.length} analysis engine${criticalSections.length > 1 ? "s" : ""} (${criticalSections.map(s => s.engineLabel).join(", ")}). Critical findings require resolution before any payment decision can be made. The claim should not be approved in its current state.`;
  }
  if (overall === "CONCERN") {
    return `This claim shows elevated risk signals across ${concernSections.length} analysis engine${concernSections.length > 1 ? "s" : ""} (${concernSections.map(s => s.engineLabel).join(", ")}). While not necessarily indicative of fraud, these concerns warrant additional verification before approval.`;
  }
  if (overall === "ATTENTION") {
    return "This claim is broadly consistent with the reported incident. Minor points of attention have been noted but do not individually indicate a problem. Standard processing can continue with normal due diligence.";
  }
  return "This claim has passed all analysis checks. No anomalies, inconsistencies, or elevated risk signals have been detected. The claim can proceed through standard approval workflow.";
}

function buildFallbackActions(sections: InterpretedEngineSection[]): InterpretedClaim["topThreeActions"] {
  const actions: string[] = [];
  for (const section of sections) {
    for (const finding of section.findings) {
      if (finding.recommendedAction && actions.length < 3) {
        actions.push(finding.recommendedAction);
      }
    }
  }
  if (actions.length === 0) {
    return ["Process claim through standard approval workflow."];
  }
  return actions.slice(0, 3) as InterpretedClaim["topThreeActions"];
}
