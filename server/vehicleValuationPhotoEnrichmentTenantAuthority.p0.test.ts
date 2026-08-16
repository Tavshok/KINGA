import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.resolve(process.cwd(), "server/routers/vehicle-valuation-core.ts"), "utf8");

describe("vehicle valuation photo enrichment tenant authority", () => {
  it("requires session tenant and tenant-owned claim resolution with no admin or default fallback", () => {
    const enrich = source.slice(source.indexOf("enrichPhotos:"), source.indexOf("}),\n});", source.indexOf("enrichPhotos:")));
    expect(enrich).toContain("requireVehicleValuationTenant(ctx)");
    expect(enrich).toContain("await requireVehicleValuationClaim(input.claimId, tenantId)");
    expect(enrich).toContain("isAdminRole(ctx.user.role)");
    expect(enrich).not.toMatch(/ctx\.user\.role\s*===\s*['"]admin['"]/);
    expect(enrich).not.toMatch(/tenantId\s*(\?\?|\|\|)\s*['"]default['"]/);
  });
});
