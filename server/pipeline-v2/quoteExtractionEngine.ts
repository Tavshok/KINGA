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
 *   - Currency defaults to USD if not stated
 *
 * OUTPUT SCHEMA:
 *   {
 *     panel_beater:    string | null,
 *     total_cost:      number | null,
 *     currency:        "USD" | "ZWL" | "ZAR" | "GBP" | string,
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

// ─── Public types ─────────────────────────────────────────────────────────────

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
}

export interface ExtractedQuote {
  panel_beater: string | null;
  total_cost: number | null;
  currency: string;
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
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a structured data extraction engine for vehicle repair quotations.

Your task is to convert unstructured repair quote text into a standard JSON object.

RULES — follow these exactly:
1. Extract the panel beater / repairer name if present.
2. Extract the total repair cost as a plain number (no currency symbols, no commas).
3. Identify the currency. If not stated, use "USD".
4. List every quoted component in both 'components' (names only) AND 'line_items' (with pricing).
   Normalise names to simple English:
   - "R/H tail lamp assembly" → "RHS tail lamp"
   - "Radiator support panel (upper)" → "radiator support panel"
   - "B/bar" → "rear bumper"
   - "F/bar" → "front bumper"
   - "Labour – panel repair" → do NOT include as a component; set labour_defined = true
5. For line_items: extract each component row from the quote table with its unit cost, quantity, and line total.
   - If a row shows "Rear bumper  R 1,200.00" → component="rear bumper", unit_cost=1200, quantity=1, line_total=1200
   - If quantity is not stated, default to 1.
   - If unit_cost is not stated but line_total is, set unit_cost = line_total / quantity.
   - Set action to "replace", "repair", "refinish", or "other" based on the row description.
   - If no itemised pricing exists (only a total), return an empty array for line_items.
6. Do NOT infer or guess missing components.
7. Do NOT estimate any cost.
8. If a field cannot be found, return null (for strings/numbers) or false (for booleans).
9. Set confidence:
   - "high"   → total cost found, ≥ 3 components found, panel beater name found
   - "medium" → total cost found but < 3 components, or panel beater missing
   - "low"    → total cost missing or no components found
10. List any extraction issues in extraction_warnings (e.g. "total cost not found", "currency ambiguous").
11. Extract labour_cost and parts_cost as plain numbers when they appear as separate line items:
    - "Labour: $1,500" → labour_cost = 1500, labour_defined = true
    - "Parts: $3,200" → parts_cost = 3200, parts_defined = true
    - If only a total is given with no breakdown, set both to null.
    - IMPORTANT: labour_cost + parts_cost must not exceed total_cost by more than 5%.

OUTPUT — return ONLY valid JSON matching this schema exactly:
{
  "panel_beater": string | null,
  "total_cost": number | null,
  "currency": string,
  "components": string[],
  "line_items": [{"component": string, "unit_cost": number|null, "quantity": number, "line_total": number|null, "action": string|null}],
  "labour_defined": boolean,
  "parts_defined": boolean,
  "labour_cost": number | null,
  "parts_cost": number | null,
  "confidence": "high" | "medium" | "low",
  "extraction_warnings": string[]
}`;

// ─── Main extraction function ─────────────────────────────────────────────────

/**
 * extractQuoteFromText
 *
 * Calls the LLM to extract a structured quote from raw text.
 * Returns a typed ExtractedQuote or a safe null-filled fallback on failure.
 */
export async function extractQuoteFromText(
  rawText: string,
  contextHint?: string
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
                    action: { type: ["string", "null"], description: "Repair action: repair, replace, refinish, or other" }
                  },
                  required: ["component", "unit_cost", "quantity", "line_total", "action"],
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
    return validateAndNormalise(parsed);

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
  contextHint?: string
): Promise<ExtractedQuote[]> {
  // Split on common quote-separator patterns
  const blocks = splitQuoteBlocks(rawText);

  if (blocks.length <= 1) {
    // Single block — run standard extraction
    const single = await extractQuoteFromText(rawText, contextHint);
    return [single];
  }

  // Extract each block in sequence (not parallel — LLM rate limits)
  const results: ExtractedQuote[] = [];
  for (const block of blocks) {
    const result = await extractQuoteFromText(block, contextHint);
    results.push(result);
  }
  return results;
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
  const components: string[] = Array.isArray(raw.components)
    ? (raw.components as string[]).map(c => normaliseComponentName(String(c)))
    : [];

  // Extract and validate line_items
  const line_items: QuoteLineItem[] = [];
  if (Array.isArray(raw.line_items)) {
    for (const item of raw.line_items as Record<string, unknown>[]) {
      if (!item || typeof item.component !== 'string') continue;
      const unitCost = typeof item.unit_cost === 'number' ? item.unit_cost : null;
      const qty = typeof item.quantity === 'number' && item.quantity > 0 ? item.quantity : 1;
      const lineTotal = typeof item.line_total === 'number' ? item.line_total
        : (unitCost !== null ? unitCost * qty : null);
      line_items.push({
        component: normaliseComponentName(String(item.component)),
        unit_cost: unitCost,
        quantity: qty,
        line_total: lineTotal,
        action: typeof item.action === 'string' ? item.action : null,
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

  return {
    panel_beater: typeof raw.panel_beater === "string" ? raw.panel_beater : null,
    total_cost: totalCost,
    currency: typeof raw.currency === "string" && raw.currency.length > 0 ? raw.currency : "USD",
    components,
    line_items,
    labour_defined: raw.labour_defined === true,
    parts_defined: raw.parts_defined === true,
    labour_cost: labourCost,
    parts_cost: partsCost,
    confidence,
    extraction_warnings: warnings,
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
    [/\bB\/bar\b/i, "rear bumper"],
    [/\bF\/bar\b/i, "front bumper"],
    [/\bR\/H\b/i, "RHS"],
    [/\bL\/H\b/i, "LHS"],
    [/\bR\/F\b/i, "right front"],
    [/\bL\/F\b/i, "left front"],
    [/\bR\/R\b/i, "right rear"],
    [/\bL\/R\b/i, "left rear"],
    [/\bW\/screen\b/i, "windscreen"],
    [/\bA\/bag\b/i, "airbag"],
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
 * buildFallback
 *
 * Returns a safe null-filled ExtractedQuote with the given warning.
 */
function buildFallback(warning: string): ExtractedQuote {
  return {
    panel_beater: null,
    total_cost: null,
    currency: "USD",
    components: [],
    line_items: [],
    labour_defined: false,
    parts_defined: false,
    labour_cost: null,
    parts_cost: null,
    confidence: "low",
    extraction_warnings: [warning],
  };
}
