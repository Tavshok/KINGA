/**
 * Unit tests for the stuck assessment recovery job.
 * 
 * Tests the two recovery cases:
 *   CASE 1: assessment_in_progress + ai_assessment_triggered=0 for > 10 min → reset to intake_pending
 *   CASE 2: assessment_in_progress + ai_assessment_triggered=1 + parsing + > 20 min → reset to intake_pending
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runStuckAssessmentRecoveryJob } from "./stuck-assessment-recovery-job";

// ── Mock getDb ────────────────────────────────────────────────────────────────
const mockUpdate = vi.fn();
const mockSet = vi.fn();
const mockWhere = vi.fn();
const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockAndWhere = vi.fn();
const mockLimit = vi.fn();

// Build a chainable drizzle-like mock
function buildChain(returnValue: any) {
  const chain: any = {};
  chain.select = vi.fn(() => chain);
  chain.from = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.limit = vi.fn(() => Promise.resolve(returnValue));
  chain.update = vi.fn(() => chain);
  chain.set = vi.fn(() => chain);
  return chain;
}

vi.mock("./db", () => ({
  getDb: vi.fn(),
}));

import { getDb } from "./db";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeClaim(overrides: Partial<{ id: number; claimNumber: string }> = {}) {
  return { id: 1001, claimNumber: "DOC-20260101-ABCD1234", ...overrides };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("runStuckAssessmentRecoveryJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should skip when database is unavailable", async () => {
    vi.mocked(getDb).mockResolvedValue(null as any);
    // Should not throw
    await expect(runStuckAssessmentRecoveryJob()).resolves.toBeUndefined();
  });

  it("should log 'No stuck claims found' when no stuck claims exist", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    
    const db: any = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
    };
    vi.mocked(getDb).mockResolvedValue(db);

    await runStuckAssessmentRecoveryJob();

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("No stuck claims found"));
    consoleSpy.mockRestore();
  });

  it("should reset CASE 1 claims (ai_assessment_triggered=0) to intake_pending", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    
    const stuckClaim = makeClaim({ id: 2001, claimNumber: "DOC-20260101-CASE1" });
    let callCount = 0;
    
    const db: any = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockImplementation(() => {
        // First call = CASE 1 query (never started), second call = CASE 2 query (timed out)
        callCount++;
        return Promise.resolve(callCount === 1 ? [stuckClaim] : []);
      }),
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
    };
    vi.mocked(getDb).mockResolvedValue(db);

    await runStuckAssessmentRecoveryJob();

    // Should have called update for the stuck claim
    expect(db.update).toHaveBeenCalled();
    expect(db.set).toHaveBeenCalledWith(expect.objectContaining({
      status: "intake_pending",
      documentProcessingStatus: "pending",
      workflowState: "intake_queue",
    }));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Reset claim DOC-20260101-CASE1"));
    consoleSpy.mockRestore();
  });

  it("should reset CASE 2 claims (timed out pipeline) to intake_pending with documentProcessingStatus=failed", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    
    const timedOutClaim = makeClaim({ id: 3001, claimNumber: "DOC-20260101-CASE2" });
    let callCount = 0;
    
    const db: any = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve(callCount === 1 ? [] : [timedOutClaim]);
      }),
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
    };
    vi.mocked(getDb).mockResolvedValue(db);

    await runStuckAssessmentRecoveryJob();

    expect(db.update).toHaveBeenCalled();
    expect(db.set).toHaveBeenCalledWith(expect.objectContaining({
      status: "intake_pending",
      documentProcessingStatus: "failed",
      workflowState: "intake_queue",
      aiAssessmentTriggered: 0,
    }));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Timeout-reset claim DOC-20260101-CASE2"));
    consoleSpy.mockRestore();
  });

  it("should handle DB update errors gracefully without throwing", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    
    const stuckClaim = makeClaim({ id: 4001 });
    let callCount = 0;
    
    const db: any = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve(callCount === 1 ? [stuckClaim] : []);
      }),
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
    };
    // Make the where() on update throw
    let updateCallCount = 0;
    db.update.mockImplementation(() => {
      updateCallCount++;
      return {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockRejectedValue(new Error("DB write error")),
      };
    });
    vi.mocked(getDb).mockResolvedValue(db);

    // Should not throw
    await expect(runStuckAssessmentRecoveryJob()).resolves.toBeUndefined();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Failed to reset claim"), expect.any(Error));
    consoleSpy.mockRestore();
  });

  it("should handle top-level DB query errors gracefully", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    
    const db: any = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockRejectedValue(new Error("DB read error")),
    };
    vi.mocked(getDb).mockResolvedValue(db);

    await expect(runStuckAssessmentRecoveryJob()).resolves.toBeUndefined();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("[StuckRecovery] Job failed:"), expect.any(Error));
    consoleSpy.mockRestore();
  });
});
