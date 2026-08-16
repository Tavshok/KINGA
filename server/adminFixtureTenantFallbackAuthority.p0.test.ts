import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.resolve(process.cwd(), "server/routers/admin.ts"), "utf8");

describe("administrative fixture tenant fallback authority", () => {
  it("requires session tenant before fixture claims are created and contains no static fallback", () => {
    const fixture = source.slice(source.indexOf("vehicleTemplates"), source.indexOf("[Bulk Seed] Created claim"));
    expect(fixture).toContain("const tenantId = ctx.user.tenantId");
    expect(fixture).toContain("A tenant-scoped session is required");
    expect(fixture).toContain("tenantId,");
    expect(fixture).not.toMatch(/ctx\.user\.tenantId\s*\|\|\s*['"]default['"]/);
  });
});
