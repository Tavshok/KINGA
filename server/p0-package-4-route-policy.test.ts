import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

describe("P0 Package 4 — route admission policy", () => {
  const protectedRoute = read("client/src/components/ProtectedRoute.tsx");
  const roleGuard = read("client/src/components/RoleGuard.tsx");
  const app = read("client/src/App.tsx");
  const tenantRouter = read("server/routers/tenant.ts");

  it("admits platform-super-admin to the client-detail portal domain without changing backend object checks", () => {
    expect(protectedRoute).toContain('portal: ["claimant", "admin", "platform_super_admin"]');
  });

  it("uses the shared canonical admin helper for the insurer portal-shell override", () => {
    expect(roleGuard).toContain('import { isAdminRole } from "@shared/role-permissions"');
    expect(roleGuard).toContain("if (isAdminRole(user.role))");
  });

  it("admits platform-super-admin to intended admin testing shells and preserves deterministic professional guards", () => {
    expect(app).toContain('path="/admin/dashboard"');
    expect(app).toContain('allowedRoles={["admin", "platform_super_admin"]}');
    expect(app).toContain('path="/insurer-portal/executive"');
    expect(app).toContain('<RoleGuard allowedRoles={["executive"]}>');
  });

  it("routes tenant-scoped administration through the bounded Package 4 helper rather than direct admin comparison", () => {
    expect(tenantRouter).toContain('requireTenantAdministrationScope(ctx, input.tenantId, "update")');
    expect(tenantRouter).toContain('requireTenantAdministrationScope(ctx, input.tenantId, "update_rates")');
    expect(tenantRouter).not.toContain("ctx.user.role !== 'admin'");
  });
});
