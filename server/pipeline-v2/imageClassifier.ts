/**
 * pipeline-v2/imageClassifier.ts
 *
 * INTELLIGENT IMAGE CLASSIFICATION LAYER
 *
 * Inserted between PDF extraction and pipeline context creation.
 * Replaces the naive "dump all images into damagePhotos" approach with
 * a 3-tier classification system:
 *
 *   Tier 1 — Heuristic Scoring (instant, no LLM)
 *     Uses metadata from the PDF extractor (source, isTextHeavy, blurScore,
 *     colourVariance, dimensions) to compute a confidence score per image.
 *
 *   Tier 2 — LLM Classification (single batch call)
 *     Sends mid-confidence images (0.3–0.7) to the LLM for classification.
 *     Max 8 images per call. Returns structured classification per image.
 *
 *   Tier 3 — Structured Output
 *     Produces classified image arrays with confidence scores.
 *     No images are ever skipped — low-confidence images go to fallbackPool.
 *
 * DESIGN PRINCIPLES:
 *   - Confidence-based, not binary — every classification carries a score
 *   - No images are permanently discarded — fallbackPool preserves edge cases
 *   - Quality-based selection, not count-capped — best images by composite score
 *   - Image diversity filter — removes near-duplicates by page proximity + size
 *   - Metadata preservation — full ExtractedImage data flows through the pipeline
 */

import { invokeLLM } from "../_core/llm";

// ─── Types ───────────────────────────────────────────────────────────────────

/** Mirrors the ExtractedImage from pdf-image-extractor.ts */
export interface ExtractedImageInput {
  url: string;
  width: number;
  height: number;
  pageNumber: number;
  source: 'page_render' | 'embedded_image';
  quality: {
    width: number;
    height: number;
    blurScore: number;
    isBlurry: boolean;
    isTextHeavy: boolean;
    isUniform: boolean;
    colourVariance: number;
    aspectRatio: number;
    pixelArea: number;
    rejectionReason?: string;
  };
  fromScannedPdf: boolean;
  renderDpi?: number;
}

export type ImageCategory =
  | 'damage_photo'
  | 'vehicle_overview'
  | 'quotation_scan'
  | 'document_page'
  | 'other';

export interface ClassifiedImage {
  url: string;
  width: number;
  height: number;
  pageNumber: number;
  source: 'page_render' | 'embedded_image';
  category: ImageCategory;
  confidence: number;            // 0–1, how confident we are in the category
  qualityScore: number;          // 0–100, composite quality score for ranking
  heuristicScore: number;        // 0–1, Tier 1 heuristic confidence
  llmClassified: boolean;        // true if Tier 2 LLM was used
  metadata: ExtractedImageInput; // full original metadata preserved
}

export interface ClassificationResult {
  damagePhotos: ClassifiedImage[];
  vehicleOverviews: ClassifiedImage[];
  quotationImages: ClassifiedImage[];
  documentPages: ClassifiedImage[];
  fallbackPool: ClassifiedImage[];
  /** Summary statistics for logging and forensic reporting */
  summary: {
    totalInput: number;
    totalClassified: number;
    damagePhotoCount: number;
    vehicleOverviewCount: number;
    quotationCount: number;
    documentPageCount: number;
    fallbackCount: number;
    duplicatesRemoved: number;
    llmClassifiedCount: number;
    heuristicOnlyCount: number;
    averageConfidence: number;
  };
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** Heuristic confidence thresholds */
const HIGH_CONFIDENCE_THRESHOLD = 0.7;   // Above this → trust heuristic
const LOW_CONFIDENCE_THRESHOLD = 0.3;    // Below this → trust heuristic (other direction)
// Between 0.3 and 0.7 → send to LLM for Tier 2 classification

/** Max images to send to LLM for classification */
const MAX_LLM_CLASSIFICATION_BATCH = 8;

/** Diversity filter: images from the same page within this size ratio are considered duplicates */
const DUPLICATE_SIZE_RATIO_THRESHOLD = 0.85;

/** Minimum quality score for an image to be considered for vision analysis */
const MIN_QUALITY_SCORE_FOR_VISION = 20;

// ─── Tier 1: Heuristic Scoring ──────────────────────────────────────────────

/**
 * Compute a heuristic "damage photo likelihood" score from image metadata.
 *
 * Score formula:
 *   score = f(isTextHeavy, colourVariance, blurScore, size, source, aspectRatio)
 *
 * Returns 0–1 where:
 *   > 0.7 = almost certainly a damage photo
 *   0.3–0.7 = ambiguous, needs LLM classification
 *   < 0.3 = almost certainly NOT a damage photo
 */
function computeHeuristicScore(img: ExtractedImageInput): {
  score: number;
  likelyCategory: ImageCategory;
  reasoning: string;
} {
  const q = img.quality;
  let score = 0.5; // Start neutral
  const reasons: string[] = [];

  // ── Factor 1: Text-heavy images are almost always document pages ──────
  if (q.isTextHeavy) {
    score -= 0.35;
    reasons.push('text-heavy (-0.35)');
  }

  // ── Factor 2: Source type ─────────────────────────────────────────────
  if (img.source === 'embedded_image') {
    score += 0.15; // Embedded images are more likely to be actual photos
    reasons.push('embedded (+0.15)');
  } else {
    // Page renders are more likely to be document pages
    score -= 0.10;
    reasons.push('page_render (-0.10)');
  }

  // ── Factor 3: Colour variance — photos have higher variance ──────────
  if (q.colourVariance > 60) {
    score += 0.15;
    reasons.push(`high_colour_var=${q.colourVariance.toFixed(0)} (+0.15)`);
  } else if (q.colourVariance > 40) {
    score += 0.05;
    reasons.push(`med_colour_var=${q.colourVariance.toFixed(0)} (+0.05)`);
  } else if (q.colourVariance < 15) {
    score -= 0.15;
    reasons.push(`low_colour_var=${q.colourVariance.toFixed(0)} (-0.15)`);
  }

  // ── Factor 4: Blur score — sharp images are more likely real photos ───
  if (q.blurScore > 200) {
    score += 0.10;
    reasons.push(`sharp=${q.blurScore.toFixed(0)} (+0.10)`);
  } else if (q.blurScore < 50) {
    score -= 0.10;
    reasons.push(`blurry=${q.blurScore.toFixed(0)} (-0.10)`);
  }

  // ── Factor 5: Size — damage photos tend to be larger ──────────────────
  const megapixels = q.pixelArea / 1_000_000;
  if (megapixels > 2) {
    score += 0.10;
    reasons.push(`large=${megapixels.toFixed(1)}MP (+0.10)`);
  } else if (megapixels < 0.1) {
    score -= 0.15;
    reasons.push(`tiny=${megapixels.toFixed(2)}MP (-0.15)`);
  }

  // ── Factor 6: Aspect ratio — extreme ratios suggest banners/headers ───
  if (q.aspectRatio > 3.0 || q.aspectRatio < 0.33) {
    score -= 0.15;
    reasons.push(`extreme_aspect=${q.aspectRatio.toFixed(2)} (-0.15)`);
  }

  // ── Factor 7: Uniform images are blank/logo pages ─────────────────────
  if (q.isUniform) {
    score -= 0.25;
    reasons.push('uniform (-0.25)');
  }

  // Clamp to [0, 1]
  score = Math.max(0, Math.min(1, score));

  // Determine likely category from heuristic
  let likelyCategory: ImageCategory;
  if (score >= HIGH_CONFIDENCE_THRESHOLD) {
    likelyCategory = 'damage_photo';
  } else if (q.isTextHeavy && img.source === 'page_render') {
    likelyCategory = 'document_page';
  } else if (q.isTextHeavy && img.source === 'embedded_image') {
    likelyCategory = 'quotation_scan';
  } else if (score < LOW_CONFIDENCE_THRESHOLD) {
    likelyCategory = 'document_page';
  } else {
    likelyCategory = 'other'; // Ambiguous — needs LLM
  }

  return {
    score,
    likelyCategory,
    reasoning: reasons.join(', '),
  };
}

/**
 * Compute a composite quality score (0–100) for ranking images.
 * Higher = better quality for vision analysis.
 *
 * Factors: sharpness, colour richness, size, non-text, non-uniform
 */
function computeQualityScore(img: ExtractedImageInput): number {
  const q = img.quality;
  let score = 0;

  // Sharpness (0–30 points)
  const sharpness = Math.min(q.blurScore / 500, 1); // Normalize to 0–1
  score += sharpness * 30;

  // Colour richness (0–25 points)
  const colourRichness = Math.min(q.colourVariance / 80, 1);
  score += colourRichness * 25;

  // Size (0–20 points)
  const sizeFactor = Math.min(q.pixelArea / 3_000_000, 1);
  score += sizeFactor * 20;

  // Non-text bonus (0–15 points)
  if (!q.isTextHeavy) score += 15;

  // Non-uniform bonus (0–10 points)
  if (!q.isUniform) score += 10;

  return Math.round(Math.max(0, Math.min(100, score)));
}

// ─── Diversity Filter ────────────────────────────────────────────────────────

/**
 * Remove near-duplicate images based on page proximity and size similarity.
 *
 * Two images are considered duplicates if:
 *   - They come from the same page number
 *   - Their pixel areas are within DUPLICATE_SIZE_RATIO_THRESHOLD of each other
 *
 * When duplicates are found, keep the one with the higher quality score.
 */
function removeDuplicates(
  images: Array<ExtractedImageInput & { qualityScore: number }>,
  log: (msg: string) => void
): { filtered: typeof images; removedCount: number } {
  const kept: typeof images = [];
  let removedCount = 0;

  for (const img of images) {
    const isDuplicate = kept.some(existing => {
      if (existing.pageNumber !== img.pageNumber) return false;
      const sizeRatio = Math.min(existing.quality.pixelArea, img.quality.pixelArea) /
                        Math.max(existing.quality.pixelArea, img.quality.pixelArea);
      return sizeRatio > DUPLICATE_SIZE_RATIO_THRESHOLD;
    });

    if (isDuplicate) {
      // Check if this image is better than the existing one from the same page
      const existingIdx = kept.findIndex(existing => {
        if (existing.pageNumber !== img.pageNumber) return false;
        const sizeRatio = Math.min(existing.quality.pixelArea, img.quality.pixelArea) /
                          Math.max(existing.quality.pixelArea, img.quality.pixelArea);
        return sizeRatio > DUPLICATE_SIZE_RATIO_THRESHOLD;
      });

      if (existingIdx >= 0 && img.qualityScore > kept[existingIdx].qualityScore) {
        log(`Diversity: replacing page ${kept[existingIdx].pageNumber} image (quality ${kept[existingIdx].qualityScore}) with better version (quality ${img.qualityScore})`);
        kept[existingIdx] = img;
      } else {
        log(`Diversity: removing duplicate from page ${img.pageNumber} (quality ${img.qualityScore})`);
      }
      removedCount++;
    } else {
      kept.push(img);
    }
  }

  return { filtered: kept, removedCount };
}

// ─── Tier 2: LLM Classification ─────────────────────────────────────────────

const LLM_CLASSIFICATION_SCHEMA = {
  type: "json_schema" as const,
  json_schema: {
    name: "image_classification",
    strict: true,
    schema: {
      type: "object",
      properties: {
        classifications: {
          type: "array",
          items: {
            type: "object",
            properties: {
              index: { type: "integer", description: "0-based index of the image in the batch" },
              category: {
                type: "string",
                enum: ["damage_photo", "vehicle_overview", "quotation_scan", "document_page", "other"],
              },
              confidence: {
                type: "number",
                description: "Confidence score 0.0–1.0",
              },
              reasoning: {
                type: "string",
                description: "Brief explanation of why this classification was chosen",
              },
            },
            required: ["index", "category", "confidence", "reasoning"],
            additionalProperties: false,
          },
        },
      },
      required: ["classifications"],
      additionalProperties: false,
    },
  },
};

/**
 * Send ambiguous images to LLM for classification.
 * Uses a single batch call with multiple images.
 * Returns a map of image URL → { category, confidence, reasoning }.
 */
async function llmClassifyBatch(
  images: ExtractedImageInput[],
  log: (msg: string) => void
): Promise<Map<string, { category: ImageCategory; confidence: number; reasoning: string }>> {
  const results = new Map<string, { category: ImageCategory; confidence: number; reasoning: string }>();

  if (images.length === 0) return results;

  const batch = images.slice(0, MAX_LLM_CLASSIFICATION_BATCH);
  log(`Tier 2 LLM: classifying ${batch.length} ambiguous image(s)`);

  try {
    const imageContent = batch.map((img, idx) => ([
      {
        type: "text" as const,
        text: `Image ${idx} (${img.width}x${img.height}, page ${img.pageNumber}, source: ${img.source}):`,
      },
      {
        type: "image_url" as const,
        image_url: { url: img.url, detail: "low" as const },
      },
    ])).flat();

    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are an image classifier for a South African motor insurance claims processing system.

Classify each image into EXACTLY ONE of these categories:

1. **damage_photo** — Shows actual vehicle damage (dents, scratches, broken parts, deformation, impact marks). The image clearly depicts a damaged vehicle or vehicle component.

2. **vehicle_overview** — Shows a full or partial vehicle view WITHOUT visible damage. Could be a pre-accident photo, identification photo, or general vehicle shot.

3. **quotation_scan** — Shows a repair quotation, invoice, or price list. May be handwritten or printed. Contains line items, prices, part numbers, or cost totals.

4. **document_page** — Shows a form, claim document, police report, ID document, or any text-heavy administrative page. Contains mostly text, checkboxes, signatures, stamps.

5. **other** — Does not fit any of the above categories. Could be a logo, blank page, irrelevant image, or unrecognisable content.

RULES:
- If an image shows a vehicle WITH visible damage, classify as "damage_photo" (not "vehicle_overview")
- If an image is a full page with a small damage photo embedded in it, classify as "damage_photo" (the photo content matters more than the page format)
- If an image is blurry but appears to show vehicle damage, still classify as "damage_photo" with lower confidence
- Return confidence 0.0–1.0 where 1.0 = absolutely certain

Return ONLY JSON matching the schema.`,
        },
        {
          role: "user",
          content: [
            {
              type: "text" as const,
              text: `Classify each of the following ${batch.length} images. Return a classification for each image by its index (0-based).`,
            },
            ...imageContent,
          ],
        },
      ],
      response_format: LLM_CLASSIFICATION_SCHEMA,
    });

    const rawContent = response.choices?.[0]?.message?.content || "{}";
    const content = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);
    const parsed = JSON.parse(content);
    const classifications: Array<{
      index: number;
      category: string;
      confidence: number;
      reasoning: string;
    }> = parsed.classifications || [];

    for (const cls of classifications) {
      if (cls.index >= 0 && cls.index < batch.length) {
        const validCategories: ImageCategory[] = ['damage_photo', 'vehicle_overview', 'quotation_scan', 'document_page', 'other'];
        const category = validCategories.includes(cls.category as ImageCategory)
          ? cls.category as ImageCategory
          : 'other';
        results.set(batch[cls.index].url, {
          category,
          confidence: Math.max(0, Math.min(1, cls.confidence)),
          reasoning: cls.reasoning || '',
        });
      }
    }

    log(`Tier 2 LLM: classified ${results.size}/${batch.length} images successfully`);
  } catch (err) {
    log(`Tier 2 LLM: classification failed (non-fatal): ${String(err)} — falling back to heuristics`);
    // On LLM failure, all images stay with their heuristic classification
  }

  return results;
}

// ─── Main Classification Function ────────────────────────────────────────────

/**
 * Classify extracted images into categories with confidence scores.
 *
 * This is the main entry point for the image classification layer.
 * Call this after PDF extraction and before pipeline context creation.
 *
 * @param images - Raw extracted images from pdf-image-extractor
 * @param log - Logging function for pipeline tracing
 * @returns ClassificationResult with categorised images and summary
 */
export async function classifyExtractedImages(
  images: ExtractedImageInput[],
  log: (msg: string) => void = (msg) => console.log(`[ImageClassifier] ${msg}`)
): Promise<ClassificationResult> {
  const startMs = Date.now();
  log(`Starting classification of ${images.length} image(s)`);

  if (images.length === 0) {
    return {
      damagePhotos: [],
      vehicleOverviews: [],
      quotationImages: [],
      documentPages: [],
      fallbackPool: [],
      summary: {
        totalInput: 0,
        totalClassified: 0,
        damagePhotoCount: 0,
        vehicleOverviewCount: 0,
        quotationCount: 0,
        documentPageCount: 0,
        fallbackCount: 0,
        duplicatesRemoved: 0,
        llmClassifiedCount: 0,
        heuristicOnlyCount: 0,
        averageConfidence: 0,
      },
    };
  }

  // ── STEP 1: Compute heuristic scores and quality scores ───────────────
  const scored = images.map(img => {
    const heuristic = computeHeuristicScore(img);
    const qualityScore = computeQualityScore(img);
    return {
      ...img,
      heuristicScore: heuristic.score,
      heuristicCategory: heuristic.likelyCategory,
      heuristicReasoning: heuristic.reasoning,
      qualityScore,
    };
  });

  // ── STEP 2: Diversity filter — remove near-duplicates ─────────────────
  const { filtered: deduplicated, removedCount: duplicatesRemoved } =
    removeDuplicates(scored, log);

  if (duplicatesRemoved > 0) {
    log(`Diversity filter: removed ${duplicatesRemoved} near-duplicate(s), ${deduplicated.length} remaining`);
  }

  // ── STEP 3: Partition into confident vs ambiguous ─────────────────────
  const confident: typeof deduplicated = [];
  const ambiguous: typeof deduplicated = [];

  for (const img of deduplicated) {
    if (img.heuristicScore >= HIGH_CONFIDENCE_THRESHOLD || img.heuristicScore <= LOW_CONFIDENCE_THRESHOLD) {
      confident.push(img);
    } else {
      ambiguous.push(img);
    }
  }

  log(`Tier 1 heuristic: ${confident.length} confident, ${ambiguous.length} ambiguous`);

  // ── STEP 4: LLM classification for ambiguous images ───────────────────
  let llmClassifiedCount = 0;
  const llmResults = ambiguous.length > 0
    ? await llmClassifyBatch(ambiguous, log)
    : new Map<string, { category: ImageCategory; confidence: number; reasoning: string }>();

  llmClassifiedCount = llmResults.size;

  // ── STEP 5: Build final classified images ─────────────────────────────
  const allClassified: ClassifiedImage[] = [];

  // Process confident images (heuristic only)
  for (const img of confident) {
    allClassified.push({
      url: img.url,
      width: img.width,
      height: img.height,
      pageNumber: img.pageNumber,
      source: img.source,
      category: img.heuristicCategory,
      confidence: img.heuristicScore >= HIGH_CONFIDENCE_THRESHOLD
        ? img.heuristicScore
        : 1 - img.heuristicScore, // For low-score items, confidence in the "not damage" classification
      qualityScore: img.qualityScore,
      heuristicScore: img.heuristicScore,
      llmClassified: false,
      metadata: img,
    });
  }

  // Process ambiguous images (LLM-classified or heuristic fallback)
  for (const img of ambiguous) {
    const llmResult = llmResults.get(img.url);
    if (llmResult) {
      allClassified.push({
        url: img.url,
        width: img.width,
        height: img.height,
        pageNumber: img.pageNumber,
        source: img.source,
        category: llmResult.category,
        confidence: llmResult.confidence,
        qualityScore: img.qualityScore,
        heuristicScore: img.heuristicScore,
        llmClassified: true,
        metadata: img,
      });
    } else {
      // LLM failed for this image — use heuristic with reduced confidence
      allClassified.push({
        url: img.url,
        width: img.width,
        height: img.height,
        pageNumber: img.pageNumber,
        source: img.source,
        category: img.heuristicCategory,
        confidence: Math.max(0.2, img.heuristicScore * 0.7), // Reduced confidence
        qualityScore: img.qualityScore,
        heuristicScore: img.heuristicScore,
        llmClassified: false,
        metadata: img,
      });
    }
  }

  // ── STEP 6: Sort into category buckets ────────────────────────────────
  const result: ClassificationResult = {
    damagePhotos: [],
    vehicleOverviews: [],
    quotationImages: [],
    documentPages: [],
    fallbackPool: [],
    summary: {
      totalInput: images.length,
      totalClassified: allClassified.length,
      damagePhotoCount: 0,
      vehicleOverviewCount: 0,
      quotationCount: 0,
      documentPageCount: 0,
      fallbackCount: 0,
      duplicatesRemoved,
      llmClassifiedCount,
      heuristicOnlyCount: allClassified.filter(i => !i.llmClassified).length,
      averageConfidence: 0,
    },
  };

  for (const img of allClassified) {
    // Low-confidence classifications go to fallback pool for low-priority analysis
    if (img.confidence < 0.4 && img.category !== 'document_page') {
      result.fallbackPool.push(img);
      continue;
    }

    switch (img.category) {
      case 'damage_photo':
        result.damagePhotos.push(img);
        break;
      case 'vehicle_overview':
        result.vehicleOverviews.push(img);
        break;
      case 'quotation_scan':
        result.quotationImages.push(img);
        break;
      case 'document_page':
        result.documentPages.push(img);
        break;
      default:
        result.fallbackPool.push(img);
        break;
    }
  }

  // Sort each bucket by quality score (best first) for downstream selection
  const sortByQuality = (a: ClassifiedImage, b: ClassifiedImage) =>
    b.qualityScore - a.qualityScore || b.confidence - a.confidence;

  result.damagePhotos.sort(sortByQuality);
  result.vehicleOverviews.sort(sortByQuality);
  result.quotationImages.sort(sortByQuality);
  result.fallbackPool.sort(sortByQuality);

  // Update summary counts
  result.summary.damagePhotoCount = result.damagePhotos.length;
  result.summary.vehicleOverviewCount = result.vehicleOverviews.length;
  result.summary.quotationCount = result.quotationImages.length;
  result.summary.documentPageCount = result.documentPages.length;
  result.summary.fallbackCount = result.fallbackPool.length;
  result.summary.averageConfidence = allClassified.length > 0
    ? Math.round(allClassified.reduce((s, i) => s + i.confidence, 0) / allClassified.length * 100) / 100
    : 0;

  const durationMs = Date.now() - startMs;
  log(
    `Classification complete in ${durationMs}ms: ` +
    `${result.summary.damagePhotoCount} damage, ` +
    `${result.summary.vehicleOverviewCount} overview, ` +
    `${result.summary.quotationCount} quotation, ` +
    `${result.summary.documentPageCount} document, ` +
    `${result.summary.fallbackCount} fallback ` +
    `(${duplicatesRemoved} duplicates removed, ${llmClassifiedCount} LLM-classified, avg confidence: ${result.summary.averageConfidence})`
  );

  return result;
}

// ─── Quality-Based Image Selection ───────────────────────────────────────────

/**
 * Select the best images for vision analysis based on quality, not count.
 *
 * Instead of blindly capping at N images, this function:
 *   1. Takes classified damage photos sorted by quality
 *   2. Includes fallback pool images above a minimum quality threshold
 *   3. Returns the top images by composite score (quality + confidence)
 *
 * @param classified - ClassificationResult from classifyExtractedImages
 * @param maxImages - Maximum images to return (default 6)
 * @returns Array of image URLs ranked by quality
 */
export function selectBestImagesForVision(
  classified: ClassificationResult,
  maxImages: number = 6
): { urls: string[]; selectionLog: string[] } {
  const log: string[] = [];
  const candidates: Array<{ url: string; compositeScore: number; source: string }> = [];

  // Primary: classified damage photos
  for (const img of classified.damagePhotos) {
    if (img.qualityScore >= MIN_QUALITY_SCORE_FOR_VISION) {
      const compositeScore = img.qualityScore * 0.6 + img.confidence * 100 * 0.4;
      candidates.push({ url: img.url, compositeScore, source: 'damage_photo' });
    }
  }
  log.push(`Primary pool: ${candidates.length} damage photos above quality threshold`);

  // Secondary: fallback pool images (lower weight)
  const fallbackCandidates: typeof candidates = [];
  for (const img of classified.fallbackPool) {
    if (img.qualityScore >= MIN_QUALITY_SCORE_FOR_VISION + 10) { // Higher threshold for fallback
      const compositeScore = (img.qualityScore * 0.6 + img.confidence * 100 * 0.4) * 0.7; // 30% penalty
      fallbackCandidates.push({ url: img.url, compositeScore, source: 'fallback' });
    }
  }
  if (fallbackCandidates.length > 0) {
    log.push(`Fallback pool: ${fallbackCandidates.length} images above quality threshold`);
    candidates.push(...fallbackCandidates);
  }

  // Tertiary: vehicle overviews (useful for context, lowest priority)
  if (candidates.length < maxImages) {
    for (const img of classified.vehicleOverviews) {
      if (img.qualityScore >= MIN_QUALITY_SCORE_FOR_VISION + 15) {
        const compositeScore = (img.qualityScore * 0.6 + img.confidence * 100 * 0.4) * 0.5; // 50% penalty
        candidates.push({ url: img.url, compositeScore, source: 'vehicle_overview' });
      }
    }
  }

  // Sort by composite score and take top N
  candidates.sort((a, b) => b.compositeScore - a.compositeScore);
  const selected = candidates.slice(0, maxImages);

  log.push(
    `Selected ${selected.length}/${candidates.length} images: ` +
    selected.map((s, i) => `[${i}] ${s.source} (score: ${s.compositeScore.toFixed(1)})`).join(', ')
  );

  return {
    urls: selected.map(s => s.url),
    selectionLog: log,
  };
}

// ─── Exports for Testing ─────────────────────────────────────────────────────

export const _testExports = {
  computeHeuristicScore,
  computeQualityScore,
  removeDuplicates,
  HIGH_CONFIDENCE_THRESHOLD,
  LOW_CONFIDENCE_THRESHOLD,
  MIN_QUALITY_SCORE_FOR_VISION,
};
