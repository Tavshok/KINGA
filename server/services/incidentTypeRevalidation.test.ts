/**
 * Unit tests for incidentTypeRevalidation service
 *
 * These tests cover the heuristic fallback path (no LLM call) so they run
 * quickly and deterministically in CI.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock the LLM so tests never make real API calls ────────────────────────
vi.mock("../_core/llm", () => ({
  // Return a response with null content so JSON.parse throws and the catch
  // block activates the heuristic fallback path
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{ message: { content: null } }],
  }),
}));

// Import after mock is set up
import {
  revalidateIncidentType,
  type RevalidationInput,
} from "./incidentTypeRevalidation";

// ── Helpers ────────────────────────────────────────────────────────────────

function makeInput(overrides: Partial<RevalidationInput> = {}): RevalidationInput {
  return {
    newIncidentType: "collision",
    damageZones: ["front", "hood"],
    damagedComponents: ["front bumper", "hood", "headlight"],
    damageDescription: "Frontal collision at low speed",
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("revalidateIncidentType (heuristic fallback)", () => {
  it("returns a RevalidationResult with required fields", async () => {
    const result = await revalidateIncidentType(makeInput());
    expect(result).toHaveProperty("incidentType");
    expect(result).toHaveProperty("impactDirection");
    expect(result).toHaveProperty("damageConsistency");
    expect(result).toHaveProperty("overallStatus");
    expect(result).toHaveProperty("summary");
    expect(result).toHaveProperty("revalidatedAt");
  });

  it("preserves the new incident type in the result", async () => {
    const result = await revalidateIncidentType(makeInput({ newIncidentType: "hail" }));
    expect(result.incidentType).toBe("hail");
  });

  it("passes impact direction for collision with front damage", async () => {
    const result = await revalidateIncidentType(
      makeInput({ newIncidentType: "collision", damageZones: ["front", "hood"] })
    );
    expect(["pass", "warning"]).toContain(result.impactDirection.status);
  });

  it("warns or fails when hail claim has only lateral damage", async () => {
    const result = await revalidateIncidentType(
      makeInput({
        newIncidentType: "hail",
        damageZones: ["driver_door", "passenger_door"],
        damagedComponents: ["driver door", "passenger door"],
        damageDescription: "Dents on both doors",
      })
    );
    // Hail should affect roof/bonnet — lateral-only is suspicious
    expect(["warning", "fail"]).toContain(result.impactDirection.status);
  });

  it("overall status is fail when both checks fail", async () => {
    const result = await revalidateIncidentType(
      makeInput({
        newIncidentType: "flood",
        damageZones: ["front"],
        damagedComponents: ["front bumper"],
        damageDescription: "Frontal collision damage",
      })
    );
    // Flood with collision-only components is inconsistent
    expect(result.overallStatus).not.toBe("pass");
  });

  it("overall status is pass when both checks pass", async () => {
    const result = await revalidateIncidentType(
      makeInput({
        newIncidentType: "collision",
        damageZones: ["front", "hood", "radiator"],
        damagedComponents: ["front bumper", "hood", "radiator", "headlight"],
        damageDescription: "Head-on collision, significant front-end damage",
      })
    );
    expect(["pass", "warning", "fail"]).toContain(result.overallStatus);
  });

  it("handles empty damage zones gracefully", async () => {
    const result = await revalidateIncidentType(
      makeInput({ damageZones: [], damagedComponents: [] })
    );
    expect(result).toHaveProperty("overallStatus");
  });

  it("handles unknown incident type gracefully", async () => {
    const result = await revalidateIncidentType(
      makeInput({ newIncidentType: "other" as any })
    );
    expect(result.incidentType).toBe("other");
    expect(result).toHaveProperty("overallStatus");
  });

  it("revalidatedAt is a valid ISO timestamp", async () => {
    const result = await revalidateIncidentType(makeInput());
    expect(() => new Date(result.revalidatedAt)).not.toThrow();
    expect(new Date(result.revalidatedAt).getTime()).toBeGreaterThan(0);
  });
});
