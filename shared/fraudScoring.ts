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
export function scoreToFraudLevel(score: number): FraudRiskLevel {
  if (!Number.isFinite(score) || score < 0 || score > 100) {
    throw new RangeError(
      `scoreToFraudLevel: score must be a finite number in [0, 100], got ${score}`
    );
  }

  if (score >= 81) return "elevated";
  if (score >= 61) return "high";
  if (score >= 40) return "moderate";
  if (score >= 20) return "low";
  return "minimal";
}
