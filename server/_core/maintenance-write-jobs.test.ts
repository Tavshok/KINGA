import { describe, expect, it, vi } from "vitest";
import { startMaintenanceSensitiveJobs } from "./maintenance-write-jobs";

function createDependencies() {
  return {
    startIntakeEscalationJob: vi.fn(),
    startStuckAssessmentRecoveryJob: vi.fn(),
    warn: vi.fn(),
  };
}

describe("maintenance-sensitive startup jobs", () => {
  it("suppresses every known writer while maintenance mode is active", () => {
    const dependencies = createDependencies();

    expect(startMaintenanceSensitiveJobs(true, dependencies)).toBe(false);
    expect(dependencies.startIntakeEscalationJob).not.toHaveBeenCalled();
    expect(dependencies.startStuckAssessmentRecoveryJob).not.toHaveBeenCalled();
    expect(dependencies.warn).toHaveBeenCalledWith(
      "[Maintenance] Intake escalation and stuck recovery writers are suppressed."
    );
  });

  it("starts only intake escalation and stuck recovery in normal mode", () => {
    vi.useFakeTimers();
    const dependencies = createDependencies();

    expect(startMaintenanceSensitiveJobs(false, dependencies)).toBe(true);
    expect(dependencies.startIntakeEscalationJob).toHaveBeenCalledOnce();
    expect(dependencies.startStuckAssessmentRecoveryJob).toHaveBeenCalledOnce();
    expect(dependencies.warn).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });
});
