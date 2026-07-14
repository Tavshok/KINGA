/**
 * ingestionFailureReport.ts
 *
 * Document Reliability Architecture — Phase 5: No Silent Failure Invariant
 *
 * SYSTEM INVARIANT:
 *   No claim may transition to ANALYSIS_COMPLETE (or assessment_complete) unless:
 *   1. Evidence ingestion passed (documentHealthGate.mayProceed === true)
 *   2. Analysis executed (pipeline ran to completion)
 *   3. Confidence threshold achieved (not blocked by gate)
 *   4. Audit trail generated (this report exists)
 *
 * This module defines the structured failure report that is created whenever
 * ingestion fails. It is stored in the ai_assessments record and surfaced
 * in the forensic report so adjusters can see exactly what failed and why.
 *
 * FAILURE CLASSIFICATION:
 *   DOCUMENT_UNAVAILABLE  — source document not found or download failed
 *   DOCUMENT_CORRUPT      — PDF downloaded but unreadable/corrupt
 *   RENDER_FAILURE        — PDF rendering engine failed (pdftoppm)
 *   EXTRACTION_FAILURE    — No usable images extracted from rendered pages
 *   EVIDENCE_INSUFFICIENT — Images extracted but none are vehicle damage photos
 *   CONTRACT_VIOLATION    — Required claim fields are missing
 *   RECOVERY_EXHAUSTED    — All recovery strategies failed
 *   UNKNOWN               — Unclassified failure
 */

export type IngestionFailureClass =
  | 'DOCUMENT_UNAVAILABLE'
  | 'DOCUMENT_CORRUPT'
  | 'RENDER_FAILURE'
  | 'EXTRACTION_FAILURE'
  | 'EVIDENCE_INSUFFICIENT'
  | 'CONTRACT_VIOLATION'
  | 'RECOVERY_EXHAUSTED'
  | 'UNKNOWN';

export type RecoveryStrategyResult =
  | 'NOT_ATTEMPTED'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'SKIPPED';

export interface RecoveryAttempt {
  /** Strategy name */
  strategy: 'pdfimages_extraction' | 'pdftotext_ocr' | 'cached_photos_reuse' | 'manual_escalation';
  /** Whether this strategy was attempted */
  result: RecoveryStrategyResult;
  /** Number of images/items recovered (0 if failed) */
  recoveredCount: number;
  /** Error message if strategy failed */
  errorMessage: string | null;
  /** Duration in milliseconds */
  durationMs: number;
}

export interface IngestionFailureReport {
  /** Claim ID */
  claimId: number;
  /** ISO timestamp of failure */
  failedAt: string;
  /** Primary failure classification */
  failureClass: IngestionFailureClass;
  /** Human-readable failure description */
  failureDescription: string;
  /** Failure mode codes detected (F1–F11) */
  detectedFailureModes: string[];
  /** Overall ingestion confidence score at time of failure (0–100) */
  ingestionScore: number;
  /** Recovery attempts made */
  recoveryAttempts: RecoveryAttempt[];
  /** Whether any recovery strategy succeeded */
  recoverySucceeded: boolean;
  /** Recommended action for the adjuster */
  recommendedAction: string;
  /** Whether this failure was escalated to the owner via notification */
  ownerNotified: boolean;
  /** Pipeline state the claim was set to */
  claimStateAfterFailure: string;
  /** Whether the assessment was blocked (true = pipeline did NOT run) */
  assessmentBlocked: boolean;
  /** Raw error messages from each failed component */
  technicalDetails: {
    pdfDownloadError: string | null;
    renderError: string | null;
    extractionError: string | null;
    s3Error: string | null;
    contractViolations: string[];
  };
}

/**
 * Classify the primary failure from the detected failure modes and gate result.
 */
export function classifyFailure(
  detectedFailureModes: string[],
  contractViolations: string[],
  renderFailed: boolean,
  pagesRendered: number,
  vehicleDamageImageCount: number,
  pdfSizeBytes: number
): IngestionFailureClass {
  if (contractViolations.length > 0) return 'CONTRACT_VIOLATION';
  if (detectedFailureModes.includes('F1') || detectedFailureModes.includes('F10')) return 'DOCUMENT_UNAVAILABLE';
  if (detectedFailureModes.includes('F2') || pdfSizeBytes < 100) return 'DOCUMENT_CORRUPT';
  if (renderFailed || detectedFailureModes.includes('F3')) return 'RENDER_FAILURE';
  if (detectedFailureModes.includes('F4') || detectedFailureModes.includes('F5') || detectedFailureModes.includes('F9')) return 'EXTRACTION_FAILURE';
  if (detectedFailureModes.includes('F7') || (pagesRendered > 0 && vehicleDamageImageCount === 0)) return 'EVIDENCE_INSUFFICIENT';
  return 'UNKNOWN';
}

/**
 * Build a human-readable description for the failure class.
 */
export function describeFailure(
  failureClass: IngestionFailureClass,
  claimId: number,
  technicalDetail?: string
): string {
  const prefix = `Claim ${claimId}: `;
  switch (failureClass) {
    case 'DOCUMENT_UNAVAILABLE':
      return `${prefix}Source document could not be accessed. The PDF URL was not resolvable or the download failed.${technicalDetail ? ` Detail: ${technicalDetail}` : ''}`;
    case 'DOCUMENT_CORRUPT':
      return `${prefix}Source document is corrupt or unreadable. The PDF was downloaded but could not be parsed.${technicalDetail ? ` Detail: ${technicalDetail}` : ''}`;
    case 'RENDER_FAILURE':
      return `${prefix}PDF rendering failed. The primary renderer (pdftoppm) could not convert the document to images.${technicalDetail ? ` Detail: ${technicalDetail}` : ''}`;
    case 'EXTRACTION_FAILURE':
      return `${prefix}Image extraction failed. The PDF was rendered but no usable images could be extracted or uploaded.${technicalDetail ? ` Detail: ${technicalDetail}` : ''}`;
    case 'EVIDENCE_INSUFFICIENT':
      return `${prefix}Insufficient vehicle damage evidence. Images were extracted but none were identified as vehicle damage photographs.`;
    case 'CONTRACT_VIOLATION':
      return `${prefix}Evidence Completeness Contract not satisfied. Required claim fields are missing.${technicalDetail ? ` Missing: ${technicalDetail}` : ''}`;
    case 'RECOVERY_EXHAUSTED':
      return `${prefix}All recovery strategies failed. Primary extraction and all fallback methods were unsuccessful.`;
    default:
      return `${prefix}Unclassified ingestion failure.${technicalDetail ? ` Detail: ${technicalDetail}` : ''}`;
  }
}

/**
 * Get the recommended action for a given failure class.
 */
export function getRecommendedAction(failureClass: IngestionFailureClass): string {
  switch (failureClass) {
    case 'DOCUMENT_UNAVAILABLE':
      return 'Re-upload the claim document. Verify the file was uploaded successfully before re-triggering assessment.';
    case 'DOCUMENT_CORRUPT':
      return 'Re-upload the claim document. Ensure the file is a valid, non-password-protected PDF.';
    case 'RENDER_FAILURE':
      return 'Primary extraction failed. Recovery protocol initiated. If recovery also fails, re-upload the document or contact support.';
    case 'EXTRACTION_FAILURE':
      return 'Image extraction failed. Ensure the PDF contains embedded images or photographs. Re-upload with a higher-resolution document.';
    case 'EVIDENCE_INSUFFICIENT':
      return 'Upload clearer vehicle damage photographs. The submitted document does not contain identifiable vehicle damage images. Photographs should show the damaged areas clearly from multiple angles.';
    case 'CONTRACT_VIOLATION':
      return 'Complete all required claim fields before re-triggering assessment. See the missing fields listed in the failure report.';
    case 'RECOVERY_EXHAUSTED':
      return 'Route to human adjuster for manual assessment. All automated recovery strategies have been exhausted.';
    default:
      return 'Contact system administrator. An unexpected ingestion failure occurred.';
  }
}

/**
 * Create a structured IngestionFailureReport.
 */
export function createIngestionFailureReport(params: {
  claimId: number;
  failureClass: IngestionFailureClass;
  detectedFailureModes: string[];
  ingestionScore: number;
  recoveryAttempts: RecoveryAttempt[];
  claimStateAfterFailure: string;
  assessmentBlocked: boolean;
  ownerNotified: boolean;
  technicalDetails: {
    pdfDownloadError: string | null;
    renderError: string | null;
    extractionError: string | null;
    s3Error: string | null;
    contractViolations: string[];
  };
}): IngestionFailureReport {
  const recoverySucceeded = params.recoveryAttempts.some(a => a.result === 'SUCCEEDED');
  const technicalDetail = params.technicalDetails.renderError
    ?? params.technicalDetails.pdfDownloadError
    ?? params.technicalDetails.extractionError
    ?? (params.technicalDetails.contractViolations.length > 0
      ? params.technicalDetails.contractViolations.join(', ')
      : undefined);

  return {
    claimId: params.claimId,
    failedAt: new Date().toISOString(),
    failureClass: params.failureClass,
    failureDescription: describeFailure(params.failureClass, params.claimId, technicalDetail),
    detectedFailureModes: params.detectedFailureModes,
    ingestionScore: params.ingestionScore,
    recoveryAttempts: params.recoveryAttempts,
    recoverySucceeded,
    recommendedAction: getRecommendedAction(params.failureClass),
    ownerNotified: params.ownerNotified,
    claimStateAfterFailure: params.claimStateAfterFailure,
    assessmentBlocked: params.assessmentBlocked,
    technicalDetails: params.technicalDetails,
  };
}
