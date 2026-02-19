// @ts-nocheck
/**
 * Comments Router
 * 
 * Provides comment management for claims with:
 * - RBAC enforcement (insurer tenant members only)
 * - Audit logging for all comment operations
 * - Immutable append-only design
 * - Soft-delete only (deletedAt timestamp)
 */

import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { z } from "zod";
import { claimComments, claims, workflowAuditTrail } from "../../drizzle/schema";
import { eq, and, isNull, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { extractInsertId } from "../utils/drizzle-helpers";

const db = getDb();

export const commentsRouter = router({
  /**
   * Add a comment to a claim
   * 
   * RBAC: Only insurer tenant members can add comments
   * Audit: Logs comment creation in workflowAuditTrail
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

      // Verify user is an insurer tenant member
      if (ctx.user.role !== "insurer") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only insurer tenant members can add comments to claims",
        });
      }

      // Verify claim exists and belongs to user's tenant
      const [claim] = await db
        .select({
          id: claims.id,
          tenantId: claims.tenantId,
        })
        .from(claims)
        .where(eq(claims.id, input.claimId));

      if (!claim) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Claim ${input.claimId} not found`,
        });
      }

      // Cross-tenant access check
      if (claim.tenantId !== ctx.user.tenantId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Cannot add comments to claims from other tenants",
        });
      }

      // Insert comment (immutable append-only)
      const result = await db.insert(claimComments).values({
        claimId: input.claimId,
        userId: ctx.user.id,
        content: input.content,
        createdAt: new Date(),
      });

      // Safely extract inserted comment ID
      const commentId = extractInsertId(result);

      // Log comment creation in audit trail
      await db.insert(workflowAuditTrail).values({
        claimId: input.claimId,
        userId: ctx.user.id,
        userRole: ctx.user.insurerRole || "claims_processor",
        previousState: null,
        newState: "created", // Using "created" as a placeholder for comment action
        comments: `Comment added: ${input.content.substring(0, 100)}${input.content.length > 100 ? "..." : ""}`,
        metadata: JSON.stringify({ action: "comment_added", commentId }),
        createdAt: new Date(),
      });

      return {
        success: true,
        commentId,
        message: "Comment added successfully",
      };
    }),

  /**
   * List all comments for a claim
   * 
   * RBAC: Only insurer tenant members can view comments
   * Returns only non-deleted comments in chronological order
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

      // Verify user is an insurer tenant member
      if (ctx.user.role !== "insurer") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only insurer tenant members can view claim comments",
        });
      }

      // Verify claim exists and belongs to user's tenant
      const [claim] = await db
        .select({
          id: claims.id,
          tenantId: claims.tenantId,
        })
        .from(claims)
        .where(eq(claims.id, input.claimId));

      if (!claim) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Claim ${input.claimId} not found`,
        });
      }

      // Cross-tenant access check
      if (claim.tenantId !== ctx.user.tenantId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Cannot view comments from claims in other tenants",
        });
      }

      // Fetch non-deleted comments in chronological order
      const comments = await db
        .select()
        .from(claimComments)
        .where(
          and(
            eq(claimComments.claimId, input.claimId),
            isNull(claimComments.deletedAt)
          )
        )
        .orderBy(desc(claimComments.createdAt));

      return comments;
    }),

  /**
   * Soft-delete a comment
   * 
   * RBAC: Only the comment author or admin can delete
   * Soft-delete: Sets deletedAt timestamp, preserves data
   * Audit: Logs deletion in workflowAuditTrail
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

      // Verify user is an insurer tenant member
      if (ctx.user.role !== "insurer") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only insurer tenant members can delete comments",
        });
      }

      // Fetch comment to verify ownership and tenant
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
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Comment ${input.commentId} not found`,
        });
      }

      // Check if already deleted
      if (comment.deletedAt) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Comment has already been deleted",
        });
      }

      // Verify claim belongs to user's tenant
      const [claim] = await db
        .select({
          tenantId: claims.tenantId,
        })
        .from(claims)
        .where(eq(claims.id, comment.claimId));

      if (!claim || claim.tenantId !== ctx.user.tenantId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Cannot delete comments from claims in other tenants",
        });
      }

      // Authorization: Only comment author or admin can delete
      const isAuthor = comment.userId === ctx.user.id;
      const isAdmin = ctx.user.insurerRole === "insurer_admin" || ctx.user.insurerRole === "executive";

      if (!isAuthor && !isAdmin) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the comment author or administrators can delete comments",
        });
      }

      // Soft-delete: Set deletedAt timestamp
      await db
        .update(claimComments)
        .set({
          deletedAt: new Date(),
        })
        .where(eq(claimComments.id, input.commentId));

      // Log deletion in audit trail
      await db.insert(workflowAuditTrail).values({
        claimId: comment.claimId,
        userId: ctx.user.id,
        userRole: ctx.user.insurerRole || "claims_processor",
        previousState: null,
        newState: "created", // Using "created" as a placeholder for comment action
        comments: `Comment deleted (ID: ${input.commentId})`,
        metadata: JSON.stringify({ action: "comment_deleted", commentId: input.commentId }),
        createdAt: new Date(),
      });

      return {
        success: true,
        message: "Comment deleted successfully",
      };
    }),
});
