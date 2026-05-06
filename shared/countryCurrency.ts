/**
 * Country-to-currency mapping for KINGA's supported markets.
 *
 * Rules:
 * - Each entry maps an ISO 3166-1 alpha-2 country code to the PRIMARY transactional
 *   currency used by panel beaters and insurers in that country.
 * - Zimbabwe (ZW): USD is the primary quote/settlement currency. ZiG (Zimbabwe Gold)
 *   is also in circulation and will be detected from quote text when present.
 * - South Africa (ZA): ZAR is the primary currency.
 * - Zambia (ZM): ZMW (Zambian Kwacha) is the primary currency.
 * - Botswana (BW): BWP (Botswana Pula) is the primary currency.
 * - Namibia (NA): NAD (Namibian Dollar) is the primary currency.
 * - Mozambique (MZ): MZN (Mozambican Metical) is the primary currency.
 * - Malawi (MW): MWK (Malawian Kwacha) is the primary currency.
 * - Tanzania (TZ): TZS (Tanzanian Shilling) is the primary currency.
 * - Kenya (KE): KES (Kenyan Shilling) is the primary currency.
 * - Uganda (UG): UGX (Ugandan Shilling) is the primary currency.
 *
 * This map is the SINGLE source of truth for country → default currency.
 * Do NOT hardcode currency codes anywhere else in the pipeline.
 */
export const COUNTRY_CURRENCY_MAP: Record<string, { code: string; symbol: string; name: string }> = {
  ZW: { code: 'USD', symbol: '$',   name: 'US Dollar' },          // Zimbabwe — USD primary
  ZA: { code: 'ZAR', symbol: 'R',   name: 'South African Rand' },
  ZM: { code: 'ZMW', symbol: 'K',   name: 'Zambian Kwacha' },
  BW: { code: 'BWP', symbol: 'P',   name: 'Botswana Pula' },
  NA: { code: 'NAD', symbol: 'N$',  name: 'Namibian Dollar' },
  MZ: { code: 'MZN', symbol: 'MT',  name: 'Mozambican Metical' },
  MW: { code: 'MWK', symbol: 'MK',  name: 'Malawian Kwacha' },
  TZ: { code: 'TZS', symbol: 'TSh', name: 'Tanzanian Shilling' },
  KE: { code: 'KES', symbol: 'KSh', name: 'Kenyan Shilling' },
  UG: { code: 'UGX', symbol: 'USh', name: 'Ugandan Shilling' },
};

/**
 * Returns the default currency code for a given ISO 3166-1 alpha-2 country code.
 * Falls back to USD if the country is not in the map.
 */
export function getDefaultCurrencyForCountry(countryCode: string | null | undefined): string {
  if (!countryCode) return 'USD';
  return COUNTRY_CURRENCY_MAP[countryCode.toUpperCase()]?.code ?? 'USD';
}

/**
 * Returns the default currency symbol for a given ISO 3166-1 alpha-2 country code.
 * Falls back to '$' if the country is not in the map.
 */
export function getDefaultCurrencySymbolForCountry(countryCode: string | null | undefined): string {
  if (!countryCode) return '$';
  return COUNTRY_CURRENCY_MAP[countryCode.toUpperCase()]?.symbol ?? '$';
}

/**
 * Returns the ISO 3166-1 alpha-2 country code that corresponds to a given market region string.
 * The pipeline uses short region codes (e.g. 'ZA', 'ZW') which are already ISO codes,
 * but this function normalises legacy values like 'DEFAULT' or 'SADC'.
 */
export function normaliseCountryCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const upper = raw.toUpperCase();
  if (upper === 'DEFAULT' || upper === 'SADC' || upper === 'UNKNOWN') return null;
  // Already a 2-letter ISO code
  if (upper.length === 2 && COUNTRY_CURRENCY_MAP[upper]) return upper;
  // Legacy full country name fallbacks
  const nameMap: Record<string, string> = {
    ZIMBABWE: 'ZW',
    'SOUTH AFRICA': 'ZA',
    ZAMBIA: 'ZM',
    BOTSWANA: 'BW',
    NAMIBIA: 'NA',
    MOZAMBIQUE: 'MZ',
    MALAWI: 'MW',
    TANZANIA: 'TZ',
    KENYA: 'KE',
    UGANDA: 'UG',
  };
  return nameMap[upper] ?? null;
}

/**
 * Ordered list of supported countries for UI dropdowns.
 */
export const SUPPORTED_COUNTRIES = Object.entries(COUNTRY_CURRENCY_MAP).map(([code, info]) => ({
  code,
  name: getCountryName(code),
  currencyCode: info.code,
  currencySymbol: info.symbol,
  currencyName: info.name,
}));

function getCountryName(code: string): string {
  const names: Record<string, string> = {
    ZW: 'Zimbabwe',
    ZA: 'South Africa',
    ZM: 'Zambia',
    BW: 'Botswana',
    NA: 'Namibia',
    MZ: 'Mozambique',
    MW: 'Malawi',
    TZ: 'Tanzania',
    KE: 'Kenya',
    UG: 'Uganda',
  };
  return names[code] ?? code;
}
