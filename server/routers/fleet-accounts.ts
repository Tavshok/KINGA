/**
 * Fleet Accounts Router
 *
 * Standalone SaaS fleet management — decoupled from insurer tenant scope.
 * Any authenticated user can create and manage their own fleet account.
 * Optional linking to an insurer tenant or agency for insurance funnel.
 *
 * Routes: /fleet/* (frontend)
 * tRPC: trpc.fleetAccounts.*
 */
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getDb } from "../db";
import { fleetAccounts } from "../../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";

// ─── Helpers ────────────────────────────────────────────────────────────────

function generateAccountCode(): string {
  const prefix = "FLT";
  const suffix = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `${prefix}-${suffix}`;
}

// ─── Router ─────────────────────────────────────────────────────────────────

export const fleetAccountsRouter = router({
  /**
   * Create a new standalone fleet account.
   * Any authenticated user can create a fleet account — no tenant required.
   */
  createAccount: protectedProcedure
    .input(z.object({
      accountName: z.string().min(2).max(255),
      notes: z.string().max(1000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const accountCode = generateAccountCode();
      const now = new Date().toISOString().slice(0, 19).replace("T", " ");

      const insertResult = await db.insert(fleetAccounts).values({
        ownerUserId: ctx.user.id,
        accountName: input.accountName,
        accountCode,
        status: "active",
        subscriptionTier: "free",
        vehicleCount: 0,
        notes: input.notes ?? null,
        createdAt: now,
        updatedAt: now,
      } as any);
      const newId = (insertResult as any).insertId as number;

      console.log(`[FleetAccounts] Created account: id=${newId} code=${accountCode} owner=${ctx.user.id}`);
      return { id: newId, accountCode };
    }),

  /**
   * List all fleet accounts owned by the current user.
   */
  listMyAccounts: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(20),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const rows = await db
        .select()
        .from(fleetAccounts)
        .where(eq(fleetAccounts.ownerUserId, ctx.user.id))
        .orderBy(desc(fleetAccounts.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      return { accounts: rows, total: rows.length };
    }),

  /**
   * Get a single fleet account by ID (owner only).
   */
  getAccount: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const [account] = await db
        .select()
        .from(fleetAccounts)
        .where(and(eq(fleetAccounts.id, input.id), eq(fleetAccounts.ownerUserId, ctx.user.id)));

      if (!account) throw new TRPCError({ code: "NOT_FOUND", message: "Fleet account not found" });
      return account;
    }),

  /**
   * Update fleet account details.
   */
  updateAccount: protectedProcedure
    .input(z.object({
      id: z.number(),
      accountName: z.string().min(2).max(255).optional(),
      notes: z.string().max(1000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const [existing] = await db
        .select({ id: fleetAccounts.id })
        .from(fleetAccounts)
        .where(and(eq(fleetAccounts.id, input.id), eq(fleetAccounts.ownerUserId, ctx.user.id)));

      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Fleet account not found or access denied" });

      const updates: Record<string, unknown> = { updatedAt: new Date().toISOString().slice(0, 19).replace("T", " ") };
      if (input.accountName !== undefined) updates.accountName = input.accountName;
      if (input.notes !== undefined) updates.notes = input.notes;

      await db.update(fleetAccounts).set(updates as any).where(eq(fleetAccounts.id, input.id));
      console.log(`[FleetAccounts] Updated account: id=${input.id}`);
      return { success: true };
    }),

  /**
   * Link a fleet account to an insurer tenant (optional).
   * Enables insurance funnel — insurer can see fleet vehicles and offer quotes.
   */
  linkToInsurer: protectedProcedure
    .input(z.object({
      accountId: z.number(),
      insurerTenantId: z.string().min(1).max(64),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const [existing] = await db
        .select({ id: fleetAccounts.id })
        .from(fleetAccounts)
        .where(and(eq(fleetAccounts.id, input.accountId), eq(fleetAccounts.ownerUserId, ctx.user.id)));

      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Fleet account not found or access denied" });

      await db.update(fleetAccounts)
        .set({ linkedInsurerTenantId: input.insurerTenantId, updatedAt: new Date().toISOString().slice(0, 19).replace("T", " ") } as any)
        .where(eq(fleetAccounts.id, input.accountId));

      console.log(`[FleetAccounts] Linked account ${input.accountId} to insurer ${input.insurerTenantId}`);
      return { success: true };
    }),

  /**
   * Link a fleet account to an agency (optional).
   * Enables broker funnel — agency can manage insurance on behalf of fleet.
   */
  linkToAgency: protectedProcedure
    .input(z.object({
      accountId: z.number(),
      agencyId: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const [existing] = await db
        .select({ id: fleetAccounts.id })
        .from(fleetAccounts)
        .where(and(eq(fleetAccounts.id, input.accountId), eq(fleetAccounts.ownerUserId, ctx.user.id)));

      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Fleet account not found or access denied" });

      await db.update(fleetAccounts)
        .set({ linkedAgencyId: input.agencyId, updatedAt: new Date().toISOString().slice(0, 19).replace("T", " ") } as any)
        .where(eq(fleetAccounts.id, input.accountId));

      console.log(`[FleetAccounts] Linked account ${input.accountId} to agency ${input.agencyId}`);
      return { success: true };
    }),

  /**
   * Unlink a fleet account from insurer and/or agency.
   */
  unlinkPartners: protectedProcedure
    .input(z.object({
      accountId: z.number(),
      unlinkInsurer: z.boolean().default(false),
      unlinkAgency: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const [existing] = await db
        .select({ id: fleetAccounts.id })
        .from(fleetAccounts)
        .where(and(eq(fleetAccounts.id, input.accountId), eq(fleetAccounts.ownerUserId, ctx.user.id)));

      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Fleet account not found or access denied" });

      const updates: Record<string, unknown> = { updatedAt: new Date().toISOString().slice(0, 19).replace("T", " ") };
      if (input.unlinkInsurer) updates.linkedInsurerTenantId = null;
      if (input.unlinkAgency) updates.linkedAgencyId = null;

      await db.update(fleetAccounts).set(updates as any).where(eq(fleetAccounts.id, input.accountId));
      console.log(`[FleetAccounts] Unlinked partners from account ${input.accountId}`);
      return { success: true };
    }),

  /**
   * Suspend or reactivate a fleet account.
   */
  setStatus: protectedProcedure
    .input(z.object({
      accountId: z.number(),
      status: z.enum(["active", "suspended"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const [existing
] = await db
        .select({ id: fleetAccounts.id })
        .from(fleetAccounts)
        .where(and(eq(fleetAccounts.id, input.accountId), eq(fleetAccounts.ownerUserId, ctx.user.id)));

      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Fleet account not found or access denied" });

      await db.update(fleetAccounts)
        .set({ status: input.status, updatedAt: new Date().toISOString().slice(0, 19).replace("T", " ") } as any)
        .where(eq(fleetAccounts.id, input.accountId));

      console.log(`[FleetAccounts] Set account ${input.accountId} status to ${input.status}`);
      return { success: true };
    }),
});
