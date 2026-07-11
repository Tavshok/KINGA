/**
 * AUDIT-01: Shared audit helper utilities.
 *
 * Provides:
 * - SYSTEM_USER_ID: reserved user ID for system-triggered audit entries
 * - generateIntegrityHash: SHA-256 of JSON payload (matches ingestion-review-queue.ts)
 * - generateAuditId: consistent ID format for isoAuditLogs
 * - insertIsoAuditLog: typed helper for isoAuditLogs inserts
 * - insertWorkflowAudit: typed helper for workflowAuditTrail inserts
 */
import crypto from "crypto";
import type { MySql2Database } from "drizzle-orm/mysql2";
import { isoAuditLogs, workflowAuditTrail } from "../../drizzle/schema.js";

/**
 * Reserved user ID for the "KINGA System" user row (openId = "SYSTEM").
 * Created by scripts/create-system-user.mts — do not change without updating the DB row.
 */
export const SYSTEM_USER_ID = 20670001;

/**
 * Generate a tamper-evidence hash for an audit payload.
 * Algorithm: SHA-256 of JSON.stringify(payload).
 * Matches the implementation in server/services/ingestion-review-queue.ts exactly.
 */
export function generateIntegrityHash(payload: Record<string, unknown>): string {
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

/**
 * Generate a unique audit log ID in the format used by ingestion-review-queue.ts.
 */
export function generateAuditId(): string {
  return `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export type IsoAuditActionType = "create" | "update" | "approve" | "reject" | "view" | "delete";

export interface IsoAuditParams {
  tenantId: string;
  userId: number;
  userRole: string;
  actionType: IsoAuditActionType;
  resourceType: string;
  resourceId: string;
  beforeState?: string | null;
  afterState?: string | null;
  ipAddress?: string | null;
  sessionId?: string | null;
}

/**
 * Insert a row into isoAuditLogs with auto-generated id and integrityHash.
 * The integrityHash is computed over the full payload (excluding id and integrityHash itself).
 */
export async function insertIsoAuditLog(
  db: MySql2Database<Record<string, unknown>>,
  params: IsoAuditParams
): Promise<void> {
  const id = generateAuditId();
  const payload: Record<string, unknown> = {
    tenantId: params.tenantId,
    userId: params.userId,
    userRole: params.userRole,
    actionType: params.actionType,
    resourceType: params.resourceType,
    resourceId: params.resourceId,
    beforeState: params.beforeState ?? null,
    afterState: params.afterState ?? null,
  };
  const integrityHash = generateIntegrityHash(payload);
  await (db as any).insert(isoAuditLogs).values({
    id,
    ...payload,
    ipAddress: params.ipAddress ?? null,
    sessionId: params.sessionId ?? null,
    integrityHash,
  });
}

export type WorkflowAuditState =
  | "intake_queue"
  | "created"
  | "intake_verified"
  | "assigned"
  | "under_assessment"
  | "internal_review"
  | "technical_approval"
  | "financial_decision"
  | "payment_authorized"
  | "closed"
  | "disputed";

export type WorkflowAuditRole =
  | "claims_processor"
  | "assessor_internal"
  | "assessor_external"
  | "risk_manager"
  | "claims_manager"
  | "executive"
  | "insurer_admin"
  | "recovery_officer";

export interface WorkflowAuditParams {
  claimId: number;
  userId: number;
  userRole: WorkflowAuditRole;
  previousState?: WorkflowAuditState | null;
  newState: WorkflowAuditState;
  comments?: string | null;
  /** Structured JSON payload — serialised to text for storage */
  metadata?: Record<string, unknown> | null;
}

/**
 * Insert a row into workflowAuditTrail.
 * actionType and tenantId (not present as columns) are folded into metadata.
 */
export async function insertWorkflowAudit(
  db: MySql2Database<Record<string, unknown>>,
  params: WorkflowAuditParams
): Promise<void> {
  await (db as any).insert(workflowAuditTrail).values({
    claimId: params.claimId,
    userId: params.userId,
    userRole: params.userRole,
    previousState: params.previousState ?? null,
    newState: params.newState,
    comments: params.comments ?? null,
    metadata: params.metadata ? JSON.stringify(params.metadata) : null,
  });
}
