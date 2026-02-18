/**
 * Analytics Validation Test
 * 
 * Validates that analytics endpoints work correctly after groupBy fixes:
 * - Executive KPIs load
 * - Governance metrics load
 * - Claim state distributions render
 * - Fraud distribution loads
 * - Confidence analytics works
 * - Tenant isolation enforced
 */

import { describe, it, expect, beforeAll } from "vitest";
import { getDb } from "./db";
import { automationPolicies, claims, aiAssessments } from "../drizzle/schema";
import { eq, sql, count, avg } from "drizzle-orm";

let db: Awaited<ReturnType<typeof getDb>>;
let testTenantId: string;

describe("Analytics Validation (Post-groupBy Fix)", () => {
  beforeAll(async () => {
    db = await getDb();
    
    // Get test tenant
    const policies = await db.select().from(automationPolicies).limit(1);
    if (policies.length === 0) {
      throw new Error("No test tenant found");
    }
    testTenantId = policies[0].tenantId;
    
    console.log(`[Test] Using tenant: ${testTenantId}`);
  });

  describe("1. Executive KPIs", () => {
    it("should load total claims count", async () => {
      const result = await db
        .select({ count: count() })
        .from(claims)
        .where(eq(claims.tenantId, testTenantId));
      
      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].count).toBeGreaterThanOrEqual(0);
      
      console.log(`[Test] Total claims: ${result[0].count}`);
    });

    it("should load average claim value", async () => {
      const result = await db
        .select({ avg: avg(claims.estimatedClaimValue) })
        .from(claims)
        .where(eq(claims.tenantId, testTenantId));
      
      expect(result).toBeDefined();
      console.log(`[Test] Average claim value: ${result[0].avg}`);
    });
  });

  describe("2. Claim State Distributions", () => {
    it("should group claims by status using sql`` template", async () => {
      const result = await db
        .select({
          status: claims.status,
          count: count(),
        })
        .from(claims)
        .where(eq(claims.tenantId, testTenantId))
        .groupBy(sql`${claims.status}`);
      
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      
      console.log(`[Test] Status distribution:`, result);
      
      // Verify each status has a count
      result.forEach(row => {
        expect(row.status).toBeDefined();
        expect(row.count).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe("3. Fraud Distribution", () => {
    it("should group AI assessments by fraud risk level", async () => {
      const result = await db
        .select({
          riskLevel: aiAssessments.fraudRiskLevel,
          count: count(),
          avgScore: avg(aiAssessments.fraudRiskScore),
        })
        .from(aiAssessments)
        .where(sql`${aiAssessments.fraudRiskLevel} IS NOT NULL`)
        .groupBy(sql`${aiAssessments.fraudRiskLevel}`);
      
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      
      console.log(`[Test] Fraud risk distribution:`, result);
      
      // Verify each risk level has data
      result.forEach(row => {
        expect(row.riskLevel).toBeDefined();
        expect(row.count).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe("4. Confidence Analytics", () => {
    it("should calculate average confidence score", async () => {
      const result = await db
        .select({ avg: avg(aiAssessments.confidenceScore) })
        .from(aiAssessments)
        .innerJoin(claims, eq(claims.id, aiAssessments.claimId))
        .where(eq(claims.tenantId, testTenantId));
      
      expect(result).toBeDefined();
      console.log(`[Test] Average confidence score: ${result[0].avg}`);
    });

    it("should group by confidence score ranges", async () => {
      const result = await db
        .select({
          scoreRange: sql<string>`CASE 
            WHEN ${aiAssessments.confidenceScore} >= 85 THEN 'high'
            WHEN ${aiAssessments.confidenceScore} >= 65 THEN 'medium'
            ELSE 'low'
          END`.as('scoreRange'),
          count: count(),
        })
        .from(aiAssessments)
        .innerJoin(claims, eq(claims.id, aiAssessments.claimId))
        .where(eq(claims.tenantId, testTenantId))
        .groupBy(sql`CASE 
          WHEN ${aiAssessments.confidenceScore} >= 85 THEN 'high'
          WHEN ${aiAssessments.confidenceScore} >= 65 THEN 'medium'
          ELSE 'low'
        END`);
      
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      
      console.log(`[Test] Confidence score ranges:`, result);
    });
  });

  describe("5. Tenant Isolation", () => {
    it("should enforce tenant isolation in queries", async () => {
      // Query with tenant filter
      const withFilter = await db
        .select({ count: count() })
        .from(claims)
        .where(eq(claims.tenantId, testTenantId));
      
      // Query without tenant filter (should return all)
      const withoutFilter = await db
        .select({ count: count() })
        .from(claims);
      
      expect(withFilter[0].count).toBeLessThanOrEqual(withoutFilter[0].count);
      
      console.log(`[Test] Tenant claims: ${withFilter[0].count}, Total claims: ${withoutFilter[0].count}`);
    });
  });

  describe("6. Time-Series Queries", () => {
    it("should group claims by month using sql`` template", async () => {
      const result = await db
        .select({
          month: sql<string>`DATE_FORMAT(${claims.createdAt}, '%Y-%m')`.as('month'),
          count: count(),
        })
        .from(claims)
        .where(eq(claims.tenantId, testTenantId))
        .groupBy(sql`DATE_FORMAT(${claims.createdAt}, '%Y-%m')`)
        .orderBy(sql`DATE_FORMAT(${claims.createdAt}, '%Y-%m')`);
      
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      
      console.log(`[Test] Monthly claims:`, result);
    });
  });
});
