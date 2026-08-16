import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const routerSource = fs.readFileSync(path.resolve(process.cwd(), "server/routers/fleet-core.ts"), "utf8");
const serviceSource = fs.readFileSync(path.resolve(process.cwd(), "server/fleet/service-marketplace.ts"), "utf8");

describe("fleet maintenance and marketplace tenant authority", () => {
  it("uses managed tenant-owned vehicle authority before maintenance schedule, service, and service-request writes", () => {
    expect(routerSource).toContain("async function requireManagedVehicle");
    expect(routerSource.match(/await requireManagedVehicle\(db, ctx.user, input.vehicleId\)/g)?.length).toBeGreaterThanOrEqual(3);
    expect(routerSource).not.toMatch(/tenantId:\s*ctx\.user\.tenantId\s*\|\|\s*['"]default['"]/);
  });

  it("passes tenant scope into marketplace reads and quote or request lifecycle updates", () => {
    expect(routerSource).toContain("getServiceRequests(requireFleetTenant(ctx.user)");
    expect(routerSource).toContain("getServiceQuotes(requireFleetTenant(ctx.user), input.serviceRequestId)");
    expect(routerSource).toContain("acceptServiceQuote(requireFleetTenant(ctx.user), input.quoteId)");
    expect(serviceSource).toContain("eq(serviceRequests.tenantId, tenantId)");
    expect(serviceSource).toContain("eq(serviceQuotes.tenantId, tenantId)");
  });
});
