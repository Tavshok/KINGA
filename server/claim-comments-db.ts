// @ts-nocheck
/**
 * Claim Comments — DB Helpers
 * Cross-role communication system: permanent, auditable, claim-scoped threads.
 */
import { eq, and, desc, inArray, or, sql, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { ENV } from "./_core/env";

// ── DB connection ─────────────────────────────────────────────────────────────
const pool = mysql.createPool(ENV.databaseUrl);
const db = drizzle(pool);

// ── Raw SQL helpers (avoid schema import conflicts) ───────────────────────────

export interface ClaimCommentRecord {
  id: number;
  claimId: number;
  tenantId: string | null;
  authorUserId: number;
  authorRole: string;
  toRoles: string[];
  toUserIds: number[];
  toEmails: string[];
  commentType: string;
  requiresResponse: boolean;
  responseDeadlineAt: string | null;
  body: string;
  parentCommentId: number | null;
  isResolved: boolean;
  resolvedByUserId: number | null;
  resolvedAt: string | null;
  emailSent: boolean;
  notifyClaimant: boolean;
  claimantEmailSent: boolean;
  statusUpdateTemplate: string | null;
  createdAt: string;
  // Joined fields
  authorName?: string;
  claimNumber?: string;
  replies?: ClaimCommentRecord[];
  isRead?: boolean;
}

function parseComment(row: any): ClaimCommentRecord {
  return {
    id: row.id,
    claimId: row.claimId ?? row.claim_id,
    tenantId: row.tenant_id ?? null,
    authorUserId: row.author_user_id,
    authorRole: row.author_role,
    toRoles: safeParseJson(row.to_roles, []),
    toUserIds: safeParseJson(row.to_user_ids, []),
    toEmails: safeParseJson(row.to_emails, []),
    commentType: row.comment_type,
    requiresResponse: !!row.requires_response,
    responseDeadlineAt: row.response_deadline_at ?? null,
    body: row.body,
    parentCommentId: row.parent_comment_id ?? null,
    isResolved: !!row.is_resolved,
    resolvedByUserId: row.resolved_by_user_id ?? null,
    resolvedAt: row.resolved_at ?? null,
    emailSent: !!row.email_sent,
    notifyClaimant: !!row.notify_claimant,
    claimantEmailSent: !!row.claimant_email_sent,
    statusUpdateTemplate: row.status_update_template ?? null,
    createdAt: row.createdAt ?? row.created_at ?? new Date().toISOString(),
    authorName: row.authorName ?? row.author_name ?? undefined,
    claimNumber: row.claimNumber ?? row.claim_number ?? undefined,
  };
}

function safeParseJson(val: any, fallback: any): any {
  if (!val) return fallback;
  if (typeof val === "object") return val;
  try { return JSON.parse(val); } catch { return fallback; }
}

/**
 * Get all root comments for a claim that are visible to the given user/role.
 * Visibility: author, or user is in toRoles, toUserIds, or toEmails.
 */
export async function getClaimComments(
  claimId: number,
  userId: number,
  userRole: string,
  userEmail: string
): Promise<ClaimCommentRecord[]> {
  const conn = await pool.getConnection();
  try {
    // Get root comments visible to this user
    const [rows] = await conn.execute(
      `SELECT cc.*, u.name as authorName, c.claimNumber
       FROM claim_comments cc
       LEFT JOIN users u ON u.id = cc.author_user_id
       LEFT JOIN claims c ON c.id = cc.claimId
       WHERE cc.claimId = ?
         AND cc.parent_comment_id IS NULL
         AND cc.deletedAt IS NULL
         AND (
           cc.author_user_id = ?
           OR JSON_CONTAINS(cc.to_roles, JSON_QUOTE(?))
           OR JSON_CONTAINS(cc.to_user_ids, CAST(? AS JSON))
           OR JSON_CONTAINS(cc.to_emails, JSON_QUOTE(?))
         )
       ORDER BY cc.createdAt ASC`,
      [claimId, userId, userRole, userId, userEmail]
    );

    const comments = (rows as any[]).map(parseComment);

    // For each root comment, fetch replies
    for (const comment of comments) {
      const [replyRows] = await conn.execute(
        `SELECT cc.*, u.name as authorName
         FROM claim_comments cc
         LEFT JOIN users u ON u.id = cc.author_user_id
         WHERE cc.parent_comment_id = ? AND cc.deletedAt IS NULL
         ORDER BY cc.createdAt ASC`,
        [comment.id]
      );
      comment.replies = (replyRows as any[]).map(parseComment);
    }

    // Mark read status
    if (comments.length > 0) {
      const ids = comments.map(c => c.id);
      const [readRows] = await conn.execute(
        `SELECT comment_id FROM claim_comment_reads WHERE user_id = ? AND comment_id IN (${ids.map(() => '?').join(',')})`,
        [userId, ...ids]
      );
      const readSet = new Set((readRows as any[]).map(r => r.comment_id));
      for (const c of comments) {
        c.isRead = readSet.has(c.id);
      }
    }

    return comments;
  } finally {
    conn.release();
  }
}

/**
 * Get all notifications (comments) directed to a user across all claims.
 * Used for the Notifications tab.
 */
export async function getMyNotifications(
  userId: number,
  userRole: string,
  userEmail: string,
  tenantId: string,
  filter: "all" | "unread" | "requires_response" | "resolved" = "all"
): Promise<ClaimCommentRecord[]> {
  const conn = await pool.getConnection();
  try {
    let filterClause = "";
    if (filter === "unread") {
      filterClause = `AND NOT EXISTS (
        SELECT 1 FROM claim_comment_reads ccr WHERE ccr.comment_id = cc.id AND ccr.user_id = ${userId}
      )`;
    } else if (filter === "requires_response") {
      filterClause = "AND cc.requires_response = 1 AND cc.is_resolved = 0";
    } else if (filter === "resolved") {
      filterClause = "AND cc.is_resolved = 1";
    }

    const [rows] = await conn.execute(
      `SELECT cc.*, u.name as authorName, c.claimNumber,
              EXISTS(SELECT 1 FROM claim_comment_reads ccr WHERE ccr.comment_id = cc.id AND ccr.user_id = ?) as isRead
       FROM claim_comments cc
       LEFT JOIN users u ON u.id = cc.author_user_id
       LEFT JOIN claims c ON c.id = cc.claimId
       WHERE cc.tenant_id = ?
         AND cc.deletedAt IS NULL
         AND cc.author_user_id != ?
         AND (
           JSON_CONTAINS(cc.to_roles, JSON_QUOTE(?))
           OR JSON_CONTAINS(cc.to_user_ids, CAST(? AS JSON))
           OR JSON_CONTAINS(cc.to_emails, JSON_QUOTE(?))
         )
         ${filterClause}
       ORDER BY cc.createdAt DESC
       LIMIT 100`,
      [userId, tenantId, userId, userRole, userId, userEmail]
    );

    return (rows as any[]).map(r => ({ ...parseComment(r), isRead: !!r.isRead }));
  } finally {
    conn.release();
  }
}

/**
 * Get unread notification count for a user.
 */
export async function getUnreadCommentCount(
  userId: number,
  userRole: string,
  userEmail: string,
  tenantId: string
): Promise<number> {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.execute(
      `SELECT COUNT(*) as cnt
       FROM claim_comments cc
       WHERE cc.tenant_id = ?
         AND cc.deletedAt IS NULL
         AND cc.author_user_id != ?
         AND (
           JSON_CONTAINS(cc.to_roles, JSON_QUOTE(?))
           OR JSON_CONTAINS(cc.to_user_ids, CAST(? AS JSON))
           OR JSON_CONTAINS(cc.to_emails, JSON_QUOTE(?))
         )
         AND NOT EXISTS (
           SELECT 1 FROM claim_comment_reads ccr WHERE ccr.comment_id = cc.id AND ccr.user_id = ?
         )`,
      [tenantId, userId, userRole, userId, userEmail, userId]
    );
    return (rows as any[])[0]?.cnt ?? 0;
  } finally {
    conn.release();
  }
}

/**
 * Create a new comment (root or reply).
 */
export async function createClaimComment(data: {
  claimId: number;
  tenantId: string;
  authorUserId: number;
  authorRole: string;
  toRoles: string[];
  toUserIds: number[];
  toEmails: string[];
  commentType: string;
  requiresResponse: boolean;
  responseDeadlineAt?: string | null;
  body: string;
  parentCommentId?: number | null;
  notifyClaimant?: boolean;
  statusUpdateTemplate?: string | null;
}): Promise<number> {
  const conn = await pool.getConnection();
  try {
    const now = new Date().toISOString();
    const [result] = await conn.execute(
      `INSERT INTO claim_comments
        (claimId, tenant_id, author_user_id, author_role, to_roles, to_user_ids, to_emails,
         comment_type, requires_response, response_deadline_at, body, parent_comment_id,
         is_resolved, email_sent, notify_claimant, status_update_template, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?)`,
      [
        data.claimId,
        data.tenantId,
        data.authorUserId,
        data.authorRole,
        JSON.stringify(data.toRoles),
        JSON.stringify(data.toUserIds),
        JSON.stringify(data.toEmails),
        data.commentType,
        data.requiresResponse ? 1 : 0,
        data.responseDeadlineAt ?? null,
        data.body,
        data.parentCommentId ?? null,
        data.notifyClaimant ? 1 : 0,
        data.statusUpdateTemplate ?? null,
        now,
      ]
    );
    return (result as any).insertId;
  } finally {
    conn.release();
  }
}

/**
 * Mark a comment thread as resolved.
 */
export async function resolveCommentThread(
  commentId: number,
  resolvedByUserId: number
): Promise<void> {
  const conn = await pool.getConnection();
  try {
    const now = new Date().toISOString();
    await conn.execute(
      `UPDATE claim_comments SET is_resolved = 1, resolved_by_user_id = ?, resolved_at = ?
       WHERE id = ? OR parent_comment_id = ?`,
      [resolvedByUserId, now, commentId, commentId]
    );
  } finally {
    conn.release();
  }
}

/**
 * Mark a comment as read by a user.
 */
export async function markCommentRead(
  commentId: number,
  userId: number
): Promise<void> {
  const conn = await pool.getConnection();
  try {
    const now = new Date().toISOString();
    await conn.execute(
      `INSERT IGNORE INTO claim_comment_reads (comment_id, user_id, read_at) VALUES (?, ?, ?)`,
      [commentId, userId, now]
    );
  } finally {
    conn.release();
  }
}

/**
 * Mark all notifications as read for a user.
 */
export async function markAllNotificationsRead(
  userId: number,
  userRole: string,
  userEmail: string,
  tenantId: string
): Promise<void> {
  const conn = await pool.getConnection();
  try {
    // Get all unread comment IDs for this user
    const [rows] = await conn.execute(
      `SELECT cc.id FROM claim_comments cc
       WHERE cc.tenant_id = ?
         AND cc.author_user_id != ?
         AND (
           JSON_CONTAINS(cc.to_roles, JSON_QUOTE(?))
           OR JSON_CONTAINS(cc.to_user_ids, CAST(? AS JSON))
           OR JSON_CONTAINS(cc.to_emails, JSON_QUOTE(?))
         )
         AND NOT EXISTS (
           SELECT 1 FROM claim_comment_reads ccr WHERE ccr.comment_id = cc.id AND ccr.user_id = ?
         )`,
      [tenantId, userId, userRole, userId, userEmail, userId]
    );
    const ids = (rows as any[]).map(r => r.id);
    if (ids.length === 0) return;
    const now = new Date().toISOString();
    const placeholders = ids.map(() => "(?, ?, ?)").join(", ");
    const values = ids.flatMap(id => [id, userId, now]);
    await conn.execute(
      `INSERT IGNORE INTO claim_comment_reads (comment_id, user_id, read_at) VALUES ${placeholders}`,
      values
    );
  } finally {
    conn.release();
  }
}

/**
 * Mark email as sent for a comment.
 */
export async function markCommentEmailSent(commentId: number): Promise<void> {
  const conn = await pool.getConnection();
  try {
    await conn.execute(
      `UPDATE claim_comments SET email_sent = 1 WHERE id = ?`,
      [commentId]
    );
  } finally {
    conn.release();
  }
}

/**
 * Get all users in a given role for a tenant (for email routing).
 */
export async function getUsersByRoleAndTenant(
  role: string,
  tenantId: string
): Promise<Array<{ id: number; email: string; name: string }>> {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.execute(
      `SELECT u.id, u.email, u.name
       FROM users u
       JOIN tenant_users tu ON tu.user_id = u.id
       WHERE tu.tenant_id = ? AND u.role = ?
       LIMIT 50`,
      [tenantId, role]
    );
    return rows as any[];
  } finally {
    conn.release();
  }
}
