import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createScheduledClaimBatchFingerprint,
  createScheduledJobRunContext,
  observeScheduledClaimRace,
  observeScheduledClaimRaceError,
} from "./scheduled-claim-race-observability";

describe("scheduled claim race observability", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("emits a versioned, correlation-safe event without claim or error content", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const context = createScheduledJobRunContext(
      "intake-escalation",
      "heartbeat",
      "task-42"
    );

    observeScheduledClaimRace(context, {
      phase: "candidate_selected",
      action: "intake_auto_assign",
      claimId: 41,
      tenantId: 7,
      outcome: "attempted",
    });

    expect(warn).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(String(warn.mock.calls[0]?.[0]));
    expect(payload).toMatchObject({
      event: "scheduled_claim_race_observation",
      schema_version: 1,
      job_key: "intake-escalation",
      invocation_source: "heartbeat",
      heartbeat_task_uid: "task-42",
      claim_ref: "claim:41",
      tenant_id: 7,
      phase: "candidate_selected",
      action: "intake_auto_assign",
      outcome: "attempted",
    });
    expect(payload).toEqual(
      expect.not.objectContaining({
        claimNumber: expect.anything(),
        error: expect.anything(),
      })
    );
    expect(payload.runtime_instance_id).toEqual(expect.any(String));
    expect(payload.job_run_id).toEqual(context.jobRunId);
  });

  it("uses a deterministic non-PII fingerprint for the same candidate batch", () => {
    expect(createScheduledClaimBatchFingerprint([9, 3, 7])).toBe(
      createScheduledClaimBatchFingerprint([7, 9, 3])
    );
    expect(createScheduledClaimBatchFingerprint([3, 7, 9])).not.toBe("3,7,9");
  });

  it("records an error code without retaining the error message", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const context = createScheduledJobRunContext(
      "stuck-recovery",
      "startup_cleanup"
    );
    const error = Object.assign(
      new Error("document URL must never reach logs"),
      {
        code: "ER_LOCK_WAIT_TIMEOUT",
      }
    );

    observeScheduledClaimRaceError(
      context,
      {
        action: "recovery_retrigger",
        claimId: 99,
        recoveryCase: "Case1",
      },
      error
    );

    const payload = JSON.parse(String(warn.mock.calls[0]?.[0]));
    expect(payload).toMatchObject({
      phase: "error",
      outcome: "error",
      error_code: "DATABASE_LOCK_TIMEOUT",
      claim_ref: "claim:99",
      recovery_case: "Case1",
    });
    expect(JSON.stringify(payload)).not.toContain("document URL");
  });

  it("maps untrusted error fields to a fixed safe token", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const context = createScheduledJobRunContext("stuck-recovery");
    const error = Object.assign(new Error("Bearer live-secret-value"), {
      code: "https://document.example/private.pdf?token=secret",
      name: "Bearer live-secret-value",
    });

    observeScheduledClaimRaceError(
      context,
      { action: "recovery_retrigger", claimId: 14, recoveryCase: "Case1" },
      error
    );

    const payload = JSON.parse(String(warn.mock.calls[0]?.[0]));
    expect(payload.error_code).toBe("UNCLASSIFIED_ERROR");
    expect(JSON.stringify(payload)).not.toContain("private.pdf");
    expect(JSON.stringify(payload)).not.toContain("live-secret-value");
  });

  it("never lets a failing log sink alter the caller", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {
      throw new Error("log sink unavailable");
    });
    const context = createScheduledJobRunContext("intake-escalation");

    expect(() =>
      observeScheduledClaimRace(context, {
        phase: "side_effect_intent",
        action: "intake_auto_assign",
        claimId: 7,
      })
    ).not.toThrow();
  });

  it("contains hostile error getters before they reach job code", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const hostileError = {};
    Object.defineProperty(hostileError, "code", {
      get() {
        throw new Error("hostile getter must remain private");
      },
    });

    expect(() =>
      observeScheduledClaimRaceError(
        createScheduledJobRunContext("stuck-recovery"),
        { action: "recovery_retrigger", claimId: 18, recoveryCase: "Case1" },
        hostileError
      )
    ).not.toThrow();

    const payload = JSON.parse(String(warn.mock.calls[0]?.[0]));
    expect(payload.error_code).toBe("UNCLASSIFIED_ERROR");
  });
});
