
/**
 * KINGA Agency Router
 * 
 * Handles insurance quotation requests, policy renewals, and document uploads
 * for the KINGA Agency portal. Clients can request quotes, manage renewals,
 * and upload supporting documents.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, publicProcedure } from "../_core/trpc";
import { agencyDomainProcedure as agencyProcedure } from "../_core/domain-middleware";
import { getDb } from "../db";
import { 
  quotationRequests,
  insurancePolicies,
  agencyDocuments,
} from "../../drizzle/schema";
import { eq, desc, and, or, sql } from "drizzle-orm";
import { storagePut } from "../storage";
import { nanoid } from "nanoid";
import { generateVehicleValuation } from "../insurance/valuation-engine";

const db = getDb();

async function requireOwnedLegacyAgencyTarget(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  userId: number,
  quotationRequestId?: number,
  policyId?: number,
) {
  if ((quotationRequestId == null && policyId == null) || (quotationRequestId != null && policyId != null)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Provide exactly one quotation request or policy target." });
  }

  if (quotationRequestId != null) {
    const [quotation] = await db.select({ id: quotationRequests.id, vehicleRegistration: quotationRequests.vehicleRegistration })
      .from(quotationRequests)
      .where(and(eq(quotationRequests.id, quotationRequestId), eq(quotationRequests.userId, userId)))
      .limit(1);
    if (!quotation) throw new TRPCError({ code: "NOT_FOUND", message: "Quotation request not found." });
    return { quotation, policy: null };
  }

  const [policy] = await db.select({ id: insurancePolicies.id })
    .from(insurancePolicies)
    .where(and(eq(insurancePolicies.id, policyId!), eq(insurancePolicies.customerId, userId)))
    .limit(1);
  if (!policy) throw new TRPCError({ code: "NOT_FOUND", message: "Policy not found." });
  return { quotation: null, policy };
}

export const agencyRouter = router({
  /**
   * Submit a new insurance quotation request
   */
  submitQuotation: protectedProcedure
    .input(z.object({
      fullName: z.string().min(2),
      email: z.string().email(),
      phone: z.string().optional(),
      idNumber: z.string().optional(),
      insuranceType: z.enum(["comprehensive", "third_party", "third_party_fire_theft", "fleet", "commercial"]),
      vehicleMake: z.string().min(1),
      vehicleModel: z.string().min(1),
      vehicleYear: z.number().min(1990).max(2030),
      vehicleRegistration: z.string().optional(),
      vehicleVin: z.string().optional(),
      vehicleValue: z.number().optional(), // In cents
      vehicleUsage: z.enum(["private", "business", "both"]).optional(),
      driverAge: z.number().optional(),
      driverLicenseYears: z.number().optional(),
      claimsHistory: z.number().optional(),
      additionalCover: z.array(z.string()).optional(), // roadside, car_hire, windscreen, etc.
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const requestNumber = `QR-${nanoid(8).toUpperCase()}`;

      const [result] = await db.insert(quotationRequests).values({
        requestNumber,
        userId: ctx.user?.id,
        fullName: input.fullName,
        email: input.email,
        phone: input.phone || null,
        idNumber: input.idNumber || null,
        insuranceType: input.insuranceType,
        vehicleMake: input.vehicleMake,
        vehicleModel: input.vehicleModel,
        vehicleYear: input.vehicleYear,
        vehicleRegistration: input.vehicleRegistration || null,
        vehicleVin: input.vehicleVin || null,
        vehicleValue: input.vehicleValue || null,
        vehicleUsage: input.vehicleUsage || "private",
        driverAge: input.driverAge || null,
        driverLicenseYears: input.driverLicenseYears || null,
        claimsHistory: input.claimsHistory || 0,
        additionalCover: input.additionalCover ? JSON.stringify(input.additionalCover) : null,
        status: "pending",
      }).$returningId();

      return { success: true, requestNumber, id: (result as Array<{id: number}>)[0]?.id };
    }),

  /**
   * Get user's quotation requests
   */
  myQuotations: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const quotes = await db
        .select()
        .from(quotationRequests)
        .where(eq(quotationRequests.userId, ctx.user!.id))
        .orderBy(desc(quotationRequests.createdAt));

      return quotes;
    }),

  /**
   * Get all quotation requests (admin/insurer view)
   */
  allQuotations: protectedProcedure
    .input(z.object({
      status: z.string().optional(),
      limit: z.number().default(20),
      offset: z.number().default(0),
    }))
    .query(async () => {
      throw new TRPCError({ code: "FORBIDDEN", message: "Legacy cross-record quotation administration is unavailable. Use the governed insurer or agency service workflow." });
    }),

  /**
   * Update quotation status and provide quote (admin/insurer)
   */
  updateQuotation: protectedProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(["pending", "under_review", "quoted", "accepted", "rejected", "expired"]),
      quotedPremium: z.number().optional(),
      quotedAnnualPremium: z.number().optional(),
      quotedExcess: z.number().optional(),
      quoteValidUntil: z.string().optional(),
      quoteNotes: z.string().optional(),
    }))
    .mutation(async () => {
      throw new TRPCError({ code: "FORBIDDEN", message: "Legacy cross-record quotation updates are unavailable. Use the governed insurer service workflow." });
    }),

  /**
   * Get user's insurance policies (for renewals)
   */
  myPolicies: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const policies = await db
        .select()
        .from(insurancePolicies)
        .where(eq(insurancePolicies.customerId, ctx.user!.id))
        .orderBy(desc(insurancePolicies.createdAt));

      return policies;
    }),

  /**
   * Get all policies (admin/insurer view)
   */
  allPolicies: protectedProcedure
    .input(z.object({
      status: z.string().optional(),
      limit: z.number().default(20),
      offset: z.number().default(0),
    }))
    .query(async () => {
      throw new TRPCError({ code: "FORBIDDEN", message: "Legacy cross-record policy administration is unavailable. Use the governed insurer service workflow." });
    }),

  /**
   * Request policy renewal
   */
  requestRenewal: protectedProcedure
    .input(z.object({
      policyId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Verify policy belongs to user
      const [policy] = await db
        .select()
        .from(insurancePolicies)
        .where(and(
          eq(insurancePolicies.id, input.policyId),
          eq(insurancePolicies.customerId, ctx.user!.id)
        ));

      if (!policy) throw new Error("Policy not found");

      // Update renewal status
      await db
        .update(insurancePolicies)
        .set({
          status: "pending" as any,
          renewalReminderSent: 1,
        })
        .where(eq(insurancePolicies.id, input.policyId));

      return { success: true };
    }),

  /**
   * Upload document for a quotation request or policy
   */
  uploadDocument: protectedProcedure
    .input(z.object({
      quotationRequestId: z.number().optional(),
      policyId: z.number().optional(),
      documentType: z.enum([
        "id_document", "drivers_license", "vehicle_registration",
        "proof_of_address", "bank_statement", "vehicle_photos",
        "previous_policy", "claims_history", "other"
      ]),
      title: z.string(),
      fileName: z.string(),
      fileData: z.string(), // Base64 encoded
      mimeType: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const target = await requireOwnedLegacyAgencyTarget(db, ctx.user!.id, input.quotationRequestId, input.policyId);

      // Upload to S3
      const buffer = Buffer.from(input.fileData.split(",").pop() || input.fileData, "base64");
      const fileKey = `agency-docs/${ctx.user!.id}/${Date.now()}-${nanoid(6)}-${input.fileName}`;
      const { url: fileUrl } = await storagePut(fileKey, buffer, input.mimeType || "application/octet-stream");

      const [result] = await db.insert(agencyDocuments).values({
        quotationRequestId: input.quotationRequestId || null,
        policyId: input.policyId || null,
        documentType: input.documentType,
        title: input.title,
        fileName: input.fileName,
        fileUrl,
        fileSize: buffer.length,
        mimeType: input.mimeType || null,
        uploadedBy: ctx.user!.id,
      }).$returningId();

      // C-02: If this is a vehicle photo, trigger Photo Forensics Engine + Damage Detection AI
      // This runs fire-and-forget so the upload response is immediate.
      // Results are stored against the quotation request for the Agency dashboard to display.
      if (input.documentType === 'vehicle_photos' && target.quotation) {
        const quotationId = target.quotation.id;
        // Mark as processing immediately so the UI can show a spinner
        await db.update(quotationRequests)
          .set({ vehicleForensicsStatus: 'processing' })
          .where(eq(quotationRequests.id, quotationId));
        // Fire-and-forget: run forensics in background
        (async () => {
          try {
            const { runPhotoForensics } = await import('../pipeline-v2/photoForensicsEngine');
            const forensicsResult = await runPhotoForensics([fileUrl], true);
            // Compute a risk score 0-100:
            // Base 50, +20 if any suspicious photo, +15 if AI generation detected,
            // +10 if any manipulation, -10 if no flags at all
            let riskScore = 50;
            if (forensicsResult.anySuspicious) riskScore += 20;
            if (forensicsResult.aiGenerationFlag) riskScore += 15;
            const hasManipulation = forensicsResult.photos.some(
              p => p.analysisResult?.manipulation_indicators?.manipulation_score &&
                   p.analysisResult.manipulation_indicators.manipulation_score > 0.3
            );
            if (hasManipulation) riskScore += 10;
            if (!forensicsResult.anySuspicious && !forensicsResult.aiGenerationFlag) riskScore -= 10;
            riskScore = Math.max(0, Math.min(100, riskScore));
            await db.update(quotationRequests)
              .set({
                vehicleForensicsJson: JSON.stringify(forensicsResult),
                vehicleRiskScore: riskScore,
                vehicleForensicsStatus: 'complete',
              })
              .where(eq(quotationRequests.id, quotationId));
          } catch (err) {
            console.error('[Agency C-02] Photo forensics failed for quotation', quotationId, err);
            await db.update(quotationRequests)
              .set({ vehicleForensicsStatus: 'failed' })
              .where(eq(quotationRequests.id, quotationId));
          }
        })();
      }

      return { success: true, documentId: (result as Array<{id: number}>)[0]?.id, fileUrl };
    }),

  /**
   * Get documents for a quotation request or policy
   */
  getDocuments: protectedProcedure
    .input(z.object({
      quotationRequestId: z.number().optional(),
      policyId: z.number().optional(),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const target = await requireOwnedLegacyAgencyTarget(db, ctx.user!.id, input.quotationRequestId, input.policyId);

      const docs = await db
        .select()
        .from(agencyDocuments)
        .where(target.quotation
          ? eq(agencyDocuments.quotationRequestId, target.quotation.id)
          : eq(agencyDocuments.policyId, target.policy!.id))
        .orderBy(desc(agencyDocuments.createdAt));

      return docs;
    }),

  /**
   * Delete a document
   */  deleteDocument: protectedProcedure
    .input(z.object({
      documentId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      // Verify ownership
      const [doc] = await db
        .select()
        .from(agencyDocuments)
        .where(and(
          eq(agencyDocuments.id, input.documentId),
          eq(agencyDocuments.uploadedBy, ctx.user!.id)
        ));
      if (!doc) throw new Error("Document not found or access denied");
      await db
        .delete(agencyDocuments)
        .where(eq(agencyDocuments.id, input.documentId));
      return { success: true };
    }),

  /**
   * H-01: Get vehicle risk intelligence from KINGA vehicle registry.
   * Returns risk profile for a vehicle by registration number.
   */
  getVehicleRiskIntelligence: protectedProcedure
    .input(z.object({
      registrationNumber: z.string().min(1).max(30),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return null;
      const { vehicleRegistry } = await import('../../drizzle/schema');
      const { eq } = await import('drizzle-orm');
      const reg = input.registrationNumber.toUpperCase().replace(/\s/g, '');
      const [ownedQuotation] = await db
        .select({ id: quotationRequests.id })
        .from(quotationRequests)
        .where(and(
          eq(quotationRequests.userId, ctx.user!.id),
          eq(quotationRequests.vehicleRegistration, reg),
        ))
        .limit(1);
      if (!ownedQuotation) return { found: false as const };
      const [vehicle] = await db
        .select({
          id: vehicleRegistry.id,
          vehicleRiskScore: vehicleRegistry.vehicleRiskScore,
          isRepeatClaimer: vehicleRegistry.isRepeatClaimer,
          isSalvageTitle: vehicleRegistry.isSalvageTitle,
          isStolen: vehicleRegistry.isStolen,
          isWrittenOff: vehicleRegistry.isWrittenOff,
          totalClaimsCount: vehicleRegistry.totalClaimsCount,
          totalRepairCostCents: vehicleRegistry.totalRepairCostCents,
          lastClaimDate: vehicleRegistry.lastClaimDate,
          hasSuspiciousDamagePattern: vehicleRegistry.hasSuspiciousDamagePattern,
          damageZoneCountsJson: vehicleRegistry.damageZoneCountsJson,
        })
        .from(vehicleRegistry)
        .where(eq(vehicleRegistry.registrationNumber, reg))
        .limit(1);
      if (!vehicle) return { found: false as const };
      return {
        found: true as const,
        vehicleRiskScore: vehicle.vehicleRiskScore,
        isRepeatClaimer: vehicle.isRepeatClaimer === 1,
        isSalvageTitle: vehicle.isSalvageTitle === 1,
        isStolen: vehicle.isStolen === 1,
        isWrittenOff: vehicle.isWrittenOff === 1,
        totalClaimsCount: vehicle.totalClaimsCount,
        totalRepairCostCents: vehicle.totalRepairCostCents,
        lastClaimDate: vehicle.lastClaimDate ?? null,
        hasSuspiciousDamagePattern: vehicle.hasSuspiciousDamagePattern === 1,
        damageZoneCounts: vehicle.damageZoneCountsJson ? JSON.parse(vehicle.damageZoneCountsJson) : null,
      };
    }),

  /**
   * C-02: Get vehicle photo forensics result for a quotation request.
   * Returns the forensics status and results so the UI can poll and display.
   */
  getVehicleForensics: protectedProcedure
    .input(z.object({
      quotationRequestId: z.number(),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      const [row] = await db
        .select({
          id: quotationRequests.id,
          vehicleForensicsStatus: quotationRequests.vehicleForensicsStatus,
          vehicleRiskScore: quotationRequests.vehicleRiskScore,
          vehicleForensicsJson: quotationRequests.vehicleForensicsJson,
        })
        .from(quotationRequests)
        .where(and(
          eq(quotationRequests.id, input.quotationRequestId),
          eq(quotationRequests.userId, ctx.user!.id)
        ));
      if (!row) return null;
      return {
        status: row.vehicleForensicsStatus ?? 'not_started',
        riskScore: row.vehicleRiskScore ?? null,
        result: row.vehicleForensicsJson ? JSON.parse(row.vehicleForensicsJson) : null,
      };
    }),

  /**
   * T9: Get vehicle valuation using KINGA claims intelligence.
   *
   * Restricted to agency role (agencyProcedure guard).
   * Optional valuationDate allows historical point-in-time queries:
   * market data and claims are filtered to records on or before that date.
   */
  getValuation: agencyProcedure
    .input(z.object({
      make: z.string().min(1).max(100),
      model: z.string().min(1).max(100),
      year: z.number().int().min(1950).max(new Date().getFullYear() + 1),
      registrationNumber: z.string().max(20).optional(),
      condition: z.enum(["excellent", "good", "fair", "poor"]).optional().default("good"),
      mileage: z.number().int().min(0).optional(),
      /**
       * Optional ISO-8601 date string. When supplied, the engine filters
       * vehicleMarketValuations.valuation_date <= valuationDate and
       * claims.created_at <= valuationDate so the result reflects the
       * market as it stood at that point in time.
       * Defaults to the current date when omitted.
       */
      valuationDate: z.string().datetime({ offset: true }).optional(),
    }))
    .query(async ({ input }) => {
      const valuationDate = input.valuationDate
        ? new Date(input.valuationDate)
        : new Date();

      const result = await generateVehicleValuation({
        make: input.make,
        model: input.model,
        year: input.year,
        registrationNumber: input.registrationNumber,
        condition: input.condition,
        mileage: input.mileage,
        valuationDate,
      });

      return {
        ...result,
        valuationDate: valuationDate.toISOString(),
      };
    }),
  /**
   * Phase 4A: Bulk vehicle valuation — accepts up to 50 vehicles and
   * returns a valuation for each using the KINGA valuation engine.
   */
  bulkValuate: agencyProcedure
    .input(z.object({
      vehicles: z.array(z.object({
        rowIndex: z.number().int(),
        make: z.string().min(1).max(100),
        model: z.string().min(1).max(100),
        year: z.number().int().min(1950).max(new Date().getFullYear() + 1),
        registrationNumber: z.string().max(20).optional(),
        condition: z.enum(["excellent", "good", "fair", "poor"]).optional().default("good"),
        mileage: z.number().int().min(0).optional(),
      })).min(1).max(50),
    }))
    .mutation(async ({ input }) => {
      const valuationDate = new Date();
      const results = await Promise.allSettled(
        input.vehicles.map(async (v) => {
          const result = await generateVehicleValuation({
            make: v.make,
            model: v.model,
            year: v.year,
            registrationNumber: v.registrationNumber,
            condition: v.condition ?? "good",
            mileage: v.mileage,
            valuationDate,
          });
          return { rowIndex: v.rowIndex, ...v, ...result, valuationDate: valuationDate.toISOString() };
        })
      );
      return results.map((r, i) =>
        r.status === "fulfilled"
          ? { ...r.value, error: null }
          : { rowIndex: input.vehicles[i]?.rowIndex ?? i, make: input.vehicles[i]?.make ?? "", model: input.vehicles[i]?.model ?? "", year: input.vehicles[i]?.year ?? 0, error: r.reason?.message ?? "Valuation failed" }
      );
    }),

});
