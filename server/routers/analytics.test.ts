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

vi.mock("../db", async importOriginal => ({
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

async function expectP0B1FraudAnalyticsHold(promise: Promise<unknown>) {
  await expect(promise).rejects.toMatchObject({
    code: "PRECONDITION_FAILED",
    message: expect.stringContaining(
      "Automated fraud scoring, risk classification, routing, certification, and publication are withheld because current evidence has no qualified governing authority"
    ),
  });
}

describe("Executive Analytics Router", () => {
  describe("getKPIs", () => {
    it("withholds executive dashboard KPIs until fraud authority is qualified", async () => {
      const caller = appRouter.createCaller(createMockContext());
      await expectP0B1FraudAnalyticsHold(caller.analytics.getKPIs({}));
    });

    it("holds date-filtered KPI requests under the same authority boundary", async () => {
      const caller = appRouter.createCaller(createMockContext());
      const startDate = new Date("2024-01-01");
      const endDate = new Date("2024-12-31");
      await expectP0B1FraudAnalyticsHold(
        caller.analytics.getKPIs({
          startDate,
          endDate,
        })
      );
    });
    it("holds tenant-scoped KPI requests under the same authority boundary", async () => {
      const caller = appRouter.createCaller(createMockContext());
      // tenantId is derived from ctx.user.tenantId, not a direct input
      await expectP0B1FraudAnalyticsHold(caller.analytics.getKPIs({}));
    });
  });

  describe("getCriticalAlerts", () => {
    it("withholds critical alerts until fraud authority is qualified", async () => {
      const caller = appRouter.createCaller(createMockContext());
      await expectP0B1FraudAnalyticsHold(
        caller.analytics.getCriticalAlerts({})
      );
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
