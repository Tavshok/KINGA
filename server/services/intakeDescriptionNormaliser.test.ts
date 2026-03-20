/**
 * Unit tests for intakeDescriptionNormaliser.ts
 *
 * Tests the fallback behaviour (no LLM call) and the output shape.
 * LLM calls are mocked so tests run offline.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the LLM module before importing the service
vi.mock("../_core/llm", () => ({
  invokeLLM: vi.fn(),
}));

import { invokeLLM } from "../_core/llm";
import { normaliseIncidentDescription } from "./intakeDescriptionNormaliser";

const mockInvokeLLM = invokeLLM as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("normaliseIncidentDescription", () => {
  it("returns fallback for empty input", async () => {
    const result = await normaliseIncidentDescription("");
    expect(result.normalisedText).toBe("");
    expect(result.meaningPreserved).toBe(true);
    expect(result.confidence).toBe(0);
    expect(mockInvokeLLM).not.toHaveBeenCalled();
  });

  it("returns fallback for very short input (< 5 chars)", async () => {
    const result = await normaliseIncidentDescription("hit");
    expect(result.normalisedText).toBe("hit");
    expect(result.confidence).toBe(0);
    expect(mockInvokeLLM).not.toHaveBeenCalled();
  });

  it("returns cleaned text when LLM succeeds and meaning is preserved", async () => {
    mockInvokeLLM.mockResolvedValueOnce({
      choices: [{
        message: {
          content: JSON.stringify({
            normalisedText: "The vehicle collided with a cow on the N1 highway at approximately 80 km/h.",
            meaningPreserved: true,
            reportedCauseLabel: "animal strike",
            confidence: 85,
          }),
        },
      }],
    });

    const result = await normaliseIncidentDescription("i hit a cow on the n1 going fast");
    expect(result.normalisedText).toBe("The vehicle collided with a cow on the N1 highway at approximately 80 km/h.");
    expect(result.originalText).toBe("i hit a cow on the n1 going fast");
    expect(result.meaningPreserved).toBe(true);
    expect(result.reportedCauseLabel).toBe("animal strike");
    expect(result.confidence).toBe(85);
  });

  it("falls back to original text when LLM says meaning was NOT preserved", async () => {
    mockInvokeLLM.mockResolvedValueOnce({
      choices: [{
        message: {
          content: JSON.stringify({
            normalisedText: "The vehicle was involved in a high-speed frontal collision with a large bovine.",
            meaningPreserved: false, // LLM added assumptions
            reportedCauseLabel: "animal strike",
            confidence: 40,
          }),
        },
      }],
    });

    const raw = "i hit a cow";
    const result = await normaliseIncidentDescription(raw);
    // Must fall back to original because meaning was not preserved
    expect(result.normalisedText).toBe(raw);
    expect(result.originalText).toBe(raw);
    expect(result.meaningPreserved).toBe(true); // fallback always sets this to true
    // reportedCauseLabel is still captured from the LLM response
    expect(result.reportedCauseLabel).toBe("animal strike");
  });

  it("returns fallback when LLM call throws an error", async () => {
    mockInvokeLLM.mockRejectedValueOnce(new Error("LLM timeout"));

    const raw = "vehicle was rear-ended at the traffic light";
    const result = await normaliseIncidentDescription(raw);
    expect(result.normalisedText).toBe(raw);
    expect(result.originalText).toBe(raw);
    expect(result.confidence).toBe(0);
  });

  it("returns fallback when LLM returns null content", async () => {
    mockInvokeLLM.mockResolvedValueOnce({
      choices: [{ message: { content: null } }],
    });

    const raw = "vehicle hit a pothole and lost control";
    const result = await normaliseIncidentDescription(raw);
    expect(result.normalisedText).toBe(raw);
    expect(result.confidence).toBe(0);
  });

  it("extracts null reportedCauseLabel when cause is not identifiable", async () => {
    mockInvokeLLM.mockResolvedValueOnce({
      choices: [{
        message: {
          content: JSON.stringify({
            normalisedText: "The vehicle sustained damage under unclear circumstances.",
            meaningPreserved: true,
            reportedCauseLabel: null,
            confidence: 30,
          }),
        },
      }],
    });

    const result = await normaliseIncidentDescription("the car got damaged somehow");
    expect(result.reportedCauseLabel).toBeNull();
    expect(result.confidence).toBe(30);
  });

  it("does not overwrite normalisedText with original when they are identical", async () => {
    const raw = "Vehicle collided with another vehicle at the intersection.";
    mockInvokeLLM.mockResolvedValueOnce({
      choices: [{
        message: {
          content: JSON.stringify({
            normalisedText: raw, // LLM returns same text — no change needed
            meaningPreserved: true,
            reportedCauseLabel: "frontal collision",
            confidence: 95,
          }),
        },
      }],
    });

    const result = await normaliseIncidentDescription(raw);
    // normalisedText should be null in the stored record when identical to original
    // (the router sets normalisedDescription: null when texts match)
    // Here we just check the service returns the text correctly
    expect(result.normalisedText).toBe(raw);
    expect(result.reportedCauseLabel).toBe("frontal collision");
  });
});
