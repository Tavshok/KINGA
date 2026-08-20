/**
 * Phase 7A — Customer Journey & Agency Commerce
 * New insurance router procedures for valuation request, teaser/full report gating,
 * and agency inbox.
 */
import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import {
  createNotification
} from "../db";
import { clientInsuranceServiceRequests, clientVehicleValuationRequests, quotationRequestDocuments, quotationRequests, users, valuationComparableEvidence } from "../../drizzle/schema";
import { eq, desc, and, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { randomBytes } from "crypto";
import { storagePut } from "../storage";
import { assertRestrictedAgencyAssistedCapability } from "../agency/agencyAssistedClaimantIdentity";
import { auditP0CrossTenantAccess, resolveP0TenantScope, validateP0TenantScope } from "../security/p0TenantBoundary";
import { isAdminRole } from "@shared/role-permissions";

function generateToken(): string {
  return randomBytes(32).toString("hex");
}

function assertLegacyValuationServiceRole(role: string): void {
  if (role === "agency" || role === "insurer" || isAdminRole(role)) return;
  throw new TRPCError({ code: "FORBIDDEN", message: "Only agency or insurer service users can access legacy valuation history." });
}

async function resolveLegacyValuationScope(
  ctx: { user: { id: number; role: string; tenantId?: string | null }; req?: { headers?: Record<string, string | string[] | undefined> } },
  requestedTenantId: string | undefined,
  procedureName: string,
) {
  assertLegacyValuationServiceRole(ctx.user.role);
  const scope = resolveP0TenantScope(ctx, requestedTenantId, procedureName);
  await validateP0TenantScope(scope);
  return scope;
}

export const insurancePhase7Router = router({
  /**
   * Public procedure — submit a valuation request.
   * No login required. Creates a quotationRequest record, triggers valuation pipeline,
   * returns a submission token for tracking.
   */
  submitValuationRequest: publicProcedure
    .input(z.object({
      // Contact
      fullName: z.string().min(2),
      email: z.string().email(),
      phone: z.string().min(7),
      // Vehicle
      vehicleMake: z.string().min(1),
      vehicleModel: z.string().min(1),
      vehicleYear: z.number().int().min(1970).max(new Date().getFullYear() + 1),
      vehicleRegistration: z.string().optional(),
      vehicleVin: z.string().optional(),
      mileage: z.number().int().min(0).optional(),
      condition: z.enum(["excellent", "good", "fair", "poor"]),
      // Photos (S3 URLs — uploaded by frontend before calling this)
      photoUrls: z.array(z.string().url()).min(1).max(20),
      registrationBookUrl: z.string().url().optional(),
      // Journey type
      isStandaloneValuation: z.boolean().default(false),
      // Insurance details (required if not standalone)
      insuranceType: z.enum(["comprehensive", "third_party", "third_party_fire_theft", "fleet", "commercial"]).optional(),
      coverageStartDate: z.string().optional(),
      additionalCover: z.string().optional(),
      // Fleet
      fleetVehicleCount: z.number().int().min(1).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const token = generateToken();
      const requestNumber = `VR-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
      const isFleet = (input.fleetVehicleCount ?? 1) > 1;
      const inspectionRequired = (input.fleetVehicleCount ?? 1) > 10 ? 1 : 0;

      const [result] = await db.insert(clientVehicleValuationRequests).values({
        requestNumber,
        fullName: input.fullName,
        email: input.email,
        phone: input.phone,
        vehicleMake: input.vehicleMake,
        vehicleModel: input.vehicleModel,
        vehicleYear: input.vehicleYear,
        vehicleRegistration: input.vehicleRegistration ?? null,
        vehicleVin: input.vehicleVin ?? null,
        mileage: input.mileage ?? null,
        condition: input.condition,
        status: "pending",
        photoUrlsJson: JSON.stringify(input.photoUrls),
        registrationBookUrl: input.registrationBookUrl ?? null,
        submissionToken: token,
      } as any);

      const requestId = (result as any).insertId;

      // Trigger valuation pipeline asynchronously (fire-and-forget)
      setImmediate(async () => {
        try {
          const { generateVehicleValuation } = await import("../insurance/valuation-engine");
          const valuation = await generateVehicleValuation({
            make: input.vehicleMake,
            model: input.vehicleModel,
            year: input.vehicleYear,
            mileage: input.mileage,
            condition: input.condition,
          });
          if (valuation && db) {
            const reliability = valuation.reliabilityEvidence;
            await db.delete(valuationComparableEvidence)
              .where(eq(valuationComparableEvidence.valuationRequestId, requestId));
            if (reliability.ledger.length) {
              await db.insert(valuationComparableEvidence).values(reliability.ledger.map((entry) => ({
                valuationRequestId: requestId,
                sourceType: entry.sourceType,
                sourceReference: entry.sourceReference,
                observedValueCents: entry.observedValueCents,
                observedAt: entry.observedAt ? new Date(entry.observedAt).toISOString().slice(0, 19).replace("T", " ") : null,
                vehicleYear: entry.vehicleYear,
                vehicleMatchJson: JSON.stringify(entry.vehicleMatch),
                adjustmentJson: entry.adjustment ? JSON.stringify(entry.adjustment) : null,
                limitation: entry.limitation,
                inclusionStatus: reliability.professionalEvidence.requiresHumanReview ? "review_required" : "included",
              })) as any);
            }
            await db.update(clientVehicleValuationRequests)
              .set({
                kingaMarketValuationCents: valuation.estimatedValue ?? null,
                valuationProvenanceJson: JSON.stringify({
                  label: "KINGA Market Valuation",
                  evidenceStatus: reliability.clientEvidenceState === "market_supported"
                    ? "Market-supported"
                    : reliability.clientEvidenceState === "provisional" ? "Provisional" : "Expert review needed",
                  source: valuation.source,
                  sourceCoverage: reliability.professionalEvidence.sourceCoverage,
                  vehicleMatch: reliability.professionalEvidence.vehicleMatch,
                  recency: reliability.professionalEvidence.recency,
                  adjustments: reliability.professionalEvidence.adjustments,
                  limitations: reliability.professionalEvidence.limitations,
                  clientMessage: reliability.clientMessage,
                  decisionSupportBoundary: "This does not create a policy, premium, sum insured, claim, repair cost, or settlement value.",
                }),
                status: reliability.professionalEvidence.requiresHumanReview ? "review_required" : "complete",
              } as any)
              .where(eq(clientVehicleValuationRequests.id, requestId));
          }
        } catch (err) {
          console.error(`[Phase7] Valuation pipeline failed for request ${requestId}:`, err);
        }
      });

      return {
        success: true,
        requestId,
        requestNumber,
        submissionToken: token,
        inspectionRequired: inspectionRequired === 1,
        message: inspectionRequired
          ? "Your fleet valuation request has been received. A physical inspection may be required."
          : "Your valuation request has been received. KINGA Market Valuation will be prepared as evidence-qualified decision support.",
      };
    }),

  /**
   * Public procedure — get teaser report by submission token.
   * Returns locked summary (value range, condition, forensics status).
   * Full report only returned if reportGatingStatus = 'full' or 'paid'.
   */
  getTeaserReport: publicProcedure
    .input(z.object({
      token: z.string(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const valuationRows = await db.select().from(clientVehicleValuationRequests)
        .where(eq(clientVehicleValuationRequests.submissionToken, input.token))
        .limit(1);
      const valuationRequest = valuationRows[0];
      if (valuationRequest) {
        const valuation = valuationRequest.kingaMarketValuationCents;
        const provenance = valuationRequest.valuationProvenanceJson
          ? JSON.parse(valuationRequest.valuationProvenanceJson)
          : null;
        return {
          requestNumber: valuationRequest.requestNumber,
          vehicleMake: valuationRequest.vehicleMake,
          vehicleModel: valuationRequest.vehicleModel,
          vehicleYear: valuationRequest.vehicleYear,
          condition: valuationRequest.condition,
          status: valuationRequest.status,
          forensicsStatus: "not_applicable",
          reportGatingStatus: "teaser",
          isStandaloneValuation: true,
          inspectionRequired: false,
          createdAt: valuationRequest.createdAt,
          valueLow: valuation ? Math.round(valuation * 0.9) : null,
          valueHigh: valuation ? Math.round(valuation * 1.1) : null,
          valuationEvidenceStatus: provenance?.evidenceStatus ?? null,
          valuationEvidenceMessage: provenance?.clientMessage ?? null,
          fullReport: valuation ? {
            estimatedMarketValue: valuation,
            vehicleForensicsJson: null,
            vehicleRiskScore: null,
            quoteNotes: "KINGA Market Valuation — evidence-qualified decision support.",
            quotedPremium: null,
            quoteValidUntil: null,
            reportUnlockedAt: null,
          } : null,
        };
      }

      const rows = await db.select().from(quotationRequests)
        .where(eq(quotationRequests.submissionToken as any, input.token))
        .limit(1);

      if (!rows.length) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Request not found" });
      }

      const req = rows[0] as any;
      const isFullUnlocked = req.reportGatingStatus === "full" || req.reportGatingStatus === "paid";

      // Always return teaser fields
        const teaser = {
          sourceLifecycle: "legacy_quotation_history" as const,
          legacyHistoryNotice: "This is a legacy quotation history record. It is not a standalone valuation or an insurance service request.",
          requestNumber: req.requestNumber,
        vehicleMake: req.vehicleMake,
        vehicleModel: req.vehicleModel,
        vehicleYear: req.vehicleYear,
        condition: req.condition,
        status: req.status,
        forensicsStatus: req.vehicleForensicsStatus,
        reportGatingStatus: req.reportGatingStatus,
        isStandaloneValuation: req.isStandaloneValuation === 1,
        inspectionRequired: req.inspectionRequired === 1,
        createdAt: req.createdAt,
        // Teaser value: range only (±10%)
        valueLow: req.vehicleValue ? Math.round(req.vehicleValue * 0.9) : null,
        valueHigh: req.vehicleValue ? Math.round(req.vehicleValue * 1.1) : null,
        // Full report fields — only if unlocked
        fullReport: isFullUnlocked ? {
          estimatedMarketValue: req.vehicleValue,
          vehicleForensicsJson: req.vehicleForensicsJson,
          vehicleRiskScore: req.vehicleRiskScore,
          quoteNotes: req.quoteNotes,
          quotedPremium: req.quotedPremium,
          quoteValidUntil: req.quoteValidUntil,
          reportUnlockedAt: req.reportUnlockedAt,
        } : null,
      };

      return teaser;
    }),

  /**
   * Protected procedure — get all valuation requests for the current user (by email match).
   * Used in the client profile page.
   */
  getMyRequests: protectedProcedure
    .query(async ({ ctx }) => {
      assertRestrictedAgencyAssistedCapability(ctx.user, "insurance_document_access");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const legacyRows = await db.select().from(quotationRequests)
        .where(eq(quotationRequests.email, ctx.user.email ?? ""))
        .orderBy(desc(quotationRequests.createdAt))
        .limit(50);
      const valuationRows = await db.select().from(clientVehicleValuationRequests)
        .where(eq(clientVehicleValuationRequests.email, ctx.user.email ?? ""))
        .orderBy(desc(clientVehicleValuationRequests.createdAt))
        .limit(50);
      const serviceRows = await db.select().from(clientInsuranceServiceRequests)
        .where(eq(clientInsuranceServiceRequests.userId, ctx.user.id))
        .orderBy(desc(clientInsuranceServiceRequests.createdAt))
        .limit(50);

      return [
        ...valuationRows.map((row) => ({
          ...row,
          sourceLifecycle: "standalone_valuation" as const,
          isStandaloneValuation: 1,
          vehicleValue: row.kingaMarketValuationCents,
          reportGatingStatus: "teaser",
          quoteNotes: "KINGA Market Valuation — evidence-qualified decision support.",
        })),
        ...serviceRows.map((row) => ({
          ...row,
          sourceLifecycle: "insurance_service_request" as const,
          isStandaloneValuation: 0,
          vehicleMake: "Insurance service request",
          vehicleModel: row.coverType,
          vehicleYear: null,
          vehicleValue: row.clientProposedValueCents,
          reportGatingStatus: "not_applicable",
          quoteNotes: "Service request only. No quote, premium, policy, claim, repair cost, or settlement decision exists in this record.",
        })),
        ...legacyRows.map((row) => ({ ...row, sourceLifecycle: "legacy_quotation_history" as const })),
      ].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    }),

  /**
   * Protected procedure — unlock full report on policy issuance.
   * Called by the agency/insurer when a policy is issued.
   * Requires agency or insurer role.
   */
  unlockReportOnPolicyIssuance: protectedProcedure
    .input(z.object({
      quotationRequestId: z.number(),
      tenantId: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const scope = await resolveLegacyValuationScope(ctx, input.tenantId, "insuranceV2.unlockReportOnPolicyIssuance");
      const [request] = await db.select({ id: quotationRequests.id })
        .from(quotationRequests)
        .where(and(eq(quotationRequests.id, input.quotationRequestId), eq(quotationRequests.tenantId, scope.tenantId)))
        .limit(1);
      if (!request) throw new TRPCError({ code: "NOT_FOUND", message: "Legacy valuation history record not found." });

      await db.update(quotationRequests)
        .set({
          reportGatingStatus: "full",
          reportUnlockedAt: new Date().toISOString(),
          status: "accepted",
        } as any)
        .where(and(eq(quotationRequests.id, input.quotationRequestId), eq(quotationRequests.tenantId, scope.tenantId)));
      await auditP0CrossTenantAccess(ctx, scope, "legacy_valuation_report_unlock", String(input.quotationRequestId));

      return { success: true };
    }),

  /**
   * Agency procedure — get all incoming valuation requests for the agency's tenant.
   * Returns full KINGA report data to the agency broker.
   */
  getValuationRequests: protectedProcedure
    .input(z.object({
      status: z.string().optional(),
      limit: z.number().int().min(1).max(100).default(50),
      tenantId: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const scope = await resolveLegacyValuationScope(ctx, input.tenantId, "insuranceV2.getValuationRequests");

      const rows = await db.select().from(quotationRequests)
        .where(eq(quotationRequests.tenantId, scope.tenantId))
        .orderBy(desc(quotationRequests.createdAt))
        .limit(input.limit);
      await auditP0CrossTenantAccess(ctx, scope, "legacy_valuation_history_list", "legacy_quotation_history");

      return rows.map((row) => ({
        ...row,
        sourceLifecycle: "legacy_quotation_history" as const,
        legacyHistoryNotice: "This is a legacy quotation history record. It is not a standalone valuation or an insurance service request.",
      }));
    }),

  /**
   * Agency procedure — assign inspector to a fleet inspection request.
   */
  assignInspector: protectedProcedure
    .input(z.object({
      quotationRequestId: z.number(),
      inspectorUserId: z.number(),
      notes: z.string().optional(),
      tenantId: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const scope = await resolveLegacyValuationScope(ctx, input.tenantId, "insuranceV2.assignInspector");
      const [request] = await db.select({ id: quotationRequests.id })
        .from(quotationRequests)
        .where(and(eq(quotationRequests.id, input.quotationRequestId), eq(quotationRequests.tenantId, scope.tenantId)))
        .limit(1);
      if (!request) throw new TRPCError({ code: "NOT_FOUND", message: "Legacy valuation history record not found." });
      const [inspector] = await db.select({ id: users.id })
        .from(users)
        .where(and(eq(users.id, input.inspectorUserId), eq(users.tenantId, scope.tenantId)))
        .limit(1);
      if (!inspector) throw new TRPCError({ code: "NOT_FOUND", message: "Inspector not found in the selected tenant." });

      await db.update(quotationRequests)
        .set({
          inspectionAssignedTo: input.inspectorUserId,
          status: "under_review",
        } as any)
        .where(and(eq(quotationRequests.id, input.quotationRequestId), eq(quotationRequests.tenantId, scope.tenantId)));
      await auditP0CrossTenantAccess(ctx, scope, "legacy_valuation_inspector_assignment", String(input.quotationRequestId));

      return { success: true };
    }),

  /**
   * Agency procedure — send a quote to the client for a valuation/insurance request.
   * Sets status to 'quoted', records premium/excess/notes, and sends an in-app notification.
   */
  sendQuoteToClient: protectedProcedure
    .input(z.object({
      quotationRequestId: z.number(),
      quotedPremium: z.number().positive("Premium must be positive"),
      quotedAnnualPremium: z.number().positive().optional(),
      quotedExcess: z.number().min(0).optional(),
      quoteNotes: z.string().optional(),
      quoteValidDays: z.number().min(1).max(90).default(30),
      tenantId: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const scope = await resolveLegacyValuationScope(ctx, input.tenantId, "insuranceV2.sendQuoteToClient");
      const [request] = await db.select().from(quotationRequests)
        .where(and(eq(quotationRequests.id, input.quotationRequestId), eq(quotationRequests.tenantId, scope.tenantId)))
        .limit(1);
      if (!request) throw new TRPCError({ code: "NOT_FOUND", message: "Legacy valuation history record not found." });
      const validUntil = new Date();
      validUntil.setDate(validUntil.getDate() + input.quoteValidDays);
      await db.update(quotationRequests)
        .set({
          status: "quoted",
          quotedPremium: input.quotedPremium,
          quotedAnnualPremium: input.quotedAnnualPremium ?? input.quotedPremium * 12,
          quotedExcess: input.quotedExcess ?? 0,
          quoteNotes: input.quoteNotes ?? null,
          quoteValidUntil: validUntil.toISOString().slice(0, 19).replace("T", " "),
          assignedAgentId: ctx.user.id,
        } as any)
        .where(and(eq(quotationRequests.id, input.quotationRequestId), eq(quotationRequests.tenantId, scope.tenantId)));
      await auditP0CrossTenantAccess(ctx, scope, "legacy_valuation_quote_send", String(input.quotationRequestId));
      // Send in-app notification to the client if they have a userId
      if ((request as any).userId) {
        try {
          const { createNotification } = await import("../db");
          await createNotification({
            userId: (request as any).userId,
            tenantId: scope.tenantId,
            title: "Your Insurance Quote Is Ready",
            message: `Your quote for ${request.vehicleMake} ${request.vehicleModel} (${request.vehicleYear}) is ready. Monthly premium: $${input.quotedPremium.toLocaleString()}. Valid for ${input.quoteValidDays} days. Log in to review and accept your quote.`,
            type: "status_changed",
            entityType: "quotation_request",
            entityId: input.quotationRequestId,
            actionUrl: `/my-profile`,
            priority: "high",
          });
        } catch (_notifyErr) { /* non-fatal */ }
      }
      return { success: true, quoteValidUntil: validUntil.toISOString() };
    }),

  /**
   * Client procedure — accept a quote that has been sent by an agency.
   * Sets status to 'accepted' and notifies the assigned agent.
   */
  acceptQuote: protectedProcedure
    .input(z.object({
      quotationRequestId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      assertRestrictedAgencyAssistedCapability(ctx.user, "insurance_quote_acceptance");
      const tenantId = ctx.user.tenantId;
      if (!tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "Tenant required" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const [request] = await db.select().from(quotationRequests)
        .where(and(
          eq(quotationRequests.id, input.quotationRequestId),
          eq(quotationRequests.tenantId, tenantId),
        ))
        .limit(1);
      if (!request) throw new TRPCError({ code: "NOT_FOUND", message: "Quotation request not found" });
      // Only the client who submitted the request (matched by email) may accept it
      const isOwner = (request as any).userId === ctx.user.id ||
        request.email === ctx.user.email;
      if (!isOwner) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only the client who submitted this request may accept the quote" });
      }
      if (request.status !== "quoted") {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Quote can only be accepted when status is 'quoted' (current: ${request.status})` });
      }
      if (request.quoteValidUntil && new Date(request.quoteValidUntil) < new Date()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This quote has expired. Please contact your agent for a new quote." });
      }
      await db.update(quotationRequests)
        .set({ status: "accepted" } as any)
        .where(and(
          eq(quotationRequests.id, input.quotationRequestId),
          eq(quotationRequests.tenantId, tenantId),
        ));
      // Notify the assigned agent
      if (request.assignedAgentId) {
        try {
          const { createNotification } = await import("../db");
          await createNotification({
            userId: request.assignedAgentId,
            tenantId,
            title: "Quote Accepted by Client",
            message: `The client has accepted the quote for ${request.vehicleMake} ${request.vehicleModel} (${request.vehicleYear}). Request #${request.requestNumber}. Please proceed with policy issuance.`,
            type: "status_changed",
            entityType: "quotation_request",
            entityId: input.quotationRequestId,
            actionUrl: `/agency/valuation-inbox`,
            priority: "high",
          });
        } catch (_notifyErr) { /* non-fatal */ }
      }
      return { success: true };
    }),

  /**
   * Agent sends a document (PDF/image) to a client linked to a quotation request.
   * File is uploaded to S3, recorded in quotation_request_documents, and an
   * in-app notification is sent to the client.
   */
  sendDocumentToClient: protectedProcedure
    .input(z.object({
      quotationRequestId: z.number(),
      documentType: z.enum([
        'policy_schedule','certificate_of_insurance','endorsement',
        'renewal_notice','cancellation_notice','cover_note',
        'debit_note','claim_form','proposal_form','other'
      ]).default('other'),
      title: z.string().min(1).max(255),
      fileName: z.string().min(1).max(255),
      fileData: z.string(), // base64 encoded (may include data URI prefix)
      mimeType: z.string().optional(),
      notes: z.string().max(1000).optional(),
      emailToClient: z.boolean().default(false),
      tenantId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      assertRestrictedAgencyAssistedCapability(ctx.user, "insurance_document_access");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const scope = await resolveLegacyValuationScope(ctx, input.tenantId, "insuranceV2.sendDocumentToClient");
      // Verify the legacy history record is tenant-scoped before upload.
      const [request] = await db.select()
        .from(quotationRequests)
        .where(and(eq(quotationRequests.id, input.quotationRequestId), eq(quotationRequests.tenantId, scope.tenantId)))
        .limit(1);
      if (!request) throw new TRPCError({ code: "NOT_FOUND", message: "Legacy valuation history record not found." });
      // Upload to S3
      const rawBase64 = input.fileData.includes(",") ? input.fileData.split(",")[1] : input.fileData;
      const buffer = Buffer.from(rawBase64, "base64");
      const { nanoid } = await import("nanoid");
      const fileKey = `policy-docs/${input.quotationRequestId}/${Date.now()}-${nanoid(6)}-${input.fileName}`;
      const { url: fileUrl } = await storagePut(fileKey, buffer, input.mimeType || "application/octet-stream");
      // Record in DB
      await db.insert(quotationRequestDocuments).values({
        quotationRequestId: input.quotationRequestId,
        clientUserId: request.userId ?? null,
        documentType: input.documentType,
        title: input.title,
        fileName: input.fileName,
        fileUrl,
        s3Key: fileKey,
        fileSize: buffer.length,
        mimeType: input.mimeType ?? null,
        sentByAgentId: ctx.user.id,
        deliveredToClient: 1,
        emailedToClient: input.emailToClient ? 1 : 0,
        notes: input.notes ?? null,
      } as any);
      // In-app notification to client
      if (request.userId) {
        try {
          const { createNotification } = await import("../db");
          await createNotification({
            userId: request.userId,
            tenantId: scope.tenantId,
            title: `Document from Your Agent: ${input.title}`,
            message: `Your agent has sent you a document: "${input.title}" for your ${request.vehicleMake} ${request.vehicleModel} (${request.vehicleYear}). You can view and download it from your Client Portal under Insurance → Documents.`,
            type: "document_received",
            entityType: "quotation_request",
            entityId: input.quotationRequestId,
            actionUrl: `/client`,
            priority: "normal",
          });
        } catch (_notifyErr) { /* non-fatal */ }
      }
      await auditP0CrossTenantAccess(ctx, scope, "legacy_valuation_document_send", String(input.quotationRequestId));
      return { success: true, fileUrl };
    }),

  /**
   * Phase 10 — Submit a multi-product insurance request (motor or non-motor).
   * For motor products, wraps the existing submitValuationRequest logic.
   * For non-motor products, creates a quotation request with product-specific fields.
   */
  submitRequest: protectedProcedure
    .input(z.object({
      // Product selection
      insuranceType: z.string().min(1),
      productCategory: z.enum(['motor','property','engineering','liability','bonds','personal','other']).default('motor'),
      // Contact
      fullName: z.string().min(2),
      email: z.string().email(),
      phone: z.string().optional(),
      // Motor fields (required for motor products)
      vehicleMake: z.string().default('N/A'),
      vehicleModel: z.string().default('N/A'),
      vehicleYear: z.number().int().min(1970).max(new Date().getFullYear() + 1).default(new Date().getFullYear()),
      vehicleRegistration: z.string().optional(),
      vehicleValue: z.number().int().min(0).optional(),
      // Non-motor fields
      insuredAssetDescription: z.string().optional(),
      insuredAssetValue: z.number().int().min(0).optional(),
      coverageAddress: z.string().optional(),
      businessType: z.string().optional(),
      projectValue: z.number().int().min(0).optional(),
      projectDurationMonths: z.number().int().min(1).optional(),
      bondType: z.string().optional(),
      bondAmount: z.number().int().min(0).optional(),
      bondBeneficiary: z.string().optional(),
      additionalCover: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      assertRestrictedAgencyAssistedCapability(ctx.user, "insurance_request");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const token = generateToken();
      const requestNumber = `INS-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
      const motorTypes = ['comprehensive','third_party','third_party_fire_theft','fleet','commercial'];
      const safeInsuranceType = motorTypes.includes(input.insuranceType) ? input.insuranceType : 'comprehensive';
      const [result] = await db.insert(clientInsuranceServiceRequests).values({
        requestNumber,
        userId: ctx.user.id,
        fullName: input.fullName,
        email: input.email,
        phone: input.phone ?? '',
        productCategory: input.productCategory,
        vehicleRegistration: input.vehicleRegistration ?? null,
        coverType: safeInsuranceType,
        clientProposedValueCents: input.productCategory === "motor" ? input.vehicleValue ?? null : input.insuredAssetValue ?? null,
        requestPayloadJson: JSON.stringify({
          vehicle: input.productCategory === "motor" ? { make: input.vehicleMake, model: input.vehicleModel, year: input.vehicleYear, registration: input.vehicleRegistration ?? null, clientProposedValueCents: input.vehicleValue ?? null } : null,
          asset: input.productCategory !== "motor" ? { description: input.insuredAssetDescription ?? null, clientProposedValueCents: input.insuredAssetValue ?? null, coverageAddress: input.coverageAddress ?? null, businessType: input.businessType ?? null, projectValue: input.projectValue ?? null, projectDurationMonths: input.projectDurationMonths ?? null, bondType: input.bondType ?? null, bondAmount: input.bondAmount ?? null, bondBeneficiary: input.bondBeneficiary ?? null } : null,
          additionalCover: input.additionalCover ?? null,
        }),
        status: 'submitted',
        submissionToken: token,
      } as any);
      const requestId = (result as any).insertId;
      // Notify owner/admin of new request
      try {
        const { notifyOwner } = await import('../_core/notification');
        await notifyOwner({
          title: `New Insurance Request: ${input.insuranceType.replace(/_/g,' ')}`,
          content: `${input.fullName} (${input.email}) has submitted a new ${input.productCategory} insurance request (${input.insuranceType.replace(/_/g,' ')}). Request #${requestNumber}.`,
        });
      } catch (_e) { /* non-fatal */ }
      return { success: true, requestId, requestNumber, submissionToken: token };
    }),

  /**
   * Client retrieves all documents sent to them by agents.
   */
  getMyDocuments: protectedProcedure
    .query(async ({ ctx }) => {
      assertRestrictedAgencyAssistedCapability(ctx.user, "insurance_document_access");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const docs = await db.select()
        .from(quotationRequestDocuments)
        .where(eq(quotationRequestDocuments.clientUserId, ctx.user.id))
        .orderBy(desc(quotationRequestDocuments.createdAt));
      return docs;
    }),
});
