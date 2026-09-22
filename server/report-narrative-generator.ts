// @ts-nocheck
/**
 * KINGA Report Narrative Generation Service
 *
 * P0-A-2 keeps report narration deterministic while collision-physics evidence
 * is advisory or unavailable. No LLM prompt is constructed or invoked on this
 * publication path, so model-generated collision conclusions cannot reach a
 * report, PDF, or downstream export.
 */

import type { ClaimIntelligence } from "./report-intelligence-aggregator";
import {
  buildWorkflowAuditTrail,
  extractCostComparisonData,
  extractDamageAssessmentData,
  extractFraudRiskData,
} from "./report-intelligence-aggregator";
import { buildP0A2CollisionPhysicsAbstentionText } from "./reporting/p0PhysicsPresentation";

export type ReportRole = "insurer" | "assessor" | "regulatory";

export interface ReportNarrative {
  executiveSummary: string;
  damageAssessmentAnalysis: string;
  aiIntelligenceExplanation: string;
  costComparisonAnalytics: string;
  fraudRiskEvaluation: string;
  physicsValidationSummary: string;
  workflowAuditTrail: string;
  recommendations: string;
}

/**
 * Generates the report narrative from independently supported claim, cost, and
 * workflow facts. The P0 physics boundary prevents free-form LLM narration.
 */
export async function generateReportNarrative(
  intelligence: ClaimIntelligence,
  role: ReportRole
): Promise<ReportNarrative> {
  const damageData = extractDamageAssessmentData(intelligence);
  const costData = extractCostComparisonData(intelligence);
  const fraudData = extractFraudRiskData(intelligence);
  const collisionPhysicsHold = buildP0A2CollisionPhysicsAbstentionText();
  const auditData = buildWorkflowAuditTrail(intelligence);

  return buildP0A2DeterministicNarrative({
    intelligence,
    damageData,
    costData,
    fraudData,
    auditData,
    collisionPhysicsHold,
    role,
  });
}

type P0A2NarrativeProjectionInput = Readonly<{
  intelligence: ClaimIntelligence;
  damageData: ReturnType<typeof extractDamageAssessmentData>;
  costData: ReturnType<typeof extractCostComparisonData>;
  fraudData: ReturnType<typeof extractFraudRiskData>;
  auditData: ReturnType<typeof buildWorkflowAuditTrail>;
  collisionPhysicsHold: string;
  role: ReportRole;
}>;

/**
 * Builds a non-LLM narrative projection from independent claim, cost, and
 * workflow facts. Collision text is always the shared actionable abstention.
 */
export function buildP0A2DeterministicNarrative(
  input: P0A2NarrativeProjectionInput
): ReportNarrative {
  const claimNumber = String(
    input.intelligence.claim?.claimNumber ?? "the claim"
  );
  const vehicle = [
    input.intelligence.claim?.vehicleMake,
    input.intelligence.claim?.vehicleModel,
    input.intelligence.claim?.vehicleYear,
  ]
    .filter(Boolean)
    .join(" ");
  const componentCount = Array.isArray(input.damageData.damagedComponents)
    ? input.damageData.damagedComponents.length
    : 0;
  const quoteCount = Array.isArray(input.costData.quotes)
    ? input.costData.quotes.length
    : 0;
  const workflowEvents = Array.isArray(input.auditData.timeline)
    ? input.auditData.timeline.length
    : 0;

  return {
    executiveSummary: [
      "Executive Summary",
      `Claim ${claimNumber}${vehicle ? ` concerns a ${vehicle}` : ""}.`,
      "The report retains independently sourced claim, vehicle, quotation, cost, and workflow evidence for manual review.",
      input.collisionPhysicsHold,
    ].join("\n\n"),
    damageAssessmentAnalysis: [
      "Damage Assessment Analysis",
      componentCount > 0
        ? `${componentCount} descriptive damage-component record${componentCount === 1 ? " is" : "s are"} available in the governed evidence record.`
        : "No descriptive damage-component record is available in the governed evidence record.",
      "Review the source photographs and documented component evidence directly; this narrative does not infer collision mechanics.",
      input.collisionPhysicsHold,
    ].join("\n\n"),
    aiIntelligenceExplanation: [
      "AI Intelligence Explanation",
      "KINGA may organize descriptive and documentary evidence for manual review, but it does not publish a collision-physics conclusion from advisory visual evidence.",
      input.collisionPhysicsHold,
    ].join("\n\n"),
    costComparisonAnalytics: [
      "Cost Comparison Analytics",
      quoteCount > 0
        ? `${quoteCount} submitted quotation${quoteCount === 1 ? " is" : "s are"} available for evidence-qualified cost reconciliation.`
        : "No submitted quotation is available for cost reconciliation.",
      "Cost evidence remains subject to its separate evidence and approval controls.",
    ].join("\n\n"),
    fraudRiskEvaluation: [
      "Fraud Risk Evaluation",
      `The ${input.role} report retains the applicable fraud-review process without converting advisory collision evidence into a fraud conclusion.`,
      input.collisionPhysicsHold,
    ].join("\n\n"),
    physicsValidationSummary: input.collisionPhysicsHold,
    workflowAuditTrail: [
      "Workflow Audit Trail",
      workflowEvents > 0
        ? `${workflowEvents} recorded workflow event${workflowEvents === 1 ? " is" : "s are"} available in the audit trail.`
        : "No recorded workflow event is available in the audit trail.",
    ].join("\n\n"),
    recommendations: [
      "Recommendations",
      "Complete the applicable cost, documentary, fraud, and approval reviews using their governed evidence sources.",
      input.collisionPhysicsHold,
    ].join("\n\n"),
  };
}
