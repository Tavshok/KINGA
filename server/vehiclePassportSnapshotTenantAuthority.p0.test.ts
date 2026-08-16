import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.resolve(process.cwd(), "server/routers/vehicle-passport.ts"),
  "utf8",
);

const snapshotBlock = source.slice(source.indexOf("getLatestSnapshot: protectedProcedure"));

describe("vehicle passport latest snapshot tenant authority", () => {
  it("requires a tenant and applies the canonical vehicle access boundary before snapshot evidence reads", () => {
    expect(snapshotBlock).toContain('message: "Tenant required"');
    expect(snapshotBlock).toContain("canAccessVehiclePassport(db, vehicle, input.vehicleRegistryId, ctx.user.tenantId)");
    expect(snapshotBlock).toContain("Vehicle not found or access denied");
  });

  it("does not retain a tenantless snapshot-query fallback", () => {
    expect(snapshotBlock).toContain("eq(vehiclePassportSnapshots.tenantId, ctx.user.tenantId)");
    expect(snapshotBlock).not.toContain("sql`1=1`");
  });
});
