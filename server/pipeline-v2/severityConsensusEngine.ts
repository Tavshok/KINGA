/**
 * pipeline-v2/severityConsensusEngine.ts
 *
 * SEVERITY CONSENSUS ENGINE
 *
 * Fuses three independent severity signals — physics analysis, damage analysis,
 * and image analysis — into a single authoritative final_severity verdict.
 *
 * Design principles:
 * - Majority vote: if 2+ sources agree, adopt that level
 * - Severe-protection: a SEVERE signal from any source cannot be downgraded
 *   by a single weak outlier (e.g. one missing photo)
 * - CONFLICT is only declared when all three sources disagree AND no protection
 *   rule applies
 * - Confidence is penalised for missing inputs and conflicts
 * - The output JSON matches the spec exactly:
 *   { final_severity, source_alignment, confidence, reasoning }
 */

import type { AccidentSeverity } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type FinalSeverity = "minor" | "moderate" | "severe";

export type SourceAlignment = "FULL" | "PARTIAL" | "CONFLICT";

export interface SeverityConsensusInput {
  /** AccidentSeverity from Stage 7 physics engine (null if physics not run) */
  physics_severity: AccidentSeverity | null;
  /** overallSeverityScore 0–100 from Stage 6 damage analysis (null if not run) */
  damage_severity_score: number | null;
  /**
   * Per-photo severity strings from enrichedPhotosJson.
   * Each entry is the raw "severity" field from a photo enrichment record.
   * Pass null or empty array if no photos were analysed.
   */
  image_severity_signals: Array<string | null> | null;
}

export interface SeverityConsensusOutput {
  final_severity: FinalSeverity;
  source_alignment: SourceAlignment;
  confidence: number;
  reasoning: string;
  /** Internal detail — which signal each source resolved to (null = unavailable) */
  source_signals: {
    physics: FinalSeverity | null;
    damage: FinalSeverity | null;
    image: FinalSeverity | null;
  };
  /** Number of sources that contributed a signal */
  sources_available: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// SEVERITY ORDINAL MAP
// ─────────────────────────────────────────────────────────────────────────────

const SEVERITY_ORDINAL: Record<string, number> = {
  none: 0,
  cosmetic: 1,
  minor: 2,
  moderate: 3,
  severe: 4,
  catastrophic: 5,
};

/**
 * Map any AccidentSeverity (including none/cosmetic/catastrophic) to the
 * three-tier FinalSeverity used by this engine.
 */
function mapAccidentSeverity(s: AccidentSeverity | null): FinalSeverity | null {
  if (!s) return null;
  const ord = SEVERITY_ORDINAL[s] ?? -1;
  if (ord < 0) return null;
  if (ord <= 1) return "minor";          // none, cosmetic → minor
  if (ord === 2) return "minor";         // minor
  if (ord === 3) return "moderate";      // moderate
  return "severe";                       // severe, catastrophic
}

/**
 * Map Stage 6 overallSeverityScore (0–100) to FinalSeverity.
 * Thresholds are calibrated to the existing crossEngineConsensus.ts band map.
 */
function mapDamageSeverityScore(score: number | null): FinalSeverity | null {
  if (score === null || score === undefined) return null;
  if (score < 25) return "minor";
  if (score < 55) return "moderate";
  return "severe";
}

/**
 * Aggregate per-photo severity strings to a single FinalSeverity signal.
 * Strategy: take the modal (most common) severity across all photos.
 * If there is a tie between moderate and severe, prefer severe (conservative).
 * Returns null if no valid signals are present.
 */
function aggregateImageSeverity(
  signals: Array<string | null> | null
): FinalSeverity | null {
  if (!signals || signals.length === 0) return null;

  const counts: Record<FinalSeverity, number> = { minor: 0, moderate: 0, severe: 0 };
  let valid = 0;

  for (const raw of signals) {
    if (!raw) continue;
    const normalised = raw.toLowerCase().trim();
    if (normalised === "minor" || normalised === "low") {
      counts.minor++;
      valid++;
    } else if (normalised === "moderate" || normalised === "medium") {
      counts.moderate++;
      valid++;
    } else if (normalised === "severe" || normalised === "high" || normalised === "critical") {
      counts.severe++;
      valid++;
    }
    // Unrecognised strings are ignored
  }

  if (valid === 0) return null;

  // Tie-breaking: severe > moderate > minor (conservative)
  if (counts.severe >= counts.moderate && counts.severe >= counts.minor) return "severe";
  if (counts.moderate >= counts.minor) return "moderate";
  return "minor";
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSENSUS RULES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Apply consensus rules to an array of available (non-null) severity signals.
 *
 * Rules (in priority order):
 * 1. If all available sources agree → FULL alignment, adopt that level.
 * 2. If 2+ sources agree → PARTIAL alignment, adopt the majority level.
 * 3. Severe-protection: if ANY source says SEVERE and only ONE source says
 *    something lower, adopt SEVERE with PARTIAL alignment (not CONFLICT).
 * 4. If all sources disagree → CONFLICT, adopt the highest severity.
 */
function resolveConsensus(
  signals: FinalSeverity[]
): { verdict: FinalSeverity; alignment: SourceAlignment } {
  if (signals.length === 0) {
    return { verdict: "moderate", alignment: "CONFLICT" };
  }

  if (signals.length === 1) {
    return { verdict: signals[0], alignment: "PARTIAL" };
  }

  const counts: Record<FinalSeverity, number> = { minor: 0, moderate: 0, severe: 0 };
  for (const s of signals) counts[s]++;

  const uniqueLevels = Object.keys(counts).filter(k => counts[k as FinalSeverity] > 0) as FinalSeverity[];

  // Rule 1: Full agreement
  if (uniqueLevels.length === 1) {
    return { verdict: uniqueLevels[0], alignment: "FULL" };
  }

  // Rule 2: Majority vote (2+ agree)
  const majority = (["severe", "moderate", "minor"] as FinalSeverity[]).find(
    level => counts[level] >= 2
  );
  if (majority) {
    return { verdict: majority, alignment: "PARTIAL" };
  }

  // Rule 3: Severe-protection
  // If severe is present and only one source disagrees, adopt severe
  if (counts.severe > 0 && signals.length >= 2) {
    const nonSevereCount = counts.minor + counts.moderate;
    if (nonSevereCount <= 1) {
      return { verdict: "severe", alignment: "PARTIAL" };
    }
  }

  // Rule 4: All sources disagree — CONFLICT, adopt highest severity
  const orderedLevels: FinalSeverity[] = ["severe", "moderate", "minor"];
  const highest = orderedLevels.find(l => counts[l] > 0) ?? "moderate";
  return { verdict: highest, alignment: "CONFLICT" };
}

// ─────────────────────────────────────────────────────────────────────────────
// CONFIDENCE SCORING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute confidence (0–100) based on:
 * - How many sources contributed
 * - Source alignment
 * - Whether severe-protection was invoked
 */
function computeConfidence(
  sourcesAvailable: number,
  alignment: SourceAlignment,
  verdict: FinalSeverity,
  signals: { physics: FinalSeverity | null; damage: FinalSeverity | null; image: FinalSeverity | null }
): number {
  let base: number;

  // Base confidence by alignment
  switch (alignment) {
    case "FULL":    base = 92; break;
    case "PARTIAL": base = 72; break;
    case "CONFLICT": base = 45; break;
    default: base = 50;
  }

  // Bonus for having all 3 sources
  if (sourcesAvailable === 3) base += 5;
  else if (sourcesAvailable === 2) base += 0;
  else base -= 15;  // Only 1 source

  // Penalty for missing sources
  const missing = 3 - sourcesAvailable;
  base -= missing * 8;

  // Bonus: if verdict is SEVERE and physics confirms it
  if (verdict === "severe" && signals.physics === "severe") base += 3;

  // Penalty: if verdict is SEVERE but physics says minor (strong contradiction)
  if (verdict === "severe" && signals.physics === "minor") base -= 10;

  return Math.max(10, Math.min(100, Math.round(base)));
}

// ─────────────────────────────────────────────────────────────────────────────
// REASONING BUILDER
// ─────────────────────────────────────────────────────────────────────────────

function buildReasoning(
  signals: { physics: FinalSeverity | null; damage: FinalSeverity | null; image: FinalSeverity | null },
  verdict: FinalSeverity,
  alignment: SourceAlignment,
  sourcesAvailable: number
): string {
  const parts: string[] = [];

  // Describe each source
  const sourceDescriptions: string[] = [];
  if (signals.physics) sourceDescriptions.push(`physics=${signals.physics}`);
  else sourceDescriptions.push("physics=unavailable");
  if (signals.damage) sourceDescriptions.push(`damage=${signals.damage}`);
  else sourceDescriptions.push("damage=unavailable");
  if (signals.image) sourceDescriptions.push(`image=${signals.image}`);
  else sourceDescriptions.push("image=unavailable");

  parts.push(`Source signals: [${sourceDescriptions.join(", ")}].`);

  // Alignment explanation
  if (alignment === "FULL") {
    parts.push(`All ${sourcesAvailable} available source(s) agree on ${verdict} severity.`);
  } else if (alignment === "PARTIAL") {
    const available = [signals.physics, signals.damage, signals.image].filter(Boolean) as FinalSeverity[];
    const agreeing = available.filter(s => s === verdict);
    const disagreeing = available.filter(s => s !== verdict);

    if (disagreeing.length === 0) {
      parts.push(`Majority of sources agree on ${verdict} severity.`);
    } else {
      parts.push(
        `${agreeing.length} source(s) agree on ${verdict}; ` +
        `${disagreeing.length} source(s) indicate ${disagreeing[0]}. ` +
        (verdict === "severe"
          ? "Severe-protection rule applied — a single weaker signal cannot downgrade a SEVERE finding."
          : `Majority vote adopted ${verdict}.`)
      );
    }
  } else {
    // CONFLICT
    parts.push(
      `All ${sourcesAvailable} sources disagree. ` +
      `Adopting highest severity (${verdict}) as a conservative default pending manual review.`
    );
  }

  // Missing source note
  if (sourcesAvailable < 3) {
    const missing: string[] = [];
    if (!signals.physics) missing.push("physics");
    if (!signals.damage) missing.push("damage");
    if (!signals.image) missing.push("image");
    parts.push(`Missing source(s): ${missing.join(", ")} — confidence reduced accordingly.`);
  }

  return parts.join(" ");
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN EXPORT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute the final severity consensus from three independent sources.
 *
 * @example
 * const result = computeSeverityConsensus({
 *   physics_severity: "severe",
 *   damage_severity_score: 72,
 *   image_severity_signals: ["severe", "moderate", "severe"],
 * });
 * // { final_severity: "severe", source_alignment: "FULL", confidence: 97, ... }
 */
export function computeSeverityConsensus(
  input: SeverityConsensusInput
): SeverityConsensusOutput {
  // Step 1: Map each source to FinalSeverity
  const physicsSig = mapAccidentSeverity(input.physics_severity);
  const damageSig = mapDamageSeverityScore(input.damage_severity_score);
  const imageSig = aggregateImageSeverity(input.image_severity_signals);

  const signals = { physics: physicsSig, damage: damageSig, image: imageSig };

  // Step 2: Collect available (non-null) signals
  const available = [physicsSig, damageSig, imageSig].filter(
    (s): s is FinalSeverity => s !== null
  );
  const sourcesAvailable = available.length;

  // Step 3: Resolve consensus
  const { verdict, alignment } = resolveConsensus(available);

  // Step 4: Compute confidence
  const confidence = computeConfidence(sourcesAvailable, alignment, verdict, signals);

  // Step 5: Build reasoning
  const reasoning = buildReasoning(signals, verdict, alignment, sourcesAvailable);

  return {
    final_severity: verdict,
    source_alignment: alignment,
    confidence,
    reasoning,
    source_signals: signals,
    sources_available: sourcesAvailable,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CONVENIENCE BUILDER — maps pipeline stage outputs directly
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a SeverityConsensusInput from pipeline stage outputs.
 * Handles null-safety and enrichedPhotosJson parsing.
 */
export function buildSeverityConsensusInput(
  stage6: { overallSeverityScore: number } | null,
  stage7: { accidentSeverity: AccidentSeverity; physicsExecuted: boolean } | null,
  enrichedPhotosJson: string | null
): SeverityConsensusInput {
  // Parse image severity signals from enrichedPhotosJson
  let imageSignals: Array<string | null> | null = null;
  if (enrichedPhotosJson) {
    try {
      const photos = JSON.parse(enrichedPhotosJson);
      if (Array.isArray(photos)) {
        imageSignals = photos
          .map((p: any) => p?.severity ?? p?.damage_level ?? null)
          .filter((s: any) => s !== null);
        if (imageSignals.length === 0) imageSignals = null;
      }
    } catch {
      imageSignals = null;
    }
  }

  return {
    physics_severity: stage7?.physicsExecuted ? (stage7?.accidentSeverity ?? null) : null,
    damage_severity_score: stage6?.overallSeverityScore ?? null,
    image_severity_signals: imageSignals,
  };
}
