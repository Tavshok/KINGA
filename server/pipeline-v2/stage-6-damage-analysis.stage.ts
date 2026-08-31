/** Stage 6 orchestration concern. Retains the public pipeline contract and degradation semantics. */
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
import { readDamageFromPhotos } from './stage-6-damage-analysis.vision';
import { inferDamageFromDescription } from './stage-6-damage-analysis.fallback';
import { mergeComponents } from './stage-6-damage-analysis.merge';

// CALIBRATION: high confidence that a direction-filtered component is an LLM vision error.
const DIRECTION_FILTER_EXCLUSION_CONFIDENCE = 0.85;

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
    const pdfPageUrls: string[] = ctx.pdfPageImageUrls ?? [];
    // Image Intelligence Layer: when using PDF pages as fallback, run the full
    // scoring pipeline (feature extraction → classification → dedup → quality rank)
    // to identify which pages are actual damage photos regardless of page position.
    let visionSourceUrls: string[];
    // P5: track per-URL provenance for inputSource stamping
    let visionSourceTagMap: Map<string, DamageAnalysisComponent['inputSource']> | undefined;
    // R2: retain exact source/classification/selection evidence for physics eligibility and reports.
    let visionEvidenceByUrl = new Map<string, ImageEvidenceEnvelope>();
    if (photoUrls.length > 0) {
      // Stage 2.6B semantic gate: filter out non-vehicle images (quotation scans,
      // documents, ID pages) that were classified by the semantic classifier.
      // Safe default: if no classification data exists, include all images (pre-fix behaviour).
      const semanticClassifications = ctx.semanticImageClassifications;
      const semanticFilteredUrls = semanticClassifications && semanticClassifications.size > 0
        ? photoUrls.filter(url => {
            const meta = semanticClassifications.get(url);
            if (!meta) return true; // Unknown URL → include (safe default)
            const eligible = meta.eligibleStages.includes('Stage6');
            if (!eligible) {
              ctx.log('Stage 6', `Semantic gate: excluding ${meta.imageId} (${meta.semanticType}, conf: ${(meta.semanticConfidence * 100).toFixed(0)}%) — not eligible for Stage 6`);
            }
            return eligible;
          })
        : photoUrls;
      visionSourceUrls = semanticFilteredUrls;
      const classifiedByUrl = new Map(
        [
          ...(ctx.classifiedImages?.damagePhotos ?? []),
          ...(ctx.classifiedImages?.vehicleOverviews ?? []),
          ...(ctx.classifiedImages?.quotationImages ?? []),
          ...(ctx.classifiedImages?.documentPages ?? []),
          ...(ctx.classifiedImages?.fallbackPool ?? []),
        ].map((image) => [image.url, image])
      );
      for (const url of semanticFilteredUrls) {
        const semantic = semanticClassifications?.get(url);
        const classified = classifiedByUrl.get(url);
        const evidence = semantic
          ? evidenceFromSemanticImage(semantic)
          : classified
            ? evidenceFromClassifiedImage(classified)
            : {
                url,
                source: 'unknown' as const,
                classifier: 'unknown' as const,
                selectionReason: 'Image classification metadata was unavailable; retained for non-physics damage analysis only.',
                suitableForCrushDepth: false,
                exclusionReason: 'No source classification provenance is available for crush-depth measurement.',
              };
        visionEvidenceByUrl.set(url, evidence);
      }
      visionSourceTagMap = new Map(semanticFilteredUrls.map((url) => [
        url,
        visionEvidenceByUrl.get(url)?.suitableForCrushDepth
          ? ('confirmed_damage_photo' as const)
          : ('ambiguous_page' as const),
      ]));
    } else if (pdfPageUrls.length > 0) {
      const scoredPages = await selectDamagePhotoPages(pdfPageUrls, ctx);
      visionSourceUrls = scoredPages.map(p => p.url);
      visionEvidenceByUrl = new Map(scoredPages.map((page) => [
        page.url,
        evidenceFromScoredPdfPage(page),
      ]));
      // P5: tag each selected page based on imageIntelligence classification AND confidence.
      // HIGH or MEDIUM confidence damage_photo → confirmed_damage_photo
      //   Rationale: PDF-embedded damage photos are the dominant real-world submission pattern.
      //   imageIntelligence correctly identifies them as damage_photo but scores MEDIUM because
      //   the feature extractor sees document-page characteristics (aspect ratio, layout).
      //   Previously, MEDIUM was mapped to ambiguous_page which caused visionSourceReliability=LOW
      //   and excluded crush depths from the physics consensus for all 7 PDF-photo claims.
      //   Fix (2026-07-13): MEDIUM confidence damage_photo → confirmed_damage_photo → MEDIUM reliability.
      // LOW confidence or non-damage_photo → ambiguous_page
      visionSourceTagMap = new Map(scoredPages.map((page) => [
        page.url,
        visionEvidenceByUrl.get(page.url)?.suitableForCrushDepth
          ? ('confirmed_damage_photo' as const)
          : ('ambiguous_page' as const),
      ]));
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
      ctx.enrichedPhotosJson = pdfVisionResult.enrichedPhotosJson;
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
        damageLikelihoodScores.size > 0 ? damageLikelihoodScores : undefined,
        visionSourceTagMap,
        visionEvidenceByUrl
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
            // CALIBRATION: this represents high confidence that the excluded components are LLM vision errors.
            confidence: DIRECTION_FILTER_EXCLUSION_CONFIDENCE,
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
        const enriched: Array<{ confidenceScore: number }> = JSON.parse(ctx.enrichedPhotosJson ?? "[]");
        const scored = enriched.filter((e) => e.confidenceScore > 0);
        imageConfidenceScore = scored.length > 0
          ? Math.round(scored.reduce((s, e) => s + e.confidenceScore, 0) / scored.length)
          : 40;
      } catch {
        imageConfidenceScore = 40;
      }
    }
    const analysisFromPhotos = visionParts.length > 0;

    // P6: Compute visionSourceReliability based on the image source path taken
    let visionSourceReliability: Stage6Output['visionSourceReliability'] = 'NONE';
    if (visionParts.length > 0) {
      if (photoUrls.length > 0) {
        // Dedicated damage photos — always HIGH (user or adjuster explicitly uploaded these)
        visionSourceReliability = 'HIGH';
      } else if (pdfPageUrls.length > 0) {
        // Determine reliability from imageIntelligence confidence levels.
        // HIGH or MEDIUM confidence damage_photo pages → MEDIUM reliability (not LOW).
        // All ambiguous_page → LOW reliability.
        const confirmedCount = visionSourceTagMap
          ? Array.from(visionSourceTagMap.values()).filter(v => v === 'confirmed_damage_photo').length
          : 0;
        visionSourceReliability = confirmedCount > 0 ? 'MEDIUM' : 'LOW';
      } else if (ctx.pdfUrl) {
        // PDF direct vision — LLM classifies pages itself; treat as MEDIUM
        visionSourceReliability = 'MEDIUM';
      }
    }
    if (visionSourceReliability === 'LOW') {
      ctx.log(
        'Stage 6',
        '[P6] visionSourceReliability=LOW: imageIntelligence found no damage_photo pages (all ambiguous or LOW confidence). ' +
        'Crush depths from this run will be excluded from physics consensus by Stage 7.'
      );
    } else if (visionSourceReliability === 'MEDIUM' && pdfPageUrls.length > 0) {
      const confirmedCount = visionSourceTagMap
        ? Array.from(visionSourceTagMap.values()).filter(v => v === 'confirmed_damage_photo').length
        : 0;
      ctx.log(
        'Stage 6',
        `[P6] visionSourceReliability=MEDIUM: ${confirmedCount} PDF page(s) classified as damage_photo ` +
        '(HIGH or MEDIUM confidence). Crush depths will enter physics consensus at MEDIUM confidence with appropriate disclosure.'
      );
    }

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
      visionSourceReliability,
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
