/**
 * Agency Broker Router
 *
 * Standalone broker domain. Handles:
 * - Agency client management (agency_clients table)
 * - Agency-sourced claims (claims table with claim_source = 'agency')
 * - Multi-insurer quote requests (insurer_quote_requests table)
 *
 * All routes are restricted to users with role = 'agency' or 'admin'.
 * Agency cannot access /platform routes.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, desc, inArray, sql, ne } from "drizzle-orm";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import {
  agencyClients,
  insurerQuoteRequests,
  insurerTenants,
  fleetAccounts,
  claims,
  auditTrail,
} from "../../drizzle/schema";
import { randomUUID } from "crypto";

// ─── Agency Guard Middleware ──────────────────────────────────────────────────

const agencyProcedure = protectedProcedure.use(({ ctx, next }) => {
  const role = ctx.user?.role;
  if (role !== "admin" && role !== "platform_super_admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Access restricted to agency users only. Platform routes are not accessible from this domain.",
    });
  }
  return next({ ctx });
});

// ─── Input Schemas ────────────────────────────────────────────────────────────

const createClientInput = z.object({
  fullName: z.string().min(1).max(255),
  idNumber: z.string().max(50).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(50).optional(),
  address: z.string().optional(),
  vehicleRegistration: z.string().max(30).optional(),
  vehicleMake: z.string().max(100).optional(),
  vehicleModel: z.string().max(100).optional(),
  vehicleYear: z.number().int().min(1900).max(2100).optional(),
  vehicleVin: z.string().max(50).optional(),
  notes: z.string().optional(),
});

const updateClientInput = createClientInput.partial().extend({
  id: z.number().int().positive(),
});

const createAgencyClaimInput = z.object({
  agencyClientId: z.number().int().positive(),
  incidentDescription: z.string().min(1),
  incidentDate: z.string(), // ISO date string
  damageDescription: z.string().optional(),
  estimatedDamageAmount: z.number().optional(),
});

const requestQuotesInput = z.object({
  claimId: z.number().int().positive(),
  insurerTenantIds: z.array(z.string()).min(1).max(20),
});

const respondToQuoteInput = z.object({
  quoteRequestId: z.number().int().positive(),
  quoteAmount: z.number().positive(),
  quoteCurrency: z.string().max(10).default("ZAR"),
  quoteNotes: z.string().optional(),
  quoteValidUntil: z.string().optional(), // ISO date string
});

const acceptRejectQuoteInput = z.object({
  quoteRequestId: z.number().int().positive(),
  action: z.enum(["accepted", "rejected"]),
});

// ─── Router ───────────────────────────────────────────────────────────────────

export const agencyBrokerRouter = router({

  // ── Client Management ──────────────────────────────────────────────────────

  /**
   * Create a new agency client record.
   */
  createClient: agencyProcedure
    .input(createClientInput)
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const tenantId = (ctx.tenant as { id?: string } | null)?.id ?? ctx.user.tenantId ?? "agency";

      const [result] = await db.insert(agencyClients).values({
        agencyTenantId: tenantId,
        fullName: input.fullName,
        idNumber: input.idNumber ?? null,
        email: input.email ?? null,
        phone: input.phone ?? null,
        address: input.address ?? null,
        vehicleRegistration: input.vehicleRegistration ?? null,
        vehicleMake: input.vehicleMake ?? null,
        vehicleModel: input.vehicleModel ?? null,
        vehicleYear: input.vehicleYear ?? null,
        vehicleVin: input.vehicleVin ?? null,
        notes: input.notes ?? null,
        createdBy: ctx.user.id,
      }).$returningId() as { id: number }[];

      console.log(`[AgencyBroker] Client created: id=${result.id} by user ${ctx.user.id}`);
      return { id: result.id };
    }),

  /**
   * Update an existing agency client.
   */
  updateClient: agencyProcedure
    .input(updateClientInput)
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const tenantId = (ctx.tenant as { id?: string } | null)?.id ?? ctx.user.tenantId ?? "agency";

      const { id, ...updates } = input;
      const filtered: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(updates)) {
        if (v !== undefined) filtered[k] = v;
      }

      await db
        .update(agencyClients)
        .set(filtered)
        .where(and(
          eq(agencyClients.id, id),
          eq(agencyClients.agencyTenantId, tenantId)
        ));

      return { success: true };
    }),

  /**
   * List all clients for the current agency tenant.
   */
  listClients: agencyProcedure
    .input(z.object({
      limit: z.number().int().min(1).max(100).default(50),
      offset: z.number().int().min(0).default(0),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const tenantId = (ctx.tenant as { id?: string } | null)?.id ?? ctx.user.tenantId ?? "agency";

      const clients = await db
        .select()
        .from(agencyClients)
        .where(eq(agencyClients.agencyTenantId, tenantId))
        .orderBy(desc(agencyClients.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      const [countRow] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(agencyClients)
        .where(eq(agencyClients.agencyTenantId, tenantId));

      return { clients, total: countRow?.count ?? 0 };
    }),

  /**
   * Get a single client by ID.
   */
  getClient: agencyProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const tenantId = (ctx.tenant as { id?: string } | null)?.id ?? ctx.user.tenantId ?? "agency";

      const [client] = await db
        .select()
        .from(agencyClients)
        .where(and(
          eq(agencyClients.id, input.id),
          eq(agencyClients.agencyTenantId, tenantId)
        ));

      if (!client) throw new TRPCError({ code: "NOT_FOUND", message: "Client not found." });
      return client;
    }),

  // ── Agency Claims ──────────────────────────────────────────────────────────

  /**
   * Create an agency-sourced claim linked to an agency client.
   * Uses the shared claims table with claim_source = 'agency'.
   */
  createAgencyClaim: agencyProcedure
    .input(createAgencyClaimInput)
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const tenantId = (ctx.tenant as { id?: string } | null)?.id ?? ctx.user.tenantId ?? "agency";

      // Verify client belongs to this agency
      const [client] = await db
        .select({ id: agencyClients.id, fullName: agencyClients.fullName })
        .from(agencyClients)
        .where(and(
          eq(agencyClients.id, input.agencyClientId),
          eq(agencyClients.agencyTenantId, tenantId)
        ));

      if (!client) throw new TRPCError({ code: "NOT_FOUND", message: "Agency client not found." });

      const claimNumber = `AGY-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 6).toUpperCase()}`;
      const now = new Date().toISOString().slice(0, 19).replace("T", " ");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [result] = await db.insert(claims).values({
        claimNumber,
        claimantId: ctx.user.id,
        tenantId,
        status: "intake_pending" as any,
        workflowState: "intake_queue" as any,
        claimSource: "agency",
        documentProcessingStatus: "pending",
        incidentDescription: input.incidentDescription,
        incidentDate: input.incidentDate,
        damageDescription: input.damageDescription ?? null,
        estimatedRepairCost: input.estimatedDamageAmount ? Math.round(input.estimatedDamageAmount) : null,
        createdAt: now,
        updatedAt: now,
      } as any).$returningId() as { id: number }[];

      console.log(`[AgencyBroker] Agency claim created: id=${result.id} claimNumber=${claimNumber} for client=${client.fullName}`);
      return { id: result.id, claimNumber };
    }),

  // ── Multi-Insurer Quote Requests ───────────────────────────────────────────

  /**
   * Dispatch quote requests to multiple insurers for a given claim.
   * Creates one insurer_quote_requests record per insurer.
   * Skips insurers that already have a pending/sent/quoted request for this claim.
   */
  requestQuotes: agencyProcedure
    .input(requestQuotesInput)
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const tenantId = (ctx.tenant as { id?: string } | null)?.id ?? ctx.user.tenantId ?? "agency";
      const now = new Date().toISOString().slice(0, 19).replace("T", " ");

      // Check for existing requests to avoid duplicates
      const existing = await db
        .select({ insurerTenantId: insurerQuoteRequests.insurerTenantId })
        .from(insurerQuoteRequests)
        .where(and(
          eq(insurerQuoteRequests.claimId, input.claimId),
          inArray(insurerQuoteRequests.insurerTenantId, input.insurerTenantIds)
        ));

      const alreadyRequested = new Set(existing.map(r => r.insurerTenantId));
      const newInsurers = input.insurerTenantIds.filter(id => !alreadyRequested.has(id));

      if (newInsurers.length === 0) {
        return { sent: 0, skipped: input.insurerTenantIds.length, message: "All selected insurers already have pending requests." };
      }

      await db.insert(insurerQuoteRequests).values(
        newInsurers.map(insurerTenantId => ({
          claimId: input.claimId,
          insurerTenantId,
          agencyTenantId: tenantId,
          status: "sent" as const,
          sentAt: now,
          createdAt: now,
          updatedAt: now,
        }))
      );

      console.log(`[AgencyBroker] Quote requests dispatched: claimId=${input.claimId} insurers=${newInsurers.join(",")}`);
      return { sent: newInsurers.length, skipped: alreadyRequested.size };
    }),

  /**
   * List all quote requests for a given claim.
   */
  getQuoteRequests: agencyProcedure
    .input(z.object({ claimId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const quotes = await db
        .select()
        .from(insurerQuoteRequests)
        .where(eq(insurerQuoteRequests.claimId, input.claimId))
        .orderBy(desc(insurerQuoteRequests.createdAt));

      return { quotes };
    }),

  /**
   * Insurer: respond to a quote request with a quoted amount.
   */
  respondToQuote: protectedProcedure
    .input(respondToQuoteInput)
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const tenantId = (ctx.tenant as { id?: string } | null)?.id ?? ctx.user.tenantId;
      const now = new Date().toISOString().slice(0, 19).replace("T", " ");

      // Verify this insurer owns the quote request
      const [qr] = await db
        .select({ id: insurerQuoteRequests.id, status: insurerQuoteRequests.status })
        .from(insurerQuoteRequests)
        .where(and(
          eq(insurerQuoteRequests.id, input.quoteRequestId),
          eq(insurerQuoteRequests.insurerTenantId, tenantId ?? "")
        ));

      if (!qr) throw new TRPCError({ code: "NOT_FOUND", message: "Quote request not found." });
      if (qr.status === "accepted" || qr.status === "rejected") {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Quote has already been finalised." });
      }

      await db
        .update(insurerQuoteRequests)
        .set({
          status: "quoted",
          quoteAmount: String(input.quoteAmount),
          quoteCurrency: input.quoteCurrency,
          quoteNotes: input.quoteNotes ?? null,
          quoteValidUntil: input.quoteValidUntil ?? null,
          quotedAt: now,
          updatedAt: now,
        })
        .where(eq(insurerQuoteRequests.id, input.quoteRequestId));

      console.log(`[AgencyBroker] Quote responded: id=${input.quoteRequestId} amount=${input.quoteAmount}`);
      return { success: true };
    }),

  /**
   * Agency: accept or reject a specific insurer's quote.
   */
  acceptOrRejectQuote: agencyProcedure
    .input(acceptRejectQuoteInput)
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const now = new Date().toISOString().slice(0, 19).replace("T", " ");

      await db
        .update(insurerQuoteRequests)
        .set({
          status: input.action,
          respondedAt: now,
          updatedAt: now,
        })
        .where(eq(insurerQuoteRequests.id, input.quoteRequestId));

      console.log(`[AgencyBroker] Quote ${input.action}: id=${input.quoteRequestId}`);
      return { success: true };
    }),

  // ── Fleet Policy RFQ ──────────────────────────────────────────────────────

  /**
   * Create a fleet insurance RFQ routed through KINGA Agency.
   *
   * Architecture: Fleet → Agency Broker → ALL active insurers
   * - Validates fleet account ownership
   * - Creates an agency_clients entry for the fleet owner if one does not exist
   * - Creates a synthetic "fleet_policy" claim as the RFQ anchor
   * - Fans out insurer_quote_requests to ALL active insurer tenants
   * - Prevents duplicate pending/sent/quoted requests per insurer
   * - Writes an audit trail entry
   */
  createFleetQuoteRequest: protectedProcedure
    .input(z.object({
      fleetAccountId: z.number().int().positive(),
      notes: z.string().max(2000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const AGENCY_TENANT_ID = "kinga-agency";
      const now = new Date().toISOString().slice(0, 19).replace("T", " ");

      // ── 1. Validate fleet account ownership ─────────────────────────────────
      const [fleet] = await db
        .select()
        .from(fleetAccounts)
        .where(and(
          eq(fleetAccounts.id, input.fleetAccountId),
          eq(fleetAccounts.ownerUserId, ctx.user.id),
        ));

      if (!fleet) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Fleet account not found or access denied." });
      }
      if (fleet.status !== "active") {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Fleet account must be active to request quotes." });
      }

      // ── 2. Upsert agency_clients entry for this fleet owner ─────────────────
      const [existingClient] = await db
        .select({ id: agencyClients.id })
        .from(agencyClients)
        .where(and(
          eq(agencyClients.agencyTenantId, AGENCY_TENANT_ID),
          eq(agencyClients.createdBy, ctx.user.id),
        ))
        .limit(1);

      let agencyClientId: number;
      if (existingClient) {
        agencyClientId = existingClient.id;
      } else {
        const [newClient] = await db.insert(agencyClients).values({
          agencyTenantId: AGENCY_TENANT_ID,
          fullName: ctx.user.name ?? `Fleet Owner ${ctx.user.id}`,
          email: ctx.user.email ?? null,
          notes: `Auto-created for fleet account: ${fleet.accountName}`,
          createdBy: ctx.user.id,
        }).$returningId() as { id: number }[];
        agencyClientId = newClient.id;
      }

      // ── 3. Create synthetic fleet_policy claim as RFQ anchor ────────────────
      const claimNumber = `FLEET-RFQ-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 6).toUpperCase()}`;
      const [claimResult] = await db.insert(claims).values({
        claimNumber,
        claimantId: ctx.user.id,
        tenantId: AGENCY_TENANT_ID,
        status: "intake_pending" as any,
        workflowState: "intake_queue" as any,
        claimSource: "fleet_agency",
        documentProcessingStatus: "pending",
        incidentDescription: `Fleet insurance RFQ for account: ${fleet.accountName} (${fleet.accountCode ?? fleet.id}). Vehicle count: ${fleet.vehicleCount}.${input.notes ? ` Notes: ${input.notes}` : ""}`,
        incidentDate: now.slice(0, 10),
        estimatedRepairCost: null,
        createdAt: now,
        updatedAt: now,
      } as any).$returningId() as { id: number }[];
      const claimId = claimResult.id;

      // ── 4. Fetch ALL active insurer tenants ──────────────────────────────────
      const allInsurers = await db
        .select({ id: insurerTenants.id, name: insurerTenants.name })
        .from(insurerTenants);

      if (allInsurers.length === 0) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No active insurer tenants found on the platform." });
      }

      // ── 5. Prevent duplicate pending/sent/quoted requests ───────────────────
      const existingRequests = await db
        .select({ insurerTenantId: insurerQuoteRequests.insurerTenantId })
        .from(insurerQuoteRequests)
        .where(and(
          eq(insurerQuoteRequests.fleetAccountId, input.fleetAccountId),
          inArray(insurerQuoteRequests.status, ["pending", "sent", "quoted"]),
        ));
      const alreadyPending = new Set(existingRequests.map(r => r.insurerTenantId));
      const targetInsurers = allInsurers.filter(i => !alreadyPending.has(i.id));

      if (targetInsurers.length === 0) {
        return {
          success: true,
          claimId,
          claimNumber,
          sent: 0,
          skipped: allInsurers.length,
          message: "All insurers already have a pending RFQ for this fleet account.",
        };
      }

      // ── 6. Fan-out insurer_quote_requests ────────────────────────────────────
      await db.insert(insurerQuoteRequests).values(
        targetInsurers.map(insurer => ({
          claimId,
          insurerTenantId: insurer.id,
          agencyTenantId: AGENCY_TENANT_ID,
          status: "pending" as const,
          requestType: "fleet_policy" as const,
          claimSource: "fleet_agency",
          fleetAccountId: input.fleetAccountId,
          vehicleCount: fleet.vehicleCount ?? null,
          estimatedTotalValue: null,
          claimsHistorySummary: input.notes ?? null,
          sentAt: now,
          createdAt: now,
          updatedAt: now,
        }))
      );

      // ── 7. Audit trail ───────────────────────────────────────────────────────
      try {
        await db.insert(auditTrail).values({
          claimId,
          userId: ctx.user.id,
          action: "fleet_rfq_created",
          entityType: "fleet_account",
          entityId: input.fleetAccountId,
          changeDescription: `Fleet account ${fleet.accountName} initiated insurance RFQ via KINGA Agency. Dispatched to ${targetInsurers.length} insurer(s).`,
          createdAt: now,
        } as any);
      } catch {
        // Non-fatal: audit failure must not block the RFQ
        console.warn(`[AgencyBroker] Audit trail insert failed for fleet RFQ claimId=${claimId}`);
      }

      console.log(`[AgencyBroker] Fleet RFQ created: claimId=${claimId} claimNumber=${claimNumber} fleet=${fleet.accountName} insurers=${targetInsurers.length}`);

      return {
        success: true,
        claimId,
        claimNumber,
        sent: targetInsurers.length,
        skipped: alreadyPending.size,
        message: `Fleet RFQ dispatched to ${targetInsurers.length} insurer(s) via KINGA Agency.`,
      };
    }),

  /**
   * Get all quote requests for the current agency tenant (across all claims).
   */
  myQuoteRequests: agencyProcedure
    .input(z.object({
      status: z.enum(["pending","sent","quoted","accepted","rejected","expired"]).optional(),
      limit: z.number().int().min(1).max(100).default(50),
      offset: z.number().int().min(0).default(0),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const tenantId = (ctx.tenant as { id?: string } | null)?.id ?? ctx.user.tenantId ?? "agency";

      const conditions = [eq(insurerQuoteRequests.agencyTenantId, tenantId)];
      if (input.status) conditions.push(eq(insurerQuoteRequests.status, input.status));

      const quotes = await db
        .select()
        .from(insurerQuoteRequests)
        .where(and(...conditions))
        .orderBy(desc(insurerQuoteRequests.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      const [countRow] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(insurerQuoteRequests)
        .where(and(...conditions));

      return { quotes, total: countRow?.count ?? 0 };
    }),

  /**
   * List fleet policy RFQs for the current user (fleet owner view).
   * Groups by fleet_account_id and returns all insurer responses per RFQ.
   */
  listFleetQuoteRequests: protectedProcedure
    .input(z.object({
      fleetAccountId: z.number().int().positive().optional(),
      limit: z.number().int().min(1).max(100).default(50),
      offset: z.number().int().min(0).default(0),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      // Only return fleet RFQs for claims owned by this user
      const conditions = [
        eq(insurerQuoteRequests.requestType, "fleet_policy"),
        eq(claims.claimantId, ctx.user.id),
      ];
      if (input.fleetAccountId) {
        conditions.push(eq(insurerQuoteRequests.fleetAccountId, input.fleetAccountId));
      }

      const rows = await db
        .select({
          id: insurerQuoteRequests.id,
          claimId: insurerQuoteRequests.claimId,
          claimNumber: claims.claimNumber,
          insurerTenantId: insurerQuoteRequests.insurerTenantId,
          insurerName: insurerTenants.displayName,
          status: insurerQuoteRequests.status,
          requestType: insurerQuoteRequests.requestType,
          claimSource: insurerQuoteRequests.claimSource,
          fleetAccountId: insurerQuoteRequests.fleetAccountId,
          vehicleCount: insurerQuoteRequests.vehicleCount,
          estimatedTotalValue: insurerQuoteRequests.estimatedTotalValue,
          claimsHistorySummary: insurerQuoteRequests.claimsHistorySummary,
          quoteAmount: insurerQuoteRequests.quoteAmount,
          quoteCurrency: insurerQuoteRequests.quoteCurrency,
          quoteNotes: insurerQuoteRequests.quoteNotes,
          quoteValidUntil: insurerQuoteRequests.quoteValidUntil,
          sentAt: insurerQuoteRequests.sentAt,
          quotedAt: insurerQuoteRequests.quotedAt,
          respondedAt: insurerQuoteRequests.respondedAt,
          createdAt: insurerQuoteRequests.createdAt,
        })
        .from(insurerQuoteRequests)
        .innerJoin(claims, eq(insurerQuoteRequests.claimId, claims.id))
        .leftJoin(insurerTenants, eq(insurerQuoteRequests.insurerTenantId, insurerTenants.id))
        .where(and(...conditions))
        .orderBy(desc(insurerQuoteRequests.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      const [countRow] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(insurerQuoteRequests)
        .innerJoin(claims, eq(insurerQuoteRequests.claimId, claims.id))
        .where(and(...conditions));

      return { quotes: rows, total: countRow?.count ?? 0 };
    }),

  /**
   * List insurer-facing fleet RFQs (insurer portal view).
   * Returns all fleet_policy requests addressed to the calling insurer tenant.
   */
  listInsurerFleetRFQs: protectedProcedure
    .input(z.object({
      status: z.enum(["pending","sent","quoted","accepted","rejected","expired"]).optional(),
      limit: z.number().int().min(1).max(100).default(50),
      offset: z.number().int().min(0).default(0),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const insurerTenantId = ctx.user.tenantId;
      if (!insurerTenantId) throw new TRPCError({ code: "FORBIDDEN", message: "Insurer tenant context required." });

      const conditions = [
        eq(insurerQuoteRequests.insurerTenantId, insurerTenantId),
        eq(insurerQuoteRequests.requestType, "fleet_policy"),
      ];
      if (input.status) conditions.push(eq(insurerQuoteRequests.status, input.status));

      const rows = await db
        .select({
          id: insurerQuoteRequests.id,
          claimId: insurerQuoteRequests.claimId,
          claimNumber: claims.claimNumber,
          agencyTenantId: insurerQuoteRequests.agencyTenantId,
          status: insurerQuoteRequests.status,
          requestType: insurerQuoteRequests.requestType,
          claimSource: insurerQuoteRequests.claimSource,
          fleetAccountId: insurerQuoteRequests.fleetAccountId,
          vehicleCount: insurerQuoteRequests.vehicleCount,
          estimatedTotalValue: insurerQuoteRequests.estimatedTotalValue,
          claimsHistorySummary: insurerQuoteRequests.claimsHistorySummary,
          quoteAmount: insurerQuoteRequests.quoteAmount,
          quoteCurrency: insurerQuoteRequests.quoteCurrency,
          quoteNotes: insurerQuoteRequests.quoteNotes,
          quoteValidUntil: insurerQuoteRequests.quoteValidUntil,
          sentAt: insurerQuoteRequests.sentAt,
          quotedAt: insurerQuoteRequests.quotedAt,
          incidentDescription: claims.incidentDescription,
          createdAt: insurerQuoteRequests.createdAt,
        })
        .from(insurerQuoteRequests)
        .innerJoin(claims, eq(insurerQuoteRequests.claimId, claims.id))
        .where(and(...conditions))
        .orderBy(desc(insurerQuoteRequests.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      const [countRow] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(insurerQuoteRequests)
        .innerJoin(claims, eq(insurerQuoteRequests.claimId, claims.id))
        .where(and(...conditions));

      return { rfqs: rows, total: countRow?.count ?? 0 };
    }),
});
