import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const project = process.cwd();
const readClient = (relativePath: string) =>
  readFileSync(resolve(project, "client", "src", relativePath), "utf8");

describe("portal conformance regressions", () => {
  it("keeps the landing page authentication hook imported", () => {
    const home = readClient("pages/Home.tsx");
    expect(home).toContain('import { useAuth } from "@/_core/hooks/useAuth"');
    expect(home).toContain("const { user } = useAuth()");
  });

  it("routes client valuation through My Portal and redirects legacy Agency valuation paths", () => {
    const app = readClient("App.tsx");
    expect(app).toContain('path="/client/valuation"');
    expect(app).toContain('<RedirectToPortal to="/client/valuation" />');
    expect(app).toContain('<RedirectToPortal to="/client/valuation/bulk" />');
  });

  it("keeps professional workspace action links on routes that exist", () => {
    const panelBeater = readClient("pages/PanelBeaterDashboard.tsx");
    const engineers = readClient("pages/EngineerDashboard.tsx");
    expect(panelBeater).toContain("/panel-beater/claims/${claim.id}/quote");
    expect(engineers).toContain('setLocation("/engineer/inspections?create=1")');
    expect(engineers).not.toContain('setLocation("/engineer/new-inspection")');
  });

  it("uses the broker-service client and insurer response procedures in Agency Portal", () => {
    const agency = readClient("pages/KingaAgency.tsx");
    const agencyRouter = readFileSync(resolve(project, "server", "routers", "agency-broker.ts"), "utf8");
    expect(agency).toContain("trpc.agencyBroker.listClients.useQuery");
    expect(agency).toContain("trpc.agencyBroker.createClient.useMutation");
    expect(agency).toContain("trpc.agencyBroker.myQuoteRequests.useQuery");
    expect(agency).toContain("trpc.agencyBroker.listAvailableInsurers.useQuery");
    expect(agency).toContain("trpc.agencyBroker.createAgencyClaim.useMutation");
    expect(agency).toContain("trpc.agencyBroker.requestQuotes.useMutation");
    expect(agency).toContain("Create & Dispatch Requests");
    expect(agencyRouter).toContain("listAvailableInsurers: agencyProcedure");
  });

  it("keeps Fleet Driver access separate from the manager workspace and supports manager assignment", () => {
    const app = readClient("App.tsx");
    const fleetManagement = readClient("pages/FleetManagement.tsx");
    const driverWorkspace = readClient("pages/FleetDriverDashboard.tsx");
    const fleetRouter = readFileSync(resolve(project, "server", "routers", "fleet-core.ts"), "utf8");

    expect(app).toContain('path="/fleet/driver"');
    expect(app).toContain("<FleetDriverDashboard />");
    expect(fleetManagement).toContain("trpc.fleet.onboardFleetDriver.useMutation");
    expect(fleetManagement).toContain("Assign Fleet Driver");
    expect(driverWorkspace).toContain("trpc.fleet.getMyDriverWorkspace.useQuery");
    expect(driverWorkspace).toContain('setLocation("/client/submit-claim")');
    expect(fleetRouter).toContain("getMyDriverWorkspace: protectedProcedure");
    expect(fleetRouter).toContain("FLEET_DRIVER_ASSIGNED");
  });

  it("keeps Panel Beater work visible for both quote invitations and approved repair allocations", () => {
    const panelBeater = readClient("pages/PanelBeaterDashboard.tsx");
    const db = readFileSync(resolve(project, "server", "db.ts"), "utf8");

    expect(db).toContain("assignedPanelBeaterId");
    expect(db).toContain("selectedIds.some((id) => Number(id) === Number(panelBeaterId))");
    expect(panelBeater).toContain("No repairer profile is linked to this account");
    expect(panelBeater).toContain("allocated to your business");
  });

  it("opens a real Engineers inspection-creation flow and displays query failures", () => {
    const engineerDashboard = readClient("pages/EngineerDashboard.tsx");
    const inspections = readClient("pages/EngineerInspectionList.tsx");

    expect(engineerDashboard).toContain('/engineer/inspections?create=1');
    expect(engineerDashboard).toContain("Engineering data could not be loaded");
    expect(inspections).toContain('get("create") === "1"');
    expect(inspections).toContain("Inspections could not be loaded.");
  });

  it("keeps the root landing route’s navigation hook imported and renderable", () => {
    const home = readClient("pages/Home.tsx");
    const portalSelection = readClient("pages/PortalSelection.tsx");

    expect(home).toContain('import { useLocation } from "wouter"');
    expect(home).toContain("<PortalSelection");
    expect(portalSelection).toContain('import { useLocation } from "wouter"');
    expect(portalSelection).toContain("const [, setLocation] = useLocation()");
    expect(portalSelection).toContain('<KingaLogo size="md"');
  });

  it("treats insurerRole as the operational access role and routes it directly after login", () => {
    const selection = readClient("pages/InsurerRoleSelection.tsx");
    const login = readClient("pages/Login.tsx");

    expect(selection).toContain('import { useAuth } from "@/_core/hooks/useAuth"');
    expect(selection).toContain("const needsRoleAssignment = user?.role === \"insurer\" && !userInsurerRole");
    expect(selection).toContain("const isOwnRole = isAdmin || role.id === userInsurerRole");
    expect(selection).not.toContain("isAdmin || !userInsurerRole || role.id === userInsurerRole");
    expect(login).toContain("getDashboardPath(user.role, user.insurerRole)");
    expect(login).toContain('if (userRole === "insurer") return getRoleDashboardPath(userRole, insurerRole)');
  });

  it("keeps canonical client, fleet, professional, and removed-hub routes aligned", () => {
    const app = readClient("App.tsx");
    const routing = readClient("lib/roleRouting.ts");

    expect(routing).toContain('claimant: "/client"');
    expect(routing).toContain('fleet_admin: "/fleet"');
    expect(routing).toContain('fleet_manager: "/fleet"');
    expect(routing).toContain('fleet_driver: "/fleet/driver"');
    expect(app).toContain('path="/client"');
    expect(app).toContain('path="/fleet"');
    expect(app).toContain('path="/fleet/driver"');
    expect(app).toContain('path="/assessor/dashboard"');
    expect(app).toContain('path="/panel-beater/dashboard"');
    expect(app).toContain('path="/agency"');
    expect(app).toContain('path="/engineer/dashboard"');
    expect(app).toContain('path="/platform/overview"');
    expect(app).toContain('<Route path="/portal-hub"><PortalHubRedirect /></Route>');
  });
});
