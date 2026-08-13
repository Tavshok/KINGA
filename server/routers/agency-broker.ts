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
import { eq, and, desc, inArray, sql, ne, asc } from "drizzle-orm";
import { router, protectedProcedure, requireTenantScope } from "../_core/trpc";
import { agencyDomainProcedure as agencyProcedure } from "../_core/domain-middleware";
import { auditP0CrossTenantAccess, resolveP0TenantScope } from "../security/p0TenantBoundary";
import { getDb } from "../db";
import {
  agencyClients,
  insurerQuoteRequests,
  insurerTenants,
  fleetAccounts,
  claims,
  auditTrail,
  commissionRecords,
  agencyProductCommissionConfigs,
  insuranceProducts,
  fleetRfqClientInstructions,
} from "../../drizzle/schema";
import { randomUUID } from "crypto";
import { canExecuteFleetInstruction, canSubmitFleetInstruction, resolveRfqAuthority } from "../agency/rfqAuthority";

// ─── Agency Guard ────────────────────────────────────────────────────────────
// R-INF-09 (ACTIVATED 2026-07-30): agencyProcedure is now the canonical
// agencyDomainProcedure from domain-middleware.ts (imported as alias above).
// Permitted roles: agency, admin, platform_super_admin.
// platform_super_admin access is a confirmed product requirement for system testing.
// See KINGA-Architecture-Freeze-Report-Epic1.md for full audit trail.

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

const requestQuotesInput = z.object({
  claimId: z.number().int().positive(),
  insurerTenantIds: z.array(z.string()).min(1).max(20),
});

const respondToQuoteInput = z.object({
  quoteRequestId: z.number().int().positive(),
  quoteAmount: z.number().positive(),
  quoteCurrency: z.string().max(10).default("USD"),
  quoteNotes: z.string().optional(),
  quoteValidUntil: z.string().optional(), // ISO date string
});

const acceptRejectQuoteInput = z.object({
  quoteRequestId: z.number().int().positive(),
  action: z.enum(["accepted", "rejected"]),
  tenantId: z.string().optional(),
});

const commissionConfigurationInput = z.object({
  productId: z.number().int().positive(),
  commissionRate: z.number().min(0).max(100),
});

const fleetInstructionInput = z.object({
  quoteRequestId: z.number().int().positive(),
  instruction: z.enum(["accepted", "rejected"]),
  notes: z.string().max(2000).optional(),
});

/** P0: protects against a stale or mocked foreign row being acted on after lookup. */
export function assertAgencyQuoteTenant(agencyTenantId: string | null, scopedTenantId: string): void {
  if (agencyTenantId !== scopedTenantId) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Quote request not found." });
  }
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const agencyBrokerRouter = router({

  // ── Agency Commercial Commission Configuration ────────────────────────────
  // This is agency-owned commercial metadata. It does not drive policy issuance,
  // premiums, underwriting, claims, settlement, or RFQ transitions.
  listCommissionProducts: agencyProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
    return db.select({
      id: insuranceProducts.id,
      productName: insuranceProducts.productName,
      productCode: insuranceProducts.productCode,
      coverageType: insuranceProducts.coverageType,
      insurerTenantId: insuranceProducts.tenantId,
    }).from(insuranceProducts)
      .where(eq(insuranceProducts.isActive, 1))
      .orderBy(asc(insuranceProducts.productName));
  }),

  listCommissionConfigurations: agencyProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
    const tenantId = requireTenantScope(ctx, undefined, "agency-broker") as string;
    return db.select({
      id: agencyProductCommissionConfigs.id,
      productId: agencyProductCommissionConfigs.productId,
      commissionRate: agencyProductCommissionConfigs.commissionRate,
      isActive: agencyProductCommissionConfigs.isActive,
      configuredBy: agencyProductCommissionConfigs.configuredBy,
      updatedAt: agencyProductCommissionConfigs.updatedAt,
      productName: insuranceProducts.productName,
      productCode: insuranceProducts.productCode,
    }).from(agencyProductCommissionConfigs)
      .leftJoin(insuranceProducts, eq(agencyProductCommissionConfigs.productId, insuranceProducts.id))
      .where(eq(agencyProductCommissionConfigs.agencyTenantId, tenantId))
      .orderBy(asc(insuranceProducts.productName));
  }),

  upsertCommissionConfiguration: agencyProcedure
    .input(commissionConfigurationInput)
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const tenantId = requireTenantScope(ctx, undefined, "agency-broker") as string;
      const [product] = await db.select({ id: insuranceProducts.id })
        .from(insuranceProducts)
        .where(and(eq(insuranceProducts.id, input.productId), eq(insuranceProducts.isActive, 1)));
      if (!product) throw new TRPCError({ code: "NOT_FOUND", message: "Active insurance product not found." });

      await db.insert(agencyProductCommissionConfigs).values({
        agencyTenantId: tenantId,
        productId: input.productId,
        commissionRate: String(input.commissionRate),
        isActive: 1,
        configuredBy: ctx.user.id,
      }).onDuplicateKeyUpdate({
        set: { commissionRate: String(input.commissionRate), isActive: 1, configuredBy: ctx.user.id },
      });
      return { success: true, status: "configured" as const };
    }),

  setCommissionConfigurationActive: agencyProcedure
    .input(z.object({ productId: z.number().int().positive(), isActive: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const tenantId = requireTenantScope(ctx, undefined, "agency-broker") as string;
      const result = await db.update(agencyProductCommissionConfigs)
        .set({ isActive: input.isActive ? 1 : 0, configuredBy: ctx.user.id })
        .where(and(
          eq(agencyProductCommissionConfigs.agencyTenantId, tenantId),
          eq(agencyProductCommissionConfigs.productId, input.productId),
        ));
      if ((result as any).rowsAffected === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Commission configuration not found." });
      }
      return { success: true, status: input.isActive ? "configured" as const : "unavailable" as const };
    }),

  submitFleetQuoteInstruction: protectedProcedure
    .input(fleetInstructionInput)
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [quote] = await db.select({
        id: insurerQuoteRequests.id,
        agencyTenantId: insurerQuoteRequests.agencyTenantId,
        fleetAccountId: insurerQuoteRequests.fleetAccountId,
        requestType: insurerQuoteRequests.requestType,
        status: insurerQuoteRequests.status,
        claimId: insurerQuoteRequests.claimId,
      }).from(insurerQuoteRequests)
        .where(eq(insurerQuoteRequests.id, input.quoteRequestId));
      if (!quote || quote.requestType !== "fleet_policy" || !quote.fleetAccountId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Fleet RFQ quote request not found." });
      }
      const [fleet] = await db.select({ id: fleetAccounts.id })
        .from(fleetAccounts)
        .where(and(eq(fleetAccounts.id, quote.fleetAccountId), eq(fleetAccounts.ownerUserId, ctx.user.id)));
      if (!canSubmitFleetInstruction({
        requestType: quote.requestType,
        quoteStatus: quote.status,
        hasFleetAccount: Boolean(quote.fleetAccountId),
        requesterOwnsFleet: Boolean(fleet),
      })) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "A fleet instruction requires an owned fleet account and a quoted fleet RFQ." });
      }

      const now = new Date().toISOString().slice(0, 19).replace("T", " ");
      await db.insert(fleetRfqClientInstructions).values({
        quoteRequestId: quote.id,
        agencyTenantId: quote.agencyTenantId,
        fleetAccountId: quote.fleetAccountId,
        instruction: input.instruction,
        status: "requested",
        instructedBy: ctx.user.id,
        notes: input.notes ?? null,
        createdAt: now,
      });
      await db.insert(auditTrail).values({
        claimId: quote.claimId,
        userId: ctx.user.id,
        action: "fleet_rfq_instruction_requested",
        entityType: "insurer_quote_request",
        entityId: quote.id,
        changeDescription: `Authorised fleet owner requested agency execution: ${input.instruction}. This is an RFQ instruction only and does not issue a policy or alter any insurance decision.`,
        createdAt: now,
      } as any);
      return { success: true, status: "requested" as const };
    }),

  executeFleetQuoteInstruction: agencyProcedure
    .input(z.object({ instructionId: z.number().int().positive(), tenantId: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const scope = resolveP0TenantScope(ctx, input.tenantId, "agencyBroker.executeFleetQuoteInstruction");
      const [instruction] = await db.select().from(fleetRfqClientInstructions)
        .where(and(eq(fleetRfqClientInstructions.id, input.instructionId), eq(fleetRfqClientInstructions.agencyTenantId, scope.tenantId)));
      if (!instruction) throw new TRPCError({ code: "NOT_FOUND", message: "Fleet instruction not found." });
      if (instruction.status !== "requested") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Fleet instruction is no longer actionable." });
      const [quote] = await db.select({
        id: insurerQuoteRequests.id,
        claimId: insurerQuoteRequests.claimId,
        status: insurerQuoteRequests.status,
        requestType: insurerQuoteRequests.requestType,
        fleetAccountId: insurerQuoteRequests.fleetAccountId,
      }).from(insurerQuoteRequests).where(and(
        eq(insurerQuoteRequests.id, instruction.quoteRequestId),
        eq(insurerQuoteRequests.agencyTenantId, scope.tenantId),
      ));
      if (!quote) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Instructed fleet RFQ is unavailable." });
      }
      if (!canExecuteFleetInstruction({
        instructionStatus: instruction.status,
        requestType: quote.requestType,
        quoteStatus: quote.status,
        fleetAccountMatches: quote.fleetAccountId === instruction.fleetAccountId,
      })) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Fleet instruction is no longer available for execution." });
      }

      const now = new Date().toISOString().slice(0, 19).replace("T", " ");
      await db.update(insurerQuoteRequests).set({ status: instruction.instruction, respondedAt: now, commissionEstimate: null, updatedAt: now })
        .where(and(eq(insurerQuoteRequests.id, quote.id), eq(insurerQuoteRequests.agencyTenantId, scope.tenantId)));
      let siblingsClosed = 0;
      if (instruction.instruction === "accepted") {
        const siblingResult = await db.update(insurerQuoteRequests).set({ status: "rejected", respondedAt: now, updatedAt: now }).where(and(
          ne(insurerQuoteRequests.id, quote.id),
          eq(insurerQuoteRequests.agencyTenantId, scope.tenantId),
          eq(insurerQuoteRequests.fleetAccountId, quote.fleetAccountId),
          inArray(insurerQuoteRequests.status, ["pending", "sent", "quoted"]),
        ));
        siblingsClosed = (siblingResult as any).rowsAffected ?? 0;
      }
      await db.update(fleetRfqClientInstructions).set({ status: "executed", executedBy: ctx.user.id, executedAt: now })
        .where(and(eq(fleetRfqClientInstructions.id, instruction.id), eq(fleetRfqClientInstructions.status, "requested")));
      await db.insert(auditTrail).values({
        claimId: quote.claimId,
        userId: ctx.user.id,
        action: "agency_executed_fleet_rfq_instruction",
        entityType: "insurer_quote_request",
        entityId: quote.id,
        changeDescription: `Agency executed authorised fleet instruction: ${instruction.instruction}. ${siblingsClosed} competing quote(s) closed. This does not issue a policy or alter premiums, underwriting, claims, settlement, or commission records.`,
        createdAt: now,
      } as any);
      return { success: true, status: instruction.instruction, siblingsClosed, commissionStatus: "not_applied_to_rfq" as const };
    }),

  listPendingFleetQuoteInstructions: agencyProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
    const tenantId = requireTenantScope(ctx, undefined, "agency-broker") as string;
    return db.select({
      instructionId: fleetRfqClientInstructions.id,
      instruction: fleetRfqClientInstructions.instruction,
      notes: fleetRfqClientInstructions.notes,
      createdAt: fleetRfqClientInstructions.createdAt,
      quoteRequestId: insurerQuoteRequests.id,
      quoteAmount: insurerQuoteRequests.quoteAmount,
      quoteCurrency: insurerQuoteRequests.quoteCurrency,
      insurerTenantId: insurerQuoteRequests.insurerTenantId,
      fleetAccountId: insurerQuoteRequests.fleetAccountId,
      claimNumber: claims.claimNumber,
      insurerName: insurerTenants.displayName,
    }).from(fleetRfqClientInstructions)
      .innerJoin(insurerQuoteRequests, eq(fleetRfqClientInstructions.quoteRequestId, insurerQuoteRequests.id))
      .innerJoin(claims, eq(insurerQuoteRequests.claimId, claims.id))
      .leftJoin(insurerTenants, eq(insurerQuoteRequests.insurerTenantId, insurerTenants.id))
      .where(and(
        eq(fleetRfqClientInstructions.agencyTenantId, tenantId),
        eq(fleetRfqClientInstructions.status, "requested"),
        eq(insurerQuoteRequests.requestType, "fleet_policy"),
      ))
      .orderBy(desc(fleetRfqClientInstructions.createdAt));
  }),

  // ── Client Management ──────────────────────────────────────────────────────

  /**
   * Create a new agency client record.
   */
  createClient: agencyProcedure
    .input(createClientInput)
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const tenantId = requireTenantScope(ctx, undefined, 'agency-broker') as string;

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

      const tenantId = requireTenantScope(ctx, undefined, 'agency-broker') as string;

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

      const tenantId = requireTenantScope(ctx, undefined, 'agency-broker') as string;

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

      const tenantId = requireTenantScope(ctx, undefined, 'agency-broker') as string;

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

  // ── Multi-Insurer Quote Requests ───────────────────────────────────────────

  /**
   * List insurer tenants available to receive an Agency-sourced quote request.
   * The Agency selects recipients deliberately; it does not submit a client
   * quote request as though it were the client.
   */
  listAvailableInsurers: agencyProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      return db
        .select({
          id: insurerTenants.id,
          name: insurerTenants.name,
          displayName: insurerTenants.displayName,
          primaryCurrency: insurerTenants.primaryCurrency,
        })
        .from(insurerTenants)
        .orderBy(asc(insurerTenants.displayName));
    }),

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

      const tenantId = requireTenantScope(ctx, undefined, 'agency-broker') as string;
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
   * Insurer: respond to a fleet RFQ with a quoted amount.
   *
   * - Verifies the insurer owns this quote request (tenant isolation).
   * - Prevents re-submission on already-finalised requests.
   * - Writes an audit trail entry: "insurer_submitted_fleet_quote".
   */
  respondToQuote: protectedProcedure
    .input(respondToQuoteInput)
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const tenantId = (ctx.tenant as { id?: string } | null)?.id ?? ctx.user.tenantId;
      if (!tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "Insurer tenant context required." });

      const now = new Date().toISOString().slice(0, 19).replace("T", " ");

      // ── 1. Verify this insurer owns the quote request (tenant isolation) ───────
      const [qr] = await db
        .select({
          id: insurerQuoteRequests.id,
          status: insurerQuoteRequests.status,
          claimId: insurerQuoteRequests.claimId,
          requestType: insurerQuoteRequests.requestType,
          fleetAccountId: insurerQuoteRequests.fleetAccountId,
        })
        .from(insurerQuoteRequests)
        .where(and(
          eq(insurerQuoteRequests.id, input.quoteRequestId),
          eq(insurerQuoteRequests.insurerTenantId, tenantId)
        ));

      if (!qr) throw new TRPCError({ code: "NOT_FOUND", message: "Quote request not found or access denied." });

      // ── 2. Prevent duplicate state transitions ───────────────────────────────
      if (qr.status === "accepted" || qr.status === "rejected") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `Quote has already been finalised (status: ${qr.status}). Cannot re-submit.`,
        });
      }

      // ── 3. Update to quoted status ───────────────────────────────────────────
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
        .where(and(
          eq(insurerQuoteRequests.id, input.quoteRequestId),
          eq(insurerQuoteRequests.insurerTenantId, tenantId)
        ));

      // ── 4. Audit trail: insurer_submitted_fleet_quote ────────────────────────
      try {
        await db.insert(auditTrail).values({
          claimId: qr.claimId,
          userId: ctx.user.id,
          action: "insurer_submitted_fleet_quote",
          entityType: qr.requestType === "fleet_policy" ? "fleet_account" : "insurer_quote_request",
          entityId: qr.fleetAccountId ?? qr.id,
          changeDescription: `Insurer tenant ${tenantId} submitted a quote of ${input.quoteCurrency} ${input.quoteAmount} for quote request #${input.quoteRequestId}.`,
          createdAt: now,
        } as any);
      } catch {
        console.warn(`[AgencyBroker] Audit insert failed for respondToQuote id=${input.quoteRequestId}`);
      }

      console.log(`[AgencyBroker] Quote responded: id=${input.quoteRequestId} insurer=${tenantId} amount=${input.quoteAmount}`);
      return { success: true, status: "quoted" };
    }),

  /**
   * Agency / Fleet owner: accept or reject a specific insurer's quote.
   *
   * On ACCEPT:
   *   - Updates the accepted request to status = "accepted".
   *   - Records a commission estimate (5% of quote amount by default).
   *   - Closes all other pending/sent/quoted requests for the same RFQ batch
   *     (same fleetAccountId + claimId) by setting them to "rejected".
   *   - Writes audit entry: "fleet_quote_accepted".
   *
   * On REJECT:
   *   - Marks only this insurer's request as "rejected".
   *   - Leaves all other requests open.
   *   - Writes audit entry: "fleet_quote_rejected".
   *
   * Duplicate state transitions are prevented for both paths.
   */
  acceptOrRejectQuote: agencyProcedure
    .input(acceptRejectQuoteInput)
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const scope = resolveP0TenantScope(ctx, input.tenantId, "agencyBroker.acceptOrRejectQuote");

      const now = new Date().toISOString().slice(0, 19).replace("T", " ");

      // ── 1. Fetch the target quote request ────────────────────────────────────
      const [qr] = await db
        .select({
          id: insurerQuoteRequests.id,
          status: insurerQuoteRequests.status,
          claimId: insurerQuoteRequests.claimId,
          fleetAccountId: insurerQuoteRequests.fleetAccountId,
          insurerTenantId: insurerQuoteRequests.insurerTenantId,
          quoteAmount: insurerQuoteRequests.quoteAmount,
          quoteCurrency: insurerQuoteRequests.quoteCurrency,
          requestType: insurerQuoteRequests.requestType,
          agencyTenantId: insurerQuoteRequests.agencyTenantId,
        })
        .from(insurerQuoteRequests)
        .where(and(
          eq(insurerQuoteRequests.id, input.quoteRequestId),
          eq(insurerQuoteRequests.agencyTenantId, scope.tenantId),
        ));

      if (!qr) throw new TRPCError({ code: "NOT_FOUND", message: "Quote request not found." });
      assertAgencyQuoteTenant(qr.agencyTenantId, scope.tenantId);

      if (resolveRfqAuthority(qr.requestType).requiresClientInstruction) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Fleet RFQs require an authorised client or fleet instruction before agency execution.",
        });
      }

      // ── 2. Prevent duplicate state transitions ───────────────────────────────
      if (qr.status === "accepted" || qr.status === "rejected") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `Quote is already in a final state (status: ${qr.status}). No further transitions allowed.`,
        });
      }

      if (input.action === "accepted") {
        // ── 3a. Accept the RFQ only. Commission is separately agency-configured
        // commercial metadata and never affects an RFQ, policy, premium, claim,
        // settlement, underwriting, or insurer response.
        const quoteAmountNum = qr.quoteAmount ? parseFloat(qr.quoteAmount) : 0;

        await db
          .update(insurerQuoteRequests)
          .set({
            status: "accepted",
            respondedAt: now,
            commissionEstimate: null,
            updatedAt: now,
          })
          .where(and(
            eq(insurerQuoteRequests.id, input.quoteRequestId),
            eq(insurerQuoteRequests.agencyTenantId, scope.tenantId),
          ));

        // ── 3b. Close all sibling requests for this RFQ batch ──────────────────
        // Siblings = same claimId (or fleetAccountId) that are still open
        const siblingConditions = [
          ne(insurerQuoteRequests.id, input.quoteRequestId),
          eq(insurerQuoteRequests.agencyTenantId, scope.tenantId),
          inArray(insurerQuoteRequests.status, ["pending", "sent", "quoted"]),
        ];
        if (qr.fleetAccountId) {
          siblingConditions.push(eq(insurerQuoteRequests.fleetAccountId, qr.fleetAccountId));
        } else {
          siblingConditions.push(eq(insurerQuoteRequests.claimId, qr.claimId));
        }

        const siblingResult = await db
          .update(insurerQuoteRequests)
          .set({ status: "rejected", respondedAt: now, updatedAt: now })
          .where(and(...siblingConditions));

        // ── 3c. Audit: fleet_quote_accepted ─────────────────────────────────────
        try {
          await db.insert(auditTrail).values({
            claimId: qr.claimId,
            userId: ctx.user.id,
            action: "fleet_quote_accepted",
            entityType: qr.requestType === "fleet_policy" ? "fleet_account" : "insurer_quote_request",
            entityId: qr.fleetAccountId ?? qr.id,
            changeDescription: `Quote #${input.quoteRequestId} accepted from insurer ${qr.insurerTenantId}. Amount: ${qr.quoteCurrency ?? "USD"} ${quoteAmountNum}. Commission configuration is separate agency-commercial metadata and does not affect this RFQ or any insurance decision. ${(siblingResult as any)?.rowsAffected ?? 0} competing quote(s) closed.`,
            createdAt: now,
          } as any);
        } catch {
          console.warn(`[AgencyBroker] Audit insert failed for acceptOrRejectQuote ACCEPT id=${input.quoteRequestId}`);
        }

        console.log(`[AgencyBroker] Quote ACCEPTED: id=${input.quoteRequestId} insurer=${qr.insurerTenantId} amount=${quoteAmountNum}`);
        await auditP0CrossTenantAccess(ctx, scope, "agency_quote_accept", String(input.quoteRequestId), { agencyTenantId: scope.tenantId });
        return {
          success: true,
          status: "accepted",
          commissionStatus: "not_applied_to_rfq" as const,
          currency: qr.quoteCurrency ?? "USD",
          siblingsClosed: (siblingResult as any)?.rowsAffected ?? 0,
        };

      } else {
        // ── 4. Reject: mark only this request, leave others open ────────────────
        await db
          .update(insurerQuoteRequests)
          .set({ status: "rejected", respondedAt: now, updatedAt: now })
          .where(and(
            eq(insurerQuoteRequests.id, input.quoteRequestId),
            eq(insurerQuoteRequests.agencyTenantId, scope.tenantId),
          ));

        // ── 4a. Audit: fleet_quote_rejected ─────────────────────────────────────
        try {
          await db.insert(auditTrail).values({
            claimId: qr.claimId,
            userId: ctx.user.id,
            action: "fleet_quote_rejected",
            entityType: qr.requestType === "fleet_policy" ? "fleet_account" : "insurer_quote_request",
            entityId: qr.fleetAccountId ?? qr.id,
            changeDescription: `Quote #${input.quoteRequestId} rejected from insurer ${qr.insurerTenantId}. Remaining open quotes for this RFQ are unaffected.`,
            createdAt: now,
          } as any);
        } catch {
          console.warn(`[AgencyBroker] Audit insert failed for acceptOrRejectQuote REJECT id=${input.quoteRequestId}`);
        }

        console.log(`[AgencyBroker] Quote REJECTED: id=${input.quoteRequestId} insurer=${qr.insurerTenantId}`);
        await auditP0CrossTenantAccess(ctx, scope, "agency_quote_reject", String(input.quoteRequestId), { agencyTenantId: scope.tenantId });
        return { success: true, status: "rejected" };
      }
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

      const tenantId = requireTenantScope(ctx, undefined, 'agency-broker') as string;

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

  // ── Commission Dashboard ───────────────────────────────────────────────────

  /**
   * H-02: Get commission summary for the agency dashboard.
   * Aggregates earned, pending, and paid commissions from two sources:
   *   1. insurerQuoteRequests.commissionEstimate (accepted quotes)
   *   2. commissionRecords (formal ledger entries)
   */
  getCommissionSummary: agencyProcedure
    .input(z.object({
      days: z.number().int().min(7).max(365).default(90),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const tenantId = requireTenantScope(ctx, undefined, 'agency-broker') as string;
      const since = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000)
        .toISOString().slice(0, 19).replace('T', ' ');

      // Formal commercial records are the only commission monetary ledger.
      // RFQ acceptance never creates a commission estimate or payment obligation.
      const [formalCommissions] = await db
        .select({
          totalPaid: sql<number>`COALESCE(SUM(CASE WHEN ${commissionRecords.paymentStatus} = 'paid' THEN ${commissionRecords.commissionAmount} ELSE 0 END), 0)`,
          totalPending: sql<number>`COALESCE(SUM(CASE WHEN ${commissionRecords.paymentStatus} = 'pending' THEN ${commissionRecords.commissionAmount} ELSE 0 END), 0)`,
          totalDisputed: sql<number>`COALESCE(SUM(CASE WHEN ${commissionRecords.paymentStatus} = 'disputed' THEN ${commissionRecords.commissionAmount} ELSE 0 END), 0)`,
          totalRecords: sql<number>`COUNT(*)`,
          paidCount: sql<number>`SUM(CASE WHEN ${commissionRecords.paymentStatus} = 'paid' THEN 1 ELSE 0 END)`,
          pendingCount: sql<number>`SUM(CASE WHEN ${commissionRecords.paymentStatus} = 'pending' THEN 1 ELSE 0 END)`,
        })
        .from(commissionRecords)
        .where(and(
          eq(commissionRecords.tenantId, tenantId),
          sql`${commissionRecords.createdAt} >= ${since}`
        ));

      return {
        period: { days: input.days, since },
        quoteCommissions: {
          totalEstimatedCents: 0,
          acceptedQuoteCount: 0,
        },
        formalCommissions: {
          totalPaidCents: Number(formalCommissions?.totalPaid ?? 0),
          totalPendingCents: Number(formalCommissions?.totalPending ?? 0),
          totalDisputedCents: Number(formalCommissions?.totalDisputed ?? 0),
          totalRecords: Number(formalCommissions?.totalRecords ?? 0),
          paidCount: Number(formalCommissions?.paidCount ?? 0),
          pendingCount: Number(formalCommissions?.pendingCount ?? 0),
        },
      };
    }),

  /**
   * H-02: List commission records for the agency with pagination.
   */
  listCommissions: agencyProcedure
    .input(z.object({
      status: z.enum(['pending', 'paid', 'disputed', 'all']).default('all'),
      limit: z.number().int().min(1).max(100).default(20),
      offset: z.number().int().min(0).default(0),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const tenantId = requireTenantScope(ctx, undefined, 'agency-broker') as string;

      const conditions = [eq(commissionRecords.tenantId, tenantId)];
      if (input.status !== 'all') {
        conditions.push(eq(commissionRecords.paymentStatus, input.status));
      }

      const rows = await db
        .select()
        .from(commissionRecords)
        .where(and(...conditions))
        .orderBy(desc(commissionRecords.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      const [countRow] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(commissionRecords)
        .where(and(...conditions));

      return { commissions: rows, total: countRow?.count ?? 0 };
    }),

  /**
   * H-02: Get monthly commission trend for the last 6 months.
   */
  getCommissionTrends: agencyProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
    const tenantId = requireTenantScope(ctx, undefined, 'agency-broker') as string;

      const rows = await db
        .select({
          month: sql<string>`DATE_FORMAT(${commissionRecords.createdAt}, '%Y-%m')`,
          totalEstimated: sql<number>`COALESCE(SUM(${commissionRecords.commissionAmount}), 0)`,
          count: sql<number>`COUNT(*)`,
        })
        .from(commissionRecords)
        .where(and(
          eq(commissionRecords.tenantId, tenantId),
          sql`${commissionRecords.createdAt} >= DATE_SUB(NOW(), INTERVAL 6 MONTH)`
        ))
        .groupBy(sql`DATE_FORMAT(${commissionRecords.createdAt}, '%Y-%m')`);

    return rows.map(r => ({
      month: r.month,
      totalEstimatedCents: Math.round(Number(r.totalEstimated) * 100),
      count: Number(r.count),
    }));
  }),

  // ── M-06: Agency Performance Analytics ───────────────────────────────────────────

  /**
   * M-06: Get agency performance metrics.
   * Conversion rate, avg time-to-quote, revenue pipeline, and insurer breakdown.
   */
  getPerformanceMetrics: agencyProcedure
    .input(z.object({
      days: z.number().int().min(7).max(365).default(90),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const tenantId = requireTenantScope(ctx, undefined, 'agency-broker') as string;
      const since = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000)
        .toISOString().slice(0, 19).replace('T', ' ');

      // Quotation funnel metrics
      const [funnel] = await db
        .select({
          total: sql<number>`COUNT(*)`,
          accepted: sql<number>`SUM(CASE WHEN ${insurerQuoteRequests.status} = 'accepted' THEN 1 ELSE 0 END)`,
          rejected: sql<number>`SUM(CASE WHEN ${insurerQuoteRequests.status} = 'rejected' THEN 1 ELSE 0 END)`,
          pending: sql<number>`SUM(CASE WHEN ${insurerQuoteRequests.status} IN ('pending','submitted','under_review') THEN 1 ELSE 0 END)`,
          totalEstimatedCommission: sql<number>`0`,
        })
        .from(insurerQuoteRequests)
        .where(and(
          eq(insurerQuoteRequests.agencyTenantId, tenantId),
          sql`${insurerQuoteRequests.createdAt} >= ${since}`
        ));

      const total = Number(funnel?.total ?? 0);
      const accepted = Number(funnel?.accepted ?? 0);
      const conversionRate = total > 0 ? Math.round((accepted / total) * 100) : 0;

      // Insurer breakdown
      const insurerRows = await db
        .select({
          insurerTenantId: insurerQuoteRequests.insurerTenantId,
          count: sql<number>`COUNT(*)`,
          acceptedCount: sql<number>`SUM(CASE WHEN ${insurerQuoteRequests.status} = 'accepted' THEN 1 ELSE 0 END)`,
          totalCommission: sql<number>`0`,
        })
        .from(insurerQuoteRequests)
        .where(and(
          eq(insurerQuoteRequests.agencyTenantId, tenantId),
          sql`${insurerQuoteRequests.createdAt} >= ${since}`
        ))
        .groupBy(insurerQuoteRequests.insurerTenantId)
        .orderBy(desc(sql`COUNT(*)`));

      return {
        period: { days: input.days, since },
        funnel: {
          total,
          accepted,
          rejected: Number(funnel?.rejected ?? 0),
          pending: Number(funnel?.pending ?? 0),
          conversionRate,
          totalEstimatedCommissionCents: Math.round(Number(funnel?.totalEstimatedCommission ?? 0) * 100),
        },
        insurerBreakdown: insurerRows.map(r => ({
          insurerTenantId: r.insurerTenantId,
          total: Number(r.count),
          accepted: Number(r.acceptedCount),
          conversionRate: Number(r.count) > 0 ? Math.round((Number(r.acceptedCount) / Number(r.count)) * 100) : 0,
          totalCommissionCents: Math.round(Number(r.totalCommission) * 100),
        })),
      };
    }),
});
