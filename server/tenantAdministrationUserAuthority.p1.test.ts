import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.resolve(process.cwd(), "server/routers/admin.ts"), "utf8");
const start = source.indexOf("getPendingRegistrations: protectedProcedure");
const end = source.indexOf("/**\n   * Sprint B: Unified Platform Health", start);
const userAdmin = source.slice(start, end);

describe("tenant administration user authority", () => {
  it("requires shared administrative role and session tenant for each user management operation", () => {
    expect(userAdmin.match(/isAdminRole\(ctx\.user\.role\)/g)?.length).toBe(3);
    expect(userAdmin.match(/A tenant-scoped session is required/g)?.length).toBe(3);
  });

  it("filters pending users and retains tenant scope at deactivation and role writes", () => {
    expect(userAdmin).toContain("eq(users.tenantId, tenantId)");
    expect(userAdmin.match(/and\(eq\(users\.id, input\.userId\), eq\(users\.tenantId, tenantId\)\)/g)?.length).toBe(2);
  });
});
