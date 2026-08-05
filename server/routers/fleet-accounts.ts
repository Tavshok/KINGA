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
import { fleetAccounts, claims, users, fleetManagerRequests } from "../../drizzle/schema";
import { eq, and, desc, or, ilike, sql } from "drizzle-orm";
import { notifyOwner } from "../_core/notification";
import { sendFleetManagerApprovedEmail, sendFleetManagerRejectedEmail, sendFleetManagerSubmittedEmail } from "../safe-email";
import { logRoleAssignment } from "../services/role-assignment-audit";

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
          estimatedCost: claims.estimatedCost,
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
   * Creates a pending fleet_manager_requests row for claims manager review.
   * Does NOT upgrade the user role yet — that happens on approval.
   * Safe to call multiple times; returns existing pending request if one exists.
   */
  registerAsFleetManager: protectedProcedure
    .input(z.object({
      companyName: z.string().min(2).max(255),
      companyReg: z.string().max(100).optional(),
      jobTitle: z.string().max(255).optional(),
      contactPhone: z.string().max(100).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const normalised = input.companyName.trim();
      const now = new Date().toISOString().slice(0, 19).replace("T", " ");
      // Check for an existing pending/approved request from this user
      const [existing] = await db
        .select({ id: fleetManagerRequests.id, status: fleetManagerRequests.status, fleetAccountId: fleetManagerRequests.fleetAccountId })
        .from(fleetManagerRequests)
        .where(eq(fleetManagerRequests.userId, ctx.user.id))
        .orderBy(desc(fleetManagerRequests.createdAt))
        .limit(1);
      if (existing && existing.status === "approved") {
        return { success: true, requestId: existing.id, status: "approved" as const, message: "Your fleet manager access is already approved." };
      }
      if (existing && existing.status === "pending") {
        return { success: true, requestId: existing.id, status: "pending" as const, message: "Your fleet manager registration is already pending approval." };
      }
      // Find or create the fleet account (without granting access yet)
      const [account] = await db
        .select({ id: fleetAccounts.id, accountName: fleetAccounts.accountName })
        .from(fleetAccounts)
        .where(sql`LOWER(${fleetAccounts.accountName}) = LOWER(${normalised})`)
        .limit(1);
      let fleetAccountId: number | null = null;
      if (account) {
        fleetAccountId = account.id;
      } else {
        // Auto-create fleet account in pending state
        const accountCode = `FLT-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
        const insertResult = await db.insert(fleetAccounts).values({
          ownerUserId: ctx.user.id,
          accountName: normalised,
          accountCode,
          status: "pending" as any,
          subscriptionTier: "free",
          vehicleCount: 0,
          verificationStatus: "pending" as any,
          notes: input.companyReg ? `Company Reg: ${input.companyReg}` : null,
          createdAt: now,
          updatedAt: now,
        } as any);
        fleetAccountId = (insertResult as any).insertId as number;
      }
      // Create the pending request row
      const reqResult = await db.insert(fleetManagerRequests).values({
        userId: ctx.user.id,
        fleetAccountId,
        companyName: normalised,
        companyReg: input.companyReg ?? null,
        jobTitle: input.jobTitle ?? null,
        contactPhone: input.contactPhone ?? null,
        status: "pending" as any,
        createdAt: now,
        updatedAt: now,
      } as any);
      const requestId = (reqResult as any).insertId as number;
      console.log(`[FleetAccounts] Fleet manager request created: requestId=${requestId} userId=${ctx.user.id} company=${normalised}`);
      // Notify the platform owner (claims manager) — non-blocking
      try {
        await notifyOwner({
          title: "New Fleet Manager Request",
          content: [
            `**${ctx.user.name ?? ctx.user.email ?? "A user"}** has requested fleet manager access for **${normalised}**.`,
            input.jobTitle ? `Role: ${input.jobTitle}` : null,
            input.contactPhone ? `Phone: ${input.contactPhone}` : null,
            input.companyReg ? `Company Reg: ${input.companyReg}` : null,
            `\nPlease review in **Claims Manager Dashboard → Fleet Approvals** tab.`,
          ].filter(Boolean).join("  \n"),
        });
      } catch (notifyErr) {
        // Non-blocking — log but do not fail the registration
        console.warn("[FleetAccounts] notifyOwner failed (non-blocking):", notifyErr);
      }
      // Send confirmation email to the claimant — non-blocking
      if (ctx.user.email) {
        sendFleetManagerSubmittedEmail({
          requestId,
          recipientUserId: ctx.user.id,
          recipientEmail: ctx.user.email,
          recipientName: ctx.user.name ?? ctx.user.email,
          companyName: normalised,
          jobTitle: input.jobTitle ?? null,
        }).catch((emailErr) =>
          console.warn("[FleetAccounts] Confirmation email failed (non-blocking):", emailErr)
        );
      }
      return {
        success: true,
        requestId,
        fleetAccountId,
        status: "pending" as const,
        message: `Your fleet manager registration for ${normalised} has been submitted and is awaiting approval from a claims manager.`,
      };
    }),
  /**
   * Get the current user's fleet manager registration status.
   * Used by FleetManagerDashboard to gate access.
   */
  getMyRegistrationStatus: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const [request] = await db
        .select({
          id: fleetManagerRequests.id,
          status: fleetManagerRequests.status,
          companyName: fleetManagerRequests.companyName,
          fleetAccountId: fleetManagerRequests.fleetAccountId,
          reviewNotes: fleetManagerRequests.reviewNotes,
          createdAt: fleetManagerRequests.createdAt,
          reviewedAt: fleetManagerRequests.reviewedAt,
        })
        .from(fleetManagerRequests)
        .where(eq(fleetManagerRequests.userId, ctx.user.id))
        .orderBy(desc(fleetManagerRequests.createdAt))
        .limit(1);
      if (!request) return { status: "none" as const, request: null };
      return { status: request.status as "pending" | "approved" | "rejected", request };
    }),
  /**
   * List all fleet manager requests (filtered by status).
   * Accessible by claims managers and insurer admins only.
   */
  listPendingRequests: protectedProcedure
    .input(z.object({
      status: z.enum(["pending", "approved", "rejected", "all"]).default("pending"),
      limit: z.number().min(1).max(100).default(50),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const allowedRoles = ["claims_manager", "insurer_admin", "admin"];
      const allowedInsurerRoles = ["claims_manager", "insurer_admin"];
      const isAllowed =
        allowedRoles.includes((ctx.user as any).role ?? "") ||
        allowedInsurerRoles.includes((ctx.user as any).insurerRole ?? "");
      if (!isAllowed) throw new TRPCError({ code: "FORBIDDEN", message: "Claims manager access required" });
      const conditions = input.status === "all"
        ? undefined
        : eq(fleetManagerRequests.status, input.status as any);
      const rows = await db
        .select({
          id: fleetManagerRequests.id,
          userId: fleetManagerRequests.userId,
          fleetAccountId: fleetManagerRequests.fleetAccountId,
          companyName: fleetManagerRequests.companyName,
          companyReg: fleetManagerRequests.companyReg,
          jobTitle: fleetManagerRequests.jobTitle,
          contactPhone: fleetManagerRequests.contactPhone,
          status: fleetManagerRequests.status,
          reviewNotes: fleetManagerRequests.reviewNotes,
          reviewedAt: fleetManagerRequests.reviewedAt,
          createdAt: fleetManagerRequests.createdAt,
          userName: users.name,
          userEmail: users.email,
        })
        .from(fleetManagerRequests)
        .leftJoin(users, eq(users.id, fleetManagerRequests.userId))
        .where(conditions)
        .orderBy(desc(fleetManagerRequests.createdAt))
        .limit(input.limit)
        .offset(input.offset);
      return { requests: rows, total: rows.length };
    }),
  /**
   * Approve a fleet manager registration request.
   * Upgrades the user role to fleet_manager and marks the fleet account as approved.
   */
  approveFleetManagerRequest: protectedProcedure
    .input(z.object({
      requestId: z.number(),
      notes: z.string().max(1000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const allowedRoles = ["claims_manager", "insurer_admin", "admin"];
      const allowedInsurerRoles = ["claims_manager", "insurer_admin"];
      const isAllowed =
        allowedRoles.includes((ctx.user as any).role ?? "") ||
        allowedInsurerRoles.includes((ctx.user as any).insurerRole ?? "");
      if (!isAllowed) throw new TRPCError({ code: "FORBIDDEN", message: "Claims manager access required" });
      const [request] = await db
        .select()
        .from(fleetManagerRequests)
        .where(eq(fleetManagerRequests.id, input.requestId))
        .limit(1);
      if (!request) throw new TRPCError({ code: "NOT_FOUND", message: "Request not found" });
      if (request.status !== "pending") {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Request is already ${request.status}` });
      }
      const now = new Date().toISOString().slice(0, 19).replace("T", " ");
      // 1. Mark request as approved
      await db.update(fleetManagerRequests)
        .set({ status: "approved" as any, reviewedByUserId: ctx.user.id, reviewedAt: now, reviewNotes: input.notes ?? null, updatedAt: now } as any)
        .where(eq(fleetManagerRequests.id, input.requestId));
      // 2. Upgrade user role to fleet_manager
      // Fetch previous role for audit trail before overwriting
      const [userBeforeUpgrade] = await db
        .select({ role: users.role, tenantId: users.tenantId })
        .from(users)
        .where(eq(users.id, request.userId))
        .limit(1);
      await db.update(users)
        .set({ role: "fleet_manager" as any, updatedAt: now } as any)
        .where(eq(users.id, request.userId));
      // 2a. Write immutable audit trail for the role upgrade (non-blocking — failure must not abort approval)
      try {
        if (userBeforeUpgrade) {
          await logRoleAssignment({
            tenantId: userBeforeUpgrade.tenantId ?? "platform",
            userId: request.userId,
            previousRole: (userBeforeUpgrade.role as any) ?? null,
            newRole: "fleet_manager",
            changedByUserId: ctx.user.id,
            justification: `Fleet manager request #${input.requestId} approved for company: ${request.companyName}. Approved by user id=${ctx.user.id}.`,
          });
        }
      } catch (auditErr) {
        console.warn("[FleetAccounts] Role audit write failed (non-blocking):", auditErr);
      }
      // 3. Mark fleet account as approved
      if (request.fleetAccountId) {
        await db.update(fleetAccounts)
          .set({ verificationStatus: "approved" as any, verifiedByUserId: ctx.user.id, verifiedAt: now, status: "active" as any, updatedAt: now } as any)
          .where(eq(fleetAccounts.id, request.fleetAccountId));
      }
      console.log(`[FleetAccounts] Request ${input.requestId} APPROVED by ${ctx.user.id}. User ${request.userId} upgraded to fleet_manager.`);
      // Notify the applicant — non-blocking
      try {
        const [applicant] = await db
          .select({ email: users.email, name: users.name })
          .from(users)
          .where(eq(users.id, request.userId))
          .limit(1);
        if (applicant?.email) {
          await sendFleetManagerApprovedEmail({
            requestId: input.requestId,
            recipientUserId: request.userId,
            recipientEmail: applicant.email,
            recipientName: applicant.name ?? "Fleet Manager",
            companyName: request.companyName,
          });
        }
      } catch (notifyErr) {
        console.warn("[FleetAccounts] Approval notification failed (non-blocking):", notifyErr);
      }
      return { success: true, message: `Fleet manager request approved. User granted fleet manager access for ${request.companyName}.` };
    }),
  /**
   * Reject a fleet manager registration request.
   */
  rejectFleetManagerRequest: protectedProcedure
    .input(z.object({
      requestId: z.number(),
      notes: z.string().min(1).max(1000),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const allowedRoles = ["claims_manager", "insurer_admin", "admin"];
      const allowedInsurerRoles = ["claims_manager", "insurer_admin"];
      const isAllowed =
        allowedRoles.includes((ctx.user as any).role ?? "") ||
        allowedInsurerRoles.includes((ctx.user as any).insurerRole ?? "");
      if (!isAllowed) throw new TRPCError({ code: "FORBIDDEN", message: "Claims manager access required" });
      const [request] = await db
        .select({ id: fleetManagerRequests.id, status: fleetManagerRequests.status, userId: fleetManagerRequests.userId, companyName: fleetManagerRequests.companyName, fleetAccountId: fleetManagerRequests.fleetAccountId })
        .from(fleetManagerRequests)
        .where(eq(fleetManagerRequests.id, input.requestId))
        .limit(1);
      if (!request) throw new TRPCError({ code: "NOT_FOUND", message: "Request not found" });
      if (request.status !== "pending") {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Request is already ${request.status}` });
      }
      const now = new Date().toISOString().slice(0, 19).replace("T", " ");
      await db.update(fleetManagerRequests)
        .set({ status: "rejected" as any, reviewedByUserId: ctx.user.id, reviewedAt: now, reviewNotes: input.notes, updatedAt: now } as any)
        .where(eq(fleetManagerRequests.id, input.requestId));
      if (request.fleetAccountId) {
        await db.update(fleetAccounts)
          .set({ verificationStatus: "rejected" as any, updatedAt: now } as any)
          .where(eq(fleetAccounts.id, request.fleetAccountId));
      }
      console.log(`[FleetAccounts] Request ${input.requestId} REJECTED by ${ctx.user.id}.`);
      // Notify the applicant — non-blocking
      try {
        const [applicant] = await db
          .select({ email: users.email, name: users.name })
          .from(users)
          .where(eq(users.id, request.userId))
          .limit(1);
        if (applicant?.email) {
          await sendFleetManagerRejectedEmail({
            requestId: input.requestId,
            recipientUserId: request.userId,
            recipientEmail: applicant.email,
            recipientName: applicant.name ?? "Fleet Manager",
            companyName: request.companyName,
            reviewNotes: input.notes,
          });
        }
      } catch (notifyErr) {
        console.warn("[FleetAccounts] Rejection notification failed (non-blocking):", notifyErr);
      }
      return { success: true, message: `Fleet manager request for ${request.companyName} has been rejected.` };
    }),

  /**
   * Flag a claim for review by the Claims Manager.
   *
   * Lightweight governance action for fleet managers — does NOT change workflow state.
   * Writes an audit trail entry and notifies the insurer's Claims Manager.
   *
   * @requires fleet_manager or fleet_admin role
   */
  flagClaimForReview: protectedProcedure
    .input(z.object({
      claimId: z.number().int().positive(),
      reason: z.string().min(10, "Please provide at least 10 characters describing the concern.").max(500),
    }))
    .mutation(async ({ ctx, input }) => {
      const userRole = ctx.user.role;
      if (userRole !== "fleet_manager" && userRole !== "fleet_admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only fleet managers can flag claims for review." });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      // Verify the claim exists
      const [claim] = await db
        .select({ id: claims.id, claimNumber: claims.claimNumber, status: claims.status })
        .from(claims)
        .where(eq(claims.id, input.claimId))
        .limit(1);
      if (!claim) throw new TRPCError({ code: "NOT_FOUND", message: "Claim not found." });
      const terminalStates = ["closed", "rejected", "archived"];
      if (terminalStates.includes(claim.status ?? "")) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot flag a claim in a terminal state." });
      }
      // Write audit trail entry
      const { auditTrail } = await import("../../drizzle/schema");
      const now = new Date().toISOString().slice(0, 19).replace("T", " ");
      await db.insert(auditTrail).values({
        claimId: input.claimId,
        userId: ctx.user.id,
        action: "fleet_flagged_for_review",
        entityType: "claim",
        entityId: input.claimId,
        changeDescription: `Fleet manager flagged claim ${claim.claimNumber} for review: ${input.reason}`,
        createdAt: now,
      } as any);
      // Notify the owner (Claims Manager / insurer admin) — non-blocking
      try {
        await notifyOwner({
          title: `Fleet Flag: ${claim.claimNumber}`,
          content: `Fleet manager ${ctx.user.name ?? String(ctx.user.id)} flagged claim ${claim.claimNumber} for review.\n\nReason: ${input.reason}`,
        });
      } catch { /* non-fatal */ }
      console.log(`[FleetAccounts] Claim ${claim.claimNumber} flagged for review by fleet user ${ctx.user.id}.`);
      return { success: true, claimId: input.claimId, claimNumber: claim.claimNumber };
    }),

  /**
   * H-03: Get fraud-flagged vehicles in the fleet.
   * Joins fraud_alerts → claims → fleet_vehicles → vehicle_registry.
   * Returns vehicles with active fraud flags so the Fleet Manager can act.
   */
  getFraudFlaggedVehicles: protectedProcedure
    .input(z.object({
      fleetAccountId: z.number().int().positive().optional(),
      limit: z.number().int().min(1).max(50).default(20),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [];
      try {
        const { fraudAlerts, aiAssessments, fleetVehicles, vehicleRegistry } = await import('../../drizzle/schema');
        const { eq: eqD, desc: descD, and: andD, isNotNull } = await import('drizzle-orm');
        // Get fraud-flagged claims for this user's fleet vehicles
        const rows = await db
          .select({
            claimId: claims.id,
            claimNumber: claims.claimNumber,
            vehicleRegistration: claims.vehicleRegistration,
            vehicleMake: claims.vehicleMake,
            vehicleModel: claims.vehicleModel,
            vehicleYear: claims.vehicleYear,
            fraudScore: aiAssessments.fraudScore,
            claimStatus: claims.status,
            flaggedAt: fraudAlerts.createdAt,
            alertSeverity: fraudAlerts.alertSeverity,
            alertType: fraudAlerts.alertType,
          })
          .from(fraudAlerts)
          .innerJoin(claims, eqD(claims.id, fraudAlerts.claimId))
          .leftJoin(aiAssessments, eqD(aiAssessments.claimId, claims.id))
          .where(
            eqD(claims.claimantId, ctx.user.id)
          )
          .orderBy(descD(fraudAlerts.createdAt))
          .limit(input.limit);
        return rows;
      } catch (err) {
        console.error('[FleetAccounts] getFraudFlaggedVehicles error:', err);
        return [];
      }
    }),
});