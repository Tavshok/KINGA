import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isAdminRole } from "../shared/role-permissions";

const project = new URL("..", import.meta.url).pathname;
const read = (path: string) => readFileSync(`${project}/${path}`, "utf8");

describe("P0 Package 4 administrative guard consolidation", () => {
  it("uses the canonical helper for both administrative shell roles", () => {
    expect(isAdminRole("admin")).toBe(true);
    expect(isAdminRole("platform_super_admin")).toBe(true);
    expect(isAdminRole("insurer")).toBe(false);
    expect(isAdminRole("claimant")).toBe(false);
  });

  it("keeps active server administrative admission checks on the helper rather than direct admin equality", () => {
    for (const path of ["server/_core/trpc.ts", "server/_core/domain-middleware.ts", "server/_core/tenant-middleware.ts"]) {
      const source = read(path);
      expect(source).toContain("isAdminRole");
      expect(source).not.toMatch(/role\s*===\s*["']admin["']|role\s*!==\s*["']admin["']/);
    }
  });

  it("requires client portal-shell components to use the shared administrative boundary", () => {
    expect(read("client/src/components/ProtectedRoute.tsx")).toContain("isAdminRole(user.role)");
    expect(read("client/src/components/RoleGuard.tsx")).toContain("isAdminRole(user.role)");
    expect(read("client/src/lib/roleRouting.ts")).toContain("isAdminRole(userRole)");
  });
});
