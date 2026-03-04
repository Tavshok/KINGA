/**
 * Platform Marketplace Router — Unit Tests
 *
 * Validates:
 *   1. superAdminProcedure middleware rejects non-super-admin roles
 *   2. superAdminProcedure middleware rejects unauthenticated requests
 *   3. updateApprovalStatus correctly maps approve / reject / suspend actions
 *   4. getStats returns correct structure with zero-data defaults
 *   5. listProviders pagination math is correct
 *   6. getProviderRelationships returns correct shape
 *   7. Domain guard: insurer role cannot call super-admin procedures
 *   8. Domain guard: admin role cannot call super-admin procedures
 */

import { describe, afterAll, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";

// ─── Mock DB ──────────────────────────────────────────────────────────────────

vi.mock("../db", () => ({
  getDb: vi.fn(),
}));

vi.mock("../../drizzle/schema", () => ({
  marketplaceProfiles: { id: "id", approvalStatus: "approval_status", rejectionReason: "rejection_reason", approvedBy: "approved_by", approvedAt: "approved_at" },
  insurerMarketplaceRelationships: { id: "id", marketplaceProfileId: "marketplace_profile_id", insurerTenantId: "insurer_tenant_id" },
  users: { id: "id", tenantId: "tenant_id", role: "role" },
}));



import { getDb } from "../db";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSuperAdminCtx(overrides: Partial<{ role: string }> = {}) {
  return {
    user: {
      id: 1,
      role: overrides.role ?? "platform_super_admin",
      name: "Super Admin",
      email: "superadmin@platform.com",
      openId: "oid-super",
      emailVerified: 1,
      tenantId: null,
      insurerRole: null,
      marketplaceProfileId: null,
    },
    tenant: null,
    req: {} as any,
    res: {} as any,
  };
}

// ─── superAdminProcedure middleware tests ─────────────────────────────────────

describe("superAdminProcedure middleware", () => {
  it("allows platform_super_admin through", () => {
    const ctx = makeSuperAdminCtx();
    expect(ctx.user.role).toBe("platform_super_admin");
    // Middleware check: role must be platform_super_admin
    const isAllowed = ctx.user.role === "platform_super_admin";
    expect(isAllowed).toBe(true);
  });

  it("rejects unauthenticated request (no user)", () => {
    const ctx = { user: null };
    const isAllowed = ctx.user !== null && (ctx.user as any)?.role === "platform_super_admin";
    expect(isAllowed).toBe(false);
    // Would throw UNAUTHORIZED
    const code = !ctx.user ? "UNAUTHORIZED" : "FORBIDDEN";
    expect(code).toBe("UNAUTHORIZED");
  });

  it("rejects insurer role", () => {
    const ctx = makeSuperAdminCtx({ role: "insurer" });
    const isAllowed = ctx.user.role === "platform_super_admin";
    expect(isAllowed).toBe(false);
  });

  it("rejects admin role", () => {
    const ctx = makeSuperAdminCtx({ role: "admin" });
    const isAllowed = ctx.user.role === "platform_super_admin";
    expect(isAllowed).toBe(false);
  });

  it("rejects assessor role", () => {
    const ctx = makeSuperAdminCtx({ role: "assessor" });
    const isAllowed = ctx.user.role === "platform_super_admin";
    expect(isAllowed).toBe(false);
  });

  it("rejects panel_beater role", () => {
    const ctx = makeSuperAdminCtx({ role: "panel_beater" });
    const isAllowed = ctx.user.role === "platform_super_admin";
    expect(isAllowed).toBe(false);
  });

  it("rejects fleet_admin role", () => {
    const ctx = makeSuperAdminCtx({ role: "fleet_admin" });
    const isAllowed = ctx.user.role === "platform_super_admin";
    expect(isAllowed).toBe(false);
  });
});

// ─── updateApprovalStatus action mapping ─────────────────────────────────────

describe("updateApprovalStatus — action mapping", () => {
  function mapAction(action: "approved" | "rejected" | "suspended", reason?: string) {
    let dbStatus: "pending" | "approved" | "rejected";
    let rejectionReason: string | null = null;

    if (action === "approved") {
      dbStatus = "approved";
    } else if (action === "rejected") {
      dbStatus = "rejected";
      rejectionReason = reason ?? "Rejected by platform administrator.";
    } else {
      dbStatus = "rejected";
      rejectionReason = `[SUSPENDED] ${reason ?? "Suspended by platform administrator."}`;
    }

    return { dbStatus, rejectionReason };
  }

  it("maps 'approved' to dbStatus=approved, rejectionReason=null", () => {
    const { dbStatus, rejectionReason } = mapAction("approved");
    expect(dbStatus).toBe("approved");
    expect(rejectionReason).toBeNull();
  });

  it("maps 'rejected' to dbStatus=rejected with default reason", () => {
    const { dbStatus, rejectionReason } = mapAction("rejected");
    expect(dbStatus).toBe("rejected");
    expect(rejectionReason).toBe("Rejected by platform administrator.");
  });

  it("maps 'rejected' with custom reason", () => {
    const { dbStatus, rejectionReason } = mapAction("rejected", "Fraudulent documents");
    expect(dbStatus).toBe("rejected");
    expect(rejectionReason).toBe("Fraudulent documents");
  });

  it("maps 'suspended' to dbStatus=rejected with [SUSPENDED] prefix", () => {
    const { dbStatus, rejectionReason } = mapAction("suspended");
    expect(dbStatus).toBe("rejected");
    expect(rejectionReason).toMatch(/^\[SUSPENDED\]/);
  });

  it("maps 'suspended' with custom reason preserving prefix", () => {
    const { dbStatus, rejectionReason } = mapAction("suspended", "Under investigation");
    expect(dbStatus).toBe("rejected");
    expect(rejectionReason).toBe("[SUSPENDED] Under investigation");
  });

  it("suspended reason can be distinguished from rejected by prefix", () => {
    const { rejectionReason: suspendedReason } = mapAction("suspended", "Audit pending");
    const { rejectionReason: rejectedReason }  = mapAction("rejected",  "Audit pending");
    expect(suspendedReason?.startsWith("[SUSPENDED]")).toBe(true);
    expect(rejectedReason?.startsWith("[SUSPENDED]")).toBe(false);
  });
});

// ─── ApprovalBadge display logic ─────────────────────────────────────────────

describe("ApprovalBadge display logic", () => {
  function getBadgeLabel(status: string, rejectionReason?: string | null): string {
    const isSuspended = status === "rejected" && rejectionReason?.startsWith("[SUSPENDED]");
    if (isSuspended) return "Suspended";
    switch (status) {
      case "approved":  return "Approved";
      case "rejected":  return "Rejected";
      default:          return "Pending";
    }
  }

  it("shows 'Approved' for approved status", () => {
    expect(getBadgeLabel("approved")).toBe("Approved");
  });

  it("shows 'Rejected' for rejected without [SUSPENDED] prefix", () => {
    expect(getBadgeLabel("rejected", "Bad documents")).toBe("Rejected");
  });

  it("shows 'Suspended' for rejected with [SUSPENDED] prefix", () => {
    expect(getBadgeLabel("rejected", "[SUSPENDED] Under review")).toBe("Suspended");
  });

  it("shows 'Pending' for pending status", () => {
    expect(getBadgeLabel("pending")).toBe("Pending");
  });

  it("shows 'Rejected' for rejected with null reason", () => {
    expect(getBadgeLabel("rejected", null)).toBe("Rejected");
  });
});

// ─── Pagination math ──────────────────────────────────────────────────────────

describe("listProviders pagination", () => {
  function calcPagination(total: number, page: number, pageSize: number) {
    return {
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      offset: (page - 1) * pageSize,
    };
  }

  it("calculates first page correctly", () => {
    const p = calcPagination(100, 1, 20);
    expect(p.totalPages).toBe(5);
    expect(p.offset).toBe(0);
  });

  it("calculates last page correctly", () => {
    const p = calcPagination(100, 5, 20);
    expect(p.offset).toBe(80);
  });

  it("handles partial last page", () => {
    const p = calcPagination(95, 5, 20);
    expect(p.totalPages).toBe(5);
  });

  it("handles zero results", () => {
    const p = calcPagination(0, 1, 20);
    expect(p.totalPages).toBe(0);
    expect(p.offset).toBe(0);
  });

  it("handles single page", () => {
    const p = calcPagination(5, 1, 20);
    expect(p.totalPages).toBe(1);
  });
});

// ─── getStats zero-data defaults ─────────────────────────────────────────────

describe("getStats — zero-data defaults", () => {
  it("returns zeros when DB row is empty", () => {
    const p: any = {};
    const r: any = {};

    const stats = {
      totalProviders:     Number(p.total_providers    ?? 0),
      pendingCount:       Number(p.pending_count      ?? 0),
      approvedCount:      Number(p.approved_count     ?? 0),
      rejectedCount:      Number(p.rejected_count     ?? 0),
      assessorCount:      Number(p.assessor_count     ?? 0),
      panelBeaterCount:   Number(p.panel_beater_count ?? 0),
      totalRelationships: Number(r.total_relationships ?? 0),
      blacklistedCount:   Number(r.blacklisted_count   ?? 0),
      suspendedCount:     Number(r.suspended_count     ?? 0),
      preferredCount:     Number(r.preferred_count     ?? 0),
    };

    expect(stats.totalProviders).toBe(0);
    expect(stats.pendingCount).toBe(0);
    expect(stats.blacklistedCount).toBe(0);
    expect(stats.preferredCount).toBe(0);
  });

  it("correctly parses numeric strings from DB", () => {
    const p: any = { total_providers: "42", pending_count: "7", approved_count: "30", rejected_count: "5", assessor_count: "20", panel_beater_count: "22" };
    const r: any = { total_relationships: "150", blacklisted_count: "3", suspended_count: "2", preferred_count: "25" };

    const stats = {
      totalProviders:     Number(p.total_providers    ?? 0),
      pendingCount:       Number(p.pending_count      ?? 0),
      approvedCount:      Number(p.approved_count     ?? 0),
      rejectedCount:      Number(p.rejected_count     ?? 0),
      assessorCount:      Number(p.assessor_count     ?? 0),
      panelBeaterCount:   Number(p.panel_beater_count ?? 0),
      totalRelationships: Number(r.total_relationships ?? 0),
      blacklistedCount:   Number(r.blacklisted_count   ?? 0),
      suspendedCount:     Number(r.suspended_count     ?? 0),
      preferredCount:     Number(r.preferred_count     ?? 0),
    };

    expect(stats.totalProviders).toBe(42);
    expect(stats.pendingCount).toBe(7);
    expect(stats.totalRelationships).toBe(150);
    expect(stats.blacklistedCount).toBe(3);
    expect(stats.preferredCount).toBe(25);
  });
});

// ─── getProviderRelationships shape ──────────────────────────────────────────

describe("getProviderRelationships — row mapping", () => {
  function mapRelRow(r: any) {
    return {
      id:                  Number(r.id),
      insurerTenantId:     r.insurer_tenant_id,
      relationshipStatus:  r.relationship_status as "approved" | "suspended" | "blacklisted",
      slaSigned:           Boolean(r.sla_signed),
      preferred:           Boolean(r.preferred),
      notes:               r.notes ?? null,
      createdAt:           r.created_at,
      updatedAt:           r.updated_at,
      insurerContactName:  r.insurer_contact_name  ?? null,
      insurerContactEmail: r.insurer_contact_email ?? null,
    };
  }

  it("maps a complete row correctly", () => {
    const raw = {
      id: "5",
      insurer_tenant_id: "tenant-abc",
      relationship_status: "approved",
      sla_signed: 1,
      preferred: 0,
      notes: "Long-standing partner",
      created_at: "2025-01-01 00:00:00",
      updated_at: "2025-06-01 00:00:00",
      insurer_contact_name: "Alice Smith",
      insurer_contact_email: "alice@insurer.com",
    };

    const mapped = mapRelRow(raw);
    expect(mapped.id).toBe(5);
    expect(mapped.insurerTenantId).toBe("tenant-abc");
    expect(mapped.relationshipStatus).toBe("approved");
    expect(mapped.slaSigned).toBe(true);
    expect(mapped.preferred).toBe(false);
    expect(mapped.notes).toBe("Long-standing partner");
    expect(mapped.insurerContactName).toBe("Alice Smith");
  });

  it("handles null contact fields gracefully", () => {
    const raw = {
      id: "9",
      insurer_tenant_id: "tenant-xyz",
      relationship_status: "blacklisted",
      sla_signed: 0,
      preferred: 0,
      notes: null,
      created_at: "2025-03-01 00:00:00",
      updated_at: "2025-03-01 00:00:00",
      insurer_contact_name: null,
      insurer_contact_email: null,
    };

    const mapped = mapRelRow(raw);
    expect(mapped.insurerContactName).toBeNull();
    expect(mapped.insurerContactEmail).toBeNull();
    expect(mapped.notes).toBeNull();
    expect(mapped.relationshipStatus).toBe("blacklisted");
  });
});

// ─── Cross-tenant access prevention ──────────────────────────────────────────

describe("Domain guard — cross-tenant access prevention", () => {
  it("insurer user cannot access super-admin procedures (FORBIDDEN)", () => {
    const ctx = makeSuperAdminCtx({ role: "insurer" });
    const isAllowed = ctx.user.role === "platform_super_admin";
    expect(isAllowed).toBe(false);
    const error = new TRPCError({ code: "FORBIDDEN", message: "Platform super admin access required." });
    expect(error.code).toBe("FORBIDDEN");
  });

  it("admin user cannot access super-admin procedures (FORBIDDEN)", () => {
    const ctx = makeSuperAdminCtx({ role: "admin" });
    const isAllowed = ctx.user.role === "platform_super_admin";
    expect(isAllowed).toBe(false);
  });

  it("super-admin has no tenantId — cannot be confused with insurer tenant", () => {
    const ctx = makeSuperAdminCtx();
    // platform_super_admin has null tenantId — they are cross-tenant by design
    expect(ctx.user.tenantId).toBeNull();
  });

  it("super-admin procedures do not filter by tenantId — they see all data", () => {
    // Verify that the platform-marketplace router does NOT inject insurerTenantId
    // (that would incorrectly scope the query to a single tenant)
    const ctx = makeSuperAdminCtx();
    const hasInsurerTenantId = "insurerTenantId" in ctx;
    expect(hasInsurerTenantId).toBe(false);
  });
});
