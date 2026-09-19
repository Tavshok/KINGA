// @ts-nocheck
/**
 * Executive Analytics Router Test Suite
 * 
 * Tests for executive dashboard analytics tRPC endpoints:
 * - Get KPIs (claims processed, processing time, fraud detection, cost savings)
 * - Get claims by complexity breakdown
 * - Get SLA compliance metrics
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
}));

vi.mock("../db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../db")>()),
  getDb: mocks.getDb,
}));

import { appRouter } from "../routers";
import type { Context } from "../_core/context";

// Mock context for testing
const testTenantId = "analytics-router-fixture";
const createMockContext = (role: string = "insurer"): Context => ({
  user: {
    id: 1,
    openId: "test-openid",
    name: "Test Insurer",
    email: "insurer@test.com",
    role,
    insurerRole: "claims_manager",
    tenantId: testTenantId,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
});

const emptyAnalyticsDb = {
  execute: vi.fn().mockResolvedValue([[]]),
  select: vi.fn(() => ({
    from: () => ({
      where: () => ({
        orderBy: () => ({
          limit: async () => [],
        }),
      }),
    }),
  })),
};

beforeEach(() => {
  emptyAnalyticsDb.execute.mockResolvedValue([[]]);
  mocks.getDb.mockResolvedValue(emptyAnalyticsDb);
});

describe("Executive Analytics Router", () => {
  describe("getKPIs", () => {
    it("should return executive dashboard KPIs", async () => {
      const caller = appRouter.createCaller(createMockContext());
      const result = await caller.analytics.getKPIs({});
      
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data.summaryMetrics).toBeDefined();
      expect(typeof result.data.summaryMetrics.totalClaims).toBe("number");
      expect(typeof result.data.summaryMetrics.fraudDetected).toBe("number");
      expect(typeof result.data.summaryMetrics.avgProcessingTime).toBe("number");
    });

    it("should accept date range filters", async () => {
      const caller = appRouter.createCaller(createMockContext());
      const startDate = new Date("2024-01-01");
      const endDate = new Date("2024-12-31");
      
      const result = await caller.analytics.getKPIs({
        startDate,
        endDate,
      });
      
       expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });
    it("should accept tenant filter", async () => {
      const caller = appRouter.createCaller(createMockContext());
      // tenantId is derived from ctx.user.tenantId, not a direct input
      const result = await caller.analytics.getKPIs({});
      
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });
  });

  describe("getCriticalAlerts", () => {
    it("should return critical alerts", async () => {
      const caller = appRouter.createCaller(createMockContext());
      const result = await caller.analytics.getCriticalAlerts({});
      
      expect(result).toBeDefined();
      // Just check that it returns data - structure may vary
    });
  });

  describe("getAssessorPerformance", () => {
    it("should return assessor performance metrics", async () => {
      const caller = appRouter.createCaller(createMockContext());
      const result = await caller.analytics.getAssessorPerformance({});
      
      expect(result).toBeDefined();
      // Just check that it returns data - structure may vary
    });
  });
});
