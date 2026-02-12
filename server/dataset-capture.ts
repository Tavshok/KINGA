/**
 * Phase 2: Claim Intelligence Dataset Capture Layer
 * 
 * This module provides functions for:
 * - Event emission (immutable audit trail)
 * - Dataset capture (ML training features)
 * - Turnaround time calculation
 * 
 * All functions are designed to be non-blocking and fault-tolerant.
 */

import { eq, and, sql } from "drizzle-orm";
import { getDb } from "./db";
import { 
  claims, 
  claimEvents, 
  claimIntelligenceDataset, 
  modelTrainingQueue,
  aiAssessments,
  assessorEvaluations,
  users,
} from "../drizzle/schema";
import { getClaimById } from "./db";

/**
 * Emit a claim event to the immutable event log
 */
export async function emitClaimEvent(event: {
  claimId: number;
  eventType: string;
  payload: Record<string, any>;
  userId?: number;
  userRole?: string;
}) {
  try {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    
    // Get claim to extract tenant_id
    const claim = await getClaimById(event.claimId);
    if (!claim) {
      console.error(`Cannot emit event: claim ${event.claimId} not found`);
      return;
    }
    
    await db.insert(claimEvents).values({
      claimId: event.claimId,
      eventType: event.eventType,
      eventPayload: event.payload,
      userId: event.userId || null,
      userRole: event.userRole || null,
      tenantId: claim.tenantId,
      emittedAt: new Date(),
    });
    
    console.log(`[Event] ${event.eventType} emitted for claim ${event.claimId}`);
  } catch (error) {
    console.error(`Failed to emit event ${event.eventType} for claim ${event.claimId}:`, error);
    // Don't throw - event emission failures should not block main workflow
  }
}

/**
 * Calculate assessment turnaround time (hours from assignment to submission)
 */
export async function calculateAssessmentTurnaround(claimId: number): Promise<number> {
  try {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    
    const events = await db.select()
      .from(claimEvents)
      .where(eq(claimEvents.claimId, claimId))
      .orderBy(claimEvents.emittedAt);
    
    const assignedEvent = events.find(e => e.eventType === "assessor_assigned");
    const submittedEvent = events.find(e => e.eventType === "assessor_evaluation_submitted");
    
    if (!assignedEvent || !submittedEvent) return 0;
    
    const turnaroundMs = submittedEvent.emittedAt.getTime() - assignedEvent.emittedAt.getTime();
    return turnaroundMs / (1000 * 60 * 60); // Convert to hours
  } catch (error) {
    console.error(`Failed to calculate assessment turnaround for claim ${claimId}:`, error);
    return 0;
  }
}

/**
 * Calculate approval timeline (hours from submission to final approval)
 */
export async function calculateApprovalTimeline(claimId: number): Promise<number> {
  try {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    
    const events = await db.select()
      .from(claimEvents)
      .where(eq(claimEvents.claimId, claimId))
      .orderBy(claimEvents.emittedAt);
    
    const submittedEvent = events.find(e => e.eventType === "claim_submitted");
    const approvedEvent = events.find(e => e.eventType === "claim_approved");
    
    if (!submittedEvent || !approvedEvent) return 0;
    
    const timelineMs = approvedEvent.emittedAt.getTime() - submittedEvent.emittedAt.getTime();
    return timelineMs / (1000 * 60 * 60); // Convert to hours
  } catch (error) {
    console.error(`Failed to calculate approval timeline for claim ${claimId}:`, error);
    return 0;
  }
}

/**
 * Capture comprehensive dataset snapshot for ML training
 * Triggered when claim reaches final approval
 */
export async function captureClaimIntelligenceDataset(
  claimId: number,
  approval: {
    approvedAmount: number;
    approvedBy: number;
    approvedAt: Date;
  }
) {
  try {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    
    // 1. Fetch claim details
    const claim = await getClaimById(claimId);
    if (!claim) {
      console.error(`Cannot capture dataset: claim ${claimId} not found`);
      return;
    }
    
    // 2. Fetch AI assessment
    const aiAssessmentResult = await db.select()
      .from(aiAssessments)
      .where(eq(aiAssessments.claimId, claimId))
      .limit(1);
    
    if (aiAssessmentResult.length === 0) {
      console.warn(`No AI assessment found for claim ${claimId}, skipping dataset capture`);
      return;
    }
    
    const ai = aiAssessmentResult[0];
    
    // 3. Fetch assessor evaluation (if exists)
    const assessorEvalResult = await db.select()
      .from(assessorEvaluations)
      .where(eq(assessorEvaluations.claimId, claimId))
      .limit(1);
    
    const assessor = assessorEvalResult.length > 0 ? assessorEvalResult[0] : null;
    
    // 4. Calculate turnaround times
    const assessmentTurnaround = await calculateAssessmentTurnaround(claimId);
    const approvalTimeline = await calculateApprovalTimeline(claimId);
    
    // 5. Calculate cost variances
    const aiCost = ai.estimatedCost || 0;
    const assessorCost = assessor?.estimatedRepairCost || aiCost;
    const finalCost = approval.approvedAmount;
    
    const varianceAiVsAssessor = assessorCost > 0 
      ? Math.round(Math.abs(aiCost - assessorCost) / assessorCost * 100)
      : 0;
    
    const varianceAssessorVsFinal = finalCost > 0
      ? Math.round(Math.abs(assessorCost - finalCost) / finalCost * 100)
      : 0;
    
    const varianceAiVsFinal = finalCost > 0
      ? Math.round(Math.abs(aiCost - finalCost) / finalCost * 100)
      : 0;
    
    // 6. Parse damage components
    const damagedComponents = ai.detectedDamageTypes 
      ? JSON.parse(ai.detectedDamageTypes)
      : [];
    
    const damageSeverityScores = ai.damagedComponentsJson
      ? JSON.parse(ai.damagedComponentsJson)
      : {};
    
    // 7. Determine fraud outcome (default to 'legitimate' unless flagged)
    const fraudOutcome = ai.fraudRiskLevel === "high" ? "suspicious" : "legitimate";
    
    // 8. Get assessor details
    const assessorUserResult = claim.assignedAssessorId 
      ? await db.select().from(users).where(eq(users.id, claim.assignedAssessorId)).limit(1)
      : [];
    
    const assessorTier = assessorUserResult.length > 0 ? assessorUserResult[0].assessorTier : null;
    
    // 9. Count reassignments
    const reassignmentCountResult = await db.select({ count: sql<number>`COUNT(*)` })
      .from(claimEvents)
      .where(and(
        eq(claimEvents.claimId, claimId),
        eq(claimEvents.eventType, "assessor_assigned")
      ));
    
    const reassignmentCount = (reassignmentCountResult[0]?.count || 1) - 1; // Subtract 1 for initial assignment
    
    // 10. Check for police report
    const policeReportPresence = 0; // TODO: Check if police report exists in database
    
    // 11. Insert dataset record
    const datasetResult = await db.insert(claimIntelligenceDataset).values({
      claimId,
      tenantId: claim.tenantId,
      schemaVersion: 1,
      
      // Claim context
      vehicleMake: claim.vehicleMake,
      vehicleModel: claim.vehicleModel,
      vehicleYear: claim.vehicleYear,
      vehicleMass: null, // TODO: Add vehicle mass lookup from external API
      accidentType: "unknown", // TODO: Extract from physics_analysis JSON
      impactDirection: "unknown", // TODO: Extract from physics_analysis JSON
      accidentDescriptionText: claim.incidentDescription,
      policeReportPresence,
      
      // Damage features
      detectedDamageComponents: damagedComponents,
      damageSeverityScores,
      llmDamageReasoning: ai.damageDescription,
      physicsPlausibilityScore: ai.confidenceScore || 0,
      
      // Assessment features
      aiEstimatedCost: aiCost,
      assessorAdjustedCost: assessorCost,
      insurerApprovedCost: finalCost,
      costVarianceAiVsAssessor: varianceAiVsAssessor,
      costVarianceAssessorVsFinal: varianceAssessorVsFinal,
      costVarianceAiVsFinal: varianceAiVsFinal,
      
      // Fraud features
      aiFraudScore: 0, // TODO: Calculate from fraudRiskLevel enum
      fraudExplanation: ai.fraudIndicators ? JSON.stringify(ai.fraudIndicators) : null,
      finalFraudOutcome: fraudOutcome,
      
      // Workflow features
      assessorId: claim.assignedAssessorId,
      assessorTier,
      assessmentTurnaroundHours: assessmentTurnaround.toFixed(2),
      reassignmentCount,
      approvalTimelineHours: approvalTimeline.toFixed(2),
      
      capturedAt: new Date(),
    });
    
    // 12. Add to training queue
    await db.insert(modelTrainingQueue).values({
      claimId,
      datasetRecordId: 0, // Will be updated after insert
      trainingPriority: "normal",
      processed: 0,
    });
    
    console.log(`[Dataset] Captured intelligence dataset for claim ${claimId}`);
  } catch (error) {
    console.error(`Failed to capture dataset for claim ${claimId}:`, error);
    // Don't throw - dataset capture failures should not block claim approval
  }
}

/**
 * Get dataset record for a claim (if exists)
 */
export async function getDatasetRecord(claimId: number) {
  try {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    
    const result = await db.select()
      .from(claimIntelligenceDataset)
      .where(eq(claimIntelligenceDataset.claimId, claimId))
      .limit(1);
    
    return result.length > 0 ? result[0] : null;
  } catch (error) {
    console.error(`Failed to get dataset record for claim ${claimId}:`, error);
    return null;
  }
}

/**
 * Get all events for a claim (ordered by time)
 */
export async function getClaimEvents(claimId: number) {
  try {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    
    return await db.select()
      .from(claimEvents)
      .where(eq(claimEvents.claimId, claimId))
      .orderBy(claimEvents.emittedAt);
  } catch (error) {
    console.error(`Failed to get events for claim ${claimId}:`, error);
    return [];
  }
}

/**
 * Get training queue statistics
 */
export async function getTrainingQueueStats() {
  try {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    
    const stats = await db.select({
      total: sql<number>`COUNT(*)`,
      pending: sql<number>`SUM(CASE WHEN processed = 0 THEN 1 ELSE 0 END)`,
      processed: sql<number>`SUM(CASE WHEN processed = 1 THEN 1 ELSE 0 END)`,
      highPriority: sql<number>`SUM(CASE WHEN training_priority = 'high' AND processed = 0 THEN 1 ELSE 0 END)`,
    })
    .from(modelTrainingQueue);
    
    return stats[0];
  } catch (error) {
    console.error("Failed to get training queue stats:", error);
    return { total: 0, pending: 0, processed: 0, highPriority: 0 };
  }
}
