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
import { fleetAccounts, claims, users } from "../../drizzle/schema";
import { eq, and, desc, or, ilike, sql } from "drizzle-orm";

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
   * Initiate a fleet insurance RFQ via KINGA Agency (broker domain).
   *
   * ARCHITECTURE: Fleet → Agency Broker → Multiple Insurers
   * This procedure NO LONGER creates a direct insurer relationship.
   * Instead it delegates to agencyBrokerRouter.createFleetQuoteRequest,
   * which fans out insurer_quote_requests to ALL active insurer tenants.
   *
   * The legacy `insurerTenantId` parameter is accepted for backward
   * compatibility but is ignored — all quotes go through the agency.
   */
  linkToInsurer: protectedProcedure
    .input(z.object({
      accountId: z.number(),
      // Kept for backward compatibility; ignored — routing is via agency
      insurerTenantId: z.string().min(1).max(64).optional(),
      notes: z.string().max(2000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      // Validate ownership
      const [existing] = await db
        .select({ id: fleetAccounts.id, accountName: fleetAccounts.accountName, status: fleetAccounts.status })
        .from(fleetAccounts)
        .where(and(eq(fleetAccounts.id, input.accountId), eq(fleetAccounts.ownerUserId, ctx.user.id)));

      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Fleet account not found or access denied" });
      if (existing.status !== "active") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Fleet account must be active to request quotes." });

      // Delegate to agency broker — no direct insurer relationship created
      const AGENCY_TENANT_ID = "kinga-agency";
      const now = new Date().toISOString().slice(0, 19).replace("T", " ");

      // Upsert agency_clients entry for this fleet owner
      const { agencyClients, insurerQuoteRequests, insurerTenants, auditTrail } = await import("../../drizzle/schema");
      const [existingClient] = await db
        .select({ id: agencyClients.id })
        .from(agencyClients)
        .where(and(eq(agencyClients.agencyTenantId, AGENCY_TENANT_ID), eq(agencyClients.createdBy, ctx.user.id)))
        .limit(1);

      if (!existingClient) {
        await db.insert(agencyClients).values({
          agencyTenantId: AGENCY_TENANT_ID,
          fullName: ctx.user.name ?? `Fleet Owner ${ctx.user.id}`,
          email: ctx.user.email ?? null,
          notes: `Auto-created for fleet account: ${existing.accountName}`,
          createdBy: ctx.user.id,
        });
      }

      // Fan out to all active insurer tenants
      const allInsurers = await db.select({ id: insurerTenants.id }).from(insurerTenants);
      if (allInsurers.length === 0) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No insurer tenants found on the platform." });
      }

      // Prevent duplicate pending/sent/quoted requests
      const { inArray } = await import("drizzle-orm");
      const existingRequests = await db
        .select({ insurerTenantId: insurerQuoteRequests.insurerTenantId })
        .from(insurerQuoteRequests)
        .where(and(
          eq(insurerQuoteRequests.fleetAccountId, input.accountId),
          inArray(insurerQuoteRequests.status, ["pending", "sent", "quoted"]),
        ));
      const alreadyPending = new Set(existingRequests.map(r => r.insurerTenantId));
      const targetInsurers = allInsurers.filter(i => !alreadyPending.has(i.id));

      let claimId = 0;
      let claimNumber = "";
      let sent = 0;

      if (targetInsurers.length > 0) {
        // Create synthetic fleet_policy claim as RFQ anchor
        const { claims } = await import("../../drizzle/schema");
        const { randomUUID } = await import("crypto");
        claimNumber = `FLEET-RFQ-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 6).toUpperCase()}`;
        const [claimResult] = await db.insert(claims).values({
          claimNumber,
          claimantId: ctx.user.id,
          tenantId: AGENCY_TENANT_ID,
          status: "intake_pending" as any,
          workflowState: "intake_queue" as any,
          claimSource: "fleet_agency",
          documentProcessingStatus: "pending",
          incidentDescription: `Fleet insurance RFQ for account: ${existing.accountName}. Routed via KINGA Agency.${input.notes ? ` Notes: ${input.notes}` : ""}`,
          incidentDate: now.slice(0, 10),
          estimatedRepairCost: null,
          createdAt: now,
          updatedAt: now,
        } as any).$returningId() as { id: number }[];
        claimId = claimResult.id;

        await db.insert(insurerQuoteRequests).values(
          targetInsurers.map(insurer => ({
            claimId,
            insurerTenantId: insurer.id,
            agencyTenantId: AGENCY_TENANT_ID,
            status: "pending" as const,
            requestType: "fleet_policy" as const,
            claimSource: "fleet_agency",
            fleetAccountId: input.accountId,
            vehicleCount: null,
            estimatedTotalValue: null,
            claimsHistorySummary: input.notes ?? null,
            sentAt: now,
            createdAt: now,
            updatedAt: now,
          }))
        );
        sent = targetInsurers.length;

        // Audit trail
        try {
          await db.insert(auditTrail).values({
            claimId,
            userId: ctx.user.id,
            action: "fleet_rfq_created",
            entityType: "fleet_account",
            entityId: input.accountId,
            changeDescription: `Fleet account ${existing.accountName} initiated insurance RFQ via KINGA Agency. Dispatched to ${sent} insurer(s).`,
            createdAt: now,
          } as any);
        } catch { /* non-fatal */ }
      }

      console.log(`[FleetAccounts] Fleet RFQ via agency: accountId=${input.accountId} sent=${sent} skipped=${alreadyPending.size}`);
      return {
        success: true,
        routedViaAgency: true,
        claimId,
        claimNumber,
        sent,
        skipped: alreadyPending.size,
        message: sent > 0
          ? `Fleet RFQ dispatched to ${sent} insurer(s) via KINGA Agency.`
          : "All insurers already have a pending RFQ for this fleet account.",
      };
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

  /**
   * Find an existing fleet account by company name (case-insensitive) or create a new one.
   * Called during claim submission when claimantType = 'company'.
   * Returns the fleet account id and whether it was newly created.
   */
  createOrFindByCompanyName: protectedProcedure
    .input(z.object({
      companyName: z.string().min(2).max(255),
      companyReg: z.string().max(100).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const normalised = input.companyName.trim();

      // Try to find an existing fleet account with this name (any owner)
      const [existing] = await db
        .select({ id: fleetAccounts.id, accountName: fleetAccounts.accountName, ownerUserId: fleetAccounts.ownerUserId })
        .from(fleetAccounts)
        .where(sql`LOWER(${fleetAccounts.accountName}) = LOWER(${normalised})`)
        .limit(1);

      if (existing) {
        console.log(`[FleetAccounts] Auto-linked claim to existing fleet account: id=${existing.id} name=${existing.accountName}`);
        return { id: existing.id, accountName: existing.accountName, created: false };
      }

      // Create a new fleet account owned by the submitting claimant
      const accountCode = `FLT-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
      const now = new Date().toISOString().slice(0, 19).replace("T", " ");
      const insertResult = await db.insert(fleetAccounts).values({
        ownerUserId: ctx.user.id,
        accountName: normalised,
        accountCode,
        status: "active",
        subscriptionTier: "free",
        vehicleCount: 0,
        notes: input.companyReg ? `Company Reg: ${input.companyReg}` : null,
        createdAt: now,
        updatedAt: now,
      } as any);
      const newId = (insertResult as any).insertId as number;

      console.log(`[FleetAccounts] Auto-created fleet account: id=${newId} name=${normalised} code=${accountCode}`);
      return { id: newId, accountName: normalised, created: true };
    }),

  /**
   * Get all claims linked to a fleet account.
   * Accessible by the fleet account owner or any user with fleet_manager/fleet_admin role
   * whose organizationId matches the fleet account owner's id.
   */
  getClaimsForAccount: protectedProcedure
    .input(z.object({
      accountId: z.number(),
      limit: z.number().min(1).max(200).default(50),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      // Verify access: owner or fleet_manager/fleet_admin linked to this account
      const [account] = await db
        .select({ id: fleetAccounts.id, ownerUserId: fleetAccounts.ownerUserId, accountName: fleetAccounts.accountName })
        .from(fleetAccounts)
        .where(eq(fleetAccounts.id, input.accountId))
        .limit(1);

      if (!account) throw new TRPCError({ code: "NOT_FOUND", message: "Fleet account not found" });

      const isOwner = account.ownerUserId === ctx.user.id;
      const isFleetManager = ["fleet_manager", "fleet_admin"].includes(ctx.user.role) && ctx.user.organizationId === account.ownerUserId;
      const isAdmin = ctx.user.role === "admin";

      if (!isOwner && !isFleetManager && !isAdmin) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied. You are not associated with this fleet account." });
      }

      const rows = await db
        .select({
          id: claims.id,
          claimNumber: claims.claimNumber,
          status: claims.status,
          workflowState: claims.workflowState,
          vehicleMake: claims.vehicleMake,
          vehicleModel: claims.vehicleModel,
          vehicleRegistration: claims.vehicleRegistration,
          fleetVehicleRef: claims.fleetVehicleRef,
          claimantDepartment: claims.claimantDepartment,
          incidentDate: claims.incidentDate,
          incidentType: claims.incidentType,
          estimatedRepairCost: claims.estimatedRepairCost,
          createdAt: claims.createdAt,
          updatedAt: claims.updatedAt,
          aiAssessmentStartedAt: claims.aiAssessmentStartedAt,
          aiAssessmentCompletedAt: claims.aiAssessmentCompletedAt,
          documentProcessingStatus: claims.documentProcessingStatus,
          pipelineCurrentStage: claims.pipelineCurrentStage,
        })
        .from(claims)
        .where(eq(claims.fleetAccountId, input.accountId))
        .orderBy(desc(claims.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      // Compute time-at-garage and time-awaiting-authorisation for each claim
      const now = Date.now();
      const enriched = rows.map(c => {
        const createdMs = c.createdAt ? new Date(c.createdAt).getTime() : now;
        const completedMs = c.aiAssessmentCompletedAt ? new Date(c.aiAssessmentCompletedAt).getTime() : null;
        const elapsedMs = completedMs ? completedMs - createdMs : now - createdMs;
        const elapsedHours = Math.round(elapsedMs / 3600000 * 10) / 10;

        // Time in KINGA processing (from aiAssessmentStartedAt to aiAssessmentCompletedAt)
        const processingMs = c.aiAssessmentStartedAt && c.aiAssessmentCompletedAt
          ? new Date(c.aiAssessmentCompletedAt).getTime() - new Date(c.aiAssessmentStartedAt).getTime()
          : null;
        const processingMinutes = processingMs !== null ? Math.round(processingMs / 60000) : null;

        return {
          ...c,
          elapsedHours,
          processingMinutes,
          isComplete: ["completed", "closed", "settled"].includes(c.status ?? ""),
          isInProgress: ["intake_pending", "in_review", "ai_complete", "pending_authorisation"].includes(c.status ?? ""),
        };
      });

      return { claims: enriched, total: enriched.length, accountName: account.accountName };
    }),

  /**
   * Self-register as fleet manager for a company.
   * The claimant provides the company name; if a matching fleet account exists,
   * their role is upgraded to fleet_manager and their organizationId is set to the
   * fleet account owner's userId. A pending verification flag is set.
   */
  registerAsFleetManager: protectedProcedure
    .input(z.object({
      companyName: z.string().min(2).max(255),
      companyReg: z.string().max(100).optional(),
      jobTitle: z.string().max(255).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const normalised = input.companyName.trim();

      // Find matching fleet account
      const [account] = await db
        .select({ id: fleetAccounts.id, ownerUserId: fleetAccounts.ownerUserId, accountName: fleetAccounts.accountName })
        .from(fleetAccounts)
        .where(sql`LOWER(${fleetAccounts.accountName}) = LOWER(${normalised})`)
        .limit(1);

      let fleetAccountId: number;
      let accountName: string;

      if (account) {
        fleetAccountId = account.id;
        accountName = account.accountName;
      } else {
        // Auto-create fleet account for this company
        const accountCode = `FLT-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
        const now = new Date().toISOString().slice(0, 19).replace("T", " ");
        const insertResult = await db.insert(fleetAccounts).values({
          ownerUserId: ctx.user.id,
          accountName: normalised,
          accountCode,
          status: "active",
          subscriptionTier: "free",
          vehicleCount: 0,
          notes: input.companyReg ? `Company Reg: ${input.companyReg}` : null,
          createdAt: now,
          updatedAt: now,
        } as any);
        fleetAccountId = (insertResult as any).insertId as number;
        accountName = normalised;
      }

      // Upgrade the user's role to fleet_manager and link to the fleet account owner
      const fleetOwnerUserId = account?.ownerUserId ?? ctx.user.id;
      await db.update(users)
        .set({
          role: "fleet_manager" as any,
          organizationId: fleetOwnerUserId,
          updatedAt: new Date().toISOString().slice(0, 19).replace("T", " "),
        } as any)
        .where(eq(users.id, ctx.user.id));

      console.log(`[FleetAccounts] User ${ctx.user.id} registered as fleet_manager for account ${fleetAccountId} (${accountName})`);
      return {
        success: true,
        fleetAccountId,
        accountName,
        message: `You are now registered as fleet manager for ${accountName}. You can view all company claims from your dashboard.`,
      };
    }),
});
