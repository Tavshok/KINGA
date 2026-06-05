/**
 * quoteExtractionEngine.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Structured Quote Extraction Engine
 *
 * Converts unstructured repair quote text (OCR output, table fragments,
 * partial paragraphs) into a normalised JSON structure.
 *
 * CONTRACT:
 *   - Never infer missing components
 *   - Never estimate cost
 *   - Return null for any field that cannot be extracted with confidence
 *   - Component names must be normalised to simple English (e.g. "rear bumper")
 *   - Currency is detected from the quote text first; falls back to the tenant's country default
 *     (e.g. ZW → USD, ZA → ZAR). Never hardcoded.
 *
 * OUTPUT SCHEMA:
 *   {
 *     panel_beater:    string | null,
 *     total_cost:      number | null,
 * *   currency:        "USD" | "ZWG" | "ZWL" | "ZAR" | "GBP" | string | null,  // null = not found in document
 *     components:      string[],
 *     labour_defined:  boolean,
 *     parts_defined:   boolean,
 *     labour_cost:     number | null,
 *     parts_cost:      number | null,
 *     confidence:      "high" | "medium" | "low",
 *     extraction_warnings: string[]
 *   }
 */

import { invokeLLM } from "../_core/llm";
import { appendFileSync } from "fs";
const plog = (msg: string) => { try { appendFileSync('/home/ubuntu/kinga-replit/pipeline-debug.log', `[${new Date().toISOString()}] ${msg}\n`); } catch(e) { console.log('[plog error]', e); } };
import { resolveComponent, isPlausiblePartName } from "../../shared/vehicleParts";
import { getDefaultCurrencyForCountry } from "../../shared/countryCurrency";

// ─── Public types ─────────────────────────────────────────────────────────────

/**
 * Categories of line items that are valid in a repair quote but are NOT
 * vehicle parts (they pass through the hallucination guard unconditionally).
 */
const NON_PART_LINE_ITEM_CATEGORIES = new Set([
  // Cost categories
  "sundries", "sundry", "consumables", "consumable",
  "paint", "painting", "spray", "respray", "refinish", "polish",
  "labour", "labor", "strip & fit", "strip and fit", "s&f", "r&r", "remove & refit",
  "vat", "tax", "gst", "sub total", "subtotal", "total",
  "miscellaneous", "misc", "other", "additional",
  "towing", "storage", "assessment fee", "inspection fee",
  "alignment", "wheel alignment", "tracking",
  "wash", "detail", "cleaning",
  "calibration", "adas calibration",
  "disposal", "environmental",
  // ── SA repair workshop line items ────────────────────────────────────────
  // Hardware / fasteners — appear in SA quotes as standalone line items
  "fittings", "fitting", "clips", "clip", "bolts", "bolt", "nuts", "nut",
  "washers", "washer", "rivets", "rivet", "screws", "screw",
  "adhesive", "adhesives", "sealant", "sealants", "foam", "foams",
  "grommets", "grommet", "bushings", "bushing", "bushes", "bush",
  // Repair operations — common SA workshop terminology
  "repairs", "repair", "strip", "strip & assemble", "strip and assemble",
  "strip & fit", "strip and fit", "s/f", "s & f",
  "regas", "re-gas", "regassing",
  "reprogramme", "reprogram", "reprogramming", "reprograme",
  "recalibration", "re-calibration",
  "flush", "flushing",
  "weld", "welding", "straighten", "straightening",
  "panel beating", "panel beat",
  // Electrical / mechanical service items
  "focus lights", "focus light", "headlamp aim", "headlight aim",
  "abs module", "abs unit", "abs sensor",
  "airbag module", "airbag sensor", "airbag clock spring",
  "ecu", "ecu programming", "module programming",
  // Suspension / steering service items (appear in quotes without being body parts)
  "camber bolts", "camber bolt", "camber kit",
  "toe adjustment", "caster adjustment",
  // Trim / moulding / hardware (small items that don't map to body panels)
  "wind deflector", "wind deflectors", "door deflector",
  "step", "steps", "running board", "running boards",
  "tyre", "tyres", "tire", "tires", "wheel", "wheels",
  "spare wheel", "spare tyre",
  // Financial / admin line items
  "discount", "credit", "deposit", "excess", "deductible",
  "delivery", "transport", "freight",
  "supply", "supplies",
  // Catch-all summary rows — these are aggregate totals, not individual parts
  // They inflate L2 composite cost if treated as components
  "spares", "spare parts total", "parts total", "parts subtotal",
  "all parts", "all spares", "vehicle parts", "parts & materials",
  "materials", "material",
  "items", "line items", "components",
]);

/**
 * Returns true if the component name is a known non-vehicle-part category
 * that should pass through the hallucination guard unconditionally.
 */
function isNonPartLineItem(name: string): boolean {
  const lower = name.trim().toLowerCase();
  // Exact match
  if (NON_PART_LINE_ITEM_CATEGORIES.has(lower)) return true;
  // Prefix match (e.g. "paint materials", "labour - panel repair")
  for (const cat of NON_PART_LINE_ITEM_CATEGORIES) {
    if (lower.startsWith(cat) || lower.includes(cat)) return true;
  }
  return false;
}

/** A single line item from an itemised repair quotation. */
export interface QuoteLineItem {
  /** Normalised component name, e.g. "rear bumper", "RHS door" */
  component: string;
  /** Unit cost as a plain number (same currency as total_cost). Null if not stated. */
  unit_cost: number | null;
  /** Quantity (default 1 if not stated). */
  quantity: number;
  /** Line total = unit_cost × quantity. Null if unit_cost is null. */
  line_total: number | null;
  /** Repair action: repair | replace | refinish | other */
  action: string | null;
  /**
   * Part origin inferred from quote text.
   * Populated opportunistically — defaults to "unknown" when not stated.
   * Values: "oem" | "aftermarket" | "reconditioned" | "used" | "unknown"
   */
  part_origin: "oem" | "aftermarket" | "reconditioned" | "used" | "unknown";
  /**
   * True when this line item is a non-vehicle-part cost category
   * (e.g. sundries, paint, labour, VAT). These pass through the
   * hallucination guard unconditionally and are excluded from
   * damage-component reconciliation.
   */
  is_non_part_cost?: boolean;
  /**
   * True when this line item passed the semantic plausibility check but could
   * not be resolved to a known vehicle part in the taxonomy. The raw name is
   * preserved as-is. Adjuster should verify this item manually.
   */
  is_unresolved?: boolean;
}

export interface ExtractedQuote {
  panel_beater: string | null;
  total_cost: number | null;
  /** Currency code detected from the document. null when not found — caller applies tenant-country default. */
  currency: string | null;
  components: string[];
  /** Itemised line items with per-component pricing. Empty array if quote is not itemised. */
  line_items: QuoteLineItem[];
  labour_defined: boolean;
  parts_defined: boolean;
  /** Actual labour cost extracted from the quote (same currency as total_cost). Null if not itemised. */
  labour_cost: number | null;
  /** Actual parts cost extracted from the quote (same currency as total_cost). Null if not itemised. */
  parts_cost: number | null;
  confidence: "high" | "medium" | "low";
  extraction_warnings: string[];
  /**
   * Line item completeness score (0–100).
   * 100 = all line items have a non-zero line_total and their sum matches total_cost within 10%.
   * 0   = no line items extracted or all prices are zero.
   * Populated by validateAndNormalise after extraction.
   */
  line_item_completeness_score: number;
  /**
   * Sum of all line_item.line_total values (excluding null entries).
   * Used by stage-9 to detect unpriced components.
   */
  line_items_sum: number | null;
  /**
   * Discrepancy between line_items_sum and total_cost, as a percentage of total_cost.
   * Positive = line items sum exceeds total; negative = line items sum is less than total.
   * null when total_cost is null or no line items have prices.
   */
  line_items_sum_discrepancy_pct: number | null;
  /**
   * Components that were rejected by the hallucination guard during line item extraction.
   * Surfaced so the adjuster can manually review them.
   */
  rejected_line_items: Array<{ raw_name: string; raw_cost: number | null }>;
  /**
   * Quote type — distinguishes panel beater repair quotes from parts supplier quotes.
   * 'repair' = panel beater repair quote (default, used in composite optimisation).
   * 'parts_supplier' = parts-only quote (e.g. Sarjazz) — used for parts price verification
   *   but NOT included as a repairer column in the composite matrix.
   * 'assessor_adjusted' = assessor-modified version of a panel beater quote.
   */
  quote_type?: 'repair' | 'parts_supplier' | 'assessor_adjusted';
  /**
   * LLM-classified document category — the authoritative signal for whether this document
   * is a vehicle repair quote or a professional service fee.
   *
   * 'repair_quote'     = panel beater / body shop repair estimate (USE in L1 baseline)
   * 'parts_quote'      = parts supplier invoice/quote (e.g. Sarjazz) — NOT a repair quote
   * 'assessor_report'  = loss adjuster / assessor fee document (NOT a repair quote)
   * 'agreed_cost'      = insurer-agreed settlement amount document
   * 'other'            = any other document type
   *
   * Populated by the extraction engine at Stage 3. Defaults to 'repair_quote' when absent
   * (backward-compatible with pre-classification data).
   */
  document_category?: 'repair_quote' | 'parts_quote' | 'assessor_report' | 'agreed_cost' | 'other';
  /**
   * Set to true when this quote's line items were re-extracted via vision (Stage 9 self-healing).
   * Used internally to prevent double re-extraction passes.
   */
  _vision_reextracted?: boolean;
  /**
   * Set to true when this quote record was synthesised from a vision re-extraction pass
   * (i.e. the original OCR extraction had no line items and vision rebuilt it from scratch).
   */
  _synthetic_from_vision?: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a structured data extraction engine for vehicle repair quotations.

Your task is to convert unstructured repair quote text into a standard JSON object.

RULES — follow these exactly:
1. Extract the panel beater / repairer name if present.
2. Extract the total repair cost as a plain number (no currency symbols, no commas).
3. Identify the currency from the document text. Look for:
   - Currency symbols: $, R, K, P
   - Currency codes: USD, ZAR, ZMW, BWP, NAD, MZN, KES, TZS, UGX, MWK
   - Zimbabwe currencies:
     * USD — US Dollar (primary Zimbabwe currency)
     * ZiG or ZWG — Zimbabwe Gold (newer Zimbabwe currency, introduced 2024; the symbol
       "ZiG" appears in quotes; map this to currency code "ZWG")
     * ZWL — Zimbabwe Dollar (legacy; rarely seen but still valid)
   If no currency is stated in the document, return null for the currency field — do NOT guess or default.
   If you see "ZiG" in the document, return currency = "ZWG".
4. List every quoted component in both 'components' (names only) AND 'line_items' (with pricing).
   Normalise names to simple English:
   - "R/H tail lamp assembly" → "RHS tail lamp"
   - "Radiator support panel (upper)" → "radiator support panel"
   - "B/bar" → "front bumper" (bumper bar = front bumper in SA usage)
   - "F/bar" → "front bumper"
   - "R/B" or "R/bar" → "rear bumper"
   - "Q/P" → "quarter panel"
   - "W/screen" or "W/S" → "windscreen"
   - "A/P" → "A-pillar"
   - "Labour – panel repair" → do NOT include as a component; set labour_defined = true
5. For line_items: extract each component row from the quote table with its unit cost, quantity, and line total.
   - If a row shows "Rear bumper  R 1,200.00" → component="rear bumper", unit_cost=1200, quantity=1, line_total=1200
   - If quantity is not stated, default to 1.
   - If unit_cost is not stated but line_total is, set unit_cost = line_total / quantity.
   - Set action to "replace", "repair", "refinish", or "other" based on the row description.
   - C-10: If the row description IS a repair instruction phrase (not a component name), it belongs in the action field:
     * "Respray To Match", "Blend", "Polish", "Feather", "Wet Sand", "Buff", "Tint" → action="refinish", component=null (skip as standalone row)
     * "Strip & Fit", "Remove & Refit", "R&R" → action="replace", component=null (skip as standalone row)
     * "Panel Wipe", "Prep" → action="repair", component=null (skip as standalone row)
     * If a repair instruction appears on the SAME row as a component name, set it as the action for that component.
     * NEVER set component to a repair instruction phrase — component must always be a physical vehicle part.
   - If no itemised pricing exists (only a total), return an empty array for line_items.
   TWO-COLUMN QUOTE TABLES (very common in African repair shops):
   Many African repair quotes have TWO price columns: "SUPPLY & FIT" (full replacement) and "REPAIR" (repair only).
   The OCR often merges both column values into a single string next to the component name.
   Rules for two-column tables:
   a) When you see two numbers next to a component name (e.g. "L/R door  200 190"), the FIRST is supply-and-fit, the SECOND is repair-only.
   b) Use the FIRST number as unit_cost and line_total. Set action="replace".
   c) If the component row has a checkmark symbol (✓, L, レ, ✔) in one column, that column was selected. Use the price in that column.
   d) "Sundries", "Paint", "Sub Total", "VAT", "TOTAL" are special rows — extract their values as line items with action="other" for sundries/paint, and skip Sub Total/VAT/TOTAL rows (they are not components).
   e) Example OCR output: "4s tail lamp  200 190" → component="tail lamp", unit_cost=200, line_total=200, action="replace"
   f) Example: "Paint  2040" → component="paint", unit_cost=2040, line_total=2040, action="refinish"
   g) Example: "Sundries  30" → component="sundries", unit_cost=30, line_total=30, action="other"
   h) Example: "LIR door  45058" → this is OCR garble for "L/R door  450 58" → component="LR door", unit_cost=450, line_total=450, action="replace"
   THREE-COLUMN QUOTE TABLES (common in Southern African panel beaters):
   Some quotes have SEPARATE columns for Parts, Labour, and Paint/Spray costs per line item.
   The OCR text will show multiple numbers after a component name, e.g.:
   "Replace Front Bumper  1  1400.00  280.00  Strip 50.00"
   "Replace Front Windscreen  1  1300.00  Strip 50.00"
   Rules for three-column tables:
   a) The FIRST number after quantity is the Parts price (unit_cost).
   b) Subsequent numbers are Labour $/c and Paint/Spray $/c — ADD them all together for line_total.
   c) Example: "Replace Front Bumper  1  1400.00  280.00  50.00" → unit_cost=1400, line_total=1730 (1400+280+50)
   d) Example: "Replace Front Windscreen  1  1300.00  50.00" → unit_cost=1300, line_total=1350 (1300+50)
   e) Example: "Replace L/S Headlamp  1  1360.00  25.00" → unit_cost=1360, line_total=1385 (1360+25)
   f) If only one number appears (parts only, no labour/paint), unit_cost = line_total = that number.
   g) Words like "Strip", "S&A", "R&R" before a number indicate that number is a labour/strip cost — include it in line_total.
   FIVE-COLUMN QUOTE TABLES WITH VAT (MIAZ format — common in Zimbabwe, e.g. Swiss Motors, Grand Auto Premier):
   These quotes have columns: Item | Description | Quantity | Unit | Unit Price | Discount | VAT | Total
   CRITICAL: The 'Total' column is the ONLY authoritative line total. It already includes VAT. NEVER use 'Unit Price' as line_total.
   Rules for MIAZ five-column tables:
   a) line_total = value in the 'Total' column (rightmost price column). This is Unit Price × Qty − Discount + VAT.
   b) unit_cost = value in the 'Unit Price' column (NOT the Total column).
   c) Example row: "HEADLAMPS  2  EA  1310.00  0.00  393.00  2620.00" → component="headlamps", qty=2, unit_cost=1310, line_total=2620
   d) Example row: "AIRBAGS COMPLETE  1  EA  4350.00  0.00  652.50  4350.00" → component="airbags complete", qty=1, unit_cost=4350, line_total=4350
   e) Example row: "FRONT BUMPER  1  EA  1400.00  0.00  210.00  1400.00" → component="front bumper", qty=1, unit_cost=1400, line_total=1400
   f) The document footer shows Subtotal, Discount, VAT, and Total. Use the TOTAL (including VAT) as total_cost.
   g) Example footer: "Subtotal: 22220.00  VAT: 3333.00  Total: 25553.00" → total_cost=25553
   h) Do NOT skip VAT rows in the footer — use the grand Total as total_cost.
   i) If the image shows a MIAZ logo or 'Motor Industry Association of Zimbabwe', apply these rules.
   PROPORTIONAL FALLBACK: If you cannot parse individual line totals but the document total is known and there are N components,
   distribute the total proportionally across components using equal shares as a last resort.
   Set extraction_warnings to include "proportional_fallback_used" in that case.
6. For each line_item, also extract part_origin from the row description or surrounding text:
   - "OEM", "genuine", "original", "manufacturer" → "oem"
   - "aftermarket", "pattern", "non-genuine" → "aftermarket"
   - "reconditioned", "recon", "refurbished", "rebuilt" → "reconditioned"
   - "second hand", "used", "S/H", "SH", "secondhand" → "used"
   - If no part origin keyword is present → "unknown"
   Do NOT guess part origin — only extract it if explicitly stated in the quote text.
7. Do NOT infer or guess missing components.
8. Do NOT estimate any cost.
9. If a field cannot be found, return null (for strings/numbers) or false (for booleans).
10. Set confidence:
    - "high"   → total cost found, ≥ 3 components found, panel beater name found
    - "medium" → total cost found but < 3 components, or panel beater missing
    - "low"    → total cost missing or no components found
11. List any extraction issues in extraction_warnings (e.g. "total cost not found", "currency ambiguous").
12. Extract labour_cost and parts_cost as plain numbers when they appear as separate line items:
    - "Labour: $1,500" → labour_cost = 1500, labour_defined = true
    - "Parts: $3,200" → parts_cost = 3200, parts_defined = true
    - If only a total is given with no breakdown, set both to null.
    - IMPORTANT: labour_cost + parts_cost must not exceed total_cost by more than 5%.

OUTPUT — return ONLY valid JSON matching this schema exactly:
{
  "panel_beater": string | null,
  "total_cost": number | null,
  "currency": string,
  "document_category": "repair_quote" | "parts_quote" | "assessor_report" | "agreed_cost" | "other",
  "components": string[],
  "line_items": [{"component": string, "unit_cost": number|null, "quantity": number, "line_total": number|null, "action": string|null, "part_origin": "oem"|"aftermarket"|"reconditioned"|"used"|"unknown"}],
  "labour_defined": boolean,
  "parts_defined": boolean,
  "labour_cost": number | null,
  "parts_cost": number | null,
  "confidence": "high" | "medium" | "low",
  "extraction_warnings": string[]
}

For document_category, classify the document as follows:
- "repair_quote": A vehicle body shop / panel beater repair estimate. Contains itemised repair costs for vehicle parts and labour.
- "parts_quote": A parts supplier invoice or quote. Lists parts for sale, not repair services.
- "assessor_report": A loss adjuster, assessor, or surveyor fee invoice. The issuer is a professional assessor, not a repairer. Examples: National Loss Adjusters, ABC Assessors, XYZ Surveyors.
- "agreed_cost": An insurer-agreed settlement amount or cost agreement document.
- "other": Any document that does not fit the above categories.
IMPORTANT: An assessor fee invoice is NOT a repair quote even if it references vehicle damage. Classify by the nature of the issuing company and the type of charges, not by the subject matter.`;

// ─── Main extraction function ─────────────────────────────────────────────────

/**
 * extractQuoteFromText
 *
 * Calls the LLM to extract a structured quote from raw text.
 * Returns a typed ExtractedQuote or a safe null-filled fallback on failure.
 */
export async function extractQuoteFromText(
  rawText: string,
  contextHint?: string,
  /** ISO 3166-1 alpha-2 tenant country code — used to derive default currency when not found in document */
  tenantCountry?: string | null
): Promise<ExtractedQuote> {
  if (!rawText || rawText.trim().length < 10) {
    return buildFallback("Input text is empty or too short to extract a quote.");
  }

  const userContent = contextHint
    ? `Document context: ${contextHint}\n\nRaw quote text:\n${rawText}`
    : `Raw quote text:\n${rawText}`;

  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "extracted_quote",
          strict: true,
          schema: {
            type: "object",
            properties: {
              panel_beater: { type: ["string", "null"], description: "Name of the panel beater or repairer" },
              total_cost: { type: ["number", "null"], description: "Total repair cost as a plain number" },
              currency: { type: "string", description: "Currency code, e.g. USD, ZWL, ZAR" },
              document_category: {
                type: "string",
                enum: ["repair_quote", "parts_quote", "assessor_report", "agreed_cost", "other"],
                description: "Classification of the document type. repair_quote = panel beater repair estimate. assessor_report = loss adjuster/assessor fee invoice. parts_quote = parts supplier. agreed_cost = insurer settlement. other = anything else."
              },
              components: {
                type: "array",
                items: { type: "string" },
                description: "Normalised list of quoted components"
              },
              line_items: {
                type: "array",
                description: "Itemised line items with per-component pricing. Empty array if quote is not itemised.",
                items: {
                  type: "object",
                  properties: {
                    component: { type: "string", description: "Normalised component name" },
                    unit_cost: { type: ["number", "null"], description: "Unit cost as a plain number. Null if not stated." },
                    quantity: { type: "number", description: "Quantity, default 1 if not stated" },
                    line_total: { type: ["number", "null"], description: "Line total = unit_cost x quantity. Null if unit_cost is null." },
                    action: { type: ["string", "null"], description: "Repair action: repair, replace, refinish, or other" },
                    part_origin: {
                      type: "string",
                      enum: ["oem", "aftermarket", "reconditioned", "used", "unknown"],
                      description: "Part origin inferred from quote text. Use 'unknown' when not stated."
                    }
                  },
                  required: ["component", "unit_cost", "quantity", "line_total", "action", "part_origin"],
                  additionalProperties: false
                }
              },
              labour_defined: { type: "boolean", description: "True if labour cost is explicitly stated" },
              parts_defined: { type: "boolean", description: "True if parts cost is explicitly stated" },
              labour_cost: { type: ["number", "null"], description: "Actual labour cost as a plain number (same currency as total_cost). Null if not itemised." },
              parts_cost: { type: ["number", "null"], description: "Actual parts cost as a plain number (same currency as total_cost). Null if not itemised." },
              confidence: {
                type: "string",
                enum: ["high", "medium", "low"],
                description: "Extraction confidence level"
              },
              extraction_warnings: {
                type: "array",
                items: { type: "string" },
                description: "List of extraction issues or ambiguities"
              }
            },
            required: [
              "panel_beater",
              "total_cost",
              "currency",
              "document_category",
              "components",
              "line_items",
              "labour_defined",
              "parts_defined",
              "labour_cost",
              "parts_cost",
              "confidence",
              "extraction_warnings"
            ],
            additionalProperties: false
          }
        }
      }
    });

    const raw = response?.choices?.[0]?.message?.content;
    if (!raw) {
      return buildFallback("LLM returned empty response.");
    }

    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    const result = validateAndNormalise(parsed);
    // Apply tenant-country default currency if the document did not state one
    if (!result.currency && tenantCountry) {
      result.currency = getDefaultCurrencyForCountry(tenantCountry);
    }
    return result;

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return buildFallback(`LLM call failed: ${msg}`);
  }
}

// ─── Multi-quote extraction ───────────────────────────────────────────────────

/**
 * extractMultipleQuotes
 *
 * When a document contains multiple quotes (e.g. three panel beater quotes
 * submitted to an assessor), extract each one independently.
 *
 * Returns an array of ExtractedQuote objects, one per quote block.
 */
export async function extractMultipleQuotes(
  rawText: string,
  contextHint?: string,
  /** ISO 3166-1 alpha-2 tenant country code — used to derive default currency when not found in document */
  tenantCountry?: string | null
): Promise<ExtractedQuote[]> {
  // Step 1: Try structural splitting first (fast, no LLM cost)
  const blocks = splitQuoteBlocks(rawText);
  if (blocks.length > 1) {
    // Structural split found multiple blocks — extract each one
    const results: ExtractedQuote[] = [];
    for (const block of blocks) {
      const result = await extractQuoteFromText(block, contextHint, tenantCountry);
      results.push(result);
    }
    return results;
  }

  // Step 2: Structural split found only one block.
  // Use LLM to detect if the document actually contains multiple distinct repair quotes
  // (e.g. two separate company letterheads concatenated without separator lines).
  // This handles the common case where a claim PDF contains 2-3 panel beater quotes
  // as separate pages but the OCR text has no structural separators between them.
  //
  // Strategy: divide the document into equal contiguous windows and take the first
  // WINDOW_CHARS chars of each window. This guarantees NO gaps — every part of the
  // document is represented. The previous sparse-sampling approach created a gap
  // between head (0–4000) and mid1 (~6000+) that swallowed Cedric Jonker at char 5227.
  const buildDetectionSample = (text: string): string => {
    const MAX_TOTAL = 24000; // total budget sent to detection LLM
    if (text.length <= MAX_TOTAL) return text;
    const WINDOW_CHARS = 3000; // chars taken from each window
    const NUM_WINDOWS = Math.floor(MAX_TOTAL / WINDOW_CHARS); // 8 windows
    const windowSize = Math.floor(text.length / NUM_WINDOWS);
    const parts: string[] = [];
    for (let i = 0; i < NUM_WINDOWS; i++) {
      const start = i * windowSize;
      parts.push(text.slice(start, start + WINDOW_CHARS));
    }
    return parts.join('\n...');
  };
  const detectionSample = buildDetectionSample(rawText);

  plog(`[QuoteExtraction] allText length=${rawText.length} chars. Building detection sample...`);
  let detectedRepairers: string[] = [];
  try {
    const detectionResponse = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are a document analyser. Your ONLY job is to identify all distinct VEHICLE REPAIR QUOTATIONS or PARTS QUOTES in the provided text and list the company/repairer name for each one.

A distinct repair quotation is identified by:
- A different panel beater, body shop, or parts supplier company name, letterhead, or trading name
- A separate set of repair line items (parts, labour, paint) with its own total
- A different address, phone number, VAT/registration number, or quote reference number

Include: panel beater repair quotes, body shop quotes, parts supplier quotes (e.g. Sarjazz, parts dealers).
Each distinct company = one entry.

EXCLUDE the following — these are NOT repair quotes:
- Loss adjusters, assessors, surveyors, or appraisers (e.g. "National Loss Adjusters", "ABC Assessors", "XYZ Surveyors") — these issue professional fee invoices, NOT vehicle repair quotes
- Insurance companies or brokers
- Towing companies (unless they also quote for repairs)
- Any document that is clearly a professional service fee invoice rather than a vehicle repair estimate

IMPORTANT — DO NOT confuse brand names or product names with company names:
- Brand names on parts (e.g. "Speedo", "Toyota", "Isuzu", "Bosch", "NGK", "Monroe") are NOT companies — ignore them.
- Only extract names that appear as a LETTERHEAD, TRADING NAME, or COMPANY HEADER at the top of a quote section.
- A valid repair company name is typically followed by an address, phone number, VAT/registration number, or quote reference number.
- If a name appears only in a parts description or line item, it is a brand name — do NOT include it.

Return ONLY a JSON object with a single field "repairers" — an array of company name strings, one per distinct repair quote.
If there is only one repair quote, return a single-element array.
If you cannot identify any repair company names, return an empty array.
Do NOT extract prices, line items, or any other data — only company names.`,
        },
        {
          role: "user",
          content: `Document text (sampled across full document):\n\n${detectionSample}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "repairer_detection",
          strict: true,
          schema: {
            type: "object",
            properties: {
              repairers: {
                type: "array",
                items: { type: "string" },
                description: "List of distinct repairer/company names found in the document, one per quote",
              },
            },
            required: ["repairers"],
            additionalProperties: false,
          },
        },
      },
    });
    const raw = detectionResponse?.choices?.[0]?.message?.content;
    if (raw) {
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (Array.isArray(parsed?.repairers) && parsed.repairers.length > 0) {
        detectedRepairers = parsed.repairers.map((r: unknown) => String(r).trim()).filter(Boolean);
      }
      plog(`[QuoteExtraction] Detection LLM returned repairers: ${JSON.stringify(detectedRepairers)}`);
    }
  } catch (detErr) {
    plog(`[QuoteExtraction] Detection LLM failed: ${detErr} — falling back to single extraction`);
  }

  if (detectedRepairers.length <= 1) {
    plog(`[QuoteExtraction] Only ${detectedRepairers.length} repairer(s) detected — running single extraction`);
    const single = await extractQuoteFromText(rawText, contextHint, tenantCountry);
    return [single];
  }
  plog(`[QuoteExtraction] ${detectedRepairers.length} repairers detected — extracting each: ${detectedRepairers.join(', ')}`);

  // Step 3: Multiple repairers detected — extract each one by name.
  // For each repairer, find their section using the NEXT repairer's position as the
  // natural end boundary. This guarantees the full quote is included regardless of
  // length — a fixed window (e.g. 8000 chars) truncates large MIAZ-format quotes
  // with 20+ line items, causing the LLM to extract 0 line items.
  //
  // Sort repairers by their position in the text so we can use adjacent positions.
  const repairerPositions: Array<{ name: string; idx: number }> = detectedRepairers.map(name => {
    const idx = rawText.toLowerCase().indexOf(name.toLowerCase());
    return { name, idx: idx === -1 ? 0 : idx };
  }).sort((a, b) => a.idx - b.idx);

  const findRepairerWindow = (text: string, name: string): string => {
    const pos = repairerPositions.find(p => p.name === name);
    if (!pos) return text.slice(0, 20000);
    const start = Math.max(0, pos.idx - 500); // small look-back for letterhead
    // End = start of the NEXT repairer (natural boundary), capped at 25000 chars
    const nextPos = repairerPositions.find(p => p.idx > pos.idx);
    const naturalEnd = nextPos ? nextPos.idx : text.length;
    const end = Math.min(text.length, naturalEnd, pos.idx + 25000);
    return text.slice(start, end);
  };

  // Extract all repairers in parallel — each window is independent, so concurrent LLM calls
  // cut Stage 3 time from ~30s (3 × 10s sequential) to ~10s (all at once).
  const extractResults = await Promise.allSettled(
    detectedRepairers.map(async (repairerName) => {
      const repairerWindow = findRepairerWindow(rawText, repairerName);
      const nameIdx = rawText.toLowerCase().indexOf(repairerName.toLowerCase());
      plog(`[QuoteExtraction] Repairer "${repairerName}": found at idx=${nameIdx}, window=${repairerWindow.length} chars`);
      const result = await extractQuoteFromText(
        repairerWindow,
        `Extract ONLY the quote from "${repairerName}". This text is a targeted excerpt from the section of the document containing this repairer's quote.`,
        tenantCountry
      );
      // Override panel_beater with the detected name if LLM returned null
      if (!result.panel_beater) {
        result.panel_beater = repairerName;
      }
      // Auto-classify quote type based on company name heuristics
      if (!result.quote_type) {
        const nameLower = repairerName.toLowerCase();
        const isPartsSupplier = /sarjazz|parts|spares|accessories|auto parts|motor parts|spare parts|parts dealer|parts supply|parts world|parts centre|parts center|parts hub/.test(nameLower);
        result.quote_type = isPartsSupplier ? 'parts_supplier' : 'repair';
      }
      // Fallback document_category classifier — only applies when the LLM did not classify
      // (i.e. document_category is undefined, which happens for quotes extracted from legacy
      // data before this field was added, or when the LLM omitted it).
      if (!result.document_category) {
        const nameLower = repairerName.toLowerCase();
        const isAssessor = /adjuster|assessor|loss adjust|surveyor|inspection|valuation|apprais/.test(nameLower);
        const isPartsOnly = /sarjazz|parts|spares|accessories|auto parts|motor parts|spare parts|parts dealer|parts supply|parts world|parts centre|parts center|parts hub/.test(nameLower);
        if (isAssessor) {
          result.document_category = 'assessor_report';
        } else if (isPartsOnly || result.quote_type === 'parts_supplier') {
          result.document_category = 'parts_quote';
        } else {
          result.document_category = 'repair_quote';
        }
      }
      plog(`[QuoteExtraction] Extracted "${repairerName}": panel_beater=${result.panel_beater}, total=${result.total_cost}, line_items=${result.line_items.length}`);
      return result;
    })
  );
  const results: ExtractedQuote[] = [];
  for (let i = 0; i < extractResults.length; i++) {
    const r = extractResults[i];
    if (r.status === 'fulfilled') {
      results.push(r.value);
    } else {
      plog(`[QuoteExtraction] Extraction failed for "${detectedRepairers[i]}": ${r.reason}`);
    }
  }

  // If all per-repairer extractions failed, fall back to single extraction
  if (results.length === 0) {
    const single = await extractQuoteFromText(rawText, contextHint, tenantCountry);
    return [single];
  }

  // Final deduplication: remove duplicate panel beaters using fuzzy name matching.
  // The LLM may detect the same repairer under slightly different names (e.g.
  // "Cedric Jonker" and "Cedric Jonker Spraypaints"). Keep the version with more
  // priced line items; if equal, keep the one with the higher total_cost.
  // Resolve "X T/A Y" or "X Trading As Y" → "Y" before normalising.
  // This prevents "Kingfisher Auto Motors T/A Grand Auto Premier" and
  // "Grand Auto Premier" from being treated as different companies.
  const resolveTa = (name: string): string => {
    const m = name.match(/\bT\/A\b|\btrading\s+as\b/i);
    if (m && m.index !== undefined) return name.slice(m.index + m[0].length).trim();
    return name;
  };
  // Returns the raw T/A suffix (after "T/A" or "Trading As") without stripping stop-words,
  // so we can do prefix matching even when the LLM truncated the trading name.
  const getTaSuffix = (name: string): string | null => {
    const m = name.match(/\bT\/A\b|\btrading\s+as\b/i);
    if (m && m.index !== undefined)
      return name.slice(m.index + m[0].length).trim().toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
    return null;
  };
  const normName = (name: string): string =>
    resolveTa(name).toLowerCase()
      .replace(/\b(spraypaints?|spray paint|auto|motors?|panel|beaters?|body|works?|repairs?|services?|cc|pty|ltd|\(pty\)|\(cc\)|\.)/gi, '')
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  const fuzzyMatch = (a: string, b: string): boolean => {
    const na = normName(a);
    const nb = normName(b);
    if (!na || !nb) return false;
    if (na === nb) return true;
    if (na.startsWith(nb) || nb.startsWith(na)) return true;
    const ta = na.split(' ').filter(t => t.length > 1);
    const tb = nb.split(' ').filter(t => t.length > 1);
    const overlap = ta.filter(t => tb.includes(t)).length;
    const minLen = Math.min(ta.length, tb.length);
    if (minLen > 0 && overlap / minLen >= 0.6) return true;
    // T/A suffix prefix check — handles LLM truncation of the trading name.
    // e.g. LLM extracts "KINGFISHER T/A GRAND AUT" (truncated) instead of
    // "KINGFISHER T/A GRAND AUTO PREMIER". The suffix "grand aut" is a prefix
    // of the plain name "grand auto premier", so we correctly identify them as
    // the same company even when the T/A suffix was cut short.
    const suffixA = getTaSuffix(a);
    const suffixB = getTaSuffix(b);
    const plainB = b.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
    const plainA = a.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
    if (suffixA && (plainB.startsWith(suffixA) || suffixA.startsWith(plainB.split(' ').slice(0, 2).join(' ')))) return true;
    if (suffixB && (plainA.startsWith(suffixB) || suffixB.startsWith(plainA.split(' ').slice(0, 2).join(' ')))) return true;
    return false;
  };
  const deduped: ExtractedQuote[] = [];
  for (const r of results) {
    const existingIdx = deduped.findIndex(d => fuzzyMatch(r.panel_beater ?? '', d.panel_beater ?? ''));
    if (existingIdx >= 0) {
      const existing = deduped[existingIdx];
      const rPriced = (r.line_items ?? []).filter(li => (li.line_total ?? 0) > 0).length;
      const ePriced = (existing.line_items ?? []).filter(li => (li.line_total ?? 0) > 0).length;
      if (rPriced > ePriced || (rPriced === ePriced && (r.total_cost ?? 0) > (existing.total_cost ?? 0))) {
        deduped[existingIdx] = r; // replace with better version
      }
    } else {
      deduped.push(r);
    }
  }

  plog(`[QuoteExtraction] Dedup complete: ${results.length} → ${deduped.length} quotes. Final: ${deduped.map(d => d.panel_beater).join(', ')}`);
  return deduped;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * splitQuoteBlocks
 *
 * Attempts to split a document containing multiple quotes into individual
 * quote blocks using common separator patterns.
 */
function splitQuoteBlocks(text: string): string[] {
  // Common separators: "QUOTE 1", "Quote No.", "Panel Beater:", repeated dashes
  const separatorPattern = /(?:^|\n)(?:QUOTE\s*\d+|Quote\s*No\.?\s*\d+|Panel\s*Beater\s*:|-{10,}|={10,})/gim;
  const parts = text.split(separatorPattern).map(s => s.trim()).filter(s => s.length > 20);
  return parts.length > 1 ? parts : [text];
}

/**
 * validateAndNormalise
 *
 * Ensures the LLM output conforms to the ExtractedQuote contract.
 * Fixes common LLM deviations (e.g. cost returned as string).
 */
function validateAndNormalise(raw: Record<string, unknown>): ExtractedQuote {
  const warnings: string[] = Array.isArray(raw.extraction_warnings)
    ? (raw.extraction_warnings as string[])
    : [];

  // Coerce total_cost to number if LLM returned a string
  let totalCost: number | null = null;
  if (typeof raw.total_cost === "number") {
    totalCost = raw.total_cost;
  } else if (typeof raw.total_cost === "string") {
    const parsed = parseFloat((raw.total_cost as string).replace(/[^0-9.]/g, ""));
    if (!isNaN(parsed)) {
      totalCost = parsed;
      warnings.push("total_cost was returned as string — coerced to number");
    } else {
      warnings.push("total_cost string could not be parsed to number — set to null");
    }
  }

  // Normalise components
  // CRITICAL: Non-vehicle-part cost categories (sundries, paint, labour, VAT, etc.)
  // AND valid SA vehicle parts not yet in the dictionary must NEVER be silently dropped.
  // The guard now:
  //   1. Passes non-part categories through unconditionally (sundries, paint, labour, etc.)
  //   2. Resolves known vehicle parts via the dictionary
  //   3. Keeps unresolvable names with a warning instead of dropping them
  const components: string[] = Array.isArray(raw.components)
    ? (raw.components as string[])
        .map(c => {
          const rawC = String(c);
          const normalised = normaliseComponentName(rawC);
          // Non-part cost categories always pass through
          if (isNonPartLineItem(normalised) || isNonPartLineItem(rawC)) {
            return rawC.trim();
          }
          const resolved = resolveComponent(normalised);
          if (!resolved) {
            // Log for monitoring but KEEP the raw name — dropping it silently
            // causes cost gaps. The adjuster can review unresolved items.
            console.warn(`⚠️  Hallucination guard (quote components): could not resolve "${normalised}" (raw: "${rawC}") — keeping raw name`);
            return rawC.trim();
          }
          return resolved.name;
        })
        .filter((c): c is string => c !== null && c.length > 0)
    : [];

  // Extract and validate line_items
  const line_items: QuoteLineItem[] = [];
  const rejected_line_items: Array<{ raw_name: string; raw_cost: number | null }> = [];
  if (Array.isArray(raw.line_items)) {
    for (const item of raw.line_items as Record<string, unknown>[]) {
      if (!item || typeof item.component !== 'string') continue;
      const unitCost = typeof item.unit_cost === 'number' ? item.unit_cost : null;
      const qty = typeof item.quantity === 'number' && item.quantity > 0 ? item.quantity : 1;
      const lineTotal = typeof item.line_total === 'number' ? item.line_total
        : (unitCost !== null ? unitCost * qty : null);
      const rawComponentName = String(item.component);
      const _normalisedComponent = normaliseComponentName(rawComponentName);

      // ── Hallucination guard with non-part passthrough ─────────────────────
      // Non-vehicle-part cost categories (sundries, paint, labour, VAT, etc.)
      // are valid line items in a repair quote. They must NOT be rejected by
      // the vehicle parts dictionary guard — they pass through unconditionally.
      const isNonPart = isNonPartLineItem(_normalisedComponent) || isNonPartLineItem(rawComponentName);
      let resolvedName: string;
      let isNonPartCost = false;

      if (isNonPart) {
        // Non-vehicle-part cost category — pass through with original name
        resolvedName = rawComponentName.trim();
        isNonPartCost = true;
      } else {
        const _resolvedComponent = resolveComponent(_normalisedComponent);
        if (!_resolvedComponent) {
          // Not in taxonomy — apply semantic plausibility check before deciding
          const plausibility = isPlausiblePartName(rawComponentName);
          if (plausibility === 'implausible') {
            // Clear nonsense (random chars, pure number, etc.) — hard reject
            console.warn(`⚠️  Hallucination guard (quote line_items): hard-rejected "${_normalisedComponent}" (raw: "${rawComponentName}") — implausible`);
            rejected_line_items.push({ raw_name: rawComponentName, raw_cost: lineTotal });
            warnings.push(`line_item_rejected: "${rawComponentName}" failed semantic plausibility check`);
            continue;
          }
          // Plausible or uncertain — keep with raw name, flag for adjuster review
          console.warn(`⚠️  Hallucination guard (quote line_items): unresolved "${_normalisedComponent}" (raw: "${rawComponentName}") — plausibility=${plausibility}, keeping with is_unresolved=true`);
          warnings.push(`line_item_unresolved: "${rawComponentName}" not in vehicle parts catalogue — verify manually`);
          resolvedName = rawComponentName.trim();
          // Push with is_unresolved flag and continue (skip the normal resolvedName assignment below)
          const validOriginsUnresolved = ["oem", "aftermarket", "reconditioned", "used", "unknown"];
          const partOriginUnresolved = validOriginsUnresolved.includes(item.part_origin as string)
            ? (item.part_origin as "oem" | "aftermarket" | "reconditioned" | "used" | "unknown")
            : "unknown";
          line_items.push({
            component: resolvedName,
            unit_cost: unitCost,
            quantity: qty,
            line_total: lineTotal,
            action: typeof item.action === 'string' ? item.action : null,
            part_origin: partOriginUnresolved,
            is_unresolved: true,
          });
          continue;
        }
        resolvedName = _resolvedComponent.name;
      }

      const validOrigins = ["oem", "aftermarket", "reconditioned", "used", "unknown"];
      const partOrigin = validOrigins.includes(item.part_origin as string)
        ? (item.part_origin as "oem" | "aftermarket" | "reconditioned" | "used" | "unknown")
        : "unknown";
      line_items.push({
        component: resolvedName,
        unit_cost: unitCost,
        quantity: qty,
        line_total: lineTotal,
        action: typeof item.action === 'string' ? item.action : null,
        part_origin: partOrigin,
        is_non_part_cost: isNonPartCost || undefined,
      });
    }
  }

  // Derive confidence — always recompute from data to override LLM errors
  let confidence: "high" | "medium" | "low" = "low";
  const llmConfidence = raw.confidence;
  if (totalCost === null) {
    // No total cost → always low, regardless of LLM claim
    confidence = "low";
    if (llmConfidence !== "low") {
      warnings.push("confidence was recomputed from extracted data");
    }
  } else if (llmConfidence === "high" || llmConfidence === "medium" || llmConfidence === "low") {
    confidence = llmConfidence;
  } else {
    // LLM returned unexpected value — recompute
    if (totalCost !== null && components.length >= 3 && raw.panel_beater) {
      confidence = "high";
    } else if (totalCost !== null) {
      confidence = "medium";
    }
    warnings.push("confidence was recomputed from extracted data");
  }

  // Coerce labour_cost and parts_cost
  let labourCost: number | null = null;
  if (typeof raw.labour_cost === "number" && raw.labour_cost > 0) {
    labourCost = raw.labour_cost;
  } else if (typeof raw.labour_cost === "string") {
    const p = parseFloat((raw.labour_cost as string).replace(/[^0-9.]/g, ""));
    if (!isNaN(p) && p > 0) labourCost = p;
  }
  let partsCost: number | null = null;
  if (typeof raw.parts_cost === "number" && raw.parts_cost > 0) {
    partsCost = raw.parts_cost;
  } else if (typeof raw.parts_cost === "string") {
    const p = parseFloat((raw.parts_cost as string).replace(/[^0-9.]/g, ""));
    if (!isNaN(p) && p > 0) partsCost = p;
  }

  // Cross-validate: if both labour and parts are present, their sum should be ≤ total_cost
  if (labourCost !== null && partsCost !== null && totalCost !== null) {
    if (labourCost + partsCost > totalCost * 1.05) {
      warnings.push(`labour_cost (${labourCost}) + parts_cost (${partsCost}) exceeds total_cost (${totalCost}) by >5% — discarding breakdown`);
      labourCost = null;
      partsCost = null;
    }
  }

  // ── Line item completeness analysis ──────────────────────────────────────
  // Compute: sum of priced line items, discrepancy vs total, completeness score.
  // Non-part cost items (sundries, paint, labour) are INCLUDED in the sum because
  // they are real costs that contribute to the quote total.
  const pricedLineItems = line_items.filter(li => li.line_total !== null && li.line_total > 0);
  const unpricedLineItems = line_items.filter(li => li.line_total === null || li.line_total <= 0);
  const lineItemsSum = pricedLineItems.length > 0
    ? pricedLineItems.reduce((sum, li) => sum + (li.line_total ?? 0), 0)
    : null;

  let lineItemsSumDiscrepancyPct: number | null = null;
  if (lineItemsSum !== null && totalCost !== null && totalCost > 0) {
    lineItemsSumDiscrepancyPct = Math.round(((lineItemsSum - totalCost) / totalCost) * 1000) / 10;
    // Warn when discrepancy exceeds ±10%
    if (Math.abs(lineItemsSumDiscrepancyPct) > 10) {
      warnings.push(
        `line_items_sum_discrepancy: sum=${lineItemsSum.toFixed(2)} vs total=${totalCost.toFixed(2)} ` +
        `(${lineItemsSumDiscrepancyPct > 0 ? '+' : ''}${lineItemsSumDiscrepancyPct.toFixed(1)}%). ` +
        `${unpricedLineItems.length} unpriced line item(s) may account for the gap.`
      );
    }
  }

  // Completeness score (0–100):
  //   100 = all items priced AND sum matches total within 10%
  //    75 = all items priced but sum doesn't match total
  //    50 = some items priced
  //     0 = no items or no prices
  let lineItemCompletenessScore = 0;
  if (line_items.length === 0) {
    lineItemCompletenessScore = 0; // No line items extracted
  } else if (unpricedLineItems.length === 0 && pricedLineItems.length > 0) {
    // All items priced
    if (lineItemsSumDiscrepancyPct !== null && Math.abs(lineItemsSumDiscrepancyPct) <= 10) {
      lineItemCompletenessScore = 100; // All priced + sum matches
    } else {
      lineItemCompletenessScore = 75; // All priced but sum doesn't match
    }
  } else if (pricedLineItems.length > 0) {
    // Some items priced
    const pricedRatio = pricedLineItems.length / line_items.length;
    lineItemCompletenessScore = Math.round(50 * pricedRatio);
  }

  if (unpricedLineItems.length > 0) {
    warnings.push(
      `${unpricedLineItems.length} line item(s) have no price: ` +
      unpricedLineItems.map(li => `"${li.component}"`).join(", ")
    );
  }

  if (rejected_line_items.length > 0) {
    warnings.push(
      `${rejected_line_items.length} line item(s) rejected by hallucination guard: ` +
      rejected_line_items.map(r => `"${r.raw_name}"${r.raw_cost !== null ? ` (cost: ${r.raw_cost})` : ''}`).join(", ") +
      `. Manual review recommended.`
    );
  }

  // Validate and preserve document_category from LLM output
  const VALID_DOC_CATEGORIES = new Set(['repair_quote', 'parts_quote', 'assessor_report', 'agreed_cost', 'other']);
  const rawDocCategory = raw.document_category;
  const document_category = (typeof rawDocCategory === 'string' && VALID_DOC_CATEGORIES.has(rawDocCategory))
    ? rawDocCategory as ExtractedQuote['document_category']
    : undefined; // undefined = not yet classified; Stage 3 post-processor will apply fallback

  return {
    panel_beater: typeof raw.panel_beater === "string" ? raw.panel_beater : null,
    total_cost: totalCost,
    // Currency: use what the LLM extracted from the document. If null, the caller
    // (extractQuoteFromText) will apply the tenant-country default.
    currency: typeof raw.currency === "string" && raw.currency.length > 0 ? raw.currency.toUpperCase() : null,
    document_category,
    components,
    line_items,
    labour_defined: raw.labour_defined === true,
    parts_defined: raw.parts_defined === true,
    labour_cost: labourCost,
    parts_cost: partsCost,
    confidence,
    extraction_warnings: warnings,
    line_item_completeness_score: lineItemCompletenessScore,
    line_items_sum: lineItemsSum,
    line_items_sum_discrepancy_pct: lineItemsSumDiscrepancyPct,
    rejected_line_items,
  };
}

/**
 * normaliseComponentName
 *
 * Converts common shorthand and abbreviations to plain English component names.
 */
function normaliseComponentName(raw: string): string {
  const name = raw.trim();
  const map: [RegExp, string][] = [
    // SA panel-beater shorthands
    // B/bar = bumper bar = front bumper (NOT rear bumper)
    [/\bB\/bar\b/i, "front bumper"],
    [/\bF\/bar\b/i, "front bumper"],
    [/\bR\/bar\b/i, "rear bumper"],
    [/\bR\/B\b/i, "rear bumper"],
    [/\bF\/B\b/i, "front bumper"],
    [/\bQ\/P\b/i, "quarter panel"],
    [/\bA\/P\b/i, "a-pillar"],
    [/\bW\/screen\b/i, "windscreen"],
    [/\bW\/S\b/i, "windscreen"],
    [/\bA\/bag\b/i, "airbag"],
    // Side direction shorthands (must come before R/H, L/H to avoid double-replace)
    [/\bR\/H\b/i, "RHS"],
    [/\bL\/H\b/i, "LHS"],
    [/\bR\/F\b/i, "right front"],
    [/\bL\/F\b/i, "left front"],
    [/\bR\/R\b/i, "right rear"],
    [/\bL\/R\b/i, "left rear"],
    // SA headlamp terminology → resolveComponent alias
    [/\bLHS\s+headlamp\b/i, "left headlamp"],
    [/\bRHS\s+headlamp\b/i, "right headlamp"],
    [/\bLH\s+headlamp\b/i, "left headlamp"],
    [/\bRH\s+headlamp\b/i, "right headlamp"],
    [/\bL\/S\s+headlamp\b/i, "left headlamp"],
    [/\bR\/S\s+headlamp\b/i, "right headlamp"],
    // Sliding door (ISUZU MUX, Toyota HiAce, etc.)
    [/\bLHS\s+slide\b/i, "lhs sliding door"],
    [/\bRHS\s+slide\b/i, "rhs sliding door"],
    [/\bL\/S\s+slide\b/i, "lhs sliding door"],
    [/\bR\/S\s+slide\b/i, "rhs sliding door"],
    // Lower control arm (SA suspension terminology)
    [/\bLHS\s+lower\s+control\s+arm\b/i, "LH lower arm"],
    [/\bRHS\s+lower\s+control\s+arm\b/i, "RH lower arm"],
    [/\blower\s+control\s+arm\b/i, "front control arm"],
    // O/S/C = On-Site/Calibration (A/C service)
    [/\bO\/S\/C\s+regas\b/i, "aircon regas"],
    [/\bO\/S\/C\s+reprogram\b/i, "aircon reprogram"],
    [/\bOSC\s+regas\b/i, "aircon regas"],
    [/\bOSC\s+reprogram\b/i, "aircon reprogram"],
    // Airbag shorthand
    [/\bdriver\s+a\/bag\b/i, "driver airbag"],
    [/\bpassenger\s+a\/bag\b/i, "passenger airbag"],
    [/\bknee\s+a\/bag\b/i, "knee airbag"],
    // Seat belt + stalk (common SA quote format)
    [/\bseat\s+belt\s*\+\s*stalk\b/i, "seat belt"],
    [/\bseat\s+belt\+\s*stalk\b/i, "seat belt"],
    // Rad support
    [/\bRad\s+support\b/i, "radiator support panel"],
    [/\bRad\b/i, "radiator"],
    [/\bGrille\b/i, "grille"],
    [/\(upper\)/i, ""],
    [/\(lower\)/i, ""],
    [/\(assembly\)/i, ""],
    [/assembly$/i, ""],
    [/\s{2,}/g, " "],
  ];
  let result = name;
  for (const [pattern, replacement] of map) {
    result = result.replace(pattern, replacement);
  }
  return result.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * extractQuoteFromPdfVision
 *
 * Vision-based fallback: sends the PDF directly to the LLM as a file_url so it
 * can read the pricing table visually. Called when text-based extraction returns
 * a quote with a non-zero total but all-zero line item prices — which indicates
 * the OCR missed the price column (common with scanned/image-based PDFs).
 *
 * @param pdfUrl     Publicly accessible URL to the PDF document
 * @param panelBeater Panel beater name already known from text extraction (used as context hint)
 * @param totalCost  Known total cost from text extraction (used to validate vision result)
 * @param tenantCountry ISO 3166-1 alpha-2 country code for currency default
 */
export async function extractQuoteFromPdfVision(
  pdfUrl: string,
  panelBeater: string | null,
  totalCost: number | null,
  tenantCountry?: string | null
): Promise<ExtractedQuote> {
  try {
    const contextHint = panelBeater
      ? `This is a repair quotation from ${panelBeater}. The total cost is approximately ${totalCost ?? 'unknown'}. Extract ALL line items with their individual prices.`
      : `This is a vehicle repair quotation. The total cost is approximately ${totalCost ?? 'unknown'}. Extract ALL line items with their individual prices.`;

    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: SYSTEM_PROMPT + `\n\nCRITICAL: This is a VISION extraction pass. The text-based extraction returned zero prices for all line items. You MUST read the pricing columns in the document visually and extract the actual dollar amounts. Do NOT return null or 0 for any line item that has a visible price in the document. If the total is known (${totalCost ?? 'unknown'}), use it to validate your extraction — the sum of line items should be close to the total.`,
        },
        {
          role: "user",
          content: [
            {
              type: "file_url" as const,
              file_url: {
                url: pdfUrl,
                mime_type: "application/pdf" as const,
              },
            },
            {
              type: "text" as const,
              text: contextHint + "\n\nExtract ALL repair quote line items from this PDF with their individual unit costs and line totals. Pay special attention to price columns — they may be in a separate column to the right of the component names. Return the complete structured quote JSON.",
            },
          ],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "extracted_quote",
          strict: true,
          schema: {
            type: "object",
            properties: {
              panel_beater: { type: ["string", "null"] },
              total_cost: { type: ["number", "null"] },
              currency: { type: "string" },
              components: { type: "array", items: { type: "string" } },
              line_items: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    component: { type: "string" },
                    unit_cost: { type: ["number", "null"] },
                    quantity: { type: "number" },
                    line_total: { type: ["number", "null"] },
                    action: { type: ["string", "null"] },
                    part_origin: { type: "string", enum: ["oem", "aftermarket", "reconditioned", "used", "unknown"] },
                  },
                  required: ["component", "unit_cost", "quantity", "line_total", "action", "part_origin"],
                  additionalProperties: false,
                },
              },
              labour_defined: { type: "boolean" },
              parts_defined: { type: "boolean" },
              labour_cost: { type: ["number", "null"] },
              parts_cost: { type: ["number", "null"] },
              confidence: { type: "string", enum: ["high", "medium", "low"] },
              extraction_warnings: { type: "array", items: { type: "string" } },
            },
            required: ["panel_beater", "total_cost", "currency", "components", "line_items", "labour_defined", "parts_defined", "labour_cost", "parts_cost", "confidence", "extraction_warnings"],
            additionalProperties: false,
          },
        },
      },
    });

    const raw = response?.choices?.[0]?.message?.content;
    if (!raw) return buildFallback("Vision extraction: LLM returned empty response.");

    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    const result = validateAndNormalise(parsed);
    if (!result.currency && tenantCountry) {
      result.currency = getDefaultCurrencyForCountry(tenantCountry);
    }
    // Tag this result as vision-extracted
    result.extraction_warnings.push("vision_extraction_used");
    console.log(`[QuoteExtractionEngine] Vision extraction complete: ${result.line_items.length} line items, total=${result.total_cost}, confidence=${result.confidence}`);
    return result;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return buildFallback(`Vision extraction failed: ${msg}`);
  }
}

/**
 * buildFallback
 *
 * Returns a safe null-filled ExtractedQuote with the given warning.
 */
function buildFallback(warning: string): ExtractedQuote {
  return {
    panel_beater: null,
    total_cost: null,
    currency: null,  // Caller applies tenant-country default
    components: [],
    line_items: [],
    labour_defined: false,
    parts_defined: false,
    labour_cost: null,
    parts_cost: null,
    confidence: "low",
    extraction_warnings: [warning],
    line_item_completeness_score: 0,
    line_items_sum: null,
    line_items_sum_discrepancy_pct: null,
    rejected_line_items: [],
  };
}

/**
 * extractQuoteFromImageUrl
 *
 * Extracts a repair quote from a single image URL (e.g. a scanned quote page
 * extracted from a PDF via pdfimages). This is the image-native counterpart to
 * extractQuoteFromPdfVision — instead of sending a PDF file_url, it sends an
 * image_url so the LLM can read the quote directly from the raster image.
 *
 * Use this when:
 *   - An embedded image in a PDF has been classified as 'quotation_scan'
 *   - The image contains a visible repair quote with line items and prices
 *   - The PDF text extraction (Stage 2 OCR) did not capture this quote
 *
 * @param imageUrl     S3 URL of the image to extract from
 * @param panelBeater  Optional hint for the repairer name (from image metadata or context)
 * @param totalCost    Optional hint for the total cost (from image metadata or context)
 * @param tenantCountry ISO-3166-1 alpha-2 country code for currency default
 */
export async function extractQuoteFromImageUrl(
  imageUrl: string,
  panelBeater: string | null,
  totalCost: number | null,
  tenantCountry?: string | null
): Promise<ExtractedQuote> {
  try {
    const contextHint = panelBeater
      ? `This is a scanned repair quotation image from ${panelBeater}.${
          totalCost ? ` The total cost is approximately ${totalCost}.` : ''
        } Extract ALL line items with their individual prices.`
      : `This is a scanned vehicle repair quotation image.${
          totalCost ? ` The total cost is approximately ${totalCost}.` : ''
        } Extract ALL line items with their individual prices.`;

    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content:
            SYSTEM_PROMPT +
            `\n\nCRITICAL: This is an IMAGE extraction pass. You are looking at a scanned repair quote image. ` +
            `Read the pricing columns visually and extract the actual amounts. ` +
            `Do NOT return null or 0 for any line item that has a visible price. ` +
            `If the total is known (${totalCost ?? "unknown"}), use it to validate — the sum of line items should be close to the total.`,
        },
        {
          role: "user",
          content: [
            {
              type: "image_url" as const,
              image_url: {
                url: imageUrl,
                detail: "high" as const,
              },
            },
            {
              type: "text" as const,
              text:
                contextHint +
                "\n\nExtract ALL repair quote line items from this image with their individual unit costs and line totals. " +
                "Pay special attention to price columns — they may be in a separate column to the right of the component names. " +
                "Also extract the panel beater / repairer name from the letterhead or header. " +
                "Return the complete structured quote JSON.",
            },
          ],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "extracted_quote",
          strict: true,
          schema: {
            type: "object",
            properties: {
              panel_beater: { type: ["string", "null"] },
              total_cost: { type: ["number", "null"] },
              currency: { type: "string" },
              components: { type: "array", items: { type: "string" } },
              line_items: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    component: { type: "string" },
                    unit_cost: { type: ["number", "null"] },
                    quantity: { type: "number" },
                    line_total: { type: ["number", "null"] },
                    action: { type: ["string", "null"] },
                    part_origin: {
                      type: "string",
                      enum: ["oem", "aftermarket", "reconditioned", "used", "unknown"],
                    },
                  },
                  required: ["component", "unit_cost", "quantity", "line_total", "action", "part_origin"],
                  additionalProperties: false,
                },
              },
              labour_defined: { type: "boolean" },
              parts_defined: { type: "boolean" },
              labour_cost: { type: ["number", "null"] },
              parts_cost: { type: ["number", "null"] },
              confidence: { type: "string", enum: ["high", "medium", "low"] },
              extraction_warnings: { type: "array", items: { type: "string" } },
            },
            required: [
              "panel_beater",
              "total_cost",
              "currency",
              "components",
              "line_items",
              "labour_defined",
              "parts_defined",
              "labour_cost",
              "parts_cost",
              "confidence",
              "extraction_warnings",
            ],
            additionalProperties: false,
          },
        },
      },
    });

    const raw = response?.choices?.[0]?.message?.content;
    if (!raw) return buildFallback("Image quote extraction: LLM returned empty response.");
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    const result = validateAndNormalise(parsed);
    if (!result.currency && tenantCountry) {
      result.currency = getDefaultCurrencyForCountry(tenantCountry);
    }
    // Tag this result as image-extracted
    result.extraction_warnings.push("image_extraction_used");
    console.log(
      `[QuoteExtractionEngine] Image extraction complete: ${result.line_items.length} line items, ` +
        `total=${result.total_cost}, panel_beater=${result.panel_beater}, confidence=${result.confidence}`
    );
    return result;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return buildFallback(`Image quote extraction failed: ${msg}`);
  }
}
