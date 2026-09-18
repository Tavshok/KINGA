// @ts-nocheck
/**
 * Tenant Management Router Test Suite
 *
 * Covers tenant-scoped list, role configuration, and update paths using only
 * in-memory fixtures. Tenant scope is an authorization input, not a global
 * enumeration permission.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  tenant: {
    id: "tenant-router-fixture",
    name: "Test Insurance Co",
    displayName: "Test Insurance Co",
    domain: "test.insurance.com",
    isActive: 1,
  },
  roleConfigs: [{ tenantId: "tenant-router-fixture", roleKey: "claims_manager", isEnabled: true }],
  getDb: vi.fn(),
  getTenantRoleConfig: vi.fn(),
  updateTenantConfig: vi.fn(),
}));

vi.mock("../db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../db")>()),
  getDb: fixture.getDb,
}));

vi.mock("../services/tenant-config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/tenant-config")>()),
  getTenantRoleConfig: fixture.getTenantRoleConfig,
  updateTenantConfig: fixture.updateTenantConfig,
}));

import { appRouter } from "../routers";
import type { Context } from "../_core/context";

const testTenantId = fixture.tenant.id;
const createMockContext = (): Context => ({
  user: {
    id: 1,
    openId: "tenant-router-admin",
    name: "Test Admin",
    email: "admin@test.com",
    role: "admin",
    tenantId: testTenantId,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
});

const tenantDb = {
  select: vi.fn(() => ({
    from: () => ({
      where: async () => [{ ...fixture.tenant }],
    }),
  })),
};

beforeEach(() => {
  fixture.tenant.name = "Test Insurance Co";
  fixture.tenant.displayName = "Test Insurance Co";
  fixture.getDb.mockResolvedValue(tenantDb);
  fixture.getTenantRoleConfig.mockResolvedValue(fixture.roleConfigs.map((config) => ({ ...config })));
  fixture.updateTenantConfig.mockImplementation(async (_tenantId, updates) => {
    Object.assign(fixture.tenant, updates);
    return { ...fixture.tenant };
  });
});

describe("Tenant Management Router", () => {
  it("returns only the caller's tenant", async () => {
    const caller = appRouter.createCaller(createMockContext());
    const result = await caller.tenant.list();

    expect(result).toEqual([{ ...fixture.tenant }]);
  });

  it("returns role configuration for the caller's tenant", async () => {
    const caller = appRouter.createCaller(createMockContext());
    const result = await caller.tenant.getRoleConfig({ tenantId: testTenantId });

    expect(result).toEqual([{ ...fixture.roleConfigs[0] }]);
    expect(fixture.getTenantRoleConfig).toHaveBeenCalledWith(testTenantId);
  });

  it("updates the caller's tenant configuration", async () => {
    const caller = appRouter.createCaller(createMockContext());
    const result = await caller.tenant.update({
      tenantId: testTenantId,
      name: "Updated Insurance Co",
    });

    expect(result.name).toBe("Updated Insurance Co");
    expect(fixture.updateTenantConfig).toHaveBeenCalledWith(testTenantId, { name: "Updated Insurance Co" });
  });
});
