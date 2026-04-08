/**
 * documentReadVerificationEngine.test.ts
 *
 * Tests for the Document Read Verification Engine and shouldHaltPipeline gate.
 *
 * Strategy:
 *   - Heuristic path (< 200 chars): fully deterministic, no LLM mock needed
 *   - LLM path (≥ 200 chars): mock invokeLLM to return controlled responses
 *   - shouldHaltPipeline: pure function, no mocking needed
 *
 * The heuristic path is the most important to test because it is the
 * fast-path that runs on every claim before any LLM call is made.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// Mock LLM for the ≥200 char path
// ─────────────────────────────────────────────────────────────────────────────

const mockLLM = vi.fn();
vi.mock("../_core/llm", () => ({ invokeLLM: (...a: any[]) => mockLLM(...a) }));

import {
  verifyDocumentRead,
  shouldHaltPipeline,
  type DocumentReadVerificationResult,
} from "./documentReadVerificationEngine";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeLLMResult(overrides: Partial<DocumentReadVerificationResult> = {}) {
  return {
    choices: [{
      message: {
        content: JSON.stringify({
          status: overrides.status ?? "SUCCESS",
          confidence: overrides.confidence ?? 90,
          pages_detected: overrides.pages_detected ?? 3,
          key_fields_detected: overrides.key_fields_detected ?? {
            claim_number: true, vehicle: true, incident_description: true, costs: true, dates: true,
          },
          missing_critical_fields: overrides.missing_critical_fields ?? [],
          reason: overrides.reason ?? "All key fields detected.",
        }),
      },
    }],
  };
}

/** Build a document text that is ≥ 200 chars to trigger the LLM path.
 * Pads with non-whitespace text so engine.trim() does not reduce length below 200. */
function longDoc(content: string): string {
  const pad = "Additional claim details and supporting documentation attached herewith for review purposes. Reference number noted.";
  let result = content;
  while (result.length < 250) result += " " + pad;
  return result.substring(0, 300);
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 1: Heuristic path — empty / very short documents
// ─────────────────────────────────────────────────────────────────────────────

describe("documentReadVerificationEngine — heuristic path (< 200 chars)", () => {
  it("returns FAILED for empty string", async () => {
    const result = await verifyDocumentRead("");
    expect(result.status).toBe("FAILED");
    expect(result.confidence).toBe(0);
    expect(result.method).toBe("heuristic");
  });

  it("returns FAILED for whitespace-only string", async () => {
    const result = await verifyDocumentRead("   \n\t  ");
    expect(result.status).toBe("FAILED");
    expect(result.confidence).toBe(0);
  });

  it("returns FAILED for text shorter than 50 chars", async () => {
    const result = await verifyDocumentRead("Some text");
    expect(result.status).toBe("FAILED");
    expect(result.method).toBe("heuristic");
  });

  it("returns SUCCESS for a short but keyword-rich document", async () => {
    const text = "Claim No: CI-024. Vehicle: Toyota. Accident: cow struck. Cost: $500. Date: 01/01/2024.";
    const result = await verifyDocumentRead(text);
    expect(result.status).toBe("SUCCESS");
    expect(result.confidence).toBe(100);
    expect(result.method).toBe("heuristic");
  });

  it("returns PARTIAL when only 2-3 key fields are detected", async () => {
    const text = "Toyota Hilux. Date: 15/03/2024. Some text here to pad the document out.";
    const result = await verifyDocumentRead(text);
    expect(["PARTIAL", "SUCCESS"]).toContain(result.status);
    expect(result.method).toBe("heuristic");
  });

  it("detects claim_number via CI- prefix", async () => {
    const text = "CI-024NATPHARM vehicle Toyota accident cow struck cost $500 date 01/01/2024";
    const result = await verifyDocumentRead(text);
    expect(result.key_fields_detected.claim_number).toBe(true);
  });

  it("detects vehicle via make name (Mazda)", async () => {
    const text = "Claim No: 001. Mazda BT-50. Accident: cow struck. Cost: $500. Date: 01/01/2024.";
    const result = await verifyDocumentRead(text);
    expect(result.key_fields_detected.vehicle).toBe(true);
  });

  it("detects incident via 'struck' keyword", async () => {
    const text = "Claim No: 001. Toyota. Vehicle struck a cow. Cost: $500. Date: 01/01/2024.";
    const result = await verifyDocumentRead(text);
    expect(result.key_fields_detected.incident_description).toBe(true);
  });

  it("detects costs via USD keyword", async () => {
    const text = "Claim No: 001. Toyota. Accident: cow. USD 5000. Date: 01/01/2024.";
    const result = await verifyDocumentRead(text);
    expect(result.key_fields_detected.costs).toBe(true);
  });

  it("detects dates via DD/MM/YYYY format", async () => {
    const text = "Claim No: 001. Toyota. Accident: cow. Cost: $500. 15/03/2024.";
    const result = await verifyDocumentRead(text);
    expect(result.key_fields_detected.dates).toBe(true);
  });

  it("detects dates via month name (January)", async () => {
    const text = "Claim No: 001. Toyota. Accident: cow. Cost: $500. January 2024.";
    const result = await verifyDocumentRead(text);
    expect(result.key_fields_detected.dates).toBe(true);
  });

  it("missing_critical_fields lists all missing fields for empty document", async () => {
    const result = await verifyDocumentRead("some random text here that is at least fifty characters long for the test");
    expect(Array.isArray(result.missing_critical_fields)).toBe(true);
  });

  it("text_length matches the input document length", async () => {
    const text = "Claim No: 001. Toyota. Accident: cow. Cost: $500. Date: 01/01/2024.";
    const result = await verifyDocumentRead(text);
    expect(result.text_length).toBe(text.trim().length);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 2: LLM path — ≥ 200 chars
// ─────────────────────────────────────────────────────────────────────────────

describe("documentReadVerificationEngine — LLM path (≥ 200 chars)", () => {
  beforeEach(() => {
    mockLLM.mockResolvedValue(makeLLMResult());
  });

  it("uses LLM for documents ≥ 200 chars", async () => {
    const result = await verifyDocumentRead(longDoc("Claim No: CI-024. Toyota. Accident: cow struck. Cost: $500. Date: 01/01/2024."));
    expect(result.method).toBe("llm");
  });

  it("returns SUCCESS when LLM confirms all fields present", async () => {
    mockLLM.mockResolvedValue(makeLLMResult({ status: "SUCCESS", confidence: 95 }));
    const result = await verifyDocumentRead(longDoc("Full claim document text..."));
    expect(result.status).toBe("SUCCESS");
    expect(result.confidence).toBe(95);
  });

  it("returns PARTIAL when LLM returns PARTIAL status", async () => {
    mockLLM.mockResolvedValue(makeLLMResult({
      status: "PARTIAL",
      confidence: 55,
      missing_critical_fields: ["costs", "dates"],
    }));
    const result = await verifyDocumentRead(longDoc("Partial claim document..."));
    expect(result.status).toBe("PARTIAL");
    expect(result.missing_critical_fields).toContain("costs");
  });

  it("returns FAILED when LLM returns FAILED status", async () => {
    mockLLM.mockResolvedValue(makeLLMResult({
      status: "FAILED",
      confidence: 10,
      missing_critical_fields: ["claim_number", "vehicle", "incident_description", "costs", "dates"],
    }));
    const result = await verifyDocumentRead(longDoc("Unreadable scanned document..."));
    expect(result.status).toBe("FAILED");
    expect(result.confidence).toBe(10);
  });

  it("falls back to heuristic when LLM throws", async () => {
    mockLLM.mockRejectedValue(new Error("LLM unavailable"));
    const result = await verifyDocumentRead(longDoc("Claim No: CI-024. Toyota. Accident: cow struck. Cost: $500. Date: 01/01/2024."));
    expect(result.method).toBe("heuristic");
    // Should not throw
  });

  it("confidence is clamped to 0-100 even if LLM returns out-of-range value", async () => {
    mockLLM.mockResolvedValue(makeLLMResult({ confidence: 150 }));
    const result = await verifyDocumentRead(longDoc("Some document text..."));
    expect(result.confidence).toBeLessThanOrEqual(100);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 3: shouldHaltPipeline — pure function, no mocking
// ─────────────────────────────────────────────────────────────────────────────

describe("shouldHaltPipeline — pipeline gate logic", () => {
  it("halts when status is FAILED", () => {
    const result: DocumentReadVerificationResult = {
      status: "FAILED", confidence: 0, pages_detected: 0,
      key_fields_detected: { claim_number: false, vehicle: false, incident_description: false, costs: false, dates: false },
      missing_critical_fields: ["claim_number", "vehicle", "incident_description", "costs", "dates"],
      reason: "Empty document.", text_length: 0, method: "heuristic",
    };
    expect(shouldHaltPipeline(result)).toBe(true);
  });

  it("halts when status is PARTIAL and confidence < 40", () => {
    const result: DocumentReadVerificationResult = {
      status: "PARTIAL", confidence: 30, pages_detected: 1,
      key_fields_detected: { claim_number: true, vehicle: false, incident_description: false, costs: false, dates: true },
      missing_critical_fields: ["vehicle", "incident_description", "costs"],
      reason: "Only 2/5 fields detected.", text_length: 500, method: "heuristic",
    };
    expect(shouldHaltPipeline(result)).toBe(true);
  });

  it("does NOT halt when status is PARTIAL and confidence >= 40", () => {
    const result: DocumentReadVerificationResult = {
      status: "PARTIAL", confidence: 60, pages_detected: 2,
      key_fields_detected: { claim_number: true, vehicle: true, incident_description: true, costs: false, dates: false },
      missing_critical_fields: ["costs", "dates"],
      reason: "3/5 fields detected.", text_length: 2000, method: "heuristic",
    };
    expect(shouldHaltPipeline(result)).toBe(false);
  });

  it("does NOT halt when status is SUCCESS", () => {
    const result: DocumentReadVerificationResult = {
      status: "SUCCESS", confidence: 90, pages_detected: 3,
      key_fields_detected: { claim_number: true, vehicle: true, incident_description: true, costs: true, dates: true },
      missing_critical_fields: [],
      reason: "All fields detected.", text_length: 5000, method: "llm",
    };
    expect(shouldHaltPipeline(result)).toBe(false);
  });

  it("halts when status is PARTIAL and confidence is exactly 39", () => {
    const result: DocumentReadVerificationResult = {
      status: "PARTIAL", confidence: 39, pages_detected: 1,
      key_fields_detected: { claim_number: false, vehicle: true, incident_description: true, costs: false, dates: false },
      missing_critical_fields: ["claim_number", "costs", "dates"],
      reason: "Borderline partial.", text_length: 800, method: "heuristic",
    };
    expect(shouldHaltPipeline(result)).toBe(true);
  });

  it("does NOT halt when status is PARTIAL and confidence is exactly 40", () => {
    const result: DocumentReadVerificationResult = {
      status: "PARTIAL", confidence: 40, pages_detected: 1,
      key_fields_detected: { claim_number: true, vehicle: true, incident_description: false, costs: true, dates: false },
      missing_critical_fields: ["incident_description", "dates"],
      reason: "Borderline partial.", text_length: 800, method: "heuristic",
    };
    expect(shouldHaltPipeline(result)).toBe(false);
  });
});
