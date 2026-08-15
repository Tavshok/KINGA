export type BenchmarkEvidenceQuality =
  | "verified"
  | "accepted_quote"
  | "assessor_validated"
  | "review_required";

export interface VehicleBenchmarkContext {
  vehicleMake?: string | null;
  vehicleModel?: string | null;
  vehicleYear?: number | null;
  vehicleVariant?: string | null;
  bodyType?: string | null;
  marketRegion?: string | null;
  currencyCode?: string | null;
  preferredOutcome?: "repair" | "replace";
}

export type BenchmarkStratum =
  | "exact_vehicle"
  | "make_model_year_band"
  | "make_body_year_band"
  | "make_market_currency"
  | "global_component";

export interface BenchmarkStratumSpec {
  level: BenchmarkStratum;
  requireMake: boolean;
  requireModel: boolean;
  requireYearBand: boolean;
  requireVariant: boolean;
  requireBodyType: boolean;
  requireMarketCurrency: boolean;
}

export function classifyBenchmarkYearBand(year?: number | null): string | null {
  if (!year || year < 1900 || year > 2100) return null;
  if (year < 2000) return "pre2000";
  if (year < 2010) return "2000-2009";
  if (year < 2020) return "2010-2019";
  return "2020plus";
}

export function buildVehicleBenchmarkStrata(
  context: VehicleBenchmarkContext
): BenchmarkStratumSpec[] {
  const hasMake = Boolean(context.vehicleMake?.trim());
  const hasModel = Boolean(context.vehicleModel?.trim());
  const hasYearBand = Boolean(classifyBenchmarkYearBand(context.vehicleYear));
  const hasVariant = Boolean(context.vehicleVariant?.trim());
  const hasBodyType = Boolean(context.bodyType?.trim());
  const hasMarketCurrency = Boolean(context.marketRegion?.trim() && context.currencyCode?.trim());

  const strata: BenchmarkStratumSpec[] = [];

  if (hasMake && hasModel && hasYearBand && hasVariant && hasBodyType && hasMarketCurrency) {
    strata.push({
      level: "exact_vehicle",
      requireMake: true,
      requireModel: true,
      requireYearBand: true,
      requireVariant: true,
      requireBodyType: true,
      requireMarketCurrency: true,
    });
  }

  if (hasMake && hasModel && hasYearBand && hasMarketCurrency) {
    strata.push({
      level: "make_model_year_band",
      requireMake: true,
      requireModel: true,
      requireYearBand: true,
      requireVariant: false,
      requireBodyType: false,
      requireMarketCurrency: true,
    });
  }

  if (hasMake && hasBodyType && hasYearBand && hasMarketCurrency) {
    strata.push({
      level: "make_body_year_band",
      requireMake: true,
      requireModel: false,
      requireYearBand: true,
      requireVariant: false,
      requireBodyType: true,
      requireMarketCurrency: true,
    });
  }

  if (hasMake && hasMarketCurrency) {
    strata.push({
      level: "make_market_currency",
      requireMake: true,
      requireModel: false,
      requireYearBand: false,
      requireVariant: false,
      requireBodyType: false,
      requireMarketCurrency: true,
    });
  }

  strata.push({
    level: "global_component",
    requireMake: false,
    requireModel: false,
    requireYearBand: false,
    requireVariant: false,
    requireBodyType: false,
    requireMarketCurrency: false,
  });

  return strata;
}

export function isComparableEvidenceQuality(
  quality?: BenchmarkEvidenceQuality | string | null
): boolean {
  return quality !== "review_required";
}
