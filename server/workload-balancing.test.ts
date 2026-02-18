/**
 * Workload Balancing System Test Suite
 * 
 * Tests weighted workload scoring algorithm for processor assignment.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb } from "./db";
import {
  calculateProcessorWorkloadScore,
  findLowestWorkloadProcessor,
  getAllProcessorWorkloads,
  WORKLOAD_WEIGHTS,
} from "./workload-balancing";
import { users, claims, tenants } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";

// Test tenant and user IDs
const TEST_TENANT_ID = "test-tenant-workload-balancing";
const TEST_PROCESSOR_1_ID = "test-processor-1";
const TEST_PROCESSOR_2_ID = "test-processor-2";
const TEST_PROCESSOR_3_ID = "test-processor-3";

// Test data cleanup
async function cleanupTestData() {
  const db = await getDb();
  if (!db) return;

  // Delete test claims
  await db.delete(claims).where(eq(claims.tenantId, TEST_TENANT_ID));

  // Delete test users
  await db.delete(users).where(eq(users.tenantId, TEST_TENANT_ID));

  // Delete test tenant
  await db.delete(tenants).where(eq(tenants.id, TEST_TENANT_ID));
}

// Setup test data
async function setupTestData() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Create test tenant
  await db.insert(tenants).values({
    id: TEST_TENANT_ID,
    name: "Test Tenant - Workload Balancing",
    displayName: "Test Tenant - Workload Balancing",
    contactEmail: "test@workload-balancing.com",
    billingEmail: "billing@workload-balancing.com",
    status: "active",
    intakeEscalationEnabled: 1,
    intakeEscalationHours: 6,
    intakeEscalationMode: "auto_assign",
  });

  // Create test processors
  await db.insert(users).values([
    {
      openId: TEST_PROCESSOR_1_ID,
      name: "Processor One",
      email: "processor1@test.com",
      tenantId: TEST_TENANT_ID,
      insurerRole: "claims_processor",
      role: "user",
    },
    {
      openId: TEST_PROCESSOR_2_ID,
      name: "Processor Two",
      email: "processor2@test.com",
      tenantId: TEST_TENANT_ID,
      insurerRole: "claims_processor",
      role: "user",
    },
    {
      openId: TEST_PROCESSOR_3_ID,
      name: "Processor Three",
      email: "processor3@test.com",
      tenantId: TEST_TENANT_ID,
      insurerRole: "claims_processor",
      role: "user",
    },
  ]);
}

describe("Workload Balancing System", () => {
  beforeAll(async () => {
    await cleanupTestData();
    await setupTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
  });

  describe("calculateProcessorWorkloadScore", () => {
    it("should return zero score for processor with no claims", async () => {
      const workload = await calculateProcessorWorkloadScore(
        TEST_TENANT_ID,
        TEST_PROCESSOR_1_ID
      );

      expect(workload).not.toBeNull();
      expect(workload?.processorId).toBe(TEST_PROCESSOR_1_ID);
      expect(workload?.processorName).toBe("Processor One");
      expect(workload?.activeClaims).toBe(0);
      expect(workload?.complexClaims).toBe(0);
      expect(workload?.highRiskClaims).toBe(0);
      expect(workload?.weightedScore).toBe(0);
    });

    it("should calculate correct score for active claims only", async () => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Create 3 active claims (not complex, not high-risk)
      await db.insert(claims).values([
        {
          claimNumber: "WB-TEST-001",
          tenantId: TEST_TENANT_ID,
          assignedProcessorId: TEST_PROCESSOR_1_ID,
          workflowState: "assigned",
          estimatedClaimValue: 10000, // Below complex threshold
          earlyFraudSuspicion: 0, // Not high-risk
        },
        {
          claimNumber: "WB-TEST-002",
          tenantId: TEST_TENANT_ID,
          assignedProcessorId: TEST_PROCESSOR_1_ID,
          workflowState: "ai_assessment_pending",
          estimatedClaimValue: 15000,
          earlyFraudSuspicion: 0,
        },
        {
          claimNumber: "WB-TEST-003",
          tenantId: TEST_TENANT_ID,
          assignedProcessorId: TEST_PROCESSOR_1_ID,
          workflowState: "manual_review",
          estimatedClaimValue: 12000,
          earlyFraudSuspicion: 0,
        },
      ]);

      const workload = await calculateProcessorWorkloadScore(
        TEST_TENANT_ID,
        TEST_PROCESSOR_1_ID
      );

      expect(workload).not.toBeNull();
      expect(workload?.activeClaims).toBe(3);
      expect(workload?.complexClaims).toBe(0);
      expect(workload?.highRiskClaims).toBe(0);
      expect(workload?.weightedScore).toBe(3 * WORKLOAD_WEIGHTS.ACTIVE_CLAIM); // 3.0
    });

    it("should apply complex claim weight correctly", async () => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Create 2 complex claims (estimatedClaimValue > $20,000)
      await db.insert(claims).values([
        {
          claimNumber: "WB-TEST-004",
          tenantId: TEST_TENANT_ID,
          assignedProcessorId: TEST_PROCESSOR_2_ID,
          workflowState: "assigned",
          estimatedClaimValue: 25000, // Complex
          earlyFraudSuspicion: 0,
        },
        {
          claimNumber: "WB-TEST-005",
          tenantId: TEST_TENANT_ID,
          assignedProcessorId: TEST_PROCESSOR_2_ID,
          workflowState: "assigned",
          estimatedClaimValue: 30000, // Complex
          earlyFraudSuspicion: 0,
        },
      ]);

      const workload = await calculateProcessorWorkloadScore(
        TEST_TENANT_ID,
        TEST_PROCESSOR_2_ID
      );

      expect(workload).not.toBeNull();
      expect(workload?.activeClaims).toBe(2);
      expect(workload?.complexClaims).toBe(2);
      expect(workload?.highRiskClaims).toBe(0);
      // Score = (2 * 1.0) + (2 * 1.5) = 5.0
      expect(workload?.weightedScore).toBe(
        2 * WORKLOAD_WEIGHTS.ACTIVE_CLAIM + 2 * WORKLOAD_WEIGHTS.COMPLEX_CLAIM
      );
    });

    it("should apply high-risk claim weight correctly", async () => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Create 1 high-risk claim
      await db.insert(claims).values({
        claimNumber: "WB-TEST-006",
        tenantId: TEST_TENANT_ID,
        assignedProcessorId: TEST_PROCESSOR_3_ID,
        workflowState: "assigned",
        estimatedClaimValue: 15000,
        earlyFraudSuspicion: 1, // High-risk
      });

      const workload = await calculateProcessorWorkloadScore(
        TEST_TENANT_ID,
        TEST_PROCESSOR_3_ID
      );

      expect(workload).not.toBeNull();
      expect(workload?.activeClaims).toBe(1);
      expect(workload?.complexClaims).toBe(0);
      expect(workload?.highRiskClaims).toBe(1);
      // Score = (1 * 1.0) + (1 * 2.0) = 3.0
      expect(workload?.weightedScore).toBe(
        1 * WORKLOAD_WEIGHTS.ACTIVE_CLAIM + 1 * WORKLOAD_WEIGHTS.HIGH_RISK_CLAIM
      );
    });

    it("should handle complex + high-risk claims correctly", async () => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Create 1 claim that is both complex AND high-risk
      await db.insert(claims).values({
        claimNumber: "WB-TEST-007",
        tenantId: TEST_TENANT_ID,
        assignedProcessorId: TEST_PROCESSOR_3_ID,
        workflowState: "assigned",
        estimatedClaimValue: 50000, // Complex
        earlyFraudSuspicion: 1, // High-risk
      });

      const workload = await calculateProcessorWorkloadScore(
        TEST_TENANT_ID,
        TEST_PROCESSOR_3_ID
      );

      expect(workload).not.toBeNull();
      expect(workload?.activeClaims).toBe(2); // Previous + new
      expect(workload?.complexClaims).toBe(1);
      expect(workload?.highRiskClaims).toBe(2); // Previous + new
      // Score = (2 * 1.0) + (1 * 1.5) + (2 * 2.0) = 7.5
      expect(workload?.weightedScore).toBe(
        2 * WORKLOAD_WEIGHTS.ACTIVE_CLAIM +
          1 * WORKLOAD_WEIGHTS.COMPLEX_CLAIM +
          2 * WORKLOAD_WEIGHTS.HIGH_RISK_CLAIM
      );
    });

    it("should enforce tenant isolation", async () => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Create claim for different tenant
      await db.insert(claims).values({
        claimNumber: "WB-TEST-ISOLATION",
        tenantId: "other-tenant-id",
        assignedProcessorId: TEST_PROCESSOR_1_ID,
        workflowState: "assigned",
        estimatedClaimValue: 10000,
        earlyFraudSuspicion: 0,
      });

      // Should not count claim from other tenant
      const workload = await calculateProcessorWorkloadScore(
        TEST_TENANT_ID,
        TEST_PROCESSOR_1_ID
      );

      expect(workload).not.toBeNull();
      expect(workload?.activeClaims).toBe(3); // Only TEST_TENANT_ID claims
    });
  });

  describe("findLowestWorkloadProcessor", () => {
    it("should select processor with lowest weighted score", async () => {
      // Current state after previous tests:
      // Processor 1: 3 active claims, score = 3.0
      // Processor 2: 2 active claims (both complex), score = 5.0
      // Processor 3: 2 active claims (1 complex, 2 high-risk), score = 7.5

      const selected = await findLowestWorkloadProcessor(TEST_TENANT_ID);

      expect(selected).not.toBeNull();
      expect(selected?.processorId).toBe(TEST_PROCESSOR_1_ID);
      expect(selected?.processorName).toBe("Processor One");
      expect(selected?.weightedScore).toBe(3.0);
    });

    it("should handle equal workload distribution", async () => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Clean up existing claims
      await db.delete(claims).where(eq(claims.tenantId, TEST_TENANT_ID));

      // Create equal workload for all processors (1 active claim each)
      await db.insert(claims).values([
        {
          claimNumber: "WB-EQUAL-001",
          tenantId: TEST_TENANT_ID,
          assignedProcessorId: TEST_PROCESSOR_1_ID,
          workflowState: "assigned",
          estimatedClaimValue: 10000,
          earlyFraudSuspicion: 0,
        },
        {
          claimNumber: "WB-EQUAL-002",
          tenantId: TEST_TENANT_ID,
          assignedProcessorId: TEST_PROCESSOR_2_ID,
          workflowState: "assigned",
          estimatedClaimValue: 10000,
          earlyFraudSuspicion: 0,
        },
        {
          claimNumber: "WB-EQUAL-003",
          tenantId: TEST_TENANT_ID,
          assignedProcessorId: TEST_PROCESSOR_3_ID,
          workflowState: "assigned",
          estimatedClaimValue: 10000,
          earlyFraudSuspicion: 0,
        },
      ]);

      const selected = await findLowestWorkloadProcessor(TEST_TENANT_ID);

      expect(selected).not.toBeNull();
      expect(selected?.weightedScore).toBe(1.0); // All have same score
      // Should select first processor (alphabetically or by ID)
      expect([TEST_PROCESSOR_1_ID, TEST_PROCESSOR_2_ID, TEST_PROCESSOR_3_ID]).toContain(
        selected?.processorId
      );
    });

    it("should handle high-risk imbalance correctly", async () => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Clean up existing claims
      await db.delete(claims).where(eq(claims.tenantId, TEST_TENANT_ID));

      // Processor 1: 2 high-risk claims (score = 6.0)
      // Processor 2: 3 normal claims (score = 3.0)
      // Processor 3: 0 claims (score = 0.0)
      await db.insert(claims).values([
        {
          claimNumber: "WB-HIGHRISK-001",
          tenantId: TEST_TENANT_ID,
          assignedProcessorId: TEST_PROCESSOR_1_ID,
          workflowState: "assigned",
          estimatedClaimValue: 10000,
          earlyFraudSuspicion: 1, // High-risk
        },
        {
          claimNumber: "WB-HIGHRISK-002",
          tenantId: TEST_TENANT_ID,
          assignedProcessorId: TEST_PROCESSOR_1_ID,
          workflowState: "assigned",
          estimatedClaimValue: 12000,
          earlyFraudSuspicion: 1, // High-risk
        },
        {
          claimNumber: "WB-HIGHRISK-003",
          tenantId: TEST_TENANT_ID,
          assignedProcessorId: TEST_PROCESSOR_2_ID,
          workflowState: "assigned",
          estimatedClaimValue: 10000,
          earlyFraudSuspicion: 0,
        },
        {
          claimNumber: "WB-HIGHRISK-004",
          tenantId: TEST_TENANT_ID,
          assignedProcessorId: TEST_PROCESSOR_2_ID,
          workflowState: "assigned",
          estimatedClaimValue: 11000,
          earlyFraudSuspicion: 0,
        },
        {
          claimNumber: "WB-HIGHRISK-005",
          tenantId: TEST_TENANT_ID,
          assignedProcessorId: TEST_PROCESSOR_2_ID,
          workflowState: "assigned",
          estimatedClaimValue: 9000,
          earlyFraudSuspicion: 0,
        },
      ]);

      const selected = await findLowestWorkloadProcessor(TEST_TENANT_ID);

      expect(selected).not.toBeNull();
      // Should select Processor 3 (score = 0.0), not Processor 2 (score = 3.0)
      expect(selected?.processorId).toBe(TEST_PROCESSOR_3_ID);
      expect(selected?.weightedScore).toBe(0.0);
    });

    it("should return null when no processors available", async () => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Delete all processors for test tenant
      await db.delete(users).where(eq(users.tenantId, TEST_TENANT_ID));

      const selected = await findLowestWorkloadProcessor(TEST_TENANT_ID);

      expect(selected).toBeNull();

      // Restore processors for other tests
      await db.insert(users).values([
        {
          openId: TEST_PROCESSOR_1_ID,
          name: "Processor One",
          email: "processor1@test.com",
          tenantId: TEST_TENANT_ID,
          insurerRole: "claims_processor",
          role: "user",
        },
        {
          openId: TEST_PROCESSOR_2_ID,
          name: "Processor Two",
          email: "processor2@test.com",
          tenantId: TEST_TENANT_ID,
          insurerRole: "claims_processor",
          role: "user",
        },
        {
          openId: TEST_PROCESSOR_3_ID,
          name: "Processor Three",
          email: "processor3@test.com",
          tenantId: TEST_TENANT_ID,
          insurerRole: "claims_processor",
          role: "user",
        },
      ]);
    });
  });

  describe("getAllProcessorWorkloads", () => {
    it("should return workloads for all processors sorted by score", async () => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Clean up and create test scenario
      await db.delete(claims).where(eq(claims.tenantId, TEST_TENANT_ID));

      await db.insert(claims).values([
        {
          claimNumber: "WB-ALL-001",
          tenantId: TEST_TENANT_ID,
          assignedProcessorId: TEST_PROCESSOR_1_ID,
          workflowState: "assigned",
          estimatedClaimValue: 30000, // Complex
          earlyFraudSuspicion: 1, // High-risk
        },
        {
          claimNumber: "WB-ALL-002",
          tenantId: TEST_TENANT_ID,
          assignedProcessorId: TEST_PROCESSOR_2_ID,
          workflowState: "assigned",
          estimatedClaimValue: 10000,
          earlyFraudSuspicion: 0,
        },
      ]);

      const workloads = await getAllProcessorWorkloads(TEST_TENANT_ID);

      expect(workloads).toHaveLength(3);
      // Should be sorted by weighted score (ascending)
      expect(workloads[0].processorId).toBe(TEST_PROCESSOR_3_ID); // 0.0
      expect(workloads[1].processorId).toBe(TEST_PROCESSOR_2_ID); // 1.0
      expect(workloads[2].processorId).toBe(TEST_PROCESSOR_1_ID); // 4.5
    });
  });
});
