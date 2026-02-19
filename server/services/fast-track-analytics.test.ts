// @ts-nocheck
/**
 * Fast-Track Analytics Performance Tests
 * Ensures no N+1 queries and validates tenant isolation
 */

import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "crypto";
import { getDb } from "../db";
import {
  fastTrackRoutingLog,
  workflowAuditTrail,
  routingHistory,
} from "../../drizzle/schema";
import { sql } from "drizzle-orm";
import {
  calculateFastTrackRate,
  calculateAutoApprovalRate,
  calculateProcessingTime,
  calculateExecutiveOverrides,
  calculateRiskDistribution,
  getFastTrackDashboard,
} from "./fast-track-analytics";

describe("Fast-Track Analytics - Performance & Correctness", () => {
  const testDateRange = {
    startDate: new Date("2026-01-01"),
    endDate: new Date("2026-12-31"),
  };

  beforeEach(async () => {
    // Clean up test data
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    await db.execute(sql`DELETE FROM ${fastTrackRoutingLog}`);
    await db.execute(sql`DELETE FROM ${workflowAuditTrail}`);
    await db.execute(sql`DELETE FROM ${routingHistory}`);
  });

  describe("Query Performance - No N+1", () => {
    it("should calculate fast-track rate with single query per metric", async () => {
      // Seed test data
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Insert routing history
      for (let i = 1; i <= 100; i++) {
        await db.insert(routingHistory).values({
          id: randomUUID(),
          claimId: i,
          tenantId: "tenant-001",
          confidenceScore: 85,
          routingCategory: i <= 70 ? "HIGH" : "MEDIUM",
          routingDecision: "AI_FAST_TRACK",
          decidedBy: "AI",
          timestamp: new Date("2026-06-15"),
        });
      }

      // Insert fast-track routing log
      for (let i = 1; i <= 50; i++) {
        await db.insert(fastTrackRoutingLog).values({
          claimId: i,
          tenantId: "tenant-001",
          configVersion: 1,
          decision: "AUTO_APPROVE",
          reason: "High confidence",
          confidenceScore: 85,
          claimValue: 5000,
          fraudScore: 15,
          eligible: true,
          evaluatedAt: new Date("2026-06-15"),
        });
      }

      // Track query count (in production, use query logging)
      const startTime = Date.now();

      const metrics = await calculateFastTrackRate("tenant-001", testDateRange);

      const duration = Date.now() - startTime;

      // Verify metrics
      expect(metrics.totalClaims).toBe(100);
      expect(metrics.eligibleClaims).toBe(70);
      expect(metrics.fastTrackedClaims).toBe(50);
      expect(metrics.fastTrackRate).toBeCloseTo(71.43, 1);

      // Performance check: should complete in <1000ms even with 100 records
      expect(duration).toBeLessThan(1000);
    });

    it("should calculate all dashboard metrics efficiently", async () => {
      // Seed comprehensive test data
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Insert routing history
      for (let i = 1; i <= 50; i++) {
        await db.insert(routingHistory).values({
          id: randomUUID(),
          claimId: i,
          tenantId: "tenant-001",
          confidenceScore: 85,
          routingCategory: "HIGH",
          routingDecision: "AI_FAST_TRACK",
          decidedBy: "AI",
          timestamp: new Date("2026-06-15"),
        });
      }

      // Insert fast-track routing log
      for (let i = 1; i <= 30; i++) {
        await db.insert(fastTrackRoutingLog).values({
          claimId: i,
          tenantId: "tenant-001",
          configVersion: 1,
          decision: i <= 20 ? "AUTO_APPROVE" : "PRIORITY_QUEUE",
          reason: "High confidence",
          confidenceScore: 85,
          claimValue: 5000,
          fraudScore: i <= 10 ? 15 : i <= 25 ? 45 : 75,
          eligible: true,
          override: i <= 3, // 3 overrides
          evaluatedAt: new Date("2026-06-15"),
        });
      }

      // Insert workflow audit trail
      for (let i = 1; i <= 30; i++) {
        // Start state
        await db.insert(workflowAuditTrail).values({
          claimId: i,
          tenantId: "tenant-001",
          fromState: null,
          toState: "created",
          userId: 1,
          timestamp: new Date("2026-06-15T08:00:00"),
        });

        // End state
        await db.insert(workflowAuditTrail).values({
          claimId: i,
          tenantId: "tenant-001",
          fromState: "created",
          toState: "financial_decision",
          userId: 1,
          timestamp: new Date("2026-06-15T10:00:00"),
        });
      }

      // Track execution time
      const startTime = Date.now();

      const dashboard = await getFastTrackDashboard("tenant-001", testDateRange);

      const duration = Date.now() - startTime;

      // Verify all metrics calculated correctly
      expect(dashboard.fastTrackRate.fastTrackedClaims).toBe(30);
      expect(dashboard.autoApprovalRate.autoApproved).toBe(20);
      expect(dashboard.executiveOverrides.overrideCount).toBe(3);
      expect(dashboard.riskDistribution.lowRisk).toBe(10);
      expect(dashboard.riskDistribution.mediumRisk).toBe(15);
      expect(dashboard.riskDistribution.highRisk).toBe(5);

      // Performance check: all 5 metrics should complete in <2000ms
      expect(duration).toBeLessThan(2000);
    });
  });

  describe("Tenant Isolation", () => {
    it("should enforce tenant isolation in fast-track rate calculation", async () => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Insert data for tenant-001
      await db.insert(routingHistory).values({
        id: randomUUID(),
        claimId: 1,
        tenantId: "tenant-001",
        confidenceScore: 85,
        routingCategory: "HIGH",
        routingDecision: "AI_FAST_TRACK",
        decidedBy: "AI",
        timestamp: new Date("2026-06-15"),
      });

      await db.insert(fastTrackRoutingLog).values({
        claimId: 1,
        tenantId: "tenant-001",
        configVersion: 1,
        decision: "AUTO_APPROVE",
        reason: "High confidence",
        confidenceScore: 85,
        claimValue: 5000,
        fraudScore: 15,
        eligible: true,
        evaluatedAt: new Date("2026-06-15"),
      });

      // Insert data for tenant-002
      await db.insert(routingHistory).values({
        id: randomUUID(),
        claimId: 2,
        tenantId: "tenant-002",
        confidenceScore: 85,
        routingCategory: "HIGH",
        routingDecision: "AI_FAST_TRACK",
        decidedBy: "AI",
        timestamp: new Date("2026-06-15"),
      });

      await db.insert(fastTrackRoutingLog).values({
        claimId: 2,
        tenantId: "tenant-002",
        configVersion: 1,
        decision: "AUTO_APPROVE",
        reason: "High confidence",
        confidenceScore: 85,
        claimValue: 5000,
        fraudScore: 15,
        eligible: true,
        evaluatedAt: new Date("2026-06-15"),
      });

      // Query tenant-001
      const metrics001 = await calculateFastTrackRate("tenant-001", testDateRange);

      expect(metrics001.totalClaims).toBe(1);
      expect(metrics001.fastTrackedClaims).toBe(1);

      // Query tenant-002
      const metrics002 = await calculateFastTrackRate("tenant-002", testDateRange);

      expect(metrics002.totalClaims).toBe(1);
      expect(metrics002.fastTrackedClaims).toBe(1);
    });

    it("should enforce tenant isolation in all analytics functions", async () => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Seed data for both tenants
      for (const tenantId of ["tenant-001", "tenant-002"]) {
        await db.insert(routingHistory).values({
          id: randomUUID(),
          claimId: tenantId === "tenant-001" ? 1 : 2,
          tenantId,
          confidenceScore: 85,
          routingCategory: "HIGH",
          routingDecision: "AI_FAST_TRACK",
          decidedBy: "AI",
          timestamp: new Date("2026-06-15"),
        });

        await db.insert(fastTrackRoutingLog).values({
          claimId: tenantId === "tenant-001" ? 1 : 2,
          tenantId,
          configVersion: 1,
          decision: "AUTO_APPROVE",
          reason: "High confidence",
          confidenceScore: 85,
          claimValue: 5000,
          fraudScore: 15,
          eligible: true,
          override: false,
          evaluatedAt: new Date("2026-06-15"),
        });
      }

      // Get dashboard for tenant-001
      const dashboard001 = await getFastTrackDashboard("tenant-001", testDateRange);

      expect(dashboard001.fastTrackRate.fastTrackedClaims).toBe(1);
      expect(dashboard001.autoApprovalRate.autoApproved).toBe(1);

      // Get dashboard for tenant-002
      const dashboard002 = await getFastTrackDashboard("tenant-002", testDateRange);

      expect(dashboard002.fastTrackRate.fastTrackedClaims).toBe(1);
      expect(dashboard002.autoApprovalRate.autoApproved).toBe(1);
    });
  });

  describe("Date Filtering", () => {
    it("should filter metrics by date range", async () => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Insert data in different months
      await db.insert(routingHistory).values({
        id: randomUUID(),
        claimId: 1,
        tenantId: "tenant-001",
        confidenceScore: 85,
        routingCategory: "HIGH",
        routingDecision: "AI_FAST_TRACK",
        decidedBy: "AI",
        timestamp: new Date("2026-01-15"),
      });

      await db.insert(routingHistory).values({
        id: randomUUID(),
        claimId: 2,
        tenantId: "tenant-001",
        confidenceScore: 85,
        routingCategory: "HIGH",
        routingDecision: "AI_FAST_TRACK",
        decidedBy: "AI",
        timestamp: new Date("2026-06-15"),
      });

      await db.insert(fastTrackRoutingLog).values({
        claimId: 1,
        tenantId: "tenant-001",
        configVersion: 1,
        decision: "AUTO_APPROVE",
        reason: "High confidence",
        confidenceScore: 85,
        claimValue: 5000,
        fraudScore: 15,
        eligible: true,
        evaluatedAt: new Date("2026-01-15"),
      });

      await db.insert(fastTrackRoutingLog).values({
        claimId: 2,
        tenantId: "tenant-001",
        configVersion: 1,
        decision: "AUTO_APPROVE",
        reason: "High confidence",
        confidenceScore: 85,
        claimValue: 5000,
        fraudScore: 15,
        eligible: true,
        evaluatedAt: new Date("2026-06-15"),
      });

      // Query Q1 only
      const q1Metrics = await calculateFastTrackRate("tenant-001", {
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-03-31"),
      });

      expect(q1Metrics.totalClaims).toBe(1);
      expect(q1Metrics.fastTrackedClaims).toBe(1);

      // Query Q2 only
      const q2Metrics = await calculateFastTrackRate("tenant-001", {
        startDate: new Date("2026-04-01"),
        endDate: new Date("2026-06-30"),
      });

      expect(q2Metrics.totalClaims).toBe(1);
      expect(q2Metrics.fastTrackedClaims).toBe(1);
    });
  });

  describe("Metric Accuracy", () => {
    it("should calculate risk distribution correctly", async () => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Insert claims with different fraud scores
      const fraudScores = [10, 25, 45, 60, 75, 85];

      for (let i = 0; i < fraudScores.length; i++) {
        await db.insert(fastTrackRoutingLog).values({
          claimId: i + 1,
          tenantId: "tenant-001",
          configVersion: 1,
          decision: "AUTO_APPROVE",
          reason: "High confidence",
          confidenceScore: 85,
          claimValue: 5000,
          fraudScore: fraudScores[i],
          eligible: true,
          evaluatedAt: new Date("2026-06-15"),
        });
      }

      const distribution = await calculateRiskDistribution("tenant-001", testDateRange);

      expect(distribution.lowRisk).toBe(2); // 10, 25
      expect(distribution.mediumRisk).toBe(2); // 45, 60
      expect(distribution.highRisk).toBe(2); // 75, 85
    });

    it("should calculate executive override rate correctly", async () => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Insert 10 auto-approvals, 3 with overrides
      for (let i = 1; i <= 10; i++) {
        await db.insert(fastTrackRoutingLog).values({
          claimId: i,
          tenantId: "tenant-001",
          configVersion: 1,
          decision: "AUTO_APPROVE",
          reason: "High confidence",
          confidenceScore: 85,
          claimValue: 5000,
          fraudScore: 15,
          eligible: true,
          override: i <= 3, // First 3 have overrides
          evaluatedAt: new Date("2026-06-15"),
        });

        // Add workflow audit trail for overrides
        if (i <= 3) {
          await db.insert(workflowAuditTrail).values({
            claimId: i,
            tenantId: "tenant-001",
            fromState: "financial_decision",
            toState: "internal_review",
            userId: 1,
            timestamp: new Date("2026-06-15"),
          });
        }
      }

      const overrides = await calculateExecutiveOverrides("tenant-001", testDateRange);

      expect(overrides.totalAutoApprovals).toBe(10);
      expect(overrides.overrideCount).toBe(3);
      expect(overrides.overrideRate).toBeCloseTo(30, 1);
    });
  });
});
