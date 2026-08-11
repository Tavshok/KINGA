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

  it("presents Agency as a broker client-service workspace rather than client self-service", () => {
    const agency = readClient("pages/KingaAgency.tsx");

    expect(agency).toContain("Agency Service Workspace");
    expect(agency).toContain("Client Requests & Quotes");
    expect(agency).toContain("Client Service Requests");
    expect(agency).toContain("Open Client Workspace");
    expect(agency).toContain("Add a client and create a service request before dispatching selected insurer quote requests.");
    expect(agency).toContain("setLocation('/')");
    expect(agency).not.toContain("setLocation('/portal')");
  });

  it("keeps the Panel Beater workflow actionable from quote through repair completion", () => {
    const dashboard = readClient("pages/PanelBeaterDashboard.tsx");
    const quoteBuilder = readClient("pages/PanelBeaterQuoteSubmission.tsx");

    expect(dashboard).toContain("Build Quote");
    expect(dashboard).toContain("uploadRepairPhotos.mutate({ claimId: claim.id, photos })");
    expect(dashboard).toContain("Mark Complete");
    expect(dashboard).toContain("fmt(Number(q.quotedAmount || 0))");
    expect(dashboard).not.toContain("R {Number(q.quotedAmount || 0).toLocaleString()}");
    expect(quoteBuilder).toContain("VAT");
    expect(quoteBuilder).toContain("labour");
    expect(quoteBuilder).toContain("consumables");
  });

  it("gives fleet managers live claim-cost and frequency-risk intelligence without sending them to My Portal", () => {
    const fleetManagement = readClient("pages/FleetManagement.tsx");
    const fleetRouter = readFileSync(resolve(project, "server", "routers", "fleet-core.ts"), "utf8");

    expect(fleetManagement).toContain("trpc.fleet.getManagerIntelligence.useQuery");
    expect(fleetManagement).toContain("Fleet Claims & Cost Exposure");
    expect(fleetManagement).toContain("Driver Claims Signals");
    expect(fleetManagement).toContain("Claim Cost (12m)");
    expect(fleetManagement).not.toContain("Portal Hub");
    expect(fleetManagement).not.toContain("Go to My Portal — Company Claims");
    expect(fleetRouter).toContain("getManagerIntelligence: protectedProcedure");
    expect(fleetRouter).toContain("elevatedFrequencyThreshold");
    expect(fleetRouter).toContain("fleetRiskScores");
  });

  it("attributes company claims from an assigned Fleet Driver and supports selectable analysis periods", () => {
    const claimsRouter = readFileSync(resolve(project, "server", "routers", "claims-core.ts"), "utf8");
    const schema = readFileSync(resolve(project, "drizzle", "schema.ts"), "utf8");
    const fleetManagement = readClient("pages/FleetManagement.tsx");
    const fleetRouter = readFileSync(resolve(project, "server", "routers", "fleet-core.ts"), "utf8");

    expect(schema).toContain('fleetDriverId: int("fleet_driver_id")');
    expect(claimsRouter).toContain('input.claimantType === "company" && ctx.user.role === "fleet_driver"');
    expect(claimsRouter).toContain("fleetDriverId,");
    expect(fleetRouter).toContain("fleetDriverId: claims.fleetDriverId");
    expect(fleetRouter).toContain("startDate: z.string().datetime().optional()");
    expect(fleetRouter).toContain("timeSeries:");
    expect(fleetManagement).toContain("setAnalysisPeriodDays");
    expect(fleetManagement).toContain("Last 30 days");
    expect(fleetManagement).toContain("Last 90 days");
    expect(fleetManagement).toContain("Cost by Period");
  });

  it("exports a print-ready Fleet claims summary from the selected live analysis period", () => {
    const fleetManagement = readClient("pages/FleetManagement.tsx");
    const fleetExport = readClient("lib/fleetReportExport.ts");

    expect(fleetManagement).toContain("exportFleetClaimsSummaryToPdf");
    expect(fleetManagement).toContain("Export PDF");
    expect(fleetExport).toContain("Fleet Claims Summary");
    expect(fleetExport).toContain("window.print()");
    expect(fleetExport).toContain("Vehicle claim exposure");
    expect(fleetExport).toContain("Driver claim signals");
    expect(fleetExport).toContain("Cost by period");
  });

  it("supports a validated custom Fleet date range across intelligence and PDF export", () => {
    const fleetManagement = readClient("pages/FleetManagement.tsx");
    const fleetExport = readClient("lib/fleetReportExport.ts");

    expect(fleetManagement).toContain('analysisRangeMode === "custom"');
    expect(fleetManagement).toContain("customStartDate");
    expect(fleetManagement).toContain("customEndDate");
    expect(fleetManagement).toContain("Custom range");
    expect(fleetManagement).toContain("Fleet report start date");
    expect(fleetManagement).toContain("Fleet report end date");
    expect(fleetExport).toContain("periodLabel?: string");
  });

  it("keeps My Portal insurance requests client-scoped instead of routing clients through Agency", () => {
    const claimant = readClient("pages/ClaimantDashboard.tsx");
    const app = readClient("App.tsx");
    const insurance = readFileSync(resolve(project, "server", "routers", "insurance-core.ts"), "utf8");

    expect(claimant).toContain("trpc.insurance.getMyQuotes.useQuery");
    expect(claimant).toContain("trpc.insurance.getMyPolicies.useQuery");
    expect(claimant).toContain("Request Insurance Quote");
    expect(claimant).toContain("setLocation('/insurance/quote')");
    expect(claimant).not.toContain("Visit the Agency portal to request an insurance quote");
    expect(app).toContain('path="/insurance/quote"');
    expect(app).toContain('<ProtectedRoute allowedRoles={["user", "claimant", "fleet_admin", "fleet_manager", "fleet_driver", "admin", "platform_super_admin"]}>');
    expect(insurance).toContain("requestQuote: protectedProcedure");
    expect(insurance).toContain("const customerId = ctx.user.id;");
    expect(insurance).not.toContain("const customerId = 1;");
    expect(insurance).toContain("getMyQuotes: protectedProcedure");
    expect(insurance).toContain("quote.customerId !== ctx.user.id");
  });
});
