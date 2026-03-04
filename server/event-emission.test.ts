// @ts-nocheck
import { describe, it, expect, beforeEach } from "vitest";
import { getDb, emitClaimEvent } from "./db";
import { claimEvents, claims, users, assessors, panelBeaters, assessorInsurerRelationships } from "../drizzle/schema";
import { eq, desc } from "drizzle-orm";

describe("Event Emission for Analytics", () => {
  let testClaimId: number;
  let testUserId: number;
  let testAssessorId: number;
  const testTenantId = "tenant_event_test";

  beforeEach(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Create test user
    const userResult = await db.insert(users).values({
      openId: `test-user-${Date.now()}`,
      name: "Event Test User",
      email: `event-test-${Date.now()}@test.com`,
      role: "insurer",
      insurerRole: "claims_processor",
      tenantId: testTenantId,
    });
    testUserId = Number(userResult[0].insertId);

    // Create assessor user
    const assessorUserResult = await db.insert(users).values({
      openId: `test-assessor-${Date.now()}`,
      name: "Event Test Assessor",
      email: `assessor-${Date.now()}@test.com`,
      role: "assessor",
      tenantId: testTenantId,
    });
    const assessorUserId = Number(assessorUserResult[0].insertId);

    // Create test assessor
    const assessorResult = await db.insert(assessors).values({
      userId: assessorUserId,
      professionalLicenseNumber: `LIC-${Date.now()}`,
      licenseExpiryDate: new Date('2025-12-31'),
      assessorType: 'marketplace',
      primaryTenantId: testTenantId,
      yearsOfExperience: 5,
      certifications: JSON.stringify(["CERT1"]),
    });
    testAssessorId = Number(assessorResult[0].insertId);

    // Create assessor-insurer relationship
    await db.insert(assessorInsurerRelationships).values({
      assessorId: testAssessorId,
      tenantId: testTenantId,
      relationshipType: "preferred_vendor",
      relationshipStatus: "active",
      contractStartDate: new Date('2024-01-01'),
    });



    // Create test claim
    const claimResult = await db.insert(claims).values({
      claimNumber: `CLM-EVENT-${Date.now()}`,
      claimantId: testUserId,
      tenantId: testTenantId,
      policyNumber: "POL-EVENT-123",
      incidentDate: new Date("2024-01-15"),
      reportedDate: new Date(),
      status: "submitted",
      vehicleMake: "Toyota",
      vehicleModel: "Corolla",
      vehicleYear: 2020,
      vehicleRegistration: "ABC123GP",
      vehicleVin: "VIN123456789",
      incidentDescription: "Test incident for event emission",
      damageDescription: "Test damage",
      estimatedLoss: 500000,
    });
    testClaimId = Number(claimResult[0].insertId);
  });

  describe("emitClaimEvent helper function", () => {
    it("should emit event with all required fields", async () => {
      await emitClaimEvent({
        claimId: testClaimId,
        eventType: "test_event",
        userId: testUserId,
        userRole: "insurer",
        tenantId: testTenantId,
        eventPayload: { testData: "test value" },
      });

      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const events = await db
        .select()
        .from(claimEvents)
        .where(eq(claimEvents.claimId, testClaimId))
        .orderBy(desc(claimEvents.emittedAt));

      expect(events.length).toBeGreaterThan(0);
      const event = events[0];
      expect(event.eventType).toBe("test_event");
      expect(event.userId).toBe(testUserId);
      expect(event.userRole).toBe("insurer");
      expect(event.tenantId).toBe(testTenantId);
      expect(event.eventPayload).toEqual({ testData: "test value" });
      expect(typeof event.emittedAt).toBe('string'); // timestamp stored as string in DB
    });

    it("should emit event without optional fields", async () => {
      await emitClaimEvent({
        claimId: testClaimId,
        eventType: "system_event",
      });

      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const events = await db
        .select()
        .from(claimEvents)
        .where(eq(claimEvents.claimId, testClaimId))
        .orderBy(desc(claimEvents.emittedAt));

      expect(events.length).toBeGreaterThan(0);
      const event = events[0];
      expect(event.eventType).toBe("system_event");
      expect(event.userId).toBeNull();
      expect(event.userRole).toBeNull();
      expect(event.eventPayload).toBeNull();
    });

    it("should handle event emission errors gracefully", async () => {
      // Try to emit event with invalid claimId (should not throw)
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
        claimId: testClaimId,
        eventType: "assessor_assigned",
        userId: testUserId,
        userRole: "insurer",
        tenantId: testTenantId,
        eventPayload: { assessorId: testAssessorId },
      });

      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const events = await db
        .select()
        .from(claimEvents)
        .where(eq(claimEvents.claimId, testClaimId))
        .orderBy(desc(claimEvents.emittedAt));

      const assignmentEvent = events.find(e => e.eventType === "assessor_assigned");
      expect(assignmentEvent).toBeDefined();
      expect(assignmentEvent?.eventPayload).toEqual({ assessorId: testAssessorId });
    });

    it("should emit evaluation_submitted event", async () => {
      await emitClaimEvent({
        claimId: testClaimId,
        eventType: "evaluation_submitted",
        userId: testAssessorId,
        userRole: "assessor",
        tenantId: testTenantId,
        eventPayload: {
          assessorId: testAssessorId,
          estimatedRepairCost: 450000,
          fraudRiskLevel: "low",
        },
      });

      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const events = await db
        .select()
        .from(claimEvents)
        .where(eq(claimEvents.claimId, testClaimId))
        .orderBy(desc(claimEvents.emittedAt));

      const evaluationEvent = events.find(e => e.eventType === "evaluation_submitted");
      expect(evaluationEvent).toBeDefined();
      expect(evaluationEvent?.eventPayload).toMatchObject({
        assessorId: testAssessorId,
        estimatedRepairCost: 450000,
        fraudRiskLevel: "low",
      });
    });

    it("should emit quote_submitted event", async () => {
      await emitClaimEvent({
        claimId: testClaimId,
        eventType: "quote_submitted",
        userId: testUserId,
        userRole: "insurer",
        tenantId: testTenantId,
        eventPayload: {
          panelBeaterId: 999,
          quotedAmount: 480000,
          quotesReceived: 1,
        },
      });

      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const events = await db
        .select()
        .from(claimEvents)
        .where(eq(claimEvents.claimId, testClaimId))
        .orderBy(desc(claimEvents.emittedAt));

      const quoteEvent = events.find(e => e.eventType === "quote_submitted");
      expect(quoteEvent).toBeDefined();
      expect(quoteEvent?.eventPayload).toMatchObject({
        panelBeaterId: 999,
        quotedAmount: 480000,
        quotesReceived: 1,
      });
    });

    it("should emit claim_approved event", async () => {
      await emitClaimEvent({
        claimId: testClaimId,
        eventType: "claim_approved",
        userId: testUserId,
        userRole: "insurer",
        tenantId: testTenantId,
        eventPayload: {
          selectedQuoteId: 123,
          approvedAmount: 480000,
          requiresFinancialApproval: false,
          approvalType: "technical",
        },
      });

      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const events = await db
        .select()
        .from(claimEvents)
        .where(eq(claimEvents.claimId, testClaimId))
        .orderBy(desc(claimEvents.emittedAt));

      const approvalEvent = events.find(e => e.eventType === "claim_approved");
      expect(approvalEvent).toBeDefined();
      expect(approvalEvent?.eventPayload).toMatchObject({
        selectedQuoteId: 123,
        approvedAmount: 480000,
        requiresFinancialApproval: false,
        approvalType: "technical",
      });
    });
  });

  describe("Event Chronological Ordering", () => {
    it("should maintain chronological order of events", async () => {
      // Emit events in workflow order
      await emitClaimEvent({
        claimId: testClaimId,
        eventType: "assessor_assigned",
        userId: testUserId,
        tenantId: testTenantId,
      });

      // Wait 10ms to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));

      await emitClaimEvent({
        claimId: testClaimId,
        eventType: "evaluation_submitted",
        userId: testAssessorId,
        tenantId: testTenantId,
      });

      await new Promise(resolve => setTimeout(resolve, 10));

      await emitClaimEvent({
        claimId: testClaimId,
        eventType: "quote_submitted",
        userId: testUserId,
        tenantId: testTenantId,
      });

      await new Promise(resolve => setTimeout(resolve, 10));

      await emitClaimEvent({
        claimId: testClaimId,
        eventType: "claim_approved",
        userId: testUserId,
        tenantId: testTenantId,
      });

      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const events = await db
        .select()
        .from(claimEvents)
        .where(eq(claimEvents.claimId, testClaimId))
        .orderBy(claimEvents.emittedAt); // Ascending order

      expect(events.length).toBe(4);
      expect(events[0].eventType).toBe("assessor_assigned");
      expect(events[1].eventType).toBe("evaluation_submitted");
      expect(events[2].eventType).toBe("quote_submitted");
      expect(events[3].eventType).toBe("claim_approved");

      // Verify timestamps are in ascending order
      for (let i = 1; i < events.length; i++) {
        expect(new Date(events[i].emittedAt).getTime()).toBeGreaterThanOrEqual(
          new Date(events[i - 1].emittedAt).getTime()
        );
      }
    });
  });

  describe("Turnaround Time Analytics Support", () => {
    it("should enable calculation of time between workflow stages", async () => {
      const startTime = new Date();

      await emitClaimEvent({
        claimId: testClaimId,
        eventType: "assessor_assigned",
        userId: testUserId,
        tenantId: testTenantId,
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      await emitClaimEvent({
        claimId: testClaimId,
        eventType: "evaluation_submitted",
        userId: testAssessorId,
        tenantId: testTenantId,
      });

      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const events = await db
        .select()
        .from(claimEvents)
        .where(eq(claimEvents.claimId, testClaimId))
        .orderBy(claimEvents.emittedAt);

      expect(events.length).toBe(2);

      const assignmentTime = new Date(events[0].emittedAt).getTime();
      const evaluationTime = new Date(events[1].emittedAt).getTime();
      const turnaroundTime = evaluationTime - assignmentTime;

      expect(turnaroundTime).toBeGreaterThanOrEqual(0); // At least 0ms (events are ordered)
      expect(turnaroundTime).toBeLessThanOrEqual(5000); // Less than 5 seconds (reasonable for test)
    });
  });
});
