/**
 * Workflow Queries Router Integration Tests
 * 
 * Tests:
 * - Role-based state access filtering
 * - Cross-tenant access blocking
 * - Pagination functionality
 * - Total count accuracy
 */

import { describe, it, expect, beforeAll } from "vitest";
import { workflowQueriesRouter } from "./workflow-queries";
import { getDb } from "../db";
import { claims } from "../../drizzle/schema";

describe("Workflow Queries Router", () => {
  let testClaimIds: Record<string, number> = {};

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Create test claims in different states for tenant-1
    const states = ["created", "technical_approval", "financial_decision", "approved"];
    
    for (const state of states) {
      const uniqueClaimNumber = `TEST-WF-${state.toUpperCase()}-${Date.now()}`;
      const result = await db.insert(claims).values({
        claimNumber: uniqueClaimNumber,
        claimantId: 1,
        tenantId: "test-tenant-1",
        status: "submitted",
        workflowState: state as any,
        createdAt: new Date(),
      });

      const insertId = (result as unknown as { insertId: string | number }).insertId;
      testClaimIds[state] = Number(insertId);
    }

    // Create claims for different tenant
    const crossTenantResult = await db.insert(claims).values({
      claimNumber: `TEST-WF-CROSS-TENANT-${Date.now()}`,
      claimantId: 2,
      tenantId: "test-tenant-2",
      status: "submitted",
      workflowState: "created",
      createdAt: new Date(),
    });

    const crossTenantId = (crossTenantResult as unknown as { insertId: string | number }).insertId;
    testClaimIds.crossTenant = Number(crossTenantId);
  });

  describe("getClaimsByState", () => {
    it("should reject non-insurer users", async () => {
      const ctx = {
        user: {
          id: 200,
          role: "claimant" as const,
          tenantId: "test-tenant-1",
          insurerRole: null,
        },
      };

      const caller = workflowQueriesRouter.createCaller(ctx);

      await expect(
        caller.getClaimsByState({
          state: "created",
          limit: 50,
          offset: 0,
        })
      ).rejects.toThrow("Only insurer tenant members can query claims by workflow state");
    });

    it("should block processor from accessing technical_approval state", async () => {
      const ctx = {
        user: {
          id: 201,
          role: "insurer" as const,
          tenantId: "test-tenant-1",
          insurerRole: "claims_processor" as const,
        },
      };

      const caller = workflowQueriesRouter.createCaller(ctx);

      await expect(
        caller.getClaimsByState({
          state: "technical_approval",
          limit: 50,
          offset: 0,
        })
      ).rejects.toThrow("Your role (claims_processor) does not have access to claims in state 'technical_approval'");
    });

    it("should allow processor to access created state", async () => {
      const ctx = {
        user: {
          id: 202,
          role: "insurer" as const,
          tenantId: "test-tenant-1",
          insurerRole: "claims_processor" as const,
        },
      };

      const caller = workflowQueriesRouter.createCaller(ctx);

      const result = await caller.getClaimsByState({
        state: "created",
        limit: 50,
        offset: 0,
      });

      expect(result.claims.length).toBeGreaterThan(0);
      expect(result.total).toBeGreaterThan(0);
      expect(result.claims.every((c) => c.workflowState === "created")).toBe(true);
      expect(result.claims.every((c) => c.tenantId === "test-tenant-1")).toBe(true);
    });

    it("should allow executive to access all states", async () => {
      const ctx = {
        user: {
          id: 203,
          role: "insurer" as const,
          tenantId: "test-tenant-1",
          insurerRole: "executive" as const,
        },
      };

      const caller = workflowQueriesRouter.createCaller(ctx);

      // Test access to technical_approval (restricted for most roles)
      const techApprovalResult = await caller.getClaimsByState({
        state: "technical_approval",
        limit: 50,
        offset: 0,
      });

      expect(techApprovalResult.claims.length).toBeGreaterThan(0);
      expect(techApprovalResult.claims.every((c) => c.workflowState === "technical_approval")).toBe(true);

      // Test access to financial_decision (restricted for most roles)
      const financialResult = await caller.getClaimsByState({
        state: "financial_decision",
        limit: 50,
        offset: 0,
      });

      expect(financialResult.claims.length).toBeGreaterThan(0);
      expect(financialResult.claims.every((c) => c.workflowState === "financial_decision")).toBe(true);
    });

    it("should block cross-tenant access", async () => {
      const ctx = {
        user: {
          id: 204,
          role: "insurer" as const,
          tenantId: "test-tenant-2", // Different tenant
          insurerRole: "executive" as const,
        },
      };

      const caller = workflowQueriesRouter.createCaller(ctx);

      const result = await caller.getClaimsByState({
        state: "created",
        limit: 50,
        offset: 0,
      });

      // Should only see tenant-2 claims, not tenant-1 claims
      expect(result.claims.every((c) => c.tenantId === "test-tenant-2")).toBe(true);
      expect(result.claims.every((c) => c.tenantId !== "test-tenant-1")).toBe(true);
    });

    it("should support pagination with correct total count", async () => {
      const ctx = {
        user: {
          id: 205,
          role: "insurer" as const,
          tenantId: "test-tenant-1",
          insurerRole: "executive" as const,
        },
      };

      const caller = workflowQueriesRouter.createCaller(ctx);

      // Get first page
      const page1 = await caller.getClaimsByState({
        state: "created",
        limit: 1,
        offset: 0,
      });

      expect(page1.limit).toBe(1);
      expect(page1.offset).toBe(0);
      expect(page1.claims.length).toBeLessThanOrEqual(1);
      expect(page1.total).toBeGreaterThan(0);

      if (page1.total > 1) {
        // Get second page
        const page2 = await caller.getClaimsByState({
          state: "created",
          limit: 1,
          offset: 1,
        });

        expect(page2.limit).toBe(1);
        expect(page2.offset).toBe(1);
        expect(page2.total).toBe(page1.total); // Total should be same
        
        // Claims should be different
        if (page1.claims.length > 0 && page2.claims.length > 0) {
          expect(page1.claims[0].id).not.toBe(page2.claims[0].id);
        }
      }
    });

    it("should calculate hasMore flag correctly", async () => {
      const ctx = {
        user: {
          id: 206,
          role: "insurer" as const,
          tenantId: "test-tenant-1",
          insurerRole: "executive" as const,
        },
      };

      const caller = workflowQueriesRouter.createCaller(ctx);

      const result = await caller.getClaimsByState({
        state: "created",
        limit: 1,
        offset: 0,
      });

      if (result.total > 1) {
        expect(result.hasMore).toBe(true);
      } else {
        expect(result.hasMore).toBe(false);
      }
    });

    it("should allow risk_manager to access technical_approval but not created", async () => {
      const ctx = {
        user: {
          id: 207,
          role: "insurer" as const,
          tenantId: "test-tenant-1",
          insurerRole: "risk_manager" as const,
        },
      };

      const caller = workflowQueriesRouter.createCaller(ctx);

      // Should access technical_approval
      const techResult = await caller.getClaimsByState({
        state: "technical_approval",
        limit: 50,
        offset: 0,
      });

      expect(techResult.claims.length).toBeGreaterThan(0);

      // Should NOT access created
      await expect(
        caller.getClaimsByState({
          state: "created",
          limit: 50,
          offset: 0,
        })
      ).rejects.toThrow("Your role (risk_manager) does not have access to claims in state 'created'");
    });
  });

  describe("getAccessibleStates", () => {
    it("should return accessible states for claims_processor", async () => {
      const ctx = {
        user: {
          id: 208,
          role: "insurer" as const,
          tenantId: "test-tenant-1",
          insurerRole: "claims_processor" as const,
        },
      };

      const caller = workflowQueriesRouter.createCaller(ctx);

      const result = await caller.getAccessibleStates();

      expect(result.role).toBe("claims_processor");
      expect(result.accessibleStates).toContain("created");
      expect(result.accessibleStates).toContain("assigned");
      expect(result.accessibleStates).not.toContain("technical_approval");
      expect(result.accessibleStates).not.toContain("financial_decision");
    });

    it("should return all states for executive", async () => {
      const ctx = {
        user: {
          id: 209,
          role: "insurer" as const,
          tenantId: "test-tenant-1",
          insurerRole: "executive" as const,
        },
      };

      const caller = workflowQueriesRouter.createCaller(ctx);

      const result = await caller.getAccessibleStates();

      expect(result.role).toBe("executive");
      expect(result.accessibleStates).toContain("created");
      expect(result.accessibleStates).toContain("technical_approval");
      expect(result.accessibleStates).toContain("financial_decision");
      expect(result.accessibleStates).toContain("payment_authorized");
    });

    it("should reject non-insurer users", async () => {
      const ctx = {
        user: {
          id: 210,
          role: "panel_beater" as const,
          tenantId: "test-tenant-1",
          insurerRole: null,
        },
      };

      const caller = workflowQueriesRouter.createCaller(ctx);

      await expect(
        caller.getAccessibleStates()
      ).rejects.toThrow("Only insurer tenant members can query accessible states");
    });
  });
});
