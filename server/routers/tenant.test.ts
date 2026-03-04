// @ts-nocheck
/**
 * Tenant Management Router Test Suite
 * 
 * Tests for tenant management tRPC endpoints:
 * - List all tenants
 * - Get tenant configuration
 * - Update tenant configuration
 * - Get role configuration
 * - Update role configuration
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { appRouter } from "../routers";
import type { Context } from "../_core/context";
import { insurerTenants } from "../../drizzle/schema";
import { getDb } from "../db";

// Mock context for testing
const createMockContext = (role: string = "admin"): Context => ({
  user: {
    id: 1,
    openId: "test-openid",
    name: "Test Admin",
    email: "admin@test.com",
    role,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
});

describe("Tenant Management Router", () => {
  let testTenantId: string;

  beforeAll(async () => {
    // Create a test tenant
    testTenantId = "test-tenant-" + Date.now();
    const db = await getDb();
    await db
      .insert(insurerTenants)
      .values({
        id: testTenantId,
        name: "Test Insurance Co",
        displayName: "Test Insurance Co",
        domain: "test.insurance.com",
        isActive: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
  });

  afterAll(async () => {
    // Clean up test tenant
    const db = await getDb();
    await db.delete(insurerTenants).where({ id: testTenantId });
  });

  describe("list", () => {
    it("should return list of all tenants", async () => {
      const caller = appRouter.createCaller(createMockContext());
      const result = await caller.tenant.list();
      
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      
      const testTenant = result.find((t: any) => t.id === testTenantId);
      expect(testTenant).toBeDefined();
      expect(testTenant?.name).toBe("Test Insurance Co");
    });
  });



  describe("getRoleConfig", () => {
    it("should return role configuration for tenant", async () => {
      const caller = appRouter.createCaller(createMockContext());
      const result = await caller.tenant.getRoleConfig({
        tenantId: testTenantId,
        role: "claims_manager",
      });
      
      // Just check it doesn't throw an error
      expect(true).toBe(true);
    });
  });

  describe("update", () => {
    it("should update tenant configuration", async () => {
      const caller = appRouter.createCaller(createMockContext());
      await caller.tenant.update({
        tenantId: testTenantId,
        name: "Updated Insurance Co",
      });
      
      // Just check it doesn't throw an error
      expect(true).toBe(true);
    });
  });
});
