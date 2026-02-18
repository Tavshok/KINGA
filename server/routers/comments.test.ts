/**
 * Comments Router Unit Tests
 * 
 * Tests:
 * - Unauthorized access (non-insurer users)
 * - Cross-tenant access attempts
 * - Successful comment creation
 * - Successful comment listing
 * - Successful comment deletion
 */

import { describe, it, expect } from "vitest";
import { commentsRouter } from "./comments";
import { claims, claimComments, workflowAuditTrail } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { extractInsertId } from "../utils/drizzle-helpers";

// Helper function to create a test claim
async function createTestClaim(tenantId: string = "test-tenant-1") {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const uniqueClaimNumber = `TEST-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  const claimResult = await db.insert(claims).values({
    claimNumber: uniqueClaimNumber,
    claimantId: 1,
    tenantId,
    status: "submitted",
    workflowState: "created",
    createdAt: new Date(),
  });

  // Safely extract inserted claim ID
  return extractInsertId(claimResult);
}

describe("Comments Router", () => {
  describe("addComment", () => {
    it("should reject non-insurer users", async () => {
      const claimId = await createTestClaim();

      const ctx = {
        user: {
          id: 100,
          role: "claimant" as const,
          tenantId: "test-tenant-1",
          insurerRole: null,
        },
      };

      const caller = commentsRouter.createCaller(ctx);

      await expect(
        caller.addComment({
          claimId,
          content: "This should fail",
        })
      ).rejects.toThrow("Only insurer tenant members can add comments to claims");
    });

    it("should reject cross-tenant access attempts", async () => {
      const claimId = await createTestClaim("tenant-1");

      const ctx = {
        user: {
          id: 101,
          role: "insurer" as const,
          tenantId: "tenant-2", // Different tenant
          insurerRole: "claims_processor" as const,
        },
      };

      const caller = commentsRouter.createCaller(ctx);

      await expect(
        caller.addComment({
          claimId,
          content: "Cross-tenant comment attempt",
        })
      ).rejects.toThrow("Cannot add comments to claims from other tenants");
    });

    it("should successfully create a comment for authorized user", async () => {
      const claimId = await createTestClaim();

      const ctx = {
        user: {
          id: 102,
          role: "insurer" as const,
          tenantId: "test-tenant-1",
          insurerRole: "claims_processor" as const,
        },
      };

      const caller = commentsRouter.createCaller(ctx);

      const result = await caller.addComment({
        claimId,
        content: "This is a valid comment",
      });

      expect(result.success).toBe(true);
      expect(result.commentId).toBeGreaterThan(0);

      // Verify comment in database
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [comment] = await db
        .select()
        .from(claimComments)
        .where(eq(claimComments.id, result.commentId));

      expect(comment).toBeDefined();
      expect(comment.content).toBe("This is a valid comment");
      expect(comment.userId).toBe(102);

      // Verify inserted comment ID matches stored record
      expect(comment.id).toBe(result.commentId);

      // Verify audit trail references correct commentId
      const [auditEntry] = await db
        .select()
        .from(workflowAuditTrail)
        .where(eq(workflowAuditTrail.claimId, claimId))
        .orderBy(workflowAuditTrail.createdAt)
        .limit(1);

      expect(auditEntry).toBeDefined();
      const metadata = JSON.parse(auditEntry.metadata || "{}");
      expect(metadata.commentId).toBe(result.commentId);
      expect(metadata.action).toBe("comment_added");
    });
  });

  describe("listComments", () => {
    it("should reject non-insurer users", async () => {
      const claimId = await createTestClaim();

      const ctx = {
        user: {
          id: 105,
          role: "assessor" as const,
          tenantId: "test-tenant-1",
          insurerRole: null,
        },
      };

      const caller = commentsRouter.createCaller(ctx);

      await expect(
        caller.listComments({ claimId })
      ).rejects.toThrow("Only insurer tenant members can view claim comments");
    });

    it("should reject cross-tenant access attempts", async () => {
      const claimId = await createTestClaim("tenant-1");

      const ctx = {
        user: {
          id: 106,
          role: "insurer" as const,
          tenantId: "tenant-2", // Different tenant
          insurerRole: "executive" as const,
        },
      };

      const caller = commentsRouter.createCaller(ctx);

      await expect(
        caller.listComments({ claimId })
      ).rejects.toThrow("Cannot view comments from claims in other tenants");
    });

    it("should return all non-deleted comments for authorized user", async () => {
      const claimId = await createTestClaim();

      // Create comments
      const createCtx = {
        user: {
          id: 107,
          role: "insurer" as const,
          tenantId: "test-tenant-1",
          insurerRole: "claims_processor" as const,
        },
      };

      const createCaller = commentsRouter.createCaller(createCtx);

      await createCaller.addComment({
        claimId,
        content: "First comment",
      });

      await createCaller.addComment({
        claimId,
        content: "Second comment",
      });

      // List comments
      const comments = await createCaller.listComments({ claimId });

      expect(comments.length).toBeGreaterThanOrEqual(2);
      expect(comments.some((c) => c.content === "First comment")).toBe(true);
      expect(comments.some((c) => c.content === "Second comment")).toBe(true);
    });
  });

  describe("deleteComment", () => {
    it("should reject non-insurer users", async () => {
      const claimId = await createTestClaim();

      // Create comment
      const createCtx = {
        user: {
          id: 109,
          role: "insurer" as const,
          tenantId: "test-tenant-1",
          insurerRole: "claims_processor" as const,
        },
      };

      const createCaller = commentsRouter.createCaller(createCtx);
      const { commentId } = await createCaller.addComment({
        claimId,
        content: "Comment to delete",
      });

      // Try to delete as non-insurer
      const deleteCtx = {
        user: {
          id: 110,
          role: "panel_beater" as const,
          tenantId: "test-tenant-1",
          insurerRole: null,
        },
      };

      const deleteCaller = commentsRouter.createCaller(deleteCtx);

      await expect(
        deleteCaller.deleteComment({ commentId })
      ).rejects.toThrow("Only insurer tenant members can delete comments");
    });

    it("should reject deletion by non-author non-admin", async () => {
      const claimId = await createTestClaim();

      // Create comment
      const createCtx = {
        user: {
          id: 111,
          role: "insurer" as const,
          tenantId: "test-tenant-1",
          insurerRole: "claims_processor" as const,
        },
      };

      const createCaller = commentsRouter.createCaller(createCtx);
      const { commentId } = await createCaller.addComment({
        claimId,
        content: "Comment to delete",
      });

      // Try to delete as different user (not admin)
      const deleteCtx = {
        user: {
          id: 112,
          role: "insurer" as const,
          tenantId: "test-tenant-1",
          insurerRole: "claims_processor" as const,
        },
      };

      const deleteCaller = commentsRouter.createCaller(deleteCtx);

      await expect(
        deleteCaller.deleteComment({ commentId })
      ).rejects.toThrow("Only the comment author or administrators can delete comments");
    });

    it("should allow comment author to delete their own comment", async () => {
      const claimId = await createTestClaim();

      const ctx = {
        user: {
          id: 113,
          role: "insurer" as const,
          tenantId: "test-tenant-1",
          insurerRole: "claims_processor" as const,
        },
      };

      const caller = commentsRouter.createCaller(ctx);

      // Create comment
      const { commentId } = await caller.addComment({
        claimId,
        content: "Comment to delete",
      });

      // Delete own comment
      const result = await caller.deleteComment({ commentId });

      expect(result.success).toBe(true);

      // Verify soft-delete
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [comment] = await db
        .select()
        .from(claimComments)
        .where(eq(claimComments.id, commentId));

      expect(comment.deletedAt).not.toBeNull();
    });

    it("should allow admin to delete any comment", async () => {
      const claimId = await createTestClaim();

      // Create comment as regular user
      const createCtx = {
        user: {
          id: 114,
          role: "insurer" as const,
          tenantId: "test-tenant-1",
          insurerRole: "claims_processor" as const,
        },
      };

      const createCaller = commentsRouter.createCaller(createCtx);
      const { commentId } = await createCaller.addComment({
        claimId,
        content: "Comment to delete",
      });

      // Delete as admin
      const adminCtx = {
        user: {
          id: 115,
          role: "insurer" as const,
          tenantId: "test-tenant-1",
          insurerRole: "insurer_admin" as const,
        },
      };

      const adminCaller = commentsRouter.createCaller(adminCtx);
      const result = await adminCaller.deleteComment({ commentId });

      expect(result.success).toBe(true);
    });
  });
});
