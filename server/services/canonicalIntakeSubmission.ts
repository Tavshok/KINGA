import type { CanonicalClaimInput, CanonicalIntakeActor } from "./canonicalClaimIntake";

export type CanonicalIntakePersistResult = {
  claimId: number;
  claimNumber: string;
  idempotent: boolean;
  repairerWarnings: string[];
};

export type CanonicalAssessmentStartResult = { status: "started" | "already_recorded" | "recoverable_failure" } | void;

export async function submitAndStartCanonicalIntake(
  dependencies: {
    persist: (actor: CanonicalIntakeActor, input: CanonicalClaimInput) => Promise<CanonicalIntakePersistResult>;
    startAssessment: (actor: CanonicalIntakeActor, claimId: number, idempotencyKey: string) => Promise<CanonicalAssessmentStartResult>;
  },
  actor: CanonicalIntakeActor,
  input: CanonicalClaimInput,
) {
  const persisted = await dependencies.persist(actor, input);
  const assessmentStart = await dependencies.startAssessment(actor, persisted.claimId, input.idempotencyKey);
  return { ...persisted, assessmentStartStatus: assessmentStart?.status ?? "started" };
}
