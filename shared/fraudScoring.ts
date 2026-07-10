/**
 * KINGA Fraud Scoring Standard — Canonical Score-to-Level Mapping
 *
 * Implements: KINGA-FSS-2026-001
 * Document:   docs/KINGA-FRAUD-SCORING-STANDARD.md
 *
 * This is the SINGLE SOURCE OF TRUTH for fraud score band mapping on the
 * KINGA platform. No other file may define its own score-to-level logic.
 *
 * Canonical bands:
 *   0–19   → "minimal"
 *   20–39  → "low"
 *   40–60  → "moderate"
 *   61–80  → "high"
 *   81–100 → "elevated"
 *
 * All bounds are inclusive. The valid score range is [0, 100].
 *
 * @see docs/KINGA-FRAUD-SCORING-STANDARD.md
 */

/**
 * The five canonical fraud risk levels defined by KINGA-FSS-2026-001.
 *
 * Note: the value "medium" is NOT part of this standard. Any legacy
 * serialiser using "medium" must be migrated to "moderate".
 */
export type FraudRiskLevel =
  | "minimal"
  | "low"
  | "moderate"
  | "high"
  | "elevated";

/**
 * Maps a numeric fraud score to the canonical FraudRiskLevel.
 *
 * Implements the canonical bands from KINGA-FSS-2026-001:
 *   0–19   → "minimal"
 *   20–39  → "low"
 *   40–60  → "moderate"
 *   61–80  → "high"
 *   81–100 → "elevated"
 *
 * Critical boundary: score = 20 returns "low" (not "minimal").
 *
 * @param score - A finite integer in [0, 100].
 * @returns The canonical FraudRiskLevel for the given score.
 * @throws {RangeError} If score is not a finite number in [0, 100].
 *
 * @example
 * scoreToFraudLevel(0)   // "minimal"
 * scoreToFraudLevel(19)  // "minimal"
 * scoreToFraudLevel(20)  // "low"       ← critical boundary
 * scoreToFraudLevel(39)  // "low"
 * scoreToFraudLevel(40)  // "moderate"
 * scoreToFraudLevel(60)  // "moderate"
 * scoreToFraudLevel(61)  // "high"
 * scoreToFraudLevel(80)  // "high"
 * scoreToFraudLevel(81)  // "elevated"
 * scoreToFraudLevel(100) // "elevated"
 */
/**
 * Normalises a raw fraud risk level string from the database to the canonical
 * FSS-2026-001 FraudRiskLevel.
 *
 * Use this at the display layer to handle historical rows that were written
 * with the pre-ARCH-03 terminology (e.g. "medium" instead of "moderate").
 *
 * Mapping:
 *   "medium"   → "moderate"  (ARCH-03b: legacy DB rows written before rename)
 *   "critical" → "elevated"  (legacy alias)
 *   "minimal"  → "minimal"   (pass-through)
 *   "low"      → "low"       (pass-through)
 *   "moderate" → "moderate"  (pass-through)
 *   "high"     → "high"      (pass-through)
 *   "elevated" → "elevated"  (pass-through)
 *   anything else → "low"    (safe fallback)
 *
 * @param raw - The raw string value from the database.
 * @returns The canonical FraudRiskLevel.
 *
 * @example
 * normaliseFraudLevel("medium")   // "moderate"  ← legacy row
 * normaliseFraudLevel("moderate") // "moderate"  ← current
 * normaliseFraudLevel("critical") // "elevated"  ← legacy alias
 * normaliseFraudLevel(null)       // "low"       ← safe fallback
 */
export function normaliseFraudLevel(raw: string | null | undefined): FraudRiskLevel {
  if (!raw) return "low";
  const legacyMap: Record<string, FraudRiskLevel> = {
    medium: "moderate",   // ARCH-03b: pre-rename legacy value
    critical: "elevated", // legacy alias
  };
  if (legacyMap[raw]) return legacyMap[raw];
  const canonical: FraudRiskLevel[] = ["minimal", "low", "moderate", "high", "elevated"];
  if ((canonical as string[]).includes(raw)) return raw as FraudRiskLevel;
  return "low"; // safe fallback for unknown values
}

/**
 * Returns a human-readable display label for a fraud risk level.
 * Applies normaliseFraudLevel() first so legacy "medium" rows display correctly.
 *
 * @example
 * fraudLevelDisplayLabel("moderate") // "Moderate"
 * fraudLevelDisplayLabel("medium")   // "Moderate"  ← legacy row
 * fraudLevelDisplayLabel("elevated") // "Elevated"
 */
export function fraudLevelDisplayLabel(raw: string | null | undefined): string {
  const level = normaliseFraudLevel(raw);
  return level.charAt(0).toUpperCase() + level.slice(1);
}

/**
 * FSS-2026-001 canonical band thresholds.
 * These values are DATA-GROUNDED — they are defined by the formal KINGA Fraud
 * Scoring Standard (docs/KINGA-FRAUD-SCORING-STANDARD.md) and must not be
 * changed without a formal standard revision.
 *
 * Contrast with CALIBRATION-tagged constants elsewhere in the codebase, which
 * are engineering-judgment estimates that lack a formal data grounding.
 */
export const FSS_ELEVATED_THRESHOLD = 81;
export const FSS_HIGH_THRESHOLD     = 61;
export const FSS_MODERATE_THRESHOLD = 40;
export const FSS_LOW_THRESHOLD      = 20;

export function scoreToFraudLevel(score: number): FraudRiskLevel {
  if (!Number.isFinite(score) || score < 0 || score > 100) {
    throw new RangeError(
      `scoreToFraudLevel: score must be a finite number in [0, 100], got ${score}`
    );
  }

  if (score >= FSS_ELEVATED_THRESHOLD) return "elevated";
  if (score >= FSS_HIGH_THRESHOLD)     return "high";
  if (score >= FSS_MODERATE_THRESHOLD) return "moderate";
  if (score >= FSS_LOW_THRESHOLD)      return "low";
  return "minimal";
}
