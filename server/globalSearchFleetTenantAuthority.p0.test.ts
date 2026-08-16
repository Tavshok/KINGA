import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.resolve(process.cwd(), "server/routers/global-search.ts"), "utf8");

describe("global search fleet tenant authority", () => {
  it("requires tenant scope for non-platform search and never falls back to an unscoped fleet claim query", () => {
    expect(source).toContain("A tenant-scoped session is required for search");
    const fleetClaims = source.slice(source.indexOf(": FLEET_ROLES.includes(role)"), source.indexOf(": or(", source.indexOf(": FLEET_ROLES.includes(role)")));
    expect(fleetClaims).toContain("eq(claims.tenantId, tenantId!)");
    expect(fleetClaims).not.toContain("sql`1=1`");
  });
});
