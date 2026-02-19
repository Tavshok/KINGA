// @ts-nocheck
/**
 * Workload Balancing Service
 * 
 * Implements weighted workload scoring algorithm for fair processor assignment.
 * 
 * Scoring Weights:
 * - Active claims (assigned, ai_assessment_pending, manual_review): 1.0
 * - Complex claims (estimatedClaimValue > $20,000): 1.5
 * - High-risk claims (earlyFraudSuspicion = true): 2.0
 * 
 * The processor with the lowest weighted workload score is selected for assignment.
 */

import { getDb } from "./db";
import { claims, users } from "../drizzle/schema";
import { eq, and, sql } from "drizzle-orm";

/**
 * Complexity threshold for claims (in currency units)
 */
const COMPLEX_CLAIM_THRESHOLD = 20000;

/**
 * Workload weights for different claim types
 */
export const WORKLOAD_WEIGHTS = {
  ACTIVE_CLAIM: 1.0,
  COMPLEX_CLAIM: 1.5,
  HIGH_RISK_CLAIM: 2.0,
} as const;

/**
 * Processor workload score breakdown
 */
export interface ProcessorWorkload {
  processorId: string;
  processorName: string;
  activeClaims: number;
  complexClaims: number;
  highRiskClaims: number;
  weightedScore: number;
}

/**
 * Calculate weighted workload score for a processor
 * 
 * @param tenantId - Tenant ID for isolation
 * @param processorId - Processor's openId
 * @returns Workload breakdown and weighted score
 */
export async function calculateProcessorWorkloadScore(
  tenantId: string,
  processorId: string
): Promise<ProcessorWorkload | null> {
  const db = await getDb();
  if (!db) {
    console.error("[Workload Balancing] Database not available");
    return null;
  }

  // Get processor details
  const processor = await db
    .select({
      openId: users.openId,
      name: users.name,
    })
    .from(users)
    .where(
      and(
        eq(users.openId, processorId),
        eq(users.tenantId, tenantId),
        eq(users.insurerRole, "claims_processor")
      )
    )
    .limit(1);

  if (processor.length === 0) {
    console.error(`[Workload Balancing] Processor ${processorId} not found for tenant ${tenantId}`);
    return null;
  }

  // Count active claims (assigned, ai_assessment_pending, manual_review)
  const activeClaimsResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(claims)
    .where(
      and(
        eq(claims.tenantId, tenantId),
        sql`${claims.assignedProcessorId} = ${processorId}`,
        sql`${claims.workflowState} IN ('assigned', 'ai_assessment_pending', 'manual_review')`
      )
    );

  const activeClaims = activeClaimsResult[0]?.count || 0;

  // Count complex claims (estimatedClaimValue > threshold)
  const complexClaimsResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(claims)
    .where(
      and(
        eq(claims.tenantId, tenantId),
        sql`${claims.assignedProcessorId} = ${processorId}`,
        sql`${claims.workflowState} IN ('assigned', 'ai_assessment_pending', 'manual_review')`,
        sql`${claims.estimatedClaimValue} > ${COMPLEX_CLAIM_THRESHOLD}`
      )
    );

  const complexClaims = complexClaimsResult[0]?.count || 0;

  // Count high-risk claims (earlyFraudSuspicion = true)
  const highRiskClaimsResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(claims)
    .where(
      and(
        eq(claims.tenantId, tenantId),
        sql`${claims.assignedProcessorId} = ${processorId}`,
        sql`${claims.workflowState} IN ('assigned', 'ai_assessment_pending', 'manual_review')`,
        eq(claims.earlyFraudSuspicion, 1) // MySQL TINYINT: 1 = true
      )
    );

  const highRiskClaims = highRiskClaimsResult[0]?.count || 0;

  // Calculate weighted score
  const weightedScore =
    activeClaims * WORKLOAD_WEIGHTS.ACTIVE_CLAIM +
    complexClaims * WORKLOAD_WEIGHTS.COMPLEX_CLAIM +
    highRiskClaims * WORKLOAD_WEIGHTS.HIGH_RISK_CLAIM;

  return {
    processorId,
    processorName: processor[0].name || "Unknown Processor",
    activeClaims,
    complexClaims,
    highRiskClaims,
    weightedScore,
  };
}

/**
 * Find the processor with the lowest weighted workload score
 * 
 * @param tenantId - Tenant ID for isolation
 * @returns Processor with lowest workload score, or null if none available
 */
export async function findLowestWorkloadProcessor(
  tenantId: string
): Promise<ProcessorWorkload | null> {
  const db = await getDb();
  if (!db) {
    console.error("[Workload Balancing] Database not available");
    return null;
  }

  // Get all claims_processor users for tenant
  const processors = await db
    .select({
      openId: users.openId,
      name: users.name,
    })
    .from(users)
    .where(
      and(
        eq(users.tenantId, tenantId),
        eq(users.insurerRole, "claims_processor")
      )
    );

  if (processors.length === 0) {
    console.error(`[Workload Balancing] No processors found for tenant ${tenantId}`);
    return null;
  }

  // Calculate workload scores for all processors
  const workloads = await Promise.all(
    processors.map((processor) =>
      calculateProcessorWorkloadScore(tenantId, processor.openId)
    )
  );

  // Filter out null results (failed calculations)
  const validWorkloads = workloads.filter((w): w is ProcessorWorkload => w !== null);

  if (validWorkloads.length === 0) {
    console.error(`[Workload Balancing] Failed to calculate workload for any processor in tenant ${tenantId}`);
    return null;
  }

  // Sort by weighted score (ascending) and return the lowest
  validWorkloads.sort((a, b) => a.weightedScore - b.weightedScore);

  const selected = validWorkloads[0];
  console.log(
    `[Workload Balancing] Selected processor ${selected.processorName} (score: ${selected.weightedScore}, ` +
    `active: ${selected.activeClaims}, complex: ${selected.complexClaims}, high-risk: ${selected.highRiskClaims})`
  );

  return selected;
}

/**
 * Get workload scores for all processors in a tenant (for monitoring/analytics)
 * 
 * @param tenantId - Tenant ID for isolation
 * @returns Array of processor workload scores
 */
export async function getAllProcessorWorkloads(
  tenantId: string
): Promise<ProcessorWorkload[]> {
  const db = await getDb();
  if (!db) {
    console.error("[Workload Balancing] Database not available");
    return [];
  }

  // Get all claims_processor users for tenant
  const processors = await db
    .select({
      openId: users.openId,
      name: users.name,
    })
    .from(users)
    .where(
      and(
        eq(users.tenantId, tenantId),
        eq(users.insurerRole, "claims_processor")
      )
    );

  // Calculate workload scores for all processors
  const workloads = await Promise.all(
    processors.map((processor) =>
      calculateProcessorWorkloadScore(tenantId, processor.openId)
    )
  );

  // Filter out null results and sort by weighted score
  const validWorkloads = workloads.filter((w): w is ProcessorWorkload => w !== null);
  validWorkloads.sort((a, b) => a.weightedScore - b.weightedScore);

  return validWorkloads;
}
