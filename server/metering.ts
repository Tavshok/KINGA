/**
 * Silent Metering System
 * 
 * Tracks all billable activities across KINGA platform for monetisation.
 * Functions in this module silently record usage without user interaction.
 * 
 * Usage events tracked:
 * - Claims processed
 * - AI assessments triggered
 * - Documents ingested
 * - Executive analytics queries
 * - Governance checks
 * - Fleet vehicles managed
 * - Marketplace quote requests
 */

import { db } from "./db";
import { usageEvents } from "../drizzle/schema";

/**
 * Base compute unit costs for different event types
 * These are normalized units, not actual currency
 */
const COMPUTE_UNIT_COSTS = {
  CLAIM_PROCESSED: 1.0,
  AI_ASSESSMENT_TRIGGERED: 5.0, // AI processing is expensive
  DOCUMENT_INGESTED: 0.5,
  EXECUTIVE_ANALYTICS_QUERY: 2.0,
  GOVERNANCE_CHECK: 1.5,
  FLEET_VEHICLE_MANAGED: 0.3,
  MARKETPLACE_QUOTE_REQUEST: 1.0,
  AI_EVALUATED: 5.0,
  FAST_TRACK_TRIGGERED: 0.5,
  AUTO_APPROVED: 0.3,
  ASSESSOR_TOOL_USED: 1.0,
  FLEET_VEHICLE_ACTIVE: 0.2,
  AGENCY_POLICY_BOUND: 1.5,
} as const;

/**
 * Estimated cost per compute unit in cents
 * This can be adjusted based on actual infrastructure costs
 */
const COST_PER_COMPUTE_UNIT = 0.05; // 5 cents per unit

export type EventType = keyof typeof COMPUTE_UNIT_COSTS;

export interface MeteringEvent {
  tenantId: string;
  eventType: EventType;
  userId?: number;
  claimId?: number;
  resourceId?: string;
  resourceType?: string;
  quantity?: number;
  processingTimeMs?: number;
  metadata?: Record<string, any>;
}

/**
 * Record a usage event silently
 * 
 * This function is called throughout the application to track billable activities.
 * It runs asynchronously and does not block the main operation.
 */
export async function trackUsageEvent(event: MeteringEvent): Promise<void> {
  try {
    const computeUnits = COMPUTE_UNIT_COSTS[event.eventType] * (event.quantity || 1);
    const estimatedCost = computeUnits * COST_PER_COMPUTE_UNIT;

    await db.insert(usageEvents).values({
      tenantId: event.tenantId,
      eventType: event.eventType,
      userId: event.userId,
      claimId: event.claimId,
      resourceType: event.resourceType,
      referenceId: event.resourceId,
      quantity: event.quantity || 1,
      computeUnits: computeUnits.toFixed(4),
      processingTimeMs: event.processingTimeMs,
      estimatedCost: estimatedCost.toFixed(4),
      metadata: event.metadata ? JSON.stringify(event.metadata) : null,
      timestamp: new Date(),
    });
  } catch (error) {
    // Silent failure - don't block operations if metering fails
    console.error("Failed to track usage event:", error);
  }
}

/**
 * Track claim processing
 */
export async function trackClaimProcessed(params: {
  tenantId: string;
  claimId: number;
  userId?: number;
  processingTimeMs?: number;
}): Promise<void> {
  await trackUsageEvent({
    tenantId: params.tenantId,
    eventType: "CLAIM_PROCESSED",
    claimId: params.claimId,
    userId: params.userId,
    resourceType: "claim",
    resourceId: params.claimId.toString(),
    processingTimeMs: params.processingTimeMs,
  });
}

/**
 * Track AI assessment trigger
 */
export async function trackAIAssessment(params: {
  tenantId: string;
  claimId: number;
  userId?: number;
  processingTimeMs?: number;
  metadata?: Record<string, any>;
}): Promise<void> {
  await trackUsageEvent({
    tenantId: params.tenantId,
    eventType: "AI_ASSESSMENT_TRIGGERED",
    claimId: params.claimId,
    userId: params.userId,
    resourceType: "claim",
    resourceId: params.claimId.toString(),
    processingTimeMs: params.processingTimeMs,
    metadata: params.metadata,
  });
}

/**
 * Track document ingestion
 */
export async function trackDocumentIngested(params: {
  tenantId: string;
  documentId: string;
  userId?: number;
  documentType?: string;
  fileSizeBytes?: number;
}): Promise<void> {
  await trackUsageEvent({
    tenantId: params.tenantId,
    eventType: "DOCUMENT_INGESTED",
    userId: params.userId,
    resourceType: "document",
    resourceId: params.documentId,
    metadata: {
      documentType: params.documentType,
      fileSizeBytes: params.fileSizeBytes,
    },
  });
}

/**
 * Track executive analytics query
 */
export async function trackAnalyticsQuery(params: {
  tenantId: string;
  userId?: number;
  queryType: string;
  processingTimeMs?: number;
}): Promise<void> {
  await trackUsageEvent({
    tenantId: params.tenantId,
    eventType: "EXECUTIVE_ANALYTICS_QUERY",
    userId: params.userId,
    resourceType: "analytics",
    processingTimeMs: params.processingTimeMs,
    metadata: {
      queryType: params.queryType,
    },
  });
}

/**
 * Track governance check
 */
export async function trackGovernanceCheck(params: {
  tenantId: string;
  claimId?: number;
  userId?: number;
  checkType: string;
  result?: string;
}): Promise<void> {
  await trackUsageEvent({
    tenantId: params.tenantId,
    eventType: "GOVERNANCE_CHECK",
    claimId: params.claimId,
    userId: params.userId,
    resourceType: "governance",
    metadata: {
      checkType: params.checkType,
      result: params.result,
    },
  });
}

/**
 * Track fleet vehicle management
 */
export async function trackFleetVehicleManaged(params: {
  tenantId: string;
  vehicleId: number;
  userId?: number;
  action: string;
}): Promise<void> {
  await trackUsageEvent({
    tenantId: params.tenantId,
    eventType: "FLEET_VEHICLE_MANAGED",
    userId: params.userId,
    resourceType: "vehicle",
    resourceId: params.vehicleId.toString(),
    metadata: {
      action: params.action,
    },
  });
}

/**
 * Track marketplace quote request
 */
export async function trackMarketplaceQuoteRequest(params: {
  tenantId: string;
  requestId: string;
  userId?: number;
  serviceType?: string;
}): Promise<void> {
  await trackUsageEvent({
    tenantId: params.tenantId,
    eventType: "MARKETPLACE_QUOTE_REQUEST",
    userId: params.userId,
    resourceType: "quote_request",
    resourceId: params.requestId,
    metadata: {
      serviceType: params.serviceType,
    },
  });
}

/**
 * Get usage summary for a tenant in a date range
 */
export async function getTenantUsageSummary(params: {
  tenantId: string;
  startDate: Date;
  endDate: Date;
}): Promise<{
  totalEvents: number;
  totalComputeUnits: number;
  totalEstimatedCost: number;
  eventBreakdown: Record<string, number>;
}> {
  const events = await db.query.usageEvents.findMany({
    where: (events, { eq, and, gte, lte }) =>
      and(
        eq(events.tenantId, params.tenantId),
        gte(events.timestamp, params.startDate),
        lte(events.timestamp, params.endDate)
      ),
  });

  const eventBreakdown: Record<string, number> = {};
  let totalComputeUnits = 0;
  let totalEstimatedCost = 0;

  for (const event of events) {
    eventBreakdown[event.eventType] = (eventBreakdown[event.eventType] || 0) + (event.quantity || 1);
    totalComputeUnits += parseFloat(event.computeUnits || "0");
    totalEstimatedCost += parseFloat(event.estimatedCost || "0");
  }

  return {
    totalEvents: events.length,
    totalComputeUnits,
    totalEstimatedCost,
    eventBreakdown,
  };
}
