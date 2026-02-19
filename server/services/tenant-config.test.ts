// @ts-nocheck
/**
 * Tenant Configuration Service Tests
 * 
 * Tests for tenant configuration management and default handling
 */

import { describe, it, expect, beforeAll } from "vitest";
import { 
  createTenant, 
  getTenantConfig, 
  getWorkflowConfig,
  getTenantRoles,
  getDocumentTemplate,
  seedDefaultKingaTenant,
  DEFAULT_TENANT_CONFIG,
  DEFAULT_WORKFLOW_CONFIG,
  DEFAULT_ROLE_PERMISSIONS,
  DEFAULT_DOCUMENT_TEMPLATES
} from "./tenant-config";
import { getDb } from "../db";
import { tenantRoleConfigs } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";

describe("Tenant Configuration Service", () => {
  const testTenantId = "test-tenant-" + Date.now();

  beforeAll(async () => {
    // Create a test tenant
    await createTenant({
      id: testTenantId,
      name: "Test Insurance Co",
      displayName: "Test Insurance Company",
      primaryColor: "#3b82f6",
      secondaryColor: "#64748b",
    });
  });

  describe("createTenant", () => {
    it("should create a tenant with default configuration", async () => {
      const newTenantId = "test-tenant-create-" + Date.now();
      
      await createTenant({
        id: newTenantId,
        name: "New Test Insurer",
        displayName: "New Test Insurance Company",
      });

      const config = await getTenantConfig(newTenantId);
      
      expect(config).toBeDefined();
      expect(config.id).toBe(newTenantId);
      expect(config.name).toBe("New Test Insurer");
      expect(config.primaryColor).toBe(DEFAULT_TENANT_CONFIG.primaryColor);
    });

    it("should create tenant with custom colors", async () => {
      const customTenantId = "test-tenant-custom-" + Date.now();
      
      await createTenant({
        id: customTenantId,
        name: "Custom Insurer",
        displayName: "Custom Insurance Company",
        primaryColor: "#ff0000",
        secondaryColor: "#00ff00",
      });

      const config = await getTenantConfig(customTenantId);
      
      expect(config.primaryColor).toBe("#ff0000");
      expect(config.secondaryColor).toBe("#00ff00");
    });
  });

  describe("getTenantConfig", () => {
    it("should return tenant configuration with defaults applied", async () => {
      const config = await getTenantConfig(testTenantId);
      
      expect(config).toBeDefined();
      expect(config.id).toBe(testTenantId);
      expect(config.documentNamingTemplate).toBe(DEFAULT_TENANT_CONFIG.documentNamingTemplate);
      expect(config.documentRetentionYears).toBe(DEFAULT_TENANT_CONFIG.documentRetentionYears);
    });

    it("should throw error for non-existent tenant", async () => {
      await expect(getTenantConfig("non-existent-tenant")).rejects.toThrow("Tenant not found");
    });
  });

  describe("getWorkflowConfig", () => {
    it("should return workflow configuration for tenant", async () => {
      const config = await getWorkflowConfig(testTenantId);
      
      expect(config).toBeDefined();
      expect(config.tenantId).toBe(testTenantId);
      expect(config.requireExecutiveApprovalAbove).toBeDefined();
      expect(config.autoApproveBelow).toBeDefined();
    });

    it("should return defaults for tenant without custom workflow config", async () => {
      const newTenantId = "test-tenant-workflow-" + Date.now();
      
      await createTenant({
        id: newTenantId,
        name: "Workflow Test Insurer",
        displayName: "Workflow Test Insurance Company",
      });

      const config = await getWorkflowConfig(newTenantId);
      
      // Database returns DECIMAL as strings
      expect(parseFloat(config.requireExecutiveApprovalAbove as any)).toBe(DEFAULT_WORKFLOW_CONFIG.requireExecutiveApprovalAbove);
      expect(parseFloat(config.requireManagerApprovalAbove as any)).toBe(DEFAULT_WORKFLOW_CONFIG.requireManagerApprovalAbove);
    });
  });

  describe("getTenantRoles", () => {
    it("should return enabled roles with permissions", async () => {
      const roles = await getTenantRoles(testTenantId);
      
      expect(roles).toBeDefined();
      expect(roles.length).toBeGreaterThan(0);
      
      // Check that all default roles are present
      const roleKeys = roles.map(r => r.roleKey);
      expect(roleKeys).toContain("executive");
      expect(roleKeys).toContain("claims_manager");
      expect(roleKeys).toContain("claims_processor");
      expect(roleKeys).toContain("internal_assessor");
      expect(roleKeys).toContain("risk_manager");
    });

    it("should apply default permissions when not set", async () => {
      const roles = await getTenantRoles(testTenantId);
      
      const executiveRole = roles.find(r => r.roleKey === "executive");
      expect(executiveRole).toBeDefined();
      expect(executiveRole?.permissions).toEqual(DEFAULT_ROLE_PERMISSIONS.executive);
    });
  });

  describe("getDocumentTemplate", () => {
    it("should return document template for tenant", async () => {
      const template = await getDocumentTemplate(testTenantId, "claim");
      
      expect(template).toBeDefined();
      expect(typeof template).toBe("string");
    });

    it("should return default template when custom template not found", async () => {
      const newTenantId = "test-tenant-template-" + Date.now();
      
      await createTenant({
        id: newTenantId,
        name: "Template Test Insurer",
        displayName: "Template Test Insurance Company",
      });

      const template = await getDocumentTemplate(newTenantId, "assessment");
      
      expect(template).toBe(DEFAULT_DOCUMENT_TEMPLATES.assessment);
    });
  });

  describe("seedDefaultKingaTenant", () => {
    it("should create default KINGA tenant if not exists", async () => {
      const tenantId = await seedDefaultKingaTenant();
      
      expect(tenantId).toBe("kinga-default");
      
      const config = await getTenantConfig(tenantId);
      expect(config).toBeDefined();
      expect(config.name).toBe("KINGA");
    });

    it("should not create duplicate KINGA tenant", async () => {
      const tenantId1 = await seedDefaultKingaTenant();
      const tenantId2 = await seedDefaultKingaTenant();
      
      expect(tenantId1).toBe(tenantId2);
    });
  });

  describe("Default Configuration Values", () => {
    it("should have correct default tenant config values", () => {
      expect(DEFAULT_TENANT_CONFIG.primaryColor).toBe("#10b981");
      expect(DEFAULT_TENANT_CONFIG.secondaryColor).toBe("#64748b");
      expect(DEFAULT_TENANT_CONFIG.documentRetentionYears).toBe(7);
      expect(DEFAULT_TENANT_CONFIG.fraudRetentionYears).toBe(10);
      expect(DEFAULT_TENANT_CONFIG.fraudFlagThreshold).toBe(0.70);
    });

    it("should have correct default workflow config values", () => {
      expect(DEFAULT_WORKFLOW_CONFIG.requireExecutiveApprovalAbove).toBe(50000.00);
      expect(DEFAULT_WORKFLOW_CONFIG.requireManagerApprovalAbove).toBe(10000.00);
      expect(DEFAULT_WORKFLOW_CONFIG.autoApproveBelow).toBe(5000.00);
    });

    it("should have permissions defined for all roles", () => {
      expect(DEFAULT_ROLE_PERMISSIONS.executive).toBeDefined();
      expect(DEFAULT_ROLE_PERMISSIONS.claims_manager).toBeDefined();
      expect(DEFAULT_ROLE_PERMISSIONS.claims_processor).toBeDefined();
      expect(DEFAULT_ROLE_PERMISSIONS.internal_assessor).toBeDefined();
      expect(DEFAULT_ROLE_PERMISSIONS.risk_manager).toBeDefined();
    });

    it("should have templates defined for all document types", () => {
      expect(DEFAULT_DOCUMENT_TEMPLATES.claim).toBeDefined();
      expect(DEFAULT_DOCUMENT_TEMPLATES.assessment).toBeDefined();
      expect(DEFAULT_DOCUMENT_TEMPLATES.report).toBeDefined();
      expect(DEFAULT_DOCUMENT_TEMPLATES.approval).toBeDefined();
    });
  });
});


describe("Tenant Role Configuration - Composite Primary Key", () => {
  const testTenantId1 = "test-tenant-pk-1";
  const testTenantId2 = "test-tenant-pk-2";

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Clean up test data
    await db
      .delete(tenantRoleConfigs)
      .where(eq(tenantRoleConfigs.tenantId, testTenantId1));
    await db
      .delete(tenantRoleConfigs)
      .where(eq(tenantRoleConfigs.tenantId, testTenantId2));
  });

  describe("Insert Configuration", () => {
    it("should insert role config successfully without id field", async () => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Insert a role config (no id field)
      await db.insert(tenantRoleConfigs).values({
        tenantId: testTenantId1,
        roleKey: "claims_processor",
        enabled: 1,
        displayName: "Claims Processor",
        permissions: JSON.stringify(DEFAULT_ROLE_PERMISSIONS.claims_processor),
      });

      // Verify it was inserted
      const result = await db
        .select()
        .from(tenantRoleConfigs)
        .where(
          and(
            eq(tenantRoleConfigs.tenantId, testTenantId1),
            eq(tenantRoleConfigs.roleKey, "claims_processor")
          )
        );

      expect(result.length).toBe(1);
      expect(result[0].tenantId).toBe(testTenantId1);
      expect(result[0].roleKey).toBe("claims_processor");
      expect(result[0].enabled).toBe(1);
    });

    it("should enforce composite primary key uniqueness", async () => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Insert first config
      await db.insert(tenantRoleConfigs).values({
        tenantId: testTenantId1,
        roleKey: "executive",
        enabled: 1,
        displayName: "Executive",
        permissions: JSON.stringify(DEFAULT_ROLE_PERMISSIONS.executive),
      });

      // Try to insert duplicate (same tenantId + roleKey)
      await expect(
        db.insert(tenantRoleConfigs).values({
          tenantId: testTenantId1,
          roleKey: "executive",
          enabled: 0,
          displayName: "Different Name",
          permissions: JSON.stringify([]),
        })
      ).rejects.toThrow();
    });

    it("should allow same roleKey for different tenants", async () => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Insert for tenant 1
      await db.insert(tenantRoleConfigs).values({
        tenantId: testTenantId1,
        roleKey: "risk_manager",
        enabled: 1,
        displayName: "Risk Manager",
        permissions: JSON.stringify(DEFAULT_ROLE_PERMISSIONS.risk_manager),
      });

      // Insert same roleKey for tenant 2 (should succeed)
      await db.insert(tenantRoleConfigs).values({
        tenantId: testTenantId2,
        roleKey: "risk_manager",
        enabled: 1,
        displayName: "Risk Manager",
        permissions: JSON.stringify(DEFAULT_ROLE_PERMISSIONS.risk_manager),
      });

      // Verify both exist
      const tenant1Roles = await db
        .select()
        .from(tenantRoleConfigs)
        .where(eq(tenantRoleConfigs.tenantId, testTenantId1));

      const tenant2Roles = await db
        .select()
        .from(tenantRoleConfigs)
        .where(eq(tenantRoleConfigs.tenantId, testTenantId2));

      expect(tenant1Roles.length).toBeGreaterThanOrEqual(1);
      expect(tenant2Roles.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Update Configuration", () => {
    it("should update existing role config using composite key", async () => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Insert initial config
      await db.insert(tenantRoleConfigs).values({
        tenantId: testTenantId1,
        roleKey: "claims_manager",
        enabled: 1,
        displayName: "Claims Manager",
        permissions: JSON.stringify(DEFAULT_ROLE_PERMISSIONS.claims_manager),
      });

      // Update the config using composite key
      await db
        .update(tenantRoleConfigs)
        .set({
          enabled: 0,
          displayName: "Updated Claims Manager",
        })
        .where(
          and(
            eq(tenantRoleConfigs.tenantId, testTenantId1),
            eq(tenantRoleConfigs.roleKey, "claims_manager")
          )
        );

      // Verify update
      const result = await db
        .select()
        .from(tenantRoleConfigs)
        .where(
          and(
            eq(tenantRoleConfigs.tenantId, testTenantId1),
            eq(tenantRoleConfigs.roleKey, "claims_manager")
          )
        );

      expect(result[0].enabled).toBe(0);
      expect(result[0].displayName).toBe("Updated Claims Manager");
    });

    it("should not affect other tenants when updating", async () => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Add same role for both tenants
      await db.insert(tenantRoleConfigs).values([
        {
          tenantId: testTenantId1,
          roleKey: "assessor_internal",
          enabled: 1,
          displayName: "Internal Assessor T1",
          permissions: JSON.stringify([]),
        },
        {
          tenantId: testTenantId2,
          roleKey: "assessor_internal",
          enabled: 1,
          displayName: "Internal Assessor T2",
          permissions: JSON.stringify([]),
        },
      ]);

      // Update tenant 1's config
      await db
        .update(tenantRoleConfigs)
        .set({ enabled: 0 })
        .where(
          and(
            eq(tenantRoleConfigs.tenantId, testTenantId1),
            eq(tenantRoleConfigs.roleKey, "assessor_internal")
          )
        );

      // Verify tenant 2 is unchanged
      const tenant2Result = await db
        .select()
        .from(tenantRoleConfigs)
        .where(
          and(
            eq(tenantRoleConfigs.tenantId, testTenantId2),
            eq(tenantRoleConfigs.roleKey, "assessor_internal")
          )
        );

      expect(tenant2Result[0].enabled).toBe(1);
    });
  });

  describe("Tenant Isolation", () => {
    it("should only return roles for requested tenant", async () => {
      const tenant1Roles = await getTenantRoles(testTenantId1);
      const tenant2Roles = await getTenantRoles(testTenantId2);

      // Verify tenant IDs
      expect(tenant1Roles.every((r: any) => r.tenantId === testTenantId1)).toBe(
        true
      );
      expect(tenant2Roles.every((r: any) => r.tenantId === testTenantId2)).toBe(
        true
      );
    });

    it("should not leak permissions across tenants", async () => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Set up different permissions for same role across tenants
      await db.insert(tenantRoleConfigs).values([
        {
          tenantId: testTenantId1,
          roleKey: "executive",
          enabled: 1,
          displayName: "Executive T1",
          permissions: JSON.stringify(["permission1", "permission2"]),
        },
        {
          tenantId: testTenantId2,
          roleKey: "executive",
          enabled: 1,
          displayName: "Executive T2",
          permissions: JSON.stringify(["permission3", "permission4"]),
        },
      ]);

      const tenant1Roles = await getTenantRoles(testTenantId1);
      const tenant2Roles = await getTenantRoles(testTenantId2);

      const tenant1Executive = tenant1Roles.find(
        (r: any) => r.roleKey === "executive"
      );
      const tenant2Executive = tenant2Roles.find(
        (r: any) => r.roleKey === "executive"
      );

      // Same role key but different permissions
      expect(tenant1Executive!.permissions).toContain("permission1");
      expect(tenant1Executive!.permissions).not.toContain("permission3");

      expect(tenant2Executive!.permissions).toContain("permission3");
      expect(tenant2Executive!.permissions).not.toContain("permission1");
    });
  });
});
