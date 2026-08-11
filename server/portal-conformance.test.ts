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
    expect(engineers).toContain('setLocation("/engineer/inspections")');
    expect(engineers).not.toContain('setLocation("/engineer/new-inspection")');
  });

  it("uses the broker-service client and insurer response procedures in Agency Portal", () => {
    const agency = readClient("pages/KingaAgency.tsx");
    expect(agency).toContain("trpc.agencyBroker.listClients.useQuery");
    expect(agency).toContain("trpc.agencyBroker.createClient.useMutation");
    expect(agency).toContain("trpc.agencyBroker.myQuoteRequests.useQuery");
  });
});
