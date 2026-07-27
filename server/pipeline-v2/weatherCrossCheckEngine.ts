/**
 * weatherCrossCheckEngine.ts
 * Signal 4: Weather Cross-Check Engine
 *
 * PURPOSE
 * ───────
 * Cross-checks the claimant's stated weather conditions (extracted from claim
 * documents by Stage 3) against actual historical weather records for the
 * incident location and date/time.
 *
 * CURRENT STATUS: PENDING EXTERNAL DEPENDENCY
 * ─────────────────────────────────────────────
 * This engine is fully designed and the interface is stable, but it requires
 * an external weather API to be enabled before it can produce live results.
 *
 * RECOMMENDED API: Open-Meteo Historical Weather API (https://open-meteo.com)
 *   - Free tier: unlimited historical requests
 *   - No API key required for basic usage
 *   - Endpoint: https://archive-api.open-meteo.com/v1/archive
 *   - Parameters: latitude, longitude, start_date, end_date, hourly=weathercode,precipitation,windspeed_10m,visibility
 *
 * ALTERNATIVE: Visual Crossing Weather API (https://www.visualcrossing.com)
 *   - Requires API key (free tier: 1,000 records/day)
 *   - Better coverage for South Africa / Zimbabwe
 *
 * TO ENABLE: Set WEATHER_API_ENABLED=true in environment and implement
 * fetchHistoricalWeather() below using the chosen provider.
 *
 * WHAT THIS ENGINE CHECKS
 * ───────────────────────
 * 1. Stated conditions vs actual conditions (rain, dry, fog, night)
 * 2. Road surface friction coefficient from actual conditions
 *    - Dry: μ = 0.7–0.8 (tarmac), 0.5–0.6 (gravel)
 *    - Wet: μ = 0.4–0.5 (tarmac), 0.3–0.4 (gravel)
 *    - Icy: μ = 0.1–0.2
 * 3. Visibility at time of incident (fog, heavy rain)
 * 4. Contradiction flag: stated "dry" but actual records show heavy rain
 *
 * DESIGN PRINCIPLES
 * ─────────────────
 * - Weather contradiction is an ADVISORY signal, not a hard fraud flag.
 *   Claimants frequently mis-state weather from memory.
 * - The friction coefficient feeds into the physics engine to refine
 *   stopping distance and speed estimates.
 * - When API is unavailable, the engine returns PENDING_DEPENDENCY status
 *   and the physics engine uses the default friction coefficient.
 */

export interface WeatherCrossCheckInput {
  /** Incident date in YYYY-MM-DD format */
  incidentDate: string | null;
  /** Incident time in HH:MM format (24h) — null if not available */
  incidentTime: string | null;
  /** GPS coordinates of incident location */
  latitude: number | null;
  longitude: number | null;
  /** Claimant-stated weather conditions (from Stage 3 extraction) */
  statedConditions: string | null;
  /** Road surface type (tarmac, gravel, dirt) — from claim documents or default */
  roadSurface: 'tarmac' | 'gravel' | 'dirt' | null;
}

export type WeatherConditionCode =
  | 'CLEAR'
  | 'PARTLY_CLOUDY'
  | 'OVERCAST'
  | 'LIGHT_RAIN'
  | 'MODERATE_RAIN'
  | 'HEAVY_RAIN'
  | 'THUNDERSTORM'
  | 'FOG'
  | 'SNOW'
  | 'UNKNOWN';

export interface WeatherCrossCheckResult {
  /** Engine status */
  status: 'COMPLETED' | 'PENDING_DEPENDENCY' | 'INSUFFICIENT_DATA' | 'API_ERROR';

  /** When status is PENDING_DEPENDENCY, explains what is needed */
  pendingDependencyNote?: string;

  /** Actual weather conditions at incident location/time */
  actualConditions?: {
    conditionCode: WeatherConditionCode;
    conditionDescription: string;
    precipitationMm: number | null;
    windSpeedKmh: number | null;
    visibilityKm: number | null;
    temperatureCelsius: number | null;
    dataSource: string;
    dataConfidence: 'HIGH' | 'MEDIUM' | 'LOW';
  };

  /** Friction coefficient for physics engine */
  frictionCoefficient: {
    value: number;
    basis: string;
    source: 'ACTUAL_WEATHER' | 'STATED_CONDITIONS' | 'DEFAULT';
  };

  /** Cross-check result */
  conditionsContradiction: {
    contradicts: boolean;
    statedConditions: string | null;
    actualConditions: string | null;
    explanation: string;
    severity: 'NONE' | 'MINOR' | 'SIGNIFICANT';
  } | null;

  /** Visibility flag for physics (affects reaction time and speed estimates) */
  reducedVisibility: boolean;
  reducedVisibilityNote: string | null;
}

// ── Friction coefficient lookup table ─────────────────────────────────────────
// Source: AASHTO Green Book (2011), NCHRP Report 439, SANS 10158
const FRICTION_TABLE: Record<WeatherConditionCode, Record<'tarmac' | 'gravel' | 'dirt', number>> = {
  CLEAR:          { tarmac: 0.75, gravel: 0.55, dirt: 0.50 },
  PARTLY_CLOUDY:  { tarmac: 0.75, gravel: 0.55, dirt: 0.50 },
  OVERCAST:       { tarmac: 0.70, gravel: 0.50, dirt: 0.45 },
  LIGHT_RAIN:     { tarmac: 0.55, gravel: 0.40, dirt: 0.35 },
  MODERATE_RAIN:  { tarmac: 0.45, gravel: 0.35, dirt: 0.25 },
  HEAVY_RAIN:     { tarmac: 0.40, gravel: 0.30, dirt: 0.20 },
  THUNDERSTORM:   { tarmac: 0.38, gravel: 0.28, dirt: 0.18 },
  FOG:            { tarmac: 0.65, gravel: 0.48, dirt: 0.42 },
  SNOW:           { tarmac: 0.20, gravel: 0.18, dirt: 0.15 },
  UNKNOWN:        { tarmac: 0.65, gravel: 0.48, dirt: 0.42 }, // conservative default
};

// ── Default friction when no weather data available ────────────────────────────
const DEFAULT_FRICTION = 0.65; // dry tarmac conservative

/**
 * Parse stated conditions text to a rough condition code.
 * Used as fallback when API is unavailable.
 */
function parseStatedConditions(stated: string | null): WeatherConditionCode {
  if (!stated) return 'UNKNOWN';
  const s = stated.toLowerCase();
  if (s.includes('snow') || s.includes('ice') || s.includes('frost')) return 'SNOW';
  if (s.includes('fog') || s.includes('mist')) return 'FOG';
  if (s.includes('thunder') || s.includes('storm')) return 'THUNDERSTORM';
  if (s.includes('heavy rain') || s.includes('pouring')) return 'HEAVY_RAIN';
  if (s.includes('rain') || s.includes('wet') || s.includes('drizzle')) return 'MODERATE_RAIN';
  if (s.includes('overcast') || s.includes('cloudy')) return 'OVERCAST';
  if (s.includes('clear') || s.includes('sunny') || s.includes('dry') || s.includes('fine')) return 'CLEAR';
  return 'UNKNOWN';
}

/**
 * Main weather cross-check engine.
 *
 * CURRENT BEHAVIOUR: Returns PENDING_DEPENDENCY status with friction coefficient
 * derived from stated conditions (or default). The physics engine uses this
 * friction coefficient regardless of status.
 *
 * FUTURE BEHAVIOUR: When WEATHER_API_ENABLED=true, fetches actual historical
 * weather and produces a full contradiction analysis.
 */
export function runWeatherCrossCheck(input: WeatherCrossCheckInput): WeatherCrossCheckResult {
  const apiEnabled = process.env.WEATHER_API_ENABLED === 'true';
  const roadSurface = input.roadSurface ?? 'tarmac';

  // ── Derive friction from stated conditions (always available as fallback) ──
  const statedCode = parseStatedConditions(input.statedConditions);
  const statedFriction = statedCode !== 'UNKNOWN'
    ? FRICTION_TABLE[statedCode][roadSurface]
    : DEFAULT_FRICTION;

  if (!apiEnabled) {
    // PENDING_DEPENDENCY: API not enabled. Use stated conditions for friction.
    return {
      status: 'PENDING_DEPENDENCY',
      pendingDependencyNote:
        'Weather cross-check requires an external weather API (Open-Meteo or Visual Crossing). ' +
        'Set WEATHER_API_ENABLED=true and implement fetchHistoricalWeather() in weatherCrossCheckEngine.ts. ' +
        'Friction coefficient is derived from claimant-stated conditions as a fallback.',
      frictionCoefficient: {
        value: statedFriction,
        basis: statedCode !== 'UNKNOWN'
          ? `Derived from claimant-stated conditions: "${input.statedConditions}" → ${statedCode}`
          : `Default friction coefficient (no stated conditions available)`,
        source: statedCode !== 'UNKNOWN' ? 'STATED_CONDITIONS' : 'DEFAULT',
      },
      conditionsContradiction: null,
      reducedVisibility: statedCode === 'FOG' || statedCode === 'HEAVY_RAIN' || statedCode === 'THUNDERSTORM',
      reducedVisibilityNote: statedCode === 'FOG'
        ? 'Claimant stated foggy conditions — reduced visibility may affect reaction time estimates.'
        : statedCode === 'HEAVY_RAIN' || statedCode === 'THUNDERSTORM'
        ? 'Claimant stated heavy rain/storm — reduced visibility and wet road surface applied.'
        : null,
    };
  }

  // ── FUTURE: Live API path ──────────────────────────────────────────────────
  // When WEATHER_API_ENABLED=true, implement this section:
  //
  // 1. Call fetchHistoricalWeather(lat, lng, date, time) → WeatherAPIResponse
  // 2. Map API response to WeatherConditionCode
  // 3. Compare actualCode vs statedCode
  // 4. Compute contradiction severity
  // 5. Return COMPLETED status with full analysis
  //
  // For now, fall through to PENDING_DEPENDENCY
  return {
    status: 'PENDING_DEPENDENCY',
    pendingDependencyNote: 'WEATHER_API_ENABLED=true but fetchHistoricalWeather() is not yet implemented.',
    frictionCoefficient: {
      value: statedFriction,
      basis: `Derived from claimant-stated conditions (API stub): "${input.statedConditions}"`,
      source: 'STATED_CONDITIONS',
    },
    conditionsContradiction: null,
    reducedVisibility: false,
    reducedVisibilityNote: null,
  };
}

/**
 * Placeholder for the live weather API fetch.
 * Implement this function when WEATHER_API_ENABLED=true.
 *
 * Example Open-Meteo call:
 * GET https://archive-api.open-meteo.com/v1/archive
 *   ?latitude=-17.8252&longitude=31.0335
 *   &start_date=2024-03-15&end_date=2024-03-15
 *   &hourly=weathercode,precipitation,windspeed_10m,visibility
 *   &timezone=Africa/Harare
 */
// async function fetchHistoricalWeather(
//   lat: number, lng: number, date: string, hour: number
// ): Promise<WeatherAPIResponse> {
//   const url = `https://archive-api.open-meteo.com/v1/archive` +
//     `?latitude=${lat}&longitude=${lng}` +
//     `&start_date=${date}&end_date=${date}` +
//     `&hourly=weathercode,precipitation,windspeed_10m,visibility` +
//     `&timezone=auto`;
//   const response = await fetch(url);
//   return response.json();
// }
