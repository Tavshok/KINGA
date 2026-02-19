// @ts-nocheck
/**
 * Policy Activation Service
 * 
 * Manages policy activation workflow with audit logging and governance controls.
 * Ensures only one policy is active per tenant at any time.
 */

import { getDb } from "../db";
import { automationPolicies, auditTrail } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { createPolicyVersion } from "../routing-policy-version-manager";
import { PolicyProfileTemplate, profileToAutomationPolicy } from "./policy-profiles";

/**
 * Create a new policy from profile template
 * Policy starts inactive, must be explicitly activated
 */
export async function createPolicyFromProfile(
  tenantId: string,
  profile: PolicyProfileTemplate,
  createdByUserId: number,
  customizations?: Partial<PolicyProfileTemplate>
): Promise<number> {
  const db = await getDb();

  // Merge profile with customizations
  const finalProfile = customizations ? { ...profile, ...customizations } : profile;

  // Convert profile to automation policy
  const policyData = profileToAutomationPolicy(finalProfile, tenantId, createdByUserId);

  // Insert new policy (inactive by default)
  const [newPolicy] = await db.insert(automationPolicies).values(policyData);

  // Log policy creation
  await db.insert(auditTrail).values({
    claimId: null, // Policy creation is tenant-level
    userId: createdByUserId,
    action: "POLICY_CREATED",
    entityType: "automation_policy",
    entityId: newPolicy.insertId,
    previousValue: null,
    newValue: JSON.stringify(policyData),
    changeDescription: `Created new automation policy from ${finalProfile.profileType} profile`,
    ipAddress: null,
    userAgent: null,
  });

  return newPolicy.insertId;
}

/**
 * Activate a policy (deactivates all other policies for tenant)
 * Only insurer_admin and executive can activate policies
 */
export async function activatePolicy(
  policyId: number,
  tenantId: string,
  activatedByUserId: number
): Promise<void> {
  const db = await getDb();

  // Get policy to activate
  const [policyToActivate] = await db
    .select()
    .from(automationPolicies)
    .where(
      and(
        eq(automationPolicies.id, policyId),
        eq(automationPolicies.tenantId, tenantId)
      )
    )
    .limit(1);

  if (!policyToActivate) {
    throw new Error(`Policy ${policyId} not found for tenant ${tenantId}`);
  }

  // Get currently active policy (if any)
  const [currentActivePolicy] = await db
    .select()
    .from(automationPolicies)
    .where(
      and(
        eq(automationPolicies.tenantId, tenantId),
        eq(automationPolicies.isActive, true)
      )
    )
    .limit(1);

  const now = new Date();

  // Deactivate current active policy
  if (currentActivePolicy) {
    await db
      .update(automationPolicies)
      .set({
        isActive: false,
        effectiveUntil: now,
      })
      .where(eq(automationPolicies.id, currentActivePolicy.id));

    // Log policy deactivation
    await db.insert(auditTrail).values({
      claimId: null,
      userId: activatedByUserId,
      action: "POLICY_DEACTIVATED",
      entityType: "automation_policy",
      entityId: currentActivePolicy.id,
      previousValue: JSON.stringify({ isActive: true }),
      newValue: JSON.stringify({ isActive: false, effectiveUntil: now }),
      changeDescription: `Deactivated policy ${currentActivePolicy.policyName} (version ${currentActivePolicy.version})`,
      ipAddress: null,
      userAgent: null,
    });
  }

  // Activate new policy
  await db
    .update(automationPolicies)
    .set({
      isActive: true,
      effectiveFrom: now,
      effectiveUntil: null,
    })
    .where(eq(automationPolicies.id, policyId));

  // Log policy activation
  await db.insert(auditTrail).values({
    claimId: null,
    userId: activatedByUserId,
    action: "POLICY_ACTIVATED",
    entityType: "automation_policy",
    entityId: policyId,
    previousValue: JSON.stringify({ isActive: false }),
    newValue: JSON.stringify({ isActive: true, effectiveFrom: now }),
    changeDescription: `Activated policy ${policyToActivate.policyName} (version ${policyToActivate.version})`,
    ipAddress: null,
    userAgent: null,
  });
}

/**
 * Get active policy for tenant
 */
export async function getActivePolicy(tenantId: string) {
  const db = await getDb();

  const [activePolicy] = await db
    .select()
    .from(automationPolicies)
    .where(
      and(
        eq(automationPolicies.tenantId, tenantId),
        eq(automationPolicies.isActive, true)
      )
    )
    .limit(1);

  return activePolicy || null;
}

/**
 * Get all policies for tenant (active and inactive)
 */
export async function getAllPolicies(tenantId: string) {
  const db = await getDb();

  const policies = await db
    .select()
    .from(automationPolicies)
    .where(eq(automationPolicies.tenantId, tenantId))
    .orderBy(automationPolicies.createdAt);

  return policies;
}

/**
 * Update policy (creates new version via policy versioning system)
 * Only insurer_admin and executive can update policies
 */
export async function updatePolicy(
  policyId: number,
  tenantId: string,
  updatedPolicyData: Partial<PolicyProfileTemplate>,
  updatedByUserId: number
): Promise<number> {
  // Use existing policy versioning system
  const newPolicyVersionId = await createPolicyVersion(
    tenantId,
    updatedPolicyData,
    updatedByUserId
  );

  return newPolicyVersionId;
}

/**
 * Delete policy (soft delete - mark as inactive)
 * Historical policies cannot be deleted for audit compliance
 */
export async function deletePolicy(
  policyId: number,
  tenantId: string,
  deletedByUserId: number
): Promise<void> {
  const db = await getDb();

  // Get policy to delete
  const [policyToDelete] = await db
    .select()
    .from(automationPolicies)
    .where(
      and(
        eq(automationPolicies.id, policyId),
        eq(automationPolicies.tenantId, tenantId)
      )
    )
    .limit(1);

  if (!policyToDelete) {
    throw new Error(`Policy ${policyId} not found for tenant ${tenantId}`);
  }

  // Prevent deletion of active policy
  if (policyToDelete.isActive) {
    throw new Error("Cannot delete active policy. Deactivate it first.");
  }

  // Prevent deletion of historical policies (policies that were once active)
  if (policyToDelete.effectiveUntil) {
    throw new Error("Cannot delete historical policy. Historical policies are immutable for audit compliance.");
  }

  // Soft delete (mark as inactive)
  await db
    .update(automationPolicies)
    .set({
      isActive: false,
      effectiveUntil: new Date(),
    })
    .where(eq(automationPolicies.id, policyId));

  // Log policy deletion
  await db.insert(auditTrail).values({
    claimId: null,
    userId: deletedByUserId,
    action: "POLICY_DELETED",
    entityType: "automation_policy",
    entityId: policyId,
    previousValue: JSON.stringify(policyToDelete),
    newValue: JSON.stringify({ isActive: false, effectiveUntil: new Date() }),
    changeDescription: `Deleted policy ${policyToDelete.policyName} (version ${policyToDelete.version})`,
    ipAddress: null,
    userAgent: null,
  });
}
