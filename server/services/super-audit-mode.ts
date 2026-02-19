// @ts-nocheck
import { getDb } from "../db";
/**
 * Super Audit Mode Service
 * 
 * Provides super-admin audit capabilities:
 * - Tenant selection and role impersonation
 * - Read-only dashboard access
 * - Claim replay and AI scoring inspection
 * - Full audit logging
 */


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
  const [result] = await db.insert(superAuditSessions).values({
    superAdminUserId,
    superAdminName,
    isActive: 1,
  });
  
  // Log audit session creation
  await db.insert(auditTrail).values({
    userId: superAdminUserId,
    action: "SUPER_AUDIT_SESSION_CREATED",
    targetType: "super_audit_session",
    targetId: result.insertId.toString(),
    metadata: JSON.stringify({
      superAdminName,
      sessionId: result.insertId,
    }),
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
  // Update session with audit context
  await db
    .update(superAuditSessions)
    .set({
      auditedTenantId,
      impersonatedRole,
      updatedAt: new Date(),
    })
    .where(and(
      eq(superAuditSessions.id, sessionId),
      eq(superAuditSessions.superAdminUserId, superAdminUserId)
    ));
  
  // Log tenant selection
  await db.insert(auditTrail).values({
    userId: superAdminUserId,
    action: "SUPER_AUDIT_VIEW_TENANT",
    targetType: "tenant",
    targetId: auditedTenantId,
    metadata: JSON.stringify({
      sessionId,
      auditedTenantId,
      impersonatedRole,
    }),
  });
  
  // Log role impersonation
  await db.insert(auditTrail).values({
    userId: superAdminUserId,
    action: "SUPER_AUDIT_IMPERSONATE_ROLE",
    targetType: "role",
    targetId: impersonatedRole,
    metadata: JSON.stringify({
      sessionId,
      auditedTenantId,
      impersonatedRole,
    }),
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
  
  // Log claim access
  await db.insert(auditTrail).values({
    userId: superAdminUserId,
    action: "SUPER_AUDIT_VIEW_CLAIM",
    targetType: "claim",
    targetId: claimId.toString(),
    metadata: JSON.stringify({
      sessionId,
      claimId,
      tenantId: session.auditedTenantId,
    }),
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
  
  // Log claim replay
  await db.insert(auditTrail).values({
    userId: superAdminUserId,
    action: "SUPER_AUDIT_REPLAY_CLAIM",
    targetType: "claim",
    targetId: claimId.toString(),
    metadata: JSON.stringify({
      sessionId,
      claimId,
      tenantId: session.auditedTenantId,
    }),
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
  
  // Log AI scoring view
  await db.insert(auditTrail).values({
    userId: superAdminUserId,
    action: "SUPER_AUDIT_VIEW_AI_SCORING",
    targetType: "claim",
    targetId: claimId.toString(),
    metadata: JSON.stringify({
      sessionId,
      claimId,
      tenantId: session.auditedTenantId,
    }),
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
  
  // Log routing logic view
  await db.insert(auditTrail).values({
    userId: superAdminUserId,
    action: "SUPER_AUDIT_VIEW_ROUTING_LOGIC",
    targetType: "claim",
    targetId: claimId.toString(),
    metadata: JSON.stringify({
      sessionId,
      claimId,
      tenantId: session.auditedTenantId,
    }),
  });
}

/**
 * End super audit session
 */
export async function endSuperAuditSession(
  sessionId: number,
  superAdminUserId: number
): Promise<void> {
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
    .where(and(
      eq(superAuditSessions.id, sessionId),
      eq(superAuditSessions.superAdminUserId, superAdminUserId)
    ));
  
  // Log session end
  await db.insert(auditTrail).values({
    userId: superAdminUserId,
    action: "SUPER_AUDIT_SESSION_ENDED",
    targetType: "super_audit_session",
    targetId: sessionId.toString(),
    metadata: JSON.stringify({
      sessionId,
      sessionDurationSeconds,
      auditedTenantId: session.auditedTenantId,
    }),
  });
}

/**
 * Get active audit session for user
 */
export async function getActiveAuditSession(
  superAdminUserId: number
): Promise<typeof superAuditSessions.$inferSelect | null> {
  const [session] = await db
    .select()
    .from(superAuditSessions)
    .where(and(
      eq(superAuditSessions.superAdminUserId, superAdminUserId),
      eq(superAuditSessions.isActive, 1)
    ))
    .orderBy(desc(superAuditSessions.sessionStartedAt))
    .limit(1);
  
  return session || null;
}

/**
 * Get all tenants (for tenant selector)
 */
export async function getAllTenants(): Promise<Array<{ tenantId: string; name: string; userCount: number }>> {
  // Get unique tenant IDs from users table
  const tenants = await db
    .select({
      tenantId: users.tenantId,
    })
    .from(users)
    .where(eq(users.tenantId, users.tenantId)) // Filter out null tenant IDs
    .groupBy(users.tenantId);
  
  // Count users per tenant
  const tenantsWithCounts = await Promise.all(
    tenants
      .filter(t => t.tenantId !== null)
      .map(async (tenant) => {
        const [countResult] = await db
          .select({
            count: users.id,
          })
          .from(users)
          .where(eq(users.tenantId, tenant.tenantId!));
        
        return {
          tenantId: tenant.tenantId!,
          name: `Tenant ${tenant.tenantId}`, // TODO: Get actual tenant name from tenants table
          userCount: countResult?.count || 0,
        };
      })
  );
  
  return tenantsWithCounts;
}
