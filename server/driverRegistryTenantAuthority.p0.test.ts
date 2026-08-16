import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const routerPath = path.resolve(process.cwd(), "server/routers/driver-registry.ts");
const helperPath = path.resolve(process.cwd(), "server/driver-registry.ts");
const routerSource = fs.readFileSync(routerPath, "utf8");
const helperSource = fs.readFileSync(helperPath, "utf8");

describe("driver registry tenant authority", () => {
  it("requires a session tenant across direct driver reads, claim links, dashboards, and mutations", () => {
    expect(routerSource).toContain("function requireDriverRegistryTenant");
    expect(routerSource).toContain("getDriverById(input.id, requireDriverRegistryTenant(ctx))");
    expect(routerSource).toContain("getDriverByLicense(input.licenseNumber, requireDriverRegistryTenant(ctx))");
    expect(routerSource).toContain("getDriverClaimHistory(input.driverId, requireDriverRegistryTenant(ctx))");
    expect(routerSource).toContain("eq(claims.tenantId, tenantId)");
    expect(routerSource).toContain("eq(driverClaims.tenantId, tenantId)");
    expect(routerSource).not.toContain("tenantId ? eq(drivers.tenantId, tenantId) : sql`1=1`");
    expect(routerSource).toContain("eq(drivers.id, input.driverId), eq(drivers.tenantId, tenantId)");
    expect(routerSource).toContain("eq(drivers.id, driverId), eq(drivers.tenantId, tenantId)");
  });

  it("retains pipeline tenant scope through matching duplicate handling claim links and aggregate writes", () => {
    expect(helperSource).toContain("const tenantId = input.tenantId;");
    expect(helperSource).toContain("if (!tenantId) return null;");
    expect(helperSource).toContain("eq(drivers.licenseNumber, normLicense), eq(drivers.tenantId, tenantId)");
    expect(helperSource).toContain("if (!tenantId) return;");
    expect(helperSource).toContain("eq(drivers.id, driverId), eq(drivers.tenantId, tenantId)");
    expect(helperSource).toContain("export async function getDriverById(id: number, tenantId: string)");
    expect(helperSource).toContain("export async function getDriverClaimHistory(driverId: number, tenantId: string)");
    expect(helperSource).not.toContain("export async function getDriverById(id: number) {");
  });
});
