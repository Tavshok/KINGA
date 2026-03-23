/**
 * Document Read Verification Engine
 *
 * Runs BEFORE any claim analysis begins.
 * Confirms whether the document has been successfully read and understood.
 * Does NOT analyse the claim — only verifies document readability.
 *
 * Returns a structured verification result:
 *   SUCCESS  → at least 4/5 key fields detected, coherent text
 *   PARTIAL  → some fields missing, text truncated or inconsistent
 *   FAILED   → very little readable content, most fields missing
 *
 * If PARTIAL or FAILED, the pipeline should halt and flag for manual review.
 */

import { invokeLLM } from "../_core/llm";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type VerificationStatus = "SUCCESS" | "PARTIAL" | "FAILED";

export interface DocumentReadVerificationResult {
  status: VerificationStatus;
  confidence: number; // 0–100
  pages_detected: number;
  key_fields_detected: {
    claim_number: boolean;
    vehicle: boolean;
    incident_description: boolean;
    costs: boolean;
    dates: boolean;
  };
  missing_critical_fields: string[];
  reason: string;
  /** Total characters in the document text that was verified */
  text_length: number;
  /** Whether the verification was performed by LLM or by heuristic fallback */
  method: "llm" | "heuristic";
}

// ─────────────────────────────────────────────────────────────────────────────
// Heuristic fallback (no LLM call needed for very short/empty text)
// ─────────────────────────────────────────────────────────────────────────────

function heuristicVerification(documentText: string): DocumentReadVerificationResult {
  const text = documentText.trim();
  const len = text.length;

  if (len < 50) {
    return {
      status: "FAILED",
      confidence: 0,
      pages_detected: 0,
      key_fields_detected: {
        claim_number: false,
        vehicle: false,
        incident_description: false,
        costs: false,
        dates: false,
      },
      missing_critical_fields: ["claim_number", "vehicle", "incident_description", "costs", "dates"],
      reason: "Document text is empty or too short to verify.",
      text_length: len,
      method: "heuristic",
    };
  }

  // Simple keyword presence checks
  const lower = text.toLowerCase();
  const claimNumber = /claim\s*(no|number|ref|#)|ci-\d|clm-\d/i.test(text);
  const vehicle = /mazda|toyota|honda|ford|nissan|isuzu|vehicle|make|model|reg(istration)?/i.test(text);
  const incident = /accident|collision|incident|struck|hit|damage|cow|animal/i.test(text);
  const costs = /\$|usd|zwd|quote|repair|cost|amount|total|labour|parts/i.test(text);
  const dates = /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}-\d{2}-\d{2}|january|february|march|april|may|june|july|august|september|october|november|december/i.test(text);

  const detected = [claimNumber, vehicle, incident, costs, dates];
  const detectedCount = detected.filter(Boolean).length;
  const missing: string[] = [];
  if (!claimNumber) missing.push("claim_number");
  if (!vehicle) missing.push("vehicle");
  if (!incident) missing.push("incident_description");
  if (!costs) missing.push("costs");
  if (!dates) missing.push("dates");

  const status: VerificationStatus = detectedCount >= 4 ? "SUCCESS" : detectedCount >= 2 ? "PARTIAL" : "FAILED";
  const confidence = Math.round((detectedCount / 5) * 100);

  return {
    status,
    confidence,
    pages_detected: Math.max(1, Math.round(len / 2000)), // rough estimate
    key_fields_detected: {
      claim_number: claimNumber,
      vehicle,
      incident_description: incident,
      costs,
      dates,
    },
    missing_critical_fields: missing,
    reason: status === "SUCCESS"
      ? `${detectedCount}/5 key fields detected via heuristic scan.`
      : `Only ${detectedCount}/5 key fields detected — document may be incomplete or poorly extracted.`,
    text_length: len,
    method: "heuristic",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// LLM-backed verification
// ─────────────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a Document Read Verification Engine.

Your task is NOT to analyse the claim.

Your task is to confirm whether the document has been successfully read and understood.

Return JSON with this exact schema:

{
  "status": "SUCCESS | PARTIAL | FAILED",
  "confidence": 0-100,
  "pages_detected": integer,
  "key_fields_detected": {
    "claim_number": true/false,
    "vehicle": true/false,
    "incident_description": true/false,
    "costs": true/false,
    "dates": true/false
  },
  "missing_critical_fields": ["..."],
  "reason": "short explanation (max 20 words)"
}

Rules:

1. SUCCESS:
   - Multiple sections of document are clearly present
   - At least 4/5 key fields detected
   - Text is coherent and structured

2. PARTIAL:
   - Some fields missing
   - Text truncated OR inconsistent
   - Less than 4 key fields detected

3. FAILED:
   - Very little readable content
   - Missing most key fields
   - Text appears fragmented or incomplete

4. You MUST NOT infer or guess missing fields.
   Only mark a field as true if you can see clear evidence of it in the text.

5. If unsure → mark as PARTIAL, not SUCCESS.

6. This is a verification step only.
   DO NOT analyse the claim.
   DO NOT comment on fraud, physics, or costs.
   DO NOT suggest what the claim outcome should be.`;

async function llmVerification(documentText: string): Promise<DocumentReadVerificationResult> {
  // Limit text to 12,000 chars — enough for a multi-page claim form
  // but prevents token overflow. The verification engine only needs
  // to confirm presence of key fields, not read every word.
  const textSample = documentText.length > 12000
    ? documentText.substring(0, 6000) + "\n\n[...middle section omitted...]\n\n" + documentText.substring(documentText.length - 6000)
    : documentText;

  const response = await invokeLLM({
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Please verify whether the following document text has been successfully read and understood.\n\nDOCUMENT TEXT:\n${textSample}`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "document_read_verification",
        strict: true,
        schema: {
          type: "object",
          properties: {
            status: { type: "string", enum: ["SUCCESS", "PARTIAL", "FAILED"] },
            confidence: { type: "integer" },
            pages_detected: { type: "integer" },
            key_fields_detected: {
              type: "object",
              properties: {
                claim_number: { type: "boolean" },
                vehicle: { type: "boolean" },
                incident_description: { type: "boolean" },
                costs: { type: "boolean" },
                dates: { type: "boolean" },
              },
              required: ["claim_number", "vehicle", "incident_description", "costs", "dates"],
              additionalProperties: false,
            },
            missing_critical_fields: { type: "array", items: { type: "string" } },
            reason: { type: "string" },
          },
          required: ["status", "confidence", "pages_detected", "key_fields_detected", "missing_critical_fields", "reason"],
          additionalProperties: false,
        },
      },
    },
  });

  const raw = response.choices?.[0]?.message?.content;
  if (!raw) throw new Error("LLM returned empty response for document verification");

  const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;

  return {
    status: parsed.status as VerificationStatus,
    confidence: Math.min(100, Math.max(0, Number(parsed.confidence) || 0)),
    pages_detected: Math.max(0, Number(parsed.pages_detected) || 0),
    key_fields_detected: {
      claim_number: Boolean(parsed.key_fields_detected?.claim_number),
      vehicle: Boolean(parsed.key_fields_detected?.vehicle),
      incident_description: Boolean(parsed.key_fields_detected?.incident_description),
      costs: Boolean(parsed.key_fields_detected?.costs),
      dates: Boolean(parsed.key_fields_detected?.dates),
    },
    missing_critical_fields: Array.isArray(parsed.missing_critical_fields)
      ? parsed.missing_critical_fields.map(String)
      : [],
    reason: String(parsed.reason || ""),
    text_length: documentText.length,
    method: "llm",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main entry point
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Verify that the extracted document text is complete enough to proceed with analysis.
 *
 * @param documentText  Combined raw text from all extracted documents
 * @returns             Structured verification result
 */
export async function verifyDocumentRead(
  documentText: string
): Promise<DocumentReadVerificationResult> {
  const trimmed = documentText.trim();

  // Fast path: heuristic check for empty/very short text (avoids LLM call)
  if (trimmed.length < 200) {
    return heuristicVerification(trimmed);
  }

  try {
    return await llmVerification(trimmed);
  } catch (err) {
    // If LLM fails, fall back to heuristic so the pipeline can still decide
    console.warn("[DocumentReadVerification] LLM call failed, using heuristic fallback:", String(err));
    const result = heuristicVerification(trimmed);
    result.reason = `LLM unavailable — heuristic fallback used. ${result.reason}`;
    return result;
  }
}

/**
 * Determine whether the pipeline should halt based on the verification result.
 *
 * HALT conditions:
 *   - status === "FAILED"
 *   - status === "PARTIAL" AND confidence < 40
 *
 * WARN conditions (continue but flag):
 *   - status === "PARTIAL" AND confidence >= 40
 */
export function shouldHaltPipeline(result: DocumentReadVerificationResult): boolean {
  if (result.status === "FAILED") return true;
  if (result.status === "PARTIAL" && result.confidence < 40) return true;
  return false;
}
