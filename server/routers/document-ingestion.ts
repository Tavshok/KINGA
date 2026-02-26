// @ts-nocheck
import { z } from "zod";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { TRPCError } from "@trpc/server";
import { ingestionBatches, ingestionDocuments, extractedDocumentData } from "../../drizzle/schema";
import { storagePut } from "../storage";
import { eq, and, desc } from "drizzle-orm";
import crypto from "crypto";

const db = getDb();

/**
 * Document Ingestion Router
 * Handles document upload, classification, extraction, and validation workflows
 */
export const documentIngestionRouter = router({
  /**
   * Upload documents in a batch
   */
  uploadDocuments: protectedProcedure
    .input(
      z.object({
        batch_name: z.string().optional(),
        ingestion_source: z.enum(["processor_upload", "bulk_batch", "api", "email", "legacy_import", "broker_upload"]),
        documents: z.array(
          z.object({
            filename: z.string(),
            file_data: z.string(), // base64 encoded
            mime_type: z.string(),
          })
        ),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        console.log('[Document Upload] Starting upload mutation');
        console.log('[Document Upload] User:', ctx.user.id, ctx.user.email, ctx.user.role);
        console.log('[Document Upload] Input:', { batch_name: input.batch_name, ingestion_source: input.ingestion_source, doc_count: input.documents.length });
        
        const { batch_name, ingestion_source, documents } = input;
        let tenantId = ctx.user.tenantId;
      
      // Auto-assign default tenant for admin users during testing
      if (!tenantId && ctx.user.role === "admin") {
        tenantId = "demo-insurance"; // Default tenant for admin testing
      }
      
      if (!tenantId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "User must be associated with a tenant. Please contact your administrator to assign you to a tenant.",
        });
      }
      
      // Generate batch ID
      const batchId = crypto.randomUUID();
      
      // Create ingestion batch
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      
      const [batch] = await db.insert(ingestionBatches).values({
        tenantId,
        batchId,
        batchName: batch_name || `Batch ${new Date().toLocaleDateString()}`,
        ingestionSource: ingestion_source,
        ingestionChannel: "web_ui",
        uploadedByUserId: ctx.user.id,
        uploadedByEmail: ctx.user.email || undefined,
        totalDocuments: documents.length,
        processedDocuments: 0,
        failedDocuments: 0,
        status: "pending",
      });
      
      // Upload documents to S3 and create records
      const uploadedDocs = await Promise.all(
        documents.map(async (doc) => {
          try {
            // Decode base64
            const buffer = Buffer.from(doc.file_data, "base64");
            
            // Calculate SHA-256 hash
            const hash = crypto.createHash("sha256").update(buffer).digest("hex");
            
            // Generate document ID and S3 key
            const documentId = crypto.randomUUID();
            const s3Key = `${tenantId}/ingestion/${batchId}/${documentId}-${doc.filename}`;
            
            // Upload to S3
            const { url } = await storagePut(s3Key, buffer, doc.mime_type);
            
            // Create document record
            const [docRecord] = await db!.insert(ingestionDocuments).values({
              tenantId,
              batchId: batch.insertId,
              documentId,
              originalFilename: doc.filename,
              fileSizeBytes: buffer.length,
              mimeType: doc.mime_type,
              s3Bucket: "kinga-storage", // TODO: Get from env
              s3Key,
              s3Url: url,
              sha256Hash: hash,
              hashVerified: 1,
              extractionStatus: "pending",
              validationStatus: "pending",
            });
            
            return {
              document_id: documentId,
              filename: doc.filename,
              status: "uploaded",
            };
          } catch (error) {
            console.error(`Failed to upload document ${doc.filename}:`, error);
            return {
              document_id: null,
              filename: doc.filename,
              status: "failed",
              error: error instanceof Error ? error.message : "Unknown error",
            };
          }
        })
      );
      
      // Update batch statistics
      const successCount = uploadedDocs.filter((d) => d.status === "uploaded").length;
      const failedCount = uploadedDocs.filter((d) => d.status === "failed").length;
      
      await db!
        .update(ingestionBatches)
        .set({
          processedDocuments: successCount,
          failedDocuments: failedCount,
          status: failedCount === 0 ? "completed" : "failed",
          completedAt: new Date(),
        })
        .where(eq(ingestionBatches.id, batch.insertId));
      
      return {
        batch_id: batchId,
        total_documents: documents.length,
        uploaded: successCount,
        failed: failedCount,
        documents: uploadedDocs,
      };
      } catch (error) {
        console.error('[Document Upload] FATAL ERROR:', error);
        console.error('[Document Upload] Error stack:', error instanceof Error ? error.stack : 'No stack');
        console.error('[Document Upload] Error details:', JSON.stringify(error, null, 2));
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Unknown error during document upload",
          cause: error,
        });
      }
    }),

  /**
   * Get ingestion batches for current tenant
   */
  getIngestionBatches: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input, ctx }) => {
      const tenantId = ctx.user.tenantId;
      
      if (!tenantId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "User must be associated with a tenant",
        });
      }
      
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      
      const batches = await db
        .select()
        .from(ingestionBatches)
        .where(eq(ingestionBatches.tenantId, tenantId))
        .orderBy(desc(ingestionBatches.createdAt))
        .limit(input.limit)
        .offset(input.offset);
      
      return batches;
    }),

  /**
   * Get documents in a batch
   */
  getBatchDocuments: protectedProcedure
    .input(
      z.object({
        batch_id: z.number(),
      })
    )
    .query(async ({ input, ctx }) => {
      const tenantId = ctx.user.tenantId;
      
      if (!tenantId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "User must be associated with a tenant",
        });
      }
      
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      
      const documents = await db
        .select()
        .from(ingestionDocuments)
        .where(
          and(
            eq(ingestionDocuments.batchId, input.batch_id),
            eq(ingestionDocuments.tenantId, tenantId)
          )
        )
        .orderBy(desc(ingestionDocuments.createdAt));
      
      return documents;
    }),

  /**
   * Get document details with extracted data
   */
  getDocumentDetails: protectedProcedure
    .input(
      z.object({
        document_id: z.number(),
      })
    )
    .query(async ({ input, ctx }) => {
      const tenantId = ctx.user.tenantId;
      
      if (!tenantId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "User must be associated with a tenant",
        });
      }
      
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      
      const [document] = await db
        .select()
        .from(ingestionDocuments)
        .where(
          and(
            eq(ingestionDocuments.id, input.document_id),
            eq(ingestionDocuments.tenantId, tenantId)
          )
        );
      
      if (!document) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Document not found",
        });
      }
      
      // Get extracted data if available
      const [extractedData] = await db!
        .select()
        .from(extractedDocumentData)
        .where(eq(extractedDocumentData.documentId, document.id));
      
      return {
        document,
        extracted_data: extractedData || null,
      };
    }),

  /**
   * Classify document (AI-based or rule-based)
   * TODO: Integrate with actual AI classification model
   */
  classifyDocument: protectedProcedure
    .input(
      z.object({
        document_id: z.number(),
        document_type: z.enum([
          "claim_form",
          "police_report",
          "damage_image",
          "repair_quote",
          "assessor_report",
          "supporting_evidence",
          "unknown",
        ]).optional(),
        classification_method: z.enum(["ai_model", "rule_based", "manual_override"]).default("manual_override"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.user.tenantId;
      
      if (!tenantId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "User must be associated with a tenant",
        });
      }
      
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      
      // Verify document belongs to tenant
      const [document] = await db
        .select()
        .from(ingestionDocuments)
        .where(
          and(
            eq(ingestionDocuments.id, input.document_id),
            eq(ingestionDocuments.tenantId, tenantId)
          )
        );
      
      if (!document) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Document not found",
        });
      }
      
      // TODO: Implement AI classification
      // For now, use manual classification or rule-based
      const documentType = input.document_type || "unknown";
      const confidence = input.classification_method === "manual_override" ? 1.0 : 0.85;
      
      // Update document classification
      await db!
        .update(ingestionDocuments)
        .set({
          documentType,
          classificationConfidence: confidence.toString(),
          classificationMethod: input.classification_method,
        })
        .where(eq(ingestionDocuments.id, input.document_id));
      
      return {
        document_id: input.document_id,
        document_type: documentType,
        confidence,
        classification_method: input.classification_method,
      };
    }),

  /**
   * Approve document (mark as validated)
   */
  approveDocument: protectedProcedure
    .input(
      z.object({
        document_id: z.number(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.user.tenantId;
      
      if (!tenantId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "User must be associated with a tenant",
        });
      }
      
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      
      // Verify document belongs to tenant
      const [document] = await db
        .select()
        .from(ingestionDocuments)
        .where(
          and(
            eq(ingestionDocuments.id, input.document_id),
            eq(ingestionDocuments.tenantId, tenantId)
          )
        );
      
      if (!document) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Document not found",
        });
      }
      
      // Update validation status
      await db!
        .update(ingestionDocuments)
        .set({
          validationStatus: "approved",
          validatedByUserId: ctx.user.id,
          validatedAt: new Date(),
        })
        .where(eq(ingestionDocuments.id, input.document_id));
      
      return {
        document_id: input.document_id,
        status: "approved",
      };
    }),
});
