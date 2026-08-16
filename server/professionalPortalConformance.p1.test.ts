import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  INSURER_ROLE_PORTAL_MAP,
  PORTAL_ROUTE_ROLES,
  getRoleDashboardPath,
  getPortalAllowedRoles,
  isPortalNavigationAllowed,
} from "../client/src/lib/roleRouting";

const appSource = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
const insurerLayoutSource = readFileSync(new URL("../client/src/components/InsurerPortalLayout.tsx", import.meta.url), "utf8");
const assessorLayoutSource = readFileSync(new URL("../client/src/components/AssessorPortalLayout.tsx", import.meta.url), "utf8");
const panelBeaterLayoutSource = readFileSync(new URL("../client/src/components/PanelBeaterPortalLayout.tsx", import.meta.url), "utf8");
const fleetSource = readFileSync(new URL("../client/src/pages/FleetManagement.tsx", import.meta.url), "utf8");
const engineerLayoutSource = readFileSync(new URL("../client/src/components/EngineerWorkspaceLayout.tsx", import.meta.url), "utf8");
const platformLayoutSource = readFileSync(new URL("../client/src/components/PlatformLayout.tsx", import.meta.url), "utf8");
const insurerRoleSelectionSource = readFileSync(new URL("../client/src/pages/InsurerRoleSelection.tsx", import.meta.url), "utf8");

describe("professional portal conformance — insurer navigation and admission", () => {
  it("aligns shared route navigation pre-checks with actual App role guards", () => {
    expect(getPortalAllowedRoles("/insurer-portal/exception-intelligence")).toEqual(["risk_manager", "claims_manager", "executive", "insurer_admin"]);
    expect(getPortalAllowedRoles("/insurer-portal/team-members")).toEqual(["insurer_admin"]);
    expect(isPortalNavigationAllowed("/insurer-portal/exception-intelligence", "insurer", "claims_processor")).toBe(false);
    expect(isPortalNavigationAllowed("/insurer-portal/team-members", "insurer", "claims_processor")).toBe(false);
    expect(isPortalNavigationAllowed("/insurer-portal/exception-intelligence", "insurer", "risk_manager")).toBe(true);
    expect(isPortalNavigationAllowed("/insurer-portal/team-members", "insurer", "insurer_admin")).toBe(true);

    expect(appSource).toMatch(/path="\/insurer-portal\/exception-intelligence"[\s\S]{0,300}RoleGuard allowedRoles=\{\["risk_manager", "claims_manager", "executive", "insurer_admin"\]\}/);
    expect(appSource).toMatch(/path="\/insurer-portal\/team-members"[\s\S]{0,220}RoleGuard allowedRoles=\{\["insurer_admin"\]\}/);
  });

  it("proves insurer-admin Workflow Settings no longer leaves the insurer domain", () => {
    expect(insurerLayoutSource).toContain('{ label: "Workflow Settings", description: "Managed by platform administration", href: "/insurer-portal/insurer-admin", icon: Settings, unavailable: true }');
    expect(insurerLayoutSource).toContain('if (item.unavailable)');
    expect(insurerLayoutSource).not.toContain('href: "/admin/workflows"');
    expect(appSource).toContain('path="/admin/workflows"');
  });

  it("gives external assessors a role-correct assigned-work landing without the generic upload utility", () => {
    expect(INSURER_ROLE_PORTAL_MAP.assessor_external).toBe("/insurer-portal/external-assessor");
    expect(getRoleDashboardPath("insurer", "assessor_external")).toBe("/insurer-portal/external-assessor");
    expect(PORTAL_ROUTE_ROLES).toContainEqual({ prefix: "/insurer-portal/external-assessor", allowedRoles: ["assessor_external"] });
    expect(insurerRoleSelectionSource).toContain('id: "assessor_external"');
    expect(insurerRoleSelectionSource).toContain('path: "/insurer-portal/external-assessor"');
    expect(appSource).toMatch(/path="\/insurer-portal\/external-assessor"[\s\S]{0,280}RoleGuard allowedRoles=\{\["assessor_external"\]\}/);
    expect(appSource).toContain('routePattern="/insurer-portal/external-assessor/claims/:id"');
    expect(appSource).not.toMatch(/path="\/insurer-portal\/external-assessor"[\s\S]{0,400}InsurerExternalAssessmentUpload/);
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
    expect(engineerLayoutSource).toContain('  FileText,\n} from "lucide-react";');
    expect(engineerLayoutSource).toContain("const Icon = item.icon ?? FolderOpen;");
    expect(engineerLayoutSource).toContain("<Icon");
    expect(engineerLayoutSource).toContain("if (item.contextOnly)");
    expect((engineerLayoutSource.match(/contextOnly: true/g) ?? []).length).toBe(6);
  });

  it("proves platform navigation uses direct Link content without nested anchors", () => {
    expect(platformLayoutSource).toContain("<Link\n                key={item.href}");
    expect(platformLayoutSource).toContain('href="/" className="text-xs');
    expect(platformLayoutSource).not.toContain("<Link key={item.href} href={item.href}>\n                <a");
    expect(platformLayoutSource).not.toContain('<Link href="/">\n            <a');
  });

  it("proves platform Claim Trace does not navigate without the required claim identifier", () => {
    expect(platformLayoutSource).toContain('label: "Claim Trace",');
    expect(platformLayoutSource).toContain('href: "/platform/claim-trace",');
    expect(platformLayoutSource).toContain('unavailable: true,');
    expect(platformLayoutSource).toContain('if (item.unavailable)');
    expect(appSource).toContain('path="/platform/claim-trace/:claimId"');
  });

  it("admits platform-super-admin testing access to legacy platform administration routes", () => {
    expect(appSource).toMatch(/path="\/historical-claims"[\s\S]{0,160}allowedRoles=\{\["admin", "platform_super_admin"\]\}/);
    expect(appSource).toMatch(/path="\/ml\/review\/queue"[\s\S]{0,160}allowedRoles=\{\["admin", "platform_super_admin"\]\}/);
  });
});
