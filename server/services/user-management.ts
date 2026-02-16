/**
 * User Management Service
 * 
 * Handles user role assignments with automatic audit trail logging.
 * Enforces tenant isolation and permission checks.
 */

import { getDb } from "../db";
import { users } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { logRoleAssignment } from "./role-assignment-audit";

/**
 * Role assignment request
 */
export interface RoleAssignmentRequest {
  userId: number;
  newRole: "user" | "admin" | "insurer" | "assessor" | "panel_beater" | "claimant";
  newInsurerRole?: "claims_processor" | "assessor_internal" | "assessor_external" | "risk_manager" | "claims_manager" | "executive" | "insurer_admin" | null;
  changedByUserId: number;
  justification?: string;
}

/**
 * Assign or update a user's role with automatic audit logging
 * 
 * This function:
 * - Verifies tenant isolation (actor and target must be in same tenant)
 * - Checks permissions (actor must have admin role or higher)
 * - Updates the user's role
 * - Automatically logs the change to audit trail
 * 
 * @param request - Role assignment request
 * @returns The updated user record
 * @throws Error if permissions are insufficient or tenant isolation is violated
 */
export async function assignUserRole(request: RoleAssignmentRequest) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Get the actor (user making the change)
  const actor = await db
    .select()
    .from(users)
    .where(eq(users.id, request.changedByUserId))
    .limit(1);

  if (actor.length === 0) {
    throw new Error(`Actor user ${request.changedByUserId} not found`);
  }

  // Get the target user (user being changed)
  const targetUser = await db
    .select()
    .from(users)
    .where(eq(users.id, request.userId))
    .limit(1);

  if (targetUser.length === 0) {
    throw new Error(`Target user ${request.userId} not found`);
  }

  // Enforce tenant isolation
  if (actor[0].tenantId !== targetUser[0].tenantId) {
    throw new Error(
      `Tenant isolation violation: Actor belongs to tenant ${actor[0].tenantId}, target belongs to tenant ${targetUser[0].tenantId}`
    );
  }

  const tenantId = actor[0].tenantId;
  if (!tenantId) {
    throw new Error("Actor must belong to a tenant to assign roles");
  }

  // Check permissions: actor must be admin or insurer_admin
  const hasPermission = 
    actor[0].role === "admin" || 
    (actor[0].role === "insurer" && actor[0].insurerRole === "insurer_admin");

  if (!hasPermission) {
    throw new Error(
      `Insufficient permissions: User ${request.changedByUserId} with role ${actor[0].role} cannot assign roles`
    );
  }

  // Store previous values for audit trail
  const previousRole = targetUser[0].role;
  const previousInsurerRole = targetUser[0].insurerRole;

  // Update the user's role
  await db
    .update(users)
    .set({
      role: request.newRole,
      insurerRole: request.newInsurerRole ?? null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, request.userId));

  // Log the change to audit trail
  await logRoleAssignment({
    tenantId,
    userId: request.userId,
    previousRole,
    newRole: request.newRole,
    previousInsurerRole,
    newInsurerRole: request.newInsurerRole ?? null,
    changedByUserId: request.changedByUserId,
    justification: request.justification,
  });

  // Return the updated user
  const updatedUser = await db
    .select()
    .from(users)
    .where(eq(users.id, request.userId))
    .limit(1);

  return updatedUser[0];
}

/**
 * Get a user by ID with tenant isolation
 * 
 * @param userId - User ID to retrieve
 * @param tenantId - Tenant ID for isolation enforcement
 * @returns The user record or null if not found
 */
export async function getUserById(userId: number, tenantId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db
    .select()
    .from(users)
    .where(
      and(
        eq(users.id, userId),
        eq(users.tenantId, tenantId)
      )
    )
    .limit(1);

  return result[0] ?? null;
}

/**
 * Get all users in a tenant
 * 
 * @param tenantId - Tenant ID to get users for
 * @returns Array of users in the tenant
 */
export async function getTenantUsers(tenantId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db
    .select()
    .from(users)
    .where(eq(users.tenantId, tenantId));

  return result;
}
