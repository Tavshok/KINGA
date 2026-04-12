/**
 * Photo Enrichment Service — Stage 11
 *
 * For each uploaded damage photo:
 *   1. Runs a vision LLM pass to detect impact zone, damaged components, and severity.
 *   2. Assigns a per-image confidence score (0–100).
 *   3. Cross-checks findings against:
 *      a. The reported damage description from the claim form.
 *      b. The AI-extracted component list from earlier pipeline stages.
 *
 * Output shape:
 *   enriched_photos: EnrichedPhoto[]
 *   inconsistencies: PhotoInconsistency[]
 */

import { invokeLLM } from "../_core/llm";

// ── Reliability helpers ────────────────────────────────────────────────────

const PHOTO_TIMEOUT_MS = 45_000;
const PHOTO_RETRIES = 2;

async function withTimeout<T>(fn: () => Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Vision call timed out after ${ms}ms`)), ms);
    fn().then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });
}

async function withRetry<T>(fn: () => Promise<T>, retries: number): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try { return await fn(); } catch (e) {
      lastErr = e;
      if (attempt < retries) await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
    }
  }
  throw lastErr;
}

async function isUrlAccessible(url: string): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const r = await fetch(url, { method: 'GET', signal: ctrl.signal }).catch(() => null);
    clearTimeout(t);
    return r ? r.status < 400 : true;
  } catch { return true; }
}

// ── Types ──────────────────────────────────────────────────────────────────

export type DamageSeverity = 'minor' | 'moderate' | 'severe' | 'critical';

export interface EnrichedPhoto {
  /** Original URL of the uploaded image */
  url: string;
  /** Index in the original photo array (0-based) */
  index: number;
  /** Primary impact zone detected in this photo */
  impactZone: string;
  /** Damaged components visible in this photo */
  detectedComponents: string[];
  /** Overall severity of damage visible in this photo */
  severity: DamageSeverity;
  /** Confidence score 0–100 for the vision analysis */
  confidenceScore: number;
  /** Human-readable caption describing what the photo shows */
  caption: string;
  /** Whether the photo is clear enough for reliable analysis */
  imageQuality: 'good' | 'poor' | 'unusable';
  /** Timestamp when enrichment was run */
  enrichedAt: string;
}

export interface PhotoInconsistency {
  /** Which photo triggered this inconsistency (0-based index) */
  photoIndex: number;
  /** URL of the photo */
  photoUrl: string;
  /** Type of inconsistency */
  type: 'zone_mismatch' | 'component_mismatch' | 'severity_mismatch' | 'unreported_damage';
  /** Human-readable description */
  description: string;
  /** Severity of the inconsistency itself */
  severity: 'low' | 'medium' | 'high';
  /** What was found in the photo */
  photoFinding: string;
  /** What was reported / expected */
  reportedValue: string;
}

export interface PhotoEnrichmentResult {
  enriched_photos: EnrichedPhoto[];
  inconsistencies: PhotoInconsistency[];
  /** Summary statistics */
  summary: {
    totalPhotos: number;
    analyzedPhotos: number;
    unusablePhotos: number;
    inconsistencyCount: number;
    averageConfidence: number;
  };
}

// ── Per-image vision analysis ──────────────────────────────────────────────

/** Simpler fallback prompt when primary returns invalid/empty response */
async function analyzePhotoFallback(url: string, index: number): Promise<EnrichedPhoto> {
  try {
    const response = await withRetry(
      () => withTimeout(() => invokeLLM({
        messages: [
          { role: 'system', content: 'You are a vehicle damage assessor. Describe any visible vehicle damage in the image. Return JSON only.' },
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url, detail: 'low' } },
              { type: 'text', text: 'Describe visible vehicle damage. If no vehicle or damage is visible, say so. Return JSON with: impactZone (string), detectedComponents (array of strings), severity (minor|moderate|severe|critical), confidenceScore (0-100), caption (string), imageQuality (good|poor|unusable).' },
            ],
          },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'photo_analysis_fallback',
            strict: true,
            schema: {
              type: 'object',
              properties: {
                impactZone: { type: 'string' },
                detectedComponents: { type: 'array', items: { type: 'string' } },
                severity: { type: 'string', enum: ['minor', 'moderate', 'severe', 'critical'] },
                confidenceScore: { type: 'integer' },
                caption: { type: 'string' },
                imageQuality: { type: 'string', enum: ['good', 'poor', 'unusable'] },
              },
              required: ['impactZone', 'detectedComponents', 'severity', 'confidenceScore', 'caption', 'imageQuality'],
              additionalProperties: false,
            },
          },
        },
      }), PHOTO_TIMEOUT_MS),
      1 // only 1 retry for fallback
    );
    const content = response?.choices?.[0]?.message?.content;
    const parsed = typeof content === 'string' ? JSON.parse(content) : content;
    if (!parsed?.impactZone) return buildFallbackPhoto(url, index, 'Fallback prompt also returned invalid response');
    return {
      url, index,
      impactZone: parsed.impactZone,
      detectedComponents: Array.isArray(parsed.detectedComponents) ? parsed.detectedComponents : [],
      severity: parsed.severity ?? 'moderate',
      confidenceScore: Math.min(100, Math.max(0, Number(parsed.confidenceScore) || 30)),
      caption: parsed.caption ?? '',
      imageQuality: parsed.imageQuality ?? 'poor',
      enrichedAt: new Date().toISOString(),
    };
  } catch (err) {
    return buildFallbackPhoto(url, index, `Fallback failed: ${String(err)}`);
  }
}

async function analyzePhoto(
  url: string,
  index: number,
): Promise<EnrichedPhoto> {
  // Pre-validate URL (non-blocking — assume accessible on network error)
  const accessible = await isUrlAccessible(url);
  if (!accessible) {
    return buildFallbackPhoto(url, index, 'Image URL returned HTTP 4xx/5xx — skipped');
  }
  const systemPrompt =
    'You are a vehicle damage analysis assistant.\n\n' +
    'Your task is to describe visible damage objectively.\n\n' +
    'Rules:\n' +
    '- Only describe what is visible\n' +
    '- Do NOT infer cause\n' +
    '- Do NOT speculate about unseen areas\n' +
    '- Use precise mechanical terms where possible';

  const userPrompt =
    'INPUT:\n' +
    'Vehicle damage images\n\n' +
    'TASK:\n' +
    'Summarize visible damage including:\n' +
    '- damaged areas (front, rear, side)\n' +
    '- components affected (bumper, hood, doors, etc. use the right terminology)\n' +
    '- severity (minor, moderate, severe)\n' +
    '- any notable patterns (localized, widespread, directional)\n\n' +
    'Also identify:\n' +
    '- primary impact zone: front | rear | left_side | right_side | roof | underbody | interior | engine_bay\n' +
    '- image quality: good | poor | unusable\n' +
    '- confidence score 0–100 (deduct for poor image quality, obstructions, or ambiguity)\n' +
    '- a one-sentence objective caption of what the photo shows\n\n' +
    'Return structured JSON.';

  try {
    const response = await withRetry(
      () => withTimeout(() => invokeLLM({
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url, detail: 'high' } },
            { type: 'text', text: userPrompt },
          ],
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'photo_analysis',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              impactZone: { type: 'string' },
              detectedComponents: { type: 'array', items: { type: 'string' } },
              severity: { type: 'string', enum: ['minor', 'moderate', 'severe', 'critical'] },
              confidenceScore: { type: 'integer' },
              caption: { type: 'string' },
              imageQuality: { type: 'string', enum: ['good', 'poor', 'unusable'] },
            },
            required: ['impactZone', 'detectedComponents', 'severity', 'confidenceScore', 'caption', 'imageQuality'],
            additionalProperties: false,
          },
        },
      },
    }), PHOTO_TIMEOUT_MS),
    PHOTO_RETRIES
    );

    const content = response?.choices?.[0]?.message?.content;
    const parsed = typeof content === 'string' ? JSON.parse(content) : content;

    if (!parsed || !parsed.impactZone) {
      // Fallback: try a simpler prompt if primary returned invalid
      return await analyzePhotoFallback(url, index);
    }

    return {
      url,
      index,
      impactZone: parsed.impactZone,
      detectedComponents: Array.isArray(parsed.detectedComponents) ? parsed.detectedComponents : [],
      severity: parsed.severity ?? 'moderate',
      confidenceScore: Math.min(100, Math.max(0, Number(parsed.confidenceScore) || 50)),
      caption: parsed.caption ?? '',
      imageQuality: parsed.imageQuality ?? 'good',
      enrichedAt: new Date().toISOString(),
    };
  } catch (err) {
    return buildFallbackPhoto(url, index, String(err));
  }
}

function buildFallbackPhoto(url: string, index: number, reason: string): EnrichedPhoto {
  return {
    url,
    index,
    impactZone: 'unknown',
    detectedComponents: [],
    severity: 'moderate',
    confidenceScore: 0,
    caption: `Analysis unavailable: ${reason}`,
    imageQuality: 'poor',
    enrichedAt: new Date().toISOString(),
  };
}

// ── Cross-check logic ──────────────────────────────────────────────────────

function crossCheck(
  enrichedPhotos: EnrichedPhoto[],
  reportedDamageDescription: string | null | undefined,
  aiExtractedComponents: string[],
): PhotoInconsistency[] {
  const inconsistencies: PhotoInconsistency[] = [];

  // Normalise helpers
  const normalise = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
  const reportedText = normalise(reportedDamageDescription ?? '');
  const extractedNorm = aiExtractedComponents.map(normalise);

  for (const photo of enrichedPhotos) {
    if (photo.imageQuality === 'unusable') continue;

    // 1. Check each detected component against AI-extracted list
    for (const component of photo.detectedComponents) {
      const norm = normalise(component);
      const inExtracted = extractedNorm.some(e => e.includes(norm) || norm.includes(e));
      const inReported = reportedText.includes(norm);

      if (!inExtracted && !inReported) {
        inconsistencies.push({
          photoIndex: photo.index,
          photoUrl: photo.url,
          type: 'unreported_damage',
          description: `Photo ${photo.index + 1} shows "${component}" damage that was not reported or extracted by the AI assessment.`,
          severity: photo.severity === 'critical' || photo.severity === 'severe' ? 'high' : 'medium',
          photoFinding: component,
          reportedValue: 'Not mentioned in claim or AI assessment',
        });
      }
    }

    // 2. Check impact zone against reported description
    const zone = normalise(photo.impactZone);
    if (zone !== 'unknown' && reportedText && !reportedText.includes(zone)) {
      // Only flag if zone is very specific (not generic like "front" which may appear in many claims)
      const specificZones = ['roof', 'underbody', 'interior', 'engine_bay', 'engine bay'];
      if (specificZones.some(z => zone.includes(z))) {
        inconsistencies.push({
          photoIndex: photo.index,
          photoUrl: photo.url,
          type: 'zone_mismatch',
          description: `Photo ${photo.index + 1} shows damage in the "${photo.impactZone}" zone, which was not mentioned in the reported damage description.`,
          severity: 'medium',
          photoFinding: photo.impactZone,
          reportedValue: 'Not mentioned in damage description',
        });
      }
    }

    // 3. Flag critical severity photos that are not reflected in AI assessment
    if (photo.severity === 'critical' && photo.confidenceScore >= 60) {
      const hasCriticalInExtracted = extractedNorm.some(
        e => e.includes('critical') || e.includes('severe') || e.includes('total')
      );
      if (!hasCriticalInExtracted) {
        inconsistencies.push({
          photoIndex: photo.index,
          photoUrl: photo.url,
          type: 'severity_mismatch',
          description: `Photo ${photo.index + 1} indicates critical damage severity, but this is not reflected in the AI-extracted component list.`,
          severity: 'high',
          photoFinding: `Critical severity — ${photo.detectedComponents.join(', ')}`,
          reportedValue: 'No critical severity components in AI assessment',
        });
      }
    }
  }

  // Deduplicate by description
  const seen = new Set<string>();
  return inconsistencies.filter(inc => {
    if (seen.has(inc.description)) return false;
    seen.add(inc.description);
    return true;
  });
}

// ── Main entry point ───────────────────────────────────────────────────────

export interface PhotoEnrichmentInput {
  /** Array of photo URLs to analyse */
  photoUrls: string[];
  /** Reported damage description from the claim form */
  reportedDamageDescription?: string | null;
  /** Components already extracted by earlier AI pipeline stages */
  aiExtractedComponents?: string[];
  /** Maximum number of photos to analyse (default: 20) */
  maxPhotos?: number;
}

export async function enrichDamagePhotos(
  input: PhotoEnrichmentInput,
): Promise<PhotoEnrichmentResult> {
  const {
    photoUrls,
    reportedDamageDescription,
    aiExtractedComponents = [],
    maxPhotos = 20,
  } = input;

  // Cap the number of photos to avoid excessive LLM calls
  const urlsToProcess = photoUrls.slice(0, maxPhotos);

  // Run vision analysis in parallel (up to 5 concurrent to avoid rate limits)
  const CONCURRENCY = 5;
  const enrichedPhotos: EnrichedPhoto[] = [];

  for (let i = 0; i < urlsToProcess.length; i += CONCURRENCY) {
    const batch = urlsToProcess.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map((url, batchIdx) => analyzePhoto(url, i + batchIdx))
    );
    enrichedPhotos.push(...results);
  }

  // Cross-check findings
  const inconsistencies = crossCheck(
    enrichedPhotos,
    reportedDamageDescription,
    aiExtractedComponents,
  );

  // Summary statistics
  const analyzedPhotos = enrichedPhotos.filter(p => p.imageQuality !== 'unusable').length;
  const unusablePhotos = enrichedPhotos.filter(p => p.imageQuality === 'unusable').length;
  const totalConfidence = enrichedPhotos
    .filter(p => p.confidenceScore > 0)
    .reduce((sum, p) => sum + p.confidenceScore, 0);
  const averageConfidence =
    analyzedPhotos > 0 ? Math.round(totalConfidence / analyzedPhotos) : 0;

  return {
    enriched_photos: enrichedPhotos,
    inconsistencies,
    summary: {
      totalPhotos: urlsToProcess.length,
      analyzedPhotos,
      unusablePhotos,
      inconsistencyCount: inconsistencies.length,
      averageConfidence,
    },
  };
}
