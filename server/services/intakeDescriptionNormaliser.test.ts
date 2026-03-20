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
    expect(result.keyFacts).toEqual([]);
    expect(mockInvokeLLM).not.toHaveBeenCalled();
  });

  it("returns fallback for very short input (< 5 chars)", async () => {
    const result = await normaliseIncidentDescription("hit");
    expect(result.normalisedText).toBe("hit");
    expect(result.confidence).toBe(0);
    expect(result.keyFacts).toEqual([]);
    expect(mockInvokeLLM).not.toHaveBeenCalled();
  });

  it("returns cleaned text, cause label, and key facts when LLM succeeds", async () => {
    mockInvokeLLM.mockResolvedValueOnce({
      choices: [{
        message: {
          content: JSON.stringify({
            normalisedText: "The vehicle collided with a cow on the N1 highway at approximately 80 km/h.",
            reportedCauseLabel: "animal strike",
            keyFacts: [
              "Vehicle collided with a cow",
              "Incident occurred on the N1 highway",
              "Estimated speed: 80 km/h",
            ],
            meaningPreserved: true,
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
    expect(result.keyFacts).toHaveLength(3);
    expect(result.keyFacts[0]).toContain("cow");
    expect(result.confidence).toBe(85);
  });

  it("falls back to original text but preserves metadata when LLM says meaning was NOT preserved", async () => {
    mockInvokeLLM.mockResolvedValueOnce({
      choices: [{
        message: {
          content: JSON.stringify({
            normalisedText: "The vehicle was involved in a high-speed frontal collision with a large bovine.",
            reportedCauseLabel: "animal strike",
            keyFacts: ["Vehicle hit a cow", "High speed impact"],
            meaningPreserved: false, // LLM added assumptions
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
    // reportedCauseLabel and keyFacts are still captured from the LLM response
    expect(result.reportedCauseLabel).toBe("animal strike");
    expect(result.keyFacts).toHaveLength(2);
  });

  it("returns fallback when LLM call throws an error", async () => {
    mockInvokeLLM.mockRejectedValueOnce(new Error("LLM timeout"));

    const raw = "vehicle was rear-ended at the traffic light";
    const result = await normaliseIncidentDescription(raw);
    expect(result.normalisedText).toBe(raw);
    expect(result.originalText).toBe(raw);
    expect(result.confidence).toBe(0);
    expect(result.keyFacts).toEqual([]);
  });

  it("returns fallback when LLM returns null content", async () => {
    mockInvokeLLM.mockResolvedValueOnce({
      choices: [{ message: { content: null } }],
    });

    const raw = "vehicle hit a pothole and lost control";
    const result = await normaliseIncidentDescription(raw);
    expect(result.normalisedText).toBe(raw);
    expect(result.confidence).toBe(0);
    expect(result.keyFacts).toEqual([]);
  });

  it("extracts null reportedCauseLabel and empty keyFacts when cause is not identifiable", async () => {
    mockInvokeLLM.mockResolvedValueOnce({
      choices: [{
        message: {
          content: JSON.stringify({
            normalisedText: "The vehicle sustained damage under unclear circumstances.",
            reportedCauseLabel: null,
            keyFacts: [],
            meaningPreserved: true,
            confidence: 30,
          }),
        },
      }],
    });

    const result = await normaliseIncidentDescription("the car got damaged somehow");
    expect(result.reportedCauseLabel).toBeNull();
    expect(result.keyFacts).toEqual([]);
    expect(result.confidence).toBe(30);
  });

  it("handles non-array keyFacts gracefully by defaulting to empty array", async () => {
    mockInvokeLLM.mockResolvedValueOnce({
      choices: [{
        message: {
          content: JSON.stringify({
            normalisedText: "Vehicle collided with another vehicle at the intersection.",
            reportedCauseLabel: "frontal collision",
            keyFacts: null, // malformed — should default to []
            meaningPreserved: true,
            confidence: 95,
          }),
        },
      }],
    });

    const result = await normaliseIncidentDescription("car crash at intersection");
    expect(result.keyFacts).toEqual([]);
    expect(result.reportedCauseLabel).toBe("frontal collision");
  });

  it("uses the exact INPUT/TASK prompt format in the LLM call", async () => {
    mockInvokeLLM.mockResolvedValueOnce({
      choices: [{
        message: {
          content: JSON.stringify({
            normalisedText: "The vehicle was struck from behind.",
            reportedCauseLabel: "rear-end collision",
            keyFacts: ["Vehicle struck from behind"],
            meaningPreserved: true,
            confidence: 90,
          }),
        },
      }],
    });

    const raw = "someone hit me from behind";
    await normaliseIncidentDescription(raw);

    const callArgs = mockInvokeLLM.mock.calls[0][0];
    const userMessage = callArgs.messages.find((m: { role: string }) => m.role === "user");
    expect(userMessage.content).toContain("INPUT:");
    expect(userMessage.content).toContain(raw);
    expect(userMessage.content).toContain("TASK:");
    expect(userMessage.content).toContain("Cleaned incident description");
    expect(userMessage.content).toContain("Extracted reported cause");
    expect(userMessage.content).toContain("Key facts");
    expect(userMessage.content).toContain("Return JSON.");
  });
});
