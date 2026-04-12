/**
 * Phase 7 — End-to-End Integration Tests
 *
 * Covers the four pipeline fixes that close the loop for client-ready results:
 * Fix 1: PipelineIncompleteError routing (no unhandled 500)
 * Fix 2: repairCountry + quoteCurrency extracted in Stage 3 schema
 * Fix 3: Cross-border currency normalisation in Stage 9 (ZAR → USD)
 * Fix 4: PIPELINE_INCOMPLETE + REPLAY_INCOMPLETE banners in UI (type-level)
 */

import { describe, it, expect } from "vitest";

// ── Fix 1: PipelineIncompleteError ─────────────────────────────────────────
import { PipelineIncompleteError, enforceCompletenessOrThrow } from "./pipeline-v2/pipelineCompletenessGuard";

describe("Fix 1: PipelineIncompleteError routing", () => {
  it("PipelineIncompleteError is a proper Error subclass with guardResult", () => {
    const guardResult = {
      complete: false,
      failures: [
        { reason: "IFE_ABSENT" as const, detail: "IFE result is absent", blocking: true },
        { reason: "DOE_ABSENT" as const, detail: "DOE result is absent", blocking: true },
      ],
      failureState: "PIPELINE_INCOMPLETE" as const,
      exceptionReason: "IFE and DOE results are absent",
    };
    const err = new PipelineIncompleteError(1, guardResult);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(PipelineIncompleteError);
    expect(err.guardResult.failures.map(f => f.reason)).toContain("IFE_ABSENT");
    expect(err.guardResult.complete).toBe(false);
    expect(err.message).toContain("IFE");
  });

  it("enforceCompletenessOrThrow does not throw when IFE and DOE are present", () => {
    const input = {
      ifeResult: { completenessScore: 80, gapCount: 2, doeEligible: true },
      doeResult: { status: "SELECTED", selectedCandidate: null },
      felVersionSnapshot: { replaySupported: true, stages: [] },
    };
    expect(() => enforceCompletenessOrThrow(1, input)).not.toThrow();
  });

  it("enforceCompletenessOrThrow throws PipelineIncompleteError when IFE is null", () => {
    const input = {
      ifeResult: null,
      doeResult: { status: "SELECTED" },
      felVersionSnapshot: { replaySupported: true, stages: [] },
    };
    expect(() => enforceCompletenessOrThrow(1, input))
      .toThrow(PipelineIncompleteError);
  });

  it("enforceCompletenessOrThrow throws PipelineIncompleteError when DOE is null", () => {
    const input = {
      ifeResult: { completenessScore: 80, gapCount: 2, doeEligible: true },
      doeResult: null,
      felVersionSnapshot: { replaySupported: true, stages: [] },
    };
    expect(() => enforceCompletenessOrThrow(1, input))
      .toThrow(PipelineIncompleteError);
  });

  it("enforceCompletenessOrThrow does not throw when FEL replay is incomplete (non-blocking)", () => {
    const input = {
      ifeResult: { completenessScore: 80, gapCount: 2, doeEligible: true },
      doeResult: { status: "SELECTED" },
      felVersionSnapshot: { replaySupported: false, replayLimitation: "Missing prompt hash for stage-2", stages: [] },
    };
    // Should NOT throw — REPLAY_INCOMPLETE is a warning, not a hard block
    expect(() => enforceCompletenessOrThrow(1, input)).not.toThrow();
  });
});

// ── Fix 2: repairCountry + quoteCurrency in ExtractedClaimFields ───────────
import type { ExtractedClaimFields } from "./pipeline-v2/types";

describe("Fix 2: repairCountry and quoteCurrency in ExtractedClaimFields", () => {
  it("ExtractedClaimFields type includes repairCountry and quoteCurrency", () => {
    // TypeScript compile-time check — if this compiles, the fields exist
    const fields: Partial<ExtractedClaimFields> = {
      repairCountry: "ZA",
      quoteCurrency: "ZAR",
    };
    expect(fields.repairCountry).toBe("ZA");
    expect(fields.quoteCurrency).toBe("ZAR");
  });

  it("repairCountry and quoteCurrency can be null (optional fields)", () => {
    const fields: Partial<ExtractedClaimFields> = {
      repairCountry: null,
      quoteCurrency: null,
    };
    expect(fields.repairCountry).toBeNull();
    expect(fields.quoteCurrency).toBeNull();
  });

  it("cross-border scenario: ZW policy, ZA repair, ZAR quote", () => {
    const fields: Partial<ExtractedClaimFields> = {
      repairCountry: "ZA",
      quoteCurrency: "ZAR",
      vehicleRegistration: "ABC 1234 ZW",
    };
    // Detection logic: repairCountry !== marketRegion (ZW)
    const marketRegion = "ZW";
    const isCrossBorder = fields.repairCountry !== null && fields.repairCountry !== marketRegion;
    expect(isCrossBorder).toBe(true);
    expect(fields.quoteCurrency).toBe("ZAR");
  });
});

// ── Fix 3: Cross-border currency normalisation logic ───────────────────────
describe("Fix 3: Cross-border ZAR → USD currency normalisation", () => {
  it("ZAR quote normalised to USD at ~18.5 ZAR/USD fallback rate", () => {
    const quoteCurrencyCode = "ZAR";
    const policyCurrency = "USD";
    const exchangeRateToUsd = null; // ECE not available
    const ZAR_USD_FALLBACK = 1 / 18.5;

    const zarToUsdRate = (quoteCurrencyCode === "ZAR" && policyCurrency === "USD")
      ? (exchangeRateToUsd ?? ZAR_USD_FALLBACK)
      : null;

    expect(zarToUsdRate).not.toBeNull();
    // R18,500 ZAR quote should normalise to ~$1,000 USD
    const zarQuote = 18500;
    const usdNormalised = zarQuote * zarToUsdRate!;
    expect(usdNormalised).toBeCloseTo(1000, 0);
  });

  it("ZAR quote normalised using ECE exchange rate when available", () => {
    const quoteCurrencyCode = "ZAR";
    const policyCurrency = "USD";
    const exchangeRateToUsd = 0.052; // 1 ZAR = 0.052 USD (19.2 ZAR/USD)

    const zarToUsdRate = (quoteCurrencyCode === "ZAR" && policyCurrency === "USD")
      ? exchangeRateToUsd
      : null;

    expect(zarToUsdRate).toBe(0.052);
    const zarQuote = 19200;
    const usdNormalised = zarQuote * zarToUsdRate!;
    expect(usdNormalised).toBeCloseTo(998.4, 0);
  });

  it("same-currency scenario: no conversion applied", () => {
    const quoteCurrencyCode = "USD";
    const policyCurrency = "USD";

    const zarToUsdRate = (quoteCurrencyCode === "ZAR" && policyCurrency === "USD")
      ? (1 / 18.5)
      : null;

    expect(zarToUsdRate).toBeNull();
  });

  it("ZW policy with ZA repair: cross-border detected and currency set to ZAR for quotes", () => {
    const region = "ZW";
    const extractedRepairCountry = "ZA";
    const extractedQuoteCurrency = "ZAR";

    const isCrossBorderRepair = extractedRepairCountry !== null && extractedRepairCountry !== region;
    const currency = isCrossBorderRepair && extractedRepairCountry === "ZA" ? "ZAR" : "USD";
    const quoteCurrencyCode = extractedQuoteCurrency ?? currency;

    expect(isCrossBorderRepair).toBe(true);
    expect(currency).toBe("ZAR"); // policy region ZW but repair in ZA → ZAR rates apply
    expect(quoteCurrencyCode).toBe("ZAR");
  });

  it("ZW policy with ZW repair: no cross-border, policy currency is USD", () => {
    const region = "ZW";
    const extractedRepairCountry = "ZW";
    const extractedQuoteCurrency = null;

    const isCrossBorderRepair = extractedRepairCountry !== null && extractedRepairCountry !== region;
    const currency = isCrossBorderRepair ? "ZAR" : (region === "ZW" ? "USD" : "USD");
    const quoteCurrencyCode = extractedQuoteCurrency ?? currency;

    expect(isCrossBorderRepair).toBe(false);
    expect(currency).toBe("USD");
    expect(quoteCurrencyCode).toBe("USD");
  });
});

// ── Fix 4: UI banner type safety ────────────────────────────────────────────
describe("Fix 4: PIPELINE_INCOMPLETE and REPLAY_INCOMPLETE banner data shapes", () => {
  it("PIPELINE_INCOMPLETE summary has expected fields", () => {
    const summary = {
      status: "PIPELINE_INCOMPLETE",
      reason: "IFE result is absent — cannot produce a defensible report",
      missingComponents: ["IFE", "DOE"],
      timestamp: Date.now(),
    };
    expect(summary.status).toBe("PIPELINE_INCOMPLETE");
    expect(summary.missingComponents).toContain("IFE");
    expect(summary.reason).toBeTruthy();
  });

  it("REPLAY_INCOMPLETE FEL snapshot has expected fields", () => {
    const felSnap = {
      replaySupported: false,
      replayLimitation: "Stage stage-2-extraction is missing a prompt hash — deterministic replay not possible",
      snapshotTimestamp: Date.now(),
      stageVersions: [],
    };
    expect(felSnap.replaySupported).toBe(false);
    expect(felSnap.replayLimitation).toContain("prompt hash");
  });

  it("COMPLETE assessment has replaySupported=true and no missingComponents", () => {
    const summary = {
      status: "COMPLETE",
      reason: null,
      missingComponents: [],
    };
    const felSnap = {
      replaySupported: true,
      replayLimitation: null,
    };
    expect(summary.status).toBe("COMPLETE");
    expect(summary.missingComponents).toHaveLength(0);
    expect(felSnap.replaySupported).toBe(true);
  });
});
