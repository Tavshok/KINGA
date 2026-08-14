import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildClaimTruth } from "./claimTruthLayer";

const baseInput = {
  claimRecord: {
    vehicle: { make: "Toyota", model: "Corolla", year: 2020, registration: "TEST-1", vin: null, marketValueUsd: 10000 },
    repairQuote: { repairerCompany: "Historical Repairer", quoteTotalCents: 900000, lineItems: [] },
    accidentDetails: {},
  },
  stage3Data: null,
  evidenceRegistry: null,
  classifiedImages: null,
  enrichedPhotos: null,
  extractedQuotes: [
    { panel_beater: "Cancelled Repairer", total_cost: 9000, line_items: [] },
    { panel_beater: "Eligible Repairer", total_cost: 1000, line_items: [] },
  ],
  kingaEstimateUsd: 900,
  kingaEstimateSource: "stage9",
  systemCreatedAt: null,
  totalPages: 1,
} as any;

describe("AUD-P1-003 Claim Truth canonical quote evidence", () => {
  it("uses only canonical eligible Stage 9 quotes for cost verdicts, deviations, and negotiation", () => {
    const truth = buildClaimTruth({
      ...baseInput,
      canonicalEligibleQuotes: [{ panelBeater: "Eligible Repairer", totalUsd: 1000, lineItemCount: 2 }],
    });

    expect(truth.costBasis.quotes).toEqual([
      expect.objectContaining({ repairerName: "Eligible Repairer", totalUsd: 1000, source: "canonical_stage9_eligible_quote" }),
    ]);
    expect(truth.costBasis.optimisedCostUsd).toBe(900);
    expect(truth.costBasis.quoteVsEstimateDeviation).toEqual([
      { repairerName: "Eligible Repairer", quoteUsd: 1000, deviationPercent: 11.1 },
    ]);
    expect(truth.costBasis.negotiationSavingUsd).toBe(100);
    expect(JSON.stringify(truth.costBasis)).not.toContain("Cancelled Repairer");
    expect(JSON.stringify(truth.costBasis)).not.toContain("Historical Repairer");
  });

  it("keeps Claim Truth recommendation, review triggers, and fraud signals unchanged when raw history adds non-active quotes", () => {
    const canonicalEligibleQuotes = [{ panelBeater: "Eligible Repairer", totalUsd: 1000, lineItemCount: 2 }];
    const eligibleOnly = buildClaimTruth({
      ...baseInput,
      extractedQuotes: [{ panel_beater: "Eligible Repairer", total_cost: 1000, line_items: [] }],
      canonicalEligibleQuotes,
    });
    const mixedHistory = buildClaimTruth({
      ...baseInput,
      extractedQuotes: [
        { panel_beater: "Eligible Repairer", total_cost: 1000, line_items: [] },
        { panel_beater: "Cancelled Repairer", total_cost: 16000, line_items: [] },
        { panel_beater: "Rejected Repairer", total_cost: 15000, line_items: [] },
        { panel_beater: "Superseded Repairer", total_cost: 14000, line_items: [] },
        { panel_beater: "Ineligible Repairer", total_cost: 13000, line_items: [] },
      ],
      canonicalEligibleQuotes,
    });

    expect(mixedHistory.decision).toEqual(eligibleOnly.decision);
    expect(mixedHistory.fraudSignals).toEqual(eligibleOnly.fraudSignals);
    expect(JSON.stringify(mixedHistory.decision)).not.toContain("Cancelled Repairer");
    expect(JSON.stringify(mixedHistory.decision)).not.toContain("Rejected Repairer");
    expect(JSON.stringify(mixedHistory.fraudSignals)).not.toContain("Superseded Repairer");
    expect(JSON.stringify(mixedHistory.fraudSignals)).not.toContain("Ineligible Repairer");
  });

  it("does not fall back to raw quote rows when Stage 9 has no eligible evidence", () => {
    const truth = buildClaimTruth({ ...baseInput, canonicalEligibleQuotes: [] });

    expect(truth.costBasis.quotes).toEqual([]);
    expect(truth.costBasis.costVerdict).toBe("INSUFFICIENT_DATA");
    expect(truth.costBasis.negotiationSavingUsd).toBe(0);
    expect(truth.costBasis.quoteVsEstimateDeviation).toEqual([]);
  });

  it("hands canonical active Stage 9 entries into the live Claim Truth constructor", () => {
    const source = readFileSync(resolve(process.cwd(), "server/pipeline-v2/orchestrator.ts"), "utf8");
    expect(source).toContain("const ctlCanonicalLedger = (stage9Data as any)?.compositeOptimisation?.canonicalQuoteLedger");
    expect(source).toContain('entry?.status === "active" && entry?.evidenceEligibility === "final_l2_eligible"');
    expect(source).toContain("canonicalEligibleQuotes: ctlCanonicalEligibleQuotes");
  });
});
