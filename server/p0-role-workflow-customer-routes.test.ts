import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PORTAL_DOMAIN_ROLE_MAP, isPortalShellAdmissionAllowed } from "../client/src/lib/roleRouting";

describe("P0 role-to-workflow customer and agency route conformance", () => {
  it("keeps client self-service limited to customer and fleet roles, with explicit administrative test-shell access", () => {
    expect(PORTAL_DOMAIN_ROLE_MAP.customer).toEqual([
      "claimant", "fleet_manager", "fleet_driver", "fleet_admin", "admin", "platform_super_admin", "user",
    ]);
    expect(isPortalShellAdmissionAllowed("/client", ["claimant"])).toBe(true);
    expect(isPortalShellAdmissionAllowed("/client", ["fleet_manager"])).toBe(true);
    expect(isPortalShellAdmissionAllowed("/client", ["agency"])).toBe(false);
    expect(isPortalShellAdmissionAllowed("/client", ["insurer"])).toBe(false);
    expect(isPortalShellAdmissionAllowed("/client", ["assessor"])).toBe(false);
    expect(isPortalShellAdmissionAllowed("/client", ["panel_beater"])).toBe(false);
  });

  it("guards every customer self-service and agency execution route and retires the legacy fleet cross-role page", () => {
    const app = readFileSync("client/src/App.tsx", "utf8");
    for (const path of ["/my-profile", "/client/submit-claim", "/client/valuation", "/client/valuation/bulk", "/insurance/quote", "/insurance/dashboard", "/claims/:id"]) {
      const route = app.slice(app.indexOf(`path=\"${path}\"`), app.indexOf(`path=\"${path}\"`) + 240);
      expect(route).toContain('domain="customer"');
    }
    const agencyQuotes = app.slice(app.indexOf('path="/agency/quotes"'), app.indexOf('path="/agency/quotes"') + 180);
    expect(agencyQuotes).toContain('domain="agency"');
    const legacyFleet = app.slice(app.indexOf('path="/fleet-management"'), app.indexOf('path="/fleet-management"') + 140);
    expect(legacyFleet).toContain('RedirectToPortal to="/fleet"');
  });

  it("keeps administration control-tower routes out of insurer shells while retaining administrative test-shell admission", () => {
    const app = readFileSync("client/src/App.tsx", "utf8");
    for (const path of ["/admin/integrity-metrics", "/admin/pipeline-health", "/admin/learning", "/admin/workflows", "/admin/escalation", "/admin/workflow-settings"]) {
      const route = app.slice(app.indexOf(`path=\"${path}\"`), app.indexOf(`path=\"${path}\"`) + 220);
      expect(route).toContain('domain="administration"');
      expect(route).not.toContain('"insurer"');
    }
    expect(isPortalShellAdmissionAllowed("/admin/dashboard", ["platform_super_admin"])).toBe(true);
    expect(isPortalShellAdmissionAllowed("/admin/dashboard", ["insurer"])).toBe(false);
  });
});
