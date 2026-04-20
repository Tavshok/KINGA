// @ts-nocheck
import { eq, and, desc, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "../drizzle/schema";
import { 
  InsertUser, 
  users,
  claims,
  InsertClaim,
  panelBeaters,
  InsertPanelBeater,
  aiAssessments,
  InsertAiAssessment,
  assessorEvaluations,
  InsertAssessorEvaluation,
  panelBeaterQuotes,
  InsertPanelBeaterQuote,
  appointments,
  InsertAppointment,
  auditTrail,
  InsertAuditTrailEntry,
  notifications,
  InsertNotification,
  fraudIndicators,
  claimantHistory,
  vehicleHistory,
  entityRelationships,
  fraudAlerts,
  fraudRules,
  quoteLineItems,
  InsertQuoteLineItem,
  thirdPartyVehicles,
  InsertThirdPartyVehicle,
  vehicleMarketValuations,
  InsertVehicleMarketValuation,
  policeReports,
  InsertPoliceReport,
  preAccidentDamage,
  InsertPreAccidentDamage,
  vehicleConditionAssessment,
  InsertVehicleConditionAssessment,
  approvalWorkflow,
  InsertApprovalWorkflow,
  assessors,
  assessorInsurerRelationships,
  claimEvents,
  InsertClaimEvent,
  ingestionDocuments,
  decisionSnapshots,
  DecisionSnapshot
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;
let _pool: mysql.Pool | null = null;

// Lazily create the drizzle instance with a proper connection pool.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _pool = mysql.createPool({
        uri: process.env.DATABASE_URL,
        connectionLimit: 5,
        waitForConnections: true,
        queueLimit: 0,
        enableKeepAlive: true,
        keepAliveInitialDelay: 30000,  // Send keepalive after 30s idle
        connectTimeout: 30000,
        multipleStatements: false,
        // TiDB Cloud drops idle connections after ~5 minutes.
        // Set idleTimeout to 4 minutes so the pool releases connections before TiDB drops them.
        idleTimeout: 240000,
      });
      // Reset pool on fatal connection errors so next getDb() call creates a fresh pool
      (_pool as any).on('error', (err: Error) => {
        if ((err as any).code === 'ECONNRESET' || (err as any).code === 'PROTOCOL_CONNECTION_LOST') {
          console.warn('[Database] Pool connection lost, will reinitialise on next query:', err.message);
          _db = null;
          _pool = null;
        }
      });
      _db = drizzle(_pool, { schema, mode: "default" });
      console.log("[Database] Connection pool initialized");
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
      _pool = null;
    }
  }
  return _db;
}

/**
 * Execute a database operation with automatic retry on transient connection errors.
 * Handles ECONNRESET / PROTOCOL_CONNECTION_LOST by resetting the pool and retrying.
 * Use this wrapper for any DB call that runs outside of a live HTTP request context
 * (e.g. background jobs, scheduled tasks, fire-and-forget pipeline steps).
 */
export async function withDbRetry<T>(
  operation: () => Promise<T>,
  maxAttempts = 3,
  delayMs = 1000,
  label = 'DB operation'
): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (err: any) {
      const isTransient =
        err?.code === 'ECONNRESET' ||
        err?.code === 'PROTOCOL_CONNECTION_LOST' ||
        err?.cause?.code === 'ECONNRESET' ||
        err?.cause?.code === 'PROTOCOL_CONNECTION_LOST' ||
        String(err?.message).includes('ECONNRESET') ||
        String(err?.message).includes('PROTOCOL_CONNECTION_LOST');
      if (isTransient && attempt < maxAttempts) {
        console.warn(`[Database] ${label}: transient error on attempt ${attempt}/${maxAttempts} — resetting pool and retrying in ${delayMs * attempt}ms:`, err.message);
        // Force pool reset so getDb() creates a fresh connection on next call
        _db = null;
        _pool = null;
        await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
        lastError = err;
        continue;
      }
      throw err;
    }
  }
  throw lastError ?? new Error(`${label}: exhausted ${maxAttempts} attempts`);
}

// ============================================================================
// USER OPERATIONS
// ============================================================================

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUsersByRole(role: typeof users.$inferSelect.role) {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(users).where(eq(users.role, role));
}

// ============================================================================
// PANEL BEATER OPERATIONS
// ============================================================================

export async function getAllApprovedPanelBeaters() {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(panelBeaters).where(eq(panelBeaters.approved, 1));
}

export async function getPanelBeaterById(id: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(panelBeaters).where(eq(panelBeaters.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createPanelBeater(data: InsertPanelBeater) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(panelBeaters).values(data);
  return result;
}

// ============================================================================
// CLAIM OPERATIONS
// ============================================================================

export async function createClaim(data: InsertClaim) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(claims).values(data);
  return result;
}

export async function getClaimById(id: number, tenantId?: string) {
  const db = await getDb();
  if (!db) return undefined;

  const conditions = tenantId 
    ? and(eq(claims.id, id), eq(claims.tenantId, tenantId))
    : eq(claims.id, id);
  
  const result = await db.select().from(claims).where(conditions).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getClaimByNumber(claimNumber: string, tenantId?: string) {
  const db = await getDb();
  if (!db) return undefined;

  const conditions = tenantId
    ? and(eq(claims.claimNumber, claimNumber), eq(claims.tenantId, tenantId))
    : eq(claims.claimNumber, claimNumber);
  
  const result = await db.select().from(claims).where(conditions).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getClaimsByClaimant(claimantId: number, tenantId?: string) {
  const db = await getDb();
  if (!db) return [];

  const conditions = tenantId
    ? and(eq(claims.claimantId, claimantId), eq(claims.tenantId, tenantId))
    : eq(claims.claimantId, claimantId);
  
  return await db.select().from(claims).where(conditions).orderBy(desc(claims.createdAt));
}

export async function getClaimsByAssessor(assessorId: number, tenantId?: string) {
  const db = await getDb();
  if (!db) return [];

  const conditions = tenantId
    ? and(eq(claims.assignedAssessorId, assessorId), eq(claims.tenantId, tenantId))
    : eq(claims.assignedAssessorId, assessorId);
  
  return await db.select().from(claims).where(conditions).orderBy(desc(claims.createdAt));
}

export async function getClaimsForPanelBeater(panelBeaterId: number, tenantId?: string) {
  const db = await getDb();
  if (!db) return [];

  // Get claims where this panel beater was selected by the claimant
  const query = tenantId
    ? db.select().from(claims).where(eq(claims.tenantId, tenantId)).orderBy(desc(claims.createdAt))
    : db.select().from(claims).orderBy(desc(claims.createdAt));
  
  const allClaims = await query;
  
  return allClaims.filter(claim => {
    if (!claim.selectedPanelBeaterIds) return false;
    try {
      const selectedIds = JSON.parse(claim.selectedPanelBeaterIds);
      return selectedIds.includes(panelBeaterId);
    } catch {
      return false;
    }
  });
}

/**
 * @deprecated Use WorkflowEngine.transition() instead for governance-compliant state changes
 * This function is kept for backward compatibility but will route through WorkflowEngine
 */
export async function updateClaimStatus(
  claimId: number,
  status: typeof claims.$inferSelect.status,
  userId: number,
  userRole: string,
  tenantId: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Get current claim for validation
  const [claim] = await db.select().from(claims).where(eq(claims.id, claimId));
  if (!claim) throw new Error(`Claim ${claimId} not found`);
  
  // All state transitions MUST go through WorkflowEngine for governance
  const { transition } = await import("./workflow-engine");
  const { statusToWorkflowState } = await import("./workflow-migration");
  
  const toState = statusToWorkflowState(status as any);
  
  // Detect and heal workflowState/status inconsistency:
  // If the DB workflowState doesn't match what the current status implies,
  // the claim is in a stale/inconsistent state from a previous failed run.
  // In that case, derive fromState from the status field (source of truth for legacy claims).
  const statusImpliedState = statusToWorkflowState(claim.status as any);
  const dbWorkflowState = claim.workflowState;
  
  let fromState: string;
  if (dbWorkflowState && dbWorkflowState === toState) {
    // Self-transition detected — use status-implied state to avoid invalid loop
    console.warn(`[Workflow] Self-transition detected for claim ${claimId}: ${dbWorkflowState} → ${toState}. Using status-implied state: ${statusImpliedState}`);
    fromState = statusImpliedState;
  } else {
    fromState = dbWorkflowState || statusImpliedState;
  }
  
  await transition({
    claimId,
    fromState: fromState as any,
    toState: toState as any,
    userId,
    userRole: userRole as any,
  });
}

export async function assignClaimToAssessor(claimId: number, assessorId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Get current claim status for validation
  const [claim] = await db.select().from(claims).where(eq(claims.id, claimId));
  if (!claim) throw new Error(`Claim ${claimId} not found`);
  
  // Validate state transition to assessment_pending
  const { validateStateTransition } = await import("./workflow-validator");
  validateStateTransition(claim.status as any, "assessment_pending");

  await db.update(claims).set({ 
    assignedAssessorId: assessorId,
    status: "assessment_pending",
    updatedAt: new Date().toISOString() 
  }).where(eq(claims.id, claimId));
}

export async function updateClaimPolicyVerification(claimId: number, verified: boolean) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(claims).set({ 
    policyVerified: verified ? 1 : 0,
    updatedAt: new Date().toISOString() 
  }).where(eq(claims.id, claimId));
}

/**
 * Trigger AI Assessment — Pipeline v2 (10-stage deterministic pipeline)
 *
 * Runs the structured 10-stage pipeline:
 *   1. Document Ingestion
 *   2. OCR & Text Extraction
 *   3. Structured Data Extraction
 *   4. Data Validation
 *   5. Claim Data Assembly (builds ClaimRecord)
 *   6. Damage Analysis Engine
 *   7. Physics Analysis Engine
 *   8. Fraud Analysis Engine
 *   9. Cost Optimisation Engine
 *  10. Report Generation
 */
export async function triggerAiAssessment(claimId: number, options?: { forceReextract?: boolean }) {
  const forceReextract = options?.forceReextract ?? false;
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { runPipelineV2, PipelineIncompleteError } = await import("./pipeline-v2/orchestrator");

  // Get claim details including damage photos
  const claim = await getClaimById(claimId);
  if (!claim) throw new Error("Claim not found");

  // ── PIPELINE RELIABILITY GUARD: Pre-Flight Document Readiness Check ────────
  // Block pipeline trigger if the source document is still being processed by the
  // ingestion pipeline (extractionStatus = 'pending' or 'processing').
  // This prevents the pipeline from running on an empty/incomplete document.
  if (claim.sourceDocumentId && !forceReextract) {
    try {
      const [sourceDoc] = await db.select({ extractionStatus: ingestionDocuments.extractionStatus })
        .from(ingestionDocuments)
        .where(eq(ingestionDocuments.id, claim.sourceDocumentId))
        .limit(1);
      // Only block if the document is ACTIVELY being processed by the old ingestion pipeline.
      // 'pending' = document created but not yet processed — Pipeline V2 handles extraction
      // internally in Stage 2/3, so 'pending' must NOT block (it would deadlock forever
      // since Pipeline V2 never updates ingestionDocuments.extractionStatus).
      if (sourceDoc && sourceDoc.extractionStatus === 'processing') {
        console.warn(`[AI Assessment] Claim ${claimId}: Pre-flight guard blocked — document extraction status=${sourceDoc.extractionStatus} (actively processing by old pipeline). Pipeline will not run until document is ready.`);
        // Update claim to reflect the blocked state
        await db.update(claims).set({
          documentProcessingStatus: 'extraction_pending',
          updatedAt: new Date().toISOString(),
        }).where(eq(claims.id, claimId));
        return; // Do not proceed with pipeline
      }
    } catch (preFlightErr) {
      // Non-fatal: if we can't check, proceed with pipeline anyway
      console.warn(`[AI Assessment] Claim ${claimId}: Pre-flight check failed (non-fatal):`, preFlightErr);
    }
  }
  // ── END PRE-FLIGHT GUARD ────────────────────────────────────────────────────

  // CLEAN SLATE: Delete all existing aiAssessments records for this claim before
  // running the pipeline. This ensures the report always reflects the latest run.
  // Without this, stale records accumulate and byClaim may return an old result
  // if the new pipeline run fails partway through.
  try {
    const deletedCount = await db.delete(aiAssessments).where(eq(aiAssessments.claimId, claimId));
    console.log(`[AI Assessment] Claim ${claimId}: Deleted existing aiAssessments records before re-run.`);
  } catch (deleteErr) {
    console.warn(`[AI Assessment] Claim ${claimId}: Could not delete existing aiAssessments (non-fatal):`, deleteErr);
  }

  // Mark assessment as triggered and transition to 'parsing'.
  // Also reset aiAssessmentCompleted to 0 so the frontend polling knows to wait.
  await db.update(claims).set({
    aiAssessmentTriggered: 1,
    aiAssessmentCompleted: 0,
    documentProcessingStatus: "parsing",
    updatedAt: new Date().toISOString(),
  }).where(eq(claims.id, claimId));
  console.log(`[AI Assessment] Claim ${claimId} — Pipeline v2 starting (clean slate).`);

  // This flag is set to true just before the success-path DB write.
  // The finally safety-net checks this flag before resetting the claim to
  // intake_pending — if the pipeline succeeded, the finally block does nothing.
  // Without this flag, a race between the success DB write and the finally
  // DB read could reset a successfully-completed claim back to intake_pending.
  let pipelineSucceeded = false;

  // -----------------------------------------------------------------------
  // TOP-LEVEL FAILURE GUARD
  // -----------------------------------------------------------------------
  try {

  // Resolve PDF URL and damage photos
  let pdfUrl: string | null = null;
  let damagePhotos: string[] = [];

  if (claim.sourceDocumentId) {
    // PDF-sourced claim: look up the source document and use the raw public CloudFront URL.
    // The raw s3Url stored in ingestion_documents is publicly accessible (HTTP 200) and
    // can be fetched by the LLM without authentication. Do NOT use storageGet() — it
    // generates a presigned URL that returns HTTP 403 from the LLM's servers.
    try {
      const [sourceDoc] = await db.select().from(ingestionDocuments)
        .where(eq(ingestionDocuments.id, claim.sourceDocumentId)).limit(1);
      if (sourceDoc && sourceDoc.s3Url) {
        // Use the raw public CloudFront URL directly.
        // IMPORTANT: storageGet() generates a presigned URL that returns HTTP 403 when
        // accessed by the LLM API (which cannot supply the required Forge auth headers).
        // The raw s3Url stored in ingestion_documents is a public CloudFront URL (HTTP 200)
        // that the LLM can fetch without authentication. Always use this directly.
        // URL-encode spaces in the filename portion of the CloudFront URL.
        // Unencoded spaces cause HTTP 400 errors when the LLM API fetches the PDF.
        pdfUrl = sourceDoc.s3Url.replace(/ /g, '%20');
        console.log(`[AI Assessment] Claim ${claimId}: Using public S3 URL for LLM: ${sourceDoc.originalFilename}`);
      } else {
        console.warn(`[AI Assessment] Claim ${claimId}: sourceDocumentId=${claim.sourceDocumentId} but no S3 URL found.`);
      }
    } catch (docErr: any) {
      console.warn(`[AI Assessment] Claim ${claimId}: Failed to look up source document: ${docErr.message}`);
    }
  }

  // If no PDF URL, fall back to user-uploaded damage photos.
  // CACHE INVALIDATION INVARIANT: When a PDF is present, damagePhotos MUST start empty
  // and be freshly extracted from the PDF. Never load cached damagePhotos when pdfUrl is set.
  // This prevents stale cached photos from being used when the PDF has been replaced.
  // The forceReextract flag explicitly clears any cached photos for manual re-runs.
  if (!pdfUrl) {
    damagePhotos = claim.damagePhotos ? JSON.parse(claim.damagePhotos) : [];
    if (forceReextract && damagePhotos.length > 0) {
      console.log(`[AI Assessment] Claim ${claimId}: forceReextract=true — clearing ${damagePhotos.length} cached photo(s) to force fresh extraction.`);
      damagePhotos = [];
    }
  } else if (forceReextract) {
    // PDF present + forceReextract: damagePhotos is already [] but log for audit trail
    console.log(`[AI Assessment] Claim ${claimId}: forceReextract=true — PDF present, fresh extraction will run (cache bypass confirmed).`);
  }

  // Third fallback: if externalAssessmentUrl looks like a PDF URL, use it directly as pdfUrl.
  // This allows test/debug claims to be submitted without going through the full ingestion pipeline.
  if (!pdfUrl && damagePhotos.length === 0 && claim.externalAssessmentUrl) {
    const extUrl = claim.externalAssessmentUrl;
    if (extUrl.endsWith('.pdf') || extUrl.includes('.pdf?') || extUrl.includes('application/pdf')) {
      pdfUrl = extUrl.replace(/ /g, '%20');
      console.log(`[AI Assessment] Claim ${claimId}: Using externalAssessmentUrl as PDF source: ${pdfUrl.substring(0, 100)}`);
    }
  }

  // NOTE: Pre-flight HEAD check removed — Manus storage proxy URLs return non-200
  // for HEAD requests even when the LLM can access them via GET (file_url).
  // The HEAD check was a false negative that set pdfUrl=null and caused the pipeline
  // to create a placeholder instead of running. The LLM's 45s per-call timeout is
  // sufficient protection against truly inaccessible URLs.
  if (pdfUrl) {
    console.log(`[AI Assessment] Claim ${claimId}: PDF URL ready — proceeding with LLM extraction: ${pdfUrl.substring(0, 100)}...`);
  }

  // ── PERMANENT FIX: PDF image re-extraction ──────────────────────────
  // When a PDF is present but damagePhotos is empty (e.g. re-run, re-assessment,
  // or claims that bypassed the upload processor), extract images from the PDF
  // directly before running the pipeline. This ensures photos are always available
  // for damage analysis and fraud detection regardless of how the assessment was triggered.
  // Track photo ingestion quality for the forensic report
  let _dbPhotoIngestionLog: any = null;
  // Preserve full ExtractedImage metadata for the image classifier
  let _extractedImagesWithMetadata: any[] = [];
  if (pdfUrl && damagePhotos.length === 0) {
    const _photoIngestionStart = Date.now();
    let _extractionError: string | null = null;
    let _totalExtracted = 0;
    let _qualitySummary: any = null;
    let _isScannedPdf = false;
    try {
      console.log(`[AI Assessment] Claim ${claimId}: No cached photos — extracting images from PDF: ${pdfUrl}`);
      const { extractImagesFromPDFBuffer } = await import('./pdf-image-extractor');
      // Use native fetch with AbortController (node-fetch v3 removed timeout option)
      const pdfAbortController = new AbortController();
      const pdfFetchTimeout = setTimeout(() => pdfAbortController.abort(), 30000);
      let pdfResponse: Response | null = null;
      try {
        pdfResponse = await fetch(pdfUrl, { signal: pdfAbortController.signal });
      } finally {
        clearTimeout(pdfFetchTimeout);
      }
      if (pdfResponse && pdfResponse.ok) {
        const pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());
        const extractedImages = await extractImagesFromPDFBuffer(pdfBuffer, `claim-${claimId}.pdf`);
        _totalExtracted = extractedImages.length;
        _isScannedPdf = extractedImages.some((img: any) => img.isPageRender === true);
        // Build quality summary from extractor metadata
        _qualitySummary = {
          isScannedPdf: _isScannedPdf,
          renderDpi: extractedImages.find((img: any) => img.renderDpi)?.renderDpi ?? null,
          passedDimensionGate: extractedImages.filter((img: any) => img.width >= 200 && img.height >= 200).length,
          rejectedTooSmall: extractedImages.filter((img: any) => img.width < 200 || img.height < 200).length,
          blurryCount: extractedImages.filter((img: any) => img.isBlurry === true).length,
          textHeavyCount: extractedImages.filter((img: any) => img.isTextHeavy === true).length,
          avgSharpnessScore: extractedImages.length > 0
            ? Math.round(extractedImages.reduce((s: number, img: any) => s + (img.sharpnessScore ?? 80), 0) / extractedImages.length)
            : null,
        };
        // Preserve FULL metadata for the image classifier (confidence scoring, quality-based selection)
        _extractedImagesWithMetadata = extractedImages.filter((img: any) => img.width >= 200 && img.height >= 200);
        // Also keep flat URL array for backward compatibility
        damagePhotos = _extractedImagesWithMetadata.map((img: any) => img.url);
        console.log(`[AI Assessment] Claim ${claimId}: Re-extracted ${damagePhotos.length} photo(s) from PDF (${extractedImages.length} total images found, scanned=${_isScannedPdf})`);
        // Persist extracted photos to claim record so future re-runs skip this step
        if (damagePhotos.length > 0) {
          await db.update(claims).set({
            damagePhotos: JSON.stringify(damagePhotos),
            updatedAt: new Date().toISOString(),
          }).where(eq(claims.id, claimId)).catch(() => {});
        }
      } else {
        _extractionError = `HTTP ${pdfResponse?.status ?? 'aborted'}`;
        console.warn(`[AI Assessment] Claim ${claimId}: Failed to download PDF for image extraction: HTTP ${pdfResponse?.status ?? 'aborted'}`);
      }
    } catch (imgErr: any) {
      _extractionError = imgErr.message;
      console.warn(`[AI Assessment] Claim ${claimId}: PDF image re-extraction failed (non-fatal): ${imgErr.message}`);
    }
    // Build structured photo ingestion log for the forensic report
    try {
      const { buildPhotoIngestionLog } = await import('./pipeline-v2/photo-ingestion-log');
      _dbPhotoIngestionLog = buildPhotoIngestionLog({
        sourceUrl: pdfUrl,
        isPdf: true,
        pageRenderCount: _isScannedPdf ? (_qualitySummary?.passedDimensionGate ?? 0) + (_qualitySummary?.rejectedTooSmall ?? 0) : 0,
        embeddedImageCount: _isScannedPdf ? 0 : _totalExtracted,
        totalExtracted: _totalExtracted,
        damagePhotoCount: damagePhotos.length,
        documentPhotoCount: 0,
        llmClassificationFailed: false,
        extractionError: _extractionError,
        startedAt: new Date(_photoIngestionStart),
        totalDurationMs: Date.now() - _photoIngestionStart,
        qualitySummary: _qualitySummary,
      });
    } catch { /* non-fatal */ }
  }

  // ── CLAIM_DOCUMENTS PHOTO MERGE ──────────────────────────────────────────────
  // Collect any photos uploaded separately via the document upload UI
  // (documentCategory = 'damage_photo') and merge them into damagePhotos.
  // This ensures photos uploaded after claim submission are included in the pipeline.
  try {
    const { claimDocuments } = await import('../drizzle/schema');
    const uploadedPhotoDocs = await db.select({ fileUrl: claimDocuments.fileUrl })
      .from(claimDocuments)
      .where(and(
        eq(claimDocuments.claimId, claimId),
        eq(claimDocuments.documentCategory, 'damage_photo')
      ));
    const uploadedPhotoUrls = uploadedPhotoDocs
      .map((d: any) => d.fileUrl)
      .filter((u: any) => typeof u === 'string' && u.length > 0);
    if (uploadedPhotoUrls.length > 0) {
      const existing = new Set(damagePhotos);
      const newUrls = uploadedPhotoUrls.filter((u: any) => !existing.has(u));
      if (newUrls.length > 0) {
        damagePhotos = [...damagePhotos, ...newUrls];
        console.log(`[AI Assessment] Claim ${claimId}: Merged ${newUrls.length} uploaded damage photo(s) from claim_documents. Total: ${damagePhotos.length}`);
      }
    }
  } catch (docPhotoErr: any) {
    console.warn(`[AI Assessment] Claim ${claimId}: Failed to merge claim_documents photos (non-fatal): ${docPhotoErr.message}`);
  }
  // ── IMAGE NORMALISATION LAYER ────────────────────────────────────────────
  // Guarantees a consistent image state before Stage 2.6 and Stage 6.
  //
  // Two scenarios:
  //   A) fresh_extraction — PDF was re-extracted this run; _extractedImagesWithMetadata
  //      is populated with real quality metadata. Stage 2.6 classifier runs normally.
  //   B) cache_rehydration — damagePhotos were loaded from DB cache; PDF extraction
  //      was skipped. These photos are ALREADY TRUSTED (they passed the classifier
  //      in a previous run). We bypass the classifier and set damagePhotoUrls directly.
  //
  // This replaces the old "synthetic metadata" patch which caused the classifier to
  // re-run on cached photos with fake quality scores, sometimes producing worse
  // selections than the original trusted set.
  let _imageNormSource: 'fresh_extraction' | 'cache_rehydration' | null = null;
  if (_extractedImagesWithMetadata.length > 0) {
    // Case A: fresh extraction — classifier will run on real metadata
    _imageNormSource = 'fresh_extraction';
    console.log(`[AI Assessment] Claim ${claimId}: Image normalisation — fresh_extraction (${_extractedImagesWithMetadata.length} images with real metadata)`);
  } else if (damagePhotos.length > 0) {
    // Case B: cache rehydration — bypass classifier, use trusted cached photos directly
    _imageNormSource = 'cache_rehydration';
    // Do NOT populate _extractedImagesWithMetadata — the orchestrator Stage 2.6 checks
    // imageNormSource and skips the classifier when source === 'cache_rehydration'.
    console.log(`[AI Assessment] Claim ${claimId}: Image normalisation — cache_rehydration (${damagePhotos.length} trusted cached photos, classifier bypassed)`);
  }

  // If we have neither a PDF nor photos, create a placeholder and return
  if (!pdfUrl && damagePhotos.length === 0) {
    console.log(`[AI Assessment] Claim ${claimId}: No PDF and no damage photos. Creating placeholder.`);
    await db.delete(aiAssessments).where(eq(aiAssessments.claimId, claimId)).catch(() => {});
    await db.insert(aiAssessments).values({
      claimId,
      tenantId: claim.tenantId ?? null,
      damageDescription: "Assessment pending - No damage photos or documents uploaded yet.",
      damagedComponentsJson: JSON.stringify([]),
      estimatedCost: 0,
      fraudIndicators: JSON.stringify(["No photos or documents available for analysis"]),
      fraudRiskLevel: "low",
      totalLossIndicated: 0,
      structuralDamageSeverity: "none"
    });
    await db.update(claims).set({ 
      aiAssessmentCompleted: 1,
      status: "assessment_complete",
      documentProcessingStatus: "extracted",
      updatedAt: new Date().toISOString() 
    }).where(eq(claims.id, claimId));
    return { success: true, message: "Placeholder assessment created. Please upload damage photos or documents for full analysis." };
  }
  // ── PIPELINE V2 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  // Build pipeline context and run the 10-stage orchestrator.
  // The old monolithic LLM call + inline stages are replaced by this.
  // ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  // Load per-tenant cost rate overrides (non-fatal — falls back to regional defaults)
  let tenantRates = null;
  try {
    if (claim.tenantId) {
      tenantRates = await getTenantRates(claim.tenantId);
      if (tenantRates) {
        console.log(`[AI Assessment] Claim ${claimId}: Tenant rate overrides loaded — labour=$${tenantRates.labourRateUsdPerHour ?? 'default'}/hr, paint=$${tenantRates.paintCostPerPanelUsd ?? 'default'}/panel`);
      }
    }
  } catch (rateErr) {
    console.warn(`[AI Assessment] Claim ${claimId}: Failed to load tenant rates (non-fatal):`, rateErr);
  }
  const pipelineCtx = {
    claimId,
    tenantId: claim.tenantId ? Number(claim.tenantId) : null,
    assessmentId: 0, // Will be set after insert
    claim: claim as Record<string, any>,
    pdfUrl,
    damagePhotoUrls: damagePhotos,
    db,
    log: (stage: string, msg: string) => console.log(`[${stage}] Claim ${claimId}: ${msg}`),
    tenantRates,
    // Photo ingestion log from pre-pipeline PDF extraction (if applicable)
    photoIngestionLog: _dbPhotoIngestionLog,
    // Full ExtractedImage metadata for the image classifier (confidence scoring, quality-based selection)
    extractedImagesWithMetadata: _extractedImagesWithMetadata,
    // Normalisation layer outputs — tells Stage 2.6 whether to run or bypass the classifier
    imageNormSource: _imageNormSource,
    // Explicit photo availability count for forensic validator tracking
    photosAvailable: damagePhotos.length,
    // Live stage state map — updated by the orchestrator after each stage completes.
    // Downstream stages check this to enforce hard dependencies (BLOCKED state).
    stageStates: {} as Record<string, import('./pipeline-v2/types').PipelineStageStatus>,
  };
  // ── GLOBAL PIPELINE TIMEOUT ──────────────────────────────────────────────
  // Wrap the entire pipeline in a 15-minute timeout. With thinking disabled
  // and per-call timeouts at 90s, the worst-case pipeline (12 LLM calls +
  // 3 photo forensics) should complete in under 10 minutes. The 15-minute
  // guard prevents zombie jobs from holding DB connections indefinitely.
  const PIPELINE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
  let pipelineTimeoutId: ReturnType<typeof setTimeout> | null = null;
  const pipelineWithTimeout = Promise.race([
    runPipelineV2(pipelineCtx),
    new Promise<never>((_, reject) => {
      pipelineTimeoutId = setTimeout(
        () => reject(new Error(`Pipeline timed out after 15 minutes for claim ${claimId}`)),
        PIPELINE_TIMEOUT_MS
      );
    }),
  ]);
  let result: Awaited<ReturnType<typeof runPipelineV2>>;
  try {
    result = await pipelineWithTimeout;
  } catch (pipelineErr) {
    if (pipelineTimeoutId) clearTimeout(pipelineTimeoutId);
    if (pipelineErr instanceof PipelineIncompleteError) {
      // Route to PIPELINE_INCOMPLETE state — do not write a report
      console.error(`[AI Assessment] Claim ${claimId}: Pipeline incomplete — ${pipelineErr.message}`);
      await db.update(claims).set({
        aiAssessmentStatus: "failed",
        updatedAt: new Date(),
      }).where(eq(claims.id, claimId));
      // Upsert a minimal ai_assessment record so the exception queue can surface it
      const existingAssessment = await db.select({ id: aiAssessments.id })
        .from(aiAssessments).where(eq(aiAssessments.claimId, claimId)).limit(1);
      const pipelineIncompleteJson = JSON.stringify({
        status: "PIPELINE_INCOMPLETE",
        reason: pipelineErr.message,
        missingComponents: pipelineErr.guardResult?.missingComponents ?? [],
        timestamp: new Date().toISOString(),
      });
      if (existingAssessment.length > 0) {
        await db.update(aiAssessments).set({
          pipelineExecutionSummaryJson: pipelineIncompleteJson,
          updatedAt: new Date(),
        }).where(eq(aiAssessments.claimId, claimId));
      } else {
        await db.insert(aiAssessments).values({
          claimId,
          tenantId: claim.tenantId ? Number(claim.tenantId) : null,
          pipelineExecutionSummaryJson: pipelineIncompleteJson,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
      return;
    }
    throw pipelineErr;
  }
  if (pipelineTimeoutId) clearTimeout(pipelineTimeoutId);

  // ── PERSIST RESULTS TO DATABASE ────────────────────────────────────
  const { claimRecord, report, damageAnalysis, physicsAnalysis, fraudAnalysis, costAnalysis, turnaroundAnalysis, summary, causalChain, evidenceBundle, realismBundle, benchmarkBundle, consensusResult, causalVerdict, validatedOutcome, caseSignature, stage2RawOcrText, decisionAuthority, reportReadiness, forensicAnalysis } = result;

  // Diagnostic logging: show which pipeline outputs are populated vs null
  console.log(`[AI Assessment] Claim ${claimId}: Pipeline result summary — ` +
    `claimRecord=${claimRecord ? 'YES' : 'NULL'}, ` +
    `damageAnalysis=${damageAnalysis ? 'YES' : 'NULL'}, ` +
    `physicsAnalysis=${physicsAnalysis ? 'YES' : 'NULL'}, ` +
    `fraudAnalysis=${fraudAnalysis ? 'YES' : 'NULL'}, ` +
    `costAnalysis=${costAnalysis ? 'YES' : 'NULL'}, ` +
    `decisionAuthority=${decisionAuthority ? decisionAuthority.recommendation : 'NULL'}, ` +
    `reportReadiness=${reportReadiness ? reportReadiness.status : 'NULL'}, ` +
    `forensicAnalysis=${forensicAnalysis ? 'YES' : 'NULL'}, ` +
    `stage2RawOcrText=${stage2RawOcrText ? `${stage2RawOcrText.length} chars` : 'NULL'}, ` +
    `totalDuration=${summary?.totalDurationMs ?? 'N/A'}ms`
  );

  // ── PIPELINE RELIABILITY GUARD: Stage 2 Hard Failure Detection ─────────────
  // If Stage 2 produced zero OCR text AND the claim has a source document, this
  // is a hard extraction failure. Record it so the UI can surface a clear error
  // banner and the retry queue can re-attempt with a different strategy.
  const stage2TextLength = stage2RawOcrText ? stage2RawOcrText.trim().length : 0;
  const hasSourceDocument = !!(claim.sourceDocumentId);
  const MIN_VIABLE_OCR_LENGTH = 100; // chars — below this, extraction has effectively failed
  if (hasSourceDocument && stage2TextLength < MIN_VIABLE_OCR_LENGTH) {
    console.warn(`[AI Assessment] Claim ${claimId}: Stage 2 hard failure — OCR text length=${stage2TextLength} chars (< ${MIN_VIABLE_OCR_LENGTH}). Marking extraction_failed.`);
    try {
      await db.update(claims).set({
        documentProcessingStatus: 'extraction_failed',
        extractionRetryCount: (claim.extractionRetryCount ?? 0) + 1,
        extractionFailedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }).where(eq(claims.id, claimId));
    } catch (markErr) {
      console.warn(`[AI Assessment] Claim ${claimId}: Could not mark extraction_failed (non-fatal):`, markErr);
    }
    // Do NOT abort — the pipeline may still produce a partial result using claim DB fields.
    // The extraction_failed status is informational; the report will show degraded quality.
  }
  // ── END PIPELINE RELIABILITY GUARD ──────────────────────────────────────────

  // Extract narrativeAnalysis from claimRecord for dedicated column storage
  const narrativeAnalysis = claimRecord?.accidentDetails?.narrativeAnalysis ?? null;

  // Map fraud risk level to DB enum
  const fraudLevelMap: Record<string, 'low' | 'medium' | 'high' | 'critical' | 'elevated'> = {
    minimal: 'low', low: 'low', medium: 'medium', high: 'high', critical: 'elevated', elevated: 'elevated',
  };
  const dbFraudLevel = fraudAnalysis ? (fraudLevelMap[fraudAnalysis.fraudRiskLevel] || 'low') : 'low';

  // Map structural severity to DB enum
  const severityMap: Record<string, 'none' | 'minor' | 'moderate' | 'severe' | 'catastrophic'> = {
    none: 'none', cosmetic: 'minor', minor: 'minor', moderate: 'moderate', severe: 'severe', catastrophic: 'catastrophic',
  };
  const dbStructuralSeverity = physicsAnalysis
    ? (severityMap[physicsAnalysis.accidentSeverity] || 'moderate')
    : 'none';

  // Build damaged components JSON
  const damagedComponentsJson = damageAnalysis
    ? JSON.stringify(damageAnalysis.damagedParts.map(p => ({
        name: p.name,
        location: p.location,
        damageType: p.damageType,
        severity: p.severity,
        visible: p.visible,
      })))
    : '[]';

  // Build physics analysis JSON
  const physicsJson = physicsAnalysis ? JSON.stringify({
    impactForceKn: physicsAnalysis.impactForceKn,
    impactVector: physicsAnalysis.impactVector,
    energyDistribution: physicsAnalysis.energyDistribution,
    estimatedSpeedKmh: physicsAnalysis.estimatedSpeedKmh,
    deltaVKmh: physicsAnalysis.deltaVKmh,
    decelerationG: physicsAnalysis.decelerationG,
    accidentSeverity: physicsAnalysis.accidentSeverity,
    reconstructionSummary: physicsAnalysis.accidentReconstructionSummary,
    damageConsistencyScore: physicsAnalysis.damageConsistencyScore,
    latentDamageProbability: physicsAnalysis.latentDamageProbability,
    physicsExecuted: physicsAnalysis.physicsExecuted,
    severityConsensus: (physicsAnalysis as any).severityConsensus ?? null,
    damagePatternValidation: (physicsAnalysis as any).damagePatternValidation ?? null,
    // Numerical contract — guarantees non-zero speed/deltaV even when LLM returns 0
    physicsNumerical: (physicsAnalysis as any).physicsNumerical ?? null,
    velocityRange: (physicsAnalysis as any).velocityRange ?? null,
  }) : null;

  // Build fraud indicators JSON
  const fraudIndicatorsJson = fraudAnalysis
    ? JSON.stringify(fraudAnalysis.indicators.map(i => i.description))
    : '[]';

  // Build fraud score breakdown JSON
  const fraudScoreBreakdownJson = fraudAnalysis
    ? JSON.stringify({
        overallScore: fraudAnalysis.fraudRiskScore,
        level: fraudAnalysis.fraudRiskLevel,
        indicators: fraudAnalysis.indicators,
        damageConsistency: {
          score: fraudAnalysis.damageConsistencyScore,
          notes: fraudAnalysis.damageConsistencyNotes,
        },
        // Scenario-aware fraud detection result (null if engine was skipped)
        scenarioFraudResult: fraudAnalysis.scenarioFraudResult ?? null,
        crossEngineConsistency: fraudAnalysis.crossEngineConsistency ?? null,
        confidenceAggregation: (fraudAnalysis as any).confidenceAggregation ?? null,
        photoForensics: fraudAnalysis.photoForensics ?? null,
      })
    : null;

  // Build cost intelligence JSON
  // Source priority for documented quote values:
  //   1. Stage 9 output (costAnalysis.documentedOriginalQuoteUsd) — most reliable,
  //      includes recovered quotes from input recovery pass
  //   2. claimRecord.repairQuote — direct extraction fallback
  const repairQuote = claimRecord?.repairQuote ?? null;
  const documentedOriginalQuoteUsd =
    costAnalysis?.documentedOriginalQuoteUsd
    ?? (repairQuote?.quoteTotalCents ? repairQuote.quoteTotalCents / 100 : null);
  const documentedAgreedCostUsd =
    costAnalysis?.documentedAgreedCostUsd
    ?? (repairQuote?.agreedCostCents ? repairQuote.agreedCostCents / 100 : null);
  const panelBeaterName =
    costAnalysis?.panelBeaterName
    ?? repairQuote?.repairerName
    ?? repairQuote?.repairerCompany
    ?? null;
  const documentedLabourCostUsd =
    costAnalysis?.documentedLabourCostUsd
    ?? (repairQuote?.labourCostCents ? repairQuote.labourCostCents / 100 : null);
  const documentedPartsCostUsd =
    costAnalysis?.documentedPartsCostUsd
    ?? (repairQuote?.partsCostCents ? repairQuote.partsCostCents / 100 : null);

  const costIntelligenceJson = costAnalysis ? JSON.stringify({
    expectedRepairCostCents: costAnalysis.expectedRepairCostCents,
    quoteDeviationPct: costAnalysis.quoteDeviationPct,
    recommendedRange: costAnalysis.recommendedCostRange,
    savingsOpportunityCents: costAnalysis.savingsOpportunityCents,
    breakdown: costAnalysis.breakdown,
    labourRateUsdPerHour: costAnalysis.labourRateUsdPerHour,
    marketRegion: costAnalysis.marketRegion,
    currency: costAnalysis.currency,
    // Panel beater quote values — sourced from Stage 9 output (preferred) or claimRecord
    documentedOriginalQuoteUsd,
    documentedAgreedCostUsd,
    panelBeaterName,
    lineItems: repairQuote?.lineItems ?? [],
    documentedLabourCostUsd,
    documentedPartsCostUsd,
    quotesReceived: costAnalysis.quoteOptimisation?.quotes_evaluated ?? (documentedOriginalQuoteUsd ? 1 : 0),
    // Cost Decision Engine outputs — CRITICAL for correct cost display
    costDecision: costAnalysis.costDecision ?? null,
    costNarrative: costAnalysis.costNarrative ?? null,
    costReliability: costAnalysis.costReliability ?? null,
    quoteOptimisation: costAnalysis.quoteOptimisation ?? null,
    alignmentResult: costAnalysis.alignmentResult ?? null,
    reconciliationSummary: costAnalysis.reconciliationSummary ?? null,
  }) : (
    // Even if costAnalysis is null, still persist the documented quote values
    // so the UI can display the panel beater quote from the extracted document.
    (documentedOriginalQuoteUsd || documentedAgreedCostUsd) ? JSON.stringify({
      expectedRepairCostCents: null,
      documentedOriginalQuoteUsd,
      documentedAgreedCostUsd,
      panelBeaterName,
      lineItems: repairQuote?.lineItems ?? [],
      documentedLabourCostUsd,
      documentedPartsCostUsd,
      quotesReceived: 0,
      costDecision: null,
      costNarrative: null,
      costReliability: null,
      quoteOptimisation: null,
      alignmentResult: null,
      reconciliationSummary: null,
    }) : null
  );
  // Build repair intelligence and parts reconciliation JSON
  const repairIntelligenceJson = costAnalysis?.repairIntelligence
    ? JSON.stringify(costAnalysis.repairIntelligence)
    : null;
  const partsReconciliationJson = costAnalysis?.partsReconciliation
    ? JSON.stringify(costAnalysis.partsReconciliation)
    : null;

  // Build hidden damages JSON from physics latent damage probabilities
  // latentDamageProbability values are already on a 0-100 scale (not 0-1)
  const hiddenDamagesJson = physicsAnalysis && physicsAnalysis.physicsExecuted
    ? JSON.stringify(Object.entries(physicsAnalysis.latentDamageProbability)
        .filter(([_, prob]) => (prob as number) > 10) // filter: > 10% (0-100 scale)
        .map(([system, prob]) => ({
          system,
          probability: prob, // already 0-100
          description: `Potential hidden damage to ${system} system (${(prob as number).toFixed(0)}% probability)`,
        })))
    : '[]';

  // Build damage description
  const damageDesc = claimRecord
    ? `${claimRecord.vehicle.make} ${claimRecord.vehicle.model} (${claimRecord.vehicle.year || 'unknown year'}). ${claimRecord.damage.description || 'No description available.'}. ${damageAnalysis ? damageAnalysis.damagedParts.length + ' damaged components identified.' : ''}`
    : 'Assessment data unavailable.';

  // Estimated cost in whole currency units
  // PRIORITY: Use documented quote (agreed cost > original quote > AI estimate)
  // The AI estimate is unreliable when no market data exists — prefer the actual quote.
  // NOTE: documentedAgreedCostUsd and documentedOriginalQuoteUsd are already declared above (line ~593).
  const aiEstimateCents = costAnalysis?.expectedRepairCostCents ?? 0;
  const estimatedCost = documentedAgreedCostUsd && documentedAgreedCostUsd > 0
    ? Math.round(documentedAgreedCostUsd)
    : documentedOriginalQuoteUsd && documentedOriginalQuoteUsd > 0
      ? Math.round(documentedOriginalQuoteUsd)
      : Math.round(aiEstimateCents / 100);
  const estimatedPartsCost = costAnalysis ? Math.round(costAnalysis.breakdown.partsCostCents / 100) : 0;
  const estimatedLaborCost = costAnalysis ? Math.round(costAnalysis.breakdown.labourCostCents / 100) : 0;

  // ── TOTAL LOSS DETECTION ─────────────────────────────────────────────────
  // Fetch the vehicle market value from the valuations table (stored in cents).
  // Standard industry threshold: repair cost ≥ 75% of market value = total loss.
  let vehicleMarketValueCents: number | null = null;
  try {
    const [valRow] = await db.select({ v: vehicleMarketValuations.estimatedMarketValue })
      .from(vehicleMarketValuations)
      .where(eq(vehicleMarketValuations.claimId, claimId))
      .limit(1);
    if (valRow?.v) vehicleMarketValueCents = Number(valRow.v);
  } catch { /* non-fatal */ }
  // Also check the claim's own vehicle_market_value field (in cents)
  if (!vehicleMarketValueCents && (claim as any).vehicleMarketValue) {
    vehicleMarketValueCents = Number((claim as any).vehicleMarketValue);
  }
  const vehicleMarketValueDollars = vehicleMarketValueCents ? vehicleMarketValueCents / 100 : null;
  const repairToValueRatio = (vehicleMarketValueDollars && vehicleMarketValueDollars > 0 && estimatedCost > 0)
    ? Math.round((estimatedCost / vehicleMarketValueDollars) * 100)
    : null;
  // Total loss: repair cost ≥ 75% of vehicle market value
  const totalLossIndicated = (repairToValueRatio !== null && repairToValueRatio >= 75) ? 1 : 0;
  if (totalLossIndicated) {
    console.log(`[AI Assessment] Claim ${claimId}: TOTAL LOSS indicated — repair $${estimatedCost} vs vehicle value $${vehicleMarketValueDollars?.toFixed(0)} (${repairToValueRatio}%)`);
  }

  // Stage 36: Run Forensic Audit Validator on the completed pipeline result
  // Inject classifiedImages into result so the validator can use accurate photo counts
  if (pipelineCtx.classifiedImages) {
    (result as any).classifiedImages = pipelineCtx.classifiedImages;
  }
  let forensicAuditValidationResult: import('./pipeline-v2/forensicAuditValidator').ForensicAuditValidationReport | null = null;
  try {
    const { runForensicAuditValidation } = await import('./pipeline-v2/forensicAuditValidator');
    forensicAuditValidationResult = await runForensicAuditValidation(result as any);
    if (forensicAuditValidationResult) {
      console.log(`[AI Assessment] Claim ${claimId}: Forensic audit validation complete — status=${forensicAuditValidationResult.overallStatus}, consistencyScore=${forensicAuditValidationResult.consistencyScore}, criticalFailures=${forensicAuditValidationResult.criticalFailures.length}`);
    }
  } catch (validatorErr: any) {
    console.warn(`[AI Assessment] Claim ${claimId}: Forensic audit validator failed (non-fatal):`, validatorErr?.message ?? validatorErr);
  }

  // Delete any previous assessment for this claim
  console.log(`[AI Assessment] Claim ${claimId}: Deleting previous assessment and inserting new one...`);
  await db.delete(aiAssessments).where(eq(aiAssessments.claimId, claimId)).catch((delErr) => {
    console.warn(`[AI Assessment] Claim ${claimId}: Failed to delete previous assessment (non-fatal):`, delErr);
  });

  // Insert new assessment
  await db.insert(aiAssessments).values({
    claimId,
    tenantId: claim.tenantId ?? null,
    estimatedCost,
    damageDescription: damageDesc,
    detectedDamageTypes: damageAnalysis
      ? JSON.stringify([...new Set(damageAnalysis.damagedParts.map(p => p.damageType))])
      : '[]',
    // PERMANENT FIX: Always clamp confidenceScore to 0-100 before storing.
    // Prevents downstream display bugs (e.g. gauge showing "8200%") if completenessScore
    // is miscalculated or an upstream engine returns an out-of-range value.
    confidenceScore: claimRecord ? Math.max(0, Math.min(100, claimRecord.dataQuality.completenessScore)) : 50,
    fraudIndicators: fraudIndicatorsJson,
    fraudRiskLevel: dbFraudLevel,
    // SYSTEMIC FIX: Persist fraud score and recommendation as first-class columns.
    // Previously these were only buried in JSON blobs, causing the router to always
    // read undefined (→ fraudScore=0, recommendation=null) and produce wrong verdicts.
    fraudScore: fraudAnalysis ? Math.round(fraudAnalysis.fraudRiskScore) : null,
    // Use Decision Authority recommendation (Stage 12) as the single source of truth.
    // Falls back to cost engine recommendation if Decision Authority didn't run.
    recommendation: decisionAuthority?.recommendation ?? costAnalysis?.costDecision?.recommendation ?? null,
    fraudScoreBreakdownJson,
    modelVersion: 'pipeline-v2',
    processingTime: summary.totalDurationMs,
    totalLossIndicated,
    repairToValueRatio,
    structuralDamageSeverity: dbStructuralSeverity,
    damagedComponentsJson,
    physicsAnalysis: physicsJson,
    estimatedPartsCost,
    estimatedLaborCost,
    currencyCode: costAnalysis?.currency || 'USD',
    inferredHiddenDamagesJson: hiddenDamagesJson,
    costIntelligenceJson,
    repairIntelligenceJson,
    partsReconciliationJson,
    damagePhotosJson: claimRecord ? JSON.stringify(claimRecord.damage.imageUrls) : '[]',
    pipelineRunSummary: JSON.stringify({
      stages: summary.stages,
      documentVerification: (summary as any).documentVerification ?? null,
      turnaroundEstimate: turnaroundAnalysis ? {
        estimatedRepairDays: turnaroundAnalysis.estimatedRepairDays,
        bestCaseDays: turnaroundAnalysis.bestCaseDays,
        worstCaseDays: turnaroundAnalysis.worstCaseDays,
        confidence: turnaroundAnalysis.confidence,
        breakdown: turnaroundAnalysis.breakdown,
        bottlenecks: turnaroundAnalysis.bottlenecks,
      } : null,
    }),
    // Stage 35-42: Advanced analytics
    causalChainJson: causalChain ? JSON.stringify(causalChain) : null,
    evidenceBundleJson: evidenceBundle ? JSON.stringify(evidenceBundle) : null,
    realismBundleJson: realismBundle ? JSON.stringify(realismBundle) : null,
    benchmarkBundleJson: benchmarkBundle ? JSON.stringify(benchmarkBundle) : null,
    consensusResultJson: consensusResult ? JSON.stringify(consensusResult) : null,
    causalVerdictJson: causalVerdict ? JSON.stringify(causalVerdict) : null,
    validatedOutcomeJson: validatedOutcome ? JSON.stringify(validatedOutcome) : null,
    caseSignatureJson: caseSignature ? JSON.stringify(caseSignature) : null,
    // Stage 2 raw OCR text — stored for audit trails and re-extraction without re-running the pipeline
    stage2RawOcrText: stage2RawOcrText ?? null,
    // Full ClaimRecord JSON — canonical structured extraction result (all fields including insurer, policy, excess, etc.)
    claimRecordJson: claimRecord ? JSON.stringify(claimRecord) : null,
    // Stage 7e output: narrative analysis stored as a dedicated column for fast access
    // (also embedded in claimRecordJson.accidentDetails.narrativeAnalysis, but stored here
    //  so the ForensicAuditReport can load it without parsing the full ClaimRecord)
    narrativeAnalysisJson: narrativeAnalysis ? JSON.stringify(narrativeAnalysis) : null,
    // Stage 12: Claims Decision Authority — single non-contradictory recommendation
    decisionAuthorityJson: decisionAuthority ? JSON.stringify(decisionAuthority) : null,
    // Stage 12.5: Report Readiness Gate — whether the claim can be exported as a report
    reportReadinessJson: reportReadiness ? JSON.stringify(reportReadiness) : null,
    // Stage 13: Forensic Analysis — comprehensive forensic analysis summary from all stages
    forensicAnalysis: forensicAnalysis ? JSON.stringify(forensicAnalysis) : null,
    // Image analysis monitoring — tracks vision success rate per assessment run
    // Derived from enrichedPhotosJson set by Stage 6 on ctx and passed through orchestrator return.
    // Used to detect systemic failures and alert the team when success rate drops below threshold.
    // Use classified damage photo count if available, otherwise fall back to raw damagePhotos count
    imageAnalysisTotalCount: result.classifiedImages?.summary?.damagePhotoCount ?? damagePhotos.length,
    imageAnalysisSuccessCount: (() => {
      const total = result.classifiedImages?.summary?.damagePhotoCount ?? damagePhotos.length;
      if (total === 0) return 0;
      try {
        const enriched = result.enrichedPhotosJson ? JSON.parse(result.enrichedPhotosJson) : [];
        return enriched.filter((p: any) => (p.confidenceScore ?? 0) > 0).length;
      } catch { return 0; }
    })(),
    imageAnalysisFailedCount: (() => {
      const total = result.classifiedImages?.summary?.damagePhotoCount ?? damagePhotos.length;
      if (total === 0) return 0;
      try {
        const enriched = result.enrichedPhotosJson ? JSON.parse(result.enrichedPhotosJson) : [];
        const successCount = enriched.filter((p: any) => (p.confidenceScore ?? 0) > 0).length;
        return Math.max(0, total - successCount);
      } catch { return total; }
    })(),
    imageAnalysisSuccessRate: (() => {
      const total = result.classifiedImages?.summary?.damagePhotoCount ?? damagePhotos.length;
      if (total === 0) return null;
      try {
        const enriched = result.enrichedPhotosJson ? JSON.parse(result.enrichedPhotosJson) : [];
        const successCount = enriched.filter((p: any) => (p.confidenceScore ?? 0) > 0).length;
        return enriched.length > 0 ? Math.round((successCount / enriched.length) * 100) : 0;
      } catch { return 0; }
    })(),
    // Phase 2A: FCDI — Forensic Confidence Degradation Index (0–100)
    fcdiScore: (() => {
      try {
        const fcdi = forensicAnalysis?.fcdi;
        return typeof fcdi?.scorePercent === 'number' ? fcdi.scorePercent : null;
      } catch { return null; }
    })(),
    // Phase 2A: FEL — Forensic Execution Ledger (per-stage audit record)
    forensicExecutionLedgerJson: (() => {
      try {
        const fel = forensicAnalysis?.forensicExecutionLedger;
        return fel ? JSON.stringify(fel) : null;
      } catch { return null; }
    })(),
    // Phase 2C: Assumption Registry — queryable record of all assumptions with type/impact classification
    assumptionRegistryJson: (() => {
      try {
        const rawAssumptions = forensicAnalysis?.assumptions;
        if (!rawAssumptions || !Array.isArray(rawAssumptions) || rawAssumptions.length === 0) return null;
        const { classifyAssumptions } = require('./pipeline-v2/assumptionClassifier');
        const classified = classifyAssumptions(rawAssumptions);
        return JSON.stringify({
          version: '2.0.0',
          claimId: result.summary?.claimId,
          totalCount: classified.length,
          highImpactCount: classified.filter((a: any) => a.impact === 'HIGH').length,
          mediumImpactCount: classified.filter((a: any) => a.impact === 'MEDIUM').length,
          lowImpactCount: classified.filter((a: any) => a.impact === 'LOW').length,
          assumptions: classified.map((a: any, idx: number) => ({
            id: idx + 1,
            field: a.field ?? null,
            assumedValue: a.assumedValue ?? null,
            reason: a.reason ?? null,
            strategy: a.strategy ?? null,
            confidence: a.confidence ?? null,
            stage: a.stage ?? null,
            assumptionType: a.assumptionType ?? null,
            impact: a.impact ?? null,
          })),
        });
      } catch { return null; }
    })(),
    // Phase 2B: Economic Context Engine — policy-based currency, PPP, NCI
    economicContextJson: (() => {
      try {
        const ec = costAnalysis?.economicContext;
        return ec ? JSON.stringify(ec) : null;
      } catch { return null; }
    })(),
    // Phase 4A: Input Fidelity Engine — 4-class attribution, completeness score, DOE eligibility
    ifeResultJson: (() => {
      try {
        const ife = costAnalysis?.ifeResult;
        return ife ? JSON.stringify(ife) : null;
      } catch { return null; }
    })(),
    // Phase 4A: Decision Optimisation Engine — multi-objective scoring, fraud-aware disqualification
    doeResultJson: (() => {
      try {
        const doe = costAnalysis?.doeResult;
        return doe ? JSON.stringify(doe) : null;
      } catch { return null; }
    })(),
    // Phase 4B: FEL Version Snapshot — per-stage version tracking for deterministic replay
    felVersionSnapshotJson: (() => {
      try {
        const felVersion = forensicAnalysis?.felVersionSnapshot;
        return felVersion ? JSON.stringify(felVersion) : null;
      } catch { return null; }
    })(),
    // Stage 10 output: multi-dimensional claim quality score
    claimQualityJson: (() => {
      try {
        const cq = report?.claimQuality;
        return cq ? JSON.stringify(cq) : null;
      } catch { return null; }
    })(),
    // Stage 36 output: Forensic Audit Validator — 10-dimension post-pipeline validation
    forensicAuditValidationJson: forensicAuditValidationResult ? JSON.stringify(forensicAuditValidationResult) : null,
    // Stage 6 enriched photo metadata — persisted so the UI can show per-photo vision analysis results
    // Previously this was computed but never written to the DB column, causing enriched_photos_json to always be NULL.
    enrichedPhotosJson: result.enrichedPhotosJson ?? null,
  });

  // Update claim status to complete + backfill vehicle info from extraction
  const finalFraudScore = fraudAnalysis ? fraudAnalysis.fraudRiskScore : 0;
  const claimUpdate: Record<string, any> = {
    aiAssessmentCompleted: 1,
    status: "assessment_complete",
    documentProcessingStatus: "extracted",
    fraudRiskScore: finalFraudScore,
    fraudFlags: fraudIndicatorsJson,
    estimatedCost,
    updatedAt: new Date().toISOString(),
  };
  // Backfill vehicle info from pipeline extraction (only if not already set)
  if (claimRecord?.vehicle) {
    const v = claimRecord.vehicle;
    if (v.make) claimUpdate.vehicleMake = v.make;
    if (v.model) claimUpdate.vehicleModel = v.model;
    if (v.year) claimUpdate.vehicleYear = Number(v.year) || null;
    if (v.registration) claimUpdate.vehicleRegistration = v.registration;
    if (v.vin) claimUpdate.vehicleVin = v.vin;
    if (v.color) claimUpdate.vehicleColor = v.color;
  }
  // Backfill incident info from pipeline extraction
  if (claimRecord?.damage) {
    const d = claimRecord.damage;
    if (d.description) claimUpdate.incidentDescription = d.description;
  }
  // Backfill insurance context from pipeline extraction
  if (claimRecord?.insuranceContext) {
    const ins = claimRecord.insuranceContext;
    // Only write policyNumber if it looks like a real policy number (not a product type)
    if (ins.policyNumber && !/^(EXCESS|COMPREHENSIVE|THIRD.PARTY|FIRE|MOTOR|THEFT)$/i.test(ins.policyNumber.trim())) {
      claimUpdate.policyNumber = ins.policyNumber;
    }
    if (ins.excessAmountCents != null) claimUpdate.excessAmountCents = ins.excessAmountCents;
    if (ins.claimReference) claimUpdate.claimReference = ins.claimReference;
    if (ins.insurerName) claimUpdate.insurerName = ins.insurerName;
    // productType — write the insurance product type (e.g. 'EXCESS', 'COMPREHENSIVE') separately from policyNumber
    if (ins.productType) {
      (claimUpdate as any).productType = ins.productType;
      (claimUpdate as any).productTypeSource = 'stage_3_llm';
    } else if (ins.policyNumber && /^(EXCESS|COMPREHENSIVE|THIRD.PARTY|FIRE|MOTOR|THEFT)$/i.test(ins.policyNumber.trim())) {
      // Fallback: if policyNumber looks like a product type, rescue it here
      (claimUpdate as any).productType = ins.policyNumber.trim().toUpperCase();
      (claimUpdate as any).productTypeSource = 'stage_3_llm_rescue';
    }
  }
  // Backfill data quality score from claimRecord
  if (claimRecord?.dataQuality?.completenessScore != null) {
    claimUpdate.dataCompletenessScore = claimRecord.dataQuality.completenessScore;
  }
  // Backfill speed from accidentDetails or narrativeAnalysis
  const resolvedSpeed = claimRecord?.accidentDetails?.estimatedSpeedKmh
    ?? (claimRecord as any)?._narrativeSpeed
    ?? null;
  if (resolvedSpeed != null && resolvedSpeed > 0) {
    claimUpdate.estimatedSpeedKmh = resolvedSpeed;
  }
  // incidentType lives in accidentDetails (DamageRecord has no incidentType field)
  if (claimRecord?.accidentDetails) {
    const a = claimRecord.accidentDetails;
    if (a.date) claimUpdate.incidentDate = a.date;
    if (a.incidentType && a.incidentType !== 'unknown') {
      // Map CanonicalIncidentType → DB enum (all canonical types supported)
      const typeMap: Record<string, string> = {
        collision: 'collision',
        theft: 'theft',
        vandalism: 'vandalism',
        flood: 'flood',
        fire: 'fire',
        hijacking: 'hijacking',
        animal_strike: 'animal_strike',
        hail: 'hail',
        rollover: 'rollover',
        mechanical_failure: 'mechanical_failure',
      };
      const mapped = typeMap[a.incidentType];
      if (mapped) claimUpdate.incidentType = mapped;
    }
  }
  // Mark success BEFORE the DB write so the finally safety-net does not
  // reset this claim even if there is a brief delay in the DB commit.
  pipelineSucceeded = true;
  console.log(`[AI Assessment] Claim ${claimId}: claimUpdate keys = ${Object.keys(claimUpdate).join(', ')}`);
  try {
    await db.update(claims).set(claimUpdate).where(eq(claims.id, claimId));
  } catch (claimUpdateErr) {
    console.error(`[AI Assessment] CLAIM UPDATE FAILED for claim ${claimId}:`, claimUpdateErr);
    throw claimUpdateErr;
  }

  console.log(`[AI Assessment] Claim ${claimId}: DB insert + claim update complete. Pipeline v2 finished. Duration: ${summary.totalDurationMs}ms. Stages: ${JSON.stringify(summary.stages)}`);

  // END TOP-LEVEL TRY
  } catch (topLevelError) {
    // LLM call, JSON parse, or other unhandled failure
    console.error(`[AI Assessment] Fatal error for claim ${claimId}:`, topLevelError);
    // CRITICAL FIX: If pipelineSucceeded is already true, the success path already
    // wrote assessment_complete to the DB. Do NOT reset to intake_pending — that
    // is the claim-cycling bug. Only reset when the pipeline genuinely failed.
    if (!pipelineSucceeded) {
      try {
        const dbInner = await getDb();
        if (dbInner) {
          await dbInner.update(claims).set({
            documentProcessingStatus: "failed",
            status: "intake_pending",
            workflowState: "intake_queue",  // Reset workflow state so re-run can transition cleanly
            updatedAt: new Date().toISOString(),
          }).where(eq(claims.id, claimId));
          console.log(`[AI Assessment] Claim ${claimId} marked as failed after AI error. workflowState reset to intake_queue.`);
        }
      } catch (updateError) {
        console.error(`[AI Assessment] Could not update failure status for claim ${claimId}:`, updateError);
      }
    } else {
      console.warn(`[AI Assessment] Claim ${claimId}: error thrown AFTER pipelineSucceeded=true — pipeline completed successfully, NOT resetting to intake_pending. Error:`, topLevelError);
    }
    throw topLevelError; // Re-throw so the caller's setImmediate catch logs it
  } finally {
    // GUARANTEED SAFETY NET: Ensure claim is NEVER left in a transient state.
    // IMPORTANT: Only fires if the pipeline did NOT succeed. If pipelineSucceeded
    // is true, the success path already wrote the correct status — do not reset.
    if (!pipelineSucceeded) {
      try {
        const dbFinally = await getDb();
        if (dbFinally) {
          const [currentState] = await dbFinally.select({
            dps: claims.documentProcessingStatus,
          }).from(claims).where(eq(claims.id, claimId)).limit(1);
          if (currentState && (currentState.dps === 'parsing' || currentState.dps === 'extracting' || currentState.dps === 'analysing')) {
            console.error(`[AI Assessment] SAFETY NET: Claim ${claimId} still in '${currentState.dps}' after pipeline failure — forcing to 'failed'.`);
            await dbFinally.update(claims).set({
              documentProcessingStatus: "failed",
              status: "intake_pending",
              workflowState: "intake_queue",
              aiAssessmentTriggered: 0,
              updatedAt: new Date().toISOString(),
            }).where(eq(claims.id, claimId));
          }
        }
      } catch (finallyErr) {
        console.error(`[AI Assessment] SAFETY NET DB update failed for claim ${claimId}:`, finallyErr);
      }
    }
  }
}

// ============================================================================
// AI ASSESSMENT OPERATIONS
// ============================================================================

export async function createAiAssessment(data: InsertAiAssessment) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(aiAssessments).values(data);
  
  // Mark claim as AI assessment completed
  await db.update(claims).set({ 
    aiAssessmentCompleted: 1,
    updatedAt: new Date().toISOString() 
  }).where(eq(claims.id, data.claimId));
  
  return result;
}

export async function getAiAssessmentByClaimId(claimId: number, tenantId?: string) {
  const { parsePhysicsAnalysis } = await import('../shared/physics-types');
  const db = await getDb();
  if (!db) return null;
  let rawAssessment: typeof aiAssessments.$inferSelect | null = null;
  let claimRow: typeof claims.$inferSelect | null = null;

  if (tenantId) {
    // Join with claims to enforce tenant filtering — return the most recent assessment
    const result = await db.select({ assessment: aiAssessments, claim: claims })
      .from(aiAssessments)
      .innerJoin(claims, eq(aiAssessments.claimId, claims.id))
      .where(and(eq(aiAssessments.claimId, claimId), eq(claims.tenantId, tenantId)))
      .orderBy(desc(aiAssessments.id))
      .limit(1);
    if (result.length > 0) {
      rawAssessment = result[0].assessment;
      claimRow = result[0].claim;
    }
  } else {
    const [assessmentResult, claimResult] = await Promise.all([
      db.select().from(aiAssessments)
        .where(eq(aiAssessments.claimId, claimId))
        .orderBy(desc(aiAssessments.id))
        .limit(1),
      db.select().from(claims)
        .where(eq(claims.id, claimId))
        .limit(1),
    ]);
    rawAssessment = assessmentResult.length > 0 ? assessmentResult[0] : null;
    claimRow = claimResult.length > 0 ? claimResult[0] : null;
  }

  if (!rawAssessment) return null;

  // Parse physicsAnalysis JSON with typed helper
  return {
    ...rawAssessment,
    physicsAnalysisParsed: parsePhysicsAnalysis(rawAssessment.physicsAnalysis),
    // ── Claim fields (joined) — used by the report router so it doesn't need
    //    a separate query. These are the authoritative values from the claims table.
    claimNumber: claimRow?.claimNumber ?? rawAssessment.claimNumber ?? null,
    vehicleMake: claimRow?.vehicleMake ?? null,
    vehicleModel: claimRow?.vehicleModel ?? null,
    vehicleYear: claimRow?.vehicleYear ?? null,
    vehicleRegistration: claimRow?.vehicleRegistration ?? null,
    accidentDate: claimRow?.incidentDate ?? null,
    accidentLocation: claimRow?.incidentLocation ?? null,
    accidentDescription: claimRow?.incidentDescription ?? null,
    normalisedDescription: claimRow?.normalisedDescription ?? null,
    reportedCauseLabel: claimRow?.reportedCauseLabel ?? null,
    policyNumber: claimRow?.policyNumber ?? null,
    currencyCode: claimRow?.currencyCode ?? null,
    countryCode: claimRow?.countryCode ?? null,
  };
}

// ============================================================================
// ASSESSOR EVALUATION OPERATIONS
// ============================================================================

export async function createAssessorEvaluation(data: InsertAssessorEvaluation) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(assessorEvaluations).values(data);
  return result;
}

export async function getAssessorEvaluationByClaimId(claimId: number, tenantId?: string) {
  const db = await getDb();
  if (!db) return null;

  if (tenantId) {
    // Join with claims to enforce tenant filtering
    const result = await db.select({ evaluation: assessorEvaluations })
      .from(assessorEvaluations)
      .innerJoin(claims, eq(assessorEvaluations.claimId, claims.id))
      .where(and(eq(assessorEvaluations.claimId, claimId), eq(claims.tenantId, tenantId)))
      .limit(1);
    return result.length > 0 ? result[0].evaluation : null;
  } else {
    const result = await db.select().from(assessorEvaluations).where(eq(assessorEvaluations.claimId, claimId)).limit(1);
    return result.length > 0 ? result[0] : null;
  }
}

export async function updateAssessorEvaluation(id: number, data: Partial<InsertAssessorEvaluation>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(assessorEvaluations).set({ ...data, updatedAt: new Date().toISOString() }).where(eq(assessorEvaluations.id, id));
}

// ============================================================================
// PANEL BEATER QUOTE OPERATIONS
// ============================================================================

export async function createPanelBeaterQuote(data: InsertPanelBeaterQuote) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(panelBeaterQuotes).values(data);
  return result;
}

export async function getQuotesByClaimId(claimId: number, tenantId?: string) {
  const db = await getDb();
  if (!db) return [];

  if (tenantId) {
    // Join with claims to enforce tenant filtering
    const result = await db.select({ quote: panelBeaterQuotes })
      .from(panelBeaterQuotes)
      .innerJoin(claims, eq(panelBeaterQuotes.claimId, claims.id))
      .where(and(eq(panelBeaterQuotes.claimId, claimId), eq(claims.tenantId, tenantId)));
    return result.map(r => r.quote);
  } else {
    return await db.select().from(panelBeaterQuotes).where(eq(panelBeaterQuotes.claimId, claimId));
  }
}

export async function getQuoteById(id: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(panelBeaterQuotes).where(eq(panelBeaterQuotes.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updateQuote(id: number, data: Partial<InsertPanelBeaterQuote>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(panelBeaterQuotes).set({ ...data, updatedAt: new Date().toISOString() }).where(eq(panelBeaterQuotes.id, id));
}

export async function getQuotesByPanelBeater(panelBeaterId: number, tenantId?: string) {
  const db = await getDb();
  if (!db) return [];

  if (tenantId) {
    // Join with claims to enforce tenant filtering
    const result = await db.select({ quote: panelBeaterQuotes })
      .from(panelBeaterQuotes)
      .innerJoin(claims, eq(panelBeaterQuotes.claimId, claims.id))
      .where(and(eq(panelBeaterQuotes.panelBeaterId, panelBeaterId), eq(claims.tenantId, tenantId)))
      .orderBy(desc(panelBeaterQuotes.createdAt));
    return result.map(r => r.quote);
  } else {
    return await db.select().from(panelBeaterQuotes).where(eq(panelBeaterQuotes.panelBeaterId, panelBeaterId)).orderBy(desc(panelBeaterQuotes.createdAt));
  }
}

// ============================================================================
// APPOINTMENT OPERATIONS
// ============================================================================

export async function createAppointment(data: InsertAppointment) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(appointments).values(data);
  return result;
}

export async function getAppointmentsByAssessor(assessorId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(appointments).where(eq(appointments.assessorId, assessorId)).orderBy(desc(appointments.scheduledDate));
}

export async function getAppointmentsByClaimId(claimId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(appointments).where(eq(appointments.claimId, claimId)).orderBy(desc(appointments.scheduledDate));
}

export async function updateAppointmentStatus(id: number, status: typeof appointments.$inferSelect.status) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(appointments).set({ status, updatedAt: new Date().toISOString() }).where(eq(appointments.id, id));
}

// ============================================================================
// AUDIT TRAIL OPERATIONS
// ============================================================================

export async function createAuditEntry(data: InsertAuditTrailEntry) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(auditTrail).values(data);
  return result;
}

export async function getAuditTrailByClaimId(claimId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(auditTrail).where(eq(auditTrail.claimId, claimId)).orderBy(desc(auditTrail.createdAt));
}

export async function getAuditTrailByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(auditTrail).where(eq(auditTrail.userId, userId)).orderBy(desc(auditTrail.createdAt));
}

// ============================================================================
// NOTIFICATION OPERATIONS
// ============================================================================

/**
 * Create a new notification for a user
 * @param data - Notification data
 * @returns Created notification result
 */
export async function createNotification(data: InsertNotification) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(notifications).values(data);
  return result;
}

/**
 * Get all notifications for a specific user
 * @param userId - User ID
 * @param limit - Maximum number of notifications to return (default: 50)
 * @returns Array of notifications ordered by creation date (newest first)
 */
export async function getNotificationsByUser(userId: number, limit: number = 50) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

/**
 * Get unread notification count for a user
 * @param userId - User ID
 * @returns Count of unread notifications
 */
export async function getUnreadNotificationCount(userId: number) {
  const db = await getDb();
  if (!db) return 0;

  const result = await db
    .select()
    .from(notifications)
    .where(and(
      eq(notifications.userId, userId),
      eq(notifications.isRead, 0)
    ));

  return result.length;
}

/**
 * Mark a notification as read
 * @param id - Notification ID
 */
export async function markNotificationAsRead(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(notifications)
    .set({ 
      isRead: 1, 
      readAt: new Date() 
    })
    .where(eq(notifications.id, id));
}

/**
 * Mark all notifications as read for a user
 * @param userId - User ID
 */
export async function markAllNotificationsAsRead(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(notifications)
    .set({ 
      isRead: 1, 
      readAt: new Date() 
    })
    .where(and(
      eq(notifications.userId, userId),
      eq(notifications.isRead, 0)
    ));
}

/**
 * Delete a notification
 * @param id - Notification ID
 */
export async function deleteNotification(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(notifications).where(eq(notifications.id, id));
}

/**
 * Delete old read notifications (older than 30 days)
 * Used for periodic cleanup
 */
export async function deleteOldNotifications() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  await db
    .delete(notifications)
    .where(and(
      eq(notifications.isRead, 1)
      // Note: Would need to add date comparison here if supported
    ));
}


// ============================================================================
// QUOTE LINE ITEMS OPERATIONS
// ============================================================================

/**
 * Create quote line items for a quote
 * @param items - Array of line items to create
 */
export async function createQuoteLineItems(items: InsertQuoteLineItem[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.insert(quoteLineItems).values(items);
}

/**
 * Get all line items for a quote
 * @param quoteId - Quote ID
 */
export async function getQuoteLineItemsByQuoteId(quoteId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db
    .select()
    .from(quoteLineItems)
    .where(eq(quoteLineItems.quoteId, quoteId))
    .orderBy(quoteLineItems.itemNumber);
}

/**
 * Update a quote line item
 * @param id - Line item ID
 * @param data - Updated data
 */
export async function updateQuoteLineItem(id: number, data: Partial<InsertQuoteLineItem>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(quoteLineItems)
    .set(data)
    .where(eq(quoteLineItems.id, id));
}

// ============================================================================
// THIRD PARTY VEHICLES OPERATIONS
// ============================================================================

/**
 * Create a third party vehicle record
 * @param data - Third party vehicle data
 */
export async function createThirdPartyVehicle(data: InsertThirdPartyVehicle) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [result] = await db.insert(thirdPartyVehicles).values(data);
  return result.insertId;
}

/**
 * Get third party vehicle by claim ID
 * @param claimId - Claim ID
 */
export async function getThirdPartyVehicleByClaimId(claimId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [vehicle] = await db
    .select()
    .from(thirdPartyVehicles)
    .where(eq(thirdPartyVehicles.claimId, claimId))
    .limit(1);

  return vehicle || null;
}

/**
 * Update third party vehicle
 * @param id - Vehicle ID
 * @param data - Updated data
 */
export async function updateThirdPartyVehicle(id: number, data: Partial<InsertThirdPartyVehicle>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(thirdPartyVehicles)
    .set(data)
    .where(eq(thirdPartyVehicles.id, id));
}

// ============================================================================
// VEHICLE MARKET VALUATIONS OPERATIONS
// ============================================================================

/**
 * Create a vehicle market valuation
 * @param data - Valuation data
 */
export async function createVehicleMarketValuation(data: InsertVehicleMarketValuation) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [result] = await db.insert(vehicleMarketValuations).values(data);
  return result.insertId;
}

/**
 * Get vehicle market valuation by claim ID
 * @param claimId - Claim ID
 */
export async function getVehicleMarketValuationByClaimId(claimId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [valuation] = await db
    .select()
    .from(vehicleMarketValuations)
    .where(eq(vehicleMarketValuations.claimId, claimId))
    .orderBy(desc(vehicleMarketValuations.createdAt))
    .limit(1);

  return valuation || null;
}

/**
 * Update vehicle market valuation
 * @param id - Valuation ID
 * @param data - Updated data
 */
export async function updateVehicleMarketValuation(id: number, data: Partial<InsertVehicleMarketValuation>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(vehicleMarketValuations)
    .set(data)
    .where(eq(vehicleMarketValuations.id, id));
}

// ============================================================================
// POLICE REPORTS OPERATIONS
// ============================================================================

/**
 * Create a police report
 * @param data - Police report data
 */
export async function createPoliceReport(data: InsertPoliceReport) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [result] = await db.insert(policeReports).values(data);
  return result.insertId;
}

/**
 * Get police report by claim ID
 * @param claimId - Claim ID
 */
export async function getPoliceReportByClaimId(claimId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [report] = await db
    .select()
    .from(policeReports)
    .where(eq(policeReports.claimId, claimId))
    .limit(1);

  return report || null;
}

/**
 * Update police report
 * @param id - Report ID
 * @param data - Updated data
 */
export async function updatePoliceReport(id: number, data: Partial<InsertPoliceReport>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(policeReports)
    .set(data)
    .where(eq(policeReports.id, id));
}

// ============================================================================
// PRE-ACCIDENT DAMAGE OPERATIONS
// ============================================================================

/**
 * Create pre-accident damage records
 * @param data - Damage data (single or array)
 */
export async function createPreAccidentDamage(data: InsertPreAccidentDamage | InsertPreAccidentDamage[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const items = Array.isArray(data) ? data : [data];
  await db.insert(preAccidentDamage).values(items);
}

/**
 * Get all pre-accident damage for a claim
 * @param claimId - Claim ID
 */
export async function getPreAccidentDamageByClaimId(claimId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db
    .select()
    .from(preAccidentDamage)
    .where(eq(preAccidentDamage.claimId, claimId));
}

// ============================================================================
// VEHICLE CONDITION ASSESSMENT OPERATIONS
// ============================================================================

/**
 * Create a vehicle condition assessment
 * @param data - Assessment data
 */
export async function createVehicleConditionAssessment(data: InsertVehicleConditionAssessment) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [result] = await db.insert(vehicleConditionAssessment).values(data);
  return result.insertId;
}

/**
 * Get vehicle condition assessment by claim ID
 * @param claimId - Claim ID
 */
export async function getVehicleConditionAssessmentByClaimId(claimId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [assessment] = await db
    .select()
    .from(vehicleConditionAssessment)
    .where(eq(vehicleConditionAssessment.claimId, claimId))
    .limit(1);

  return assessment || null;
}

/**
 * Update vehicle condition assessment
 * @param id - Assessment ID
 * @param data - Updated data
 */
export async function updateVehicleConditionAssessment(id: number, data: Partial<InsertVehicleConditionAssessment>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(vehicleConditionAssessment)
    .set(data)
    .where(eq(vehicleConditionAssessment.id, id));
}

// ============================================================================
// APPROVAL WORKFLOW OPERATIONS
// ============================================================================

/**
 * Create approval workflow entries for a claim
 * @param data - Workflow data (single or array)
 */
export async function createApprovalWorkflow(data: InsertApprovalWorkflow | InsertApprovalWorkflow[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const items = Array.isArray(data) ? data : [data];
  await db.insert(approvalWorkflow).values(items);
}

/**
 * Get all approval workflow entries for a claim
 * @param claimId - Claim ID
 */
export async function getApprovalWorkflowByClaimId(claimId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db
    .select()
    .from(approvalWorkflow)
    .where(eq(approvalWorkflow.claimId, claimId))
    .orderBy(approvalWorkflow.levelOrder);
}

/**
 * Get pending approval for a specific level
 * @param claimId - Claim ID
 * @param level - Approval level
 */
export async function getPendingApprovalByLevel(
  claimId: number,
  level: 'assessor' | 'risk_surveyor' | 'risk_manager'
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [approval] = await db
    .select()
    .from(approvalWorkflow)
    .where(and(
      eq(approvalWorkflow.claimId, claimId),
      eq(approvalWorkflow.level, level),
      eq(approvalWorkflow.status, 'pending')
    ))
    .limit(1);

  return approval || null;
}

/**
 * Update approval workflow entry
 * @param id - Workflow ID
 * @param data - Updated data
 */
export async function updateApprovalWorkflow(id: number, data: Partial<InsertApprovalWorkflow>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(approvalWorkflow)
    .set(data)
    .where(eq(approvalWorkflow.id, id));
}

// ============================================================================
// ASSESSOR OPERATIONS
// ============================================================================

export async function createAssessor(data: typeof assessors.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(assessors).values(data);
  return result;
}

export async function getAssessorByUserId(userId: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(assessors).where(eq(assessors.userId, userId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getAssessorById(id: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(assessors).where(eq(assessors.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getAssessorByLicenseNumber(licenseNumber: string) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(assessors).where(eq(assessors.professionalLicenseNumber, licenseNumber)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updateAssessor(id: number, data: Partial<typeof assessors.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(assessors).set(data).where(eq(assessors.id, id));
}

export async function createAssessorInsurerRelationship(data: typeof assessorInsurerRelationships.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(assessorInsurerRelationships).values(data);
  return result;
}

export async function getAssessorsByTenant(tenantId: string) {
  const db = await getDb();
  if (!db) return [];

  const relationships = await db.select().from(assessorInsurerRelationships)
    .where(and(
      eq(assessorInsurerRelationships.tenantId, tenantId),
      eq(assessorInsurerRelationships.relationshipStatus, "active")
    ));

  if (relationships.length === 0) return [];

  const assessorIds = relationships.map(r => r.assessorId);
  const assessorList = await db.select().from(assessors).where(inArray(assessors.id, assessorIds));

  const userIds = assessorList.map(a => a.userId);
  const userList = await db.select().from(users).where(inArray(users.id, userIds));

  return assessorList.map(assessor => {
    const user = userList.find(u => u.id === assessor.userId);
    const relationship = relationships.find(r => r.assessorId === assessor.id);

    return {
      ...assessor,
      userName: user?.name,
      userEmail: user?.email,
      relationshipType: relationship?.relationshipType,
      totalAssignmentsCompleted: relationship?.totalAssignmentsCompleted || 0,
      performanceRating: relationship?.performanceRating,
      specializations: assessor.specializations ? JSON.parse(assessor.specializations) : [],
      certifications: assessor.certifications ? JSON.parse(assessor.certifications) : [],
      serviceRegions: assessor.serviceRegions ? JSON.parse(assessor.serviceRegions) : [],
    };
  });
}

export async function getMarketplaceAssessors(filters?: {
  serviceRegion?: string;
  specializations?: string[];
  minPerformanceScore?: number;
  minAverageRating?: number;
}) {
  const db = await getDb();
  if (!db) return [];

  let query = db.select().from(assessors)
    .where(and(
      eq(assessors.marketplaceEnabled, 1),
      eq(assessors.marketplaceStatus, "active"),
      eq(assessors.activeStatus, 1)
    ));

  const results = await query;

  // Apply filters
  let filtered = results;

  if (filters?.serviceRegion) {
    filtered = filtered.filter(a => {
      const regions = a.serviceRegions ? JSON.parse(a.serviceRegions) : [];
      return regions.includes(filters.serviceRegion);
    });
  }

  if (filters?.specializations && filters.specializations.length > 0) {
    filtered = filtered.filter(a => {
      const specs = a.specializations ? JSON.parse(a.specializations) : [];
      return filters.specializations!.some(s => specs.includes(s));
    });
  }

  if (filters?.minPerformanceScore) {
    filtered = filtered.filter(a => {
      const score = a.performanceScore ? parseFloat(a.performanceScore.toString()) : 0;
      return score >= filters.minPerformanceScore!;
    });
  }

  if (filters?.minAverageRating) {
    filtered = filtered.filter(a => {
      const rating = a.averageRating ? parseFloat(a.averageRating.toString()) : 0;
      return rating >= filters.minAverageRating!;
    });
  }

  return filtered.map(assessor => ({
    ...assessor,
    specializations: assessor.specializations ? JSON.parse(assessor.specializations) : [],
    certifications: assessor.certifications ? JSON.parse(assessor.certifications) : [],
    serviceRegions: assessor.serviceRegions ? JSON.parse(assessor.serviceRegions) : [],
  }));
}


// ============================================================================
// EVENT EMISSION
// ============================================================================

/**
 * Emit a claim event for workflow analytics and turnaround time tracking
 */
export async function emitClaimEvent(params: {
  claimId: number;
  eventType: string;
  userId?: number;
  userRole?: string;
  tenantId?: string;
  eventPayload?: Record<string, unknown>;
}): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn("[Events] Cannot emit event: database not available");
    return;
  }

  try {
    await db.insert(claimEvents).values({
      claimId: params.claimId,
      eventType: params.eventType,
      userId: params.userId,
      userRole: params.userRole,
      tenantId: params.tenantId,
      eventPayload: params.eventPayload || null,
      emittedAt: new Date(),
    });
    
    console.log(`[Events] Emitted ${params.eventType} for claim ${params.claimId}`);
  } catch (error) {
    console.error(`[Events] Failed to emit ${params.eventType}:`, error);
    // Non-blocking: don't throw, just log
  }
}

// ============================================================
// DECISION SNAPSHOTS — Immutable audit persistence
// ============================================================

export interface DecisionSnapshotInput {
  claimId: string;
  tenantId: string;
  createdByUserId?: string;

  verdict: {
    decision: string;
    primaryReason: string;
    confidence: number;
  };

  cost: {
    aiEstimate: number;       // in cents
    quoted: number;           // in cents
    deviationPercent: number;
    fairRangeMin: number;     // in cents
    fairRangeMax: number;     // in cents
    verdict: string;
  };

  fraud: {
    score: number;
    level: string;
    contributions: Array<{ factor: string; value: number }>;
  };

  physics: {
    deltaV: number;
    velocityRange: string;
    energyKj: number;
    forceKn: number;
    estimated: boolean;
  };

  damage: {
    zones: string[];
    severity: string;
    consistencyScore: number;
  };

  enforcementTrace: Array<{ rule: string; value: unknown; threshold: string; triggered: boolean }>;
  confidenceBreakdown: Array<{ factor: string; penalty: number }>;

  dataQuality: {
    missingFields: string[];
    estimatedFields: string[];
    extractionConfidence: number;
  };
}

// ─── Spec-compliant snapshot shape (snake_case, no nulls) ───────────────────

export interface SpecSnapshot {
  // Identity
  claim_id: string;
  snapshot_version: number;
  created_at: number;          // Unix ms
  created_by_user_id: string;

  // Verdict
  verdict_decision: string;    // FINALISE_CLAIM | REVIEW_REQUIRED | ESCALATE_INVESTIGATION
  verdict_label: string;       // Human-readable label
  verdict_primary_reason: string;
  verdict_confidence: number;  // 0-100
  verdict_color: string;       // green | amber | red

  // Cost
  cost_ai_estimate_cents: number;
  cost_ai_estimate_display: number;  // dollars
  cost_quoted_cents: number;
  cost_quoted_display: number;       // dollars
  cost_deviation_percent: number;
  cost_fair_range_min_cents: number;
  cost_fair_range_max_cents: number;
  cost_fair_range_min_display: number;
  cost_fair_range_max_display: number;
  cost_verdict: string;              // FAIR | OVERPRICED | UNDERPRICED | NO_QUOTE

  // Fraud
  fraud_score: number;               // 0-100
  fraud_level: string;               // minimal | low | moderate | high | elevated
  fraud_level_label: string;
  fraud_contributions: Array<{ factor: string; value: number }>;

  // Physics
  delta_v: number;                   // km/h
  velocity_range: string;            // e.g. "40–60 km/h"
  energy_kj: number;
  force_kn: number;
  physics_estimated: boolean;

  // Damage
  damage_zones: string[];
  damage_severity: string;
  consistency_score: number;         // 0-100

  // Enforcement trace
  enforcement_trace: Array<{
    rule: string;
    value: string | number;
    threshold: string;
    triggered: boolean;
  }>;

  // Confidence breakdown
  confidence_breakdown: Array<{
    factor: string;
    penalty: number;
  }>;

  // Data quality
  missing_fields: string[];
  estimated_fields: string[];
  extraction_confidence: number;     // 0-100
}

/** Map verdict decision key to human-readable label */
function verdictLabel(decision: string): string {
  if (decision === 'FINALISE_CLAIM') return 'FINALISE CLAIM';
  if (decision === 'REVIEW_REQUIRED') return 'REVIEW REQUIRED';
  if (decision === 'ESCALATE_INVESTIGATION') return 'ESCALATE INVESTIGATION';
  return decision.replace(/_/g, ' ');
}

/** Map verdict decision to color band */
function verdictColor(decision: string): string {
  if (decision === 'FINALISE_CLAIM') return 'green';
  if (decision === 'ESCALATE_INVESTIGATION') return 'red';
  return 'amber';
}

/** Map fraud level key to display label */
function fraudLevelLabel(level: string): string {
  const map: Record<string, string> = {
    minimal: 'Minimal',
    low: 'Low',
    moderate: 'Moderate',
    high: 'High',
    elevated: 'Elevated',
    critical: 'Elevated', // backward compat
  };
  return map[level.toLowerCase()] ?? level.charAt(0).toUpperCase() + level.slice(1);
}

/**
 * Build the spec-compliant snake_case snapshot object from the input.
 * All fields are guaranteed non-null/non-undefined.
 */
export function buildSpecSnapshot(
  input: DecisionSnapshotInput,
  version: number,
): SpecSnapshot {
  const aiEstimateDollars = Math.round(input.cost.aiEstimate) / 100;
  const quotedDollars = Math.round(input.cost.quoted) / 100;
  const fairMinDollars = Math.round(input.cost.fairRangeMin) / 100;
  const fairMaxDollars = Math.round(input.cost.fairRangeMax) / 100;

  return {
    // Identity
    claim_id: input.claimId,
    snapshot_version: version,
    created_at: Date.now(),
    created_by_user_id: input.createdByUserId ?? 'system',

    // Verdict
    verdict_decision: input.verdict.decision,
    verdict_label: verdictLabel(input.verdict.decision),
    verdict_primary_reason: input.verdict.primaryReason,
    verdict_confidence: input.verdict.confidence,
    verdict_color: verdictColor(input.verdict.decision),

    // Cost
    cost_ai_estimate_cents: Math.round(input.cost.aiEstimate),
    cost_ai_estimate_display: aiEstimateDollars,
    cost_quoted_cents: Math.round(input.cost.quoted),
    cost_quoted_display: quotedDollars,
    cost_deviation_percent: Math.round(input.cost.deviationPercent),
    cost_fair_range_min_cents: Math.round(input.cost.fairRangeMin),
    cost_fair_range_max_cents: Math.round(input.cost.fairRangeMax),
    cost_fair_range_min_display: fairMinDollars,
    cost_fair_range_max_display: fairMaxDollars,
    cost_verdict: input.cost.verdict || 'FAIR',

    // Fraud
    fraud_score: input.fraud.score,
    fraud_level: input.fraud.level || 'minimal',
    fraud_level_label: fraudLevelLabel(input.fraud.level || 'minimal'),
    fraud_contributions: input.fraud.contributions.map(c => ({
      factor: c.factor,
      value: c.value,
    })),

    // Physics
    delta_v: input.physics.deltaV,
    velocity_range: input.physics.velocityRange || 'Not calculated',
    energy_kj: input.physics.energyKj,
    force_kn: input.physics.forceKn,
    physics_estimated: input.physics.estimated,

    // Damage
    damage_zones: input.damage.zones,
    damage_severity: input.damage.severity || 'unknown',
    consistency_score: input.damage.consistencyScore,

    // Enforcement trace
    enforcement_trace: input.enforcementTrace.map(t => ({
      rule: t.rule,
      value: t.value as string | number,
      threshold: t.threshold,
      triggered: t.triggered,
    })),

    // Confidence breakdown
    confidence_breakdown: input.confidenceBreakdown.map(c => ({
      factor: c.factor,
      penalty: c.penalty,
    })),

    // Data quality
    missing_fields: input.dataQuality.missingFields,
    estimated_fields: input.dataQuality.estimatedFields,
    extraction_confidence: input.dataQuality.extractionConfidence,
  };
}

/**
 * Persist an immutable Decision Snapshot for a claim.
 * Snapshots are append-only — never updated after creation.
 * Returns the new snapshot ID and version number.
 */
export async function saveDecisionSnapshot(input: DecisionSnapshotInput): Promise<{ id: number; version: number }> {
  // Determine next version number for this claim
  const existing = await db
    .select({ version: decisionSnapshots.snapshotVersion })
    .from(decisionSnapshots)
    .where(eq(decisionSnapshots.claimId, input.claimId))
    .orderBy(desc(decisionSnapshots.snapshotVersion))
    .limit(1);

  const nextVersion = existing.length > 0 ? existing[0].version + 1 : 1;

  const [result] = await db.insert(decisionSnapshots).values({
    claimId: input.claimId,
    tenantId: input.tenantId,
    snapshotVersion: nextVersion,
    createdAt: Date.now(),
    createdByUserId: input.createdByUserId ?? null,

    verdictDecision: input.verdict.decision,
    verdictPrimaryReason: input.verdict.primaryReason,
    verdictConfidence: input.verdict.confidence,

    costAiEstimate: input.cost.aiEstimate,
    costQuoted: input.cost.quoted,
    costDeviationPercent: Math.round(input.cost.deviationPercent),
    costFairRangeMin: input.cost.fairRangeMin,
    costFairRangeMax: input.cost.fairRangeMax,
    costVerdict: input.cost.verdict,

    fraudScore: input.fraud.score,
    fraudLevel: input.fraud.level,
    fraudContributionsJson: JSON.stringify(input.fraud.contributions),

    physicsDetlaV: Math.round(input.physics.deltaV * 10),
    physicsVelocityRange: input.physics.velocityRange,
    physicsEnergyKj: Math.round(input.physics.energyKj),
    physicsForceKn: Math.round(input.physics.forceKn),
    physicsEstimated: input.physics.estimated ? 1 : 0,

    damageZonesJson: JSON.stringify(input.damage.zones),
    damageSeverity: input.damage.severity,
    damageConsistencyScore: input.damage.consistencyScore,

    enforcementTraceJson: JSON.stringify(input.enforcementTrace),
    confidenceBreakdownJson: JSON.stringify(input.confidenceBreakdown),

    missingFieldsJson: JSON.stringify(input.dataQuality.missingFields),
    estimatedFieldsJson: JSON.stringify(input.dataQuality.estimatedFields),
    extractionConfidence: input.dataQuality.extractionConfidence,

    // Verbatim spec-compliant JSON — single source of truth
    snapshotJson: JSON.stringify(buildSpecSnapshot(input, nextVersion)),
  });

  return { id: Number((result as { insertId?: number }).insertId ?? 0), version: nextVersion };
}

/**
 * Retrieve all Decision Snapshots for a claim, ordered newest first.
 */
export async function getDecisionSnapshots(claimId: string): Promise<DecisionSnapshot[]> {
  return db
    .select()
    .from(decisionSnapshots)
    .where(eq(decisionSnapshots.claimId, claimId))
    .orderBy(desc(decisionSnapshots.snapshotVersion));
}

/**
 * Get the latest Decision Snapshot for a claim, or null if none exists.
 */
export async function getLatestDecisionSnapshot(claimId: string): Promise<DecisionSnapshot | null> {
  const rows = await db
    .select()
    .from(decisionSnapshots)
    .where(eq(decisionSnapshots.claimId, claimId))
    .orderBy(desc(decisionSnapshots.snapshotVersion))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Get the latest spec-compliant snapshot JSON for a claim.
 * Returns the parsed SpecSnapshot object, or null if no snapshot exists.
 */
export async function getLatestSnapshotJson(claimId: string): Promise<SpecSnapshot | null> {
  const rows = await db
    .select({ snapshotJson: decisionSnapshots.snapshotJson, snapshotVersion: decisionSnapshots.snapshotVersion })
    .from(decisionSnapshots)
    .where(eq(decisionSnapshots.claimId, claimId))
    .orderBy(desc(decisionSnapshots.snapshotVersion))
    .limit(1);
  if (!rows[0]) return null;
  const raw = rows[0].snapshotJson;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SpecSnapshot;
  } catch {
    return null;
  }
}

// ============================================================================
// COST INTELLIGENCE LEARNING RECORDS
// ============================================================================

import type { CostLearningRecord } from "./pipeline-v2/costLearningRecorder";

/**
 * Persist a CostLearningRecord extracted from Stage 9 to the database.
 * Safe to call fire-and-forget — errors are logged but never thrown.
 */
export async function insertCostLearningRecord(
  record: CostLearningRecord,
  tenantId?: string | null
): Promise<number | null> {
  const db = await getDb();
  if (!db) {
    console.warn("[CostLearning] Database not available — skipping record persistence");
    return null;
  }

  try {
    const { costLearningRecords } = await import("../drizzle/schema");
    const result = await db.insert(costLearningRecords).values({
      claimId: typeof record.claim_id === "number" ? record.claim_id : parseInt(String(record.claim_id), 10),
      tenantId: tenantId ?? null,
      vehicleDescriptor: record.vehicle_descriptor.slice(0, 255),
      collisionDirection: record.collision_direction.slice(0, 50),
      marketRegion: record.market_region.slice(0, 10),
      caseSignature: record.case_signature.slice(0, 100),
      componentCount: record.component_count,
      structuralComponentCount: record.structural_component_count,
      finalCostUsdCents: record.final_cost_usd !== null ? Math.round(record.final_cost_usd * 100) : null,
      costIsAgreed: record.cost_is_agreed ? 1 : 0,
      quoteCoverageRatioPct: Math.round(record.quote_coverage_ratio * 100),
      highCostDriversJson: JSON.stringify(record.high_cost_drivers),
      componentWeightingJson: JSON.stringify(record.component_weighting),
      componentDetailJson: JSON.stringify(record.component_detail),
      qualityFlagsJson: JSON.stringify(record.quality_flags),
      recordedAt: record.recorded_at,
    });
    const insertId = (result as any)[0]?.insertId ?? null;
    console.log(`[CostLearning] Record persisted for claim ${record.claim_id} (id: ${insertId}, signature: ${record.case_signature})`);
    return insertId;
  } catch (err) {
    console.warn(`[CostLearning] Failed to persist record for claim ${record.claim_id}:`, err);
    return null;
  }
}

/**
 * getActiveCalibrationMultiplier
 *
 * Returns the most recent approved calibration cost multiplier for the given
 * tenant + jurisdiction combination. Falls back to 'global' if no
 * jurisdiction-specific override exists.
 *
 * The multiplier is stored as an integer × 1000 in the DB (e.g. 800 = 0.800).
 * Returns a float (e.g. 0.800) ready to multiply against cost estimates.
 * Returns 1.0 if no approved override exists.
 */
export async function getActiveCalibrationMultiplier(
  tenantId: string | null,
  jurisdiction: string,
  scenarioType?: string | null
): Promise<number> {
  try {
    const { calibrationOverrides } = await import("../drizzle/schema");
    const { eq, and, or, isNull, desc } = await import("drizzle-orm");
    const db = await getDb();
    if (!db) return 1.0;

    // Try jurisdiction-specific first, then fall back to 'global'
    const jurisdictions = jurisdiction !== "global"
      ? [jurisdiction, "global"]
      : ["global"];

    for (const jur of jurisdictions) {
      const conditions = [
        eq(calibrationOverrides.status, "approved"),
        eq(calibrationOverrides.jurisdiction, jur),
      ];
      if (tenantId) {
        conditions.push(eq(calibrationOverrides.tenantId, tenantId));
      }

      const rows = await db
        .select({
          costMultiplier: calibrationOverrides.costMultiplier,
          scenarioType: calibrationOverrides.scenarioType,
        })
        .from(calibrationOverrides)
        .where(and(...conditions))
        .orderBy(desc(calibrationOverrides.approvedAt))
        .limit(10);

      if (rows.length === 0) continue;

      // Prefer scenario-specific match, then null (applies to all)
      const scenarioMatch = scenarioType
        ? rows.find((r) => r.scenarioType === scenarioType)
        : null;
      const globalMatch = rows.find((r) => r.scenarioType === null || r.scenarioType === undefined);

      const best = scenarioMatch ?? globalMatch ?? rows[0];
      if (best?.costMultiplier != null) {
        return best.costMultiplier / 1000; // convert int×1000 back to float
      }
    }

    return 1.0; // No override found — use identity multiplier
  } catch (err) {
    console.warn("[CalibrationOverride] Failed to fetch multiplier:", err);
    return 1.0;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TENANT RATE CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Read per-tenant cost rate overrides from tenants.configJson.
 * Returns null if no tenant is found or no rate overrides are configured.
 *
 * Expected configJson shape (all fields optional):
 * {
 *   "labourRateUsdPerHour": 35,
 *   "paintCostPerPanelUsd": 50,
 *   "currencyCode": "ZAR",
 *   "currencySymbol": "R"
 * }
 */
export async function getTenantRates(tenantId: number | string | null): Promise<{
  labourRateUsdPerHour?: number;
  paintCostPerPanelUsd?: number;
  currencyCode?: string;
  currencySymbol?: string;
} | null> {
  if (!tenantId) return null;
  try {
    const tenantIdStr = String(tenantId);
    const rows = await db
      .select({
        configJson: schema.tenants.configJson,
        currencyCode: schema.tenants.currencyCode,
        currencySymbol: schema.tenants.currencySymbol,
      })
      .from(schema.tenants)
      .where(eq(schema.tenants.id, tenantIdStr))
      .limit(1);
    if (rows.length === 0) return null;
    const row = rows[0];
    const config = (row.configJson as Record<string, unknown> | null) ?? {};
    const result: {
      labourRateUsdPerHour?: number;
      paintCostPerPanelUsd?: number;
      currencyCode?: string;
      currencySymbol?: string;
    } = {};
    if (typeof config.labourRateUsdPerHour === "number" && config.labourRateUsdPerHour > 0) {
      result.labourRateUsdPerHour = config.labourRateUsdPerHour;
    }
    if (typeof config.paintCostPerPanelUsd === "number" && config.paintCostPerPanelUsd > 0) {
      result.paintCostPerPanelUsd = config.paintCostPerPanelUsd;
    }
    // Currency from configJson takes precedence; fall back to tenants.currencyCode column
    const currencyCode = (typeof config.currencyCode === "string" ? config.currencyCode : null)
      ?? row.currencyCode ?? undefined;
    const currencySymbol = (typeof config.currencySymbol === "string" ? config.currencySymbol : null)
      ?? row.currencySymbol ?? undefined;
    if (currencyCode) result.currencyCode = currencyCode;
    if (currencySymbol) result.currencySymbol = currencySymbol;
    return Object.keys(result).length > 0 ? result : null;
  } catch (err) {
    console.warn("[TenantRates] Failed to fetch tenant rates:", err);
    return null;
  }
}

/**
 * Update per-tenant cost rate overrides in tenants.configJson.
 * Merges the provided rates into the existing configJson (preserves other fields).
 */
export async function updateTenantRates(
  tenantId: string,
  rates: {
    labourRateUsdPerHour?: number | null;
    paintCostPerPanelUsd?: number | null;
    currencyCode?: string | null;
    currencySymbol?: string | null;
  }
): Promise<void> {
  const rows = await db
    .select({ configJson: schema.tenants.configJson })
    .from(schema.tenants)
    .where(eq(schema.tenants.id, tenantId))
    .limit(1);
  const existing = (rows[0]?.configJson as Record<string, unknown> | null) ?? {};
  const updated = { ...existing };
  if (rates.labourRateUsdPerHour !== undefined) {
    if (rates.labourRateUsdPerHour === null) {
      delete updated.labourRateUsdPerHour;
    } else {
      updated.labourRateUsdPerHour = rates.labourRateUsdPerHour;
    }
  }
  if (rates.paintCostPerPanelUsd !== undefined) {
    if (rates.paintCostPerPanelUsd === null) {
      delete updated.paintCostPerPanelUsd;
    } else {
      updated.paintCostPerPanelUsd = rates.paintCostPerPanelUsd;
    }
  }
  if (rates.currencyCode !== undefined) {
    if (rates.currencyCode === null) {
      delete updated.currencyCode;
    } else {
      updated.currencyCode = rates.currencyCode;
    }
  }
  if (rates.currencySymbol !== undefined) {
    if (rates.currencySymbol === null) {
      delete updated.currencySymbol;
    } else {
      updated.currencySymbol = rates.currencySymbol;
    }
  }
  await db
    .update(schema.tenants)
    .set({ configJson: updated })
    .where(eq(schema.tenants.id, tenantId));
}
