
/**
 * Claim Comments Router — Cross-Role Communication System
 *
 * Procedures:
 *  - send         : create a new comment (root or reply), trigger emails
 *  - list         : get all comments on a claim visible to the caller
 *  - myNotifications : get all notifications directed to the caller across all claims
 *  - unreadCount  : badge count for the Notifications tab
 *  - markRead     : mark one comment as read
 *  - markAllRead  : mark all notifications as read
 *  - resolve      : resolve a comment thread
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import {
  getClaimComments,
  getMyNotifications,
  getUnreadCommentCount,
  createClaimComment,
  resolveCommentThread,
  markCommentRead,
  markAllNotificationsRead,
  markCommentEmailSent,
  getUsersByRoleAndTenant,
} from "../claim-comments-db";
import { sendEmailSafe } from "../safe-email";

// ── Shared helpers ─────────────────────────────────────────────────────────────

const COMMENT_TYPES = [
  "clarification",
  "instruction",
  "escalation",
  "approval_note",
  "rejection_note",
  "inspection_request",
  "general",
] as const;

const ROLE_LABELS: Record<string, string> = {
  claims_manager: "Claims Manager",
  claims_processor: "Claims Processor",
  assessor_internal: "Internal Assessor",
  external_assessor: "External Assessor",
  risk_manager: "Risk Manager",
  executive: "Executive",
  panel_beater: "Panel Beater",
  insurer: "Insurer",
  assessor: "Assessor",
};

const STATUS_UPDATE_TEMPLATES: Record<string, string> = {
  received: "Your claim has been received and is being processed.",
  under_review: "Your claim is currently under review by our assessments team.",
  assessment_scheduled: "An assessment has been scheduled for your claim. You will receive further details shortly.",
  additional_info_required: "We require additional information to process your claim. Please contact us at your earliest convenience.",
  approved: "We are pleased to inform you that your claim has been approved. Repairs will be authorised shortly.",
  rejected: "After careful review, we regret to inform you that your claim has not been approved. Please contact us for further details.",
  repair_authorised: "Repairs have been authorised for your claim. The panel beater will be in contact to schedule the work.",
  repair_complete: "Repairs on your vehicle have been completed. Please contact us if you have any concerns.",
  payment_processed: "Payment for your claim has been processed and will reflect within 3–5 business days.",
  closed: "Your claim has been finalised and closed. Thank you for your patience throughout this process.",
};

async function sendCommentEmails(opts: {
  commentId: number;
  claimId: number;
  claimNumber: string;
  authorName: string;
  authorRole: string;
  body: string;
  commentType: string;
  toRoles: string[];
  toUserIds: number[];
  toEmails: string[];
  tenantId: string;
  notifyClaimant: boolean;
  claimantEmail?: string | null;
  claimantName?: string | null;
  statusUpdateTemplate?: string | null;
  requiresResponse: boolean;
  responseDeadlineAt?: string | null;
}) {
  const {
    commentId, claimId, claimNumber, authorName, authorRole, body,
    commentType, toRoles, toUserIds, toEmails, tenantId,
    notifyClaimant, claimantEmail, claimantName, statusUpdateTemplate,
    requiresResponse, responseDeadlineAt,
  } = opts;

  const authorLabel = ROLE_LABELS[authorRole] ?? authorRole;
  const typeLabel = commentType.replace(/_/g, " ");
  const subject = `[KINGA] ${typeLabel} on Claim ${claimNumber} from ${authorLabel}`;
  const deadlineNote = requiresResponse && responseDeadlineAt
    ? `\n\n⚠️ Response required by: ${new Date(responseDeadlineAt).toLocaleDateString()}`
    : "";
  const emailBody = `${authorLabel} has sent you a message regarding claim ${claimNumber}:\n\n"${body}"${deadlineNote}\n\nPlease log in to KINGA to view and respond.\n\nKINGA AI`;

  // Collect all recipient users from roles
  const recipientUsers: Array<{ id: number; email: string; name: string }> = [];

  for (const role of toRoles) {
    const users = await getUsersByRoleAndTenant(role, tenantId);
    recipientUsers.push(...users);
  }

  // Add specific user IDs (fetch from DB via raw query would be needed — skip for now, rely on role routing)
  // toUserIds would need a getUsersByIds helper — roles cover the primary use case

  // Send to role-based recipients
  for (const user of recipientUsers) {
    if (!user.email) continue;
    await sendEmailSafe({
      eventType: "claim_comment",
      entityId: commentId,
      recipientUserId: user.id,
      recipientEmail: user.email,
      tenantId,
      subject,
      body: emailBody,
    });
  }

  // Send to explicit email addresses (external parties)
  for (const email of toEmails) {
    await sendEmailSafe({
      eventType: "claim_comment_external",
      entityId: commentId,
      recipientUserId: 0,
      recipientEmail: email,
      tenantId,
      subject,
      body: emailBody,
    });
  }

  // Notify claimant if requested
  if (notifyClaimant && claimantEmail) {
    const claimantMessage = statusUpdateTemplate
      ? STATUS_UPDATE_TEMPLATES[statusUpdateTemplate] ?? body
      : body;
    await sendEmailSafe({
      eventType: "claimant_status_update",
      entityId: claimId,
      recipientUserId: 0,
      recipientEmail: claimantEmail,
      tenantId,
      subject: `Update on Your Claim ${claimNumber}`,
      body: `Dear ${claimantName ?? "Valued Customer"},\n\n${claimantMessage}\n\nIf you have any questions, please do not hesitate to contact us.\n\nKINGA Insurance Claims\nRef: ${claimNumber}`,
    });
  }

  await markCommentEmailSent(commentId);
}

// ── Router ────────────────────────────────────────────────────────────────────

export const claimCommentsRouter = router({

  /**
   * Send a new comment (root or reply).
   */
  send: protectedProcedure
    .input(z.object({
      claimId: z.number().int().positive(),
      toRoles: z.array(z.string()).default([]),
      toUserIds: z.array(z.number()).default([]),
      toEmails: z.array(z.string().email()).default([]),
      commentType: z.enum(COMMENT_TYPES).default("general"),
      requiresResponse: z.boolean().default(false),
      responseDeadlineAt: z.string().nullable().optional(),
      body: z.string().min(1).max(5000),
      parentCommentId: z.number().int().positive().nullable().optional(),
      notifyClaimant: z.boolean().default(false),
      statusUpdateTemplate: z.string().nullable().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const user = ctx.user;
      const tenantId = user.tenantId ?? "";
      const userRole = user.insurerRole ?? user.role ?? "user";

      // Validate at least one recipient
      if (
        input.toRoles.length === 0 &&
        input.toUserIds.length === 0 &&
        input.toEmails.length === 0 &&
        !input.notifyClaimant &&
        !input.parentCommentId
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Please specify at least one recipient role, user, or email address.",
        });
      }

      // Get claim details for email context and claimant routing
      const conn = await (await import("mysql2/promise")).createPool(
        process.env.DATABASE_URL!
      ).getConnection();
      let claimNumber = `CLM-${input.claimId}`;
      let claimantEmail: string | null = null;
      let claimantName: string | null = null;
      try {
        const [rows] = await conn.execute(
          `SELECT claimNumber, claimantEmail, claimantPhone FROM claims WHERE id = ? LIMIT 1`,
          [input.claimId]
        );
        const claim = (rows as any[])[0];
        if (claim) {
          claimNumber = claim.claimNumber ?? claimNumber;
          claimantEmail = claim.claimantEmail ?? null;
          claimantName = claim.claimantName ?? null;
        }
      } finally {
        conn.release();
      }

      const commentId = await createClaimComment({
        claimId: input.claimId,
        tenantId,
        authorUserId: user.id,
        authorRole: userRole,
        toRoles: input.toRoles,
        toUserIds: input.toUserIds,
        toEmails: input.toEmails,
        commentType: input.commentType,
        requiresResponse: input.requiresResponse,
        responseDeadlineAt: input.responseDeadlineAt ?? null,
        body: input.body,
        parentCommentId: input.parentCommentId ?? null,
        notifyClaimant: input.notifyClaimant,
        statusUpdateTemplate: input.statusUpdateTemplate ?? null,
      });

      // Send emails asynchronously (don't block the response)
      sendCommentEmails({
        commentId,
        claimId: input.claimId,
        claimNumber,
        authorName: user.name ?? "KINGA User",
        authorRole: userRole,
        body: input.body,
        commentType: input.commentType,
        toRoles: input.toRoles,
        toUserIds: input.toUserIds,
        toEmails: input.toEmails,
        tenantId,
        notifyClaimant: input.notifyClaimant,
        claimantEmail,
        claimantName,
        statusUpdateTemplate: input.statusUpdateTemplate ?? null,
        requiresResponse: input.requiresResponse,
        responseDeadlineAt: input.responseDeadlineAt ?? null,
      }).catch(err => console.error("[ClaimComments] Email send error:", err));

      return { commentId };
    }),

  /**
   * List all comments on a claim visible to the caller.
   */
  list: protectedProcedure
    .input(z.object({ claimId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const user = ctx.user;
      const userRole = user.insurerRole ?? user.role ?? "user";
      const userEmail = user.email ?? "";
      return getClaimComments(input.claimId, user.id, userRole, userEmail);
    }),

  /**
   * Get all notifications directed to the caller across all claims.
   */
  myNotifications: protectedProcedure
    .input(z.object({
      filter: z.enum(["all", "unread", "requires_response", "resolved"]).default("all"),
    }))
    .query(async ({ input, ctx }) => {
      const user = ctx.user;
      const userRole = user.insurerRole ?? user.role ?? "user";
      const userEmail = user.email ?? "";
      const tenantId = user.tenantId ?? "";
      return getMyNotifications(user.id, userRole, userEmail, tenantId, input.filter);
    }),

  /**
   * Unread notification count — used for the tab badge.
   */
  unreadCount: protectedProcedure
    .query(async ({ ctx }) => {
      const user = ctx.user;
      const userRole = user.insurerRole ?? user.role ?? "user";
      const userEmail = user.email ?? "";
      const tenantId = user.tenantId ?? "";
      const count = await getUnreadCommentCount(user.id, userRole, userEmail, tenantId);
      return { count };
    }),

  /**
   * Mark a single comment as read.
   */
  markRead: protectedProcedure
    .input(z.object({ commentId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      await markCommentRead(input.commentId, ctx.user.id);
      return { ok: true };
    }),

  /**
   * Mark all notifications as read.
   */
  markAllRead: protectedProcedure
    .mutation(async ({ ctx }) => {
      const user = ctx.user;
      const userRole = user.insurerRole ?? user.role ?? "user";
      const userEmail = user.email ?? "";
      const tenantId = user.tenantId ?? "";
      await markAllNotificationsRead(user.id, userRole, userEmail, tenantId);
      return { ok: true };
    }),

  /**
   * Resolve a comment thread (marks root + all replies as resolved).
   */
  resolve: protectedProcedure
    .input(z.object({ commentId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      await resolveCommentThread(input.commentId, ctx.user.id);
      return { ok: true };
    }),

  /**
   * Get available status update templates for claimant notifications.
   */
  statusTemplates: protectedProcedure
    .query(() => {
      return Object.entries(STATUS_UPDATE_TEMPLATES).map(([key, text]) => ({
        key,
        label: key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
        text,
      }));
    }),
});
