/**
 * Phase 6 — Pipeline Completeness Guard Tests
 *
 * Covers:
 *  - runCompletenessGuard: all 5 scenarios
 *  - enforceCompletenessOrThrow: throws on blocking failures, returns on non-blocking
 *  - PipelineIncompleteError: correct shape and message
 */

import { describe, it, expect } from "vitest";
import {
  runCompletenessGuard,
  enforceCompletenessOrThrow,
  PipelineIncompleteError,
  type CompletenessGuardInput,
} from "./pipeline-v2/pipelineCompletenessGuard";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const validIFE = { attributedGaps: [], isDOEEligible: true, overallFidelityScore: 0.9 };
const validDOE = { status: "OPTIMISED", selectedCandidate: null, disqualifications: [] };
const validFELSnapshot = {
  replaySupported: true,
  replayLimitation: null,
  stages: [
    { stageId: "stage-2", promptHash: "abc123" },
    { stageId: "stage-9", promptHash: "def456" },
  ],
};
const replayIncompleteFEL = {
  replaySupported: false,
  replayLimitation: "Stage stage-2 is missing a prompt hash and cannot be deterministically replayed.",
  stages: [
    { stageId: "stage-2", promptHash: null },
    { stageId: "stage-9", promptHash: "def456" },
  ],
};

function makeInput(overrides: Partial<CompletenessGuardInput> = {}): CompletenessGuardInput {
  return {
    ifeResult: validIFE,
    doeResult: validDOE,
    felVersionSnapshot: validFELSnapshot,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Phase 6 — Pipeline Completeness Guard", () => {

  // ── Scenario 1: All present and complete ──────────────────────────────────
  describe("Scenario 1: All present and complete", () => {
    it("returns complete=true with no failures", () => {
      const result = runCompletenessGuard(makeInput());
      expect(result.complete).toBe(true);
      expect(result.failures).toHaveLength(0);
      expect(result.failureState).toBeNull();
      expect(result.exceptionReason).toBeNull();
    });
  });

  // ── Scenario 2: IFE absent ────────────────────────────────────────────────
  describe("Scenario 2: IFE absent", () => {
    it("returns complete=false with IFE_ABSENT blocking failure", () => {
      const result = runCompletenessGuard(makeInput({ ifeResult: null }));
      expect(result.complete).toBe(false);
      expect(result.failureState).toBe("PIPELINE_INCOMPLETE");
      const ifeFailure = result.failures.find(f => f.reason === "IFE_ABSENT");
      expect(ifeFailure).toBeDefined();
      expect(ifeFailure!.blocking).toBe(true);
    });

    it("includes IFE_ABSENT when ifeResult is undefined", () => {
      const result = runCompletenessGuard(makeInput({ ifeResult: undefined }));
      expect(result.complete).toBe(false);
      expect(result.failures.some(f => f.reason === "IFE_ABSENT")).toBe(true);
    });
  });

  // ── Scenario 3: DOE absent ────────────────────────────────────────────────
  describe("Scenario 3: DOE absent", () => {
    it("returns complete=false with DOE_ABSENT blocking failure", () => {
      const result = runCompletenessGuard(makeInput({ doeResult: null }));
      expect(result.complete).toBe(false);
      expect(result.failureState).toBe("PIPELINE_INCOMPLETE");
      const doeFailure = result.failures.find(f => f.reason === "DOE_ABSENT");
      expect(doeFailure).toBeDefined();
      expect(doeFailure!.blocking).toBe(true);
    });
  });

  // ── Scenario 4: Both IFE and DOE absent ───────────────────────────────────
  describe("Scenario 4: Both IFE and DOE absent", () => {
    it("returns both blocking failures and PIPELINE_INCOMPLETE state", () => {
      const result = runCompletenessGuard(makeInput({ ifeResult: null, doeResult: null }));
      expect(result.complete).toBe(false);
      expect(result.failureState).toBe("PIPELINE_INCOMPLETE");
      expect(result.failures.some(f => f.reason === "IFE_ABSENT")).toBe(true);
      expect(result.failures.some(f => f.reason === "DOE_ABSENT")).toBe(true);
      expect(result.exceptionReason).toContain("IFE_ABSENT");
      expect(result.exceptionReason).toContain("DOE_ABSENT");
    });
  });

  // ── Scenario 5: FEL snapshot absent (non-blocking) ────────────────────────
  describe("Scenario 5: FEL snapshot absent (non-blocking)", () => {
    it("returns complete=true but with REPLAY_INCOMPLETE failureState", () => {
      const result = runCompletenessGuard(makeInput({ felVersionSnapshot: null }));
      expect(result.complete).toBe(true);
      expect(result.failureState).toBe("REPLAY_INCOMPLETE");
      const felFailure = result.failures.find(f => f.reason === "FEL_SNAPSHOT_ABSENT");
      expect(felFailure).toBeDefined();
      expect(felFailure!.blocking).toBe(false);
    });
  });

  // ── Scenario 6: FEL snapshot present but replaySupported=false ────────────
  describe("Scenario 6: FEL snapshot with missing prompt hashes", () => {
    it("returns complete=true but with REPLAY_INCOMPLETE failureState and limitation message", () => {
      const result = runCompletenessGuard(makeInput({ felVersionSnapshot: replayIncompleteFEL }));
      expect(result.complete).toBe(true);
      expect(result.failureState).toBe("REPLAY_INCOMPLETE");
      const replayFailure = result.failures.find(f => f.reason === "REPLAY_INCOMPLETE");
      expect(replayFailure).toBeDefined();
      expect(replayFailure!.blocking).toBe(false);
      expect(replayFailure!.detail).toContain("missing a prompt hash");
    });
  });

  // ── Scenario 7: IFE absent + FEL incomplete — blocking wins ──────────────
  describe("Scenario 7: IFE absent + FEL incomplete — blocking failure wins", () => {
    it("returns PIPELINE_INCOMPLETE (not REPLAY_INCOMPLETE) when blocking failure also present", () => {
      const result = runCompletenessGuard(makeInput({
        ifeResult: null,
        felVersionSnapshot: replayIncompleteFEL,
      }));
      expect(result.complete).toBe(false);
      expect(result.failureState).toBe("PIPELINE_INCOMPLETE");
    });
  });

  // ── enforceCompletenessOrThrow ─────────────────────────────────────────────
  describe("enforceCompletenessOrThrow", () => {
    it("throws PipelineIncompleteError when IFE is absent", () => {
      expect(() =>
        enforceCompletenessOrThrow(42, makeInput({ ifeResult: null }))
      ).toThrow(PipelineIncompleteError);
    });

    it("throws PipelineIncompleteError with correct claimId and guardResult", () => {
      try {
        enforceCompletenessOrThrow(99, makeInput({ doeResult: null }));
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(PipelineIncompleteError);
        const pie = err as PipelineIncompleteError;
        expect(pie.claimId).toBe(99);
        expect(pie.guardResult.failureState).toBe("PIPELINE_INCOMPLETE");
        expect(pie.message).toContain("claim 99");
      }
    });

    it("does NOT throw when all present and complete", () => {
      const result = enforceCompletenessOrThrow(1, makeInput());
      expect(result.complete).toBe(true);
      expect(result.failureState).toBeNull();
    });

    it("does NOT throw when only FEL is incomplete (non-blocking)", () => {
      const result = enforceCompletenessOrThrow(2, makeInput({ felVersionSnapshot: replayIncompleteFEL }));
      expect(result.complete).toBe(true);
      expect(result.failureState).toBe("REPLAY_INCOMPLETE");
    });

    it("error name is PipelineIncompleteError", () => {
      try {
        enforceCompletenessOrThrow(7, makeInput({ ifeResult: null }));
      } catch (err) {
        expect((err as Error).name).toBe("PipelineIncompleteError");
      }
    });
  });

  // ── Design contract: Governance Gate is now historical only ───────────────
  describe("Design contract: new pipeline runs never produce sub-v4.0 reports", () => {
    it("a fully wired pipeline run passes the guard and can write a report", () => {
      // Simulate a complete Phase 4+ pipeline run
      const result = runCompletenessGuard({
        ifeResult: { attributedGaps: [], isDOEEligible: true, overallFidelityScore: 0.95 },
        doeResult: { status: "OPTIMISED", selectedCandidate: null, disqualifications: [] },
        felVersionSnapshot: {
          replaySupported: true,
          replayLimitation: null,
          stages: [{ stageId: "stage-2", promptHash: "hash1" }],
        },
      });
      expect(result.complete).toBe(true);
      expect(result.failures).toHaveLength(0);
      // This is the only condition under which buildResult is called
    });

    it("a pipeline run missing IFE is blocked from writing a report", () => {
      // Simulate a pre-Phase 3 run where IFE was not yet wired
      const result = runCompletenessGuard({
        ifeResult: null,
        doeResult: validDOE,
        felVersionSnapshot: validFELSnapshot,
      });
      expect(result.complete).toBe(false);
      // The orchestrator must NOT call buildResult in this case
    });
  });
});
