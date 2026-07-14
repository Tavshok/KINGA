/**
 * semanticImageClassifier.ts — Phase B Semantic Image Classification
 *
 * Purpose: Classify direct-upload images (S3 URLs) by semantic type BEFORE they
 * enter Stage 6 damage analysis. This prevents non-vehicle images (quotation scans,
 * documents, ID pages) from being fed to the vision damage model and generating
 * hallucinated vehicle components.
 *
 * This module handles the case that imageClassifier.ts was NOT designed for:
 * - imageClassifier.ts  → PDF-extracted images with rich metadata (ExtractedImageInput)
 * - semanticImageClassifier.ts → Direct S3 URL uploads with no metadata
 *
 * Non-fatal: if the LLM call fails, all images default to DAMAGE_PHOTO eligible for
 * Stage 6, preserving the existing (pre-fix) behaviour as a safe fallback.
 *
 * LLM prompt is an extended version of the C-09 classifier in photo-reextraction.ts.
 */

import { invokeLLM } from "../_core/llm";

// ── Types ──────────────────────────────────────────────────────────────────────

export type SemanticType =
  | 'DAMAGE_PHOTO'      // Actual vehicle damage — dents, scratches, deformation
  | 'VEHICLE_OVERVIEW'  // Vehicle exterior without visible damage
  | 'INTERIOR'          // Vehicle interior — seats, steering wheel, dashboard area
  | 'DASHBOARD'         // Dashboard / instrument cluster only
  | 'QUOTATION_SCAN'    // Repair quotation, invoice, price list with line items
  | 'DOCUMENT'          // Form, claim document, police report, ID, text-heavy page
  | 'VIN'               // VIN plate or chassis number plate
  | 'ODOMETER'          // Odometer / mileage display
  | 'NON_VEHICLE'       // No vehicle or vehicle-related content at all
  | 'UNKNOWN';          // Cannot be determined

export type EligibleStage = 'Stage6' | 'Stage9' | 'OCR' | 'Fraud';

export interface SemanticImageMeta {
  /** Original S3 URL */
  url: string;
  /** Short stable identifier derived from URL (last path segment, max 60 chars) */
  imageId: string;
  /** Semantic category assigned by the LLM classifier */
  semanticType: SemanticType;
  /** Subjective image quality: good / poor / unusable */
  quality: 'good' | 'poor' | 'unusable';
  /** Confidence in the quality assessment (0–1) */
  qualityConfidence: number;
  /** Confidence in the semantic type assignment (0–1) */
  semanticConfidence: number;
  /**
   * Which pipeline stages this image is eligible to enter.
   * Stage6 = damage vision model
   * Stage9 = quote comparison
   * OCR    = text extraction (future)
   * Fraud  = fraud scoring context
   */
  eligibleStages: EligibleStage[];
  /** One-sentence reasoning from the LLM */
  reasoning: string;
}

// ── eligibleStages routing table ──────────────────────────────────────────────

const STAGE_ROUTING: Record<SemanticType, EligibleStage[]> = {
  DAMAGE_PHOTO:     ['Stage6', 'Fraud'],
  VEHICLE_OVERVIEW: ['Stage6', 'Fraud'],
  INTERIOR:         ['Stage6', 'Fraud'],
  DASHBOARD:        ['Stage6'],
  QUOTATION_SCAN:   ['OCR', 'Fraud'],
  DOCUMENT:         ['OCR', 'Fraud'],
  VIN:              ['OCR'],
  ODOMETER:         ['OCR'],
  UNKNOWN:          ['Fraud'],
  NON_VEHICLE:      [],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function deriveImageId(url: string): string {
  // Use the last path segment (filename) as a stable short ID
  const raw = url.split('/').pop() ?? url;
  return raw.substring(0, 60);
}

/** Build the safe-default result for a URL when classification fails */
function safeFallback(url: string): SemanticImageMeta {
  return {
    url,
    imageId: deriveImageId(url),
    semanticType: 'DAMAGE_PHOTO',
    quality: 'good',
    qualityConfidence: 0.5,
    semanticConfidence: 0.0,
    eligibleStages: ['Stage6', 'Fraud'],
    reasoning: 'Classification unavailable — defaulting to DAMAGE_PHOTO (safe fallback)',
  };
}

// ── LLM Batch Classifier ──────────────────────────────────────────────────────

const VALID_SEMANTIC_TYPES: SemanticType[] = [
  'DAMAGE_PHOTO', 'VEHICLE_OVERVIEW', 'INTERIOR', 'DASHBOARD',
  'QUOTATION_SCAN', 'DOCUMENT', 'VIN', 'ODOMETER', 'NON_VEHICLE', 'UNKNOWN',
];

const VALID_QUALITIES = ['good', 'poor', 'unusable'] as const;

async function batchClassifyWithLLM(
  urls: string[],
  log: (msg: string) => void
): Promise<Map<string, SemanticImageMeta>> {
  const result = new Map<string, SemanticImageMeta>();

  // Build multi-image message content
  const imageContent = urls.flatMap((url, idx) => [
    { type: 'text' as const, text: `Image ${idx} (id: ${deriveImageId(url)}):` },
    { type: 'image_url' as const, image_url: { url, detail: 'low' as const } },
  ]);

  const response = await invokeLLM({
    messages: [
      {
        role: 'system',
        content: `You are a forensic image classifier for a motor insurance claims processing system.
Classify each image into EXACTLY ONE semantic type and assess its quality.

SEMANTIC TYPES:
1. DAMAGE_PHOTO      — Shows actual vehicle damage (dents, scratches, broken parts, deformation, impact marks, crumple zones)
2. VEHICLE_OVERVIEW  — Shows a full or partial vehicle exterior WITHOUT visible damage
3. INTERIOR          — Shows vehicle interior (seats, steering wheel, door panels, roof lining)
4. DASHBOARD         — Shows dashboard or instrument cluster only (warning lights, speedometer, fuel gauge)
5. QUOTATION_SCAN    — Shows a repair quotation, invoice, or price list with line items and costs
6. DOCUMENT          — Shows a form, claim document, police report, ID document, or any text-heavy administrative page
7. VIN               — Shows a VIN plate, chassis number plate, or engine number plate
8. ODOMETER          — Shows an odometer or mileage reading (digital or analogue)
9. NON_VEHICLE       — Does not contain a vehicle or any vehicle-related content (e.g. a landscape, person, building)
10. UNKNOWN          — Image is too blurry, dark, or ambiguous to classify

QUALITY LEVELS:
- good     — Clear, well-lit, usable for analysis
- poor     — Blurry, dark, or partially obscured but still identifiable
- unusable — Cannot be meaningfully analysed

RULES:
- If an image shows a vehicle WITH visible damage → DAMAGE_PHOTO
- If an image is mostly text, checkboxes, or a printed form → DOCUMENT
- If an image shows a printed repair quote with prices → QUOTATION_SCAN
- Return confidence 0.0–1.0 where 1.0 = absolutely certain
- Return ONLY valid JSON matching the schema`,
      },
      {
        role: 'user',
        content: [
          { type: 'text' as const, text: `Classify each of the following ${urls.length} image(s). Return one entry per image by its 0-based index.` },
          ...imageContent,
        ],
      },
    ],
    response_format: {
      type: 'json_schema' as const,
      json_schema: {
        name: 'semantic_image_classification',
        strict: true,
        schema: {
          type: 'object',
          properties: {
            classifications: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  index:              { type: 'integer' },
                  semanticType:       { type: 'string', enum: VALID_SEMANTIC_TYPES },
                  quality:            { type: 'string', enum: ['good', 'poor', 'unusable'] },
                  semanticConfidence: { type: 'number' },
                  qualityConfidence:  { type: 'number' },
                  reasoning:          { type: 'string' },
                },
                required: ['index', 'semanticType', 'quality', 'semanticConfidence', 'qualityConfidence', 'reasoning'],
                additionalProperties: false,
              },
            },
          },
          required: ['classifications'],
          additionalProperties: false,
        },
      },
    },
  });

  const rawContent = response.choices?.[0]?.message?.content ?? '{}';
  const content = typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent);
  const parsed = JSON.parse(content) as {
    classifications: Array<{
      index: number;
      semanticType: string;
      quality: string;
      semanticConfidence: number;
      qualityConfidence: number;
      reasoning: string;
    }>;
  };

  for (const cls of (parsed.classifications ?? [])) {
    if (cls.index < 0 || cls.index >= urls.length) continue;
    const url = urls[cls.index];
    const semanticType: SemanticType = VALID_SEMANTIC_TYPES.includes(cls.semanticType as SemanticType)
      ? (cls.semanticType as SemanticType)
      : 'UNKNOWN';
    const quality = VALID_QUALITIES.includes(cls.quality as typeof VALID_QUALITIES[number])
      ? (cls.quality as 'good' | 'poor' | 'unusable')
      : 'good';
    result.set(url, {
      url,
      imageId: deriveImageId(url),
      semanticType,
      quality,
      qualityConfidence:  Math.max(0, Math.min(1, cls.qualityConfidence  ?? 0.5)),
      semanticConfidence: Math.max(0, Math.min(1, cls.semanticConfidence ?? 0.5)),
      eligibleStages: STAGE_ROUTING[semanticType],
      reasoning: cls.reasoning ?? '',
    });
  }

  // Fill in any URLs the LLM omitted
  for (const url of urls) {
    if (!result.has(url)) {
      log(`SemanticClassifier: LLM omitted index for ${deriveImageId(url)} — using safe fallback`);
      result.set(url, safeFallback(url));
    }
  }

  return result;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Classify a list of image URLs by semantic type.
 *
 * Processes all URLs in a single LLM call (cost-efficient, same as C-09).
 * Non-fatal: returns all URLs as DAMAGE_PHOTO on any error.
 *
 * @param urls    Array of S3 image URLs to classify
 * @param log     Pipeline log function (ctx.log bound to a stage label)
 * @returns       Map<url, SemanticImageMeta> — one entry per input URL
 */
export async function runSemanticClassification(
  urls: string[],
  log: (msg: string) => void
): Promise<Map<string, SemanticImageMeta>> {
  if (urls.length === 0) {
    return new Map();
  }

  // Cost guard: cap at 20 images per call (same as imageClassifier.ts)
  const MAX_IMAGES = 20;
  const toClassify = urls.slice(0, MAX_IMAGES);
  if (urls.length > MAX_IMAGES) {
    log(`SemanticClassifier: ${urls.length} images — capping at ${MAX_IMAGES} for LLM call`);
  }

  try {
    log(`SemanticClassifier: classifying ${toClassify.length} image(s) via LLM…`);
    const result = await batchClassifyWithLLM(toClassify, log);

    // For any URLs beyond the cap, add safe fallbacks
    for (const url of urls.slice(MAX_IMAGES)) {
      result.set(url, safeFallback(url));
    }

    // Log summary
    const counts: Partial<Record<SemanticType, number>> = {};
    for (const meta of result.values()) {
      counts[meta.semanticType] = (counts[meta.semanticType] ?? 0) + 1;
    }
    const summary = Object.entries(counts)
      .map(([k, v]) => `${k}:${v}`)
      .join(', ');
    log(`SemanticClassifier: ${summary}`);

    const stage6Count = [...result.values()].filter(m => m.eligibleStages.includes('Stage6')).length;
    const excludedCount = result.size - stage6Count;
    log(`SemanticClassifier: ${stage6Count} image(s) eligible for Stage 6, ${excludedCount} excluded`);

    return result;
  } catch (err) {
    log(`SemanticClassifier: LLM error (non-fatal) — ${String(err)} — all ${urls.length} image(s) defaulting to DAMAGE_PHOTO`);
    const fallbackMap = new Map<string, SemanticImageMeta>();
    for (const url of urls) {
      fallbackMap.set(url, safeFallback(url));
    }
    return fallbackMap;
  }
}

/**
 * Filter a list of URLs to only those eligible for a given pipeline stage.
 *
 * Safe: if a URL has no classification entry, it is INCLUDED (preserves pre-fix behaviour).
 */
export function filterUrlsForStage(
  urls: string[],
  classifications: Map<string, SemanticImageMeta> | null | undefined,
  stage: EligibleStage
): string[] {
  if (!classifications || classifications.size === 0) {
    return urls; // No classification data → include all (safe default)
  }
  return urls.filter(url => {
    const meta = classifications.get(url);
    if (!meta) return true; // Unknown URL → include (safe default)
    return meta.eligibleStages.includes(stage);
  });
}
