/**
 * jurisdictionCalibrationEngine.ts — Phase 3 Learning and Calibration Engine
 *
 * Determines the calibration context (jurisdiction) for a claim based on
 * claim_location, country, and region inputs. Returns a structured JSON
 * report with jurisdiction, confidence, and explanatory notes.
 *
 * Output contract:
 * {
 *   "jurisdiction": "",      // resolved jurisdiction string
 *   "confidence": 0-100,     // confidence score
 *   "notes": ""              // human-readable explanation
 * }
 *
 * Resolution rules (in priority order):
 *  1. Country-level calibration — preferred when country is a known ISO 3166-1 code or name
 *  2. Region-level calibration — used when country is unknown but region is recognised
 *  3. Location-level inference — attempts to infer country from claim_location text
 *  4. Global fallback — used when none of the above can be resolved
 *
 * Confidence scoring:
 *  - Country match (exact ISO code)         → 95
 *  - Country match (name normalisation)     → 85
 *  - Region match                           → 70
 *  - Location inference (high confidence)   → 60
 *  - Location inference (low confidence)    → 40
 *  - Global fallback                        → 10
 */

// ─── Input / Output Types ─────────────────────────────────────────────────────

export interface JurisdictionCalibrationInput {
  /** Free-text location of the incident (e.g. "Harare CBD", "Bulawayo Road A5") */
  claim_location?: string | null;
  /** Country name or ISO 3166-1 alpha-2 / alpha-3 code (e.g. "ZW", "ZWE", "Zimbabwe") */
  country?: string | null;
  /** Sub-national region, province, or state (e.g. "Mashonaland East", "Matabeleland") */
  region?: string | null;
}

export interface JurisdictionCalibrationResult {
  /** Resolved jurisdiction identifier (e.g. "ZW", "ZW:Harare", "GLOBAL") */
  jurisdiction: string;
  /** Confidence score 0–100 */
  confidence: number;
  /** Human-readable explanation of how jurisdiction was resolved */
  notes: string;
  /** Resolution method used */
  resolution_method: "country_iso" | "country_name" | "region" | "location_inference" | "global_fallback";
  /** Whether a country-level calibration profile exists for this jurisdiction */
  has_country_profile: boolean;
  /** Whether a region-level calibration profile exists */
  has_region_profile: boolean;
  /** Recommended calibration profile to apply */
  recommended_profile: string;
  /** Any warnings about data quality or ambiguity */
  warnings: string[];
}

// ─── Known Jurisdiction Data ──────────────────────────────────────────────────

/**
 * Countries with dedicated calibration profiles.
 * Keyed by ISO 3166-1 alpha-2 code.
 */
export const COUNTRY_PROFILES: Record<string, {
  name: string;
  aliases: string[];
  alpha3: string;
  currency: string;
  profile_id: string;
  regions?: string[];
}> = {
  ZW: {
    name: "Zimbabwe",
    aliases: ["zimbabwe", "zim", "zimb"],
    alpha3: "ZWE",
    currency: "USD",
    profile_id: "ZW_2024",
    regions: [
      "harare", "bulawayo", "manicaland", "mashonaland central",
      "mashonaland east", "mashonaland west", "masvingo",
      "matabeleland north", "matabeleland south", "midlands",
    ],
  },
  ZA: {
    name: "South Africa",
    aliases: ["south africa", "sa", "rsa", "republic of south africa"],
    alpha3: "ZAF",
    currency: "ZAR",
    profile_id: "ZA_2024",
    regions: [
      "gauteng", "western cape", "eastern cape", "kwazulu-natal",
      "limpopo", "mpumalanga", "north west", "free state", "northern cape",
    ],
  },
  KE: {
    name: "Kenya",
    aliases: ["kenya"],
    alpha3: "KEN",
    currency: "KES",
    profile_id: "KE_2024",
    regions: ["nairobi", "mombasa", "kisumu", "nakuru", "eldoret"],
  },
  NG: {
    name: "Nigeria",
    aliases: ["nigeria"],
    alpha3: "NGA",
    currency: "NGN",
    profile_id: "NG_2024",
    regions: ["lagos", "abuja", "kano", "ibadan", "port harcourt"],
  },
  GH: {
    name: "Ghana",
    aliases: ["ghana"],
    alpha3: "GHA",
    currency: "GHS",
    profile_id: "GH_2024",
    regions: ["accra", "kumasi", "tamale", "takoradi"],
  },
  TZ: {
    name: "Tanzania",
    aliases: ["tanzania", "united republic of tanzania"],
    alpha3: "TZA",
    currency: "TZS",
    profile_id: "TZ_2024",
    regions: ["dar es salaam", "dodoma", "mwanza", "arusha"],
  },
  UG: {
    name: "Uganda",
    aliases: ["uganda"],
    alpha3: "UGA",
    currency: "UGX",
    profile_id: "UG_2024",
    regions: ["kampala", "entebbe", "gulu", "mbarara"],
  },
  ZM: {
    name: "Zambia",
    aliases: ["zambia"],
    alpha3: "ZMB",
    currency: "ZMW",
    profile_id: "ZM_2024",
    regions: ["lusaka", "ndola", "kitwe", "livingstone"],
  },
  BW: {
    name: "Botswana",
    aliases: ["botswana"],
    alpha3: "BWA",
    currency: "BWP",
    profile_id: "BW_2024",
    regions: ["gaborone", "francistown", "maun"],
  },
  MZ: {
    name: "Mozambique",
    aliases: ["mozambique", "mocambique"],
    alpha3: "MOZ",
    currency: "MZN",
    profile_id: "MZ_2024",
    regions: ["maputo", "beira", "nampula"],
  },
  GB: {
    name: "United Kingdom",
    aliases: ["united kingdom", "uk", "great britain", "england", "scotland", "wales"],
    alpha3: "GBR",
    currency: "GBP",
    profile_id: "GB_2024",
    regions: ["london", "manchester", "birmingham", "glasgow", "edinburgh", "cardiff"],
  },
  US: {
    name: "United States",
    aliases: ["united states", "usa", "united states of america", "us"],
    alpha3: "USA",
    currency: "USD",
    profile_id: "US_2024",
    regions: ["california", "texas", "florida", "new york", "illinois"],
  },
  AU: {
    name: "Australia",
    aliases: ["australia", "aus"],
    alpha3: "AUS",
    currency: "AUD",
    profile_id: "AU_2024",
    regions: ["new south wales", "victoria", "queensland", "western australia", "south australia"],
  },
};

/**
 * Location keywords that strongly suggest a specific country.
 * Used for location-inference fallback.
 */
const LOCATION_COUNTRY_HINTS: Array<{
  keywords: string[];
  country_code: string;
  confidence: number;
}> = [
  // Zimbabwe-specific place names and road references
  { keywords: ["harare", "bulawayo", "mutare", "gweru", "kwekwe", "masvingo", "chinhoyi", "bindura", "zvishavane", "hwange", "victoria falls", "kariba", "chitungwiza", "epworth"], country_code: "ZW", confidence: 90 },
  { keywords: ["beitbridge", "plumtree", "nyanga", "chimanimani", "mvurwi", "mazowe", "chegutu", "kadoma", "redcliff"], country_code: "ZW", confidence: 85 },
  // South Africa
  { keywords: ["johannesburg", "cape town", "durban", "pretoria", "port elizabeth", "east london", "bloemfontein", "soweto", "sandton", "midrand"], country_code: "ZA", confidence: 90 },
  { keywords: ["n1", "n2", "n3", "n4", "n14", "r21", "r24", "gauteng", "limpopo", "mpumalanga"], country_code: "ZA", confidence: 70 },
  // Kenya
  { keywords: ["nairobi", "mombasa", "kisumu", "nakuru", "eldoret", "thika", "nyeri"], country_code: "KE", confidence: 90 },
  // Nigeria
  { keywords: ["lagos", "abuja", "kano", "ibadan", "port harcourt", "benin city", "kaduna"], country_code: "NG", confidence: 90 },
  // Ghana
  { keywords: ["accra", "kumasi", "tamale", "takoradi", "tema"], country_code: "GH", confidence: 90 },
  // Tanzania
  { keywords: ["dar es salaam", "dodoma", "mwanza", "arusha", "zanzibar"], country_code: "TZ", confidence: 90 },
  // Uganda
  { keywords: ["kampala", "entebbe", "gulu", "mbarara", "jinja"], country_code: "UG", confidence: 90 },
  // Zambia
  { keywords: ["lusaka", "ndola", "kitwe", "livingstone", "kabwe"], country_code: "ZM", confidence: 90 },
  // UK
  { keywords: ["london", "manchester", "birmingham", "glasgow", "edinburgh", "cardiff", "liverpool", "leeds", "bristol"], country_code: "GB", confidence: 85 },
  // US
  { keywords: ["new york", "los angeles", "chicago", "houston", "phoenix", "philadelphia", "san antonio", "san diego", "dallas", "san jose"], country_code: "US", confidence: 85 },
  // Australia
  { keywords: ["sydney", "melbourne", "brisbane", "perth", "adelaide", "gold coast", "canberra", "hobart", "darwin"], country_code: "AU", confidence: 85 },
];

// ─── Normalisation Helpers ────────────────────────────────────────────────────

function normalise(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, " ");
}

/**
 * Attempt to resolve a country code from a raw country string.
 * Returns { code, method } or null.
 */
function resolveCountryCode(raw: string): { code: string; method: "iso_alpha2" | "iso_alpha3" | "name_match" } | null {
  const n = normalise(raw);

  // ISO alpha-2 exact match (e.g. "ZW")
  const upper = raw.trim().toUpperCase();
  if (upper.length === 2 && COUNTRY_PROFILES[upper]) {
    return { code: upper, method: "iso_alpha2" };
  }

  // ISO alpha-3 match (e.g. "ZWE")
  if (upper.length === 3) {
    for (const [code, profile] of Object.entries(COUNTRY_PROFILES)) {
      if (profile.alpha3 === upper) return { code, method: "iso_alpha3" };
    }
  }

  // Name / alias match
  for (const [code, profile] of Object.entries(COUNTRY_PROFILES)) {
    if (n === normalise(profile.name)) return { code, method: "name_match" };
    if (profile.aliases.some((a) => normalise(a) === n)) return { code, method: "name_match" };
  }

  return null;
}

/**
 * Attempt to resolve a region to a country code.
 */
function resolveRegionToCountry(rawRegion: string): { code: string; region_key: string } | null {
  const n = normalise(rawRegion);
  for (const [code, profile] of Object.entries(COUNTRY_PROFILES)) {
    if (profile.regions?.some((r) => normalise(r) === n || n.includes(normalise(r)))) {
      return { code, region_key: n };
    }
  }
  return null;
}

/**
 * Attempt to infer country from free-text claim_location.
 */
function inferCountryFromLocation(rawLocation: string): { code: string; confidence: number } | null {
  const n = normalise(rawLocation);
  let best: { code: string; confidence: number } | null = null;

  for (const hint of LOCATION_COUNTRY_HINTS) {
    for (const kw of hint.keywords) {
      if (n.includes(normalise(kw))) {
        if (!best || hint.confidence > best.confidence) {
          best = { code: hint.country_code, confidence: hint.confidence };
        }
      }
    }
  }
  return best;
}

// ─── Main Engine ──────────────────────────────────────────────────────────────

/**
 * Determine the calibration jurisdiction for a claim.
 *
 * @param input - claim_location, country, region
 * @returns JurisdictionCalibrationResult
 */
export function determineJurisdiction(
  input: JurisdictionCalibrationInput
): JurisdictionCalibrationResult {
  const warnings: string[] = [];
  const { claim_location, country, region } = input;

  // ── Step 1: Try country-level resolution ────────────────────────────────────
  if (country && country.trim().length > 0) {
    const resolved = resolveCountryCode(country.trim());
    if (resolved) {
      const profile = COUNTRY_PROFILES[resolved.code];
      const isIso = resolved.method === "iso_alpha2" || resolved.method === "iso_alpha3";
      const confidence = isIso ? 95 : 85;

      // Check if region also matches to build a more specific jurisdiction
      let jurisdictionStr = resolved.code;
      let hasRegionProfile = false;

      if (region && region.trim().length > 0) {
        const rn = normalise(region.trim());
        const regionMatch = profile.regions?.some((r) => normalise(r) === rn || rn.includes(normalise(r)));
        if (regionMatch) {
          jurisdictionStr = `${resolved.code}:${rn.replace(/\s+/g, "_")}`;
          hasRegionProfile = true;
        } else {
          warnings.push(`Region "${region}" not found in known regions for ${profile.name}. Country-level calibration applied.`);
        }
      }

      return {
        jurisdiction: jurisdictionStr,
        confidence,
        notes: isIso
          ? `Jurisdiction resolved via ISO ${resolved.method === "iso_alpha2" ? "alpha-2" : "alpha-3"} code "${resolved.code}" (${profile.name}). Country-level calibration profile "${profile.profile_id}" applied.`
          : `Jurisdiction resolved via country name match for "${profile.name}" (${resolved.code}). Country-level calibration profile "${profile.profile_id}" applied.`,
        resolution_method: isIso ? "country_iso" : "country_name",
        has_country_profile: true,
        has_region_profile: hasRegionProfile,
        recommended_profile: profile.profile_id,
        warnings,
      };
    } else {
      warnings.push(`Country "${country}" could not be matched to a known jurisdiction. Attempting region and location fallback.`);
    }
  }

  // ── Step 2: Try region-level resolution ─────────────────────────────────────
  if (region && region.trim().length > 0) {
    const regionResolved = resolveRegionToCountry(region.trim());
    if (regionResolved) {
      const profile = COUNTRY_PROFILES[regionResolved.code];
      return {
        jurisdiction: `${regionResolved.code}:${regionResolved.region_key.replace(/\s+/g, "_")}`,
        confidence: 70,
        notes: `Jurisdiction inferred from region "${region}" → ${profile.name} (${regionResolved.code}). Region-level calibration applied using profile "${profile.profile_id}".`,
        resolution_method: "region",
        has_country_profile: true,
        has_region_profile: true,
        recommended_profile: profile.profile_id,
        warnings,
      };
    } else {
      warnings.push(`Region "${region}" could not be matched to a known country. Attempting location inference.`);
    }
  }

  // ── Step 3: Infer from claim_location text ───────────────────────────────────
  if (claim_location && claim_location.trim().length > 0) {
    const inferred = inferCountryFromLocation(claim_location.trim());
    if (inferred) {
      const profile = COUNTRY_PROFILES[inferred.code];
      const isHighConfidence = inferred.confidence >= 80;
      return {
        jurisdiction: inferred.code,
        confidence: isHighConfidence ? 60 : 40,
        notes: `Jurisdiction inferred from claim location text "${claim_location}" → ${profile.name} (${inferred.code}). Location-based inference ${isHighConfidence ? "matched a known city/place name" : "matched a partial keyword"}. Country-level calibration profile "${profile.profile_id}" applied.`,
        resolution_method: "location_inference",
        has_country_profile: true,
        has_region_profile: false,
        recommended_profile: profile.profile_id,
        warnings: [
          ...warnings,
          `Jurisdiction was inferred from location text, not from an explicit country field. Verify claim data for accuracy.`,
        ],
      };
    } else {
      warnings.push(`Could not infer jurisdiction from claim location "${claim_location}".`);
    }
  }

  // ── Step 4: Global fallback ──────────────────────────────────────────────────
  const missingFields: string[] = [];
  if (!country || country.trim().length === 0) missingFields.push("country");
  if (!region || region.trim().length === 0) missingFields.push("region");
  if (!claim_location || claim_location.trim().length === 0) missingFields.push("claim_location");

  return {
    jurisdiction: "GLOBAL",
    confidence: 10,
    notes: `Jurisdiction could not be determined from the provided inputs. Falling back to global calibration profile. ${missingFields.length > 0 ? `Missing or unresolvable fields: ${missingFields.join(", ")}.` : "All fields were provided but none matched a known jurisdiction."}`,
    resolution_method: "global_fallback",
    has_country_profile: false,
    has_region_profile: false,
    recommended_profile: "GLOBAL_2024",
    warnings: [
      ...warnings,
      "Global calibration is less precise than country-specific profiles. Accuracy may be reduced for cost and fraud scoring.",
    ],
  };
}

// ─── Batch Processing ─────────────────────────────────────────────────────────

export interface BatchJurisdictionInput {
  claim_id: number | string;
  claim_location?: string | null;
  country?: string | null;
  region?: string | null;
}

export interface BatchJurisdictionResult {
  claim_id: number | string;
  result: JurisdictionCalibrationResult;
}

/**
 * Process multiple claims in a single pass.
 */
export function determineJurisdictionBatch(
  inputs: BatchJurisdictionInput[]
): BatchJurisdictionResult[] {
  return inputs.map((item) => ({
    claim_id: item.claim_id,
    result: determineJurisdiction({
      claim_location: item.claim_location,
      country: item.country,
      region: item.region,
    }),
  }));
}

// ─── Summary Aggregation ──────────────────────────────────────────────────────

export interface JurisdictionSummary {
  /** Total claims processed */
  total: number;
  /** Breakdown by resolution method */
  by_method: Record<JurisdictionCalibrationResult["resolution_method"], number>;
  /** Breakdown by jurisdiction */
  by_jurisdiction: Record<string, number>;
  /** Average confidence score */
  average_confidence: number;
  /** Claims falling back to GLOBAL */
  global_fallback_count: number;
  /** Claims with warnings */
  claims_with_warnings: number;
}

/**
 * Aggregate batch results into a summary report.
 */
export function aggregateJurisdictionSummary(
  results: BatchJurisdictionResult[]
): JurisdictionSummary {
  const byMethod: Record<string, number> = {
    country_iso: 0,
    country_name: 0,
    region: 0,
    location_inference: 0,
    global_fallback: 0,
  };
  const byJurisdiction: Record<string, number> = {};
  let totalConfidence = 0;
  let globalFallbackCount = 0;
  let claimsWithWarnings = 0;

  for (const { result } of results) {
    byMethod[result.resolution_method] = (byMethod[result.resolution_method] ?? 0) + 1;
    byJurisdiction[result.jurisdiction] = (byJurisdiction[result.jurisdiction] ?? 0) + 1;
    totalConfidence += result.confidence;
    if (result.jurisdiction === "GLOBAL") globalFallbackCount++;
    if (result.warnings.length > 0) claimsWithWarnings++;
  }

  return {
    total: results.length,
    by_method: byMethod as JurisdictionSummary["by_method"],
    by_jurisdiction: byJurisdiction,
    average_confidence: results.length > 0 ? Math.round(totalConfidence / results.length) : 0,
    global_fallback_count: globalFallbackCount,
    claims_with_warnings: claimsWithWarnings,
  };
}
