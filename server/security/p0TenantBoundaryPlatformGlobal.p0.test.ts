import { describe, expect, it } from "vitest";
import { resolveP0TenantScope } from "./p0TenantBoundary";

describe("P0 platform-global aggregate authority", () => {
  it("recognises the shared admin role as a platform-super-admin scope without tenant fallback", () => {
    const scope = resolveP0TenantScope({
      user: { id: 7, role: "admin", tenantId: "tenant-admin-anchor" },
    }, "tenant-selected-for-audit", "reporting.generate");

    expect(scope).toEqual({
      tenantId: "tenant-selected-for-audit",
      isPlatformSuperAdmin: true,
      isCrossTenant: true,
    });
  });

  it("continues to reject an insurer user who attempts to select another tenant", () => {
    expect(() => resolveP0TenantScope({
      user: { id: 8, role: "insurer", tenantId: "tenant-a" },
    }, "tenant-b", "reporting.generate")).toThrow(/tenant selection/i);
  });
});
