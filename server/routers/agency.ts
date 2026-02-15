/**
 * KINGA Agency Router
 * 
 * Handles insurance quotation requests, policy renewals, and document uploads
 * for the KINGA Agency portal. Clients can request quotes, manage renewals,
 * and upload supporting documents.
 */

import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { 
  quotationRequests,
  insurancePolicies,
  agencyDocuments,
} from "../../drizzle/schema";
import { eq, desc, and, or, sql } from "drizzle-orm";
import { storagePut } from "../storage";
import { nanoid } from "nanoid";

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

      return { success: true, requestNumber, id: result.id };
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
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const conditions = input.status 
        ? [eq(quotationRequests.status, input.status as any)]
        : [];

      const items = await db
        .select()
        .from(quotationRequests)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(quotationRequests.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      const [countResult] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(quotationRequests)
        .where(conditions.length > 0 ? and(...conditions) : undefined);

      return { items, total: countResult?.count ?? 0 };
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
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const updateData: any = { status: input.status };
      if (input.quotedPremium !== undefined) updateData.quotedPremium = input.quotedPremium;
      if (input.quotedAnnualPremium !== undefined) updateData.quotedAnnualPremium = input.quotedAnnualPremium;
      if (input.quotedExcess !== undefined) updateData.quotedExcess = input.quotedExcess;
      if (input.quoteValidUntil) updateData.quoteValidUntil = new Date(input.quoteValidUntil);
      if (input.quoteNotes) updateData.quoteNotes = input.quoteNotes;

      await db
        .update(quotationRequests)
        .set(updateData)
        .where(eq(quotationRequests.id, input.id));

      return { success: true };
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
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const conditions = input.status 
        ? [eq(insurancePolicies.status, input.status as any)]
        : [];

      const items = await db
        .select()
        .from(insurancePolicies)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(insurancePolicies.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      const [countResult] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(insurancePolicies)
        .where(conditions.length > 0 ? and(...conditions) : undefined);

      return { items, total: countResult?.count ?? 0 };
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

      return { success: true, documentId: result.id, fileUrl };
    }),

  /**
   * Get documents for a quotation request or policy
   */
  getDocuments: protectedProcedure
    .input(z.object({
      quotationRequestId: z.number().optional(),
      policyId: z.number().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const conditions = [];
      if (input.quotationRequestId) {
        conditions.push(eq(agencyDocuments.quotationRequestId, input.quotationRequestId));
      }
      if (input.policyId) {
        conditions.push(eq(agencyDocuments.policyId, input.policyId));
      }

      if (conditions.length === 0) return [];

      const docs = await db
        .select()
        .from(agencyDocuments)
        .where(conditions.length === 1 ? conditions[0] : or(...conditions))
        .orderBy(desc(agencyDocuments.createdAt));

      return docs;
    }),

  /**
   * Delete a document
   */
  deleteDocument: protectedProcedure
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
});
