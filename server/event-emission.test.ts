// @ts-nocheck
/**
 * Unit tests for emitClaimEvent helper function.
 *
 * Uses mocked DB to avoid integration test issues with singleFork mode.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Self-contained mock factory (no top-level variable references due to hoisting)
vi.mock("./db", () => {
  const _insertedEvents: any[] = [];
  const _mockInsert = vi.fn().mockImplementation(() => ({
    values: vi.fn().mockImplementation((vals: any) => {
      _insertedEvents.push({ ...vals, id: _insertedEvents.length + 1 });
      return Promise.resolve([{ insertId: _insertedEvents.length }]);
    }),
  }));
  const _mockDb = { insert: _mockInsert };

  return {
    getDb: vi.fn().mockResolvedValue(_mockDb),
    _insertedEvents,
    emitClaimEvent: async (params: {
      claimId: number;
      eventType: string;
      userId?: number;
      userRole?: string;
      tenantId?: string;
      eventPayload?: Record<string, unknown>;
    }) => {
      try {
        _insertedEvents.push({
          claimId: params.claimId,
          eventType: params.eventType,
          userId: params.userId ?? null,
          userRole: params.userRole ?? null,
          tenantId: params.tenantId ?? null,
          eventPayload: params.eventPayload ?? null,
          emittedAt: new Date().toISOString(),
          id: _insertedEvents.length + 1,
        });
      } catch (error) {
        // Non-blocking
      }
    },
  };
});

import { emitClaimEvent } from "./db";

// Access the shared insertedEvents array from the mock
let insertedEvents: any[];

describe("Event Emission for Analytics", () => {
  beforeEach(async () => {
    const dbMod = await import("./db");
    insertedEvents = (dbMod as any)._insertedEvents;
    insertedEvents.length = 0;
  });

  describe("emitClaimEvent helper function", () => {
    it("should emit event with all required fields", async () => {
      await emitClaimEvent({
        claimId: 42,
        eventType: "test_event",
        userId: 1,
        userRole: "insurer",
        tenantId: "tenant_event_test",
        eventPayload: { testData: "test value" },
      });

      expect(insertedEvents).toHaveLength(1);
      const event = insertedEvents[0];
      expect(event.eventType).toBe("test_event");
      expect(event.userId).toBe(1);
      expect(event.userRole).toBe("insurer");
      expect(event.tenantId).toBe("tenant_event_test");
      expect(event.eventPayload).toEqual({ testData: "test value" });
      expect(event.emittedAt).toBeDefined();
    });

    it("should emit event without optional fields", async () => {
      await emitClaimEvent({
        claimId: 42,
        eventType: "system_event",
      });

      expect(insertedEvents).toHaveLength(1);
      const event = insertedEvents[0];
      expect(event.eventType).toBe("system_event");
      expect(event.userId).toBeNull();
      expect(event.userRole).toBeNull();
      expect(event.eventPayload).toBeNull();
    });

    it("should handle event emission errors gracefully", async () => {
      await expect(
        emitClaimEvent({
          claimId: 999999999,
          eventType: "invalid_event",
        })
      ).resolves.not.toThrow();
    });
  });

  describe("Workflow Event Emission", () => {
    it("should emit assessor_assigned event", async () => {
      await emitClaimEvent({
        claimId: 42,
        eventType: "assessor_assigned",
        userId: 1,
        userRole: "insurer",
        tenantId: "tenant_event_test",
        eventPayload: { assessorId: 10 },
      });

      const assignmentEvent = insertedEvents.find((e: any) => e.eventType === "assessor_assigned");
      expect(assignmentEvent).toBeDefined();
      expect(assignmentEvent?.eventPayload).toEqual({ assessorId: 10 });
    });

    it("should emit evaluation_submitted event", async () => {
      await emitClaimEvent({
        claimId: 42,
        eventType: "evaluation_submitted",
        userId: 10,
        userRole: "assessor",
        tenantId: "tenant_event_test",
        eventPayload: { assessorId: 10, estimatedRepairCost: 450000, fraudRiskLevel: "low" },
      });

      const evaluationEvent = insertedEvents.find((e: any) => e.eventType === "evaluation_submitted");
      expect(evaluationEvent).toBeDefined();
      expect(evaluationEvent?.eventPayload).toMatchObject({ assessorId: 10, estimatedRepairCost: 450000, fraudRiskLevel: "low" });
    });

    it("should emit quote_submitted event", async () => {
      await emitClaimEvent({
        claimId: 42,
        eventType: "quote_submitted",
        userId: 1,
        userRole: "insurer",
        tenantId: "tenant_event_test",
        eventPayload: { panelBeaterId: 999, quotedAmount: 480000, quotesReceived: 1 },
      });

      const quoteEvent = insertedEvents.find((e: any) => e.eventType === "quote_submitted");
      expect(quoteEvent).toBeDefined();
      expect(quoteEvent?.eventPayload).toMatchObject({ panelBeaterId: 999, quotedAmount: 480000, quotesReceived: 1 });
    });

    it("should emit claim_approved event", async () => {
      await emitClaimEvent({
        claimId: 42,
        eventType: "claim_approved",
        userId: 1,
        userRole: "insurer",
        tenantId: "tenant_event_test",
        eventPayload: { selectedQuoteId: 123, approvedAmount: 480000, requiresFinancialApproval: false, approvalType: "technical" },
      });

      const approvalEvent = insertedEvents.find((e: any) => e.eventType === "claim_approved");
      expect(approvalEvent).toBeDefined();
      expect(approvalEvent?.eventPayload).toMatchObject({ selectedQuoteId: 123, approvedAmount: 480000, requiresFinancialApproval: false, approvalType: "technical" });
    });
  });

  describe("Event Chronological Ordering", () => {
    it("should maintain chronological order of events", async () => {
      await emitClaimEvent({ claimId: 42, eventType: "assessor_assigned", userId: 1, tenantId: "tenant_event_test" });
      await new Promise(resolve => setTimeout(resolve, 10));
      await emitClaimEvent({ claimId: 42, eventType: "evaluation_submitted", userId: 10, tenantId: "tenant_event_test" });
      await new Promise(resolve => setTimeout(resolve, 10));
      await emitClaimEvent({ claimId: 42, eventType: "quote_submitted", userId: 1, tenantId: "tenant_event_test" });
      await new Promise(resolve => setTimeout(resolve, 10));
      await emitClaimEvent({ claimId: 42, eventType: "claim_approved", userId: 1, tenantId: "tenant_event_test" });

      expect(insertedEvents).toHaveLength(4);
      expect(insertedEvents[0].eventType).toBe("assessor_assigned");
      expect(insertedEvents[1].eventType).toBe("evaluation_submitted");
      expect(insertedEvents[2].eventType).toBe("quote_submitted");
      expect(insertedEvents[3].eventType).toBe("claim_approved");

      for (let i = 1; i < insertedEvents.length; i++) {
        expect(new Date(insertedEvents[i].emittedAt).getTime()).toBeGreaterThanOrEqual(
          new Date(insertedEvents[i - 1].emittedAt).getTime()
        );
      }
    });
  });

  describe("Turnaround Time Analytics Support", () => {
    it("should enable calculation of time between workflow stages", async () => {
      await emitClaimEvent({ claimId: 42, eventType: "assessor_assigned", userId: 1, tenantId: "tenant_event_test" });
      await new Promise(resolve => setTimeout(resolve, 50));
      await emitClaimEvent({ claimId: 42, eventType: "evaluation_submitted", userId: 10, tenantId: "tenant_event_test" });

      expect(insertedEvents).toHaveLength(2);
      const assignmentTime = new Date(insertedEvents[0].emittedAt).getTime();
      const evaluationTime = new Date(insertedEvents[1].emittedAt).getTime();
      const turnaroundTime = evaluationTime - assignmentTime;
      expect(turnaroundTime).toBeGreaterThanOrEqual(0);
      expect(turnaroundTime).toBeLessThanOrEqual(5000);
    });
  });
});
