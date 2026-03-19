/**
 * useVisualDataGuard.ts
 *
 * Stage 28: Defensive Visual Rendering
 *
 * Per-component data readiness checks with degraded-mode flags.
 * Every visual component must always render something meaningful — never blank.
 *
 * Rules:
 *   1. Check required data before rendering each visual component
 *   2. If missing: render fallback visual with label "Estimated from available data"
 *   3. NEVER hide a component due to missing data
 *   4. Use degraded mode: partial visuals allowed, clearly labelled
 */

// ─── Damage Map ───────────────────────────────────────────────────────────────

export interface DamageMapGuardInput {
  /** Damage zones explicitly provided (e.g. ["front", "left_side"]) */
  zones?: string[] | null;
  /** Damage components that can be mapped to zones */
  damagedComponents?: string[] | null;
  /** Accident type that implies a primary impact zone */
  accidentType?: string | null;
}

export interface DamageMapGuardResult {
  /** Whether the component has sufficient data to render normally */
  isReady: boolean;
  /** Whether the component is rendering in degraded/estimated mode */
  isDegraded: boolean;
  /** Resolved zones to render (may be fallback placeholder) */
  resolvedZones: string[];
  /** Resolved components to pass to the component */
  resolvedComponents: string[];
  /** Human-readable label to display when in degraded mode */
  degradedLabel: string | null;
}

const ACCIDENT_TYPE_TO_ZONE: Record<string, string> = {
  frontal: "front",
  head_on: "front",
  rear_end: "rear",
  rear: "rear",
  side_impact: "right_side",
  side_driver: "left_side",
  side_passenger: "right_side",
  rollover: "roof",
  highway: "front",
};

/**
 * Damage Map guard.
 * Required: at least one zone OR at least one component OR an accident type.
 * Fallback: placeholder zone "front" with "Estimated from available data" label.
 */
export function useDamageMapGuard(input: DamageMapGuardInput): DamageMapGuardResult {
  const zones = input.zones?.filter(Boolean) ?? [];
  const components = input.damagedComponents?.filter(Boolean) ?? [];
  const accidentType = input.accidentType ?? null;

  // Derive a fallback zone from accident type
  const accidentZone = accidentType ? ACCIDENT_TYPE_TO_ZONE[accidentType.toLowerCase()] ?? null : null;

  const hasZones = zones.length > 0;
  const hasComponents = components.length > 0;
  const hasAccidentZone = !!accidentZone;

  const isReady = hasZones || hasComponents;
  const isDegraded = !isReady;

  let resolvedZones = zones;
  let resolvedComponents = components;
  let degradedLabel: string | null = null;

  if (isDegraded) {
    if (hasAccidentZone) {
      // Partial data — can infer zone from accident type
      resolvedZones = [accidentZone!];
      resolvedComponents = [];
      degradedLabel = "Estimated from available data";
    } else {
      // No data at all — show generic placeholder
      resolvedZones = ["front"];
      resolvedComponents = [];
      degradedLabel = "Estimated from available data";
    }
  }

  return { isReady, isDegraded, resolvedZones, resolvedComponents, degradedLabel };
}

// ─── Physics Diagram ──────────────────────────────────────────────────────────

export interface PhysicsDiagramGuardInput {
  /** Impact direction string (e.g. "front", "rear", "left_side") */
  direction?: string | null;
  /** Delta-V in km/h */
  deltaV?: number | null;
  /** Impact force in kN (optional) */
  impactForce?: number | null;
  /** Accident type as fallback for direction */
  accidentType?: string | null;
}

export interface PhysicsDiagramGuardResult {
  isReady: boolean;
  isDegraded: boolean;
  resolvedDirection: string;
  resolvedDeltaV: number;
  resolvedImpactForce: number;
  isDirectionEstimated: boolean;
  isDeltaVEstimated: boolean;
  degradedLabel: string | null;
}

const DIRECTION_DEFAULTS: Record<string, string> = {
  frontal: "front",
  head_on: "front",
  rear_end: "rear",
  rear: "rear",
  side_impact: "right_side",
  side_driver: "left_side",
  side_passenger: "right_side",
  rollover: "roof",
  highway: "front",
};

/** Default delta-V when completely unknown (moderate impact, km/h) */
const FALLBACK_DELTA_V = 30;
/** Default impact force when completely unknown (kN) */
const FALLBACK_FORCE = 15;

/**
 * Physics Diagram guard.
 * Required: direction + delta_v.
 * Fallback: infer direction from accidentType; use FALLBACK_DELTA_V when missing.
 */
export function usePhysicsDiagramGuard(input: PhysicsDiagramGuardInput): PhysicsDiagramGuardResult {
  const rawDirection = input.direction?.trim() || null;
  const rawDeltaV = typeof input.deltaV === "number" && input.deltaV > 0 ? input.deltaV : null;
  const rawForce = typeof input.impactForce === "number" && input.impactForce > 0 ? input.impactForce : null;
  const accidentType = input.accidentType?.toLowerCase() ?? null;

  // Resolve direction
  let resolvedDirection = rawDirection;
  let isDirectionEstimated = false;
  if (!resolvedDirection) {
    resolvedDirection = accidentType ? DIRECTION_DEFAULTS[accidentType] ?? "front" : "front";
    isDirectionEstimated = true;
  }

  // Resolve delta-V
  let resolvedDeltaV = rawDeltaV;
  let isDeltaVEstimated = false;
  if (!resolvedDeltaV) {
    resolvedDeltaV = FALLBACK_DELTA_V;
    isDeltaVEstimated = true;
  }

  // Resolve force
  const resolvedImpactForce = rawForce ?? FALLBACK_FORCE;

  const isReady = !!rawDirection && !!rawDeltaV;
  const isDegraded = !isReady;
  const degradedLabel = isDegraded ? "Estimated from available data" : null;

  return {
    isReady,
    isDegraded,
    resolvedDirection: resolvedDirection!,
    resolvedDeltaV: resolvedDeltaV!,
    resolvedImpactForce,
    isDirectionEstimated,
    isDeltaVEstimated,
    degradedLabel,
  };
}

// ─── Vector Diagram ───────────────────────────────────────────────────────────

export interface VectorDiagramGuardInput {
  /** Impact direction string */
  direction?: string | null;
  /** Impact magnitude (force in kN or speed in km/h) */
  magnitude?: number | null;
  /** Accident type as fallback for direction */
  accidentType?: string | null;
}

export interface VectorDiagramGuardResult {
  isReady: boolean;
  isDegraded: boolean;
  resolvedDirection: string;
  resolvedMagnitude: number;
  isMagnitudeEstimated: boolean;
  isDirectionEstimated: boolean;
  degradedLabel: string | null;
}

const FALLBACK_MAGNITUDE = 15; // kN

/**
 * Vector Diagram guard.
 * Required: direction + magnitude OR estimated magnitude.
 * Fallback: infer direction from accidentType; use FALLBACK_MAGNITUDE when missing.
 */
export function useVectorDiagramGuard(input: VectorDiagramGuardInput): VectorDiagramGuardResult {
  const rawDirection = input.direction?.trim() || null;
  const rawMagnitude = typeof input.magnitude === "number" && input.magnitude > 0 ? input.magnitude : null;
  const accidentType = input.accidentType?.toLowerCase() ?? null;

  // Resolve direction
  let resolvedDirection = rawDirection;
  let isDirectionEstimated = false;
  if (!resolvedDirection) {
    resolvedDirection = accidentType ? DIRECTION_DEFAULTS[accidentType] ?? "front" : "front";
    isDirectionEstimated = true;
  }

  // Resolve magnitude
  let resolvedMagnitude = rawMagnitude;
  let isMagnitudeEstimated = false;
  if (!resolvedMagnitude) {
    resolvedMagnitude = FALLBACK_MAGNITUDE;
    isMagnitudeEstimated = true;
  }

  const isReady = !!rawDirection && !!rawMagnitude;
  const isDegraded = !isReady;
  const degradedLabel = isDegraded ? "Estimated from available data" : null;

  return {
    isReady,
    isDegraded,
    resolvedDirection: resolvedDirection!,
    resolvedMagnitude: resolvedMagnitude!,
    isMagnitudeEstimated,
    isDirectionEstimated,
    degradedLabel,
  };
}

// ─── Cost Graph ───────────────────────────────────────────────────────────────

export interface CostGraphGuardInput {
  /** AI-estimated total cost in USD */
  aiEstimate?: number | null;
  /** Fair cost range */
  fairRange?: { min: number; max: number } | null;
  /** Parts cost */
  parts?: number | null;
  /** Labour cost */
  labour?: number | null;
}

export interface CostGraphGuardResult {
  isReady: boolean;
  isDegraded: boolean;
  resolvedAiEstimate: number;
  resolvedFairRange: { min: number; max: number };
  resolvedParts: number;
  resolvedLabour: number;
  isEstimated: boolean;
  degradedLabel: string | null;
}

/**
 * Cost Graph guard.
 * Required: ai_estimate + fair_range.
 * Fallback: derive fair_range from ai_estimate; use 60/40 parts/labour split.
 */
export function useCostGraphGuard(input: CostGraphGuardInput): CostGraphGuardResult {
  const rawEstimate = typeof input.aiEstimate === "number" && input.aiEstimate > 0 ? input.aiEstimate : null;
  const rawRange = input.fairRange && input.fairRange.min >= 0 && input.fairRange.max > 0 ? input.fairRange : null;
  const rawParts = typeof input.parts === "number" && input.parts > 0 ? input.parts : null;
  const rawLabour = typeof input.labour === "number" && input.labour > 0 ? input.labour : null;

  const isReady = !!rawEstimate && !!rawRange;
  const isDegraded = !isReady;

  // Resolve estimate — if missing, use 0 (will trigger degraded label)
  const resolvedAiEstimate = rawEstimate ?? 0;

  // Resolve fair range — derive from estimate if missing
  let resolvedFairRange = rawRange;
  if (!resolvedFairRange) {
    if (resolvedAiEstimate > 0) {
      resolvedFairRange = {
        min: Math.round(resolvedAiEstimate * 0.8),
        max: Math.round(resolvedAiEstimate * 1.25),
      };
    } else {
      resolvedFairRange = { min: 0, max: 0 };
    }
  }

  // Resolve parts/labour — derive from estimate using 60/40 split if missing
  const resolvedParts = rawParts ?? (resolvedAiEstimate > 0 ? Math.round(resolvedAiEstimate * 0.6) : 0);
  const resolvedLabour = rawLabour ?? (resolvedAiEstimate > 0 ? Math.round(resolvedAiEstimate * 0.4) : 0);

  const isEstimated = isDegraded || !rawParts || !rawLabour;
  const degradedLabel = isDegraded ? "Estimated from available data" : null;

  return {
    isReady,
    isDegraded,
    resolvedAiEstimate,
    resolvedFairRange: resolvedFairRange!,
    resolvedParts,
    resolvedLabour,
    isEstimated,
    degradedLabel,
  };
}

// ─── Shared DegradedModeBanner ────────────────────────────────────────────────

/**
 * Returns props for the DegradedModeBanner component.
 * Use this to render the "Estimated from available data" label consistently.
 */
export interface DegradedBannerProps {
  label: string;
  /** Optional additional context shown below the label */
  detail?: string;
}

export function buildDegradedBannerProps(label: string, detail?: string): DegradedBannerProps {
  return { label, detail };
}
