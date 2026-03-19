/**
 * Damage Consistency Engine
 *
 * Compares three independent damage evidence sources:
 *   1. Document-extracted damage  (damagedComponentsJson + damageDescription from AI assessment)
 *   2. Photo-detected damage      (enrichedPhotosJson from Stage 11 photo enrichment)
 *   3. Physics impact zone        (physicsAnalysis.primaryImpactZone + damageConsistency)
 *
 * Produces a consistency_score (0–100) and a typed mismatches[] list.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type MismatchType =
  | "zone_mismatch"
  | "component_unreported"
  | "component_not_visible"
  | "severity_mismatch"
  | "physics_zone_conflict"
  | "photo_zone_conflict"
  | "no_photo_evidence"
  | "no_document_evidence";

export interface DamageMismatch {
  type: MismatchType;
  severity: "low" | "medium" | "high";
  details: string;
  source_a?: string;
  source_b?: string;
  component?: string;
}

export type ConsistencyCheckStatus = "complete" | "pending_inputs";

/** Returned when pre-conditions are not met — check is not run */
export interface PendingInputsResult {
  status: "pending_inputs";
  missing_conditions: string[];
  checked_at: string;
}

export interface ConsistencyCheckResult {
  status: "complete";
  consistency_score: number;          // 0–100 (100 = fully consistent)
  confidence: "HIGH" | "MEDIUM" | "LOW";
  /** Calibrated composite score in [0.00, 1.00] from three-signal engine */
  confidence_score: number;
  mismatches: DamageMismatch[];
  source_summary: {
    document: { zones: string[]; components: string[]; available: boolean };
    photos: { zones: string[]; components: string[]; available: boolean };
    physics: { primaryZone: string | null; available: boolean };
  };
  checked_at: string;                 // ISO timestamp
  source: "auto" | "manual";          // how the check was triggered
}

export type ConsistencyCheckOutput = ConsistencyCheckResult | PendingInputsResult;

// ─── Zone normalisation ───────────────────────────────────────────────────────

const ZONE_ALIASES: Record<string, string> = {
  front: "front", frontal: "front", "front-end": "front", hood: "front",
  bumper_front: "front", "front bumper": "front",
  rear: "rear", back: "rear", "rear-end": "rear", trunk: "rear",
  bumper_rear: "rear", "rear bumper": "rear",
  left: "left", driver: "left", "driver side": "left", "left side": "left",
  right: "right", passenger: "right", "passenger side": "right", "right side": "right",
  side: "side",
  roof: "roof", top: "roof",
  undercarriage: "undercarriage", underbody: "undercarriage", floor: "undercarriage",
  interior: "interior", cabin: "interior",
};

function normaliseZone(raw: string): string {
  const lower = raw.toLowerCase().trim();
  for (const [alias, canonical] of Object.entries(ZONE_ALIASES)) {
    if (lower.includes(alias)) return canonical;
  }
  return lower;
}

/** Infer likely impact zone from a component name */
function zoneFromComponent(component: string): string | null {
  const c = component.toLowerCase();
  if (/front bumper|hood|grille|headlight|radiator|front fender|front wheel/.test(c)) return "front";
  if (/rear bumper|trunk|tail|rear fender|rear wheel|spare/.test(c)) return "rear";
  if (/left door|driver door|left fender|left mirror|left quarter/.test(c)) return "left";
  if (/right door|passenger door|right fender|right mirror|right quarter/.test(c)) return "right";
  if (/roof|sunroof|moonroof/.test(c)) return "roof";
  if (/floor|underbody|frame|subframe|axle|suspension/.test(c)) return "undercarriage";
  if (/door|window|glass|mirror/.test(c)) return "side";
  return null;
}

/** Zones considered adjacent (damage can legitimately spread) */
const ADJACENT_ZONES: Record<string, string[]> = {
  front: ["left", "right", "undercarriage"],
  rear: ["left", "right", "undercarriage"],
  left: ["front", "rear", "roof"],
  right: ["front", "rear", "roof"],
  roof: ["left", "right"],
  undercarriage: ["front", "rear"],
  side: ["left", "right", "front", "rear"],
  interior: ["roof", "side"],
};

function zonesConflict(zoneA: string, zoneB: string): boolean {
  if (zoneA === zoneB) return false;
  if (zoneA === "side" || zoneB === "side") return false; // "side" is ambiguous
  const adj = ADJACENT_ZONES[zoneA] ?? [];
  return !adj.includes(zoneB);
}

// ─── Source parsers ───────────────────────────────────────────────────────────

interface DocumentSource {
  zones: string[];
  components: string[];
}

function parseDocumentSource(
  damagedComponentsJson: string | null,
  damageDescription: string | null,
): DocumentSource {
  const components: string[] = [];

  if (damagedComponentsJson) {
    try {
      const parsed = JSON.parse(damagedComponentsJson);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (typeof item === "string") components.push(item);
          else if (item?.name) components.push(item.name);
          else if (item?.component) components.push(item.component);
        }
      }
    } catch { /* ignore */ }
  }

  // Also extract component mentions from free-text description
  if (damageDescription) {
    const keywords = [
      "bumper", "hood", "fender", "door", "windshield", "headlight", "taillight",
      "mirror", "trunk", "roof", "quarter panel", "grille", "radiator", "frame",
      "airbag", "window", "glass", "wheel", "tire",
    ];
    for (const kw of keywords) {
      if (damageDescription.toLowerCase().includes(kw) && !components.some(c => c.toLowerCase().includes(kw))) {
        components.push(kw);
      }
    }
  }

  const zones = Array.from(new Set(
    components.map(zoneFromComponent).filter((z): z is string => z !== null).map(normaliseZone)
  ));

  return { zones, components };
}

interface PhotoSource {
  zones: string[];
  components: string[];
}

function parsePhotoSource(enrichedPhotosJson: string | null): PhotoSource {
  if (!enrichedPhotosJson) return { zones: [], components: [] };

  try {
    const photos: any[] = JSON.parse(enrichedPhotosJson);
    const zones: string[] = [];
    const components: string[] = [];

    for (const photo of photos) {
      if (photo?.impactZone && photo.impactZone !== "unknown") {
        zones.push(normaliseZone(photo.impactZone));
      }
      if (Array.isArray(photo?.detectedComponents)) {
        for (const c of photo.detectedComponents) {
          if (typeof c === "string" && !components.includes(c)) components.push(c);
        }
      }
    }

    return { zones: Array.from(new Set(zones)), components };
  } catch {
    return { zones: [], components: [] };
  }
}

interface PhysicsSource {
  primaryZone: string | null;
  consistencyScore: number | null;
  inconsistencies: string[];
}

function parsePhysicsSource(physicsAnalysisJson: string | null): PhysicsSource {
  if (!physicsAnalysisJson) return { primaryZone: null, consistencyScore: null, inconsistencies: [] };

  try {
    const physics = typeof physicsAnalysisJson === "string"
      ? JSON.parse(physicsAnalysisJson)
      : physicsAnalysisJson;

    return {
      primaryZone: physics?.primaryImpactZone
        ? normaliseZone(physics.primaryImpactZone.split("_")[0])
        : null,
      consistencyScore: physics?.damageConsistency?.score ?? null,
      inconsistencies: physics?.damageConsistency?.inconsistencies ?? [],
    };
  } catch {
    return { primaryZone: null, consistencyScore: null, inconsistencies: [] };
  }
}

// ─── Mismatch detectors ───────────────────────────────────────────────────────

function detectZoneMismatches(
  docZones: string[],
  photoZones: string[],
  physicsZone: string | null,
  mismatches: DamageMismatch[],
): void {
  // 1. Photo vs Document zone conflict
  for (const photoZone of photoZones) {
    const hasDocMatch = docZones.length === 0 || docZones.some(dz => !zonesConflict(dz, photoZone));
    if (!hasDocMatch) {
      mismatches.push({
        type: "zone_mismatch",
        severity: "high",
        details: `Photos show ${photoZone} damage, but document describes damage in ${docZones.join(", ")}`,
        source_a: "photos",
        source_b: "document",
      });
    }
  }

  // 2. Physics zone vs Document zone conflict
  if (physicsZone && docZones.length > 0) {
    const hasDocMatch = docZones.some(dz => !zonesConflict(dz, physicsZone));
    if (!hasDocMatch) {
      mismatches.push({
        type: "physics_zone_conflict",
        severity: "high",
        details: `Physics engine indicates ${physicsZone} impact, but document describes damage in ${docZones.join(", ")}`,
        source_a: "physics",
        source_b: "document",
      });
    }
  }

  // 3. Physics zone vs Photo zone conflict
  if (physicsZone && photoZones.length > 0) {
    const hasPhotoMatch = photoZones.some(pz => !zonesConflict(pz, physicsZone));
    if (!hasPhotoMatch) {
      mismatches.push({
        type: "photo_zone_conflict",
        severity: "medium",
        details: `Physics engine indicates ${physicsZone} impact, but photos show damage in ${photoZones.join(", ")}`,
        source_a: "physics",
        source_b: "photos",
      });
    }
  }
}

function detectComponentMismatches(
  docComponents: string[],
  photoComponents: string[],
  mismatches: DamageMismatch[],
): void {
  // Components visible in photos but absent from document
  for (const photoComp of photoComponents) {
    const photoLower = photoComp.toLowerCase();
    const inDoc = docComponents.some(dc => {
      const dcLower = dc.toLowerCase();
      return dcLower.includes(photoLower) || photoLower.includes(dcLower);
    });
    if (!inDoc && docComponents.length > 0) {
      mismatches.push({
        type: "component_unreported",
        severity: "medium",
        details: `"${photoComp}" detected in photos but not mentioned in claim document`,
        source_a: "photos",
        source_b: "document",
        component: photoComp,
      });
    }
  }

  // Components in document but no photo evidence
  for (const docComp of docComponents) {
    const docLower = docComp.toLowerCase();
    const inPhoto = photoComponents.some(pc => {
      const pcLower = pc.toLowerCase();
      return pcLower.includes(docLower) || docLower.includes(pcLower);
    });
    if (!inPhoto && photoComponents.length > 0) {
      mismatches.push({
        type: "no_photo_evidence",
        severity: "low",
        details: `"${docComp}" mentioned in document but not detected in any photo`,
        source_a: "document",
        source_b: "photos",
        component: docComp,
      });
    }
  }
}

function detectMissingSourceMismatches(
  docAvailable: boolean,
  photoAvailable: boolean,
  physicsAvailable: boolean,
  mismatches: DamageMismatch[],
): void {
  if (!photoAvailable && docAvailable) {
    mismatches.push({
      type: "no_photo_evidence",
      severity: "low",
      details: "No enriched photo data available — photo-to-document cross-check skipped",
    });
  }
  if (!docAvailable && photoAvailable) {
    mismatches.push({
      type: "no_document_evidence",
      severity: "low",
      details: "No document-extracted components available — document-to-photo cross-check skipped",
    });
  }
}

// ─── Score calculator ─────────────────────────────────────────────────────────

const MISMATCH_PENALTIES: Record<DamageMismatch["severity"], number> = {
  high: 25,
  medium: 12,
  low: 5,
};

function calculateScore(mismatches: DamageMismatch[], physicsScore: number | null): number {
  const penalty = mismatches.reduce((sum, m) => sum + MISMATCH_PENALTIES[m.severity], 0);
  let base = 100 - penalty;

  // Blend in physics engine's own consistency score if available
  if (physicsScore !== null) {
    base = Math.round(base * 0.7 + physicsScore * 0.3);
  }

  return Math.max(0, Math.min(100, base));
}

function scoreToConfidence(score: number, docAvailable: boolean, photoAvailable: boolean): ConsistencyCheckResult["confidence"] {
  if (!docAvailable || !photoAvailable) return "LOW";
  if (score >= 75) return "HIGH";
  if (score >= 50) return "MEDIUM";
  return "LOW";
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface ConsistencyCheckInput {
  /** JSON string: array of component objects or strings from AI assessment */
  damagedComponentsJson: string | null;
  /** Free-text damage description from AI assessment */
  damageDescription: string | null;
  /** JSON string: array of EnrichedPhoto objects from Stage 11 */
  enrichedPhotosJson: string | null;
  /** JSON string: PhysicsAnalysisResult from Stage 3 */
  physicsAnalysisJson: string | null;
  /**
   * Whether the check was triggered automatically by the pipeline ("auto")
   * or manually by a user ("manual"). Defaults to "manual".
   */
  triggerSource?: "auto" | "manual";
  /**
   * Per-type annotation statistics from the adaptive weight engine.
   * When provided, the confidence engine uses actual historical confirmation
   * rates for Signal A. When omitted, Signal A defaults to 0.5 (neutral).
   */
  annotationStats?: import("./mismatchAnnotation").MismatchTypeStats[];
}

// ─── Pre-condition guard ──────────────────────────────────────────────────────

/**
 * Evaluates whether all three pre-conditions are met before running the check.
 *
 * Conditions:
 *   1. document_extraction.status == "complete"  → damagedComponentsJson has ≥1 component
 *   2. photo_enrichment.count >= 1               → enrichedPhotosJson has ≥1 enriched photo
 *   3. physics_analysis.primary_zone exists      → physicsAnalysisJson has a primaryImpactZone
 *
 * Returns null when all conditions pass, or a PendingInputsResult when any fail.
 */
export function checkPreConditions(input: ConsistencyCheckInput): PendingInputsResult | null {
  const missing: string[] = [];

  // Condition 1: document extraction complete
  let docComplete = false;
  if (input.damagedComponentsJson) {
    try {
      const parsed = JSON.parse(input.damagedComponentsJson);
      if (Array.isArray(parsed) && parsed.length > 0) docComplete = true;
    } catch { /* invalid JSON */ }
  }
  if (!docComplete) missing.push("document_extraction.status != complete (no extracted components)");

  // Condition 2: at least one enriched photo
  let photoCount = 0;
  if (input.enrichedPhotosJson) {
    try {
      const photos = JSON.parse(input.enrichedPhotosJson);
      if (Array.isArray(photos)) photoCount = photos.length;
    } catch { /* invalid JSON */ }
  }
  if (photoCount < 1) missing.push("photo_enrichment.count < 1 (no enriched photos)");

  // Condition 3: physics primary zone present
  let physicsZonePresent = false;
  if (input.physicsAnalysisJson) {
    try {
      const physics = JSON.parse(input.physicsAnalysisJson);
      if (physics?.primaryImpactZone && typeof physics.primaryImpactZone === "string") {
        physicsZonePresent = true;
      }
    } catch { /* invalid JSON */ }
  }
  if (!physicsZonePresent) missing.push("physics_analysis.primary_zone missing");

  if (missing.length > 0) {
    return {
      status: "pending_inputs",
      missing_conditions: missing,
      checked_at: new Date().toISOString(),
    };
  }

  return null; // all conditions met
}

export async function runDamageConsistencyCheck(input: ConsistencyCheckInput): Promise<ConsistencyCheckOutput> {
  const doc = parseDocumentSource(input.damagedComponentsJson, input.damageDescription);
  const photo = parsePhotoSource(input.enrichedPhotosJson);
  const physics = parsePhysicsSource(input.physicsAnalysisJson);

  const docAvailable = doc.components.length > 0;
  const photoAvailable = photo.zones.length > 0 || photo.components.length > 0;
  const physicsAvailable = physics.primaryZone !== null;

  const mismatches: DamageMismatch[] = [];

  detectMissingSourceMismatches(docAvailable, photoAvailable, physicsAvailable, mismatches);

  if (docAvailable || photoAvailable || physicsAvailable) {
    detectZoneMismatches(doc.zones, photo.zones, physics.primaryZone, mismatches);
    if (docAvailable && photoAvailable) {
      detectComponentMismatches(doc.components, photo.components, mismatches);
    }
  }

  // Incorporate physics engine's own inconsistency flags as low-severity mismatches
  for (const inconsistency of physics.inconsistencies) {
    if (!mismatches.some(m => m.details.includes(inconsistency))) {
      mismatches.push({
        type: "physics_zone_conflict",
        severity: "low",
        details: inconsistency,
        source_a: "physics",
      });
    }
  }

  const score = calculateScore(mismatches, physics.consistencyScore);
  // Legacy band (kept for backward compatibility)
  const confidence = scoreToConfidence(score, docAvailable, photoAvailable);

  // Stage 24: three-signal calibrated confidence
  const { computeConsistencyConfidence } = await import("./consistencyConfidence");
  const calibrated = computeConsistencyConfidence({
    detectedMismatchTypes: mismatches.map((m) => m.type),
    mismatchCount: mismatches.length,
    sourcesAvailable: {
      document: docAvailable,
      photos: photoAvailable,
      physics: physicsAvailable,
    },
    annotationStats: input.annotationStats,
  });

  // Run pre-condition guard only for auto-triggered calls.
  // Manual calls (and direct service calls without a triggerSource) always compute
  // and return a complete result regardless of source availability.
  if (input.triggerSource === "auto") {
    const pendingResult = checkPreConditions(input);
    if (pendingResult) return pendingResult;
  }

  return {
    status: "complete",
    consistency_score: score,
    confidence: calibrated.confidence,
    confidence_score: calibrated.confidence_score,
    mismatches,
    source_summary: {
      document: { zones: doc.zones, components: doc.components, available: docAvailable },
      photos: { zones: photo.zones, components: photo.components, available: photoAvailable },
      physics: { primaryZone: physics.primaryZone, available: physicsAvailable },
    },
    checked_at: new Date().toISOString(),
    source: input.triggerSource ?? "manual",
  };
}
