/**
 * Unit tests for the stuck assessment recovery job.
 *
 * The implementation runs 13 SELECT queries in this order:
 *   Query  1 — CASE 3/5A: assessment_in_progress + ai_assessment_completed=1
 *   Query  2 — CASE 5B: assessment_in_progress + triggered=1 + completed=0 + dps in terminal state + >10 min
 *   Query  3 — CASE 1: assessment_in_progress + triggered=0 + >10 min
 *   Query  4 — CASE 2: assessment_in_progress + triggered=1 + completed=0 + dps='parsing' + >20 min
 *   Query  5 — CASE 4: intake_pending + triggered=1 + dps='failed'|'parsing' + >5 min
 *   Query  6 — CASE 6: assessment_in_progress + dps='extracting'|'analysing' + >10 min
 *   Query  7 — CASE 7: assessment_in_progress + completed=0 + >20 min (hard wall-clock guard)
 *   Queries 8-13 — additional sub-queries for retry-count checks, etc.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { runStuckAssessmentRecoveryJob } from "./stuck-assessment-recovery-job";

vi.mock("./db", () => ({
  getDb: vi.fn(),
  withDbRetry: vi.fn(async (fn: () => Promise<any>) => fn()),
  triggerAiAssessment: vi.fn(),
}));

import { getDb, triggerAiAssessment } from "./db";

function makeClaim(overrides: Partial<{ id: number; claimNumber: string }> = {}) {
  return { id: 1001, claimNumber: "DOC-20260101-ABCD1234", ...overrides };
}

// Engine has 13 SELECT queries; provide 13 slots (extras default to [])
function buildDb(limitResults: any[][]) {
  let callCount = 0;
  const db: any = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockImplementation(() => {
      const result = limitResults[callCount] ?? [];
      callCount++;
      return Promise.resolve(result);
    }),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
  };
  return db;
}

// 13 empty slots — all queries return no results
const EMPTY_13 = [[], [], [], [], [], [], [], [], [], [], [], [], []];

describe("runStuckAssessmentRecoveryJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Ensure triggerAiAssessment always returns a real Promise (not undefined)
    vi.mocked(triggerAiAssessment).mockResolvedValue(undefined);
  });

  it("should skip when database is unavailable", async () => {
    vi.mocked(getDb).mockResolvedValue(null as any);
    await expect(runStuckAssessmentRecoveryJob()).resolves.toBeUndefined();
  });

  it("should log 'No stuck claims found' when no stuck claims exist", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const db = buildDb([...EMPTY_13]);
    vi.mocked(getDb).mockResolvedValue(db);
    await runStuckAssessmentRecoveryJob();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("No stuck claims found"));
    consoleSpy.mockRestore();
  });

  it("should re-trigger CASE 1 claims (ai_assessment_triggered=0, never started)", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const stuckClaim = makeClaim({ id: 2001, claimNumber: "DOC-20260101-CASE1" });
    // CASE 1 is query slot 2 (0-indexed)
    const slots = [...EMPTY_13];
    slots[2] = [stuckClaim];
    const db = buildDb(slots);
    vi.mocked(getDb).mockResolvedValue(db);
    await runStuckAssessmentRecoveryJob();
    expect(triggerAiAssessment).toHaveBeenCalledWith(2001);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("DOC-20260101-CASE1"));
    consoleSpy.mockRestore();
  });

  it("should reset and re-trigger CASE 2 claims (timed out pipeline, dps=parsing)", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const timedOutClaim = makeClaim({ id: 3001, claimNumber: "DOC-20260101-CASE2" });
    // CASE 2 is query slot 3 (0-indexed)
    const slots = [...EMPTY_13];
    slots[3] = [timedOutClaim];
    const db = buildDb(slots);
    vi.mocked(getDb).mockResolvedValue(db);
    await runStuckAssessmentRecoveryJob();
    expect(db.update).toHaveBeenCalled();
    expect(db.set).toHaveBeenCalledWith(expect.objectContaining({
      aiAssessmentTriggered: 0,
      aiAssessmentCompleted: 0,
      documentProcessingStatus: "pending",
    }));
    expect(triggerAiAssessment).toHaveBeenCalledWith(3001);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("DOC-20260101-CASE2"));
    consoleSpy.mockRestore();
  });

  it("should handle triggerAiAssessment errors gracefully without throwing", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const stuckClaim = makeClaim({ id: 4001, claimNumber: "DOC-20260101-ERR" });
    const slots = [...EMPTY_13];
    slots[2] = [stuckClaim];
    const db = buildDb(slots);
    vi.mocked(getDb).mockResolvedValue(db);
    vi.mocked(triggerAiAssessment).mockRejectedValueOnce(new Error("pipeline error"));
    await expect(runStuckAssessmentRecoveryJob()).resolves.toBeUndefined();
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
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("[StuckRecovery] Job failed:"),
      expect.any(Error)
    );
    consoleSpy.mockRestore();
  });

  it("should finalise CASE 3 claims (ai_assessment_completed=1) to analysis_complete", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const completedClaim = makeClaim({ id: 5001, claimNumber: "DOC-20260101-CASE3" });
    // CASE 3 is query slot 0 (0-indexed)
    const slots = [...EMPTY_13];
    slots[0] = [completedClaim];
    const db = buildDb(slots);
    vi.mocked(getDb).mockResolvedValue(db);
    await runStuckAssessmentRecoveryJob();
    expect(db.update).toHaveBeenCalled();
    expect(db.set).toHaveBeenCalledWith(expect.objectContaining({
      status: "analysis_complete",
      documentProcessingStatus: "ANALYSIS_COMPLETE",
    }));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("DOC-20260101-CASE3"));
    consoleSpy.mockRestore();
  });
});
