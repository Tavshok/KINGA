import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "../db";
import { appRouter } from "../routers";
import { notifications } from "../../drizzle/schema";

/**
 * AUD-P0 notification tenant authority.
 *
 * Regression coverage for the cross-tenant notification read/mutate bug:
 * getAll, getUnreadCount, markAsRead, markAllAsRead, archive, and archiveAll
 * used to scope by ctx.user.id only, with no tenant_id predicate. A user
 * associated with more than one tenant (or whose tenant assignment changed)
 * could read or mutate another tenant's notifications, because the same
 * userId can legitimately own rows stamped with different tenant_id values.
 *
 * These fixtures deliberately give the SAME userId a notification row under
 * two different tenants, plus a legacy row with tenant_id = NULL, to prove
 * the fix scopes strictly by session tenant rather than by user identity
 * alone, and that a session with no tenant is rejected outright.
 */
describe("AUD-P0 notification tenant authority", () => {
  let db: NonNullable<Awaited<ReturnType<typeof getDb>>>;
  let tenantA = "";
  let tenantB = "";
  let sharedUserId = 0;

  let notifAId = 0; // sharedUserId, tenantA, unread
  let notifAReadId = 0; // sharedUserId, tenantA, read (for archive/archiveAll)
  let notifBId = 0; // sharedUserId, tenantB, unread
  let notifBReadId = 0; // sharedUserId, tenantB, read
  let notifLegacyNullTenantId = 0; // sharedUserId, tenant_id = NULL (pre-Epic-5-B row)

  const contextFor = (userId: number, tenantId: string | undefined) => ({
    user: { id: userId, role: "insurer", tenantId, openId: `notif-authority-${userId}-${tenantId ?? "none"}`, name: "Notification authority fixture", isUnregisteredClaimant: 0 },
    db,
    req: {} as any,
    res: {} as any,
  });

  beforeAll(async () => {
    const connection = await getDb();
    if (!connection) throw new Error("Database unavailable for notification authority test");
    db = connection;
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    tenantA = `test-notif-authority-a-${stamp}`;
    tenantB = `test-notif-authority-b-${stamp}`;
    // Same physical user id under two tenants — the exact shape of the bug:
    // a user associated with more than one tenant, or reassigned between them.
    sharedUserId = 900000000 + Math.floor(Math.random() * 90000000);

    const now = new Date().toISOString().slice(0, 19).replace("T", " ");

    const [insA] = await db.insert(notifications).values({
      userId: sharedUserId,
      tenantId: tenantA,
      title: "Tenant A unread",
      message: "belongs to tenant A",
      type: "system_alert",
      priority: "medium",
    });
    notifAId = insA.insertId;

    const [insAread] = await db.insert(notifications).values({
      userId: sharedUserId,
      tenantId: tenantA,
      title: "Tenant A read",
      message: "belongs to tenant A, already read",
      type: "system_alert",
      priority: "medium",
      isRead: 1,
      readAt: now,
    });
    notifAReadId = insAread.insertId;

    const [insB] = await db.insert(notifications).values({
      userId: sharedUserId,
      tenantId: tenantB,
      title: "Tenant B unread",
      message: "belongs to tenant B",
      type: "system_alert",
      priority: "medium",
    });
    notifBId = insB.insertId;

    const [insBread] = await db.insert(notifications).values({
      userId: sharedUserId,
      tenantId: tenantB,
      title: "Tenant B read",
      message: "belongs to tenant B, already read",
      type: "system_alert",
      priority: "medium",
      isRead: 1,
      readAt: now,
    });
    notifBReadId = insBread.insertId;

    // Simulates a notification written before the write-path fix (createNotification /
    // notifyTenantProcessors previously never persisted tenant_id).
    const [insLegacy] = await db.insert(notifications).values({
      userId: sharedUserId,
      tenantId: null as unknown as string,
      title: "Legacy untenanted",
      message: "written before the tenant_id backfill",
      type: "system_alert",
      priority: "medium",
    });
    notifLegacyNullTenantId = insLegacy.insertId;
  });

  afterAll(async () => {
    if (!db) return;
    const ids = [notifAId, notifAReadId, notifBId, notifBReadId, notifLegacyNullTenantId].filter(Boolean);
    if (ids.length > 0) {
      await db.delete(notifications).where(inArray(notifications.id, ids));
    }
  });

  it("rejects every flagged procedure for a session with no tenant scope", async () => {
    const tenantless = appRouter.createCaller(contextFor(sharedUserId, undefined));
    await expect(tenantless.notifications.getAll({})).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(tenantless.notifications.getUnreadCount()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(tenantless.notifications.markAsRead({ notificationId: notifAId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(tenantless.notifications.markAllAsRead()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(tenantless.notifications.archive({ notificationId: notifAId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(tenantless.notifications.archiveAll()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("getAll returns only the session tenant's notifications for the same userId", async () => {
    const asTenantA = appRouter.createCaller(contextFor(sharedUserId, tenantA));
    const resultA = await asTenantA.notifications.getAll({ filter: "all", limit: 200 });
    const idsA = resultA.map((n: { id: number }) => n.id);
    expect(idsA).toContain(notifAId);
    expect(idsA).toContain(notifAReadId);
    expect(idsA).not.toContain(notifBId);
    expect(idsA).not.toContain(notifBReadId);
    expect(idsA).not.toContain(notifLegacyNullTenantId);

    const asTenantB = appRouter.createCaller(contextFor(sharedUserId, tenantB));
    const resultB = await asTenantB.notifications.getAll({ filter: "all", limit: 200 });
    const idsB = resultB.map((n: { id: number }) => n.id);
    expect(idsB).toContain(notifBId);
    expect(idsB).not.toContain(notifAId);
    expect(idsB).not.toContain(notifAReadId);
    expect(idsB).not.toContain(notifLegacyNullTenantId);
  });

  it("getUnreadCount reflects only the session tenant's unread notifications", async () => {
    const asTenantA = appRouter.createCaller(contextFor(sharedUserId, tenantA));
    const { count: countA } = await asTenantA.notifications.getUnreadCount();
    expect(countA).toBe(1); // only notifAId is unread+unarchived for tenant A

    const asTenantB = appRouter.createCaller(contextFor(sharedUserId, tenantB));
    const { count: countB } = await asTenantB.notifications.getUnreadCount();
    expect(countB).toBe(1); // only notifBId is unread+unarchived for tenant B
  });

  it("markAsRead cannot mark a foreign tenant's notification as read, and leaves it unchanged", async () => {
    const [before] = await db.select({ readAt: notifications.readAt }).from(notifications).where(eq(notifications.id, notifBId));
    expect(before?.readAt).toBeNull();

    const asTenantA = appRouter.createCaller(contextFor(sharedUserId, tenantA));
    // Same userId, but notifBId belongs to tenant B — must be a no-op, not an error
    // (avoids leaking whether the id exists), and must not mutate the row.
    await expect(asTenantA.notifications.markAsRead({ notificationId: notifBId })).resolves.toMatchObject({ success: true });

    const [after] = await db.select({ readAt: notifications.readAt }).from(notifications).where(eq(notifications.id, notifBId));
    expect(after?.readAt).toBeNull();

    // Sanity: the same procedure DOES work for a notification actually owned by the session tenant.
    const asTenantB = appRouter.createCaller(contextFor(sharedUserId, tenantB));
    await asTenantB.notifications.markAsRead({ notificationId: notifBId });
    const [afterOwn] = await db.select({ readAt: notifications.readAt }).from(notifications).where(eq(notifications.id, notifBId));
    expect(afterOwn?.readAt).not.toBeNull();
  });

  it("markAllAsRead only touches the session tenant's unread notifications for the shared userId", async () => {
    // Re-seed a fresh unread row for tenant A so this test doesn't depend on ordering.
    const [insA2] = await db.insert(notifications).values({
      userId: sharedUserId,
      tenantId: tenantA,
      title: "Tenant A unread #2",
      message: "second unread row for markAllAsRead coverage",
      type: "system_alert",
      priority: "medium",
    });
    const notifA2Id = insA2.insertId;
    try {
      const [beforeB] = await db.select({ readAt: notifications.readAt }).from(notifications).where(eq(notifications.id, notifBId));

      const asTenantA = appRouter.createCaller(contextFor(sharedUserId, tenantA));
      await asTenantA.notifications.markAllAsRead();

      const [afterA2] = await db.select({ readAt: notifications.readAt }).from(notifications).where(eq(notifications.id, notifA2Id));
      expect(afterA2?.readAt).not.toBeNull();

      // Tenant B's row for the same user must be untouched by tenant A's markAllAsRead.
      const [afterB] = await db.select({ readAt: notifications.readAt }).from(notifications).where(eq(notifications.id, notifBId));
      expect(afterB?.readAt).toBe(beforeB?.readAt);
    } finally {
      await db.delete(notifications).where(eq(notifications.id, notifA2Id));
    }
  });

  it("archive cannot archive a foreign tenant's notification, and leaves it unchanged", async () => {
    const [before] = await db.select({ archivedAt: notifications.archivedAt }).from(notifications).where(eq(notifications.id, notifBReadId));
    expect(before?.archivedAt).toBeNull();

    const asTenantA = appRouter.createCaller(contextFor(sharedUserId, tenantA));
    await expect(asTenantA.notifications.archive({ notificationId: notifBReadId })).resolves.toMatchObject({ success: true });

    const [after] = await db.select({ archivedAt: notifications.archivedAt }).from(notifications).where(eq(notifications.id, notifBReadId));
    expect(after?.archivedAt).toBeNull();
  });

  it("archiveAll only archives the session tenant's read notifications for the shared userId", async () => {
    const asTenantA = appRouter.createCaller(contextFor(sharedUserId, tenantA));
    await asTenantA.notifications.archiveAll();

    const [afterAread] = await db.select({ archivedAt: notifications.archivedAt }).from(notifications).where(eq(notifications.id, notifAReadId));
    expect(afterAread?.archivedAt).not.toBeNull();

    // Tenant B's already-read row for the same user must remain unarchived.
    const [afterBread] = await db.select({ archivedAt: notifications.archivedAt }).from(notifications).where(eq(notifications.id, notifBReadId));
    expect(afterBread?.archivedAt).toBeNull();
  });

  it("a legacy row with tenant_id = NULL is invisible to every tenant-scoped session", async () => {
    const asTenantA = appRouter.createCaller(contextFor(sharedUserId, tenantA));
    const resultA = await asTenantA.notifications.getAll({ filter: "all", limit: 200 });
    expect(resultA.map((n: { id: number }) => n.id)).not.toContain(notifLegacyNullTenantId);

    const asTenantB = appRouter.createCaller(contextFor(sharedUserId, tenantB));
    const resultB = await asTenantB.notifications.getAll({ filter: "all", limit: 200 });
    expect(resultB.map((n: { id: number }) => n.id)).not.toContain(notifLegacyNullTenantId);
  });
});
