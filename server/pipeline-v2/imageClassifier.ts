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
  source: 'page_render' | 'embedded_image' | 'direct_upload';
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
  | 'quote_with_embedded_photo'  // FIX C: quotation/document page that also contains an incidental vehicle photo
  | 'other';

export interface ClassifiedImage {
  url: string;
  width: number;
  height: number;
  pageNumber: number;
  source: 'page_render' | 'embedded_image' | 'direct_upload';
  category: ImageCategory;
  confidence: number;            // 0–1, how confident we are in the category
  qualityScore: number;          // 0–100, composite quality score for ranking
  heuristicScore: number;        // 0–1, Tier 1 heuristic confidence
  llmClassified: boolean;        // true if Tier 2 LLM was used
  /**
   * FIX C: Whether this image is suitable as a crush-depth measurement input.
   * A `damage_photo` is suitable; a `quote_with_embedded_photo` is NOT —
   * even though it contains photographic evidence of damage, the image is a
   * document page and the embedded photo is too small/low-resolution for
   * reliable crush-depth estimation.
   * Stage 6 and Stage 7 MUST check this flag before using an image for
   * Campbell/M5 speed estimation.
   */
  suitableForCrushDepth: boolean;
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

// ─────────────────────────────────────────────────────────────────────────────
// Classification thresholds
// CALIBRATION: These thresholds were set by engineering judgment during initial
// build and tuned empirically on a small set of test claims.
// No systematic dataset was used to derive them.
// Do not change without benchmarking against a labelled image sample.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Heuristic score above which the classifier trusts the heuristic result directly
 * (image is almost certainly a damage photo). Raised from 0.70 to 0.80 to widen
 * the LLM band and ensure mid-size quote scans (0.4–0.8 MP) reach Tier 2.
 * CALIBRATION: origin unknown — do not change without benchmarking.
 */
const HIGH_CONFIDENCE_THRESHOLD = 0.80;

/**
 * Heuristic score below which the classifier trusts the heuristic result directly
 * (image is almost certainly NOT a damage photo).
 * Between LOW_CONFIDENCE_THRESHOLD and HIGH_CONFIDENCE_THRESHOLD → send to LLM.
 * CALIBRATION: origin unknown — do not change without benchmarking.
 */
const LOW_CONFIDENCE_THRESHOLD = 0.25;

/**
 * Maximum number of images to send to the LLM in a single Tier 2 classification call.
 * CALIBRATION: origin unknown — do not change without benchmarking token cost.
 */
const MAX_LLM_CLASSIFICATION_BATCH = 15;

/**
 * Two images from the same page are considered duplicates when their pixel areas
 * are within this ratio of each other (e.g. 0.85 = within 15% size difference).
 * CALIBRATION: origin unknown — do not change without benchmarking.
 */
const DUPLICATE_SIZE_RATIO_THRESHOLD = 0.85;

/**
 * Minimum composite quality score (0–100) for an image to be included in
 * vision analysis. Images below this threshold are silently excluded.
 * CALIBRATION: origin unknown — do not change without benchmarking.
 */
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
  // NOTE: We intentionally do NOT give embedded images a score bonus.
  // Embedded images include both damage photos AND scanned quote pages.
  // Adding a bonus would push mid-size quote scans (0.4–0.8MP) above the
  // HIGH_CONFIDENCE_THRESHOLD, locking them as damage_photo before the LLM
  // can visually inspect them. Page renders get a small penalty since they
  // are more likely to be document pages.
  if (img.source === 'page_render') {
    score -= 0.10;
    reasons.push('page_render (-0.10)');
  }
  // embedded_image: no bonus — let LLM decide for mid-size images

  // ── Heuristic scoring factors
  // CALIBRATION: All factor weights and band boundaries below were set by
  // engineering judgment. No labelled dataset was used to derive them.
  // Do not change without benchmarking against a labelled image sample.

  /** Colour variance above this → high-variance bonus (likely photo) */
  const COLOUR_VAR_HIGH = 60;
  /** Colour variance above this → medium-variance bonus */
  const COLOUR_VAR_MED  = 40;
  /** Colour variance below this → low-variance penalty (likely document) */
  const COLOUR_VAR_LOW  = 15;
  /** Blur score above this → sharp-image bonus */
  const BLUR_SCORE_SHARP = 200;
  /** Blur score below this → blurry-image penalty */
  const BLUR_SCORE_BLURRY = 50;
  /** Megapixel area above this → large-image bonus */
  const MP_LARGE = 2;
  /** Megapixel area below this → tiny-image penalty */
  const MP_TINY  = 0.1;
  /** Aspect ratio above this or below 1/this → extreme-ratio penalty */
  const ASPECT_EXTREME_MAX = 3.0;
  const ASPECT_EXTREME_MIN = 0.33;

  // ── Factor 3: Colour variance — photos have higher variance ──────────
  if (q.colourVariance > COLOUR_VAR_HIGH) {
    score += 0.15;
    reasons.push(`high_colour_var=${q.colourVariance.toFixed(0)} (+0.15)`);
  } else if (q.colourVariance > COLOUR_VAR_MED) {
    score += 0.05;
    reasons.push(`med_colour_var=${q.colourVariance.toFixed(0)} (+0.05)`);
  } else if (q.colourVariance < COLOUR_VAR_LOW) {
    score -= 0.15;
    reasons.push(`low_colour_var=${q.colourVariance.toFixed(0)} (-0.15)`);
  }

  // ── Factor 4: Blur score — sharp images are more likely real photos ───
  if (q.blurScore > BLUR_SCORE_SHARP) {
    score += 0.10;
    reasons.push(`sharp=${q.blurScore.toFixed(0)} (+0.10)`);
  } else if (q.blurScore < BLUR_SCORE_BLURRY) {
    score -= 0.10;
    reasons.push(`blurry=${q.blurScore.toFixed(0)} (-0.10)`);
  }

  // ── Factor 5: Size — damage photos tend to be larger ──────────────────
  const megapixels = q.pixelArea / 1_000_000;
  if (megapixels > MP_LARGE) {
    score += 0.10;
    reasons.push(`large=${megapixels.toFixed(1)}MP (+0.10)`);
  } else if (megapixels < MP_TINY) {
    score -= 0.15;
    reasons.push(`tiny=${megapixels.toFixed(2)}MP (-0.15)`);
  }

  // ── Factor 6: Aspect ratio — extreme ratios suggest banners/headers ───
  if (q.aspectRatio > ASPECT_EXTREME_MAX || q.aspectRatio < ASPECT_EXTREME_MIN) {
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
  // IMPORTANT: text-heavy page_render images are NOT hard-classified as document_page.
  // They are left as 'other' so the LLM can visually inspect them — a text-heavy page
  // render may be a repair quotation (Swiss Motors, etc.) or a photo page with white
  // background, both of which the LLM can correctly identify.
  let likelyCategory: ImageCategory;
  if (score >= HIGH_CONFIDENCE_THRESHOLD) {
    likelyCategory = 'damage_photo';
  } else if (q.isTextHeavy && img.source === 'embedded_image') {
    likelyCategory = 'quotation_scan';
  } else if (score < LOW_CONFIDENCE_THRESHOLD && !q.isTextHeavy) {
    // Only hard-classify as document_page for low-score non-text-heavy images
    // (e.g. tiny, uniform, extreme-aspect images that are clearly not documents or quotes)
    likelyCategory = 'document_page';
  } else {
    likelyCategory = 'other'; // Ambiguous — needs LLM (includes text-heavy page renders)
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

  // Quality score factors
  // CALIBRATION: All normalisation denominators and point allocations below were
  // set by engineering judgment. No labelled dataset was used to derive them.
  // Do not change without benchmarking against a labelled image sample.

  /** Blur score normalisation ceiling (maps blurScore to 0–1 for sharpness) */
  const QUALITY_BLUR_NORM    = 500;
  /** Sharpness contribution to quality score (0–30 points) */
  const QUALITY_W_SHARPNESS  = 30;
  /** Colour variance normalisation ceiling */
  const QUALITY_COLOUR_NORM  = 80;
  /** Colour richness contribution (0–25 points) */
  const QUALITY_W_COLOUR     = 25;
  /** Pixel area normalisation ceiling (3 MP) */
  const QUALITY_SIZE_NORM    = 3_000_000;
  /** Size contribution (0–20 points) */
  const QUALITY_W_SIZE       = 20;
  /** Non-text bonus (0–15 points) */
  const QUALITY_W_NON_TEXT   = 15;
  /** Non-uniform bonus (0–10 points) */
  const QUALITY_W_NON_UNIFORM = 10;

  // Sharpness (0–30 points)
  const sharpness = Math.min(q.blurScore / QUALITY_BLUR_NORM, 1);
  score += sharpness * QUALITY_W_SHARPNESS;

  // Colour richness (0–25 points)
  const colourRichness = Math.min(q.colourVariance / QUALITY_COLOUR_NORM, 1);
  score += colourRichness * QUALITY_W_COLOUR;

  // Size (0–20 points)
  const sizeFactor = Math.min(q.pixelArea / QUALITY_SIZE_NORM, 1);
  score += sizeFactor * QUALITY_W_SIZE;

  // Non-text bonus (0–15 points)
  if (!q.isTextHeavy) score += QUALITY_W_NON_TEXT;

  // Non-uniform bonus (0–10 points)
  if (!q.isUniform) score += QUALITY_W_NON_UNIFORM;

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
  images: Array<ExtractedImageInput & { qualityScore: number; heuristicScore?: number; heuristicCategory?: string; heuristicReasoning?: string }>,
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
                enum: ["damage_photo", "vehicle_overview", "quotation_scan", "document_page", "quote_with_embedded_photo", "other"],
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

1. **damage_photo** — The PRIMARY content of the image is a close-up or mid-range photograph of a damaged vehicle or vehicle component. The damage is the main subject. This category is suitable for physical crush-depth measurement.

2. **vehicle_overview** — Shows a full or partial vehicle view WITHOUT visible damage. Could be a pre-accident photo, identification photo, or general vehicle shot.

3. **quotation_scan** — Shows a repair quotation, invoice, or price list. May be handwritten or printed. Contains line items, prices, part numbers, or cost totals. Classify as quotation_scan if the page is primarily a repair estimate from a panel beater or motor body repairer (e.g. Swiss Motors, Cedric Jonker, Kingfisher Auto Motors) — even if the page also contains a company letterhead, logo, or address block. The presence of a table with part descriptions and amounts is the key indicator. If the quotation page also contains a small incidental vehicle photo in the header or margin, use **quote_with_embedded_photo** instead.

4. **document_page** — Shows a form, claim document, police report, ID document, or any text-heavy administrative page. Contains mostly text, checkboxes, signatures, stamps. If the document page contains a small incidental vehicle photo, use **quote_with_embedded_photo** instead.

5. **quote_with_embedded_photo** — A repair quotation, document, or form page whose PRIMARY content is text/tables, but which ALSO contains a small incidental vehicle photo (e.g. in the letterhead, header, or margin). The page IS evidence that a vehicle was photographed, but the embedded photo is too small or incidental for reliable physical measurement. Use this instead of damage_photo when the page format is a document/quotation and the vehicle photo is secondary.

6. **other** — Does not fit any of the above categories. Could be a logo, blank page, irrelevant image, or unrecognisable content.

RULES:
- If an image shows a vehicle WITH visible damage as the PRIMARY subject, classify as "damage_photo" (not "vehicle_overview")
- If a document/quotation page has a small embedded vehicle photo, use "quote_with_embedded_photo" — NOT "damage_photo"
- If an image is blurry but the primary subject appears to be vehicle damage, still classify as "damage_photo" with lower confidence
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
        const validCategories: ImageCategory[] = ['damage_photo', 'vehicle_overview', 'quotation_scan', 'document_page', 'quote_with_embedded_photo', 'other'];
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
  type ScoredImage = (typeof scored)[number];
  const { filtered: deduplicated, removedCount: duplicatesRemoved } =
    removeDuplicates(scored, log) as { filtered: ScoredImage[]; removedCount: number };

  if (duplicatesRemoved > 0) {
    log(`Diversity filter: removed ${duplicatesRemoved} near-duplicate(s), ${deduplicated.length} remaining`);
  }

  // ── STEP 3: Partition into confident vs ambiguous ─────────────────────
  const confident: typeof deduplicated = [];
  const ambiguous: typeof deduplicated = [];

  for (const img of deduplicated) {
    // CRITICAL: text-heavy images MUST go to LLM regardless of heuristic score.
    // A text-heavy page_render scores ~0.05 (below LOW_CONFIDENCE_THRESHOLD) but
    // may be a repair quotation or a damage photo page with white background.
    // Only the LLM can visually distinguish these from plain document pages.
    const isTextHeavyPageRender = img.quality.isTextHeavy && img.source === 'page_render';
    if (!isTextHeavyPageRender && (img.heuristicScore >= HIGH_CONFIDENCE_THRESHOLD || img.heuristicScore <= LOW_CONFIDENCE_THRESHOLD)) {
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

  // FIX C: Helper to determine if a classified image is suitable for crush-depth measurement.
  // Only standalone damage_photo images are suitable — quote_with_embedded_photo images are NOT,
  // even though they contain photographic evidence of damage.
  const isSuitableForCrushDepth = (category: ImageCategory): boolean =>
    category === 'damage_photo';

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
      suitableForCrushDepth: isSuitableForCrushDepth(img.heuristicCategory),
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
        suitableForCrushDepth: isSuitableForCrushDepth(llmResult.category),
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
        // CALIBRATION: 0.2 floor and 0.7 reduction factor — origin unknown, do not change without benchmarking.
        confidence: Math.max(0.2, img.heuristicScore * 0.7), // Reduced confidence
        qualityScore: img.qualityScore,
        heuristicScore: img.heuristicScore,
        llmClassified: false,
        suitableForCrushDepth: isSuitableForCrushDepth(img.heuristicCategory),
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
    // CALIBRATION: 0.4 confidence floor — origin unknown, do not change without benchmarking.
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
      case 'quote_with_embedded_photo':
        // FIX C: Route to quotationImages (not damagePhotos) so it does NOT feed
        // Stage 6 crush-depth extraction. The suitableForCrushDepth=false flag
        // provides an additional guard for any downstream code that inspects it.
        result.quotationImages.push(img);
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
    // CALIBRATION: +10 higher threshold for fallback, 0.7 penalty factor — origin unknown.
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
      // CALIBRATION: +15 higher threshold for vehicle overviews, 0.5 penalty factor — origin unknown.
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
