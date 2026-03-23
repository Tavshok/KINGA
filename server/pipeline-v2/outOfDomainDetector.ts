/**
 * outOfDomainDetector.ts
 *
 * Out-of-Domain Detector for the KINGA AutoVerify AI pipeline.
 *
 * Checks whether an incoming claim's case_signature matches known patterns
 * in the historical signatures database. If no similar cases are found the
 * claim is flagged as out-of-domain and AI confidence is capped at 60.
 *
 * Return shape (matches the prompt contract):
 * {
 *   "in_domain": true/false,
 *   "confidence_cap": 0-100,
 *   "reasoning": ""
 * }
 *
 * Extended output also includes:
 *   - match_count          — number of similar cases found
 *   - best_match_signature — closest matching signature string
 *   - similarity_score     — 0-1 float for the best match
 *   - match_tier           — "exact" | "grouping" | "partial" | "none"
 *   - token_overlap        — per-dimension match flags
 *   - domain_coverage      — what percentage of the DB covers this vehicle/scenario
 */

import { parseCaseSignature } from "./caseSignatureGenerator";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SignatureRecord {
  /** Full case_signature string, e.g. "pickup_animal_frontal_severe_8c_high" */
  case_signature: string;
  /** Optional: number of historical claims with this signature */
  count?: number;
  /** Optional: grouping_key if pre-computed */
  grouping_key?: string;
}

export interface OutOfDomainInput {
  /** The case_signature of the incoming claim */
  case_signature: string | null | undefined;
  /** The historical signatures database */
  known_signatures_database: SignatureRecord[];
  /**
   * Minimum number of historical matches required to consider a claim in-domain.
   * Defaults to 1.
   */
  min_match_threshold?: number;
  /**
   * Minimum similarity score (0-1) required to count as a match.
   * Defaults to 0.5 (at least 3 of 6 token dimensions must match).
   */
  similarity_threshold?: number;
}

export type MatchTier = "exact" | "grouping" | "partial" | "none";

export interface TokenOverlap {
  vehicle: boolean;
  scenario: boolean;
  impact: boolean;
  severity: boolean;
  component_count: boolean;
  cost_tier: boolean;
}

export interface OutOfDomainResult {
  /** Whether the claim fits known patterns */
  in_domain: boolean;
  /**
   * Confidence cap to apply to AI outputs for this claim.
   * 100 if in-domain, capped at 60 if out-of-domain.
   */
  confidence_cap: number;
  /** Human-readable explanation of the decision */
  reasoning: string;
  /** Number of similar cases found in the database */
  match_count: number;
  /** The closest matching signature string, or null if none */
  best_match_signature: string | null;
  /** Similarity score for the best match (0-1) */
  similarity_score: number;
  /** Categorisation of the best match quality */
  match_tier: MatchTier;
  /** Per-dimension token overlap flags for the best match */
  token_overlap: TokenOverlap | null;
  /** Fraction of DB entries covering the same vehicle type (0-1) */
  domain_coverage_vehicle: number;
  /** Fraction of DB entries covering the same scenario type (0-1) */
  domain_coverage_scenario: number;
  /** Warnings about data quality or edge cases */
  warnings: string[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Confidence cap applied when a claim is out-of-domain */
export const OUT_OF_DOMAIN_CONFIDENCE_CAP = 60;

/** Full confidence when a claim is in-domain */
export const IN_DOMAIN_CONFIDENCE = 100;

/** Default minimum match threshold */
const DEFAULT_MIN_MATCH_THRESHOLD = 1;

/** Default similarity threshold (3 of 6 tokens) */
const DEFAULT_SIMILARITY_THRESHOLD = 0.5;

/**
 * Dimension weights for similarity scoring.
 * Scenario and severity are the most discriminative dimensions.
 */
const DIMENSION_WEIGHTS = {
  vehicle: 0.15,
  scenario: 0.30,
  impact: 0.15,
  severity: 0.25,
  component_count: 0.10,
  cost_tier: 0.05,
} as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Derive the grouping_key from a full case_signature string.
 * grouping_key = vehicle_scenario_impact_severity (omits component_count and cost_tier).
 */
function extractGroupingKey(signature: string): string | null {
  const tokens = parseCaseSignature(signature);
  if (!tokens) return null;
  return `${tokens.vehicle}_${tokens.scenario}_${tokens.impact}_${tokens.severity}`;
}

/**
 * Compute a weighted similarity score (0-1) between two parsed token sets.
 * Component count is considered matching if within ±2.
 */
function computeTokenSimilarity(
  a: ReturnType<typeof parseCaseSignature>,
  b: ReturnType<typeof parseCaseSignature>
): { score: number; overlap: TokenOverlap } {
  if (!a || !b) return { score: 0, overlap: { vehicle: false, scenario: false, impact: false, severity: false, component_count: false, cost_tier: false } };

  const overlap: TokenOverlap = {
    vehicle: a.vehicle === b.vehicle,
    scenario: a.scenario === b.scenario,
    impact: a.impact === b.impact,
    severity: a.severity === b.severity,
    component_count: Math.abs(a.component_count - b.component_count) <= 2,
    cost_tier: a.cost_tier === b.cost_tier,
  };

  const score =
    (overlap.vehicle ? DIMENSION_WEIGHTS.vehicle : 0) +
    (overlap.scenario ? DIMENSION_WEIGHTS.scenario : 0) +
    (overlap.impact ? DIMENSION_WEIGHTS.impact : 0) +
    (overlap.severity ? DIMENSION_WEIGHTS.severity : 0) +
    (overlap.component_count ? DIMENSION_WEIGHTS.component_count : 0) +
    (overlap.cost_tier ? DIMENSION_WEIGHTS.cost_tier : 0);

  return { score, overlap };
}

/**
 * Determine the match tier from a similarity score and whether the grouping key matched.
 */
function classifyMatchTier(score: number, groupingKeyMatch: boolean, exactMatch: boolean): MatchTier {
  if (exactMatch) return "exact";
  if (groupingKeyMatch) return "grouping";
  if (score >= DEFAULT_SIMILARITY_THRESHOLD) return "partial";
  return "none";
}

/**
 * Compute domain coverage: what fraction of DB entries share the same
 * vehicle type and scenario type as the incoming claim.
 */
function computeDomainCoverage(
  incomingTokens: ReturnType<typeof parseCaseSignature>,
  db: SignatureRecord[]
): { vehicle: number; scenario: number } {
  if (!incomingTokens || db.length === 0) return { vehicle: 0, scenario: 0 };

  let vehicleCount = 0;
  let scenarioCount = 0;

  for (const record of db) {
    const tokens = parseCaseSignature(record.case_signature);
    if (!tokens) continue;
    if (tokens.vehicle === incomingTokens.vehicle) vehicleCount++;
    if (tokens.scenario === incomingTokens.scenario) scenarioCount++;
  }

  return {
    vehicle: vehicleCount / db.length,
    scenario: scenarioCount / db.length,
  };
}

// ─── Main Function ────────────────────────────────────────────────────────────

/**
 * Check whether an incoming claim's case_signature fits known patterns.
 *
 * @example
 * detectOutOfDomain({
 *   case_signature: "pickup_animal_frontal_severe_8c_high",
 *   known_signatures_database: [
 *     { case_signature: "pickup_animal_frontal_severe_6c_high", count: 12 },
 *     { case_signature: "sedan_collision_rear_moderate_4c_medium", count: 8 },
 *   ]
 * })
 * // → { in_domain: true, confidence_cap: 100, reasoning: "...", match_count: 1, ... }
 */
export function detectOutOfDomain(input: OutOfDomainInput): OutOfDomainResult {
  const warnings: string[] = [];

  const minMatchThreshold = input.min_match_threshold ?? DEFAULT_MIN_MATCH_THRESHOLD;
  const similarityThreshold = input.similarity_threshold ?? DEFAULT_SIMILARITY_THRESHOLD;

  // ── Validate inputs ────────────────────────────────────────────────────────

  if (!input.case_signature || input.case_signature.trim() === "") {
    return {
      in_domain: false,
      confidence_cap: OUT_OF_DOMAIN_CONFIDENCE_CAP,
      reasoning: "No case_signature provided. Cannot determine domain membership. Confidence capped at 60.",
      match_count: 0,
      best_match_signature: null,
      similarity_score: 0,
      match_tier: "none",
      token_overlap: null,
      domain_coverage_vehicle: 0,
      domain_coverage_scenario: 0,
      warnings: ["case_signature is missing or empty"],
    };
  }

  if (!input.known_signatures_database || input.known_signatures_database.length === 0) {
    return {
      in_domain: false,
      confidence_cap: OUT_OF_DOMAIN_CONFIDENCE_CAP,
      reasoning: "Known signatures database is empty. No historical patterns available for comparison. Confidence capped at 60.",
      match_count: 0,
      best_match_signature: null,
      similarity_score: 0,
      match_tier: "none",
      token_overlap: null,
      domain_coverage_vehicle: 0,
      domain_coverage_scenario: 0,
      warnings: ["known_signatures_database is empty"],
    };
  }

  // ── Parse incoming signature ───────────────────────────────────────────────

  const incomingSignature = input.case_signature.trim();
  const incomingTokens = parseCaseSignature(incomingSignature);
  const incomingGroupingKey = extractGroupingKey(incomingSignature);

  if (!incomingTokens || !incomingGroupingKey) {
    warnings.push(`Could not parse case_signature: "${incomingSignature}". Treating as out-of-domain.`);
    return {
      in_domain: false,
      confidence_cap: OUT_OF_DOMAIN_CONFIDENCE_CAP,
      reasoning: `The case_signature "${incomingSignature}" could not be parsed into known token dimensions. It does not match the expected format (vehicle_scenario_impact_severity_Nc_costTier). Confidence capped at 60.`,
      match_count: 0,
      best_match_signature: null,
      similarity_score: 0,
      match_tier: "none",
      token_overlap: null,
      domain_coverage_vehicle: 0,
      domain_coverage_scenario: 0,
      warnings,
    };
  }

  // ── Scan the database ─────────────────────────────────────────────────────

  let bestScore = 0;
  let bestSignature: string | null = null;
  let bestOverlap: TokenOverlap | null = null;
  let bestGroupingKeyMatch = false;
  let bestExactMatch = false;
  let matchCount = 0;

  for (const record of input.known_signatures_database) {
    if (!record.case_signature || record.case_signature.trim() === "") {
      warnings.push("Skipped a database record with an empty case_signature.");
      continue;
    }

    const dbSig = record.case_signature.trim();
    const dbTokens = parseCaseSignature(dbSig);
    if (!dbTokens) continue;

    const dbGroupingKey = record.grouping_key ?? extractGroupingKey(dbSig);
    const isExactMatch = dbSig === incomingSignature;
    const isGroupingMatch = dbGroupingKey === incomingGroupingKey;

    const { score, overlap } = computeTokenSimilarity(incomingTokens, dbTokens);

    // Count as a match if it meets the similarity threshold
    if (score >= similarityThreshold || isGroupingMatch || isExactMatch) {
      const effectiveCount = record.count ?? 1;
      matchCount += effectiveCount;
    }

    // Track best match
    if (score > bestScore || (score === bestScore && isExactMatch)) {
      bestScore = score;
      bestSignature = dbSig;
      bestOverlap = overlap;
      bestGroupingKeyMatch = isGroupingMatch;
      bestExactMatch = isExactMatch;
    }
  }

  // ── Domain coverage ────────────────────────────────────────────────────────

  const coverage = computeDomainCoverage(incomingTokens, input.known_signatures_database);

  // ── Determine in-domain status ─────────────────────────────────────────────

  const matchTier = classifyMatchTier(bestScore, bestGroupingKeyMatch, bestExactMatch);
  const isInDomain = matchCount >= minMatchThreshold;

  // ── Build reasoning ────────────────────────────────────────────────────────

  let reasoning: string;

  if (isInDomain) {
    if (matchTier === "exact") {
      reasoning = `Exact match found for signature "${incomingSignature}" with ${matchCount} historical case(s). This claim fits a well-established pattern. Full AI confidence applies.`;
    } else if (matchTier === "grouping") {
      reasoning = `Grouping-key match found for "${incomingGroupingKey}" (${matchCount} historical case(s)). The vehicle type, scenario, impact direction, and severity all match known patterns. Minor differences in component count or cost tier are within expected variance. Full AI confidence applies.`;
    } else {
      reasoning = `Partial match found (similarity score ${(bestScore * 100).toFixed(0)}%) with ${matchCount} historical case(s). Best match: "${bestSignature}". The claim shares enough dimensions with known patterns to be considered in-domain. Full AI confidence applies.`;
    }
  } else {
    if (matchTier === "none") {
      reasoning = `No similar cases found for signature "${incomingSignature}" in the known signatures database (${input.known_signatures_database.length} entries). This claim does not match any established pattern. AI confidence is capped at ${OUT_OF_DOMAIN_CONFIDENCE_CAP} due to out-of-domain status.`;
    } else {
      reasoning = `Insufficient historical matches for signature "${incomingSignature}" (${matchCount} found, minimum required: ${minMatchThreshold}). Best similarity: ${(bestScore * 100).toFixed(0)}% with "${bestSignature}". The claim is considered out-of-domain. AI confidence is capped at ${OUT_OF_DOMAIN_CONFIDENCE_CAP}.`;
    }

    // Add domain coverage context to reasoning
    if (coverage.scenario < 0.05) {
      reasoning += ` The scenario type "${incomingTokens.scenario}" is rare or absent in the training database (${(coverage.scenario * 100).toFixed(1)}% coverage).`;
    }
    if (coverage.vehicle < 0.05) {
      reasoning += ` The vehicle type "${incomingTokens.vehicle}" has low representation in the database (${(coverage.vehicle * 100).toFixed(1)}% coverage).`;
    }
  }

  return {
    in_domain: isInDomain,
    confidence_cap: isInDomain ? IN_DOMAIN_CONFIDENCE : OUT_OF_DOMAIN_CONFIDENCE_CAP,
    reasoning,
    match_count: matchCount,
    best_match_signature: bestSignature,
    similarity_score: Math.round(bestScore * 1000) / 1000,
    match_tier: matchTier,
    token_overlap: bestOverlap,
    domain_coverage_vehicle: Math.round(coverage.vehicle * 1000) / 1000,
    domain_coverage_scenario: Math.round(coverage.scenario * 1000) / 1000,
    warnings,
  };
}

// ─── Batch Processing ─────────────────────────────────────────────────────────

export interface BatchOutOfDomainInput {
  claim_id: string | number;
  case_signature: string | null | undefined;
}

export interface BatchOutOfDomainResult {
  claim_id: string | number;
  result: OutOfDomainResult;
}

/**
 * Run out-of-domain detection for multiple claims against the same database.
 */
export function detectOutOfDomainBatch(
  claims: BatchOutOfDomainInput[],
  known_signatures_database: SignatureRecord[],
  options?: { min_match_threshold?: number; similarity_threshold?: number }
): BatchOutOfDomainResult[] {
  return claims.map((claim) => ({
    claim_id: claim.claim_id,
    result: detectOutOfDomain({
      case_signature: claim.case_signature,
      known_signatures_database,
      ...options,
    }),
  }));
}

// ─── Summary Aggregation ──────────────────────────────────────────────────────

export interface OutOfDomainSummary {
  total: number;
  in_domain_count: number;
  out_of_domain_count: number;
  in_domain_rate: number;
  average_similarity_score: number;
  by_match_tier: Record<MatchTier, number>;
  top_unmatched_signatures: Array<{ signature: string; count: number }>;
  claims_with_warnings: number;
}

/**
 * Aggregate batch results into a summary report.
 */
export function aggregateOutOfDomainSummary(
  results: BatchOutOfDomainResult[]
): OutOfDomainSummary {
  if (results.length === 0) {
    return {
      total: 0,
      in_domain_count: 0,
      out_of_domain_count: 0,
      in_domain_rate: 0,
      average_similarity_score: 0,
      by_match_tier: { exact: 0, grouping: 0, partial: 0, none: 0 },
      top_unmatched_signatures: [],
      claims_with_warnings: 0,
    };
  }

  let inDomainCount = 0;
  let totalScore = 0;
  let claimsWithWarnings = 0;
  const tierCounts: Record<MatchTier, number> = { exact: 0, grouping: 0, partial: 0, none: 0 };
  const unmatchedMap = new Map<string, number>();

  for (const { result } of results) {
    if (result.in_domain) inDomainCount++;
    totalScore += result.similarity_score;
    if (result.warnings.length > 0) claimsWithWarnings++;
    tierCounts[result.match_tier]++;

    if (!result.in_domain && result.match_tier === "none") {
      const sig = result.best_match_signature ?? "unknown";
      unmatchedMap.set(sig, (unmatchedMap.get(sig) ?? 0) + 1);
    }
  }

  const topUnmatched = Array.from(unmatchedMap.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([signature, count]) => ({ signature, count }));

  return {
    total: results.length,
    in_domain_count: inDomainCount,
    out_of_domain_count: results.length - inDomainCount,
    in_domain_rate: Math.round((inDomainCount / results.length) * 1000) / 1000,
    average_similarity_score: Math.round((totalScore / results.length) * 1000) / 1000,
    by_match_tier: tierCounts,
    top_unmatched_signatures: topUnmatched,
    claims_with_warnings: claimsWithWarnings,
  };
}
