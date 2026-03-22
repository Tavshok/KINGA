/**
 * quoteExtractionEngine.test.ts
 *
 * Unit tests for the structured quote extraction engine.
 * These tests cover the normalisation, fallback, and validation logic
 * WITHOUT calling the LLM (all LLM-dependent paths are mocked).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock the LLM so tests run without API calls ──────────────────────────────

vi.mock("../_core/llm", () => ({
  invokeLLM: vi.fn(),
}));

import { invokeLLM } from "../_core/llm";
import { extractQuoteFromText, extractMultipleQuotes } from "./quoteExtractionEngine";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeLLMResponse(content: object) {
  return {
    choices: [
      {
        message: {
          content: JSON.stringify(content),
        },
      },
    ],
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("extractQuoteFromText", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a high-confidence extraction when LLM provides all fields", async () => {
    (invokeLLM as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeLLMResponse({
        panel_beater: "Avana Motors",
        total_cost: 4736.28,
        currency: "USD",
        components: ["rear bumper", "RHS tail lamp", "tailgate", "grille", "radiator support panel"],
        labour_defined: true,
        parts_defined: true,
        confidence: "high",
        extraction_warnings: [],
      })
    );

    const result = await extractQuoteFromText("Avana Motors quote: USD 4,736.28 total");

    expect(result.panel_beater).toBe("Avana Motors");
    expect(result.total_cost).toBe(4736.28);
    expect(result.currency).toBe("USD");
    expect(result.components).toHaveLength(5);
    expect(result.labour_defined).toBe(true);
    expect(result.parts_defined).toBe(true);
    expect(result.confidence).toBe("high");
    expect(result.extraction_warnings).toHaveLength(0);
  });

  it("returns a safe fallback when input text is too short", async () => {
    const result = await extractQuoteFromText("  ");

    expect(result.panel_beater).toBeNull();
    expect(result.total_cost).toBeNull();
    expect(result.currency).toBe("USD");
    expect(result.components).toHaveLength(0);
    expect(result.confidence).toBe("low");
    expect(result.extraction_warnings[0]).toContain("empty or too short");
    // LLM should NOT have been called
    expect(invokeLLM).not.toHaveBeenCalled();
  });

  it("returns a safe fallback when LLM call throws", async () => {
    (invokeLLM as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("Network timeout")
    );

    const result = await extractQuoteFromText("Repair quote for Toyota Corolla: USD 1,200.00");

    expect(result.total_cost).toBeNull();
    expect(result.confidence).toBe("low");
    expect(result.extraction_warnings[0]).toContain("LLM call failed");
  });

  it("coerces total_cost from string to number with a warning", async () => {
    (invokeLLM as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeLLMResponse({
        panel_beater: "Panel Pro",
        total_cost: "2,576.00",   // LLM returned string instead of number
        currency: "USD",
        components: ["rear bumper", "grille"],
        labour_defined: false,
        parts_defined: true,
        confidence: "medium",
        extraction_warnings: [],
      })
    );

    const result = await extractQuoteFromText("Panel Pro quote: USD 2,576.00");

    expect(result.total_cost).toBe(2576.0);
    expect(result.extraction_warnings).toContain(
      "total_cost was returned as string — coerced to number"
    );
  });

  it("defaults currency to USD when LLM omits it", async () => {
    (invokeLLM as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeLLMResponse({
        panel_beater: null,
        total_cost: 800,
        currency: "",   // empty string — should default to USD
        components: ["door panel"],
        labour_defined: false,
        parts_defined: false,
        confidence: "medium",
        extraction_warnings: [],
      })
    );

    const result = await extractQuoteFromText("Repair cost: 800 for door panel");

    expect(result.currency).toBe("USD");
  });

  it("normalises component names from shorthand", async () => {
    (invokeLLM as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeLLMResponse({
        panel_beater: "Workshop A",
        total_cost: 1500,
        currency: "USD",
        components: ["B/bar", "R/H tail lamp", "W/screen"],
        labour_defined: true,
        parts_defined: true,
        confidence: "high",
        extraction_warnings: [],
      })
    );

    const result = await extractQuoteFromText("Workshop A: B/bar, R/H tail lamp, W/screen");

    expect(result.components).toContain("rear bumper");
    expect(result.components).toContain("rhs tail lamp");
    expect(result.components).toContain("windscreen");
  });

  it("marks confidence as low when total_cost is null", async () => {
    (invokeLLM as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeLLMResponse({
        panel_beater: "Workshop B",
        total_cost: null,
        currency: "USD",
        components: ["bumper"],
        labour_defined: false,
        parts_defined: false,
        confidence: "high",  // LLM incorrectly said high — should be recomputed
        extraction_warnings: [],
      })
    );

    const result = await extractQuoteFromText("Workshop B: bumper repair");

    // total_cost is null → confidence must be low regardless of LLM claim
    expect(result.confidence).toBe("low");
    expect(result.extraction_warnings).toContain(
      "confidence was recomputed from extracted data"
    );
  });

  it("sets labour_defined = false when LLM omits it", async () => {
    (invokeLLM as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeLLMResponse({
        panel_beater: null,
        total_cost: 500,
        currency: "USD",
        components: [],
        labour_defined: undefined,  // omitted
        parts_defined: false,
        confidence: "medium",
        extraction_warnings: [],
      })
    );

    const result = await extractQuoteFromText("Total: USD 500");

    expect(result.labour_defined).toBe(false);
  });
});

describe("extractMultipleQuotes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a single-item array for a single-quote document", async () => {
    (invokeLLM as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeLLMResponse({
        panel_beater: "Avana Motors",
        total_cost: 4736.28,
        currency: "USD",
        components: ["rear bumper"],
        labour_defined: true,
        parts_defined: true,
        confidence: "high",
        extraction_warnings: [],
      })
    );

    const results = await extractMultipleQuotes("Avana Motors: USD 4,736.28 rear bumper");

    expect(results).toHaveLength(1);
    expect(results[0].panel_beater).toBe("Avana Motors");
  });

  it("returns multiple extractions for a document with multiple quote blocks", async () => {
    // Mock two LLM calls for two blocks
    (invokeLLM as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(
        makeLLMResponse({
          panel_beater: "Panel Pro",
          total_cost: 2000,
          currency: "USD",
          components: ["rear bumper"],
          labour_defined: true,
          parts_defined: true,
          confidence: "high",
          extraction_warnings: [],
        })
      )
      .mockResolvedValueOnce(
        makeLLMResponse({
          panel_beater: "Fix It Fast",
          total_cost: 1800,
          currency: "USD",
          components: ["grille", "radiator"],
          labour_defined: false,
          parts_defined: true,
          confidence: "medium",
          extraction_warnings: [],
        })
      );

    const multiQuoteText = `QUOTE 1
Panel Pro: USD 2,000.00 rear bumper repair

QUOTE 2
Fix It Fast: USD 1,800.00 grille and radiator`;

    const results = await extractMultipleQuotes(multiQuoteText);

    expect(results).toHaveLength(2);
    expect(results[0].panel_beater).toBe("Panel Pro");
    expect(results[1].panel_beater).toBe("Fix It Fast");
  });

  it("returns a low-confidence fallback for each block when LLM fails", async () => {
    (invokeLLM as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Service unavailable")
    );

    const results = await extractMultipleQuotes("Some quote text here with USD 1,000.00");

    expect(results).toHaveLength(1);
    expect(results[0].confidence).toBe("low");
    expect(results[0].total_cost).toBeNull();
  });
});
