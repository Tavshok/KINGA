import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.resolve(process.cwd(), "server/routers.ts"), "utf8");

describe("incident type override tenant authority", () => {
  it("requires a session tenant and retains it on override reads and writes", () => {
    const region = source.slice(source.indexOf("incidentType: router"), source.indexOf("incidentType: router") + 8500);
    expect(region).toContain("!isAdminRole(ctx.user.role)");
    expect(region).toContain("A tenant-scoped session is required");
    expect(region).toContain("eq(claims.tenantId, tenantId)");
    expect(region).not.toContain("ctx.user.role === 'admin' ? undefined");
    expect(region).not.toContain("ctx.user?.role === 'admin' ? undefined");
  });
});
