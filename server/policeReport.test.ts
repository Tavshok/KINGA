/**
 * Unit Tests for Police Report Integration
 * 
 * Tests cross-validation logic and fraud detection for police reports
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { appRouter } from "./routers";
import { getDb } from "./db";
import type { inferProcedureInput } from "@trpc/server";

describe("Police Report Integration", () => {
  let testClaimId: number;
  let testUserId: number;
  const testRunId = Date.now();

  // Create test context
  const createTestContext = (userId: number, role: string = "assessor") => ({
    user: {
      id: userId,
      email: "test@example.com",
      name: "Test Assessor",
      role,
      openId: "test-open-id",
      createdAt: new Date(),
    },
  });

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Create test user - use unique openId to avoid duplicate key errors
    const uniqueId = `test-police-${Date.now()}`;
    const userResult = await db.execute(
      `INSERT INTO users (email, name, role, openId) VALUES ('${uniqueId}@test.com', 'Test Police Assessor', 'assessor', '${uniqueId}')`
    );
    testUserId = (userResult as any)[0]?.insertId || (userResult as any).insertId;

    // Create test claim with specific speed in description
    const claimResult = await db.execute(
      `INSERT INTO claims (
        claim_number, claimant_id, vehicle_make, vehicle_model, vehicle_year,
        vehicle_registration, incident_date, incident_location, incident_description,
        status, created_at
      ) VALUES (
        'TEST-POLICE-001-${testRunId}',
        ${testUserId},
        'Toyota',
        'Hilux',
        2017,
        'AFV2713',
        '2024-07-13',
        '40KM PEG ALONG MUTARE-MASVINGO ROAD',
        'Accident occurred while driving at 60 km/h in blind spot',
        'submitted',
        NOW()
      )`
    );
    testClaimId = (claimResult as any)[0]?.insertId || (claimResult as any).insertId;
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;

    // Cleanup test data
    try {
      await db.execute(`DELETE FROM police_reports WHERE claim_id = ${testClaimId}`);
      await db.execute(`DELETE FROM claims WHERE id = ${testClaimId}`);
      await db.execute(`DELETE FROM users WHERE id = ${testUserId}`);
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  it("should create police report with speed discrepancy detection", async () => {
    const caller = appRouter.createCaller(createTestContext(testUserId));

    type PoliceReportInput = inferProcedureInput<typeof appRouter.policeReports.create>;
    const input: PoliceReportInput = {
      claimId: testClaimId,
      reportNumber: "ZRP-TAB 95/24",
      policeStation: "Mutare Rural ZRP",
      officerName: "Officer Test",
      reportDate: "2024-07-13",
      reportedSpeed: 80, // Police says 80 km/h, claim says 60 km/h
      reportedWeather: "Clear",
      reportedRoadCondition: "Good",
      accidentLocation: "40KM PEG ALONG MUTARE-MASVINGO ROAD",
      accidentDescription: "Vehicle collision in blind spot",
    };

    const result = await caller.policeReports.create(input);

    // Should detect 20 km/h discrepancy (80 - 60)
    expect(result.speedDiscrepancy).toBe(20);
    expect(result.id).toBeGreaterThan(0);
  });

  it("should detect location mismatch", async () => {
    const caller = appRouter.createCaller(createTestContext(testUserId));

    // Create another test claim
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const claimResult = await db.execute(
      `INSERT INTO claims (
        claim_number, claimant_id, vehicle_make, vehicle_model, vehicle_year,
        incident_location, incident_description, status, created_at
      ) VALUES (
        'TEST-POLICE-002-${testRunId}',
        ${testUserId},
        'Toyota',
        'Quantum',
        2015,
        'Harare CBD',
        'Rear-end collision',
        'submitted',
        NOW()
      )`
    );
    const claim2Id = (claimResult as any)[0]?.insertId || (claimResult as any).insertId;

    type PoliceReportInput = inferProcedureInput<typeof appRouter.policeReports.create>;
    const input: PoliceReportInput = {
      claimId: claim2Id,
      reportNumber: "ZRP-HAR 123/24",
      accidentLocation: "Mutare Road", // Different from "Harare CBD"
    };

    const result = await caller.policeReports.create(input);

    // Fetch the created report to check location mismatch
    const report = await caller.policeReports.byClaim({ claimId: claim2Id });

    expect(report).toBeDefined();
    expect(report?.locationMismatch).toBe(1);

    // Cleanup
    try {
      await db.execute(`DELETE FROM police_reports WHERE claim_id = ${claim2Id}`);
      await db.execute(`DELETE FROM claims WHERE id = ${claim2Id}`);
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  it("should retrieve police report by claim ID", async () => {
    const caller = appRouter.createCaller(createTestContext(testUserId));

    const report = await caller.policeReports.byClaim({ claimId: testClaimId });

    expect(report).toBeDefined();
    expect(report?.reportNumber).toBe("ZRP-TAB 95/24");
    expect(report?.policeStation).toBe("Mutare Rural ZRP");
    expect(report?.reportedSpeed).toBe(80);
    expect(report?.speedDiscrepancy).toBe(20);
  });

  it("should reject unauthorized users", async () => {
    const caller = appRouter.createCaller(createTestContext(testUserId, "claimant"));

    type PoliceReportInput = inferProcedureInput<typeof appRouter.policeReports.create>;
    const input: PoliceReportInput = {
      claimId: testClaimId,
      reportNumber: "ZRP-TEST-999",
    };

    await expect(caller.policeReports.create(input)).rejects.toThrow("Not authorized");
  });
});
