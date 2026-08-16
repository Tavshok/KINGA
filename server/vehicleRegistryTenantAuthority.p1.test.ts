import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.resolve(process.cwd(), "server/routers/vehicle-registry.ts"),
  "utf8",
);

describe("vehicle registry tenant authority", () => {
  it("requires session tenant scope for every registry read surface", () => {
    expect(source).toContain("function requireVehicleTenant");
    expect(source).toContain("return getVehicleClaimHistory(input.vehicleRegistryId, requireVehicleTenant(ctx))");
    expect(source).toContain("return listVehicleRegistry(requireVehicleTenant(ctx), input.limit, input.offset)");
    expect(source).toContain("return listHighRiskVehicles(requireVehicleTenant(ctx), input.minRiskScore)");
    expect(source).not.toContain('sql`1=1`');
  });

  it("denies tenantless and foreign direct vehicle targets and retains tenant at flag writes", () => {
    expect(source).toContain("if (record.tenantId !== tenantId) return null");
    expect(source).toContain("if (record.tenantId !== tenantId) {");
    expect(source).toContain("and(eq(vehicleRegistry.id, input.id), eq(vehicleRegistry.tenantId, tenantId))");
  });
});
