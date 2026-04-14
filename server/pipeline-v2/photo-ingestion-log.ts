/**
 * Photo Ingestion Log
 * ─────────────────────────────────────────────────────────────────────────────
 * Structured log of every photo extraction attempt in the pipeline.
 * Written to forensicAnalysis.photoIngestionLog and surfaced in the
 * CongruencyPanel and Integrity Gate.
 *
 * This is the authoritative record of what happened during photo ingestion —
 * it distinguishes "no photos in document" from "photos detected but failed to
 * extract" from "photos extracted and classified."
 */

export type PhotoIngestionStrategy =
  | 'pdftoppm_page_render'    // Render all PDF pages as PNG images
  | 'pdfimages_embedded'      // Extract embedded raster images from PDF
  | 'scanned_pdf_render'      // High-DPI render of scanned PDF pages
  | 'llm_classification'      // LLM pass to classify extracted images
  | 'direct_url'              // Direct URL (already an image, not a PDF)
  | 'fallback_all_as_damage'; // Fallback when LLM classification fails

export type PhotoIngestionOutcome =
  | 'success'          // Strategy succeeded and produced usable images
  | 'partial'          // Strategy produced some images but not all expected
  | 'failed'           // Strategy was attempted but produced no images
  | 'skipped'          // Strategy was not attempted (e.g. not applicable)
  | 'timeout';         // Strategy timed out

export interface PhotoQualitySummary {
  /** Total images that passed the dimension gate (min width/height) */
  passedDimensionGate: number;
  /** Total images rejected for being too small */
  rejectedTooSmall: number;
  /** Total images flagged as blurry (Laplacian variance below threshold) */
  blurryCount: number;
  /** Total images flagged as text-heavy (form pages, not photos) */
  textHeavyCount: number;
  /** Whether the source PDF was detected as a scanned document */
  isScannedPdf: boolean;
  /** DPI used for page rendering (higher for scanned PDFs) */
  renderDpi: number;
  /** Average Laplacian variance across all extracted images (higher = sharper) */
  avgSharpnessScore: number | null;
}

export interface PhotoIngestionAttempt {
  strategy: PhotoIngestionStrategy;
  outcome: PhotoIngestionOutcome;
  imagesFound: number;
  imagesUploaded: number;
  damagePhotosClassified: number;
  documentImagesClassified: number;
  durationMs: number;
  failureReason?: string;
  notes?: string;
}

export interface PhotoIngestionLog {
  /** ISO timestamp when ingestion started */
  startedAt: string;
  /** Total wall-clock time for all strategies combined */
  totalDurationMs: number;
  /** Source document URL that was processed */
  sourceUrl: string;
  /** Whether the source document is a PDF (vs direct image URL) */
  isPdf: boolean;
  /** All strategies attempted, in order */
  attempts: PhotoIngestionAttempt[];
  /** Final count of damage photos available for analysis */
  finalDamagePhotoCount: number;
  /** Final count of all photos (damage + document) extracted */
  finalTotalPhotoCount: number;
  /** Overall outcome: did we get usable damage photos? */
  overallOutcome: 'photos_available' | 'no_photos_in_document' | 'extraction_failed' | 'ingestion_skipped';
  /** Human-readable summary for the CongruencyPanel */
  summary: string;
  /** Whether the Integrity Gate should flag this claim for photo review */
  requiresPhotoReview: boolean;
  /** Quality metrics for extracted images */
  qualitySummary?: PhotoQualitySummary;
}

/**
 * Build a PhotoIngestionLog from the results of extractImagesFromPDFBuffer.
 * Called by assessment-processor.ts after the extraction step completes.
 */
export function buildPhotoIngestionLog(params: {
  sourceUrl: string;
  isPdf: boolean;
  pageRenderCount: number;
  embeddedImageCount: number;
  totalExtracted: number;
  damagePhotoCount: number;
  documentPhotoCount: number;
  llmClassificationFailed: boolean;
  extractionError?: string;
  startedAt: Date;
  totalDurationMs: number;
  // Quality metrics from hardened extractor
  qualitySummary?: PhotoQualitySummary;
}): PhotoIngestionLog {
  const {
    sourceUrl, isPdf, pageRenderCount, embeddedImageCount,
    totalExtracted, damagePhotoCount, documentPhotoCount,
    llmClassificationFailed, extractionError, startedAt, totalDurationMs,
    qualitySummary,
  } = params;

  const attempts: PhotoIngestionAttempt[] = [];
  const isScanned = qualitySummary?.isScannedPdf ?? false;

  // Strategy 1: page render (pdftoppm or scanned-PDF high-DPI render)
  if (isPdf) {
    const strategy: PhotoIngestionStrategy = isScanned ? 'scanned_pdf_render' : 'pdftoppm_page_render';
    const dpiNote = qualitySummary ? ` at ${qualitySummary.renderDpi} DPI` : '';
    attempts.push({
      strategy,
      outcome: extractionError
        ? 'failed'
        : pageRenderCount > 0 ? 'success' : 'failed',
      imagesFound: pageRenderCount,
      imagesUploaded: pageRenderCount,
      damagePhotosClassified: 0,
      documentImagesClassified: 0,
      durationMs: 0, // not tracked separately
      failureReason: extractionError && pageRenderCount === 0 ? extractionError : undefined,
      notes: `Rendered ${pageRenderCount} page(s)${dpiNote}${isScanned ? ' (scanned PDF detected)' : ''}`,
    });

    // Strategy 2: pdfimages embedded
    attempts.push({
      strategy: 'pdfimages_embedded',
      outcome: embeddedImageCount > 0 ? 'success' : 'skipped',
      imagesFound: embeddedImageCount,
      imagesUploaded: embeddedImageCount,
      damagePhotosClassified: 0,
      documentImagesClassified: 0,
      durationMs: 0,
      notes: embeddedImageCount > 0
        ? `Found ${embeddedImageCount} embedded image(s)` +
          (qualitySummary?.rejectedTooSmall ? ` (${qualitySummary.rejectedTooSmall} rejected: too small)` : '')
        : 'No embedded images found',
    });
  } else {
    attempts.push({
      strategy: 'direct_url',
      outcome: totalExtracted > 0 ? 'success' : 'failed',
      imagesFound: totalExtracted,
      imagesUploaded: totalExtracted,
      damagePhotosClassified: 0,
      documentImagesClassified: 0,
      durationMs: 0,
    });
  }

  // Strategy 3: LLM classification (per-image independent)
  if (totalExtracted > 0) {
    const blurryNote = qualitySummary?.blurryCount
      ? ` (${qualitySummary.blurryCount} blurry images processed with quality-aware prompts)`
      : '';
    attempts.push({
      strategy: llmClassificationFailed ? 'fallback_all_as_damage' : 'llm_classification',
      outcome: llmClassificationFailed ? 'partial' : 'success',
      imagesFound: totalExtracted,
      imagesUploaded: totalExtracted,
      damagePhotosClassified: damagePhotoCount,
      documentImagesClassified: documentPhotoCount,
      durationMs: 0,
      failureReason: llmClassificationFailed
        ? 'Per-image LLM classification failed for some images — fallback applied'
        : undefined,
      notes: llmClassificationFailed
        ? `Fallback: ${damagePhotoCount} images treated as damage_photo`
        : `Classified ${damagePhotoCount} damage photos and ${documentPhotoCount} document images${blurryNote}`,
    });
  }

  // Determine overall outcome
  let overallOutcome: PhotoIngestionLog['overallOutcome'];
  let summary: string;
  let requiresPhotoReview = false;

  const blurryWarning = qualitySummary?.blurryCount
    ? ` Note: ${qualitySummary.blurryCount} image(s) had low sharpness.`
    : '';
  const scannedNote = isScanned ? ' Source was a scanned PDF (rendered at high DPI).' : '';

  if (extractionError && totalExtracted === 0) {
    overallOutcome = 'extraction_failed';
    summary = `Photo extraction failed: ${extractionError}. The document may contain photos that could not be processed. Manual review recommended.`;
    requiresPhotoReview = true;
  } else if (totalExtracted === 0 && !extractionError) {
    overallOutcome = 'no_photos_in_document';
    summary = `No images were found in the source document. This is expected for text-only claim forms.${scannedNote}`;
    requiresPhotoReview = false;
  } else if (damagePhotoCount === 0 && totalExtracted > 0) {
    overallOutcome = 'extraction_failed';
    summary = `${totalExtracted} image(s) were extracted but none classified as vehicle damage photos. ` +
      `Images may be document elements (logos, stamps, signatures).${blurryWarning}${scannedNote} Manual photo review recommended.`;
    requiresPhotoReview = true;
  } else {
    overallOutcome = 'photos_available';
    const qualityNote = qualitySummary?.avgSharpnessScore != null
      ? ` Average sharpness score: ${qualitySummary.avgSharpnessScore.toFixed(0)}.`
      : '';
    summary = `${damagePhotoCount} damage photo(s) extracted and classified (${totalExtracted} total images processed).${blurryWarning}${scannedNote}${qualityNote}`;
    requiresPhotoReview = (qualitySummary?.blurryCount ?? 0) > 0 && damagePhotoCount > 0;
  }

  return {
    startedAt: startedAt.toISOString(),
    totalDurationMs,
    sourceUrl,
    isPdf,
    attempts,
    finalDamagePhotoCount: damagePhotoCount,
    finalTotalPhotoCount: totalExtracted,
    overallOutcome,
    summary,
    requiresPhotoReview,
    qualitySummary,
  };
}
