/**
 * decision-lifecycle.test.ts
 *
 * M-07: Structural audit trail enforcement tests.
 * Verifies that transitionLifecycle writes a LIFECYCLE_TRANSITION record
 * to governance_audit_log regardless of how it is called.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoist mocks to avoid initialization order issues ─────────────────────────
const { mockInsert, mockInsertValues, mockUpdate, mockSelect } = vi.hoisted(() => {
  const mockInsertValues = vi.fn().mockResolvedValue([{ insertId: 1 }]);
  const mockInsert = vi.fn().mockReturnValue({ values: mockInsertValues });
  const mockUpdate = vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([]),
    }),
  });
  const mockSelect = vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue([{
          lifecycleState: "DRAFT",
          isFinal: 0,
          isLocked: 0,
          authoritativeSnapshotId: null,
          finalDecisionChoice: null,
          draftedAt: Date.now(),
          reviewedAt: null,
          reviewedByUserId: null,
          finalisedAt: null,
          finalisedByUserId: null,
          lockedAt: null,
          lockedByUserId: null,
        }]),
      }),
    }),
  });
  return { mockInsert, mockInsertValues, mockUpdate, mockSelect };
});

vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue({
    select: mockSelect,
    update: mockUpdate,
    insert: mockInsert,
  }),
}));

vi.mock("../drizzle/schema", () => ({
  claimDecisionLifecycle: { $inferInsert: {} },
  governanceAuditLog: { $inferInsert: {} },
  replayLogs: {},
  decisionSnapshots: {},
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((a, b) => ({ type: "eq", a, b })),
  desc: vi.fn((a) => ({ type: "desc", a })),
  and: vi.fn((...args) => ({ type: "and", args })),
}));

import { transitionLifecycle, canTransition } from "./decision-lifecycle";
import { getDb } from "./db";

function makeDraftRow() {
  return {
    lifecycleState: "DRAFT",
    isFinal: 0,
    isLocked: 0,
    authoritativeSnapshotId: null,
    finalDecisionChoice: null,
    draftedAt: Date.now(),
    reviewedAt: null,
    reviewedByUserId: null,
    finalisedAt: null,
    finalisedByUserId: null,
    lockedAt: null,
    lockedByUserId: null,
  };
}

describe("M-07: transitionLifecycle — structural audit trail enforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-setup mocks after clearAllMocks
    mockInsert.mockResolvedValue([{ insertId: 1 }]);
    mockUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    });
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([makeDraftRow()]),
        }),
      }),
    });
    // Restore insert chain mock — clearAllMocks resets .values() to return undefined
    mockInsertValues.mockResolvedValue([{ insertId: 1 }]);
    mockInsert.mockReturnValue({ values: mockInsertValues });
    // Restore getDb mock — clearAllMocks resets it to return undefined
    vi.mocked(getDb).mockResolvedValue({
      select: mockSelect,
      update: mockUpdate,
      insert: mockInsert,
    } as any);
  });

  it("writes a LIFECYCLE_TRANSITION audit record on successful DRAFT→REVIEWED transition", async () => {
    const result = await transitionLifecycle("CLM-001", "TENANT-1", "REVIEWED", {
      userId: "user-42",
    });

    expect(result.success).toBe(true);
    expect(result.lifecycle_state).toBe("REVIEWED");

    // Verify audit write was called
    expect(mockInsertValues).toHaveBeenCalledTimes(1);
    const insertCall = mockInsertValues.mock.calls[0][0];
    expect(insertCall).toMatchObject({
      claimId: "CLM-001",
      tenantId: "TENANT-1",
      action: "LIFECYCLE_TRANSITION:DRAFT→REVIEWED",
      performedBy: "user-42",
      actionAllowed: 1,
    });
  });

  it("writes a LIFECYCLE_TRANSITION audit record on DRAFT→FINALISED transition", async () => {
    const result = await transitionLifecycle("CLM-002", "TENANT-1", "FINALISED", {
      userId: "user-99",
      finalDecisionChoice: "FINALISE_CLAIM",
    });

    expect(result.success).toBe(true);
    expect(result.is_final).toBe(true);

    expect(mockInsertValues).toHaveBeenCalledTimes(1);
    const insertCall = mockInsertValues.mock.calls[0][0];
    expect(insertCall.action).toBe("LIFECYCLE_TRANSITION:DRAFT→FINALISED");
    const meta = JSON.parse(insertCall.metadataJson);
    expect(meta.finalDecisionChoice).toBe("FINALISE_CLAIM");
  });

  it("uses 'system' as performedBy when no userId is provided", async () => {
    await transitionLifecycle("CLM-003", "TENANT-1", "REVIEWED");

    expect(mockInsertValues).toHaveBeenCalledTimes(1);
    const insertCall = mockInsertValues.mock.calls[0][0];
    expect(insertCall.performedBy).toBe("system");
  });

  it("does NOT write an audit record when the transition is invalid (canTransition returns false)", async () => {
    // LOCKED → REVIEWED is invalid
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{
            lifecycleState: "LOCKED",
            isFinal: 1,
            isLocked: 1,
            authoritativeSnapshotId: null,
            finalDecisionChoice: null,
            draftedAt: null,
            reviewedAt: null,
            reviewedByUserId: null,
            finalisedAt: null,
            finalisedByUserId: null,
            lockedAt: null,
            lockedByUserId: null,
          }]),
        }),
      }),
    });

    const result = await transitionLifecycle("CLM-004", "TENANT-1", "REVIEWED");

    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid transition");
    // No audit write for invalid transitions
    expect(mockInsertValues).not.toHaveBeenCalled();
  });

  it("does NOT fail the state transition if the audit write throws", async () => {
    mockInsertValues.mockRejectedValueOnce(new Error("DB connection lost"));

    const result = await transitionLifecycle("CLM-005", "TENANT-1", "REVIEWED", {
      userId: "user-1",
    });

    // State transition succeeded despite audit failure
    expect(result.success).toBe(true);
    expect(result.lifecycle_state).toBe("REVIEWED");
  });

  it("includes fromState, toState, userId in metadataJson", async () => {
    await transitionLifecycle("CLM-006", "TENANT-1", "REVIEWED", { userId: "user-7" });

    const insertCall = mockInsertValues.mock.calls[0][0];
    const meta = JSON.parse(insertCall.metadataJson);
    expect(meta.fromState).toBe("DRAFT");
    expect(meta.toState).toBe("REVIEWED");
    expect(meta.userId).toBe("user-7");
  });
});

describe("canTransition — state machine rules", () => {
  it("allows DRAFT → REVIEWED", () => expect(canTransition("DRAFT", "REVIEWED")).toBe(true));
  it("allows DRAFT → FINALISED (skip REVIEWED)", () => expect(canTransition("DRAFT", "FINALISED")).toBe(true));
  it("allows REVIEWED → FINALISED", () => expect(canTransition("REVIEWED", "FINALISED")).toBe(true));
  it("allows FINALISED → LOCKED", () => expect(canTransition("FINALISED", "LOCKED")).toBe(true));
  it("blocks LOCKED → REVIEWED (terminal state)", () => expect(canTransition("LOCKED", "REVIEWED")).toBe(false));
  it("blocks LOCKED → FINALISED (terminal state)", () => expect(canTransition("LOCKED", "FINALISED")).toBe(false));
  it("blocks REVIEWED → LOCKED (must go through FINALISED)", () => expect(canTransition("REVIEWED", "LOCKED")).toBe(false));
  it("blocks FINALISED → REVIEWED (no backward transitions)", () => expect(canTransition("FINALISED", "REVIEWED")).toBe(false));
});
