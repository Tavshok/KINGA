/**
 * Year-Based Mileage Estimation
 *
 * When no mileage is provided on a claim, this utility estimates a plausible
 * range based on vehicle year, type, and region.  The result is intentionally
 * conservative: it returns a RANGE, not a fixed value, and always carries a
 * LOW confidence flag so downstream valuation logic can reduce its own
 * confidence score accordingly.
 *
 * Rules (per spec):
 *   base_range = 12,000 – 20,000 km / year
 *   Commercial vehicles  → +30%
 *   Premium / private    → -15%
 *   Output: { estimated_mileage_range, assumed_mileage_used, confidence, source }
 */

export type VehicleUsageClass = 'commercial' | 'premium' | 'standard';

export interface MileageEstimationResult {
  /** [min, max] estimated odometer reading in km */
  estimated_mileage_range: [number, number];
  /** Midpoint of the range — the value used for valuation adjustments */
  assumed_mileage_used: number;
  /** Always "LOW" for year-based estimates */
  confidence: 'LOW';
  /** Provenance tag */
  source: 'year_based_estimation';
  /** Human-readable explanation for the UI warning */
  warning_message: string;
  /** How many years of driving were estimated */
  estimated_years: number;
}

/**
 * Classify a vehicle as commercial, premium, or standard based on make/model
 * keywords.  This is a lightweight heuristic — no external data required.
 */
export function classifyVehicleUsage(
  make?: string | null,
  model?: string | null,
): VehicleUsageClass {
  const text = `${make ?? ''} ${model ?? ''}`.toLowerCase();

  // Commercial / utility indicators
  const commercialKeywords = [
    'truck', 'lorry', 'van', 'bus', 'minibus', 'combi', 'taxi',
    'hilux', 'ranger', 'amarok', 'l200', 'navara', 'd-max', 'triton',
    'transit', 'sprinter', 'crafter', 'ducato', 'daily', 'master',
    'trafic', 'vivaro', 'kangoo', 'berlingo', 'partner',
    'isuzu', 'hino', 'fuso', 'actros', 'volvo truck',
  ];

  // Premium / low-mileage indicators
  const premiumKeywords = [
    'bmw', 'mercedes', 'benz', 'audi', 'lexus', 'jaguar', 'land rover',
    'range rover', 'porsche', 'maserati', 'bentley', 'rolls', 'ferrari',
    'lamborghini', 'aston', 'volvo', 'infiniti', 'genesis',
  ];

  if (commercialKeywords.some(k => text.includes(k))) return 'commercial';
  if (premiumKeywords.some(k => text.includes(k))) return 'premium';
  return 'standard';
}

/**
 * Estimate mileage for a vehicle when no odometer reading is available.
 *
 * @param vehicleYear  - Model year of the vehicle (e.g. 2018)
 * @param make         - Vehicle make (used for usage-class heuristic)
 * @param model        - Vehicle model (used for usage-class heuristic)
 * @param currentYear  - Override for "today's year" (useful in tests)
 */
export function estimateMileageFromYear(
  vehicleYear: number,
  make?: string | null,
  model?: string | null,
  currentYear: number = new Date().getFullYear(),
): MileageEstimationResult {
  // ── 1. Calculate age ──────────────────────────────────────────────────────
  // A brand-new vehicle still gets at least 1 year of estimated driving.
  const estimatedYears = Math.max(1, currentYear - vehicleYear);

  // ── 2. Base range per year ────────────────────────────────────────────────
  const BASE_MIN_PER_YEAR = 12_000;
  const BASE_MAX_PER_YEAR = 20_000;

  // ── 3. Usage-class multiplier ─────────────────────────────────────────────
  const usageClass = classifyVehicleUsage(make, model);
  let multiplier = 1.0;
  if (usageClass === 'commercial') multiplier = 1.30;   // +30%
  if (usageClass === 'premium')    multiplier = 0.85;   // -15%

  // ── 4. Total range ────────────────────────────────────────────────────────
  const rawMin = Math.round(BASE_MIN_PER_YEAR * multiplier * estimatedYears);
  const rawMax = Math.round(BASE_MAX_PER_YEAR * multiplier * estimatedYears);

  // Round to nearest 1,000 km for cleaner display
  const minKm = Math.round(rawMin / 1_000) * 1_000;
  const maxKm = Math.round(rawMax / 1_000) * 1_000;
  const midpointKm = Math.round((minKm + maxKm) / 2 / 1_000) * 1_000;

  // ── 5. Warning message ────────────────────────────────────────────────────
  const usageLabel =
    usageClass === 'commercial' ? 'commercial vehicle (+30% annual km)' :
    usageClass === 'premium'    ? 'premium/private vehicle (−15% annual km)' :
                                  'standard vehicle';

  const warning_message =
    `Mileage not provided. Estimated ${minKm.toLocaleString()}–${maxKm.toLocaleString()} km ` +
    `based on ${estimatedYears} year${estimatedYears !== 1 ? 's' : ''} of ownership ` +
    `(${usageLabel}). Valuation confidence is LOW. ` +
    `Please supply actual odometer reading to improve accuracy.`;

  return {
    estimated_mileage_range: [minKm, maxKm],
    assumed_mileage_used: midpointKm,
    confidence: 'LOW',
    source: 'year_based_estimation',
    warning_message,
    estimated_years: estimatedYears,
  };
}
