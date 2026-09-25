/**
 * Regression tests for the component-outcome learning write path.
 *
 * P0-B1 forbids historic fraud score/level data from governing whether a
 * component repair outcome is recorded. This suite covers only the remaining
 * explicit-outcome write contract.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mockExecute = vi.fn();
const mockPool = { execute: mockExecute };

vi.mock("../db", async importOriginal => {
  const actual = await importOriginal<typeof import("../db")>();
  return { ...actual, getRawPool: vi.fn() };
});

import { getRawPool } from "../db";
import {
  recordFinalizedOutcome,
  type OutcomeRecordResult,
} from "./repairReplaceEngine";

function baseParams(
  overrides: Partial<Parameters<typeof recordFinalizedOutcome>[0]> = {}
) {
  return {
    claimId: 42,
    assessmentId: 99,
    componentName: "Front Bumper",
    componentCategory: "panel",
    severityAtDecision: "moderate",
    vehicleMake: "Toyota",
    vehicleModel: "Fortuner",
    vehicleYear: 2021,
    outcome: "repair" as const,
    aiSuggestion: "repair" as const,
    ...overrides,
  };
}

describe("component outcome learning P0-B1 boundary", () => {
  beforeEach(() => {
    mockExecute.mockReset();
    vi.mocked(getRawPool).mockResolvedValue(mockPool as never);
  });

  it("records an explicit outcome without reading or applying a historic fraud score", async () => {
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

    const result: OutcomeRecordResult =
      await recordFinalizedOutcome(baseParams());

    expect(result).toEqual({ recorded: true });
    expect(mockExecute).toHaveBeenCalledTimes(1);
    const [sql] = mockExecute.mock.calls[0];
    expect(sql).toContain("component_repair_outcomes");
    expect(sql).not.toMatch(/fraud|claims|threshold/i);
  });

  it("uses INSERT IGNORE for automatic finalization", async () => {
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

    await recordFinalizedOutcome(baseParams({ isAdjusterCorrection: false }));

    const [sql] = mockExecute.mock.calls[0];
    expect(sql.toUpperCase()).toContain("INSERT IGNORE");
    expect(sql.toUpperCase()).not.toContain("ON DUPLICATE KEY UPDATE");
  });

  it("uses UPSERT for an explicit adjuster correction without a fraud gate", async () => {
    mockExecute.mockResolvedValueOnce([{ affectedRows: 2 }, []]);

    const result = await recordFinalizedOutcome(
      baseParams({ isAdjusterCorrection: true })
    );

    expect(result).toEqual({ recorded: true });
    expect(mockExecute).toHaveBeenCalledTimes(1);
    const [sql] = mockExecute.mock.calls[0];
    expect(sql.toUpperCase()).toContain("ON DUPLICATE KEY UPDATE");
    expect(sql.toUpperCase()).not.toContain("INSERT IGNORE");
    expect(sql).not.toMatch(/fraud|claims|threshold/i);
  });

  it("returns the remaining fail-safe skip only when the pool is unavailable", async () => {
    vi.mocked(getRawPool).mockResolvedValue(null as never);

    const result = await recordFinalizedOutcome(baseParams());

    expect(result.recorded).toBe(false);
    expect(result.skippedReason).toMatch(/pool unavailable/i);
    expect(typeof result.skippedReason).toBe("string");
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("propagates a write failure instead of mislabeling it as a removed fraud guard", async () => {
    mockExecute.mockRejectedValueOnce(new Error("DB connection lost"));

    await expect(recordFinalizedOutcome(baseParams())).rejects.toThrow(
      "DB connection lost"
    );
  });
});
