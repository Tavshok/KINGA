/**
 * Executes owned-fixture teardown without turning a failed child deletion into
 * a new orphan. A dependent parent step is skipped when its prerequisite fails;
 * unrelated cleanup continues and the supplied exact-ID verification still runs.
 */
export type OwnedFixtureCleanupStep = {
  id: string;
  remove: () => Promise<void>;
  requires?: string[];
};

export async function cleanupOwnedFixture(
  steps: OwnedFixtureCleanupStep[],
  verifyNoResidue: () => Promise<void>,
): Promise<void> {
  const completed = new Set<string>();
  const failures: Error[] = [];

  for (const step of steps) {
    const blockedBy = (step.requires ?? []).filter((dependency) => !completed.has(dependency));
    if (blockedBy.length) {
      failures.push(new Error(`Skipped ${step.id}: prerequisite cleanup failed or was skipped (${blockedBy.join(", ")})`));
      continue;
    }
    try {
      await step.remove();
      completed.add(step.id);
    } catch (error) {
      failures.push(new Error(`Failed ${step.id}: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  try {
    await verifyNoResidue();
  } catch (error) {
    failures.push(new Error(`Fixture residue verification failed: ${error instanceof Error ? error.message : String(error)}`));
  }

  if (failures.length) {
    throw new AggregateError(failures, "Owned fixture cleanup did not complete");
  }
}
