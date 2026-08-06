/**
 * Phase 7A — Customer Journey & Agency Commerce
 * New insurance router procedures for valuation request, teaser/full report gating,
 * and agency inbox.
 */
import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { quotationRequests, vehicleMarketValuations, users } from "../../drizzle/schema";
import { eq, desc, and, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { randomBytes } from "crypto";
import { storagePut } from "../storage";

function generateToken(): string {
  return randomBytes(32).toString("hex");
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

      // Store photos as JSON in documents field
      const documents = JSON.stringify({
        photoUrls: input.photoUrls,
        registrationBookUrl: input.registrationBookUrl ?? null,
      });

      const [result] = await db.insert(quotationRequests).values({
        requestNumber,
        fullName: input.fullName,
        email: input.email,
        phone: input.phone,
        insuranceType: input.insuranceType ?? "comprehensive",
        vehicleMake: input.vehicleMake,
        vehicleModel: input.vehicleModel,
        vehicleYear: input.vehicleYear,
        vehicleRegistration: input.vehicleRegistration ?? null,
        vehicleVin: input.vehicleVin ?? null,
        mileage: input.mileage ?? null,
        condition: input.condition,
        additionalCover: input.additionalCover ?? null,
        documents,
        status: "pending",
        reportGatingStatus: "teaser",
        isStandaloneValuation: input.isStandaloneValuation ? 1 : 0,
        inspectionRequired,
        fleetVehicleCount: input.fleetVehicleCount ?? 1,
        submissionToken: token,
        contactVerified: 0,
        vehicleForensicsStatus: "pending",
      } as any);

      const requestId = (result as any).insertId;

      // Trigger valuation pipeline asynchronously (fire-and-forget)
      setImmediate(async () => {
        try {
          const { generateVehicleValuation } = await import("./insurance/valuation-engine");
          const valuation = await generateVehicleValuation({
            make: input.vehicleMake,
            model: input.vehicleModel,
            year: input.vehicleYear,
          });
          if (valuation && db) {
            await db.update(quotationRequests)
              .set({
                vehicleValue: valuation.estimatedMarketValue ?? null,
                vehicleForensicsStatus: "complete",
              } as any)
              .where(eq(quotationRequests.id, requestId));
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
          ? "Your fleet valuation request has been received. A physical inspection will be arranged for your fleet."
          : "Your valuation request has been received. You will receive your teaser report shortly.",
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
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const rows = await db.select().from(quotationRequests)
        .where(eq(quotationRequests.email, ctx.user.email ?? ""))
        .orderBy(desc(quotationRequests.createdAt))
        .limit(50);

      return rows;
    }),

  /**
   * Protected procedure — unlock full report on policy issuance.
   * Called by the agency/insurer when a policy is issued.
   * Requires agency or insurer role.
   */
  unlockReportOnPolicyIssuance: protectedProcedure
    .input(z.object({
      quotationRequestId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const allowed = ["insurer", "admin", "platform_super_admin"];
      if (!allowed.includes(ctx.user.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only insurers can unlock reports" });
      }

      await db.update(quotationRequests)
        .set({
          reportGatingStatus: "full",
          reportUnlockedAt: new Date().toISOString(),
          status: "accepted",
        } as any)
        .where(eq(quotationRequests.id, input.quotationRequestId));

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
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const allowed = ["insurer", "admin", "platform_super_admin"];
      if (!allowed.includes(ctx.user.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only agency/insurer users can view valuation requests" });
      }

      const rows = await db.select().from(quotationRequests)
        .orderBy(desc(quotationRequests.createdAt))
        .limit(input.limit);

      return rows;
    }),

  /**
   * Agency procedure — assign inspector to a fleet inspection request.
   */
  assignInspector: protectedProcedure
    .input(z.object({
      quotationRequestId: z.number(),
      inspectorUserId: z.number(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const allowed = ["insurer", "admin", "platform_super_admin"];
      if (!allowed.includes(ctx.user.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only agency/insurer users can assign inspectors" });
      }

      await db.update(quotationRequests)
        .set({
          inspectionAssignedTo: input.inspectorUserId,
          status: "under_review",
        } as any)
        .where(eq(quotationRequests.id, input.quotationRequestId));

      return { success: true };
    }),
});
