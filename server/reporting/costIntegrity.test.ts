import { describe, expect, it } from "vitest";
import { resolveReportCostIntegrity } from "./costIntegrity";

describe("resolveReportCostIntegrity", () => {
  it("uses only active ledger rows and a complete L2", () => {
    const resolved = resolveReportCostIntegrity({
      documentedAgreedCostUsd: 1600,
      compositeOptimisation: {
        isComplete: true,
        l1LowestSubmittedCostUsd: 1900,
        l2CompositeOptimisedCostUsd: 1750,
        l3BenchmarkReferenceCostUsd: 1825,
        costBasis: "all_in_payable_repair_cost",
        canonicalQuoteLedger: [
          { panelBeater: "Alpha", totalCostUsd: 1900, currency: "USD", status: "active", quoteId: 1 },
          { panelBeater: "Alpha", totalCostUsd: 1900, currency: "USD", status: "duplicate", quoteId: 2 },
        ],
      },
    }, []);

    expect(resolved.activeQuotes).toHaveLength(1);
    expect(resolved.l2OptimisedCostUsd).toBe(1750);
    expect(resolved.l3BenchmarkReferenceCostUsd).toBe(1825);
    expect(resolved.assessorCalibrationCostUsd).toBe(1600);
  });

  it("keeps legacy quotation history visible but excludes it from active comparison and L1 when ledger metadata is absent", () => {
    const resolved = resolveReportCostIntegrity({}, [
      { id: 1, panel_beater_name: "Alpha", quoted_amount: 230000, currency_code: "USD" },
      { id: 2, panel_beater_name: "Beta", quoted_amount: 199533, currency_code: "USD" },
    ]);

    expect(resolved.activeQuotes).toHaveLength(0);
    expect(resolved.submittedQuotes).toHaveLength(2);
    expect(resolved.legacyHistoryQualified).toBe(true);
    expect(resolved.l1SubmittedCostUsd).toBeNull();
  });

  it("never substitutes documented agreed or estimated costs when L2 is incomplete", () => {
    const resolved = resolveReportCostIntegrity({
      documentedAgreedCostUsd: 1995.33,
      expectedRepairCostCents: 99300,
      compositeOptimisation: {
        isComplete: false,
        l2CompositeOptimisedCostUsd: 993,
        partialPricedScopeUsd: 993,
        missingRequiredComponents: ["Paint", "Labour"],
      },
    }, []);

    expect(resolved.l2OptimisedCostUsd).toBeNull();
    expect(resolved.l2IsComplete).toBe(false);
    expect(resolved.partialPricedScopeUsd).toBe(993);
    expect(resolved.assessorCalibrationCostUsd).toBe(1995.33);
    expect(resolved.quoteReceiptStatus).toBe("no_quotes");
    expect(resolved.l2Status).toBe("unavailable");
  });

  it("separates total-only quote receipt from complete L2 repair scope", () => {
    const resolved = resolveReportCostIntegrity({
      compositeOptimisation: {
        l2Status: "incomplete_scope",
        quoteReceiptStatus: "quotes_received",
        quoteScopeStatus: "incomplete_scope",
        isComplete: false,
        sourceQuotesReceived: 3,
      },
    }, [
      { id: 1, panel_beater_name: "Alpha", quoted_amount: 230000, currency_code: "USD" },
      { id: 2, panel_beater_name: "Beta", quoted_amount: 199533, currency_code: "USD" },
      { id: 3, panel_beater_name: "Gamma", quoted_amount: 244375, currency_code: "USD" },
    ]);

    expect(resolved.sourceQuoteCount).toBe(3);
    expect(resolved.activeQuotes).toHaveLength(0);
    expect(resolved.submittedQuotes).toHaveLength(3);
    expect(resolved.quoteReceiptStatus).toBe("quotes_received");
    expect(resolved.quoteScopeStatus).toBe("incomplete_scope");
    expect(resolved.l2OptimisedCostUsd).toBeNull();
  });

  it("deterministically excludes a persisted superseded legacy parent while retaining its revision as qualified history", () => {
    const resolved = resolveReportCostIntegrity({}, [
      { id: 1, panel_beater_name: "Alpha", quoted_amount: 230000, currency_code: "USD", quote_type: "original" },
      { id: 2, panel_beater_name: "Alpha", quoted_amount: 250000, currency_code: "USD", quote_type: "revised", parent_quote_id: 1 },
    ]);

    expect(resolved.submittedQuotes.map((quote) => quote.sourceReference)).toEqual(["2"]);
    expect(resolved.submittedQuotes[0].status).toBe("legacy_unverified");
    expect(resolved.activeQuotes).toEqual([]);
    expect(resolved.l1SubmittedCostUsd).toBeNull();
  });

  it("preserves an explicit all-in reconciliation requirement without mislabelling it as an unpriced scope", () => {
    const resolved = resolveReportCostIntegrity({
      compositeOptimisation: {
        l2Status: "reconciliation_required",
        quoteReceiptStatus: "quotes_received",
        quoteScopeStatus: "reconciliation_required",
        isComplete: false,
        allInReconciliationRequired: true,
        quoteReconciliations: [{
          quoteId: "10620001",
          status: "reconciliation_required",
          submittedHeaderTotalUsd: 5915,
          submittedItemisedTotalUsd: 5020,
          unexplainedResidualUsd: 895,
        }],
      },
    }, [{ id: 10620001, panel_beater_name: "Alpha", quoted_amount: 591500, currency_code: "USD" }]);

    expect(resolved.l2OptimisedCostUsd).toBeNull();
    expect(resolved.l2Status).toBe("reconciliation_required");
    expect(resolved.quoteScopeStatus).toBe("reconciliation_required");
    expect(resolved.allInReconciliationRequired).toBe(true);
    expect(resolved.unreconciledQuoteCount).toBe(1);
    expect(resolved.missingRequiredComponents).toEqual([]);
  });

  it("preserves comparison-only and explicitly ineligible canonical history without admitting it to active quotation evidence", () => {
    const resolved = resolveReportCostIntegrity({
      compositeOptimisation: {
        sourceQuotesReceived: 3,
        canonicalQuoteLedger: [
          { panelBeater: "Eligible Repairs", totalCostUsd: 1200, currency: "USD", status: "active", evidenceEligibility: "final_l2_eligible", evidenceEligibilityReason: "Active submitted repair quotation is eligible for final L2 selection." },
          { panelBeater: "Withdrawn Repairs", totalCostUsd: 900, currency: "USD", status: "historical", workflowStatus: "cancelled", evidenceEligibility: "comparison_only", evidenceEligibilityReason: "Withdrawn quotation retained as historical price evidence only." },
          { panelBeater: "Scope Defect", totalCostUsd: 1100, currency: "USD", status: "excluded", evidenceEligibility: "ineligible", evidenceEligibilityReason: "Unsupported repair scope." },
        ],
        l2Status: "incomplete_scope",
      },
    }, []);

    expect(resolved.activeQuotes).toMatchObject([{ repairer: "Eligible Repairs", evidenceEligibility: "final_l2_eligible" }]);
    expect(resolved.historicalQuotes).toMatchObject([
      { repairer: "Withdrawn Repairs", evidenceEligibility: "comparison_only", workflowStatus: "cancelled" },
      { repairer: "Scope Defect", evidenceEligibility: "ineligible" },
    ]);
    expect(resolved.l1SubmittedCostUsd).toBe(1200);
    expect(resolved.l2OptimisedCostUsd).toBeNull();
  });
});
