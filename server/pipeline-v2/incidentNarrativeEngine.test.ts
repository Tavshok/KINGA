/**
 * incidentNarrativeEngine.test.ts
 *
 * Test suite for the Incident Narrative Reasoning Engine (Stage 7e).
 *
 * Strategy:
 *   1. Regex pre-pass tests — deterministic, no LLM, run in <5ms each
 *   2. Output contract tests — mock LLM, verify NarrativeAnalysis shape
 *   3. Fraud signal injection tests — verify Stage 8 picks up narrative signals
 *   4. Edge cases — empty input, too-short input, LLM failure fallback
 *
 * The LLM is mocked via vi.mock so these tests are fully deterministic.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// Mock the LLM so tests are deterministic and fast
// ─────────────────────────────────────────────────────────────────────────────

const mockLLMResponse = vi.fn();

vi.mock("../_core/llm", () => ({
  invokeLLM: (...args: any[]) => mockLLMResponse(...args),
}));

import {
  runIncidentNarrativeEngine,
  type NarrativeEngineInput,
  type NarrativeAnalysis,
} from "./incidentNarrativeEngine";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function buildInput(overrides: Partial<NarrativeEngineInput> = {}): NarrativeEngineInput {
  return {
    raw_description: "The vehicle was travelling at 90 km/h when a cow ran onto the road. The driver swerved but could not avoid the collision.",
    incident_type: "animal_strike",
    claimed_speed_kmh: 90,
    physics_plausibility_score: 78,
    physics_delta_v_kmh: 54,
    physics_impact_force_kn: 12.3,
    structural_damage: false,
    airbag_deployment: false,
    crush_depth_m: null,
    damage_components: [
      { name: "front bumper", severity: "severe", location: "front" },
      { name: "bonnet", severity: "moderate", location: "front" },
      { name: "radiator", severity: "severe", location: "front" },
    ],
    vision_summary: "Front-end damage consistent with animal strike at highway speed.",
    vehicle_make_model: "Mazda BT-50",
    ...overrides,
  };
}

function buildLLMResult(overrides: Partial<NarrativeAnalysis> = {}): NarrativeAnalysis {
  return {
    raw_description: "",
    cleaned_incident_narrative: "The vehicle was travelling at 90 km/h when a cow ran onto the road. The driver swerved but could not avoid the collision.",
    stripped_content: [],
    was_contaminated: false,
    segments: [],
    extracted_facts: {
      implied_speed_kmh: 90,
      implied_direction: "frontal",
      implied_severity: "moderate",
      animal_mentioned: true,
      animal_type: "cow",
      third_party_involved: false,
      road_condition_mentioned: false,
      time_of_day_mentioned: false,
      police_mentioned: false,
      evasive_action_taken: true,
      sequence_of_events: "Vehicle travelling at 90 km/h. Cow entered road. Driver swerved. Collision occurred.",
    },
    cross_validation: {
      physics_verdict: "CONSISTENT",
      physics_notes: "Speed of 90 km/h is consistent with physics plausibility score of 78/100.",
      damage_verdict: "CONSISTENT",
      damage_notes: "Front-end damage components match frontal animal strike narrative.",
      crush_depth_verdict: "NOT_ASSESSED",
      crush_depth_notes: "No crush depth data available.",
    },
    fraud_signals: [],
    consistency_verdict: "CONSISTENT",
    reasoning_summary: "Narrative is consistent with physics and damage evidence. No fraud signals detected.",
    confidence: 85,
    ...overrides,
  };
}

function makeLLMChoiceResponse(content: any) {
  return {
    choices: [{ message: { content: JSON.stringify(content) } }],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 1: Regex pre-pass — deterministic content stripping
// ─────────────────────────────────────────────────────────────────────────────

describe("incidentNarrativeEngine — regex pre-pass (post-incident content stripping)", () => {
  beforeEach(() => {
    mockLLMResponse.mockResolvedValue(makeLLMChoiceResponse(buildLLMResult()));
  });

  it("strips 'the vehicle was stripped...' from description", async () => {
    const result = await runIncidentNarrativeEngine(buildInput({
      raw_description: "The vehicle was travelling at 90 km/h when a cow ran onto the road. The vehicle was stripped in order to identify all damages.",
    }));
    expect(result.was_contaminated).toBe(true);
    expect(result.stripped_content.length).toBeGreaterThanOrEqual(1);
    expect(result.stripped_content.some(s => s.toLowerCase().includes("stripping"))).toBe(true);
  });

  it("strips 'upon stripping...' from description", async () => {
    const result = await runIncidentNarrativeEngine(buildInput({
      raw_description: "Vehicle hit a cow at 90 km/h. Upon stripping the vehicle, additional damage was found to the chassis.",
    }));
    expect(result.was_contaminated).toBe(true);
    expect(result.stripped_content.some(s => s.includes("stripping/inspection note"))).toBe(true);
  });

  it("strips 'seatbelts were...' from description", async () => {
    const result = await runIncidentNarrativeEngine(buildInput({
      raw_description: "Driver was travelling at 90 km/h and struck a cow. Seatbelts were deployed and need replacement.",
    }));
    expect(result.was_contaminated).toBe(true);
    expect(result.stripped_content.some(s => s.toLowerCase().includes("seatbelt"))).toBe(true);
  });

  it("strips 'extras quotation...' from description", async () => {
    const result = await runIncidentNarrativeEngine(buildInput({
      raw_description: "Vehicle struck a cow at highway speed. Extras quotation submitted for airbag reprogramming.",
    }));
    expect(result.was_contaminated).toBe(true);
    expect(result.stripped_content.some(s => s.toLowerCase().includes("extras quotation"))).toBe(true);
  });

  it("strips 'reprogramming included...' from description", async () => {
    const result = await runIncidentNarrativeEngine(buildInput({
      raw_description: "Vehicle struck a cow at 90 km/h causing front-end damage. Reprogramming included in the repair scope.",
    }));
    expect(result.was_contaminated).toBe(true);
    expect(result.stripped_content.some(s => s.toLowerCase().includes("reprogramming"))).toBe(true);
  });

  it("strips 'the assessor noted...' from description", async () => {
    const result = await runIncidentNarrativeEngine(buildInput({
      raw_description: "Vehicle hit a cow at 90 km/h. The assessor noted that the radiator support was also damaged.",
    }));
    expect(result.was_contaminated).toBe(true);
    expect(result.stripped_content.some(s => s.toLowerCase().includes("assessor observation"))).toBe(true);
  });

  it("strips 'we inspected...' from description", async () => {
    const result = await runIncidentNarrativeEngine(buildInput({
      raw_description: "Vehicle struck a cow on the highway. We inspected the vehicle and found hidden damage to the subframe.",
    }));
    expect(result.was_contaminated).toBe(true);
    expect(result.stripped_content.some(s => s.toLowerCase().includes("inspection finding"))).toBe(true);
  });

  it("strips 'found additional damage...' from description", async () => {
    const result = await runIncidentNarrativeEngine(buildInput({
      raw_description: "Driver hit a cow at 90 km/h on the Harare-Bulawayo road. Found additional damage to the engine mounts during repair.",
    }));
    expect(result.was_contaminated).toBe(true);
    expect(result.stripped_content.some(s => s.toLowerCase().includes("additional damage"))).toBe(true);
  });

  it("does NOT strip a clean incident-only description", async () => {
    const result = await runIncidentNarrativeEngine(buildInput({
      raw_description: "The vehicle was travelling at 90 km/h when a cow ran onto the road. The driver swerved but could not avoid the collision. The front bumper and bonnet were damaged.",
    }));
    expect(result.stripped_content.length).toBe(0);
    // was_contaminated may still be true if LLM finds issues, but regex pre-pass should not strip
    // We check that stripped_content from the pre-pass is empty
  });

  it("strips multiple post-incident patterns from the same description", async () => {
    const result = await runIncidentNarrativeEngine(buildInput({
      raw_description: "Vehicle hit a cow at 90 km/h. The vehicle was stripped in order to identify all damages. Seatbelts were deployed. Extras quotation submitted for reprogramming.",
    }));
    expect(result.was_contaminated).toBe(true);
    expect(result.stripped_content.length).toBeGreaterThanOrEqual(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 2: Output contract — NarrativeAnalysis shape is always valid
// ─────────────────────────────────────────────────────────────────────────────

describe("incidentNarrativeEngine — output contract (NarrativeAnalysis shape)", () => {
  beforeEach(() => {
    mockLLMResponse.mockResolvedValue(makeLLMChoiceResponse(buildLLMResult()));
  });

  it("always returns raw_description matching input", async () => {
    const input = buildInput();
    const result = await runIncidentNarrativeEngine(input);
    expect(result.raw_description).toBe(input.raw_description);
  });

  it("always returns a non-empty cleaned_incident_narrative", async () => {
    const result = await runIncidentNarrativeEngine(buildInput());
    expect(typeof result.cleaned_incident_narrative).toBe("string");
    expect(result.cleaned_incident_narrative.length).toBeGreaterThan(0);
  });

  it("always returns stripped_content as an array", async () => {
    const result = await runIncidentNarrativeEngine(buildInput());
    expect(Array.isArray(result.stripped_content)).toBe(true);
  });

  it("always returns fraud_signals as an array", async () => {
    const result = await runIncidentNarrativeEngine(buildInput());
    expect(Array.isArray(result.fraud_signals)).toBe(true);
  });

  it("always returns a valid consistency_verdict", async () => {
    const result = await runIncidentNarrativeEngine(buildInput());
    const validVerdicts = ["CONSISTENT", "MINOR_DISCREPANCY", "INCONSISTENT", "INSUFFICIENT_DATA", "CONTAMINATED"];
    expect(validVerdicts).toContain(result.consistency_verdict);
  });

  it("always returns confidence between 0 and 100", async () => {
    const result = await runIncidentNarrativeEngine(buildInput());
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(100);
  });

  it("always returns cross_validation with all three verdict fields", async () => {
    const result = await runIncidentNarrativeEngine(buildInput());
    expect(result.cross_validation).toBeDefined();
    expect(result.cross_validation.physics_verdict).toBeDefined();
    expect(result.cross_validation.damage_verdict).toBeDefined();
    expect(result.cross_validation.crush_depth_verdict).toBeDefined();
  });

  it("always returns extracted_facts with required fields", async () => {
    const result = await runIncidentNarrativeEngine(buildInput());
    const facts = result.extracted_facts;
    expect(facts).toBeDefined();
    expect(typeof facts.animal_mentioned).toBe("boolean");
    expect(typeof facts.third_party_involved).toBe("boolean");
    expect(typeof facts.evasive_action_taken).toBe("boolean");
    expect(typeof facts.sequence_of_events).toBe("string");
  });

  it("always returns a reasoning_summary string", async () => {
    const result = await runIncidentNarrativeEngine(buildInput());
    expect(typeof result.reasoning_summary).toBe("string");
    expect(result.reasoning_summary.length).toBeGreaterThan(0);
  });

  it("returns INSUFFICIENT_DATA and confidence=0 for empty description", async () => {
    const result = await runIncidentNarrativeEngine(buildInput({ raw_description: "" }));
    expect(result.consistency_verdict).toBe("INSUFFICIENT_DATA");
    expect(result.confidence).toBe(0);
    expect(result.fraud_signals).toHaveLength(0);
  });

  it("returns INSUFFICIENT_DATA for very short description (< 10 chars)", async () => {
    const result = await runIncidentNarrativeEngine(buildInput({ raw_description: "Hit cow" }));
    expect(result.consistency_verdict).toBe("INSUFFICIENT_DATA");
    expect(result.confidence).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 3: LLM failure fallback — engine must not crash
// ─────────────────────────────────────────────────────────────────────────────

describe("incidentNarrativeEngine — LLM failure fallback", () => {
  it("returns a degraded result (INSUFFICIENT_DATA, confidence=0) when LLM throws", async () => {
    mockLLMResponse.mockRejectedValue(new Error("LLM service unavailable"));
    const result = await runIncidentNarrativeEngine(buildInput());
    expect(result.consistency_verdict).toBe("INSUFFICIENT_DATA");
    expect(result.confidence).toBe(0);
    expect(result.fraud_signals).toHaveLength(0);
    // cleaned_incident_narrative should fall back to the pre-cleaned text
    expect(typeof result.cleaned_incident_narrative).toBe("string");
  });

  it("returns a degraded result when LLM returns empty response", async () => {
    mockLLMResponse.mockResolvedValue({ choices: [{ message: { content: "" } }] });
    const result = await runIncidentNarrativeEngine(buildInput());
    expect(result.consistency_verdict).toBe("INSUFFICIENT_DATA");
    expect(result.confidence).toBe(0);
  });

  it("returns a degraded result when LLM returns null choices", async () => {
    mockLLMResponse.mockResolvedValue({ choices: null });
    const result = await runIncidentNarrativeEngine(buildInput());
    expect(result.consistency_verdict).toBe("INSUFFICIENT_DATA");
  });

  it("does NOT throw even when LLM returns malformed JSON", async () => {
    mockLLMResponse.mockResolvedValue({ choices: [{ message: { content: "not valid json {{" } }] });
    await expect(runIncidentNarrativeEngine(buildInput())).resolves.toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 4: Fraud signal injection — Stage 8 integration contract
// ─────────────────────────────────────────────────────────────────────────────

describe("incidentNarrativeEngine — fraud signal output for Stage 8 injection", () => {
  it("returns fraud signals with required fields when LLM detects inconsistency", async () => {
    mockLLMResponse.mockResolvedValue(makeLLMChoiceResponse(buildLLMResult({
      fraud_signals: [
        {
          code: "NARRATIVE_PHYSICS_MISMATCH",
          description: "Narrative describes a minor bump but physics shows high-energy impact.",
          severity: "HIGH",
          score_contribution: 20,
          evidence: "minor bump",
        },
      ],
      consistency_verdict: "INCONSISTENT",
    })));

    const result = await runIncidentNarrativeEngine(buildInput({
      raw_description: "The vehicle had a minor bump with a cow. No significant damage.",
    }));

    expect(result.fraud_signals.length).toBeGreaterThanOrEqual(1);
    const signal = result.fraud_signals[0];
    expect(signal.code).toBe("NARRATIVE_PHYSICS_MISMATCH");
    expect(signal.severity).toBe("HIGH");
    expect(signal.score_contribution).toBeGreaterThan(0);
    expect(typeof signal.description).toBe("string");
    expect(typeof signal.evidence).toBe("string");
  });

  it("fraud signal score_contribution is a positive number", async () => {
    mockLLMResponse.mockResolvedValue(makeLLMChoiceResponse(buildLLMResult({
      fraud_signals: [
        { code: "NARRATIVE_VAGUE_OR_TEMPLATED", description: "Description is suspiciously generic.", severity: "MEDIUM", score_contribution: 12, evidence: "generic text" },
      ],
    })));

    const result = await runIncidentNarrativeEngine(buildInput());
    expect(result.fraud_signals[0].score_contribution).toBeGreaterThan(0);
  });

  it("fraud signal severity is one of LOW | MEDIUM | HIGH", async () => {
    mockLLMResponse.mockResolvedValue(makeLLMChoiceResponse(buildLLMResult({
      fraud_signals: [
        { code: "NARRATIVE_MISSING_KEY_FACTS", description: "No location or time mentioned.", severity: "LOW", score_contribution: 5, evidence: "" },
      ],
    })));

    const result = await runIncidentNarrativeEngine(buildInput());
    expect(["LOW", "MEDIUM", "HIGH"]).toContain(result.fraud_signals[0].severity);
  });

  it("clean claim returns zero fraud signals", async () => {
    mockLLMResponse.mockResolvedValue(makeLLMChoiceResponse(buildLLMResult({ fraud_signals: [] })));
    const result = await runIncidentNarrativeEngine(buildInput());
    expect(result.fraud_signals).toHaveLength(0);
    expect(result.consistency_verdict).toBe("CONSISTENT");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 5: Cross-validation verdicts
// ─────────────────────────────────────────────────────────────────────────────

describe("incidentNarrativeEngine — cross-validation verdicts", () => {
  it("physics_verdict is CONSISTENT when narrative speed matches physics plausibility", async () => {
    mockLLMResponse.mockResolvedValue(makeLLMChoiceResponse(buildLLMResult({
      cross_validation: {
        physics_verdict: "CONSISTENT",
        physics_notes: "90 km/h speed consistent with plausibility score 78.",
        damage_verdict: "CONSISTENT",
        damage_notes: "Front-end damage matches frontal impact.",
        crush_depth_verdict: "NOT_ASSESSED",
        crush_depth_notes: "No crush depth data.",
      },
    })));

    const result = await runIncidentNarrativeEngine(buildInput());
    expect(result.cross_validation.physics_verdict).toBe("CONSISTENT");
  });

  it("damage_verdict is INCONSISTENT when narrative describes rear damage for frontal strike", async () => {
    mockLLMResponse.mockResolvedValue(makeLLMChoiceResponse(buildLLMResult({
      cross_validation: {
        physics_verdict: "CONSISTENT",
        physics_notes: "Speed plausible.",
        damage_verdict: "INCONSISTENT",
        damage_notes: "Narrative describes frontal impact but damage components show rear-only damage.",
        crush_depth_verdict: "NOT_ASSESSED",
        crush_depth_notes: "No crush depth data.",
      },
      fraud_signals: [
        { code: "NARRATIVE_DAMAGE_MISMATCH", description: "Damage zones contradict narrative direction.", severity: "HIGH", score_contribution: 20, evidence: "rear damage only" },
      ],
      consistency_verdict: "INCONSISTENT",
    })));

    const result = await runIncidentNarrativeEngine(buildInput({
      damage_components: [
        { name: "boot lid", severity: "severe", location: "rear" },
        { name: "rear bumper", severity: "moderate", location: "rear" },
      ],
    }));

    expect(result.cross_validation.damage_verdict).toBe("INCONSISTENT");
    expect(result.fraud_signals.some(s => s.code === "NARRATIVE_DAMAGE_MISMATCH")).toBe(true);
  });

  it("returns NOT_ASSESSED for physics when no physics data is provided", async () => {
    mockLLMResponse.mockResolvedValue(makeLLMChoiceResponse(buildLLMResult({
      cross_validation: {
        physics_verdict: "NOT_ASSESSED",
        physics_notes: "Physics engine data not available.",
        damage_verdict: "NOT_ASSESSED",
        damage_notes: "No damage components.",
        crush_depth_verdict: "NOT_ASSESSED",
        crush_depth_notes: "No crush depth data.",
      },
    })));

    const result = await runIncidentNarrativeEngine(buildInput({
      physics_plausibility_score: null,
      physics_delta_v_kmh: null,
      physics_impact_force_kn: null,
      damage_components: [],
    }));

    expect(result.cross_validation.physics_verdict).toBe("NOT_ASSESSED");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 6: Contamination detection
// ─────────────────────────────────────────────────────────────────────────────

describe("incidentNarrativeEngine — contamination detection", () => {
  it("was_contaminated is true when regex pre-pass strips content", async () => {
    mockLLMResponse.mockResolvedValue(makeLLMChoiceResponse(buildLLMResult()));
    const result = await runIncidentNarrativeEngine(buildInput({
      raw_description: "Vehicle hit a cow at 90 km/h. The vehicle was stripped in order to identify all damages.",
    }));
    expect(result.was_contaminated).toBe(true);
  });

  it("was_contaminated is false for a clean description with no LLM non-incident segments", async () => {
    mockLLMResponse.mockResolvedValue(makeLLMChoiceResponse(buildLLMResult({
      segments: [{ text: "Vehicle hit cow at 90 km/h.", isIncident: true, classification_reason: "Direct incident description." }],
      was_contaminated: false,
    })));
    const result = await runIncidentNarrativeEngine(buildInput({
      raw_description: "Vehicle hit cow at 90 km/h on the Harare-Bulawayo road.",
    }));
    expect(result.was_contaminated).toBe(false);
  });

  it("consistency_verdict is CONTAMINATED when narrative is heavily contaminated", async () => {
    mockLLMResponse.mockResolvedValue(makeLLMChoiceResponse(buildLLMResult({
      consistency_verdict: "CONTAMINATED",
      was_contaminated: true,
    })));
    const result = await runIncidentNarrativeEngine(buildInput({
      raw_description: "Vehicle hit a cow. The vehicle was stripped in order to identify all damages. We inspected the vehicle and found hidden damage. Extras quotation submitted. Seatbelts were deployed.",
    }));
    expect(result.was_contaminated).toBe(true);
    expect(result.consistency_verdict).toBe("CONTAMINATED");
  });
});
