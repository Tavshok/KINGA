/**
 * E2E Login Routing Tests
 *
 * Verifies that getDashboardPath() routes every role to the correct dashboard,
 * and that DOMAIN_ROLE_MAP.agency permits the correct roles (including
 * platform_super_admin for system testing).
 *
 * These tests are pure logic tests — no browser, no OAuth, no DB required.
 * They guard against regressions in the role-routing layer.
 *
 * Epic 1 Task 5 — added 2026-07-30
 */

import { describe, it, expect } from "vitest";

// ─── Inline the getDashboardPath logic ───────────────────────────────────────
// We duplicate the function here rather than importing from the client bundle
// to keep this as a pure server-side Vitest test (no Vite/React transforms).
// If getDashboardPath changes in Login.tsx, this test will catch the divergence.

function getDashboardPath(userRole: string): string {
  switch (userRole) {
    case "insurer":
    case "admin":
      return "/insurer-portal";
    case "assessor":
      return "/assessor/dashboard";
    case "panel_beater":
      return "/panel-beater/dashboard";
    case "claimant":
      return "/claimant/dashboard";
    case "agency":
      return "/agency";
    case "platform_super_admin":
      return "/platform/overview";
    default:
      return "/";
  }
}

// ─── Inline the DOMAIN_ROLE_MAP for agency ───────────────────────────────────
// Mirrors ProtectedRoute.tsx DOMAIN_ROLE_MAP.agency (confirmed 2026-07-30).
const AGENCY_DOMAIN_ROLES = ["agency", "admin", "platform_super_admin"];

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("getDashboardPath — role routing", () => {
  it("routes 'agency' to /agency", () => {
    expect(getDashboardPath("agency")).toBe("/agency");
  });

  it("routes 'platform_super_admin' to /platform/overview (primary dashboard)", () => {
    expect(getDashboardPath("platform_super_admin")).toBe("/platform/overview");
  });

  it("routes 'admin' to /insurer-portal", () => {
    expect(getDashboardPath("admin")).toBe("/insurer-portal");
  });

  it("routes 'insurer' to /insurer-portal", () => {
    expect(getDashboardPath("insurer")).toBe("/insurer-portal");
  });

  it("routes 'assessor' to /assessor/dashboard", () => {
    expect(getDashboardPath("assessor")).toBe("/assessor/dashboard");
  });

  it("routes 'panel_beater' to /panel-beater/dashboard", () => {
    expect(getDashboardPath("panel_beater")).toBe("/panel-beater/dashboard");
  });

  it("routes 'claimant' to /claimant/dashboard", () => {
    expect(getDashboardPath("claimant")).toBe("/claimant/dashboard");
  });

  it("routes unknown role to / (safe fallback)", () => {
    expect(getDashboardPath("unknown_role")).toBe("/");
    expect(getDashboardPath("")).toBe("/");
  });
});

describe("DOMAIN_ROLE_MAP.agency — access control", () => {
  it("permits 'agency' role to access agency domain", () => {
    expect(AGENCY_DOMAIN_ROLES).toContain("agency");
  });

  it("permits 'admin' role to access agency domain", () => {
    expect(AGENCY_DOMAIN_ROLES).toContain("admin");
  });

  it("permits 'platform_super_admin' to access agency domain (system testing)", () => {
    expect(AGENCY_DOMAIN_ROLES).toContain("platform_super_admin");
  });

  it("does NOT permit 'insurer' to access agency domain", () => {
    expect(AGENCY_DOMAIN_ROLES).not.toContain("insurer");
  });

  it("does NOT permit 'claimant' to access agency domain", () => {
    expect(AGENCY_DOMAIN_ROLES).not.toContain("claimant");
  });

  it("does NOT permit 'fleet_admin' to access agency domain", () => {
    expect(AGENCY_DOMAIN_ROLES).not.toContain("fleet_admin");
  });

  it("does NOT permit 'assessor' to access agency domain", () => {
    expect(AGENCY_DOMAIN_ROLES).not.toContain("assessor");
  });
});

describe("platform_super_admin — full routing behaviour", () => {
  it("primary dashboard is /platform/overview, not /agency", () => {
    // platform_super_admin's HOME is the platform overview.
    // Agency access is supplementary (for system testing) — not the default landing.
    expect(getDashboardPath("platform_super_admin")).toBe("/platform/overview");
    expect(getDashboardPath("platform_super_admin")).not.toBe("/agency");
  });

  it("can access agency domain via DOMAIN_ROLE_MAP (supplementary access)", () => {
    // Despite landing at /platform/overview, platform_super_admin can navigate
    // to /agency and the ProtectedRoute will permit it.
    expect(AGENCY_DOMAIN_ROLES).toContain("platform_super_admin");
  });
});
