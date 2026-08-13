export type AgencyCommissionConfiguration = {
  agencyTenantId: string;
  productId: number;
  commissionRate: number;
  isActive: boolean;
};

export type CommissionAvailability =
  | { status: "configured"; commissionRate: number; source: "agency_product_configuration" }
  | { status: "unavailable"; commissionRate: null; source: "none" };

/**
 * Deliberately has no percentage fallback. Commission remains agency-commercial
 * metadata and is never an input to policy, premium, RFQ, claim, or settlement decisions.
 */
export function resolveAgencyProductCommission(
  config: AgencyCommissionConfiguration | null | undefined,
): CommissionAvailability {
  if (!config || !config.isActive || !Number.isFinite(config.commissionRate)) {
    return { status: "unavailable", commissionRate: null, source: "none" };
  }
  return {
    status: "configured",
    commissionRate: config.commissionRate,
    source: "agency_product_configuration",
  };
}
