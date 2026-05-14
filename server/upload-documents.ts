// @ts-nocheck
/**
 * Multipart document upload endpoint
 *
 * WHY THIS EXISTS:
 * The tRPC uploadDocuments procedure accepts base64-encoded file data in a JSON body.
 * For files > ~2MB, the JSON body exceeds Cloud Run's effective 30-second request timeout
 * (the platform kills the connection before the body is fully received).
 *
 * This Express endpoint accepts the same file as multipart/form-data, which streams
 * the file body progressively and does NOT hit the Cloud Run timeout.
 *
 * ROUTE: POST /api/upload-documents
 * AUTH:  Session cookie (same as tRPC procedures)
 * BODY:  multipart/form-data
 *   - file: File (required) — the document to upload
 *   - batch_name: string (optional)
 *   - ingestion_source: string (optional, default: "processor_upload")
 *   - claim_number: string (optional)
 *   - policy_number: string (optional)
 *
 * RESPONSE: JSON matching the tRPC uploadDocuments response shape
 */

import { Router, Request, Response, NextFunction } from "express";
import multer from "multer";
import crypto from "crypto";
import { sdk } from "./_core/sdk";
import { getDb, generateKingaRef } from "./db";
import { storagePut } from "./storage";
import { ingestionBatches, ingestionDocuments, claims } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";

// Multer: stream files to memory (no temp files, no disk I/O)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB — matches the tRPC body parser limit
    files: 10,                   // max 10 files per batch
  },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "application/pdf",
      "image/png", "image/jpeg", "image/gif", "image/webp",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
  },
});

// Auth middleware — reuses the same SDK as tRPC context
async function authMiddleware(req: Request & { user?: any }, res: Response, next: NextFunction) {
  try {
    req.user = await sdk.authenticateRequest(req);
    next();
  } catch {
    return res.status(401).json({ error: "Unauthorized — please log in" });
  }
}

function generateClaimNumber(): string {
  const date = new Date();
  const datePart = date.toISOString().slice(0, 10).replace(/-/g, "");
  const randomPart = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `DOC-${datePart}-${randomPart}`;
}

export const uploadDocumentsRouter = Router();

uploadDocumentsRouter.post(
  "/upload-documents",
  authMiddleware,
  upload.array("files", 10),  // accept up to 10 files under field name "files"
  async (req: Request & { user?: any }, res: Response) => {
    try {
      const user = req.user;
      const files = req.files as Express.Multer.File[];

      if (!files || files.length === 0) {
        return res.status(400).json({ error: "No files uploaded" });
      }

      // Resolve tenant
      let tenantId = user.tenantId;
      if (!tenantId && user.role === "admin") tenantId = "demo-insurance";
      if (!tenantId) {
        return res.status(403).json({
          error: "User must be associated with a tenant. Please contact your administrator.",
        });
      }

      const batchName = (req.body.batch_name as string) || `Batch ${new Date().toLocaleDateString()}`;
      const ingestionSource = (req.body.ingestion_source as string) || "processor_upload";
      const claimNumberInput = (req.body.claim_number as string) || undefined;
      const policyNumberInput = (req.body.policy_number as string) || undefined;
      const batchUuid = crypto.randomUUID();

      const dbInstance = await getDb();
      if (!dbInstance) {
        return res.status(500).json({ error: "Database not available" });
      }

      // Create ingestion batch record
      const [batchInsertResult] = await dbInstance.insert(ingestionBatches).values({
        tenantId,
        batchName,
        ingestionSource,
        ingestionChannel: "web_ui",
        uploadedByUserId: user.id,
        uploadedByEmail: user.email || undefined,
        totalDocuments: files.length,
        processedDocuments: 0,
        failedDocuments: 0,
        status: "pending",
      });

      const batchDbId = Number(
        (batchInsertResult as unknown as { insertId: string | number }).insertId
      );

      console.log("[MultipartUpload] Created ingestion batch, DB id:", batchDbId);

      // Process each file
      const uploadedDocs = await Promise.all(
        files.map(async (file) => {
          try {
            const buffer = file.buffer;
            const hash = crypto.createHash("sha256").update(buffer).digest("hex");
            const documentId = crypto.randomUUID();
            const s3Key = `${tenantId}/ingestion/${batchUuid}/${documentId}-${file.originalname}`;

            // Upload to S3
            const { url } = await storagePut(s3Key, buffer, file.mimetype);
            console.log("[MultipartUpload] Uploaded to S3:", s3Key);

            // Atomic DB transaction: duplicate check + insert doc + insert claim + back-link
            const txResult = await dbInstance.transaction(async (tx) => {
              // Duplicate guard
              const existingByHash = await tx
                .select({ id: ingestionDocuments.id, historicalClaimId: ingestionDocuments.historicalClaimId })
                .from(ingestionDocuments)
                .where(and(eq(ingestionDocuments.sha256Hash, hash), eq(ingestionDocuments.tenantId, tenantId)))
                .limit(1);

              const isReupload = existingByHash.length > 0 && !!existingByHash[0].historicalClaimId;
              const originalClaimId = isReupload ? existingByHash[0].historicalClaimId! : undefined;

              // Insert ingestionDocument
              const [docInsertResult] = await tx.insert(ingestionDocuments).values({
                tenantId,
                batchId: batchDbId,
                documentId,
                originalFilename: file.originalname,
                fileSizeBytes: buffer.length,
                mimeType: file.mimetype,
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

              // Insert claim
              const claimNumber = claimNumberInput || generateClaimNumber();
              const kingaRef = await generateKingaRef(tenantId);

              const [claimInsertResult] = await tx.insert(claims).values({
                claimantId: 0,
                claimNumber,
                kingaRef,
                policyNumber: policyNumberInput || undefined,
                tenantId,
                status: "intake_pending",
                workflowState: "intake_queue",
                sourceDocumentId: docDbId,
                claimSource: "document_ingestion",
                documentProcessingStatus: "pending",
                assignedProcessorId: user.id,
                priority: "medium",
                earlyFraudSuspicion: 0,
                aiAssessmentTriggered: 0,
                aiAssessmentCompleted: 0,
              });

              const claimDbId = Number(
                (claimInsertResult as unknown as { insertId: string | number }).insertId
              );

              // Back-link
              await tx
                .update(ingestionDocuments)
                .set({ historicalClaimId: claimDbId })
                .where(eq(ingestionDocuments.id, docDbId));

              return { docDbId, claimDbId, claimNumber, kingaRef, isReupload, originalClaimId };
            });

            console.log(
              `[MultipartUpload] Claim ${txResult.claimDbId} created in intake_pending` +
              `${txResult.isReupload ? ` (re-upload)` : ""}`
            );

            return {
              document_id: documentId,
              document_db_id: txResult.docDbId,
              claim_id: txResult.claimDbId,
              claim_number: txResult.claimNumber,
              kinga_ref: txResult.kingaRef ?? null,
              filename: file.originalname,
              status: "uploaded",
              is_reupload: txResult.isReupload,
              original_claim_id: txResult.originalClaimId ?? null,
            };
          } catch (error) {
            console.error(`[MultipartUpload] Failed to process ${file.originalname}:`, error);
            return {
              document_id: null,
              document_db_id: null,
              claim_id: null,
              claim_number: null,
              kinga_ref: null,
              filename: file.originalname,
              status: "failed",
              error: error instanceof Error ? error.message : "Unknown error",
            };
          }
        })
      );

      // Update batch stats
      const successCount = uploadedDocs.filter((d) => d.status === "uploaded").length;
      const failedCount = uploadedDocs.filter((d) => d.status === "failed").length;
      const reuploadCount = uploadedDocs.filter((d) => (d as any).is_reupload === true).length;

      await dbInstance
        .update(ingestionBatches)
        .set({
          processedDocuments: successCount,
          failedDocuments: failedCount,
          status: failedCount === files.length ? "failed" : "completed",
          completedAt: new Date(),
        })
        .where(eq(ingestionBatches.id, batchDbId));

      const kingaRefs = uploadedDocs
        .filter((d) => d.status === "uploaded" && (d as any).kinga_ref)
        .map((d) => (d as any).kinga_ref as string);

      return res.status(200).json({
        batch_id: batchUuid,
        batch_db_id: batchDbId,
        total_documents: files.length,
        uploaded: successCount,
        reuploads: reuploadCount,
        duplicates_skipped: 0,
        failed: failedCount,
        kinga_refs: kingaRefs,
        documents: uploadedDocs,
      });
    } catch (error) {
      console.error("[MultipartUpload] FATAL ERROR:", error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : "Unknown error during upload",
      });
    }
  }
);
