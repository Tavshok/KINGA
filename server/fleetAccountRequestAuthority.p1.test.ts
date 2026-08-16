import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.resolve(process.cwd(), "server/routers/fleet-accounts.ts"),
  "utf8",
);

function block(start: string, end: string) {
  return source.slice(source.indexOf(start), source.indexOf(end));
}

describe("fleet account request and driver authority", () => {
  it("binds approval and rejection to the reviewer tenant through the linked fleet account", () => {
    const approve = block("approveFleetManagerRequest: protectedProcedure", "rejectFleetManagerRequest: protectedProcedure");
    const reject = block("rejectFleetManagerRequest: protectedProcedure", "flagClaimForReview: protectedProcedure");
    for (const procedure of [approve, reject]) {
      expect(procedure).toContain("const tenantId = ctx.user.tenantId");
      expect(procedure).toContain("eq(fleetAccounts.linkedInsurerTenantId, tenantId)");
      expect(procedure).toContain("innerJoin(fleetAccounts");
    }
  });

  it("requires the fleet manager to own the claim fleet account before review flags and own the account before driver creation", () => {
    const flag = block("flagClaimForReview: protectedProcedure", "getFraudFlaggedVehicles: protectedProcedure");
    const addDriver = block("addDriver: protectedProcedure", "listMaintenanceRecords: protectedProcedure");
    expect(flag).toContain("eq(fleetAccounts.ownerUserId, ctx.user.id)");
    expect(addDriver).toContain("Only fleet managers can assign drivers.");
    expect(addDriver).toContain("eq(fleetAccounts.ownerUserId, ctx.user.id)");
  });
});
