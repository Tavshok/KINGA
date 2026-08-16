import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const routerSource = fs.readFileSync(path.resolve(process.cwd(), "server/routers/claim-replay.ts"), "utf8");
const serviceSource = fs.readFileSync(path.resolve(process.cwd(), "server/services/claim-replay-comparison.ts"), "utf8");

describe("historical claim replay tenant authority", () => {
  it("requires a tenant-scoped historical claim before single and batch replay", () => {
    expect(routerSource).toContain('"A tenant-scoped session is required"');
    expect(routerSource.match(/requireTenantHistoricalClaim\(/g)?.length).toBeGreaterThanOrEqual(3);
    expect(routerSource).toContain("await requireTenantHistoricalClaim(input.historicalClaimId, ctx.user.tenantId!)");
    expect(routerSource).toContain("await requireTenantHistoricalClaim(historicalClaimId, ctx.user.tenantId!)");
  });

  it("retains tenant predicates in replay claim lookup version history and final claim tracking update", () => {
    expect(serviceSource).toContain("replayHistoricalClaim(\n  historicalClaimId: number,\n  tenantId: string,");
    expect(serviceSource).toContain("eq(historicalClaims.tenantId, tenantId)");
    expect(serviceSource).toContain("eq(historicalReplayResults.tenantId, tenantId)");
    expect(serviceSource).toContain("storeReplayResults(\n    historicalClaimId,\n    tenantId,");
  });
});
