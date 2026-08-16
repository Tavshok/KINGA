export type AssessorRoleActor = {
  role?: string | null;
  insurerRole?: string | null;
};

/**
 * An external assessor is an insurer sub-role, while a marketplace assessor
 * retains the top-level assessor role. Both may act only on a claim assigned
 * to their authenticated user identity.
 */
export function isExternalAssessor(actor: AssessorRoleActor | null | undefined): boolean {
  return actor?.role === "insurer" && actor.insurerRole === "assessor_external";
}

export function isAssignedAssessorActor(actor: AssessorRoleActor | null | undefined): boolean {
  return actor?.role === "assessor" || isExternalAssessor(actor);
}
