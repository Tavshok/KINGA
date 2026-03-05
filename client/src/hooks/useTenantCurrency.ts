/**
 * useTenantCurrency
 *
 * Returns a bound `formatCurrency` function that uses the current tenant's
 * currency code.  Falls back to "USD" (→ "US$") if tenant data is not yet loaded.
 *
 * Usage:
 *   const { fmt } = useTenantCurrency();
 *   fmt(aiAssessment.estimatedCost)  // e.g. "US$1,500.00"
 */
import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { formatCurrency, getCurrencySymbolForCode } from "../../../shared/currency";

export interface TenantCurrencyResult {
  /** Format a value stored in cents using the tenant's currency symbol */
  fmt: (valueInCents: number | null | undefined, options?: { decimals?: number; compact?: boolean }) => string;
  /** The resolved display symbol (e.g. "R", "US$", "ZIG") */
  currencySymbol: string;
  /** The ISO currency code (e.g. "ZAR", "USD", "ZIG") */
  currencyCode: string;
}

export function useTenantCurrency(): TenantCurrencyResult {
  const { data: tenant } = trpc.tenant.getCurrent.useQuery(undefined, {
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  const currencyCode = tenant?.currencyCode ?? "USD";
  // Resolve the display symbol from the code (USD → "US$", ZAR → "R", ZIG → "ZIG")
  const currencySymbol = getCurrencySymbolForCode(currencyCode);

  const fmt = useMemo(
    () =>
      (valueInCents: number | null | undefined, options?: { decimals?: number; compact?: boolean }) =>
        formatCurrency(valueInCents, currencySymbol, options),
    [currencySymbol]
  );

  return { fmt, currencySymbol, currencyCode };
}
