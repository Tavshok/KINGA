import { createHash } from "crypto";
import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { agencyAssistedClaimantIdentities, agencyClients, users } from "../../drizzle/schema";
import { getDb } from "../db";

export type RestrictedAgencyAssistedClaimant = {
  id: number;
  tenantId: string;
  role: "claimant";
  uploadKeyPrefixes: string[];
  identityId: number;
  trustLevel: "restricted_agency_assisted";
};

/**
 * Resolves the claimant identity anchor for an actual agency-assisted accident claim.
 * An agency contact is not treated as a verified portal user. A restricted claimant
 * remains claim-workflow-only until a separately audited verified-user link is made.
 */
export async function resolveAgencyAssistedClaimantIdentity(input: {
  agencyTenantId: string;
  agencyClientId: number;
  insurerTenantId: string;
  agencyUserId: number;
}): Promise<RestrictedAgencyAssistedClaimant> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });

  const [client] = await db.select().from(agencyClients).where(and(
    eq(agencyClients.id, input.agencyClientId),
    eq(agencyClients.agencyTenantId, input.agencyTenantId),
  )).limit(1);
  if (!client) throw new TRPCError({ code: "NOT_FOUND", message: "Agency client not found." });

  const [existingIdentity] = await db.select().from(agencyAssistedClaimantIdentities).where(and(
    eq(agencyAssistedClaimantIdentities.agencyTenantId, input.agencyTenantId),
    eq(agencyAssistedClaimantIdentities.agencyClientId, input.agencyClientId),
    eq(agencyAssistedClaimantIdentities.insurerTenantId, input.insurerTenantId),
  )).limit(1);

  if (existingIdentity) {
    const claimantUserId = existingIdentity.verifiedClaimantUserId ?? existingIdentity.restrictedClaimantUserId;
    return {
      id: claimantUserId,
      tenantId: input.insurerTenantId,
      role: "claimant",
      uploadKeyPrefixes: [`agency-claims/${input.agencyUserId}/`],
      identityId: existingIdentity.id,
      trustLevel: "restricted_agency_assisted",
    };
  }

  const normalisedPhone = client.phone?.replace(/[^\d+]/g, "") ?? null;
  if (normalisedPhone) {
    const [verifiedClaimant] = await db.select({ id: users.id }).from(users).where(and(
      eq(users.tenantId, input.insurerTenantId),
      eq(users.phoneNumber, normalisedPhone),
      eq(users.isActive, 1),
      eq(users.isUnregisteredClaimant, 0),
    )).limit(1);
    if (verifiedClaimant) {
      const [identity] = await db.insert(agencyAssistedClaimantIdentities).values({
        agencyTenantId: input.agencyTenantId,
        agencyClientId: input.agencyClientId,
        insurerTenantId: input.insurerTenantId,
        restrictedClaimantUserId: verifiedClaimant.id,
        verifiedClaimantUserId: verifiedClaimant.id,
        status: "linked_to_verified_claimant",
        createdBy: input.agencyUserId,
        linkedBy: input.agencyUserId,
        linkedAt: new Date().toISOString().slice(0, 19).replace("T", " "),
      }).$returningId() as { id: number }[];
      return { id: verifiedClaimant.id, tenantId: input.insurerTenantId, role: "claimant", uploadKeyPrefixes: [`agency-claims/${input.agencyUserId}/`], identityId: identity.id, trustLevel: "restricted_agency_assisted" };
    }
  }

  const contactAnchor = normalisedPhone ?? client.email?.trim().toLowerCase() ?? String(client.id);
  const openId = `agency-assisted:${input.insurerTenantId}:${input.agencyClientId}:${createHash("sha256").update(contactAnchor).digest("hex").slice(0, 24)}`;
  const [restrictedUser] = await db.insert(users).values({
    openId,
    name: client.fullName,
    email: client.email ?? null,
    phoneNumber: normalisedPhone,
    role: "claimant",
    tenantId: input.insurerTenantId,
    emailVerified: 0,
    isUnregisteredClaimant: 1,
  }).onDuplicateKeyUpdate({ set: { name: client.fullName, phoneNumber: normalisedPhone } }).$returningId() as { id: number }[];

  const [identity] = await db.insert(agencyAssistedClaimantIdentities).values({
    agencyTenantId: input.agencyTenantId,
    agencyClientId: input.agencyClientId,
    insurerTenantId: input.insurerTenantId,
    restrictedClaimantUserId: restrictedUser.id,
    status: "restricted",
    createdBy: input.agencyUserId,
  }).$returningId() as { id: number }[];

  return { id: restrictedUser.id, tenantId: input.insurerTenantId, role: "claimant", uploadKeyPrefixes: [`agency-claims/${input.agencyUserId}/`], identityId: identity.id, trustLevel: "restricted_agency_assisted" };
}

export function isRestrictedAgencyAssistedIdentity(identity: { status: string; verifiedClaimantUserId?: number | null }): boolean {
  return identity.status === "restricted" && !identity.verifiedClaimantUserId;
}
