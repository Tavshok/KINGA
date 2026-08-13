import { describe, expect, it } from "vitest";
import { getRoleDashboardPath, isPortalNavigationAllowed } from "../client/src/lib/roleRouting";

describe("P0 Package 4 portal routing contract", () => {
  it("lands each top-level role in its canonical portal rather than the retired portal hub", () => {
    expect(getRoleDashboardPath("claimant")).toBe("/client");
    expect(getRoleDashboardPath("fleet_driver")).toBe("/fleet/driver");
    expect(getRoleDashboardPath("engineer")).toBe("/engineer/dashboard");
    expect(getRoleDashboardPath("platform_super_admin")).toBe("/platform/overview");
  });

  it("denies an insurer sub-role from another insurer workspace while preserving their own canonical landing", () => {
    expect(isPortalNavigationAllowed("/insurer-portal/executive", "insurer", "claims_processor")).toBe(false);
    expect(getRoleDashboardPath("insurer", "claims_processor")).toBe("/insurer-portal/claims-processor");
  });

  it("permits administrative portal-shell testing without asserting tenant-bound object authority", () => {
    expect(isPortalNavigationAllowed("/insurer-portal/executive", "admin", null)).toBe(true);
    expect(isPortalNavigationAllowed("/insurer-portal/executive", "platform_super_admin", null)).toBe(true);
  });
});
