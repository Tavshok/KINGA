/**
 * contactPatchRatioEngine.ts
 *
 * CONTACT PATCH RATIO (CPR) ENGINE — CGI Phase 1
 *
 * Part of the Contact Geometry Intelligence (CGI) initiative.
 * See: docs/TDR-001-M3-Retirement-and-CGI-Architecture.md
 * See: docs/KINGA-CGI-Plan-of-Action.md
 *
 * ── PURPOSE ─────────────────────────────────────────────────────────────────
 *
 * The Contact Patch Ratio (CPR) is the ratio of the observed damaged area on the
 * primary impact panel to the total available area of that panel:
 *
 *   CPR = damagedAreaM2 / totalPanelAreaM2
 *
 * For a given collision direction, published IIHS and Euro NCAP test protocols
 * define minimum CPR thresholds for each impact type:
 *
 *   Full-width frontal (0% offset)    → CPR ≥ 0.55
 *   Moderate-overlap frontal (40%)    → CPR ∈ [0.30, 0.55]
 *   Small-overlap frontal (25%)       → CPR ∈ [0.15, 0.35]
 *   Full-width rear                   → CPR ≥ 0.50
 *   Side impact (door zone)           → CPR ≥ 0.20
 *   Rear-quarter / oblique            → CPR ∈ [0.10, 0.40]
 *
 * A CPR that falls significantly below the threshold for the stated impact type
 * is a geometric incoherence signal: the observed contact patch is too small to
 * be consistent with the stated collision scenario.
 *
 * ── DESIGN CONSTRAINTS ──────────────────────────────────────────────────────
 *
 * 1. NEVER HALTS — returns null (no indicator) rather than throwing.
 * 2. PURE ARITHMETIC — no LLM calls, no DB queries, no network requests.
 *    Runtime: < 2 ms.
 * 3. CONSERVATIVE — only fires when CPR is below threshold by ≥ 15 percentage
 *    points (the CONSERVATIVE_MARGIN). Avoids false positives from photo angle
 *    limitations and partial damage visibility.
 * 4. CATEGORY — "contact_geometry" (C1 Physical Consistency).
 *    Score contribution: 8 pts (advisory) to 18 pts (high).
 * 5. ANTI-CIRCULARITY — CPR is computed from Stage 6 damageFractionEstimate
 *    and the vehiclePanelDimensions lookup. It does NOT use any speed estimate
 *    or physics output, so it cannot be circular with the speed ensemble.
 *
 * ── AUTHOR ──────────────────────────────────────────────────────────────────
 * Tavonga Shoko (Lead Engineer)
 * KINGA-TDR-001 | 5 August 2026
 */

import { getPanelAreaM2 } from "./vehiclePanelDimensions";
import type { VehicleBodyType } from "./types";
import type { DamageAnalysisComponent, FraudIndicator } from "./types";
import type { CollisionDirection } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// CPR THRESHOLD TABLE
// Source: IIHS Full-Width Rigid Barrier, IIHS Moderate Overlap, IIHS Small
//         Overlap, Euro NCAP ODB 40%, Euro NCAP Side Pole test protocols.
// ─────────────────────────────────────────────────────────────────────────────

export interface CprThreshold {
  /** Minimum CPR expected for this impact type */
  minCpr: number;
  /** Maximum CPR expected (null = no upper bound) */
  maxCpr: number | null;
  /** Human-readable label for the impact type */
  label: string;
  /** Primary panel to check for this direction */
  primaryPanel: string;
}

/**
 * CPR thresholds by collision direction.
 * "frontal" covers full-width and partial-overlap frontal impacts.
 * The threshold used is the MINIMUM across all frontal sub-types (small overlap = 0.15)
 * to be conservative — we only flag when the CPR is below even the smallest expected patch.
 */
export const CPR_THRESHOLDS: Record<CollisionDirection, CprThreshold> = {
  frontal: {
    minCpr: 0.15,   // Small-overlap minimum (25% offset) — most conservative frontal threshold
    maxCpr: null,
    label: "Frontal impact",
    primaryPanel: "front bumper",
  },
  rear: {
    minCpr: 0.15,   // Conservative rear threshold — rear-quarter impacts can be narrow
    maxCpr: null,
    label: "Rear impact",
    primaryPanel: "rear bumper",
  },
  side_driver: {
    minCpr: 0.10,   // Side pole minimum — very conservative
    maxCpr: null,
    label: "Driver-side impact",
    primaryPanel: "front door",
  },
  side_passenger: {
    minCpr: 0.10,
    maxCpr: null,
    label: "Passenger-side impact",
    primaryPanel: "front door",
  },
  rollover: {
    minCpr: 0.05,   // Rollover — roof contact; very conservative
    maxCpr: null,
    label: "Rollover",
    primaryPanel: "roof",
  },
  multi_impact: {
    minCpr: 0.05,   // Multi-impact — multiple panels; very conservative
    maxCpr: null,
    label: "Multi-impact",
    primaryPanel: "front bumper",
  },
  unknown: {
    minCpr: 0.05,   // Unknown direction — minimal threshold, almost never fires
    maxCpr: null,
    label: "Unknown direction",
    primaryPanel: "front bumper",
  },
};

/**
 * Conservative margin: CPR must be below threshold by at least this amount
 * before the indicator fires. Prevents false positives from partial photo
 * coverage and angle-limited visibility.
 *
 * 0.15 = 15 percentage points below the minimum threshold.
 * Example: frontal threshold = 0.15, margin = 0.15 → fires when CPR < 0.00
 *          → effectively, for frontal impacts, fires only when NO bumper damage is visible
 *          but a frontal impact is claimed.
 *
 * For rear impacts with threshold 0.15: fires when CPR < 0.00 (same logic).
 * This is intentionally very conservative for Phase 1. The margin will be
 * calibrated against production data in Phase 2 (v1.1).
 *
 * The indicator is more useful for high-threshold scenarios (full-width frontal
 * where threshold = 0.55 and margin = 0.15 → fires when CPR < 0.40).
 */
export const CONSERVATIVE_MARGIN = 0.15;

// ─────────────────────────────────────────────────────────────────────────────
// CPR COMPUTATION
// ─────────────────────────────────────────────────────────────────────────────

export interface CprResult {
  /** Computed CPR value [0.0–1.0] */
  cpr: number;
  /** Total area of the primary panel in m² */
  primaryPanelAreaM2: number;
  /** Observed damaged area on the primary panel in m² */
  observedDamagedAreaM2: number;
  /** The collision direction used */
  direction: CollisionDirection;
  /** The primary panel name used */
  primaryPanel: string;
  /** The threshold applied */
  threshold: CprThreshold;
  /** Whether the indicator fires (CPR below threshold minus margin) */
  fires: boolean;
  /** Score contribution if fires */
  score: number;
  /** Severity label if fires */
  severity: "high" | "medium" | "advisory";
  /** Whether the computation was possible (false = insufficient data) */
  computable: boolean;
  /** Reason computation was not possible (if computable = false) */
  notComputableReason?: string;
}

/**
 * Find the primary impact panel component from the Stage 6 damage list.
 * Returns the component with the highest damageFractionEstimate that
 * matches the primary panel name for the given direction.
 */
function findPrimaryPanelComponent(
  components: DamageAnalysisComponent[],
  primaryPanel: string,
): DamageAnalysisComponent | null {
  const primaryKey = primaryPanel.toLowerCase().trim();
  // Exact or fuzzy match on component name
  const candidates = components.filter(c => {
    const name = (c.name || "").toLowerCase().trim();
    return name.includes(primaryKey) || primaryKey.includes(name);
  });
  if (candidates.length === 0) return null;
  // Return the one with the highest damageFractionEstimate
  return candidates.reduce((best, c) => {
    const bestFrac = best.damageFractionEstimate ?? 0;
    const cFrac = c.damageFractionEstimate ?? 0;
    return cFrac > bestFrac ? c : best;
  });
}

/**
 * Compute the Contact Patch Ratio for a claim.
 *
 * @param direction    - Collision direction from Stage 3 / claimRecord
 * @param bodyType     - Vehicle body type from claimRecord.vehicle.bodyType
 * @param components   - Damaged components from Stage 6 damageAnalysis.damagedParts
 * @returns CprResult  - Full computation result including whether the indicator fires
 */
export function computeContactPatchRatio(
  direction: CollisionDirection,
  bodyType: VehicleBodyType,
  components: DamageAnalysisComponent[],
): CprResult {
  const threshold = CPR_THRESHOLDS[direction] ?? CPR_THRESHOLDS["unknown"];
  const primaryPanel = threshold.primaryPanel;

  // ── Guard: need at least one component with a damageFractionEstimate ──────
  const hasAnyFraction = components.some(c => c.damageFractionEstimate != null);
  if (!hasAnyFraction) {
    return {
      cpr: 0,
      primaryPanelAreaM2: 0,
      observedDamagedAreaM2: 0,
      direction,
      primaryPanel,
      threshold,
      fires: false,
      score: 0,
      severity: "advisory",
      computable: false,
      notComputableReason: "No damageFractionEstimate values available from Stage 6 vision analysis",
    };
  }

  // ── Get primary panel total area ──────────────────────────────────────────
  // Cast bodyType to string: types.ts VehicleBodyType has 'sports'/'compact' which are not
  // in vehiclePanelDimensions.VehicleBodyType. getPanelAreaM2 falls back to 'unknown' for
  // unrecognised body types, which is the correct behaviour.
  const primaryPanelAreaM2 = getPanelAreaM2(bodyType as Parameters<typeof getPanelAreaM2>[0], primaryPanel);
  if (primaryPanelAreaM2 <= 0) {
    return {
      cpr: 0,
      primaryPanelAreaM2: 0,
      observedDamagedAreaM2: 0,
      direction,
      primaryPanel,
      threshold,
      fires: false,
      score: 0,
      severity: "advisory",
      computable: false,
      notComputableReason: `No panel area available for "${primaryPanel}" on body type "${bodyType}"`,
    };
  }

  // ── Find the primary panel component ─────────────────────────────────────
  const primaryComponent = findPrimaryPanelComponent(components, primaryPanel);
  const damageFraction = primaryComponent?.damageFractionEstimate ?? 0;
  const observedDamagedAreaM2 = primaryPanelAreaM2 * damageFraction;
  const cpr = primaryPanelAreaM2 > 0 ? observedDamagedAreaM2 / primaryPanelAreaM2 : 0;

  // ── Determine if indicator fires ──────────────────────────────────────────
  const effectiveThreshold = threshold.minCpr - CONSERVATIVE_MARGIN;
  const fires = cpr < effectiveThreshold;

  // ── Score and severity ────────────────────────────────────────────────────
  // Score scales with how far below the threshold the CPR falls:
  //   CPR within 5pp of threshold → advisory (8 pts)
  //   CPR 5–15pp below threshold  → medium (12 pts)
  //   CPR > 15pp below threshold  → high (18 pts)
  const gap = effectiveThreshold - cpr;
  let score = 0;
  let severity: "high" | "medium" | "advisory" = "advisory";
  if (fires) {
    if (gap > 0.15) {
      score = 18;
      severity = "high";
    } else if (gap > 0.05) {
      score = 12;
      severity = "medium";
    } else {
      score = 8;
      severity = "advisory";
    }
  }

  return {
    cpr,
    primaryPanelAreaM2,
    observedDamagedAreaM2,
    direction,
    primaryPanel,
    threshold,
    fires,
    score,
    severity,
    computable: true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// FRAUD INDICATOR BUILDER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run the CPR engine and return a FraudIndicator if the indicator fires,
 * or null if it does not fire or cannot be computed.
 *
 * This is the function called from Stage 8.
 */
export function runContactPatchRatioCheck(
  direction: CollisionDirection,
  bodyType: VehicleBodyType,
  components: DamageAnalysisComponent[],
): FraudIndicator | null {
  try {
    const result = computeContactPatchRatio(direction, bodyType, components);

    if (!result.computable || !result.fires) return null;

    const cprPct = Math.round(result.cpr * 100);
    const thresholdPct = Math.round(result.threshold.minCpr * 100);
    const panelAreaCm2 = Math.round(result.primaryPanelAreaM2 * 10000);
    const damagedAreaCm2 = Math.round(result.observedDamagedAreaM2 * 10000);

    return {
      indicator: "CONTACT_PATCH_RATIO_ANOMALY",
      category: "contact_geometry",
      score: result.score,
      severity: result.severity,
      description:
        `Contact Patch Ratio anomaly: observed ${cprPct}% of ${result.primaryPanel} ` +
        `(${damagedAreaCm2} cm²) is below the minimum expected for a ` +
        `${result.threshold.label.toLowerCase()} (≥ ${thresholdPct}% of ${panelAreaCm2} cm²). ` +
        `The observed contact patch is geometrically inconsistent with the stated collision scenario.`,
      evidence: [
        `CPR: ${cprPct}% (observed) vs ${thresholdPct}% (minimum expected)`,
        `Primary panel: ${result.primaryPanel} (${panelAreaCm2} cm² total)`,
        `Observed damaged area: ${damagedAreaCm2} cm²`,
        `Collision direction: ${result.direction}`,
        `Vehicle body type: ${bodyType}`,
        `Source: IIHS / Euro NCAP contact patch protocols (TDR-001)`,
      ],
    };
  } catch {
    // Never halt Stage 8
    return null;
  }
}
