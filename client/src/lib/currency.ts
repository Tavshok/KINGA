/**
 * Currency Formatting Utilities
 * 
 * Provides tenant-specific currency formatting to avoid hardcoded
 * South African references (R, ZAR) and support multi-currency tenants.
 */

export interface CurrencyConfig {
  primaryCurrency: string; // e.g., "USD"
  primarySymbol: string; // e.g., "$"
  secondaryCurrency?: string; // e.g., "ZIG"
  secondarySymbol?: string; // e.g., "ZWL$"
  exchangeRate?: number; // e.g., 7.0 (1 USD = 7 ZIG)
}

// Default currency configuration (USD)
// In production, this should be fetched from tenant configuration
const DEFAULT_CURRENCY: CurrencyConfig = {
  primaryCurrency: "USD",
  primarySymbol: "$",
  secondaryCurrency: undefined,
  secondarySymbol: undefined,
  exchangeRate: undefined,
};

// TODO: Fetch from tenant configuration via tRPC
let currentCurrency: CurrencyConfig = DEFAULT_CURRENCY;

/**
 * Set the currency configuration for the current tenant
 */
export function setCurrencyConfig(config: CurrencyConfig) {
  currentCurrency = config;
}

/**
 * Get the current currency configuration
 */
export function getCurrencyConfig(): CurrencyConfig {
  return currentCurrency;
}

/**
 * Format an amount in cents to display currency
 * @param amount Amount in whole currency units (e.g., 5000 = $5,000.00)
 * @param showSecondary Whether to show secondary currency
 * @returns Formatted currency string
 */
export function formatCurrency(amount: number, showSecondary: boolean = false): string {
  const primary = `${currentCurrency.primarySymbol}${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

  if (showSecondary && currentCurrency.secondaryCurrency && currentCurrency.exchangeRate) {
    const secondaryAmount = amount * currentCurrency.exchangeRate;
    const secondary = `${currentCurrency.secondarySymbol}${secondaryAmount.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
    return `${primary} (${secondary})`;
  }

  return primary;
}

/**
 * Format a currency amount without cents (for large numbers)
 * @param amount Amount in whole currency units
 * @returns Formatted currency string without decimals
 */
export function formatCurrencyWhole(amount: number): string {
  return `${currentCurrency.primarySymbol}${amount.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

/**
 * Get currency symbol only
 */
export function getCurrencySymbol(): string {
  return currentCurrency.primarySymbol;
}

/**
 * Get currency code (e.g., "USD")
 */
export function getCurrencyCode(): string {
  return currentCurrency.primaryCurrency;
}

// ─── ISO 4217 Currency Symbol Map ──────────────────────────────────────────
const SYMBOL_MAP: Record<string, string> = {
  USD: '$', EUR: '€', GBP: '£', ZAR: 'R', ZMW: 'ZMW', ZIG: 'ZiG',
  KES: 'KSh', NGN: '₦', GHS: 'GH₵', BWP: 'P', MWK: 'MK', TZS: 'TSh',
  UGX: 'USh', MZN: 'MT', NAD: 'N$', SZL: 'L', LSL: 'L', AOA: 'Kz',
};

/**
 * Resolve a currency code to its display symbol.
 * Falls back to the code itself if no symbol mapping exists.
 */
export function currencySymbol(currencyCode: string | null | undefined): string {
  const code = (currencyCode ?? 'USD').toUpperCase().trim();
  return SYMBOL_MAP[code] ?? code;
}

/**
 * Format a number with the correct currency symbol.
 * @param n Amount in whole currency units (NOT cents)
 * @param currencyCode ISO 4217 code (e.g. "USD", "ZIG", "ZAR")
 * @param decimals Number of decimal places (default 2)
 * @returns Formatted string like "ZiG5,000.00" or "$1,234.56"
 */
export function fmtCurrency(
  n: number | null | undefined,
  currencyCode: string | null | undefined,
  decimals: number = 2
): string {
  if (n == null || isNaN(n)) return '—';
  const sym = currencySymbol(currencyCode);
  return `${sym}${n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

/**
 * Create a curried currency formatter bound to a specific currency code.
 * Useful when you need to format many values with the same currency.
 * @param currencyCode ISO 4217 code (e.g. "USD", "ZIG", "ZAR")
 * @returns A function that formats numbers with the bound currency symbol
 */
export function makeFmtCurrency(currencyCode: string | null | undefined) {
  const sym = currencySymbol(currencyCode);
  return function fmt(n: number | null | undefined, decimals: number = 2): string {
    if (n == null || isNaN(n)) return '—';
    return `${sym}${n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
  };
}
