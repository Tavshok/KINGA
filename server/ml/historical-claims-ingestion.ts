/**
 * Historical Claims Ingestion Service
 * 
 * Handles batch and individual upload of historical claims with:
 * - Document grouping by claim
 * - OCR + LLM-assisted data extraction
 * - Feature engineering
 * - Metadata tagging
 */

import { getDb } from "../db";
import { 
  ingestionBatches, 
  historicalClaims, 
  ingestionDocuments,
  extractedDocumentData 
} from "../../drizzle/schema";
import { eq, inArray } from "drizzle-orm";

import { storagePut } from "../storage";
import { invokeLLM } from "../_core/llm";

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface BatchUploadConfig {
  batchName: string;
  uploadedBy: number;
  tenantId: string;
  sourceInsurer?: string;
  sourceCountry?: string;
  claimYearRange?: string;
}

export interface ClaimFolder {
  claimReference: string;
  documents: ClaimDocument[];
}

export interface ClaimDocument {
  fileName: string;
  fileBuffer: Buffer;
  mimeType: string;
  documentType?: "claim_form" | "police_report" | "damage_image" | "repair_quote" | "assessor_report" | "supporting_evidence" | "unknown";
}

export interface ExtractedClaimData {
  // Vehicle details
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleYear?: number;
  vehicleRegistration?: string;
  vehicleVin?: string;
  
  // Incident details
  incidentDate?: Date;
  incidentLocation?: string;
  incidentDescription?: string;
  accidentType?: string;
  
  // Claimant details
  claimantName?: string;
  claimantIdNumber?: string;
  claimantContact?: string;
  
  // Cost summary
  totalPanelBeaterQuote?: number;
  totalAssessorEstimate?: number;
  finalApprovedCost?: number;
  
  // Assessor
  assessorName?: string;
  assessorLicenseNumber?: string;
  
  // Document completeness
  hasAssessorReport: boolean;
  hasSupportingPhotos: boolean;
  hasPanelBeaterQuotes: boolean;
  hasPoliceReport: boolean;
  hasHandwrittenNotes: boolean;
  
  // Evidence quality
  photoCount: number;
  quoteCount: number;
  documentCount: number;
  
  // Claim history flags
  hadDispute: boolean;
  hadHandwrittenAdjustments: boolean;
  hadFraudInvestigation: boolean;
  
  // Features (JSON)
  damageFeatures?: any;
  costFeatures?: any;
  fraudIndicators?: any;
  assessorNarrativeFeatures?: any;
}

// ============================================================================
// BATCH INGESTION
// ============================================================================

/**
 * Create a new ingestion batch
 */
export async function createIngestionBatch(config: BatchUploadConfig) {
  const dbInstance = await getDb();
  if (!dbInstance) throw new Error("Database connection failed");
  const [batch] = (await dbInstance.insert(ingestionBatches).values({
    tenantId: config.tenantId,
    batchName: config.batchName || generateBatchId(),
    ingestionSource: "bulk_batch",
    ingestionChannel: "web_ui",
    uploadedByUserId: config.uploadedBy,
    totalDocuments: 0,
    processedDocuments: 0,
    failedDocuments: 0,
    status: "pending",
  }).$returningId()) as { id: number }[];
  
  return batch.id;
}

/**
 * Process batch of historical claims from ZIP upload
 */
export async function processBatchUpload(
  batchId: number,
  claimFolders: ClaimFolder[],
  tenantId: string
): Promise<{ success: number; failed: number }> {
  let successCount = 0;
  let failedCount = 0;
  
  // Update batch status
  const dbInstance = await getDb();
  if (!dbInstance) throw new Error("Database connection failed");
  await dbInstance.update(ingestionBatches)
    .set({ 
      status: "processing",
      startedAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
      totalDocuments: claimFolders.reduce((sum, folder) => sum + folder.documents.length, 0)
    })
    .where(eq(ingestionBatches.id, batchId));
  
  for (const folder of claimFolders) {
    try {
      await processClaimFolder(batchId, folder, tenantId);
      successCount++;
    } catch (error) {
      console.error(`Failed to process claim ${folder.claimReference}:`, error);
      failedCount++;
    }
  }
  
  // Update batch completion
  await dbInstance.update(ingestionBatches)
    .set({ 
      status: "completed",
      completedAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
      processedDocuments: successCount,
      failedDocuments: failedCount
    })
    .where(eq(ingestionBatches.id, batchId));
  
  return { success: successCount, failed: failedCount };
}

// ============================================================================
// INDIVIDUAL CLAIM PROCESSING
// ============================================================================

/**
 * Process a single claim folder (batch or individual upload)
 */
export async function processClaimFolder(
  batchId: number,
  folder: ClaimFolder,
  tenantId: string
): Promise<number> {
  // 1. Create historical claim record
  const dbInstance = await getDb();
  if (!dbInstance) throw new Error("Database connection failed");
  const [claim] = (await dbInstance.insert(historicalClaims).values({
    tenantId,
    batchId,
    claimReference: folder.claimReference,
    pipelineStatus: "documents_uploaded",
    totalDocuments: folder.documents.length,
  }).$returningId()) as { id: number }[];
  
  const claimId = claim.id;
  
  // 2. Upload and process each document
  const documentIds: number[] = [];
  for (const doc of folder.documents) {
    const docId = await processDocument(claimId, doc, tenantId);
    documentIds.push(docId);
  }
  
  // 3. Extract claim-level data from all documents
  const extractedData = await extractClaimData(claimId, documentIds);
  
  // 4. Update historical claim with extracted data
  await updateHistoricalClaimWithExtractedData(claimId, extractedData);
  
  // 5. Update pipeline status
  await dbInstance.update(historicalClaims)
    .set({ pipelineStatus: "extraction_complete" })
    .where(eq(historicalClaims.id, claimId));
  
  return claimId;
}

/**
 * Process and upload a single document
 */
async function processDocument(
  claimId: number,
  doc: ClaimDocument,
  tenantId: string
): Promise<number> {
  // 1. Upload to S3
  const s3Key = `historical-claims/${claimId}/${generateDocumentId()}-${doc.fileName}`;
  const { url: s3Url } = await storagePut(s3Key, doc.fileBuffer, doc.mimeType);
  
  // 2. Calculate hash
  const crypto = await import("crypto");
  const hash = crypto.createHash("sha256").update(doc.fileBuffer).digest("hex");
  
  // 3. Create ingestion document record
  const dbInstance = await getDb();
  if (!dbInstance) throw new Error("Database connection failed");
  const [document] = (await dbInstance.insert(ingestionDocuments).values({
    tenantId,
    batchId: claimId, // Link to historical claim
    documentId: generateDocumentId(),
    originalFilename: doc.fileName,
    fileSizeBytes: doc.fileBuffer.length,
    mimeType: doc.mimeType,
    s3Bucket: "kinga-storage",
    s3Key,
    s3Url,
    sha256Hash: hash,
    documentType: doc.documentType || "unknown",
  }).$returningId()) as { id: number }[];
  
  return document.id;
}

// ============================================================================
// DATA EXTRACTION
// ============================================================================

/**
 * Extract claim-level data from all documents using LLM
 */
async function extractClaimData(
  claimId: number,
  documentIds: number[]
): Promise<ExtractedClaimData> {
  // Fetch all documents for this claim
  const dbInstance = await getDb();
  if (!dbInstance) throw new Error("Database connection failed");
  const documents = await dbInstance.select().from(ingestionDocuments).where(inArray(ingestionDocuments.id, documentIds));
  
  // Build extraction prompt
  const documentList = documents.map((doc: any) => `- ${doc.originalFilename} (${doc.documentType})`).join("\n");
  
  const extractionPrompt = `You are analyzing historical insurance claim documents. Extract structured data from the following documents:

${documentList}

Extract the following information in JSON format:
{
  "vehicleMake": string,
  "vehicleModel": string,
  "vehicleYear": number,
  "vehicleRegistration": string,
  "incidentDate": "YYYY-MM-DD",
  "incidentLocation": string,
  "incidentDescription": string,
  "claimantName": string,
  "totalPanelBeaterQuote": number,
  "totalAssessorEstimate": number,
  "finalApprovedCost": number,
  "assessorName": string,
  "damageFeatures": {
    "damagedComponents": string[],
    "severity": "minor" | "moderate" | "severe" | "total_loss"
  },
  "costFeatures": {
    "partsCost": number,
    "laborCost": number,
    "paintCost": number
  },
  "fraudIndicators": {
    "riskScore": number,
    "flags": string[]
  }
}

If information is not available, use null.`;

  // Call LLM for extraction
  const response = await invokeLLM({
    messages: [
      { role: "system", content: "You are a data extraction specialist for insurance claims." },
      { role: "user", content: extractionPrompt }
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "claim_extraction",
        strict: true,
        schema: {
          type: "object",
          properties: {
            vehicleMake: { type: ["string", "null"] },
            vehicleModel: { type: ["string", "null"] },
            vehicleYear: { type: ["number", "null"] },
            vehicleRegistration: { type: ["string", "null"] },
            incidentDate: { type: ["string", "null"] },
            incidentLocation: { type: ["string", "null"] },
            incidentDescription: { type: ["string", "null"] },
            claimantName: { type: ["string", "null"] },
            totalPanelBeaterQuote: { type: ["number", "null"] },
            totalAssessorEstimate: { type: ["number", "null"] },
            finalApprovedCost: { type: ["number", "null"] },
            assessorName: { type: ["string", "null"] },
            damageFeatures: { type: "object" },
            costFeatures: { type: "object" },
            fraudIndicators: { type: "object" }
          },
          required: [],
          additionalProperties: false
        }
      }
    }
  });
  
  const messageContent = response.choices[0].message.content;
  const extracted = JSON.parse(typeof messageContent === 'string' ? messageContent : "{}");
  
  // Build ExtractedClaimData
  const data: ExtractedClaimData = {
    ...extracted,
    hasAssessorReport: documents.some((d: any) => d.documentType === "assessor_report"),
    hasSupportingPhotos: documents.some((d: any) => d.documentType === "damage_photo"),
    hasPanelBeaterQuotes: documents.some((d: any) => d.documentType === "repair_quote"),
    hasPoliceReport: documents.some((d: any) => d.documentType === "police_report"),
    hasHandwrittenNotes: documents.some((d: any) => d.mimeType?.includes("handwritten") || d.documentType === "handwritten_note"),
    photoCount: documents.filter((d: any) => d.documentType === "damage_photo").length,
    quoteCount: documents.filter((d: any) => d.documentType === "repair_quote").length,
    documentCount: documents.length,
    hadDispute: false, // Will be enhanced with more sophisticated detection
    hadHandwrittenAdjustments: documents.some((d: any) => d.documentType === "handwritten_note"),
    hadFraudInvestigation: false, // Will be enhanced
  };
  
  return data;
}

/**
 * Update historical claim with extracted data
 */
async function updateHistoricalClaimWithExtractedData(
  claimId: number,
  data: ExtractedClaimData
) {
  const dbInstance = await getDb();
  if (!dbInstance) throw new Error("Database connection failed");
  await dbInstance.update(historicalClaims).set({
    vehicleMake: data.vehicleMake,
    vehicleModel: data.vehicleModel,
    vehicleYear: data.vehicleYear,
    vehicleRegistration: data.vehicleRegistration,
    vehicleVin: data.vehicleVin,
    incidentDate: data.incidentDate ? (data.incidentDate instanceof Date ? data.incidentDate.toISOString().slice(0, 19).replace('T', ' ') : data.incidentDate) : undefined,
    incidentLocation: data.incidentLocation,
    incidentDescription: data.incidentDescription,
    accidentType: data.accidentType,
    claimantName: data.claimantName,
    claimantIdNumber: data.claimantIdNumber,
    claimantContact: data.claimantContact,
    totalPanelBeaterQuote: data.totalPanelBeaterQuote?.toString(),
    totalAssessorEstimate: data.totalAssessorEstimate?.toString(),
    finalApprovedCost: data.finalApprovedCost?.toString(),
    assessorName: data.assessorName,
    assessorLicenseNumber: data.assessorLicenseNumber,
  }).where(eq(historicalClaims.id, claimId));
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function generateBatchId(): string {
  return `BATCH-${Date.now()}-${Math.random().toString(36).substring(7).toUpperCase()}`;
}

function generateDocumentId(): string {
  return `DOC-${Date.now()}-${Math.random().toString(36).substring(7).toUpperCase()}`;
}
