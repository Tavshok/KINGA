/**
 * Historical Claims Ingestion Service
 * 
 * Handles batch upload, ZIP extraction, and file processing for historical claims data.
 * Supports safe ingestion with confidence scoring, bias detection, and dataset classification.
 */

import { getDb } from "../db";

const db = await getDb();
import { 
  ingestionBatches, 
  ingestionDocuments, 
  historicalClaims,
  isoAuditLogs
} from "../../drizzle/schema";
import { storagePut } from "../storage";
import AdmZip from "adm-zip";
import { randomUUID } from "crypto";
import path from "path";
import fs from "fs/promises";

/**
 * Create a new ingestion batch
 */
export async function createIngestionBatch(params: {
  tenantId: string;
  batchName: string;
  uploadedByUserId: number;
  uploadedByEmail: string;
  uploadedByIpAddress: string;
  ingestionSource: "processor_upload" | "bulk_batch" | "api" | "email" | "legacy_import" | "broker_upload";
  ingestionChannel: "web_ui" | "api" | "email" | "sftp";
}) {
  const batchId = randomUUID();
  
  const [batch] = await db.insert(ingestionBatches).values({
    tenantId: params.tenantId,
    batchId,
    batchName: params.batchName,
    ingestionSource: params.ingestionSource,
    ingestionChannel: params.ingestionChannel,
    uploadedByUserId: params.uploadedByUserId,
    uploadedByEmail: params.uploadedByEmail,
    uploadedByIpAddress: params.uploadedByIpAddress,
    status: "pending",
    totalDocuments: 0,
    processedDocuments: 0,
    failedDocuments: 0,
  });
  
  // Log batch creation
  await logIngestionAudit({
    tenantId: params.tenantId,
    batchId: batch.id,
    actionType: "batch_upload",
    userId: params.uploadedByUserId,
    userRole: "insurer", // TODO: Get actual role from context
    actionDetails: {
      batchName: params.batchName,
      source: params.ingestionSource,
      channel: params.ingestionChannel,
    },
  });
  
  return batch;
}

/**
 * Process ZIP file upload
 * Extracts files and creates document records
 */
export async function processZipUpload(params: {
  tenantId: string;
  batchId: number;
  zipFileBuffer: Buffer;
  zipFileName: string;
  uploadedByUserId: number;
}): Promise<{
  success: boolean;
  totalDocuments: number;
  extractedDocuments: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let extractedDocuments = 0;
  
  try {
    // Upload ZIP to S3
    const zipS3Key = `ingestion/${params.tenantId}/batch-${params.batchId}/${params.zipFileName}`;
    const { url: zipUrl } = await storagePut(
      zipS3Key,
      params.zipFileBuffer,
      "application/zip"
    );
    
    // Extract ZIP
    const zip = new AdmZip(params.zipFileBuffer);
    const zipEntries = zip.getEntries();
    
    // Filter valid files (skip directories and hidden files)
    const validEntries = zipEntries.filter(entry => 
      !entry.isDirectory && 
      !entry.entryName.startsWith("__MACOSX") &&
      !path.basename(entry.entryName).startsWith(".")
    );
    
    // Update batch with total document count
    await db.update(ingestionBatches)
      .set({ 
        totalDocuments: validEntries.length,
        status: "processing",
        startedAt: new Date(),
      })
      .where(eq(ingestionBatches.id, params.batchId));
    
    // Process each file
    for (const entry of validEntries) {
      try {
        const fileBuffer = entry.getData();
        const fileName = path.basename(entry.entryName);
        const fileExtension = path.extname(fileName).toLowerCase();
        
        // Determine MIME type
        const mimeType = getMimeType(fileExtension);
        
        // Calculate SHA256 hash
        const crypto = await import("crypto");
        const hash = crypto.createHash("sha256");
        hash.update(fileBuffer);
        const sha256Hash = hash.digest("hex");
        
        // Upload file to S3
        const documentId = randomUUID();
        const s3Key = `ingestion/${params.tenantId}/batch-${params.batchId}/documents/${documentId}${fileExtension}`;
        const { url: s3Url } = await storagePut(s3Key, fileBuffer, mimeType);
        
        // Create document record
        await db.insert(ingestionDocuments).values({
          tenantId: params.tenantId,
          batchId: params.batchId,
          documentId,
          originalFilename: fileName,
          fileSizeBytes: fileBuffer.length,
          mimeType,
          s3Bucket: "kinga-storage", // TODO: Get from config
          s3Key,
          s3Url,
          sha256Hash,
          hashVerified: 1,
          extractionStatus: "pending",
          validationStatus: "pending",
        });
        
        extractedDocuments++;
        
        // Update batch progress
        await db.update(ingestionBatches)
          .set({ processedDocuments: extractedDocuments })
          .where(eq(ingestionBatches.id, params.batchId));
          
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        errors.push(`Failed to process ${entry.entryName}: ${errorMessage}`);
        
        // Update failed documents count
        await db.update(ingestionBatches)
          .set({ 
            failedDocuments: db.sql`failed_documents + 1` 
          })
          .where(eq(ingestionBatches.id, params.batchId));
      }
    }
    
    // Mark batch as completed
    await db.update(ingestionBatches)
      .set({ 
        status: errors.length > 0 ? "failed" : "completed",
        completedAt: new Date(),
      })
      .where(eq(ingestionBatches.id, params.batchId));
    
    // Log completion
    await logIngestionAudit({
      tenantId: params.tenantId,
      batchId: params.batchId,
      actionType: "extraction_completed",
      userId: params.uploadedByUserId,
      userRole: "insurer",
      actionDetails: {
        totalDocuments: validEntries.length,
        extractedDocuments,
        failedDocuments: errors.length,
      },
    });
    
    return {
      success: errors.length === 0,
      totalDocuments: validEntries.length,
      extractedDocuments,
      errors,
    };
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    errors.push(`ZIP processing failed: ${errorMessage}`);
    
    // Mark batch as failed
    await db.update(ingestionBatches)
      .set({ 
        status: "failed",
        completedAt: new Date(),
      })
      .where(eq(ingestionBatches.id, params.batchId));
    
    // Log error
    await logIngestionAudit({
      tenantId: params.tenantId,
      batchId: params.batchId,
      actionType: "error_occurred",
      userId: params.uploadedByUserId,
      userRole: "insurer",
      errorMessage,
    });
    
    return {
      success: false,
      totalDocuments: 0,
      extractedDocuments: 0,
      errors,
    };
  }
}

/**
 * Get MIME type from file extension
 */
function getMimeType(extension: string): string {
  const mimeTypes: Record<string, string> = {
    ".pdf": "application/pdf",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".tiff": "image/tiff",
    ".tif": "image/tiff",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".txt": "text/plain",
    ".csv": "text/csv",
  };
  
  return mimeTypes[extension] || "application/octet-stream";
}

/**
 * Log ingestion audit entry
 */
async function logIngestionAudit(params: {
  tenantId: string;
  batchId?: number;
  historicalClaimId?: number;
  actionType: "batch_upload" | "extraction_started" | "extraction_completed" | "confidence_scored" | "bias_detected" | "review_assigned" | "review_completed" | "training_dataset_added" | "training_dataset_removed" | "error_occurred";
  userId: number;
  userRole: "user" | "admin" | "insurer" | "assessor" | "panel_beater" | "claimant";
  actionDetails?: any;
  errorMessage?: string;
}) {
  await db.insert(isoAuditLogs).values({
    tenantId: params.tenantId,
    batchId: params.batchId,
    historicalClaimId: params.historicalClaimId,
    actionType: params.actionType,
    userId: params.userId,
    userRole: params.userRole,
    actionDetails: params.actionDetails,
    errorMessage: params.errorMessage,
  });
}

// Import eq from drizzle-orm
import { eq } from "drizzle-orm";
