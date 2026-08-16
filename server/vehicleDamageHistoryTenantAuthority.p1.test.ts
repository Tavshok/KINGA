import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const routerSource = fs.readFileSync(
  path.resolve(process.cwd(), "server/routers/vehicle-damage-history.ts"),
  "utf8",
);
const helperSource = fs.readFileSync(
  path.resolve(process.cwd(), "server/vehicle-damage-history.ts"),
  "utf8",
);

describe("vehicle damage history tenant authority", () => {
  it("requires a tenant-owned parent claim before returning claim-scoped damage history", () => {
    expect(routerSource).toContain("function requireVehicleDamageHistoryTenant");
    expect(routerSource).toContain("eq(claims.id, input.claimId), eq(claims.tenantId, tenantId)");
    expect(routerSource).toContain("if (!claim) throw new TRPCError({ code: \"NOT_FOUND\", message: \"Claim not found\" })");
    expect(routerSource).toContain("getDamageHistoryByClaim(input.claimId, tenantId)");
  });

  it("requires tenant scope for vehicle zone repeat and dashboard history queries", () => {
    expect(routerSource).toContain("const baseWhere = sql`tenant_id = ${tenantId}`");
    expect(routerSource).not.toContain("sql`1=1`");
    expect(helperSource).toContain("tenantId: string");
    expect(helperSource).toContain("eq(vehicleDamageHistory.claimId, claimId), eq(vehicleDamageHistory.tenantId, tenantId)");
    expect(helperSource).toContain("eq(vehicleDamageHistory.vehicleId, vehicleId),");
    expect(helperSource).toContain("eq(vehicleDamageHistory.tenantId, tenantId),");
    expect(helperSource).toContain("export async function getRepeatZoneRecords(\n  tenantId: string,");
  });
});
