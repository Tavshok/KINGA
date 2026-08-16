import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.resolve(process.cwd(), "server/report-governance-service.ts"), "utf8");

describe("report governance tenant authority", () => {
  it("uses the shared administrative role contract without bypassing report tenant isolation", () => {
    expect(source).toContain("isAdminRole(user.role)");
    expect(source).not.toContain("user.role === 'admin'");
    expect(source).not.toContain("user.role !== 'admin'");
    expect(source).toContain("if (snapshot.tenantId !== user.tenantId)");
    expect(source).toContain("if (!user.tenantId || user.tenantId !== tenantId) return []");
    expect(source).not.toContain("tenantId: user.tenantId || 'default'");
  });
});
