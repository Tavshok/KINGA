/**
 * useTenantCurrency
 *
 * Returns a bound `formatCurrency` function that uses the current tenant's
 * currency symbol.  Falls back to "$" if tenant data is not yet loaded.
 *
 * Usage:
 *   const { fmt } = useTenantCurrency();
 *   fmt(aiAssessment.estimatedCost)  // e.g. "R 1,500.00"
 */
import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { formatCurrency } from "../../../shared/currency";

export interface TenantCurrencyResult {
  /** Format a value stored in cents using the tenant's currency symbol */
  fmt: (valueInCents: number | null | undefined, options?: { decimals?: number; compact?: boolean }) => string;
  /** The raw currency symbol (e.g. "R", "$", "£") */
  currencySymbol: string;
  /** The ISO currency code (e.g. "ZAR", "USD", "GBP") */
  currencyCode: string;
}

export function useTenantCurrency(): TenantCurrencyResult {
  const { data: tenant } = trpc.tenant.getCurrent.useQuery(undefined, {
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  const currencySymbol = tenant?.currencySymbol ?? "$";
  const currencyCode = tenant?.currencyCode ?? "USD";

  const fmt = useMemo(
    () =>
      (valueInCents: number | null | undefined, options?: { decimals?: number; compact?: boolean }) =>
        formatCurrency(valueInCents, currencySymbol, options),
    [currencySymbol]
  );

  return { fmt, currencySymbol, currencyCode };
}
