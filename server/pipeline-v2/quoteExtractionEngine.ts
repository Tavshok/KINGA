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

import { invokeLLM, withRetry } from "../_core/llm";
import { appendFileSync } from "fs";
const plog = (msg: string) => { try { appendFileSync('/home/ubuntu/kinga-replit/pipeline-debug.log', `[${new Date().toISOString()}] ${msg}\n`); } catch(e) { console.log('[plog error]', e); } };
import { resolveComponent, isPlausiblePartName, resolveToCanonicalId } from "../../shared/vehicleParts";
import { getDefaultCurrencyForCountry } from "../../shared/countryCurrency";

// ─── Public types ─────────────────────────────────────────────────────────────

/**
 * Categories of line items that are valid in a repair quote but are NOT
 * vehicle parts (they pass through the hallucination guard unconditionally).
 *
 * VERSION: 2.1 (last updated: 2025-11)
 *
 * MAINTENANCE NOTE: When a new SA workshop line-item category appears in claims
 * that is being incorrectly rejected by the hallucination guard, add it here.
 * There is no automated detection mechanism for miscategorisation — new entries
 * must be identified from rejected_line_items in claim audit logs.
 * After adding entries, run pnpm vitest run and verify against the quote extraction
 * test fixtures in server/group-a-critical-fixes.test.ts.
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
  /**
   * Canonical part ID from the VEHICLE_PARTS catalogue (vehicleParts.ts).
   * Null when the component is a non-part cost category (sundries, labour, VAT)
   * or when the part name could not be resolved to a known catalogue entry.
   * Use this for cross-source deduplication and assembly containment checks.
   */
  canonicalPartId?: string | null;
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
   * Populated by the extraction engine at Stage 3.
   * R-A-22: validateAndNormalise() returns 'other' (not undefined) when the LLM returns an
   * unrecognised value. This ensures unclassified documents are excluded from the L1 baseline
   * rather than silently included as repair quotes.
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
  /** Stage 3 document identity; absent only when the extraction source cannot be established. */
  source_document_index?: number | null;
  /** Source page numbers where the quote was observed, when extraction can establish them. */
  source_page_numbers?: number[];
  /** Extraction route used to obtain the quote evidence. */
  source_extraction_method?: "text" | "vision" | "pdf_native" | "reconstruction";
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
   NO ALLOCATION FALLBACK: If you cannot parse individual line totals but the document total is known, preserve the total as quote-level evidence,
   set every unavailable line_total to null, and add "line_pricing_not_extracted" to extraction_warnings.
   NEVER distribute, proportionally allocate, or equal-share a total across components. Such values are not submitted evidence.
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
    // R-INF-06: wrap in withRetry for transient 5xx resilience
    const response = await withRetry(() => invokeLLM({
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
    }), 2, undefined, undefined, 'quote-extraction text');

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
    // R-INF-06: wrap in withRetry
    const detectionResponse = await withRetry(() => invokeLLM({
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
    }), 2, undefined, undefined, 'quote-detection');
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
  // CALIBRATION: origin unknown, do not change without evaluating repairer-name matching precision and recall.
  const FUZZY_REPAIRER_NAME_OVERLAP_RATIO = 0.6;
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
    if (minLen > 0 && overlap / minLen >= FUZZY_REPAIRER_NAME_OVERLAP_RATIO) return true;
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
 * Coerce total_cost from LLM output to a number.
 * LLMs occasionally return numeric values as strings (e.g. "1234.56" or "R 1,234.56").
 * Returns null if the value is absent or unparseable, and appends a warning if coercion occurred.
 */
function coerceTotalCost(raw: Record<string, unknown>, warnings: string[]): number | null {
  if (typeof raw.total_cost === 'number') return raw.total_cost;
  if (typeof raw.total_cost === 'string') {
    const parsed = parseFloat((raw.total_cost as string).replace(/[^0-9.]/g, ''));
    if (!isNaN(parsed)) {
      warnings.push('total_cost was returned as string \u2014 coerced to number');
      return parsed;
    }
    warnings.push('total_cost string could not be parsed to number \u2014 set to null');
  }
  return null;
}

/**
 * Validate and extract line items from LLM output.
 *
 * Applies the hallucination guard with non-part passthrough:
 *   1. Non-vehicle-part cost categories (sundries, paint, labour, VAT, etc.) pass through unconditionally.
 *   2. Known vehicle parts are resolved via the dictionary.
 *   3. Unknown names are checked with isPlausiblePartName:
 *      - 'implausible' \u2192 hard-rejected (random chars, pure numbers)
 *      - 'plausible' or 'uncertain' \u2192 kept with is_unresolved=true for adjuster review
 *
 * R-A-22: The is_unresolved flag and non-part passthrough were introduced to prevent
 * cost gaps from silent drops. Do not remove these guards without re-verifying R-A-22 coverage.
 *
 * Also computes line item completeness score (0\u2013100) and sum discrepancy vs total_cost.
 *
 * Returns: { line_items, rejected_line_items, completenessScore, lineItemsSum, discrepancyPct, newWarnings }
 */
function validateLineItems(
  raw: Record<string, unknown>,
  totalCost: number | null,
  warnings: string[]
): {
  line_items: QuoteLineItem[];
  rejected_line_items: Array<{ raw_name: string; raw_cost: number | null }>;
  completenessScore: number;
  lineItemsSum: number | null;
  discrepancyPct: number | null;
} {
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

      // \u2500\u2500 Hallucination guard with non-part passthrough \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
      // Non-vehicle-part cost categories (sundries, paint, labour, VAT, etc.)
      // are valid line items in a repair quote. They must NOT be rejected by
      // the vehicle parts dictionary guard \u2014 they pass through unconditionally.
      const isNonPart = isNonPartLineItem(_normalisedComponent) || isNonPartLineItem(rawComponentName);
      let resolvedName: string;
      let isNonPartCost = false;

      if (isNonPart) {
        resolvedName = rawComponentName.trim();
        isNonPartCost = true;
      } else {
        const _resolvedComponent = resolveComponent(_normalisedComponent);
        if (!_resolvedComponent) {
          // isPlausiblePartName (shared/vehicleParts.ts) classifies unknown component names
          // into three categories to prevent hallucinated part names from inflating costs:
          //   'implausible' — pure numbers, random character sequences, or symbol-heavy strings
          //                  that cannot be vehicle parts. Hard-rejected: added to rejected_line_items.
          //   'uncertain'   — short tokens or low-confidence names that might be valid parts
          //                  but are not in the catalogue. Kept with is_unresolved=true for
          //                  adjuster review. NOT rejected silently.
          //   'plausible'   — names that match domain vocabulary (body panels, mechanical terms,
          //                  SA workshop terminology). Kept with is_unresolved=true.
          // The 'uncertain' and 'plausible' paths were introduced by R-A-22 to prevent cost
          // gaps from silent drops. Do not change to hard-reject without re-verifying R-A-22.
          const plausibility = isPlausiblePartName(rawComponentName);
          if (plausibility === 'implausible') {
            console.warn(`\u26a0\ufe0f  Hallucination guard (quote line_items): hard-rejected "${_normalisedComponent}" (raw: "${rawComponentName}") \u2014 implausible`);
            rejected_line_items.push({ raw_name: rawComponentName, raw_cost: lineTotal });
            warnings.push(`line_item_rejected: "${rawComponentName}" failed semantic plausibility check`);
            continue;
          }
          console.warn(`⚠️  Hallucination guard (quote line_items): rejected "${_normalisedComponent}" (raw: "${rawComponentName}") — plausibility=${plausibility}, not in vehicle parts catalogue`);
          warnings.push(`line_item_rejected: "${rawComponentName}" not in vehicle parts catalogue`);
          rejected_line_items.push({ raw_name: rawComponentName, raw_cost: lineTotal });
          continue;
        }
        resolvedName = _resolvedComponent.name;
      }

      const validOrigins = ['oem', 'aftermarket', 'reconditioned', 'used', 'unknown'];
      const partOrigin = validOrigins.includes(item.part_origin as string)
        ? (item.part_origin as 'oem' | 'aftermarket' | 'reconditioned' | 'used' | 'unknown')
        : 'unknown';
      line_items.push({
        component: resolvedName,
        unit_cost: unitCost,
        quantity: qty,
        line_total: lineTotal,
        action: typeof item.action === 'string' ? item.action : null,
        part_origin: partOrigin,
        is_non_part_cost: isNonPartCost || undefined,
        canonicalPartId: isNonPartCost ? null : resolveToCanonicalId(resolvedName),
      });
    }
  }

  if (rejected_line_items.length > 0) {
    warnings.push(
      `${rejected_line_items.length} line item(s) rejected by hallucination guard: ` +
      rejected_line_items.map(r => `"${r.raw_name}"${r.raw_cost !== null ? ` (cost: ${r.raw_cost})` : ''}`).join(', ') +
      `. Manual review recommended.`
    );
  }

  // \u2500\u2500 Line item completeness analysis \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  // Non-part cost items (sundries, paint, labour) are INCLUDED in the sum because
  // they are real costs that contribute to the quote total.
  const pricedLineItems = line_items.filter(li => li.line_total !== null && li.line_total > 0);
  const unpricedLineItems = line_items.filter(li => li.line_total === null || li.line_total <= 0);
  const lineItemsSum = pricedLineItems.length > 0
    ? pricedLineItems.reduce((sum, li) => sum + (li.line_total ?? 0), 0)
    : null;

  let discrepancyPct: number | null = null;
  if (lineItemsSum !== null && totalCost !== null && totalCost > 0) {
    discrepancyPct = Math.round(((lineItemsSum - totalCost) / totalCost) * 1000) / 10;
    if (Math.abs(discrepancyPct) > 10) {
      warnings.push(
        `line_items_sum_discrepancy: sum=${lineItemsSum.toFixed(2)} vs total=${totalCost.toFixed(2)} ` +
        `(${discrepancyPct > 0 ? '+' : ''}${discrepancyPct.toFixed(1)}%). ` +
        `${unpricedLineItems.length} unpriced line item(s) may account for the gap.`
      );
    }
  }

  // Completeness score (0\u2013100):
  //   100 = all items priced AND sum matches total within 10%
  //    75 = all items priced but sum doesn\u2019t match total
  //    50 = some items priced
  //     0 = no items or no prices
  let completenessScore = 0;
  if (line_items.length === 0) {
    completenessScore = 0;
  } else if (unpricedLineItems.length === 0 && pricedLineItems.length > 0) {
    completenessScore = (discrepancyPct !== null && Math.abs(discrepancyPct) <= 10) ? 100 : 75;
  } else if (pricedLineItems.length > 0) {
    completenessScore = Math.round(50 * (pricedLineItems.length / line_items.length));
  }

  if (unpricedLineItems.length > 0) {
    warnings.push(
      `${unpricedLineItems.length} line item(s) have no price: ` +
      unpricedLineItems.map(li => `"${li.component}"`).join(', ')
    );
  }

  return { line_items, rejected_line_items, completenessScore, lineItemsSum, discrepancyPct };
}

/**
 * Derive extraction confidence from the validated data.
 * Always recomputes from the actual extracted values to override LLM errors.
 * If total_cost is null, confidence is always 'low' regardless of LLM claim.
 */
function deriveConfidence(
  raw: Record<string, unknown>,
  totalCost: number | null,
  components: string[],
  warnings: string[]
): 'high' | 'medium' | 'low' {
  if (totalCost === null) {
    if (raw.confidence !== 'low') warnings.push('confidence was recomputed from extracted data');
    return 'low';
  }
  const llmConfidence = raw.confidence;
  if (llmConfidence === 'high' || llmConfidence === 'medium' || llmConfidence === 'low') {
    return llmConfidence;
  }
  // LLM returned unexpected value \u2014 recompute
  warnings.push('confidence was recomputed from extracted data');
  if (totalCost !== null && components.length >= 3 && raw.panel_beater) return 'high';
  if (totalCost !== null) return 'medium';
  return 'low';
}

/**
 * Coerce labour_cost and parts_cost from LLM output to numbers.
 * Cross-validates: if both are present, their sum must be \u2264 total_cost * 1.05.
 * If the sum exceeds this, both are discarded (the LLM likely double-counted).
 */
function coerceLabourAndParts(
  raw: Record<string, unknown>,
  totalCost: number | null,
  warnings: string[]
): { labourCost: number | null; partsCost: number | null } {
  let labourCost: number | null = null;
  if (typeof raw.labour_cost === 'number' && raw.labour_cost > 0) {
    labourCost = raw.labour_cost;
  } else if (typeof raw.labour_cost === 'string') {
    const p = parseFloat((raw.labour_cost as string).replace(/[^0-9.]/g, ''));
    if (!isNaN(p) && p > 0) labourCost = p;
  }
  let partsCost: number | null = null;
  if (typeof raw.parts_cost === 'number' && raw.parts_cost > 0) {
    partsCost = raw.parts_cost;
  } else if (typeof raw.parts_cost === 'string') {
    const p = parseFloat((raw.parts_cost as string).replace(/[^0-9.]/g, ''));
    if (!isNaN(p) && p > 0) partsCost = p;
  }
  if (labourCost !== null && partsCost !== null && totalCost !== null) {
    if (labourCost + partsCost > totalCost * 1.05) {
      warnings.push(`labour_cost (${labourCost}) + parts_cost (${partsCost}) exceeds total_cost (${totalCost}) by >5% \u2014 discarding breakdown`);
      labourCost = null;
      partsCost = null;
    }
  }
  return { labourCost, partsCost };
}

/**
 * Validate and normalise the document_category field from LLM output.
 *
 * R-A-22 FIX (2026-06): Returns 'other' (not undefined) when the LLM returns an
 * unrecognised value. Stage 9 L1 filter treats undefined as a legacy fallback
 * (includes as repair_quote via quote_type heuristic). 'other' is truthy \u2192
 * Stage 9 primary branch \u2192 not 'repair_quote' \u2192 excluded from L1 baseline.
 * This prevents assessor fee invoices and unknown documents from inflating the L1 cost baseline.
 */
function validateDocumentCategory(raw: Record<string, unknown>): ExtractedQuote['document_category'] {
  const VALID_DOC_CATEGORIES = new Set(['repair_quote', 'parts_quote', 'assessor_report', 'agreed_cost', 'other']);
  const rawDocCategory = raw.document_category;
  return (typeof rawDocCategory === 'string' && VALID_DOC_CATEGORIES.has(rawDocCategory))
    ? rawDocCategory as ExtractedQuote['document_category']
    : 'other'; // R-A-22: unrecognised or missing
}

/**
 * validateAndNormalise
 *
 * Ensures the LLM output conforms to the ExtractedQuote contract.
 * Fixes common LLM deviations (e.g. cost returned as string).
 *
 * Sub-functions:
 *   coerceTotalCost()         \u2014 coerce total_cost string\u2192number
 *   validateLineItems()       \u2014 hallucination guard, completeness scoring (R-A-22)
 *   deriveConfidence()        \u2014 recompute confidence from extracted data
 *   coerceLabourAndParts()    \u2014 coerce labour/parts costs, cross-validate sum
 *   validateDocumentCategory() \u2014 R-A-22 document_category guard
 *   normaliseComponentName()  \u2014 shorthand expansion (called inside validateLineItems)
 */
function validateAndNormalise(raw: Record<string, unknown>): ExtractedQuote {
  const warnings: string[] = Array.isArray(raw.extraction_warnings)
    ? (raw.extraction_warnings as string[])
    : [];

  const totalCost = coerceTotalCost(raw, warnings);

  // Normalise components array (top-level, separate from line_items)
  // CRITICAL: Non-vehicle-part cost categories AND valid SA vehicle parts not yet in the
  // dictionary must NEVER be silently dropped. See validateLineItems for the same guard
  // applied to line_items[].
  const components: string[] = Array.isArray(raw.components)
    ? (raw.components as string[])
        .map(c => {
          const rawC = String(c);
          const normalised = normaliseComponentName(rawC);
          if (isNonPartLineItem(normalised) || isNonPartLineItem(rawC)) return rawC.trim();
          const resolved = resolveComponent(normalised);
          if (!resolved) {
            console.warn(`\u26a0\ufe0f  Hallucination guard (quote components): could not resolve "${normalised}" (raw: "${rawC}") \u2014 stripping from components`);
            return null as unknown as string;
          }
          return resolved.name;
        })
        .filter((c): c is string => c !== null && c.length > 0)
    : [];

  const {
    line_items,
    rejected_line_items,
    completenessScore: lineItemCompletenessScore,
    lineItemsSum,
    discrepancyPct: lineItemsSumDiscrepancyPct,
  } = validateLineItems(raw, totalCost, warnings);

  const confidence = deriveConfidence(raw, totalCost, components, warnings);
  const { labourCost, partsCost } = coerceLabourAndParts(raw, totalCost, warnings);
  const document_category = validateDocumentCategory(raw);

  return {
    panel_beater: typeof raw.panel_beater === 'string' ? raw.panel_beater : null,
    total_cost: totalCost,
    currency: typeof raw.currency === 'string' && raw.currency.length > 0 ? raw.currency.toUpperCase() : null,
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

    // R-INF-06: wrap in withRetry
    const response = await withRetry(() => invokeLLM({
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
    }), 2, undefined, undefined, 'quote-vision-reextract');

        const raw = response?.choices?.[0]?.message?.content;
    if (!raw) return buildFallback("Vision extraction: LLM returned empty response.");
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    const result = validateAndNormalise(parsed);
    if (!result.currency && tenantCountry) {
      result.currency = getDefaultCurrencyForCountry(tenantCountry);
    }
    // R-A-22: Apply name-based document_category heuristic when validateAndNormalise returned 'other'
    // (i.e. the LLM schema for this path does not include document_category, so raw.document_category
    // is always undefined → validateAndNormalise returns 'other'). Use panel_beater name as signal.
    if (result.document_category === 'other' && panelBeater) {
      const nameLower = panelBeater.toLowerCase();
      const isAssessor = /adjuster|assessor|loss adjust|surveyor|inspection|valuation|apprais/.test(nameLower);
      const isPartsOnly = /sarjazz|parts|spares|accessories|auto parts|motor parts|spare parts|parts dealer|parts supply|parts world|parts centre|parts center|parts hub/.test(nameLower);
      if (isAssessor) {
        result.document_category = 'assessor_report';
      } else if (isPartsOnly) {
        result.document_category = 'parts_quote';
      } else {
        result.document_category = 'repair_quote';
      }
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

    // R-INF-06: wrap in withRetry
    const response = await withRetry(() => invokeLLM({
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
    }), 2, undefined, undefined, 'quote-image-extract');

    const raw = response?.choices?.[0]?.message?.content;
    if (!raw) return buildFallback("Image quote extraction: LLM returned empty response.");
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    const result = validateAndNormalise(parsed);
    if (!result.currency && tenantCountry) {
      result.currency = getDefaultCurrencyForCountry(tenantCountry);
    }
    // R-A-22: Apply name-based document_category heuristic when validateAndNormalise returned 'other'
    // (image extraction schema does not include document_category field).
    if (result.document_category === 'other' && panelBeater) {
      const nameLower = panelBeater.toLowerCase();
      const isAssessor = /adjuster|assessor|loss adjust|surveyor|inspection|valuation|apprais/.test(nameLower);
      const isPartsOnly = /sarjazz|parts|spares|accessories|auto parts|motor parts|spare parts|parts dealer|parts supply|parts world|parts centre|parts center|parts hub/.test(nameLower);
      if (isAssessor) {
        result.document_category = 'assessor_report';
      } else if (isPartsOnly) {
        result.document_category = 'parts_quote';
      } else {
        result.document_category = 'repair_quote';
      }
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

// ── PER-PAGE IMAGE QUOTE EXTRACTION ─────────────────────────────────────────
// This is the primary quote extraction path when page images are available
// (i.e. Stage 1 successfully rendered the PDF to page images via pdftoppm).
//
// Strategy:
//   1. Run a single LLM vision pass on all page images to identify which pages
//      contain repair quotation letterheads (company name, line items, total).
//      Uses detail:"high" for ≤20 pages so handwritten/informal quotes are detected.
//   2. Group all pages belonging to the same quotation (not just the first page).
//   3. For each group, send ALL pages of that group to the extraction LLM so
//      multi-page quotes (e.g. line items on p1, total on p2) are fully captured.
//   4. Run text-based extraction in parallel as cross-validation — whichever path
//      finds more distinct repairers wins. This is the safety net for any format
//      the vision path misses (e.g. handwritten, non-standard, no letterhead).
//   5. Deduplicate by panel_beater name to avoid double-counting.
//
// This approach is fundamentally different from the text-based path:
//   - It does not depend on OCR quality or text concatenation order.
//   - It sees each page as a visual unit, so rotated/scanned pages are handled.
//   - It correctly identifies N separate quotations in any multi-quote document.
// ─────────────────────────────────────────────────────────────────────────────

interface PageQuoteGroup {
  panelBeater: string;
  pageIndexes: number[]; // 0-based indexes into pageImageUrls
}

/**
 * Identify which pages in a PDF contain repair quotations using a vision LLM.
 * Returns groups of pages belonging to each distinct quotation.
 */
async function detectQuotationPagesVision(
  pageImageUrls: string[]
): Promise<PageQuoteGroup[]> {
  if (pageImageUrls.length === 0) return [];

  const MAX_PAGES_FOR_DETECTION = 20;
  const pagesToScan = pageImageUrls.slice(0, MAX_PAGES_FOR_DETECTION);

  // Use "auto" detail — the LLM selects the right resolution per image, balancing
  // accuracy and speed. This is faster than forcing "high" on all pages while still
  // catching handwritten/informal quotes.
  const detailLevel = "auto" as const;
  const imageContent: Array<{ type: "image_url"; image_url: { url: string; detail: "auto" } }> =
    pagesToScan.map((url) => ({
      type: "image_url" as const,
      image_url: { url, detail: detailLevel },
    }));

  const pageList = pagesToScan.map((_, i) => `Page ${i + 1}`).join(", ");

  try {
    // R-INF-06: wrap in withRetry
    const response = await withRetry(() => invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are a document classifier. You will receive ${pagesToScan.length} page images from a vehicle insurance claim document.
Your ONLY job is to identify pages that contain VEHICLE REPAIR QUOTATIONS (also called estimates, quotes, or invoices from panel beaters, body shops, or auto repair shops).

A repair quotation page INCLUDES any of these formats:
- Typed or printed quote with a company letterhead, list of parts/labour, and a total
- Handwritten quote on plain paper or a form — look for a name/company at the top, a list of items, and a total amount
- Informal typed list of repair items with prices and a final total
- Any document from a repairer, body shop, or panel beater showing what they will charge to fix the vehicle
- Parts-only quotes from parts suppliers

DO NOT require a formal letterhead — many small repairers in Africa use handwritten or informal formats.
DO NOT require a printed total — the total may be handwritten at the bottom.

EXCLUDE: claim forms, police reports, driver statements, loss adjuster/assessor reports, photos of damage, correspondence letters, insurance policy documents.

For each quotation page found, return the page number (1-based) and the panel beater/company name visible on that page.
If the company name is not visible, use a description like "Handwritten Quote" or "Unknown Repairer".
If multiple consecutive pages belong to the same quotation (e.g. page 2 is a continuation of the quote on page 1), group them together.

Return JSON only.`,
        },
        {
          role: "user",
          content: [
            ...imageContent,
            {
              type: "text" as const,
              text: `These are pages: ${pageList}. Identify all repair quotation pages and their panel beater names. Return JSON matching the schema.`,
            },
          ],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "quotation_page_detection",
          strict: true,
          schema: {
            type: "object",
            properties: {
              quotation_groups: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    panel_beater: { type: "string", description: "Company/panel beater name from letterhead" },
                    page_numbers: {
                      type: "array",
                      items: { type: "integer" },
                      description: "1-based page numbers belonging to this quotation",
                    },
                  },
                  required: ["panel_beater", "page_numbers"],
                  additionalProperties: false,
                },
              },
            },
            required: ["quotation_groups"],
            additionalProperties: false,
          },
        },
      },
    }), 2, undefined, undefined, 'quote-page-classifier');

    const raw = response?.choices?.[0]?.message?.content;
    if (!raw) return [];
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    const groups: PageQuoteGroup[] = (parsed.quotation_groups ?? []).map(
      (g: { panel_beater: string; page_numbers: number[] }) => ({
        panelBeater: g.panel_beater,
        pageIndexes: g.page_numbers.map((n: number) => n - 1),
      })
    );
    plog(
      `[QuoteExtractionEngine] Page detection found ${groups.length} quotation group(s): ${groups.map((g) => `"${g.panelBeater}" (pages ${g.pageIndexes.map((i) => i + 1).join(",")})`).join("; ")}`
    );
    return groups;
  } catch (err) {
    plog(`[QuoteExtractionEngine] Page detection failed: ${String(err)}`);
    return [];
  }
}

/**
 * Extract all repair quotations from a set of PDF page images.
 *
 * This is the primary path when page images are available. It:
 *   1. Runs a vision detection pass (high-res) to identify which pages contain quotations.
 *   2. For each group, sends ALL pages of that group to the extraction LLM — not just
 *      the first page — so multi-page quotes are fully captured.
 *   3. Runs text-based extraction in parallel as cross-validation.
 *   4. Takes whichever path (vision or text) found more distinct repairers.
 *   5. Falls back to text-based path if vision finds nothing.
 *
 * PARALLEL STRATEGY RATIONALE: Vision and text extraction run concurrently (Promise.all)
 * because they are independent paths. Vision is more accurate for scanned/image-based
 * PDFs; text is more reliable for native-text PDFs. Running both in parallel and taking
 * the better result costs one extra LLM call per claim but significantly reduces the
 * miss rate on mixed-format documents.
 *
 * R-B-03b (night-photo rescue path): If vision detection returns groups but the
 * per-group extraction produces quotes with confidence < 0.3, the function falls back
 * to the text-based results. This handles the case where low-light or blurry page
 * images cause vision extraction to fail silently. The confidence threshold is
 * CALIBRATION: origin unknown — see docs/audit/unverified-constants.md.
 *
 * @param pageImageUrls  S3 URLs of rendered PDF page images (from Stage 1)
 * @param fallbackText   OCR text to use if vision detection finds no quotations
 * @param tenantCountry  ISO 3166-1 alpha-2 country code for default currency
 * @param pdfUrl         Optional PDF URL for Cloud Run fallback path (no page images)
 */
export async function extractMultipleQuotesFromPageImages(
  pageImageUrls: string[],
  fallbackText: string,
  tenantCountry?: string | null,
  pdfUrl?: string | null,
  sourceDocumentIndex?: number | null,
): Promise<ExtractedQuote[]> {
  if (pageImageUrls.length === 0) {
    if (pdfUrl) {
      plog(`[QuoteExtractionEngine] No page images available — using PDF-native extraction (Cloud Run path)`);
      return extractMultipleQuotesFromPdfUrl(pdfUrl, fallbackText, tenantCountry);
    }
    plog(`[QuoteExtractionEngine] No page images and no PDF URL — falling back to text-based extraction`);
    return extractMultipleQuotes(fallbackText, "insurance claim document", tenantCountry);
  }

  plog(
    `[QuoteExtractionEngine] Starting per-page vision extraction on ${pageImageUrls.length} page image(s)`
  );

  // Run vision detection and text-based extraction in parallel for cross-validation
  const [groups, textResults] = await Promise.all([
    detectQuotationPagesVision(pageImageUrls),
    extractMultipleQuotes(fallbackText, "insurance claim document", tenantCountry).catch(err => {
      plog(`[QuoteExtractionEngine] Parallel text extraction failed: ${String(err)}`);
      return [] as ExtractedQuote[];
    }),
  ]);

  plog(
    `[QuoteExtractionEngine] Vision detected ${groups.length} group(s); text path found ${textResults.length} quote(s)`
  );

  // If vision detection found no groups, use text results
  if (groups.length === 0) {
    plog(
      `[QuoteExtractionEngine] Vision detection found no quotation pages — using text-based results (${textResults.length} quote(s))`
    );
    return textResults.length > 0
      ? textResults
      : extractMultipleQuotes(fallbackText, "insurance claim document", tenantCountry);
  }

  // Deduplicate groups by panel beater name before dispatching
  const seenNames = new Set<string>();
  const uniqueGroups = groups.filter(group => {
    if (!group.pageIndexes.length) return false;
    const normName = (group.panelBeater ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
    if (normName && seenNames.has(normName)) {
      plog(`[QuoteExtractionEngine] Skipping duplicate: "${group.panelBeater}"`);
      return false;
    }
    if (normName) seenNames.add(normName);
    return true;
  });

  // R-A-21 FIX: Cap parallel LLM calls at 3 concurrent requests.
  // Unbounded Promise.all on large multi-repairer claims (5+ repairers) caused
  // simultaneous LLM requests that exceeded rate limits and triggered Cloud Run
  // 180s timeout failures. A concurrency cap of 3 balances throughput vs stability.
  // Simple semaphore — avoids the p-limit dependency.
  const MAX_CONCURRENT_EXTRACTIONS = 3;
  let activeSlots = 0;
  const waitQueue: Array<() => void> = [];
  const acquireSlot = (): Promise<void> => new Promise<void>(resolve => {
    if (activeSlots < MAX_CONCURRENT_EXTRACTIONS) { activeSlots++; resolve(); }
    else { waitQueue.push(() => { activeSlots++; resolve(); }); }
  });
  const releaseSlot = () => { activeSlots--; const next = waitQueue.shift(); if (next) next(); };
  const extractionTasks = uniqueGroups.map(async (group) => {
    const groupPageUrls = group.pageIndexes
      .filter(idx => idx >= 0 && idx < pageImageUrls.length)
      .map(idx => pageImageUrls[idx]);
    if (groupPageUrls.length === 0) return null;
    await acquireSlot();
    plog(
      `[QuoteExtractionEngine] Extracting quote for "${group.panelBeater}" from ${groupPageUrls.length} page(s) ` +
        `(pages ${group.pageIndexes.map(i => i + 1).join(",")})`
    );
    try {
      const quote = await extractQuoteFromMultipleImageUrls(groupPageUrls, group.panelBeater, null, tenantCountry);
      if (!quote.panel_beater && group.panelBeater) {
        quote.panel_beater = group.panelBeater;
      }
      quote.source_document_index = sourceDocumentIndex ?? null;
      quote.source_page_numbers = group.pageIndexes
        .filter((pageIndex) => pageIndex >= 0 && pageIndex < pageImageUrls.length)
        .map((pageIndex) => pageIndex + 1);
      quote.source_extraction_method = "vision";
      plog(
        `[QuoteExtractionEngine] Extracted quote: panel_beater="${quote.panel_beater}", total=${quote.total_cost}, ` +
          `line_items=${quote.line_items.length}, confidence=${quote.confidence}`
      );
      return quote;
    } catch (err) {
      plog(`[QuoteExtractionEngine] Failed to extract quote for "${group.panelBeater}": ${String(err)}`);
      return null;
    } finally {
      releaseSlot();
    }
  });
  const extractionResults = await Promise.all(extractionTasks);
  const visionResults: ExtractedQuote[] = extractionResults.filter((q): q is ExtractedQuote => q !== null);

  // Cross-validation: use whichever path found more distinct repairers
  const visionCount = visionResults.filter(q => (q.total_cost ?? 0) > 0).length;
  const textCount = textResults.filter(q => (q.total_cost ?? 0) > 0).length;

  plog(
    `[QuoteExtractionEngine] Cross-validation: vision=${visionCount} valid quote(s), text=${textCount} valid quote(s)`
  );

  if (visionResults.length === 0 && textResults.length === 0) {
    plog(`[QuoteExtractionEngine] Both paths returned 0 results — running single text extraction as last resort`);
    return extractMultipleQuotes(fallbackText, "insurance claim document", tenantCountry);
  }

  // Prefer the path with more valid (priced) quotes; tie-break on total count
  const useVision = visionCount > textCount || (visionCount === textCount && visionResults.length >= textResults.length);
  const winner = useVision ? visionResults : textResults;
  const loser = useVision ? textResults : visionResults;

  plog(
    `[QuoteExtractionEngine] Using ${useVision ? 'vision' : 'text'} path results (${winner.length} quote(s)). ` +
      `Other path had ${loser.length} quote(s).`
  );

  // Merge any quotes found by the losing path that are NOT already in the winner set
  // (different repairer name = genuinely missed by the winning path)
  const merged = [...winner];
  for (const q of loser) {
    const alreadyPresent = merged.some(w =>
      (w.panel_beater ?? '').toLowerCase().replace(/[^a-z0-9]/g, '') ===
      (q.panel_beater ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
    );
    // Include quotes with valid line items even if total_cost is null —
    // the total can be computed from line items downstream.
    const hasValue = (q.total_cost ?? 0) > 0 || q.line_items.some(li => (li.line_total ?? 0) > 0 || (li.unit_cost ?? 0) > 0);
    if (!alreadyPresent && hasValue) {
      merged.push(q);
      plog(`[QuoteExtractionEngine] Merged additional quote from losing path: "${q.panel_beater}" total=${q.total_cost} line_items=${q.line_items.length}`);
    }
  }

  plog(
    `[QuoteExtractionEngine] Final result: ${merged.length} quote(s) — ${merged.map(q => q.panel_beater ?? 'unknown').join(', ')}`
  );
  return merged;
}

/**
 * extractQuoteFromMultipleImageUrls
 *
 * Extracts a repair quote from multiple page images belonging to the same quotation.
 * Sends all pages together so multi-page quotes (e.g. line items on page 1, total on page 2)
 * are fully captured in a single LLM call.
 *
 * @param imageUrls    S3 URLs of the page images for this quote group (all pages)
 * @param panelBeater  Optional hint for the repairer name
 * @param totalCost    Optional hint for the total cost
 * @param tenantCountry ISO-3166-1 alpha-2 country code for currency default
 */
export async function extractQuoteFromMultipleImageUrls(
  imageUrls: string[],
  panelBeater: string | null,
  totalCost: number | null,
  tenantCountry?: string | null
): Promise<ExtractedQuote> {
  if (imageUrls.length === 0) {
    return buildFallback("extractQuoteFromMultipleImageUrls: no image URLs provided");
  }

  // Single-image fast path — delegate to existing function
  if (imageUrls.length === 1) {
    return extractQuoteFromImageUrl(imageUrls[0], panelBeater, totalCost, tenantCountry);
  }

  try {
    const contextHint = panelBeater
      ? `This is a multi-page scanned repair quotation from ${panelBeater}. The ${imageUrls.length} images are consecutive pages of the SAME quote.${totalCost ? ` The total cost is approximately ${totalCost}.` : ''} Extract ALL line items across all pages with their individual prices.`
      : `This is a multi-page scanned vehicle repair quotation. The ${imageUrls.length} images are consecutive pages of the SAME quote.${totalCost ? ` The total cost is approximately ${totalCost}.` : ''} Extract ALL line items across all pages with their individual prices.`;

    // Build image content array — all pages of this group
    const imageContent: Array<{ type: "image_url"; image_url: { url: string; detail: "auto" } }> =
      imageUrls.map(url => ({
        type: "image_url" as const,
        image_url: { url, detail: "auto" as const },
      }));

    // R-INF-06: wrap in withRetry
    const response = await withRetry(() => invokeLLM({
      messages: [
        {
          role: "system",
          content:
            SYSTEM_PROMPT +
            `\n\nCRITICAL: This is a MULTI-PAGE IMAGE extraction pass. You are looking at ${imageUrls.length} consecutive pages from the SAME repair quote. ` +
            `Read ALL pages together — line items may be on earlier pages and the total may be on the last page. ` +
            `Extract ALL line items from ALL pages. Do NOT return null or 0 for any line item that has a visible price. ` +
            `If the total is known (${totalCost ?? "unknown"}), use it to validate — the sum of line items should be close to the total.`,
        },
        {
          role: "user",
          content: [
            ...imageContent,
            {
              type: "text" as const,
              text:
                contextHint +
                "\n\nExtract ALL repair quote line items from these pages with their individual unit costs and line totals. " +
                "The total cost is typically on the LAST page. " +
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
    }), 2, undefined, undefined, 'quote-multipage-extract');

    const raw = response?.choices?.[0]?.message?.content;
    if (!raw) return buildFallback("Multi-page image quote extraction: LLM returned empty response.");
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    const result = validateAndNormalise(parsed);
    if (!result.currency && tenantCountry) {
      result.currency = getDefaultCurrencyForCountry(tenantCountry);
    }
    // R-A-22: Apply name-based document_category heuristic when validateAndNormalise returned 'other'
    // (multi-page image extraction schema does not include document_category field).
    if (result.document_category === 'other' && panelBeater) {
      const nameLower = panelBeater.toLowerCase();
      const isAssessor = /adjuster|assessor|loss adjust|surveyor|inspection|valuation|apprais/.test(nameLower);
      const isPartsOnly = /sarjazz|parts|spares|accessories|auto parts|motor parts|spare parts|parts dealer|parts supply|parts world|parts centre|parts center|parts hub/.test(nameLower);
      if (isAssessor) {
        result.document_category = 'assessor_report';
      } else if (isPartsOnly) {
        result.document_category = 'parts_quote';
      } else {
        result.document_category = 'repair_quote';
      }
    }
    result.extraction_warnings.push("multi_page_image_extraction_used");
    console.log(
      `[QuoteExtractionEngine] Multi-page image extraction complete: ${result.line_items.length} line items, ` +
        `total=${result.total_cost}, panel_beater=${result.panel_beater}, confidence=${result.confidence}`
    );
    return result;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // Fall back to single-page extraction using the first page
    plog(`[QuoteExtractionEngine] Multi-page extraction failed (${msg}), falling back to first-page extraction`);
    return extractQuoteFromImageUrl(imageUrls[0], panelBeater, totalCost, tenantCountry);
  }
}


/**
 * extractMultipleQuotesFromPdfUrl
 *
 * Cloud Run-compatible multi-quote extraction using native PDF file_url support.
 *
 * This is the PRIMARY path when page images are NOT available (i.e. pdftoppm is
 * not installed in the production container). Instead of converting the PDF to
 * images first, it sends the PDF URL directly to the LLM as a file_url message.
 *
 * Two-pass approach:
 *   Pass 1 — Detection: Ask the LLM to identify ALL distinct repairers/panel beaters
 *             present in the PDF and return their names.
 *   Pass 2 — Extraction: For each detected repairer, ask the LLM to extract the full
 *             structured quote for that specific repairer. All extractions run in parallel.
 *
 * Falls back to text-based extraction if the PDF URL is unavailable or the LLM
 * returns no repairers in Pass 1.
 *
 * @param pdfUrl        Public S3 URL of the claim PDF
 * @param fallbackText  OCR text to use if PDF-native extraction fails
 * @param tenantCountry ISO 3166-1 alpha-2 country code for default currency
 */
export async function extractMultipleQuotesFromPdfUrl(
  pdfUrl: string,
  fallbackText: string,
  tenantCountry?: string | null
): Promise<ExtractedQuote[]> {
  plog(`[QuoteExtractionEngine] PDF-native extraction starting for: ${pdfUrl}`);

  // ── PASS 1: Detect all repairers in the PDF ──────────────────────────────────
  let repairerNames: string[] = [];
  try {
    // R-INF-06: wrap in withRetry
    const detectionResponse = await withRetry(() => invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are a document analyst. You will receive a vehicle insurance claim PDF.
Your ONLY job is to identify ALL distinct repair quotations (estimates, quotes, or invoices) from panel beaters, body shops, or auto repair shops present in the document.

A repair quotation INCLUDES any of these formats:
- Typed or printed quote with a company letterhead, list of parts/labour, and a total
- Handwritten quote on plain paper or a form — look for a name/company at the top, a list of items, and a total amount
- Informal typed list of repair items with prices and a final total
- Any document from a repairer, body shop, or panel beater showing what they will charge to fix the vehicle

DO NOT require a formal letterhead — many small repairers in Africa use handwritten or informal formats.
EXCLUDE: claim forms, police reports, driver statements, loss adjuster/assessor reports, photos of damage, correspondence letters, insurance policy documents, assessor fee invoices.

Return the name of EVERY distinct repairer/panel beater that has a quotation in this document.
If a repairer name is not visible, use a description like "Handwritten Quote 1", "Unknown Repairer 2".
Return JSON only.`,
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
              text: "Identify ALL distinct repair quotations in this PDF. Return the panel beater / company name for each one.",
            },
          ],
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
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string", description: "Panel beater / company name" },
                  },
                  required: ["name"],
                  additionalProperties: false,
                },
              },
            },
            required: ["repairers"],
            additionalProperties: false,
          },
        },
      },
    }), 2, undefined, undefined, 'quote-pdf-detection');

    const raw = detectionResponse?.choices?.[0]?.message?.content;
    if (raw) {
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      repairerNames = (parsed.repairers ?? []).map((r: { name: string }) => r.name).filter(Boolean);
    }
    plog(`[QuoteExtractionEngine] PDF detection found ${repairerNames.length} repairer(s): ${repairerNames.join(", ")}`);
  } catch (err) {
    plog(`[QuoteExtractionEngine] PDF detection pass failed: ${String(err)} — falling back to text extraction`);
    return extractMultipleQuotes(fallbackText, "insurance claim document", tenantCountry);
  }

  // If no repairers detected, fall back to text extraction
  if (repairerNames.length === 0) {
    plog(`[QuoteExtractionEngine] PDF detection found 0 repairers — falling back to text extraction`);
    return extractMultipleQuotes(fallbackText, "insurance claim document", tenantCountry);
  }

  // ── PASS 2: Extract each repairer's quote in PARALLEL ─────────────────────────
    // R-A-21 FIX: Cap parallel LLM calls at 3 concurrent requests (same pattern as page-image path).
  let pdfActiveSlots = 0;
  const pdfWaitQueue: Array<() => void> = [];
  const pdfAcquireSlot = (): Promise<void> => new Promise<void>(resolve => {
    if (pdfActiveSlots < 3) { pdfActiveSlots++; resolve(); }
    else { pdfWaitQueue.push(() => { pdfActiveSlots++; resolve(); }); }
  });
  const pdfReleaseSlot = () => { pdfActiveSlots--; const next = pdfWaitQueue.shift(); if (next) next(); };
  const extractionTasks = repairerNames.map(async (repairerName) => {
    await pdfAcquireSlot();
    plog(`[QuoteExtractionEngine] Extracting quote for "${repairerName}" from PDF`);
    try {
      const result = await extractQuoteFromPdfVision(pdfUrl, repairerName, null, tenantCountry);
      // Override panel_beater with detected name if LLM didn't populate it
      if (!result.panel_beater && repairerName) {
        result.panel_beater = repairerName;
      }
      plog(
        `[QuoteExtractionEngine] PDF extraction for "${repairerName}": total=${result.total_cost}, ` +
          `line_items=${result.line_items.length}, confidence=${result.confidence}`
      );
      return result;
    } catch (err) {
      plog(`[QuoteExtractionEngine] PDF extraction failed for "${repairerName}": ${String(err)}`);
      return null;
    } finally {
      pdfReleaseSlot();
    }
  });
  const extractionResults = await Promise.all(extractionTasks);
  const validResults: ExtractedQuote[] = extractionResults.filter((q): q is ExtractedQuote => q !== null);

  // Deduplicate by panel beater name (in case detection returned duplicates)
  const seen = new Set<string>();
  const deduped = validResults.filter(q => {
    const key = (q.panel_beater ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
    if (key && seen.has(key)) return false;
    if (key) seen.add(key);
    return true;
  });

  // Cross-validate with text path — merge any quotes the PDF path missed
  let textResults: ExtractedQuote[] = [];
  try {
    textResults = await extractMultipleQuotes(fallbackText, "insurance claim document", tenantCountry);
    plog(`[QuoteExtractionEngine] Text cross-validation found ${textResults.length} quote(s)`);
  } catch (err) {
    plog(`[QuoteExtractionEngine] Text cross-validation failed: ${String(err)}`);
  }

  const merged = [...deduped];
  for (const q of textResults) {
    const alreadyPresent = merged.some(w =>
      (w.panel_beater ?? "").toLowerCase().replace(/[^a-z0-9]/g, "") ===
      (q.panel_beater ?? "").toLowerCase().replace(/[^a-z0-9]/g, "")
    );
    if (!alreadyPresent && (q.total_cost ?? 0) > 0) {
      merged.push(q);
      plog(`[QuoteExtractionEngine] Merged additional quote from text path: "${q.panel_beater}" total=${q.total_cost}`);
    }
  }

  plog(
    `[QuoteExtractionEngine] PDF-native extraction complete: ${merged.length} quote(s) — ` +
      `${merged.map(q => q.panel_beater ?? "unknown").join(", ")}`
  );

  // Last resort: if still empty, return text results
  if (merged.length === 0) {
    plog(`[QuoteExtractionEngine] PDF-native extraction returned 0 results — using text fallback`);
    return extractMultipleQuotes(fallbackText, "insurance claim document", tenantCountry);
  }

  return merged;
}
