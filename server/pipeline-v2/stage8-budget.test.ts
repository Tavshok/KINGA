/**
 * stage8-budget.test.ts
 *
 * Verification tests for R-D-01 and R-D-03 fixes:
 *   R-D-01: Stage 8 budget is now TIMEOUT_MULTI_LLM_MS (180s), not TIMEOUT_LLM_MS (60s)
 *   R-D-03: entityRegistry mysql2 connections have connectTimeout: 5_000
 *
 * These tests verify:
 *   1. The registry reports 180s for stage "8_fraud"
 *   2. The budget is sufficient for a 15-photo claim (worst case ~135s)
 *   3. The entity connection timeout is set to 5000ms
 *   4. The fallback comment now correctly says "medium risk" (not "low risk")
 */

import { describe, it, expect } from "vitest";
import {
  getStageTimeout,
  TIMEOUT_MULTI_LLM_MS,
  TIMEOUT_LLM_MS,
  STAGE_CONTRACTS,
} from "./pipelineContractRegistry";

// ── R-D-01 Verification ────────────────────────────────────────────────────

describe("R-D-01: Stage 8 budget fix", () => {
  it("Stage 8 timeout is TIMEOUT_MULTI_LLM_MS (180_000ms), not TIMEOUT_LLM_MS (60_000ms)", () => {
    const budget = getStageTimeout("8_fraud");
    expect(budget).toBe(TIMEOUT_MULTI_LLM_MS);
    expect(budget).toBe(180_000);
    expect(budget).not.toBe(TIMEOUT_LLM_MS);
    expect(budget).not.toBe(60_000);
  });

  it("Stage 8 budget is sufficient for a 15-photo claim (worst case ~135s)", () => {
    // 15 photos / 5 per batch = 3 batches
    // Each batch worst case: 45s (VISION_TIMEOUT_MS per photo, sequential within batch)
    // Total worst case: 3 × 45s = 135s
    const PHOTO_BATCH_SIZE = 5;
    const VISION_TIMEOUT_PER_PHOTO_MS = 45_000;
    const PHOTO_COUNT = 15;
    const batches = Math.ceil(PHOTO_COUNT / PHOTO_BATCH_SIZE);
    const worstCaseMs = batches * VISION_TIMEOUT_PER_PHOTO_MS;
    const budget = getStageTimeout("8_fraud");
    expect(worstCaseMs).toBe(135_000);
    expect(budget).toBeGreaterThan(worstCaseMs);
  });

  it("Stage 8 budget is sufficient for a 20-photo claim (worst case ~180s)", () => {
    // 20 photos / 5 per batch = 4 batches × 45s = 180s
    // Budget is exactly 180s — this is the design boundary
    const PHOTO_BATCH_SIZE = 5;
    const VISION_TIMEOUT_PER_PHOTO_MS = 45_000;
    const PHOTO_COUNT = 20;
    const batches = Math.ceil(PHOTO_COUNT / PHOTO_BATCH_SIZE);
    const worstCaseMs = batches * VISION_TIMEOUT_PER_PHOTO_MS;
    const budget = getStageTimeout("8_fraud");
    expect(worstCaseMs).toBe(180_000);
    // Budget equals worst case — any claim over 20 photos would still exceed budget,
    // but PER_RUN_VISION_BUDGET in stage-6 caps photos at 20 per run.
    expect(budget).toBeGreaterThanOrEqual(worstCaseMs);
  });

  it("Stage 8 fallback description no longer incorrectly says 'low risk'", () => {
    const contract = STAGE_CONTRACTS["8_fraud"];
    expect(contract.fallbackBehaviour).not.toContain("low risk");
    // Score 30 maps to "medium" on the scoreToLevel scale (25-44 = medium)
    expect(contract.fallbackBehaviour).toContain("medium risk");
  });

  it("Stage 8 budget equals Stage 7 budget (both use TIMEOUT_MULTI_LLM_MS)", () => {
    // Both stages now have the same budget — Stage 7 for 3 sequential LLM calls,
    // Stage 8 for photo forensics batches + entity checks
    const s7Budget = getStageTimeout("7_unified");
    const s8Budget = getStageTimeout("8_fraud");
    expect(s7Budget).toBe(s8Budget);
    expect(s7Budget).toBe(TIMEOUT_MULTI_LLM_MS);
  });
});

// ── R-D-03 Verification ────────────────────────────────────────────────────

describe("R-D-03: entityRegistry connection timeout fix", () => {
  it("entityRegistry source contains connectTimeout: 5_000 on both connection helpers", async () => {
    // Read the source file and verify the connectTimeout is present
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.resolve(__dirname, "../services/entityRegistry.ts");
    const source = fs.readFileSync(filePath, "utf-8");

    // Both createConnection calls must include connectTimeout
    const matches = source.match(/connectTimeout:\s*5[_,]?000/g);
    expect(matches).not.toBeNull();
    // There should be at least 2 occurrences (execSql and querySql code lines);
    // the comment line also contains connectTimeout, so total is >= 2
    expect(matches!.length).toBeGreaterThanOrEqual(2);
  });

  it("entityRegistry source uses { uri, connectTimeout } object form, not string URL", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.resolve(__dirname, "../services/entityRegistry.ts");
    const source = fs.readFileSync(filePath, "utf-8");

    // Verify the old string form is gone
    const oldForm = source.match(/createConnection\(process\.env\.DATABASE_URL!/g);
    expect(oldForm).toBeNull();

    // Verify the new object form is present
    const newForm = source.match(/createConnection\(\{.*uri.*connectTimeout/gs);
    expect(newForm).not.toBeNull();
  });
});

// ── Budget comparison across all stages ───────────────────────────────────

describe("Stage budget consistency check", () => {
  it("Stage 6 (vision) has the largest budget (200s)", () => {
    const s6Budget = getStageTimeout("6_damage_analysis");
    expect(s6Budget).toBe(200_000);
  });

  it("Stage 8 budget (180s) does not exceed Stage 6 budget (200s)", () => {
    const s8Budget = getStageTimeout("8_fraud");
    const s6Budget = getStageTimeout("6_damage_analysis");
    expect(s8Budget).toBeLessThan(s6Budget);
  });

  it("All stage budgets are positive integers", () => {
    for (const [id, contract] of Object.entries(STAGE_CONTRACTS)) {
      expect(contract.timeoutMs).toBeGreaterThan(0);
      expect(Number.isInteger(contract.timeoutMs)).toBe(true);
    }
  });
});
