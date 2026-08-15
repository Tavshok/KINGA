import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  INSURER_ROLE_PORTAL_MAP,
  PORTAL_ROUTE_ROLES,
  getPortalAllowedRoles,
  isPortalNavigationAllowed,
} from "../client/src/lib/roleRouting";

const appSource = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
const insurerLayoutSource = readFileSync(new URL("../client/src/components/InsurerPortalLayout.tsx", import.meta.url), "utf8");
const assessorLayoutSource = readFileSync(new URL("../client/src/components/AssessorPortalLayout.tsx", import.meta.url), "utf8");
const panelBeaterLayoutSource = readFileSync(new URL("../client/src/components/PanelBeaterPortalLayout.tsx", import.meta.url), "utf8");
const fleetSource = readFileSync(new URL("../client/src/pages/FleetManagement.tsx", import.meta.url), "utf8");
const engineerLayoutSource = readFileSync(new URL("../client/src/components/EngineerWorkspaceLayout.tsx", import.meta.url), "utf8");

describe("professional portal conformance — insurer navigation and admission", () => {
  it("records shared-registry routes that are narrowed by actual App role guards", () => {
    expect(getPortalAllowedRoles("/insurer-portal/exception-intelligence")).toEqual([]);
    expect(getPortalAllowedRoles("/insurer-portal/team-members")).toEqual([]);
    expect(isPortalNavigationAllowed("/insurer-portal/exception-intelligence", "insurer", "claims_processor")).toBe(true);
    expect(isPortalNavigationAllowed("/insurer-portal/team-members", "insurer", "claims_processor")).toBe(true);

    expect(appSource).toMatch(/path="\/insurer-portal\/exception-intelligence"[\s\S]{0,300}RoleGuard allowedRoles=\{\["risk_manager", "claims_manager", "executive", "insurer_admin"\]\}/);
    expect(appSource).toMatch(/path="\/insurer-portal\/team-members"[\s\S]{0,220}RoleGuard allowedRoles=\{\["insurer_admin"\]\}/);
  });

  it("proves insurer-admin Workflow Settings no longer leaves the insurer domain", () => {
    expect(insurerLayoutSource).toContain('{ label: "Workflow Settings", description: "Managed by platform administration", href: "/insurer-portal/insurer-admin", icon: Settings, unavailable: true }');
    expect(insurerLayoutSource).toContain('if (item.unavailable)');
    expect(insurerLayoutSource).not.toContain('href: "/admin/workflows"');
    expect(appSource).toContain('path="/admin/workflows"');
  });

  it("records the insurer external-assessor landing gap without treating it as a valid portal target", () => {
    expect("assessor_external" in INSURER_ROLE_PORTAL_MAP).toBe(false);
    expect(PORTAL_ROUTE_ROLES.some((entry) => entry.allowedRoles.includes("assessor_external"))).toBe(false);
  });

  it("preserves the documented server-authority boundary for cross-workflow claim documents", () => {
    expect(appSource).toContain("object-level document authority remains server-side");
  });

  it("proves assessor and panel-beater context-only tools no longer imply a separate dashboard destination", () => {
    expect(assessorLayoutSource).toContain('{ label: "Assessment Form", href: "/assessor", icon: Wrench, description: "Open an assigned claim to assess", contextOnly: true }');
    expect(assessorLayoutSource).toContain('{ label: "Documents", href: "/assessor", icon: FileText, description: "Available inside an assigned claim", contextOnly: true }');
    expect(panelBeaterLayoutSource).toContain('{ label: "Quote Requests", href: "/panel-beater/dashboard", icon: ClipboardList, description: "Open a claim to quote", contextOnly: true }');
    expect(panelBeaterLayoutSource).toContain('{ label: "Quote History", href: "/panel-beater/dashboard", icon: DollarSign, description: "Available within the active quote workspace", contextOnly: true }');
    expect(panelBeaterLayoutSource).toContain('{ label: "Documents", href: "/panel-beater/dashboard", icon: FileText, description: "Available inside an assigned claim", contextOnly: true }');
    expect(assessorLayoutSource).toContain('if (item.contextOnly)');
    expect(panelBeaterLayoutSource).toContain('if (item.contextOnly)');
  });

  it("proves fleet registration controls are restricted to managers while drivers receive an explanatory state", () => {
    expect(fleetSource).toContain('const isManager = ["fleet_manager", "fleet_admin", "admin", "platform_super_admin"]');
    expect(fleetSource).toMatch(/p11-hero-actions[\s\S]{0,420}\{isManager \? \(/);
    expect(fleetSource).toContain("Vehicle registration is managed by your fleet manager.");
    expect(fleetSource).toContain("Ask your fleet manager to register a vehicle.");
    expect(fleetSource).toContain("Vehicle and fleet setup is managed by your fleet manager.");
    expect(fleetSource).toContain("{isManager && <button className=\"p11-btn-gold\" onClick={() => setIsDriverDialogOpen(true)}>");
  });

  it("proves engineer entries carry safe icon metadata while recording repeated generic inspection destinations", () => {
    expect(engineerLayoutSource).toContain('label: "Projects",\n        href: "/engineer/projects",\n        icon: FolderOpen');
    expect(engineerLayoutSource).toContain('label: "Asset Passport",\n        href: "/engineer/asset-passport",\n        icon: FileText');
    expect(engineerLayoutSource).toContain("const Icon = item.icon ?? FolderOpen;");
    expect(engineerLayoutSource).toContain("<Icon");
    expect((engineerLayoutSource.match(/href: "\/engineer\/inspections"/g) ?? []).length).toBeGreaterThanOrEqual(6);
  });
});
