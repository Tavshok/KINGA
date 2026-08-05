/**
 * componentRepairOutcomes.test.ts
 *
 * Regression tests for the benchmark learning loop write path.
 *
 * Coverage areas:
 *   1. G-1 Fraud Guard — claims with fraud_risk_score >= 50 are excluded
 *   2. G-1 Fraud Guard — claims with fraud_risk_score < 50 are allowed through
 *   3. G-1 Fraud Guard — claims with null fraud_risk_score are allowed through
 *   4. G-1 Fraud Guard — pool unavailable → write skipped (fail-safe)
 *   5. G-1 Fraud Guard — guard query failure → write skipped (fail-safe)
 *   6. Finalization path (isAdjusterCorrection: false) — INSERT IGNORE
 *   7. Adjuster correction path (isAdjusterCorrection: true) — UPSERT
 *   8. OutcomeRecordResult shape — recorded + skippedReason fields
 *
 * Strategy: The module uses `getRawPool()` for DB access. We mock that module
 * so no real DB connection is required. This keeps the tests fast and
 * deterministic while exercising the full guard + write logic.
 *
 * Author: Tavonga Shoko (Lead Engineer)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock the DB pool module ─────────────────────────────────────────────────
// The repairReplaceEngine imports getRawPool from server/db.ts.
// We mock the entire module so execute() is controllable per test.

const mockExecute = vi.fn();
const mockPool = { execute: mockExecute };

vi.mock("../db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../db")>();
  return {
    ...actual,
    getRawPool: vi.fn(),
  };
});

import { getRawPool } from "../db";
import {
  recordFinalizedOutcome,
  type OutcomeRecordResult,
} from "./repairReplaceEngine";

// ─── Shared test fixture ─────────────────────────────────────────────────────

function baseParams(overrides: Partial<Parameters<typeof recordFinalizedOutcome>[0]> = {}) {
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

// ─── 1. G-1 Guard: high fraud score → excluded ───────────────────────────────

describe("G-1 Fraud Guard — exclusion", () => {
  beforeEach(() => {
    vi.mocked(getRawPool).mockResolvedValue(mockPool as never);
  });

  it("returns recorded=false and skippedReason when fraud_risk_score >= 50", async () => {
    // First execute call: fraud guard query
    mockExecute.mockResolvedValueOnce([[{ fraud_risk_score: 50 }], []]);

    const result: OutcomeRecordResult = await recordFinalizedOutcome(baseParams());

    expect(result.recorded).toBe(false);
    expect(result.skippedReason).toMatch(/G-1/);
    expect(result.skippedReason).toMatch(/50/);
  });

  it("returns recorded=false when fraud_risk_score is 80 (well above threshold)", async () => {
    mockExecute.mockResolvedValueOnce([[{ fraud_risk_score: 80 }], []]);

    const result = await recordFinalizedOutcome(baseParams());

    expect(result.recorded).toBe(false);
    expect(result.skippedReason).toMatch(/G-1/);
  });

  it("returns recorded=false when fraud_risk_score is 100 (maximum)", async () => {
    mockExecute.mockResolvedValueOnce([[{ fraud_risk_score: 100 }], []]);

    const result = await recordFinalizedOutcome(baseParams());

    expect(result.recorded).toBe(false);
  });
});

// ─── 2. G-1 Guard: low fraud score → allowed ─────────────────────────────────

describe("G-1 Fraud Guard — admission", () => {
  beforeEach(() => {
    vi.mocked(getRawPool).mockResolvedValue(mockPool as never);
  });

  it("proceeds to write when fraud_risk_score is 49 (just below threshold)", async () => {
    // First call: guard query returns score 49
    mockExecute.mockResolvedValueOnce([[{ fraud_risk_score: 49 }], []]);
    // Second call: the actual INSERT
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

    const result = await recordFinalizedOutcome(baseParams());

    expect(result.recorded).toBe(true);
    expect(result.skippedReason).toBeUndefined();
  });

  it("proceeds to write when fraud_risk_score is 0 (minimum)", async () => {
    mockExecute.mockResolvedValueOnce([[{ fraud_risk_score: 0 }], []]);
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

    const result = await recordFinalizedOutcome(baseParams());

    expect(result.recorded).toBe(true);
  });

  it("proceeds to write when fraud_risk_score is 10 (minimal risk band)", async () => {
    mockExecute.mockResolvedValueOnce([[{ fraud_risk_score: 10 }], []]);
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

    const result = await recordFinalizedOutcome(baseParams());

    expect(result.recorded).toBe(true);
  });
});

// ─── 3. G-1 Guard: null fraud score → allowed ────────────────────────────────

describe("G-1 Fraud Guard — null score", () => {
  beforeEach(() => {
    vi.mocked(getRawPool).mockResolvedValue(mockPool as never);
  });

  it("allows write when fraud_risk_score is null (no signal to exclude on)", async () => {
    mockExecute.mockResolvedValueOnce([[{ fraud_risk_score: null }], []]);
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

    const result = await recordFinalizedOutcome(baseParams());

    expect(result.recorded).toBe(true);
  });

  it("allows write when claim row has no fraud_risk_score field", async () => {
    mockExecute.mockResolvedValueOnce([[{}], []]); // row with no fraud_risk_score key
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

    const result = await recordFinalizedOutcome(baseParams());

    expect(result.recorded).toBe(true);
  });
});

// ─── 4. G-1 Guard: pool unavailable → fail-safe skip ─────────────────────────

describe("G-1 Fraud Guard — pool unavailable", () => {
  it("returns recorded=false when getRawPool returns null", async () => {
    vi.mocked(getRawPool).mockResolvedValue(null as never);

    const result = await recordFinalizedOutcome(baseParams());

    expect(result.recorded).toBe(false);
    expect(result.skippedReason).toMatch(/pool unavailable/i);
  });
});

// ─── 5. G-1 Guard: guard query failure → fail-safe skip ──────────────────────

describe("G-1 Fraud Guard — guard query failure", () => {
  it("returns recorded=false when the fraud guard SELECT throws", async () => {
    vi.mocked(getRawPool).mockResolvedValue(mockPool as never);
    mockExecute.mockRejectedValueOnce(new Error("DB connection lost"));

    const result = await recordFinalizedOutcome(baseParams());

    expect(result.recorded).toBe(false);
    expect(result.skippedReason).toMatch(/guard query failed/i);
  });
});

// ─── 6. Finalization path — INSERT IGNORE ────────────────────────────────────

describe("Finalization path (isAdjusterCorrection: false)", () => {
  beforeEach(() => {
    vi.mocked(getRawPool).mockResolvedValue(mockPool as never);
  });

  it("executes INSERT IGNORE (not UPSERT) on the finalization path", async () => {
    mockExecute.mockResolvedValueOnce([[{ fraud_risk_score: 5 }], []]);
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

    await recordFinalizedOutcome(baseParams({ isAdjusterCorrection: false }));

    // The second execute call is the INSERT — verify it uses INSERT IGNORE
    const insertSql: string = mockExecute.mock.calls[1][0];
    expect(insertSql.toUpperCase()).toContain("INSERT IGNORE");
    expect(insertSql.toUpperCase()).not.toContain("ON DUPLICATE KEY UPDATE");
  });

  it("returns recorded=true on successful finalization write", async () => {
    mockExecute.mockResolvedValueOnce([[{ fraud_risk_score: 5 }], []]);
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

    const result = await recordFinalizedOutcome(baseParams());

    expect(result.recorded).toBe(true);
  });
});

// ─── 7. Adjuster correction path — UPSERT ────────────────────────────────────

describe("Adjuster correction path (isAdjusterCorrection: true)", () => {
  beforeEach(() => {
    vi.mocked(getRawPool).mockResolvedValue(mockPool as never);
  });

  it("executes ON DUPLICATE KEY UPDATE (UPSERT) on the adjuster correction path", async () => {
    mockExecute.mockResolvedValueOnce([[{ fraud_risk_score: 5 }], []]);
    mockExecute.mockResolvedValueOnce([{ affectedRows: 2 }, []]);

    await recordFinalizedOutcome(baseParams({ isAdjusterCorrection: true }));

    const insertSql: string = mockExecute.mock.calls[1][0];
    expect(insertSql.toUpperCase()).toContain("ON DUPLICATE KEY UPDATE");
    expect(insertSql.toUpperCase()).not.toContain("INSERT IGNORE");
  });

  it("adjuster correction path is still gated by G-1 guard", async () => {
    // Even on the adjuster path, a high fraud score must block the write
    mockExecute.mockResolvedValueOnce([[{ fraud_risk_score: 75 }], []]);

    const result = await recordFinalizedOutcome(
      baseParams({ isAdjusterCorrection: true })
    );

    expect(result.recorded).toBe(false);
    expect(result.skippedReason).toMatch(/G-1/);
    // The INSERT must never have been called
    expect(mockExecute).toHaveBeenCalledTimes(1); // only the guard SELECT
  });
});

// ─── 8. OutcomeRecordResult shape ────────────────────────────────────────────

describe("OutcomeRecordResult shape", () => {
  beforeEach(() => {
    vi.mocked(getRawPool).mockResolvedValue(mockPool as never);
  });

  it("result always has a boolean recorded field", async () => {
    mockExecute.mockResolvedValueOnce([[{ fraud_risk_score: 60 }], []]);

    const result = await recordFinalizedOutcome(baseParams());

    expect(typeof result.recorded).toBe("boolean");
  });

  it("skippedReason is undefined when write succeeds", async () => {
    mockExecute.mockResolvedValueOnce([[{ fraud_risk_score: 5 }], []]);
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

    const result = await recordFinalizedOutcome(baseParams());

    expect(result.recorded).toBe(true);
    expect(result.skippedReason).toBeUndefined();
  });

  it("skippedReason is a string when write is skipped", async () => {
    mockExecute.mockResolvedValueOnce([[{ fraud_risk_score: 55 }], []]);

    const result = await recordFinalizedOutcome(baseParams());

    expect(result.recorded).toBe(false);
    expect(typeof result.skippedReason).toBe("string");
    expect(result.skippedReason!.length).toBeGreaterThan(0);
  });
});
