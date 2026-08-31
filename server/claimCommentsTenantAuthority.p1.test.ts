/**
 * Real-database tenant boundary acceptance for comment list and mutation paths.
 * Never replace this with source-text assertions: foreign-tenant denial must be
 * proven through the physical claims.tenant_id and claim_comments.tenant_id rows.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { claimComments, claims, users } from "../drizzle/schema";
import { getDb, getUserByOpenId, upsertUser } from "./db";
import { createClaimComment, getClaimComments, markCommentRead, resolveCommentThread } from "./claim-comments-db";

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const tenantA = `comment-authority-a-${stamp}`;
const tenantB = `comment-authority-b-${stamp}`;
const viewerOpenId = `comment-authority-viewer-${stamp}`;
const authorOpenId = `comment-authority-author-${stamp}`;
let viewerId = 0;
let authorId = 0;
let foreignClaimId = 0;
let foreignCommentId = 0;

beforeAll(async () => {
  const db = await getDb();
  if (!db) throw new Error("Live database is required for claim comment authority coverage");

  await upsertUser({ openId: viewerOpenId, name: "Tenant A Viewer", email: `${viewerOpenId}@test.local`, loginMethod: "test", lastSignedIn: new Date().toISOString() });
  await upsertUser({ openId: authorOpenId, name: "Tenant B Author", email: `${authorOpenId}@test.local`, loginMethod: "test", lastSignedIn: new Date().toISOString() });
  const viewer = await getUserByOpenId(viewerOpenId);
  const author = await getUserByOpenId(authorOpenId);
  if (!viewer || !author) throw new Error("Unable to create real-database comment authority fixtures");
  viewerId = viewer.id;
  authorId = author.id;

  const inserted = await db.insert(claims).values({
    claimNumber: `COMMENT-AUTH-${stamp}`,
    claimantId: 1,
    tenantId: tenantB,
    status: "submitted",
    workflowState: "created",
    createdAt: new Date(),
  });
  foreignClaimId = Number((inserted as any)[0]?.insertId ?? (inserted as any).insertId);
  foreignCommentId = await createClaimComment({
    claimId: foreignClaimId,
    tenantId: tenantB,
    authorUserId: authorId,
    authorRole: "insurer",
    toRoles: [],
    toUserIds: [viewerId],
    toEmails: [],
    commentType: "general",
    requiresResponse: false,
    body: "foreign-tenant comment fixture",
  });
});

afterAll(async () => {
  const db = await getDb();
  if (!db) return;
  await db.execute(`DELETE ccr FROM claim_comment_reads ccr INNER JOIN claim_comments cc ON cc.id = ccr.comment_id WHERE cc.tenant_id IN ('${tenantA}', '${tenantB}')`);
  await db.delete(claimComments).where(inArray(claimComments.id, [foreignCommentId]));
  await db.delete(claims).where(eq(claims.id, foreignClaimId));
  await db.delete(users).where(inArray(users.openId, [viewerOpenId, authorOpenId]));
});

describe("claim comments — real database tenant authority", () => {
  it("does not list a foreign-tenant comment even when it targets the viewing user", async () => {
    const visible = await getClaimComments(foreignClaimId, viewerId, "insurer", `${viewerOpenId}@test.local`, tenantA);
    expect(visible).toEqual([]);
  });

  it("does not mark a foreign-tenant comment as read", async () => {
    await expect(markCommentRead(foreignCommentId, viewerId, tenantA)).resolves.toBe(false);
    const db = await getDb();
    if (!db) throw new Error("Live database unavailable");
    const rows = await db.execute(`SELECT 1 AS read_marker FROM claim_comment_reads WHERE comment_id = ${foreignCommentId} AND user_id = ${viewerId}`);
    expect((rows as any)[0]).toHaveLength(0);
  });

  it("does not resolve or otherwise act on a foreign-tenant comment", async () => {
    await expect(resolveCommentThread(foreignCommentId, viewerId, tenantA)).resolves.toBe(false);
    const db = await getDb();
    if (!db) throw new Error("Live database unavailable");
    const [comment] = await db.select({ isResolved: claimComments.isResolved })
      .from(claimComments)
      .where(and(eq(claimComments.id, foreignCommentId), eq(claimComments.tenantId, tenantB)));
    expect(comment?.isResolved).toBe(0);
  });
});
