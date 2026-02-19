// @ts-nocheck
/**
 * KINGA Report Narrative Generation Service
 * 
 * Generates professional insurance-grade narrative reports using LLM
 * with role-specific templates for insurers, assessors, and regulatory review.
 */

import { invokeLLM } from "./_core/llm";
import type { ClaimIntelligence } from "./report-intelligence-aggregator";
import {
  extractDamageAssessmentData,
  extractCostComparisonData,
  extractFraudRiskData,
  extractPhysicsValidationData,
  buildWorkflowAuditTrail,
} from "./report-intelligence-aggregator";

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
 * Generates a comprehensive narrative report for a claim
 */
export async function generateReportNarrative(
  intelligence: ClaimIntelligence,
  role: ReportRole
): Promise<ReportNarrative> {
  const damageData = extractDamageAssessmentData(intelligence);
  const costData = extractCostComparisonData(intelligence);
  const fraudData = extractFraudRiskData(intelligence);
  const physicsData = extractPhysicsValidationData(intelligence);
  const auditData = buildWorkflowAuditTrail(intelligence);

  const template = getRoleTemplate(role);
  
  // Generate executive summary
  const executiveSummary = await generateExecutiveSummary(
    intelligence,
    damageData,
    costData,
    fraudData,
    template
  );

  // Generate damage assessment analysis
  const damageAssessmentAnalysis = await generateDamageAssessmentAnalysis(
    intelligence,
    damageData,
    template
  );

  // Generate AI intelligence explanation
  const aiIntelligenceExplanation = await generateAIIntelligenceExplanation(
    intelligence,
    damageData,
    physicsData,
    fraudData,
    template
  );

  // Generate cost comparison analytics
  const costComparisonAnalytics = await generateCostComparisonAnalytics(
    intelligence,
    costData,
    template
  );

  // Generate fraud risk evaluation
  const fraudRiskEvaluation = await generateFraudRiskEvaluation(
    intelligence,
    fraudData,
    template
  );

  // Generate physics validation summary
  const physicsValidationSummary = await generatePhysicsValidationSummary(
    intelligence,
    physicsData,
    template
  );

  // Generate workflow audit trail
  const workflowAuditTrail = await generateWorkflowAuditTrail(
    intelligence,
    auditData,
    template
  );

  // Generate recommendations
  const recommendations = await generateRecommendations(
    intelligence,
    damageData,
    costData,
    fraudData,
    template
  );

  return {
    executiveSummary,
    damageAssessmentAnalysis,
    aiIntelligenceExplanation,
    costComparisonAnalytics,
    fraudRiskEvaluation,
    physicsValidationSummary,
    workflowAuditTrail,
    recommendations,
  };
}

/**
 * Get role-specific template configuration
 */
function getRoleTemplate(role: ReportRole) {
  const templates = {
    insurer: {
      tone: "professional and decision-focused",
      focus: "cost optimization, fraud detection, and claim approval recommendations",
      audience: "insurance claims managers and executives",
      detailLevel: "comprehensive with actionable insights",
    },
    assessor: {
      tone: "technical and analytical",
      focus: "damage assessment accuracy, repair cost validation, and technical findings",
      audience: "professional vehicle assessors and technical reviewers",
      detailLevel: "highly detailed with technical specifications",
    },
    regulatory: {
      tone: "formal and compliance-oriented",
      focus: "audit trail completeness, regulatory compliance, and process adherence",
      audience: "regulatory auditors and compliance officers",
      detailLevel: "exhaustive with full documentation and evidence trail",
    },
  };

  return templates[role];
}

/**
 * Generate executive summary
 */
async function generateExecutiveSummary(
  intelligence: ClaimIntelligence,
  damageData: any,
  costData: any,
  fraudData: any,
  template: any
): Promise<string> {
  const prompt = `You are generating an Executive Summary for an insurance claim report.

**Report Context:**
- Claim Number: ${intelligence.claim.claimNumber}
- Vehicle: ${intelligence.claim.vehicleMake} ${intelligence.claim.vehicleModel} (${intelligence.claim.vehicleYear})
- Incident Date: ${new Date(intelligence.claim.incidentDate).toLocaleDateString()}
- Claim Status: ${intelligence.claim.status}

**Damage Assessment:**
- AI Estimated Cost: $${costData.aiTotalCost.toFixed(2)}
${costData.assessorTotalCost ? `- Assessor Estimated Cost: $${costData.assessorTotalCost.toFixed(2)}` : ''}
${costData.quotes.length > 0 ? `- Panel Beater Quotes: ${costData.quotes.length} received (range: $${Math.min(...costData.quotes.map((q: any) => q.totalCost)).toFixed(2)} - $${Math.max(...costData.quotes.map((q: any) => q.totalCost)).toFixed(2)})` : ''}

**Fraud Risk Assessment:**
- Overall Risk Level: ${fraudData.overallRiskLevel.toUpperCase()}
- AI Risk Score: ${fraudData.aiRiskScore}/100
- Assessor Risk Level: ${fraudData.assessorRiskLevel}
${fraudData.indicators.length > 0 ? `- Fraud Indicators: ${fraudData.indicators.join(', ')}` : ''}

**Audience:** ${template.audience}
**Tone:** ${template.tone}
**Focus:** ${template.focus}

Generate a concise executive summary (200-300 words) that:
1. Frames the claim assessment in a constructive and professional manner
2. Highlights key findings from AI analysis, assessor evaluation, and panel beater quotes
3. Summarizes the fraud risk assessment
4. Provides a clear recommendation for claim approval or further investigation
5. Uses only the heading "Executive Summary" with no subheadings
6. Maintains a measured, objective tone avoiding overly critical language

Write the executive summary now:`;

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: "You are an expert insurance report writer specializing in creating professional, comprehensive claim assessment reports.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  return (response.choices[0].message.content as string) || "";
}

/**
 * Generate damage assessment analysis
 */
async function generateDamageAssessmentAnalysis(
  intelligence: ClaimIntelligence,
  damageData: any,
  template: any
): Promise<string> {
  const prompt = `You are generating a Damage Assessment Analysis section for an insurance claim report.

**Incident Description:**
${intelligence.claim.incidentDescription}

**Incident Location:**
${intelligence.claim.incidentLocation}

**AI Damage Analysis:**
${damageData.damageAnalysis}

**Damaged Components:**
${JSON.stringify(damageData.damagedComponents, null, 2)}

**Cost Estimates:**
- AI Estimate: $${damageData.aiEstimate.toFixed(2)}
${damageData.assessorEstimate ? `- Assessor Estimate: $${damageData.assessorEstimate.toFixed(2)}` : ''}
${damageData.quoteEstimates.length > 0 ? `- Quote Estimates: ${damageData.quoteEstimates.map((q: number) => `$${q.toFixed(2)}`).join(', ')}` : ''}

**Audience:** ${template.audience}
**Detail Level:** ${template.detailLevel}

Generate a comprehensive damage assessment analysis (300-500 words) that:
1. Describes the nature and extent of the damage based on AI analysis
2. Lists all damaged components with severity assessments
3. Compares AI estimates with assessor evaluations and panel beater quotes
4. Highlights any discrepancies or areas requiring further investigation
5. Presents technical information clearly and accurately
6. Uses tables where appropriate for component specifications

Write the damage assessment analysis now:`;

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: "You are an expert insurance report writer specializing in technical damage assessments.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  return (response.choices[0].message.content as string) || "";
}

/**
 * Generate AI intelligence explanation
 */
async function generateAIIntelligenceExplanation(
  intelligence: ClaimIntelligence,
  damageData: any,
  physicsData: any,
  fraudData: any,
  template: any
): Promise<string> {
  const prompt = `You are generating an AI Intelligence Explanation section for an insurance claim report.

**AI Assessment Confidence:**
- Overall Confidence Score: ${intelligence.aiAssessment?.confidenceScore || 0}%
- Physics Validation Confidence: ${physicsData.validationConfidence}%

**AI Analysis Methods:**
1. Computer Vision Damage Detection
2. Impact Physics Analysis
3. Damage Pattern Consistency Validation
4. Fraud Risk Scoring

**Physics Validation Results:**
${JSON.stringify(physicsData.impactAnalysis, null, 2)}

**Damage Consistency Analysis:**
${JSON.stringify(physicsData.damageConsistency, null, 2)}

**Audience:** ${template.audience}
**Focus:** ${template.focus}

Generate a clear AI intelligence explanation (250-400 words) that:
1. Explains how the AI system analyzed the claim (computer vision, physics validation, pattern recognition)
2. Describes the confidence levels and what they mean
3. Details the physics validation process and findings
4. Explains how damage patterns were validated for consistency
5. Avoids technical jargon while maintaining accuracy
6. Provides transparency into the AI decision-making process

Write the AI intelligence explanation now:`;

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: "You are an expert at explaining AI systems in insurance contexts to non-technical audiences.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  return (response.choices[0].message.content as string) || "";
}

/**
 * Generate cost comparison analytics
 */
async function generateCostComparisonAnalytics(
  intelligence: ClaimIntelligence,
  costData: any,
  template: any
): Promise<string> {
  const prompt = `You are generating a Cost Comparison Analytics section for an insurance claim report.

**AI Cost Breakdown:**
- Parts Cost: $${costData.aiPartsCost.toFixed(2)}
- Labor Cost: $${costData.aiLaborCost.toFixed(2)}
- Total Cost: $${costData.aiTotalCost.toFixed(2)}

${costData.assessorTotalCost ? `**Assessor Cost Breakdown:**
- Parts Cost: $${costData.assessorPartsCost?.toFixed(2) || '0.00'}
- Labor Cost: $${costData.assessorLaborCost?.toFixed(2) || '0.00'}
- Total Cost: $${costData.assessorTotalCost.toFixed(2)}` : ''}

${costData.quotes.length > 0 ? `**Panel Beater Quotes:**
${costData.quotes.map((q: any, i: number) => `
Quote ${i + 1} - ${q.panelBeaterName}:
- Parts Cost: $${q.partsCost.toFixed(2)}
- Labor Cost: $${q.laborCost.toFixed(2)}
- Total Cost: $${q.totalCost.toFixed(2)}
`).join('\n')}` : ''}

**Audience:** ${template.audience}
**Focus:** ${template.focus}

Generate a detailed cost comparison analytics section (300-450 words) that:
1. Compares costs across all sources (AI, assessor, panel beater quotes)
2. Identifies cost optimization opportunities
3. Highlights significant discrepancies and their potential causes
4. Presents cost data in clear tabular format where appropriate
5. Provides actionable insights for cost management
6. Recommends the most cost-effective repair option

Write the cost comparison analytics now:`;

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: "You are an expert insurance cost analyst specializing in claim cost optimization.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  return (response.choices[0].message.content as string) || "";
}

/**
 * Generate fraud risk evaluation
 */
async function generateFraudRiskEvaluation(
  intelligence: ClaimIntelligence,
  fraudData: any,
  template: any
): Promise<string> {
  const prompt = `You are generating a Fraud Risk Evaluation section for an insurance claim report.

**Overall Fraud Risk Assessment:**
- Risk Level: ${fraudData.overallRiskLevel.toUpperCase()}
- AI Risk Score: ${fraudData.aiRiskScore}/100
- Assessor Risk Level: ${fraudData.assessorRiskLevel}

**Fraud Indicators Detected:**
${fraudData.indicators.length > 0 ? fraudData.indicators.map((ind: string, i: number) => `${i + 1}. ${ind}`).join('\n') : 'No fraud indicators detected'}

**Enhanced Fraud Analysis:**
${JSON.stringify(fraudData.enhancedAnalysis, null, 2)}

**Audience:** ${template.audience}
**Tone:** ${template.tone}

Generate a comprehensive fraud risk evaluation (250-400 words) that:
1. Assesses the overall fraud risk level and what it means
2. Explains each fraud indicator detected and its significance
3. Describes the enhanced fraud analysis (driver demographics, ownership verification, staged accident detection)
4. Provides a balanced, evidence-based assessment
5. Recommends appropriate next steps (approve, investigate further, request additional information)
6. Maintains a measured, objective tone avoiding harsh or accusatory language

Write the fraud risk evaluation now:`;

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: "You are an expert insurance fraud investigator specializing in objective risk assessment.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  return (response.choices[0].message.content as string) || "";
}

/**
 * Generate physics validation summary
 */
async function generatePhysicsValidationSummary(
  intelligence: ClaimIntelligence,
  physicsData: any,
  template: any
): Promise<string> {
  const prompt = `You are generating a Physics Validation Summary section for an insurance claim report.

**Validation Confidence:**
${physicsData.validationConfidence}%

**Impact Physics Analysis:**
${JSON.stringify(physicsData.impactAnalysis, null, 2)}

**Damage Pattern Consistency:**
${JSON.stringify(physicsData.damageConsistency, null, 2)}

**Audience:** ${template.audience}
**Detail Level:** ${template.detailLevel}

Generate a clear physics validation summary (200-350 words) that:
1. Explains how physics principles were used to validate the claim
2. Describes the impact analysis and what it reveals about the incident
3. Assesses damage pattern consistency with the reported incident
4. Highlights any inconsistencies or areas of concern
5. Provides a confidence assessment for the physics validation
6. Uses clear language accessible to non-technical readers

Write the physics validation summary now:`;

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: "You are an expert in vehicle accident physics and damage pattern analysis.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  return (response.choices[0].message.content as string) || "";
}

/**
 * Generate workflow audit trail
 */
async function generateWorkflowAuditTrail(
  intelligence: ClaimIntelligence,
  auditData: any,
  template: any
): Promise<string> {
  const prompt = `You are generating a Workflow Audit Trail section for an insurance claim report.

**Claim Processing Timeline:**
${auditData.timeline.map((event: any, i: number) => `
${i + 1}. ${event.status.toUpperCase()} - ${new Date(event.timestamp).toLocaleString()}
   Actor: ${event.actor}
   ${event.notes ? `Notes: ${event.notes}` : ''}
`).join('\n')}

**Processing Time Metrics:**
- Submission to AI Assessment: ${auditData.processingTime.submissionToAIAssessment ? `${(auditData.processingTime.submissionToAIAssessment / 1000 / 60).toFixed(2)} minutes` : 'N/A'}
- AI Assessment to Assessor Evaluation: ${auditData.processingTime.aiAssessmentToAssessorEvaluation ? `${(auditData.processingTime.aiAssessmentToAssessorEvaluation / 1000 / 60 / 60).toFixed(2)} hours` : 'N/A'}
- Assessor Evaluation to Quotes: ${auditData.processingTime.assessorEvaluationToQuotes ? `${(auditData.processingTime.assessorEvaluationToQuotes / 1000 / 60 / 60).toFixed(2)} hours` : 'N/A'}
- Total Processing Time: ${(auditData.processingTime.totalProcessingTime / 1000 / 60 / 60).toFixed(2)} hours

**Total Events:** ${auditData.totalEvents}

**Audience:** ${template.audience}
**Focus:** ${template.focus}

Generate a comprehensive workflow audit trail section (200-300 words) that:
1. Documents the complete claim processing timeline
2. Lists all status changes with timestamps and actors
3. Highlights processing time metrics and efficiency
4. Ensures full transparency and audit trail completeness
5. Presents timeline information in clear tabular format
6. Demonstrates regulatory compliance and process adherence

Write the workflow audit trail now:`;

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: "You are an expert in insurance claim process documentation and audit trail management.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  return (response.choices[0].message.content as string) || "";
}

/**
 * Generate recommendations
 */
async function generateRecommendations(
  intelligence: ClaimIntelligence,
  damageData: any,
  costData: any,
  fraudData: any,
  template: any
): Promise<string> {
  const prompt = `You are generating a Recommendations section for an insurance claim report.

**Claim Summary:**
- Claim Number: ${intelligence.claim.claimNumber}
- Status: ${intelligence.claim.status}
- AI Estimate: $${costData.aiTotalCost.toFixed(2)}
${costData.assessorTotalCost ? `- Assessor Estimate: $${costData.assessorTotalCost.toFixed(2)}` : ''}
- Fraud Risk: ${fraudData.overallRiskLevel.toUpperCase()}

**Available Quotes:**
${costData.quotes.length > 0 ? costData.quotes.map((q: any) => `- ${q.panelBeaterName}: $${q.totalCost.toFixed(2)}`).join('\n') : 'No quotes received yet'}

**Audience:** ${template.audience}
**Focus:** ${template.focus}

Generate actionable recommendations (200-300 words) that:
1. Provide a clear claim approval recommendation (approve, reject, request more information)
2. Recommend the most cost-effective repair option if applicable
3. Suggest next steps for fraud investigation if risk is medium or high
4. Highlight any additional information needed for final decision
5. Provide specific, actionable guidance for claims managers
6. Maintain a professional, decision-focused tone

Write the recommendations now:`;

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: "You are an expert insurance claims manager providing strategic recommendations.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  return (response.choices[0].message.content as string) || "";
}
