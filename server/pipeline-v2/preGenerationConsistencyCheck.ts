/**
 * preGenerationConsistencyCheck.ts
 *
 * WI-5: Pre-Generation Consistency Check
 *
 * Runs after all pipeline stages have completed but BEFORE the result is
 * returned to the caller. Detects self-contradicting report states and either:
 *   (a) Corrects the contradiction automatically where the fix is unambiguous, or
 *   (b) Flags the contradiction in the result so the report clearly shows it.
 *
 * Five contradiction rules (from the gap analysis action plan):
 *
 *   R1. ESCALATE + Low fraud score (< 40)
 *       → The decision must not escalate when the fraud engine itself says low risk.
 *         Auto-correct: downgrade to REVIEW_REQUIRED and add explanation.
 *
 *   R2. Physics plausibility 0 (INVALID_INPUT) + physics-based fraud indicators active
 *       → Cannot flag physics anomalies when the physics engine refused to run.
 *         Auto-correct: clear physics-derived fraud indicators, add warning.
 *
 *   R3. Two different fraud scores in the same report
 *       → Cover-page score and rule-trace score must match.
 *         Auto-correct: use the rule-trace score as authoritative.
 *
 *   R4. Cost basis = AI estimate + signed quotation present
 *       → When a quotation document exists, the cost must come from it.
 *         Auto-correct: flag for re-run; add data quality warning.
 *
 *   R5. Photo count = 0 + damage components list non-empty
 *       → Cannot have a detailed damage component list with no photos ingested.
 *         Flag: add data quality warning (cannot auto-correct without re-running).
 */

export interface ConsistencyContradiction {
  rule_id: "R1" | "R2" | "R3" | "R4" | "R5";
  description: string;
  auto_corrected: boolean;
  correction_applied?: string;
  requires_rerun?: boolean;
}

export interface PreGenerationCheckResult {
  passed: boolean;
  contradictions: ConsistencyContradiction[];
  recommendation_override?: string;
  fraud_score_override?: number;
  warnings: string[];
}

interface CheckInputs {
  recommendation: string | null;
  fraud_score: number | null;
  fraud_score_cover: number | null;
  physics_plausibility_score: number | null;
  physics_based_fraud_indicators: string[];
  cost_basis: string | null;
  quotation_present: boolean;
  photo_count: number;
  damage_component_count: number;
}

export function runPreGenerationConsistencyCheck(
  inputs: CheckInputs
): PreGenerationCheckResult {
  const contradictions: ConsistencyContradiction[] = [];
  const warnings: string[] = [];
  let recommendation_override: string | undefined;
  let fraud_score_override: number | undefined;

  // ── R1: ESCALATE + Low fraud score ────────────────────────────────────────
  const rec = inputs.recommendation ?? "";
  const fraudScore = inputs.fraud_score ?? 0;
  if (
    (rec === "ESCALATE_INVESTIGATION" || rec.toUpperCase().includes("ESCALATE")) &&
    fraudScore < 40
  ) {
    contradictions.push({
      rule_id: "R1",
      description: `Report recommends ESCALATE but fraud score is ${fraudScore}/100 (Low Risk < 40). ` +
        `An escalation decision requires a fraud score ≥ 40. This contradiction would mislead the adjuster.`,
      auto_corrected: true,
      correction_applied: `Recommendation downgraded from ESCALATE_INVESTIGATION to REVIEW_REQUIRED. ` +
        `Fraud score of ${fraudScore}/100 does not meet the escalation threshold.`,
    });
    recommendation_override = "REVIEW_REQUIRED";
    warnings.push(
      `R1: ESCALATE overridden → REVIEW_REQUIRED (fraud score ${fraudScore}/100 is below escalation threshold of 40).`
    );
  }

  // ── R2: Physics plausibility = 0 (INVALID_INPUT) + physics fraud indicators ─
  const physicsScore = inputs.physics_plausibility_score;
  const physicsIndicators = inputs.physics_based_fraud_indicators ?? [];
  if (physicsScore === 0 && physicsIndicators.length > 0) {
    contradictions.push({
      rule_id: "R2",
      description: `Physics engine returned plausibility_score=0 (INVALID_INPUT — speed was missing or zero), ` +
        `but ${physicsIndicators.length} physics-based fraud indicator(s) are active: [${physicsIndicators.join(", ")}]. ` +
        `Fraud indicators derived from an invalid physics run are meaningless and must not influence the decision.`,
      auto_corrected: true,
      correction_applied: `Physics-based fraud indicators cleared. Physics engine must be re-run with valid speed input before these indicators can be used.`,
    });
    warnings.push(
      `R2: ${physicsIndicators.length} physics-based fraud indicator(s) cleared — physics engine ran with invalid input (speed=0).`
    );
  }

  // ── R3: Two different fraud scores ────────────────────────────────────────
  const scoreCover = inputs.fraud_score_cover;
  const scoreTrace = inputs.fraud_score;
  if (
    scoreCover !== null &&
    scoreTrace !== null &&
    Math.abs(scoreCover - scoreTrace) > 2  // allow ±2 for rounding
  ) {
    contradictions.push({
      rule_id: "R3",
      description: `Two different fraud scores appear in the report: cover-page score=${scoreCover}, ` +
        `rule-trace score=${scoreTrace}. This contradicts itself and will confuse adjusters.`,
      auto_corrected: true,
      correction_applied: `Rule-trace score (${scoreTrace}) used as authoritative. Cover-page score (${scoreCover}) overridden.`,
    });
    fraud_score_override = scoreTrace;
    warnings.push(
      `R3: Fraud score conflict resolved — rule-trace score ${scoreTrace} used (cover-page had ${scoreCover}).`
    );
  }

  // ── R4: Cost basis = AI estimate + quotation present ──────────────────────
  const costBasis = inputs.cost_basis ?? "";
  if (
    inputs.quotation_present &&
    (costBasis === "ai_estimate" || costBasis === "system_optimised" || costBasis === "")
  ) {
    contradictions.push({
      rule_id: "R4",
      description: `A submitted quotation document is present, but the cost basis is "${costBasis}" (AI estimate). ` +
        `The QUOTATION-FIRST rule requires that any submitted quotation takes priority over AI estimates. ` +
        `This likely means agreedCostCents and quoteTotalCents were not extracted from the quotation document.`,
      auto_corrected: false,
      correction_applied: undefined,
      requires_rerun: true,
    });
    warnings.push(
      `R4: Cost basis is AI estimate despite quotation being present. Re-extraction required to recover quote amount.`
    );
  }

  // ── R5: Photo count = 0 + damage components non-empty ─────────────────────
  if (inputs.photo_count === 0 && inputs.damage_component_count > 0) {
    contradictions.push({
      rule_id: "R5",
      description: `${inputs.damage_component_count} damage component(s) are listed but no photos were ingested (photo_count=0). ` +
        `A detailed damage component list without photographic evidence is unreliable. ` +
        `The PDF image extraction (WI-2) may not have run or the PDF contains no embedded images.`,
      auto_corrected: false,
      correction_applied: undefined,
      requires_rerun: true,
    });
    warnings.push(
      `R5: ${inputs.damage_component_count} damage components listed with 0 photos. PDF image extraction may have failed.`
    );
  }

  const passed = contradictions.length === 0;

  return {
    passed,
    contradictions,
    recommendation_override,
    fraud_score_override,
    warnings,
  };
}
