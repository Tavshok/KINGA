/**
 * KINGA Report Intelligence Aggregation Service
 * 
 * Consolidates all claim-related data from multiple sources into a unified
 * intelligence object that serves as the foundation for report generation.
 */

import { getDb } from "./db";
import {
  claims,
  aiAssessments,
  assessorEvaluations,
  panelBeaterQuotes,
  users,
  panelBeaters,
} from "../drizzle/schema";
import { eq, desc } from "drizzle-orm";

export interface ClaimIntelligence {
  claim: any;
  aiAssessment: any | null;
  assessorEvaluation: any | null;
  panelBeaterQuotes: any[];
  fraudDetection: {
    aiRiskScore: number;
    assessorRiskLevel: string;
    indicators: string[];
    enhancedAnalysis: any;
  };
  physicsValidation: {
    impactAnalysis: any | null;
    damageConsistency: any | null;
    validationConfidence: number;
  };
  workflowAuditTrail: Array<{
    id: string;
    claimId: string;
    previousStatus: string | null;
    newStatus: string;
    changedBy: string | null;
    changedByName: string | null;
    changedAt: Date;
    notes: string | null;
  }>;
  supportingEvidence: {
    damagePhotos: string[];
    annotatedPhotos: string[];
    policeReportUrl: string | null;
    quotePdfs: string[];
  };
}

/**
 * Aggregates all claim intelligence data from multiple sources
 */
export async function aggregateClaimIntelligence(
  claimId: string
): Promise<ClaimIntelligence> {
  const db = await getDb();
  if (!db) throw new Error('Database connection failed');
  
  // Fetch claim core data
  const [claim] = await db.select().from(claims).where(eq(claims.id, parseInt(claimId)));

  if (!claim) {
    throw new Error(`Claim ${claimId} not found`);
  }

  // Fetch AI assessment (most recent)
  const [aiAssessment] = await db
    .select()
    .from(aiAssessments)
    .where(eq(aiAssessments.claimId, parseInt(claimId)))
    .orderBy(desc(aiAssessments.createdAt))
    .limit(1);

  // Fetch assessor evaluation (most recent)
  const assessorEvaluationsWithUser = await db
    .select({
      evaluation: assessorEvaluations,
      assessorName: users.name,
    })
    .from(assessorEvaluations)
    .leftJoin(users, eq(assessorEvaluations.assessorId, users.id))
    .where(eq(assessorEvaluations.claimId, parseInt(claimId)))
    .orderBy(desc(assessorEvaluations.createdAt))
    .limit(1);

  const assessorEvaluation = assessorEvaluationsWithUser[0]
    ? {
        ...assessorEvaluationsWithUser[0].evaluation,
        assessorName: assessorEvaluationsWithUser[0].assessorName || "Unknown Assessor",
      }
    : null;

  // Fetch panel beater quotes with panel beater names
  const quotesWithPanelBeaters = await db
    .select({
      quote: panelBeaterQuotes,
      panelBeaterName: panelBeaters.businessName,
    })
    .from(panelBeaterQuotes)
    .leftJoin(panelBeaters, eq(panelBeaterQuotes.panelBeaterId, panelBeaters.id))
    .where(eq(panelBeaterQuotes.claimId, parseInt(claimId)));

  const quotes = quotesWithPanelBeaters.map((row: any) => ({
    ...row.quote,
    panelBeaterName: row.panelBeaterName || "Unknown Panel Beater",
  }));

  // Build simplified audit trail based on claim metadata
  const auditTrail = [
    {
      id: '1',
      claimId: claim.id.toString(),
      previousStatus: null as string | null,
      newStatus: 'submitted',
      changedBy: claim.claimantId?.toString() ?? null,
      changedByName: (claim as any).claimantName || 'Unknown Claimant',
      changedAt: claim.createdAt,
      notes: 'Claim submitted',
    },
  ];

  if (aiAssessment) {
    // @ts-ignore - Type mismatch with audit trail interface
    auditTrail.push({
      id: '2',
      claimId: claim.id.toString(),
      previousStatus: 'submitted' as string | null,
      newStatus: 'ai_assessed',
      // @ts-ignore
      changedBy: null as string | null,
      changedByName: 'AI System' as string | null,
      changedAt: aiAssessment.createdAt,
      notes: 'AI assessment completed',
    });
  }

  if (assessorEvaluation) {
    // @ts-ignore - Type mismatch with audit trail interface
    auditTrail.push({
      id: '3',
      claimId: claim.id.toString(),
      previousStatus: 'ai_assessed' as string | null,
      newStatus: 'assessor_evaluated',
      changedBy: assessorEvaluation.assessorId?.toString() ?? null,
      changedByName: (assessorEvaluation as any).assessorName || 'Unknown Assessor',
      changedAt: assessorEvaluation.createdAt,
      notes: 'Assessor evaluation completed',
    });
  }

  if (quotes.length > 0) {
    // @ts-ignore - Type mismatch with audit trail interface
    auditTrail.push({
      id: '4',
      claimId: claim.id.toString(),
      previousStatus: (assessorEvaluation ? 'assessor_evaluated' : 'ai_assessed') as string | null,
      newStatus: 'quotes_received',
      // @ts-ignore
      changedBy: null as string | null,
      changedByName: 'System' as string | null,
      changedAt: quotes[0].createdAt,
      notes: `${quotes.length} panel beater quote(s) received`,
    });
  }

  // Aggregate fraud detection data
  const fraudDetection = {
    aiRiskScore: (aiAssessment as any)?.fraudRiskScore || 0,
    assessorRiskLevel: assessorEvaluation?.fraudRiskLevel || "low",
    indicators: aiAssessment?.fraudIndicators ? JSON.parse(aiAssessment.fraudIndicators) : [],
    enhancedAnalysis: (aiAssessment as any)?.enhancedFraudAnalysis || null,
  };

  // Aggregate physics validation data
  const physicsValidation = {
    impactAnalysis: (aiAssessment as any)?.impactPhysicsAnalysis || null,
    damageConsistency: (aiAssessment as any)?.damagePatternConsistency || null,
    validationConfidence: (aiAssessment as any)?.physicsValidationConfidence || 0,
  };

  // Aggregate supporting evidence
  const supportingEvidence = {
    damagePhotos: claim.damagePhotos ? (typeof claim.damagePhotos === 'string' ? JSON.parse(claim.damagePhotos) : claim.damagePhotos) : [],
    annotatedPhotos: (aiAssessment as any)?.annotatedDamagePhotos ? (typeof (aiAssessment as any).annotatedDamagePhotos === 'string' ? JSON.parse((aiAssessment as any).annotatedDamagePhotos) : (aiAssessment as any).annotatedDamagePhotos) : [],
    policeReportUrl: (claim as any).policeReportUrl || null,
    quotePdfs: quotes.map((q: any) => q.quotePdfUrl).filter(Boolean) as string[],
  };

  return {
    claim,
    aiAssessment,
    assessorEvaluation,
    panelBeaterQuotes: quotes,
    fraudDetection,
    physicsValidation,
    workflowAuditTrail: auditTrail,
    supportingEvidence,
  };
}

/**
 * Extracts damage assessment data from AI and assessor evaluations
 */
export function extractDamageAssessmentData(intelligence: ClaimIntelligence) {
  return {
    aiEstimate: intelligence.aiAssessment?.estimatedCost || 0,
    assessorEstimate: intelligence.assessorEvaluation?.estimatedRepairCost || null,
    quoteEstimates: intelligence.panelBeaterQuotes.map((q: any) => q.totalCost),
    damagedComponents: intelligence.aiAssessment?.detectedDamageTypes 
      ? JSON.parse(intelligence.aiAssessment.detectedDamageTypes) 
      : [],
    damageAnalysis: intelligence.aiAssessment?.damageDescription || "",
  };
}

/**
 * Extracts cost comparison data from quotes and AI estimates
 */
export function extractCostComparisonData(intelligence: ClaimIntelligence) {
  return {
    aiPartsCost: intelligence.aiAssessment?.partsCost || 0,
    aiLaborCost: intelligence.aiAssessment?.laborCost || 0,
    aiTotalCost: intelligence.aiAssessment?.estimatedCost || 0,
    assessorPartsCost: intelligence.assessorEvaluation?.partsCost || null,
    assessorLaborCost: intelligence.assessorEvaluation?.laborCost || null,
    assessorTotalCost: intelligence.assessorEvaluation?.estimatedRepairCost || null,
    quotes: intelligence.panelBeaterQuotes.map((q: any) => ({
      panelBeaterName: q.panelBeaterName,
      partsCost: q.partsCost,
      laborCost: q.laborCost,
      totalCost: q.totalCost,
    })),
  };
}

/**
 * Extracts fraud risk data from all detection sources
 */
export function extractFraudRiskData(intelligence: ClaimIntelligence) {
  const aiRiskScore = intelligence.fraudDetection.aiRiskScore;
  const assessorRiskLevel = intelligence.fraudDetection.assessorRiskLevel;

  // Determine overall risk level
  let overallRiskLevel: "low" | "medium" | "high" = "low";
  if (aiRiskScore >= 70 || assessorRiskLevel === "high") {
    overallRiskLevel = "high";
  } else if (aiRiskScore >= 40 || assessorRiskLevel === "medium") {
    overallRiskLevel = "medium";
  }

  return {
    overallRiskLevel,
    aiRiskScore,
    assessorRiskLevel,
    indicators: intelligence.fraudDetection.indicators,
    enhancedAnalysis: intelligence.fraudDetection.enhancedAnalysis,
  };
}

/**
 * Extracts physics validation results
 */
export function extractPhysicsValidationData(intelligence: ClaimIntelligence) {
  return {
    validationConfidence: intelligence.physicsValidation.validationConfidence,
    impactAnalysis: intelligence.physicsValidation.impactAnalysis,
    damageConsistency: intelligence.physicsValidation.damageConsistency,
  };
}

/**
 * Builds workflow audit trail summary
 */
export function buildWorkflowAuditTrail(intelligence: ClaimIntelligence) {
  const timeline = intelligence.workflowAuditTrail.map((entry) => ({
    status: entry.newStatus,
    timestamp: entry.changedAt,
    actor: entry.changedByName || "System",
    notes: entry.notes,
  }));

  // Calculate processing times
  const submittedAt = intelligence.claim.createdAt;
  const aiAssessmentAt = intelligence.aiAssessment?.createdAt || null;
  const assessorEvaluationAt = intelligence.assessorEvaluation?.createdAt || null;
  const firstQuoteAt =
    intelligence.panelBeaterQuotes.length > 0
      ? intelligence.panelBeaterQuotes[0].createdAt
      : null;

  const submissionToAIAssessment = aiAssessmentAt
    ? aiAssessmentAt.getTime() - submittedAt.getTime()
    : null;
  const aiAssessmentToAssessorEvaluation =
    aiAssessmentAt && assessorEvaluationAt
      ? assessorEvaluationAt.getTime() - aiAssessmentAt.getTime()
      : null;
  const assessorEvaluationToQuotes =
    assessorEvaluationAt && firstQuoteAt
      ? firstQuoteAt.getTime() - assessorEvaluationAt.getTime()
      : null;

  const latestEventAt =
    firstQuoteAt || assessorEvaluationAt || aiAssessmentAt || submittedAt;
  const totalProcessingTime = latestEventAt.getTime() - submittedAt.getTime();

  return {
    totalEvents: timeline.length,
    timeline,
    processingTime: {
      submissionToAIAssessment,
      aiAssessmentToAssessorEvaluation,
      assessorEvaluationToQuotes,
      totalProcessingTime,
    },
  };
}
