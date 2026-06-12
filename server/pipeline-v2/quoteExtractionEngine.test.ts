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
    // No tenantCountry provided and no currency in text → null is correct
    expect(result.currency).toBeNull();
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

    // Pass tenantCountry 'ZW' so the country-based default (USD) is applied
    const result = await extractQuoteFromText("Repair cost: 800 for door panel", undefined, "ZW");

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

    // After hallucination guard normalisation, names are canonical (title case)
    // B/bar -> Front Bumper, R/H tail lamp -> Tail Light (Left), W/screen -> Windscreen (Windshield)
    expect(result.components).toContain("Front Bumper");
    expect(result.components.some((c: string) => /tail light/i.test(c))).toBe(true);
    expect(result.components).toContain("Windscreen (Windshield)");
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

// ─── extractMultipleQuotesFromPageImages tests ───────────────────────────────

import {
  extractMultipleQuotesFromPageImages,
  extractQuoteFromMultipleImageUrls,
} from "./quoteExtractionEngine";

describe("extractMultipleQuotesFromPageImages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("extracts all quotes when vision detection finds multiple groups", async () => {
    // Call 1: detectQuotationPagesVision — returns 3 groups
    (invokeLLM as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeLLMResponse({
        quotation_groups: [
          { panel_beater: "The Dent Doctor", page_numbers: [1, 2] },
          { panel_beater: "Stylin Auto", page_numbers: [3] },
          { panel_beater: "Camel Body Shop", page_numbers: [4] },
        ],
      })
    );
    // Call 2: text-based extraction (parallel cross-validation) — returns 2 quotes
    (invokeLLM as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeLLMResponse({ repairers: ["The Dent Doctor", "Stylin Auto"] })
    );
    (invokeLLM as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeLLMResponse({
        panel_beater: "The Dent Doctor", total_cost: 3200, currency: "USD",
        components: ["front bumper"], line_items: [], labour_defined: false,
        parts_defined: false, labour_cost: null, parts_cost: null,
        confidence: "high", extraction_warnings: [],
      })
    );
    (invokeLLM as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeLLMResponse({
        panel_beater: "Stylin Auto", total_cost: 2800, currency: "USD",
        components: ["rear bumper"], line_items: [], labour_defined: false,
        parts_defined: false, labour_cost: null, parts_cost: null,
        confidence: "high", extraction_warnings: [],
      })
    );
    // Calls 3–5: extractQuoteFromMultipleImageUrls for each vision group
    (invokeLLM as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeLLMResponse({
        panel_beater: "The Dent Doctor", total_cost: 3200, currency: "USD",
        components: ["front bumper", "bonnet"], line_items: [], labour_defined: false,
        parts_defined: false, labour_cost: null, parts_cost: null,
        confidence: "high", extraction_warnings: [],
      })
    );
    (invokeLLM as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeLLMResponse({
        panel_beater: "Stylin Auto", total_cost: 2800, currency: "USD",
        components: ["rear bumper"], line_items: [], labour_defined: false,
        parts_defined: false, labour_cost: null, parts_cost: null,
        confidence: "high", extraction_warnings: [],
      })
    );
    (invokeLLM as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeLLMResponse({
        panel_beater: "Camel Body Shop", total_cost: 1900, currency: "USD",
        components: ["door panel"], line_items: [], labour_defined: false,
        parts_defined: false, labour_cost: null, parts_cost: null,
        confidence: "high", extraction_warnings: [],
      })
    );

    const pageUrls = [
      "https://s3.example.com/page1.jpg",
      "https://s3.example.com/page2.jpg",
      "https://s3.example.com/page3.jpg",
      "https://s3.example.com/page4.jpg",
    ];

    const results = await extractMultipleQuotesFromPageImages(pageUrls, "fallback text");

    // Vision found 3 valid quotes; text found 2 — vision wins
    expect(results.length).toBeGreaterThanOrEqual(3);
    const names = results.map((r) => r.panel_beater);
    expect(names).toContain("The Dent Doctor");
    expect(names).toContain("Stylin Auto");
    expect(names).toContain("Camel Body Shop");
  });

  it("falls back to text path when vision detection returns no groups", async () => {
    // Call 1: detectQuotationPagesVision — returns empty
    (invokeLLM as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeLLMResponse({ quotation_groups: [] })
    );
    // Calls 2–3: text-based extraction (parallel) — detection + extraction
    (invokeLLM as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeLLMResponse({ repairers: ["Quick Fix Auto"] })
    );
    (invokeLLM as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeLLMResponse({
        panel_beater: "Quick Fix Auto", total_cost: 1500, currency: "USD",
        components: ["windscreen"], line_items: [], labour_defined: false,
        parts_defined: false, labour_cost: null, parts_cost: null,
        confidence: "medium", extraction_warnings: [],
      })
    );

    const results = await extractMultipleQuotesFromPageImages(
      ["https://s3.example.com/page1.jpg"],
      "Quick Fix Auto windscreen USD 1500"
    );

    expect(results).toHaveLength(1);
    expect(results[0].panel_beater).toBe("Quick Fix Auto");
  });

  it("cross-validation picks text path when it finds more quotes than vision", async () => {
    // Call 1: detectQuotationPagesVision — only finds 1 group (misses handwritten)
    (invokeLLM as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeLLMResponse({
        quotation_groups: [{ panel_beater: "Formal Repairer", page_numbers: [1] }],
      })
    );
    // Calls 2–4: text-based extraction (parallel) — finds 2 repairers
    (invokeLLM as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeLLMResponse({ repairers: ["Formal Repairer", "Handwritten Repairer"] })
    );
    (invokeLLM as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeLLMResponse({
        panel_beater: "Formal Repairer", total_cost: 2000, currency: "USD",
        components: ["bonnet"], line_items: [], labour_defined: false,
        parts_defined: false, labour_cost: null, parts_cost: null,
        confidence: "high", extraction_warnings: [],
      })
    );
    (invokeLLM as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeLLMResponse({
        panel_beater: "Handwritten Repairer", total_cost: 1200, currency: "USD",
        components: ["door"], line_items: [], labour_defined: false,
        parts_defined: false, labour_cost: null, parts_cost: null,
        confidence: "medium", extraction_warnings: [],
      })
    );
    // Call 5: vision extraction for the 1 group it found
    (invokeLLM as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeLLMResponse({
        panel_beater: "Formal Repairer", total_cost: 2000, currency: "USD",
        components: ["bonnet"], line_items: [], labour_defined: false,
        parts_defined: false, labour_cost: null, parts_cost: null,
        confidence: "high", extraction_warnings: [],
      })
    );

    const results = await extractMultipleQuotesFromPageImages(
      ["https://s3.example.com/page1.jpg", "https://s3.example.com/page2.jpg"],
      "Formal Repairer USD 2000 bonnet\nHandwritten Repairer USD 1200 door"
    );

    // Text path found 2 valid quotes; vision found 1 — text wins, but merge adds both
    expect(results.length).toBeGreaterThanOrEqual(2);
    const names = results.map((r) => r.panel_beater);
    expect(names).toContain("Formal Repairer");
    expect(names).toContain("Handwritten Repairer");
  });
});

describe("extractQuoteFromMultipleImageUrls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delegates to single-image path when only one URL is provided", async () => {
    (invokeLLM as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeLLMResponse({
        panel_beater: "Solo Repairer", total_cost: 800, currency: "USD",
        components: ["grille"], line_items: [], labour_defined: false,
        parts_defined: false, labour_cost: null, parts_cost: null,
        confidence: "high", extraction_warnings: [],
      })
    );

    const result = await extractQuoteFromMultipleImageUrls(
      ["https://s3.example.com/page1.jpg"],
      "Solo Repairer",
      null
    );

    expect(result.panel_beater).toBe("Solo Repairer");
    expect(result.total_cost).toBe(800);
  });

  it("sends all pages together for multi-page quotes and extracts total from last page", async () => {
    (invokeLLM as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeLLMResponse({
        panel_beater: "Multi Page Repairer", total_cost: 5500, currency: "USD",
        components: ["front bumper", "bonnet", "windscreen"],
        line_items: [
          { component: "front bumper", unit_cost: 1200, quantity: 1, line_total: 1200, action: "replace", part_origin: "unknown" },
          { component: "bonnet", unit_cost: 2800, quantity: 1, line_total: 2800, action: "replace", part_origin: "unknown" },
          { component: "windscreen", unit_cost: 1500, quantity: 1, line_total: 1500, action: "replace", part_origin: "unknown" },
        ],
        labour_defined: false, parts_defined: false, labour_cost: null, parts_cost: null,
        confidence: "high", extraction_warnings: [],
      })
    );

    const result = await extractQuoteFromMultipleImageUrls(
      [
        "https://s3.example.com/page1.jpg",
        "https://s3.example.com/page2.jpg",
      ],
      "Multi Page Repairer",
      null
    );

    expect(result.panel_beater).toBe("Multi Page Repairer");
    expect(result.total_cost).toBe(5500);
    expect(result.line_items).toHaveLength(3);
    expect(result.extraction_warnings).toContain("multi_page_image_extraction_used");
  });

  it("returns a low-confidence fallback when no URLs are provided", async () => {
    const result = await extractQuoteFromMultipleImageUrls([], null, null);
    expect(result.confidence).toBe("low");
    expect(result.total_cost).toBeNull();
  });
});
