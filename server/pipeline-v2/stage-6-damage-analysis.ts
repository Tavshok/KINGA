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

const MAX_VISION_PHOTOS = 6;   // Process up to 6 images independently
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

// ── Utility: quick URL accessibility check (non-blocking) ────────────────────
// Returns true if the URL responds with <400. Falls back to true on network
// errors so that a proxy/CORS issue never silently drops a valid URL.
async function isUrlAccessible(url: string): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const r = await fetch(url, { method: "GET", signal: ctrl.signal }).catch(() => null);
    clearTimeout(t);
    return r ? r.status < 400 : true;
  } catch {
    return true; // non-blocking — assume accessible on error
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
              name: { type: "string" },
              location: { type: "string" },
              damageType: { type: "string" },
              severity: {
                type: "string",
                enum: ["cosmetic", "minor", "moderate", "severe", "catastrophic"],
              },
              visible: { type: "boolean" },
              notes: { type: "string" },
            },
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
          content: `You are an expert vehicle damage assessor for insurance claims in South Africa.
Analyse the provided vehicle damage photo and identify EVERY visibly damaged component.

PART NAMING — CRITICAL: You MUST use ONLY the following authorised part names. Never invent, abbreviate, or misspell a part name. If the damaged part is not in this list, choose the CLOSEST match:
${CANONICAL_PARTS_PROMPT_LIST}

Side prefix rules:
  - "LH" for left-hand (driver) side, "RH" for right-hand (passenger) side
  - Example: "LH Front Door", "RH Tail Lamp Assembly", "LH A-Pillar"
  - Use "Bonnet" (not Hood), "Boot Lid" (not Trunk), "Windscreen" (not Windshield)

CRITICAL RULES:
  - If the image is blurry, dark, or partially obscured, STILL extract any visible damage
  - Do NOT return an empty components array unless absolutely no vehicle damage is visible
  - If uncertain about a component name, choose the closest authorised name from the list above
  - Infer likely damage zones conservatively from visible evidence
  - Always return at least one component if any damage is visible
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
      const fallbackCall = () => withTimeout(
        () => invokeLLM({
          messages: [
            {
              role: "system",
              content: `You are a vehicle damage assessor. Look at this vehicle photo and describe any damage you can see.
Even if the image is unclear, identify any visible dents, scratches, broken parts, or deformation.
Use ONLY these authorised SA/Audatex ZA part names: ${CANONICAL_PARTS_PROMPT_LIST}
Return JSON only.`,
            },
            {
              role: "user",
              content: [
                {
                  type: "text" as const,
                  text: `Vehicle: ${vehicleContext || "Unknown vehicle"}.
Describe any vehicle damage visible in this image. If you can see any damage at all, list the affected components.
If the image shows no vehicle or no damage, return an empty components array.`,
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
 * HARDENED IMPLEMENTATION:
 *   - Pre-validates each URL (skips inaccessible ones)
 *   - Processes each image independently (one failure ≠ all fail)
 *   - Retries each image up to 2× with timeout
 *   - Falls back to simpler prompt if primary returns 0 components
 *   - Applies minimum success threshold (≥50% images must succeed)
 *   - Merges per-image results with deduplication
 *   - Flags degraded mode and surfaces failure rate in assumptions
 */
async function readDamageFromPhotos(
  photoUrls: string[],
  claimRecord: ClaimRecord,
  ctx: PipelineContext,
  assumptions: Assumption[],
  recoveryActions: RecoveryAction[]
): Promise<DamageAnalysisComponent[]> {
  const urls = photoUrls.slice(0, MAX_VISION_PHOTOS);
  if (urls.length === 0) return [];

  ctx.log("Stage 6", `Vision: starting hardened analysis of ${urls.length} image(s)`);

  // ── STEP A: Pre-validate URLs ─────────────────────────────────────────────
  const validatedUrls: string[] = [];
  for (const url of urls) {
    const accessible = await isUrlAccessible(url);
    if (accessible) {
      validatedUrls.push(url);
    } else {
      ctx.log("Stage 6", `Vision: skipping inaccessible URL (HTTP 4xx/5xx): ${url.slice(0, 80)}...`);
      recoveryActions.push({
        target: "vision_image_url",
        strategy: "skip",
        success: false,
        description: `Image URL returned HTTP 4xx/5xx and was skipped: ${url.slice(0, 80)}`,
      });
    }
  }

  if (validatedUrls.length === 0) {
    ctx.log("Stage 6", "Vision: all image URLs failed pre-validation — skipping vision analysis");
    recoveryActions.push({
      target: "vision_damage_extraction",
      strategy: "skip",
      success: false,
      description: "All image URLs failed accessibility check. Vision analysis skipped.",
    });
    return [];
  }

  ctx.log("Stage 6", `Vision: ${validatedUrls.length}/${urls.length} URL(s) passed pre-validation`);

  const vehicleContext = [
    claimRecord.vehicle.make,
    claimRecord.vehicle.model,
    claimRecord.vehicle.year,
  ].filter(Boolean).join(" ");

  const collisionDirection = claimRecord.accidentDetails.collisionDirection || "unknown";

  // ── STEP B: Process each image independently ──────────────────────────────
  const perImageResults: Array<{
    url: string;
    components: DamageAnalysisComponent[];
    confidence: string;
    usedFallback: boolean;
    succeeded: boolean;
  }> = [];

  for (let i = 0; i < validatedUrls.length; i++) {
    const url = validatedUrls[i];
    try {
      const result = await analyseOneImage(
        url,
        i,
        vehicleContext,
        collisionDirection,
        (msg) => ctx.log("Stage 6", msg)
      );
      perImageResults.push({ url, ...result, succeeded: true });
    } catch (e) {
      ctx.log("Stage 6", `Vision: image[${i}] completely failed: ${String(e)}`);
      perImageResults.push({ url, components: [], confidence: "low", usedFallback: false, succeeded: false });
    }
  }

  // ── STEP C: Apply minimum success threshold ───────────────────────────────
  const succeededCount = perImageResults.filter((r) => r.succeeded).length;
  const successRate = succeededCount / validatedUrls.length;
  const failedCount = validatedUrls.length - succeededCount;

  ctx.log(
    "Stage 6",
    `Vision: ${succeededCount}/${validatedUrls.length} images succeeded (${Math.round(successRate * 100)}%)`
  );

  if (successRate < MIN_SUCCESS_THRESHOLD) {
    ctx.log("Stage 6", `Vision: success rate ${Math.round(successRate * 100)}% below threshold (${MIN_SUCCESS_THRESHOLD * 100}%) — flagging as degraded`);
    recoveryActions.push({
      target: "vision_success_threshold",
      strategy: "partial_data",
      success: false,
      description: `Only ${succeededCount}/${validatedUrls.length} images analysed successfully (${Math.round(successRate * 100)}%). Below ${MIN_SUCCESS_THRESHOLD * 100}% threshold. Results may be incomplete.`,
    });
  }

  // ── STEP D: Merge per-image results (deduplication by part name) ──────────
  const allComponents: DamageAnalysisComponent[] = [];
  const seenNames = new Set<string>();

  for (const result of perImageResults) {
    for (const comp of result.components) {
      const key = comp.name.toLowerCase().trim();
      if (!seenNames.has(key)) {
        seenNames.add(key);
        allComponents.push(comp);
      }
    }
  }

  // Recalculate distanceFromImpact after merge
  allComponents.forEach((c, i) => { c.distanceFromImpact = i * 0.3; });

  // ── STEP E: Record assumptions and recovery actions ───────────────────────
  const fallbackCount = perImageResults.filter((r) => r.usedFallback).length;
  const overallConfidence =
    allComponents.length === 0 ? "low"
    : successRate >= 0.8 ? "high"
    : successRate >= 0.5 ? "medium"
    : "low";

  if (allComponents.length > 0) {
    assumptions.push({
      field: "damagedParts",
      assumedValue: `${allComponents.length} vision-extracted components`,
      reason: `LLM vision analysis of ${validatedUrls.length} image(s): ${succeededCount} succeeded, ${failedCount} failed. ` +
        `${fallbackCount > 0 ? `${fallbackCount} image(s) used fallback prompt. ` : ""}` +
        `Extracted ${allComponents.length} unique components. Overall confidence: ${overallConfidence}.`,
      strategy: "llm_vision",
      confidence: overallConfidence === "high" ? 85 : overallConfidence === "medium" ? 65 : 40,
      stage: "Stage 6",
    });
    recoveryActions.push({
      target: "damagedParts",
      strategy: "llm_vision",
      success: true,
      description: `Hardened vision analysis: ${succeededCount}/${validatedUrls.length} images processed, ` +
        `${allComponents.length} components extracted (success rate: ${Math.round(successRate * 100)}%).`,
    });
  } else {
    // All images failed or returned 0 components
    recoveryActions.push({
      target: "vision_damage_extraction",
      strategy: "skip",
      success: false,
      description: `Vision analysis completed but extracted 0 components from ${validatedUrls.length} image(s). ` +
        `Success rate: ${Math.round(successRate * 100)}%. Falling back to structured data.`,
    });
  }

  // ── STEP F: Failure rate monitoring ──────────────────────────────────────
  if (failedCount > 0) {
    assumptions.push({
      field: "imageAnalysisFailureRate",
      assumedValue: `${Math.round((1 - successRate) * 100)}%`,
      reason: `${failedCount} of ${validatedUrls.length} image(s) failed vision analysis. ` +
        `Target failure rate: <5%. Current: ${Math.round((1 - successRate) * 100)}%.`,
      strategy: "none",
      confidence: 100,
      stage: "Stage 6",
    });
  }

  ctx.log(
    "Stage 6",
    `Vision complete: ${allComponents.length} unique components from ${succeededCount}/${validatedUrls.length} images` +
    (fallbackCount > 0 ? ` (${fallbackCount} used fallback prompt)` : "")
  );

  // ── STEP G: Persist enriched photo metadata to ctx ────────────────────────
  // Stage 7 and Stage 7b read (ctx as any).enrichedPhotosJson for severity consensus
  // and causal reasoning. Without this, downstream stages always get null.
  const enrichedPhotoSummary = perImageResults.map((r, idx) => ({
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

  return allComponents;
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
    const visionSourceUrls = photoUrls.length > 0 ? photoUrls : pdfPageUrls;
    let visionParts: DamageAnalysisComponent[] = [];

    if (visionSourceUrls.length > 0) {
      if (photoUrls.length === 0 && pdfPageUrls.length > 0) {
        ctx.log("Stage 6", `No damage photos — using ${pdfPageUrls.length} PDF page images as visual evidence fallback`);
        recoveryActions.push({
          target: "damagePhotoUrls",
          strategy: "partial_data",
          success: true,
          description: `No dedicated damage photos provided. Using ${pdfPageUrls.length} PDF page renders for visual damage analysis.`,
        });
      }
      visionParts = await readDamageFromPhotos(visionSourceUrls, claimRecord, ctx, assumptions, recoveryActions);
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

    const rawOutput: Stage6Output = {
      damagedParts,
      damageZones,
      overallSeverityScore,
      structuralDamageDetected,
      totalDamageArea: claimRecord.accidentDetails.totalDamageAreaM2 || 0,
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
