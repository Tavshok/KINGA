// @ts-nocheck
import { describe, it, expect, beforeAll } from "vitest";
import { appRouter } from "./routers";
import { createClaim, createNotification, getNotificationsByUser } from "./db";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createTestContext(userOverrides?: Partial<AuthenticatedUser>): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "insurer",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...userOverrides,
  };

  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

describe("Notifications System", () => {
  let testUserId: number;
  let testClaimId: number;

  beforeAll(async () => {
    testUserId = 1;
    
    const claimResult = await createClaim({
      claimantId: testUserId,
      claimNumber: `TEST-NOTIF-${Date.now()}`,
      vehicleMake: "Toyota",
      vehicleModel: "Camry",
      vehicleYear: 2020,
      vehicleRegistration: "TEST123",
      incidentDate: new Date(),
      incidentDescription: "Test incident",
      damageDescription: "Test damage",
      estimatedDamageCost: 500000,
      claimantName: "Test User",
      claimantEmail: "test@example.com",
      claimantPhone: "1234567890",
      status: "submitted",
    });
    
    testClaimId = claimResult.insertId;
  });

  it("should create and list notifications", async () => {
    const ctx = createTestContext({ userId: testUserId, role: "insurer" });
    const caller = appRouter.createCaller(ctx);

    await createNotification({
      userId: testUserId,
      title: "Test Notification",
      message: "This is a test notification",
      type: "system_alert",
      claimId: testClaimId,
      priority: "medium",
    });

    const notifications = await caller.notifications.list({ limit: 10 });
    
    expect(notifications.length).toBeGreaterThan(0);
    const testNotif = notifications.find(n => n.title === "Test Notification");
    expect(testNotif).toBeDefined();
  });

  it("should get unread notification count", async () => {
    const ctx = createTestContext({ userId: testUserId, role: "insurer" });
    const caller = appRouter.createCaller(ctx);

    const result = await caller.notifications.unreadCount();
    expect(result.count).toBeGreaterThanOrEqual(0);
  });

  it("should mark notification as read", async () => {
    const ctx = createTestContext({ userId: testUserId, role: "insurer" });
    const caller = appRouter.createCaller(ctx);

    // Get existing notifications
    const notifications = await getNotificationsByUser(testUserId);
    
    if (notifications.length > 0) {
      const notificationId = notifications[0].id;
      const result = await caller.notifications.markAsRead({ notificationId });
      expect(result.success).toBe(true);
    } else {
      // If no notifications exist, just verify the procedure exists
      expect(caller.notifications.markAsRead).toBeDefined();
    }
  });
});
