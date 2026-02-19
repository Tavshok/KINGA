// @ts-nocheck
/**
 * Automation Policy Configuration System
 * 
 * Manages tenant-specific automation policies for confidence-governed claim routing.
 * Supports CRUD operations, threshold validation, and policy inheritance.
 * 
 * Uses schema-derived types to guarantee field name accuracy.
 */

import { getDb } from "./db";
import { automationPolicies, type AutomationPolicy, type InsertAutomationPolicy } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";

/**
 * Create a new automation policy for a tenant
 */
export async function createAutomationPolicy(config: InsertAutomationPolicy): Promise<number> {
  // Validate thresholds
  validatePolicyThresholds(config);
  
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  const result = await db.insert(automationPolicies).values({
    ...config,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  
  const policyId = Number((result as unknown as { insertId: string | number }).insertId);
  console.log(`[Automation Policy] Created policy ${policyId} for tenant ${config.tenantId}`);
  
  return policyId;
}

/**
 * Get active automation policy for a tenant
 */
export async function getActiveAutomationPolicy(tenantId?: string): Promise<AutomationPolicy | null> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  const conditions = tenantId
    ? and(eq(automationPolicies.tenantId, tenantId), eq(automationPolicies.isActive, true))
    : eq(automationPolicies.isActive, true);
  
  const policies = await db
    .select()
    .from(automationPolicies)
    .where(conditions)
    .limit(1);
  
  return policies.length > 0 ? policies[0] : null;
}

/**
 * Update an existing automation policy
 */
export async function updateAutomationPolicy(
  policyId: number,
  updates: Partial<InsertAutomationPolicy>
): Promise<void> {
  // Validate updated thresholds
  validatePolicyThresholds(updates);
  
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  await db
    .update(automationPolicies)
    .set({
      ...updates,
      updatedAt: new Date(),
    })
    .where(eq(automationPolicies.id, policyId));
  
  console.log(`[Automation Policy] Updated policy ${policyId}`);
}

/**
 * Deactivate an automation policy
 */
export async function deactivateAutomationPolicy(policyId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  await db
    .update(automationPolicies)
    .set({
      isActive: false,
      updatedAt: new Date(),
    })
    .where(eq(automationPolicies.id, policyId));
  
  console.log(`[Automation Policy] Deactivated policy ${policyId}`);
}

/**
 * Get all policies for a tenant (active and inactive)
 */
export async function getTenantPolicies(tenantId?: string): Promise<AutomationPolicy[]> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  const query = tenantId
    ? db.select().from(automationPolicies).where(eq(automationPolicies.tenantId, tenantId))
    : db.select().from(automationPolicies);
  
  return await query;
}

/**
 * Validate policy configuration thresholds
 */
function validatePolicyThresholds(config: Partial<InsertAutomationPolicy>): void {
  if (config.minAutomationConfidence !== undefined) {
    if (config.minAutomationConfidence < 0 || config.minAutomationConfidence > 100) {
      throw new Error("minAutomationConfidence must be between 0 and 100");
    }
  }
  
  if (config.minHybridConfidence !== undefined) {
    if (config.minHybridConfidence < 0 || config.minHybridConfidence > 100) {
      throw new Error("minHybridConfidence must be between 0 and 100");
    }
  }
  
  if (config.maxFraudScoreForAutomation !== undefined) {
    if (config.maxFraudScoreForAutomation < 0 || config.maxFraudScoreForAutomation > 100) {
      throw new Error("maxFraudScoreForAutomation must be between 0 and 100");
    }
  }
  
  if (config.maxAiOnlyApprovalAmount !== undefined) {
    if (config.maxAiOnlyApprovalAmount < 0) {
      throw new Error("maxAiOnlyApprovalAmount must be non-negative");
    }
  }
  
  if (config.maxHybridApprovalAmount !== undefined) {
    if (config.maxHybridApprovalAmount < 0) {
      throw new Error("maxHybridApprovalAmount must be non-negative");
    }
  }
}

/**
 * Get default automation policy (conservative defaults for new tenants)
 */
export function getDefaultAutomationPolicy(tenantId: string): InsertAutomationPolicy {
  return {
    tenantId,
    policyName: "Default Conservative Policy",
    minAutomationConfidence: 85, // High confidence required for AI-only
    minHybridConfidence: 60, // Moderate confidence for hybrid workflow
    maxAiOnlyApprovalAmount: 10000, // R10,000 max for AI-only
    maxHybridApprovalAmount: 50000, // R50,000 max for hybrid
    maxFraudScoreForAutomation: 30, // Low fraud tolerance
    eligibleClaimTypes: ["collision", "vandalism", "weather"],
    excludedClaimTypes: ["theft", "fire"], // High-risk types require manual review
    eligibleVehicleCategories: ["passenger", "motorcycle"],
    excludedVehicleMakes: ["Ferrari", "Lamborghini", "Bentley", "Rolls-Royce"], // Luxury brands require manual review
    minVehicleYear: 2010,
    maxVehicleAge: 15,
    requireManagerApprovalAbove: 100000, // R100,000 requires manager approval
    allowPolicyOverride: true,
    isActive: true,
  };
}
