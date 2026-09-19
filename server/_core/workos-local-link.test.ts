import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { and, eq, like } from "drizzle-orm";

import { tenants, users } from "../../drizzle/schema";
import { getDb } from "../db";
import {
  linkExistingWorkOSIdentity,
  WorkOSLocalLinkError,
  type WorkOSLinkDenialReason,
} from "./workos-local-link";

let counter = 0;
let prefix = "";

function identity(
  overrides: Partial<{
    workosUserId: string;
    email: string;
    emailVerified: boolean;
    organizationId: string;
  }> = {}
) {
  return {
    workosUserId: overrides.workosUserId ?? `user_workos_${prefix}`,
    email: overrides.email ?? `owner-${prefix}@example.test`,
    emailVerified: overrides.emailVerified ?? true,
    organizationId: overrides.organizationId ?? `org_workos_${prefix}`,
  };
}

async function database() {
  const db = await getDb();
  if (!db) throw new Error("Dedicated CI database is unavailable");
  return db;
}

async function createEligibleFixture(
  overrides: {
    email?: string;
    workosUserId?: string | null;
    tenantWorkosOrganizationId?: string | null;
    status?: "active" | "suspended" | "cancelled";
    isSyntheticTenant?: number;
    isActive?: number;
    isQaAccount?: number | null;
    isUnregisteredClaimant?: number;
  } = {}
) {
  const db = await database();
  const suffix = `${prefix}-${counter++}`;
  const tenantId = `workos-link-tenant-${suffix}`;
  const email = overrides.email ?? `owner-${prefix}@example.test`;
  const organizationId =
    overrides.tenantWorkosOrganizationId === undefined
      ? `org_workos_${prefix}`
      : overrides.tenantWorkosOrganizationId;

  await db.insert(tenants).values({
    id: tenantId,
    workosOrganizationId: organizationId,
    name: `WorkOS Link ${suffix}`,
    displayName: `WorkOS Link ${suffix}`,
    contactEmail: `contact-${suffix}@example.test`,
    billingEmail: `billing-${suffix}@example.test`,
    status: overrides.status ?? "active",
    isSyntheticTenant: overrides.isSyntheticTenant ?? 0,
  });

  const [created] = await db
    .insert(users)
    .values({
      openId: `workos-link-user-${suffix}`,
      name: `WorkOS Link ${suffix}`,
      email,
      role: "user",
      tenantId,
      workosUserId: overrides.workosUserId ?? null,
      isActive: overrides.isActive ?? 1,
      isQaAccount:
        overrides.isQaAccount === undefined ? 0 : overrides.isQaAccount,
      isUnregisteredClaimant: overrides.isUnregisteredClaimant ?? 0,
    })
    .$returningId();

  return { id: created.id, tenantId, email, organizationId };
}

async function clearFixtureData() {
  const db = await database();
  await db.delete(users).where(like(users.openId, "workos-link-user-%"));
  await db.delete(tenants).where(like(tenants.id, "workos-link-tenant-%"));
}

describe("guarded WorkOS local linking", () => {
  beforeEach(async () => {
    prefix = `${Date.now()}-${counter++}`;
    await clearFixtureData();
  });
  afterEach(clearFixtureData);

  it("links exactly one existing eligible human under a matching tenant organization", async () => {
    const fixture = await createEligibleFixture();
    const linked = await linkExistingWorkOSIdentity(
      identity({ email: fixture.email })
    );

    expect(linked).toMatchObject({
      id: fixture.id,
      tenantId: fixture.tenantId,
    });
    const db = await database();
    const [updated] = await db
      .select({ workosUserId: users.workosUserId })
      .from(users)
      .where(eq(users.id, fixture.id));
    expect(updated.workosUserId).toBe(`user_workos_${prefix}`);
  });

  it("fails closed for an unverified provider identity without changing the user", async () => {
    const fixture = await createEligibleFixture();
    const reasons: WorkOSLinkDenialReason[] = [];

    await expect(
      linkExistingWorkOSIdentity(
        identity({ email: fixture.email, emailVerified: false }),
        { onDenied: reason => reasons.push(reason) }
      )
    ).rejects.toMatchObject({ code: "WORKOS_LINK_DENIED" });
    expect(reasons).toEqual(["provider_email_not_verified"]);

    const db = await database();
    const [unchanged] = await db
      .select({ workosUserId: users.workosUserId })
      .from(users)
      .where(eq(users.id, fixture.id));
    expect(unchanged.workosUserId).toBeNull();
  });

  it("fails closed and emits only a generic reason on tenant organization mismatch", async () => {
    const fixture = await createEligibleFixture();
    const reasons: WorkOSLinkDenialReason[] = [];

    await expect(
      linkExistingWorkOSIdentity(
        identity({
          email: fixture.email,
          organizationId: `org_wrong_${prefix}`,
        }),
        { onDenied: reason => reasons.push(reason) }
      )
    ).rejects.toMatchObject({ code: "WORKOS_LINK_DENIED" });
    expect(reasons).toEqual(["tenant_organization_mismatch"]);

    const db = await database();
    const [unchanged] = await db
      .select({ workosUserId: users.workosUserId })
      .from(users)
      .where(eq(users.id, fixture.id));
    expect(unchanged.workosUserId).toBeNull();
  });

  it("rejects duplicate canonical email candidates instead of selecting an arbitrary user", async () => {
    const fixture = await createEligibleFixture({
      email: `Owner-${prefix}@example.test`,
    });
    const db = await database();
    await db.insert(users).values({
      openId: `workos-link-user-${prefix}-duplicate`,
      name: "Duplicate canonical-email fixture",
      email: `owner-${prefix}@example.test`,
      role: "user",
      tenantId: fixture.tenantId,
      isActive: 1,
      isQaAccount: 0,
      isUnregisteredClaimant: 0,
    });
    const reasons: WorkOSLinkDenialReason[] = [];

    await expect(
      linkExistingWorkOSIdentity(
        identity({ email: fixture.email.toLowerCase() }),
        {
          onDenied: reason => reasons.push(reason),
        }
      )
    ).rejects.toMatchObject({ code: "WORKOS_LINK_DENIED" });
    expect(reasons).toEqual(["ambiguous_or_missing_local_user"]);
  });

  it.each([
    ["inactive", { isActive: 0 }],
    ["unregistered claimant", { isUnregisteredClaimant: 1 }],
    ["ambiguous QA account", { isQaAccount: null }],
    ["synthetic tenant", { isSyntheticTenant: 1 }],
    ["suspended tenant", { status: "suspended" as const }],
    ["unmapped tenant", { tenantWorkosOrganizationId: null }],
  ])("denies an ineligible %s without linking", async (_label, overrides) => {
    const fixture = await createEligibleFixture(overrides);

    await expect(
      linkExistingWorkOSIdentity(identity({ email: fixture.email }))
    ).rejects.toMatchObject({ code: "WORKOS_LINK_DENIED" });
  });

  it("does not overwrite a conflicting pre-existing WorkOS mapping", async () => {
    const fixture = await createEligibleFixture({
      workosUserId: `user_existing_${prefix}`,
    });

    await expect(
      linkExistingWorkOSIdentity(identity({ email: fixture.email }))
    ).rejects.toMatchObject({ code: "WORKOS_LINK_DENIED" });

    const db = await database();
    const [unchanged] = await db
      .select({ workosUserId: users.workosUserId })
      .from(users)
      .where(
        and(
          eq(users.id, fixture.id),
          eq(users.workosUserId, `user_existing_${prefix}`)
        )
      );
    expect(unchanged).toBeDefined();
  });

  it("serializes competing WorkOS identities for the same canonical email", async () => {
    const fixture = await createEligibleFixture();

    const attempts = await Promise.allSettled([
      linkExistingWorkOSIdentity(
        identity({
          email: fixture.email,
          workosUserId: `user_race_a_${prefix}`,
        })
      ),
      linkExistingWorkOSIdentity(
        identity({
          email: fixture.email,
          workosUserId: `user_race_b_${prefix}`,
        })
      ),
    ]);

    expect(
      attempts.filter(attempt => attempt.status === "fulfilled")
    ).toHaveLength(1);
    expect(
      attempts.filter(attempt => attempt.status === "rejected")
    ).toHaveLength(1);

    const db = await database();
    const [linked] = await db
      .select({ workosUserId: users.workosUserId })
      .from(users)
      .where(eq(users.id, fixture.id));
    expect([`user_race_a_${prefix}`, `user_race_b_${prefix}`]).toContain(
      linked.workosUserId
    );
  });
});
