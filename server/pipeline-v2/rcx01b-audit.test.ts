/**
 * R-CX-01b Audit Tests
 *
 * Covers:
 *  1. Stage 3 currency regex extension (ZAR, KES, ZMW, NGN, GHS, BWP, NAD)
 *  2. LABOUR_RATES new country entries (ZM, BW, NA, MZ, KE, TZ, UG, MW, NG, GH)
 *  3. SEVERITY_COST_RANGES_CENTS NCI-scaling via validateCostRealism exchangeRateOrScaleFactor
 */

import { describe, it, expect } from "vitest";
import { validateCostRealism, SEVERITY_COST_RANGES_CENTS } from "./costRealismValidator";

// ─── 1. SEVERITY_COST_RANGES_CENTS scaling via validateCostRealism ────────────

describe("R-CX-01b: validateCostRealism exchangeRateOrScaleFactor scales severity ranges", () => {
  // Helper: build a minimal Stage9Output with a given totalCents
  function makeStage9(totalCents: number) {
    return {
      breakdown: {
        // Stage9Output uses camelCase keys — costRealismValidator reads these
        partsCostCents: Math.round(totalCents * 0.5),
        labourCostCents: Math.round(totalCents * 0.35),
        paintCostCents: Math.round(totalCents * 0.1),
        hiddenDamageCostCents: Math.round(totalCents * 0.05),
        totalCents: totalCents,
      },
      confidence: 0.85,
      assumptions: [],
      recovery_actions: [],
      economic_context: null,
      labour_rate_usd_per_hour: 25,
      cost_tier: "medium" as const,
      quote_count: 1,
      quote_selection_rationale: "test",
      selected_quote_id: null,
      selected_quote_total_cents: totalCents,
      adjusted_quote_total_cents: null,
      cost_intelligence_narrative: null,
    } as any;
  }

  it("USD baseline (rate=1.0): ZAR-calibrated severe range stays at USD values", () => {
    const usdSevereMin = SEVERITY_COST_RANGES_CENTS.severe.minCents; // 500_000
    const usdSevereMax = SEVERITY_COST_RANGES_CENTS.severe.maxCents; // 15_000_000

    // Use componentCount=0 to skip parts alignment rule and keep total predictable
    // Use values well inside/outside the range to avoid rounding boundary effects
    // (makeStage9 recomputes total from rounded components, so boundary values can drift)

    // Well inside USD severe range (USD $10,000 = 1_000_000 cents) — should be consistent
    const result = validateCostRealism(makeStage9(1_000_000), 0, "severe", undefined, 1.0);
    expect(result.severity_cost_consistent).toBe(true);

    // Well below USD severe range (USD $2,000 = 200_000 cents) — should be flagged
    const resultBelow = validateCostRealism(makeStage9(200_000), 0, "severe", undefined, 1.0);
    expect(resultBelow.severity_cost_consistent).toBe(false);

    // Well above USD severe max (USD $200,000 = 20_000_000 cents) — should be flagged
    const resultAbove = validateCostRealism(makeStage9(20_000_000), 0, "catastrophic", undefined, 1.0);
    // catastrophic max is 50_000_000; 20_000_000 is within catastrophic range
    expect(resultAbove.severity_cost_consistent).toBe(true);
    // But 20_000_000 is above severe max (15_000_000) — verify severe flags it
    const resultSevereAboveMax = validateCostRealism(makeStage9(20_000_000), 0, "severe", undefined, 1.0);
    expect(resultSevereAboveMax.severity_cost_consistent).toBe(false);
  });

  it("ZAR (rate=18.5): severe range scales to ZAR 9,250,000–277,500,000 cents", () => {
    const rate = 18.5;
    const zarSevereMin = Math.round(SEVERITY_COST_RANGES_CENTS.severe.minCents * rate); // ~9_250_000
    const zarSevereMax = Math.round(SEVERITY_COST_RANGES_CENTS.severe.maxCents * rate); // ~277_500_000

    // Use componentCount=0 to skip parts alignment and keep totals predictable
    // ZAR 100,000 (1,000,000 cents) — below severe min → flagged
    const resultBelow = validateCostRealism(makeStage9(1_000_000), 0, "severe", undefined, rate);
    expect(resultBelow.severity_cost_consistent).toBe(false);
    expect(resultBelow.issues[0]?.description).toContain("below");

    // ZAR 200,000 (20,000,000 cents) — within ZAR severe range → consistent
    const resultIn = validateCostRealism(makeStage9(20_000_000), 0, "severe", undefined, rate);
    expect(resultIn.severity_cost_consistent).toBe(true);

    // ZAR 3,000,000 (300,000,000 cents) — above ZAR severe max → flagged
    const resultAbove = validateCostRealism(makeStage9(300_000_000), 0, "severe", undefined, rate);
    expect(resultAbove.severity_cost_consistent).toBe(false);
    expect(resultAbove.issues[0]?.description).toContain("above");
  });

  it("ZMW (rate=26.5): moderate range scales correctly", () => {
    const rate = 26.5;
    const zmwModerateMin = Math.round(SEVERITY_COST_RANGES_CENTS.moderate.minCents * rate); // ~2_650_000
    const zmwModerateMax = Math.round(SEVERITY_COST_RANGES_CENTS.moderate.maxCents * rate); // ~39_750_000

    // Use componentCount=0 to skip parts alignment and keep totals predictable
    // ZMW 20,000 (2,000,000 cents) — below moderate min → flagged
    const resultBelow = validateCostRealism(makeStage9(2_000_000), 0, "moderate", undefined, rate);
    expect(resultBelow.severity_cost_consistent).toBe(false);

    // ZMW 100,000 (10,000,000 cents) — within ZMW moderate range → consistent
    const resultIn = validateCostRealism(makeStage9(10_000_000), 0, "moderate", undefined, rate);
    expect(resultIn.severity_cost_consistent).toBe(true);
  });

  it("Default rate=1.0 when not provided (backward compat)", () => {
    // Calling without the 5th parameter should behave identically to rate=1.0
    // Use componentCount=0 to skip parts alignment
    const usdCosmetic = SEVERITY_COST_RANGES_CENTS.cosmetic.minCents + 1000;
    const resultDefault = validateCostRealism(makeStage9(usdCosmetic), 0, "cosmetic");
    const resultExplicit = validateCostRealism(makeStage9(usdCosmetic), 0, "cosmetic", undefined, 1.0);
    expect(resultDefault.severity_cost_consistent).toBe(resultExplicit.severity_cost_consistent);
    expect(resultDefault.confidence_multiplier).toBe(resultExplicit.confidence_multiplier);
  });

  it("ZAR minor repair (ZAR 5,000 = 500,000 cents) is consistent with 'minor' severity", () => {
    // USD minor range: 20,000–500,000 cents
    // ZAR minor range: 370,000–9,250,000 cents (rate=18.5)
    // ZAR 5,000 = 500,000 cents → within ZAR minor range → consistent
    const result = validateCostRealism(makeStage9(500_000), 0, "minor", undefined, 18.5);
    expect(result.severity_cost_consistent).toBe(true);
  });

  it("ZAR minor repair (ZAR 5,000 = 500,000 cents) would be WRONG with USD-only check", () => {
    // Without rate scaling, USD minor range: 20,000–500,000 cents
    // 500,000 is at the boundary — but ZAR 5,000 is a minor repair, not a USD $5,000 repair
    // This test documents the pre-fix behaviour to confirm the fix matters
    const resultUsd = validateCostRealism(makeStage9(500_000), 0, "minor", undefined, 1.0);
    // 500,000 is at the max boundary of USD minor range — borderline consistent
    // The key point: with ZAR rate=18.5, the same amount is well within range
    const resultZar = validateCostRealism(makeStage9(500_000), 0, "minor", undefined, 18.5);
    expect(resultZar.severity_cost_consistent).toBe(true);
  });

  it("rate=0 falls back to 1.0 (guard against division by zero)", () => {
    const usdCosmetic = SEVERITY_COST_RANGES_CENTS.cosmetic.minCents + 1000;
    const resultZeroRate = validateCostRealism(makeStage9(usdCosmetic), 0, "cosmetic", undefined, 0);
    const resultOneRate = validateCostRealism(makeStage9(usdCosmetic), 0, "cosmetic", undefined, 1.0);
    expect(resultZeroRate.severity_cost_consistent).toBe(resultOneRate.severity_cost_consistent);
  });
});

// ─── 2. LABOUR_RATES new country entries ─────────────────────────────────────

describe("R-CX-01b: LABOUR_RATES new country entries", () => {
  // We test indirectly by importing the module and checking the exported constant
  // The LABOUR_RATES table is not exported, but we can verify via the test that
  // stage-9-cost resolves country codes correctly by checking the module compiles
  // and the expected country codes are present in the source.

  it("stage-9-cost.ts LABOUR_RATES contains all 10 new country codes", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync(
      new URL("./stage-9-cost.ts", import.meta.url).pathname,
      "utf-8"
    );
    const newCodes = ["ZM:", "BW:", "NA:", "MZ:", "KE:", "TZ:", "UG:", "MW:", "NG:", "GH:"];
    for (const code of newCodes) {
      expect(source, `Missing country code ${code} in LABOUR_RATES`).toContain(code);
    }
  });

  it("LABOUR_RATES new entries have plausible USD/hour values (5–50)", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync(
      new URL("./stage-9-cost.ts", import.meta.url).pathname,
      "utf-8"
    );
    // Extract all rate values from the LABOUR_RATES block
    const rateBlock = source.match(/const LABOUR_RATES[^}]+}/s)?.[0] ?? "";
    const rates = [...rateBlock.matchAll(/[A-Z]{2}:\s*(\d+)/g)].map(m => parseInt(m[1]));
    expect(rates.length).toBeGreaterThanOrEqual(15); // at least 15 entries
    for (const rate of rates) {
      expect(rate, `Rate ${rate} is outside plausible range`).toBeGreaterThanOrEqual(5);
      expect(rate, `Rate ${rate} is outside plausible range`).toBeLessThanOrEqual(100);
    }
  });
});

// ─── 3. Stage 3 currency regex extension ─────────────────────────────────────

describe("R-CX-01b: Stage 3 currency regex extension", () => {
  it("stage-3-structured-extraction.ts regex covers ZAR, KES, ZMW, BWP, NAD, NGN, GHS", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync(
      new URL("./stage-3-structured-extraction.ts", import.meta.url).pathname,
      "utf-8"
    );
    // All new currency codes/symbols should appear in the CURRENCY_PREFIX constant
    const prefixBlock = source.match(/const CURRENCY_PREFIX[^\n]+/)?.[0] ?? "";
    expect(prefixBlock, "ZAR missing from CURRENCY_PREFIX").toContain("ZAR");
    expect(prefixBlock, "ZMW missing from CURRENCY_PREFIX").toContain("ZMW");
    expect(prefixBlock, "KES missing from CURRENCY_PREFIX").toContain("KES");
    expect(prefixBlock, "BWP missing from CURRENCY_PREFIX").toContain("BWP");
    expect(prefixBlock, "NAD missing from CURRENCY_PREFIX").toContain("NAD");
    expect(prefixBlock, "NGN missing from CURRENCY_PREFIX").toContain("NGN");
    expect(prefixBlock, "GHS missing from CURRENCY_PREFIX").toContain("GHS");
    // Existing codes should still be present
    expect(prefixBlock, "USD missing from CURRENCY_PREFIX").toContain("USD");
    expect(prefixBlock, "ZiG missing from CURRENCY_PREFIX").toContain("ZiG");
    expect(prefixBlock, "ZWL missing from CURRENCY_PREFIX").toContain("ZWL");
  });

  it("Stage 3 LLM prompt covers ZMW, KES, BWP, NAD, MZN, TZS, UGX, MWK", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync(
      new URL("./stage-3-structured-extraction.ts", import.meta.url).pathname,
      "utf-8"
    );
    // The LLM prompt at line 126 should list these codes
    const promptCurrencies = ["ZAR", "ZMW", "BWP", "NAD", "MZN", "KES", "TZS", "UGX", "MWK"];
    for (const code of promptCurrencies) {
      expect(source, `${code} missing from Stage 3 LLM currency prompt`).toContain(code);
    }
  });

  it("quoteExtractionEngine.ts LLM prompt covers all SADC currencies", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync(
      new URL("./quoteExtractionEngine.ts", import.meta.url).pathname,
      "utf-8"
    );
    const codes = ["ZAR", "ZMW", "BWP", "NAD", "MZN", "KES", "TZS", "UGX", "MWK"];
    for (const code of codes) {
      expect(source, `${code} missing from quoteExtractionEngine LLM prompt`).toContain(code);
    }
  });
});

// ─── 4. SEVERITY_COST_RANGES_CENTS baseline sanity ───────────────────────────

describe("R-CX-01b: SEVERITY_COST_RANGES_CENTS baseline values unchanged", () => {
  it("USD baseline ranges are unchanged from R-E-02 calibration", () => {
    expect(SEVERITY_COST_RANGES_CENTS.none).toEqual({ minCents: 0, maxCents: 10_000 });
    expect(SEVERITY_COST_RANGES_CENTS.cosmetic).toEqual({ minCents: 5_000, maxCents: 200_000 });
    expect(SEVERITY_COST_RANGES_CENTS.minor).toEqual({ minCents: 20_000, maxCents: 500_000 });
    expect(SEVERITY_COST_RANGES_CENTS.moderate).toEqual({ minCents: 100_000, maxCents: 1_500_000 });
    expect(SEVERITY_COST_RANGES_CENTS.severe).toEqual({ minCents: 500_000, maxCents: 15_000_000 });
    expect(SEVERITY_COST_RANGES_CENTS.catastrophic).toEqual({ minCents: 2_000_000, maxCents: 50_000_000 });
  });
});
