/**
 * imageIntelligence.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Image Intelligence Layer — sits between PDF page rendering and Stage 6 vision.
 *
 * Pipeline:
 *   PDF page images
 *     → Feature extraction  (sharp — deterministic, zero LLM cost)
 *     → Scoring function    (weighted formula → damageLikelihoodScore 0–1)
 *     → Classification      (HIGH ≥0.75 | MEDIUM 0.40–0.74 | LOW <0.40)
 *     → LLM batch call      (only for MEDIUM / ambiguous pool)
 *     → Deduplication       (perceptual hash — remove near-identical frames)
 *     → Quality ranking     (top MAX_DAMAGE_PHOTOS by qualityScore)
 *     → Structured output   (ScoredImage[]) → Stage 6
 *
 * References:
 *   Architecture spec: pasted_content.txt (user, 2026-04-16)
 */

import sharp from "sharp";
import { invokeLLM } from "../_core/llm";
import type { PipelineContext } from "./types";

// ── Constants ─────────────────────────────────────────────────────────────────
const MAX_DAMAGE_PHOTOS = 8;          // max images forwarded to Stage 6 vision
const HIGH_CONFIDENCE_THRESHOLD = 0.75;
const LOW_CONFIDENCE_THRESHOLD  = 0.40;
const LLM_CLASSIFY_TIMEOUT_MS   = 20_000;

// ── Types ─────────────────────────────────────────────────────────────────────
export interface ImageFeatures {
  textDensity:        number;  // 0–1: high = lots of text (form/document)
  colourVariance:     number;  // 0–1: high = colourful (real photo)
  edgeDensity:        number;  // 0–1: high = complex edges (real photo)
  blurScore:          number;  // 0–1: high = sharp image (good quality)
  aspectRatio:        number;  // width/height
  meanBrightness:     number;  // 0–255
}

export type ImageClass = "damage_photo" | "document" | "quotation" | "irrelevant";

export interface ScoredImage {
  url:                  string;
  pageNumber:           number;          // 1-based
  source:               "page_render" | "embedded";
  damageLikelihoodScore: number;         // 0–1
  qualityScore:         number;          // 0–1 (sharpness × likelihood)
  confidence:           "HIGH" | "MEDIUM" | "LOW";
  classification:       ImageClass;
  features:             ImageFeatures;
}

// ── Feature extraction (deterministic, uses sharp) ────────────────────────────
async function extractFeatures(url: string): Promise<ImageFeatures | null> {
  try {
    // Fetch the image bytes
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) return null;
    const buffer = Buffer.from(await response.arrayBuffer());

    const image = sharp(buffer);
    const meta  = await image.metadata();
    const w = meta.width  ?? 1;
    const h = meta.height ?? 1;

    // ── Colour variance (std dev across RGB channels) ─────────────────────────
    // sharp.stats() returns per-channel mean/std. High std = colourful photo.
    const stats = await image.stats();
    const channelStds = stats.channels.map(c => c.stdev);
    // Average std across channels, normalised to 0–1 (max theoretical ~127)
    const colourVariance = Math.min(
      channelStds.reduce((s, v) => s + v, 0) / (channelStds.length * 127),
      1
    );

    // ── Mean brightness ───────────────────────────────────────────────────────
    const meanBrightness = stats.channels.reduce((s, c) => s + c.mean, 0) / stats.channels.length;

    // ── Edge density (Sobel-like: convert to greyscale, apply edge detection) ─
    // We use a Laplacian approximation via sharp's convolve kernel.
    // High edge density → complex scene (real photo) vs flat document.
    const edgeBuffer = await image
      .greyscale()
      .resize(256, 256, { fit: "fill" })
      .convolve({
        width: 3, height: 3,
        kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1],  // Laplacian
      })
      .raw()
      .toBuffer();
    const edgeSum = edgeBuffer.reduce((s, v) => s + v, 0);
    const edgeDensity = Math.min(edgeSum / (256 * 256 * 255), 1);

    // ── Blur score (variance of Laplacian — high variance = sharp image) ──────
    const edgeMean = edgeSum / edgeBuffer.length;
    const edgeVariance = edgeBuffer.reduce((s, v) => s + Math.pow(v - edgeMean, 2), 0) / edgeBuffer.length;
    // Normalise: typical sharp images have variance > 500; blurry < 100
    const blurScore = Math.min(edgeVariance / 1000, 1);

    // ── Text density (heuristic: high brightness + low colour variance + high edge density
    //    on a white background = text-heavy document page) ──────────────────────
    // A white page with black text has: high brightness, low colour variance, moderate edges.
    // We approximate text density as the inverse of "photo-ness".
    const isLikelyWhiteBackground = meanBrightness > 180;
    const isLowColour = colourVariance < 0.25;
    const textDensity = isLikelyWhiteBackground && isLowColour
      ? Math.min(0.3 + edgeDensity * 0.7, 1)  // text pages have structured edges
      : Math.max(0, 0.3 - colourVariance);     // colourful pages are unlikely to be text-only

    return {
      textDensity,
      colourVariance,
      edgeDensity,
      blurScore,
      aspectRatio: w / h,
      meanBrightness,
    };
  } catch {
    return null;
  }
}

// ── Scoring function ──────────────────────────────────────────────────────────
function scoreDamageLikelihood(f: ImageFeatures): number {
  // Weighted formula — tuned for vehicle damage photos vs. insurance documents
  //
  // Damage photos tend to:
  //   - have HIGH colour variance (real-world colours)
  //   - have HIGH edge density (complex scene)
  //   - have LOW text density (not a form)
  //   - have GOOD blur score (in-focus photo)
  //   - have NEAR-SQUARE or landscape aspect ratio (phone/camera photos)
  //
  // Document pages tend to:
  //   - have LOW colour variance (black text on white)
  //   - have MODERATE edge density (text lines)
  //   - have HIGH text density
  //   - have PORTRAIT aspect ratio (A4)
  const colourWeight  = 0.35;
  const edgeWeight    = 0.25;
  const textPenalty   = 0.20;
  const blurWeight    = 0.15;
  const aspectWeight  = 0.05;

  // Aspect ratio score: 0.5–2.0 is typical for photos; >2.5 or <0.4 is unusual
  const aspectScore = f.aspectRatio >= 0.5 && f.aspectRatio <= 2.5
    ? 1 - Math.abs(f.aspectRatio - 1.2) / 2.5
    : 0.2;

  const score =
    f.colourVariance  * colourWeight +
    f.edgeDensity     * edgeWeight +
    (1 - f.textDensity) * textPenalty +
    f.blurScore       * blurWeight +
    aspectScore       * aspectWeight;

  // Hard override: very white, very low colour → almost certainly a document
  if (f.meanBrightness > 220 && f.colourVariance < 0.15) {
    return Math.min(score, 0.35);
  }

  return Math.max(0, Math.min(score, 1));
}

// ── LLM batch classifier (ambiguous pool only) ────────────────────────────────
async function classifyAmbiguousPool(
  candidates: Array<{ url: string; index: number }>,
  ctx: PipelineContext
): Promise<Map<number, ImageClass>> {
  const result = new Map<number, ImageClass>();
  if (candidates.length === 0) return result;

  ctx.log("ImageIntelligence", `LLM batch classifier: ${candidates.length} ambiguous page(s)`);

  // Build a single multi-image LLM call to classify all ambiguous pages at once
  const imageContent = candidates.map((c, i) => [
    { type: "text" as const, text: `Image ${i + 1} (page ${c.index + 1}):` },
    { type: "image_url" as const, image_url: { url: c.url, detail: "low" as const } },
  ]).flat();

  const schema = {
    type: "object",
    properties: {
      classifications: {
        type: "array",
        items: {
          type: "object",
          properties: {
            image_number: { type: "integer" },
            class: { type: "string", enum: ["damage_photo", "document", "quotation", "irrelevant"] },
          },
          required: ["image_number", "class"],
          additionalProperties: false,
        },
      },
    },
    required: ["classifications"],
    additionalProperties: false,
  };

  try {
    const response = await Promise.race([
      invokeLLM({
        messages: [
          {
            role: "system",
            content: `You are a document classifier for insurance claims. Classify each provided image as one of: "damage_photo" (real photograph of vehicle damage), "document" (claim form, letter, policy), "quotation" (repair quote / invoice), or "irrelevant". Return ONLY valid JSON.`,
          },
          {
            role: "user",
            content: [
              { type: "text" as const, text: `Classify each of the following ${candidates.length} images:` },
              ...imageContent,
            ],
          },
        ],
        response_format: { type: "json_schema", json_schema: { name: "batch_classification", strict: true, schema } },
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), LLM_CLASSIFY_TIMEOUT_MS)),
    ]);

    const content = response.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(typeof content === "string" ? content : JSON.stringify(content));
    for (const item of (parsed.classifications ?? [])) {
      const candidate = candidates[item.image_number - 1];
      if (candidate) result.set(candidate.index, item.class as ImageClass);
    }
  } catch (e) {
    ctx.log("ImageIntelligence", `LLM batch classifier failed: ${String(e)} — treating all as damage_photo`);
    // Conservative fallback: include all ambiguous pages
    for (const c of candidates) result.set(c.index, "damage_photo");
  }

  return result;
}

// ── Perceptual deduplication (simple pixel-hash approach) ─────────────────────
async function computeThumbnailHash(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!response.ok) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    // Resize to 8×8 greyscale, get raw pixels → 64-bit hash string
    const raw = await sharp(buffer).greyscale().resize(8, 8, { fit: "fill" }).raw().toBuffer();
    const mean = raw.reduce((s, v) => s + v, 0) / raw.length;
    return Array.from(raw).map(v => v >= mean ? "1" : "0").join("");
  } catch {
    return null;
  }
}

function hammingDistance(a: string, b: string): number {
  let dist = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] !== b[i]) dist++;
  }
  return dist;
}

// ── Main entry point ──────────────────────────────────────────────────────────
/**
 * Given a list of PDF page image URLs, returns a ranked list of ScoredImage
 * objects representing the pages most likely to contain vehicle damage photos.
 *
 * The returned array is already sorted by qualityScore descending and capped
 * at MAX_DAMAGE_PHOTOS. Pass the .url fields to Stage 6 vision analysis.
 */
export async function selectDamagePhotoPages(
  pageUrls: string[],
  ctx: PipelineContext
): Promise<ScoredImage[]> {
  if (pageUrls.length === 0) return [];

  ctx.log("ImageIntelligence", `Scoring ${pageUrls.length} PDF page(s) for damage photo likelihood`);

  // ── Phase 1: Feature extraction (parallel, deterministic) ─────────────────
  const featureResults = await Promise.all(
    pageUrls.map(async (url, i) => {
      const features = await extractFeatures(url);
      return { url, index: i, features };
    })
  );

  // ── Phase 2: Score and classify ───────────────────────────────────────────
  const scored: Array<ScoredImage & { hash?: string }> = [];
  const ambiguousPool: Array<{ url: string; index: number }> = [];

  for (const { url, index, features } of featureResults) {
    if (!features) {
      // Could not fetch/process — include conservatively
      scored.push({
        url, pageNumber: index + 1, source: "page_render",
        damageLikelihoodScore: 0.5, qualityScore: 0.3,
        confidence: "MEDIUM", classification: "damage_photo",
        features: { textDensity: 0.5, colourVariance: 0.3, edgeDensity: 0.3, blurScore: 0.3, aspectRatio: 1, meanBrightness: 128 },
      });
      ambiguousPool.push({ url, index });
      continue;
    }

    const damageLikelihoodScore = scoreDamageLikelihood(features);
    const qualityScore = damageLikelihoodScore * features.blurScore;

    let confidence: "HIGH" | "MEDIUM" | "LOW";
    let classification: ImageClass;

    if (damageLikelihoodScore >= HIGH_CONFIDENCE_THRESHOLD) {
      confidence = "HIGH";
      classification = "damage_photo";
    } else if (damageLikelihoodScore >= LOW_CONFIDENCE_THRESHOLD) {
      confidence = "MEDIUM";
      classification = "damage_photo"; // tentative — will be refined by LLM
      ambiguousPool.push({ url, index });
    } else {
      confidence = "LOW";
      classification = "document";
    }

    scored.push({
      url, pageNumber: index + 1, source: "page_render",
      damageLikelihoodScore, qualityScore, confidence, classification, features,
    });
  }

  ctx.log(
    "ImageIntelligence",
    `Phase 1 results: ${scored.filter(s => s.confidence === "HIGH").length} HIGH, ` +
    `${ambiguousPool.length} MEDIUM (→ LLM), ` +
    `${scored.filter(s => s.confidence === "LOW").length} LOW`
  );

  // ── Phase 3: LLM batch classification for ambiguous pool ──────────────────
  if (ambiguousPool.length > 0) {
    const llmResults = await classifyAmbiguousPool(ambiguousPool, ctx);
    for (const item of scored) {
      const llmClass = llmResults.get(item.pageNumber - 1);
      if (llmClass) item.classification = llmClass;
    }
  }

  // ── Phase 4: Filter to damage photos only ─────────────────────────────────
  let damagePhotos = scored.filter(s => s.classification === "damage_photo");

  // Fallback: if nothing was classified as damage photo, use top 2 from ambiguous pool
  if (damagePhotos.length === 0) {
    ctx.log("ImageIntelligence", "No damage photos found — using top 2 from ambiguous pool as fallback");
    damagePhotos = scored
      .filter(s => s.confidence === "MEDIUM")
      .sort((a, b) => b.damageLikelihoodScore - a.damageLikelihoodScore)
      .slice(0, 2);
    // If still nothing, return all pages (last resort)
    if (damagePhotos.length === 0) {
      ctx.log("ImageIntelligence", "No candidates at all — returning all pages");
      return scored.sort((a, b) => b.qualityScore - a.qualityScore).slice(0, MAX_DAMAGE_PHOTOS);
    }
  }

  // ── Phase 5: Perceptual deduplication ─────────────────────────────────────
  const hashes = await Promise.all(damagePhotos.map(p => computeThumbnailHash(p.url)));
  const deduplicated: ScoredImage[] = [];
  const seenHashes: string[] = [];

  for (let i = 0; i < damagePhotos.length; i++) {
    const hash = hashes[i];
    if (!hash) {
      deduplicated.push(damagePhotos[i]);
      continue;
    }
    // Check if this image is too similar to any already-kept image (Hamming distance ≤ 8/64)
    const isDuplicate = seenHashes.some(h => hammingDistance(h, hash) <= 8);
    if (!isDuplicate) {
      deduplicated.push(damagePhotos[i]);
      seenHashes.push(hash);
    } else {
      ctx.log("ImageIntelligence", `Dedup: page ${damagePhotos[i].pageNumber} is near-duplicate — skipped`);
    }
  }

  // ── Phase 6: Quality ranking and cap ─────────────────────────────────────
  const final = deduplicated
    .sort((a, b) => b.qualityScore - a.qualityScore)
    .slice(0, MAX_DAMAGE_PHOTOS);

  ctx.log(
    "ImageIntelligence",
    `Final: ${final.length} damage photo page(s) selected from ${pageUrls.length} total pages ` +
    `(pages: ${final.map(f => f.pageNumber).join(", ")})`
  );

  return final;
}
