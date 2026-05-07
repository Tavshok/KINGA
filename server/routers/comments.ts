// @ts-nocheck
/**
 * Comments Router
 *
 * Provides comment management for claims with:
 * - RBAC enforcement (insurer tenant members only)
 * - Audit logging for all comment operations
 * - Immutable append-only design
 * - Soft-delete only (deletedAt timestamp)
 * - Phase A: Section annotations with severity, disposition, blocksApproval
 */

import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { z } from "zod";
import { claimComments, claims, workflowAuditTrail } from "../../drizzle/schema";
import { eq, and, isNull, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { extractInsertId } from "../utils/drizzle-helpers";
import { getUsersByInsurerRoles, createNotification } from "../db";
import {
  SEVERITY_VISIBILITY,
  type AnnotationSeverity,
} from "../../shared/report-section-keys";

const ROLE_ORDER = [
  "claims_processor",
  "assessor_internal",
  "risk_manager",
  "claims_manager",
  "executive",
  "insurer_admin",
];

export const commentsRouter = router({
  /**
   * Add a general comment to a claim (existing behaviour, unchanged)
   */
  addComment: protectedProcedure
    .input(
      z.object({
        claimId: z.number().int().positive(),
        content: z.string().min(1).max(5000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      if (ctx.user.role !== "insurer") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only insurer tenant members can add comments to claims",
        });
      }

      const [claim] = await db
        .select({ id: claims.id, tenantId: claims.tenantId })
        .from(claims)
        .where(eq(claims.id, input.claimId));

      if (!claim) {
        throw new TRPCError({ code: "NOT_FOUND", message: `Claim ${input.claimId} not found` });
      }
      if (claim.tenantId !== ctx.user.tenantId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Cannot add comments to claims from other tenants" });
      }

      const result = await db.insert(claimComments).values({
        claimId: input.claimId,
        userId: ctx.user.id,
        userRole: ctx.user.insurerRole || ctx.user.role || "claims_processor",
        toRoles: "[]",
        toUserIds: "[]",
        toEmails: "[]",
        commentType: "general",
        content: input.content,
        createdAt: new Date(),
      });

      const commentId = extractInsertId(result);

      await db.insert(workflowAuditTrail).values({
        claimId: input.claimId,
        userId: ctx.user.id,
        userRole: ctx.user.insurerRole || "claims_processor",
        previousState: null,
        newState: "created",
        comments: `Comment added: ${input.content.substring(0, 100)}${input.content.length > 100 ? "..." : ""}`,
        metadata: JSON.stringify({ action: "comment_added", commentId }),
        createdAt: new Date(),
      });

      return { success: true, commentId, message: "Comment added successfully" };
    }),

  /**
   * Add a section annotation to a specific report section.
   * Visibility is enforced server-side using the severity visibility matrix.
   */
  addSectionComment: protectedProcedure
    .input(
      z.object({
        claimId: z.number().int().positive(),
        sectionKey: z.string().min(1).max(100),
        subsectionKey: z.string().max(100).optional(),
        findingId: z.string().max(100).optional(),
        pipelineRunId: z.number().int().positive().optional(),
        content: z.string().min(1).max(5000),
        severity: z
          .enum(["info", "warning", "critical", "fraud_risk", "compliance"])
          .default("info"),
        blocksApproval: z.boolean().default(false),
        toRoles: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      if (ctx.user.role !== "insurer") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only insurer members can annotate reports" });
      }

      const [claim] = await db
        .select({ id: claims.id, tenantId: claims.tenantId })
        .from(claims)
        .where(eq(claims.id, input.claimId));

      if (!claim) throw new TRPCError({ code: "NOT_FOUND", message: `Claim ${input.claimId} not found` });
      if (claim.tenantId !== ctx.user.tenantId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Cross-tenant access denied" });
      }

      // Apply visibility matrix: use provided toRoles or derive from severity
      const visibleRoles =
        input.toRoles ?? SEVERITY_VISIBILITY[input.severity as AnnotationSeverity];

      const result = await db.insert(claimComments).values({
        claimId: input.claimId,
        userId: ctx.user.id,
        userRole: ctx.user.insurerRole || "claims_processor",
        toRoles: JSON.stringify(visibleRoles),
        toUserIds: "[]",
        toEmails: "[]",
        commentType: "general",
        requiresResponse: 0,
        content: input.content,
        isResolved: 0,
        emailSent: 0,
        notifyClaimant: 0,
        claimantEmailSent: 0,
        createdAt: new Date().toISOString(),
        tenantId: ctx.user.tenantId,
        sectionKey: input.sectionKey,
        subsectionKey: input.subsectionKey ?? null,
        findingId: input.findingId ?? null,
        pipelineRunId: input.pipelineRunId ?? null,
        severity: input.severity,
        blocksApproval: input.blocksApproval ? 1 : 0,
      });

      const commentId = extractInsertId(result);

      // Notify relevant roles for high-severity annotations
      if (["critical", "fraud_risk", "compliance"].includes(input.severity)) {
        const notifyRoles = visibleRoles.filter((r) => r !== ctx.user.insurerRole);
        if (notifyRoles.length > 0) {
          const notifyUsers = await getUsersByInsurerRoles(notifyRoles);
          for (const u of notifyUsers) {
            if (u.id !== ctx.user.id) {
              await createNotification({
                userId: u.id,
                title:
                  input.severity === "fraud_risk"
                    ? `⚠️ Fraud Risk annotation on claim #${input.claimId}`
                    : input.severity === "compliance"
                    ? `📋 Compliance annotation on claim #${input.claimId}`
                    : `🔴 Critical annotation on claim #${input.claimId}`,
                content: `${ctx.user.name || ctx.user.insurerRole} flagged a ${input.severity} finding in the ${input.sectionKey.replace(/_/g, " ")} section.`,
                type: "annotation",
                priority: input.severity === "fraud_risk" ? "high" : "medium",
                claimId: input.claimId,
                actionUrl: `/insurer-portal/comparison/${input.claimId}#section-${input.sectionKey}`,
              });
            }
          }
        }
      }

      await db.insert(workflowAuditTrail).values({
        claimId: input.claimId,
        userId: ctx.user.id,
        userRole: ctx.user.insurerRole || "claims_processor",
        previousState: null,
        newState: "created",
        comments: `Section annotation added: ${input.sectionKey} [${input.severity}]`,
        metadata: JSON.stringify({
          action: "section_annotation_added",
          commentId,
          sectionKey: input.sectionKey,
          severity: input.severity,
          blocksApproval: input.blocksApproval,
        }),
        createdAt: new Date(),
      });

      return { success: true, commentId };
    }),

  /**
   * List section annotations for a specific report section.
   * Returns current-run annotations and a count of historical ones from earlier runs.
   */
  listSectionComments: protectedProcedure
    .input(
      z.object({
        claimId: z.number().int().positive(),
        sectionKey: z.string().min(1).max(100),
        pipelineRunId: z.number().int().positive().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      if (ctx.user.role !== "insurer") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only insurer members can view annotations" });
      }

      const [claim] = await db
        .select({ tenantId: claims.tenantId })
        .from(claims)
        .where(eq(claims.id, input.claimId));

      if (!claim || claim.tenantId !== ctx.user.tenantId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }

      const userRole = ctx.user.insurerRole || "claims_processor";

      const allAnnotations = await db
        .select()
        .from(claimComments)
        .where(
          and(
            eq(claimComments.claimId, input.claimId),
            eq(claimComments.sectionKey, input.sectionKey),
            isNull(claimComments.deletedAt)
          )
        )
        .orderBy(desc(claimComments.createdAt));

      // Filter by visibility: only show annotations where userRole is in toRoles
      const visible = allAnnotations.filter((c) => {
        try {
          const roles: string[] = JSON.parse(c.toRoles || "[]");
          return roles.length === 0 || roles.includes(userRole);
        } catch {
          return true;
        }
      });

      // Split into current-run and historical
      const currentRun = input.pipelineRunId
        ? visible.filter((c) => c.pipelineRunId === input.pipelineRunId)
        : visible;
      const historicalCount = input.pipelineRunId
        ? visible.filter(
            (c) => c.pipelineRunId !== null && c.pipelineRunId !== input.pipelineRunId
          ).length
        : 0;

      return { annotations: currentRun, historicalCount };
    }),

  /**
   * Resolve an annotation (set disposition + isResolved).
   * Only the author, or a user with a higher role in the chain, may resolve.
   */
  resolveAnnotation: protectedProcedure
    .input(
      z.object({
        commentId: z.number().int().positive(),
        disposition: z.enum([
          "accepted",
          "rejected",
          "needs_more_info",
          "resolved",
          "escalated",
        ]),
        note: z.string().max(1000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      if (ctx.user.role !== "insurer") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only insurer members can resolve annotations" });
      }

      const [comment] = await db
        .select()
        .from(claimComments)
        .where(eq(claimComments.id, input.commentId));

      if (!comment) throw new TRPCError({ code: "NOT_FOUND", message: "Annotation not found" });
      if (comment.deletedAt) throw new TRPCError({ code: "BAD_REQUEST", message: "Annotation has been deleted" });

      const actorIdx = ROLE_ORDER.indexOf(ctx.user.insurerRole || "");
      const authorIdx = ROLE_ORDER.indexOf(comment.userRole || "");
      const isAuthor = comment.userId === ctx.user.id;
      const isHigherRole = actorIdx > authorIdx;

      if (!isAuthor && !isHigherRole) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the annotation author or a higher-ranked role may resolve this annotation",
        });
      }

      await db
        .update(claimComments)
        .set({
          disposition: input.disposition,
          isResolved: 1,
          resolvedByUserId: ctx.user.id,
          resolvedAt: new Date().toISOString(),
        })
        .where(eq(claimComments.id, input.commentId));

      await db.insert(workflowAuditTrail).values({
        claimId: comment.claimId,
        userId: ctx.user.id,
        userRole: ctx.user.insurerRole || "claims_processor",
        previousState: null,
        newState: "created",
        comments: `Annotation resolved: ${input.disposition}${input.note ? ` — ${input.note}` : ""}`,
        metadata: JSON.stringify({
          action: "annotation_resolved",
          commentId: input.commentId,
          disposition: input.disposition,
        }),
        createdAt: new Date(),
      });

      return { success: true };
    }),

  /**
   * List all comments for a claim (existing behaviour, unchanged)
   */
  listComments: protectedProcedure
    .input(
      z.object({
        claimId: z.number().int().positive(),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      if (ctx.user.role !== "insurer") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only insurer tenant members can view claim comments",
        });
      }

      const [claim] = await db
        .select({ id: claims.id, tenantId: claims.tenantId })
        .from(claims)
        .where(eq(claims.id, input.claimId));

      if (!claim) {
        throw new TRPCError({ code: "NOT_FOUND", message: `Claim ${input.claimId} not found` });
      }
      if (claim.tenantId !== ctx.user.tenantId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Cannot view comments from claims in other tenants" });
      }

      const comments = await db
        .select()
        .from(claimComments)
        .where(and(eq(claimComments.claimId, input.claimId), isNull(claimComments.deletedAt)))
        .orderBy(desc(claimComments.createdAt));

      return comments;
    }),

  /**
   * Soft-delete a comment (existing behaviour, unchanged)
   */
  deleteComment: protectedProcedure
    .input(
      z.object({
        commentId: z.number().int().positive(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      if (ctx.user.role !== "insurer") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only insurer tenant members can delete comments",
        });
      }

      const [comment] = await db
        .select({
          id: claimComments.id,
          userId: claimComments.userId,
          claimId: claimComments.claimId,
          deletedAt: claimComments.deletedAt,
        })
        .from(claimComments)
        .where(eq(claimComments.id, input.commentId));

      if (!comment) {
        throw new TRPCError({ code: "NOT_FOUND", message: `Comment ${input.commentId} not found` });
      }
      if (comment.deletedAt) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Comment has already been deleted" });
      }

      const [claim] = await db
        .select({ tenantId: claims.tenantId })
        .from(claims)
        .where(eq(claims.id, comment.claimId));

      if (!claim || claim.tenantId !== ctx.user.tenantId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Cannot delete comments from claims in other tenants" });
      }

      const isAuthor = comment.userId === ctx.user.id;
      const isAdmin =
        ctx.user.insurerRole === "insurer_admin" || ctx.user.insurerRole === "executive";

      if (!isAuthor && !isAdmin) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the comment author or administrators can delete comments",
        });
      }

      await db
        .update(claimComments)
        .set({ deletedAt: new Date() })
        .where(eq(claimComments.id, input.commentId));

      await db.insert(workflowAuditTrail).values({
        claimId: comment.claimId,
        userId: ctx.user.id,
        userRole: ctx.user.insurerRole || "claims_processor",
        previousState: null,
        newState: "created",
        comments: `Comment deleted (ID: ${input.commentId})`,
        metadata: JSON.stringify({ action: "comment_deleted", commentId: input.commentId }),
        createdAt: new Date(),
      });

      return { success: true, message: "Comment deleted successfully" };
    }),
});
