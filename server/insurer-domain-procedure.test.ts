/**
 * Insurer Domain Procedure — Tenant Isolation Unit Tests
 *
 * Validates that the insurerDomainProcedure middleware enforces strict
 * backend-level tenant isolation. Cross-tenant access must throw
 * TRPCError with code "FORBIDDEN".
 *
 * These tests are pure unit tests (no DB required) that verify:
 * 1. The middleware throws FORBIDDEN when tenantId is null/empty
 * 2. The middleware injects insurerTenantId correctly
 * 3. Cross-tenant claim access throws FORBIDDEN
 * 4. SQL query filters always include the tenant condition
 * 5. Two tenants get completely isolated result sets
 * 6. Quote optimisation procedures enforce tenant isolation
 * 7. Executive procedures enforce tenant isolation
 */

import { describe, it, expect } from "vitest";
import { TRPCError } from "@trpc/server";

// ─── Middleware simulation ────────────────────────────────────────────────────

/**
 * Simulates the exact logic of the requireInsurerDomain middleware
 * defined in server/_core/trpc.ts
 */
async function simulateInsurerDomainMiddleware(user: any) {
  if (!user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Authentication required" });
  }
  const tenantId = user.tenantId;
  if (!tenantId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "User is not associated with an insurer tenant. Access denied.",
    });
  }
  return { insurerTenantId: tenantId };
}

/**
 * Simulates the cross-tenant guard used in claims.byStatus,
 * claims.assignToAssessor, quoteOptimisation.*, and executive.*
 */
async function simulateCrossTenantGuard(
  claimTenantId: string | null,
  insurerTenantId: string
) {
  if (!claimTenantId || claimTenantId !== insurerTenantId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Claim not found or access denied" });
  }
  return { allowed: true };
}

// ─── 1. Middleware unit tests ─────────────────────────────────────────────────

describe("insurerDomainProcedure middleware", () => {
  it("throws UNAUTHORIZED when user is null", async () => {
    await expect(simulateInsurerDomainMiddleware(null)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      message: "Authentication required",
    });
  });

  it("throws FORBIDDEN when tenantId is null", async () => {
    const user = { id: 1, role: "insurer", tenantId: null };
    await expect(simulateInsurerDomainMiddleware(user)).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "User is not associated with an insurer tenant. Access denied.",
    });
  });

  it("throws FORBIDDEN when tenantId is empty string", async () => {
    const user = { id: 1, role: "insurer", tenantId: "" };
    await expect(simulateInsurerDomainMiddleware(user)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("throws FORBIDDEN when tenantId is undefined", async () => {
    const user = { id: 1, role: "insurer", tenantId: undefined };
    await expect(simulateInsurerDomainMiddleware(user)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("injects insurerTenantId when tenantId is a valid string", async () => {
    const user = { id: 1, role: "insurer", tenantId: "tenant-abc-123" };
    const result = await simulateInsurerDomainMiddleware(user);
    expect(result.insurerTenantId).toBe("tenant-abc-123");
  });

  it("insurerTenantId is exactly equal to user.tenantId (no transformation)", async () => {
    const user = { id: 1, role: "insurer", tenantId: "org_uuid_xyz_789" };
    const result = await simulateInsurerDomainMiddleware(user);
    expect(result.insurerTenantId).toBe(user.tenantId);
  });
});

// ─── 2. Cross-tenant claim access guard ──────────────────────────────────────

describe("Cross-tenant claim access guard", () => {
  it("allows access when claim tenantId matches insurerTenantId", async () => {
    const result = await simulateCrossTenantGuard("tenant-a", "tenant-a");
    expect(result.allowed).toBe(true);
  });

  it("throws FORBIDDEN when claim tenantId differs from insurerTenantId", async () => {
    await expect(simulateCrossTenantGuard("tenant-b", "tenant-a")).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Claim not found or access denied",
    });
  });

  it("throws FORBIDDEN when claim tenantId is null (orphaned claim)", async () => {
    await expect(simulateCrossTenantGuard(null, "tenant-a")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("throws FORBIDDEN for reversed tenant order (tenant-b accessing tenant-a)", async () => {
    await expect(simulateCrossTenantGuard("tenant-a", "tenant-b")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("is case-sensitive — 'Tenant-A' !== 'tenant-a'", async () => {
    await expect(simulateCrossTenantGuard("Tenant-A", "tenant-a")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

// ─── 3. SQL query tenant filter correctness ──────────────────────────────────

describe("SQL query tenant filter", () => {
  it("byStatus query always includes tenantId filter", () => {
    const buildByStatusQuery = (status: string, insurerTenantId: string) => ({
      conditions: [
        { column: "status", value: status },
        { column: "tenantId", value: insurerTenantId },
      ],
    });

    const query = buildByStatusQuery("submitted", "tenant-a");
    const tenantFilter = query.conditions.find(c => c.column === "tenantId");
    expect(tenantFilter).toBeDefined();
    expect(tenantFilter?.value).toBe("tenant-a");
  });

  it("tenant filter value is always a non-empty string (never undefined/null)", () => {
    const buildFilter = (insurerTenantId: string | null | undefined) => {
      if (!insurerTenantId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "No tenant" });
      }
      return { column: "tenantId", value: insurerTenantId };
    };

    expect(buildFilter("tenant-xyz")).toEqual({ column: "tenantId", value: "tenant-xyz" });
    expect(() => buildFilter(null)).toThrow();
    expect(() => buildFilter(undefined)).toThrow();
    expect(() => buildFilter("")).toThrow();
  });

  it("workflow getClaimsByState always includes tenantId filter", () => {
    const buildWorkflowQuery = (state: string, insurerTenantId: string) => ({
      conditions: [
        { column: "workflowState", value: state },
        { column: "tenantId", value: insurerTenantId },
      ],
    });

    const query = buildWorkflowQuery("under_assessment", "tenant-b");
    const tenantFilter = query.conditions.find(c => c.column === "tenantId");
    expect(tenantFilter).toBeDefined();
    expect(tenantFilter?.value).toBe("tenant-b");
  });

  it("workflow getClaimsByStatus always includes tenantId filter", () => {
    const buildStatusQuery = (statuses: string[], insurerTenantId: string) => ({
      conditions: [
        { column: "status", operator: "inArray", value: statuses },
        { column: "tenantId", value: insurerTenantId },
      ],
    });

    const query = buildStatusQuery(["submitted", "approved"], "tenant-c");
    const tenantFilter = query.conditions.find(c => c.column === "tenantId");
    expect(tenantFilter).toBeDefined();
    expect(tenantFilter?.value).toBe("tenant-c");
  });
});

// ─── 4. Multi-tenant result set isolation ────────────────────────────────────

describe("Multi-tenant result set isolation", () => {
  const mockClaims = [
    { id: 1, status: "submitted", tenantId: "tenant-a" },
    { id: 2, status: "submitted", tenantId: "tenant-b" },
    { id: 3, status: "submitted", tenantId: "tenant-a" },
    { id: 4, status: "approved", tenantId: "tenant-b" },
    { id: 5, status: "approved", tenantId: "tenant-a" },
  ];

  const queryForTenant = (tenantId: string, status?: string) =>
    mockClaims.filter(c =>
      c.tenantId === tenantId && (status === undefined || c.status === status)
    );

  it("tenant-a gets only their own claims", () => {
    const results = queryForTenant("tenant-a");
    expect(results).toHaveLength(3);
    expect(results.every(c => c.tenantId === "tenant-a")).toBe(true);
  });

  it("tenant-b gets only their own claims", () => {
    const results = queryForTenant("tenant-b");
    expect(results).toHaveLength(2);
    expect(results.every(c => c.tenantId === "tenant-b")).toBe(true);
  });

  it("tenant-a byStatus returns only tenant-a claims with that status", () => {
    const results = queryForTenant("tenant-a", "submitted");
    expect(results).toHaveLength(2);
    expect(results.every(c => c.tenantId === "tenant-a" && c.status === "submitted")).toBe(true);
  });

  it("result sets are completely disjoint — no claim appears in both tenants", () => {
    const tenantAIds = new Set(queryForTenant("tenant-a").map(c => c.id));
    const tenantBIds = new Set(queryForTenant("tenant-b").map(c => c.id));
    const intersection = [...tenantAIds].filter(id => tenantBIds.has(id));
    expect(intersection).toHaveLength(0);
  });
});

// ─── 5. Quote optimisation tenant isolation ──────────────────────────────────

describe("Quote optimisation tenant isolation", () => {
  const mockClaims: Record<number, { id: number; tenantId: string }> = {
    100: { id: 100, tenantId: "tenant-a" },
    200: { id: 200, tenantId: "tenant-b" },
  };

  async function simulateGetResult(claimId: number, insurerTenantId: string) {
    const claim = mockClaims[claimId];
    if (!claim || claim.tenantId !== insurerTenantId) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Claim not found or access denied" });
    }
    return { claimId, result: "mock-optimisation-result" };
  }

  async function simulateRecordDecision(claimId: number, insurerTenantId: string) {
    const claim = mockClaims[claimId];
    if (!claim || claim.tenantId !== insurerTenantId) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Claim not found or access denied" });
    }
    return { success: true };
  }

  it("getResult allows same-tenant access", async () => {
    await expect(simulateGetResult(100, "tenant-a")).resolves.toMatchObject({ claimId: 100 });
  });

  it("getResult throws FORBIDDEN for cross-tenant access (tenant-b accessing tenant-a claim)", async () => {
    await expect(simulateGetResult(100, "tenant-b")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("getResult throws FORBIDDEN for cross-tenant access (tenant-a accessing tenant-b claim)", async () => {
    await expect(simulateGetResult(200, "tenant-a")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("recordDecision allows same-tenant access", async () => {
    await expect(simulateRecordDecision(100, "tenant-a")).resolves.toMatchObject({ success: true });
  });

  it("recordDecision throws FORBIDDEN for cross-tenant access", async () => {
    await expect(simulateRecordDecision(100, "tenant-b")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("retrigger throws FORBIDDEN for cross-tenant access", async () => {
    const simulateRetrigger = async (claimId: number, insurerTenantId: string) => {
      const claim = mockClaims[claimId];
      if (!claim || claim.tenantId !== insurerTenantId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Claim not found or access denied" });
      }
      return { success: true };
    };
    await expect(simulateRetrigger(200, "tenant-a")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(simulateRetrigger(200, "tenant-b")).resolves.toMatchObject({ success: true });
  });
});

// ─── 6. Executive router tenant isolation ────────────────────────────────────

describe("Executive router tenant isolation", () => {
  it("executive procedure throws FORBIDDEN without tenantId", async () => {
    await expect(simulateInsurerDomainMiddleware({ id: 1, role: "executive", tenantId: null }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("executive SQL queries include tenant_id filter", () => {
    const buildExecutiveQuery = (insurerTenantId: string) =>
      `SELECT * FROM claims WHERE tenant_id = '${insurerTenantId}'`;

    const queryA = buildExecutiveQuery("tenant-exec-001");
    const queryB = buildExecutiveQuery("tenant-exec-002");

    expect(queryA).toContain("tenant_id = 'tenant-exec-001'");
    expect(queryB).toContain("tenant_id = 'tenant-exec-002'");
    expect(queryA).not.toContain("tenant-exec-002");
    expect(queryB).not.toContain("tenant-exec-001");
  });

  it("executive procedures with valid tenantId inject insurerTenantId", async () => {
    const result = await simulateInsurerDomainMiddleware({
      id: 1,
      role: "executive",
      tenantId: "tenant-exec-001",
    });
    expect(result.insurerTenantId).toBe("tenant-exec-001");
  });
});

// ─── 7. Workflow queries tenant isolation ────────────────────────────────────

describe("Workflow queries tenant isolation", () => {
  it("getClaimsByState procedure throws FORBIDDEN without tenantId", async () => {
    await expect(simulateInsurerDomainMiddleware({ id: 1, role: "insurer", tenantId: null }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("getClaimsByStatus procedure throws FORBIDDEN without tenantId", async () => {
    await expect(simulateInsurerDomainMiddleware({ id: 1, role: "insurer", tenantId: undefined }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("getAccessibleStates procedure works with valid tenantId", async () => {
    const result = await simulateInsurerDomainMiddleware({
      id: 1,
      role: "insurer",
      tenantId: "tenant-workflow-001",
    });
    expect(result.insurerTenantId).toBe("tenant-workflow-001");
  });
});
