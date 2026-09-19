import {
  runFencedRecoveryDeadlineCheckForCase,
  runFencedRecoveryDeadlineSweep,
} from "./recovery-deadline-sweep-executor";

/**
 * Runs one bounded, lease-fenced global recovery-deadline sweep. All callers,
 * including startup and the dedicated scheduler route, converge here.
 */
export async function checkRecoveryDeadlines(): Promise<void> {
  const result = await runFencedRecoveryDeadlineSweep();
  if (!result.acquired) {
    console.info(
      "[RecoveryDeadlineAlerts] Sweep skipped because another holder owns the lease."
    );
    return;
  }
  if (result.lostLease) {
    console.warn(
      "[RecoveryDeadlineAlerts] Sweep stopped after losing its fenced lease."
    );
    return;
  }
  console.info(
    `[RecoveryDeadlineAlerts] Sweep finished: staged=${result.staged}, delivered=${result.delivered}, retryable=${result.retryable}.`
  );
}

/**
 * Event-driven checks share the exact same fence and outbox contract as global
 * sweeps. A concurrent startup or HTTP sweep therefore cannot duplicate an
 * alert effect for this recovery case.
 */
export async function checkSingleCaseDeadline(caseId: number): Promise<void> {
  const result = await runFencedRecoveryDeadlineCheckForCase(caseId);
  if (!result.acquired) {
    console.info(
      `[RecoveryDeadlineAlerts] RC-${caseId} check skipped because another holder owns the lease.`
    );
    return;
  }
  if (result.lostLease) {
    console.warn(
      `[RecoveryDeadlineAlerts] RC-${caseId} check stopped after losing its fenced lease.`
    );
  }
}
