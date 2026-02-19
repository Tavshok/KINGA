// @ts-nocheck
/**
 * Usage Metering Service
 * Event-based usage tracking for metering and analytics
 */

import { eq, and } from "drizzle-orm";
import { getDb } from "../db";
import { usageEvents, type InsertUsageEvent } from "../../drizzle/schema";

export type UsageEventType =
  | "CLAIM_PROCESSED"
  | "AI_EVALUATED"
  | "FAST_TRACK_TRIGGERED"
  | "AUTO_APPROVED"
  | "ASSESSOR_TOOL_USED"
  | "FLEET_VEHICLE_ACTIVE"
  | "AGENCY_POLICY_BOUND";

export interface UsageEventMetadata {
  claimId?: number;
  tenantId: string;
  eventType: UsageEventType;
  quantity?: number;
  referenceId?: string;
  metadata?: Record<string, any>;
}

/**
 * Record a usage event with duplicate protection
 */
export async function recordUsageEvent(params: UsageEventMetadata): Promise<number | null> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database connection not available");
  }

  // Check for duplicate event if referenceId is provided
  if (params.referenceId) {
    const [existingEvent] = await db
      .select()
      .from(usageEvents)
      .where(
        and(
          eq(usageEvents.tenantId, params.tenantId),
          eq(usageEvents.referenceId, params.referenceId)
        )
      )
      .limit(1);

    if (existingEvent) {
      console.log(`[UsageMeter] Duplicate event detected: ${params.referenceId}`);
      return null; // Event already recorded
    }
  }

  // Record the event
  const eventData: InsertUsageEvent = {
    tenantId: params.tenantId,
    claimId: params.claimId,
    eventType: params.eventType,
    quantity: params.quantity || 1,
    referenceId: params.referenceId,
    metadata: params.metadata ? JSON.stringify(params.metadata) : undefined,
  };

  const [result] = await db.insert(usageEvents).values(eventData);

  console.log(`[UsageMeter] Recorded event: ${params.eventType} for tenant ${params.tenantId}`);

  return result.insertId;
}

/**
 * Record claim processing event
 */
export async function recordClaimProcessed(
  tenantId: string,
  claimId: number,
  metadata?: Record<string, any>
): Promise<number | null> {
  return recordUsageEvent({
    tenantId,
    claimId,
    eventType: "CLAIM_PROCESSED",
    referenceId: `claim-processed-${claimId}`,
    metadata,
  });
}

/**
 * Record AI evaluation event
 */
export async function recordAIEvaluation(
  tenantId: string,
  claimId: number,
  metadata?: Record<string, any>
): Promise<number | null> {
  return recordUsageEvent({
    tenantId,
    claimId,
    eventType: "AI_EVALUATED",
    referenceId: `ai-eval-${claimId}-${Date.now()}`,
    metadata,
  });
}

/**
 * Record fast-track triggered event
 */
export async function recordFastTrackTriggered(
  tenantId: string,
  claimId: number,
  metadata?: Record<string, any>
): Promise<number | null> {
  return recordUsageEvent({
    tenantId,
    claimId,
    eventType: "FAST_TRACK_TRIGGERED",
    referenceId: `fast-track-${claimId}-${Date.now()}`,
    metadata,
  });
}

/**
 * Record auto-approval event
 */
export async function recordAutoApproval(
  tenantId: string,
  claimId: number,
  metadata?: Record<string, any>
): Promise<number | null> {
  return recordUsageEvent({
    tenantId,
    claimId,
    eventType: "AUTO_APPROVED",
    referenceId: `auto-approve-${claimId}`,
    metadata,
  });
}

/**
 * Record assessor premium tool usage
 */
export async function recordAssessorToolUsage(
  tenantId: string,
  claimId: number,
  toolName: string,
  metadata?: Record<string, any>
): Promise<number | null> {
  return recordUsageEvent({
    tenantId,
    claimId,
    eventType: "ASSESSOR_TOOL_USED",
    referenceId: `assessor-tool-${claimId}-${toolName}-${Date.now()}`,
    metadata: { ...metadata, toolName },
  });
}

/**
 * Record fleet vehicle active event
 */
export async function recordFleetVehicleActive(
  tenantId: string,
  vehicleId: number,
  metadata?: Record<string, any>
): Promise<number | null> {
  return recordUsageEvent({
    tenantId,
    eventType: "FLEET_VEHICLE_ACTIVE",
    referenceId: `fleet-vehicle-${vehicleId}-${new Date().toISOString().slice(0, 7)}`, // Monthly dedup
    metadata: { ...metadata, vehicleId },
  });
}

/**
 * Record agency policy bound event
 */
export async function recordAgencyPolicyBound(
  tenantId: string,
  policyId: string,
  metadata?: Record<string, any>
): Promise<number | null> {
  return recordUsageEvent({
    tenantId,
    eventType: "AGENCY_POLICY_BOUND",
    referenceId: `agency-policy-${policyId}`,
    metadata: { ...metadata, policyId },
  });
}
