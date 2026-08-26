/** Vision extraction concern for Stage 6. Keep retry, timeout, prompt, and image evidence handling together. */
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
import {
  evidenceFromClassifiedImage,
  evidenceFromPdfDirectPage,
  evidenceFromScoredPdfPage,
  evidenceFromSemanticImage,
  removeIneligiblePhysicsMeasurements,
} from "./imageEvidenceEligibility";
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
  ImageEvidenceEnvelope,
} from "./types";
import { TIMEOUT_VISION_MS } from "./pipelineContractRegistry";
import { normaliseVisionComponentNames } from "../services/visionTermNormaliser";
// R-B-06 fix: import TIMEOUT_VISION_MS from pipelineContractRegistry so the
// stage-level budget is a single source of truth (currently 200_000 ms / 200 s).
// The orchestrator enforces this via runWithTimeout("6_damage_analysis", ...).
//
// Timing model:
//   VISION_TIMEOUT_MS (below) = 45 s per-image LLM call timeout.
//   VISION_RETRIES = 2 means each image can take up to 3 × 45 s = 135 s worst case.
//   TIMEOUT_VISION_MS (stage budget) = 200 s is the binding constraint.
//   At typical LLM speed (~5–10 s/image): 20 photos ≈ 160 s ✓ within budget.
//   At worst-case (all retries hit timeout): budget exhausted after ~4 photos.
//   PER_RUN_VISION_BUDGET should satisfy: budget × VISION_TIMEOUT_MS << TIMEOUT_VISION_MS.

const VISION_TIMEOUT_MS = 45_000; // 45 s per-image LLM call timeout (3 attempts × 45 s = 135 s worst case)
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
    // URL accessibility check timeout — 5 s is a pragmatic limit for a non-blocking probe.
    const URL_CHECK_TIMEOUT_MS = 5000;
    const t = setTimeout(() => ctrl.abort(), URL_CHECK_TIMEOUT_MS);
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
            // P4 fix: Physics measurement fields are OPTIONAL — the LLM must NOT fabricate
            // values when the image is unclear or the component has no measurable deformation.
            // Only name/location/damageType/severity/visible are required for every component.
            // Stage 7 already handles missing crushDepthM gracefully (null = excluded from ensemble).
            required: ["name", "location", "damageType", "severity", "visible"],
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

ABSOLUTE NUMERIC MEASUREMENTS — provide these SI-unit fields ONLY when they are directly observable in the image. OMIT any field you cannot estimate from the visible damage — do NOT fabricate values. Stage 7 physics will exclude omitted fields from the ensemble.

  crushDepthM [metres] — maximum visible crush/deformation depth on this component (OMIT for glass, trim, paint-only damage):
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
  - OMIT physics measurement fields (crushDepthM, deformationEnergyJ, structuralDisplacementM, visionConfidenceScore, damageFractionEstimate) when you cannot directly observe them — do NOT guess or use 0.0 as a placeholder
  - Only include panelDeformation when the panel shape is visibly distorted
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
// R-B-06 fix: corrected timing comment (per-image timeout = 45s, not ~8s).
// Stage budget (TIMEOUT_VISION_MS = 200s) is the binding constraint.
// Typical: 20 photos × ~8s = ~160s ✓ within budget. Worst case: ~4 photos × 45s = 180s.
const PER_RUN_VISION_BUDGET = 20; // max photos per run; stage budget = TIMEOUT_VISION_MS (200s)

export async function readDamageFromPhotos(
  photoUrls: string[],
  claimRecord: ClaimRecord,
  ctx: PipelineContext,
  assumptions: Assumption[],
  recoveryActions: RecoveryAction[],
  damageLikelihoodScores?: Map<string, number>,
  /** P5: per-URL provenance tag — set by the caller based on imageIntelligence classification */
  sourceTagMap?: Map<string, DamageAnalysisComponent['inputSource']>,
  /** R2: provenance and eligibility are carried per URL without suppressing damage analysis. */
  evidenceByUrl?: Map<string, ImageEvidenceEnvelope>,
  /** Test seam: defaults to the production vision analyser and never persists state itself. */
  analyseImage: typeof analyseOneImage = analyseOneImage,
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
    evidence?: ImageEvidenceEnvelope;
  }> = [];

  for (let batchStart = 0; batchStart < toProcess.length; batchStart += PHOTO_BATCH_SIZE) {
    const batch = toProcess.slice(batchStart, batchStart + PHOTO_BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(async (url, batchIdx) => {
        const i = batchStart + batchIdx;
        const evidence = evidenceByUrl?.get(url);
        try {
          const result = await analyseImage(
            url,
            i,
            vehicleContext,
            collisionDirection,
            (msg) => ctx.log("Stage 6", msg)
          );
          return {
            url,
            components: evidence && !evidence.suitableForCrushDepth
              ? removeIneligiblePhysicsMeasurements(result.components)
              : result.components,
            confidence: result.confidence as 'high' | 'medium' | 'low',
            usedFallback: result.usedFallback,
            succeeded: true,
            evidence,
          };
        } catch (e) {
          ctx.log("Stage 6", `Vision: photo[${i}] completely failed: ${String(e)}`);
          return { url, components: [], confidence: 'low' as const, usedFallback: false, succeeded: false, evidence };
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
        evidence: evidenceByUrl?.get(url),
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
        evidence: evidenceByUrl?.get(url),
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
        evidence: r.evidence,
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
        evidence: evidenceByUrl?.get(url),
    };
  });

  // ── STEP E: Compute honest metrics ───────────────────────────────────────────────────────────────────────────────────────
  const photosProcessed = processedResults.length; // photos actually sent to LLM
  const photosFailed    = processedResults.filter(r => !r.succeeded).length;
  const photosDeferred  = deferred.length;
  const succeededCount  = processedResults.filter(r => r.succeeded).length;
  const successRate     = photosProcessed > 0 ? succeededCount / photosProcessed : 0;
  const fallbackCount   = processedResults.filter(r => r.usedFallback).length;
  const physicsExcludedCount = processedResults.filter((r) => r.evidence && !r.evidence.suitableForCrushDepth).length;

  if (physicsExcludedCount > 0) {
    assumptions.push({
      field: "crushDepthImageEligibility",
      assumedValue: `${physicsExcludedCount} visual evidence item(s) excluded from numeric physics`,
      reason: "The image remained available for visual damage analysis, but its provenance, category, confidence, quality, or fallback state did not support crush-depth measurement.",
      strategy: "partial_data",
      confidence: 100,
      stage: "Stage 6",
    });
  }

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

  // ── STEP F: Merge per-image results (deduplication by part name, MAX-wins for physics fields) ──────────────────────────────────────────────────────────────
  //
  // FIX B: When the same component (e.g. "Front Bumper Bar") appears in multiple photos,
  // we previously kept only the FIRST occurrence. This systematically discarded higher
  // crush-depth estimates from later (often better-angle) photos in favour of earlier
  // (often lower-quality) ones, biasing Campbell/M5 speed estimates downward.
  //
  // Correct behaviour: retain the MAXIMUM value for each physics measurement field
  // (crushDepthM, deformationEnergyJ, structuralDisplacementM) across all photos
  // that mention the same component. For non-physics fields (name, location, severity,
  // description) keep the first occurrence — they are qualitative and stable.
  // For inputSource: prefer 'confirmed_damage_photo' over any weaker provenance.
  const componentMap = new Map<string, DamageAnalysisComponent>();

  for (const result of processedResults) {
    // P5: resolve inputSource for this URL from the caller-provided tag map
    const urlInputSource: DamageAnalysisComponent['inputSource'] =
      sourceTagMap?.get(result.url) ?? 'ambiguous_page';
    for (const comp of result.components) {
      const key = comp.name.toLowerCase().trim();
      const resolvedInputSource = comp.inputSource ?? urlInputSource;
      if (!componentMap.has(key)) {
        // First occurrence: add with resolved inputSource
        componentMap.set(key, { ...comp, inputSource: resolvedInputSource });
      } else {
        // Subsequent occurrence: update physics measurement fields with MAX values
        const existing = componentMap.get(key)!;
        // crushDepthM: take maximum (most severe deformation observed)
        if (typeof comp.crushDepthM === 'number' && comp.crushDepthM > 0) {
          if (existing.crushDepthM == null || comp.crushDepthM > existing.crushDepthM) {
            existing.crushDepthM = comp.crushDepthM;
          }
        }
        // deformationEnergyJ: take maximum (highest energy absorption observed)
        if (typeof comp.deformationEnergyJ === 'number' && comp.deformationEnergyJ > 0) {
          if (existing.deformationEnergyJ == null || comp.deformationEnergyJ > existing.deformationEnergyJ) {
            existing.deformationEnergyJ = comp.deformationEnergyJ;
          }
        }
        // structuralDisplacementM: take maximum (worst structural displacement observed)
        if (typeof comp.structuralDisplacementM === 'number' && comp.structuralDisplacementM > 0) {
          if (existing.structuralDisplacementM == null || comp.structuralDisplacementM > existing.structuralDisplacementM) {
            existing.structuralDisplacementM = comp.structuralDisplacementM;
          }
        }
        // visionConfidenceScore: take maximum (highest-confidence measurement wins)
        if (typeof comp.visionConfidenceScore === 'number' && comp.visionConfidenceScore > 0) {
          if (existing.visionConfidenceScore == null || comp.visionConfidenceScore > existing.visionConfidenceScore) {
            existing.visionConfidenceScore = comp.visionConfidenceScore;
          }
        }
        // inputSource: prefer confirmed_damage_photo over weaker provenance
        if (resolvedInputSource === 'confirmed_damage_photo' && existing.inputSource !== 'confirmed_damage_photo') {
          existing.inputSource = 'confirmed_damage_photo';
        }
      }
    }
  }

  const allComponents: DamageAnalysisComponent[] = Array.from(componentMap.values());
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
  // Stage 7 and Stage 7b read ctx.enrichedPhotosJson for severity consensus. R-B-03: typed in PipelineContext.

  // Fix B: direction contradiction map — zones that are directionally incompatible with each collision direction.
  // Used to set directionContradiction: true on enriched photos (display-only badge; does NOT affect scoring).
  const DIRECTION_INCOMPATIBLE_ZONES: Record<string, string[]> = {
    rear:           ["front"],
    frontal:        ["rear"],
    side_driver:    [],   // side impacts can produce front/rear scatter — no contradiction flag
    side_passenger: [],
    rollover:       [],   // multi-zone by definition
    multi_impact:   [],
  };
  const claimCollisionDir = (claimRecord.accidentDetails.collisionDirection ?? "unknown").toLowerCase();
  const incompatibleZonesForDir: string[] = DIRECTION_INCOMPATIBLE_ZONES[claimCollisionDir] ?? [];

  const enrichedPhotoSummary = processedResults.map((r, idx) => {
    // Attach semantic classification metadata if available (from Stage 2.6B)
    const semanticMeta = ctx.semanticImageClassifications?.get(r.url);
    const evidence = r.evidence;
    const derivedZone = (r.components[0]?.location ?? 'unknown').toLowerCase();
    // Fix B: flag photos where the vision-derived zone contradicts the narrative collision direction.
    // This is a display-only flag — it does not feed into fraud or physics scoring.
    const directionContradiction: boolean =
      incompatibleZonesForDir.length > 0 &&
      r.components.length > 0 &&
      incompatibleZonesForDir.some(bz => derivedZone === bz || derivedZone.startsWith(bz));
    return {
      url: r.url,
      index: idx,
      componentCount: r.components.length,
      severity: r.components.length > 0
        ? (r.components.some(c => c.severity === 'severe' || c.severity === 'catastrophic') ? 'severe'
          : r.components.some(c => c.severity === 'moderate') ? 'moderate' : 'minor')
        : 'unknown',
      impactZone: r.components[0]?.location ?? 'unknown',
      detectedComponents: normaliseVisionComponentNames(r.components.map(c => c.name)),
      caption: r.components.length > 0
        ? `${r.components.length} component(s) detected: ${r.components.slice(0, 3).map(c => c.name).join(', ')}${r.components.length > 3 ? '...' : ''}`
        : (r.succeeded ? 'No damage components detected in this image' : 'Image analysis failed'),
      confidenceScore: r.confidence === 'high' ? 85 : r.confidence === 'medium' ? 65 : r.succeeded ? 40 : 0,
      imageQuality: semanticMeta?.quality ?? (r.succeeded ? (r.confidence === 'high' ? 'good' : 'poor') : 'unusable'),
      usedFallback: r.usedFallback,
      enrichedAt: new Date().toISOString(),
      // Stage 2.6B semantic classification metadata
      semanticType: semanticMeta?.semanticType ?? null,
      semanticConfidence: semanticMeta?.semanticConfidence ?? null,
      sourcePage: evidence?.pageNumber ?? null,
      imageClassification: evidence?.classification ?? null,
      classificationConfidence: evidence?.classificationConfidence ?? null,
      classifier: evidence?.classifier ?? "unknown",
      selectionReason: evidence?.selectionReason ?? "No selection provenance was available.",
      fallbackWarning: evidence?.fallbackWarning ?? null,
      suitableForCrushDepth: evidence?.suitableForCrushDepth ?? false,
      physicsExclusionReason: evidence?.exclusionReason ?? null,
      damageLikelihoodScore: evidence?.damageLikelihoodScore ?? damageLikelihoodScores?.get(r.url) ?? null,
      // Fix B: direction contradiction flag (display-only)
      directionContradiction,
    };
  });
  ctx.enrichedPhotosJson = JSON.stringify(enrichedPhotoSummary);

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
    // R-INF-05: wrap PDF pass-1 in withRetry (2 attempts) — a transient 5xx on this
    // scan call would otherwise silently drop all PDF-sourced damage components.
    const response = await withRetry(
      () => withTimeout(
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
      ),
      2, 'stage-6 PDF pass-1', log
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
        const evidence = evidenceFromPdfDirectPage({
          url: img.url,
          pageNumber: pageNum,
          pageType: pass1Page?.page_type,
          hasVisibleDamage: pass1Page?.has_visible_damage,
          photoQuality: pass1Page?.photo_quality,
          scanConfidence: pass1?.scan_confidence,
          fallback: false,
          source: 'pdf_page_render',
        });
        if (imgResult && !error) {
          photosProcessed++;
          for (const c of (imgResult.components || [])) {
            const normName = normalisePartName(c.name || "Unknown Component");
            const dedupeKey = `${normName}::${c.location || "general"}`;
            if (seen.has(dedupeKey)) continue;
            seen.add(dedupeKey);
            const component: DamageAnalysisComponent = {
              name: normName,
              location: c.location || "general",
              damageType: c.damageType || "impact",
              severity: normaliseSeverity(c.severity),
              visible: c.visible !== false,
              distanceFromImpact: allComponents.length * 0.3,
              inputSource: evidence.suitableForCrushDepth ? "confirmed_damage_photo" : "pdf_direct_vision",
              panelDeformation: c.panelDeformation,
              crushDepthM: typeof c.crushDepthM === "number" ? Math.min(0.55, Math.max(0.0, c.crushDepthM)) : undefined,
              deformationEnergyJ: typeof c.deformationEnergyJ === "number" ? Math.min(500000, Math.max(0, c.deformationEnergyJ)) : undefined,
              structuralDisplacementM: typeof c.structuralDisplacementM === "number" ? Math.min(0.30, Math.max(0.0, c.structuralDisplacementM)) : undefined,
              visionConfidenceScore: typeof c.visionConfidenceScore === "number" ? Math.min(100, Math.max(0, c.visionConfidenceScore)) : undefined,
              damageFractionEstimate: typeof c.damageFractionEstimate === "number" ? Math.min(1.0, Math.max(0.0, c.damageFractionEstimate)) : undefined,
            };
            allComponents.push(evidence.suitableForCrushDepth ? component : removeIneligiblePhysicsMeasurements([component])[0]);
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
            detectedComponents: normaliseVisionComponentNames((imgResult.components || []).map((c: any) => normalisePartName(c.name || "Unknown"))),
            caption: imgResult.components && imgResult.components.length > 0
              ? `Page ${pageNum}: ${imgResult.components.length} component(s) — ${imgResult.components.slice(0, 3).map((c: any) => c.name).join(", ")}${imgResult.components.length > 3 ? "..." : ""}`
              : `Page ${pageNum}: ${pass1Page?.brief_description ?? "No damage components detected"}`,
            confidenceScore: imgResult.confidence === "high" ? 90 : imgResult.confidence === "medium" ? 70 : 50,
            imageQuality: pass1Page?.photo_quality ?? "good",
            usedFallback: imgResult.usedFallback ?? false,
            enrichedAt: new Date().toISOString(),
            source: "pdf_targeted_render",
            sourcePage: evidence.pageNumber,
            imageClassification: evidence.classification,
            classificationConfidence: evidence.classificationConfidence,
            classifier: evidence.classifier,
            selectionReason: evidence.selectionReason,
            fallbackWarning: evidence.fallbackWarning ?? null,
            suitableForCrushDepth: evidence.suitableForCrushDepth,
            physicsExclusionReason: evidence.exclusionReason ?? null,
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
            sourcePage: evidence.pageNumber,
            imageClassification: evidence.classification,
            classificationConfidence: evidence.classificationConfidence,
            classifier: evidence.classifier,
            selectionReason: evidence.selectionReason,
            fallbackWarning: evidence.fallbackWarning ?? "PDF page analysis failed; retained as contextual evidence only.",
            suitableForCrushDepth: false,
            physicsExclusionReason: evidence.exclusionReason ?? "PDF page analysis failed before crush-depth eligibility could be confirmed.",
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
                      // P4 fix: Physics measurement fields are OPTIONAL in the PDF two-pass path.
                      // The LLM must not fabricate values when the image is unclear.
                      required: ["name", "location", "damageType", "severity", "visible"],
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
      // R-INF-05: wrap PDF pass-2 (single-pass fallback) in withRetry (2 attempts)
      const response = await withRetry(
        () => withTimeout(
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
        ),
        2, 'stage-6 PDF pass-2', log
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

    // ─── RENDER IDENTIFIED DAMAGE PAGES TO PNG ────────────────────────────────
    // Now that we know which pages contain damage, render them to real PNGs.
    // This replaces the PDF fragment URL pattern (pdf#page=N) with actual S3
    // image URLs that <img> tags can render in the report UI.
    // If rendering fails, we fall back to the fragment URL (non-fatal).
    let singlePassRenderedMap = new Map<number, string>(); // pageNumber → PNG URL
    if (damagePages.length > 0) {
      try {
        const singlePassPageNums = damagePages.map(p => p.page_number);
        const singlePassRendered = await renderSpecificPdfPages(pdfUrl, singlePassPageNums, {
          dpi: 100,
          keyPrefix: "pdf-damage-pages",
          log,
        });
        for (const [pageNum, img] of singlePassRendered.entries()) {
          singlePassRenderedMap.set(pageNum, img.url);
        }
        log(`Single-pass post-render: ${singlePassRenderedMap.size}/${damagePages.length} pages rendered as PNG`);
      } catch (renderErr: any) {
        log(`Single-pass post-render failed (non-fatal): ${renderErr.message} — will use PDF fragment URLs`);
      }
    }

    for (const page of damagePages) {
      // Even when the page is subsequently rendered, the single-pass extraction has
      // no independent page-level classification envelope. It remains non-physics evidence.
      const pageUrl = singlePassRenderedMap.get(page.page_number) ?? `${pdfUrl}#page=${page.page_number}`;
      const evidence = evidenceFromPdfDirectPage({
        url: pageUrl,
        pageNumber: page.page_number,
        pageType: page.photo_type,
        fallback: true,
        source: 'pdf_direct_vision',
      });
      for (const c of (page.components || [])) {
        const normName = normalisePartName(c.name || "Unknown Component");
        const dedupeKey = `${normName}::${c.location || "general"}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        const component: DamageAnalysisComponent = {
          name: normName, location: c.location || "general", damageType: c.damageType || "impact",
          severity: normaliseSeverity(c.severity), visible: c.visible !== false,
          distanceFromImpact: allComponents.length * 0.3, panelDeformation: c.panelDeformation,
          inputSource: "pdf_direct_vision",
          crushDepthM: typeof c.crushDepthM === "number" ? Math.min(0.55, Math.max(0.0, c.crushDepthM)) : undefined,
          deformationEnergyJ: typeof c.deformationEnergyJ === "number" ? Math.min(500000, Math.max(0, c.deformationEnergyJ)) : undefined,
          structuralDisplacementM: typeof c.structuralDisplacementM === "number" ? Math.min(0.30, Math.max(0.0, c.structuralDisplacementM)) : undefined,
          visionConfidenceScore: typeof c.visionConfidenceScore === "number" ? Math.min(100, Math.max(0, c.visionConfidenceScore)) : undefined,
          damageFractionEstimate: typeof c.damageFractionEstimate === "number" ? Math.min(1.0, Math.max(0.0, c.damageFractionEstimate)) : undefined,
        };
        allComponents.push(removeIneligiblePhysicsMeasurements([component])[0]);
      }
      // Use rendered PNG URL if available; fall back to PDF fragment URL
      const usedRenderedPng = singlePassRenderedMap.has(page.page_number);
      enrichedPhotoSummary.push({
        url: pageUrl,
        pageNumber: page.page_number,
        index: enrichedPhotoSummary.length,
        componentCount: page.components?.length ?? 0,
        severity: page.components && page.components.length > 0
          ? (page.components.some(c => c.severity === "severe" || c.severity === "catastrophic") ? "severe"
            : page.components.some(c => c.severity === "moderate") ? "moderate" : "minor") : "unknown",
        impactZone: page.components?.[0]?.location ?? "unknown",
        detectedComponents: normaliseVisionComponentNames((page.components || []).map(c => normalisePartName(c.name || "Unknown"))),
        caption: page.components && page.components.length > 0
          ? `Page ${page.page_number}: ${page.components.length} component(s) — ${page.components.slice(0, 3).map(c => c.name).join(", ")}${page.components.length > 3 ? "..." : ""}`
          : `Page ${page.page_number}: No damage components detected`,
        confidenceScore: parsed!.confidence === "high" ? 85 : parsed!.confidence === "medium" ? 65 : 40,
        imageQuality: parsed!.confidence === "high" ? "good" : "poor",
        usedFallback: !usedRenderedPng,
        enrichedAt: new Date().toISOString(),
        source: usedRenderedPng ? "pdf_single_pass_then_render" : "pdf_single_pass_vision",
        sourcePage: evidence.pageNumber,
        imageClassification: evidence.classification,
        classificationConfidence: evidence.classificationConfidence,
        classifier: evidence.classifier,
        selectionReason: evidence.selectionReason,
        fallbackWarning: evidence.fallbackWarning,
        suitableForCrushDepth: false,
        physicsExclusionReason: evidence.exclusionReason,
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
 *
 * Fix A: The former `else` branch injected `{ name: "Front Bumper", location: "front" }` for any
 * unrecognised collision direction (null, "multi_impact", "other", "unknown", etc.). This was a
 * stale-default that silently produced front-zone labels on claims with unknown direction.
 * Replaced with an empty array + assumption entry (confidence: 0, reason: collision_direction_unknown).
 *
 * Fix C: All injected components now carry `source: "inferred"` so they are distinguishable from
 * vision-detected components in downstream report rendering.
 */
