/**
 * server/pipeline-v2/economicContextEngine.ts
 *
 * Economic Context Engine (Phase 2B)
 *
 * Derives the full economic context for a claim from the policy/tenant configuration.
 * The economic context follows the POLICY, not the incident location.
 * A Zimbabwean policy is assessed by Zimbabwean standards and paid in the policy currency.
 *
 * Produces:
 *   - Currency and exchange rate (from DB, with fallback to hardcoded defaults)
 *   - PPP (Purchasing Power Parity) factor relative to USD
 *   - Parts sourcing profile (OEM / aftermarket / reconditioned mix)
 *   - Labour rate in both policy currency and USD
 *   - Normalised Cost Index (NCI) — a single multiplier applied to USD benchmarks
 *     to produce a locally-calibrated cost estimate
 *   - Inflation flag (from existing partsInflationDetected / labourInflationDetected)
 */

import { getDb } from "../db";

// ─── Types ────────────────────────────────────────────────────────────────────

export type PartsSourceProfile = "OEM" | "AFTERMARKET" | "RECONDITIONED" | "MIXED";

export interface EconomicContext {
  /** ISO 4217 currency code (from policy/tenant) */
  currency: string;
  /** Currency symbol for display */
  currencySymbol: string;
  /** Exchange rate: 1 USD = X policy currency units */
  exchangeRateToUsd: number;
  /** Purchasing Power Parity factor relative to USD (1.0 = parity with USD) */
  pppFactor: number;
  /** Labour rate in policy currency per hour */
  labourRatePolicyCurrencyPerHour: number;
  /** Labour rate in USD per hour (for benchmark comparison) */
  labourRateUsdPerHour: number;
  /** Parts sourcing profile for this market */
  partsSourceProfile: PartsSourceProfile;
  /**
   * Normalised Cost Index — multiply USD benchmark costs by this factor
   * to get locally-calibrated costs in policy currency.
   * NCI = PPP factor × exchange rate × parts source multiplier
   */
  normalisedCostIndex: number;
  /** Whether parts inflation has been detected in recent claims for this tenant */
  partsInflationDetected: boolean;
  /** Whether labour inflation has been detected in recent claims for this tenant */
  labourInflationDetected: boolean;
  /** Source of the exchange rate data */
  exchangeRateSource: "database" | "hardcoded_default";
  /** ISO timestamp of when the exchange rate was last updated */
  exchangeRateLastUpdated: string | null;
}

export interface EconomicContextInput {
  tenantId: string | null;
  /** Primary currency from tenant config */
  primaryCurrency: string;
  /** Primary currency symbol from tenant config */
  primaryCurrencySymbol: string;
  /** Labour rate in USD per hour (from tenantRates) */
  labourRateUsdPerHour: number;
  /** Market region code (e.g. 'ZW', 'ZA', 'ZM') */
  marketRegion: string;
}

// ─── PPP Factors ─────────────────────────────────────────────────────────────
// Purchasing Power Parity factors relative to USD (1.0 = parity).
// Source: World Bank ICP 2023 data for emerging market vehicle repair contexts.
// These represent how far a USD goes in each market relative to the US.
// A factor > 1.0 means costs are lower than USD equivalent (money goes further).
const PPP_FACTORS: Record<string, number> = {
  ZW:  2.8,   // Zimbabwe — significant PPP advantage (informal economy pricing)
  ZA:  1.6,   // South Africa — moderate PPP advantage
  ZM:  2.1,   // Zambia
  MZ:  2.4,   // Mozambique
  BW:  1.4,   // Botswana
  NA:  1.5,   // Namibia
  MW:  3.2,   // Malawi
  TZ:  2.6,   // Tanzania
  KE:  2.0,   // Kenya
  NG:  2.3,   // Nigeria
  GH:  2.2,   // Ghana
  UG:  2.7,   // Uganda
  RW:  2.5,   // Rwanda
  ET:  3.0,   // Ethiopia
  SN:  2.1,   // Senegal
  CI:  1.9,   // Côte d'Ivoire
  CM:  2.2,   // Cameroon
  US:  1.0,   // United States (baseline)
  GB:  0.85,  // United Kingdom
  EU:  0.9,   // Eurozone average
  AU:  0.95,  // Australia
  DEFAULT: 1.8, // Conservative default for unrecognised emerging markets
};

// ─── Parts Source Profiles ────────────────────────────────────────────────────
// Default parts sourcing profile by market region.
// Affects the parts cost multiplier in the NCI.
const PARTS_SOURCE_PROFILES: Record<string, PartsSourceProfile> = {
  ZW: "RECONDITIONED",   // Zimbabwe — predominantly reconditioned parts
  ZA: "MIXED",           // South Africa — mix of OEM and aftermarket
  ZM: "AFTERMARKET",     // Zambia — predominantly aftermarket
  MZ: "AFTERMARKET",
  BW: "MIXED",
  NA: "MIXED",
  MW: "RECONDITIONED",
  TZ: "AFTERMARKET",
  KE: "MIXED",
  NG: "AFTERMARKET",
  GH: "AFTERMARKET",
  UG: "AFTERMARKET",
  US: "OEM",
  GB: "OEM",
  EU: "OEM",
  AU: "OEM",
  DEFAULT: "AFTERMARKET",
};

// Parts source cost multipliers relative to OEM (1.0 = OEM price)
const PARTS_SOURCE_MULTIPLIERS: Record<PartsSourceProfile, number> = {
  OEM:          1.0,
  MIXED:        0.72,
  AFTERMARKET:  0.55,
  RECONDITIONED: 0.38,
};

// ─── Hardcoded default exchange rates (fallback when DB is unavailable) ────────
// These are approximate rates as of Q1 2025. The DB is the authoritative source.
const DEFAULT_EXCHANGE_RATES: Record<string, number> = {
  USD: 1.0,
  ZAR: 18.5,
  ZWG: 25.0,   // Zimbabwe Gold (ZiG) — approximate
  ZMW: 26.5,   // Zambian Kwacha
  MZN: 63.8,   // Mozambican Metical
  BWP: 13.6,   // Botswana Pula
  NAD: 18.5,   // Namibian Dollar (pegged to ZAR)
  MWK: 1730.0, // Malawian Kwacha
  TZS: 2550.0, // Tanzanian Shilling
  KES: 129.0,  // Kenyan Shilling
  NGN: 1580.0, // Nigerian Naira
  GHS: 15.5,   // Ghanaian Cedi
  UGX: 3750.0, // Ugandan Shilling
  RWF: 1310.0, // Rwandan Franc
  ETB: 57.0,   // Ethiopian Birr
  XOF: 610.0,  // West African CFA Franc
  GBP: 0.79,
  EUR: 0.92,
  AUD: 1.53,
};

// ─── Exchange rate cache ──────────────────────────────────────────────────────
let _ratesCache: Record<string, { rate: number; lastUpdated: string }> | null = null;
let _ratesCacheTime = 0;
const CACHE_TTL_MS = 3_600_000; // 1 hour

async function getExchangeRatesFromDb(): Promise<{
  rates: Record<string, { rate: number; lastUpdated: string }>;
  source: "database" | "hardcoded_default";
}> {
  // Return cached rates if fresh
  if (_ratesCache && Date.now() - _ratesCacheTime < CACHE_TTL_MS) {
    return { rates: _ratesCache, source: "database" };
  }

  try {
    const db = await getDb();
    if (!db) throw new Error("DB unavailable");

    const { currencyExchangeRates } = await import("../../drizzle/schema");
    const { eq } = await import("drizzle-orm");

    const rows = await db
      .select({
        currencyCode: currencyExchangeRates.currencyCode,
        rateToUsd: currencyExchangeRates.rateToUsd,
        lastUpdated: currencyExchangeRates.lastUpdated,
      })
      .from(currencyExchangeRates)
      .where(eq(currencyExchangeRates.isActive, 1));

    if (rows.length === 0) {
      throw new Error("No active exchange rates in DB");
    }

    const rates: Record<string, { rate: number; lastUpdated: string }> = {};
    for (const row of rows) {
      rates[row.currencyCode] = {
        rate: parseFloat(String(row.rateToUsd)),
        lastUpdated: row.lastUpdated ?? new Date().toISOString(),
      };
    }

    _ratesCache = rates;
    _ratesCacheTime = Date.now();
    return { rates, source: "database" };
  } catch {
    // Fall back to hardcoded defaults
    const rates: Record<string, { rate: number; lastUpdated: string }> = {};
    for (const [code, rate] of Object.entries(DEFAULT_EXCHANGE_RATES)) {
      rates[code] = { rate, lastUpdated: "2025-01-01T00:00:00Z" };
    }
    return { rates, source: "hardcoded_default" };
  }
}

// ─── Main function ────────────────────────────────────────────────────────────

export async function deriveEconomicContext(
  input: EconomicContextInput
): Promise<EconomicContext> {
  const currency = (input.primaryCurrency || "USD").toUpperCase();
  const currencySymbol = input.primaryCurrencySymbol || "$";
  const region = (input.marketRegion || "DEFAULT").toUpperCase();

  // 1. Exchange rate
  const { rates, source } = await getExchangeRatesFromDb();
  const rateEntry = rates[currency] ?? rates["USD"] ?? { rate: 1.0, lastUpdated: null };
  const exchangeRateToUsd = rateEntry.rate;

  // 2. PPP factor
  const pppFactor = PPP_FACTORS[region] ?? PPP_FACTORS["DEFAULT"];

  // 3. Parts source profile
  const partsSourceProfile = PARTS_SOURCE_PROFILES[region] ?? PARTS_SOURCE_PROFILES["DEFAULT"];
  const partsMultiplier = PARTS_SOURCE_MULTIPLIERS[partsSourceProfile];

  // 4. Labour rate in policy currency
  const labourRateUsdPerHour = input.labourRateUsdPerHour > 0 ? input.labourRateUsdPerHour : 25.0;
  const labourRatePolicyCurrencyPerHour = labourRateUsdPerHour * exchangeRateToUsd;

  // 5. Normalised Cost Index
  // NCI converts a USD benchmark cost into a locally-calibrated cost in policy currency.
  // Formula: NCI = (1 / pppFactor) × exchangeRateToUsd × partsMultiplier
  // The PPP factor is inverted because a high PPP factor means costs are LOWER than USD equivalent.
  const normalisedCostIndex = (1 / pppFactor) * exchangeRateToUsd * partsMultiplier;

  return {
    currency,
    currencySymbol,
    exchangeRateToUsd,
    pppFactor,
    labourRatePolicyCurrencyPerHour,
    labourRateUsdPerHour,
    partsSourceProfile,
    normalisedCostIndex,
    partsInflationDetected: false, // populated by Stage 9 from DB learning records
    labourInflationDetected: false,
    exchangeRateSource: source,
    exchangeRateLastUpdated: rateEntry.lastUpdated ?? null,
  };
}

/**
 * Apply the Normalised Cost Index to a USD benchmark cost.
 * Returns the cost in the policy currency.
 */
export function applyNCI(usdCostCents: number, nci: EconomicContext["normalisedCostIndex"]): number {
  return Math.round(usdCostCents * nci);
}

/**
 * Convert a cost in policy currency back to USD for cross-market comparison.
 */
export function toUsd(policyCurrencyCents: number, exchangeRateToUsd: number): number {
  if (exchangeRateToUsd <= 0) return policyCurrencyCents;
  return Math.round(policyCurrencyCents / exchangeRateToUsd);
}

/**
 * Format a cost in policy currency for display.
 * e.g. formatCost(150000, { currency: "ZAR", currencySymbol: "R" }) → "R 1,500.00"
 */
export function formatCost(
  cents: number,
  ctx: Pick<EconomicContext, "currencySymbol">
): string {
  const amount = cents / 100;
  return `${ctx.currencySymbol} ${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
