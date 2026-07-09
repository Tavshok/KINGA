/**
 * R-CX-01c Audit Tests — ForensicDecisionPanel $ fix + stage-5 valuation prompt generalisation
 *
 * Verifies:
 * 1. ForensicDecisionPanel no longer has a hardcoded $ for true_cost_usd
 * 2. stage-5-assembly.ts imports countryCurrency utilities
 * 3. stage-5-assembly.ts derives tenantCurrencyCode / tenantCountryName from ctx.tenantCountry
 * 4. stage-5-assembly.ts uses tenantCurrencyCode in all verdictReason strings
 * 5. stage-5-assembly.ts uses tenantCurrencyCode in the valuation log line
 * 6. stage-5-assembly.ts uses tenantCurrencyCode in the LLM user prompt
 * 7. stage-5-assembly.ts uses tenantCountryName in the LLM system prompt
 * 8. stage-5-assembly.ts has isZimbabwe guard for Zimbabwe-specific context
 * 9. stage-5-assembly.ts uses tenantCurrencyCode in assessorNote strings
 * 10. stage-5-assembly.ts uses tenantCurrencyCode in the assumptions reason string
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const FORENSIC_PANEL = path.join(
  __dirname,
  "../../client/src/components/ForensicDecisionPanel.tsx"
);
const STAGE5 = path.join(__dirname, "stage-5-assembly.ts");

const forensicContent = fs.readFileSync(FORENSIC_PANEL, "utf-8");
const stage5Content = fs.readFileSync(STAGE5, "utf-8");

describe("R-CX-01c: ForensicDecisionPanel $ hardcode fix", () => {
  it("should not have a hardcoded $ before true_cost_usd.toLocaleString()", () => {
    // The old pattern was: >${validatedOutcome.metadata.true_cost_usd.toLocaleString()}</p>
    // (where > is a JSX text node containing the dollar sign)
    const hardcodedDollar = />\s*\$\s*\{validatedOutcome\.metadata\.true_cost_usd\.toLocaleString\(\)\}/;
    expect(hardcodedDollar.test(forensicContent)).toBe(false);
  });

  it("should use fmt() to format true_cost_usd in ForensicDecisionPanel", () => {
    const usesFmt = /\{fmt\(validatedOutcome\.metadata\.true_cost_usd\)\}/;
    expect(usesFmt.test(forensicContent)).toBe(true);
  });

  it("should have useTenantCurrency imported in ForensicDecisionPanel", () => {
    expect(forensicContent).toContain("useTenantCurrency");
  });
});

describe("R-CX-01c: stage-5 valuation prompt generalisation", () => {
  it("should import getDefaultCurrencyForCountry from countryCurrency", () => {
    expect(stage5Content).toContain("getDefaultCurrencyForCountry");
    expect(stage5Content).toContain("countryCurrency");
  });

  it("should import getDefaultCurrencySymbolForCountry from countryCurrency", () => {
    expect(stage5Content).toContain("getDefaultCurrencySymbolForCountry");
  });

  it("should import COUNTRY_CURRENCY_MAP from countryCurrency", () => {
    expect(stage5Content).toContain("COUNTRY_CURRENCY_MAP");
  });

  it("should derive tenantCurrencyCode from ctx.tenantCountry", () => {
    expect(stage5Content).toContain("getDefaultCurrencyForCountry(ctx.tenantCountry)");
  });

  it("should derive tenantCountryName with COUNTRY_CURRENCY_MAP fallback", () => {
    expect(stage5Content).toContain("COUNTRY_CURRENCY_MAP[ctx.tenantCountry.toUpperCase()]?.name");
  });

  it("should have isZimbabwe guard for Zimbabwe-specific market context", () => {
    expect(stage5Content).toContain("isZimbabwe");
    expect(stage5Content).toContain("'ZW'");
  });

  it("should use tenantCurrencyCode in the LLM user prompt", () => {
    expect(stage5Content).toContain("Estimate the current retail market value in ${tenantCurrencyCode}");
  });

  it("should use tenantCountryName in the LLM system prompt", () => {
    expect(stage5Content).toContain("specialising in the ${tenantCountryName} used-car market");
  });

  it("should use tenantCurrencyCode in write_off verdictReason", () => {
    expect(stage5Content).toContain("Repair cost (${tenantCurrencyCode}");
    expect(stage5Content).toContain("Exceeds 75% threshold");
  });

  it("should use tenantCurrencyCode in borderline verdictReason", () => {
    expect(stage5Content).toContain("Borderline \u2014 recommend independent valuation.");
    // Confirm no hardcoded USD in verdict reasons
    expect(stage5Content).not.toContain("Repair cost (USD");
  });

  it("should use tenantCurrencyCode in the Stage 5c log line", () => {
    expect(stage5Content).toContain("tenantCurrencyCode + \" \" + (marketValueUsdFinal as number).toLocaleString()");
  });

  it("should use tenantCurrencyCode in assessorNote deviation string", () => {
    expect(stage5Content).toContain("assessor stated: ${tenantCurrencyCode}");
  });

  it("should use tenantCurrencyCode in the assumptions reason string", () => {
    expect(stage5Content).toContain("LLM estimated ${tenantCurrencyCode}");
    expect(stage5Content).toContain("in ${tenantCountryName}.");
  });

  it("should NOT have hardcoded 'in Southern Africa' in the assumptions reason", () => {
    expect(stage5Content).not.toContain("in Southern Africa.");
  });
});
