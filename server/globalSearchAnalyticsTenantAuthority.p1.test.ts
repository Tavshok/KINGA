import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.resolve(process.cwd(), "server/routers/global-search.ts"),
  "utf8",
);

const analytics = source.slice(source.indexOf("getAnalytics: protectedProcedure"), source.indexOf("clearHistory: protectedProcedure"));

describe("global search analytics tenant authority", () => {
  it("binds non-platform callers to the session tenant and rejects supplied mismatches", () => {
    expect(analytics).toContain("A tenant-scoped session is required for analytics.");
    expect(analytics).toContain("Cross-tenant analytics access is not permitted.");
    expect(analytics).toContain("input.tenantId !== sessionTenantId");
  });

  it("requires explicit tenant selection for platform-super-admin analytics", () => {
    expect(analytics).toContain("Platform analytics requires an explicit tenant selection.");
    expect(analytics).toContain("eq(globalSearchAnalytics.tenantId, analyticsTenantId)");
    expect(analytics).not.toContain("sql`1=1`");
  });
});
