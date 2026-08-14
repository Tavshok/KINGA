import type { CanonicalClaimInput, CanonicalIntakeActor } from "./canonicalClaimIntake";
import {
  submitAndStartCanonicalIntake,
  type CanonicalAssessmentStartResult,
  type CanonicalIntakePersistResult,
} from "./canonicalIntakeSubmission";

export type CanonicalIntakeAdapterDependencies = {
  persist: (actor: CanonicalIntakeActor, input: CanonicalClaimInput) => Promise<CanonicalIntakePersistResult>;
  startAssessment: (actor: CanonicalIntakeActor, claimId: number, idempotencyKey: string) => Promise<CanonicalAssessmentStartResult>;
};

/**
 * Concrete web/My Portal adapter boundary after its request has been validated
 * and normalised by the claims router. It owns no persistence or assessment logic.
 */
export function submitPortalCanonicalIntake(
  dependencies: CanonicalIntakeAdapterDependencies,
  actor: CanonicalIntakeActor,
  input: CanonicalClaimInput,
) {
  return submitAndStartCanonicalIntake(dependencies, actor, input);
}

/**
 * Concrete WhatsApp-local adapter boundary after its session data and claimant
 * identity have been resolved. It remains provider-agnostic and replay-safe.
 */
export function submitWhatsAppCanonicalIntake(
  dependencies: CanonicalIntakeAdapterDependencies,
  actor: CanonicalIntakeActor,
  input: CanonicalClaimInput,
) {
  return submitAndStartCanonicalIntake(dependencies, actor, input);
}
