/**
 * automotiveDomainCorrector.ts — Stage 2.5
 *
 * Permanent OCR / handwriting misread correction engine.
 * Runs as a post-extraction pass after Stage 2 LLM extraction and before
 * Stage 3 field recovery. Applies domain knowledge to fix systematic errors
 * that LLMs cannot reliably self-correct:
 *
 *   1. Vehicle make fuzzy matching  (BMD → BMW, TOYATA → Toyota, etc.)
 *   2. Vehicle model correction      (318L → 318i, CORROLA → Corolla, etc.)
 *   3. Registration OCR correction   (character-level: O↔0, I↔1, B↔8)
 *   4. Policy number validation      (reject label fragments: "NO", "YES", "N/A")
 *   5. Third-party detection         (scan narrative for vehicle references)
 *   6. Colour normalisation          (SILVAR → SILVER, WHIT → WHITE, etc.)
 *
 * All corrections are logged in a CorrectionLog for the assumption registry.
 */

import type { ClaimRecord } from './types.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CorrectionEntry {
  field: string;
  original: string;
  corrected: string;
  rule: string;
  confidence: number; // 0–1
}

export interface DomainCorrectionResult {
  claimRecord: ClaimRecord;
  corrections: CorrectionEntry[];
  correctionCount: number;
  policyNumberInvalid: boolean;
  thirdPartyDetectedFromNarrative: boolean;
}

// ─── Vehicle Make Dictionary ──────────────────────────────────────────────────
// Key: canonical make (Title Case)
// Value: array of known OCR/handwriting misreads (uppercase for comparison)

const VEHICLE_MAKE_VARIANTS: Record<string, string[]> = {
  'BMW': ['BMD', 'BMV', 'BNW', 'B.M.W', 'B M W', 'BIMMER', 'BEEMER', 'BIM'],
  'Toyota': ['TOYATA', 'TOYOYA', 'TOYTA', 'TOYATA', 'TOYOYTA', 'TOYO', 'TOYODA', 'TOYATA', 'TOYOTAA'],
  'Mercedes-Benz': ['MERCEDEZ', 'MERCEDES', 'MERCED', 'MERSEDES', 'MERSEDEZ', 'BENZ', 'MERC', 'M/BENZ', 'MB'],
  'Volkswagen': ['VOLKWAGEN', 'VOLSWAGEN', 'VOLKSWAGON', 'VW', 'V.W', 'VOLKS', 'FOLKSWAGEN'],
  'Nissan': ['NISAAN', 'NISAN', 'NISSAAN', 'NISAAN', 'NISAAN', 'NIISAN', 'NISSAN'],
  'Honda': ['HONDE', 'HANDA', 'HONDAA', 'HONDAY', 'HONDAA'],
  'Ford': ['FROD', 'FOORD', 'FORDD', 'FORDE'],
  'Mazda': ['MASDA', 'MAZADA', 'MAZIDA', 'MZDA'],
  'Hyundai': ['HYUNDEI', 'HYUNDAI', 'HYUNDAY', 'HYUNDAE', 'HUNDAI', 'HYUDAI'],
  'Kia': ['KIA', 'KAI', 'KIAA'],
  'Isuzu': ['IZUZU', 'ISUSU', 'ISUZU', 'IZUSU', 'ISUZUU'],
  'Mitsubishi': ['MITSUBISHI', 'MITSUBISI', 'MITSIBUSHI', 'MITSU', 'MITS'],
  'Subaru': ['SUBURU', 'SUBAARU', 'SUBARO', 'SUBURA'],
  'Suzuki': ['SUZUKY', 'SUZUKIE', 'SUZUKI'],
  'Peugeot': ['PEUGOET', 'PUGEOT', 'PEUGEOT', 'PEUGOT', 'PEGUOT'],
  'Renault': ['RENALT', 'RENAULT', 'RENOLT', 'RENOLT'],
  'Chevrolet': ['CHEVY', 'CHEVROLET', 'CHEVROLETTE', 'CHEV', 'CHEVVY'],
  'Opel': ['OPELL', 'OPAL', 'OPELL'],
  'Land Rover': ['LANDROVER', 'LAND ROVER', 'L/ROVER', 'LANDROVER', 'LANDROOVER'],
  'Range Rover': ['RANGE ROVER', 'RANGEROVER', 'R/ROVER', 'RANGEROOVER'],
  'Jeep': ['JEEP', 'JEEEP'],
  'Audi': ['AUDI', 'AUDY', 'AUDE'],
  'Volvo': ['VOLVO', 'VOLVOO', 'VOLVO'],
  'Fiat': ['FIAT', 'FIATT', 'FIAAT'],
  'Citroën': ['CITROEN', 'CITROËN', 'CITRON', 'CITROEEN'],
  'Datsun': ['DATSON', 'DATSUN', 'DATSOON'],
  'Hino': ['HINO', 'HINOO'],
  'Iveco': ['IVECO', 'IVEECO'],
  'MAN': ['MAN', 'MAAN'],
  'Scania': ['SCANIA', 'SCANYA'],
  'DAF': ['DAF', 'DAFF'],
  'Tata': ['TATA', 'TAATA'],
  'Mahindra': ['MAHINDRA', 'MAHENDRA', 'MAHINDRA'],
  'Haval': ['HAVAL', 'HAVALL', 'HAVVAL'],
  'Chery': ['CHERY', 'CHERRY', 'CHERI'],
  'BYD': ['BYD', 'B.Y.D'],
  'GWM': ['GWM', 'G.W.M', 'GREAT WALL'],
};

// ─── Vehicle Model Corrections ────────────────────────────────────────────────
// Keyed by make (uppercase), value is map of misread → canonical model

const VEHICLE_MODEL_CORRECTIONS: Record<string, Record<string, string>> = {
  BMW: {
    '318L': '318i',
    '318I': '318i',
    '316I': '316i',
    '320I': '320i',
    '325I': '325i',
    '330I': '330i',
    '520I': '520i',
    '525I': '525i',
    '530I': '530i',
    'X3I': 'X3',
    'X5I': 'X5',
    'M3I': 'M3',
  },
  TOYOTA: {
    'CORROLA': 'Corolla',
    'COROLLA': 'Corolla',
    'CORROLLA': 'Corolla',
    'HILUX': 'Hilux',
    'HILAX': 'Hilux',
    'HILIX': 'Hilux',
    'LANDCRUZER': 'Land Cruiser',
    'LAND CRUZER': 'Land Cruiser',
    'FORTUNNER': 'Fortuner',
    'FORTUNER': 'Fortuner',
    'CAMRY': 'Camry',
    'CAMERY': 'Camry',
    'PRADO': 'Prado',
    'PRAADO': 'Prado',
    'YARIS': 'Yaris',
    'YARRIS': 'Yaris',
    'AVANZA': 'Avanza',
    'AVANSA': 'Avanza',
    'RUSH': 'Rush',
    'RUSSH': 'Rush',
  },
  VOLKSWAGEN: {
    'POLO VIVO': 'Polo Vivo',
    'POLO VIBO': 'Polo Vivo',
    'GOLF 7': 'Golf 7',
    'GOLF VII': 'Golf 7',
    'TIGUAN': 'Tiguan',
    'TIGUAAN': 'Tiguan',
    'AMAROK': 'Amarok',
    'AMAROCK': 'Amarok',
    'PASSAT': 'Passat',
    'PASSAAT': 'Passat',
  },
  NISSAN: {
    'NAVARA': 'Navara',
    'NAVARRA': 'Navara',
    'HARDBODY': 'Hardbody',
    'HARD BODY': 'Hardbody',
    'PATROL': 'Patrol',
    'PATROOL': 'Patrol',
    'NP200': 'NP200',
    'NP 200': 'NP200',
    'NP300': 'NP300',
    'NP 300': 'NP300',
    'TIIDA': 'Tiida',
    'ALMERA': 'Almera',
    'ALMEERA': 'Almera',
    'SENTRA': 'Sentra',
    'SENTERA': 'Sentra',
  },
  HONDA: {
    'CIVIC': 'Civic',
    'CIVICK': 'Civic',
    'ACCORD': 'Accord',
    'ACORD': 'Accord',
    'CRV': 'CR-V',
    'CR V': 'CR-V',
    'HRV': 'HR-V',
    'HR V': 'HR-V',
    'JAZZ': 'Jazz',
    'JASSS': 'Jazz',
    'FIT': 'Fit',
    'FIIT': 'Fit',
  },
  FORD: {
    'RANGER': 'Ranger',
    'RANGEER': 'Ranger',
    'FIESTA': 'Fiesta',
    'FIEESTA': 'Fiesta',
    'FOCUS': 'Focus',
    'FOCUSS': 'Focus',
    'ECOSPORT': 'EcoSport',
    'ECO SPORT': 'EcoSport',
    'EVEREST': 'Everest',
    'EVEEREST': 'Everest',
    'MUSTANG': 'Mustang',
  },
};

// ─── Colour Corrections ───────────────────────────────────────────────────────

const COLOUR_CORRECTIONS: Record<string, string> = {
  'SILVAR': 'SILVER',
  'SLIVER': 'SILVER',
  'SILVVER': 'SILVER',
  'WHIT': 'WHITE',
  'WITE': 'WHITE',
  'WHYTE': 'WHITE',
  'BLAK': 'BLACK',
  'BLCK': 'BLACK',
  'BLAACK': 'BLACK',
  'GERY': 'GREY',
  'GREY': 'GREY',
  'GRAY': 'GREY',
  'GRAAY': 'GREY',
  'BLEU': 'BLUE',
  'BULE': 'BLUE',
  'BLUEE': 'BLUE',
  'REDD': 'RED',
  'REDE': 'RED',
  'GREAN': 'GREEN',
  'GREN': 'GREEN',
  'GREEEN': 'GREEN',
  'YELLLOW': 'YELLOW',
  'YELLO': 'YELLOW',
  'ORENGE': 'ORANGE',
  'ORNGE': 'ORANGE',
  'BROWNN': 'BROWN',
  'BRON': 'BROWN',
  'MAROON': 'MAROON',
  'MARON': 'MAROON',
  'MARRON': 'MAROON',
  'CHAMPAIGN': 'CHAMPAGNE',
  'CHAMPANE': 'CHAMPAGNE',
  'BEIGE': 'BEIGE',
  'BURGANDY': 'BURGUNDY',
  'BURGUNDY': 'BURGUNDY',
  'PRUPLE': 'PURPLE',
  'PURPEL': 'PURPLE',
};

// ─── Policy Number Invalid Fragments ─────────────────────────────────────────
// These are label fragments that get mistakenly extracted as the policy value

const POLICY_NUMBER_INVALID_FRAGMENTS = new Set([
  'NO', 'YES', 'NA', 'N/A', 'N.A', 'NONE', 'NUMBER', 'NUM', 'POLICY',
  'POLICY NO', 'POLICY NUMBER', 'POL NO', 'POL', 'REF', 'REFERENCE',
  'NIL', 'NULL', 'UNKNOWN', 'NOT AVAILABLE', 'NOT PROVIDED', '-', '—', '.',
  'TBA', 'TBD', 'TO BE CONFIRMED', 'PENDING',
]);

// ─── Third-Party Vehicle Detection Patterns ───────────────────────────────────

const THIRD_PARTY_PATTERNS = [
  /\b(?:another|other|third[\s-]?party|3rd[\s-]?party)\s+(?:vehicle|car|truck|bus|van|lorry|motor)\b/i,
  /\b(?:vehicle|car|truck|bus|van|lorry)\s+(?:registration|reg\.?|no\.?)\s*[A-Z0-9]{3,}/i,
  /\bBMW\b|\bTOYOTA\b|\bNISSAN\b|\bFORD\b|\bVOLKSWAGEN\b|\bVW\b|\bHONDA\b|\bMAZDA\b|\bHYUNDAI\b|\bKIA\b|\bMITSUBISHI\b|\bSUZUKI\b|\bOPEL\b|\bCHEVROLET\b|\bMERCEDES\b|\bAUDI\b|\bVOLVO\b|\bFIAT\b|\bPEUGEOT\b|\bRENAULT\b|\bISUZU\b|\bDAFSUN\b|\bDAFSUN\b|\bDATSUN\b|\bHAVAL\b|\bGWM\b|\bBYD\b|\bCHERY\b/i,
  /\b[A-Z]{3}\s*\d{3,4}\s*[A-Z]{0,2}\b/,  // Registration plate pattern
  /rammed?\s+into\s+(?:the\s+)?(?:back\s+of\s+)?(?:a\s+|an\s+|the\s+)?(?:another\s+)?(?:vehicle|car|truck)/i,
  /collided?\s+with\s+(?:a\s+|an\s+|the\s+)?(?:another\s+)?(?:vehicle|car|truck)/i,
  /hit\s+(?:a\s+|an\s+|the\s+)?(?:another\s+)?(?:vehicle|car|truck)/i,
  /struck\s+(?:a\s+|an\s+|the\s+)?(?:another\s+)?(?:vehicle|car|truck)/i,
  /rear[\s-]?ended?\s+(?:a\s+|an\s+|the\s+)?(?:another\s+)?(?:vehicle|car|truck)/i,
  /\bBMD\b|\bBMV\b|\bBNW\b/i,  // Common BMW misreads that indicate a vehicle reference
];

// ─── Registration OCR Correction ─────────────────────────────────────────────
// Applies character-level corrections to vehicle registration numbers
// based on common OCR confusion patterns

function correctRegistrationOcr(reg: string): string {
  if (!reg || reg.length < 4) return reg;

  // Registration plates are typically: 3 letters + 3-4 digits + optional suffix
  // e.g. ADP6423, ZW123GP, ABC 123 ZW
  const clean = reg.toUpperCase().replace(/\s+/g, ' ').trim();

  // Split into segments: letters at start, digits in middle, letters at end
  // Apply OCR corrections per segment type
  // Registration format: 3 letter prefix + 3-4 digit section + optional 2-letter suffix
  // e.g. ADP6423, ADPO423 (O should be 0), ZW123GP
  //
  // Strategy: use a 3-letter prefix heuristic. The first 3 uppercase letters are the
  // letter prefix; everything after position 3 is the digit section (may start with O/I).
  // This matches the most common Southern African registration plate format.
  let result = clean;

  // Determine the letter prefix length: exactly 3 leading alpha chars (Southern African plate format)
  // Use {3} not {2,4} to avoid greedily consuming OCR-confused letters (O/I) that belong to digit section
  const prefixMatch = clean.match(/^([A-Z]{3})/);
  if (prefixMatch) {
    const prefixLen = prefixMatch[1].length;
    const prefix = clean.slice(0, prefixLen);
    const digitSection = clean.slice(prefixLen);
    // In the digit section, replace letter-like characters with their digit equivalents
    const fixedDigitSection = digitSection
      .replace(/O/g, '0')
      .replace(/I/g, '1')
      .replace(/B/g, '8')
      .replace(/S/g, '5')
      .replace(/Z/g, '2')
      .replace(/G/g, '6');
    result = prefix + fixedDigitSection;
  }

  return result;
}

// ─── Levenshtein Distance ─────────────────────────────────────────────────────

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

// ─── Fuzzy Make Matching ──────────────────────────────────────────────────────

function correctVehicleMake(raw: string | null | undefined): { corrected: string | null; confidence: number; rule: string } | null {
  if (!raw) return null;
  const upper = raw.toUpperCase().trim();

  // Exact match first (case-insensitive)
  for (const [canonical, variants] of Object.entries(VEHICLE_MAKE_VARIANTS)) {
    if (upper === canonical.toUpperCase()) return null; // already correct
    if (variants.includes(upper)) {
      return { corrected: canonical, confidence: 0.98, rule: 'EXACT_VARIANT_MATCH' };
    }
  }

  // Fuzzy match: find the canonical make with the lowest edit distance
  let bestMake = '';
  let bestDist = Infinity;
  let bestVariant = '';

  for (const [canonical, variants] of Object.entries(VEHICLE_MAKE_VARIANTS)) {
    // Check against canonical
    const distCanonical = levenshtein(upper, canonical.toUpperCase());
    if (distCanonical < bestDist && distCanonical <= 2) {
      bestDist = distCanonical;
      bestMake = canonical;
      bestVariant = canonical;
    }
    // Check against all variants
    for (const variant of variants) {
      const dist = levenshtein(upper, variant);
      if (dist < bestDist && dist <= 2) {
        bestDist = dist;
        bestMake = canonical;
        bestVariant = variant;
      }
    }
  }

  if (bestMake && bestDist <= 2) {
    const confidence = bestDist === 0 ? 0.98 : bestDist === 1 ? 0.92 : 0.80;
    return { corrected: bestMake, confidence, rule: `FUZZY_MATCH_DIST_${bestDist}` };
  }

  return null;
}

// ─── Model Correction ─────────────────────────────────────────────────────────

function correctVehicleModel(make: string | null | undefined, model: string | null | undefined): { corrected: string; confidence: number } | null {
  if (!make || !model) return null;
  const makeUpper = make.toUpperCase().replace(/[^A-Z]/g, '');
  const modelUpper = model.toUpperCase().trim();

  // Try direct make key
  const corrections = VEHICLE_MODEL_CORRECTIONS[makeUpper];
  if (!corrections) return null;

  // Check if the model is already a canonical value — return null (no correction needed)
  const canonicalValues = new Set(Object.values(corrections).map(v => v.toUpperCase()));
  if (canonicalValues.has(modelUpper)) return null;

  if (corrections[modelUpper]) {
    return { corrected: corrections[modelUpper], confidence: 0.95 };
  }

  // Fuzzy model match within the make's correction table
  for (const [misread, canonical] of Object.entries(corrections)) {
    if (levenshtein(modelUpper, misread) <= 1) {
      return { corrected: canonical, confidence: 0.88 };
    }
  }

  return null;
}

// ─── Colour Correction ────────────────────────────────────────────────────────

function correctColour(raw: string | null | undefined): { corrected: string; confidence: number } | null {
  if (!raw) return null;
  const upper = raw.toUpperCase().trim();
  // If the value is already a canonical colour (appears as a value in the table), no correction needed
  const canonicalColours = new Set(Object.values(COLOUR_CORRECTIONS));
  if (canonicalColours.has(upper)) return null;
  if (COLOUR_CORRECTIONS[upper]) {
    return { corrected: COLOUR_CORRECTIONS[upper], confidence: 0.95 };
  }
  // Fuzzy colour match
  for (const [misread, canonical] of Object.entries(COLOUR_CORRECTIONS)) {
    if (levenshtein(upper, misread) <= 1) {
      return { corrected: canonical, confidence: 0.85 };
    }
  }
  return null;
}

// ─── Policy Number Validation ─────────────────────────────────────────────────

function isPolicyNumberInvalid(policyNumber: string | null | undefined): boolean {
  if (!policyNumber) return true;
  const upper = policyNumber.toUpperCase().trim();
  if (POLICY_NUMBER_INVALID_FRAGMENTS.has(upper)) return true;
  // Single word that is all letters and <= 4 chars is likely a label fragment
  if (/^[A-Z]{1,4}$/.test(upper)) return true;
  // Must contain at least one digit to be a real policy number
  if (!/\d/.test(policyNumber)) return true;
  return false;
}

// ─── Third-Party Detection from Narrative ────────────────────────────────────

function detectThirdPartyFromNarrative(narrative: string | null | undefined): boolean {
  if (!narrative || narrative.length < 10) return false;
  return THIRD_PARTY_PATTERNS.some(pattern => pattern.test(narrative));
}

// ─── Main Correction Function ─────────────────────────────────────────────────

export function applyAutomotiveDomainCorrections(claimRecord: ClaimRecord): DomainCorrectionResult {
  const corrections: CorrectionEntry[] = [];
  // Deep clone to avoid mutating the original
  const record: ClaimRecord = JSON.parse(JSON.stringify(claimRecord));

  // 1. Vehicle make correction
  const makeResult = correctVehicleMake(record.vehicle?.make);
  if (makeResult && record.vehicle) {
    corrections.push({
      field: 'vehicle.make',
      original: record.vehicle.make ?? '',
      corrected: makeResult.corrected ?? '',
      rule: makeResult.rule,
      confidence: makeResult.confidence,
    });
    record.vehicle.make = makeResult.corrected ?? record.vehicle.make;
  }

  // 2. Vehicle model correction (uses corrected make)
  const currentMake = record.vehicle?.make;
  const modelResult = correctVehicleModel(currentMake, record.vehicle?.model);
  if (modelResult && record.vehicle) {
    corrections.push({
      field: 'vehicle.model',
      original: record.vehicle.model ?? '',
      corrected: modelResult.corrected,
      rule: 'MODEL_CORRECTION_TABLE',
      confidence: modelResult.confidence,
    });
    record.vehicle.model = modelResult.corrected;
  }

  // 3. Vehicle colour correction
  const colourResult = correctColour(record.vehicle?.colour);
  if (colourResult && record.vehicle) {
    corrections.push({
      field: 'vehicle.colour',
      original: record.vehicle.colour ?? '',
      corrected: colourResult.corrected,
      rule: 'COLOUR_CORRECTION_TABLE',
      confidence: colourResult.confidence,
    });
    record.vehicle.colour = colourResult.corrected;
  }

  // 4. Registration OCR correction
  if (record.vehicle?.registrationNumber) {
    const correctedReg = correctRegistrationOcr(record.vehicle.registrationNumber);
    if (correctedReg !== record.vehicle.registrationNumber.toUpperCase().replace(/\s+/g, ' ').trim()) {
      corrections.push({
        field: 'vehicle.registrationNumber',
        original: record.vehicle.registrationNumber,
        corrected: correctedReg,
        rule: 'REGISTRATION_OCR_CORRECTION',
        confidence: 0.82,
      });
      record.vehicle.registrationNumber = correctedReg;
    }
  }

  // 5. Policy number validation
  const policyNumberInvalid = isPolicyNumberInvalid(record.insuranceContext?.policyNumber);
  if (policyNumberInvalid && record.insuranceContext?.policyNumber) {
    corrections.push({
      field: 'insuranceContext.policyNumber',
      original: record.insuranceContext.policyNumber,
      corrected: 'INVALID_EXTRACTION',
      rule: 'POLICY_NUMBER_LABEL_FRAGMENT',
      confidence: 0.95,
    });
    record.insuranceContext.policyNumber = null as any;
  }

  // 6. Third-party detection from narrative
  let thirdPartyDetectedFromNarrative = false;
  const narrative = record.accidentDetails?.narrativeDescription;
  if (narrative && !record.accidentDetails?.thirdPartyPresent) {
    thirdPartyDetectedFromNarrative = detectThirdPartyFromNarrative(narrative);
    if (thirdPartyDetectedFromNarrative && record.accidentDetails) {
      corrections.push({
        field: 'accidentDetails.thirdPartyPresent',
        original: 'undefined/false',
        corrected: 'true',
        rule: 'THIRD_PARTY_NARRATIVE_DETECTION',
        confidence: 0.78,
      });
      record.accidentDetails.thirdPartyPresent = true;
    }
  }

  // 7. Third-party vehicle make correction (if third party vehicle make is present)
  if (record.accidentDetails?.thirdPartyVehicleMake) {
    const tpMakeResult = correctVehicleMake(record.accidentDetails.thirdPartyVehicleMake);
    if (tpMakeResult) {
      corrections.push({
        field: 'accidentDetails.thirdPartyVehicleMake',
        original: record.accidentDetails.thirdPartyVehicleMake,
        corrected: tpMakeResult.corrected ?? '',
        rule: tpMakeResult.rule,
        confidence: tpMakeResult.confidence,
      });
      record.accidentDetails.thirdPartyVehicleMake = tpMakeResult.corrected ?? record.accidentDetails.thirdPartyVehicleMake;
    }
  }

  return {
    claimRecord: record,
    corrections,
    correctionCount: corrections.length,
    policyNumberInvalid,
    thirdPartyDetectedFromNarrative,
  };
}

// ─── Exports for testing ──────────────────────────────────────────────────────

export {
  correctVehicleMake,
  correctVehicleModel,
  correctColour,
  correctRegistrationOcr,
  isPolicyNumberInvalid,
  detectThirdPartyFromNarrative,
  levenshtein,
  VEHICLE_MAKE_VARIANTS,
  VEHICLE_MODEL_CORRECTIONS,
  COLOUR_CORRECTIONS,
  POLICY_NUMBER_INVALID_FRAGMENTS,
};
