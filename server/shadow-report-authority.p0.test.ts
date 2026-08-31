import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";

function callerFor(role: string, tenantId: string | null, id: number) {
  return appRouter.createCaller({
    user: {
      id,
      openId: `shadow-authority-${id}`,
      name: "Shadow authority fixture",
      email: `shadow-authority-${id}@example.test`,
      role,
      tenantId,
      isActive: 1,
    },
    req: { headers: {} },
    res: {},
  } as any);
}

describe("P0 Shadow report authority", () => {
  it("rejects an ordinary tenant user before it can request a platform-wide Shadow report", async () => {
    const ordinaryTenantUser = callerFor("insurer", "shadow-test-tenant-a", 901001);

    await expect(
      ordinaryTenantUser.aiAssessments.generateShadowReport({ role: "claims_manager", periodDays: 7 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      ordinaryTenantUser.aiAssessments.generateAllShadowReports({ periodDays: 7 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects an ordinary tenant user before it can read global Shadow observations", async () => {
    const ordinaryTenantUser = callerFor("insurer", "shadow-test-tenant-a", 901002);

    await expect(ordinaryTenantUser.aiAssessments.getAllShadowObservations()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      ordinaryTenantUser.aiAssessments.getShadowObservation({ userId: "foreign-observation-user" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows a platform super administrator to retain global, observation-only Shadow oversight", async () => {
    const platformSuperAdmin = callerFor("platform_super_admin", null, 901003);

    await expect(
      platformSuperAdmin.aiAssessments.generateShadowReport({ role: "executive", periodDays: 1 }),
    ).resolves.toMatchObject({ report_type: "executive", mode: "shadow", recommended_action: "none" });
    await expect(platformSuperAdmin.aiAssessments.getAllShadowObservations()).resolves.toBeInstanceOf(Array);
  });
});
