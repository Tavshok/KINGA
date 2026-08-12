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

  it("derives L1 from the lowest active submitted quote when legacy composite metadata is absent", () => {
    const resolved = resolveReportCostIntegrity({}, [
      { id: 1, panel_beater_name: "Alpha", quoted_amount: 230000, currency_code: "USD" },
      { id: 2, panel_beater_name: "Beta", quoted_amount: 199533, currency_code: "USD" },
    ]);

    expect(resolved.l1SubmittedCostUsd).toBe(1995.33);
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
    expect(resolved.activeQuotes).toHaveLength(3);
    expect(resolved.quoteReceiptStatus).toBe("quotes_received");
    expect(resolved.quoteScopeStatus).toBe("incomplete_scope");
    expect(resolved.l2OptimisedCostUsd).toBeNull();
  });
});
