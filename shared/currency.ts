/**
 * Shared currency formatting utilities.
 *
 * All monetary values in the database are stored as integers in the smallest
 * currency unit (cents, pence, etc.).  These helpers convert them to a
 * human-readable string using the tenant's configured currency symbol.
 *
 * IMPORTANT: No currency conversion is performed here.  Only the display
 * symbol and formatting change.
 */

/**
 * Format a value stored in cents to a human-readable currency string.
 *
 * @param valueInCents  Integer value in the smallest currency unit (e.g. 150000 → "1,500.00")
 * @param currencySymbol  Symbol to prefix (e.g. "$", "R", "£", "€").  Defaults to "$".
 * @param options  Optional overrides for decimal places and thousands separator.
 */
export function formatCurrency(
  valueInCents: number | null | undefined,
  currencySymbol: string = "$",
  options: { decimals?: number; compact?: boolean } = {}
): string {
  if (valueInCents == null || isNaN(valueInCents)) return `${currencySymbol}0.00`;

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
 * Format a raw decimal value (already divided by 100) as a currency string.
 * Use this when the value is already in major currency units (e.g. 1500.00).
 */
export function formatCurrencyRaw(
  value: number | null | undefined,
  currencySymbol: string = "$",
  options: { decimals?: number; compact?: boolean } = {}
): string {
  if (value == null || isNaN(value)) return `${currencySymbol}0.00`;
  return formatCurrency(Math.round(value * 100), currencySymbol, options);
}
