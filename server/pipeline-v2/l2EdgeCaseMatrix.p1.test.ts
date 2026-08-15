import { describe, expect, it } from "vitest";
import { buildCostDecisionPresentationContract, type CostDecisionEvidence } from "../../shared/costDecisionPresentation";
import { buildCompositeQuote, type BenchmarkMap, type InputQuoteWithLineItems } from "./quoteOptimisationEngine";

function quote(repairer: string, lines: Array<{ component: string; cost: number; verified?: boolean }>): InputQuoteWithLineItems {
  return {
    panel_beater: repairer,
    total_cost: lines.reduce((sum, line) => sum + line.cost, 0),
    currency: "USD",
    components: lines.map((line) => line.component),
    confidence: "high",
    lineItems: lines.map((line) => ({
      componentName: line.component,
      costUsd: line.cost,
      sourcePricingVerified: line.verified ?? true,
      isRepair: true,
      isReplacement: false,
      isNonPartCost: false,
    })),
  };
}

function benchmark(component: string, p50: number): BenchmarkMap {
  return { [component]: { p25Usd: p50 * 0.8, p50Usd: p50, p75Usd: p50 * 1.2, sampleSize: 8 } };
}

function evidence(overrides: Partial<CostDecisionEvidence>): CostDecisionEvidence {
  return {
    quoteReceiptStatus: "quotes_received",
    activeQuoteCount: 1,
    allInReconciliationRequired: false,
    unreconciledQuoteCount: 0,
    l2IsComplete: true,
    l2OptimisedCostUsd: 100,
    l2EvidenceQualifiedComparisonUsd: null,
    partialPricedScopeUsd: null,
    l1SubmittedCostUsd: 100,
    missingRequiredComponents: [],
    duplicateQuotesExcluded: 0,
    reconciliationRepairers: [],
    ...overrides,
  };
}

describe("AUD-L2 edge-case validation matrix — no-write", () => {
  it("classifies complete multi-quote scope with an in-tolerance benchmark as intended", () => {
    const result = buildCompositeQuote([
      quote("Repairer A", [{ component: "front bumper", cost: 100 }]),
      quote("Repairer B", [{ component: "front bumper", cost: 120 }]),
    ], benchmark("Front Bumper", 90), 100, undefined, ["front bumper"]);

    expect(result).toMatchObject({ isComplete: true, compositeOptimisedCostUsd: 90, negotiationSavingsUsd: 10 });
    expect(result.compositeLineItems[0]).toMatchObject({ l2SelectionMethod: "BENCHMARK_WITHIN_30_PCT" });
    expect(buildCostDecisionPresentationContract(evidence({ l2OptimisedCostUsd: 90 }))).toMatchObject({
      quoteVerification: "PASSED",
      optimisedQuoteState: "complete",
      potentialSavingsAmount: 10,
      potentialSavingsLabel: "Potential savings",
    });
  });

  it("classifies a single submitted component quote as eligible evidence, not an L2 failure", () => {
    const result = buildCompositeQuote([
      quote("Repairer A", [{ component: "front bumper", cost: 100 }]),
    ], benchmark("Front Bumper", 110), 100, undefined, ["front bumper"]);

    expect(result).toMatchObject({ isComplete: true, compositeOptimisedCostUsd: 110, negotiationSavingsUsd: -10 });
    expect(buildCostDecisionPresentationContract(evidence({ l2OptimisedCostUsd: 110 }))).toMatchObject({
      optimisedQuoteState: "complete",
      potentialSavingsAmount: null,
      potentialSavingsLabel: null,
    });
  });

  it("uses the submitted component price when no benchmark exists", () => {
    const result = buildCompositeQuote([
      quote("Repairer A", [{ component: "uncommon trim", cost: 240 }]),
    ], {}, 240, undefined, ["uncommon trim"]);

    expect(result).toMatchObject({ isComplete: true, compositeOptimisedCostUsd: 240 });
    expect(result.compositeLineItems[0]).toMatchObject({ p50Usd: null, selectedCostUsd: 240 });
  });

  it("uses the lower supported value outside the 30% tolerance in both directions", () => {
    const belowSubmitted = buildCompositeQuote([
      quote("Repairer A", [{ component: "front bumper", cost: 100 }]),
    ], benchmark("Front Bumper", 60), 100, undefined, ["front bumper"]);
    const aboveSubmitted = buildCompositeQuote([
      quote("Repairer A", [{ component: "front bumper", cost: 100 }]),
    ], benchmark("Front Bumper", 160), 100, undefined, ["front bumper"]);

    expect(belowSubmitted.compositeLineItems[0]).toMatchObject({
      selectedCostUsd: 60,
      l2SelectionMethod: "LOWER_OF_BENCHMARK_AND_SUBMITTED_OUTSIDE_30_PCT",
    });
    expect(aboveSubmitted.compositeLineItems[0]).toMatchObject({
      selectedCostUsd: 100,
      l2SelectionMethod: "LOWER_OF_BENCHMARK_AND_SUBMITTED_OUTSIDE_30_PCT",
    });
  });

  it("classifies incomplete required component scope as human review without inventing a missing price", () => {
    const result = buildCompositeQuote([
      quote("Repairer A", [{ component: "front bumper", cost: 100 }]),
    ], {}, 100, undefined, ["front bumper", "radiator"]);

    expect(result).toMatchObject({ isComplete: false, compositeOptimisedCostUsd: null, partialPricedScopeUsd: 100 });
    expect(buildCostDecisionPresentationContract(evidence({
      l2IsComplete: false,
      l2OptimisedCostUsd: null,
      partialPricedScopeUsd: 100,
      missingRequiredComponents: ["Radiator Assembly"],
    }))).toMatchObject({
      quoteVerification: "SCOPE GAP",
      optimisedQuoteState: "human_review_required",
      optimisedQuoteAmount: 100,
      potentialSavingsAmount: null,
    });
  });

  it("keeps an unreconciled submitted total as a quote issue while publishing complete submitted-component L2", () => {
    const result = buildCompositeQuote([{
      ...quote("Repairer A", [{ component: "front bumper", cost: 100 }]),
      total_cost: 120,
      sourceQuoteId: "quote-1",
    }], {}, 120, undefined, ["front bumper"]);

    expect(result).toMatchObject({ isComplete: true, compositeOptimisedCostUsd: 100, allInReconciliationRequired: true });
    expect(buildCostDecisionPresentationContract(evidence({
      allInReconciliationRequired: true,
      unreconciledQuoteCount: 1,
      reconciliationRepairers: ["Repairer A"],
    }))).toMatchObject({
      quoteVerification: "RECONCILIATION REQUIRED",
      optimisedQuoteState: "complete",
      optimisedQuoteAmount: 100,
    });
  });

  it("classifies comparison-only or ineligible-only history as human review with no numeric L1, L2, or savings", () => {
    const presentation = buildCostDecisionPresentationContract(evidence({
      activeQuoteCount: 0,
      l2IsComplete: false,
      l2OptimisedCostUsd: null,
      l2EvidenceQualifiedComparisonUsd: null,
      partialPricedScopeUsd: null,
      l1SubmittedCostUsd: null,
      missingRequiredComponents: ["No eligible active submitted component evidence"],
    }));

    expect(presentation).toMatchObject({
      quoteVerification: "SCOPE GAP",
      optimisedQuoteState: "human_review_required",
      optimisedQuoteAmount: null,
      potentialSavingsAmount: null,
      potentialSavingsLabel: null,
    });
  });

  it("classifies no quote as quotation-required human review with no invented amount", () => {
    const result = buildCompositeQuote([], {}, 0);
    const presentation = buildCostDecisionPresentationContract(evidence({
      quoteReceiptStatus: "no_quotes",
      activeQuoteCount: 0,
      l2IsComplete: false,
      l2OptimisedCostUsd: null,
      l1SubmittedCostUsd: null,
      missingRequiredComponents: [],
    }));

    expect(result).toMatchObject({ compositeLineItems: [], compositeOptimisedCostUsd: 0 });
    expect(presentation).toMatchObject({
      quoteVerification: "QUOTATION REQUIRED",
      optimisedQuoteState: "human_review_required",
      optimisedQuoteAmount: null,
      potentialSavingsAmount: null,
    });
  });
});
