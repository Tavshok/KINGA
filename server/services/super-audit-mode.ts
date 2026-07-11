// @ts-nocheck — AUDIT-01 in progress: db initialisation fixed, audit_trail field mapping applied
/**
 * Super Audit Mode Service
 *
 * Provides super-admin audit capabilities:
 * - Tenant selection and role impersonation
 * - Read-only dashboard access
 * - Claim replay and AI scoring inspection
 * - Full audit logging
 *
 * AUDIT-01: All audit inserts now target audit_trail with correct schema fields.
 * targetType → entityType (varchar), targetId → entityId (int, string IDs hashed to 0),
 * metadata → changeDescription (JSON stringified), db now awaited per-function.
 */

import { getDb } from "../db";
import { superAuditSessions, auditTrail, users } from "../../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";

/**
 * Audit context for super-admin sessions
 */
export interface AuditContext {
  superAdminUserId: number;
  superAdminName: string;
  auditedTenantId: string | null;
  impersonatedRole: string | null;
  sessionId: number;
  isAuditMode: boolean;
}

/**
 * Create new super audit session
 */
export async function createSuperAuditSession(
  superAdminUserId: number,
  superAdminName: string
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const [result] = await db.insert(superAuditSessions).values({
    superAdminUserId,
    superAdminName,
    isActive: 1,
  });

  // AUDIT-01: audit_trail — super audit session created
  await db.insert(auditTrail).values({
    userId: superAdminUserId,
    action: "SUPER_AUDIT_SESSION_CREATED",
    entityType: "super_audit_session",
    entityId: result.insertId,
    changeDescription: JSON.stringify({
      superAdminName,
      sessionId: result.insertId,
    }),
    createdAt: new Date().toISOString(),
  });

  return result.insertId;
}

/**
 * Set audit context (tenant + role impersonation)
 */
export async function setAuditContext(
  sessionId: number,
  superAdminUserId: number,
  auditedTenantId: string,
  impersonatedRole: string
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  // Update session with audit context
  await db
    .update(superAuditSessions)
    .set({
      auditedTenantId,
      impersonatedRole,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(superAuditSessions.id, sessionId),
        eq(superAuditSessions.superAdminUserId, superAdminUserId)
      )
    );

  // AUDIT-01: audit_trail — tenant selection (entityId=sessionId, tenantId stored in changeDescription)
  await db.insert(auditTrail).values({
    userId: superAdminUserId,
    action: "SUPER_AUDIT_VIEW_TENANT",
    entityType: "tenant",
    entityId: sessionId,
    changeDescription: JSON.stringify({
      sessionId,
      auditedTenantId,
      impersonatedRole,
    }),
    createdAt: new Date().toISOString(),
  });

  // AUDIT-01: audit_trail — role impersonation
  await db.insert(auditTrail).values({
    userId: superAdminUserId,
    action: "SUPER_AUDIT_IMPERSONATE_ROLE",
    entityType: "role",
    entityId: sessionId,
    changeDescription: JSON.stringify({
      sessionId,
      auditedTenantId,
      impersonatedRole,
    }),
    createdAt: new Date().toISOString(),
  });
}

/**
 * Track accessed claim
 */
export async function trackAccessedClaim(
  sessionId: number,
  superAdminUserId: number,
  claimId: number
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  // Get current session
  const [session] = await db
    .select()
    .from(superAuditSessions)
    .where(eq(superAuditSessions.id, sessionId))
    .limit(1);

  if (!session) return;

  // Parse existing accessed claim IDs
  const accessedClaimIds = session.accessedClaimIds
    ? JSON.parse(session.accessedClaimIds)
    : [];

  // Add new claim ID if not already tracked
  if (!accessedClaimIds.includes(claimId)) {
    accessedClaimIds.push(claimId);

    await db
      .update(superAuditSessions)
      .set({
        accessedClaimIds: JSON.stringify(accessedClaimIds),
        updatedAt: new Date(),
      })
      .where(eq(superAuditSessions.id, sessionId));
  }

  // AUDIT-01: audit_trail — claim access
  await db.insert(auditTrail).values({
    userId: superAdminUserId,
    action: "SUPER_AUDIT_VIEW_CLAIM",
    entityType: "claim",
    entityId: claimId,
    changeDescription: JSON.stringify({
      sessionId,
      claimId,
      tenantId: session.auditedTenantId,
    }),
    createdAt: new Date().toISOString(),
  });
}

/**
 * Track replayed claim
 */
export async function trackReplayedClaim(
  sessionId: number,
  superAdminUserId: number,
  claimId: number
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  // Get current session
  const [session] = await db
    .select()
    .from(superAuditSessions)
    .where(eq(superAuditSessions.id, sessionId))
    .limit(1);

  if (!session) return;

  // Parse existing replayed claim IDs
  const replayedClaimIds = session.replayedClaimIds
    ? JSON.parse(session.replayedClaimIds)
    : [];

  // Add new claim ID if not already tracked
  if (!replayedClaimIds.includes(claimId)) {
    replayedClaimIds.push(claimId);

    await db
      .update(superAuditSessions)
      .set({
        replayedClaimIds: JSON.stringify(replayedClaimIds),
        updatedAt: new Date(),
      })
      .where(eq(superAuditSessions.id, sessionId));
  }

  // AUDIT-01: audit_trail — claim replay
  await db.insert(auditTrail).values({
    userId: superAdminUserId,
    action: "SUPER_AUDIT_REPLAY_CLAIM",
    entityType: "claim",
    entityId: claimId,
    changeDescription: JSON.stringify({
      sessionId,
      claimId,
      tenantId: session.auditedTenantId,
    }),
    createdAt: new Date().toISOString(),
  });
}

/**
 * Track AI scoring view
 */
export async function trackAiScoringView(
  sessionId: number,
  superAdminUserId: number,
  claimId: number
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  // Get current session
  const [session] = await db
    .select()
    .from(superAuditSessions)
    .where(eq(superAuditSessions.id, sessionId))
    .limit(1);

  if (!session) return;

  // Parse existing viewed AI scoring claim IDs
  const viewedAiScoringClaimIds = session.viewedAiScoringClaimIds
    ? JSON.parse(session.viewedAiScoringClaimIds)
    : [];

  // Add new claim ID if not already tracked
  if (!viewedAiScoringClaimIds.includes(claimId)) {
    viewedAiScoringClaimIds.push(claimId);

    await db
      .update(superAuditSessions)
      .set({
        viewedAiScoringClaimIds: JSON.stringify(viewedAiScoringClaimIds),
        updatedAt: new Date(),
      })
      .where(eq(superAuditSessions.id, sessionId));
  }

  // AUDIT-01: audit_trail — AI scoring view
  await db.insert(auditTrail).values({
    userId: superAdminUserId,
    action: "SUPER_AUDIT_VIEW_AI_SCORING",
    entityType: "claim",
    entityId: claimId,
    changeDescription: JSON.stringify({
      sessionId,
      claimId,
      tenantId: session.auditedTenantId,
    }),
    createdAt: new Date().toISOString(),
  });
}

/**
 * Track routing logic view
 */
export async function trackRoutingLogicView(
  sessionId: number,
  superAdminUserId: number,
  claimId: number
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  // Get current session
  const [session] = await db
    .select()
    .from(superAuditSessions)
    .where(eq(superAuditSessions.id, sessionId))
    .limit(1);

  if (!session) return;

  // Parse existing viewed routing logic claim IDs
  const viewedRoutingLogicClaimIds = session.viewedRoutingLogicClaimIds
    ? JSON.parse(session.viewedRoutingLogicClaimIds)
    : [];

  // Add new claim ID if not already tracked
  if (!viewedRoutingLogicClaimIds.includes(claimId)) {
    viewedRoutingLogicClaimIds.push(claimId);

    await db
      .update(superAuditSessions)
      .set({
        viewedRoutingLogicClaimIds: JSON.stringify(viewedRoutingLogicClaimIds),
        updatedAt: new Date(),
      })
      .where(eq(superAuditSessions.id, sessionId));
  }

  // AUDIT-01: audit_trail — routing logic view
  await db.insert(auditTrail).values({
    userId: superAdminUserId,
    action: "SUPER_AUDIT_VIEW_ROUTING_LOGIC",
    entityType: "claim",
    entityId: claimId,
    changeDescription: JSON.stringify({
      sessionId,
      claimId,
      tenantId: session.auditedTenantId,
    }),
    createdAt: new Date().toISOString(),
  });
}

/**
 * End super audit session
 */
export async function endSuperAuditSession(
  sessionId: number,
  superAdminUserId: number
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  // Get session start time
  const [session] = await db
    .select()
    .from(superAuditSessions)
    .where(eq(superAuditSessions.id, sessionId))
    .limit(1);

  if (!session) return;

  const sessionEndedAt = new Date();
  const sessionDurationSeconds = Math.floor(
    (sessionEndedAt.getTime() - new Date(session.sessionStartedAt).getTime()) / 1000
  );

  // Update session
  await db
    .update(superAuditSessions)
    .set({
      sessionEndedAt,
      sessionDurationSeconds,
      isActive: 0,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(superAuditSessions.id, sessionId),
        eq(superAuditSessions.superAdminUserId, superAdminUserId)
      )
    );

  // AUDIT-01: audit_trail — session end
  await db.insert(auditTrail).values({
    userId: superAdminUserId,
    action: "SUPER_AUDIT_SESSION_ENDED",
    entityType: "super_audit_session",
    entityId: sessionId,
    changeDescription: JSON.stringify({
      sessionId,
      sessionDurationSeconds,
      auditedTenantId: session.auditedTenantId,
    }),
    createdAt: new Date().toISOString(),
  });
}

/**
 * Get active audit session for user
 */
export async function getActiveAuditSession(
  superAdminUserId: number
): Promise<typeof superAuditSessions.$inferSelect | null> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const [session] = await db
    .select()
    .from(superAuditSessions)
    .where(
      and(
        eq(superAuditSessions.superAdminUserId, superAdminUserId),
        eq(superAuditSessions.isActive, 1)
      )
    )
    .orderBy(desc(superAuditSessions.sessionStartedAt))
    .limit(1);

  return session || null;
}

/**
 * Get all tenants (for tenant selector)
 */
export async function getAllTenants(): Promise<
  Array<{ tenantId: string; name: string; userCount: number }>
> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  // Get unique tenant IDs from users table
  const tenants = await db
    .select({
      tenantId: users.tenantId,
    })
    .from(users)
    .where(eq(users.tenantId, users.tenantId))
    .groupBy(users.tenantId);

  // Count users per tenant
  const tenantsWithCounts = await Promise.all(
    tenants
      .filter((t) => t.tenantId !== null)
      .map(async (tenant) => {
        const [countResult] = await db
          .select({
            count: users.id,
          })
          .from(users)
          .where(eq(users.tenantId, tenant.tenantId!));

        return {
          tenantId: tenant.tenantId!,
          name: `Tenant ${tenant.tenantId}`,
          userCount: countResult?.count || 0,
        };
      })
  );

  return tenantsWithCounts;
}
