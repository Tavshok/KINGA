import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolve: vi.fn(),
  validate: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("./p0TenantBoundary", () => ({
  resolveP0TenantScope: mocks.resolve,
  validateP0TenantScope: mocks.validate,
  auditP0CrossTenantAccess: mocks.audit,
}));

import { requireTenantAdministrationScope } from "./tenantAdministration";

const admin = { user: { id: 1, role: "admin", tenantId: "tenant-a" }, req: { headers: {} } } as any;
const superAdmin = { user: { id: 2, role: "platform_super_admin", tenantId: "tenant-a" }, req: { headers: {} } } as any;
const ordinary = { user: { id: 3, role: "insurer", tenantId: "tenant-a" }, req: { headers: {} } } as any;

describe("P0 Package 4 — tenant administration scope", () => {
  beforeEach(() => {
    mocks.resolve.mockReset();
    mocks.validate.mockReset();
    mocks.audit.mockReset();
    mocks.resolve.mockReturnValue({ tenantId: "tenant-b", isPlatformSuperAdmin: true, isCrossTenant: true });
  });

  it("denies an ordinary insurer user", async () => {
    await expect(requireTenantAdministrationScope(ordinary, "tenant-a", "update")).rejects.toThrow("Only administrators");
    expect(mocks.resolve).not.toHaveBeenCalled();
  });

  it("retains legacy admin access without invoking platform cross-tenant machinery", async () => {
    await expect(requireTenantAdministrationScope(admin, "tenant-b", "update")).resolves.toBeUndefined();
    expect(mocks.resolve).not.toHaveBeenCalled();
  });

  it("requires the established Package 1 tenant scope and audit path for a platform super-admin", async () => {
    await requireTenantAdministrationScope(superAdmin, "tenant-b", "update_currency");
    expect(mocks.resolve).toHaveBeenCalledWith(superAdmin, "tenant-b", "tenant.update_currency");
    expect(mocks.validate).toHaveBeenCalled();
    expect(mocks.audit).toHaveBeenCalledWith(superAdmin, expect.anything(), "tenant_update_currency", "tenant-b", expect.anything());
  });
});
