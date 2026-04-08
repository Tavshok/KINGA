/**
 * pipeline-v2/fieldRecoveryEngine.ts
 *
 * TARGETED FIELD RECOVERY ENGINE
 *
 * After the main stage-3 extraction pass, this engine identifies every null
 * critical field and fires a focused, field-specific LLM prompt to recover it.
 *
 * Design principles:
 * - NEVER silently drop a field — every null is an explicit recovery attempt
 * - Each field has its own focused prompt, regex fallback, and confidence score
 * - All recovery attempts are logged with source and confidence
 * - The engine is idempotent — running it twice produces the same result
 * - Works on any document regardless of format, language, or handwriting quality
 * - Handles Zimbabwe-specific claim form layouts (Cell Insurance, Zimnat, Old Mutual, etc.)
 */

import type { ExtractedClaimFields } from "./types";
import { invokeLLM } from "../_core/llm";

export interface FieldRecoveryResult {
  field: keyof ExtractedClaimFields;
  recovered: boolean;
  value: any;
  confidence: "high" | "medium" | "low";
  source: "llm_targeted" | "regex_fallback" | "cross_field_inference" | "not_found";
  notes: string;
}

export interface FieldRecoveryReport {
  results: FieldRecoveryResult[];
  fieldsRecovered: number;
  fieldsStillMissing: string[];
  totalAttempted: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// CRITICAL FIELDS — these MUST be recovered if at all possible
// ─────────────────────────────────────────────────────────────────────────────
const CRITICAL_FIELDS: (keyof ExtractedClaimFields)[] = [
  "claimId",
  "claimantName",
  "driverName",
  "vehicleRegistration",
  "vehicleMake",
  "vehicleModel",
  "vehicleYear",
  "vehicleMileage",
  "accidentDate",
  "incidentTime",
  "accidentLocation",
  "accidentDescription",
  "incidentType",
  "estimatedSpeedKmh",
  "policeReportNumber",
  "policeStation",
  "assessorName",
  "panelBeater",
  "quoteTotalCents",
  "agreedCostCents",
  "damageDescription",
  "insurerName",
  "policyNumber",
  "claimReference",
  "animalType",
  "weatherConditions",
  "roadSurface",
  "marketValueCents",
  "excessAmountCents",
  "driverLicenseNumber",
];

// ─────────────────────────────────────────────────────────────────────────────
// REGEX FALLBACK PATTERNS — fast recovery without LLM
// ─────────────────────────────────────────────────────────────────────────────
const REGEX_PATTERNS: Partial<Record<keyof ExtractedClaimFields, RegExp[]>> = {
  estimatedSpeedKmh: [
    /speed[:\s]+(\d+)\s*(?:km\/h|km\/hr|kph|kmh|KM\/HRS?|KPH)/i,
    /travelling\s+at\s+(\d+)\s*(?:km\/h|km\/hr|kph|kmh|KM\/HRS?)/i,
    /doing\s+(\d+)\s*(?:km\/h|km\/hr|kph|kmh)/i,
    /at\s+(?:a\s+speed\s+of\s+)?(\d+)\s*(?:km\/h|km\/hr|kph|kmh|KM\/HRS?)/i,
    /speed\s*(?:of\s+)?(\d+)\s*(?:km|kph|kmh)/i,
  ],
  accidentDate: [
    /(?:date\s+of\s+(?:accident|incident|loss))[:\s]+(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i,
    /(?:accident|incident)\s+date[:\s]+(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i,
    /(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4})/,
  ],
  incidentTime: [
    /time\s*(?:of\s+(?:accident|incident))?[:\s]+(\d{1,2}[:\s]\d{2}\s*(?:am|pm|hrs?)?)/i,
    /at\s+(?:approximately\s+)?(\d{1,2}[:\s]\d{2}\s*(?:am|pm|hrs?)?)/i,
    /(\d{1,2}[:\s]\d{2}\s*(?:am|pm|hrs?))/i,
  ],
  policeReportNumber: [
    /(?:police\s+report|report\s+no|case\s+no|RB\s+no|CR\s+no|ref)[:\s#.]+([A-Z0-9\/\-]+)/i,
    /RB\s*[:\s]?\s*([0-9]+\/[0-9]+)/i,
    /CR[:\s\/]+([0-9A-Z\/\-]+)/i,
    /(?:report|case)\s*#?\s*([A-Z0-9\/\-]{4,})/i,
  ],
  vehicleRegistration: [
    /(?:reg(?:istration)?|licence\s+plate|number\s+plate)[:\s]+([A-Z0-9\s\-]{3,12})/i,
    /\b([A-Z]{2,3}\s*\d{3,4}[A-Z]?)\b/,
    /\b([A-Z]{3,4}\s*\d{4})\b/,
  ],
  quoteTotalCents: [
    /total\s*(?:\(incl\.?\s*(?:vat)?\))?[:\s]+(?:USD|\$)?\s*([0-9][0-9,\s.]+)/i,
    /grand\s+total[:\s]+(?:USD|\$)?\s*([0-9][0-9,\s.]+)/i,
    /amount\s+due[:\s]+(?:USD|\$)?\s*([0-9][0-9,\s.]+)/i,
    /invoice\s+total[:\s]+(?:USD|\$)?\s*([0-9][0-9,\s.]+)/i,
  ],
  agreedCostCents: [
    /agreed\s+(?:USD|\$)?\s*([0-9][0-9,\s.]+)/i,
    /cost\s+agreed[:\s]+(?:USD|\$)?\s*([0-9][0-9,\s.]+)/i,
    /authoris(?:ed|ed)\s+(?:amount|cost)[:\s]+(?:USD|\$)?\s*([0-9][0-9,\s.]+)/i,
    /settled\s+(?:at|for)[:\s]+(?:USD|\$)?\s*([0-9][0-9,\s.]+)/i,
    /net\s+(?:cost|amount)[:\s]+(?:USD|\$)?\s*([0-9][0-9,\s.]+)/i,
  ],
  marketValueCents: [
    /market\s+value[:\s]+(?:USD|\$)?\s*([0-9][0-9,\s.]+)/i,
    /retail\s+value[:\s]+(?:USD|\$)?\s*([0-9][0-9,\s.]+)/i,
    /vehicle\s+value[:\s]+(?:USD|\$)?\s*([0-9][0-9,\s.]+)/i,
    /sum\s+insured[:\s]+(?:USD|\$)?\s*([0-9][0-9,\s.]+)/i,
    /insured\s+value[:\s]+(?:USD|\$)?\s*([0-9][0-9,\s.]+)/i,
  ],
  excessAmountCents: [
    /excess[:\s]+(?:USD|\$)?\s*([0-9][0-9,\s.]+)/i,
    /deductible[:\s]+(?:USD|\$)?\s*([0-9][0-9,\s.]+)/i,
    /excess\s+amount[:\s]+(?:USD|\$)?\s*([0-9][0-9,\s.]+)/i,
  ],
  insurerName: [
    /(?:insurer|insurance\s+company|underwriter)[:\s]+([A-Za-z\s&]+(?:Insurance|Assurance|Life|Mutual|Holdings)?)/i,
    /(Cell\s+Insurance(?:\s+Company)?)/i,
    /(Zimnat(?:\s+Lion)?(?:\s+Insurance)?)/i,
    /(Old\s+Mutual(?:\s+Zimbabwe)?)/i,
    /(First\s+Mutual(?:\s+Life)?)/i,
    /(Sanctuary\s+Insurance)/i,
    /(NicozDiamond)/i,
    /(Alliance\s+Insurance)/i,
  ],
  policyNumber: [
    /policy\s+(?:no|number|#)[:\s.]+([A-Z0-9\/\-]+)/i,
    /policy[:\s]+([A-Z0-9\/\-]{4,})/i,
  ],
  claimReference: [
    /claim\s+(?:ref(?:erence)?|no|number|#)[:\s.]+([A-Z0-9\/\-]+)/i,
    /(?:CI|CLM|REF|CL)\s*[-\/]?\s*([0-9A-Z\-\/]+)/i,
    /reference\s+(?:no|number)[:\s.]+([A-Z0-9\/\-]+)/i,
  ],
  animalType: [
    /(?:struck|hit|collided\s+with|ran\s+into)\s+(?:a\s+)?(\w+(?:\s+\w+)?)\s*(?:on\s+the\s+road)?/i,
    /animal[:\s]+(\w+)/i,
    /(cow|cattle|bull|kudu|impala|donkey|goat|dog|pig|elephant|zebra|warthog|buck|deer|livestock)/i,
  ],
  weatherConditions: [
    /weather[:\s]+([a-z\s,]+?)(?:\n|road|surface|$)/i,
    /(?:clear|cloudy|overcast|rain(?:y|ing)?|fog(?:gy)?|misty|night|dark|sunny|dry)/i,
  ],
  roadSurface: [
    /road\s+(?:surface|condition)[:\s]+([a-z\s,]+?)(?:\n|weather|$)/i,
    /surface[:\s]+([a-z\s]+?)(?:\n|$)/i,
    /(?:tarred|tarmac|gravel|dirt|unpaved|paved|wet|dry|icy|muddy)\s+road/i,
  ],
  driverLicenseNumber: [
    /(?:licence|license)\s+(?:no|number|#)[:\s.]+([A-Z0-9\/\-]+)/i,
    /DL\s*(?:no|#)?[:\s]+([A-Z0-9\/\-]+)/i,
    /driver(?:'s)?\s+licen[cs]e[:\s]+([A-Z0-9\/\-]+)/i,
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// TARGETED LLM PROMPTS — field-specific focused extraction
// ─────────────────────────────────────────────────────────────────────────────
const TARGETED_PROMPTS: Partial<Record<keyof ExtractedClaimFields, string>> = {
  estimatedSpeedKmh: `Extract ONLY the vehicle speed at the time of the accident.
Look for: "Speed:", "What was your speed?", "Speed at time of accident:", "travelling at X km/h", "doing X km/h".
Return ONLY the numeric value (e.g., 90). Strip all unit suffixes (KM/HRS, km/h, kph).
If no speed is mentioned anywhere, return null.
Response format: { "value": 90 } or { "value": null }`,

  incidentTime: `Extract ONLY the time of the accident/incident.
Look for: "Time:", "Time of accident:", "Time of incident:", or any time value near the accident date.
Convert to 24-hour HH:MM format (e.g., "14:30" for 2:30 PM).
Response format: { "value": "14:30" } or { "value": null }`,

  animalType: `Extract ONLY the type of animal involved in this incident.
Look in the accident description, circumstances, or any narrative text.
Common animals in Zimbabwe: cow, cattle, bull, kudu, impala, donkey, goat, dog, pig, elephant, zebra, warthog.
Return the animal type in lowercase (e.g., "cow", "kudu").
Response format: { "value": "cow" } or { "value": null }`,

  weatherConditions: `Extract ONLY the weather conditions at the time of the accident.
Look for: "Weather:", "Weather conditions:", "Conditions:", or descriptions like "clear", "rainy", "foggy", "night".
Response format: { "value": "clear" } or { "value": null }`,

  roadSurface: `Extract ONLY the road surface conditions at the time of the accident.
Look for: "Road surface:", "Road conditions:", "Surface:", or descriptions like "tarred", "gravel", "dry", "wet".
Response format: { "value": "tarred" } or { "value": null }`,

  insurerName: `Extract ONLY the name of the insurance company on this document.
Look at the letterhead, header, or any field labelled "Insurer:", "Insurance Company:", "Underwriter:".
Common Zimbabwe insurers: Cell Insurance Company, Zimnat Lion Insurance, Old Mutual Zimbabwe, First Mutual Life, NicozDiamond, Alliance Insurance, Sanctuary Insurance.
Response format: { "value": "Cell Insurance Company" } or { "value": null }`,

  policyNumber: `Extract ONLY the insurance policy number.
Look for: "Policy No.", "Policy Number", "Policy #", or any alphanumeric code labelled as a policy reference.
Response format: { "value": "POL-2024-001" } or { "value": null }`,

  claimReference: `Extract ONLY the insurer's claim reference number.
Look for: "Claim Ref:", "Claim Reference:", "Claim No.", "Reference No.", or codes like "CI-024...", "CLM-...", "REF-...".
Response format: { "value": "CI-024NATPHARM" } or { "value": null }`,

  marketValueCents: `Extract ONLY the vehicle market/retail value stated in the document.
Look for: "Market Value:", "Retail Value:", "Vehicle Value:", "Sum Insured:", "Insured Value:".
Convert to cents (multiply by 100). Example: USD 20,000 → 2000000.
Response format: { "value": 2000000 } or { "value": null }`,

  excessAmountCents: `Extract ONLY the insurance excess/deductible amount.
Look for: "Excess:", "Deductible:", "Excess Amount:", "Policy Excess:".
Convert to cents (multiply by 100). Example: USD 500 → 50000.
Response format: { "value": 50000 } or { "value": null }`,

  driverLicenseNumber: `Extract ONLY the driver's license number.
Look for: "Licence No.", "License Number", "DL No.", "Driver Licence:", or any alphanumeric code labelled as a license.
Response format: { "value": "ZW-DL-123456" } or { "value": null }`,

  policeReportNumber: `Extract ONLY the police report/case number.
Look for: "Police Report No.", "Report Number:", "Case No.", "RB No.", "CR No.", "Ref:".
Common formats: "RB 123/2024", "CR/2024/001", "CID/123", "RB12345".
Response format: { "value": "RB 123/2024" } or { "value": null }`,

  vehicleMileage: `Extract ONLY the vehicle odometer/mileage reading.
Look for: "Mileage:", "Odometer:", "Kilometres:", "KM:", or any number followed by "km" near vehicle details.
Return as a number (e.g., 45000 for 45,000 km).
Response format: { "value": 45000 } or { "value": null }`,
};

// ─────────────────────────────────────────────────────────────────────────────
// REGEX EXTRACTION HELPER
// ─────────────────────────────────────────────────────────────────────────────
function tryRegexExtract(
  field: keyof ExtractedClaimFields,
  rawText: string
): { value: any; confidence: "high" | "medium" | "low" } | null {
  const patterns = REGEX_PATTERNS[field];
  if (!patterns || !rawText) return null;

  for (const pattern of patterns) {
    const match = rawText.match(pattern);
    if (match) {
      const raw = match[1]?.trim();
      if (!raw) continue;

      // Type-specific parsing
      if (field === "estimatedSpeedKmh") {
        const num = parseFloat(raw.replace(/[,\s]/g, ""));
        if (!isNaN(num) && num > 0 && num < 300) {
          return { value: num, confidence: "medium" };
        }
      } else if (field === "accidentDate") {
        // Normalise DD/MM/YYYY → YYYY-MM-DD
        const parts = raw.split(/[\/\-\.]/);
        if (parts.length === 3) {
          const [d, m, y] = parts;
          const year = y.length === 2 ? `20${y}` : y;
          const month = m.padStart(2, "0");
          const day = d.padStart(2, "0");
          return { value: `${year}-${month}-${day}`, confidence: "medium" };
        }
      } else if (
        field === "quoteTotalCents" ||
        field === "agreedCostCents" ||
        field === "marketValueCents" ||
        field === "excessAmountCents"
      ) {
        const num = parseFloat(raw.replace(/[,\s]/g, ""));
        if (!isNaN(num) && num > 0) {
          return { value: Math.round(num * 100), confidence: "medium" };
        }
      } else if (field === "weatherConditions" || field === "roadSurface") {
        // For these fields, the match itself (not capture group) may be the value
        const val = raw || match[0]?.trim();
        if (val && val.length > 2) {
          return { value: val.toLowerCase(), confidence: "low" };
        }
      } else {
        return { value: raw, confidence: "medium" };
      }
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// TARGETED LLM RECOVERY
// ─────────────────────────────────────────────────────────────────────────────
async function tryLlmRecover(
  field: keyof ExtractedClaimFields,
  rawText: string,
  pdfUrl: string | null
): Promise<{ value: any; confidence: "high" | "medium" | "low" } | null> {
  const prompt = TARGETED_PROMPTS[field];
  if (!prompt) return null;

  try {
    const userContent: any[] = [
      {
        type: "text",
        text: `${prompt}\n\nDocument text (may be partial):\n${rawText.substring(0, 6000)}`,
      },
    ];

    // Include PDF if available for visual fields (handwriting, stamps)
    if (pdfUrl && (
      field === "estimatedSpeedKmh" ||
      field === "agreedCostCents" ||
      field === "incidentTime" ||
      field === "animalType" ||
      field === "insurerName" ||
      field === "policyNumber" ||
      field === "claimReference" ||
      field === "policeReportNumber"
    )) {
      userContent.push({
        type: "file_url",
        file_url: { url: pdfUrl, mime_type: "application/pdf" },
      });
    }

    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: "You are a precise insurance document field extractor. Extract ONLY the specific field requested. Return JSON only.",
        },
        { role: "user", content: userContent as any },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "field_recovery",
          strict: true,
          schema: {
            type: "object",
            properties: {
              value: {
                oneOf: [
                  { type: "string" },
                  { type: "number" },
                  { type: "null" },
                ],
              },
            },
            required: ["value"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices?.[0]?.message?.content;
    if (!content || typeof content !== "string") return null;

    const parsed = JSON.parse(content as string);
    if (parsed.value === null || parsed.value === undefined) return null;

    return { value: parsed.value, confidence: "high" };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CROSS-FIELD INFERENCE — recover fields from other extracted fields
// ─────────────────────────────────────────────────────────────────────────────
function tryCrossFieldInference(
  field: keyof ExtractedClaimFields,
  fields: ExtractedClaimFields
): { value: any; confidence: "high" | "medium" | "low" } | null {
  switch (field) {
    case "animalType": {
      // If incidentType is animal_strike but animalType is null, infer from description
      if (fields.incidentType === "animal_strike" && fields.accidentDescription) {
        const desc = fields.accidentDescription.toLowerCase();
        const animals = ["cow", "cattle", "bull", "kudu", "impala", "donkey", "goat", "dog", "pig", "elephant", "zebra", "warthog", "buck", "deer"];
        for (const animal of animals) {
          if (desc.includes(animal)) {
            return { value: animal, confidence: "high" };
          }
        }
        return { value: "unknown animal", confidence: "low" };
      }
      return null;
    }
    case "incidentType": {
      // If animalType is set, incidentType should be animal_strike
      if (fields.animalType && fields.animalType !== "null") {
        return { value: "animal_strike", confidence: "high" };
      }
      return null;
    }
    case "claimReference": {
      // Fall back to claimId if claimReference is null
      if (fields.claimId) {
        return { value: fields.claimId, confidence: "medium" };
      }
      return null;
    }
    case "panelBeater": {
      // Fall back to repairerCompany
      if (fields.repairerCompany) {
        return { value: fields.repairerCompany, confidence: "high" };
      }
      return null;
    }
    case "repairerCompany": {
      // Fall back to panelBeater
      if (fields.panelBeater) {
        return { value: fields.panelBeater, confidence: "high" };
      }
      return null;
    }
    case "quoteTotalCents": {
      // Fall back to agreedCostCents
      if (fields.agreedCostCents && fields.agreedCostCents > 0) {
        return { value: fields.agreedCostCents, confidence: "medium" };
      }
      return null;
    }
    case "agreedCostCents": {
      // Fall back to quoteTotalCents (less reliable — original quote, not agreed)
      if (fields.quoteTotalCents && fields.quoteTotalCents > 0) {
        return { value: fields.quoteTotalCents, confidence: "low" };
      }
      return null;
    }
    default:
      return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN RECOVERY FUNCTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run targeted field recovery for all null critical fields.
 *
 * Strategy (in order):
 * 1. Cross-field inference (instant, no LLM)
 * 2. Regex fallback (fast, no LLM)
 * 3. Targeted LLM prompt (accurate, uses PDF if available)
 *
 * Returns a patched copy of the fields with recovered values applied.
 */
export async function runFieldRecovery(
  fields: ExtractedClaimFields,
  rawText: string,
  pdfUrl: string | null,
  log: (msg: string) => void
): Promise<{ patchedFields: ExtractedClaimFields; report: FieldRecoveryReport }> {
  const results: FieldRecoveryResult[] = [];
  const patchedFields = { ...fields };

  // Identify which critical fields are null
  const nullCriticalFields = CRITICAL_FIELDS.filter(f => {
    const val = fields[f];
    return val === null || val === undefined || val === "";
  });

  log(`Field recovery: ${nullCriticalFields.length} null critical fields to recover: ${nullCriticalFields.join(", ")}`);

  for (const field of nullCriticalFields) {
    let recovered = false;
    let value: any = null;
    let confidence: "high" | "medium" | "low" = "low";
    let source: FieldRecoveryResult["source"] = "not_found";
    let notes = "";

    // STEP 1: Cross-field inference (instant)
    const crossResult = tryCrossFieldInference(field, patchedFields);
    if (crossResult !== null) {
      value = crossResult.value;
      confidence = crossResult.confidence;
      source = "cross_field_inference";
      recovered = true;
      notes = `Inferred from related field`;
    }

    // STEP 2: Regex fallback (fast)
    if (!recovered && rawText) {
      const regexResult = tryRegexExtract(field, rawText);
      if (regexResult !== null) {
        value = regexResult.value;
        confidence = regexResult.confidence;
        source = "regex_fallback";
        recovered = true;
        notes = `Extracted via regex pattern`;
      }
    }

    // STEP 3: Targeted LLM prompt (most accurate — fires for high-value fields)
    if (!recovered && TARGETED_PROMPTS[field]) {
      const llmResult = await tryLlmRecover(field, rawText, pdfUrl);
      if (llmResult !== null) {
        value = llmResult.value;
        confidence = llmResult.confidence;
        source = "llm_targeted";
        recovered = true;
        notes = `Recovered via targeted LLM extraction`;
      }
    }

    if (recovered && value !== null) {
      // Apply the recovered value to the patched fields
      (patchedFields as any)[field] = value;
      log(`Field recovery: ${field} = ${JSON.stringify(value)} (${source}, ${confidence})`);
    } else {
      notes = `Field not found in document after all recovery strategies`;
      log(`Field recovery: ${field} = NOT FOUND`);
    }

    results.push({ field, recovered, value, confidence, source, notes });
  }

  const fieldsRecovered = results.filter(r => r.recovered).length;
  const fieldsStillMissing = results.filter(r => !r.recovered).map(r => r.field as string);

  log(`Field recovery complete: ${fieldsRecovered}/${nullCriticalFields.length} fields recovered. Still missing: ${fieldsStillMissing.join(", ") || "none"}`);

  return {
    patchedFields,
    report: {
      results,
      fieldsRecovered,
      fieldsStillMissing,
      totalAttempted: nullCriticalFields.length,
    },
  };
}
