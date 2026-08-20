import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
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
 * Each test uses its own freshly generated userId (never reused across
 * tests) so that no test's assertions can be satisfied by another test's
 * leftover rows — every `it` below was independently verified to fail
 * against the pre-fix router (run individually via `vitest -t "<name>"`,
 * not just as part of the full-suite run) before this fix was written.
 */
describe("AUD-P0 notification tenant authority", () => {
  let db: NonNullable<Awaited<ReturnType<typeof getDb>>>;
  let tenantA = "";
  let tenantB = "";
  let userIdSeed = 0;

  let touchedUserIds: number[] = [];

  const freshUserId = () => {
    userIdSeed += 1;
    const id = 900000000 + userIdSeed * 1000 + Math.floor(Math.random() * 999);
    touchedUserIds.push(id);
    return id;
  };

  const contextFor = (userId: number, tenantId: string | undefined) => ({
    user: { id: userId, role: "insurer", tenantId, openId: `notif-authority-${userId}-${tenantId ?? "none"}`, name: "Notification authority fixture", isUnregisteredClaimant: 0 },
    db,
    req: {} as any,
    res: {} as any,
  });

  const insertNotif = async (overrides: {
    userId: number;
    tenantId: string | null;
    isRead?: boolean;
    title?: string;
  }) => {
    const now = new Date().toISOString().slice(0, 19).replace("T", " ");
    const [ins] = await db.insert(notifications).values({
      userId: overrides.userId,
      tenantId: overrides.tenantId as unknown as string,
      title: overrides.title ?? "fixture notification",
      message: "fixture message",
      type: "system_alert",
      priority: "medium",
      isRead: overrides.isRead ? 1 : 0,
      readAt: overrides.isRead ? now : null,
    });
    return ins.insertId;
  };

  beforeAll(async () => {
    const connection = await getDb();
    if (!connection) throw new Error("Database unavailable for notification authority test");
    db = connection;
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    tenantA = `test-notif-authority-a-${stamp}`;
    tenantB = `test-notif-authority-b-${stamp}`;
  });

  afterEach(async () => {
    if (!db || touchedUserIds.length === 0) return;
    await db.delete(notifications).where(inArray(notifications.userId, touchedUserIds));
    touchedUserIds = [];
  });

  it("rejects every flagged procedure for a session with no tenant scope", async () => {
    const userId = freshUserId();
    const notifId = await insertNotif({ userId, tenantId: tenantA });
    const tenantless = appRouter.createCaller(contextFor(userId, undefined));
    await expect(tenantless.notifications.getAll({})).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(tenantless.notifications.getUnreadCount()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(tenantless.notifications.markAsRead({ notificationId: notifId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(tenantless.notifications.markAllAsRead()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(tenantless.notifications.archive({ notificationId: notifId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(tenantless.notifications.archiveAll()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("getAll returns only the session tenant's notifications for the same userId", async () => {
    // Same physical user id under two tenants — the exact shape of the bug:
    // a user associated with more than one tenant, or reassigned between them.
    const userId = freshUserId();
    const notifAId = await insertNotif({ userId, tenantId: tenantA, title: "Tenant A unread" });
    const notifAReadId = await insertNotif({ userId, tenantId: tenantA, isRead: true, title: "Tenant A read" });
    const notifBId = await insertNotif({ userId, tenantId: tenantB, title: "Tenant B unread" });
    const notifBReadId = await insertNotif({ userId, tenantId: tenantB, isRead: true, title: "Tenant B read" });

    const asTenantA = appRouter.createCaller(contextFor(userId, tenantA));
    const resultA = await asTenantA.notifications.getAll({ filter: "all", limit: 200 });
    const idsA = resultA.map((n: { id: number }) => n.id);
    expect(idsA).toContain(notifAId);
    expect(idsA).toContain(notifAReadId);
    expect(idsA).not.toContain(notifBId);
    expect(idsA).not.toContain(notifBReadId);

    const asTenantB = appRouter.createCaller(contextFor(userId, tenantB));
    const resultB = await asTenantB.notifications.getAll({ filter: "all", limit: 200 });
    const idsB = resultB.map((n: { id: number }) => n.id);
    expect(idsB).toContain(notifBId);
    expect(idsB).not.toContain(notifAId);
    expect(idsB).not.toContain(notifAReadId);
  });

  it("getUnreadCount reflects only the session tenant's unread notifications", async () => {
    const userId = freshUserId();
    await insertNotif({ userId, tenantId: tenantA, title: "Tenant A unread" });
    await insertNotif({ userId, tenantId: tenantA, isRead: true, title: "Tenant A read (should not count)" });
    await insertNotif({ userId, tenantId: tenantB, title: "Tenant B unread" });
    await insertNotif({ userId, tenantId: tenantB, title: "Tenant B unread #2" });

    const asTenantA = appRouter.createCaller(contextFor(userId, tenantA));
    const { count: countA } = await asTenantA.notifications.getUnreadCount();
    expect(countA).toBe(1); // only one unread+unarchived row belongs to tenant A

    const asTenantB = appRouter.createCaller(contextFor(userId, tenantB));
    const { count: countB } = await asTenantB.notifications.getUnreadCount();
    expect(countB).toBe(2); // both unread+unarchived rows belong to tenant B
  });

  it("markAsRead cannot mark a foreign tenant's notification as read, and leaves it unchanged", async () => {
    const userId = freshUserId();
    const notifBId = await insertNotif({ userId, tenantId: tenantB, title: "Tenant B unread" });

    const [before] = await db.select({ readAt: notifications.readAt }).from(notifications).where(eq(notifications.id, notifBId));
    expect(before?.readAt).toBeNull();

    const asTenantA = appRouter.createCaller(contextFor(userId, tenantA));
    // Same userId, but notifBId belongs to tenant B — must be a no-op, not an error
    // (avoids leaking whether the id exists), and must not mutate the row.
    await expect(asTenantA.notifications.markAsRead({ notificationId: notifBId })).resolves.toMatchObject({ success: true });

    const [after] = await db.select({ readAt: notifications.readAt }).from(notifications).where(eq(notifications.id, notifBId));
    expect(after?.readAt).toBeNull();

    // Sanity: the same procedure DOES work for a notification actually owned by the session tenant.
    const asTenantB = appRouter.createCaller(contextFor(userId, tenantB));
    await asTenantB.notifications.markAsRead({ notificationId: notifBId });
    const [afterOwn] = await db.select({ readAt: notifications.readAt }).from(notifications).where(eq(notifications.id, notifBId));
    expect(afterOwn?.readAt).not.toBeNull();
  });

  it("markAllAsRead only touches the session tenant's unread notifications for the shared userId", async () => {
    const userId = freshUserId();
    const notifAId = await insertNotif({ userId, tenantId: tenantA, title: "Tenant A unread" });
    const notifBId = await insertNotif({ userId, tenantId: tenantB, title: "Tenant B unread" });

    const asTenantA = appRouter.createCaller(contextFor(userId, tenantA));
    await asTenantA.notifications.markAllAsRead();

    const [afterA] = await db.select({ readAt: notifications.readAt }).from(notifications).where(eq(notifications.id, notifAId));
    expect(afterA?.readAt).not.toBeNull();

    // Tenant B's row for the same user must be untouched by tenant A's markAllAsRead.
    const [afterB] = await db.select({ readAt: notifications.readAt }).from(notifications).where(eq(notifications.id, notifBId));
    expect(afterB?.readAt).toBeNull();
  });

  it("archive cannot archive a foreign tenant's notification, and leaves it unchanged", async () => {
    const userId = freshUserId();
    const notifBReadId = await insertNotif({ userId, tenantId: tenantB, isRead: true, title: "Tenant B read" });

    const [before] = await db.select({ archivedAt: notifications.archivedAt }).from(notifications).where(eq(notifications.id, notifBReadId));
    expect(before?.archivedAt).toBeNull();

    const asTenantA = appRouter.createCaller(contextFor(userId, tenantA));
    await expect(asTenantA.notifications.archive({ notificationId: notifBReadId })).resolves.toMatchObject({ success: true });

    const [after] = await db.select({ archivedAt: notifications.archivedAt }).from(notifications).where(eq(notifications.id, notifBReadId));
    expect(after?.archivedAt).toBeNull();
  });

  it("archiveAll only archives the session tenant's read notifications for the shared userId", async () => {
    const userId = freshUserId();
    const notifAReadId = await insertNotif({ userId, tenantId: tenantA, isRead: true, title: "Tenant A read" });
    const notifBReadId = await insertNotif({ userId, tenantId: tenantB, isRead: true, title: "Tenant B read" });

    const asTenantA = appRouter.createCaller(contextFor(userId, tenantA));
    await asTenantA.notifications.archiveAll();

    const [afterAread] = await db.select({ archivedAt: notifications.archivedAt }).from(notifications).where(eq(notifications.id, notifAReadId));
    expect(afterAread?.archivedAt).not.toBeNull();

    // Tenant B's already-read row for the same user must remain unarchived.
    const [afterBread] = await db.select({ archivedAt: notifications.archivedAt }).from(notifications).where(eq(notifications.id, notifBReadId));
    expect(afterBread?.archivedAt).toBeNull();
  });

  it("a legacy row with tenant_id = NULL is invisible to every tenant-scoped session", async () => {
    // Simulates a notification written before the write-path fix (createNotification /
    // notifyTenantProcessors previously never persisted tenant_id).
    const userId = freshUserId();
    const notifLegacyId = await insertNotif({ userId, tenantId: null, title: "Legacy untenanted" });

    const asTenantA = appRouter.createCaller(contextFor(userId, tenantA));
    const resultA = await asTenantA.notifications.getAll({ filter: "all", limit: 200 });
    expect(resultA.map((n: { id: number }) => n.id)).not.toContain(notifLegacyId);

    const asTenantB = appRouter.createCaller(contextFor(userId, tenantB));
    const resultB = await asTenantB.notifications.getAll({ filter: "all", limit: 200 });
    expect(resultB.map((n: { id: number }) => n.id)).not.toContain(notifLegacyId);
  });
});
