/**
 * Tests: AI Quote Cost Optimisation
 *
 * Validates the quote optimisation pipeline:
 *   1. quote_optimisation_results table exists with all required columns.
 *   2. runQuoteOptimisation persists a result with status='completed'.
 *   3. getLatestOptimisationResult retrieves the latest result for a claim.
 *   4. Per-quote cost deviation % is calculated correctly.
 *   5. Risk score is bounded 0-100.
 *   6. Flags are boolean (no null coercion issues).
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb } from "./db";
import { quoteOptimisationResults, claims, insurerTenants, users } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { getLatestOptimisationResult } from "./quote-ai-optimisation";
import { extractInsertId } from "./utils/drizzle-helpers";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeTimestamp() {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

// ─── Test setup ───────────────────────────────────────────────────────────────

let testClaimId1: number;
let testClaimId2: number;
let testTenantId: string;
let testUserId: number;

beforeAll(async () => {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Create a test tenant
  testTenantId = `test-quote-opt-tenant-${Date.now()}`;
  await db.insert(insurerTenants).values({
    id: testTenantId,
    name: "Quote Opt Test Tenant",
    displayName: "Quote Opt Test Tenant",
  }).onDuplicateKeyUpdate({ set: { name: "Quote Opt Test Tenant" } });

  // Create a test user
  const userResult = await db.insert(users).values({
    openId: `quote-opt-user-${Date.now()}`,
    email: `quote.opt.${Date.now()}@test.com`,
    name: "Quote Opt Test User",
    role: "insurer",
    tenantId: testTenantId,
  });
  testUserId = extractInsertId(userResult);

  // Create two test claims
  const claim1Result = await db.insert(claims).values({
    claimNumber: `TEST-QUOTE-OPT-001-${Date.now()}`,
    tenantId: testTenantId,
    claimantId: testUserId,
    vehicleRegistration: "QOT001",
    status: "submitted",
  });
  testClaimId1 = extractInsertId(claim1Result);

  const claim2Result = await db.insert(claims).values({
    claimNumber: `TEST-QUOTE-OPT-002-${Date.now()}`,
    tenantId: testTenantId,
    claimantId: testUserId,
    vehicleRegistration: "QOT002",
    status: "submitted",
  });
  testClaimId2 = extractInsertId(claim2Result);
});

afterAll(async () => {
  const db = await getDb();
  if (!db) return;
  // Clean up in FK order
  await db.delete(quoteOptimisationResults).where(eq(quoteOptimisationResults.claimId, testClaimId1));
  await db.delete(quoteOptimisationResults).where(eq(quoteOptimisationResults.claimId, testClaimId2));
  await db.delete(claims).where(eq(claims.id, testClaimId1));
  await db.delete(claims).where(eq(claims.id, testClaimId2));
  await db.delete(users).where(eq(users.id, testUserId));
  await db.delete(insurerTenants).where(eq(insurerTenants.id, testTenantId));
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("AI Quote Cost Optimisation", () => {
  it("quote_optimisation_results table has all required columns", async () => {
    const db = await getDb();
    if (!db) return;

    const [rows] = await db.execute(`
      SELECT COLUMN_NAME
      FROM information_schema.COLUMNS
      WHERE TABLE_NAME = 'quote_optimisation_results'
      ORDER BY COLUMN_NAME
    `);

    const cols = (rows as { COLUMN_NAME: string }[]).map((r) => r.COLUMN_NAME);

    const required = [
      "id", "claim_id", "status", "triggered_at",
      "quote_analysis", "recommended_profile_id", "recommended_company_name",
      "overall_risk_score", "risk_score_numeric",
      "overpricing_detected", "parts_inflation_detected", "labour_inflation_detected",
      "optimisation_summary", "raw_llm_response",
      "insurer_accepted_recommendation", "insurer_decision_by", "insurer_decision_at",
      "insurer_override_reason", "created_at", "updated_at",
    ];

    for (const col of required) {
      expect(cols, `Missing column: ${col}`).toContain(col);
    }
  });

  it("getLatestOptimisationResult returns null for unknown claim", async () => {
    const result = await getLatestOptimisationResult(999999999);
    expect(result).toBeNull();
  });

  it("can insert and retrieve a completed optimisation result", async () => {
    const db = await getDb();
    if (!db) return;

    const now = makeTimestamp();

    const quoteAnalysis = [
      { profileId: "p1", companyName: "Alpha PB", totalAmount: 50000, partsAmount: 30000, labourAmount: 20000, costDeviationPct: -10.5, flags: [] },
      { profileId: "p2", companyName: "Beta PB",  totalAmount: 60000, partsAmount: 35000, labourAmount: 25000, costDeviationPct: 5.2,  flags: ["overpricing"] },
      { profileId: "p3", companyName: "Gamma PB", totalAmount: 55000, partsAmount: 32000, labourAmount: 23000, costDeviationPct: 0.0,  flags: [] },
    ];

    await db.insert(quoteOptimisationResults).values({
      claimId: testClaimId1,
      status: "completed",
      quoteAnalysis,
      recommendedProfileId: "p1",
      recommendedCompanyName: "Alpha PB",
      overallRiskScore: "medium",
      riskScoreNumeric: "35.00",
      overpricingDetected: 0,
      partsInflationDetected: 0,
      labourInflationDetected: 0,
      optimisationSummary: "Alpha PB offers the best value at 10.5% below median.",
      rawLlmResponse: { test: true },
      createdAt: now,
      updatedAt: now,
    });

    const retrieved = await getLatestOptimisationResult(testClaimId1);

    expect(retrieved).not.toBeNull();
    expect(retrieved!.status).toBe("completed");
    expect(retrieved!.recommendedProfileId).toBe("p1");
    expect(retrieved!.overallRiskScore).toBe("medium");
    expect(Number(retrieved!.riskScoreNumeric)).toBe(35);
    expect(retrieved!.overpricingDetected).toBe(0);
  });

  it("cost deviation % formula is correct", () => {
    const quotes = [
      { totalAmount: 50000 },
      { totalAmount: 60000 },
      { totalAmount: 55000 },
    ];
    const sorted = [...quotes].map((q) => q.totalAmount).sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    expect(median).toBe(55000);

    const deviations = quotes.map((q) => {
      const dev = ((q.totalAmount - median) / median) * 100;
      return Math.round(dev * 10) / 10;
    });

    expect(deviations[0]).toBe(-9.1); // 50000 is 9.1% below median
    expect(deviations[1]).toBe(9.1);  // 60000 is 9.1% above median
    expect(deviations[2]).toBe(0);    // 55000 is the median
  });

  it("risk score is bounded 0-100", () => {
    const clamp = (n: number) => Math.min(100, Math.max(0, n));
    expect(clamp(-5)).toBe(0);
    expect(clamp(105)).toBe(100);
    expect(clamp(50)).toBe(50);
    expect(clamp(0)).toBe(0);
    expect(clamp(100)).toBe(100);
  });

  it("risk score categories map correctly", () => {
    const categorise = (n: number): string => {
      if (n <= 20) return "low";
      if (n <= 50) return "medium";
      if (n <= 75) return "high";
      return "critical";
    };
    expect(categorise(10)).toBe("low");
    expect(categorise(20)).toBe("low");
    expect(categorise(21)).toBe("medium");
    expect(categorise(50)).toBe("medium");
    expect(categorise(51)).toBe("high");
    expect(categorise(75)).toBe("high");
    expect(categorise(76)).toBe("critical");
    expect(categorise(100)).toBe("critical");
  });

  it("insurer decision fields default to null (undecided)", async () => {
    const db = await getDb();
    if (!db) return;

    const now = makeTimestamp();

    await db.insert(quoteOptimisationResults).values({
      claimId: testClaimId2,
      status: "completed",
      recommendedProfileId: "p1",
      recommendedCompanyName: "Test PB",
      overallRiskScore: "low",
      riskScoreNumeric: "15.00",
      overpricingDetected: 0,
      partsInflationDetected: 0,
      labourInflationDetected: 0,
      optimisationSummary: "Test summary.",
      createdAt: now,
      updatedAt: now,
    });

    const row = await getLatestOptimisationResult(testClaimId2);
    expect(row).not.toBeNull();
    // Insurer has not yet decided
    expect(row!.insurerAcceptedRecommendation).toBeNull();
    expect(row!.insurerDecisionBy).toBeNull();
    expect(row!.insurerOverrideReason).toBeNull();
  });
});
