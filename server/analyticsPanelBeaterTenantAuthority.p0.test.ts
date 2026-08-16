import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.resolve(process.cwd(), "server/routers/analytics.ts"), "utf8");

describe("analytics panel-beater tenant authority", () => {
  it("uses the resolved tenant to constrain panel-beater analytics before aggregation", () => {
    expect(source).toContain("const panelBeaterTenantFilter = tenantId");
    expect(source).toContain("eq(panelBeaters.tenantId, tenantId)");
    expect(source).toContain(".where(panelBeaterTenantFilter)");
  });
});
