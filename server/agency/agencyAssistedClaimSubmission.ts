import { TRPCError } from "@trpc/server";
import {
  assertCanonicalAttachmentOwnership,
  type CanonicalAttachment,
  type CanonicalClaimInput,
  type CanonicalIntakeActor,
} from "../services/canonicalClaimIntake";
import { submitAndStartCanonicalIntake } from "../services/canonicalIntakeSubmission";

export type AgencyAssistedClient = { id: number; fullName: string | null; phone: string | null };
export type AgencyAssistedClaimSubmissionInput = Omit<CanonicalClaimInput, "channel" | "claimantPhone" | "attachments" | "sourceMetadata"> & {
  agencyClientId: number;
  insurerTenantId: string;
  idempotencyKey: string;
  attachments: CanonicalAttachment[];
};

export type AgencyAssistedClaimSubmissionDependencies = {
  loadScopedClient: (agencyClientId: number) => Promise<AgencyAssistedClient | null>;
  insurerExists: (insurerTenantId: string) => Promise<boolean>;
  resolveActor: () => Promise<CanonicalIntakeActor & { identityId: number; trustLevel: "restricted_agency_assisted" }>;
  persist: (actor: CanonicalIntakeActor, input: CanonicalClaimInput) => Promise<{ claimId: number; claimNumber: string; idempotent: boolean; repairerWarnings: string[] }>;
  startAssessment: (actor: CanonicalIntakeActor, claimId: number, idempotencyKey: string) => Promise<{ status: "started" | "already_recorded" | "recoverable_failure" } | void>;
  agencyTenantId: string;
  agencyUserId: number;
};

/**
 * Executes the only permitted agency-assisted accident path. The function knows
 * nothing about insurance service requests, quotation requests, policy, premium,
 * repair cost, payment, or settlement records.
 */
export async function submitAgencyAssistedCanonicalClaim(
  dependencies: AgencyAssistedClaimSubmissionDependencies,
  input: AgencyAssistedClaimSubmissionInput,
) {
  const client = await dependencies.loadScopedClient(input.agencyClientId);
  if (!client) throw new TRPCError({ code: "NOT_FOUND", message: "Agency client not found." });
  if (!(await dependencies.insurerExists(input.insurerTenantId))) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Insurer tenant not found." });
  }

  const actor = await dependencies.resolveActor();
  if (actor.tenantId !== input.insurerTenantId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Agency-assisted claimant identity is not available in the selected insurer tenant." });
  }
  assertCanonicalAttachmentOwnership(actor, input.attachments);
  const persisted = await submitAndStartCanonicalIntake({ persist: dependencies.persist, startAssessment: dependencies.startAssessment }, actor, {
    ...input,
    channel: "agency_assisted",
    claimantPhone: client.phone ?? undefined,
    attachments: input.attachments,
    sourceMetadata: {
      agencyTenantId: dependencies.agencyTenantId,
      agencyClientId: input.agencyClientId,
      agencySubmittedBy: dependencies.agencyUserId,
      claimantIdentityTrust: actor.trustLevel,
      claimantName: client.fullName,
    },
  });
  return { ...persisted, claimantIdentityId: actor.identityId, claimantIdentityTrust: actor.trustLevel };
}
