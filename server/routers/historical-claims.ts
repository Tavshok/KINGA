/**
 * Historical Claims Intelligence Pipeline Router
 * 
 * Provides tRPC procedures for:
 * - Batch document upload and processing
 * - Historical claim management
 * - Ground truth capture (final approved costs)
 * - Manual correction interface
 * - Variance dataset generation
 * - Analytics queries (cost variance, assessor benchmarking, fraud patterns)
 */

import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import {
  historicalClaims,
  extractedRepairItems,
  costComponents,
  aiPredictionLogs,
  finalApprovalRecords,
  varianceDatasets,
  ingestionBatches,
  ingestionDocuments,
} from "../../drizzle/schema";
import { storagePut } from "../storage";
import { eq, and, desc, sql, count, avg, sum } from "drizzle-orm";
import crypto from "crypto";
import {
  processDocument,
  processBatchForHistoricalClaim,
  generateVarianceDatasets,
  type DocumentExtractionResult,
} from "../pipeline/document-intelligence";

export const historicalClaimsRouter = router({
  // ============================================================
  // BATCH UPLOAD & PROCESSING
  // ============================================================

  /**
   * Upload and process historical claim documents.
   * Creates a batch, uploads to S3, then triggers async pipeline processing.
   */
  uploadAndProcess: protectedProcedure
    .input(
      z.object({
        batchName: z.string().optional(),
        documents: z.array(
          z.object({
            filename: z.string(),
            fileData: z.string(), // base64 encoded
            mimeType: z.string(),
          })
        ),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.user.tenantId;
      if (!tenantId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "User must be associated with a tenant" });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const batchUuid = crypto.randomUUID();

      // Create ingestion batch
      const [batch] = await db.insert(ingestionBatches).values({
        tenantId,
        batchId: batchUuid,
        batchName: input.batchName || `Historical Claims ${new Date().toLocaleDateString("en-ZA")}`,
        ingestionSource: "legacy_import",
        ingestionChannel: "web_ui",
        uploadedByUserId: ctx.user.id,
        uploadedByEmail: ctx.user.email || undefined,
        totalDocuments: input.documents.length,
        processedDocuments: 0,
        failedDocuments: 0,
        status: "processing",
      });

      const batchDbId = batch.insertId;
      const uploadedDocIds: number[] = [];

      // Upload each document to S3 and create records
      for (const doc of input.documents) {
        try {
          const buffer = Buffer.from(doc.fileData, "base64");
          const hash = crypto.createHash("sha256").update(buffer).digest("hex");
          const documentId = crypto.randomUUID();
          const s3Key = `${tenantId}/historical/${batchUuid}/${documentId}-${doc.filename}`;

          const { url } = await storagePut(s3Key, buffer, doc.mimeType);

          const [docRecord] = await db.insert(ingestionDocuments).values({
            tenantId,
            batchId: batchDbId,
            documentId,
            originalFilename: doc.filename,
            fileSizeBytes: buffer.length,
            mimeType: doc.mimeType,
            s3Bucket: "kinga-storage",
            s3Key,
            s3Url: url,
            sha256Hash: hash,
            hashVerified: 1,
            extractionStatus: "pending",
            validationStatus: "pending",
          });

          uploadedDocIds.push(docRecord.insertId);
        } catch (error) {
          console.error(`[HistoricalClaims] Failed to upload ${doc.filename}:`, error);
        }
      }

      // Process the batch through the intelligence pipeline (async-like, but await for now)
      let pipelineResult;
      try {
        pipelineResult = await processBatchForHistoricalClaim(tenantId, batchDbId, uploadedDocIds);

        // Update batch status
        await db.update(ingestionBatches)
          .set({
            processedDocuments: pipelineResult.documentsProcessed,
            failedDocuments: pipelineResult.documentsFailed,
            status: pipelineResult.documentsFailed === 0 ? "completed" : "failed",
            completedAt: new Date(),
          })
          .where(eq(ingestionBatches.id, batchDbId));
      } catch (error) {
        console.error("[HistoricalClaims] Pipeline processing failed:", error);
        pipelineResult = {
          historicalClaimId: 0,
          documentsProcessed: 0,
          documentsFailed: uploadedDocIds.length,
          extractionResults: [],
          pipelineStatus: "failed",
          errors: [error instanceof Error ? error.message : "Unknown error"],
        };
      }

      return {
        batchId: batchUuid,
        batchDbId,
        historicalClaimId: pipelineResult.historicalClaimId,
        totalDocuments: input.documents.length,
        documentsProcessed: pipelineResult.documentsProcessed,
        documentsFailed: pipelineResult.documentsFailed,
        pipelineStatus: pipelineResult.pipelineStatus,
        errors: pipelineResult.errors,
        extractionSummary: pipelineResult.extractionResults.map((r) => ({
          type: r.classification.documentType,
          confidence: r.classification.confidence,
          repairItems: r.repairItems.length,
          totalCost: r.costBreakdown.totalInclVat,
          qualityScore: r.dataQualityScore,
          isHandwritten: r.classification.isHandwritten,
        })),
      };
    }),

  // ============================================================
  // HISTORICAL CLAIMS MANAGEMENT
  // ============================================================

  /**
   * List historical claims with pagination and filtering.
   */
  listClaims: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
        status: z.string().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const tenantId = ctx.user.tenantId;
      if (!tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "Tenant required" });

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const conditions = [eq(historicalClaims.tenantId, tenantId)];
      if (input.status) {
        conditions.push(eq(historicalClaims.pipelineStatus, input.status as any));
      }

      const claims = await db
        .select()
        .from(historicalClaims)
        .where(and(...conditions))
        .orderBy(desc(historicalClaims.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      const [totalResult] = await db
        .select({ count: count() })
        .from(historicalClaims)
        .where(and(...conditions));

      return {
        claims,
        total: totalResult?.count || 0,
      };
    }),

  /**
   * Get detailed view of a historical claim with all extracted data.
   */
  getClaimDetails: protectedProcedure
    .input(z.object({ claimId: z.number() }))
    .query(async ({ input, ctx }) => {
      const tenantId = ctx.user.tenantId;
      if (!tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "Tenant required" });

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const [claim] = await db
        .select()
        .from(historicalClaims)
        .where(and(eq(historicalClaims.id, input.claimId), eq(historicalClaims.tenantId, tenantId)));

      if (!claim) throw new TRPCError({ code: "NOT_FOUND", message: "Claim not found" });

      const repairItems = await db
        .select()
        .from(extractedRepairItems)
        .where(eq(extractedRepairItems.historicalClaimId, input.claimId));

      const costs = await db
        .select()
        .from(costComponents)
        .where(eq(costComponents.historicalClaimId, input.claimId));

      const predictions = await db
        .select()
        .from(aiPredictionLogs)
        .where(eq(aiPredictionLogs.historicalClaimId, input.claimId))
        .orderBy(desc(aiPredictionLogs.createdAt));

      const [approval] = await db
        .select()
        .from(finalApprovalRecords)
        .where(eq(finalApprovalRecords.historicalClaimId, input.claimId));

      const variances = await db
        .select()
        .from(varianceDatasets)
        .where(eq(varianceDatasets.historicalClaimId, input.claimId));

      return {
        claim,
        repairItems,
        costComponents: costs,
        predictions,
        approval: approval || null,
        variances,
      };
    }),

  // ============================================================
  // GROUND TRUTH CAPTURE
  // ============================================================

  /**
   * Capture ground truth — the final insurer-approved cost and decision.
   * This data becomes the training label for ML models.
   */
  captureGroundTruth: protectedProcedure
    .input(
      z.object({
        historicalClaimId: z.number(),
        finalDecision: z.enum(["approved_repair", "approved_total_loss", "cash_settlement", "rejected", "withdrawn"]),
        finalApprovedAmount: z.number(),
        finalLaborCost: z.number().optional(),
        finalPartsCost: z.number().optional(),
        finalPaintCost: z.number().optional(),
        finalSubletCost: z.number().optional(),
        finalBetterment: z.number().optional(),
        approvedByName: z.string().optional(),
        approvedByRole: z.string().optional(),
        approvalDate: z.string().optional(), // YYYY-MM-DD
        assessorName: z.string().optional(),
        assessorLicenseNumber: z.string().optional(),
        assessorEstimate: z.number().optional(),
        repairShopName: z.string().optional(),
        actualRepairDuration: z.number().optional(),
        customerSatisfaction: z.number().min(1).max(5).optional(),
        approvalNotes: z.string().optional(),
        dataSource: z.enum(["extracted_from_document", "manual_entry", "system_import"]).default("manual_entry"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.user.tenantId;
      if (!tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "Tenant required" });

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // Verify claim exists and belongs to tenant
      const [claim] = await db
        .select()
        .from(historicalClaims)
        .where(and(eq(historicalClaims.id, input.historicalClaimId), eq(historicalClaims.tenantId, tenantId)));

      if (!claim) throw new TRPCError({ code: "NOT_FOUND", message: "Claim not found" });

      // Upsert ground truth record
      try {
        await db.insert(finalApprovalRecords).values({
          historicalClaimId: input.historicalClaimId,
          tenantId,
          finalDecision: input.finalDecision,
          finalApprovedAmount: input.finalApprovedAmount.toFixed(2),
          finalLaborCost: input.finalLaborCost?.toFixed(2) ?? null,
          finalPartsCost: input.finalPartsCost?.toFixed(2) ?? null,
          finalPaintCost: input.finalPaintCost?.toFixed(2) ?? null,
          finalSubletCost: input.finalSubletCost?.toFixed(2) ?? null,
          finalBetterment: input.finalBetterment?.toFixed(2) ?? null,
          approvedByName: input.approvedByName ?? null,
          approvedByRole: input.approvedByRole ?? null,
          approvalDate: input.approvalDate ? new Date(input.approvalDate) as any : null,
          assessorName: input.assessorName ?? null,
          assessorLicenseNumber: input.assessorLicenseNumber ?? null,
          assessorEstimate: input.assessorEstimate?.toFixed(2) ?? null,
          repairShopName: input.repairShopName ?? null,
          actualRepairDuration: input.actualRepairDuration ?? null,
          customerSatisfaction: input.customerSatisfaction ?? null,
          approvalNotes: input.approvalNotes ?? null,
          dataSource: input.dataSource,
          capturedByUserId: ctx.user.id,
        });
      } catch (error: any) {
        // Handle duplicate — update instead
        if (error.message?.includes("Duplicate")) {
          await db.update(finalApprovalRecords)
            .set({
              finalDecision: input.finalDecision,
              finalApprovedAmount: input.finalApprovedAmount.toFixed(2),
              finalLaborCost: input.finalLaborCost?.toFixed(2) ?? null,
              finalPartsCost: input.finalPartsCost?.toFixed(2) ?? null,
              finalPaintCost: input.finalPaintCost?.toFixed(2) ?? null,
              finalSubletCost: input.finalSubletCost?.toFixed(2) ?? null,
              finalBetterment: input.finalBetterment?.toFixed(2) ?? null,
              approvedByName: input.approvedByName ?? null,
              approvedByRole: input.approvedByRole ?? null,
              approvalDate: input.approvalDate ? new Date(input.approvalDate) as any : null,
              assessorName: input.assessorName ?? null,
              assessorLicenseNumber: input.assessorLicenseNumber ?? null,
              assessorEstimate: input.assessorEstimate?.toFixed(2) ?? null,
              repairShopName: input.repairShopName ?? null,
              actualRepairDuration: input.actualRepairDuration ?? null,
              customerSatisfaction: input.customerSatisfaction ?? null,
              approvalNotes: input.approvalNotes ?? null,
              dataSource: input.dataSource,
              capturedByUserId: ctx.user.id,
            })
            .where(eq(finalApprovalRecords.historicalClaimId, input.historicalClaimId));
        } else {
          throw error;
        }
      }

      // Update historical claim with final approved cost
      await db.update(historicalClaims)
        .set({
          finalApprovedCost: input.finalApprovedAmount.toFixed(2),
          repairDecision: input.finalDecision === "approved_repair" ? "repair"
            : input.finalDecision === "approved_total_loss" ? "total_loss"
            : input.finalDecision === "cash_settlement" ? "cash_settlement"
            : "rejected",
          pipelineStatus: "ground_truth_captured",
        })
        .where(eq(historicalClaims.id, input.historicalClaimId));

      // Generate variance datasets
      await generateVarianceDatasets(
        input.historicalClaimId,
        tenantId,
        claim.totalPanelBeaterQuote ? parseFloat(claim.totalPanelBeaterQuote) : null,
        input.assessorEstimate ?? (claim.totalAssessorEstimate ? parseFloat(claim.totalAssessorEstimate) : null),
        claim.totalAiEstimate ? parseFloat(claim.totalAiEstimate) : null,
        input.finalApprovedAmount,
        { make: claim.vehicleMake, model: claim.vehicleModel, year: claim.vehicleYear },
        claim.accidentType,
        { name: input.assessorName ?? claim.assessorName, licenseNumber: input.assessorLicenseNumber ?? claim.assessorLicenseNumber }
      );

      // Update pipeline status
      await db.update(historicalClaims)
        .set({ pipelineStatus: "variance_calculated" })
        .where(eq(historicalClaims.id, input.historicalClaimId));

      // Update AI prediction accuracy
      const predictions = await db
        .select()
        .from(aiPredictionLogs)
        .where(and(
          eq(aiPredictionLogs.historicalClaimId, input.historicalClaimId),
          eq(aiPredictionLogs.predictionType, "cost_estimate")
        ));

      for (const pred of predictions) {
        if (pred.predictedValue) {
          const predicted = parseFloat(pred.predictedValue);
          const actual = input.finalApprovedAmount;
          const variance = predicted - actual;
          const variancePercent = actual !== 0 ? ((predicted - actual) / actual) * 100 : 0;
          const isAccurate = Math.abs(variancePercent) < 15; // Within 15% threshold

          await db.update(aiPredictionLogs)
            .set({
              actualValue: actual.toFixed(2),
              varianceAmount: variance.toFixed(2),
              variancePercent: variancePercent.toFixed(2),
              isAccurate: isAccurate ? 1 : 0,
            })
            .where(eq(aiPredictionLogs.id, pred.id));
        }
      }

      return { success: true, historicalClaimId: input.historicalClaimId };
    }),

  // ============================================================
  // MANUAL CORRECTION INTERFACE
  // ============================================================

  /**
   * Update extracted repair item (manual correction).
   */
  updateRepairItem: protectedProcedure
    .input(
      z.object({
        itemId: z.number(),
        description: z.string().optional(),
        category: z.enum(["parts", "labor", "paint", "diagnostic", "sundries", "sublet", "other"]).optional(),
        repairAction: z.enum(["repair", "replace", "refinish", "blend", "remove_refit"]).optional(),
        quantity: z.number().optional(),
        unitPrice: z.number().optional(),
        lineTotal: z.number().optional(),
        laborHours: z.number().optional(),
        laborRate: z.number().optional(),
        partsQuality: z.enum(["oem", "genuine", "aftermarket", "used", "reconditioned"]).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const updateData: Record<string, any> = { manuallyVerified: 1 };
      if (input.description !== undefined) updateData.description = input.description;
      if (input.category !== undefined) updateData.category = input.category;
      if (input.repairAction !== undefined) updateData.repairAction = input.repairAction;
      if (input.quantity !== undefined) updateData.quantity = input.quantity.toFixed(2);
      if (input.unitPrice !== undefined) updateData.unitPrice = input.unitPrice.toFixed(2);
      if (input.lineTotal !== undefined) updateData.lineTotal = input.lineTotal.toFixed(2);
      if (input.laborHours !== undefined) updateData.laborHours = input.laborHours.toFixed(2);
      if (input.laborRate !== undefined) updateData.laborRate = input.laborRate.toFixed(2);
      if (input.partsQuality !== undefined) updateData.partsQuality = input.partsQuality;

      await db.update(extractedRepairItems)
        .set(updateData)
        .where(eq(extractedRepairItems.id, input.itemId));

      // Increment manual corrections counter on the claim
      const [item] = await db.select().from(extractedRepairItems).where(eq(extractedRepairItems.id, input.itemId));
      if (item) {
        await db.execute(
          sql`UPDATE historical_claims SET manual_corrections = manual_corrections + 1 WHERE id = ${item.historicalClaimId}`
        );
      }

      return { success: true };
    }),

  /**
   * Update historical claim fields (manual correction).
   */
  updateClaim: protectedProcedure
    .input(
      z.object({
        claimId: z.number(),
        claimReference: z.string().optional(),
        policyNumber: z.string().optional(),
        vehicleMake: z.string().optional(),
        vehicleModel: z.string().optional(),
        vehicleYear: z.number().optional(),
        vehicleRegistration: z.string().optional(),
        assessorName: z.string().optional(),
        assessorLicenseNumber: z.string().optional(),
        accidentType: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.user.tenantId;
      if (!tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "Tenant required" });

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const updateData: Record<string, any> = {};
      const { claimId, ...fields } = input;
      for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined) updateData[key] = value;
      }

      if (Object.keys(updateData).length > 0) {
        await db.update(historicalClaims)
          .set(updateData)
          .where(and(eq(historicalClaims.id, claimId), eq(historicalClaims.tenantId, tenantId)));
      }

      return { success: true };
    }),

  // ============================================================
  // ANALYTICS QUERIES
  // ============================================================

  /**
   * Get aggregate analytics for the intelligence pipeline.
   * Returns summary statistics for the dashboard.
   */
  getAnalyticsSummary: protectedProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.user.tenantId;
    if (!tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "Tenant required" });

    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

    // Total claims by status
    const statusCounts = await db
      .select({
        status: historicalClaims.pipelineStatus,
        count: count(),
      })
      .from(historicalClaims)
      .where(eq(historicalClaims.tenantId, tenantId))
      .groupBy(historicalClaims.pipelineStatus);

    // Average cost variance
    const varianceStats = await db
      .select({
        comparisonType: varianceDatasets.comparisonType,
        avgVariancePercent: avg(varianceDatasets.variancePercent),
        avgAbsVariancePercent: avg(varianceDatasets.absoluteVariancePercent),
        count: count(),
      })
      .from(varianceDatasets)
      .where(eq(varianceDatasets.tenantId, tenantId))
      .groupBy(varianceDatasets.comparisonType);

    // Average data quality
    const qualityStats = await db
      .select({
        avgQuality: avg(historicalClaims.dataQualityScore),
        totalClaims: count(),
      })
      .from(historicalClaims)
      .where(eq(historicalClaims.tenantId, tenantId));

    // AI prediction accuracy
    const accuracyStats = await db
      .select({
        totalPredictions: count(),
        accuratePredictions: sql<number>`SUM(CASE WHEN is_accurate = 1 THEN 1 ELSE 0 END)`,
      })
      .from(aiPredictionLogs)
      .where(eq(aiPredictionLogs.tenantId, tenantId));

    // Repair vs replace frequency
    const repairActionStats = await db
      .select({
        action: extractedRepairItems.repairAction,
        count: count(),
      })
      .from(extractedRepairItems)
      .innerJoin(historicalClaims, eq(extractedRepairItems.historicalClaimId, historicalClaims.id))
      .where(eq(historicalClaims.tenantId, tenantId))
      .groupBy(extractedRepairItems.repairAction);

    // Fraud pattern indicators
    const fraudStats = await db
      .select({
        suspected: sql<number>`SUM(CASE WHEN is_fraud_suspected = 1 THEN 1 ELSE 0 END)`,
        outliers: sql<number>`SUM(CASE WHEN is_outlier = 1 THEN 1 ELSE 0 END)`,
        total: count(),
      })
      .from(varianceDatasets)
      .where(eq(varianceDatasets.tenantId, tenantId));

    return {
      statusCounts,
      varianceStats,
      qualityStats: qualityStats[0] || { avgQuality: 0, totalClaims: 0 },
      accuracyStats: accuracyStats[0] || { totalPredictions: 0, accuratePredictions: 0 },
      repairActionStats,
      fraudStats: fraudStats[0] || { suspected: 0, outliers: 0, total: 0 },
    };
  }),

  /**
   * Get variance distribution data for charts.
   */
  getVarianceDistribution: protectedProcedure
    .input(
      z.object({
        comparisonType: z.enum(["quote_vs_final", "ai_vs_final", "assessor_vs_final", "quote_vs_assessor", "ai_vs_assessor", "quote_vs_ai"]),
      })
    )
    .query(async ({ input, ctx }) => {
      const tenantId = ctx.user.tenantId;
      if (!tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "Tenant required" });

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const distribution = await db
        .select({
          category: varianceDatasets.varianceCategory,
          count: count(),
        })
        .from(varianceDatasets)
        .where(and(
          eq(varianceDatasets.tenantId, tenantId),
          eq(varianceDatasets.comparisonType, input.comparisonType)
        ))
        .groupBy(varianceDatasets.varianceCategory);

      const details = await db
        .select({
          id: varianceDatasets.id,
          sourceAAmount: varianceDatasets.sourceAAmount,
          sourceBAmount: varianceDatasets.sourceBAmount,
          variancePercent: varianceDatasets.variancePercent,
          varianceCategory: varianceDatasets.varianceCategory,
          vehicleMake: varianceDatasets.vehicleMake,
          vehicleModel: varianceDatasets.vehicleModel,
          assessorName: varianceDatasets.assessorName,
          isFraudSuspected: varianceDatasets.isFraudSuspected,
        })
        .from(varianceDatasets)
        .where(and(
          eq(varianceDatasets.tenantId, tenantId),
          eq(varianceDatasets.comparisonType, input.comparisonType)
        ))
        .orderBy(desc(varianceDatasets.absoluteVariancePercent))
        .limit(50);

      return { distribution, details };
    }),

  /**
   * Get assessor performance benchmarks.
   */
  getAssessorBenchmarks: protectedProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.user.tenantId;
    if (!tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "Tenant required" });

    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

    const benchmarks = await db
      .select({
        assessorName: varianceDatasets.assessorName,
        assessorLicenseNumber: varianceDatasets.assessorLicenseNumber,
        avgVariancePercent: avg(varianceDatasets.variancePercent),
        avgAbsVariancePercent: avg(varianceDatasets.absoluteVariancePercent),
        claimsAssessed: count(),
        fraudSuspected: sql<number>`SUM(CASE WHEN is_fraud_suspected = 1 THEN 1 ELSE 0 END)`,
      })
      .from(varianceDatasets)
      .where(and(
        eq(varianceDatasets.tenantId, tenantId),
        eq(varianceDatasets.comparisonType, "assessor_vs_final"),
        sql`assessor_name IS NOT NULL`
      ))
      .groupBy(varianceDatasets.assessorName, varianceDatasets.assessorLicenseNumber)
      .orderBy(avg(varianceDatasets.absoluteVariancePercent));

    return benchmarks;
  }),

  /**
   * Get vehicle make/model cost patterns.
   */
  getVehicleCostPatterns: protectedProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.user.tenantId;
    if (!tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "Tenant required" });

    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

    const patterns = await db
      .select({
        vehicleMake: historicalClaims.vehicleMake,
        vehicleModel: historicalClaims.vehicleModel,
        avgQuoteCost: avg(historicalClaims.totalPanelBeaterQuote),
        avgFinalCost: avg(historicalClaims.finalApprovedCost),
        claimCount: count(),
      })
      .from(historicalClaims)
      .where(and(
        eq(historicalClaims.tenantId, tenantId),
        sql`vehicle_make IS NOT NULL`,
        sql`final_approved_cost IS NOT NULL`
      ))
      .groupBy(historicalClaims.vehicleMake, historicalClaims.vehicleModel)
      .orderBy(desc(count()))
      .limit(20);

    return patterns;
  }),
});
