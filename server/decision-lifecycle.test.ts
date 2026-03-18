/**
 * decision-lifecycle.test.ts
 *
 * Unit tests for the decision lifecycle state machine (pure logic only).
 * DB-dependent functions are tested via integration tests separately.
 */

import { describe, it, expect } from "vitest";
import { canTransition, isReplayAllowed, isRecalculationAllowed } from "./decision-lifecycle";
import type { LifecycleState } from "./decision-lifecycle";

// ─────────────────────────────────────────────────────────────────────────────
// VALID TRANSITIONS
// ─────────────────────────────────────────────────────────────────────────────

describe("canTransition — valid transitions", () => {
  it("DRAFT → REVIEWED is allowed", () => {
    expect(canTransition("DRAFT", "REVIEWED")).toBe(true);
  });

  it("DRAFT → FINALISED is allowed (skip REVIEWED)", () => {
    expect(canTransition("DRAFT", "FINALISED")).toBe(true);
  });

  it("REVIEWED → FINALISED is allowed", () => {
    expect(canTransition("REVIEWED", "FINALISED")).toBe(true);
  });

  it("FINALISED → LOCKED is allowed", () => {
    expect(canTransition("FINALISED", "LOCKED")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// INVALID TRANSITIONS
// ─────────────────────────────────────────────────────────────────────────────

describe("canTransition — invalid transitions", () => {
  it("DRAFT → LOCKED is NOT allowed", () => {
    expect(canTransition("DRAFT", "LOCKED")).toBe(false);
  });

  it("REVIEWED → DRAFT is NOT allowed (no backward transitions)", () => {
    expect(canTransition("REVIEWED", "DRAFT")).toBe(false);
  });

  it("REVIEWED → LOCKED is NOT allowed", () => {
    expect(canTransition("REVIEWED", "LOCKED")).toBe(false);
  });

  it("FINALISED → DRAFT is NOT allowed", () => {
    expect(canTransition("FINALISED", "DRAFT")).toBe(false);
  });

  it("FINALISED → REVIEWED is NOT allowed", () => {
    expect(canTransition("FINALISED", "REVIEWED")).toBe(false);
  });

  it("LOCKED → DRAFT is NOT allowed (terminal state)", () => {
    expect(canTransition("LOCKED", "DRAFT")).toBe(false);
  });

  it("LOCKED → REVIEWED is NOT allowed (terminal state)", () => {
    expect(canTransition("LOCKED", "REVIEWED")).toBe(false);
  });

  it("LOCKED → FINALISED is NOT allowed (terminal state)", () => {
    expect(canTransition("LOCKED", "FINALISED")).toBe(false);
  });

  it("LOCKED → LOCKED is NOT allowed (self-transition)", () => {
    expect(canTransition("LOCKED", "LOCKED")).toBe(false);
  });

  it("DRAFT → DRAFT is NOT allowed (self-transition)", () => {
    expect(canTransition("DRAFT", "DRAFT")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// REPLAY ALLOWED
// ─────────────────────────────────────────────────────────────────────────────

describe("isReplayAllowed", () => {
  it("replay is allowed when state is DRAFT", () => {
    expect(isReplayAllowed("DRAFT")).toBe(true);
  });

  it("replay is allowed when state is REVIEWED", () => {
    expect(isReplayAllowed("REVIEWED")).toBe(true);
  });

  it("replay is allowed when state is FINALISED", () => {
    expect(isReplayAllowed("FINALISED")).toBe(true);
  });

  it("replay is BLOCKED when state is LOCKED", () => {
    expect(isReplayAllowed("LOCKED")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// RECALCULATION ALLOWED
// ─────────────────────────────────────────────────────────────────────────────

describe("isRecalculationAllowed", () => {
  it("recalculation is allowed when state is DRAFT", () => {
    expect(isRecalculationAllowed("DRAFT")).toBe(true);
  });

  it("recalculation is allowed when state is REVIEWED", () => {
    expect(isRecalculationAllowed("REVIEWED")).toBe(true);
  });

  it("recalculation is BLOCKED when state is FINALISED", () => {
    expect(isRecalculationAllowed("FINALISED")).toBe(false);
  });

  it("recalculation is BLOCKED when state is LOCKED", () => {
    expect(isRecalculationAllowed("LOCKED")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// LIFECYCLE RULES COMPLIANCE
// ─────────────────────────────────────────────────────────────────────────────

describe("lifecycle rules compliance", () => {
  const allStates: LifecycleState[] = ["DRAFT", "REVIEWED", "FINALISED", "LOCKED"];

  it("LOCKED is a terminal state — no transitions allowed from it", () => {
    for (const to of allStates) {
      expect(canTransition("LOCKED", to)).toBe(false);
    }
  });

  it("no state can transition to DRAFT (no backward transitions)", () => {
    for (const from of allStates) {
      if (from !== "DRAFT") {
        expect(canTransition(from, "DRAFT")).toBe(false);
      }
    }
  });

  it("FINALISED and LOCKED block recalculation", () => {
    expect(isRecalculationAllowed("FINALISED")).toBe(false);
    expect(isRecalculationAllowed("LOCKED")).toBe(false);
  });

  it("only LOCKED blocks replay", () => {
    const replayBlockedStates = allStates.filter(s => !isReplayAllowed(s));
    expect(replayBlockedStates).toEqual(["LOCKED"]);
  });

  it("DRAFT and REVIEWED allow both replay and recalculation", () => {
    for (const state of ["DRAFT", "REVIEWED"] as LifecycleState[]) {
      expect(isReplayAllowed(state)).toBe(true);
      expect(isRecalculationAllowed(state)).toBe(true);
    }
  });

  it("the full happy path DRAFT → REVIEWED → FINALISED → LOCKED is valid", () => {
    expect(canTransition("DRAFT", "REVIEWED")).toBe(true);
    expect(canTransition("REVIEWED", "FINALISED")).toBe(true);
    expect(canTransition("FINALISED", "LOCKED")).toBe(true);
  });

  it("the fast path DRAFT → FINALISED → LOCKED is valid", () => {
    expect(canTransition("DRAFT", "FINALISED")).toBe(true);
    expect(canTransition("FINALISED", "LOCKED")).toBe(true);
  });
});
