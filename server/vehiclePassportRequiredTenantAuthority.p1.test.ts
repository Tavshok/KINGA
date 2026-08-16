import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.resolve(process.cwd(), "server/routers/vehicle-passport.ts"), "utf8");

describe("Vehicle Passport required tenant authority", () => {
  it("requires a session tenant and passes it to access, intelligence, risk, and evidence helpers", () => {
    const passportRegion = source.slice(source.indexOf("getPassport: protectedProcedure"), source.indexOf("getByVin: protectedProcedure"));
    expect((passportRegion.match(/A tenant-scoped session is required/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(passportRegion).toContain("canAccessVehiclePassport(db, vehicle, input.vehicleRegistryId, tenantId)");
    expect(passportRegion).toContain("aggregateVehiclePassport(input.vehicleRegistryId, tenantId)");
    expect(passportRegion).toContain("aggregateVehiclePassport(vehicle.id, tenantId)");
    expect(passportRegion).not.toContain("ctx.user.tenantId ?? undefined");
  });
});
