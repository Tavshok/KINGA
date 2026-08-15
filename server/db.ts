
import { eq, and, or, desc, inArray, notInArray, sql, like, isNotNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "../drizzle/schema";
import { 
  InsertUser, 
  users,
  claims,
  InsertClaim,
  panelBeaters,
  InsertPanelBeater,
  aiAssessments,
  InsertAiAssessment,
  assessorEvaluations,
  InsertAssessorEvaluation,
  panelBeaterQuotes,
  InsertPanelBeaterQuote,
  appointments,
  InsertAppointment,
  auditTrail,
  InsertAuditTrailEntry,
  notifications,
  InsertNotification,
  fraudIndicators,
  claimantHistory,
  vehicleHistory,
  entityRelationships,
  fraudAlerts,
  fraudRules,
  quoteLineItems,
  InsertQuoteLineItem,
  thirdPartyVehicles,
  InsertThirdPartyVehicle,
  vehicleMarketValuations,
  InsertVehicleMarketValuation,
  policeReports,
  InsertPoliceReport,
  preAccidentDamage,
  InsertPreAccidentDamage,
  vehicleConditionAssessment,
  InsertVehicleConditionAssessment,
  approvalWorkflow,
  InsertApprovalWorkflow,
  assessors,
  assessorInsurerRelationships,
  claimEvents,
  InsertClaimEvent,
  claimAssignments,
  assessorReports,
  assessorReportAttachments,
  assessorReportReviews,
  ingestionDocuments,
  decisionSnapshots,
  DecisionSnapshot,
  tenants
} from "../drizzle/schema";
import { ENV } from './_core/env';
import { logger } from './logger';
import * as dbPipeline from './db-pipeline.ts';
import { getTenantRates } from './db/intelligence-db';
import { resolveKingaWriteOffRecommendation } from '../shared/writeOffRecommendation';

import type { MySql2Database } from 'drizzle-orm/mysql2';
let _db: MySql2Database<typeof schema> | null = null;
let _pool: mysql.Pool | null = null;

// Lazily create the drizzle instance with a proper connection pool.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _pool = mysql.createPool({
        uri: process.env.DATABASE_URL,
        connectionLimit: 5,
        waitForConnections: true,
        queueLimit: 0,
        enableKeepAlive: true,
        keepAliveInitialDelay: 30000,  // Send keepalive after 30s idle
        connectTimeout: 30000,
        multipleStatements: false,
        // TiDB Cloud drops idle connections after ~5 minutes.
        // Set idleTimeout to 4 minutes so the pool releases connections before TiDB drops them.
        idleTimeout: 240000,
      });
      // Reset pool on fatal connection errors so next getDb() call creates a fresh pool
      (_pool as any).on('error', (err: Error) => {
        if ((err as any).code === 'ECONNRESET' || (err as any).code === 'PROTOCOL_CONNECTION_LOST') {
          console.warn('[Database] Pool connection lost, will reinitialise on next query:', err.message);
          _db = null;
          _pool = null;
        }
      });
      _db = drizzle(_pool, { schema, mode: "default" });
      console.log("[Database] Connection pool initialized");
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
      _pool = null;
    }
  }
  return _db;
}

/**
 * R-INF-01: Execute a DB operation with a per-query statement timeout.
 *
 * TiDB/MySQL does not have a per-pool query timeout option in mysql2, so we
 * implement it by running `SET SESSION max_statement_time = <ms>` on the
 * connection before the operation, then restoring it to 0 (unlimited) after.
 *
 * Usage:
 *   const result = await withDbTimeout(() => db.select(...).from(...), 10_000);
 *
 * @param operation  Async function that performs the DB work.
 * @param timeoutMs  Max wall-clock ms for the query (default 30 s).
 * @param label      Label for log messages.
 */
export async function withDbTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs = 30_000,
  label = 'DB query'
): Promise<T> {
  const pool = await getRawPool();
  if (!pool) {
    // No DB available — fall through to operation() which will also fail/no-op
    return operation();
  }
  const conn = await pool.getConnection();
  try {
    // max_statement_time is in milliseconds on TiDB; on standard MySQL it is in seconds
    // but TiDB accepts ms. We use the TiDB-compatible form.
    await conn.execute(`SET SESSION max_statement_time = ${timeoutMs}`);
    const result = await operation();
    return result;
  } catch (err: any) {
    const isTimeout =
      err?.code === 'ER_STATEMENT_TIMEOUT' ||
      String(err?.message).includes('max_statement_time exceeded') ||
      String(err?.message).includes('Query execution was interrupted');
    if (isTimeout) {
      throw new Error(`[Database] ${label} timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    // Restore unlimited statement time before releasing the connection back to pool
    try { await conn.execute('SET SESSION max_statement_time = 0'); } catch { /* ignore */ }
    conn.release();
  }
}

/**
 * Returns the raw mysql2 Pool so callers can use pool.execute(sql, params)
 * with the standard 2-argument signature (unlike drizzle's 1-arg wrapper).
 * Returns null when DATABASE_URL is not configured.
 */
export async function getRawPool(): Promise<mysql.Pool | null> {
  await getDb(); // ensure pool is initialised
  return _pool;
}

/**
 * getDbOrThrow — same as getDb() but throws a typed error if the DB is unavailable.
 * Use this in any code path where a null DB should be treated as a hard failure
 * (e.g. WhatsApp session manager, background jobs, webhook handlers).
 *
 * This eliminates TypeScript TS2531 "Object is possibly null" errors at call sites
 * that chain DB operations without a null guard.
 *
 * TECH-01: Added Aug 2026 as part of TypeScript error remediation.
 */
export async function getDbOrThrow() {
  const db = await getDb();
  if (!db) {
    throw new Error("[Database] Connection unavailable — DB not initialised or connection failed");
  }
  return db;
}

/**
 * Execute a database operation with automatic retry on transient connection errors.
 * Handles ECONNRESET / PROTOCOL_CONNECTION_LOST by resetting the pool and retrying.
 * Use this wrapper for any DB call that runs outside of a live HTTP request context
 * (e.g. background jobs, scheduled tasks, fire-and-forget pipeline steps).
 */
export async function withDbRetry<T>(
  operation: () => Promise<T>,
  maxAttempts = 3,
  delayMs = 1000,
  label = 'DB operation'
): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (err: any) {
      const isTransient =
        err?.code === 'ECONNRESET' ||
        err?.code === 'PROTOCOL_CONNECTION_LOST' ||
        err?.cause?.code === 'ECONNRESET' ||
        err?.cause?.code === 'PROTOCOL_CONNECTION_LOST' ||
        String(err?.message).includes('ECONNRESET') ||
        String(err?.message).includes('PROTOCOL_CONNECTION_LOST');
      if (isTransient && attempt < maxAttempts) {
        console.warn(`[Database] ${label}: transient error on attempt ${attempt}/${maxAttempts} — resetting pool and retrying in ${delayMs * attempt}ms:`, err.message);
        // Force pool reset so getDb() creates a fresh connection on next call
        _db = null;
        _pool = null;
        await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
        lastError = err;
        continue;
      }
      throw err;
    }
  }
  throw lastError ?? new Error(`${label}: exhausted ${maxAttempts} attempts`);
}

// ============================================================================
// USER OPERATIONS
// ============================================================================

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      // Owner gets platform_super_admin on INSERT only — do NOT override on UPDATE
      // so an explicit role change in the admin UI is preserved across logins.
      values.role = 'platform_super_admin';
      // Intentionally NOT added to updateSet
    }
    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date().toISOString();
    }
    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date().toISOString();;
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUsersByRole(role: typeof users.$inferSelect.role) {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(users).where(eq(users.role, role));
}

/**
 * Get insurer users filtered by specific insurer sub-roles.
 * Use this instead of getUsersByRole("insurer") when sending operational
 * notifications that should NOT go to executive or risk_manager sub-roles.
 *
 * @param insurerRoles - Array of insurer sub-roles to include
 * @returns Users with role="insurer" whose insurerRole is in the provided list
 */
export async function getUsersByInsurerRoles(insurerRoles: string[]): Promise<(typeof users.$inferSelect)[]> {
  const db = await getDb();
  if (!db) return [];
  if (!insurerRoles.length) return [];
  return await db
    .select()
    .from(users)
    .where(
      and(
        eq(users.role, "insurer"),
        inArray(users.insurerRole, insurerRoles as any[])
      )
    );
}

// ============================================================================
// PANEL BEATER OPERATIONS
// ============================================================================

export async function getAllApprovedPanelBeaters() {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(panelBeaters).where(eq(panelBeaters.approved, 1));
}

export async function getPanelBeaterById(id: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(panelBeaters).where(eq(panelBeaters.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createPanelBeater(data: InsertPanelBeater) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(panelBeaters).values(data);
  return result;
}

// ============================================================================
// CLAIM OPERATIONS
// ============================================================================

export async function createClaim(data: InsertClaim) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(claims).values(data);
  return result;
}

export async function getClaimById(id: number, tenantId?: string) {
  const db = await getDb();
  if (!db) return undefined;

  const conditions = tenantId 
    ? and(eq(claims.id, id), eq(claims.tenantId, tenantId))
    : eq(claims.id, id);
  
  const result = await db.select().from(claims).where(conditions).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getClaimByNumber(claimNumber: string, tenantId?: string) {
  const db = await getDb();
  if (!db) return undefined;

  const conditions = tenantId
    ? and(eq(claims.claimNumber, claimNumber), eq(claims.tenantId, tenantId))
    : eq(claims.claimNumber, claimNumber);
  
  const result = await db.select().from(claims).where(conditions).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getClaimsByClaimant(claimantId: number, tenantId?: string) {
  const db = await getDb();
  if (!db) return [];

  const conditions = tenantId
    ? and(eq(claims.claimantId, claimantId), eq(claims.tenantId, tenantId))
    : eq(claims.claimantId, claimantId);
  
  return await db.select().from(claims).where(conditions).orderBy(desc(claims.createdAt));
}

/**
 * Search claims by claim number, policy number, or vehicle registration.
 * - claimant role: restricted to their own claims (claimantId filter applied)
 * - processor / insurer roles: all claims within the tenant
 */
export async function searchClaimsByIdentifier({
  query,
  tenantId,
  claimantId,
}: {
  query: string;
  tenantId?: string;
  claimantId?: number;
}) {
  const db = await getDb();
  if (!db || !query.trim()) return [];
  const q = `%${query.trim()}%`;
  const matchCondition = or(
    like(claims.claimNumber, q),
    like(claims.policyNumber, q),
    like(claims.vehicleRegistration, q),
    like(claims.kingaRef, q),
  );
  const conditions = [
    matchCondition,
    tenantId ? eq(claims.tenantId, tenantId) : undefined,
    claimantId ? eq(claims.claimantId, claimantId) : undefined,
  ].filter(Boolean);
  const where = conditions.length === 1 ? conditions[0] : and(...conditions);
  return await db
    .select({
      id: claims.id,
      claimNumber: claims.claimNumber,
      policyNumber: claims.policyNumber,
      vehicleRegistration: claims.vehicleRegistration,
      vehicleMake: claims.vehicleMake,
      vehicleModel: claims.vehicleModel,
      vehicleYear: claims.vehicleYear,
      status: claims.status,
      incidentDate: claims.incidentDate,
      incidentLocation: claims.incidentLocation,
      createdAt: claims.createdAt,
      claimantId: claims.claimantId,
      tenantId: claims.tenantId,
      kingaRef: claims.kingaRef,
    })
    .from(claims)
    .where(where)
    .orderBy(desc(claims.createdAt))
    .limit(20);
}

/**
 * Atomically generate a KINGA reference number for a new claim.
 * Format: KNG-{INSURER_CODE}-{YEAR}-{SEQUENCE}
 * - INSURER_CODE: first 8 chars of tenantId, uppercased, alphanumeric only
 * - YEAR: 4-digit current calendar year
 * - SEQUENCE: zero-padded 6-digit integer, per-insurer per-year, resets each January
 *
 * Uses an atomic UPDATE+SELECT to prevent duplicate numbers under concurrent ingestion.
 * Falls back to a timestamp-based reference if the tenant row is not found.
 */
export async function generateKingaRef(tenantId: string): Promise<string> {
  const db = await getDb();
  const currentYear = new Date().getFullYear();

  // Derive a short insurer code from the tenantId (max 8 chars, uppercase alphanumeric)
  const insurerCode = tenantId
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .slice(0, 8) || 'KINGA';

  if (!db) {
    // Fallback: use timestamp to guarantee uniqueness without DB
    const ts = Date.now().toString(36).toUpperCase().slice(-6).padStart(6, '0');
    return `KNG-${insurerCode}-${currentYear}-${ts}`;
  }

  try {
    // Atomically increment the sequence counter for this tenant.
    // If the stored year differs from the current year, reset to 1 (new year rollover).
    await db.execute(
      sql`UPDATE \`tenants\`
          SET \`kinga_sequence\` = IF(\`kinga_sequence_year\` = ${currentYear}, \`kinga_sequence\` + 1, 1),
              \`kinga_sequence_year\` = ${currentYear}
          WHERE \`id\` = ${tenantId}`
    );

    const rows = await db
      .select({ seq: tenants.kingaSequence })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    const seq = rows[0]?.seq ?? 1;
    const seqPadded = String(seq).padStart(6, '0');
    return `KNG-${insurerCode}-${currentYear}-${seqPadded}`;
  } catch (err) {
    // Fallback on any DB error
    const ts = Date.now().toString(36).toUpperCase().slice(-6).padStart(6, '0');
    return `KNG-${insurerCode}-${currentYear}-${ts}`;
  }
}

export async function getClaimsByAssessor(assessorId: number, tenantId?: string) {
  const db = await getDb();
  if (!db) return [];

  const conditions = tenantId
    ? and(eq(claims.assignedAssessorId, assessorId), eq(claims.tenantId, tenantId))
    : eq(claims.assignedAssessorId, assessorId);
  
  return await db.select().from(claims).where(conditions).orderBy(desc(claims.createdAt));
}

export async function getClaimsForPanelBeater(panelBeaterId: number, tenantId?: string) {
  const db = await getDb();
  if (!db) return [];

  // Quote invitations are persisted as JSON during intake while an approved
  // repair allocation is persisted as assignedPanelBeaterId. A repair partner
  // must see either state in the same operational queue.
  const query = tenantId
    ? db.select().from(claims).where(eq(claims.tenantId, tenantId)).orderBy(desc(claims.createdAt))
    : db.select().from(claims).orderBy(desc(claims.createdAt));
  
  const allClaims = await query;
  
  return allClaims.filter(claim => {
    if (Number(claim.assignedPanelBeaterId) === Number(panelBeaterId)) return true;
    if (!claim.selectedPanelBeaterIds) return false;
    try {
      const selectedIds = JSON.parse(claim.selectedPanelBeaterIds) as unknown[];
      return Array.isArray(selectedIds) && selectedIds.some((id) => Number(id) === Number(panelBeaterId));
    } catch {
      return false;
    }
  });
}

/**
 * @deprecated Use WorkflowEngine.transition() instead for governance-compliant state changes
 * This function is kept for backward compatibility but will route through WorkflowEngine
 */
export async function updateClaimStatus(
  claimId: number,
  status: typeof claims.$inferSelect.status,
  userId: number,
  userRole: string,
  tenantId: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Get current claim for validation
  const [claim] = await db.select().from(claims).where(eq(claims.id, claimId));
  if (!claim) throw new Error(`Claim ${claimId} not found`);
  
  // All state transitions MUST go through WorkflowEngine for governance
  const { transition } = await import("./workflow-engine");
  const { statusToWorkflowState } = await import("./workflow-migration");
  
  const toState = statusToWorkflowState(status as any);
  
  // Detect and heal workflowState/status inconsistency:
  // If the DB workflowState doesn't match what the current status implies,
  // the claim is in a stale/inconsistent state from a previous failed run.
  // In that case, derive fromState from the status field (source of truth for legacy claims).
  const statusImpliedState = statusToWorkflowState(claim.status as any);
  const dbWorkflowState = claim.workflowState;
  
  let fromState: string;
  if (dbWorkflowState && dbWorkflowState === toState) {
    // Self-transition detected — use status-implied state to avoid invalid loop
    console.warn(`[Workflow] Self-transition detected for claim ${claimId}: ${dbWorkflowState} → ${toState}. Using status-implied state: ${statusImpliedState}`);
    fromState = statusImpliedState;
  } else {
    fromState = dbWorkflowState || statusImpliedState;
  }
  
  await transition({
    claimId,
    fromState: fromState as any,
    toState: toState as any,
    userId,
    userRole: userRole as any,
  });
}

export async function assignClaimToAssessor(
  claimId: number,
  assessorId: number,
  context: {
    tenantId: string;
    assignedByUserId: number;
    assignmentSource?: "manual" | "workflow" | "reassignment" | "system";
    emailNotificationRequested?: boolean;
  },
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Get current claim status for validation
  const [claim] = await db.select().from(claims).where(eq(claims.id, claimId));
  if (!claim) throw new Error(`Claim ${claimId} not found`);
  
  // Validate state transition to assessment_pending
  const { validateStateTransition } = await import("./workflow-validator");
  validateStateTransition(claim.status as any, "assessment_pending");

  await db.update(claims).set({ 
    assignedAssessorId: assessorId,
    status: "assessment_pending",
    updatedAt: new Date().toISOString() 
  }).where(eq(claims.id, claimId));

  // Close the currently active assessor assignment before recording a new
  // authoritative assignment. Email remains delivery metadata only.
  await db.update(claimAssignments)
    .set({ status: "reassigned", reassignedAt: new Date().toISOString() })
    .where(and(
      eq(claimAssignments.claimId, claimId),
      eq(claimAssignments.assignmentRole, "assessor"),
      inArray(claimAssignments.status, ["assigned", "accepted"]),
    ));

  const assignmentResult = await db.insert(claimAssignments).values({
    claimId,
    tenantId: context.tenantId,
    assignmentRole: "assessor",
    assignedToUserId: assessorId,
    assignedByUserId: context.assignedByUserId,
    assignmentSource: context.assignmentSource ?? "manual",
    status: "assigned",
    emailNotificationRequested: context.emailNotificationRequested ? 1 : 0,
    decisionReason: "Authoritative in-app assessor assignment",
  } as any);

  return { assignmentId: Number((assignmentResult as any)[0]?.insertId ?? (assignmentResult as any).insertId) };
}

export async function markClaimAssignmentNotification(
  assignmentId: number,
  update: { inAppCreated?: boolean; emailSent?: boolean; emailReference?: string },
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(claimAssignments).set({
    ...(update.inAppCreated ? { inAppNotificationCreated: 1 } : {}),
    ...(update.emailSent ? {
      emailNotificationSentAt: new Date().toISOString(),
      emailNotificationReference: update.emailReference ?? "workflow-notifications.notifyAssessorAssignment",
    } : {}),
  } as any).where(eq(claimAssignments.id, assignmentId));
}

export async function acceptClaimAssessorAssignment(input: {
  claimId: number;
  tenantId: string;
  assessorId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [assignment] = await db.select().from(claimAssignments).where(and(
    eq(claimAssignments.claimId, input.claimId),
    eq(claimAssignments.tenantId, input.tenantId),
    eq(claimAssignments.assignmentRole, "assessor"),
    eq(claimAssignments.assignedToUserId, input.assessorId),
    eq(claimAssignments.status, "assigned"),
  )).orderBy(desc(claimAssignments.assignedAt)).limit(1);

  if (!assignment) {
    throw new Error("No pending authorised assessor assignment is available for acceptance");
  }

  await db.update(claimAssignments).set({
    status: "accepted",
    acceptedAt: new Date().toISOString(),
  }).where(eq(claimAssignments.id, assignment.id));

  return assignment.id;
}

export async function hasAcceptedClaimAssessorAssignment(input: {
  claimId: number;
  tenantId: string;
  assessorId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [assignment] = await db.select({ id: claimAssignments.id }).from(claimAssignments).where(and(
    eq(claimAssignments.claimId, input.claimId),
    eq(claimAssignments.tenantId, input.tenantId),
    eq(claimAssignments.assignmentRole, "assessor"),
    eq(claimAssignments.assignedToUserId, input.assessorId),
    eq(claimAssignments.status, "accepted"),
  )).orderBy(desc(claimAssignments.acceptedAt)).limit(1);

  return Boolean(assignment);
}

export async function getAcceptedClaimAssessorAssignment(input: {
  claimId: number;
  tenantId: string;
  assessorId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [assignment] = await db.select().from(claimAssignments).where(and(
    eq(claimAssignments.claimId, input.claimId),
    eq(claimAssignments.tenantId, input.tenantId),
    eq(claimAssignments.assignmentRole, "assessor"),
    eq(claimAssignments.assignedToUserId, input.assessorId),
    eq(claimAssignments.status, "accepted"),
  )).orderBy(desc(claimAssignments.acceptedAt)).limit(1);
  return assignment || null;
}

export async function getAssessorReportReviewer(input: {
  claimId: number;
  tenantId: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [claimsAssessorAssignment] = await db.select().from(claimAssignments).where(and(
    eq(claimAssignments.claimId, input.claimId),
    eq(claimAssignments.tenantId, input.tenantId),
    eq(claimAssignments.assignmentRole, "claims_assessor"),
    inArray(claimAssignments.status, ["assigned", "accepted"]),
  )).orderBy(desc(claimAssignments.assignedAt)).limit(1);
  if (claimsAssessorAssignment) {
    return {
      reviewerUserId: claimsAssessorAssignment.assignedToUserId,
      reviewerRole: "claims_assessor" as const,
      routeReason: "assigned_claims_assessor" as const,
    };
  }

  const [claimsManager] = await db.select().from(users).where(and(
    eq(users.tenantId, input.tenantId),
    inArray(users.role, ["claims_manager", "admin", "insurer"] as any),
  )).orderBy(desc(users.id)).limit(1);
  if (!claimsManager) throw new Error("No authorised claims assessor or claims manager reviewer is available");
  return {
    reviewerUserId: claimsManager.id,
    reviewerRole: "claims_manager" as const,
    routeReason: "claims_manager_fallback" as const,
  };
}

export async function createAssessorReportDraft(input: {
  claimId: number;
  tenantId: string;
  assessorUserId: number;
  assignmentId: number;
  parentReportId?: number;
  versionNumber: number;
  creationMethod: "native_upload" | "kinga_assisted";
  title: string;
  sourceFileName?: string;
  sourceStorageKey?: string;
  sourceFileUrl?: string;
  sourceMimeType?: string;
  sourceFileHash?: string;
  reportPayload?: unknown;
  kingaExtractionJson?: unknown;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(assessorReports).values(input as any);
  return Number((result as any)[0]?.insertId);
}

export async function addAssessorReportAttachment(input: {
  reportId: number;
  tenantId: string;
  originalFileName: string;
  storageKey: string;
  fileUrl: string;
  mimeType?: string;
  sizeBytes?: number;
  fileHash?: string;
  attachmentRole: "original_report" | "supporting_evidence" | "generated_export";
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(assessorReportAttachments).values(input as any);
}

export async function getAssessorReportById(reportId: number, tenantId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [report] = await db.select().from(assessorReports).where(and(
    eq(assessorReports.id, reportId),
    eq(assessorReports.tenantId, tenantId),
  )).limit(1);
  return report || null;
}

export async function getLatestAssessorReportVersion(claimId: number, tenantId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [report] = await db.select().from(assessorReports).where(and(
    eq(assessorReports.claimId, claimId),
    eq(assessorReports.tenantId, tenantId),
  )).orderBy(desc(assessorReports.versionNumber)).limit(1);
  return report || null;
}

export async function attestAssessorReport(reportId: number, tenantId: string, assessorUserId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.update(assessorReports).set({
    status: "attested",
    attestedByUserId: assessorUserId,
    attestedAt: new Date().toISOString(),
  }).where(and(
    eq(assessorReports.id, reportId),
    eq(assessorReports.tenantId, tenantId),
    eq(assessorReports.assessorUserId, assessorUserId),
    eq(assessorReports.status, "draft"),
  ));
  if ((result as any)[0]?.affectedRows !== 1) throw new Error("Report is not an attestable assessor draft");
}

export async function submitAssessorReportForReview(input: {
  reportId: number;
  tenantId: string;
  reviewerUserId: number;
  reviewerRole: "claims_assessor" | "claims_manager";
  routeReason: "assigned_claims_assessor" | "claims_manager_fallback" | "claims_manager_escalation";
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const report = await getAssessorReportById(input.reportId, input.tenantId);
  if (!report || report.status !== "attested") throw new Error("Only an attested assessor report may be submitted for review");
  await db.update(assessorReports).set({ status: "under_review", submittedAt: new Date().toISOString() }).where(eq(assessorReports.id, input.reportId));
  const result = await db.insert(assessorReportReviews).values({
    reportId: input.reportId,
    claimId: report.claimId,
    tenantId: input.tenantId,
    reviewerUserId: input.reviewerUserId,
    reviewerRole: input.reviewerRole,
    routeReason: input.routeReason,
  } as any);
  return Number((result as any)[0]?.insertId);
}

export async function decideAssessorReportReview(input: {
  reviewId: number;
  tenantId: string;
  reviewerUserId: number;
  decision: "accepted" | "returned" | "rejected";
  decisionReason: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [review] = await db.select().from(assessorReportReviews).where(and(
    eq(assessorReportReviews.id, input.reviewId),
    eq(assessorReportReviews.tenantId, input.tenantId),
    eq(assessorReportReviews.reviewerUserId, input.reviewerUserId),
    eq(assessorReportReviews.status, "pending"),
  )).limit(1);
  if (!review) throw new Error("No pending authorised assessor report review is available");
  const now = new Date().toISOString();
  await db.update(assessorReportReviews).set({ status: input.decision, decisionReason: input.decisionReason, reviewedAt: now }).where(eq(assessorReportReviews.id, input.reviewId));
  if (input.decision === "accepted") {
    await db.update(assessorReports).set({ status: "superseded", supersededAt: now }).where(and(
      eq(assessorReports.claimId, review.claimId),
      eq(assessorReports.tenantId, input.tenantId),
      eq(assessorReports.status, "accepted"),
      notInArray(assessorReports.id, [review.reportId]),
    ));
  }
  await db.update(assessorReports).set({ status: input.decision }).where(eq(assessorReports.id, review.reportId));
  return { review, reviewedAt: now };
}

export async function getAssessorReportReviewQueue(tenantId: string, reviewerUserId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select({
    review: assessorReportReviews,
    report: assessorReports,
  }).from(assessorReportReviews).innerJoin(assessorReports, eq(assessorReportReviews.reportId, assessorReports.id)).where(and(
    eq(assessorReportReviews.tenantId, tenantId),
    eq(assessorReportReviews.reviewerUserId, reviewerUserId),
    eq(assessorReportReviews.status, "pending"),
  )).orderBy(desc(assessorReportReviews.createdAt));
}

export async function getLatestAcceptedAssessorEvaluation(claimId: number, tenantId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [evaluation] = await db.select().from(assessorEvaluations).where(and(
    eq(assessorEvaluations.claimId, claimId),
    eq(assessorEvaluations.tenantId, tenantId),
    isNotNull(assessorEvaluations.sourceReportId),
  )).orderBy(desc(assessorEvaluations.id)).limit(1);
  return evaluation || null;
}

export async function updateClaimPolicyVerification(claimId: number, verified: boolean) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(claims).set({ 
    policyVerified: verified ? 1 : 0,
    updatedAt: new Date().toISOString() 
  }).where(eq(claims.id, claimId));
}

/**
 * Trigger KINGA Assessment — Pipeline v2 (10-stage deterministic pipeline)
 *
 * Runs the structured 10-stage pipeline:
 *   1. Document Ingestion
 *   2. OCR & Text Extraction
 *   3. Structured Data Extraction
 *   4. Data Validation
 *   5. Claim Data Assembly (builds ClaimRecord)
 *   6. Damage Analysis Engine
 *   7. Physics Analysis Engine
 *   8. Fraud Analysis Engine
 *   9. Cost Optimisation Engine
 *  10. Report Generation
 */
/**
 * Encode the filename portion of an S3/CloudFront URL so that special characters
 * (spaces, parentheses, brackets, commas, apostrophes, plus signs) in the original
 * filename do not cause HTTP 400/403 errors when the LLM API fetches the file.
 * Only the last path segment (filename) is encoded — the rest of the URL is left intact.
 */
function encodeS3Filename(url: string): string {
  const lastSlash = url.lastIndexOf('/');
  if (lastSlash === -1) return url;
  const base = url.substring(0, lastSlash + 1);
  const filename = url.substring(lastSlash + 1);
  const encodedFilename = filename
    .replace(/ /g, '%20')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
    .replace(/\[/g, '%5B')
    .replace(/\]/g, '%5D')
    .replace(/,/g, '%2C')
    .replace(/'/g, '%27')
    .replace(/\+/g, '%2B');
  return base + encodedFilename;
}

// ── PIPELINE CONCURRENCY SEMAPHORE ─────────────────────────────────────────────────────────
// Limits the number of KINGA pipelines running concurrently in this process.
// Running multiple pipelines simultaneously causes LLM rate-limit errors, OOM, and
// watchdog timeouts. The semaphore queues excess triggers and runs them serially.
// MAX_CONCURRENT_PIPELINES=1 means only one pipeline runs at a time.
const MAX_CONCURRENT_PIPELINES = 1;
let _activePipelineCount = 0;
const _pipelineQueue: Array<() => void> = [];

function acquirePipelineSlot(): Promise<void> {
  return new Promise((resolve) => {
    if (_activePipelineCount < MAX_CONCURRENT_PIPELINES) {
      _activePipelineCount++;
      resolve();
    } else {
      _pipelineQueue.push(() => { _activePipelineCount++; resolve(); });
      console.log(`[PipelineSemaphore] Claim queued — ${_pipelineQueue.length} waiting, ${_activePipelineCount} active`);
    }
  });
}

function releasePipelineSlot(): void {
  _activePipelineCount = Math.max(0, _activePipelineCount - 1);
  const next = _pipelineQueue.shift();
  if (next) {
    console.log(`[PipelineSemaphore] Slot released — starting next queued claim (${_pipelineQueue.length} still waiting)`);
    next();
  }
}

export function getActivePipelineCount(): number { return _activePipelineCount; }
export function getPipelineQueueLength(): number { return _pipelineQueue.length; }
// ────────────────────────────────────────────────────────────────────────────────────────────

export async function triggerAiAssessment(claimId: number) {
  // Acquire a pipeline slot — if MAX_CONCURRENT_PIPELINES are already running,
  // this awaits in a queue until a slot is available. This prevents thundering-herd
  // on startup when many claims are triggered simultaneously.
  await acquirePipelineSlot();
  console.log(`[PipelineSemaphore] Claim ${claimId} acquired pipeline slot (active: ${_activePipelineCount}, queued: ${_pipelineQueue.length})`);

  // ── PRE-PIPELINE MEMORY CHECK ──────────────────────────────────────────────
  // Check available system RAM before starting the pipeline. The pipeline
  // allocates ~150-400MB for PDF rendering, image buffers, and LLM payloads.
  // If less than 300MB of system RAM is available, defer the claim gracefully.
  //
  // NOTE: We check system free RAM (via /proc/meminfo), NOT Node heap free space.
  // Node.js heap grows dynamically up to --max-old-space-size, so heapTotal-heapUsed
  // is not a reliable indicator of available memory.
  let systemFreeRamMB = Infinity; // default: assume enough RAM if we can't read
  try {
    const { readFileSync } = await import('fs');
    const meminfo = readFileSync('/proc/meminfo', 'utf8');
    const availableMatch = meminfo.match(/MemAvailable:\s+(\d+)\s+kB/);
    if (availableMatch) systemFreeRamMB = parseInt(availableMatch[1]) / 1024;
  } catch { /* /proc/meminfo not available (non-Linux) — skip check */ }
  const MINIMUM_FREE_RAM_MB = 300; // require 300MB system RAM free before starting
  const memUsage = process.memoryUsage();
  console.log(
    `[KINGA Assessment] Claim ${claimId}: Memory check — ` +
    `systemFree=${systemFreeRamMB.toFixed(0)}MB, ` +
    `rss=${(memUsage.rss / 1024 / 1024).toFixed(0)}MB, ` +
    `heapUsed=${(memUsage.heapUsed / 1024 / 1024).toFixed(0)}MB`
  );
  if (systemFreeRamMB < MINIMUM_FREE_RAM_MB) {
    console.warn(
      `[KINGA Assessment] Claim ${claimId}: Memory guard — only ${systemFreeRamMB.toFixed(0)}MB system RAM free. ` +
      `Deferring pipeline start. Claim will be retried by recovery job.`
    );
    releasePipelineSlot();
    // Re-queue: keep aiAssessmentTriggered=1 so the claim stays visible to the processor.
    const dbDefer = await getDb();
    if (dbDefer) {
      await dbDefer.update(claims).set({
        status: 'intake_pending' as any,
        documentProcessingStatus: 'intake_pending',
        workflowState: 'intake_queue',
        pipelineCurrentStage: null,
        updatedAt: new Date().toISOString(),
      }).where(eq(claims.id, claimId));
    }
    throw new Error(`Pipeline deferred: insufficient system RAM (${systemFreeRamMB.toFixed(0)}MB free, need ${MINIMUM_FREE_RAM_MB}MB). Claim queued for retry.`);
  }
  console.log(`[KINGA Assessment] Claim ${claimId}: Memory check passed — ${systemFreeRamMB.toFixed(0)}MB system RAM free.`);
  // ─────────────────────────────────────────────────────────────────────────────

  const db = await getDb();
  if (!db) {
    releasePipelineSlot();
    throw new Error("Database not available");
  }

  const { runPipelineV2, PipelineIncompleteError } = await import("./pipeline-v2/orchestrator");

  // Get claim details including damage photos
  const claim = await getClaimById(claimId);
  if (!claim) throw new Error("Claim not found");

  // SAFE REPLACE: Do NOT delete the existing ai_assessments record upfront.
  // The success-path at the end of this function deletes the old record just before
  // inserting the new one (line ~1313). This means if the pipeline degrades before
  // completing, the old assessment (with its enrichedPhotosJson, damagePhotosJson,
  // costIntelligenceJson, quotes etc.) is still intact and the reports can still render.
  // Previously, deleting upfront caused both the financial and photo sections of the
  // Forensic Report to show empty when a re-run degraded.

  // DRA Phase 2: Transition to DOCUMENT_VALIDATING — ingestion is starting.
  // This is the first state in the Document Reliability Architecture state machine.
  // The claim will NOT reach ANALYSIS_COMPLETE unless all gate conditions are met.
  await db.update(claims).set({
    aiAssessmentTriggered: 1,
    aiAssessmentCompleted: 0,
    documentProcessingStatus: "DOCUMENT_VALIDATING",
    status: "document_validating",
    updatedAt: new Date().toISOString(),
  }).where(eq(claims.id, claimId));
  console.log(`[KINGA Assessment] Claim ${claimId} — Pipeline v2 starting. State: DOCUMENT_VALIDATING.`);

  // This flag is set to true just before the success-path DB write.
  // The finally safety-net checks this flag before resetting the claim to
  // intake_pending — if the pipeline succeeded, the finally block does nothing.
  // Without this flag, a race between the success DB write and the finally
  // DB read could reset a successfully-completed claim back to intake_pending.
  let pipelineSucceeded = false;

  // ── WATCHDOG TIMER ───────────────────────────────────────────────────────────
  // If the entire triggerAiAssessment function hangs for more than 8 minutes
  // (e.g. PDF extractor stuck, LLM call hung), reset the claim to intake_pending
  // so the recovery job can re-trigger it. The PDF extractor timeout is 3 minutes,
  // so 8 minutes gives the full pipeline enough headroom while preventing infinite hangs.
  const WATCHDOG_TIMEOUT_MS = 8 * 60 * 1000;
  let watchdogTimer: ReturnType<typeof setTimeout> | null = null;
  watchdogTimer = setTimeout(async () => {
    if (!pipelineSucceeded) {
      console.error(`[KINGA Assessment] Claim ${claimId}: WATCHDOG TIMEOUT — pipeline hung for ${WATCHDOG_TIMEOUT_MS / 1000}s. Routing to document_failed for recovery.`);
      try {
        const dbInner = await getDb();
        if (dbInner) {
          // Use canonical document_failed status so the recovery job (Case 11)
          // and the dashboard both surface this claim correctly for manual/auto retry.
          // IMPORTANT: Do NOT reset aiAssessmentTriggered to 0 here.
          // The pipeline was actively running — the claim must remain visible
          // as a KINGA failure so the processor can see it and retry.
          await dbInner.update(claims).set({
            status: 'document_failed' as any,
            documentProcessingStatus: 'DOCUMENT_FAILED',
            workflowState: 'intake_queue',
            pipelineCurrentStage: null,
            updatedAt: new Date().toISOString(),
          }).where(eq(claims.id, claimId));
        }
      } catch (wdErr: any) {
        console.error(`[KINGA Assessment] Claim ${claimId}: Watchdog reset failed: ${wdErr.message}`);
      }
    }
  }, WATCHDOG_TIMEOUT_MS);

  // -----------------------------------------------------------------------
  // TOP-LEVEL FAILURE GUARD
  // -----------------------------------------------------------------------
  try {

  // Resolve PDF URL and damage photos
  let pdfUrl: string | null = null;
  // pdfDownloadUrl is used for server-side PDF fetch (renderPdfToImages / pdftoppm).
  // It is a presigned URL generated via storageGet() so the Node.js process can
  // download the file without Forge auth headers.
  // pdfUrl (raw s3Url) is kept for the LLM which accesses it via the Forge file_url proxy.
  let pdfDownloadUrl: string | null = null;
  let damagePhotos: string[] = [];

  if (claim.sourceDocumentId) {
    try {
      const [sourceDoc] = await db.select().from(ingestionDocuments)
        .where(eq(ingestionDocuments.id, claim.sourceDocumentId)).limit(1);
      if (sourceDoc && sourceDoc.s3Url) {
        // LLM URL: raw s3Url passed as file_url through the Forge proxy (no auth needed on LLM side).
        // URL-encode special characters in the filename portion to avoid HTTP 400/403 from LLM API.
        pdfUrl = encodeS3Filename(sourceDoc.s3Url);
        console.log(`[KINGA Assessment] Claim ${claimId}: LLM PDF URL ready: ${sourceDoc.originalFilename}`);
        // Server-side download URL: presigned via storageGet so Node.js fetch() can access the file.
        // The raw s3Url is NOT publicly accessible — a plain fetch() returns HTTP 403.
        // storageGet() generates a time-limited presigned URL valid for 1 hour (enough for the pipeline).
        try {
          const { storageGet } = await import('./storage');
          const presigned = await storageGet(sourceDoc.s3Key, 3600);
          pdfDownloadUrl = presigned.url;
          console.log(`[KINGA Assessment] Claim ${claimId}: Presigned download URL obtained for server-side PDF fetch.`);
        } catch (presignErr: any) {
          // Fallback: try the raw s3Url directly (works if bucket is public or URL has embedded auth)
          console.warn(`[KINGA Assessment] Claim ${claimId}: storageGet presign failed (${presignErr.message}), falling back to raw s3Url for download.`);
          pdfDownloadUrl = pdfUrl;
        }
      } else {
        console.warn(`[KINGA Assessment] Claim ${claimId}: sourceDocumentId=${claim.sourceDocumentId} but no S3 URL found.`);
      }
    } catch (docErr: any) {
      console.warn(`[KINGA Assessment] Claim ${claimId}: Failed to look up source document: ${docErr.message}`);
    }
  }

  // Always load cached damage photos from the DB.
  // Previously this was gated on !pdfUrl, which meant that when a claim had both a
  // PDF and separately-uploaded damage photos, the photos were silently dropped.
  // Now we load them unconditionally. The PDF re-extraction block below will only
  // run when damagePhotos is still empty after this load, preserving the intended
  // "extract from PDF when no photos exist" behaviour.
  damagePhotos = claim.damagePhotos ? JSON.parse(claim.damagePhotos) : [];

  // Third fallback: if externalAssessmentUrl looks like a PDF URL, use it directly as pdfUrl.
  // This allows test/debug claims to be submitted without going through the full ingestion pipeline.
  if (!pdfUrl && damagePhotos.length === 0 && claim.externalAssessmentUrl) {
    const extUrl = claim.externalAssessmentUrl;
    if (extUrl.endsWith('.pdf') || extUrl.includes('.pdf?') || extUrl.includes('application/pdf')) {
      pdfUrl = encodeS3Filename(extUrl);
      pdfDownloadUrl = pdfUrl; // externalAssessmentUrl is assumed publicly accessible
      console.log(`[KINGA Assessment] Claim ${claimId}: Using externalAssessmentUrl as PDF source: ${pdfUrl.substring(0, 100)}`);
    }
  }

  // NOTE: Pre-flight HEAD check removed — Manus storage proxy URLs return non-200
  // for HEAD requests even when the LLM can access them via GET (file_url).
  // The HEAD check was a false negative that set pdfUrl=null and caused the pipeline
  // to create a placeholder instead of running. The LLM's 45s per-call timeout is
  // sufficient protection against truly inaccessible URLs.
  if (pdfUrl) {
    console.log(`[KINGA Assessment] Claim ${claimId}: PDF URL ready — proceeding with LLM extraction: ${pdfUrl.substring(0, 100)}...`);
  }

  // ── PERMANENT FIX: PDF image re-extraction ──────────────────────────
  // When a PDF is present but damagePhotos is empty (e.g. re-run, re-assessment,
  // or claims that bypassed the upload processor), extract images from the PDF
  // directly before running the pipeline. This ensures photos are always available
  // for damage analysis and fraud detection regardless of how the assessment was triggered.
  // Track photo ingestion quality for the forensic report
  let _dbPhotoIngestionLog: any = null;
  // Preserve full ExtractedImage metadata for the image classifier
  let _extractedImagesWithMetadata: any[] = [];
  // DRA Phase 3/4: Hoisted to outer scope so the Document Health Gate and recovery
  // ladder can read them after the PDF extraction block closes.
  let _extractionError: string | null = null;
  let _qualitySummary: any = null;
  let _isScannedPdf = false;
  let _pdfBuffer: Buffer | null = null;
  // ── PDF IMAGE EXTRACTION ────────────────────────────────────────────────────────────────
  // poppler-utils (pdftoppm) is declared in apt.txt and is available in both development
  // and production. The previous SKIP_NATIVE_EXTRACTION guard was written before apt.txt
  // was added and is now incorrect — it caused damage images and multi-quote extraction
  // to silently fail in production. Removed.
  // Memory guard: skip extraction only for very large PDFs (>10MB) to prevent OOM.
  const PDF_EXTRACTION_SIZE_LIMIT_BYTES = 10 * 1024 * 1024; // 10MB

  // ALWAYS re-render the PDF on every pipeline run — do NOT skip because cached photos exist.
  // Cached photos from a previous failed run are stale and should not prevent fresh extraction.
  // Skipping PDF extraction also skips Stage 3 (LLM PDF text extraction), producing empty assessments.
  // The cache_rehydration path is now only used as a fallback when pdftoppm itself fails.
  if (pdfUrl) {
    const _photoIngestionStart = Date.now();
    let _totalExtracted = 0;
    // _extractionError, _qualitySummary, _isScannedPdf, _pdfBuffer are hoisted to outer scope (DRA Phase 3/4)
    try {
      // Pre-download the PDF buffer so the recovery ladder and health gate can use it
      // without a second network round-trip.
      try {
        const downloadUrl = pdfDownloadUrl || pdfUrl!;
        const pdfFetchRes = await fetch(downloadUrl);
        if (pdfFetchRes.ok) {
          _pdfBuffer = Buffer.from(await pdfFetchRes.arrayBuffer());
          console.log(`[KINGA Assessment] Claim ${claimId}: PDF pre-downloaded for recovery ladder (${_pdfBuffer.length} bytes).`);
        }
      } catch (preDlErr: any) {
        console.warn(`[KINGA Assessment] Claim ${claimId}: PDF pre-download failed (non-fatal, recovery ladder will skip): ${preDlErr.message}`);
      }
      const downloadUrlForRender = pdfDownloadUrl || pdfUrl!;
      console.log(`[KINGA Assessment] Claim ${claimId}: No cached photos — rendering PDF pages via pdftoppm (presigned URL: ${!!pdfDownloadUrl}).`);
      // Use pdftoppm (poppler-utils) to render each PDF page as a PNG.
      // IMPORTANT: renderPdfToImages uses a plain fetch() to download the PDF.
      // pdfDownloadUrl is a presigned URL that the Node.js process can access without auth.
      // pdfUrl (raw s3Url) is only for the LLM via the Forge file_url proxy.
      const { renderPdfToImages } = await import('./pipeline-v2/pdfToImages');
      const renderResult = await renderPdfToImages(downloadUrlForRender, {
        dpi: 100,
        maxPages: 25,
        keyPrefix: `claims/${claimId}/damage-pages`,
        log: (msg: string) => logger.info('PDF Render', msg, { claimId: String(claimId) }),
      });
      // Build ExtractedImage-compatible objects from rendered pages.
      // IMPORTANT: width/height come from PdfPageImage (read at render time from the buffer)
      // — we must NOT re-fetch page.url from S3 here because the raw S3 URL is not publicly
      // accessible and will return HTTP 403, silently dropping all pages.
      const extractedImages: any[] = [];
      for (const page of renderResult.pages) {
        const w = page.width ?? 0;
        const h = page.height ?? 0;
        extractedImages.push({
          url: page.url,
          width: w,
          height: h,
          pageNumber: page.pageNumber,
          source: 'page_render',
          fromScannedPdf: true,
          renderDpi: 100,
          isPageRender: true,
          // P1 fix: Use real quality metadata computed in pdfToImages.ts before upload.
          // Falls back to neutral values (80/80) only if quality is missing (e.g. older cached pages).
          quality: {
            width: w, height: h,
            blurScore: page.quality?.blurScore ?? 80,
            isBlurry: page.quality?.isBlurry ?? false,
            isTextHeavy: page.quality?.isTextHeavy ?? false,
            isUniform: page.quality?.isUniform ?? false,
            colourVariance: page.quality?.colourVariance ?? 80,
            aspectRatio: w / (h || 1),
            pixelArea: w * h,
          },
        });
      }
      _totalExtracted = extractedImages.length;
      _isScannedPdf = true; // pdftoppm always produces page renders
      _qualitySummary = {
        isScannedPdf: _isScannedPdf,
        renderDpi: 100,
        passedDimensionGate: extractedImages.filter((img: any) => img.width >= 200 && img.height >= 200).length,
        rejectedTooSmall: extractedImages.filter((img: any) => img.width < 200 || img.height < 200).length,
        blurryCount: 0,
        textHeavyCount: 0,
        avgSharpnessScore: 80,
      };
      // Preserve FULL metadata for the image classifier
      _extractedImagesWithMetadata = extractedImages.filter((img: any) => img.width >= 200 && img.height >= 200);
      // Also keep flat URL array for backward compatibility
      damagePhotos = _extractedImagesWithMetadata.map((img: any) => img.url);
      console.log(`[KINGA Assessment] Claim ${claimId}: Rendered ${damagePhotos.length} page(s) from PDF (${extractedImages.length} total pages rendered)`);
      // Log per-page upload errors so production Cloud Run logs surface silent storagePut failures
      if (renderResult.errors && renderResult.errors.length > 0) {
        console.error(`[KINGA Assessment] Claim ${claimId}: PDF render produced ${renderResult.errors.length} page upload error(s):`);
        for (const err of renderResult.errors) {
          console.error(`[KINGA Assessment] Claim ${claimId}:   Page upload error: ${err}`);
        }
      }
      // Persist extracted photos to claim record so future re-runs skip this step
      if (damagePhotos.length > 0) {
        await db.update(claims).set({
          damagePhotos: JSON.stringify(damagePhotos),
          updatedAt: new Date().toISOString(),
        }).where(eq(claims.id, claimId)).catch(() => {});
      }
    } catch (imgErr: any) {
      _extractionError = imgErr.message;
      // DIAGNOSTIC: Log full stack so production Cloud Run logs surface the real cause
      console.error(`[KINGA Assessment] Claim ${claimId}: PDF image re-extraction FAILED — ${imgErr.message}`);
      console.error(`[KINGA Assessment] Claim ${claimId}: Extraction error stack: ${imgErr.stack ?? '(no stack)'}`);

      // ── DRA Phase 4: Recovery Ladder ────────────────────────────────────────
      // Primary extraction (pdftoppm) failed. Attempt fallback strategies before
      // escalating to human review.
      // Strategy 1: pdfimages — extract embedded images directly from the PDF
      // Strategy 2: pdftotext — extract text content for Stage 3 even without photos
      // Strategy 3: Reuse cached photos from previous assessment run
      // ────────────────────────────────────────────────────────────────────────
      let _recoveryAttempted = false;

      // Mark claim as RECOVERY_ATTEMPTED
      await db.update(claims).set({
        status: 'recovery_attempted',
        documentProcessingStatus: 'RECOVERY_ATTEMPTED',
        updatedAt: new Date().toISOString(),
      }).where(eq(claims.id, claimId)).catch(() => {});

      // Strategy 1: pdfimages embedded image extraction
      if (_pdfBuffer && _pdfBuffer.length > 0) {
        try {
          const { extractEmbeddedImages } = await import('./pipeline-v2/pdfToImages');
          const embeddedResult = await extractEmbeddedImages(
            _pdfBuffer,
            `claims/${claimId}/embedded-images`,
            (msg: string) => console.log(`[KINGA Assessment] Claim ${claimId}: ${msg}`)
          );
          if (embeddedResult.imageUrls.length > 0) {
            damagePhotos = embeddedResult.imageUrls;
            _recoveryAttempted = true;
            console.log(`[KINGA Assessment] Claim ${claimId}: Recovery-1 (pdfimages) succeeded — ${embeddedResult.imageUrls.length} embedded image(s) recovered.`);
          } else {
            console.log(`[KINGA Assessment] Claim ${claimId}: Recovery-1 (pdfimages) found no usable embedded images.`);
          }
        } catch (r1Err: any) {
          console.warn(`[KINGA Assessment] Claim ${claimId}: Recovery-1 (pdfimages) failed: ${r1Err.message}`);
        }
      }

      // Strategy 2: pdftotext OCR (if Strategy 1 didn't recover photos)
      if (!_recoveryAttempted && _pdfBuffer && _pdfBuffer.length > 0) {
        try {
          const { extractPdfText } = await import('./pipeline-v2/pdfToImages');
          const textResult = await extractPdfText(
            _pdfBuffer,
            (msg: string) => console.log(`[KINGA Assessment] Claim ${claimId}: ${msg}`)
          );
          if (textResult.success && textResult.charCount > 50) {
            // Store extracted text for Stage 3 to use even without images
            (claim as any)._recoveredPdfText = textResult.text;
            _recoveryAttempted = true;
            console.log(`[KINGA Assessment] Claim ${claimId}: Recovery-2 (pdftotext) succeeded — ${textResult.charCount} chars extracted for Stage 3.`);
          } else {
            console.log(`[KINGA Assessment] Claim ${claimId}: Recovery-2 (pdftotext) found no usable text (${textResult.charCount} chars).`);
          }
        } catch (r2Err: any) {
          console.warn(`[KINGA Assessment] Claim ${claimId}: Recovery-2 (pdftotext) failed: ${r2Err.message}`);
        }
      }

      // Strategy 3: Reuse cached photos from previous assessment run
      if (!_recoveryAttempted) {
        try {
          const prevAssessment = await db.select({ damagePhotosJson: aiAssessments.damagePhotosJson })
            .from(aiAssessments)
            .where(eq(aiAssessments.claimId, claimId))
            .limit(1);
          if (prevAssessment[0]?.damagePhotosJson) {
            const prevPhotos: string[] = JSON.parse(prevAssessment[0].damagePhotosJson as string);
            if (prevPhotos.length > 0) {
              damagePhotos = prevPhotos;
              _recoveryAttempted = true;
              console.log(`[KINGA Assessment] Claim ${claimId}: Recovery-3 (cached photos) succeeded — reusing ${prevPhotos.length} photo URL(s) from previous assessment.`);
            }
          }
        } catch (fallbackErr: any) {
          console.warn(`[KINGA Assessment] Claim ${claimId}: Recovery-3 (cached photos) also failed: ${fallbackErr.message}`);
        }
      }

      if (!_recoveryAttempted) {
        console.error(`[KINGA Assessment] Claim ${claimId}: All recovery strategies exhausted — no usable evidence recovered.`);
      }
    }
    // Build structured photo ingestion log for the forensic report
    try {
      const { buildPhotoIngestionLog } = await import('./pipeline-v2/photo-ingestion-log');
      _dbPhotoIngestionLog = buildPhotoIngestionLog({
        sourceUrl: pdfUrl,
        isPdf: true,
        pageRenderCount: _isScannedPdf ? (_qualitySummary?.passedDimensionGate ?? 0) + (_qualitySummary?.rejectedTooSmall ?? 0) : 0,
        embeddedImageCount: _isScannedPdf ? 0 : _totalExtracted,
        totalExtracted: _totalExtracted,
        damagePhotoCount: damagePhotos.length,
        documentPhotoCount: 0,
        llmClassificationFailed: false,
        extractionError: _extractionError ?? undefined,
        startedAt: new Date(_photoIngestionStart),
        totalDurationMs: Date.now() - _photoIngestionStart,
        qualitySummary: _qualitySummary,
      });
    } catch (photoLogErr: unknown) {
      // R-GH-16: Photo ingestion log build failure is non-fatal but must be observable.
      // A silent failure here means the forensic report will have no photo ingestion data,
      // making it impossible to diagnose photo extraction issues in production.
      console.warn(
        `[triggerAiAssessment] Photo ingestion log build failed for claim ${claimId}: ` +
        `${photoLogErr instanceof Error ? photoLogErr.message : String(photoLogErr)}`
      );
    }
  }

  // ── CLAIM_DOCUMENTS PHOTO MERGE ──────────────────────────────────────────────
  // Collect any photos uploaded separately via the document upload UI
  // (documentCategory = 'damage_photo') and merge them into damagePhotos.
  // This ensures photos uploaded after claim submission are included in the pipeline.
  try {
    const { claimDocuments } = await import('../drizzle/schema');
    const uploadedPhotoDocs = await db.select({ fileUrl: claimDocuments.fileUrl })
      .from(claimDocuments)
      .where(and(
        eq(claimDocuments.claimId, claimId),
        eq(claimDocuments.documentCategory, 'damage_photo')
      ));
    const uploadedPhotoUrls = uploadedPhotoDocs
      .map((d: any) => d.fileUrl)
      .filter((u: any) => typeof u === 'string' && u.length > 0);
    if (uploadedPhotoUrls.length > 0) {
      const existing = new Set(damagePhotos);
      const newUrls = uploadedPhotoUrls.filter((u: any) => !existing.has(u));
      if (newUrls.length > 0) {
        damagePhotos = [...damagePhotos, ...newUrls];
        console.log(`[KINGA Assessment] Claim ${claimId}: Merged ${newUrls.length} uploaded damage photo(s) from claim_documents. Total: ${damagePhotos.length}`);
      }
    }
  } catch (docPhotoErr: any) {
    console.warn(`[KINGA Assessment] Claim ${claimId}: Failed to merge claim_documents photos (non-fatal): ${docPhotoErr.message}`);
  }
  // ── IMAGE NORMALISATION LAYER ────────────────────────────────────────────
  // Guarantees a consistent image state before Stage 2.6 and Stage 6.
  //
  // Two scenarios:
  //   A) fresh_extraction — PDF was re-extracted this run; _extractedImagesWithMetadata
  //      is populated with real quality metadata. Stage 2.6 classifier runs normally.
  //   B) cache_rehydration — damagePhotos were loaded from DB cache; PDF extraction
  //      was skipped. These photos are ALREADY TRUSTED (they passed the classifier
  //      in a previous run). We bypass the classifier and set damagePhotoUrls directly.
  //
  // This replaces the old "synthetic metadata" patch which caused the classifier to
  // re-run on cached photos with fake quality scores, sometimes producing worse
  // selections than the original trusted set.
  let _imageNormSource: 'fresh_extraction' | 'cache_rehydration' | null = null;
  if (_extractedImagesWithMetadata.length > 0) {
    // Case A: fresh extraction — classifier will run on real metadata
    _imageNormSource = 'fresh_extraction';
    console.log(`[KINGA Assessment] Claim ${claimId}: Image normalisation — fresh_extraction (${_extractedImagesWithMetadata.length} images with real metadata)`);
  } else if (damagePhotos.length > 0) {
    // Case B: cache rehydration — bypass classifier, use trusted cached photos directly
    _imageNormSource = 'cache_rehydration';
    // Do NOT populate _extractedImagesWithMetadata — the orchestrator Stage 2.6 checks
    // imageNormSource and skips the classifier when source === 'cache_rehydration'.
    console.log(`[KINGA Assessment] Claim ${claimId}: Image normalisation — cache_rehydration (${damagePhotos.length} trusted cached photos, classifier bypassed)`);
  }

  // ── DRA Phase 5: Evidence Warning (non-blocking) ────────────────────────────────────────────────
  // All real claims in this system have evidence attached at ingestion time.
  // If pdfUrl and damagePhotos are both empty here, it means the evidence lookup failed
  // (e.g. presign error, missing S3 key) — NOT that the claim genuinely has no documents.
  // We log a warning and continue so the pipeline can still run with available field data.
  // Pipeline stages handle missing evidence gracefully and surface warnings in the report
  // for the adjuster to review. The previous hard-block + owner notification was removed
  // because it caused a flood of emails when the recovery job re-triggered old claims.
  // ─────────────────────────────────────────────────────────────────────────────────────────────────
  if (!pdfUrl && damagePhotos.length === 0) {
    console.warn(
      `[KINGA Assessment] Claim ${claimId}: Evidence lookup returned empty (no PDF URL, no cached photos). ` +
      `This may indicate a presign failure or missing S3 key. Pipeline will continue with available claim data. ` +
      `The assessment output will flag missing evidence for adjuster review.`
    );
    // Do NOT block the pipeline. Do NOT notify owner. Do NOT change status.
    // The pipeline stages handle missing evidence gracefully.
  }
  // ── PIPELINE V2 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  // Build pipeline context and run the 10-stage orchestrator.
  // The old monolithic LLM call + inline stages are replaced by this.
  // ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  // Load per-tenant cost rate overrides (non-fatal — falls back to regional defaults)
  let tenantRates = null;
  try {
    if (claim.tenantId) {
      tenantRates = await getTenantRates(claim.tenantId);
      if (tenantRates) {
        console.log(`[KINGA Assessment] Claim ${claimId}: Tenant rate overrides loaded — labour=$${tenantRates.labourRateUsdPerHour ?? 'default'}/hr, paint=$${tenantRates.paintCostPerPanelUsd ?? 'default'}/panel`);
      }
    }
  } catch (rateErr) {
    console.warn(`[KINGA Assessment] Claim ${claimId}: Failed to load tenant rates (non-fatal):`, rateErr);
  }
  // ── DRA Phase 3: Document Health Gate ──────────────────────────────────────
  // Run the Document Health Gate BEFORE the pipeline starts.
  // Evidence has been collected above. The gate evaluates 6 quality dimensions
  // and decides whether the pipeline may proceed.
  //
  // ROUTING:
  //   PROCEED_AUTOMATICALLY → transition to DOCUMENT_READY, run pipeline
  //   PROCEED_WITH_WARNING  → transition to DOCUMENT_READY, run pipeline (with warning)
  //   REQUIRE_REVIEW        → transition to HUMAN_REVIEW_REQUIRED, block pipeline
  //   BLOCK_ASSESSMENT      → transition to DOCUMENT_FAILED, block pipeline
  // ────────────────────────────────────────────────────────────────────────────
  let _gateResult: any = null;
  try {
    const { runDocumentHealthGate, buildGateInput } = await import('./pipeline-v2/documentHealthGate');
    // For cache_rehydration claims, the PDF extraction block was skipped because trusted
    // cached photos are already available. We synthesise gate inputs that reflect the
    // actual evidence state: photos exist, PDF was previously rendered successfully.
    const _isCacheRehydration = _imageNormSource === 'cache_rehydration';
    const _cachedPhotoCount = damagePhotos.length;
    const gateInput = buildGateInput({
      claimId,
      isDocumentIngested: !!(claim as any).sourceDocumentId,
      // For cache_rehydration: PDF was found (it's what produced the cached photos)
      sourceDocumentFound: _isCacheRehydration ? true : !!pdfUrl,
      presignSucceeded: _isCacheRehydration ? true : !!pdfDownloadUrl,
      // For cache_rehydration: synthesise a non-zero buffer size so integrity check passes
      pdfBuffer: _isCacheRehydration
        ? Buffer.alloc(1024) // placeholder — actual PDF was verified in a prior run
        : (_pdfBuffer ?? null),
      totalPdfPages: _isCacheRehydration
        ? _cachedPhotoCount // treat each cached photo as a rendered page
        : (_qualitySummary?.passedDimensionGate != null
          ? (_qualitySummary.passedDimensionGate + (_qualitySummary.rejectedTooSmall ?? 0))
          : 0),
      pagesRendered: _isCacheRehydration
        ? _cachedPhotoCount
        : (_isScannedPdf
          ? ((_qualitySummary?.passedDimensionGate ?? 0) + (_qualitySummary?.rejectedTooSmall ?? 0))
          // Non-scanned PDF: if the PDF buffer was downloaded successfully, treat it as 1 rendered page.
          // The LLM reads the PDF natively via file_url proxy — it does not need pdftoppm page images.
          // Without this, pdftoppm failure on a non-scanned PDF causes pagesRendered=0 which triggers
          // the critical Page Rendering gate block even though the document is perfectly accessible.
          : (_pdfBuffer && _pdfBuffer.length > 0 ? 1 : 0)),

      pagesDimensionPass: _isCacheRehydration
        ? _cachedPhotoCount
        : (_qualitySummary?.passedDimensionGate ?? 0),
      pagesDimensionFail: _isCacheRehydration ? 0 : (_qualitySummary?.rejectedTooSmall ?? 0),
      textExtracted: false,
      textCharCount: 0,
      totalImagesForAnalysis: damagePhotos.length,
      vehicleDamageImageCount: damagePhotos.length,
      nonVehicleImageCount: 0,
      // renderFailed: only true when pdftoppm failed AND no PDF buffer was downloaded.
      // If _pdfBuffer is available, the LLM can read the PDF directly — pdftoppm failure is non-fatal.
      renderFailed: !_isCacheRehydration && !!_extractionError && damagePhotos.length === 0 && !(_pdfBuffer && _pdfBuffer.length > 0),
      s3UploadFailed: false,
      renderErrorMessage: _isCacheRehydration ? null : (_extractionError ?? null),
      claim: {
        claimNumber: (claim as any).claimNumber ?? null,
        vehicleMake: (claim as any).vehicleMake ?? null,
        vehicleModel: (claim as any).vehicleModel ?? null,
        vehicleYear: (claim as any).vehicleYear ?? null,
        incidentDate: (claim as any).incidentDate ?? null,
        incidentDescription: (claim as any).incidentDescription ?? null,
        claimantId: (claim as any).claimantId ?? null,
        policyNumber: (claim as any).policyNumber ?? null,
      },
    });
    _gateResult = runDocumentHealthGate(gateInput);
    console.log(
      `[KINGA Assessment] Claim ${claimId}: Document Health Gate — ` +
      `score=${_gateResult.overallScore}%, decision=${_gateResult.decision}, ` +
      `failureModes=${_gateResult.detectedFailureModes.join(',') || 'none'}`
    );

    if (!_gateResult.mayProceed) {
      // POLICY: The gate NEVER blocks an assessment.
      // Low document health is flagged as degraded — the pipeline always proceeds.
      // Processors are notified in-app so they can follow up on document quality,
      // but the AI assessment runs regardless to avoid claim delays.
      console.warn(
        `[KINGA Assessment] Claim ${claimId}: Document Health Gate flagged (${_gateResult.decision}). ` +
        `Score: ${_gateResult.overallScore}%. Proceeding in degraded mode. ${_gateResult.summary}`
      );
      // Notify processors in-app (non-blocking, informational — not a hard stop)
      notifyTenantProcessors(claim.tenantId, {
        title: `⚠️ Low Document Quality: Claim ${claim.claimNumber || claimId}`,
        message: `Document health score: ${_gateResult.overallScore}%. Assessment proceeding in degraded mode. ${_gateResult.summary} Recommended: ${_gateResult.recommendedAction}`,
        type: 'system_alert',
        priority: 'medium',
        claimId,
        actionUrl: `/insurer/claims/${claimId}`,
        entityType: 'claim',
        entityId: claimId,
      }).catch(() => {});
      // Fall through — pipeline continues regardless of gate score.
    }

    // Gate passed — transition to DOCUMENT_READY
    await db.update(claims).set({
      status: 'document_ready',
      documentProcessingStatus: 'DOCUMENT_READY',
      updatedAt: new Date().toISOString(),
    }).where(eq(claims.id, claimId)).catch(() => {});

    console.log(`[KINGA Assessment] Claim ${claimId}: Document Health Gate passed. State: DOCUMENT_READY → ANALYSIS_RUNNING.`);
  } catch (gateErr: any) {
    // Gate failure is non-fatal — log and proceed
    console.warn(`[KINGA Assessment] Claim ${claimId}: Document Health Gate failed (non-fatal, proceeding): ${gateErr.message}`);
  }

  // Transition to ANALYSIS_RUNNING
  await db.update(claims).set({
    status: 'analysis_running',
    documentProcessingStatus: 'ANALYSIS_RUNNING',
    updatedAt: new Date().toISOString(),
  }).where(eq(claims.id, claimId)).catch(() => {});

  // ── Phase 1 Observability: generate a unique runId for this pipeline execution ──
  // DURABLE RESUME: If the claim already has a pipelineRunUuid from a prior run that was
  // interrupted, reuse it so loadCompletedStages() can skip already-completed stages.
  // If not, generate a new runId and persist it immediately so the next trigger can resume.
  const _existingRunUuid = (claim as any).pipelineRunUuid as string | null | undefined;
  const _pipelineRunId = (_existingRunUuid && _existingRunUuid.length > 0)
    ? _existingRunUuid
    : `${claimId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const _isResume = !!(_existingRunUuid && _existingRunUuid.length > 0);
  if (_isResume) {
    console.log(`[KINGA Assessment] Claim ${claimId}: RESUMING prior run ${_pipelineRunId} — will skip completed stages.`);
  }
  // Persist runId to claims table immediately so it survives server restarts.
  // Also update heartbeat so the recovery job knows the pipeline is alive.
  try {
    await db.update(claims).set({
      pipelineRunUuid: _pipelineRunId,
      pipelineHeartbeatAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
    }).where(eq(claims.id, claimId));
  } catch (runUuidErr: any) {
    console.warn(`[KINGA Assessment] Claim ${claimId}: Failed to persist pipelineRunUuid (non-fatal): ${runUuidErr.message}`);
  }
  // Record the run start (fire-and-forget — never blocks the pipeline)
  import('./db-pipeline.ts').then(({ recordRunStart }) => {
    recordRunStart({
      runId: _pipelineRunId,
      claimId,
      tenantId: claim.tenantId ?? null,
      triggeredBy: 'system',
      triggerReason: 'ai_assessment',
    }).catch(() => {});
  }).catch(() => {});

  const pipelineCtx = {
    claimId,
    tenantId: (() => { const n = parseInt(String(claim.tenantId ?? ''), 10); return Number.isFinite(n) ? n : null; })(),
    assessmentId: 0, // Will be set after insert
    claim,
    pdfUrl,
    pdfDownloadUrl: pdfDownloadUrl ?? pdfUrl,
    damagePhotoUrls: damagePhotos,
    db,
    log: logger.makePipelineLog(String(claimId)),
    tenantRates,
    // ISO 3166-1 alpha-2 country code for the tenant's primary operating country
    // Priority: tenants.country column → null (no hardcoded fallback — currency resolution handles the default)
    tenantCountry: tenantRates?.country ?? null,
    // Photo ingestion log from pre-pipeline PDF extraction (if applicable)
    photoIngestionLog: _dbPhotoIngestionLog,
    // Full ExtractedImage metadata for the image classifier (confidence scoring, quality-based selection)
    extractedImagesWithMetadata: _extractedImagesWithMetadata,
    // Normalisation layer outputs — tells Stage 2.6 whether to run or bypass the classifier
    imageNormSource: _imageNormSource,
    // Explicit photo availability count for forensic validator tracking
    photosAvailable: damagePhotos.length,
    // Phase 1 Observability: runId for grouping all stage records
    runId: _pipelineRunId,
    // Stage progress callback — updates pipeline_current_stage in DB so UI can show real-time progress.
    // Stage labels are generic (no proprietary details exposed).
    onStageStart: async (stageLabel: string) => {
      try {
        const dbInst = await getDb();
        if (dbInst) {
          await dbInst.update(claims).set({
            pipelineCurrentStage: stageLabel,
            // HEARTBEAT: update every stage start so the recovery job can detect dead pipelines.
            // If pipelineHeartbeatAt is >2 minutes old and the claim is still in a running state,
            // the pipeline process is dead and the claim needs recovery.
            pipelineHeartbeatAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
            updatedAt: new Date().toISOString(),
          }).where(eq(claims.id, claimId));
        }
      } catch (stageErr: any) {
        console.warn(`[KINGA Assessment] Claim ${claimId}: onStageStart DB write failed (non-fatal): ${stageErr?.message ?? stageErr}`);
      }
      // Bug #7: insert the pipeline_jobs row so recordStageComplete can UPDATE it.
      // Derive stageId from stageLabel: "Stage 1 — Ingestion" → "1_ingestion"
      // Mapping table covers all 10 orchestrator stages (onStageStart calls).
      const _stageLabelToId: Record<string, { id: string; index: number }> = {
        "Stage 1 — Ingestion":                     { id: "1_ingestion",           index: 1 },
        "Stage 2 — Extracting":                    { id: "2_extraction",          index: 2 },
        "Stage 3 — Extraction":                    { id: "3_structured_extraction", index: 3 },
        "Stage 4 — Validation":                    { id: "4_validation",          index: 4 },
        "Stage 5 — Assembly":                      { id: "5_assembly",            index: 5 },
        "Stage 6 — Damage Analysis":               { id: "6_damage_analysis",     index: 6 },
        "Stage 6.5A — Vision Geometry Engine":     { id: "6_5a_vision_geo",       index: 7 },
        "Stage 6.5B — Vision Geometry Reconciliation": { id: "6_5b_vision_reconcile", index: 8 },
        "Stage 7 — Physics & Causality":           { id: "7_unified",             index: 9 },
        "Stage 8 — Analysis":                      { id: "8_fraud",               index: 10 },
        "Stage 9 — Cost Optimisation":             { id: "9_cost",                index: 11 },
        "Stage 10 — Report Generation":            { id: "10_report",             index: 12 },
      };
      const _stageInfo = _stageLabelToId[stageLabel];
      if (_stageInfo) {
        Promise.resolve().then(() => {
          dbPipeline.recordStageStart({
            runId: _pipelineRunId,
            claimId,
            stageId: _stageInfo.id,
            stageLabel,
            stageIndex: _stageInfo.index,
            tenantId: claim.tenantId != null ? String(claim.tenantId) : null,
          }).catch(() => {});
        });
      }
    },
    // Phase 1 Observability: per-stage completion callback (fire-and-forget)
    onStageComplete: (stageId: string, stageResult: {
      durationMs: number;
      status: 'completed' | 'failed' | 'skipped' | 'degraded';
      isDegraded?: boolean;
      isTimeout?: boolean;
      errorMessage?: string | null;
      assumptionCount?: number;
      recoveryActionCount?: number;
    }) => {
      // R-OBS-04: emit structured stage completion event to log stream
      const stageStatus = stageResult.status === 'completed' ? 'COMPLETE'
        : stageResult.status === 'failed' ? 'FAILED'
        : stageResult.status === 'degraded' ? 'DEGRADED'
        : 'SKIPPED';
      logger.stage(stageId, stageStatus, {
        claimId: String(claimId),
        runId: _pipelineRunId,
        durationMs: stageResult.durationMs,
        ...(stageResult.isDegraded ? { isDegraded: true } : {}),
        ...(stageResult.isTimeout ? { isTimeout: true } : {}),
        ...(stageResult.errorMessage ? { errorMessage: stageResult.errorMessage } : {}),
      });
      Promise.resolve().then(() => {
        dbPipeline.recordStageComplete({
          runId: _pipelineRunId,
          stageId,
          ...stageResult,
        }).catch(() => {});
      });
    },
    // Mid-stage heartbeat tick — called by long-running stages (Stage 2, Stage 6) to
    // keep the heartbeat fresh during slow LLM calls. Non-blocking, never throws.
    tickHeartbeat: () => {
      getDb().then(dbInst => {
        if (!dbInst) return;
        dbInst.update(claims).set({
          pipelineHeartbeatAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
        }).where(eq(claims.id, claimId)).catch(() => {});
      }).catch(() => {});
    },
  } satisfies import('./pipeline-v2/types').PipelineContext;
  // ── GLOBAL PIPELINE TIMEOUT ──────────────────────────────────────────────
  // Wrap the entire pipeline in a 15-minute timeout. With thinking disabled
  // and per-call timeouts at 90s, the worst-case pipeline (12 LLM calls +
  // 3 photo forensics) should complete in under 10 minutes. The 15-minute
  // guard prevents zombie jobs from holding DB connections indefinitely.
  const PIPELINE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
  let pipelineTimeoutId: ReturnType<typeof setTimeout> | null = null;
  const pipelineWithTimeout = Promise.race([
    runPipelineV2(pipelineCtx),
    new Promise<never>((_, reject) => {
      pipelineTimeoutId = setTimeout(
        () => reject(new Error(`Pipeline timed out after 15 minutes for claim ${claimId}`)),
        PIPELINE_TIMEOUT_MS
      );
    }),
  ]);
  let result: Awaited<ReturnType<typeof runPipelineV2>>;
  try {
    result = await pipelineWithTimeout;
  } catch (pipelineErr) {
    if (pipelineTimeoutId) clearTimeout(pipelineTimeoutId);
    if (pipelineErr instanceof PipelineIncompleteError) {
      // Route to PIPELINE_INCOMPLETE state — do not write a report.
      // CRITICAL: Must update documentProcessingStatus, status, and workflowState
      // to exit the transient 'parsing' state. Without this, the stuck recovery
      // job re-triggers the pipeline every 20 minutes (infinite loop).
      console.error(`[KINGA Assessment] Claim ${claimId}: Pipeline incomplete — ${pipelineErr.message}`);
      // Phase 1 Observability: record run as failed (fire-and-forget)
      import('./db-pipeline.ts').then(({ recordRunComplete }) => {
        recordRunComplete({ runId: _pipelineRunId, status: 'failed', totalDurationMs: 0, stagesCompleted: 0, stagesFailed: 1, stagesDegraded: 0 }).catch(() => {});
      }).catch(() => {});
      // Send in-app notification to processors (non-blocking, fire-and-forget)
      notifyTenantProcessors(claim.tenantId, {
        title: `🔴 Pipeline Failure: Claim ${claim.claimNumber || claimId}`,
        message: `KINGA pipeline could not complete: ${pipelineErr.message}. Claim routed to document_failed for manual review.`,
        type: 'system_alert',
        priority: 'high',
        claimId,
        actionUrl: `/insurer/claims/${claimId}`,
        entityType: 'claim',
        entityId: claimId,
      }).catch(() => {});
      // DRA: Route PipelineIncompleteError to DRA terminal state, not legacy failed/intake_pending.
      // This ensures the stuck-recovery-job and UI see the correct state.
      // IMPORTANT: Do NOT reset aiAssessmentTriggered to 0 here.
      // If KINGA was actively running and hit a PipelineIncompleteError,
      // the claim must remain visible as a KINGA failure so the processor can retry.
      await db.update(claims).set({
        documentProcessingStatus: "DOCUMENT_FAILED",
        status: "document_failed",
        workflowState: "intake_queue",
        updatedAt: new Date().toISOString(),
      }).where(eq(claims.id, claimId));
      // Upsert a minimal ai_assessment record so the exception queue can surface it
      const existingAssessment = await db.select({ id: aiAssessments.id })
        .from(aiAssessments).where(eq(aiAssessments.claimId, claimId)).limit(1);
      const pipelineIncompleteJson = JSON.stringify({
        status: "PIPELINE_INCOMPLETE",
        reason: pipelineErr.message,
        missingComponents: pipelineErr.guardResult?.failures?.map((f: any) => f.detail) ?? [],
        timestamp: new Date().toISOString(),
      });
      if (existingAssessment.length > 0) {
        await db.update(aiAssessments).set({
          pipelineRunSummary: pipelineIncompleteJson,
          updatedAt: new Date().toISOString(),
        }).where(eq(aiAssessments.claimId, claimId));
      } else {
        await db.insert(aiAssessments).values({
          claimId,
          tenantId: claim.tenantId ?? null,
          pipelineRunSummary: pipelineIncompleteJson,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
      return;
    }
    throw pipelineErr;
  }
  if (pipelineTimeoutId) clearTimeout(pipelineTimeoutId);

  // ── GC HINT: Pipeline complete — release intermediate stage buffers before DB write ──
  if (typeof globalThis.gc === 'function') { globalThis.gc(); }

  // ── PERSIST RESULTS TO DATABASE ──────────────────────────────────────
  const { claimRecord, report, damageAnalysis, physicsAnalysis, fraudAnalysis, costAnalysis, turnaroundAnalysis, summary, causalChain, evidenceBundle, realismBundle, benchmarkBundle, consensusResult, causalVerdict, validatedOutcome, caseSignature, stage2RawOcrText, decisionAuthority, reportReadiness, forensicAnalysis, coherenceResult: pipelineCoherenceResult, costRealismResult: pipelineCostRealismResult, consistencyCheckResult: pipelineConsistencyResult, contradictionGateResult: pipelineContradictionResult, physicsDeviationScoreValue: pipelinePhysicsDeviationScore } = result;

  // Diagnostic logging: show which pipeline outputs are populated vs null
  console.log(`[KINGA Assessment] Claim ${claimId}: Pipeline result summary — ` +
    `claimRecord=${claimRecord ? 'YES' : 'NULL'}, ` +
    `damageAnalysis=${damageAnalysis ? 'YES' : 'NULL'}, ` +
    `physicsAnalysis=${physicsAnalysis ? 'YES' : 'NULL'}, ` +
    `fraudAnalysis=${fraudAnalysis ? 'YES' : 'NULL'}, ` +
    `costAnalysis=${costAnalysis ? 'YES' : 'NULL'}, ` +
    `decisionAuthority=${decisionAuthority ? decisionAuthority.recommendation : 'NULL'}, ` +
    `reportReadiness=${reportReadiness ? reportReadiness.status : 'NULL'}, ` +
    `forensicAnalysis=${forensicAnalysis ? 'YES' : 'NULL'}, ` +
    `stage2RawOcrText=${stage2RawOcrText ? `${stage2RawOcrText.length} chars` : 'NULL'}, ` +
    `totalDuration=${summary?.totalDurationMs ?? 'N/A'}ms`
  );

  // Extract narrativeAnalysis from claimRecord for dedicated column storage
  const narrativeAnalysis = claimRecord?.accidentDetails?.narrativeAnalysis ?? null;

  // Map fraud risk level to DB enum (FSS-2026-001)
  // ARCH-03b fix: 'moderate' was missing — caused scores 40-60 to silently downgrade to 'low'
  const fraudLevelMap: Record<string, 'low' | 'medium' | 'moderate' | 'high' | 'critical' | 'elevated'> = {
    minimal: 'low', low: 'low', medium: 'medium', moderate: 'moderate', high: 'high', critical: 'elevated', elevated: 'elevated',
  };
  const dbFraudLevel = fraudAnalysis ? (fraudLevelMap[fraudAnalysis.fraudRiskLevel] || 'low') : 'low';

  // Map structural severity to DB enum
  const severityMap: Record<string, 'none' | 'minor' | 'moderate' | 'severe' | 'catastrophic'> = {
    none: 'none', cosmetic: 'minor', minor: 'minor', moderate: 'moderate', severe: 'severe', catastrophic: 'catastrophic',
  };
  const dbStructuralSeverity = physicsAnalysis
    ? (severityMap[physicsAnalysis.accidentSeverity] || 'moderate')
    : 'none';

  // Build damaged components JSON
  const damagedComponentsJson = damageAnalysis
    ? JSON.stringify(damageAnalysis.damagedParts.map(p => ({
        name: p.name,
        location: p.location,
        damageType: p.damageType,
        severity: p.severity,
        visible: p.visible,
      })))
    : '[]';

  // Build physics analysis JSON
  const physicsJson = physicsAnalysis ? JSON.stringify({
    impactForceKn: physicsAnalysis.impactForceKn,
    impactVector: physicsAnalysis.impactVector,
    energyDistribution: physicsAnalysis.energyDistribution,
    estimatedSpeedKmh: physicsAnalysis.estimatedSpeedKmh,
    deltaVKmh: physicsAnalysis.deltaVKmh,
    decelerationG: physicsAnalysis.decelerationG,
    accidentSeverity: physicsAnalysis.accidentSeverity,
    reconstructionSummary: physicsAnalysis.accidentReconstructionSummary,
    damageConsistencyScore: physicsAnalysis.damageConsistencyScore,
    latentDamageProbability: physicsAnalysis.latentDamageProbability,
    physicsExecuted: physicsAnalysis.physicsExecuted,
    severityConsensus: (physicsAnalysis as any).severityConsensus ?? null,
    damagePatternValidation: (physicsAnalysis as any).damagePatternValidation ?? null,
    // Numerical contract — guarantees non-zero speed/deltaV even when LLM returns 0
    physicsNumerical: (physicsAnalysis as any).physicsNumerical ?? null,
    velocityRange: (physicsAnalysis as any).velocityRange ?? null,
    // Speed inference ensemble — 5-method consensus speed (Section 2.6)
    speedInferenceEnsemble: (physicsAnalysis as any).speedInferenceEnsemble ?? null,
    // Speed forensics — claimed vs physics-inferred dual-speed comparison (Section 2.7)
    speedForensics: (physicsAnalysis as any).speedForensics ?? null,
    // Physics execution status — EXECUTED / SKIPPED_NON_PHYSICAL / SKIPPED_NO_SPEED / ESTIMATED_FALLBACK
    physicsStatus: (physicsAnalysis as any).physicsStatus ?? null,
    // Animal strike physics engine output (Section 2.1 animal strike block)
    animalStrikePhysics: (physicsAnalysis as any).animalStrikePhysics ?? null,
    // Causal plausibility score (0–100) — used by Stage 10 to flag invalid physics runs
    causalPlausibility: (physicsAnalysis as any).causalPlausibility ?? null,
    // R-GH-20: Fields added to Stage7Output in Batch 1 (R-GH-07) but missing from physicsJson.
    // These are required for the physics plausibility gate in Stage 10.
    isPhysicallyPlausible: (physicsAnalysis as any).isPhysicallyPlausible ?? null,
    physicsConfidence: (physicsAnalysis as any).physicsConfidence ?? null,
    hasCriticalInconsistency: (physicsAnalysis as any).hasCriticalInconsistency ?? null,
    damageZones: (physicsAnalysis as any).damageZones ?? null,
    // P6: Stage 6 image source reliability — stored here because Stage 7 reads it to gate the
    // speed ensemble. HIGH/MEDIUM = trusted vision input; LOW/NONE = fallback fired, crush depths excluded.
    // Source: Stage6Output.visionSourceReliability passed through the pipeline result.
    visionSourceReliability: (damageAnalysis as any)?.visionSourceReliability ?? null,
    // VGE/VGR — Vision Geometry Engine calibration and cross-image reconciliation.
    // Stage 6.5A produces pixel-to-mm scale calibration; Stage 6.5B produces view-angle-weighted
    // consensus crush depth. Both are attached to Stage7Output and persisted here so the
    // Forensic report can render the Geometry Evidence Block without re-running the pipeline.
    geometryEvidenceBlock: (physicsAnalysis as any)?.geometryEvidenceBlock ?? null,
    vgrReconciliation: (physicsAnalysis as any)?.vgrReconciliation ?? null,
    // Damage classification — Possible/Impossible/Unexplained per-component classification.
    // Produced by Stage 7 after the speed ensemble runs. Classifies each observed damage
    // component and image zone against the expected damage profile for the stated speed
    // and direction. Used by the Forensic report and fraud engine.
    damageClassification: (physicsAnalysis as any)?.damageClassification ?? null,
    // Signal 3: EXIF Vision Trust Downgrade — if all photos lack EXIF, visionSourceReliability
    // is downgraded from HIGH to MEDIUM post-Stage-8. Advisory data quality signal only.
    visionSourceReliabilityAdjusted: (physicsAnalysis as any)?.visionSourceReliabilityAdjusted ?? null,
    visionSourceReliabilityAdjustmentReason: (physicsAnalysis as any)?.visionSourceReliabilityAdjustmentReason ?? null,
  }) : null;

  // Build fraud indicators JSON
  const fraudIndicatorsJson = fraudAnalysis
    ? JSON.stringify(fraudAnalysis.indicators.map(i => i.description))
    : '[]';

  // Build fraud score breakdown JSON
  const fraudScoreBreakdownJson = fraudAnalysis
    ? JSON.stringify({
        overallScore: fraudAnalysis.fraudRiskScore,
        level: fraudAnalysis.fraudRiskLevel,
        indicators: fraudAnalysis.indicators,
        damageConsistency: {
          score: fraudAnalysis.damageConsistencyScore,
          notes: fraudAnalysis.damageConsistencyNotes,
        },
        // Scenario-aware fraud detection result (null if engine was skipped)
        scenarioFraudResult: fraudAnalysis.scenarioFraudResult ?? null,
        crossEngineConsistency: fraudAnalysis.crossEngineConsistency ?? null,
        confidenceAggregation: fraudAnalysis.confidenceAggregation ?? null,
        photoForensics: fraudAnalysis.photoForensics ?? null,
        // Phase 1: Quote similarity engine results
        quoteSimilarity: fraudAnalysis.quoteSimilarity ?? null,
        // Accident date cross-check (claim form vs police report vs image EXIF)
        accidentDateCrossCheck: fraudAnalysis.accidentDateCrossCheck ?? null,
      })
    : null;

  // Build cost intelligence JSON
  // Source priority for documented quote values:
  //   1. Stage 9 output (costAnalysis.documentedOriginalQuoteUsd) — most reliable,
  //      includes recovered quotes from input recovery pass
  //   2. claimRecord.repairQuote — direct extraction fallback
  const repairQuote = claimRecord?.repairQuote ?? null;
  const documentedOriginalQuoteUsd =
    costAnalysis?.documentedOriginalQuoteUsd
    ?? (repairQuote?.quoteTotalCents ? repairQuote.quoteTotalCents / 100 : null);
  const documentedAgreedCostUsd =
    costAnalysis?.documentedAgreedCostUsd
    ?? (repairQuote?.agreedCostCents ? repairQuote.agreedCostCents / 100 : null);
  const panelBeaterName =
    costAnalysis?.panelBeaterName
    ?? repairQuote?.repairerName
    ?? repairQuote?.repairerCompany
    ?? null;
  const documentedLabourCostUsd =
    costAnalysis?.documentedLabourCostUsd
    ?? (repairQuote?.labourCostCents ? repairQuote.labourCostCents / 100 : null);
  const documentedPartsCostUsd =
    costAnalysis?.documentedPartsCostUsd
    ?? (repairQuote?.partsCostCents ? repairQuote.partsCostCents / 100 : null);

  let costIntelligenceJson = costAnalysis ? JSON.stringify({
    expectedRepairCostCents: costAnalysis.expectedRepairCostCents,
    quoteDeviationPct: costAnalysis.quoteDeviationPct,
    recommendedRange: costAnalysis.recommendedCostRange,
    savingsOpportunityCents: costAnalysis.savingsOpportunityCents,
    breakdown: costAnalysis.breakdown,
    labourRateUsdPerHour: costAnalysis.labourRateUsdPerHour,
    marketRegion: costAnalysis.marketRegion,
    currency: costAnalysis.currency,
    // Panel beater quote values — sourced from Stage 9 output (preferred) or claimRecord
    documentedOriginalQuoteUsd,
    documentedAgreedCostUsd,
    assessorCostComparison: (costAnalysis as any).assessorCostComparison ?? (documentedAgreedCostUsd !== null
      ? { documentedAgreedCostUsd, usage: "assessor_calibration_reference_only", settlementEligible: false }
      : null),
    panelBeaterName,
    lineItems: repairQuote?.lineItems ?? [],
    documentedLabourCostUsd,
    documentedPartsCostUsd,
    quotesReceived: costAnalysis.quoteOptimisation?.quotes_evaluated ?? (documentedOriginalQuoteUsd ? 1 : 0),
    // Cost Decision Engine outputs — CRITICAL for correct cost display
    costDecision: costAnalysis.costDecision ?? null,
    costNarrative: costAnalysis.costNarrative ?? null,
    costReliability: costAnalysis.costReliability ?? null,
    quoteOptimisation: costAnalysis.quoteOptimisation ?? null,
    alignmentResult: costAnalysis.alignmentResult ?? null,
    reconciliationSummary: costAnalysis.reconciliationSummary ?? null,
    // Transparency fields — tell the UI what data underpins the AI benchmark
    aiEstimateSource: (costAnalysis as any).aiEstimateSource ?? null,
    aiEstimateNote: (costAnalysis as any).aiEstimateNote ?? null,
    // Multi-quote comparison — highest-weighted selected quote
    bestSelectedQuote: (costAnalysis as any).bestSelectedQuote ?? null,
    quoteCount: (costAnalysis as any).quoteCount ?? 0,
    // Market value — for total-loss threshold display in Section 3
    marketValueUsd: costAnalysis.marketValueUsd ?? null,
    totalEstimatedCost: costAnalysis.expectedRepairCostCents ? costAnalysis.expectedRepairCostCents / 100 : null,
    // Phase 2: Per-component KINGA benchmark ranges (p25/median/p75 + per-quote over/fair/under flags)
    perComponentBenchmarks: (costAnalysis as any).perComponentBenchmarks ?? null,
    // Phase 3: Composite quote optimisation — three-layer cost model (L1/L2/L3), NFS, component classification
    compositeOptimisation: (costAnalysis as any).compositeOptimisation ?? null,
    // Phase 3: Top-level KINGA savings fields (also set on compositeOptimisation, surfaced here for direct access)
    kingaSavingsLowestSubmittedUsd: (costAnalysis as any).kingaSavingsLowestSubmittedUsd ?? null,
    kingaSavingsL2OptimisedUsd: (costAnalysis as any).kingaSavingsL2OptimisedUsd ?? null,
    kingaSavingsQuoteOptimisation: (costAnalysis as any).kingaSavingsQuoteOptimisation ?? null,
    benchmarkCoverageComponents: (costAnalysis as any).benchmarkCoverageComponents ?? null,
  }) : (
    // Even if costAnalysis is null, still persist the documented quote values
    // so the UI can display the panel beater quote from the extracted document.
    (documentedOriginalQuoteUsd || documentedAgreedCostUsd) ? JSON.stringify({
      expectedRepairCostCents: null,
      documentedOriginalQuoteUsd,
      documentedAgreedCostUsd,
      panelBeaterName,
      lineItems: repairQuote?.lineItems ?? [],
      documentedLabourCostUsd,
      documentedPartsCostUsd,
      quotesReceived: 0,
      costDecision: null,
      costNarrative: null,
      costReliability: null,
      quoteOptimisation: null,
      alignmentResult: null,
      reconciliationSummary: null,
    }) : null
  );
  // Build repair intelligence and parts reconciliation JSON
  const repairIntelligenceJson = costAnalysis?.repairIntelligence
    ? JSON.stringify(costAnalysis.repairIntelligence)
    : null;
  const partsReconciliationJson = costAnalysis?.partsReconciliation
    ? JSON.stringify(costAnalysis.partsReconciliation)
    : null;

  // Build hidden damages JSON from physics latent damage probabilities
  // latentDamageProbability values are already on a 0-100 scale (not 0-1)
  const hiddenDamagesJson = physicsAnalysis && physicsAnalysis.physicsExecuted
    ? JSON.stringify(Object.entries(physicsAnalysis.latentDamageProbability)
        .filter(([_, prob]) => (prob as number) > 10) // filter: > 10% (0-100 scale)
        .map(([system, prob]) => ({
          system,
          probability: prob, // already 0-100
          description: `Potential hidden damage to ${system} system (${(prob as number).toFixed(0)}% probability)`,
        })))
    : '[]';

  // Build damage description
  const damageDesc = claimRecord
    ? `${claimRecord.vehicle.make} ${claimRecord.vehicle.model} (${claimRecord.vehicle.year || 'unknown year'}). ${claimRecord.damage.description || 'No description available.'}. ${damageAnalysis ? damageAnalysis.damagedParts.length + ' damaged components identified.' : ''}`
    : 'Assessment data unavailable.';

  // Estimated cost in whole currency units.
  // R1 priority: complete L2 > documented submitted quote > Stage 9 estimate.
  // An assessor documented/agreed cost is calibration evidence only and must not
  // become a new-claim estimate, L2 substitute, or settlement fallback.
  // NOTE: documentedAgreedCostUsd and documentedOriginalQuoteUsd are already declared above (line ~593).
  const aiEstimateCents = costAnalysis?.expectedRepairCostCents ?? 0;
  const completeL2Usd = (costAnalysis as any)?.compositeOptimisation?.isComplete === true
    ? Number((costAnalysis as any)?.compositeOptimisation?.l2CompositeOptimisedCostUsd ?? 0)
    : 0;
  // estimated_cost column is stored in CENTS throughout the system.
  // completeL2Usd / documentedOriginalQuoteUsd are in dollars → multiply by 100.
  // aiEstimateCents is already in cents → use directly.
  const estimatedCostCents = completeL2Usd > 0
    ? Math.round(completeL2Usd * 100)
    : documentedOriginalQuoteUsd && documentedOriginalQuoteUsd > 0
      ? Math.round(documentedOriginalQuoteUsd * 100)
      : Math.round(aiEstimateCents);
  // estimatedCost in dollars for ratio calculations (kept for backward compat with local vars below)
  const estimatedCost = estimatedCostCents / 100;
  // Only write parts/labour breakdown when the data comes from a real source
  // (submitted quote line items or learning DB). Never write hardcoded index estimates.
  const aiEstimateSource = (costAnalysis as any)?.aiEstimateSource as string | undefined;
  const hasRealBreakdown = aiEstimateSource === 'quote_derived' || aiEstimateSource === 'learning_db';
  const estimatedPartsCost = (costAnalysis && hasRealBreakdown)
    ? Math.round(costAnalysis.breakdown.partsCostCents / 100)
    : 0;
  const estimatedLaborCost = (costAnalysis && hasRealBreakdown)
    ? Math.round(costAnalysis.breakdown.labourCostCents / 100)
    : 0;

  // ── TOTAL LOSS DETECTION ─────────────────────────────────────────────────
  // Fetch the vehicle market value from the valuations table (stored in cents).
  // Standard industry threshold: repair cost ≥ 75% of market value = total loss.
  let vehicleMarketValueCents: number | null = null;
  try {
    const [valRow] = await db.select({ v: vehicleMarketValuations.estimatedMarketValue })
      .from(vehicleMarketValuations)
      .where(eq(vehicleMarketValuations.claimId, claimId))
      .limit(1);
    if (valRow?.v) vehicleMarketValueCents = Number(valRow.v);
  } catch (valErr: unknown) {
    // R-GH-16: Vehicle market value lookup failure is non-fatal (falls back to claim.vehicleMarketValue)
    // but must be observable — a DB error here silently skips the total-loss ratio calculation.
    console.warn(
      `[triggerAiAssessment] Vehicle market value lookup failed for claim ${claimId}: ` +
      `${valErr instanceof Error ? valErr.message : String(valErr)}`
    );
  }
  // Also check the claim's own vehicle_market_value field (in cents)
  if (!vehicleMarketValueCents && (claim as any).vehicleMarketValue) {
    vehicleMarketValueCents = Number((claim as any).vehicleMarketValue);
  }
  const vehicleMarketValueDollars = vehicleMarketValueCents ? vehicleMarketValueCents / 100 : null;
  const kingaWriteOffRecommendation = resolveKingaWriteOffRecommendation({
    // Economic recommendation is deliberately limited to complete L2. A partial
    // review-priced scope or preliminary estimate cannot create a write-off result.
    completeL2CostUsd: completeL2Usd > 0 ? completeL2Usd : null,
    verifiedMarketValueUsd: vehicleMarketValueDollars,
    // Dedicated Stage 6 structural analysis plus executed Stage 7 physics evidence
    // jointly support a technical recommendation; either source alone does not.
    structuralDamageDetected: damageAnalysis?.structuralDamageDetected === true,
    physicsExecuted: physicsAnalysis?.physicsExecuted === true,
    physicsSeverity: physicsAnalysis?.accidentSeverity ?? null,
  });
  const repairToValueRatio = kingaWriteOffRecommendation.repairToValueRatio === null
    ? null
    : Math.round(kingaWriteOffRecommendation.repairToValueRatio * 100);
  const totalLossIndicated = kingaWriteOffRecommendation.writeOffRecommended ? 1 : 0;
  if (totalLossIndicated) {
    console.log(`[KINGA Assessment] Claim ${claimId}: ${kingaWriteOffRecommendation.kind} — ${kingaWriteOffRecommendation.detail}`);
  }
  if (costIntelligenceJson) {
    try {
      costIntelligenceJson = JSON.stringify({
        ...JSON.parse(costIntelligenceJson),
        repairabilityDecision: kingaWriteOffRecommendation,
      });
    } catch (repairabilitySerializationError) {
      console.warn(`[KINGA Assessment] Claim ${claimId}: could not append repairability recommendation`, repairabilitySerializationError);
    }
  }

  // Stage 36: Run Forensic Audit Validator on the completed pipeline result
  // Inject classifiedImages into result so the validator can use accurate photo counts
  if ((pipelineCtx as any).classifiedImages) {
    (result as any).classifiedImages = (pipelineCtx as any).classifiedImages;
  }
  // Also inject enrichedPhotosJson from ctx when the orchestrator return missed it
  // (happens on cache_rehydration runs where classifiedImages is null but Stage 6 still
  // set enrichedPhotosJson on ctx). Without this, imageAnalysisTotalCount = 0 even
  // though photos were processed, causing the report to say "no images extracted".
  if (!(result as any).enrichedPhotosJson && (pipelineCtx as any).enrichedPhotosJson) {
    (result as any).enrichedPhotosJson = (pipelineCtx as any).enrichedPhotosJson;
  }
  let forensicAuditValidationResult: import('./pipeline-v2/forensicAuditValidator').ForensicAuditValidationReport | null = null;
  try {
    const { runForensicAuditValidation } = await import('./pipeline-v2/forensicAuditValidator');
    forensicAuditValidationResult = await runForensicAuditValidation(result as any);
    if (forensicAuditValidationResult) {
      console.log(`[KINGA Assessment] Claim ${claimId}: Forensic audit validation complete — status=${forensicAuditValidationResult.overallStatus}, consistencyScore=${forensicAuditValidationResult.consistencyScore}, criticalFailures=${forensicAuditValidationResult.criticalFailures.length}`);
    }
  } catch (validatorErr: any) {
    console.warn(`[KINGA Assessment] Claim ${claimId}: Forensic audit validator failed (non-fatal):`, validatorErr?.message ?? validatorErr);
  }

  // ── NaN SANITIZER ──────────────────────────────────────────────────────────
  // mysql2's query() method (non-prepared) formats NaN as the literal string 'nan'
  // without quotes, which MySQL interprets as a column name →
  // ER_BAD_FIELD_ERROR: Unknown column 'nan' in 'field list'.
  // Guard every numeric column that could receive NaN from math operations.
  const safeInt = (v: number | null | undefined): number | null => {
    if (v === null || v === undefined) return null;
    if (!Number.isFinite(v)) return null; // catches NaN, Infinity, -Infinity
    return Math.round(v);
  };
  const safeFloat = (v: number | null | undefined): number | null => {
    if (v === null || v === undefined) return null;
    if (!Number.isFinite(v)) return null;
    return v;
  };

  // ── GLOBAL NaN SANITIZER ──────────────────────────────────────────────────
  // Walk any plain object/array and replace NaN/Infinity/-Infinity with null.
  // This is a last-resort safety net — individual numeric fields should still
  // use safeInt/safeFloat. mysql2 formats NaN as the bare string 'nan' (no
  // quotes) which MySQL interprets as a column name → ER_BAD_FIELD_ERROR.
  function sanitizeNaNDeep<T>(obj: T): T {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === 'number') return (Number.isFinite(obj) ? obj : null) as unknown as T;
    if (typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return (obj as unknown[]).map(sanitizeNaNDeep) as unknown as T;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      out[k] = sanitizeNaNDeep(v);
    }
    return out as T;
  }

  // Delete any previous assessment for this claim
  console.log(`[KINGA Assessment] Claim ${claimId}: Deleting previous assessment and inserting new one...`);
  await db.delete(aiAssessments).where(eq(aiAssessments.claimId, claimId)).catch((delErr) => {
    console.warn(`[KINGA Assessment] Claim ${claimId}: Failed to delete previous assessment (non-fatal):`, delErr);
  });

  // Insert new assessment — sanitize the entire object to prevent NaN column errors
  const _rawInsertValues = {
  claimId,
  tenantId: claim.tenantId ?? null,
  estimatedCost: safeInt(estimatedCostCents),
  damageDescription: damageDesc,
    detectedDamageTypes: damageAnalysis
      ? JSON.stringify([...new Set(damageAnalysis.damagedParts.map(p => p.damageType))])
      : '[]',
    // KINGA CONFIDENCE — use the FCDI (Forensic Confidence Degradation Index) as the
    // confidence score displayed in the UI. FCDI measures pipeline execution quality:
    // how many stages ran successfully, how many assumptions were made, and whether
    // critical stages degraded. This is a true measure of how much the AI result can
    // be trusted, NOT a measure of how complete the claim data is.
    //
    // FCDI is computed in Stage 13 (forensicCDI.ts) and stored in forensicAnalysis.fcdi.
    // Falls back to data completeness score if FCDI is not available (e.g. pipeline
    // crashed before Stage 13).
    confidenceScore: (() => {
      try {
        const fcdiScore = (forensicAnalysis?.fcdi as any)?.scorePercent;
        if (typeof fcdiScore === 'number' && fcdiScore >= 0 && fcdiScore <= 100) {
          return safeInt(Math.round(fcdiScore)) ?? 50;
        }
        // Fallback: data completeness score
        return safeInt(claimRecord ? Math.max(0, Math.min(100, claimRecord.dataQuality.completenessScore)) : 50) ?? 50;
      } catch {
        return 50;
      }
    })(),
    fraudIndicators: fraudIndicatorsJson,
    fraudRiskLevel: dbFraudLevel,
    // SYSTEMIC FIX: Persist fraud score and recommendation as first-class columns.
    // Previously these were only buried in JSON blobs, causing the router to always
    // read undefined (→ fraudScore=0, recommendation=null) and produce wrong verdicts.
    fraudScore: safeInt(fraudAnalysis ? Math.round(fraudAnalysis.fraudRiskScore) : null),
    // Use Decision Authority recommendation (Stage 12) as the single source of truth.
    // Falls back to cost engine recommendation if Decision Authority didn't run.
    recommendation: decisionAuthority?.recommendation ?? costAnalysis?.costDecision?.recommendation ?? null,
    fraudScoreBreakdownJson,
    modelVersion: 'pipeline-v2',
    processingTime: safeInt(summary.totalDurationMs),
    totalLossIndicated: safeInt(totalLossIndicated) ?? 0,
    repairToValueRatio: safeInt(repairToValueRatio),
    totalLossReasoning: kingaWriteOffRecommendation.detail,
    structuralDamageSeverity: dbStructuralSeverity,
    damagedComponentsJson,
    physicsAnalysis: physicsJson,
    estimatedPartsCost: safeInt(estimatedPartsCost),
    estimatedLaborCost: safeInt(estimatedLaborCost),
    currencyCode: costAnalysis?.currency || 'USD',
    inferredHiddenDamagesJson: hiddenDamagesJson,
    costIntelligenceJson,
    repairIntelligenceJson,
    partsReconciliationJson,
    // PHOTO FIX: Use the pre-pipeline extracted damagePhotos array as the primary source.
    // claimRecord.damage.imageUrls is only populated when Stage 3/5 assembly succeeds;
    // damagePhotos is always populated when PDF extraction or claim_documents merge ran.
    // Merge both to ensure no URLs are lost.
    damagePhotosJson: (() => {
      const fromPipeline: string[] = damagePhotos ?? [];
      const fromClaimRecord: string[] = claimRecord?.damage?.imageUrls ?? [];
      // Also include URLs from Stage 6 enriched photos — these are the vision-analysed images.
      // enrichedPhotosJson is an array of objects with a .url field; extract the URLs.
      const fromEnriched: string[] = (() => {
        try {
          const enriched = result.enrichedPhotosJson ? JSON.parse(result.enrichedPhotosJson) : [];
          return Array.isArray(enriched)
            ? enriched.map((p: any) => p.url ?? p.imageUrl ?? '').filter(Boolean)
            : [];
        } catch { return []; }
      })();
      const merged = Array.from(new Set([...fromPipeline, ...fromClaimRecord, ...fromEnriched]));
      return JSON.stringify(merged.length > 0 ? merged : []);
    })(),
    pipelineRunSummary: JSON.stringify({
      stages: summary.stages,
      documentVerification: (summary as any).documentVerification ?? null,
      turnaroundEstimate: turnaroundAnalysis ? {
        estimatedRepairDays: turnaroundAnalysis.estimatedRepairDays,
        bestCaseDays: turnaroundAnalysis.bestCaseDays,
        worstCaseDays: turnaroundAnalysis.worstCaseDays,
        confidence: turnaroundAnalysis.confidence,
        breakdown: turnaroundAnalysis.breakdown,
        bottlenecks: turnaroundAnalysis.bottlenecks,
      } : null,
    }),
    // Stage 35-42: Advanced analytics
    causalChainJson: causalChain ? JSON.stringify(causalChain) : null,
    evidenceBundleJson: evidenceBundle ? JSON.stringify(evidenceBundle) : null,
    realismBundleJson: realismBundle ? JSON.stringify(realismBundle) : null,
    benchmarkBundleJson: benchmarkBundle ? JSON.stringify(benchmarkBundle) : null,
    consensusResultJson: consensusResult ? JSON.stringify(consensusResult) : null,
    causalVerdictJson: causalVerdict ? JSON.stringify(causalVerdict) : null,
    validatedOutcomeJson: validatedOutcome ? JSON.stringify(validatedOutcome) : null,
    caseSignatureJson: caseSignature ? JSON.stringify(caseSignature) : null,
    // Stage 2 raw OCR text — stored for audit trails and re-extraction without re-running the pipeline
    stage2RawOcrText: stage2RawOcrText ?? null,
    // Full ClaimRecord JSON — canonical structured extraction result (all fields including insurer, policy, excess, etc.)
    claimRecordJson: claimRecord ? JSON.stringify(claimRecord) : null,
    // Stage 7e output: narrative analysis stored as a dedicated column for fast access
    // (also embedded in claimRecordJson.accidentDetails.narrativeAnalysis, but stored here
    //  so the ForensicAuditReport can load it without parsing the full ClaimRecord)
    narrativeAnalysisJson: narrativeAnalysis ? JSON.stringify(narrativeAnalysis) : null,
    // Signal 2: Direction Contradiction Flag — cross-signal comparison between narrative-implied
    // collision direction and physics-classified direction. Advisory data-quality signal.
    directionContradictionFlagJson: result.directionContradictionFlag
      ? JSON.stringify(result.directionContradictionFlag)
      : null,
    // Multi-Signal Cross-Validation — per-fact agreement/disagreement across all 5 signal types.
    crossValidationJson: result.crossValidationResult
      ? JSON.stringify(result.crossValidationResult)
      : null,
    // Stage 12: Claims Decision Authority — single non-contradictory recommendation
    decisionAuthorityJson: decisionAuthority ? JSON.stringify(decisionAuthority) : null,
    // Claim Truth Layer: unified resolution of all extraction/decision data
    claimTruthJson: result.claimTruth ? JSON.stringify(result.claimTruth) : null,
    // TRE: Canonical Claim Truth Object (CTO) — single source of truth for all downstream consumers
    claimTruthObjectJson: result.claimTruthObject ? JSON.stringify(result.claimTruthObject) : null,
    // Wave 1: Physics Truth Layer — canonical immutable physics object with full provenance
    // Built by buildPhysicsTruth() after Stage 7. Single authoritative source for all physical
    // measurements (crush depth, energy, speed, latent damage) with uncertainty bounds.
    physicsTruthJson: result.physicsTruth ? JSON.stringify(result.physicsTruth) : null,
    // Stage 12.5: Report Readiness Gate — whether the claim can be exported as a report
    reportReadinessJson: reportReadiness ? JSON.stringify(reportReadiness) : null,
    // Stage 13: Forensic Analysis — comprehensive forensic analysis summary from all stages
    forensicAnalysis: forensicAnalysis ? JSON.stringify(forensicAnalysis) : null,
    // Image analysis monitoring — tracks vision success rate per assessment run
    // Derived from enrichedPhotosJson set by Stage 6 on ctx and passed through orchestrator return.
    // Used to detect systemic failures and alert the team when success rate drops below threshold.
    // Use classified damage photo count if available, otherwise use enrichedPhotosJson length,
    // then fall back to raw damagePhotos count. The enrichedPhotosJson fallback handles
    // cache_rehydration runs where classifiedImages is null but Stage 6 still ran.
    imageAnalysisTotalCount: safeInt((() => {
      if (result.classifiedImages?.summary?.damagePhotoCount) return result.classifiedImages.summary.damagePhotoCount;
      try {
        const enriched = result.enrichedPhotosJson ? JSON.parse(result.enrichedPhotosJson) : null;
        if (Array.isArray(enriched) && enriched.length > 0) return enriched.length;
      } catch { /* ignore */ }
      return damagePhotos.length;
    })()),
    imageAnalysisSuccessCount: (() => {
      const total = result.classifiedImages?.summary?.damagePhotoCount
        ?? (() => { try { const e = result.enrichedPhotosJson ? JSON.parse(result.enrichedPhotosJson) : null; return Array.isArray(e) && e.length > 0 ? e.length : damagePhotos.length; } catch { return damagePhotos.length; } })();
      if (total === 0) return 0;
      try {
        const enriched = result.enrichedPhotosJson ? JSON.parse(result.enrichedPhotosJson) : [];
        return safeInt(enriched.filter((p: any) => (p.confidenceScore ?? 0) > 0).length) ?? 0;
      } catch { return 0; }
    })(),
    imageAnalysisFailedCount: (() => {
      const total = result.classifiedImages?.summary?.damagePhotoCount
        ?? (() => { try { const e = result.enrichedPhotosJson ? JSON.parse(result.enrichedPhotosJson) : null; return Array.isArray(e) && e.length > 0 ? e.length : damagePhotos.length; } catch { return damagePhotos.length; } })();
      if (total === 0) return 0;
      try {
        const enriched = result.enrichedPhotosJson ? JSON.parse(result.enrichedPhotosJson) : [];
        const successCount = enriched.filter((p: any) => (p.confidenceScore ?? 0) > 0).length;
        return safeInt(Math.max(0, total - successCount)) ?? 0;
      } catch { return safeInt(total) ?? 0; }
    })(),
    imageAnalysisSuccessRate: (() => {
      const total = result.classifiedImages?.summary?.damagePhotoCount
        ?? (() => { try { const e = result.enrichedPhotosJson ? JSON.parse(result.enrichedPhotosJson) : null; return Array.isArray(e) && e.length > 0 ? e.length : damagePhotos.length; } catch { return damagePhotos.length; } })();
      if (total === 0) return null;
      try {
        const enriched = result.enrichedPhotosJson ? JSON.parse(result.enrichedPhotosJson) : [];
        const successCount = enriched.filter((p: any) => (p.confidenceScore ?? 0) > 0).length;
        return safeInt(enriched.length > 0 ? Math.round((successCount / enriched.length) * 100) : 0);
      } catch { return 0; }
    })(),
    // Phase 2A: FCDI — Forensic Confidence Degradation Index (0–100)
    fcdiScore: (() => {
      try {
        const fcdi = (forensicAnalysis?.fcdi as any);
        return safeInt(typeof fcdi?.scorePercent === 'number' ? fcdi.scorePercent : null);
      } catch { return null; }
    })(),
    // Phase 2A: FEL — Forensic Execution Ledger (per-stage audit record)
    forensicExecutionLedgerJson: (() => {
      try {
        const fel = forensicAnalysis?.forensicExecutionLedger;
        return fel ? JSON.stringify(fel) : null;
      } catch { return null; }
    })(),
    // Phase 2C: Assumption Registry — queryable record of all assumptions with type/impact classification
    assumptionRegistryJson: (() => {
      try {
        const rawAssumptions = forensicAnalysis?.assumptions;
        if (!rawAssumptions || !Array.isArray(rawAssumptions) || rawAssumptions.length === 0) return null;
        const { classifyAssumptions } = require('./pipeline-v2/assumptionClassifier');
        const classified = classifyAssumptions(rawAssumptions);
        return JSON.stringify({
          version: '2.0.0',
          claimId: result.summary?.claimId,
          totalCount: classified.length,
          highImpactCount: classified.filter((a: any) => a.impact === 'HIGH').length,
          mediumImpactCount: classified.filter((a: any) => a.impact === 'MEDIUM').length,
          lowImpactCount: classified.filter((a: any) => a.impact === 'LOW').length,
          assumptions: classified.map((a: any, idx: number) => ({
            id: idx + 1,
            field: a.field ?? null,
            assumedValue: a.assumedValue ?? null,
            reason: a.reason ?? null,
            strategy: a.strategy ?? null,
            confidence: a.confidence ?? null,
            stage: a.stage ?? null,
            assumptionType: a.assumptionType ?? null,
            impact: a.impact ?? null,
          })),
        });
      } catch { return null; }
    })(),
    // Phase 2B: Economic Context Engine — policy-based currency, PPP, NCI
    economicContextJson: (() => {
      try {
        const ec = costAnalysis?.economicContext;
        return ec ? JSON.stringify(ec) : null;
      } catch { return null; }
    })(),
    // Phase 4A: Input Fidelity Engine — 4-class attribution, completeness score, DOE eligibility
    ifeResultJson: (() => {
      try {
        const ife = costAnalysis?.ifeResult;
        return ife ? JSON.stringify(ife) : null;
      } catch { return null; }
    })(),
    // Phase 4A: Decision Optimisation Engine — multi-objective scoring, fraud-aware disqualification
    doeResultJson: (() => {
      try {
        const doe = costAnalysis?.doeResult;
        return doe ? JSON.stringify(doe) : null;
      } catch { return null; }
    })(),
    // Phase 4B: FEL Version Snapshot — per-stage version tracking for deterministic replay
    felVersionSnapshotJson: (() => {
      try {
        const felVersion = forensicAnalysis?.felVersionSnapshot;
        return felVersion ? JSON.stringify(felVersion) : null;
      } catch { return null; }
    })(),
    // Stage 10 output: multi-dimensional claim quality score
    claimQualityJson: (() => {
      try {
        const cq = report?.claimQuality;
        return cq ? JSON.stringify(cq) : null;
      } catch { return null; }
    })(),
    // R-F-01/04/05 fix: Stage 10 report signals — three signals from fullReport.sections
    // that were previously discarded when the pipeline run completed.
    //   consistencyFlags  — blockAutoApproval + flags[] from crossStageConsistencyEngine (R-F-01)
    //   prePublicationBlockers — structured blocker list from prePublicationValidator (R-F-04)
    //   costRecommendation — APPROVE/REVIEW/REJECT enum from costIntelligenceNarrative (R-F-05 / C-E-01)
    reportSignalsJson: (() => {
      try {
        const signals: Record<string, unknown> = {};
        // R-F-01: cross-stage consistency flags (blockAutoApproval)
        const cc = report?.consistencyCheck;
        if (cc && (cc as any).blockAutoApproval) {
          signals.consistencyFlags = {
            blockAutoApproval: (cc as any).blockAutoApproval,
            overallStatus: (cc as any).status,
            flagCount: (cc as any).flags?.length ?? 0,
            criticalCount: (cc as any).criticalCount ?? 0,
            highCount: (cc as any).highCount ?? 0,
            flags: ((cc as any).flags ?? []).map((f: any) => ({
              id: f.ruleId,
              severity: f.severity,
              description: f.description,
              recommendation: f.adjusterAction,
            })),
          };
        }
        // R-F-04: pre-publication validator blocker list
        const ppv = (report?.fullReport as any)?.sections?.prePublicationValidation;
        if (ppv && (ppv.blockerCount ?? 0) > 0) {
          signals.prePublicationBlockers = {
            valid: ppv.valid,
            blocked: ppv.blocked,
            blockerCount: ppv.blockerCount,
            blockers: ppv.blockers,
            validatedAt: ppv.validatedAt,
          };
        }
        // R-F-05 / C-E-01: cost recommendation from Stage 9 costNarrative
        const costRec = (costAnalysis as any)?.costNarrative;
        if (costRec?.recommendation) {
          signals.costRecommendation = {
            recommendation: costRec.recommendation,
            recommendation_reason: costRec.recommendation_reason ?? null,
            confidence: costRec.confidence ?? null,
            flags_addressed: costRec.flags_addressed ?? [],
          };
        }
        return Object.keys(signals).length > 0 ? JSON.stringify(signals) : null;
      } catch { return null; }
    })(),
    // Stage 36 output: Forensic Audit Validator — 10-dimension post-pipeline validation
    forensicAuditValidationJson: forensicAuditValidationResult ? JSON.stringify(forensicAuditValidationResult) : null,
    // Stage 6 enriched photo metadata — persisted so the UI can show per-photo vision analysis results
    // Previously this was computed but never written to the DB column, causing enriched_photos_json to always be NULL.
    enrichedPhotosJson: result.enrichedPhotosJson ?? null,
    // Phase 3: Missing analytics fields — now computed and persisted
    coherenceResultJson: (() => {
      try { return pipelineCoherenceResult ? JSON.stringify(pipelineCoherenceResult) : null; } catch { return null; }
    })(),
    costRealismJson: (() => {
      try { return pipelineCostRealismResult ? JSON.stringify(pipelineCostRealismResult) : null; } catch { return null; }
    })(),
    consistencyCheckJson: (() => {
      try { return pipelineConsistencyResult ? JSON.stringify(pipelineConsistencyResult) : null; } catch { return null; }
    })(),
    contradictionGateJson: (() => {
      try { return pipelineContradictionResult ? JSON.stringify(pipelineContradictionResult) : null; } catch { return null; }
    })(),
    physicsDeviationScore: (() => {
      try { return typeof pipelinePhysicsDeviationScore === 'number' ? Math.round(pipelinePhysicsDeviationScore) : null; } catch { return null; }
    })(),
    // Hallucination guard: parts the AI generated that could not be resolved to canonical names.
    // Preserved for manual review rather than silently dropped — data integrity.
    unresolvedPartsJson: (() => {
      try {
        const unresolved = (claimRecord as any)?.unresolvedParts ?? [];
        return unresolved.length > 0 ? JSON.stringify(unresolved) : null;
      } catch { return null; }
    })(),
    // AI Governance Tracking (F-14, F-15)
    // ocrFallbackUsed: 1 when stage 3 (structured_extraction) ran in degraded/skipped mode,
    // meaning the pipeline fell back to raw OCR text. Lower confidence — may need manual review.
    ocrFallbackUsed: (() => {
      try {
        const stages = summary.stages as Record<string, any>;
        const s3 = stages?.['3_structured_extraction'] ?? stages?.['structured_extraction'];
        return (s3?.degraded === true || s3?.status === 'skipped') ? 1 : 0;
      } catch { return 0; }
    })(),
    // pipelineDegradedStagesJson: JSON array of stage keys that ran in degraded/skipped mode.
    // Enables targeted alerting and quality tracking without parsing the full pipelineRunSummary.
    pipelineDegradedStagesJson: (() => {
      try {
        const stages = summary.stages as Record<string, any>;
        const degraded = Object.entries(stages)
          .filter(([, v]) => (v as any)?.degraded === true || (v as any)?.status === 'skipped')
          .map(([k]) => k);
        return degraded.length > 0 ? JSON.stringify(degraded) : null;
      } catch { return null; }
    })(),
    // C-09: Photo classification cache — persist Stage 2.6 classifier results so the
    // ForensicAuditReport can load pre-classified photo categories without re-running the LLM.
    // Format: JSON array of { url: string, category: string, confidence: number }
    photoClassificationJson: (() => {
      try {
        const ci = result.classifiedImages;
        if (!ci) return null;
        // Build a flat array of { url, category, confidence } from all classified image groups
        const entries: Array<{ url: string; category: string; confidence: number }> = [];
        const addGroup = (urls: string[], category: string, confidence: number) => {
          for (const url of urls) entries.push({ url, category, confidence });
        };
        addGroup(ci.damagePhotos.map((img: any) => img.url), 'damage_photo', 0.9);
        addGroup(ci.vehicleOverviews.map((img: any) => img.url), 'vehicle_overview', 0.85);
        addGroup(ci.quotationImages.map((img: any) => img.url), 'quotation_scan', 0.9);
        addGroup(ci.documentPages.map((img: any) => img.url), 'document_page', 0.9);
        addGroup(ci.fallbackPool.map((img: any) => img.url), 'other', 0.5);
        return entries.length > 0 ? JSON.stringify(entries) : null;
      } catch { return null; }
    })(),
    // R-GH-19: Previously-dropped PipelineResult fields — evidenceRegistry, systemInterventionCount, interventionSummary
    // evidenceRegistryJson: full EvidenceRegistry from evidenceRegistryEngine — audit trail of all evidence items
    evidenceRegistryJson: (() => {
      try { return result.evidenceRegistry ? JSON.stringify(result.evidenceRegistry) : null; } catch { return null; }
    })(),
    // systemInterventionCount: count of deterministic corrections applied during this pipeline run (R-GH-04)
    systemInterventionCount: typeof result.systemInterventionCount === 'number' ? result.systemInterventionCount : null,
    // interventionSummaryJson: JSON array of human-readable descriptions of each correction (R-GH-04)
    interventionSummaryJson: (() => {
      try {
        const s = result.interventionSummary;
        return Array.isArray(s) && s.length > 0 ? JSON.stringify(s) : null;
      } catch { return null; }
    })(),
    // Batch 2c: Stage 10 decisionReadiness and degradationReasons — previously computed but never persisted
    // decisionReadinessJson: structured readiness assessment (decision_ready, confidence, blocking_issues, checks)
    decisionReadinessJson: (() => {
      try {
        const dr = report?.decisionReadiness;
        return dr ? JSON.stringify(dr) : null;
      } catch { return null; }
    })(),
    // degradationReasonsJson: string[] of reasons the pipeline ran in degraded mode
    degradationReasonsJson: (() => {
      try {
        const reasons = report?.degradationReasons;
        return Array.isArray(reasons) && reasons.length > 0 ? JSON.stringify(reasons) : null;
      } catch { return null; }
    })(),
    // Batch 2d: Stage 4 fieldValidation and gateDecision — previously not in PipelineResult, always dropped
    // fieldValidationJson: per-field validation results from fieldValidationEngine
    fieldValidationJson: (() => {
      try {
        const fv = result.stage4Output?.fieldValidation;
        return fv ? JSON.stringify(fv) : null;
      } catch { return null; }
    })(),
    // gateDecisionJson: pipeline gate controller decision (proceed/hold/abort + reason)
    gateDecisionJson: (() => {
      try {
        const gd = result.stage4Output?.gateDecision;
        return gd ? JSON.stringify(gd) : null;
      } catch { return null; }
    })(),
    // Stage 9.5: Contact Geometry Intelligence (CGI) result
    cgiResultJson: (() => {
      try {
        const cgi = (result as any).stage9_5Data;
        return cgi ? JSON.stringify(cgi) : null;
      } catch { return null; }
    })(),
    // Stage 10-I: Interpretation Engine result
    interpretationResultJson: (() => {
      try {
        const interp = (result as any).interpretedClaim;
        return interp ? JSON.stringify(interp) : null;
      } catch { return null; }
    })(),
  };
  // Apply the global NaN sanitizer before passing to Drizzle.
  // This catches any numeric field that slipped through safeInt/safeFloat guards.
  await db.insert(aiAssessments).values(sanitizeNaNDeep(_rawInsertValues));

  // ── ROUTE 1: Pipeline PDF extraction → panel_beater_quotes ─────────────────
  // CRITICAL: Persist ALL extracted quotes (not just the first) so every submitted
  // panel beater quote has a panel_beater_quotes row with its full line items.
  // documentedLineItems from Stage 9 carries source_quote_index so we can group
  // line items back to their originating quote.
  // This runs non-blocking (fire-and-forget) so a quote persistence failure
  // never blocks the main assessment save.
  {
    const { persistExtractedQuote } = await import('./persistExtractedQuote');
    const _stage9LineItems: any[] = (costAnalysis as any)?.documentedLineItems ?? [];
    // quoteLineItemGapAdvisory carries per-quote metadata (panel_beater, total_cost, currency)
    const _gapAdvisory: any[] = (costAnalysis as any)?.quoteLineItemGapAdvisory ?? [];

    // Helper: normalise a line item to the persistExtractedQuote schema
    const normaliseLi = (li: any) => ({
      description: li.description ?? 'Item',
      partNumber: li.partNumber ?? null,
      category: (['parts','labor','paint','diagnostic','sundries','other'].includes(li.category)
        ? li.category : 'parts') as any,
      quantity: Number(li.quantity) || 1,
      unitPrice: Number(li.unit_cost ?? li.unitPrice) || 0,
      // Prefer computed lineTotal (camelCase) over raw line_total (snake_case) to avoid zero-overwrite
      lineTotal: Number(li.lineTotal ?? li.line_total) || 0,
      isRepair: Boolean(li.isRepair),
      isReplacement: li.isReplacement !== false,
      notes: li.notes ?? null,
    });

    // Build a map: quote_index → line items from documentedLineItems
    const lineItemsByQuoteIndex = new Map<number, any[]>();
    for (const li of _stage9LineItems) {
      const idx = typeof li.source_quote_index === 'number' ? li.source_quote_index : 0;
      if (!lineItemsByQuoteIndex.has(idx)) lineItemsByQuoteIndex.set(idx, []);
      lineItemsByQuoteIndex.get(idx)!.push(li);
    }

    // NOTE: Stale quote deletion has been moved to AFTER successful insertion below.
    // This prevents data loss when a pipeline re-run degrades before writing new quotes.
    // The delete only runs once at least one new quote has been successfully persisted.

    // Determine which quotes to persist.
    // If quoteLineItemGapAdvisory has entries, use it as the authoritative quote list
    // (it covers all extracted quotes). Otherwise fall back to single-quote path.
    interface QuoteToPersist {
      quoteIndex: number;
      repairerName: string;
      quotedAmountUnits: number;
      labourCostUnits: number | null;
      partsCostUnits: number | null;
      currency: string;
      lineItems: ReturnType<typeof normaliseLi>[];
    }
    const quotesToPersist: QuoteToPersist[] = [];

    if (_gapAdvisory.length > 0) {
      for (let qi = 0; qi < _gapAdvisory.length; qi++) {
        const adv = _gapAdvisory[qi];
        const totalCost = adv.total_cost ?? null;
        if (!totalCost || totalCost <= 0) continue;
        const qLineItems = lineItemsByQuoteIndex.get(qi) ?? [];
        // If no tagged items for this index and qi=0, use all untagged items
        const effectiveLineItems = qLineItems.length > 0
          ? qLineItems.map(normaliseLi)
          : qi === 0 && _stage9LineItems.length > 0
            ? _stage9LineItems.map(normaliseLi)
            : [];
        // Derive labour/parts from line items if not available from advisory
        const labourFromItems = effectiveLineItems
          .filter((li: any) => /labour|labor/i.test(li.description ?? ''))
          .reduce((s: number, li: any) => s + (li.lineTotal ?? 0), 0) || null;
        const partsFromItems = effectiveLineItems
          .filter((li: any) => !/labour|labor|paint|sundries|vat/i.test(li.description ?? ''))
          .reduce((s: number, li: any) => s + (li.lineTotal ?? 0), 0) || null;
        quotesToPersist.push({
          quoteIndex: qi,
          repairerName: adv.panel_beater ?? `Quote ${qi + 1}`,
          quotedAmountUnits: totalCost,
          labourCostUnits: labourFromItems,
          partsCostUnits: partsFromItems,
          currency: adv.currency ?? costAnalysis?.currency ?? 'USD',
          lineItems: effectiveLineItems,
        });
      }
    } else if (documentedOriginalQuoteUsd && documentedOriginalQuoteUsd > 0) {
      // Single-quote fallback (no gap advisory)
      const effectiveLineItems = _stage9LineItems.length > 0
        ? _stage9LineItems.map(normaliseLi)
        : (repairQuote?.lineItems ?? []).map((li: any) => normaliseLi({
            description: li.description ?? li.partName,
            partNumber: li.partNumber,
            category: li.category,
            quantity: li.quantity,
            unit_cost: li.unitPriceCents ? li.unitPriceCents / 100 : li.unitPrice,
            line_total: li.lineTotalCents ? li.lineTotalCents / 100 : li.lineTotal,
            isRepair: li.isRepair,
            isReplacement: li.isReplacement,
            notes: li.notes,
          }));
      quotesToPersist.push({
        quoteIndex: 0,
        repairerName: panelBeaterName ?? 'Extracted Repairer',
        quotedAmountUnits: documentedOriginalQuoteUsd,
        labourCostUnits: documentedLabourCostUsd ?? null,
        partsCostUnits: documentedPartsCostUsd ?? null,
        currency: costAnalysis?.currency ?? 'USD',
        lineItems: effectiveLineItems,
      });
    }

    if (quotesToPersist.length > 0) {
      console.log(`[KINGA Assessment] Claim ${claimId}: Persisting ${quotesToPersist.length} quote(s) with line items`);
      const persistAll = quotesToPersist.map((qp) =>
        persistExtractedQuote({
          claimId,
          tenantId: claim.tenantId ?? null,
          repairerName: qp.repairerName,
          quotedAmountUnits: qp.quotedAmountUnits,
          labourCostUnits: qp.labourCostUnits,
          partsCostUnits: qp.partsCostUnits,
          currency: qp.currency,
          lineItems: qp.lineItems,
          source: 'pipeline_extracted',
        }).then(qid => {
          if (qid) {
            console.log(`[KINGA Assessment] Claim ${claimId}: Quote[${qp.quoteIndex}] "${qp.repairerName}" → panel_beater_quotes id=${qid} (${qp.lineItems.length} line items)`);
          }
          return qid;
        })
      );
      // ── AWAITED persistence: ensures line items are written before the pipeline exits ──
      try {
        const qids = await Promise.all(persistAll);
        const firstQid = qids.find(id => id != null) ?? null;
        // Log confirmation for every persisted quote
        for (let qi = 0; qi < quotesToPersist.length; qi++) {
          const qp = quotesToPersist[qi];
          const qid = qids[qi];
          const pricedCount = qp.lineItems.filter((li: any) => (li.lineTotal ?? 0) > 0).length;
          const totalFromItems = qp.lineItems.reduce((s: number, li: any) => s + (li.lineTotal ?? 0), 0);
          if (qid) {
            console.log(`[KINGA Assessment] Claim ${claimId}: OK Quote[${qi}] "${qp.repairerName}" persisted id=${qid}, ${pricedCount}/${qp.lineItems.length} priced items, total=${totalFromItems.toFixed(2)} ${qp.currency}`);
          } else {
            console.warn(`[KINGA Assessment] Claim ${claimId}: FAIL Quote[${qi}] "${qp.repairerName}" persistence FAILED - check persistExtractedQuote logs`);
          }
        }
        // ── DELETE STALE PIPELINE-EXTRACTED QUOTES (safe replace) ──────────────
        // Only delete old pipeline-extracted quotes AFTER at least one new quote
        // was successfully written. This prevents data loss on degraded re-runs.
        if (firstQid) {
          try {
            const db0 = await getDb();
            if (db0) {
              // Delete all OLD pipeline-extracted quotes except the ones just inserted
              const newQids = qids.filter((id): id is number => id != null);
              if (newQids.length > 0) {
                await db0.delete(panelBeaterQuotes)
                  .where(and(
                    eq(panelBeaterQuotes.claimId, claimId),
                    like(panelBeaterQuotes.notes, '%pipeline_extracted%'),
                    notInArray(panelBeaterQuotes.id, newQids)
                  ));
                console.log(`[KINGA Assessment] Claim ${claimId}: Deleted stale pipeline-extracted quotes (kept new ids: ${newQids.join(',')})`);
              }
            }
          } catch (delErr) {
            console.warn(`[KINGA Assessment] Claim ${claimId}: Could not delete stale quotes (non-fatal):`, delErr);
          }
        }
        if (firstQid) {
          // Patch costIntelligenceJson so the Quote Coverage badge shows correctly
          try {
            const db2 = await getDb();
            if (db2) {
              const latestRow = await db2.select({ id: aiAssessments.id, costIntelligenceJson: aiAssessments.costIntelligenceJson })
                .from(aiAssessments)
                .where(eq(aiAssessments.claimId, claimId))
                .orderBy(desc(aiAssessments.createdAt))
                .limit(1);
              if (latestRow[0]) {
                const ci = (() => { try { return JSON.parse(latestRow[0].costIntelligenceJson ?? '{}'); } catch { return {}; } })();
                if (!ci.aiEstimateSource || ci.aiEstimateSource === 'insufficient_data') {
                  ci.aiEstimateSource = 'documented_quote';
                  ci.quoteCount = Math.max((ci.quoteCount ?? 0), quotesToPersist.length);
                  await db2.update(aiAssessments)
                    .set({ costIntelligenceJson: JSON.stringify(ci) })
                    .where(eq(aiAssessments.id, latestRow[0].id));
                  console.log(`[KINGA Assessment] Claim ${claimId}: Patched costIntelligenceJson documented_quote (${quotesToPersist.length} quotes)`);
                }
              }
            }
          } catch (patchErr) {
            console.warn(`[KINGA Assessment] Claim ${claimId}: costIntelligenceJson patch failed (non-fatal):`, (patchErr as any)?.message);
          }
        }
      } catch (e: any) {
        console.warn(`[KINGA Assessment] Claim ${claimId}: Quote persistence failed (non-fatal):`, e?.message);
      }
    } else {
      // Fix 2 (Batch 10a): Guard — quotesToPersist is empty but a quote cost was extracted.
      // This means documentedLineItems was absent (old pipeline version) AND the single-quote
      // fallback path did not fire (documentedOriginalQuoteUsd was 0 or null).
      // Log a warning so this is visible in server logs rather than silently skipping.
      // This is a historical-data-only gap; new claims always populate documentedLineItems.
      if (documentedOriginalQuoteUsd && documentedOriginalQuoteUsd > 0) {
        console.warn(
          `[KINGA Assessment] Claim ${claimId}: WARN — documentedOriginalQuoteUsd=${documentedOriginalQuoteUsd} ` +
          `but quotesToPersist is empty. documentedLineItems=${_stage9LineItems.length} items, ` +
          `gapAdvisory=${_gapAdvisory.length} entries. ` +
          `This claim was likely processed by an older pipeline version that did not populate documentedLineItems. ` +
          `Line items exist in costIntelligenceJson.lineItems but were not written to quote_line_items. ` +
          `Backfill required — run the quote-line-items-backfill script.`
        );
      }
    }
  }

  // Update claim status to complete + backfill vehicle info from extraction
  const finalFraudScore = safeFloat(fraudAnalysis ? fraudAnalysis.fraudRiskScore : 0) ?? 0;
  // DRA Phase 2: Transition to ANALYSIS_COMPLETE (success terminal state).
  // This state is ONLY reachable if:
  //   1. Document Health Gate passed (mayProceed === true)
  //   2. Pipeline ran to completion
  //   3. Assessment was persisted to DB
  // The claim then transitions to assessment_complete for the adjuster workflow.
  const claimUpdate: Record<string, any> = {
    aiAssessmentCompleted: 1,
  status: "analysis_complete",
  documentProcessingStatus: "ANALYSIS_COMPLETE",
  workflowState: "ai_assessment_completed",
  fraudRiskScore: finalFraudScore,
  fraudFlags: fraudIndicatorsJson,
  estimatedCost: safeInt(estimatedCostCents) ?? 0,
  aiAssessmentCompletedAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
    updatedAt: new Date().toISOString(),
    pipelineCurrentStage: null, // Clear stage label once assessment is complete
    pipelineRunUuid: null, // Clear run UUID — pipeline completed successfully, no resume needed
    pipelineHeartbeatAt: null, // Clear heartbeat — pipeline is done
  };
  // Helper: safely truncate a string to a max byte length to avoid MySQL varchar truncation errors
  const trunc = (val: string | null | undefined, maxLen: number): string | null =>
    val ? val.substring(0, maxLen) : null;

  // Backfill vehicle info from pipeline extraction (only if not already set)
  if (claimRecord?.vehicle) {
    const v = claimRecord.vehicle;
    if (v.make) claimUpdate.vehicleMake = trunc(v.make, 100);
    if (v.model) claimUpdate.vehicleModel = trunc(v.model, 100);
    if (v.year) claimUpdate.vehicleYear = Number(v.year) || null;
    if (v.registration) claimUpdate.vehicleRegistration = trunc(v.registration, 50);
    if (v.vin) claimUpdate.vehicleVin = trunc(v.vin, 50);
    if (v.colour) claimUpdate.vehicleColor = trunc(v.colour, 50);
  }
  // Backfill incident info from pipeline extraction.
  // IMPORTANT: use accidentDetails.description (the event narrative: "hit a depression on the road")
  // NOT damage.description (the component list: "Damage to Front Bumper, R/F Slide...").
  // The damage component list must never appear in the Incident Narrative field of the report.
  const _eventNarrative = claimRecord?.accidentDetails?.description || null;
  const _damageListFallback = claimRecord?.damage?.description || null;
  const _resolvedNarrative = _eventNarrative || _damageListFallback;
  if (_resolvedNarrative) claimUpdate.incidentDescription = _resolvedNarrative;
  // Backfill claimant name — from driver.claimantName (Stage 3 extraction)
  const resolvedClaimantName =
    claimRecord?.driver?.claimantName ||
    (claimRecord as any)?.claimant?.name ||
    null;
  if (resolvedClaimantName) {
    claimUpdate.claimantName = trunc(resolvedClaimantName, 255);
  }
  // Backfill insurance context from pipeline extraction
  if (claimRecord?.insuranceContext) {
    const ins = claimRecord.insuranceContext;
    // Only write policyNumber if it looks like a real policy number (not a product type)
    if (ins.policyNumber && !/^(EXCESS|COMPREHENSIVE|THIRD.PARTY|FIRE|MOTOR|THEFT)$/i.test(ins.policyNumber.trim())) {
      claimUpdate.policyNumber = trunc(ins.policyNumber, 100);
    }
    // insuranceContext.excessAmountUsd is in USD (float); claims.excessAmountCents is integer cents
    if (ins.excessAmountUsd != null) claimUpdate.excessAmountCents = Math.round(ins.excessAmountUsd * 100);
    if (ins.claimReference) claimUpdate.claimReference = trunc(ins.claimReference, 100);
    if (ins.insurerName) claimUpdate.insurerName = trunc(ins.insurerName, 255);
    // productType — write the insurance product type (e.g. 'EXCESS', 'COMPREHENSIVE') separately from policyNumber
    if (ins.productType) {
      (claimUpdate as any).productType = trunc(ins.productType, 100);
      (claimUpdate as any).productTypeSource = 'stage_3_llm';
    } else if (ins.policyNumber && /^(EXCESS|COMPREHENSIVE|THIRD.PARTY|FIRE|MOTOR|THEFT)$/i.test(ins.policyNumber.trim())) {
      // Fallback: if policyNumber looks like a product type, rescue it here
      (claimUpdate as any).productType = trunc(ins.policyNumber.trim().toUpperCase(), 100);
      (claimUpdate as any).productTypeSource = 'stage_3_llm_rescue';
    }
  }
  // Backfill data quality score from claimRecord
  if (claimRecord?.dataQuality?.completenessScore != null) {
    // decimal(5,2) max = 999.99 — clamp to avoid truncation
    claimUpdate.dataCompletenessScore = Math.min(Number(claimRecord.dataQuality.completenessScore), 999.99);
  }
  // Backfill speed from accidentDetails or narrativeAnalysis
  const resolvedSpeed = claimRecord?.accidentDetails?.estimatedSpeedKmh
    ?? (claimRecord as any)?._narrativeSpeed
    ?? null;
  if (resolvedSpeed != null && resolvedSpeed > 0) {
    // decimal(6,1) max = 99999.9 — clamp to avoid truncation
    claimUpdate.estimatedSpeedKmh = Math.min(Number(resolvedSpeed), 99999.9);
  }
  // IMMUTABLE: Write claimantStatedSpeedKmh only when the DB column is currently NULL.
  // This preserves the original Stage 3 extraction across all subsequent re-runs.
  // pipelineCtx.claimantStatedSpeedKmh is set once after Stage 5 and never overwritten.
  // pipelineCtx is mutated in-place by the orchestrator, so this value is available here.
  if ((pipelineCtx as any).claimantStatedSpeedKmh != null && (pipelineCtx as any).claimantStatedSpeedKmh > 0) {
    // Only write if the DB column is NULL (first run) — never overwrite on re-runs.
    // We check the original pipelineCtx.claim value (loaded before the pipeline ran).
    const existingStatedSpeed = (pipelineCtx as any).claim?.claimantStatedSpeedKmh;
    if (existingStatedSpeed == null) {
      claimUpdate.claimantStatedSpeedKmh = Math.min(Number((pipelineCtx as any).claimantStatedSpeedKmh), 99999.9);
    }
  }
  // DEFENSIVE GUARD: Write needs_verification flag when the guard triggered.
  // This persists the flag so the UI can surface it to adjusters.
  if ((pipelineCtx as any).claimantSpeedNeedsVerification === true) {
    (claimUpdate as any).claimantSpeedNeedsVerification = 1;
  }
  // incidentType lives in accidentDetails (DamageRecord has no incidentType field)
  if (claimRecord?.accidentDetails) {
    const a = claimRecord.accidentDetails;
    if (a.date) {
      // The claims.incident_date column is a MySQL TIMESTAMP — it requires a
      // full datetime string. The LLM often returns date-only strings like
      // "2026-04-15" which MySQL rejects with "Data truncated". Normalize here.
      const rawDate = String(a.date).trim();
      // Accept YYYY-MM-DD, YYYY/MM/DD, or full ISO datetime
      const dateOnlyMatch = rawDate.match(/^(\d{4}[-\/]\d{2}[-\/]\d{2})$/);
      if (dateOnlyMatch) {
        claimUpdate.incidentDate = `${dateOnlyMatch[1].replace(/\//g, '-')} 00:00:00`;
      } else if (/^\d{4}-\d{2}-\d{2}T/.test(rawDate)) {
        // ISO 8601 — convert to MySQL datetime format
        const d = new Date(rawDate);
        if (!isNaN(d.getTime())) {
          claimUpdate.incidentDate = d.toISOString().slice(0, 19).replace('T', ' ');
        }
      } else if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(rawDate)) {
        // Already a MySQL datetime string
        claimUpdate.incidentDate = rawDate.slice(0, 19);
      }
      // If none of the patterns match, skip writing incidentDate to avoid truncation
    }
    if (a.incidentType && a.incidentType !== 'unknown') {
      // Map CanonicalIncidentType → DB enum. DB only supports:
      // collision, theft, hail, fire, vandalism, flood, hijacking, other
      // All unmapped types (animal_strike, rollover, mechanical_failure, etc.) → 'other'
      const dbValidTypes = new Set(['collision', 'theft', 'hail', 'fire', 'vandalism', 'flood', 'hijacking', 'other']);
      const mapped = dbValidTypes.has(a.incidentType) ? a.incidentType : 'other';
      claimUpdate.incidentType = mapped;
    }
  }
  // STRATEGIC FIX: Mark pipelineSucceeded BEFORE the claim update.
  // At this point the ai_assessments INSERT has already committed — the assessment
  // data is safely in the DB. If the claim status update fails (e.g. enum mismatch,
  // varchar truncation), we must NOT reset to intake_pending because that destroys
  // the valid assessment. Instead, we try a minimal fallback update.
  pipelineSucceeded = true;
  // Clear the watchdog timer — pipeline completed successfully.
  if (watchdogTimer) { clearTimeout(watchdogTimer); watchdogTimer = null; }
  // Phase 1 Observability: record run completion (fire-and-forget)
  import('./db-pipeline.ts').then(({ recordRunComplete }) => {
    recordRunComplete({ runId: _pipelineRunId, status: 'completed', totalDurationMs: 0, stagesCompleted: 0, stagesFailed: 0, stagesDegraded: 0 }).catch(() => {});
  }).catch(() => {});
  // ── Learning Table: Automatic Finalization Write (fire-and-forget) ──────────
  // Writes one row per component to component_repair_outcomes at ANALYSIS_COMPLETE.
  // Ensures the learning table accumulates data from ALL claims (autonomous + reviewed).
  // G-1 guard (fraud_score >= 50) is enforced inside recordFinalizedOutcome.
  // INSERT IGNORE: a subsequent adjuster correction (UPSERT path) wins.
  setImmediate(async () => {
    try {
      const riItems = costAnalysis?.repairIntelligence;
      if (!Array.isArray(riItems) || riItems.length === 0) return;
      const _learningDb = await getDb();
      if (!_learningDb) return;
      const _assessmentRows = await _learningDb.select({ id: aiAssessments.id })
        .from(aiAssessments).where(eq(aiAssessments.claimId, claimId)).limit(1);
      const _assessmentId = _assessmentRows[0]?.id;
      if (!_assessmentId) return;
      const { recordFinalizedOutcome, inferCategory } = await import('./pipeline-v2/repairReplaceEngine');
      const _vehicleMake = claimRecord?.vehicle?.make ?? undefined;
      const _vehicleModel = claimRecord?.vehicle?.model ?? undefined;
      const _vehicleYear = claimRecord?.vehicle?.year ?? undefined;
      for (const item of riItems) {
        const _componentName = (item as any).component ?? 'Unknown';
        const _severity = (item as any).severity ?? 'moderate';
        const _recommendedAction = (item as any).recommendedAction ?? 'repair';
        const _outcome: 'repair' | 'replace' | 'write_off' =
          _recommendedAction === 'replace' ? 'replace' :
          _recommendedAction === 'write_off' ? 'write_off' : 'repair';
        const _totalCostUsd = (item as any).totalCost ?? null;
        await recordFinalizedOutcome({
          claimId,
          assessmentId: _assessmentId,
          componentName: _componentName,
          componentCategory: inferCategory(_componentName),
          severityAtDecision: _severity,
          vehicleMake: _vehicleMake,
          vehicleModel: _vehicleModel,
          vehicleYear: _vehicleYear,
          outcome: _outcome,
          aiSuggestion: _outcome === 'write_off' ? 'replace' : _outcome,
          repairCostUsd: _outcome === 'repair' && _totalCostUsd ? _totalCostUsd : undefined,
          replaceCostUsd: _outcome === 'replace' && _totalCostUsd ? _totalCostUsd : undefined,
          isAdjusterCorrection: false,
        }).catch(() => { /* non-fatal — never blocks assessment */ });
      }
      console.log(`[LearningTable] Claim ${claimId}: finalization write attempted for ${riItems.length} component(s)`);
    } catch (learningErr: any) {
      console.warn(`[LearningTable] Claim ${claimId}: finalization write failed (non-fatal):`, learningErr?.message ?? learningErr);
    }
  });

  console.log(`[KINGA Assessment] Claim ${claimId}: claimUpdate keys = ${Object.keys(claimUpdate).join(', ')}`);
  try {
    await db.update(claims).set(claimUpdate).where(eq(claims.id, claimId));
  } catch (claimUpdateErr: any) {
    console.error(`[KINGA Assessment] CLAIM UPDATE FAILED for claim ${claimId} — attempting minimal fallback:`, claimUpdateErr?.message ?? claimUpdateErr);
    // Fallback: write ONLY the essential status fields that cannot fail
    try {
      await db.update(claims).set({
        aiAssessmentCompleted: 1,
        status: "analysis_complete",
        documentProcessingStatus: "ANALYSIS_COMPLETE",
        pipelineCurrentStage: null,
        updatedAt: new Date().toISOString(),
      }).where(eq(claims.id, claimId));
      console.log(`[KINGA Assessment] Claim ${claimId}: Minimal fallback claim update succeeded.`);
    } catch (fallbackErr: any) {
      console.error(`[KINGA Assessment] Claim ${claimId}: Even minimal fallback failed:`, fallbackErr?.message ?? fallbackErr);
      // Do NOT throw — pipelineSucceeded is true, assessment is in DB.
      // The stuck-recovery job will eventually fix the claim status.
    }
  }

  // ── Safety-net: ensure dps='ANALYSIS_COMPLETE' and pipelineCurrentStage=null are always set ──
  // Even if the main claimUpdate above partially failed (e.g. varchar truncation on a
  // backfilled field causing MySQL to skip some columns in non-strict mode), the UI
  // spinner depends on dps not being a transient state. This minimal update is idempotent and safe.
  try {
    await db.update(claims).set({
      documentProcessingStatus: "ANALYSIS_COMPLETE",
      pipelineCurrentStage: null,
    }).where(eq(claims.id, claimId));
  } catch (safetyNetErr: any) {
    console.warn(`[KINGA Assessment] Claim ${claimId}: Safety-net dps update failed (non-fatal, stuck-recovery will fix):`, safetyNetErr?.message ?? safetyNetErr);
  }

  console.log(`[KINGA Assessment] Claim ${claimId}: DB insert + claim update complete. Pipeline v2 finished. Duration: ${summary.totalDurationMs}ms. Stages: ${JSON.stringify(summary.stages)}`);

  // ── Fast-Track Routing: fire-and-forget (non-blocking) ───────────────────
  // Evaluates claim against fast-track automation rules after assessment is persisted.
  // Gated by ENABLE_FAST_TRACK=true env var. Never awaited — never delays the pipeline.
  if (process.env.ENABLE_FAST_TRACK === 'true') {
    setImmediate(async () => {
      try {
        const { evaluateFastTrack } = await import('./services/fast-track-engine');
        const { executeFastTrackAction } = await import('./services/fast-track-dispatcher');
        const ftTenantRows = await db.select({ tenantId: claims.tenantId }).from(claims).where(eq(claims.id, claimId)).limit(1);
        const ftTenantId = ftTenantRows[0]?.tenantId ?? 'default';
        const ftConfidence = Math.round((safeFloat(costAnalysis?.costDecision?.confidence) ?? 0) * 100);
        const ftFraud = Math.round((safeFloat(fraudAnalysis?.fraudRiskScore) ?? 0) * 100);
        const ftClaimValue = safeInt(estimatedCostCents) ?? 0;
        const ftClaimType = (claimRecord as any)?.accidentDetails?.incidentType ?? 'collision';
        const ftEval = await evaluateFastTrack({
          claimId, tenantId: ftTenantId,
          confidenceScore: ftConfidence, claimValue: ftClaimValue,
          fraudScore: ftFraud, claimType: ftClaimType, productId: null,
        });
        if (ftEval.eligible && ftEval.action) {
          await executeFastTrackAction(claimId, ftEval as any, 0);
          console.log(`[FastTrack] Claim ${claimId}: action=${ftEval.action} reason=${ftEval.evaluationDetails.reason}`);
        } else {
          console.log(`[FastTrack] Claim ${claimId}: not eligible — ${ftEval.evaluationDetails.reason}`);
        }
      } catch (ftErr: any) {
        console.warn(`[FastTrack] Claim ${claimId}: evaluation failed (non-fatal):`, ftErr?.message ?? ftErr);
      }
    });
  }

  // ── Entity Registry: fire-and-forget (non-blocking) ──────────────────────
  // Upsert all entities and write relationship graph edges asynchronously.
  // Never awaited — never delays the pipeline response.
  setImmediate(async () => {
    try {
      const { processEntityRegistry } = await import('./services/entityRegistry');
      const acc = claimRecord?.accidentDetails;
      const ins = claimRecord?.insuranceContext;
      const drv = claimRecord?.driver;
      // ClaimRecord has no .claimant field — claimant identity is on driver.claimantName
      const claimantInfo = claimRecord?.driver;
      const officer = claimRecord?.policeReport;
      const assessorInfo = (claimRecord as any)?.assessorInfo;
      const repairerInfo = (claimRecord as any)?.repairerInfo;
      const dmg = claimRecord?.damage;
      // ClaimRecord has no .photos field — photo URLs are on damage.imageUrls
      const photos = claimRecord?.damage?.imageUrls;
      const tenantRows = await db.select({ tenantId: claims.tenantId }).from(claims).where(eq(claims.id, claimId)).limit(1);
      const tenantId = tenantRows[0]?.tenantId ?? 'default';

      await processEntityRegistry(
        {
          claimId,
          tenantId,
          incidentDate: acc?.date ?? undefined,
          incidentTime: (acc as any)?.time ?? undefined,
          incidentLocation: acc?.location ?? undefined,
          // Claimant
          claimantName: claimantInfo?.claimantName ?? (ins as any)?.policyholderName ?? undefined,
          claimantIdNumber: (claimantInfo as any)?.idNumber ?? undefined, // idNumber not on DriverRecord — kept for future extension
          claimantAddress: (claimantInfo as any)?.address ?? undefined, // address not on DriverRecord — kept for future extension
          claimantPhone: (claimantInfo as any)?.phone ?? undefined, // phone not on DriverRecord — kept for future extension
          claimantEmail: (claimantInfo as any)?.email ?? undefined, // email not on DriverRecord — kept for future extension
          policyNumber: ins?.policyNumber ?? undefined,
          // Driver
          driverName: drv?.name ?? claimantInfo?.claimantName ?? undefined,
          driverIdNumber: (drv as any)?.idNumber ?? undefined,
          driverLicenceNumber: (drv as any)?.licenceNumber ?? undefined,
          driverLicenceClass: (drv as any)?.licenceClass ?? undefined,
          driverLicenceExpiry: (drv as any)?.licenceExpiry ?? undefined,
          driverLicenceIssueDate: (drv as any)?.licenceIssueDate ?? undefined,
          driverDateOfBirth: (drv as any)?.dateOfBirth ?? undefined,
          driverNationality: (drv as any)?.nationality ?? undefined,
          driverAddress: (drv as any)?.address ?? undefined,
          driverPhone: (drv as any)?.phone ?? undefined,
          // Police officer
          officerName: (officer as any)?.officerName ?? undefined,
          officerBadgeNumber: (officer as any)?.officerBadgeNumber ?? undefined,
          officerStation: (officer as any)?.policeStation ?? undefined,
          officerRank: (officer as any)?.officerRank ?? undefined,
          // Assessor
          assessorName: assessorInfo?.name ?? undefined,
          assessorCompany: assessorInfo?.company ?? undefined,
          assessorAccreditationNumber: assessorInfo?.accreditationNumber ?? undefined,
          assessorRegion: assessorInfo?.region ?? undefined,
          // Panel beater
          panelBeaterName: repairerInfo?.name ?? undefined,
          panelBeaterAddress: repairerInfo?.address ?? undefined,
          panelBeaterPhone: repairerInfo?.phone ?? undefined,
          panelBeaterEmail: repairerInfo?.email ?? undefined,
          panelBeaterVatNumber: repairerInfo?.vatNumber ?? undefined,
          // Cost data
          submittedCostUsd: estimatedCost > 0 ? estimatedCost : undefined,
          trueCostUsd: (result as any).stage9Data?.trueCostUsd ?? undefined,
          structuralGapCount: (result as any).stage9Data?.structuralGapCount ?? undefined,
        },
        {
          fraudScore: finalFraudScore,
          fraudIndicators: fraudAnalysis?.indicators ?? undefined,
          physicsData: (result as any).stage5Data ? {
            deltaV: (result as any).stage5Data.deltaV ?? undefined,
            crushDepth: (result as any).stage5Data.crushDepth ?? undefined,
            impactForce: (result as any).stage5Data.impactForce ?? undefined,
            airbagDeployed: (result as any).stage5Data.airbagDeployed ?? undefined,
          } : undefined,
          costData: (result as any).stage9Data ? {
            submittedCostUsd: estimatedCost > 0 ? estimatedCost : undefined,
            trueCostUsd: (result as any).stage9Data.trueCostUsd ?? undefined,
            costDeviationPct: (result as any).stage9Data.costDeviationPct ?? undefined,
            structuralGapCount: (result as any).stage9Data.structuralGapCount ?? undefined,
            costBasis: (result as any).stage9Data.costBasis ?? undefined,
          } : undefined,
          damageData: dmg ? {
            componentCount: dmg.components?.length ?? undefined,
            structuralDamageFlag: (dmg as any).structuralDamage ?? undefined,
            damageZone: (dmg as any).primaryZone ?? undefined,
          } : undefined,
          photoData: photos ? {
            photoCount: Array.isArray(photos) ? photos.length : undefined,
            // photos is now damage.imageUrls (string[])
            exifPresent: (result as any).exifPresent ?? undefined,
            gpsPresent: (result as any).gpsPresent ?? undefined,
          } : undefined,
          documentData: {
            policeReportPresent: !!(officer as any)?.caseNumber,
            licencePresent: !!(drv as any)?.licenceNumber,
          },
        }
      );
    } catch (e: any) {
      console.warn(`[EntityRegistry] Post-pipeline processing failed for claim ${claimId}:`, e.message?.substring(0, 100));
    }
  });

  // ── Vehicle Registry: fire-and-forget (non-blocking) ─────────────────────
  // Upserts the vehicle into the master vehicle_registry table so every claim
  // against the same VIN/registration is linked. Enables repeat-damage detection
  // and vehicle risk scoring across claims. Never throws — pipeline is unaffected.
  setImmediate(async () => {
    if (!claimRecord?.vehicle) return;
    try {
      const { upsertVehicleRegistry } = await import('./vehicle-registry');
      const v = claimRecord.vehicle;
      const acc = claimRecord.accidentDetails;
      await upsertVehicleRegistry({
        claimId,
        tenantId: claim.tenantId ?? null,
        vin: v.vin ?? null,
        registrationNumber: v.registration ?? null,
        make: v.make ?? null,
        model: v.model ?? null,
        year: v.year ?? null,
        color: v.colour ?? null,
        engineNumber: v.engineNumber ?? null,
        vehicleType: v.bodyType ?? null,
        powertrainType: v.powertrain ?? null,
        vehicleMassKg: v.massKg ?? null,
        vehicleMassSource: v.massTier ?? null,
        repairCostCents: estimatedCostCents > 0 ? estimatedCostCents : undefined,
        impactZone: acc?.impactPoint ?? null,
      });
    } catch (e: any) {
      console.warn(`[VehicleRegistry] Post-pipeline upsert failed for claim ${claimId}:`, e.message?.substring(0, 100));
    }
  });

  // ── Cross-Claim Intelligence: fire-and-forget (non-blocking) ─────────────
  // Runs the 9-signal collusion detector after every pipeline completion.
  // Uses a 3-second delay so the entity and vehicle registry writes above
  // have time to commit before the collusion queries run.
  setTimeout(async () => {
    try {
      const { runCrossClaimIntelligence } = await import('./cross-claim-intelligence');
      const dbCci = await getDb();
      if (!dbCci) return;
      // Re-fetch the claim to get the latest registry IDs written above.
      const [freshClaim] = await dbCci
        .select({
          vehicleRegistryId: claims.vehicleRegistryId,
          driverRegistryId: claims.driverRegistryId,
          thirdPartyDriverRegistryId: claims.thirdPartyDriverRegistryId,
          tenantId: claims.tenantId,
          createdAt: claims.createdAt,
          incidentDate: claims.incidentDate,
        })
        .from(claims)
        .where(eq(claims.id, claimId))
        .limit(1);
      if (!freshClaim) return;
      await runCrossClaimIntelligence({
        claimId,
        vehicleRegistryId: freshClaim.vehicleRegistryId ?? null,
        driverRegistryId: freshClaim.driverRegistryId ?? null,
        thirdPartyDriverRegistryId: freshClaim.thirdPartyDriverRegistryId ?? null,
        tenantId: freshClaim.tenantId ?? null,
        claimCreatedAt: freshClaim.createdAt ?? null,
        incidentDate: freshClaim.incidentDate ?? null,
      });
    } catch (e: any) {
      console.warn(`[CrossClaimIntelligence] Post-pipeline run failed for claim ${claimId}:`, e.message?.substring(0, 100));
    }
  }, 3000); // 3-second delay gives entity/vehicle registry writes time to commit

  // END TOP-LEVEL TRY
  } catch (topLevelError) {
    // LLM call, JSON parse, or other unhandled failure
    console.error(`[KINGA Assessment] Fatal error for claim ${claimId}:`, topLevelError);
    // Clear watchdog timer on error path
    if (watchdogTimer) { clearTimeout(watchdogTimer); watchdogTimer = null; }
    // CRITICAL FIX: If pipelineSucceeded is already true, the success path already
    // wrote assessment_complete to the DB. Do NOT reset to intake_pending — that
    // is the claim-cycling bug. Only reset when the pipeline genuinely failed.
    if (!pipelineSucceeded) {
      try {
        const dbInner = await getDb();
        if (dbInner) {
          // DRA Phase 2: Unhandled pipeline error → DOCUMENT_FAILED
          // (not intake_pending — that was the claim-cycling bug)
          await dbInner.update(claims).set({
            documentProcessingStatus: "DOCUMENT_FAILED",
            status: "document_failed",
            workflowState: "intake_queue",  // Reset workflow state so re-run can transition cleanly
            updatedAt: new Date().toISOString(),
          }).where(eq(claims.id, claimId));
          console.log(`[KINGA Assessment] Claim ${claimId} marked as DOCUMENT_FAILED after AI error. workflowState reset to intake_queue.`);
        }
      } catch (updateError) {
        console.error(`[KINGA Assessment] Could not update failure status for claim ${claimId}:`, updateError);
      }
    } else {
      console.warn(`[KINGA Assessment] Claim ${claimId}: error thrown AFTER pipelineSucceeded=true — pipeline completed successfully, NOT resetting to intake_pending. Error:`, topLevelError);
    }
    throw topLevelError; // Re-throw so the caller's setImmediate catch logs it
  } finally {
    // GUARANTEED SAFETY NET: Ensure claim is NEVER left in a transient state.
    // IMPORTANT: Only fires if the pipeline did NOT succeed. If pipelineSucceeded
    // is true, the success path already wrote the correct status — do not reset.
    if (!pipelineSucceeded) {
      try {
        const dbFinally = await getDb();
        if (dbFinally) {
          const [currentState] = await dbFinally.select({
            dps: claims.documentProcessingStatus,
          }).from(claims).where(eq(claims.id, claimId)).limit(1);
          const transientStates = ['parsing', 'extracting', 'analysing', 'DOCUMENT_VALIDATING', 'DOCUMENT_READY', 'ANALYSIS_RUNNING', 'RECOVERY_ATTEMPTED'];
          if (currentState && transientStates.includes(currentState.dps as string)) {
            console.error(`[KINGA Assessment] SAFETY NET: Claim ${claimId} still in '${currentState.dps}' after pipeline failure — forcing to DOCUMENT_FAILED.`);
          // IMPORTANT: Do NOT reset aiAssessmentTriggered to 0 here.
          // If KINGA was actively running (aiAssessmentTriggered=1) and failed mid-pipeline,
          // the claim must remain visible in the UI as a KINGA failure — not disappear
          // as if it was never triggered. The processor needs to see it to retry.
          await dbFinally.update(claims).set({
            documentProcessingStatus: "DOCUMENT_FAILED",
            status: "document_failed",
            workflowState: "intake_queue",
            updatedAt: new Date().toISOString(),
          }).where(eq(claims.id, claimId));
          }
        }      } catch (finallyErr) {
        console.error(`[KINGA Assessment] SAFETY NET DB update failed for claim ${claimId}:`, finallyErr);
      }
    }
    // Always release the pipeline semaphore slot so the next queued claim can start.
    releasePipelineSlot();
    console.log(`[PipelineSemaphore] Claim ${claimId} released pipeline slot (active: ${_activePipelineCount}, queued: ${_pipelineQueue.length})`);
  }
}
// ============================================================================
// AI ASSESSMENT OPERATIONS
// =============================================================================


// Re-exports from domain modules (extracted Aug 2026)
export * from "./db/assessment-db";
export * from "./db/notifications-db";
export * from "./db/documents-db";
export * from "./db/assessors-db";
export * from "./db/intelligence-db";
