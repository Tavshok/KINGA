/**
 * costReliabilityScorer.ts
 *
 * COST RELIABILITY SCORING ENGINE
 *
 * Assigns a confidence level (HIGH / MEDIUM / LOW) and numeric score (0–100)
 * to the cost determination based on:
 *   - number of quotes received
 *   - presence of an assessor-agreed cost
 *   - mechanical alignment status
 *   - active integrity / fraud flags
 *
 * Scoring rules (priority order):
 *
 * HIGH (score ≥ 75):
 *   - Assessor-agreed cost present, OR
 *   - ≥ 2 consistent quotes + FULLY_ALIGNED
 *
 * MEDIUM (score 45–74):
 *   - 2 quotes but PARTIALLY_ALIGNED, OR
 *   - Assessor cost present but flags active, OR
 *   - Single quote + FULLY_ALIGNED
 *
 * LOW (score < 45):
 *   - Single quote + misalignment or major flags, OR
 *   - No quote at all, OR
 *   - MISALIGNED regardless of quote count
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type AlignmentStatus = "FULLY_ALIGNED" | "PARTIALLY_ALIGNED" | "MISALIGNED" | null;
export type ConfidenceLevel = "HIGH" | "MEDIUM" | "LOW";

export interface CostReliabilityInput {
  number_of_quotes: number;
  presence_of_assessor_cost: boolean;
  alignment_status: AlignmentStatus;
  flags: string[]; // e.g. ["structural_gap", "photos_not_ingested", "quote_not_mapped", "inflated_quote"]
}

export interface CostReliabilityOutput {
  confidence_level: ConfidenceLevel;
  confidence_score: number; // 0–100
  reason: string;
  score_breakdown: ScoreBreakdown;
}

interface ScoreBreakdown {
  base_score: number;
  assessor_bonus: number;
  quote_count_bonus: number;
  alignment_modifier: number;
  flag_penalty: number;
  final_score: number;
}

// ─── Flag penalty table ───────────────────────────────────────────────────────

const FLAG_PENALTIES: Record<string, number> = {
  structural_gap: 15,
  quote_not_mapped: 12,
  inflated_quote: 8,
  description_not_mapped: 5,
  photos_not_ingested: 5,
  ocr_failure: 10,
  under_repair_risk: 8,
  images_not_processed: 5,
  physics_estimated: 5,
  quote_mapping_failure: 12,
  image_processing_failure: 5,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function computeFlagPenalty(flags: string[]): number {
  let total = 0;
  for (const flag of flags) {
    total += FLAG_PENALTIES[flag] ?? 3; // unknown flags: small penalty
  }
  return Math.min(total, 40); // cap at 40 so flags alone can't zero the score
}

function alignmentModifier(status: AlignmentStatus): number {
  switch (status) {
    case "FULLY_ALIGNED": return 10;
    case "PARTIALLY_ALIGNED": return -10;
    case "MISALIGNED": return -30;
    case null: return -5; // unknown alignment: slight penalty
  }
}

function quoteCountBonus(count: number): number {
  if (count === 0) return -20;
  if (count === 1) return 0;
  if (count === 2) return 8;
  if (count >= 3) return 15;
  return 0;
}

function levelFromScore(score: number): ConfidenceLevel {
  if (score >= 75) return "HIGH";
  if (score >= 45) return "MEDIUM";
  return "LOW";
}

function buildReason(
  input: CostReliabilityInput,
  level: ConfidenceLevel,
  breakdown: ScoreBreakdown
): string {
  const { number_of_quotes, presence_of_assessor_cost, alignment_status, flags } = input;

  if (level === "HIGH") {
    if (presence_of_assessor_cost && number_of_quotes >= 3 && alignment_status === "FULLY_ALIGNED") {
      return `Assessor-agreed cost confirmed across ${number_of_quotes} quotes with full engineering alignment.`;
    }
    if (presence_of_assessor_cost) {
      return `Assessor-agreed cost present${alignment_status === "FULLY_ALIGNED" ? " with full engineering alignment" : ""}.`;
    }
    return `${number_of_quotes} consistent quotes with full engineering alignment.`;
  }

  if (level === "MEDIUM") {
    const reasons: string[] = [];
    if (number_of_quotes === 1) reasons.push("single quote submitted");
    if (alignment_status === "PARTIALLY_ALIGNED") reasons.push("partial engineering alignment");
    if (flags.includes("structural_gap")) reasons.push("structural component absent from quote");
    if (flags.includes("photos_not_ingested")) reasons.push("photographic evidence not processed");
    if (flags.includes("quote_not_mapped")) reasons.push("quote could not be fully mapped to damage list");
    return reasons.length > 0
      ? `Medium confidence: ${reasons.join("; ")}.`
      : "Medium confidence based on available data.";
  }

  // LOW
  const reasons: string[] = [];
  if (number_of_quotes === 0) reasons.push("no quote submitted");
  if (alignment_status === "MISALIGNED") reasons.push("quote is mechanically inconsistent with the damage");
  if (flags.includes("structural_gap")) reasons.push("structural component absent from quote");
  if (flags.includes("quote_not_mapped")) reasons.push("quote could not be mapped to damage list");
  if (flags.includes("ocr_failure")) reasons.push("OCR failure on source document");
  return reasons.length > 0
    ? `Low confidence: ${reasons.join("; ")}.`
    : "Low confidence due to insufficient or inconsistent data.";
}

// ─── Main function ────────────────────────────────────────────────────────────

export function scoreCostReliability(
  input: CostReliabilityInput
): CostReliabilityOutput {
  const { number_of_quotes, presence_of_assessor_cost, alignment_status, flags } = input;

  // Base score: start at 50 (neutral)
  const base_score = 50;

  // Assessor bonus: +25 if assessor-agreed cost is present (strongest signal)
  const assessor_bonus = presence_of_assessor_cost ? 25 : 0;

  // Quote count bonus
  const quote_count_bonus = quoteCountBonus(number_of_quotes);

  // Alignment modifier
  const alignment_modifier = alignmentModifier(alignment_status);

  // Flag penalty
  const flag_penalty = computeFlagPenalty(flags);

  // Raw score
  const raw = base_score + assessor_bonus + quote_count_bonus + alignment_modifier - flag_penalty;

  // Clamp to 0–100
  const final_score = Math.max(0, Math.min(100, Math.round(raw)));

  const breakdown: ScoreBreakdown = {
    base_score,
    assessor_bonus,
    quote_count_bonus,
    alignment_modifier,
    flag_penalty,
    final_score,
  };

  const confidence_level = levelFromScore(final_score);
  const reason = buildReason(input, confidence_level, breakdown);

  return {
    confidence_level,
    confidence_score: final_score,
    reason,
    score_breakdown: breakdown,
  };
}
