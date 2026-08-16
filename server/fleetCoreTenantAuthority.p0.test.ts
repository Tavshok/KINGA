import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.resolve(process.cwd(), "server/routers/fleet-core.ts"), "utf8");

describe("fleet core tenant authority", () => {
  it("requires session tenant scope for fleet creation and vehicle registration", () => {
    const create = source.slice(source.indexOf("createFleet:"), source.indexOf("getMyFleets:"));
    const register = source.slice(source.indexOf("registerVehicle:"), source.indexOf("getFleetVehicles:"));
    expect(create).toContain("const tenantId = ctx.user.tenantId;");
    expect(create).toContain("tenantId,");
    expect(register).toContain("const tenantId = ctx.user.tenantId;");
    expect(register).toContain("tenantId,");
  });

  it("validates managed-fleet authority before bulk vehicle import", () => {
    const bulk = source.slice(source.indexOf("bulkImportVehicles:"), source.indexOf("exportFleetToExcel:"));
    expect(bulk).toContain("await requireManagedFleet(db, ctx.user, input.fleetId)");
    expect(bulk).toContain("const tenantId = ctx.user.tenantId;");
  });
});
