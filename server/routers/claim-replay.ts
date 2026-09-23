
/**
 * Claim Replay tRPC Router
 * 
 * API endpoints for historical claim replay functionality.
 * Enables re-processing historical claims through current KINGA AI system.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { historicalClaims, historicalReplayResults } from "../../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";
import { getDb } from "../db";
import { replayHistoricalClaim } from "../services/claim-replay-comparison";
import { buildP0B1FraudDecisionHold } from "../evidence-governance/p0FraudDecisionHold";

// Middleware for replay operations (requires insurer_admin or executive role)
const replayProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new Error("Unauthorized: Authentication required");
  }
  
  const allowedRoles = ["insurer_admin", "executive", "claims_manager"];
  if (!ctx.user.insurerRole || !allowedRoles.includes(ctx.user.insurerRole)) {
    throw new Error(`Forbidden: Requires one of the following roles: ${allowedRoles.join(", ")}`);
  }
  if (!ctx.user.tenantId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "A tenant-scoped session is required" });
  }
  
  return next({ ctx });
});

async function requireTenantHistoricalClaim(historicalClaimId: number, tenantId: string) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
  const [claim] = await db
    .select({ id: historicalClaims.id })
    .from(historicalClaims)
    .where(and(eq(historicalClaims.id, historicalClaimId), eq(historicalClaims.tenantId, tenantId)))
    .limit(1);
  if (!claim) throw new TRPCError({ code: "NOT_FOUND", message: "Historical claim not found" });
}

function buildReplayP0B1Hold() {
  return buildP0B1FraudDecisionHold({
    status: "FRAUD_DECISION_WITHHELD" as const,
    replayAvailable: false,
    operation: "HISTORICAL_REPLAY_WITHHELD" as const,
  });
}

export const claimReplayRouter = router({
  /**
   * Replay a single historical claim
   */
  replayHistoricalClaim: replayProcedure
    .input(z.object({
      historicalClaimId: z.number().int().positive(),
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.user?.tenantId;
      if (!tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "A tenant-scoped session is required" });
      await requireTenantHistoricalClaim(input.historicalClaimId, tenantId);
      return buildReplayP0B1Hold();
    }),
  
  /**
   * Get replay results for a historical claim
   */
  getReplayResults: replayProcedure
    .input(z.object({
      historicalClaimId: z.number().int().positive(),
    }))
    .query(async ({ input, ctx }) => {
      const tenantId = ctx.user?.tenantId;
      if (!tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "A tenant-scoped session is required" });
      await requireTenantHistoricalClaim(input.historicalClaimId, tenantId);
      return buildReplayP0B1Hold();
    }),
  
  /**
   * Get latest replay result for a historical claim
   */
  getLatestReplayResult: replayProcedure
    .input(z.object({
      historicalClaimId: z.number().int().positive(),
    }))
    .query(async ({ input, ctx }) => {
      const tenantId = ctx.user?.tenantId;
      if (!tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "A tenant-scoped session is required" });
      await requireTenantHistoricalClaim(input.historicalClaimId, tenantId);
      return buildReplayP0B1Hold();
    }),
  
  /**
   * Get all replay results for tenant
   */
  getAllReplayResults: replayProcedure
    .input(z.object({
      limit: z.number().int().positive().optional().default(100),
      offset: z.number().int().nonnegative().optional().default(0),
    }))
    .query(() => buildReplayP0B1Hold()),
  
  /**
   * Get replay statistics for tenant
   */
  getReplayStatistics: replayProcedure
    .query(() => buildReplayP0B1Hold()),
  
  /**
   * Batch replay multiple historical claims
   */
  batchReplayHistoricalClaims: replayProcedure
    .input(z.object({
      historicalClaimIds: z.array(z.number().int().positive()).max(100), // Max 100 claims per batch
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.user?.tenantId;
      if (!tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "A tenant-scoped session is required" });
      for (const historicalClaimId of input.historicalClaimIds) {
        await requireTenantHistoricalClaim(historicalClaimId, tenantId);
      }
      return buildReplayP0B1Hold();
    }),
  
  /**
   * Get historical claims eligible for replay
   */
  getEligibleHistoricalClaims: replayProcedure
    .input(z.object({
      limit: z.number().int().positive().optional().default(100),
      offset: z.number().int().nonnegative().optional().default(0),
      onlyUnreplayed: z.boolean().optional().default(false),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      
      const whereClause = input.onlyUnreplayed
        ? and(eq(historicalClaims.tenantId, ctx.user!.tenantId!), eq(historicalClaims.replayMode, 0))
        : eq(historicalClaims.tenantId, ctx.user!.tenantId!);
      
      const claims = await db
        .select()
        .from(historicalClaims)
        .where(whereClause)
        .orderBy(desc(historicalClaims.createdAt))
        .limit(input.limit)
        .offset(input.offset);
      
      return claims;
    }),
});
