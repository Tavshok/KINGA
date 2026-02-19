// @ts-nocheck
import { describe, it, expect, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import type { InsurerRole } from "./rbac";

/**
 * Workflow Queries RBAC Integration Tests
 * 
 * Verifies role-based access control for workflow state queries:
 * 1. Claims processors can access operational states
 * 2. External assessors cannot access internal review states
 * 3. Risk managers can access approval states
 * 4. Unauthorized roles are blocked from restricted states
 * 5. Pagination parameters are respected
 * 6. Tenant isolation is enforced
 */

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createMockInsurerContext(insurerRole: InsurerRole, overrides?: Partial<AuthenticatedUser>): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: `test-${insurerRole}-001`,
    email: `${insurerRole}@kinga.co.za`,
    name: `Test ${insurerRole}`,
    loginMethod: "manus",
    role: "insurer",
    insurerRole,
    tenantId: "test-tenant",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

function createMockAssessorContext(overrides?: Partial<AuthenticatedUser>): TrpcContext {
  const user: AuthenticatedUser = {
    id: 2,
    openId: "test-assessor-001",
    email: "assessor@external.com",
    name: "Test Assessor",
    loginMethod: "manus",
    role: "assessor",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

describe("Workflow Queries RBAC - Role-Based Access Control", () => {
  describe("Claims Processor Access", () => {
    it("can access created state", async () => {
      const ctx = createMockInsurerContext("claims_processor");
      const caller = appRouter.createCaller(ctx);

      const result = await caller.workflowQueries.getClaimsByState({ 
        state: "created", 
        limit: 10, 
        offset: 0 
      });
      
      expect(result).toHaveProperty("items");
      expect(result).toHaveProperty("total");
      expect(Array.isArray(result.items)).toBe(true);
    });

    it("can access under_assessment state", async () => {
      const ctx = createMockInsurerContext("claims_processor");
      const caller = appRouter.createCaller(ctx);

      const result = await caller.workflowQueries.getClaimsByState({ 
        state: "under_assessment", 
        limit: 10, 
        offset: 0 
      });
      
      expect(result).toHaveProperty("items");
      expect(Array.isArray(result.items)).toBe(true);
    });

    it("cannot access technical_approval state", async () => {
      const ctx = createMockInsurerContext("claims_processor");
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.workflowQueries.getClaimsByState({ 
          state: "technical_approval", 
          limit: 10, 
          offset: 0 
        })
      ).rejects.toThrow();
    });
  });

  describe("External Assessor Access", () => {
    it("cannot access workflow state queries (insurer-only)", async () => {
      const ctx = createMockAssessorContext();
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.workflowQueries.getClaimsByState({ 
          state: "assigned", 
          limit: 10, 
          offset: 0 
        })
      ).rejects.toThrow("Only insurer tenant members can query claims by workflow state");
    });
  });

  describe("Risk Manager Access", () => {
    it("can access technical_approval state", async () => {
      const ctx = createMockInsurerContext("risk_manager");
      const caller = appRouter.createCaller(ctx);

      const result = await caller.workflowQueries.getClaimsByState({ 
        state: "technical_approval", 
        limit: 10, 
        offset: 0 
      });
      
      expect(result).toHaveProperty("items");
      expect(Array.isArray(result.items)).toBe(true);
    });

    it("can access financial_decision state", async () => {
      const ctx = createMockInsurerContext("risk_manager");
      const caller = appRouter.createCaller(ctx);

      const result = await caller.workflowQueries.getClaimsByState({ 
        state: "financial_decision", 
        limit: 10, 
        offset: 0 
      });
      
      expect(result).toHaveProperty("items");
      expect(Array.isArray(result.items)).toBe(true);
    });

    it("cannot access created state (not in role permissions)", async () => {
      const ctx = createMockInsurerContext("risk_manager");
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.workflowQueries.getClaimsByState({ 
          state: "created", 
          limit: 10, 
          offset: 0 
        })
      ).rejects.toThrow();
    });
  });

  describe("Claims Manager Access", () => {
    it("can access all operational states", async () => {
      const ctx = createMockInsurerContext("claims_manager");
      const caller = appRouter.createCaller(ctx);

      const states = ["created", "under_assessment", "technical_approval", "financial_decision", "completed"];
      
      for (const state of states) {
        const result = await caller.workflowQueries.getClaimsByState({ 
          state, 
          limit: 10, 
          offset: 0 
        });
        
        expect(result).toHaveProperty("items");
        expect(Array.isArray(result.items)).toBe(true);
      }
    });
  });

  describe("Pagination Support", () => {
    it("respects limit parameter", async () => {
      const ctx = createMockInsurerContext("claims_processor");
      const caller = appRouter.createCaller(ctx);

      const result = await caller.workflowQueries.getClaimsByState({ 
        state: "created", 
        limit: 5, 
        offset: 0 
      });
      
      expect(result.items.length).toBeLessThanOrEqual(5);
    });

    it("respects offset parameter", async () => {
      const ctx = createMockInsurerContext("claims_processor");
      const caller = appRouter.createCaller(ctx);

      const firstPage = await caller.workflowQueries.getClaimsByState({ 
        state: "created", 
        limit: 5, 
        offset: 0 
      });
      
      const secondPage = await caller.workflowQueries.getClaimsByState({ 
        state: "created", 
        limit: 5, 
        offset: 5 
      });
      
      // If there are enough claims, pages should be different
      if (firstPage.items.length > 0 && secondPage.items.length > 0) {
        expect(firstPage.items[0].id).not.toBe(secondPage.items[0].id);
      }
    });
  });

  describe("Tenant Isolation", () => {
    it("only returns claims from user's tenant", async () => {
      const ctx = createMockInsurerContext("claims_processor", { tenantId: "tenant-a" });
      const caller = appRouter.createCaller(ctx);

      const result = await caller.workflowQueries.getClaimsByState({ 
        state: "created", 
        limit: 100, 
        offset: 0 
      });
      
      // All returned claims should belong to tenant-a
      for (const claim of result.items) {
        if (claim.tenantId) {
          expect(claim.tenantId).toBe("tenant-a");
        }
      }
    });
  });
});
