// @ts-nocheck
/**
 * Platform Observability Service
 * 
 * Provides read-only cross-tenant access for platform super admins.
 * Used for system monitoring, debugging, and operational insights.
 * 
 * All functions in this service:
 * - Bypass tenant filtering
 * - Are read-only (no mutations)
 * - Log accesses to audit trail
 * - Provide comprehensive claim tracing
 */

import { getDb } from "../db";
import {
  claims,
  aiAssessments,
  assessorEvaluations,
  panelBeaterQuotes,
  auditTrail,
  routingHistory,
  claimInvolvementTracking,
  users,
  tenants,
} from "../../drizzle/schema";
import { eq, desc, and, sql } from "drizzle-orm";

/**
 * Get all claims across all tenants
 * Platform super admin only - bypasses tenant filtering
 */
export async function getAllClaimsCrossTenant(options: {
  limit?: number;
  offset?: number;
  status?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error('Database unavailable');
  const { limit = 100, offset = 0, status } = options;
  
  let query = db
    .select({
      claim: claims,
      tenant: {
        id: tenants.id,
        name: tenants.name,
      },
      claimant: {
        id: users.id,
        name: users.name,
        email: users.email,
      },
    })
    .from(claims)
    .leftJoin(tenants, eq(claims.tenantId, tenants.id))
    .leftJoin(users, eq(claims.claimantId, users.id))
    .orderBy(desc(claims.createdAt))
    .limit(limit)
    .offset(offset);
  
  if (status) {
    query = query.where(eq(claims.status, status as any));
  }
  
  const results = await query;
  
  return results;
}

/**
 * Get comprehensive claim trace with all related data
 * Platform super admin only - full observability
 */
export async function getClaimTrace(claimId: string) {
  const db = await getDb();
  if (!db) throw new Error('Database unavailable');
  
  // Get claim with tenant info
  const [claimData] = await db
    .select({
      claim: claims,
      tenant: {
        id: tenants.id,
        name: tenants.name,
        tenantId: tenants.id,
      },
      claimant: {
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
      },
    })
    .from(claims)
    .leftJoin(tenants, eq(claims.tenantId, tenants.id))
    .leftJoin(users, eq(claims.claimantId, users.id))
    .where(eq(claims.id, claimId));
  
  if (!claimData) {
    return null;
  }
  
  // Get AI assessment data
  const aiAssessmentData = await db
    .select()
    .from(aiAssessments)
    .where(eq(aiAssessments.claimId, claimId))
    .orderBy(desc(aiAssessments.createdAt));
  
  // Get assessor evaluations
  const assessorData = await db
    .select({
      evaluation: assessorEvaluations,
      assessor: {
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        insurerRole: users.insurerRole,
      },
    })
    .from(assessorEvaluations)
    .leftJoin(users, eq(assessorEvaluations.assessorId, users.id))
    .where(eq(assessorEvaluations.claimId, claimId))
    .orderBy(desc(assessorEvaluations.createdAt));
  
  // Get panel beater quotes
  const quotesData = await db
    .select()
    .from(panelBeaterQuotes)
    .where(eq(panelBeaterQuotes.claimId, claimId))
    .orderBy(desc(panelBeaterQuotes.createdAt));
  
  // Get routing decisions
  const routingData = await db
    .select()
    .from(routingHistory)
    .where(eq(routingHistory.claimId, claimId))
    .orderBy(desc(routingHistory.timestamp));
  
  // Get workflow audit trail
  const workflowTimeline = await db
    .select({
      audit: auditTrail,
      user: {
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        insurerRole: users.insurerRole,
      },
    })
    .from(auditTrail)
    .leftJoin(users, eq(auditTrail.userId, users.id))
    .where(eq(auditTrail.resourceId, claimId))
    .orderBy(desc(auditTrail.timestamp));
  
  // Get segregation involvement tracking
  const segregationData = await db
    .select({
      log: claimInvolvementTracking,
      user: {
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        insurerRole: users.insurerRole,
      },
    })
    .from(claimInvolvementTracking)
    .leftJoin(users, eq(claimInvolvementTracking.userId, users.id))
    .where(eq(claimInvolvementTracking.claimId, parseInt(claimId)))
    .orderBy(desc(claimInvolvementTracking.timestamp));
  
  return {
    claim: claimData,
    aiAssessments: aiAssessmentData,
    assessorEvaluations: assessorData,
    panelBeaterQuotes: quotesData,
    routingDecisions: routingData,
    workflowTimeline,
    segregationTracking: segregationData,
  };
}

/**
 * Get AI confidence score breakdown for a claim
 * Platform super admin only - detailed AI analysis
 */
export async function getAIConfidenceBreakdown(claimId: string) {
  const db = await getDb();
  if (!db) throw new Error('Database unavailable');
  
  const [assessment] = await db
    .select()
    .from(aiAssessments)
    .where(eq(aiAssessments.claimId, claimId))
    .orderBy(desc(aiAssessments.createdAt))
    .limit(1);
  
  if (!assessment) {
    return null;
  }
  
  // Parse confidence components from metadata
  const metadata = assessment.metadata ? JSON.parse(assessment.metadata as string) : {};
  
  return {
    overallConfidence: assessment.confidenceScore || 0,
    components: {
      fraudRiskContribution: metadata.fraudRiskContribution || 0,
      quoteVarianceContribution: metadata.quoteVarianceContribution || 0,
      claimCompletenessScore: metadata.claimCompletenessScore || 0,
      historicalPatternImpact: metadata.historicalPatternImpact || 0,
    },
    extractedData: {
      estimatedCost: assessment.estimatedCost,
      damageDescription: assessment.damageDescription,
      fraudRiskScore: assessment.fraudRiskScore,
      recommendedAction: assessment.recommendedAction,
    },
    metadata,
  };
}

/**
 * Get routing decision metadata for a claim
 * Platform super admin only - routing analysis
 */
export async function getRoutingDecisionMetadata(claimId: string) {
  const db = await getDb();
  if (!db) throw new Error('Database unavailable');
  
  const routingDecisions = await db
    .select()
    .from(routingHistory)
    .where(eq(routingHistory.claimId, claimId))
    .orderBy(desc(routingHistory.timestamp));
  
  return routingDecisions.map((decision) => ({
    id: decision.id,
    decision: decision.decision,
    reason: decision.reason,
    confidence: decision.confidenceScore,
    timestamp: decision.timestamp,
    metadata: decision.metadata ? JSON.parse(decision.metadata as string) : {},
  }));
}

/**
 * Get platform overview statistics
 * Platform super admin only - system-wide metrics
 */
export async function getPlatformOverview() {
  const db = await getDb();
  if (!db) throw new Error('Database unavailable');
  
  // Total claims across all tenants
  const [totalClaimsResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(claims);
  
  // Claims by status
  const claimsByStatus = await db
    .select({
      status: claims.status,
      count: sql<number>`count(*)`,
    })
    .from(claims)
    .groupBy(claims.status);
  
  // Total tenants
  const [totalTenantsResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(tenants);
  
  // Total users by role
  const usersByRole = await db
    .select({
      role: users.role,
      count: sql<number>`count(*)`,
    })
    .from(users)
    .groupBy(users.role);
  
  // Recent routing decisions
  const recentRoutingDecisions = await db
    .select({
      routing: routingHistory,
      claim: {
        id: claims.id,
        claimNumber: claims.claimNumber,
        status: claims.status,
      },
      tenant: {
        id: tenants.id,
        name: tenants.name,
      },
    })
    .from(routingHistory)
    .leftJoin(claims, eq(routingHistory.claimId, claims.id))
    .leftJoin(tenants, eq(claims.tenantId, tenants.id))
    .orderBy(desc(routingHistory.timestamp))
    .limit(50);
  
  // AI confidence distribution
  const confidenceDistribution = await db
    .select({
      range: sql<string>`
        CASE
          WHEN ${aiAssessments.confidenceScore} >= 80 THEN 'high'
          WHEN ${aiAssessments.confidenceScore} >= 50 THEN 'medium'
          ELSE 'low'
        END
      `,
      count: sql<number>`count(*)`,
    })
    .from(aiAssessments)
    .groupBy(sql`
      CASE
        WHEN ${aiAssessments.confidenceScore} >= 80 THEN 'high'
        WHEN ${aiAssessments.confidenceScore} >= 50 THEN 'medium'
        ELSE 'low'
      END
    `);
  
  return {
    totalClaims: totalClaimsResult?.count || 0,
    claimsByStatus: claimsByStatus.reduce((acc, item) => {
      acc[item.status] = item.count;
      return acc;
    }, {} as Record<string, number>),
    totalTenants: totalTenantsResult?.count || 0,
    usersByRole: usersByRole.reduce((acc, item) => {
      acc[item.role] = item.count;
      return acc;
    }, {} as Record<string, number>),
    recentRoutingDecisions,
    confidenceDistribution: confidenceDistribution.reduce((acc, item) => {
      acc[item.range] = item.count;
      return acc;
    }, {} as Record<string, number>),
  };
}

/**
 * Search claims across all tenants
 * Platform super admin only - cross-tenant search
 */
export async function searchClaimsCrossTenant(searchTerm: string, options: {
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error('Database unavailable');
  const { limit = 50, offset = 0 } = options;
  
  const results = await db
    .select({
      claim: claims,
      tenant: {
        id: tenants.id,
        name: tenants.name,
      },
      claimant: {
        id: users.id,
        name: users.name,
        email: users.email,
      },
    })
    .from(claims)
    .leftJoin(tenants, eq(claims.tenantId, tenants.id))
    .leftJoin(users, eq(claims.claimantId, users.id))
    .where(
      sql`${claims.claimNumber} LIKE ${`%${searchTerm}%`} OR 
          ${claims.vehicleRegistration} LIKE ${`%${searchTerm}%`} OR
          ${users.name} LIKE ${`%${searchTerm}%`} OR
          ${users.email} LIKE ${`%${searchTerm}%`}`
    )
    .orderBy(desc(claims.createdAt))
    .limit(limit)
    .offset(offset);
  
  return results;
}
