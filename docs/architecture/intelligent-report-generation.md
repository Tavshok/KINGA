# KINGA Intelligent Report Generation Framework

## Executive Summary

The KINGA Intelligent Report Generation Framework transforms raw claim intelligence data into professional, insurance-grade reports tailored for insurers, assessors, and regulatory auditors. The system leverages AI-powered narrative generation to produce comprehensive, explainable reports that synthesize damage assessments, cost analyses, fraud risk evaluations, and workflow audit trails into coherent, role-specific documents with embedded visualizations and supporting evidence.

## Architecture Overview

### System Components

```
┌─────────────────────────────────────────────────────────────────┐
│                    Report Generation Request                     │
│              (Claim ID + Report Type + Options)                  │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│           Intelligence Aggregation Service                       │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ • Claim Data Extraction                                   │  │
│  │ • AI Assessment Results                                   │  │
│  │ • Assessor Evaluation Data                                │  │
│  │ • Panel Beater Quotes                                     │  │
│  │ • Fraud Detection Outputs                                 │  │
│  │ • Physics Validation Results                              │  │
│  │ • Workflow Audit Trail                                    │  │
│  │ • Supporting Evidence (Photos, Documents)                 │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              Report Validation Service                           │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ • Evidence Completeness Check                             │  │
│  │ • AI Explainability Verification                          │  │
│  │ • Audit Trail Completeness                                │  │
│  │ • Template Compliance Validation                          │  │
│  └──────────────────────────┬───────────────────────────────┘  │
└──────────────────────────────┼────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│         LLM-Powered Narrative Generation Engine                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Role-Specific Templates:                                  │  │
│  │ • Insurer Report Template                                 │  │
│  │ • Assessor Report Template                                │  │
│  │ • Regulatory/Audit Report Template                        │  │
│  │                                                            │  │
│  │ Narrative Sections:                                       │  │
│  │ • Executive Summary                                       │  │
│  │ • Damage Assessment Analysis                              │  │
│  │ • AI Intelligence Explanation                             │  │
│  │ • Cost Comparison Analytics                               │  │
│  │ • Fraud Risk Evaluation                                   │  │
│  │ • Physics Validation Summary                              │  │
│  │ • Workflow Audit Trail                                    │  │
│  │ • Recommendations & Next Steps                            │  │
│  └──────────────────────────┬───────────────────────────────┘  │
└──────────────────────────────┼────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│            Visualization Generation Service                      │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ • Confidence Gauge (SVG)                                  │  │
│  │ • Cost Comparison Charts (Chart.js → PNG)                 │  │
│  │ • Fraud Risk Heat Scale (SVG)                             │  │
│  │ • Claim Workflow Timeline (Chart.js → PNG)                │  │
│  │ • Damage Severity Visual Legend (SVG)                     │  │
│  │ • Annotated Damage Photos                                 │  │
│  └──────────────────────────┬───────────────────────────────┘  │
└──────────────────────────────┼────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│              PDF Report Composer                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ • HTML Report Template Rendering                          │  │
│  │ • Chart & Image Embedding                                 │  │
│  │ • Table of Contents Generation                            │  │
│  │ • Page Numbering & Headers/Footers                        │  │
│  │ • PDF Conversion (Puppeteer)                              │  │
│  └──────────────────────────┬───────────────────────────────┘  │
└──────────────────────────────┼────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Generated Report Output                       │
│              (PDF + Dashboard Preview Version)                   │
└─────────────────────────────────────────────────────────────────┘
```

## Data Model

### Report Schema

```typescript
interface GeneratedReport {
  id: string;
  claimId: string;
  reportType: 'insurer' | 'assessor' | 'regulatory';
  generatedAt: Date;
  generatedBy: string; // User ID
  
  // Aggregated Intelligence
  intelligence: ClaimIntelligence;
  
  // Generated Content
  narrative: ReportNarrative;
  visualizations: ReportVisualizations;
  
  // Validation Results
  validation: ValidationResult;
  
  // Output Artifacts
  pdfUrl?: string;
  htmlPreview: string;
  
  // Metadata
  version: string;
  templateVersion: string;
}

interface ClaimIntelligence {
  claim: ClaimData;
  aiAssessment: AIAssessmentData;
  assessorEvaluation?: AssessorEvaluationData;
  panelBeaterQuotes: PanelBeaterQuoteData[];
  fraudDetection: FraudDetectionData;
  physicsValidation: PhysicsValidationData;
  workflowAuditTrail: AuditTrailEntry[];
  supportingEvidence: EvidenceData;
}

interface ReportNarrative {
  executiveSummary: string;
  damageAssessmentAnalysis: string;
  aiIntelligenceExplanation: string;
  costComparisonAnalytics: string;
  fraudRiskEvaluation: string;
  physicsValidationSummary: string;
  workflowAuditTrailSummary: string;
  recommendationsAndNextSteps: string;
}

interface ReportVisualizations {
  confidenceGauge: string; // SVG
  costComparisonChart: string; // Base64 PNG
  fraudRiskHeatScale: string; // SVG
  workflowTimeline: string; // Base64 PNG
  damageSeverityLegend: string; // SVG
  annotatedDamagePhotos: string[]; // Base64 PNGs
}

interface ValidationResult {
  isValid: boolean;
  evidenceComplete: boolean;
  aiExplainabilityIncluded: boolean;
  auditTrailIncluded: boolean;
  templateCompliant: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}
```

## Intelligence Aggregation Service

### Purpose

The Intelligence Aggregation Service consolidates all claim-related data from multiple sources into a unified intelligence object that serves as the foundation for report generation.

### Data Sources

**Claim Core Data**
- Claim ID, status, submission date
- Claimant information
- Vehicle details (make, model, year, VIN)
- Incident description and location
- Policy information

**AI Assessment Results**
- Damage analysis (components, severity, repair costs)
- Estimated repair cost breakdown (parts, labor)
- Fraud risk score and indicators
- Confidence scores for each assessment
- AI model version and timestamp

**Assessor Evaluation Data**
- Professional damage assessment
- Estimated costs (parts, labor, duration)
- Fraud risk level and notes
- Recommendation (approve, reject, request more info)
- Assessor confidence score

**Panel Beater Quotes**
- Quote ID, panel beater details
- Itemized parts breakdown
- Labor cost breakdown
- Total quote amount
- Estimated completion time
- Quote validity period

**Fraud Detection Outputs**
- Rule-based fraud indicators
- ML model fraud risk score
- Enhanced fraud detection results (driver demographics, ownership verification, staged accident detection)
- Fraud risk level classification

**Physics Validation Results**
- Impact physics analysis
- Damage pattern consistency check
- Speed and force calculations
- Validation confidence score

**Workflow Audit Trail**
- Status change history
- User actions and timestamps
- System events (AI assessment completed, quote submitted, etc.)
- Notification history

**Supporting Evidence**
- Damage photos (original and annotated)
- Police report documents
- Quote PDFs
- Assessor notes and attachments

### Implementation

```typescript
// server/report-intelligence-aggregator.ts

import { db } from "./db";
import { claims, aiAssessments, assessorEvaluations, panelBeaterQuotes, claimStatusHistory } from "../drizzle/schema";
import { eq } from "drizzle-orm";

export interface ClaimIntelligence {
  claim: any;
  aiAssessment: any;
  assessorEvaluation: any | null;
  panelBeaterQuotes: any[];
  fraudDetection: any;
  physicsValidation: any;
  workflowAuditTrail: any[];
  supportingEvidence: any;
}

export async function aggregateClaimIntelligence(claimId: string): Promise<ClaimIntelligence> {
  // Fetch claim core data
  const [claim] = await db.select().from(claims).where(eq(claims.id, claimId));
  if (!claim) throw new Error(`Claim ${claimId} not found`);

  // Fetch AI assessment
  const [aiAssessment] = await db
    .select()
    .from(aiAssessments)
    .where(eq(aiAssessments.claimId, claimId))
    .orderBy(aiAssessments.createdAt.desc())
    .limit(1);

  // Fetch assessor evaluation (if exists)
  const [assessorEvaluation] = await db
    .select()
    .from(assessorEvaluations)
    .where(eq(assessorEvaluations.claimId, claimId))
    .orderBy(assessorEvaluations.createdAt.desc())
    .limit(1);

  // Fetch panel beater quotes
  const quotes = await db
    .select()
    .from(panelBeaterQuotes)
    .where(eq(panelBeaterQuotes.claimId, claimId));

  // Fetch workflow audit trail
  const auditTrail = await db
    .select()
    .from(claimStatusHistory)
    .where(eq(claimStatusHistory.claimId, claimId))
    .orderBy(claimStatusHistory.changedAt.asc());

  // Aggregate fraud detection data
  const fraudDetection = {
    aiRiskScore: aiAssessment?.fraudRiskScore || 0,
    assessorRiskLevel: assessorEvaluation?.fraudRiskLevel || 'low',
    indicators: aiAssessment?.fraudIndicators || [],
    enhancedAnalysis: aiAssessment?.enhancedFraudAnalysis || null,
  };

  // Aggregate physics validation data
  const physicsValidation = {
    impactAnalysis: aiAssessment?.impactPhysicsAnalysis || null,
    damageConsistency: aiAssessment?.damagePatternConsistency || null,
    validationConfidence: aiAssessment?.physicsValidationConfidence || 0,
  };

  // Aggregate supporting evidence
  const supportingEvidence = {
    damagePhotos: claim.damagePhotos || [],
    annotatedPhotos: aiAssessment?.annotatedDamagePhotos || [],
    policeReportUrl: claim.policeReportUrl || null,
    quotePdfs: quotes.map(q => q.quotePdfUrl).filter(Boolean),
  };

  return {
    claim,
    aiAssessment,
    assessorEvaluation: assessorEvaluation || null,
    panelBeaterQuotes: quotes,
    fraudDetection,
    physicsValidation,
    workflowAuditTrail: auditTrail,
    supportingEvidence,
  };
}
```

## LLM-Powered Narrative Generation

### Purpose

The Narrative Generation Engine uses the Manus LLM API to transform structured claim intelligence data into coherent, professional narrative sections tailored to each report type.

### Role-Specific Templates

**Insurer Report Template**
- **Audience**: Insurance company executives and claims managers
- **Focus**: Cost optimization, fraud risk, business decision support
- **Tone**: Executive, concise, action-oriented
- **Key Sections**:
  - Executive Summary (high-level overview, key findings, recommended action)
  - Damage Assessment Analysis (AI + assessor findings, cost breakdown)
  - Cost Comparison Analytics (AI estimate vs panel beater quotes, savings opportunities)
  - Fraud Risk Evaluation (risk score, indicators, mitigation recommendations)
  - Recommendations & Next Steps (approve, reject, request more info, assign panel beater)

**Assessor Report Template**
- **Audience**: Professional insurance assessors and technical reviewers
- **Focus**: Technical accuracy, damage analysis, repair methodology
- **Tone**: Technical, detailed, evidence-based
- **Key Sections**:
  - Executive Summary (claim overview, assessment scope)
  - Damage Assessment Analysis (detailed component damage, repair requirements)
  - AI Intelligence Explanation (how AI reached its conclusions, confidence levels)
  - Physics Validation Summary (impact analysis, damage pattern consistency)
  - Cost Comparison Analytics (AI estimate vs quotes, technical justification)
  - Fraud Risk Evaluation (technical fraud indicators, physical evidence)
  - Workflow Audit Trail (assessment timeline, actions taken)

**Regulatory/Audit Report Template**
- **Audience**: Regulatory bodies, compliance officers, auditors
- **Focus**: Compliance, transparency, audit trail, AI explainability
- **Tone**: Formal, comprehensive, audit-ready
- **Key Sections**:
  - Executive Summary (claim summary, regulatory context)
  - Damage Assessment Analysis (methodology, evidence, conclusions)
  - AI Intelligence Explanation (model details, explainability, bias mitigation)
  - Cost Comparison Analytics (fairness, transparency, justification)
  - Fraud Risk Evaluation (detection methodology, evidence, actions taken)
  - Physics Validation Summary (scientific basis, validation methodology)
  - Workflow Audit Trail (complete timeline, user actions, system events, compliance checkpoints)
  - Recommendations & Next Steps (regulatory compliance status)

### Narrative Generation Prompts

```typescript
// server/report-narrative-generator.ts

import { invokeLLM } from "./server/_core/llm";
import type { ClaimIntelligence } from "./report-intelligence-aggregator";

export interface ReportNarrative {
  executiveSummary: string;
  damageAssessmentAnalysis: string;
  aiIntelligenceExplanation: string;
  costComparisonAnalytics: string;
  fraudRiskEvaluation: string;
  physicsValidationSummary: string;
  workflowAuditTrailSummary: string;
  recommendationsAndNextSteps: string;
}

export async function generateReportNarrative(
  intelligence: ClaimIntelligence,
  reportType: 'insurer' | 'assessor' | 'regulatory'
): Promise<ReportNarrative> {
  const baseContext = buildBaseContext(intelligence);
  const templateInstructions = getTemplateInstructions(reportType);

  // Generate each narrative section using LLM
  const [
    executiveSummary,
    damageAssessmentAnalysis,
    aiIntelligenceExplanation,
    costComparisonAnalytics,
    fraudRiskEvaluation,
    physicsValidationSummary,
    workflowAuditTrailSummary,
    recommendationsAndNextSteps,
  ] = await Promise.all([
    generateExecutiveSummary(baseContext, templateInstructions),
    generateDamageAssessmentAnalysis(baseContext, templateInstructions),
    generateAIIntelligenceExplanation(baseContext, templateInstructions),
    generateCostComparisonAnalytics(baseContext, templateInstructions),
    generateFraudRiskEvaluation(baseContext, templateInstructions),
    generatePhysicsValidationSummary(baseContext, templateInstructions),
    generateWorkflowAuditTrailSummary(baseContext, templateInstructions),
    generateRecommendationsAndNextSteps(baseContext, templateInstructions),
  ]);

  return {
    executiveSummary,
    damageAssessmentAnalysis,
    aiIntelligenceExplanation,
    costComparisonAnalytics,
    fraudRiskEvaluation,
    physicsValidationSummary,
    workflowAuditTrailSummary,
    recommendationsAndNextSteps,
  };
}

function buildBaseContext(intelligence: ClaimIntelligence): string {
  return `
CLAIM INFORMATION:
- Claim ID: ${intelligence.claim.claimNumber}
- Vehicle: ${intelligence.claim.vehicleMake} ${intelligence.claim.vehicleModel} (${intelligence.claim.vehicleYear})
- Incident Date: ${intelligence.claim.incidentDate}
- Incident Description: ${intelligence.claim.incidentDescription}

AI ASSESSMENT:
- Estimated Repair Cost: R${intelligence.aiAssessment?.estimatedRepairCost || 0}
- Fraud Risk Score: ${intelligence.aiAssessment?.fraudRiskScore || 0}/100
- Confidence Score: ${intelligence.aiAssessment?.confidenceScore || 0}%
- Damaged Components: ${JSON.stringify(intelligence.aiAssessment?.damagedComponents || [])}

ASSESSOR EVALUATION:
${intelligence.assessorEvaluation ? `
- Estimated Cost: R${intelligence.assessorEvaluation.estimatedRepairCost}
- Fraud Risk Level: ${intelligence.assessorEvaluation.fraudRiskLevel}
- Recommendation: ${intelligence.assessorEvaluation.recommendation}
- Notes: ${intelligence.assessorEvaluation.notes}
` : 'No assessor evaluation available yet.'}

PANEL BEATER QUOTES:
${intelligence.panelBeaterQuotes.map((q, i) => `
Quote ${i + 1} (${q.panelBeaterName}):
- Total: R${q.totalCost}
- Parts: R${q.partsCost}
- Labor: R${q.laborCost}
- Estimated Duration: ${q.estimatedDuration} days
`).join('\n')}

FRAUD DETECTION:
- AI Risk Score: ${intelligence.fraudDetection.aiRiskScore}/100
- Assessor Risk Level: ${intelligence.fraudDetection.assessorRiskLevel}
- Indicators: ${JSON.stringify(intelligence.fraudDetection.indicators)}

PHYSICS VALIDATION:
- Validation Confidence: ${intelligence.physicsValidation.validationConfidence}%
- Impact Analysis: ${JSON.stringify(intelligence.physicsValidation.impactAnalysis)}
  `.trim();
}

function getTemplateInstructions(reportType: 'insurer' | 'assessor' | 'regulatory'): string {
  const templates = {
    insurer: `
You are generating an insurance report for insurance company executives and claims managers.
Focus on cost optimization, fraud risk, and business decision support.
Use an executive, concise, action-oriented tone.
Avoid excessive technical jargon.
Highlight key financial metrics and recommended actions.
    `,
    assessor: `
You are generating a technical assessment report for professional insurance assessors.
Focus on technical accuracy, damage analysis, and repair methodology.
Use a technical, detailed, evidence-based tone.
Include specific component damage details and repair requirements.
Explain the scientific basis for conclusions.
    `,
    regulatory: `
You are generating a regulatory/audit report for compliance officers and auditors.
Focus on compliance, transparency, audit trail, and AI explainability.
Use a formal, comprehensive, audit-ready tone.
Ensure all AI decisions are explained with scientific justification.
Include complete audit trail and compliance checkpoints.
Emphasize fairness, bias mitigation, and regulatory adherence.
    `,
  };
  return templates[reportType];
}

async function generateExecutiveSummary(
  baseContext: string,
  templateInstructions: string
): Promise<string> {
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `${templateInstructions}

Generate a professional Executive Summary section for an insurance claim report.
The summary should:
- Provide a high-level overview of the claim
- Highlight key findings (damage assessment, cost estimates, fraud risk)
- Present a clear recommended action
- Be concise (2-3 paragraphs maximum)
- Use measured, objective language
- Frame findings constructively

Do not use subheadings within the Executive Summary.
Output only the narrative text, no markdown formatting.`,
      },
      {
        role: "user",
        content: baseContext,
      },
    ],
  });

  return response.choices[0].message.content.trim();
}

async function generateDamageAssessmentAnalysis(
  baseContext: string,
  templateInstructions: string
): Promise<string> {
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `${templateInstructions}

Generate a Damage Assessment Analysis section for an insurance claim report.
The analysis should:
- Synthesize AI assessment and assessor evaluation findings
- Detail damaged components and severity
- Explain repair requirements and methodology
- Present cost breakdown (parts, labor, total)
- Compare AI and assessor estimates if both available
- Maintain a seamless narrative (avoid excessive source attribution like "the AI said this, the assessor said that")

Output only the narrative text, no markdown formatting.`,
      },
      {
        role: "user",
        content: baseContext,
      },
    ],
  });

  return response.choices[0].message.content.trim();
}

async function generateAIIntelligenceExplanation(
  baseContext: string,
  templateInstructions: string
): Promise<string> {
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `${templateInstructions}

Generate an AI Intelligence Explanation section for an insurance claim report.
The explanation should:
- Explain how the AI system analyzed the claim
- Detail the AI model's methodology and data sources
- Present confidence scores and their meaning
- Explain key AI conclusions (damage assessment, cost estimation, fraud detection)
- Address AI explainability and transparency
- Discuss any limitations or areas requiring human validation

Output only the narrative text, no markdown formatting.`,
      },
      {
        role: "user",
        content: baseContext,
      },
    ],
  });

  return response.choices[0].message.content.trim();
}

async function generateCostComparisonAnalytics(
  baseContext: string,
  templateInstructions: string
): Promise<string> {
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `${templateInstructions}

Generate a Cost Comparison Analytics section for an insurance claim report.
The analysis should:
- Compare AI estimate, assessor estimate (if available), and panel beater quotes
- Highlight cost discrepancies and explain potential reasons
- Identify cost optimization opportunities
- Analyze parts vs labor cost breakdown
- Provide technical or business justification for cost differences
- Recommend the most cost-effective option while maintaining quality

Output only the narrative text, no markdown formatting.`,
      },
      {
        role: "user",
        content: baseContext,
      },
    ],
  });

  return response.choices[0].message.content.trim();
}

async function generateFraudRiskEvaluation(
  baseContext: string,
  templateInstructions: string
): Promise<string> {
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `${templateInstructions}

Generate a Fraud Risk Evaluation section for an insurance claim report.
The evaluation should:
- Present the overall fraud risk level (low, medium, high)
- Detail specific fraud indicators detected by AI and assessor
- Explain the fraud detection methodology
- Assess the credibility of fraud indicators
- Recommend fraud mitigation actions if risk is elevated
- Maintain an objective, evidence-based tone (avoid harsh or accusatory language)

Output only the narrative text, no markdown formatting.`,
      },
      {
        role: "user",
        content: baseContext,
      },
    ],
  });

  return response.choices[0].message.content.trim();
}

async function generatePhysicsValidationSummary(
  baseContext: string,
  templateInstructions: string
): Promise<string> {
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `${templateInstructions}

Generate a Physics Validation Summary section for an insurance claim report.
The summary should:
- Explain the physics-based validation methodology
- Detail impact analysis (speed, force, angle calculations)
- Assess damage pattern consistency with reported incident
- Present validation confidence score and its meaning
- Highlight any inconsistencies or red flags
- Provide scientific justification for conclusions

Output only the narrative text, no markdown formatting.`,
      },
      {
        role: "user",
        content: baseContext,
      },
    ],
  });

  return response.choices[0].message.content.trim();
}

async function generateWorkflowAuditTrailSummary(
  baseContext: string,
  templateInstructions: string
): Promise<string> {
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `${templateInstructions}

Generate a Workflow Audit Trail Summary section for an insurance claim report.
The summary should:
- Provide a chronological overview of the claim workflow
- Highlight key milestones (submission, AI assessment, assessor evaluation, quotes received, etc.)
- Detail user actions and system events
- Present processing times for each stage
- Identify any workflow bottlenecks or delays
- Ensure compliance and transparency for audit purposes

Output only the narrative text, no markdown formatting.`,
      },
      {
        role: "user",
        content: baseContext,
      },
    ],
  });

  return response.choices[0].message.content.trim();
}

async function generateRecommendationsAndNextSteps(
  baseContext: string,
  templateInstructions: string
): Promise<string> {
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `${templateInstructions}

Generate a Recommendations and Next Steps section for an insurance claim report.
The recommendations should:
- Provide a clear, actionable recommendation (approve, reject, request more info, assign panel beater)
- Justify the recommendation based on the analysis
- Outline specific next steps for the claim handler
- Highlight any conditions or requirements for approval
- Suggest timeline for next actions
- Maintain a constructive, solution-oriented tone

Output only the narrative text, no markdown formatting.`,
      },
      {
        role: "user",
        content: baseContext,
      },
    ],
  });

  return response.choices[0].message.content.trim();
}
```

## Visualization Standards

### Confidence Gauge

**Purpose**: Visual representation of AI confidence scores (0-100%)

**Design**:
- Semi-circular gauge with color-coded zones:
  - 0-40%: Red (Low Confidence)
  - 41-70%: Yellow (Medium Confidence)
  - 71-100%: Green (High Confidence)
- Needle pointing to current confidence score
- Percentage label at center

**Implementation**: SVG-based for crisp rendering in PDF

### Cost Comparison Chart

**Purpose**: Compare AI estimate, assessor estimate, and panel beater quotes

**Design**:
- Grouped bar chart with three groups: Parts Cost, Labor Cost, Total Cost
- Each group shows bars for AI, Assessor, and Panel Beater quotes
- Color-coded bars for easy comparison
- Y-axis: Cost in currency (R)
- X-axis: Cost categories

**Implementation**: Chart.js rendered to PNG for PDF embedding

### Fraud Risk Heat Scale

**Purpose**: Visual representation of fraud risk level

**Design**:
- Horizontal heat scale from green (low risk) to red (high risk)
- Marker indicating current fraud risk score
- Risk level labels: Low (0-30), Medium (31-70), High (71-100)

**Implementation**: SVG-based for crisp rendering in PDF

### Claim Workflow Timeline

**Purpose**: Visualize claim processing timeline and milestones

**Design**:
- Horizontal timeline with key events:
  - Claim Submitted
  - AI Assessment Completed
  - Assessor Evaluation Completed
  - Quotes Received
  - Claim Approved/Rejected
- Each event shows timestamp and duration from previous event
- Color-coded by event type

**Implementation**: Chart.js timeline chart rendered to PNG

### Damage Severity Visual Legend

**Purpose**: Explain damage severity levels used in the report

**Design**:
- Visual legend with color-coded severity levels:
  - Minor: Light yellow
  - Moderate: Orange
  - Severe: Red
  - Total Loss: Dark red
- Each level includes description and typical cost range

**Implementation**: SVG-based for crisp rendering in PDF

## Report Validation Service

### Purpose

The Report Validation Service ensures that generated reports meet quality and completeness standards before delivery.

### Validation Checks

**Evidence Completeness**
- At least one damage photo present
- AI assessment exists and is complete
- If assessor evaluation is required, it must be present
- Panel beater quotes meet minimum requirements (at least 1 quote)
- Police report uploaded if required by policy

**AI Explainability Inclusion**
- AI Intelligence Explanation section is non-empty
- Confidence scores are present and valid (0-100%)
- AI methodology is explained
- Limitations and human validation requirements are addressed

**Audit Trail Inclusion**
- Workflow audit trail has at least 2 entries (submission + one other event)
- All status changes are recorded with timestamps
- User actions are attributed to specific users
- System events are logged

**Template Compliance**
- All required sections are present for the report type
- Section content meets minimum length requirements
- Visualizations are generated and embedded
- PDF metadata is complete (title, author, creation date)

### Implementation

```typescript
// server/report-validator.ts

export interface ValidationResult {
  isValid: boolean;
  evidenceComplete: boolean;
  aiExplainabilityIncluded: boolean;
  auditTrailIncluded: boolean;
  templateCompliant: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  code: string;
  message: string;
  severity: 'error' | 'warning';
}

export async function validateReport(
  intelligence: ClaimIntelligence,
  narrative: ReportNarrative,
  reportType: 'insurer' | 'assessor' | 'regulatory'
): Promise<ValidationResult> {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Evidence completeness checks
  const evidenceComplete = validateEvidenceCompleteness(intelligence, errors, warnings);

  // AI explainability checks
  const aiExplainabilityIncluded = validateAIExplainability(intelligence, narrative, errors, warnings);

  // Audit trail checks
  const auditTrailIncluded = validateAuditTrail(intelligence, errors, warnings);

  // Template compliance checks
  const templateCompliant = validateTemplateCompliance(narrative, reportType, errors, warnings);

  const isValid = errors.filter(e => e.severity === 'error').length === 0;

  return {
    isValid,
    evidenceComplete,
    aiExplainabilityIncluded,
    auditTrailIncluded,
    templateCompliant,
    errors,
    warnings,
  };
}

function validateEvidenceCompleteness(
  intelligence: ClaimIntelligence,
  errors: ValidationError[],
  warnings: ValidationWarning[]
): boolean {
  let complete = true;

  // Check damage photos
  if (!intelligence.supportingEvidence.damagePhotos || intelligence.supportingEvidence.damagePhotos.length === 0) {
    errors.push({
      code: 'MISSING_DAMAGE_PHOTOS',
      message: 'No damage photos found for this claim',
      severity: 'error',
    });
    complete = false;
  }

  // Check AI assessment
  if (!intelligence.aiAssessment) {
    errors.push({
      code: 'MISSING_AI_ASSESSMENT',
      message: 'AI assessment is missing',
      severity: 'error',
    });
    complete = false;
  }

  // Check panel beater quotes
  if (intelligence.panelBeaterQuotes.length === 0) {
    warnings.push({
      code: 'NO_PANEL_BEATER_QUOTES',
      message: 'No panel beater quotes have been submitted yet',
      severity: 'warning',
    });
  }

  return complete;
}

function validateAIExplainability(
  intelligence: ClaimIntelligence,
  narrative: ReportNarrative,
  errors: ValidationError[],
  warnings: ValidationWarning[]
): boolean {
  let included = true;

  // Check AI Intelligence Explanation section
  if (!narrative.aiIntelligenceExplanation || narrative.aiIntelligenceExplanation.length < 100) {
    errors.push({
      code: 'INSUFFICIENT_AI_EXPLANATION',
      message: 'AI Intelligence Explanation section is too short or missing',
      severity: 'error',
    });
    included = false;
  }

  // Check confidence scores
  if (!intelligence.aiAssessment?.confidenceScore || intelligence.aiAssessment.confidenceScore < 0 || intelligence.aiAssessment.confidenceScore > 100) {
    errors.push({
      code: 'INVALID_CONFIDENCE_SCORE',
      message: 'AI confidence score is missing or invalid',
      severity: 'error',
    });
    included = false;
  }

  return included;
}

function validateAuditTrail(
  intelligence: ClaimIntelligence,
  errors: ValidationError[],
  warnings: ValidationWarning[]
): boolean {
  let included = true;

  // Check audit trail entries
  if (!intelligence.workflowAuditTrail || intelligence.workflowAuditTrail.length < 2) {
    errors.push({
      code: 'INSUFFICIENT_AUDIT_TRAIL',
      message: 'Workflow audit trail has fewer than 2 entries',
      severity: 'error',
    });
    included = false;
  }

  return included;
}

function validateTemplateCompliance(
  narrative: ReportNarrative,
  reportType: 'insurer' | 'assessor' | 'regulatory',
  errors: ValidationError[],
  warnings: ValidationWarning[]
): boolean {
  let compliant = true;

  // Check required sections
  const requiredSections = [
    'executiveSummary',
    'damageAssessmentAnalysis',
    'aiIntelligenceExplanation',
    'costComparisonAnalytics',
    'fraudRiskEvaluation',
    'recommendationsAndNextSteps',
  ];

  if (reportType === 'assessor' || reportType === 'regulatory') {
    requiredSections.push('physicsValidationSummary', 'workflowAuditTrailSummary');
  }

  for (const section of requiredSections) {
    if (!narrative[section] || narrative[section].length < 50) {
      errors.push({
        code: `MISSING_SECTION_${section.toUpperCase()}`,
        message: `Required section "${section}" is missing or too short`,
        severity: 'error',
      });
      compliant = false;
    }
  }

  return compliant;
}
```

## PDF Generation Service

### Purpose

The PDF Generation Service converts the structured report data (narrative + visualizations) into a professional, print-ready PDF document.

### Technology Stack

- **Puppeteer**: Headless Chrome for HTML-to-PDF conversion
- **HTML Templates**: Structured HTML templates for each report type
- **CSS Styling**: Professional styling with print-optimized CSS
- **Chart.js**: For generating chart images embedded in PDF
- **SVG**: For gauges, heat scales, and legends

### PDF Template Structure

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>KINGA Insurance Claim Report - {{claimNumber}}</title>
  <style>
    @page {
      size: A4;
      margin: 2cm 1.5cm;
    }
    body {
      font-family: 'Arial', sans-serif;
      font-size: 11pt;
      line-height: 1.6;
      color: #333;
    }
    h1 {
      font-size: 20pt;
      color: #1a1a1a;
      border-bottom: 3px solid #0066cc;
      padding-bottom: 10px;
      margin-bottom: 20px;
    }
    h2 {
      font-size: 16pt;
      color: #0066cc;
      margin-top: 30px;
      margin-bottom: 15px;
    }
    h3 {
      font-size: 13pt;
      color: #333;
      margin-top: 20px;
      margin-bottom: 10px;
    }
    .header {
      text-align: center;
      margin-bottom: 40px;
    }
    .header img {
      max-width: 200px;
      margin-bottom: 10px;
    }
    .metadata {
      background: #f5f5f5;
      padding: 15px;
      border-left: 4px solid #0066cc;
      margin-bottom: 30px;
    }
    .metadata table {
      width: 100%;
      border-collapse: collapse;
    }
    .metadata td {
      padding: 5px 10px;
    }
    .metadata td:first-child {
      font-weight: bold;
      width: 30%;
    }
    .section {
      margin-bottom: 30px;
      page-break-inside: avoid;
    }
    .visualization {
      text-align: center;
      margin: 20px 0;
      page-break-inside: avoid;
    }
    .visualization img {
      max-width: 100%;
      height: auto;
    }
    .footer {
      text-align: center;
      font-size: 9pt;
      color: #666;
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #ccc;
    }
    table.data-table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
    }
    table.data-table th {
      background: #0066cc;
      color: white;
      padding: 10px;
      text-align: left;
    }
    table.data-table td {
      padding: 8px 10px;
      border-bottom: 1px solid #ddd;
    }
    table.data-table tr:nth-child(even) {
      background: #f9f9f9;
    }
  </style>
</head>
<body>
  <div class="header">
    <img src="{{logoUrl}}" alt="KINGA Logo">
    <h1>Insurance Claim Report</h1>
    <p><strong>{{reportTypeName}}</strong></p>
  </div>

  <div class="metadata">
    <table>
      <tr>
        <td>Claim Number:</td>
        <td>{{claimNumber}}</td>
      </tr>
      <tr>
        <td>Report Generated:</td>
        <td>{{generatedAt}}</td>
      </tr>
      <tr>
        <td>Generated By:</td>
        <td>{{generatedBy}}</td>
      </tr>
      <tr>
        <td>Vehicle:</td>
        <td>{{vehicleMake}} {{vehicleModel}} ({{vehicleYear}})</td>
      </tr>
      <tr>
        <td>Incident Date:</td>
        <td>{{incidentDate}}</td>
      </tr>
    </table>
  </div>

  <div class="section">
    <h2>Executive Summary</h2>
    <p>{{executiveSummary}}</p>
  </div>

  <div class="section">
    <h2>Damage Assessment Analysis</h2>
    <p>{{damageAssessmentAnalysis}}</p>
    
    <div class="visualization">
      <h3>Confidence Gauge</h3>
      <img src="{{confidenceGaugeImage}}" alt="Confidence Gauge">
    </div>
  </div>

  <div class="section">
    <h2>AI Intelligence Explanation</h2>
    <p>{{aiIntelligenceExplanation}}</p>
  </div>

  <div class="section">
    <h2>Cost Comparison Analytics</h2>
    <p>{{costComparisonAnalytics}}</p>
    
    <div class="visualization">
      <h3>Cost Comparison Chart</h3>
      <img src="{{costComparisonChartImage}}" alt="Cost Comparison Chart">
    </div>
  </div>

  <div class="section">
    <h2>Fraud Risk Evaluation</h2>
    <p>{{fraudRiskEvaluation}}</p>
    
    <div class="visualization">
      <h3>Fraud Risk Heat Scale</h3>
      <img src="{{fraudRiskHeatScaleImage}}" alt="Fraud Risk Heat Scale">
    </div>
  </div>

  {{#if includePhysicsValidation}}
  <div class="section">
    <h2>Physics Validation Summary</h2>
    <p>{{physicsValidationSummary}}</p>
  </div>
  {{/if}}

  {{#if includeWorkflowAuditTrail}}
  <div class="section">
    <h2>Workflow Audit Trail</h2>
    <p>{{workflowAuditTrailSummary}}</p>
    
    <div class="visualization">
      <h3>Claim Workflow Timeline</h3>
      <img src="{{workflowTimelineImage}}" alt="Workflow Timeline">
    </div>
  </div>
  {{/if}}

  <div class="section">
    <h2>Recommendations and Next Steps</h2>
    <p>{{recommendationsAndNextSteps}}</p>
  </div>

  <div class="footer">
    <p>This report was generated by KINGA AutoVerify AI on {{generatedAt}}.</p>
    <p>Confidential and proprietary information. Do not distribute without authorization.</p>
  </div>
</body>
</html>
```

### Implementation

```typescript
// server/report-pdf-generator.ts

import puppeteer from 'puppeteer';
import { storagePut } from './storage';

export async function generateReportPDF(
  intelligence: ClaimIntelligence,
  narrative: ReportNarrative,
  visualizations: ReportVisualizations,
  reportType: 'insurer' | 'assessor' | 'regulatory'
): Promise<string> {
  // Render HTML template
  const html = renderHTMLTemplate(intelligence, narrative, visualizations, reportType);

  // Launch headless browser
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });

  // Generate PDF
  const pdfBuffer = await page.pdf({
    format: 'A4',
    printBackground: true,
    margin: {
      top: '2cm',
      right: '1.5cm',
      bottom: '2cm',
      left: '1.5cm',
    },
  });

  await browser.close();

  // Upload PDF to S3
  const fileName = `report-${intelligence.claim.claimNumber}-${Date.now()}.pdf`;
  const { url } = await storagePut(
    `reports/${fileName}`,
    pdfBuffer,
    'application/pdf'
  );

  return url;
}

function renderHTMLTemplate(
  intelligence: ClaimIntelligence,
  narrative: ReportNarrative,
  visualizations: ReportVisualizations,
  reportType: 'insurer' | 'assessor' | 'regulatory'
): string {
  const reportTypeNames = {
    insurer: 'Insurer Report',
    assessor: 'Assessor Technical Report',
    regulatory: 'Regulatory Audit Report',
  };

  // Replace template variables with actual data
  // (In production, use a proper template engine like Handlebars)
  const template = getHTMLTemplate();
  
  return template
    .replace(/{{logoUrl}}/g, 'https://kinga.example.com/logo.png')
    .replace(/{{reportTypeName}}/g, reportTypeNames[reportType])
    .replace(/{{claimNumber}}/g, intelligence.claim.claimNumber)
    .replace(/{{generatedAt}}/g, new Date().toLocaleString())
    .replace(/{{generatedBy}}/g, 'KINGA AutoVerify AI')
    .replace(/{{vehicleMake}}/g, intelligence.claim.vehicleMake)
    .replace(/{{vehicleModel}}/g, intelligence.claim.vehicleModel)
    .replace(/{{vehicleYear}}/g, intelligence.claim.vehicleYear.toString())
    .replace(/{{incidentDate}}/g, new Date(intelligence.claim.incidentDate).toLocaleDateString())
    .replace(/{{executiveSummary}}/g, narrative.executiveSummary)
    .replace(/{{damageAssessmentAnalysis}}/g, narrative.damageAssessmentAnalysis)
    .replace(/{{aiIntelligenceExplanation}}/g, narrative.aiIntelligenceExplanation)
    .replace(/{{costComparisonAnalytics}}/g, narrative.costComparisonAnalytics)
    .replace(/{{fraudRiskEvaluation}}/g, narrative.fraudRiskEvaluation)
    .replace(/{{physicsValidationSummary}}/g, narrative.physicsValidationSummary)
    .replace(/{{workflowAuditTrailSummary}}/g, narrative.workflowAuditTrailSummary)
    .replace(/{{recommendationsAndNextSteps}}/g, narrative.recommendationsAndNextSteps)
    .replace(/{{confidenceGaugeImage}}/g, visualizations.confidenceGauge)
    .replace(/{{costComparisonChartImage}}/g, visualizations.costComparisonChart)
    .replace(/{{fraudRiskHeatScaleImage}}/g, visualizations.fraudRiskHeatScale)
    .replace(/{{workflowTimelineImage}}/g, visualizations.workflowTimeline);
}
```

## Integration with KINGA System

### tRPC Procedures

```typescript
// server/routers.ts

reports: router({
  generate: protectedProcedure
    .input(z.object({
      claimId: z.string(),
      reportType: z.enum(['insurer', 'assessor', 'regulatory']),
    }))
    .mutation(async ({ ctx, input }) => {
      // Aggregate claim intelligence
      const intelligence = await aggregateClaimIntelligence(input.claimId);
      
      // Generate narrative
      const narrative = await generateReportNarrative(intelligence, input.reportType);
      
      // Generate visualizations
      const visualizations = await generateReportVisualizations(intelligence);
      
      // Validate report
      const validation = await validateReport(intelligence, narrative, input.reportType);
      
      if (!validation.isValid) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Report validation failed: ${validation.errors.map(e => e.message).join(', ')}`,
        });
      }
      
      // Generate PDF
      const pdfUrl = await generateReportPDF(intelligence, narrative, visualizations, input.reportType);
      
      // Save report record to database
      const report = await db.insert(generatedReports).values({
        claimId: input.claimId,
        reportType: input.reportType,
        generatedBy: ctx.user.id,
        pdfUrl,
        narrative: JSON.stringify(narrative),
        visualizations: JSON.stringify(visualizations),
        validation: JSON.stringify(validation),
      });
      
      return { reportId: report.id, pdfUrl, validation };
    }),
    
  download: protectedProcedure
    .input(z.object({ reportId: z.string() }))
    .query(async ({ ctx, input }) => {
      const [report] = await db
        .select()
        .from(generatedReports)
        .where(eq(generatedReports.id, input.reportId));
        
      if (!report) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Report not found' });
      }
      
      return { pdfUrl: report.pdfUrl };
    }),
}),
```

### Frontend UI

```typescript
// client/src/pages/ReportGeneration.tsx

export function ReportGeneration() {
  const { claimId } = useParams();
  const generateReport = trpc.reports.generate.useMutation();
  
  const handleGenerateReport = async (reportType: 'insurer' | 'assessor' | 'regulatory') => {
    const result = await generateReport.mutateAsync({ claimId, reportType });
    
    if (result.validation.isValid) {
      toast.success('Report generated successfully');
      window.open(result.pdfUrl, '_blank');
    } else {
      toast.error(`Report validation failed: ${result.validation.errors.map(e => e.message).join(', ')}`);
    }
  };
  
  return (
    <div>
      <h1>Generate Claim Report</h1>
      <div>
        <button onClick={() => handleGenerateReport('insurer')}>
          Generate Insurer Report
        </button>
        <button onClick={() => handleGenerateReport('assessor')}>
          Generate Assessor Report
        </button>
        <button onClick={() => handleGenerateReport('regulatory')}>
          Generate Regulatory Report
        </button>
      </div>
    </div>
  );
}
```

## Performance Considerations

### Caching Strategy

- **Intelligence Aggregation**: Cache aggregated intelligence for 5 minutes to avoid redundant database queries
- **Narrative Generation**: Cache generated narratives for 1 hour (invalidate on claim updates)
- **Visualizations**: Cache visualization images for 1 hour
- **PDF Generation**: Cache final PDF for 24 hours (invalidate on claim updates)

### Async Processing

For large reports or batch generation:
- Use background job queue (e.g., BullMQ)
- Send notification when report is ready
- Store generation status in database

### Resource Optimization

- Limit concurrent PDF generations to avoid memory exhaustion
- Use streaming for large PDF files
- Compress images before embedding in PDF
- Reuse Puppeteer browser instance across multiple PDF generations

## Security & Compliance

### Access Control

- Only authorized users can generate reports for claims they have access to
- Report download URLs are signed with expiration (24 hours)
- Audit log all report generation and download events

### Data Privacy

- Redact sensitive personal information based on user role
- Watermark PDFs with user ID and timestamp
- Encrypt PDFs at rest in S3

### Regulatory Compliance

- Include AI model version and training data provenance in regulatory reports
- Document all AI decision-making processes for explainability
- Maintain complete audit trail for regulatory review
- Ensure GDPR/POPIA compliance for personal data handling

## Testing Strategy

### Unit Tests

- Test intelligence aggregation with various claim states
- Test narrative generation with different report types
- Test visualization generation with edge cases (missing data, extreme values)
- Test validation service with incomplete data

### Integration Tests

- Test end-to-end report generation workflow
- Test PDF generation and S3 upload
- Test tRPC procedures with authentication

### Visual Regression Tests

- Capture PDF screenshots for visual comparison
- Ensure consistent formatting across report types

## Future Enhancements

### Multi-Language Support

- Generate reports in multiple languages (English, Afrikaans, Zulu)
- Use LLM translation for narrative sections

### Custom Report Templates

- Allow insurers to define custom report templates
- Support custom branding (logo, colors, fonts)

### Interactive Dashboard Reports

- Generate interactive HTML reports with drill-down capabilities
- Embed interactive charts (Chart.js, D3.js)

### Batch Report Generation

- Generate reports for multiple claims in a single request
- Export to Excel/CSV for bulk analysis

### AI-Powered Insights

- Use LLM to generate additional insights and recommendations
- Identify patterns across multiple claims
- Suggest process improvements based on workflow analysis

## Conclusion

The KINGA Intelligent Report Generation Framework provides a comprehensive, production-ready solution for generating professional insurance-grade reports. By leveraging AI-powered narrative generation, role-specific templates, embedded visualizations, and robust validation, the system ensures that all stakeholders receive accurate, explainable, and actionable intelligence to support claim decision-making and regulatory compliance.
