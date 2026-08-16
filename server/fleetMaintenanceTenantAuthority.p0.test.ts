import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.resolve(process.cwd(), "server/routers/fleet-accounts.ts"), "utf8");

describe("fleet maintenance tenant authority", () => {
  it("resolves the supplied vehicle within the actor tenant and owned fleet before inserting maintenance", () => {
    const block = source.slice(source.indexOf("addMaintenanceRecord:"), source.indexOf("getMaintenanceAlerts:"));
    expect(block).toContain("eq(fleetVehicles.id, input.vehicleId)");
    expect(block).toContain("eq(fleetVehicles.tenantId, tenantId)");
    expect(block).toContain("eq(fleetAccounts.ownerUserId, ctx.user.id)");
    expect(block).toContain("Fleet vehicle not found");
  });
});
