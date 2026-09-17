import { describe, expect, it, vi } from "vitest";
import { startMaintenanceSensitiveJobs } from "./maintenance-write-jobs";

function createDependencies() {
  return {
    startIntakeEscalationJob: vi.fn(),
    startStuckAssessmentRecoveryJob: vi.fn(),
    checkRecoveryDeadlines: vi.fn().mockResolvedValue(undefined),
    schedule: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

describe("maintenance-sensitive startup jobs", () => {
  it("suppresses every known writer while maintenance mode is active", () => {
    const dependencies = createDependencies();

    expect(startMaintenanceSensitiveJobs(true, dependencies)).toBe(false);
    expect(dependencies.startIntakeEscalationJob).not.toHaveBeenCalled();
    expect(dependencies.startStuckAssessmentRecoveryJob).not.toHaveBeenCalled();
    expect(dependencies.schedule).not.toHaveBeenCalled();
    expect(dependencies.warn).toHaveBeenCalledOnce();
  });

  it("starts the normal writers and schedules the recovery deadline sweep when released", () => {
    const dependencies = createDependencies();

    expect(startMaintenanceSensitiveJobs(false, dependencies)).toBe(true);
    expect(dependencies.startIntakeEscalationJob).toHaveBeenCalledOnce();
    expect(dependencies.startStuckAssessmentRecoveryJob).toHaveBeenCalledOnce();
    expect(dependencies.schedule).toHaveBeenCalledOnce();
    expect(dependencies.schedule.mock.calls[0]?.[1]).toBe(15_000);
  });

  it("reports an asynchronous recovery-deadline failure without throwing from the scheduler", async () => {
    const dependencies = createDependencies();
    dependencies.checkRecoveryDeadlines.mockRejectedValueOnce(
      new Error("probe failure")
    );
    let scheduledCallback: (() => void) | undefined;
    dependencies.schedule.mockImplementation((callback: () => void) => {
      scheduledCallback = callback;
      return 1;
    });

    startMaintenanceSensitiveJobs(false, dependencies);
    scheduledCallback?.();
    await Promise.resolve();

    expect(dependencies.error).toHaveBeenCalledWith(
      "[RecoveryDeadlineAlerts] Startup check failed:",
      expect.any(Error)
    );
  });
});
