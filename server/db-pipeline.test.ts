// @ts-nocheck
/**
 * db-pipeline.test.ts
 *
 * Unit tests for the pipeline observability helpers.
 *
 * Verifies that:
 *  1. All write helpers are fire-and-forget — they never throw.
 *  2. All read helpers return empty/null on DB failure — they never throw.
 *  3. Payload shapes are accepted without errors.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoisted mocks (must be declared before vi.mock calls) ───────────────────

const { mockInsertValues, mockUpdateSetWhere, mockSelectFromWhereOrderByLimit } = vi.hoisted(() => {
  const mockInsertValues = vi.fn().mockResolvedValue(undefined);
  const mockUpdateSetWhere = vi.fn().mockResolvedValue(undefined);
  const mockSelectFromWhereOrderByLimit = vi.fn().mockResolvedValue([]);
  return { mockInsertValues, mockUpdateSetWhere, mockSelectFromWhereOrderByLimit };
});

// ─── Mock the DB layer ───────────────────────────────────────────────────────

vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue({
    insert: vi.fn().mockReturnValue({ values: mockInsertValues }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({ where: mockUpdateSetWhere }),
    }),
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: mockSelectFromWhereOrderByLimit,
          }),
        }),
        orderBy: vi.fn().mockReturnValue({
          limit: mockSelectFromWhereOrderByLimit,
        }),
        groupBy: vi.fn().mockReturnValue({
          orderBy: mockSelectFromWhereOrderByLimit,
        }),
      }),
    }),
  }),
}));

vi.mock("../drizzle/schema", () => ({
  pipelineRuns: {
    runId: "runId", claimId: "claimId", status: "status",
    startedAt: "startedAt", totalDurationMs: "totalDurationMs",
    totalLlmTokens: "totalLlmTokens",
  },
  pipelineJobs: {
    runId: "runId", stageId: "stageId", stageIndex: "stageIndex",
    stageLabel: "stageLabel", status: "status", durationMs: "durationMs",
    isTimeout: "isTimeout", llmTokensInput: "llmTokensInput",
    llmTokensOutput: "llmTokensOutput",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col, val) => ({ col, val })),
  and: vi.fn((...args) => args),
  desc: vi.fn((col) => ({ col, dir: "desc" })),
  sql: vi.fn(() => "sql-fragment"),
}));

// ─── Import after mocks ──────────────────────────────────────────────────────

import {
  recordRunStart,
  recordRunComplete,
  recordStageStart,
  recordStageComplete,
  getRunStages,
  getLatestRunForClaim,
  getRecentRuns,
  getStageHealthStats,
  getPipelineOverallStats,
} from "./db-pipeline";

import { getDb } from "./db";

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("db-pipeline: write helpers are fire-and-forget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("recordRunStart never throws even if DB fails", async () => {
    (getDb as any).mockRejectedValueOnce(new Error("DB connection lost"));
    await expect(
      recordRunStart({ runId: "run-1", claimId: 42 })
    ).resolves.toBeUndefined();
  });

  it("recordRunComplete never throws even if DB fails", async () => {
    (getDb as any).mockRejectedValueOnce(new Error("DB timeout"));
    await expect(
      recordRunComplete({
        runId: "run-1",
        status: "completed",
        totalDurationMs: 12000,
        stagesCompleted: 10,
        stagesFailed: 0,
        stagesDegraded: 0,
      })
    ).resolves.toBeUndefined();
  });

  it("recordStageStart never throws even if DB fails", async () => {
    (getDb as any).mockRejectedValueOnce(new Error("DB unavailable"));
    await expect(
      recordStageStart({
        runId: "run-1",
        claimId: 42,
        stageId: "7_physics",
        stageLabel: "Physics",
        stageIndex: 7,
      })
    ).resolves.toBeUndefined();
  });

  it("recordStageComplete never throws even if DB fails", async () => {
    (getDb as any).mockRejectedValueOnce(new Error("Write failed"));
    await expect(
      recordStageComplete({
        runId: "run-1",
        stageId: "7_physics",
        durationMs: 4200,
        status: "completed",
      })
    ).resolves.toBeUndefined();
  });
});

describe("db-pipeline: read helpers return safe defaults on failure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getRunStages returns empty array on DB failure", async () => {
    (getDb as any).mockRejectedValueOnce(new Error("DB down"));
    const result = await getRunStages("run-1");
    expect(result).toEqual([]);
  });

  it("getLatestRunForClaim returns null on DB failure", async () => {
    (getDb as any).mockRejectedValueOnce(new Error("DB down"));
    const result = await getLatestRunForClaim(42);
    expect(result).toBeNull();
  });

  it("getRecentRuns returns empty array on DB failure", async () => {
    (getDb as any).mockRejectedValueOnce(new Error("DB down"));
    const result = await getRecentRuns();
    expect(result).toEqual([]);
  });

  it("getStageHealthStats returns empty array on DB failure", async () => {
    (getDb as any).mockRejectedValueOnce(new Error("DB down"));
    const result = await getStageHealthStats();
    expect(result).toEqual([]);
  });

  it("getPipelineOverallStats returns null on DB failure", async () => {
    (getDb as any).mockRejectedValueOnce(new Error("DB down"));
    const result = await getPipelineOverallStats();
    expect(result).toBeNull();
  });
});

describe("db-pipeline: payload shape validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("recordRunStart accepts all optional fields", async () => {
    await expect(
      recordRunStart({
        runId: "run-abc",
        claimId: 99,
        tenantId: "tenant-1",
        triggeredBy: "user-1",
        triggerReason: "manual_rerun",
        isRerun: true,
      })
    ).resolves.toBeUndefined();
  });

  it("recordStageComplete accepts degraded + timeout flags", async () => {
    await expect(
      recordStageComplete({
        runId: "run-abc",
        stageId: "2_extraction",
        durationMs: 55000,
        status: "degraded",
        isDegraded: true,
        isTimeout: true,
        errorMessage: "LLM timeout after 55s",
        llmTokensInput: 1200,
        llmTokensOutput: 450,
        llmModel: "gpt-4o",
        assumptionCount: 3,
        recoveryActionCount: 1,
      })
    ).resolves.toBeUndefined();
  });

  it("recordRunComplete accepts partial status", async () => {
    await expect(
      recordRunComplete({
        runId: "run-abc",
        status: "partial",
        totalDurationMs: 90000,
        totalLlmTokens: 12000,
        stagesCompleted: 7,
        stagesFailed: 2,
        stagesDegraded: 1,
      })
    ).resolves.toBeUndefined();
  });
});
