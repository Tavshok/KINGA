import { shouldStartMaintenanceWriteJobs } from "./maintenance-mode";

type MaintenanceWriterDependencies = {
  startIntakeEscalationJob: () => void;
  startStuckAssessmentRecoveryJob: () => void;
  checkRecoveryDeadlines: () => Promise<void>;
  schedule: (callback: () => void, delayMs: number) => unknown;
  warn: (message: string) => void;
  error: (message: string, error: unknown) => void;
};

/**
 * Starts the known maintenance-sensitive writers only when the freeze is off.
 * Kept separate from the HTTP bootstrap so startup behavior is directly tested.
 */
export function startMaintenanceSensitiveJobs(
  maintenanceMode: boolean,
  dependencies: MaintenanceWriterDependencies
): boolean {
  if (!shouldStartMaintenanceWriteJobs(maintenanceMode)) {
    dependencies.warn(
      "[Maintenance] Intake escalation, stuck recovery, and recovery-deadline writers are suppressed."
    );
    return false;
  }

  dependencies.startIntakeEscalationJob();
  dependencies.startStuckAssessmentRecoveryJob();
  dependencies.schedule(() => {
    dependencies
      .checkRecoveryDeadlines()
      .catch(error =>
        dependencies.error(
          "[RecoveryDeadlineAlerts] Startup check failed:",
          error
        )
      );
  }, 15_000);
  return true;
}
