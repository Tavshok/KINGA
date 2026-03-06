/**
 * Shared currency formatting utilities.
 *
 * All monetary values in the database are stored as integers in the smallest
 * currency unit (cents, pence, etc.).  These helpers convert them to a
 * human-readable string using the claim / tenant currency code.
 *
 * Currency symbol rules (per Zimbabwe deployment spec):
 *   USD → "US$"
 *   ZIG → "ZIG"
 *   ZAR → "R"
 *   All others → Intl.NumberFormat narrowSymbol (e.g. "£", "€")
 *
 * IMPORTANT: No currency conversion is performed here.  Only the display
 * symbol and formatting change.
 */

/**
 * Return the display symbol for a given ISO 4217 currency code.
 *
 * Overrides are applied first; unrecognised codes fall back to the
 * narrow symbol produced by Intl.NumberFormat.
 */
export function getCurrencySymbolForCode(code: string | null | undefined): string {
  const upper = (code ?? "USD").toUpperCase();
  switch (upper) {
    case "USD": return "US$";
    case "ZIG": return "ZIG";
    case "ZAR": return "R";
    default: {
      // Attempt to derive the narrow symbol via Intl
      try {
        const parts = new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: upper,
          currencyDisplay: "narrowSymbol",
        }).formatToParts(0);
        const sym = parts.find((p) => p.type === "currency");
        if (sym) return sym.value;
      } catch {
        // Unknown currency code — return the code itself as the symbol
      }
      return upper;
    }
  }
}

/**
 * Format a value stored in cents to a human-readable currency string.
 *
 * Uses the supplied symbol (or pre-resolved code) so that locale grouping
 * and decimal rules are applied correctly.
 *
 * @param valueInCents  Integer value in the smallest currency unit (e.g. 150000 → "US$1,500.00")
 * @param currencySymbol  Pre-resolved display symbol (e.g. "US$", "R", "ZIG").  Defaults to "US$".
 * @param options  Optional overrides for decimal places and compact notation.
 */
export function formatCurrency(
  valueInCents: number | null | undefined,
  currencySymbol: string = "US$",
  options: { decimals?: number; compact?: boolean } = {}
): string {
  if (valueInCents == null || isNaN(valueInCents)) {
    return `${currencySymbol}0.00`;
  }
  const { decimals = 2, compact = false } = options;
  const value = valueInCents / 100;

  if (compact && Math.abs(value) >= 1_000_000) {
    return `${currencySymbol}${(value / 1_000_000).toFixed(1)}M`;
  }
  if (compact && Math.abs(value) >= 1_000) {
    return `${currencySymbol}${(value / 1_000).toFixed(1)}K`;
  }

  return `${currencySymbol}${value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

/**
 * Format a value stored in cents using an ISO 4217 currency code directly.
 *
 * Resolves the display symbol via getCurrencySymbolForCode, then delegates
 * to formatCurrency.  Use this when you have a currency code (e.g. from a
 * claim record) rather than a pre-resolved symbol.
 *
 * @param valueInCents  Integer value in cents
 * @param currencyCode  ISO 4217 code (e.g. "USD", "ZIG", "ZAR")
 * @param options  Optional overrides for decimal places and compact notation
 */
export function formatCurrencyByCode(
  valueInCents: number | null | undefined,
  currencyCode: string | null | undefined,
  options: { decimals?: number; compact?: boolean } = {}
): string {
  const symbol = getCurrencySymbolForCode(currencyCode);
  return formatCurrency(valueInCents, symbol, options);
}

/**
 * Format a raw decimal value (already divided by 100) as a currency string.
 * Use this when the value is already in major currency units (e.g. 1500.00).
 */
export function formatCurrencyRaw(
  value: number | null | undefined,
  currencySymbol: string = "US$",
  options: { decimals?: number; compact?: boolean } = {}
): string {
  if (value == null || isNaN(value)) return `${currencySymbol}0.00`;
  const { decimals = 2, compact = false } = options;
  if (compact && Math.abs(value) >= 1_000_000) {
    return `${currencySymbol}${(value / 1_000_000).toFixed(1)}M`;
  }
  if (compact && Math.abs(value) >= 1_000) {
    return `${currencySymbol}${(value / 1_000).toFixed(1)}K`;
  }
  return `${currencySymbol}${value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

/**
 * Format a raw decimal value using an ISO 4217 currency code.
 */
export function formatCurrencyRawByCode(
  value: number | null | undefined,
  currencyCode: string | null | undefined,
  options: { decimals?: number; compact?: boolean } = {}
): string {
  const symbol = getCurrencySymbolForCode(currencyCode);
  return formatCurrencyRaw(value, symbol, options);
}
