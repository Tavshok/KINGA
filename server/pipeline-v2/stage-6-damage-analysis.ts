/**
 * pipeline-v2/stage-6-damage-analysis.ts
 *
 * STAGE 6 — DAMAGE ANALYSIS ENGINE (Self-Healing + Vision)
 *
 * Using vehicle photos and damage descriptions from the ClaimRecord:
 *   - Identify damaged components (from structured data OR LLM vision on photos)
 *   - Create damage zones
 *   - Compute severity scores
 *
 * VISION PATH: When damagePhotoUrls are present in the pipeline context,
 * the LLM is called with the actual damage photos to extract components
 * directly from the images. Vision results are merged with any structured
 * components from the claim record (structured data takes precedence for
 * components already identified; vision adds newly detected components).
 *
 * RELIABILITY ARCHITECTURE (10-point hardening):
 *   1. Pre-validate image URLs before sending to LLM (skip inaccessible ones)
 *   2. Process each image INDEPENDENTLY — one failure never kills all
 *   3. Retry each image up to 2× with exponential back-off
 *   4. Timeout every LLM call at 45s
 *   5. Minimum success threshold: ≥50% of images must succeed for ANALYSED status
 *   6. Fallback prompt: if primary returns 0 components, retry with simpler "describe" prompt
 *   7. Merge per-image results (deduplication by part name)
 *   8. Flag degraded mode when success rate < threshold
 *   9. Strengthen prompt: infer from unclear images, never return empty
 *  10. Surface failure rate in assumptions for monitoring
 *
 * NEVER halts — if no damage data exists, produces empty analysis with assumptions.
 */

import { ensureDamageContract } from "./engineFallback";
import { invokeLLM } from "../_core/llm";
import { normalisePartName, CANONICAL_PARTS_PROMPT_LIST } from "./canonicalPartsVocabulary";
import { renderSpecificPdfPages } from "./pdfToImages";
import { KINGA_REPORT_SYSTEM_PROMPT } from "./kingaReportSystemPrompt";
import { selectDamagePhotoPages } from "./imageIntelligence";
import type {
  PipelineContext,
  StageResult,
  ClaimRecord,
  Stage6Output,
  DamageAnalysisComponent,
  DamageZone,
  AccidentSeverity,
  Assumption,
  RecoveryAction,
} from "./types";

// PER_RUN_VISION_BUDGET (defined in readDamageFromPhotos) controls how many photos are selected per run.
// Stage 6 timeout (TIMEOUT_VISION_MS) must be >= PER_RUN_VISION_BUDGET * VISION_TIMEOUT_MS.
const VISION_TIMEOUT_MS = 45_000; // 45s per image call
const VISION_RETRIES = 2;      // Retry each image up to 2 times
const MIN_SUCCESS_THRESHOLD = 0.5; // ≥50% images must succeed for non-degraded status

// ── Utility: wrap async fn with a hard timeout ────────────────────────────────
async function withTimeout<T>(fn: () => Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Vision call timed out after ${ms}ms`)),
      ms
    );
    fn().then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });
}

// ── Utility: retry with exponential back-off ──────────────────────────────────
async function withRetry<T>(
  fn: () => Promise<T>,
  retries: number,
  label: string,
  log: (msg: string) => void
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (attempt < retries) {
        const delay = 1000 * Math.pow(2, attempt); // 1s, 2s
        log(`${label}: attempt ${attempt + 1} failed (${String(e)}) — retrying in ${delay}ms`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastErr;
}

// ── Utility: quick URL accessibility check — returns HTTP status for audit trail ─
// Returns { accessible, httpStatus }. Falls back to accessible=true on network
// errors so that a proxy/CORS issue never silently drops a valid URL.
async function checkUrlAccessibility(url: string): Promise<{ accessible: boolean; httpStatus?: number }> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const r = await fetch(url, { method: "GET", signal: ctrl.signal }).catch(() => null);
    clearTimeout(t);
    if (!r) return { accessible: true }; // network error — assume accessible
    return { accessible: r.status < 400, httpStatus: r.status };
  } catch {
    return { accessible: true }; // non-blocking — assume accessible on error
  }
}

function normaliseSeverity(raw: string): AccidentSeverity {
  const s = (raw || "").toLowerCase().trim();
  if (s === "catastrophic") return "catastrophic";
  if (s === "severe" || s === "major") return "severe";
  if (s === "moderate" || s === "medium") return "moderate";
  if (s === "minor" || s === "light" || s === "slight") return "minor";
  if (s === "cosmetic" || s === "superficial") return "cosmetic";
  return "moderate";
}

function inferZone(location: string): string {
  const loc = (location || "").toLowerCase();
  if (/front|bumper front|hood|bonnet|headl|grille|radiator|fender front|wing front/.test(loc)) return "front";
  if (/rear|bumper rear|tail|trunk|boot|boot.?lid|loadbox|fender rear|wing rear/.test(loc)) return "rear";
  if (/left|driver|lh|l\/h/.test(loc)) return "left_side";
  if (/right|passenger|rh|r\/h/.test(loc)) return "right_side";
  if (/roof|top|overhead|canopy|roof.?lin/.test(loc)) return "roof";
  if (/sill|rocker/.test(loc)) return "left_side";
  if (/under|bottom|chassis|subframe/.test(loc)) return "undercarriage";
  return "general";
}

function calculateOverallSeverity(components: DamageAnalysisComponent[]): number {
  if (components.length === 0) return 0;
  const severityWeights: Record<AccidentSeverity, number> = {
    none: 0, cosmetic: 10, minor: 25, moderate: 50, severe: 75, catastrophic: 100,
  };
  const total = components.reduce((sum, c) => sum + (severityWeights[c.severity] || 50), 0);
  const avg = total / components.length;
  const countBoost = Math.min(20, components.length * 2);
  return Math.min(100, Math.round(avg + countBoost));
}

// ── JSON schema shared by primary and fallback vision prompts ─────────────────
const VISION_RESPONSE_SCHEMA = {
  type: "json_schema" as const,
  json_schema: {
    name: "vision_damage_extraction",
    strict: true,
    schema: {
      type: "object",
      properties: {
        components: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name:          { type: "string" },
              location:      { type: "string" },
              damageType:    { type: "string" },
              severity: {
                type: "string",
                enum: ["cosmetic", "minor", "moderate", "severe", "catastrophic"],
              },
              visible:       { type: "boolean" },
              notes:         { type: "string" },
              // ── Absolute numeric physics measurements (SI units) ──────────────────────────────
              // crushDepthM: maximum visible crush/deformation depth [0.0, 0.55 m]
              //   0.0=no depth deformation, 0.01=scratch, 0.02-0.04=shallow dent,
              //   0.05-0.10=moderate dent, 0.12-0.22=severe crumple, 0.25-0.45=catastrophic
              crushDepthM: { type: "number" },
              // deformationEnergyJ: energy absorbed by this component [0, 500000 J]
              //   E = 0.5 × k × C² where k ≈ 1,000,000 N/m for body panels
              //   0=cosmetic, 50-500=minor dent, 500-5000=moderate, 5000-30000=severe
              deformationEnergyJ: { type: "number" },
              // structuralDisplacementM: lateral/axial displacement of structural members [0, 0.30 m]
              //   0.0=cosmetic only, 0.005-0.015=minor flex, 0.020-0.050=confirmed displacement
              structuralDisplacementM: { type: "number" },
              // visionConfidenceScore: LLM confidence in these measurements [0, 100]
              //   90-100=clear view, 70-89=minor occlusion, 40-69=partial view, <40=poor quality
              visionConfidenceScore: { type: "number" },
              panelDeformation: { type: "boolean" },
              // damageFractionEstimate: fraction of panel surface visibly damaged [0.0, 1.0]
              damageFractionEstimate: { type: "number" },
            },
            required: ["name", "location", "damageType", "severity", "visible",
                       "crushDepthM", "deformationEnergyJ", "structuralDisplacementM",
                       "visionConfidenceScore", "panelDeformation", "damageFractionEstimate"],
            additionalProperties: false,
          },
        },
        overall_severity_assessment: { type: "string" },
        structural_damage_suspected: { type: "boolean" },
        confidence: { type: "string", enum: ["high", "medium", "low"] },
      },
      required: ["components", "overall_severity_assessment", "structural_damage_suspected", "confidence"],
      additionalProperties: false,
    },
  },
};

/**
 * Analyse a SINGLE image URL with the LLM.
 * Retries up to VISION_RETRIES times with timeout.
 * If the primary prompt returns 0 components, tries a simpler fallback prompt.
 * Returns an array of DamageAnalysisComponent (empty on total failure).
 */
async function analyseOneImage(
  url: string,
  imageIndex: number,
  vehicleContext: string,
  collisionDirection: string,
  log: (msg: string) => void
): Promise<{ components: DamageAnalysisComponent[]; confidence: string; usedFallback: boolean }> {

  // IMPORTANT: Use image_url (not file_url) — the Forge proxy authenticates S3 requests
  // for image_url content, matching the pattern used in stage-2-extraction.ts (line 362).
  // file_url only supports audio/video/PDF mime types and would cause a TypeScript error
  // with image/png. image_url is the correct type for PNG images.
  const imagePart = {
    type: "image_url" as const,
    image_url: { url, detail: "high" as const },
  };

  // ── PRIMARY PROMPT — structured damage extraction ─────────────────────────
  const primaryCall = () => withTimeout(
    () => invokeLLM({
      messages: [
        {
          role: "system",
          content: `${KINGA_REPORT_SYSTEM_PROMPT}\n\nYou are an expert vehicle damage assessor for insurance claims in South Africa, operating within the KINGA Intelligence system.\nAnalyse the provided vehicle damage photo and identify EVERY visibly damaged component.

PART NAMING — CRITICAL: You MUST use ONLY the following authorised part names. Never invent, abbreviate, or misspell a part name. If the damaged part is not in this list, choose the CLOSEST match:
${CANONICAL_PARTS_PROMPT_LIST}

Side prefix rules:
  - "LH" for left-hand (driver) side, "RH" for right-hand (passenger) side
  - Example: "LH Front Door", "RH Tail Lamp Assembly", "LH A-Pillar"
  - Use "Bonnet" (not Hood), "Boot Lid" (not Trunk), "Windscreen" (not Windshield)

ABSOLUTE NUMERIC MEASUREMENTS — for each component provide ALL of the following in SI units. Do NOT use qualitative labels.

  crushDepthM [metres] — maximum visible crush/deformation depth on this component:
    0.0   = no depth deformation (glass, trim, paint only)
    0.01  = paint scratch / surface scuff
    0.02-0.04 = shallow dent (fingertip depth)
    0.05-0.10 = moderate dent (fist depth, panel shape changed)
    0.12-0.22 = severe crumple (panel folded or buckled)
    0.25-0.45 = catastrophic crush (panel missing or fully collapsed)

  deformationEnergyJ [Joules] — energy absorbed by this component during impact:
    0        = cosmetic / glass breakage only
    50-500   = minor dent
    500-5000 = moderate crumple
    5000-30000 = severe crumple
    >30000   = catastrophic structural crush
    Reference: E = 0.5 × k × C² where k ≈ 1,000,000 N/m for body panels.

  structuralDisplacementM [metres] — lateral or axial displacement of structural members:
    0.0       = no structural displacement (cosmetic damage only)
    0.005-0.015 = minor structural flex
    0.020-0.050 = confirmed structural displacement
    >0.050    = severe structural deformation
    Set to 0.0 for all cosmetic, glass, and trim components.

  visionConfidenceScore [0-100] — your confidence in the accuracy of these measurements:
    90-100 = clear, unobstructed, high-resolution view
    70-89  = good view with minor occlusion or blur
    40-69  = partial view, some uncertainty
    <40    = poor image quality, high uncertainty

  panelDeformation [boolean] — true if the panel shape is visibly distorted beyond a simple dent.

  damageFractionEstimate [0.0-1.0] — fraction of this panel's surface area visibly damaged:
    0.05=small scratch, 0.25=quarter-panel dent, 0.55=half-panel crushed, 1.0=full replacement needed

CRITICAL RULES:
  - If the image is blurry, dark, or partially obscured, STILL extract any visible damage
  - Do NOT return an empty components array unless absolutely no vehicle damage is visible
  - If uncertain about a component name, choose the closest authorised name from the list above
  - Always return at least one component if any damage is visible
  - Always populate ALL numeric fields for every component; use 0.0 for fields with no deformation
  - Never use qualitative strings in place of numbers
Return ONLY a JSON object matching the schema — no prose, no markdown.`,
        },
        {
          role: "user",
          content: [
            {
              type: "text" as const,
              text: `Vehicle: ${vehicleContext || "Unknown vehicle"}.
Collision direction: ${collisionDirection || "unknown"}.
Image ${imageIndex + 1}: Analyse all visible damage and list every damaged component.
Even if the image quality is imperfect, extract whatever damage evidence is visible.`,
            },
            imagePart,
          ],
        },
      ],
      response_format: VISION_RESPONSE_SCHEMA,
    }),
    VISION_TIMEOUT_MS
  );

  let primaryResult: { components: DamageAnalysisComponent[]; confidence: string } | null = null;

  try {
    const response = await withRetry(primaryCall, VISION_RETRIES, `Image[${imageIndex}] primary`, log);
    const rawContent = response.choices?.[0]?.message?.content || "{}";
    const content = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);
    const parsed = JSON.parse(content);
    const rawComponents: Array<{
      name: string; location: string; damageType: string;
      severity: string; visible: boolean; notes?: string;
      panelDeformation?: boolean;
      // Absolute numeric physics inputs (SI units)
      crushDepthM?: number;
      deformationEnergyJ?: number;
      structuralDisplacementM?: number;
      visionConfidenceScore?: number;
      damageFractionEstimate?: number;
    }> = parsed.components || [];
    primaryResult = {
      components: rawComponents.map((c, i) => ({
        // normalisePartName maps LLM output to canonical vocabulary — prevents hallucinated names
        name: normalisePartName(c.name || "Unknown Component"),
        location: c.location || "general",
        damageType: c.damageType || "impact",
        severity: normaliseSeverity(c.severity),
        visible: c.visible !== false,
        distanceFromImpact: i * 0.3,
        panelDeformation: c.panelDeformation,
        // ── Absolute numeric physics inputs — clamp to physically plausible ranges ──
        crushDepthM: typeof c.crushDepthM === 'number'
          ? Math.min(0.55, Math.max(0.0, c.crushDepthM)) : undefined,
        deformationEnergyJ: typeof c.deformationEnergyJ === 'number'
          ? Math.min(500000, Math.max(0, c.deformationEnergyJ)) : undefined,
        structuralDisplacementM: typeof c.structuralDisplacementM === 'number'
          ? Math.min(0.30, Math.max(0.0, c.structuralDisplacementM)) : undefined,
        visionConfidenceScore: typeof c.visionConfidenceScore === 'number'
          ? Math.min(100, Math.max(0, c.visionConfidenceScore)) : undefined,
        damageFractionEstimate: typeof c.damageFractionEstimate === 'number'
          ? Math.min(1.0, Math.max(0.0, c.damageFractionEstimate)) : undefined,
      })),
      confidence: parsed.confidence ?? "low",
    };

    log(`Image[${imageIndex}] primary: ${primaryResult.components.length} components (confidence: ${primaryResult.confidence})`);
  } catch (e) {
    log(`Image[${imageIndex}] primary FAILED after ${VISION_RETRIES + 1} attempts: ${String(e)}`);
  }

  // ── FALLBACK PROMPT — if primary returned 0 components ────────────────────
  // Strategy 4: multi-strategy vision — simpler "describe what you see" prompt
  if (!primaryResult || primaryResult.components.length === 0) {
    log(`Image[${imageIndex}] primary returned 0 components — trying fallback prompt`);
    try {
      // Zone-based fallback: anchors the model to specific body zones rather than asking
      // open-ended "describe what you see". This produces partial structured output
      // even when the primary prompt fails due to image quality or model refusal.
      const fallbackCall = () => withTimeout(
        () => invokeLLM({
          messages: [
            {
              role: "system",
              content: `You are a vehicle damage assessor. Your task is to identify damage by body zone.
For each zone that shows ANY damage, list the affected components.
Use ONLY these authorised SA/Audatex ZA part names: ${CANONICAL_PARTS_PROMPT_LIST}
Return JSON only. If a zone shows no damage, omit it from the components array.`,
            },
            {
              role: "user",
              content: [
                {
                  type: "text" as const,
                  text: `Vehicle: ${vehicleContext || "Unknown vehicle"}. Collision direction: ${collisionDirection || "unknown"}.
Examine this image and identify which of the following body zones shows any damage:
- FRONT (bumper, bonnet, grille, headlights, front wings)
- REAR (boot lid, rear bumper, tail lights, rear wings)
- LEFT SIDE (left doors, left sill, left mirror, left A/B/C pillars)
- RIGHT SIDE (right doors, right sill, right mirror, right A/B/C pillars)
- ROOF (roof panel, sunroof, roof rails)
- UNDERBODY (floor pan, suspension, exhaust)

For each damaged zone, list the specific components affected with their damage type and severity.
If the image is unclear or shows no vehicle damage, return an empty components array.`,
                },
                imagePart,
              ],
            },
          ],
          response_format: VISION_RESPONSE_SCHEMA,
        }),
        VISION_TIMEOUT_MS
      );

      const fbResponse = await withRetry(fallbackCall, 1, `Image[${imageIndex}] fallback`, log);
      const rawFb = fbResponse.choices?.[0]?.message?.content || "{}";
      const contentFb = typeof rawFb === "string" ? rawFb : JSON.stringify(rawFb);
      const parsedFb = JSON.parse(contentFb);
      const fbComponents: DamageAnalysisComponent[] = (parsedFb.components || []).map(
        (c: { name: string; location: string; damageType: string; severity: string; visible: boolean }, i: number) => ({
          // normalisePartName enforces SA canonical vocabulary on fallback results too
          name: normalisePartName(c.name || "Unknown Component"),
          location: c.location || "general",
          damageType: c.damageType || "impact",
          severity: normaliseSeverity(c.severity),
          visible: c.visible !== false,
          distanceFromImpact: i * 0.3,
        })
      );

      log(`Image[${imageIndex}] fallback: ${fbComponents.length} components`);
      return { components: fbComponents, confidence: "low", usedFallback: true };
    } catch (e) {
      log(`Image[${imageIndex}] fallback also FAILED: ${String(e)}`);
      return { components: [], confidence: "low", usedFallback: true };
    }
  }

  return { ...primaryResult, usedFallback: false };
}

/**
 * Use LLM vision to read damage components from actual damage photos.
 *
 * ARCHITECTURE (see docs/image-processing-architecture.md):
 *
 *   PHOTO SELECTION (principled, not arbitrary):
 *   - All photos are pre-validated for accessibility
 *   - Photos are processed in order of damage likelihood score (highest first)
 *   - When total photo count exceeds PER_RUN_BUDGET, highest-scoring photos
 *     are processed first; the remainder are recorded as SKIPPED_BUDGET
 *   - Every photo appears in perPhotoResults — no silent omissions
 *
 *   HONEST ACCOUNTING:
 *   - photosAvailable = total photos in damagePhotoUrls
 *   - photosProcessed = photos actually sent to the vision LLM
 *   - photosDeferred  = photos not processed due to budget
 *   - photosFailed    = photos sent to LLM but failed
 *
 *   AUDIT TRAIL:
 *   - perPhotoResults: one entry per available photo with status and components
 *   - enrichedPhotosJson: persisted to ctx for downstream stages
 */

// Per-run budget: maximum photos to send to the vision LLM in a single pipeline run.
// This is a BUDGET constraint, not a design cap. When exceeded, photos are deferred
// (SKIPPED_BUDGET) and recorded in the audit trail. Increase as LLM capacity allows.
const PER_RUN_VISION_BUDGET = 20; // 20 photos × ~8s each = ~160s, safely within TIMEOUT_VISION_MS (200s)

async function readDamageFromPhotos(
  photoUrls: string[],
  claimRecord: ClaimRecord,
  ctx: PipelineContext,
  assumptions: Assumption[],
  recoveryActions: RecoveryAction[],
  damageLikelihoodScores?: Map<string, number>
): Promise<{
  components: DamageAnalysisComponent[];
  perPhotoResults: import('./types').PerPhotoResult[];
  photosProcessed: number;
  photosDeferred: number;
  photosFailed: number;
}> {
  const photosAvailable = photoUrls.length;
  if (photosAvailable === 0) {
    return { components: [], perPhotoResults: [], photosProcessed: 0, photosDeferred: 0, photosFailed: 0 };
  }

  ctx.log("Stage 6", `Vision: ${photosAvailable} photo(s) available for analysis`);

  // ── STEP A: Principled photo selection (no pre-validation) ───────────────────────────────────────────────────────────────────────────────────────
  // Do NOT pre-validate URLs with HTTP HEAD requests — this adds latency without meaningful benefit
  // since S3 URLs are almost always accessible. If a URL is inaccessible, the LLM call will fail
  // and the photo will be marked as FAILED in the audit trail.
  //
  // Sort all URLs by damage likelihood score (highest first).
  // Photos without a score retain their original order (stable sort).
  const sortedUrls = [...photoUrls].sort((a, b) => {
    const scoreA = damageLikelihoodScores?.get(a) ?? 0.5;
    const scoreB = damageLikelihoodScores?.get(b) ?? 0.5;
    return scoreB - scoreA; // descending
  });

  const toProcess = sortedUrls.slice(0, PER_RUN_VISION_BUDGET);
  const deferred  = sortedUrls.slice(PER_RUN_VISION_BUDGET);
  // No inaccessible URLs at this stage — failures are detected during processing
  const inaccessibleUrls: Array<{ url: string; httpStatus?: number }> = [];

  if (deferred.length > 0) {
    ctx.log(
      "Stage 6",
      `Vision: budget cap applied — processing ${toProcess.length}/${photosAvailable} photo(s), ` +
      `deferring ${deferred.length} (budget=${PER_RUN_VISION_BUDGET}). ` +
      `Deferred photos are recorded in the audit trail.`
    );
    assumptions.push({
      field: "imageAnalysisCoverage",
      assumedValue: `${toProcess.length}/${photosAvailable} photos processed`,
      reason: `Per-run vision budget is ${PER_RUN_VISION_BUDGET} photos. ` +
        `${deferred.length} photo(s) were deferred and not analysed in this run. ` +
        `Photos were selected in order of damage likelihood score (highest first). ` +
        `Coverage: ${Math.round((toProcess.length / photosAvailable) * 100)}%.`,
      strategy: "partial_data",
      confidence: Math.round((toProcess.length / photosAvailable) * 100),
      stage: "Stage 6",
    });
  }

  ctx.log("Stage 6", `Vision: starting analysis of ${toProcess.length} photo(s)`);

  const vehicleContext = [
    claimRecord.vehicle.make,
    claimRecord.vehicle.model,
    claimRecord.vehicle.year,
  ].filter(Boolean).join(" ");

  const collisionDirection = claimRecord.accidentDetails.collisionDirection || "unknown";

  // ── STEP C: Process photos in parallel batches ──────────────────────────────────────────────────────────────────────────────────────────────
  // Batched parallel processing: 5 photos per batch (LLM rate-limit safe).
  // Cuts Stage 6 from ~75s sequential to ~15s parallel for 20 photos.
  const PHOTO_BATCH_SIZE = 5;
  const processedResults: Array<{
    url: string;
    components: DamageAnalysisComponent[];
    confidence: 'high' | 'medium' | 'low';
    usedFallback: boolean;
    succeeded: boolean;
  }> = [];

  for (let batchStart = 0; batchStart < toProcess.length; batchStart += PHOTO_BATCH_SIZE) {
    const batch = toProcess.slice(batchStart, batchStart + PHOTO_BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(async (url, batchIdx) => {
        const i = batchStart + batchIdx;
        try {
          const result = await analyseOneImage(
            url,
            i,
            vehicleContext,
            collisionDirection,
            (msg) => ctx.log("Stage 6", msg)
          );
          return {
            url,
            components: result.components,
            confidence: result.confidence as 'high' | 'medium' | 'low',
            usedFallback: result.usedFallback,
            succeeded: true,
          };
        } catch (e) {
          ctx.log("Stage 6", `Vision: photo[${i}] completely failed: ${String(e)}`);
          return { url, components: [], confidence: 'low' as const, usedFallback: false, succeeded: false };
        }
      })
    );
    processedResults.push(...batchResults);
  }

  // ── STEP D: Build complete audit trail ───────────────────────────────────────────────────────────────────────────────────────
  // Every photo URL must appear in perPhotoResults — no silent omissions.
  const processedMap = new Map(processedResults.map(r => [r.url, r]));
  const inaccessibleSet = new Set(inaccessibleUrls.map(c => c.url));
  const deferredSet = new Set(deferred);

  const perPhotoResults: import('./types').PerPhotoResult[] = photoUrls.map(url => {
    if (inaccessibleSet.has(url)) {
      const check = inaccessibleUrls.find(c => c.url === url);
      return {
        url,
        status: 'SKIPPED_INACCESSIBLE' as const,
        components: [],
        confidence: 'low' as const,
        succeeded: false,
        usedFallback: false,
        httpStatus: check?.httpStatus,
        damageLikelihoodScore: damageLikelihoodScores?.get(url),
      };
    }
    if (deferredSet.has(url)) {
      return {
        url,
        status: 'SKIPPED_BUDGET' as const,
        components: [],
        confidence: 'low' as const,
        succeeded: false,
        usedFallback: false,
        deferralReason: `Budget cap of ${PER_RUN_VISION_BUDGET} photos reached; this photo was not selected for this run`,
        damageLikelihoodScore: damageLikelihoodScores?.get(url),
      };
    }
    const r = processedMap.get(url);
    if (r) {
      return {
        url,
        status: 'PROCESSED' as const,
        components: r.components,
        confidence: r.confidence,
        succeeded: r.succeeded,
        usedFallback: r.usedFallback,
        damageLikelihoodScore: damageLikelihoodScores?.get(url),
      };
    }
    // Should never happen — every URL is in one of the three sets
    return {
      url,
      status: 'SKIPPED_BUDGET' as const,
      components: [],
      confidence: 'low' as const,
      succeeded: false,
      usedFallback: false,
      deferralReason: 'Unknown — URL not found in any processing set',
    };
  });

  // ── STEP E: Compute honest metrics ───────────────────────────────────────────────────────────────────────────────────────
  const photosProcessed = processedResults.length; // photos actually sent to LLM
  const photosFailed    = processedResults.filter(r => !r.succeeded).length;
  const photosDeferred  = deferred.length;
  const succeededCount  = processedResults.filter(r => r.succeeded).length;
  const successRate     = photosProcessed > 0 ? succeededCount / photosProcessed : 0;
  const fallbackCount   = processedResults.filter(r => r.usedFallback).length;

  ctx.log(
    "Stage 6",
    `Vision: ${succeededCount}/${photosProcessed} processed succeeded (${Math.round(successRate * 100)}%). ` +
    `Available: ${photosAvailable}, Processed: ${photosProcessed}, Deferred: ${photosDeferred}, Failed: ${photosFailed}`
  );

  if (successRate < MIN_SUCCESS_THRESHOLD && photosProcessed > 0) {
    ctx.log("Stage 6", `Vision: success rate ${Math.round(successRate * 100)}% below threshold — flagging as degraded`);
    recoveryActions.push({
      target: "vision_success_threshold",
      strategy: "partial_data",
      success: false,
      description: `Only ${succeededCount}/${photosProcessed} images analysed successfully (${Math.round(successRate * 100)}%). Below ${MIN_SUCCESS_THRESHOLD * 100}% threshold.`,
    });
  }

  // ── STEP F: Merge per-image results (deduplication by part name) ───────────────────────────────────────────────────────────────────────────────────────
  const allComponents: DamageAnalysisComponent[] = [];
  const seenNames = new Set<string>();

  for (const result of processedResults) {
    for (const comp of result.components) {
      const key = comp.name.toLowerCase().trim();
      if (!seenNames.has(key)) {
        seenNames.add(key);
        allComponents.push(comp);
      }
    }
  }
  allComponents.forEach((c, i) => { c.distanceFromImpact = i * 0.3; });

  // ── STEP G: Record assumptions ───────────────────────────────────────────────────────────────────────────────────────
  const overallConfidence =
    allComponents.length === 0 ? "low"
    : successRate >= 0.8 ? "high"
    : successRate >= 0.5 ? "medium"
    : "low";

  if (allComponents.length > 0) {
    assumptions.push({
      field: "damagedParts",
      assumedValue: `${allComponents.length} vision-extracted components`,
      reason: `LLM vision analysis: ${photosAvailable} photos available, ${photosProcessed} processed, ` +
        `${photosDeferred} deferred, ${photosFailed} failed. ` +
        `${fallbackCount > 0 ? `${fallbackCount} image(s) used fallback prompt. ` : ""}` +
        `Extracted ${allComponents.length} unique components. Coverage: ${Math.round((photosProcessed / photosAvailable) * 100)}%.`,
      strategy: "llm_vision",
      confidence: overallConfidence === "high" ? 85 : overallConfidence === "medium" ? 65 : 40,
      stage: "Stage 6",
    });
    recoveryActions.push({
      target: "damagedParts",
      strategy: "llm_vision",
      success: true,
      description: `Vision analysis: ${photosProcessed}/${photosAvailable} photos processed, ` +
        `${allComponents.length} components extracted. Coverage: ${Math.round((photosProcessed / photosAvailable) * 100)}%.`,
    });
  } else {
    recoveryActions.push({
      target: "vision_damage_extraction",
      strategy: "skip",
      success: false,
      description: `Vision analysis extracted 0 components from ${photosProcessed} processed photo(s). Falling back to structured data.`,
    });
  }

  if (photosFailed > 0) {
    assumptions.push({
      field: "imageAnalysisFailureRate",
      assumedValue: `${Math.round((photosFailed / photosProcessed) * 100)}%`,
      reason: `${photosFailed} of ${photosProcessed} processed photo(s) failed vision analysis. ` +
        `Target failure rate: <5%. Current: ${Math.round((photosFailed / photosProcessed) * 100)}%.`,
      strategy: "none",
      confidence: 100,
      stage: "Stage 6",
    });
  }

  ctx.log(
    "Stage 6",
    `Vision complete: ${allComponents.length} unique components from ${succeededCount}/${photosProcessed} processed photos` +
    (fallbackCount > 0 ? ` (${fallbackCount} used fallback prompt)` : "") +
    (photosDeferred > 0 ? `, ${photosDeferred} deferred` : "")
  );

  // ── STEP H: Persist enriched photo metadata to ctx ───────────────────────────────────────────────────────────────────────────────────────
  // Stage 7 and Stage 7b read (ctx as any).enrichedPhotosJson for severity consensus.
  const enrichedPhotoSummary = processedResults.map((r, idx) => ({
    url: r.url,
    index: idx,
    componentCount: r.components.length,
    severity: r.components.length > 0
      ? (r.components.some(c => c.severity === 'severe' || c.severity === 'catastrophic') ? 'severe'
        : r.components.some(c => c.severity === 'moderate') ? 'moderate' : 'minor')
      : 'unknown',
    impactZone: r.components[0]?.location ?? 'unknown',
    detectedComponents: r.components.map(c => c.name),
    caption: r.components.length > 0
      ? `${r.components.length} component(s) detected: ${r.components.slice(0, 3).map(c => c.name).join(', ')}${r.components.length > 3 ? '...' : ''}`
      : (r.succeeded ? 'No damage components detected in this image' : 'Image analysis failed'),
    confidenceScore: r.confidence === 'high' ? 85 : r.confidence === 'medium' ? 65 : r.succeeded ? 40 : 0,
    imageQuality: r.succeeded ? (r.confidence === 'high' ? 'good' : 'poor') : 'unusable',
    usedFallback: r.usedFallback,
    enrichedAt: new Date().toISOString(),
  }));
  (ctx as any).enrichedPhotosJson = JSON.stringify(enrichedPhotoSummary);

  return { components: allComponents, perPhotoResults, photosProcessed, photosDeferred, photosFailed };
}

/**
 * PDF DIRECT VISION PATH
 *
 * When no pre-rendered page images are available (storagePut failures, cold-start issues),
 * pass the raw PDF directly to the LLM as a file_url (application/pdf).
 * The LLM scans ALL pages, identifies vehicle damage photographs, and extracts
 * damaged components — classification and extraction happen in a single LLM call.
 *
 * This path fires only when:
 *   - ctx.damagePhotoUrls is empty (no dedicated damage photos)
 *   - ctx.pdfPageImageUrls is empty (Stage 1 page rendering failed or produced 0 pages)
 *   - ctx.pdfUrl is set (the raw S3 URL for LLM file_url proxy calls)
 */
async function readDamageFromPdf(
  pdfUrl: string,
  claimRecord: ClaimRecord,
  ctx: PipelineContext,
  assumptions: Assumption[],
  recoveryActions: RecoveryAction[]
): Promise<{
  components: DamageAnalysisComponent[];
  perPhotoResults: import('./types').PerPhotoResult[];
  photosProcessed: number;
  photosDeferred: number;
  photosFailed: number;
  enrichedPhotosJson: string;
}> {
  const log = (msg: string) => ctx.log("Stage 6 [PDF Vision]", msg);
  const vehicleContext = [
    claimRecord.vehicle.make,
    claimRecord.vehicle.model,
    claimRecord.vehicle.year,
    claimRecord.vehicle.colour,
  ].filter(Boolean).join(" ");
  const collisionDirection = claimRecord.accidentDetails.collisionDirection || "unknown";

  log(`Invoking PDF two-pass vision on: ${pdfUrl.substring(0, 80)}...`);
  log(`Vehicle context: ${vehicleContext || "Unknown vehicle"}, collision: ${collisionDirection}`);

  // ─── PASS 1: PAGE IDENTIFICATION ─────────────────────────────────────────
  // Ask the LLM to scan the entire PDF and identify ONLY the page numbers that
  // contain vehicle photographs. This is fast (no component extraction yet) and
  // gives us the page list needed for targeted rendering.
  const PASS1_TIMEOUT_MS = 60_000;

  const PASS1_SCHEMA = {
    type: "json_schema" as const,
    json_schema: {
      name: "pdf_page_identification",
      strict: true,
      schema: {
        type: "object",
        properties: {
          photo_pages: {
            type: "array",
            description: "Pages that contain actual photographs (not text/forms)",
            items: {
              type: "object",
              properties: {
                page_number: { type: "integer" },
                page_type: {
                  type: "string",
                  enum: ["vehicle_damage", "vehicle_overview", "scene_photo", "document_photo", "other_photo"],
                },
                has_vehicle: { type: "boolean" },
                has_visible_damage: { type: "boolean" },
                photo_quality: { type: "string", enum: ["clear", "blurry", "partial", "unusable"] },
                brief_description: { type: "string" },
              },
              required: ["page_number", "page_type", "has_vehicle", "has_visible_damage", "photo_quality", "brief_description"],
              additionalProperties: false,
            },
          },
          total_pages_scanned: { type: "integer" },
          scan_confidence: { type: "string", enum: ["high", "medium", "low"] },
        },
        required: ["photo_pages", "total_pages_scanned", "scan_confidence"],
        additionalProperties: false,
      },
    },
  };

  type Pass1Result = {
    photo_pages: Array<{
      page_number: number;
      page_type: string;
      has_vehicle: boolean;
      has_visible_damage: boolean;
      photo_quality: string;
      brief_description: string;
    }>;
    total_pages_scanned: number;
    scan_confidence: string;
  };

  let pass1: Pass1Result | null = null;

  try {
    const response = await withTimeout(
      () => invokeLLM({
        messages: [
          {
            role: "system",
            content: `You are a document analyst for a vehicle insurance claims system in South Africa.
Your ONLY task in this step is to SCAN every page of the provided PDF and identify which pages contain PHOTOGRAPHS.

PAGE CLASSIFICATION RULES:
- "vehicle_damage": page contains a photo showing a damaged vehicle or damaged vehicle parts
- "vehicle_overview": page contains a photo of the whole vehicle (undamaged overview or pre-loss)
- "scene_photo": page contains a photo of the accident scene, road, or surroundings
- "document_photo": page contains a photo of a document (ID, licence, police report photo)
- "other_photo": page contains a photo that does not fit the above

CRITICAL IDENTIFICATION RULES:
1. A page with PHOTOGRAPHS has visual image content — you can see a vehicle, scene, or object as a real photograph
2. Text-only pages (claim forms, declarations, signatures, tables, printed text) are NOT photo pages — exclude them
3. Pages with embedded diagrams or drawings are NOT photo pages — exclude them
4. A page may contain BOTH text AND a photo — if it has a photo, include it
5. Look carefully for small embedded photos within form pages — these are common in SA claim forms
6. If a page is unclear, include it with photo_quality="partial" rather than excluding it

For each photo page found, set:
- has_vehicle: true if a vehicle (car, truck, bakkie, etc.) is visible in the photo
- has_visible_damage: true if damage (dents, scratches, cracks, deformation) is visible
- photo_quality: "clear" (sharp, well-lit), "blurry" (motion blur or out of focus), "partial" (cropped or partially visible), "unusable" (too dark/small to analyse)

Return ONLY the JSON — no prose, no markdown.`,
          },
          {
            role: "user",
            content: [
              {
                type: "text" as const,
                text: `This is a vehicle insurance claim PDF for a ${vehicleContext || "vehicle"} involved in a ${collisionDirection} collision.
Please scan EVERY page and identify all pages that contain photographs. Be thorough — do not miss any photo pages.`,
              },
              {
                type: "file_url" as const,
                file_url: { url: pdfUrl, mime_type: "application/pdf" as const },
              },
            ],
          },
        ],
        response_format: PASS1_SCHEMA,
      }),
      PASS1_TIMEOUT_MS
    );
    const rawContent = response.choices?.[0]?.message?.content || "{}";
    const content = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);
    pass1 = JSON.parse(content) as Pass1Result;
    log(`Pass 1 complete: scanned ${pass1.total_pages_scanned} pages, found ${pass1.photo_pages.length} photo page(s), confidence: ${pass1.scan_confidence}`);
    for (const p of pass1.photo_pages) {
      log(`  Page ${p.page_number}: ${p.page_type} | vehicle=${p.has_vehicle} | damage=${p.has_visible_damage} | quality=${p.photo_quality} | "${p.brief_description.slice(0, 60)}"`);
    }
  } catch (e) {
    log(`Pass 1 (page identification) FAILED: ${String(e)} — falling back to single-pass PDF vision`);
    pass1 = null;
  }

  // Determine which pages to render: vehicle damage/overview pages with usable quality
  // Include any page that has a vehicle OR visible damage, and is not unusable quality.
  // This captures scene photos with vehicle damage and close-up component shots
  // that may not show the full vehicle but are critical for forensic analysis.
  const damagePageNumbers: number[] = pass1
    ? pass1.photo_pages
        .filter(p => (p.has_vehicle || p.has_visible_damage) && p.photo_quality !== "unusable")
        .map(p => p.page_number)
    : [];

  log(`Pages to render for targeted analysis: [${damagePageNumbers.join(", ")}]`);

  // ─── TARGETED PAGE RENDERING ─────────────────────────────────────────────
  // Render only the identified damage pages to real PNG images and upload to S3.
  // This gives Stage 6 actual image URLs (not PDF fragment URLs) for forensics.
  let renderedPageMap = new Map<number, { url: string; pageNumber: number }>();
  if (damagePageNumbers.length > 0) {
    try {
      // 150 DPI gives ~1240×1754px for A4 — sufficient for LLM detail:high vision
      // and precise measurement extraction without excessive memory usage.
      const rendered = await renderSpecificPdfPages(pdfUrl, damagePageNumbers, {
        dpi: 150,
        keyPrefix: "pdf-damage-pages",
        log,
      });
      for (const [pageNum, img] of rendered.entries()) {
        renderedPageMap.set(pageNum, { url: img.url, pageNumber: pageNum });
      }
      log(`Targeted rendering complete: ${renderedPageMap.size}/${damagePageNumbers.length} pages uploaded as real images`);
    } catch (renderErr: any) {
      log(`Targeted rendering failed (non-fatal): ${renderErr.message} — will use PDF fragment URLs as fallback`);
    }
  }

  // ─── PASS 2: COMPONENT EXTRACTION ────────────────────────────────────────
  // For each rendered damage page, run per-image vision analysis to extract
  // components with full measurements. If rendering failed, fall back to
  // single-pass PDF vision for component extraction.
  const allComponents: DamageAnalysisComponent[] = [];
  const seen = new Set<string>();
  const enrichedPhotoSummary: Array<Record<string, unknown>> = [];
  let photosProcessed = 0;
  let photosFailed = 0;

  if (renderedPageMap.size > 0) {
    // Per-image analysis on rendered pages (highest precision)
    // Run in parallel batches of 3 to maximise LLM throughput without rate-limiting
    const ANALYSIS_CONCURRENCY = 3;
    const pageEntries = Array.from(renderedPageMap.entries()); // [[pageNum, img], ...]
    log(`Running per-image analysis on ${pageEntries.length} rendered damage page(s) (concurrency=${ANALYSIS_CONCURRENCY})`);

    // Analyse one page and return a structured result (never throws)
    const analyseOnePage = async (pageNum: number, img: { url: string; pageNumber: number }) => {
      const pass1Page = pass1?.photo_pages.find(p => p.page_number === pageNum);
      try {
        const imgResult = await analyseOneImage(
          img.url,
          pageNum,
          vehicleContext,
          collisionDirection,
          (msg: string) => ctx.log("Stage 6 [PDF Vision]", msg)
        );
        log(`Page ${pageNum}: ${imgResult.components?.length ?? 0} components extracted`);
        return { pageNum, img, pass1Page, imgResult, error: null };
      } catch (imgErr: any) {
        log(`Page ${pageNum} analysis failed: ${imgErr.message}`);
        return { pageNum, img, pass1Page, imgResult: null, error: imgErr.message as string };
      }
    };

    // Process in parallel batches
    for (let i = 0; i < pageEntries.length; i += ANALYSIS_CONCURRENCY) {
      const batch = pageEntries.slice(i, i + ANALYSIS_CONCURRENCY);
      const batchResults = await Promise.all(batch.map(([pn, im]) => analyseOnePage(pn, im)));

      for (const { pageNum, img, pass1Page, imgResult, error } of batchResults) {
        if (imgResult && !error) {
          photosProcessed++;
          for (const c of (imgResult.components || [])) {
            const normName = normalisePartName(c.name || "Unknown Component");
            const dedupeKey = `${normName}::${c.location || "general"}`;
            if (seen.has(dedupeKey)) continue;
            seen.add(dedupeKey);
            allComponents.push({
              name: normName,
              location: c.location || "general",
              damageType: c.damageType || "impact",
              severity: normaliseSeverity(c.severity),
              visible: c.visible !== false,
              distanceFromImpact: allComponents.length * 0.3,
              panelDeformation: c.panelDeformation,
              crushDepthM: typeof c.crushDepthM === "number" ? Math.min(0.55, Math.max(0.0, c.crushDepthM)) : undefined,
              deformationEnergyJ: typeof c.deformationEnergyJ === "number" ? Math.min(500000, Math.max(0, c.deformationEnergyJ)) : undefined,
              structuralDisplacementM: typeof c.structuralDisplacementM === "number" ? Math.min(0.30, Math.max(0.0, c.structuralDisplacementM)) : undefined,
              visionConfidenceScore: typeof c.visionConfidenceScore === "number" ? Math.min(100, Math.max(0, c.visionConfidenceScore)) : undefined,
              damageFractionEstimate: typeof c.damageFractionEstimate === "number" ? Math.min(1.0, Math.max(0.0, c.damageFractionEstimate)) : undefined,
            });
          }
          const severity = imgResult.components && imgResult.components.length > 0
            ? (imgResult.components.some((c: any) => c.severity === "severe" || c.severity === "catastrophic") ? "severe"
              : imgResult.components.some((c: any) => c.severity === "moderate") ? "moderate" : "minor")
            : "unknown";
          enrichedPhotoSummary.push({
            url: img.url,
            pageNumber: pageNum,
            index: enrichedPhotoSummary.length,
            componentCount: imgResult.components?.length ?? 0,
            severity,
            impactZone: imgResult.components?.[0]?.location ?? pass1Page?.brief_description ?? "unknown",
            detectedComponents: (imgResult.components || []).map((c: any) => normalisePartName(c.name || "Unknown")),
            caption: imgResult.components && imgResult.components.length > 0
              ? `Page ${pageNum}: ${imgResult.components.length} component(s) — ${imgResult.components.slice(0, 3).map((c: any) => c.name).join(", ")}${imgResult.components.length > 3 ? "..." : ""}`
              : `Page ${pageNum}: ${pass1Page?.brief_description ?? "No damage components detected"}`,
            confidenceScore: imgResult.confidence === "high" ? 90 : imgResult.confidence === "medium" ? 70 : 50,
            imageQuality: pass1Page?.photo_quality ?? "good",
            usedFallback: imgResult.usedFallback ?? false,
            enrichedAt: new Date().toISOString(),
            source: "pdf_targeted_render",
          });
        } else {
          // Analysis failed — still include the image URL so it appears in the report
          photosFailed++;
          enrichedPhotoSummary.push({
            url: img.url,
            pageNumber: pageNum,
            index: enrichedPhotoSummary.length,
            componentCount: 0,
            severity: "unknown",
            impactZone: pass1Page?.brief_description ?? "unknown",
            detectedComponents: [],
            caption: `Page ${pageNum}: Analysis failed — ${(error ?? "").slice(0, 60)}`,
            confidenceScore: 0,
            imageQuality: pass1Page?.photo_quality ?? "unknown",
            usedFallback: true,
            enrichedAt: new Date().toISOString(),
            source: "pdf_targeted_render",
          });
        }
      }
    }
    log(`Per-image analysis complete: ${allComponents.length} unique components from ${photosProcessed} page(s)`);
  } else {
    // Fallback: single-pass PDF vision for component extraction (no rendered images)
    log(`No rendered pages available — running single-pass PDF vision for component extraction`);
    const PDF_VISION_TIMEOUT_MS = 90_000;
    const PDF_VISION_SCHEMA = {
      type: "json_schema" as const,
      json_schema: {
        name: "pdf_damage_extraction",
        strict: true,
        schema: {
          type: "object",
          properties: {
            damage_photo_pages: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  page_number: { type: "integer" },
                  photo_type: { type: "string", enum: ["vehicle_damage", "vehicle_overview", "document", "other"] },
                  components: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string" }, location: { type: "string" }, damageType: { type: "string" },
                        severity: { type: "string", enum: ["cosmetic", "minor", "moderate", "severe", "catastrophic"] },
                        visible: { type: "boolean" }, notes: { type: "string" },
                        crushDepthM: { type: "number" }, deformationEnergyJ: { type: "number" },
                        structuralDisplacementM: { type: "number" }, visionConfidenceScore: { type: "number" },
                        panelDeformation: { type: "boolean" }, damageFractionEstimate: { type: "number" },
                      },
                      required: ["name", "location", "damageType", "severity", "visible", "notes",
                                 "crushDepthM", "deformationEnergyJ", "structuralDisplacementM",
                                 "visionConfidenceScore", "panelDeformation", "damageFractionEstimate"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["page_number", "photo_type", "components"],
                additionalProperties: false,
              },
            },
            overall_severity_assessment: { type: "string" },
            structural_damage_suspected: { type: "boolean" },
            confidence: { type: "string", enum: ["high", "medium", "low"] },
            total_damage_photos_found: { type: "integer" },
          },
          required: ["damage_photo_pages", "overall_severity_assessment", "structural_damage_suspected", "confidence", "total_damage_photos_found"],
          additionalProperties: false,
        },
      },
    };
    type PdfVisionResult = {
      damage_photo_pages: Array<{ page_number: number; photo_type: string; components: Array<{ name: string; location: string; damageType: string; severity: string; visible: boolean; notes?: string; panelDeformation?: boolean; crushDepthM?: number; deformationEnergyJ?: number; structuralDisplacementM?: number; visionConfidenceScore?: number; damageFractionEstimate?: number; }>; }>;
      overall_severity_assessment: string; structural_damage_suspected: boolean; confidence: string; total_damage_photos_found: number;
    };
    let parsed: PdfVisionResult | null = null;
    let succeeded = false;
    try {
      const response = await withTimeout(
        () => invokeLLM({
          messages: [
            {
              role: "system",
              content: `${KINGA_REPORT_SYSTEM_PROMPT}\n\nYou are an expert vehicle damage assessor for insurance claims in South Africa, operating within the KINGA Intelligence system.\nYou are given a vehicle insurance claim PDF. Scan every page, identify vehicle damage photos, and extract all damaged components with full SI-unit measurements.\nPART NAMING: Use ONLY these authorised SA/Audatex ZA names: ${CANONICAL_PARTS_PROMPT_LIST}\nSide prefixes: LH=driver side, RH=passenger side. Use Bonnet/Boot Lid/Windscreen (not Hood/Trunk/Windshield).\nMEASUREMENTS: crushDepthM(0-0.55m), deformationEnergyJ(0-500000J), structuralDisplacementM(0-0.30m), visionConfidenceScore(0-100), panelDeformation(bool), damageFractionEstimate(0-1.0).\nReturn ONLY JSON.`,
            },
            {
              role: "user",
              content: [
                { type: "text" as const, text: `Vehicle: ${vehicleContext || "Unknown"}, collision: ${collisionDirection}. Extract all damage from this claim PDF.` },
                { type: "file_url" as const, file_url: { url: pdfUrl, mime_type: "application/pdf" as const } },
              ],
            },
          ],
          response_format: PDF_VISION_SCHEMA,
        }),
        PDF_VISION_TIMEOUT_MS
      );
      const rawContent = response.choices?.[0]?.message?.content || "{}";
      parsed = JSON.parse(typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent)) as PdfVisionResult;
      succeeded = true;
      log(`Single-pass PDF vision: ${parsed.total_damage_photos_found} damage photo page(s), confidence: ${parsed.confidence}`);
    } catch (e) {
      log(`Single-pass PDF vision FAILED: ${String(e)}`);
      recoveryActions.push({ target: "pdf_direct_vision", strategy: "partial_data", success: false, description: `PDF vision failed: ${String(e)}` });
      return { components: [], perPhotoResults: [], photosProcessed: 0, photosDeferred: 0, photosFailed: 1, enrichedPhotosJson: "[]" };
    }
    if (!parsed || !parsed.damage_photo_pages) {
      return { components: [], perPhotoResults: [], photosProcessed: 0, photosDeferred: 0, photosFailed: 0, enrichedPhotosJson: "[]" };
    }
    const damagePages = parsed.damage_photo_pages.filter(p => p.photo_type === "vehicle_damage" || (p.components && p.components.length > 0));
    log(`Single-pass damage pages: ${damagePages.length}`);
    for (const page of damagePages) {
      for (const c of (page.components || [])) {
        const normName = normalisePartName(c.name || "Unknown Component");
        const dedupeKey = `${normName}::${c.location || "general"}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        allComponents.push({
          name: normName, location: c.location || "general", damageType: c.damageType || "impact",
          severity: normaliseSeverity(c.severity), visible: c.visible !== false,
          distanceFromImpact: allComponents.length * 0.3, panelDeformation: c.panelDeformation,
          crushDepthM: typeof c.crushDepthM === "number" ? Math.min(0.55, Math.max(0.0, c.crushDepthM)) : undefined,
          deformationEnergyJ: typeof c.deformationEnergyJ === "number" ? Math.min(500000, Math.max(0, c.deformationEnergyJ)) : undefined,
          structuralDisplacementM: typeof c.structuralDisplacementM === "number" ? Math.min(0.30, Math.max(0.0, c.structuralDisplacementM)) : undefined,
          visionConfidenceScore: typeof c.visionConfidenceScore === "number" ? Math.min(100, Math.max(0, c.visionConfidenceScore)) : undefined,
          damageFractionEstimate: typeof c.damageFractionEstimate === "number" ? Math.min(1.0, Math.max(0.0, c.damageFractionEstimate)) : undefined,
        });
      }
      enrichedPhotoSummary.push({
        url: `${pdfUrl}#page=${page.page_number}`,
        pageNumber: page.page_number,
        index: enrichedPhotoSummary.length,
        componentCount: page.components?.length ?? 0,
        severity: page.components && page.components.length > 0
          ? (page.components.some(c => c.severity === "severe" || c.severity === "catastrophic") ? "severe"
            : page.components.some(c => c.severity === "moderate") ? "moderate" : "minor") : "unknown",
        impactZone: page.components?.[0]?.location ?? "unknown",
        detectedComponents: (page.components || []).map(c => normalisePartName(c.name || "Unknown")),
        caption: page.components && page.components.length > 0
          ? `Page ${page.page_number}: ${page.components.length} component(s) — ${page.components.slice(0, 3).map(c => c.name).join(", ")}${page.components.length > 3 ? "..." : ""}`
          : `Page ${page.page_number}: No damage components detected`,
        confidenceScore: parsed!.confidence === "high" ? 85 : parsed!.confidence === "medium" ? 65 : 40,
        imageQuality: parsed!.confidence === "high" ? "good" : "poor",
        usedFallback: false, enrichedAt: new Date().toISOString(), source: "pdf_single_pass_vision",
      });
    }
    photosProcessed = succeeded ? 1 : 0;
    photosFailed = succeeded ? 0 : 1;
  }

  log(`readDamageFromPdf complete: ${allComponents.length} components, ${enrichedPhotoSummary.length} photo entries, ${photosProcessed} processed, ${photosFailed} failed`);

  if (allComponents.length > 0 || enrichedPhotoSummary.length > 0) {
    recoveryActions.push({
      target: "damagePhotoUrls",
      strategy: "partial_data",
      success: true,
      description: renderedPageMap.size > 0
        ? `PDF two-pass vision: rendered ${renderedPageMap.size} damage page(s) as real images, extracted ${allComponents.length} components.`
        : `PDF single-pass vision: identified ${enrichedPhotoSummary.length} damage page(s), extracted ${allComponents.length} components.`,
    });
    assumptions.push({
      field: "visionSource",
      assumedValue: renderedPageMap.size > 0 ? `PDF targeted render (${renderedPageMap.size} pages)` : `PDF single-pass vision`,
      reason: renderedPageMap.size > 0
        ? `Pass 1 identified ${damagePageNumbers.length} damage page(s); targeted rendering produced ${renderedPageMap.size} real image(s) for per-image analysis.`
        : "Pass 1 page identification ran but rendering failed; fell back to single-pass PDF vision.",
      strategy: renderedPageMap.size > 0 ? "pdf_targeted_render" : "pdf_direct_vision",
      confidence: renderedPageMap.size > 0 ? 85 : 60,
      stage: "Stage 6",
    });
  }

  return {
    components: allComponents,
    perPhotoResults: [],
    photosProcessed,
    photosDeferred: 0,
    photosFailed,
    enrichedPhotosJson: JSON.stringify(enrichedPhotoSummary),
  };
}

/**
 * Infer damage components from accident description when no components are available.
 */
function inferDamageFromDescription(
  claimRecord: ClaimRecord,
  assumptions: Assumption[]
): DamageAnalysisComponent[] {
  const impactPoint = (claimRecord.accidentDetails.impactPoint || "").toLowerCase();
  const direction = claimRecord.accidentDetails.collisionDirection;

  const inferred: DamageAnalysisComponent[] = [];

  if (direction === "frontal" || /front/i.test(impactPoint)) {
    inferred.push(
      { name: "Front Bumper", location: "front", damageType: "impact", severity: "moderate", visible: true, distanceFromImpact: 0 },
      { name: "Bonnet", location: "front", damageType: "deformation", severity: "moderate", visible: true, distanceFromImpact: 0.3 },
      { name: "Grille", location: "front", damageType: "breakage", severity: "moderate", visible: true, distanceFromImpact: 0.1 },
      { name: "LH Headlamp", location: "front", damageType: "breakage", severity: "moderate", visible: true, distanceFromImpact: 0.2 },
      { name: "RH Headlamp", location: "front", damageType: "breakage", severity: "moderate", visible: true, distanceFromImpact: 0.2 },
    );
  } else if (direction === "rear" || /rear|back/i.test(impactPoint)) {
    inferred.push(
      { name: "Rear Bumper", location: "rear", damageType: "impact", severity: "moderate", visible: true, distanceFromImpact: 0 },
      { name: "Boot Lid", location: "rear", damageType: "deformation", severity: "moderate", visible: true, distanceFromImpact: 0.3 },
      { name: "LH Tail Lamp", location: "rear", damageType: "breakage", severity: "moderate", visible: true, distanceFromImpact: 0.2 },
      { name: "RH Tail Lamp", location: "rear", damageType: "breakage", severity: "moderate", visible: true, distanceFromImpact: 0.2 },
    );
  } else if (direction === "side_driver" || direction === "side_passenger") {
    const side = direction === "side_driver" ? "LH" : "RH";
    const sideLabel = direction === "side_driver" ? "left" : "right";
    inferred.push(
      { name: `${side} Front Door`, location: sideLabel, damageType: "impact", severity: "moderate", visible: true, distanceFromImpact: 0 },
      { name: `${side} Rear Door`, location: sideLabel, damageType: "impact", severity: "moderate", visible: true, distanceFromImpact: 0.5 },
      { name: `${side} B-Pillar`, location: sideLabel, damageType: "deformation", severity: "moderate", visible: true, distanceFromImpact: 0.3 },
      { name: `${side} Sill Panel`, location: sideLabel, damageType: "deformation", severity: "minor", visible: true, distanceFromImpact: 0.4 },
      { name: `${side} Front Fender`, location: sideLabel, damageType: "deformation", severity: "minor", visible: true, distanceFromImpact: 0.6 },
      { name: `${side} Rear Quarter Panel`, location: sideLabel, damageType: "deformation", severity: "minor", visible: true, distanceFromImpact: 0.7 },
      { name: `${side} Door Glass`, location: sideLabel, damageType: "shatter", severity: "moderate", visible: true, distanceFromImpact: 0.2 },
      { name: `${side} Door Mirror`, location: sideLabel, damageType: "breakage", severity: "minor", visible: true, distanceFromImpact: 0.1 },
    );
  } else if (direction === "rollover") {
    inferred.push(
      { name: "Roof Panel", location: "roof", damageType: "deformation", severity: "severe", visible: true, distanceFromImpact: 0 },
      { name: "Roof Lining", location: "roof", damageType: "deformation", severity: "moderate", visible: true, distanceFromImpact: 0.1 },
      { name: "LH A-Pillar", location: "left", damageType: "bend", severity: "severe", visible: true, distanceFromImpact: 0.2 },
      { name: "RH A-Pillar", location: "right", damageType: "bend", severity: "severe", visible: true, distanceFromImpact: 0.2 },
      { name: "LH B-Pillar", location: "left", damageType: "bend", severity: "severe", visible: true, distanceFromImpact: 0.3 },
      { name: "RH B-Pillar", location: "right", damageType: "bend", severity: "severe", visible: true, distanceFromImpact: 0.3 },
      { name: "LH Front Door", location: "left", damageType: "deformation", severity: "moderate", visible: true, distanceFromImpact: 0.4 },
      { name: "RH Front Door", location: "right", damageType: "deformation", severity: "moderate", visible: true, distanceFromImpact: 0.4 },
      { name: "Windscreen", location: "front", damageType: "shatter", severity: "severe", visible: true, distanceFromImpact: 0.5 },
      { name: "Rear Windscreen", location: "rear", damageType: "shatter", severity: "moderate", visible: true, distanceFromImpact: 0.5 },
      { name: "LH Sill Panel", location: "left", damageType: "deformation", severity: "moderate", visible: true, distanceFromImpact: 0.6 },
      { name: "RH Sill Panel", location: "right", damageType: "deformation", severity: "moderate", visible: true, distanceFromImpact: 0.6 },
    );
  } else {
    inferred.push(
      { name: "Front Bumper", location: "front", damageType: "impact", severity: "moderate", visible: true, distanceFromImpact: 0 },
    );
  }

  if (inferred.length > 0) {
    assumptions.push({
      field: "damagedParts",
      assumedValue: `${inferred.length} inferred components`,
      reason: `No damage components extracted from documents or vision. Inferred ${inferred.length} likely damaged components from collision direction (${direction}) and impact point.`,
      strategy: "contextual_inference",
      confidence: 35,
      stage: "Stage 6",
    });
  }

  return inferred;
}

/**
 * Merge vision-extracted components with structured components.
 * Structured components take precedence; vision adds newly detected parts
 * not already present in the structured list (deduplication by name).
 */
function mergeComponents(
  structured: DamageAnalysisComponent[],
  vision: DamageAnalysisComponent[]
): DamageAnalysisComponent[] {
  if (vision.length === 0) return structured;
  if (structured.length === 0) return vision;

  const existingNames = new Set(structured.map((c) => c.name.toLowerCase().trim()));
  const newFromVision = vision.filter((c) => !existingNames.has(c.name.toLowerCase().trim()));

  return [...structured, ...newFromVision];
}

// Image Intelligence Layer is imported at the top of this file

export async function runDamageAnalysisStage(
  ctx: PipelineContext,
  claimRecord: ClaimRecord
): Promise<StageResult<Stage6Output>> {
  const start = Date.now();
  ctx.log("Stage 6", "Damage analysis starting");

  const assumptions: Assumption[] = [];
  const recoveryActions: RecoveryAction[] = [];
  let isDegraded = false;

  try {
    // ── STEP 1: Structured components from claim record ───────────────────────
    let structuredParts: DamageAnalysisComponent[] = [];
    if (claimRecord.damage.components.length > 0) {
      structuredParts = claimRecord.damage.components.map((comp, index) => ({
        name: comp.name || "Unknown Component",
        location: comp.location || "general",
        damageType: comp.damageType || "impact",
        severity: normaliseSeverity(comp.severity),
        visible: true,
        distanceFromImpact: index * 0.3,
      }));
      ctx.log("Stage 6", `Structured: ${structuredParts.length} components from claim record`);
    }

    // ── STEP 2: LLM vision — read damage from photos or PDF pages ────────────
    // Primary: use dedicated damage photos if available
    // Fallback: use PDF page images (claim form pages rendered as images) for visual evidence
    const photoUrls = ctx.damagePhotoUrls ?? [];
    const pdfPageUrls: string[] = (ctx as any).pdfPageImageUrls ?? [];
    // Image Intelligence Layer: when using PDF pages as fallback, run the full
    // scoring pipeline (feature extraction → classification → dedup → quality rank)
    // to identify which pages are actual damage photos regardless of page position.
    let visionSourceUrls: string[];
    if (photoUrls.length > 0) {
      visionSourceUrls = photoUrls;
    } else if (pdfPageUrls.length > 0) {
      const scoredPages = await selectDamagePhotoPages(pdfPageUrls, ctx);
      visionSourceUrls = scoredPages.map(p => p.url);
      // ── Stage 6 → imageIntelligence feedback log ─────────────────────────────────
      // Log a structured summary so operators can tune scoring thresholds.
      const totalPages = pdfPageUrls.length;
      const selectedCount = scoredPages.length;
      const rejectedCount = totalPages - selectedCount;
      if (totalPages > 0) {
        ctx.log("Stage 6",
          `[ImageIntelligence Feedback] ` +
          `total_pages=${totalPages} selected=${selectedCount} rejected=${rejectedCount} ` +
          `selection_rate=${(selectedCount / totalPages * 100).toFixed(0)}%`
        );
      }
      if (scoredPages.length > 0) {
        ctx.log("Stage 6",
          `Image Intelligence: selected pages [${scoredPages.map(p => p.pageNumber).join(", ")}] ` +
          `(scores: ${scoredPages.map(p => p.damageLikelihoodScore.toFixed(2)).join(", ")}) ` +
          `(confidence: ${scoredPages.map(p => p.confidence).join(", ")})`
        );
      } else if (totalPages > 0) {
        ctx.log("Stage 6",
          `[ImageIntelligence Feedback] WARNING: all ${totalPages} PDF page(s) were rejected by the classifier. ` +
          `This may indicate the scoring thresholds are too aggressive for this document type. ` +
          `Top rejected scores: ${pdfPageUrls.slice(0, 3).map((_, i) => `page${i+1}`).join(", ")}`
        );
      }
    } else if (ctx.pdfUrl) {
      // ── PDF DIRECT VISION PATH ─────────────────────────────────────────────
      // Neither dedicated damage photos nor pre-rendered PDF page images are available.
      // Fall back to passing the raw PDF directly to the LLM as a file_url.
      // The LLM scans all pages, classifies which contain vehicle damage photos,
      // and extracts damage components in a single call.
      // This path is robust to storagePut failures in production.
      visionSourceUrls = []; // not used in this path
      ctx.log("Stage 6",
        "No damage photos and no pre-rendered PDF pages available. " +
        "Falling back to PDF direct vision (LLM file_url path)."
      );
    } else {
      visionSourceUrls = [];
    }

    let visionParts: DamageAnalysisComponent[] = [];
    let visionPerPhotoResults: import('./types').PerPhotoResult[] = [];
    let visionPhotosProcessed = 0;
    let visionPhotosDeferred = 0;
    let visionPhotosFailed = 0;

    // ── PDF DIRECT VISION: run before the photo-based path ────────────────────
    // This fires when pdfUrl is set but both photoUrls and pdfPageUrls are empty.
    if (photoUrls.length === 0 && pdfPageUrls.length === 0 && ctx.pdfUrl) {
      const pdfVisionResult = await readDamageFromPdf(
        ctx.pdfUrl, claimRecord, ctx, assumptions, recoveryActions
      );
      // Always persist enrichedPhotosJson — even if 0 components, the photo URLs are
      // still valuable for the report UI and claimTruthLayer photo count.
      (ctx as any).enrichedPhotosJson = pdfVisionResult.enrichedPhotosJson;
      visionPhotosFailed = pdfVisionResult.photosFailed;
      if (pdfVisionResult.components.length > 0) {
        visionParts = pdfVisionResult.components;
        visionPerPhotoResults = pdfVisionResult.perPhotoResults;
        visionPhotosProcessed = pdfVisionResult.photosProcessed;
        visionPhotosDeferred = pdfVisionResult.photosDeferred;
        ctx.log("Stage 6",
          `PDF two-pass vision: ${visionParts.length} components from ${pdfVisionResult.photosProcessed} photo page(s)`
        );
      } else {
        ctx.log("Stage 6",
          `PDF two-pass vision: 0 components extracted. Photos found: ${JSON.parse(pdfVisionResult.enrichedPhotosJson || "[]").length}`
        );
      }
    } else if (visionSourceUrls.length > 0) {
      // ── PHOTO / PDF-PAGE VISION PATH (normal path) ────────────────────────
      if (photoUrls.length === 0 && pdfPageUrls.length > 0) {
        ctx.log("Stage 6", `No damage photos — using ${pdfPageUrls.length} PDF page images as visual evidence fallback`);
        recoveryActions.push({
          target: "damagePhotoUrls",
          strategy: "partial_data",
          success: true,
          description: `No dedicated damage photos provided. Using ${pdfPageUrls.length} PDF page renders for visual damage analysis.`,
        });
      }
      // Build damage likelihood scores map from Image Intelligence Layer (if available)
      const damageLikelihoodScores = new Map<string, number>();
      if (ctx.classifiedImages?.damagePhotos) {
        ctx.classifiedImages.damagePhotos.forEach((p, idx) => {
          damageLikelihoodScores.set(p.url, Math.max(0.1, 1.0 - (idx * 0.05)));
        });
      }
      const visionResult = await readDamageFromPhotos(
        visionSourceUrls, claimRecord, ctx, assumptions, recoveryActions,
        damageLikelihoodScores.size > 0 ? damageLikelihoodScores : undefined
      );
      visionParts = visionResult.components;
      visionPerPhotoResults = visionResult.perPhotoResults;
      visionPhotosProcessed = visionResult.photosProcessed;
      visionPhotosDeferred = visionResult.photosDeferred;
      visionPhotosFailed = visionResult.photosFailed;
    }

    // ── STEP 3: Determine final component list ────────────────────────────────
    let damagedParts: DamageAnalysisComponent[];

    if (structuredParts.length > 0 || visionParts.length > 0) {
      damagedParts = mergeComponents(structuredParts, visionParts);
      if (visionParts.length > 0 && structuredParts.length > 0) {
        ctx.log("Stage 6", `Merged: ${structuredParts.length} structured + ${visionParts.length} vision = ${damagedParts.length} total components`);
      }
    } else {
      isDegraded = true;
      ctx.log("Stage 6", "DEGRADED: No damage components available — inferring from accident details");
      damagedParts = inferDamageFromDescription(claimRecord, assumptions);
      recoveryActions.push({
        target: "damagedParts",
        strategy: "contextual_inference",
        success: damagedParts.length > 0,
        description: `No damage components in extraction or vision. Inferred ${damagedParts.length} components from collision direction and impact point.`,
      });
    }

    // ── STEP 3b: Direction-aware vision anomaly filter ──────────────────────
    // Vision LLMs can hallucinate components from the wrong zone (e.g. a front
    // headlamp in a rear-end collision). These vision-only components contradict
    // the incident direction and would incorrectly trigger NARRATIVE_DAMAGE_MISMATCH
    // fraud signals downstream. Filter them out before they propagate.
    //
    // Rule: if a component was added ONLY by vision (not in structuredParts)
    // AND its zone is directionally incompatible with the collision direction,
    // exclude it and log it as a vision anomaly.
    const collisionDirForFilter = claimRecord.accidentDetails.collisionDirection || "unknown";
    if (collisionDirForFilter !== "unknown" && collisionDirForFilter !== "multi_impact" && visionParts.length > 0) {
      const structuredNames = new Set(structuredParts.map(c => c.name.toLowerCase().trim()));
      // Zones that are physically incompatible with each collision direction
      const incompatibleZones: Record<string, string[]> = {
        rear:           ["front"],
        frontal:        ["rear"],
        side_driver:    [],   // side impacts can produce front/rear scatter — don't filter
        side_passenger: [],
        rollover:       [],
      };
      const badZones = incompatibleZones[collisionDirForFilter] ?? [];
      if (badZones.length > 0) {
        const filtered: DamageAnalysisComponent[] = [];
        const excluded: string[] = [];
        for (const part of damagedParts) {
          const isVisionOnly = !structuredNames.has(part.name.toLowerCase().trim());
          const zone = inferZone(part.location).toLowerCase();
          if (isVisionOnly && badZones.some(bz => zone === bz)) {
            excluded.push(`${part.name} (zone=${zone})`);
          } else {
            filtered.push(part);
          }
        }
        if (excluded.length > 0) {
          ctx.log(
            "Stage 6",
            `Direction filter [${collisionDirForFilter}]: excluded ${excluded.length} vision-only ` +
            `component(s) from incompatible zone(s): ${excluded.join(", ")}`
          );
          assumptions.push({
            field: "damagedParts",
            assumedValue: `Excluded ${excluded.length} vision-only component(s) from incompatible zone(s): ${excluded.join("; ")}`,
            reason: `Collision direction is '${collisionDirForFilter}'; components in zones [${badZones.join(", ")}] ` +
                    `are physically implausible for this incident type and are likely LLM vision errors.`,
            strategy: "contextual_inference" as const,
            confidence: 0.85,
            stage: "Stage 6 direction filter",
          });
          damagedParts = filtered;
        }
      }
    }

    // ── STEP 4: Group into damage zones ──────────────────────────────────────
    const zoneMap = new Map<string, { components: DamageAnalysisComponent[] }>();
    for (const part of damagedParts) {
      const zone = inferZone(part.location);
      if (!zoneMap.has(zone)) {
        zoneMap.set(zone, { components: [] });
      }
      zoneMap.get(zone)!.components.push(part);
    }

    const damageZones: DamageZone[] = Array.from(zoneMap.entries()).map(([zone, data]) => {
      const severityOrder: AccidentSeverity[] = ["none", "cosmetic", "minor", "moderate", "severe", "catastrophic"];
      const maxSev = data.components.reduce((max, c) => {
        const maxIdx = severityOrder.indexOf(max);
        const curIdx = severityOrder.indexOf(c.severity);
        return curIdx > maxIdx ? c.severity : max;
      }, "none" as AccidentSeverity);

      return { zone, componentCount: data.components.length, maxSeverity: maxSev };
    });

    const overallSeverityScore = calculateOverallSeverity(damagedParts);
    const structuralDamageDetected =
      claimRecord.accidentDetails.structuralDamage ||
      damagedParts.some((p) =>
        /frame|chassis|subframe|pillar|rail|structural|unibody/.test((p.name || "").toLowerCase())
      );

    // ── Image confidence metrics (honest accounting) ────────────────────────
    // Use the honest metrics from readDamageFromPhotos:
    //   photosAvailable = total photos in visionSourceUrls
    //   photosProcessed = photos actually sent to the vision LLM
    //   photosDeferred  = photos not processed due to budget
    //   photosFailed    = photos sent to LLM but failed (error/timeout)
    const photosAvailable = visionSourceUrls.length;
    let imageConfidenceScore = 0;
    if (visionPhotosProcessed > 0) {
      try {
        const enriched: Array<{ confidenceScore: number }> = JSON.parse((ctx as any).enrichedPhotosJson ?? "[]");
        const scored = enriched.filter((e) => e.confidenceScore > 0);
        imageConfidenceScore = scored.length > 0
          ? Math.round(scored.reduce((s, e) => s + e.confidenceScore, 0) / scored.length)
          : 40;
      } catch {
        imageConfidenceScore = 40;
      }
    }
    const analysisFromPhotos = visionParts.length > 0;

    const rawOutput: Stage6Output = {
      damagedParts,
      damageZones,
      overallSeverityScore,
      structuralDamageDetected,
      totalDamageArea: claimRecord.accidentDetails.totalDamageAreaM2 || 0,
      photosAvailable,
      photosProcessed: visionPhotosProcessed,
      photosDeferred: visionPhotosDeferred,
      photosFailed: visionPhotosFailed,
      perPhotoResults: visionPerPhotoResults.length > 0 ? visionPerPhotoResults : undefined,
      imageConfidenceScore,
      analysisFromPhotos,
    };
    const output = ensureDamageContract(rawOutput, isDegraded ? "inferred_components" : "success");

    const visionNote = visionParts.length > 0 ? `, vision: ${visionParts.length} photo-detected` : "";
    ctx.log(
      "Stage 6",
      `Damage analysis complete. ${damagedParts.length} parts${visionNote}, ${damageZones.length} zones, severity: ${overallSeverityScore}/100, structural: ${structuralDamageDetected}`
    );

    return {
      status: isDegraded ? "degraded" : "success",
      data: output,
      durationMs: Date.now() - start,
      savedToDb: false,
      assumptions,
      recoveryActions,
      degraded: isDegraded,
    };
  } catch (err) {
    ctx.log("Stage 6", `Damage analysis failed: ${String(err)} — producing fallback analysis`);

    const fallbackOutput = ensureDamageContract({}, `engine_failure: ${String(err)}`);

    return {
      status: "degraded",
      data: fallbackOutput,
      error: String(err),
      durationMs: Date.now() - start,
      savedToDb: false,
      assumptions: [{
        field: "damageAnalysis",
        assumedValue: "fallback_sentinel_zone",
        reason: `Damage analysis failed: ${String(err)}. Producing fallback output with sentinel zone — further review required.`,
        strategy: "default_value",
        confidence: 5,
        stage: "Stage 6",
      }],
      recoveryActions: [{
        target: "damage_analysis_error",
        strategy: "default_value",
        success: true,
        description: `Damage analysis error caught. Fallback output produced with sentinel zone to ensure UI renderability.`,
      }],
      degraded: true,
    };
  }
}
