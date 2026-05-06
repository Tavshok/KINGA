// @ts-nocheck
/**
 * Usage Metering Tests
 * Tests for tenant isolation, duplicate protection, and aggregation accuracy
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { getDb } from "../db";
import { usageEvents, claims } from "../../drizzle/schema";
import { sql, inArray } from "drizzle-orm";
import {
  recordUsageEvent,
  recordClaimProcessed,
  recordAIEvaluation,
  recordFastTrackTriggered,
  recordAutoApproval,
  recordAssessorToolUsage,
} from "./usage-meter";
import {
  generateMonthlySummary,
  getCurrentMonthSummary,
  getUsageTrends,
} from "./usage-aggregator";

// ─── Test claim IDs (populated in beforeAll) ─────────────────────────────────
let TEST_CLAIM_IDS: number[] = [];

// Minimal claim rows needed to satisfy the FK constraint on usage_events.claim_id
const TEST_CLAIM_NUMBERS = [
  "TEST-USAGE-001",
  "TEST-USAGE-002",
  "TEST-USAGE-003",
  "TEST-USAGE-004",
  "TEST-USAGE-005",
  "TEST-USAGE-006",
  "TEST-USAGE-007",
  "TEST-USAGE-008",
  "TEST-USAGE-009",
  "TEST-USAGE-010",
];

beforeAll(async () => {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Insert minimal test claims (claimNumber is the only NOT NULL field besides id/status/createdAt/updatedAt)
  for (const claimNumber of TEST_CLAIM_NUMBERS) {
    await db
      .insert(claims)
      .ignore() // skip if already exists from a previous run
      .values({ claimNumber, tenantId: "test-usage-meter" });
  }

  // Fetch the IDs of the inserted claims
  const rows = await db
    .select({ id: claims.id })
    .from(claims)
    .where(sql`${claims.claimNumber} IN (${sql.join(TEST_CLAIM_NUMBERS.map(n => sql`${n}`), sql`, `)})`);

  TEST_CLAIM_IDS = rows.map((r) => r.id);
  if (TEST_CLAIM_IDS.length < 10) {
    throw new Error(`Expected 10 test claim IDs, got ${TEST_CLAIM_IDS.length}`);
  }
});

afterAll(async () => {
  const db = await getDb();
  if (!db) return;
  // Clean up test claims (cascade will clean usage_events via SET NULL)
  await db.delete(claims).where(sql`${claims.tenantId} = 'test-usage-meter'`);
});

describe("Usage Metering Infrastructure", () => {
  beforeEach(async () => {
    // Clean up test usage events
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    await db.execute(sql`DELETE FROM ${usageEvents}`);
  });

  describe("UsageMeter - Event Recording", () => {
    it("should record usage event with tenant isolation", async () => {
      const claimId = TEST_CLAIM_IDS[0];
      const eventId = await recordClaimProcessed("tenant-001", claimId);

      expect(eventId).toBeTypeOf("number");

      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [event] = await db
        .select()
        .from(usageEvents)
        .where(sql`${usageEvents.id} = ${eventId}`)
        .limit(1);

      expect(event).toBeDefined();
      expect(event.tenantId).toBe("tenant-001");
      expect(event.claimId).toBe(claimId);
      expect(event.eventType).toBe("CLAIM_PROCESSED");
    });

    it("should enforce tenant isolation (cross-tenant queries return nothing)", async () => {
      const claimA = TEST_CLAIM_IDS[0];
      const claimB = TEST_CLAIM_IDS[1];
      await recordClaimProcessed("tenant-001", claimA);
      await recordClaimProcessed("tenant-002", claimB);

      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const tenant001Events = await db
        .select()
        .from(usageEvents)
        .where(sql`${usageEvents.tenantId} = 'tenant-001'`);

      expect(tenant001Events.length).toBe(1);
      expect(tenant001Events[0].claimId).toBe(claimA);

      const tenant002Events = await db
        .select()
        .from(usageEvents)
        .where(sql`${usageEvents.tenantId} = 'tenant-002'`);

      expect(tenant002Events.length).toBe(1);
      expect(tenant002Events[0].claimId).toBe(claimB);
    });

    it("should prevent duplicate events with same referenceId", async () => {
      const claimId = TEST_CLAIM_IDS[0];
      const refId = `claim-processed-${claimId}`;

      const event1 = await recordUsageEvent({
        tenantId: "tenant-001",
        claimId,
        eventType: "CLAIM_PROCESSED",
        referenceId: refId,
      });

      const event2 = await recordUsageEvent({
        tenantId: "tenant-001",
        claimId,
        eventType: "CLAIM_PROCESSED",
        referenceId: refId,
      });

      expect(event1).toBeTypeOf("number");
      expect(event2).toBeNull(); // Duplicate detected

      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const events = await db
        .select()
        .from(usageEvents)
        .where(sql`${usageEvents.tenantId} = 'tenant-001'`);

      expect(events.length).toBe(1); // Only one event recorded
    });

    it("should allow duplicate events without referenceId", async () => {
      const claimId = TEST_CLAIM_IDS[0];

      const event1 = await recordUsageEvent({
        tenantId: "tenant-001",
        claimId,
        eventType: "AI_EVALUATED",
      });

      const event2 = await recordUsageEvent({
        tenantId: "tenant-001",
        claimId,
        eventType: "AI_EVALUATED",
      });

      expect(event1).toBeTypeOf("number");
      expect(event2).toBeTypeOf("number");
      expect(event1).not.toBe(event2);

      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const events = await db
        .select()
        .from(usageEvents)
        .where(sql`${usageEvents.tenantId} = 'tenant-001'`);

      expect(events.length).toBe(2); // Both events recorded
    });

    it("should record all event types correctly", async () => {
      const [c1, c2, c3, c4, c5] = TEST_CLAIM_IDS;
      await recordClaimProcessed("tenant-001", c1);
      await recordAIEvaluation("tenant-001", c2);
      await recordFastTrackTriggered("tenant-001", c3);
      await recordAutoApproval("tenant-001", c4);
      await recordAssessorToolUsage("tenant-001", c5, "premium-damage-analysis");

      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const events = await db
        .select()
        .from(usageEvents)
        .where(sql`${usageEvents.tenantId} = 'tenant-001'`);

      expect(events.length).toBe(5);

      const eventTypes = events.map((e) => e.eventType);
      expect(eventTypes).toContain("CLAIM_PROCESSED");
      expect(eventTypes).toContain("AI_EVALUATED");
      expect(eventTypes).toContain("FAST_TRACK_TRIGGERED");
      expect(eventTypes).toContain("AUTO_APPROVED");
      expect(eventTypes).toContain("ASSESSOR_TOOL_USED");
    });

    it("should store metadata correctly", async () => {
      const claimId = TEST_CLAIM_IDS[0];
      const metadata = {
        configVersion: 1,
        confidenceScore: 92.5,
        toolName: "premium-damage-analysis",
      };

      const eventId = await recordUsageEvent({
        tenantId: "tenant-001",
        claimId,
        eventType: "ASSESSOR_TOOL_USED",
        metadata,
      });

      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [event] = await db
        .select()
        .from(usageEvents)
        .where(sql`${usageEvents.id} = ${eventId}`)
        .limit(1);

      expect(event.metadata).toBeDefined();
      const storedMetadata = typeof event.metadata === "string"
        ? JSON.parse(event.metadata)
        : event.metadata;
      expect(storedMetadata.configVersion).toBe(1);
      expect(storedMetadata.confidenceScore).toBe(92.5);
      expect(storedMetadata.toolName).toBe("premium-damage-analysis");
    });
  });

  describe("UsageAggregator - Monthly Summaries", () => {
    beforeEach(async () => {
      // Seed test data for current month using real claim IDs
      const [c1, c2, c3, c4, c5, c6, c7, c8, c9, c10] = TEST_CLAIM_IDS;
      await recordClaimProcessed("tenant-001", c1);
      await recordClaimProcessed("tenant-001", c2);
      await recordAIEvaluation("tenant-001", c1);
      await recordAIEvaluation("tenant-001", c2);
      await recordAIEvaluation("tenant-001", c3);
      await recordFastTrackTriggered("tenant-001", c1);
      await recordAutoApproval("tenant-001", c1);
      await recordAssessorToolUsage("tenant-001", c1, "tool-1");
      await recordAssessorToolUsage("tenant-001", c2, "tool-2");

      // Add events for different tenant
      await recordClaimProcessed("tenant-002", c10);
      await recordAIEvaluation("tenant-002", c10);
    });

    it("should generate accurate monthly summary", async () => {
      const now = new Date();
      const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

      const summary = await generateMonthlySummary("tenant-001", month);

      expect(summary.tenantId).toBe("tenant-001");
      expect(summary.month).toBe(month);
      expect(summary.claimCount).toBe(2);
      expect(summary.aiEvaluations).toBe(3);
      expect(summary.fastTrackCount).toBe(1);
      expect(summary.autoApprovalCount).toBe(1);
      expect(summary.assessorPremiumUsage).toBe(2);
      expect(summary.totalEvents).toBe(9);
    });

    it("should enforce tenant isolation in aggregation", async () => {
      const now = new Date();
      const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

      const summary001 = await generateMonthlySummary("tenant-001", month);
      const summary002 = await generateMonthlySummary("tenant-002", month);

      expect(summary001.claimCount).toBe(2);
      expect(summary001.aiEvaluations).toBe(3);

      expect(summary002.claimCount).toBe(1);
      expect(summary002.aiEvaluations).toBe(1);
    });

    it("should return zero counts for months with no events", async () => {
      const futureMonth = "2030-12";

      const summary = await generateMonthlySummary("tenant-001", futureMonth);

      expect(summary.tenantId).toBe("tenant-001");
      expect(summary.month).toBe(futureMonth);
      expect(summary.claimCount).toBe(0);
      expect(summary.aiEvaluations).toBe(0);
      expect(summary.totalEvents).toBe(0);
    });

    it("should get current month summary", async () => {
      const summary = await getCurrentMonthSummary("tenant-001");

      expect(summary.claimCount).toBe(2);
      expect(summary.aiEvaluations).toBe(3);
    });

    it("should generate usage trends for multiple months", async () => {
      const trends = await getUsageTrends("tenant-001", 3);

      expect(trends.length).toBe(3);
      expect(trends[0].tenantId).toBe("tenant-001");
      expect(trends[1].tenantId).toBe("tenant-001");
      expect(trends[2].tenantId).toBe("tenant-001");

      // Current month should have events
      const currentMonthSummary = trends[trends.length - 1];
      expect(currentMonthSummary.totalEvents).toBeGreaterThan(0);
    });
  });

  describe("Duplicate Protection Edge Cases", () => {
    it("should allow same referenceId for different tenants", async () => {
      const claimId = TEST_CLAIM_IDS[0];
      const refId = `claim-processed-${claimId}`;

      const event1 = await recordUsageEvent({
        tenantId: "tenant-001",
        claimId,
        eventType: "CLAIM_PROCESSED",
        referenceId: refId,
      });

      const event2 = await recordUsageEvent({
        tenantId: "tenant-002",
        claimId,
        eventType: "CLAIM_PROCESSED",
        referenceId: refId,
      });

      expect(event1).toBeTypeOf("number");
      expect(event2).toBeTypeOf("number");

      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const events = await db
        .select()
        .from(usageEvents)
        .where(sql`${usageEvents.referenceId} = ${refId}`);

      expect(events.length).toBe(2); // Both events recorded (different tenants)
    });

    it("should handle quantity field correctly", async () => {
      const claimId = TEST_CLAIM_IDS[0];

      const eventId = await recordUsageEvent({
        tenantId: "tenant-001",
        claimId,
        eventType: "ASSESSOR_TOOL_USED",
        quantity: 5,
      });

      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [event] = await db
        .select()
        .from(usageEvents)
        .where(sql`${usageEvents.id} = ${eventId}`)
        .limit(1);

      expect(event.quantity).toBe(5);
    });
  });
});
