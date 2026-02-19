// @ts-nocheck
/**
 * KINGA Monetisation Metrics Service
 * 
 * Internal service for super-admin dashboard to monitor per-tenant usage
 * and calculate projected billing based on KINGA's pricing model.
 * 
 * NO INSURER VISIBILITY - Super-admin access only
 */

import { getDb } from "../db";
import { claims, auditTrail, tenants } from "../../drizzle/schema";
import { eq, and, gte, lte, sql, count, avg } from "drizzle-orm";

/**
 * Pricing model for KINGA services
 * These rates are used to calculate projected invoice values
 */
const PRICING_MODEL = {
  // Per-claim pricing
  aiOnlyAssessment: 15.00,        // AI assessment without human review
  hybridAssessment: 35.00,        // AI + human assessor review
  fastTrackClaim: 5.00,           // Fast-track processing bonus
  
  // Premium features
  premiumToolUsage: 10.00,        // Per use of premium assessor tools
  
  // Volume discounts (applied automatically)
  volumeDiscounts: [
    { threshold: 1000, discount: 0.10 },  // 10% off for 1000+ claims/month
    { threshold: 5000, discount: 0.20 },  // 20% off for 5000+ claims/month
    { threshold: 10000, discount: 0.25 }, // 25% off for 10000+ claims/month
  ],
};

export interface TenantMonetizationMetrics {
  tenantId: string;
  tenantName: string;
  period: {
    startDate: Date;
    endDate: Date;
  };
  
  // Core metrics
  claimsProcessed: number;
  aiOnlyAssessments: number;
  hybridAssessments: number;
  fastTrackedClaims: number;
  
  // Performance metrics
  avgProcessingTimeReduction: number; // in hours
  premiumToolUsageCount: number;
  
  // Confidence distribution
  confidenceDistribution: {
    high: number;    // 80-100%
    medium: number;  // 50-79%
    low: number;     // 0-49%
  };
  
  // Billing projection
  projectedInvoice: {
    aiOnlyRevenue: number;
    hybridRevenue: number;
    fastTrackRevenue: number;
    premiumToolRevenue: number;
    subtotal: number;
    volumeDiscount: number;
    total: number;
  };
  
  // Month-over-month comparison
  momComparison?: {
    claimsProcessedChange: number;      // percentage
    revenueChange: number;              // percentage
    avgProcessingTimeChange: number;    // percentage
  };
}

/**
 * Calculate month-over-month comparison
 */
async function calculateMoMComparison(
  tenantId: string,
  currentMetrics: TenantMonetizationMetrics,
  currentStartDate: Date,
  currentEndDate: Date
): Promise<TenantMonetizationMetrics["momComparison"]> {
  // Calculate previous period dates
  const periodLength = currentEndDate.getTime() - currentStartDate.getTime();
  const previousEndDate = new Date(currentStartDate.getTime() - 1);
  const previousStartDate = new Date(previousEndDate.getTime() - periodLength);
  
  // Get previous period metrics
  const previousMetrics = await getTenantMetrics(tenantId, previousStartDate, previousEndDate);
  
  if (!previousMetrics || previousMetrics.claimsProcessed === 0) {
    return undefined; // No previous data for comparison
  }
  
  return {
    claimsProcessedChange: calculatePercentageChange(
      previousMetrics.claimsProcessed,
      currentMetrics.claimsProcessed
    ),
    revenueChange: calculatePercentageChange(
      previousMetrics.projectedInvoice.total,
      currentMetrics.projectedInvoice.total
    ),
    avgProcessingTimeChange: calculatePercentageChange(
      previousMetrics.avgProcessingTimeReduction,
      currentMetrics.avgProcessingTimeReduction
    ),
  };
}

/**
 * Helper: Calculate percentage change
 */
function calculatePercentageChange(oldValue: number, newValue: number): number {
  if (oldValue === 0) return newValue > 0 ? 100 : 0;
  return ((newValue - oldValue) / oldValue) * 100;
}

/**
 * Calculate volume discount based on claims processed
 */
function calculateVolumeDiscount(claimsProcessed: number, subtotal: number): number {
  let discountRate = 0;
  
  for (const tier of PRICING_MODEL.volumeDiscounts) {
    if (claimsProcessed >= tier.threshold) {
      discountRate = tier.discount;
    }
  }
  
  return subtotal * discountRate;
}

/**
 * Get monetization metrics for a specific tenant and time period
 */
export async function getTenantMetrics(
  tenantId: string,
  startDate: Date,
  endDate: Date
): Promise<TenantMonetizationMetrics | null> {
  // Get tenant info
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const tenant = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  
  if (!tenant.length) {
    return null;
  }
  
  // Get all claims for tenant in period
  const tenantClaims = await db
    .select()
    .from(claims)
    .where(
      and(
        eq(claims.tenantId, tenantId),
        gte(claims.createdAt, startDate),
        lte(claims.createdAt, endDate)
      )
    );
  
  const claimsProcessed = tenantClaims.length;
  
  if (claimsProcessed === 0) {
    // Return zero metrics if no claims
    return {
      tenantId,
      tenantName: tenant[0].name,
      period: { startDate, endDate },
      claimsProcessed: 0,
      aiOnlyAssessments: 0,
      hybridAssessments: 0,
      fastTrackedClaims: 0,
      avgProcessingTimeReduction: 0,
      premiumToolUsageCount: 0,
      confidenceDistribution: { high: 0, medium: 0, low: 0 },
      projectedInvoice: {
        aiOnlyRevenue: 0,
        hybridRevenue: 0,
        fastTrackRevenue: 0,
        premiumToolRevenue: 0,
        subtotal: 0,
        volumeDiscount: 0,
        total: 0,
      },
    };
  }
  
  // Calculate AI-only vs Hybrid assessments
  // AI-only: claims that went through AI but no human assessor review
  // Hybrid: claims that had both AI and human assessor review
  let aiOnlyAssessments = 0;
  let hybridAssessments = 0;
  let fastTrackedClaims = 0;
  let totalProcessingTimeReduction = 0;
  let premiumToolUsageCount = 0;
  
  const confidenceDistribution = { high: 0, medium: 0, low: 0 };
  
  for (const claim of tenantClaims) {
    // Get audit trail for this claim
    const claimAudit = await db
      .select()
      .from(auditTrail)
      .where(eq(auditTrail.claimId, claim.id));
    
    // Check if claim had human assessor review
    // Look for assessment_completed action with userId (not system/AI)
    const hasHumanReview = claimAudit.some(
      (entry: typeof auditTrail.$inferSelect) =>
        entry.action === "assessment_completed" &&
        entry.userId > 0 // Human user ID
    );
    
    if (hasHumanReview) {
      hybridAssessments++;
    } else {
      aiOnlyAssessments++;
    }
    
    // Check if claim was fast-tracked
    const wasFastTracked = claimAudit.some(
      (entry: typeof auditTrail.$inferSelect) => 
        entry.action === "fast_track_approved" ||
        entry.action === "auto_approved" ||
        (entry.newValue && entry.newValue.includes('"fastTrack":true'))
    );
    
    if (wasFastTracked) {
      fastTrackedClaims++;
    }
    
    // Calculate processing time reduction
    // Compare AI processing time vs estimated manual processing time
    const aiProcessingTime = claimAudit.find(
      (entry: typeof auditTrail.$inferSelect) => entry.action === "ai_assessment_completed"
    );
    
    if (aiProcessingTime && aiProcessingTime.newValue) {
      try {
        const metadata = JSON.parse(aiProcessingTime.newValue);
        if (metadata.processingTimeMs) {
          const aiTimeHours = metadata.processingTimeMs / (1000 * 60 * 60);
          const estimatedManualTimeHours = 4; // Assume 4 hours for manual assessment
          const timeReduction = estimatedManualTimeHours - aiTimeHours;
          totalProcessingTimeReduction += Math.max(0, timeReduction);
        }
      } catch {
        // Ignore JSON parse errors
      }
    }
    
    // Count premium tool usage
    const premiumToolUsage = claimAudit.filter(
      (entry: typeof auditTrail.$inferSelect) => {
        if (!entry.newValue) return false;
        try {
          const metadata = JSON.parse(entry.newValue);
          return metadata.premiumToolUsed === true;
        } catch {
          return false;
        }
      }
    );
    premiumToolUsageCount += premiumToolUsage.length;
    
    // Categorize confidence score
    // Get confidence from AI assessment if available
    const aiAssessment = claimAudit.find(
      (entry: typeof auditTrail.$inferSelect) => entry.action === "ai_assessment_completed"
    );
    
    let confidenceScore = 0;
    if (aiAssessment && aiAssessment.newValue) {
      try {
        const metadata = JSON.parse(aiAssessment.newValue);
        confidenceScore = metadata.confidenceScore || metadata.confidence || 0;
      } catch {
        // Ignore JSON parse errors
      }
    }
    
    if (confidenceScore >= 80) {
      confidenceDistribution.high++;
    } else if (confidenceScore >= 50) {
      confidenceDistribution.medium++;
    } else {
      confidenceDistribution.low++;
    }
  }
  
  const avgProcessingTimeReduction =
    claimsProcessed > 0 ? totalProcessingTimeReduction / claimsProcessed : 0;
  
  // Calculate projected invoice
  const aiOnlyRevenue = aiOnlyAssessments * PRICING_MODEL.aiOnlyAssessment;
  const hybridRevenue = hybridAssessments * PRICING_MODEL.hybridAssessment;
  const fastTrackRevenue = fastTrackedClaims * PRICING_MODEL.fastTrackClaim;
  const premiumToolRevenue = premiumToolUsageCount * PRICING_MODEL.premiumToolUsage;
  
  const subtotal = aiOnlyRevenue + hybridRevenue + fastTrackRevenue + premiumToolRevenue;
  const volumeDiscount = calculateVolumeDiscount(claimsProcessed, subtotal);
  const total = subtotal - volumeDiscount;
  
  const metrics: TenantMonetizationMetrics = {
    tenantId,
    tenantName: tenant[0].name,
    period: { startDate, endDate },
    claimsProcessed,
    aiOnlyAssessments,
    hybridAssessments,
    fastTrackedClaims,
    avgProcessingTimeReduction,
    premiumToolUsageCount,
    confidenceDistribution,
    projectedInvoice: {
      aiOnlyRevenue,
      hybridRevenue,
      fastTrackRevenue,
      premiumToolRevenue,
      subtotal,
      volumeDiscount,
      total,
    },
  };
  
  // Add MoM comparison
  metrics.momComparison = await calculateMoMComparison(
    tenantId,
    metrics,
    startDate,
    endDate
  );
  
  return metrics;
}

/**
 * Get monetization metrics for all tenants
 */
export async function getAllTenantsMetrics(
  startDate: Date,
  endDate: Date
): Promise<TenantMonetizationMetrics[]> {
  // Get all tenants
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const allTenants = await db.select().from(tenants);
  
  const metricsPromises = allTenants.map((tenant: typeof tenants.$inferSelect) =>
    getTenantMetrics(tenant.id, startDate, endDate)
  );
  
  const results = await Promise.all(metricsPromises);
  
  // Filter out null results and sort by revenue (descending)
  return results
    .filter((m): m is TenantMonetizationMetrics => m !== null)
    .sort((a: TenantMonetizationMetrics, b: TenantMonetizationMetrics) => b.projectedInvoice.total - a.projectedInvoice.total);
}

/**
 * Get aggregate metrics across all tenants
 */
export async function getAggregateMetrics(
  startDate: Date,
  endDate: Date
): Promise<{
  totalTenants: number;
  totalClaims: number;
  totalRevenue: number;
  avgRevenuePerTenant: number;
  topTenants: TenantMonetizationMetrics[];
}> {
  const allMetrics = await getAllTenantsMetrics(startDate, endDate);
  
  const totalTenants = allMetrics.length;
  const totalClaims = allMetrics.reduce((sum: number, m: TenantMonetizationMetrics) => sum + m.claimsProcessed, 0);
  const totalRevenue = allMetrics.reduce((sum: number, m: TenantMonetizationMetrics) => sum + m.projectedInvoice.total, 0);
  const avgRevenuePerTenant = totalTenants > 0 ? totalRevenue / totalTenants : 0;
  
  // Get top 10 tenants by revenue
  const topTenants = allMetrics.slice(0, 10);
  
  return {
    totalTenants,
    totalClaims,
    totalRevenue,
    avgRevenuePerTenant,
    topTenants,
  };
}
