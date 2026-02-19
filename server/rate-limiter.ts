// @ts-nocheck
/**
 * Rate Limiter
 * 
 * Enforces rate limiting for AI rerun operations on a per-user, per-tenant, per-hour basis.
 * Thresholds are tenant-configurable via the `aiRerunLimitPerHour` field in the tenants table.
 * 
 * Features:
 * - Sliding window rate limiting (hourly windows)
 * - Tenant-specific thresholds
 * - Automatic cleanup of expired windows
 * - Graceful error handling
 */

import { getDb } from "./db";
import { rateLimitTracking, tenants } from "../drizzle/schema";
import { eq, and, gte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

/**
 * Check if user has exceeded rate limit for a specific action type
 * 
 * @param userId - User ID to check
 * @param tenantId - Tenant ID for isolation
 * @param actionType - Action type ('ai_rerun', 'confidence_recalc', 'routing_reevaluation')
 * @returns true if within limit, throws TRPCError if exceeded
 */
export async function checkRateLimit(
  userId: number,
  tenantId: string,
  actionType: string
): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

  // Get tenant's rate limit threshold
  const tenantRecords = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  if (tenantRecords.length === 0) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Tenant not found" });
  }

  const tenant = tenantRecords[0];
  const rateLimit = tenant.aiRerunLimitPerHour || 10; // Default 10 if not set

  // Calculate current hour window start (truncate to hour)
  const now = new Date();
  const windowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), 0, 0, 0);

  // Get current action count for this user/tenant/action/window
  const trackingRecords = await db
    .select()
    .from(rateLimitTracking)
    .where(
      and(
        eq(rateLimitTracking.userId, userId),
        eq(rateLimitTracking.tenantId, tenantId),
        eq(rateLimitTracking.actionType, actionType),
        eq(rateLimitTracking.windowStart, windowStart)
      )
    )
    .limit(1);

  const currentCount = trackingRecords.length > 0 ? trackingRecords[0].actionCount : 0;

  // Check if limit exceeded
  if (currentCount >= rateLimit) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: `Rate limit exceeded. Maximum ${rateLimit} ${actionType} operations per hour. Try again later.`,
    });
  }

  return true;
}

/**
 * Record a rate-limited action
 * 
 * Increments the action count for the current hour window.
 * Creates a new tracking record if one doesn't exist for this window.
 * 
 * @param userId - User ID performing the action
 * @param tenantId - Tenant ID for isolation
 * @param actionType - Action type ('ai_rerun', 'confidence_recalc', 'routing_reevaluation')
 */
export async function recordRateLimitAction(
  userId: number,
  tenantId: string,
  actionType: string
): Promise<void> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

  // Calculate current hour window start (truncate to hour)
  const now = new Date();
  const windowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), 0, 0, 0);

  // Check if tracking record exists for this window
  const trackingRecords = await db
    .select()
    .from(rateLimitTracking)
    .where(
      and(
        eq(rateLimitTracking.userId, userId),
        eq(rateLimitTracking.tenantId, tenantId),
        eq(rateLimitTracking.actionType, actionType),
        eq(rateLimitTracking.windowStart, windowStart)
      )
    )
    .limit(1);

  if (trackingRecords.length > 0) {
    // Increment existing record
    const record = trackingRecords[0];
    await db
      .update(rateLimitTracking)
      .set({
        actionCount: record.actionCount + 1,
        updatedAt: new Date(),
      })
      .where(eq(rateLimitTracking.id, record.id));
  } else {
    // Create new tracking record
    await db.insert(rateLimitTracking).values({
      userId,
      tenantId,
      actionType,
      windowStart,
      actionCount: 1,
    });
  }

  console.log(
    `[Rate Limiter] Recorded ${actionType} action for user ${userId} in tenant ${tenantId}, window ${windowStart.toISOString()}`
  );
}

/**
 * Clean up expired rate limit tracking records
 * 
 * Removes tracking records older than 24 hours to prevent table bloat.
 * Should be called periodically (e.g., daily cron job).
 */
export async function cleanupExpiredRateLimits(): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.error("[Rate Limiter] Database not available for cleanup");
    return;
  }

  // Calculate cutoff time (24 hours ago)
  const cutoffTime = new Date();
  cutoffTime.setHours(cutoffTime.getHours() - 24);

  try {
    // Delete records older than cutoff
    const result = await db
      .delete(rateLimitTracking)
      .where(gte(rateLimitTracking.windowStart, cutoffTime));

    console.log(`[Rate Limiter] Cleaned up expired rate limit records (cutoff: ${cutoffTime.toISOString()})`);
  } catch (error) {
    console.error("[Rate Limiter] Error during cleanup:", error);
  }
}

/**
 * Get current rate limit status for a user
 * 
 * Returns the current action count and remaining quota for the current hour window.
 * 
 * @param userId - User ID to check
 * @param tenantId - Tenant ID for isolation
 * @param actionType - Action type ('ai_rerun', 'confidence_recalc', 'routing_reevaluation')
 * @returns Object with current count, limit, and remaining quota
 */
export async function getRateLimitStatus(
  userId: number,
  tenantId: string,
  actionType: string
): Promise<{ currentCount: number; limit: number; remaining: number; windowStart: Date }> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

  // Get tenant's rate limit threshold
  const tenantRecords = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  if (tenantRecords.length === 0) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Tenant not found" });
  }

  const tenant = tenantRecords[0];
  const rateLimit = tenant.aiRerunLimitPerHour || 10;

  // Calculate current hour window start
  const now = new Date();
  const windowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), 0, 0, 0);

  // Get current action count
  const trackingRecords = await db
    .select()
    .from(rateLimitTracking)
    .where(
      and(
        eq(rateLimitTracking.userId, userId),
        eq(rateLimitTracking.tenantId, tenantId),
        eq(rateLimitTracking.actionType, actionType),
        eq(rateLimitTracking.windowStart, windowStart)
      )
    )
    .limit(1);

  const currentCount = trackingRecords.length > 0 ? trackingRecords[0].actionCount : 0;
  const remaining = Math.max(0, rateLimit - currentCount);

  return {
    currentCount,
    limit: rateLimit,
    remaining,
    windowStart,
  };
}
