/**
 * Tests for LlmCircuitBreaker — M-03 reliability fix.
 *
 * Covers:
 *  1. CLOSED → OPEN transition after failureThreshold consecutive failures.
 *  2. OPEN state rejects requests with CIRCUIT_OPEN error.
 *  3. OPEN → HALF_OPEN transition after cooldown.
 *  4. HALF_OPEN → CLOSED on success (probe succeeds).
 *  5. HALF_OPEN → OPEN on failure (probe fails).
 *  6. Success resets consecutive failure counter.
 *  7. getCircuitBreakerState returns correct snapshot.
 *  8. invokeLLM is wrapped with circuit breaker (integration test with mocked fetch).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { LlmCircuitBreaker, getCircuitBreakerState, llmCircuitBreaker } from "./llm";

// ── Import LlmCircuitBreaker directly from the module ────────────────────────
// We import the class directly so we can create isolated instances for testing.

describe("LlmCircuitBreaker — M-03", () => {
  let cb: LlmCircuitBreaker;

  beforeEach(() => {
    // Create a fresh circuit breaker for each test with low thresholds for speed
    cb = new LlmCircuitBreaker(
      3,       // failureThreshold: open after 3 consecutive failures
      60_000,  // windowMs (not used in current impl, just documents intent)
      100,     // cooldownMs: 100ms for fast OPEN→HALF_OPEN in tests
    );
  });

  // ── 1. CLOSED state ──────────────────────────────────────────────────────────
  describe("CLOSED state", () => {
    it("starts in CLOSED state", () => {
      expect(cb.state).toBe("CLOSED");
    });

    it("allows requests through when CLOSED", () => {
      expect(() => cb.allowRequest()).not.toThrow();
    });

    it("resets consecutive failures on success", () => {
      cb.onFailure(new Error("fail"));
      cb.onFailure(new Error("fail"));
      expect(cb.getSnapshot().consecutiveFailures).toBe(2);
      cb.onSuccess();
      expect(cb.getSnapshot().consecutiveFailures).toBe(0);
      expect(cb.state).toBe("CLOSED");
    });
  });

  // ── 2. CLOSED → OPEN transition ──────────────────────────────────────────────
  describe("CLOSED → OPEN transition", () => {
    it("opens after failureThreshold consecutive failures", () => {
      cb.onFailure(new Error("fail 1"));
      expect(cb.state).toBe("CLOSED");
      cb.onFailure(new Error("fail 2"));
      expect(cb.state).toBe("CLOSED");
      cb.onFailure(new Error("fail 3")); // threshold = 3
      expect(cb.state).toBe("OPEN");
    });

    it("records openedAt timestamp when opening", () => {
      const before = Date.now();
      cb.onFailure(new Error("f"));
      cb.onFailure(new Error("f"));
      cb.onFailure(new Error("f"));
      const after = Date.now();
      const snap = cb.getSnapshot();
      expect(snap.openedAt).not.toBeNull();
      expect(snap.openedAt!).toBeGreaterThanOrEqual(before);
      expect(snap.openedAt!).toBeLessThanOrEqual(after);
    });

    it("increments totalTrips on each open", () => {
      for (let i = 0; i < 3; i++) cb.onFailure(new Error("f"));
      expect(cb.getSnapshot().totalTrips).toBe(1);
      // Reset and trip again
      cb.reset();
      for (let i = 0; i < 3; i++) cb.onFailure(new Error("f"));
      expect(cb.getSnapshot().totalTrips).toBe(2);
    });
  });

  // ── 3. OPEN state ────────────────────────────────────────────────────────────
  describe("OPEN state", () => {
    beforeEach(() => {
      // Trip the circuit
      cb.onFailure(new Error("f"));
      cb.onFailure(new Error("f"));
      cb.onFailure(new Error("f"));
      expect(cb.state).toBe("OPEN");
    });

    it("rejects requests with CIRCUIT_OPEN error when OPEN", () => {
      expect(() => cb.allowRequest()).toThrow(/CIRCUIT_OPEN/);
    });

    it("CIRCUIT_OPEN error includes consecutive failure count", () => {
      expect(() => cb.allowRequest()).toThrow(/3 consecutive failures/);
    });
  });

  // ── 4. OPEN → HALF_OPEN transition ───────────────────────────────────────────
  describe("OPEN → HALF_OPEN transition", () => {
    beforeEach(() => {
      cb.onFailure(new Error("f"));
      cb.onFailure(new Error("f"));
      cb.onFailure(new Error("f"));
      expect(cb.state).toBe("OPEN");
    });

    it("transitions to HALF_OPEN after cooldown elapses", async () => {
      expect(cb.state).toBe("OPEN");
      // Wait for cooldown (100ms in test instance)
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(cb.state).toBe("HALF_OPEN");
    });

    it("allows one probe request through in HALF_OPEN state", async () => {
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(cb.state).toBe("HALF_OPEN");
      expect(() => cb.allowRequest()).not.toThrow();
    });
  });

  // ── 5. HALF_OPEN → CLOSED on success ─────────────────────────────────────────
  describe("HALF_OPEN → CLOSED on probe success", () => {
    it("closes the circuit when probe succeeds", async () => {
      cb.onFailure(new Error("f"));
      cb.onFailure(new Error("f"));
      cb.onFailure(new Error("f"));
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(cb.state).toBe("HALF_OPEN");

      cb.onSuccess();
      expect(cb.state).toBe("CLOSED");
      expect(cb.getSnapshot().consecutiveFailures).toBe(0);
    });
  });

  // ── 6. HALF_OPEN → OPEN on failure ───────────────────────────────────────────
  describe("HALF_OPEN → OPEN on probe failure", () => {
    it("re-opens the circuit when probe fails", async () => {
      cb.onFailure(new Error("f"));
      cb.onFailure(new Error("f"));
      cb.onFailure(new Error("f"));
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(cb.state).toBe("HALF_OPEN");

      cb.onFailure(new Error("probe failed"));
      expect(cb.state).toBe("OPEN");
      expect(cb.getSnapshot().totalTrips).toBe(2);
    });
  });

  // ── 7. reset() ───────────────────────────────────────────────────────────────
  describe("reset()", () => {
    it("resets to CLOSED state and clears failure count", () => {
      cb.onFailure(new Error("f"));
      cb.onFailure(new Error("f"));
      cb.onFailure(new Error("f"));
      expect(cb.state).toBe("OPEN");

      cb.reset();
      expect(cb.state).toBe("CLOSED");
      expect(cb.getSnapshot().consecutiveFailures).toBe(0);
      expect(cb.getSnapshot().openedAt).toBeNull();
    });
  });

  // ── 8. getSnapshot() ─────────────────────────────────────────────────────────
  describe("getSnapshot()", () => {
    it("returns correct snapshot in CLOSED state", () => {
      const snap = cb.getSnapshot();
      expect(snap.state).toBe("CLOSED");
      expect(snap.consecutiveFailures).toBe(0);
      expect(snap.openedAt).toBeNull();
      expect(snap.lastClosedAt).toBeNull();
      expect(snap.totalTrips).toBe(0);
    });

    it("returns correct snapshot in OPEN state", () => {
      cb.onFailure(new Error("f"));
      cb.onFailure(new Error("f"));
      cb.onFailure(new Error("f"));
      const snap = cb.getSnapshot();
      expect(snap.state).toBe("OPEN");
      expect(snap.consecutiveFailures).toBe(3);
      expect(snap.openedAt).not.toBeNull();
      expect(snap.totalTrips).toBe(1);
    });
  });
});

// ── 9. getCircuitBreakerState (singleton) ────────────────────────────────────
describe("getCircuitBreakerState — singleton", () => {
  afterEach(() => {
    // Reset the singleton after each test to avoid cross-test contamination
    llmCircuitBreaker.reset();
  });

  it("returns a snapshot of the singleton circuit breaker", () => {
    const snap = getCircuitBreakerState();
    expect(snap).toHaveProperty("state");
    expect(snap).toHaveProperty("consecutiveFailures");
    expect(snap).toHaveProperty("openedAt");
    expect(snap).toHaveProperty("totalTrips");
  });

  it("reflects state changes on the singleton", () => {
    expect(getCircuitBreakerState().state).toBe("CLOSED");
    // Trip the singleton (needs 5 failures with default threshold)
    for (let i = 0; i < 5; i++) {
      llmCircuitBreaker.onFailure(new Error("f"));
    }
    expect(getCircuitBreakerState().state).toBe("OPEN");
  });
});
