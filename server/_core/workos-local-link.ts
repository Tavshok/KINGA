import { and, eq, isNull, sql } from "drizzle-orm";

import { tenants, users } from "../../drizzle/schema";
import type { WorkOSAuthenticatedIdentity } from "./workos";
import { getDb } from "../db";

export type WorkOSLinkErrorCode =
  | "WORKOS_LINK_DENIED"
  | "WORKOS_LINK_UNAVAILABLE";

/**
 * Safe error boundary for the callback: detailed eligibility reasons stay in
 * server-side telemetry and are never returned to the browser.
 */
export class WorkOSLocalLinkError extends Error {
  constructor(readonly code: WorkOSLinkErrorCode) {
    super("WorkOS authentication could not be completed.");
    this.name = "WorkOSLocalLinkError";
  }
}

export type WorkOSLinkDenialReason =
  | "provider_email_not_verified"
  | "invalid_identity"
  | "ambiguous_or_missing_local_user"
  | "ineligible_local_user"
  | "tenant_organization_mismatch"
  | "existing_workos_link_mismatch"
  | "concurrent_link_conflict";

export type WorkOSLocalLinkAudit = {
  /** Receives only a fixed reason enum; never identifiers, email, or tenant data. */
  onDenied?(reason: WorkOSLinkDenialReason): void | Promise<void>;
};

export type LinkedWorkOSUser = {
  id: number;
  openId: string;
  name: string | null;
  tenantId: string;
  role: NonNullable<(typeof users.$inferSelect)["role"]>;
};

function canonicalEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (
    normalized.length === 0 ||
    normalized.length > 320 ||
    /[\u0000-\u001f\u007f-\u009f\s]/u.test(normalized) ||
    !/^[^@]+@[^@]+\.[^@]+$/u.test(normalized)
  ) {
    return null;
  }
  return normalized;
}

function validOpaqueIdentifier(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 128 &&
    /^[A-Za-z0-9_-]+$/u.test(value)
  );
}

async function recordDenial(
  audit: WorkOSLocalLinkAudit | undefined,
  reason: WorkOSLinkDenialReason
): Promise<void> {
  try {
    await audit?.onDenied?.(reason);
  } catch {
    // Authentication remains fail-closed even if optional observability is down.
  }
}

async function deny(
  audit: WorkOSLocalLinkAudit | undefined,
  reason: WorkOSLinkDenialReason
): Promise<never> {
  await recordDenial(audit, reason);
  throw new WorkOSLocalLinkError("WORKOS_LINK_DENIED");
}

/**
 * Finds exactly one eligible local human account and links it to an already
 * verified WorkOS identity. It never creates users or tenants, never changes
 * tenant mapping, and never issues a KINGA session.
 */
export async function linkExistingWorkOSIdentity(
  identity: WorkOSAuthenticatedIdentity,
  audit?: WorkOSLocalLinkAudit
): Promise<LinkedWorkOSUser> {
  const email = canonicalEmail(identity?.email);
  const workosUserId = identity?.workosUserId;
  const organizationId = identity?.organizationId;
  if (!identity?.emailVerified) {
    return deny(audit, "provider_email_not_verified");
  }
  if (
    !email ||
    !validOpaqueIdentifier(workosUserId) ||
    !validOpaqueIdentifier(organizationId)
  ) {
    return deny(audit, "invalid_identity");
  }

  const db = await getDb();
  if (!db) {
    throw new WorkOSLocalLinkError("WORKOS_LINK_UNAVAILABLE");
  }

  try {
    return await db.transaction(async tx => {
      // No LIMIT: multiple database rows with the same email are an ambiguity,
      // not an arbitrary winner. The lock serializes two callbacks racing for
      // the same eligible local identity.
      const candidates = await tx
        .select()
        .from(users)
        .where(sql`lower(${users.email}) = ${email}`)
        .for("update");

      if (candidates.length !== 1) {
        return await deny(audit, "ambiguous_or_missing_local_user");
      }

      const candidate = candidates[0];
      if (
        canonicalEmail(candidate.email) !== email ||
        !candidate.tenantId ||
        candidate.isActive !== 1 ||
        candidate.isQaAccount !== 0 ||
        candidate.isUnregisteredClaimant !== 0
      ) {
        return await deny(audit, "ineligible_local_user");
      }

      const [tenant] = await tx
        .select()
        .from(tenants)
        .where(
          and(
            eq(tenants.id, candidate.tenantId),
            eq(tenants.status, "active"),
            eq(tenants.isSyntheticTenant, 0),
            eq(tenants.workosOrganizationId, organizationId)
          )
        )
        .for("update");

      if (!tenant) {
        return await deny(audit, "tenant_organization_mismatch");
      }

      if (
        candidate.workosUserId !== null &&
        candidate.workosUserId !== workosUserId
      ) {
        return await deny(audit, "existing_workos_link_mismatch");
      }

      if (candidate.workosUserId === null) {
        const result = await tx
          .update(users)
          .set({ workosUserId })
          .where(
            and(
              eq(users.id, candidate.id),
              sql`lower(${users.email}) = ${email}`,
              eq(users.tenantId, candidate.tenantId),
              eq(users.isActive, 1),
              eq(users.isQaAccount, 0),
              eq(users.isUnregisteredClaimant, 0),
              isNull(users.workosUserId)
            )
          );
        const affectedRows = Number(
          (result as unknown as [{ affectedRows?: number }])[0]?.affectedRows ??
            0
        );
        if (affectedRows !== 1) {
          return await deny(audit, "concurrent_link_conflict");
        }
      }

      return {
        id: candidate.id,
        openId: candidate.openId,
        name: candidate.name,
        tenantId: candidate.tenantId,
        role: candidate.role,
      };
    });
  } catch (error) {
    if (error instanceof WorkOSLocalLinkError) throw error;
    // A duplicate key caused by a concurrent link is indistinguishable from any
    // other unavailable persistence outcome at the browser boundary.
    throw new WorkOSLocalLinkError("WORKOS_LINK_UNAVAILABLE");
  }
}
