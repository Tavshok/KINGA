import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.resolve(process.cwd(), "server/routers/fleet-core.ts"), "utf8");

describe("Fleet Core driver list tenant authority", () => {
  it("requires tenant-bound fleet access and retains tenant predicates in driver lists", () => {
    expect(source).toContain("const tenantId = requireFleetTenant(actor)");
    expect(source).toContain("eq(fleets.tenantId, tenantId)");
    expect(source).toContain("eq(fleetDrivers.tenantId, tenantId)");
    expect(source).not.toContain("fleet.tenantId ?? ctx.user.tenantId ?? \"\"");
  });
});
