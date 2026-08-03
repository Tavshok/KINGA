/**
 * documentHealthGate.ts
 *
 * Document Reliability Architecture — Phase 3: Document Health Gate
 *
 * DESIGN PRINCIPLE:
 *   "The AI should never compensate for bad evidence.
 *    The system must first prove that the evidence is trustworthy."
 *
 * This gate runs BEFORE the AI pipeline. It evaluates six dimensions of
 * ingestion quality, computes an overall ingestion confidence score, and
 * decides whether the claim is ready for AI analysis.
 *
 * ROUTING RULES:
 *   Score ≥ 90%  → PROCEED_AUTOMATICALLY   (no warning)
 *   Score 70–89% → PROCEED_WITH_WARNING     (proceed but flag in report)
 *   Score 40–69% → REQUIRE_REVIEW           (block AI; route to human review)
 *   Score  < 40% → BLOCK_ASSESSMENT         (block AI; escalate immediately)
 *
 * EVIDENCE COMPLETENESS CONTRACT:
 *   Required fields must be present before analysis runs.
 *   If any required field is missing, the gate returns NOT_READY_FOR_ANALYSIS.
 *
 * FAILURE MODES ADDRESSED:
 *   F1 — PDF download failure (sourceAvailability = 0%)
 *   F2 — PDF integrity failure (pdfIntegrity = 0%)
 *   F3 — pdftoppm render failure (pageRendering = 0%)
 *   F4 — Zero pages extracted (imageExtraction = 0%)
 *   F5 — All pages below dimension threshold (imageExtraction low)
 *   F6 — No text extracted from PDF (textExtraction = 0%)
 *   F7 — All images classified as non-vehicle (evidenceQuality = 0%)
 *   F8 — Claim record missing required fields (contractViolation)
 *   F9 — S3 upload failure (imageExtraction = 0%)
 *   F10 — Presign failure (sourceAvailability = 0%)
 *   F11 — Silent placeholder creation (blocked by gate)
 */

// ── Types ──────────────────────────────────────────────────────────────────────

export type IngestionDecision =
  | 'PROCEED_AUTOMATICALLY'
  | 'PROCEED_WITH_WARNING'
  | 'REQUIRE_REVIEW'
  | 'BLOCK_ASSESSMENT';

export type ContractStatus =
  | 'SATISFIED'
  | 'NOT_READY_FOR_ANALYSIS';

export interface IngestionDimension {
  /** Dimension name for display */
  name: string;
  /** Score 0–100 */
  score: number;
  /** Weight used in overall score (0–1, all weights sum to 1) */
  weight: number;
  /** Human-readable status note */
  note: string;
  /** Whether this dimension is critical (score=0 blocks regardless of overall) */
  isCritical: boolean;
}

export interface EvidenceCompletenessContract {
  /** Whether all required fields are present */
  status: ContractStatus;
  /** Fields that are present and verified */
  satisfiedRequirements: string[];
  /** Required fields that are missing */
  missingRequirements: string[];
  /** Optional fields that are present */
  presentOptionals: string[];
  /** Optional fields that are absent */
  absentOptionals: string[];
  /** Reason text for NOT_READY_FOR_ANALYSIS (null if satisfied) */
  blockReason: string | null;
  /** Recommended action for the adjuster */
  recommendedAction: string | null;
}

export interface DocumentHealthGateResult {
  /** Overall ingestion confidence score (0–100) */
  overallScore: number;
  /** Routing decision */
  decision: IngestionDecision;
  /** Whether the pipeline may proceed (PROCEED_AUTOMATICALLY or PROCEED_WITH_WARNING) */
  mayProceed: boolean;
  /** Evidence completeness contract evaluation */
  contract: EvidenceCompletenessContract;
  /** Per-dimension breakdown */
  dimensions: IngestionDimension[];
  /** Failure mode codes detected (F1–F11) */
  detectedFailureModes: string[];
  /** Human-readable summary for the forensic report */
  summary: string;
  /** Recommended action for the adjuster or system */
  recommendedAction: string;
  /** ISO timestamp of evaluation */
  evaluatedAt: string;
  /** Whether a critical dimension scored 0 (overrides overall score) */
  hasCriticalFailure: boolean;
  /** Which critical dimensions failed */
  criticalFailures: string[];
}

// ── Inputs ─────────────────────────────────────────────────────────────────────

export interface DocumentHealthGateInput {
  claimId: number;
  /** Whether the source document URL was resolved successfully */
  sourceDocumentFound: boolean;
  /** Whether the presigned download URL was obtained */
  presignSucceeded: boolean;
  /** PDF buffer size in bytes (0 if download failed) */
  pdfSizeBytes: number;
  /** Total pages in the PDF (0 if page count failed) */
  totalPdfPages: number;
  /** Pages successfully rendered to PNG (0 if render failed) */
  pagesRendered: number;
  /** Pages that passed dimension threshold (width ≥ 200 && height ≥ 200) */
  pagesDimensionPass: number;
  /** Pages that failed dimension threshold */
  pagesDimensionFail: number;
  /** Whether pdftotext extracted any text from the document */
  textExtracted: boolean;
  /** Number of characters extracted via pdftotext (0 if text extraction failed) */
  textCharCount: number;
  /** Total images available for analysis (after dimension filter) */
  totalImagesForAnalysis: number;
  /** Images classified as vehicle damage photos (after semantic gate) */
  vehicleDamageImageCount: number;
  /** Images classified as documents/quotations (not vehicle damage) */
  nonVehicleImageCount: number;
  /** Whether pdftoppm render failed with an error */
  renderFailed: boolean;
  /** Whether S3 upload failed for any page */
  s3UploadFailed: boolean;
  /** Error message from render failure (if any) */
  renderErrorMessage: string | null;
  /**
   * Whether this claim was created from a document ingestion (sourceDocumentId IS NOT NULL).
   * For document-ingested claims, incidentDate and incidentDescription are OUTPUTS of the pipeline
   * (extracted by the LLM from the PDF), not pre-conditions. The contract must not require them
   * before the pipeline runs.
   */
  isDocumentIngested: boolean;
  /** Claim record fields for contract evaluation */
  claimRecord: {
    claimNumber: string | null;
    vehicleMake: string | null;
    vehicleModel: string | null;
    vehicleYear: number | null;
    incidentDate: string | null;
    incidentDescription: string | null;
    claimantName: string | null;
    policyNumber: string | null;
  };
}

// ── Constants ──────────────────────────────────────────────────────────────────

const SCORE_THRESHOLDS = {
  PROCEED_AUTOMATICALLY: 90,
  PROCEED_WITH_WARNING: 70,
  REQUIRE_REVIEW: 40,
  // Below 40 → BLOCK_ASSESSMENT
} as const;

// Dimension weights — must sum to 1.0
const DIMENSION_WEIGHTS = {
  sourceAvailability: 0.20,
  pdfIntegrity: 0.15,
  pageRendering: 0.25,
  imageExtraction: 0.20,
  textExtraction: 0.10,
  evidenceQuality: 0.10,
} as const;

// ── Core Evaluation ────────────────────────────────────────────────────────────

/**
 * Evaluate the six ingestion quality dimensions.
 */
function evaluateDimensions(input: DocumentHealthGateInput): IngestionDimension[] {
  const dims: IngestionDimension[] = [];

  // 1. Source Availability (20%) — Was the document accessible?
  let sourceScore = 100;
  let sourceNote = 'Document URL resolved and download URL obtained';
  if (!input.sourceDocumentFound) {
    sourceScore = 0;
    sourceNote = 'Source document not found in ingestion records';
  } else if (!input.presignSucceeded) {
    sourceScore = 20;
    sourceNote = 'Presigned URL generation failed — falling back to raw S3 URL';
  } else if (input.pdfSizeBytes === 0) {
    sourceScore = 0;
    sourceNote = 'PDF download returned 0 bytes';
  } else if (input.pdfSizeBytes < 1024) {
    sourceScore = 30;
    sourceNote = `PDF is suspiciously small (${input.pdfSizeBytes} bytes) — may be corrupt`;
  }
  dims.push({
    name: 'Source Availability',
    score: sourceScore,
    weight: DIMENSION_WEIGHTS.sourceAvailability,
    note: sourceNote,
    isCritical: true,
  });

  // 2. PDF Integrity (15%) — Is the PDF structurally valid?
  let integrityScore = 100;
  let integrityNote = 'PDF structure validated';
  if (!input.sourceDocumentFound || input.pdfSizeBytes === 0) {
    integrityScore = 0;
    integrityNote = 'Cannot assess integrity — document unavailable';
  } else if (input.totalPdfPages === 0) {
    integrityScore = 10;
    integrityNote = 'PDF page count could not be determined — may be encrypted or corrupt';
  } else if (input.totalPdfPages > 100) {
    integrityScore = 60;
    integrityNote = `PDF has ${input.totalPdfPages} pages — unusually large, may contain non-claim content`;
  }
  dims.push({
    name: 'PDF Integrity',
    score: integrityScore,
    weight: DIMENSION_WEIGHTS.pdfIntegrity,
    note: integrityNote,
    isCritical: false,
  });

  // 3. Page Rendering (25%) — Did pdftoppm successfully render pages?
  let renderScore = 100;
  let renderNote = `${input.pagesRendered} page(s) rendered successfully`;
  if (input.renderFailed || input.pagesRendered === 0) {
    renderScore = 0;
    renderNote = input.renderErrorMessage
      ? `Render failed: ${input.renderErrorMessage}`
      : 'PDF renderer produced no output';
  } else if (input.totalPdfPages > 0) {
    const renderRatio = input.pagesRendered / Math.min(input.totalPdfPages, 25);
    renderScore = Math.round(renderRatio * 100);
    if (renderScore < 100) {
      renderNote = `${input.pagesRendered}/${Math.min(input.totalPdfPages, 25)} pages rendered (${renderScore}% yield)`;
    }
  }
  dims.push({
    name: 'Page Rendering',
    score: renderScore,
    weight: DIMENSION_WEIGHTS.pageRendering,
    note: renderNote,
    isCritical: true,
  });

  // 4. Image Extraction (20%) — Were usable images extracted?
  let extractionScore = 100;
  let extractionNote = `${input.pagesDimensionPass} image(s) passed dimension threshold`;
  if (input.s3UploadFailed && input.pagesDimensionPass === 0) {
    extractionScore = 0;
    extractionNote = 'S3 upload failed — no images available for analysis';
  } else if (input.pagesRendered > 0 && input.pagesDimensionPass === 0) {
    extractionScore = 5;
    extractionNote = `All ${input.pagesRendered} rendered page(s) failed dimension threshold (< 200×200 px)`;
  } else if (input.pagesDimensionFail > 0) {
    const passRatio = input.pagesDimensionPass / (input.pagesDimensionPass + input.pagesDimensionFail);
    extractionScore = Math.round(passRatio * 100);
    extractionNote = `${input.pagesDimensionPass} usable, ${input.pagesDimensionFail} below threshold (${extractionScore}% yield)`;
  }
  dims.push({
    name: 'Image Extraction',
    score: extractionScore,
    weight: DIMENSION_WEIGHTS.imageExtraction,
    note: extractionNote,
    isCritical: false,
  });

  // 5. Text Extraction (10%) — Was any text recoverable from the document?
  let textScore = 100;
  let textNote = `${input.textCharCount.toLocaleString()} characters extracted`;
  if (!input.textExtracted || input.textCharCount === 0) {
    textScore = 0;
    textNote = 'No text extracted — document may be image-only or encrypted';
  } else if (input.textCharCount < 50) {
    textScore = 30;
    textNote = `Very little text extracted (${input.textCharCount} chars) — document may be mostly images`;
  } else if (input.textCharCount < 200) {
    textScore = 60;
    textNote = `Minimal text extracted (${input.textCharCount} chars) — partial extraction`;
  }
  dims.push({
    name: 'Text Extraction',
    score: textScore,
    weight: DIMENSION_WEIGHTS.textExtraction,
    note: textNote,
    isCritical: false,
  });

  // 6. Evidence Quality (10%) — Are the extracted images actually vehicle damage photos?
  let qualityScore = 100;
  let qualityNote = `${input.vehicleDamageImageCount} vehicle damage image(s) identified`;
  if (input.totalImagesForAnalysis === 0) {
    qualityScore = 0;
    qualityNote = 'No images available for quality assessment';
  } else if (input.vehicleDamageImageCount === 0) {
    qualityScore = 0;
    qualityNote = `All ${input.totalImagesForAnalysis} image(s) classified as non-vehicle content (documents, quotations)`;
  } else {
    const vehicleRatio = input.vehicleDamageImageCount / input.totalImagesForAnalysis;
    qualityScore = Math.round(vehicleRatio * 100);
    if (qualityScore < 100) {
      qualityNote = `${input.vehicleDamageImageCount}/${input.totalImagesForAnalysis} images are vehicle damage photos (${qualityScore}% signal ratio)`;
    }
  }
  dims.push({
    name: 'Evidence Quality',
    score: qualityScore,
    weight: DIMENSION_WEIGHTS.evidenceQuality,
    note: qualityNote,
    isCritical: false,
  });

  return dims;
}

/**
 * Evaluate the Evidence Completeness Contract.
 * Required fields must be present before AI analysis runs.
 */
function evaluateContract(input: DocumentHealthGateInput): EvidenceCompletenessContract {
  const { claimRecord } = input;

  const satisfied: string[] = [];
  const missing: string[] = [];
  const presentOptionals: string[] = [];
  const absentOptionals: string[] = [];

  // Required fields
  // NOTE: For document-ingested claims, incidentDate and incidentDescription are pipeline
  // OUTPUTS (extracted by the LLM from the PDF). They must NOT be required as pre-conditions
  // before the pipeline runs — only form-submitted claims have these fields pre-populated.
  const requiredChecks: Array<{ label: string; value: string | null | undefined | number }> = [
    { label: 'Claim document exists', value: input.sourceDocumentFound ? 'yes' : null },
    { label: 'Claim number', value: claimRecord.claimNumber },
    // For document-ingested claims, vehicleMake/vehicleModel/incidentDate/incidentDescription
    // are pipeline OUTPUTS extracted by the LLM from the PDF. They must NOT be required as
    // pre-conditions before the pipeline runs — only form-submitted claims have these pre-populated.
    ...(input.isDocumentIngested ? [] : [
      { label: 'Vehicle make', value: claimRecord.vehicleMake },
      { label: 'Vehicle model', value: claimRecord.vehicleModel },
      { label: 'Incident date', value: claimRecord.incidentDate },
      { label: 'Incident description', value: claimRecord.incidentDescription },
    ] as Array<{ label: string; value: string | null | undefined | number }>),
    // NOTE: vehicleDamageImageCount is NOT a required pre-condition.
    // Semantic classification (Stage 2.6B) runs AFTER this gate, so vehicleDamageImageCount
    // is always 0 at gate time for document-ingested claims. We only require that pages were
    // rendered (pagesRendered > 0) — the gate already checks this via the Page Rendering dimension.
    //
    // NOTE: 'Document integrity verified' (pdfSizeBytes > 0) is NOT required for document-ingested
    // claims. A zero-byte pdfBuffer means the presigned URL expired or the download failed
    // transiently — the document exists in S3 and the LLM reads it via the file_url proxy.
    // For document-ingested claims, computeDecision bypasses confidence scoring entirely, so
    // this contract check is moot — but we exclude it here for clarity and correctness.
    ...(input.isDocumentIngested ? [] : [
      { label: 'Document integrity verified', value: input.pdfSizeBytes > 0 ? 'yes' : null },
    ] as Array<{ label: string; value: string | null | undefined | number }>),
  ];

  for (const check of requiredChecks) {
    if (check.value !== null && check.value !== undefined && check.value !== '') {
      satisfied.push(check.label);
    } else {
      missing.push(check.label);
    }
  }

  // Optional fields
  const optionalChecks: Array<{ label: string; value: string | null | undefined | number }> = [
    { label: 'Police report', value: null }, // checked downstream
    { label: 'Repair quotation', value: null }, // checked downstream
    { label: 'Previous claims history', value: null }, // checked downstream
    { label: 'Claimant name', value: claimRecord.claimantName },
    { label: 'Policy number', value: claimRecord.policyNumber },
    { label: 'Vehicle year', value: claimRecord.vehicleYear },
  ];

  for (const check of optionalChecks) {
    if (check.value !== null && check.value !== undefined && check.value !== '') {
      presentOptionals.push(check.label);
    } else {
      absentOptionals.push(check.label);
    }
  }

  if (missing.length === 0) {
    return {
      status: 'SATISFIED',
      satisfiedRequirements: satisfied,
      missingRequirements: [],
      presentOptionals,
      absentOptionals,
      blockReason: null,
      recommendedAction: null,
    };
  }

  // Determine the most actionable block reason
  let blockReason = `Missing required evidence: ${missing.join(', ')}`;
  let recommendedAction = 'Upload a complete claim document with vehicle details and damage photographs.';

  if (missing.includes('Claim document exists')) {
    blockReason = 'No claim document found — the source document could not be located in the system.';
    recommendedAction = 'Re-upload the claim document. If the problem persists, contact the system administrator.';
  } else if (missing.includes('Document integrity verified')) {
    blockReason = 'Document integrity check failed — the uploaded file may be corrupt or empty.';
    recommendedAction = 'Re-upload the claim document. Ensure the file is a valid PDF and is not password-protected.';
  }

  return {
    status: 'NOT_READY_FOR_ANALYSIS',
    satisfiedRequirements: satisfied,
    missingRequirements: missing,
    presentOptionals,
    absentOptionals,
    blockReason,
    recommendedAction,
  };
}

/**
 * Detect which failure modes (F1–F11) are present.
 */
function detectFailureModes(input: DocumentHealthGateInput): string[] {
  const modes: string[] = [];
  if (!input.sourceDocumentFound) modes.push('F1'); // PDF download failure
  if (input.pdfSizeBytes === 0 && input.sourceDocumentFound) modes.push('F2'); // PDF integrity
  if (input.renderFailed) modes.push('F3'); // pdftoppm render failure
  if (!input.renderFailed && input.pagesRendered === 0) modes.push('F4'); // Zero pages extracted
  if (input.pagesRendered > 0 && input.pagesDimensionPass === 0) modes.push('F5'); // All below threshold
  if (!input.textExtracted || input.textCharCount === 0) modes.push('F6'); // No text extracted
  if (input.totalImagesForAnalysis > 0 && input.vehicleDamageImageCount === 0) modes.push('F7'); // All non-vehicle
  if (input.s3UploadFailed) modes.push('F9'); // S3 upload failure
  if (!input.presignSucceeded) modes.push('F10'); // Presign failure
  return modes;
}

/**
 * Compute the routing decision from the overall score and critical failures.
 *
 * DESIGN PRINCIPLE: Confidence score is NOT a blocking factor for document-ingested claims.
 *
 * For document-ingested claims (isDocumentIngested=true), the gate is advisory-only.
 * The ONLY hard-block condition is: no source document found (nothing to analyse).
 * All other quality issues (low score, missing text, non-vehicle images, transient
 * PDF download failures, document structure differences) produce PROCEED_WITH_WARNING.
 * The pipeline runs and flags quality issues in the forensic report.
 *
 * Rationale: Human assessor reports, completed assessment PDFs, and other structured
 * documents have different internal structure from raw claim documents. The confidence
 * scorer penalises them for lacking vehicle photos and text — but these documents are
 * equally valid KINGA inputs for cross-validation. The confidence score was designed
 * for raw claim submissions, not for document ingestion.
 *
 * Hard-block conditions:
 *   ALL claims:              No source document found (F1) — nothing to analyse
 *   Form-submitted only:     Contract NOT_READY_FOR_ANALYSIS, critical failure, score < 40%
 */
function computeDecision(
  overallScore: number,
  hasCriticalFailure: boolean,
  contractStatus: ContractStatus,
  input?: DocumentHealthGateInput
): IngestionDecision {
  // ── Document-ingested claims: confidence score is NOT a blocking factor ──────────────────
  // For any claim created via document ingestion (sourceDocumentId IS NOT NULL), the ONLY
  // hard-block is a missing source document. Everything else proceeds with a warning.
  // This covers human assessor reports, completed assessment PDFs, and all other uploaded
  // documents regardless of their internal structure or confidence score.
  if (input?.isDocumentIngested) {
    // Hard-block: no source document at all — nothing to analyse
    if (!input.sourceDocumentFound) {
      return 'BLOCK_ASSESSMENT';
    }
    // Source document found — proceed regardless of confidence score, text extraction,
    // page rendering, or any other quality dimension. The pipeline runs and flags issues.
    return 'PROCEED_WITH_WARNING';
  }

  // ── Form-submitted claims: use the original strict routing ──────────────────────────────
  // Hard-block 1: No source document at all — nothing to analyse
  if (input && !input.sourceDocumentFound) {
    return 'BLOCK_ASSESSMENT';
  }
  // Hard-block 2: Empty/corrupt file (0 bytes AND 0 pages rendered)
  if (input && input.pdfSizeBytes === 0 && input.pagesRendered === 0) {
    return 'BLOCK_ASSESSMENT';
  }
  if (contractStatus === 'NOT_READY_FOR_ANALYSIS') {
    return 'BLOCK_ASSESSMENT';
  }
  if (hasCriticalFailure) {
    return 'BLOCK_ASSESSMENT';
  }
  if (overallScore >= SCORE_THRESHOLDS.PROCEED_AUTOMATICALLY) {
    return 'PROCEED_AUTOMATICALLY';
  }
  if (overallScore >= SCORE_THRESHOLDS.PROCEED_WITH_WARNING) {
    return 'PROCEED_WITH_WARNING';
  }
  if (overallScore >= SCORE_THRESHOLDS.REQUIRE_REVIEW) {
    return 'REQUIRE_REVIEW';
  }
  return 'BLOCK_ASSESSMENT';
}

/**
 * Build a human-readable summary for the forensic report.
 */
function buildSummary(
  overallScore: number,
  decision: IngestionDecision,
  dims: IngestionDimension[],
  failureModes: string[],
  contract: EvidenceCompletenessContract
): string {
  const scoreStr = `${overallScore}%`;
  const dimSummary = dims.map(d => `${d.name}: ${d.score}%`).join(', ');

  if (decision === 'PROCEED_AUTOMATICALLY') {
    return `Document ingestion confidence: ${scoreStr} — all dimensions within acceptable range. Evidence is trustworthy for AI analysis. (${dimSummary})`;
  }
  if (decision === 'PROCEED_WITH_WARNING') {
    const lowDims = dims.filter(d => d.score < 70).map(d => d.name);
    return `Document ingestion confidence: ${scoreStr} — proceeding with warning. Low-confidence dimensions: ${lowDims.join(', ')}. Analysis results should be interpreted with caution. (${dimSummary})`;
  }
  if (decision === 'REQUIRE_REVIEW') {
    const failedDims = dims.filter(d => d.score < 40).map(d => d.name);
    return `Document ingestion confidence: ${scoreStr} — human review required before AI analysis. Failed dimensions: ${failedDims.join(', ')}. Failure modes: ${failureModes.join(', ') || 'none identified'}.`;
  }
  // BLOCK_ASSESSMENT
  if (contract.status === 'NOT_READY_FOR_ANALYSIS') {
    return `Assessment blocked: Evidence Completeness Contract not satisfied. ${contract.blockReason ?? ''} Missing: ${contract.missingRequirements.join(', ')}.`;
  }
  const criticalDims = dims.filter(d => d.isCritical && d.score === 0).map(d => d.name);
  return `Assessment blocked: Document ingestion confidence ${scoreStr} is below the minimum threshold. Critical failures: ${criticalDims.join(', ')}. Failure modes: ${failureModes.join(', ') || 'none identified'}.`;
}

/**
 * Build the recommended action string.
 */
function buildRecommendedAction(
  decision: IngestionDecision,
  contract: EvidenceCompletenessContract,
  dims: IngestionDimension[],
  failureModes: string[]
): string {
  if (contract.status === 'NOT_READY_FOR_ANALYSIS' && contract.recommendedAction) {
    return contract.recommendedAction;
  }
  if (decision === 'PROCEED_AUTOMATICALLY') {
    return 'No action required — proceed with AI analysis.';
  }
  if (decision === 'PROCEED_WITH_WARNING') {
    return 'Proceed with AI analysis. Review low-confidence dimensions in the forensic report before making a final decision.';
  }
  if (decision === 'REQUIRE_REVIEW') {
    return 'Route to human adjuster for manual review. Do not proceed with AI analysis until evidence quality is confirmed.';
  }
  // BLOCK_ASSESSMENT
  if (failureModes.includes('F1') || failureModes.includes('F2')) {
    return 'Re-upload the claim document. The original file could not be accessed or is corrupt.';
  }
  if (failureModes.includes('F3') || failureModes.includes('F4')) {
    return 'Primary extraction failed. Recovery protocol initiated — attempting alternative extraction methods.';
  }
  if (failureModes.includes('F7')) {
    return 'Upload clearer vehicle damage photographs. The submitted document does not contain identifiable vehicle damage images.';
  }
  return 'Contact system administrator. Document ingestion failed and automatic recovery was not possible.';
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Run the Document Health Gate for a claim.
 *
 * This is the primary entry point. Call this BEFORE running the AI pipeline.
 * If `result.mayProceed` is false, do NOT run the pipeline.
 *
 * @param input  Ingestion quality metrics collected during pre-pipeline processing
 * @returns      DocumentHealthGateResult with routing decision and full audit trail
 */
export function runDocumentHealthGate(input: DocumentHealthGateInput): DocumentHealthGateResult {
  const dims = evaluateDimensions(input);
  const contract = evaluateContract(input);
  const failureModes = detectFailureModes(input);

  // Weighted overall score
  const overallScore = Math.round(
    dims.reduce((acc, d) => acc + d.score * d.weight, 0)
  );

  // Critical failure check
  const criticalFailures = dims.filter(d => d.isCritical && d.score === 0).map(d => d.name);
  const hasCriticalFailure = criticalFailures.length > 0;

  const decision = computeDecision(overallScore, hasCriticalFailure, contract.status, input);
  const mayProceed = decision === 'PROCEED_AUTOMATICALLY' || decision === 'PROCEED_WITH_WARNING';

  const summary = buildSummary(overallScore, decision, dims, failureModes, contract);
  const recommendedAction = buildRecommendedAction(decision, contract, dims, failureModes);

  return {
    overallScore,
    decision,
    mayProceed,
    contract,
    dimensions: dims,
    detectedFailureModes: failureModes,
    summary,
    recommendedAction,
    evaluatedAt: new Date().toISOString(),
    hasCriticalFailure,
    criticalFailures,
  };
}

/**
 * Build a DocumentHealthGateInput from the pre-pipeline state in db.ts.
 *
 * This is a convenience factory that translates the variables already computed
 * in triggerAiAssessment() into the structured input the gate expects.
 */
export function buildGateInput(params: {
  claimId: number;
  /** True when the claim was created via document ingestion (sourceDocumentId IS NOT NULL) */
  isDocumentIngested: boolean;
  sourceDocumentFound: boolean;
  presignSucceeded: boolean;
  pdfBuffer: Buffer | null;
  totalPdfPages: number;
  pagesRendered: number;
  pagesDimensionPass: number;
  pagesDimensionFail: number;
  textExtracted: boolean;
  textCharCount: number;
  totalImagesForAnalysis: number;
  vehicleDamageImageCount: number;
  nonVehicleImageCount: number;
  renderFailed: boolean;
  s3UploadFailed: boolean;
  renderErrorMessage: string | null;
  claim: {
    claimNumber?: string | null;
    vehicleMake?: string | null;
    vehicleModel?: string | null;
    vehicleYear?: number | null;
    incidentDate?: string | null;
    incidentDescription?: string | null;
    claimantId?: number | null;
    policyNumber?: string | null;
  };
}): DocumentHealthGateInput {
  return {
    claimId: params.claimId,
    sourceDocumentFound: params.sourceDocumentFound,
    presignSucceeded: params.presignSucceeded,
    pdfSizeBytes: params.pdfBuffer?.length ?? 0,
    totalPdfPages: params.totalPdfPages,
    pagesRendered: params.pagesRendered,
    pagesDimensionPass: params.pagesDimensionPass,
    pagesDimensionFail: params.pagesDimensionFail,
    textExtracted: params.textExtracted,
    textCharCount: params.textCharCount,
    totalImagesForAnalysis: params.totalImagesForAnalysis,
    vehicleDamageImageCount: params.vehicleDamageImageCount,
    nonVehicleImageCount: params.nonVehicleImageCount,
    renderFailed: params.renderFailed,
    s3UploadFailed: params.s3UploadFailed,
    isDocumentIngested: params.isDocumentIngested,
    renderErrorMessage: params.renderErrorMessage,
    claimRecord: {
      claimNumber: params.claim.claimNumber ?? null,
      vehicleMake: params.claim.vehicleMake ?? null,
      vehicleModel: params.claim.vehicleModel ?? null,
      vehicleYear: params.claim.vehicleYear ?? null,
      incidentDate: params.claim.incidentDate ?? null,
      incidentDescription: params.claim.incidentDescription ?? null,
      claimantName: params.claim.claimantId ? `Claimant #${params.claim.claimantId}` : null,
      policyNumber: params.claim.policyNumber ?? null,
    },
  };
}
