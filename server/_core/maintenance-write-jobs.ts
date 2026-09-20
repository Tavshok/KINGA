import { shouldStartMaintenanceWriteJobs } from "./maintenance-mode";

type MaintenanceWriterDependencies = {
  startIntakeEscalationJob: () => void;
  startStuckAssessmentRecoveryJob: () => void;
  warn: (message: string) => void;
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
      "[Maintenance] Intake escalation and stuck recovery writers are suppressed."
    );
    return false;
  }

  dependencies.startIntakeEscalationJob();
  dependencies.startStuckAssessmentRecoveryJob();
  return true;
}
