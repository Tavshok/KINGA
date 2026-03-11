// @ts-nocheck
import { z } from "zod";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { getDb, triggerAiAssessment } from "../db";
import { TRPCError } from "@trpc/server";
import { ingestionBatches, ingestionDocuments, extractedDocumentData, claims } from "../../drizzle/schema";
import { storagePut } from "../storage";
import { eq, and, desc, isNull } from "drizzle-orm";
import crypto from "crypto";

const db = getDb();

/**
 * Generate a unique claim number for document-ingested claims.
 * Format: DOC-YYYYMMDD-XXXXXXXX (8 hex chars)
 */
function generateClaimNumber(): string {
  const date = new Date();
  const datePart = date.toISOString().slice(0, 10).replace(/-/g, "");
  const randomPart = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `DOC-${datePart}-${randomPart}`;
}

/**
 * Document Ingestion Router
 * Handles document upload, classification, extraction, and validation workflows
 */
export const documentIngestionRouter = router({
  /**
   * Upload documents in a batch.
   * For each successfully uploaded document, a linked claim record is created
   * atomically in the same operation (rollback on failure).
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
        console.log("[Document Upload] Starting upload mutation");
        console.log("[Document Upload] User:", ctx.user.id, ctx.user.email, ctx.user.role);
        console.log("[Document Upload] Input:", {
          batch_name: input.batch_name,
          ingestion_source: input.ingestion_source,
          doc_count: input.documents.length,
        });

        const { batch_name, ingestion_source, documents } = input;
        let tenantId = ctx.user.tenantId;

        // Auto-assign default tenant for admin users during testing
        if (!tenantId && ctx.user.role === "admin") {
          tenantId = "demo-insurance";
        }

        if (!tenantId) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message:
              "User must be associated with a tenant. Please contact your administrator to assign you to a tenant.",
          });
        }

        // Generate batch UUID (used for S3 path only)
        const batchUuid = crypto.randomUUID();

        // Get DB instance
        const dbInstance = await getDb();
        if (!dbInstance)
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

        // Create ingestion batch record
        const [batchInsertResult] = await dbInstance.insert(ingestionBatches).values({
          tenantId,
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

        const batchDbId = Number(
          (batchInsertResult as unknown as { insertId: string | number }).insertId
        );

        console.log("[Document Upload] Created ingestion batch, DB id:", batchDbId);

        // Upload each document to S3, insert ingestionDocuments record, and create a linked claim
        const uploadedDocs = await Promise.all(
          documents.map(async (doc) => {
            try {
              // Decode base64
              const buffer = Buffer.from(doc.file_data, "base64");

              // Calculate SHA-256 hash
              const hash = crypto.createHash("sha256").update(buffer).digest("hex");

              // Generate document UUID and S3 key
              const documentId = crypto.randomUUID();
              const s3Key = `${tenantId}/ingestion/${batchUuid}/${documentId}-${doc.filename}`;

              // Upload to S3
              const { url } = await storagePut(s3Key, buffer, doc.mime_type);

              console.log("[Document Upload] Uploaded to S3:", s3Key);

              // ---------------------------------------------------------------
              // ATOMIC TRANSACTION: BEGIN
              //   Step 1 — Duplicate guard (SELECT inside tx)
              //   Step 2 — INSERT ingestionDocuments
              //   Step 3 — INSERT claims (linked via source_document_id)
              //   Step 4 — UPDATE ingestionDocuments.historicalClaimId back-link
              // If any step throws, the driver issues ROLLBACK automatically.
              // ---------------------------------------------------------------
              type TxResult =
                | { kind: "created"; docDbId: number; claimDbId: number; claimNumber: string; isReupload: boolean; originalClaimId?: number };

              const txResult: TxResult = await dbInstance.transaction(async (tx) => {
                // Step 1 — Check for previous uploads of the same document (by SHA-256 hash).
                //           If found, we still allow the upload but tag it as a re-upload.
                const existingByHash = await tx
                  .select({
                    id: ingestionDocuments.id,
                    historicalClaimId: ingestionDocuments.historicalClaimId,
                  })
                  .from(ingestionDocuments)
                  .where(
                    and(
                      eq(ingestionDocuments.sha256Hash, hash),
                      eq(ingestionDocuments.tenantId, tenantId)
                    )
                  )
                  .limit(1);

                const isReupload = existingByHash.length > 0 && !!existingByHash[0].historicalClaimId;
                const originalClaimId = isReupload ? existingByHash[0].historicalClaimId! : undefined;

                if (isReupload) {
                  console.log(
                    `[Document Upload] Re-upload detected: SHA-256 hash ${hash} was previously uploaded ` +
                    `(ingestionDocument id=${existingByHash[0].id}, original claim id=${originalClaimId}). ` +
                    `Creating new claim with re-upload tag.`
                  );
                }

                // Step 2 — INSERT ingestionDocuments
                const [docInsertResult] = await tx.insert(ingestionDocuments).values({
                  tenantId,
                  batchId: batchDbId,
                  documentId,
                  originalFilename: doc.filename,
                  fileSizeBytes: buffer.length,
                  mimeType: doc.mime_type,
                  s3Bucket: "kinga-storage",
                  s3Key,
                  s3Url: url,
                  sha256Hash: hash,
                  hashVerified: 1,
                  extractionStatus: "pending",
                  validationStatus: "pending",
                });

                const docDbId = Number(
                  (docInsertResult as unknown as { insertId: string | number }).insertId
                );

                console.log("[Document Upload] [TX] Inserted ingestionDocument, DB id:", docDbId);

                // Step 3 — INSERT claims (status = intake_pending, source = document_ingestion)
                //   If this insert fails (e.g. UNIQUE constraint on source_document_id),
                //   the driver rolls back the ingestionDocuments insert above automatically.
                const claimNumber = generateClaimNumber();

                const [claimInsertResult] = await tx.insert(claims).values({
                  claimantId: 0,           // Placeholder: no claimant identified yet
                  claimNumber,
                  tenantId,
                  status: "intake_pending",  // Matches Claims Processor Dashboard filter
                  workflowState: "intake_queue",
                  sourceDocumentId: docDbId,
                  claimSource: "document_ingestion",
                  documentProcessingStatus: "pending",  // AI parsing not yet triggered
                  assignedProcessorId: ctx.user.id,
                  priority: "medium",
                  earlyFraudSuspicion: 0,
                  aiAssessmentTriggered: 0,
                  aiAssessmentCompleted: 0,
                });

                const claimDbId = Number(
                  (claimInsertResult as unknown as { insertId: string | number }).insertId
                );

                console.log(
                  "[Document Upload] [TX] Created claim record, DB id:",
                  claimDbId,
                  "claim_number:",
                  claimNumber
                );

                // Step 4 — Back-link ingestionDocument → claim (also inside tx, rolled back on failure)
                await tx
                  .update(ingestionDocuments)
                  .set({ historicalClaimId: claimDbId })
                  .where(eq(ingestionDocuments.id, docDbId));

                console.log("[Document Upload] [TX] COMMIT — document and claim created atomically.");

                return {
                  kind: "created" as const,
                  docDbId,
                  claimDbId,
                  claimNumber,
                  isReupload,
                  originalClaimId,
                };
              });
              // ---------------------------------------------------------------
              // ATOMIC TRANSACTION: END
              // ---------------------------------------------------------------

              // ---------------------------------------------------------------
              // AI PROCESSING — DEFERRED TO MANUAL TRIGGER
              // Claims now stay in intake_pending so the processor can review
              // the claim in the Pending Claims section first, then manually
              // trigger AI assessment or assign a human assessor.
              // The processor triggers AI assessment via the dashboard button.
              // ---------------------------------------------------------------
              console.log(
                `[Document Upload] Claim ${txResult.claimDbId} created in intake_pending` +
                `${txResult.isReupload ? ` (re-upload of original claim #${txResult.originalClaimId})` : ''}. ` +
                `AI assessment deferred \u2014 processor will trigger manually from dashboard.`
              );

              return {
                document_id: documentId,
                document_db_id: txResult.docDbId,
                claim_id: txResult.claimDbId,
                claim_number: txResult.claimNumber,
                filename: doc.filename,
                status: "uploaded",
                is_reupload: txResult.isReupload,
                original_claim_id: txResult.originalClaimId ?? null,
              };
            } catch (error) {
              console.error(`[Document Upload] Failed to process document ${doc.filename}:`, error);
              return {
                document_id: null,
                document_db_id: null,
                claim_id: null,
                claim_number: null,
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
        const reuploadCount = uploadedDocs.filter((d) => (d as any).is_reupload === true).length;

        await dbInstance
          .update(ingestionBatches)
          .set({
            processedDocuments: successCount,
            failedDocuments: failedCount,
            status: failedCount === documents.length ? "failed" : "completed",
            completedAt: new Date(),
          })
          .where(eq(ingestionBatches.id, batchDbId));

        console.log(
          `[Document Upload] Batch complete. Uploaded: ${successCount}` +
          `${reuploadCount > 0 ? ` (${reuploadCount} re-upload(s))` : ''}, Failed: ${failedCount}`
        );

        return {
          batch_id: batchUuid,
          batch_db_id: batchDbId,
          total_documents: documents.length,
          uploaded: successCount,
          reuploads: reuploadCount,
          duplicates_skipped: 0,
          failed: failedCount,
          documents: uploadedDocs,
        };
      } catch (error) {
        console.error("[Document Upload] FATAL ERROR:", error);
        console.error(
          "[Document Upload] Error stack:",
          error instanceof Error ? error.stack : "No stack"
        );
        console.error("[Document Upload] Error details:", JSON.stringify(error, null, 2));
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
      let tenantId = ctx.user.tenantId;
      if (!tenantId && ctx.user.role === "admin") tenantId = "demo-insurance";

      if (!tenantId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "User must be associated with a tenant" });
      }

      const dbInstance = await getDb();
      if (!dbInstance)
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const batches = await dbInstance
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
      let tenantId = ctx.user.tenantId;
      if (!tenantId && ctx.user.role === "admin") tenantId = "demo-insurance";

      if (!tenantId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "User must be associated with a tenant" });
      }

      const dbInstance = await getDb();
      if (!dbInstance)
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const documents = await dbInstance
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
      let tenantId = ctx.user.tenantId;
      if (!tenantId && ctx.user.role === "admin") tenantId = "demo-insurance";

      if (!tenantId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "User must be associated with a tenant" });
      }

      const dbInstance = await getDb();
      if (!dbInstance)
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const [document] = await dbInstance
        .select()
        .from(ingestionDocuments)
        .where(
          and(
            eq(ingestionDocuments.id, input.document_id),
            eq(ingestionDocuments.tenantId, tenantId)
          )
        );

      if (!document) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Document not found" });
      }

      // Get extracted data if available
      const [extractedData] = await dbInstance
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
   */
  classifyDocument: protectedProcedure
    .input(
      z.object({
        document_id: z.number(),
        document_type: z
          .enum([
            "claim_form",
            "police_report",
            "damage_image",
            "repair_quote",
            "assessor_report",
            "supporting_evidence",
            "unknown",
          ])
          .optional(),
        classification_method: z
          .enum(["ai_model", "rule_based", "manual_override"])
          .default("manual_override"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      let tenantId = ctx.user.tenantId;
      if (!tenantId && ctx.user.role === "admin") tenantId = "demo-insurance";

      if (!tenantId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "User must be associated with a tenant" });
      }

      const dbInstance = await getDb();
      if (!dbInstance)
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const [document] = await dbInstance
        .select()
        .from(ingestionDocuments)
        .where(
          and(
            eq(ingestionDocuments.id, input.document_id),
            eq(ingestionDocuments.tenantId, tenantId)
          )
        );

      if (!document) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Document not found" });
      }

      const documentType = input.document_type || "unknown";
      const confidence = input.classification_method === "manual_override" ? 1.0 : 0.85;

      await dbInstance
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
      let tenantId = ctx.user.tenantId;
      if (!tenantId && ctx.user.role === "admin") tenantId = "demo-insurance";

      if (!tenantId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "User must be associated with a tenant" });
      }

      const dbInstance = await getDb();
      if (!dbInstance)
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const [document] = await dbInstance
        .select()
        .from(ingestionDocuments)
        .where(
          and(
            eq(ingestionDocuments.id, input.document_id),
            eq(ingestionDocuments.tenantId, tenantId)
          )
        );

      if (!document) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Document not found" });
      }

      await dbInstance
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
