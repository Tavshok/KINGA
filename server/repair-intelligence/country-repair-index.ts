/**
 * Country Repair Index
 *
 * Provides repair cost context adjustments per country:
 *   - VAT rate
 *   - Import duty rate
 *   - Average labour rate per hour (ZAR cents)
 *
 * The table is seeded with South African defaults.
 * Processors can add/update entries via the admin UI.
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
  avgLabourRatePerHour: number; // ZAR cents
  currencyCode: string;
  effectiveFrom: string;
}

/**
 * Seed data for South Africa (used when the table is empty).
 * Based on SARS VAT Act (15%), ITAC tariff schedule, and MIWA labour rate surveys.
 */
export const SA_DEFAULTS: CountryRepairContext = {
  countryCode: "ZA",
  countryName: "South Africa",
  vatRate: 0.15,
  importDutyRate: 0.0,      // No import duty on domestic repairs
  avgLabourRatePerHour: 65000, // R650/hour in cents (MIWA 2024 benchmark)
  currencyCode: "ZAR",
  effectiveFrom: "2024-01-01",
};

/**
 * Fetch the most recent repair context for a given country code.
 * Falls back to SA defaults if the country is not found or DB is unavailable.
 */
export async function getCountryRepairContext(
  countryCode: string = "ZA"
): Promise<CountryRepairContext> {
  try {
    const db = await getDb();
    if (!db) return SA_DEFAULTS;

    const [row] = await db
      .select()
      .from(countryRepairIndex)
      .where(eq(countryRepairIndex.countryCode, countryCode.toUpperCase()))
      .orderBy(desc(countryRepairIndex.effectiveFrom))
      .limit(1);

    if (!row) return SA_DEFAULTS;

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
    return SA_DEFAULTS;
  }
}

/**
 * Adjust a quoted amount to account for VAT and import duty differences
 * between the repair country and the baseline (South Africa).
 *
 * Returns the VAT-exclusive base cost and the full landed cost.
 */
export function applyCountryAdjustments(
  quotedAmountCents: number,
  context: CountryRepairContext
): { baseExVat: number; vatAmount: number; dutyAmount: number; totalLanded: number } {
  const baseExVat = Math.round(quotedAmountCents / (1 + context.vatRate));
  const vatAmount = quotedAmountCents - baseExVat;
  const dutyAmount = Math.round(baseExVat * context.importDutyRate);
  const totalLanded = baseExVat + vatAmount + dutyAmount;
  return { baseExVat, vatAmount, dutyAmount, totalLanded };
}
