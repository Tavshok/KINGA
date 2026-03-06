/**
 * Country Repair Index
 *
 * Provides repair cost context adjustments per country/region:
 *   - VAT rate (only applied when explicitly configured — not assumed)
 *   - Import duty rate (only applied when explicitly configured — not assumed)
 *   - Average labour rate per hour (in the tenant's currency minor units, e.g. cents)
 *   - Currency code (ISO 4217)
 *
 * DEFAULT BEHAVIOUR:
 *   - Currency: USD
 *   - VAT: 0% (not assumed unless tenant configures it)
 *   - Import duty: 0% (not assumed unless tenant configures it)
 *   - Labour rate: 0 (unknown — cost shown as range, not fixed figure)
 *
 * When labour rate is 0 (unknown), the repair intelligence engine
 * outputs cost RANGES rather than fixed figures.
 *
 * Supported currencies: USD, ZiG (Zimbabwe Gold)
 * Additional currencies can be added via the admin UI.
 *
 * NOTE: This module only READS from the DB. All writes go through
 * the admin tRPC procedures in the quoteIntelligence router.
 */

import { getDb } from "../db";
import { countryRepairIndex } from "../../drizzle/schema";
import { eq, desc } from "drizzle-orm";

export interface CountryRepairContext {
  countryCode: string;
  countryName: string;
  vatRate: number;            // decimal, e.g. 0.15
  importDutyRate: number;     // decimal, e.g. 0.25
  avgLabourRatePerHour: number; // currency minor units (cents) — 0 means unknown → show ranges
  currencyCode: string;
  effectiveFrom: string;
}

/**
 * Neutral default context — no regional assumptions.
 * Currency: USD. No VAT. No import duty. Labour rate unknown (show ranges).
 * @deprecated Use NEUTRAL_DEFAULTS instead of SA_DEFAULTS
 */
export const SA_DEFAULTS: CountryRepairContext = {
  countryCode: "ZW",
  countryName: "Zimbabwe",
  vatRate: 0.0,         // No VAT assumed by default
  importDutyRate: 0.0,  // No import duty assumed by default
  avgLabourRatePerHour: 0, // Unknown — engine will output cost ranges
  currencyCode: "USD",
  effectiveFrom: "2024-01-01",
};

/** Preferred alias for neutral defaults */
export const NEUTRAL_DEFAULTS = SA_DEFAULTS;

/**
 * Fetch the most recent repair context for a given country code.
 * Falls back to SA defaults if the country is not found or DB is unavailable.
 */
export async function getCountryRepairContext(
  countryCode: string = "ZA"
): Promise<CountryRepairContext> {
  try {
    const db = await getDb();
    if (!db) return NEUTRAL_DEFAULTS;

    const [row] = await db
      .select()
      .from(countryRepairIndex)
      .where(eq(countryRepairIndex.countryCode, countryCode.toUpperCase()))
      .orderBy(desc(countryRepairIndex.effectiveFrom))
      .limit(1);

    if (!row) return NEUTRAL_DEFAULTS;

    return {
      countryCode: row.countryCode,
      countryName: row.countryName,
      vatRate: parseFloat(row.vatRate as string),
      importDutyRate: parseFloat(row.importDutyRate as string),
      avgLabourRatePerHour: row.avgLabourRatePerHour,
      currencyCode: row.currencyCode,
      effectiveFrom: row.effectiveFrom,
    };
  } catch {
    return NEUTRAL_DEFAULTS;
  }
}

/**
 * Determine whether to show a fixed cost or a cost range.
 * When the labour rate is unknown (0), the engine cannot produce
 * a fixed figure — it returns a range instead.
 */
export function shouldShowCostRange(context: CountryRepairContext): boolean {
  return context.avgLabourRatePerHour === 0;
}

/**
 * Calculate labour cost for a given number of hours.
 * Returns null when the labour rate is unknown (show range instead).
 */
export function calculateLabourCost(
  labourHours: number,
  context: CountryRepairContext
): number | null {
  if (context.avgLabourRatePerHour === 0) return null;
  return Math.round(labourHours * context.avgLabourRatePerHour);
}

/**
 * Adjust a quoted amount to account for VAT and import duty.
 *
 * Only applies adjustments when rates are explicitly non-zero
 * (i.e. configured by the tenant). No regional assumptions are made.
 *
 * Returns the base cost (ex-VAT/duty) and the full landed cost.
 * When vatRate = 0 and importDutyRate = 0, baseExVat = totalLanded = quotedAmountCents.
 */
export function applyCountryAdjustments(
  quotedAmountCents: number,
  context: CountryRepairContext
): { baseExVat: number; vatAmount: number; dutyAmount: number; totalLanded: number } {
  if (context.vatRate === 0 && context.importDutyRate === 0) {
    // No regional adjustments — return quoted amount as-is
    return {
      baseExVat: quotedAmountCents,
      vatAmount: 0,
      dutyAmount: 0,
      totalLanded: quotedAmountCents,
    };
  }
  const baseExVat = context.vatRate > 0
    ? Math.round(quotedAmountCents / (1 + context.vatRate))
    : quotedAmountCents;
  const vatAmount = quotedAmountCents - baseExVat;
  const dutyAmount = Math.round(baseExVat * context.importDutyRate);
  const totalLanded = baseExVat + vatAmount + dutyAmount;
  return { baseExVat, vatAmount, dutyAmount, totalLanded };
}
