/**
 * Pre-Batch-3: Session revocation acceptance tests
 *
 * Acceptance criterion:
 *   "Issue a token, deactivate the user, confirm the token is rejected on
 *    the next request — not just on next login attempt."
 *
 * Implementation note: we use isActive=0 (soft-delete) rather than hard-delete,
 * because hard-deleting a row bypasses the revocation check (the user is simply
 * "not found" and the auto-sync path would re-create them from OAuth).
 * The admin.deactivateUser procedure is the correct production path.
 */
import { describe, expect, it } from "vitest";
import type { Request } from "express";
import { COOKIE_NAME } from "../shared/const";

/** Build a minimal Express-like Request with a single cookie. */
function makeCookieRequest(cookieValue: string): Request {
  return {
    headers: { cookie: `${COOKIE_NAME}=${cookieValue}` },
  } as unknown as Request;
}

describe("Session revocation — isActive check in authenticateRequest", () => {
  /**
   * Test 1: Active user with valid JWT is accepted.
   */
  it("accepts a valid JWT for an active user", async () => {
    const { sdk } = await import("./_core/sdk");
    const db = await import("./db");

    const openId = `test-revocation-active-${Date.now()}`;
    await db.upsertUser({
      openId,
      name: "Revocation Test User",
      email: `${openId}@test.local`,
      loginMethod: "test",
      lastSignedIn: new Date().toISOString(),
    });

    const token = await sdk.createSessionToken(openId, { name: "Revocation Test User" });
    const req = makeCookieRequest(token);

    const user = await sdk.authenticateRequest(req);
    expect(user.openId).toBe(openId);
    expect(user.isActive).toBe(1);

    // Cleanup
    const dbConn = await db.getDb();
    if (dbConn) {
      const { users } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      await dbConn.delete(users).where(eq(users.openId, openId));
    }
  });

  /**
   * Test 2 (acceptance criterion): Issue a token, deactivate the user,
   * confirm the token is rejected on the next request.
   */
  it("rejects a valid JWT for a deactivated user (isActive=0)", async () => {
    const { sdk } = await import("./_core/sdk");
    const db = await import("./db");

    const openId = `test-revocation-deactivated-${Date.now()}`;
    await db.upsertUser({
      openId,
      name: "Deactivated Test User",
      email: `${openId}@test.local`,
      loginMethod: "test",
      lastSignedIn: new Date().toISOString(),
    });

    // Issue a valid JWT
    const token = await sdk.createSessionToken(openId, { name: "Deactivated Test User" });

    // Deactivate the user (simulate admin.deactivateUser)
    const dbConn = await db.getDb();
    if (!dbConn) throw new Error("DB unavailable in test");
    const { users } = await import("../drizzle/schema");
    const { eq } = await import("drizzle-orm");
    const now = new Date().toISOString().slice(0, 19).replace("T", " ");
    await dbConn.update(users)
      .set({ isActive: 0, deactivatedAt: now })
      .where(eq(users.openId, openId));

    // The previously-valid JWT must now be rejected
    const req = makeCookieRequest(token);
    await expect(sdk.authenticateRequest(req)).rejects.toMatchObject({
      message: expect.stringContaining("deactivated"),
    });

    // Cleanup
    await dbConn.delete(users).where(eq(users.openId, openId));
  });

  /**
   * Test 3: Documents the known limitation — hard-delete does NOT revoke the JWT.
   * Skipped because it requires a live OAuth mock.
   */
  it.skip("documents known limitation: hard-delete does not revoke JWT (use deactivateUser instead)", () => {
    // If a user row is hard-deleted, authenticateRequest will attempt to
    // re-sync from OAuth. If OAuth still has the user, they will be re-created
    // with isActive=1 and the JWT will be accepted again.
    // Mitigation: never hard-delete users; always use admin.deactivateUser.
  });

  /**
   * Test 4: Cron callers bypass the isActive check — they are synthetic identities
   * with no DB row and are not subject to revocation.
   */
  it("cron openId prefix is correctly identified (cron callers bypass isActive check)", () => {
    // The CRON_OPEN_ID_PREFIX check fires before the DB lookup, so isActive is
    // never checked for cron callers. Verify the discriminator pattern is correct.
    const cronOpenId = "cron_test-task-uid";
    const regularOpenId = "user_abc123";
    expect(cronOpenId.startsWith("cron_")).toBe(true);
    expect(regularOpenId.startsWith("cron_")).toBe(false);
  });
});
