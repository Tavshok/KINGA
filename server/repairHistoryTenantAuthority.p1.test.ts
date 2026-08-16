import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const routerSource = fs.readFileSync(path.resolve(process.cwd(), "server/routers/repair-history.ts"), "utf8");
const helperSource = fs.readFileSync(path.resolve(process.cwd(), "server/repair-history.ts"), "utf8");

describe("repair history tenant authority", () => {
  it("derives repair history scope from the session rather than request tenant selectors", () => {
    expect(routerSource).toContain("function requireRepairHistoryTenant");
    expect(routerSource).toContain("getRepairHistoryByClaim(input.claimId, requireRepairHistoryTenant(ctx))");
    expect(routerSource).toContain("getRepairHistoryByRepairer(input.repairerId, requireRepairHistoryTenant(ctx), input.limit)");
    expect(routerSource).not.toContain("input.tenantId");
  });

  it("retains tenant constraints through history helpers and completion writes", () => {
    expect(helperSource).toContain("getRepairHistoryByClaim(claimId: number, tenantId: string)");
    expect(helperSource).toContain("eq(repairHistory.claimId, claimId), eq(repairHistory.tenantId, tenantId)");
    expect(helperSource).toContain("eq(repairHistory.id, params.repairHistoryId), eq(repairHistory.tenantId, params.tenantId)");
    expect(routerSource).toContain("eq(repairHistory.id, input.repairHistoryId), eq(repairHistory.tenantId, tenantId)");
    expect(routerSource).not.toContain("conditions.length > 0 ? and(...conditions) : undefined");
  });
});
