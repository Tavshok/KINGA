import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.resolve(process.cwd(), "server/routers/fleet-core.ts"), "utf8");

describe("fleet lookup tenant authority", () => {
  it("requires authorised fleet access before vehicle and driver lookups", () => {
    const vehicle = source.slice(source.indexOf("getVehicleById:"), source.indexOf("updateVehicle:"));
    const drivers = source.slice(source.indexOf("getFleetDrivers:"), source.indexOf("getMyDrivers:"));
    expect(vehicle).toContain("requireFleetReadAccess(db, ctx.user, vehicle.fleetId)");
    expect(drivers).toContain("requireFleetReadAccess(db, ctx.user, input.fleetId)");
    expect(drivers).toContain("eq(fleetDrivers.tenantId, fleet.tenantId ?? ctx.user.tenantId ?? \"\")");
  });
});
