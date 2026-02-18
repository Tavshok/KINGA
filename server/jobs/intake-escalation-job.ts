/**
 * Intake Escalation Background Job
 * 
 * Prevents intake_queue stagnation by auto-assigning claims that have been
 * waiting longer than the tenant-configured threshold (default 24 hours).
 * 
 * Runs every 30 minutes via cron schedule.
 */

import { eq, and, lt, sql } from "drizzle-orm";
import { getDb } from "../db";
import { claims, tenants, users, auditTrail } from "../../drizzle/schema";
import { notifyOwner } from "../_core/notification";

interface ProcessorWorkload {
  userId: string;
  userName: string;
  assignedCount: number;
}

/**
 * Find the processor with the lowest current workload for a given tenant
 */
async function findLowestWorkloadProcessor(tenantId: string): Promise<string | null> {
  const db = getDb();
  
  // Get all claims_processor users for this tenant
  const processors = await db
    .select({
      id: users.id,
      name: users.name,
    })
    .from(users)
    .where(
      and(
        eq(users.tenantId, tenantId),
        eq(users.insurerRole, "claims_processor")
      )
    );
  
  if (processors.length === 0) {
    return null;
  }
  
  // Count assigned claims for each processor
  const workloads: ProcessorWorkload[] = [];
  
  for (const processor of processors) {
    const assignedClaims = await db
      .select({ count: sql<number>`count(*)` })
      .from(claims)
      .where(
        and(
          sql`${claims.assignedProcessorId} = ${String(processor.id)}`,
          eq(claims.workflowState, "assigned")
        )
      );
    
    workloads.push({
      userId: String(processor.id),
      userName: processor.name || "Unknown",
      assignedCount: Number(assignedClaims[0]?.count || 0),
    });
  }
  
  // Sort by workload (ascending) and return the processor with lowest workload
  workloads.sort((a, b) => a.assignedCount - b.assignedCount);
  
  return workloads[0]?.userId || null;
}

/**
 * Auto-assign a stale intake claim to the lowest workload processor
 */
async function autoAssignClaim(
  claimId: number,
  processorId: string,
  tenantId: string,
  hoursStale: number
): Promise<void> {
  const db = getDb();
  
  // Update claim status
  await db
    .update(claims)
    .set({
      workflowState: "assigned",
      assignedProcessorId: processorId,
      priority: "medium", // Default priority for auto-assigned claims
      updatedAt: new Date(),
    })
    .where(eq(claims.id, claimId));
  
  // Insert audit trail entry
  await db.insert(auditTrail).values({
    action: "INTAKE_AUTO_ASSIGN",
    userId: null, // System-triggered
    tenantId,
    claimId,
    metadata: JSON.stringify({
      reason: "Manager inactivity",
      triggeredAfterHours: hoursStale,
      assignedProcessorId: processorId,
      timestamp: new Date().toISOString(),
    }),
    createdAt: new Date(),
  });
}

/**
 * Process stale intake claims for a single tenant
 */
async function processTenantEscalation(tenant: {
  id: string;
  name: string;
  intakeEscalationHours: number | null;
}): Promise<number> {
  const db = getDb();
  const escalationHours = tenant.intakeEscalationHours || 24;
  const thresholdDate = new Date(Date.now() - escalationHours * 60 * 60 * 1000);
  
  // Find stale claims in intake_queue
  const staleClaims = await db
    .select({
      id: claims.id,
      claimNumber: claims.claimNumber,
      estimatedValue: claims.estimatedValue,
      createdAt: claims.createdAt,
    })
    .from(claims)
    .where(
      and(
        eq(claims.tenantId, tenant.id),
        eq(claims.workflowState, "intake_queue"),
        lt(claims.createdAt, thresholdDate)
      )
    );
  
  if (staleClaims.length === 0) {
    return 0;
  }
  
  // Find lowest workload processor
  const processorId = await findLowestWorkloadProcessor(tenant.id);
  
  if (!processorId) {
    console.error(`[Intake Escalation] No processors available for tenant ${tenant.id}`);
    return 0;
  }
  
  // Auto-assign all stale claims
  let assignedCount = 0;
  
  for (const claim of staleClaims) {
    const hoursStale = Math.floor(
      (Date.now() - new Date(claim.createdAt).getTime()) / (1000 * 60 * 60)
    );
    
    try {
      await autoAssignClaim(claim.id, processorId, tenant.id, hoursStale);
      assignedCount++;
    } catch (error) {
      console.error(`[Intake Escalation] Failed to auto-assign claim ${claim.id}:`, error);
    }
  }
  
  // Notify claims manager and executive
  if (assignedCount > 0) {
    try {
      await notifyOwner({
        title: `⚠️ ${assignedCount} Claims Auto-Assigned (${tenant.name})`,
        content: `${assignedCount} claims were automatically assigned to processors due to intake queue inactivity (threshold: ${escalationHours} hours).`,
      });
    } catch (error) {
      console.error("[Intake Escalation] Failed to send notification:", error);
    }
  }
  
  return assignedCount;
}

/**
 * Main escalation job - processes all active tenants
 */
export async function runIntakeEscalationJob(): Promise<void> {
  console.log("[Intake Escalation] Starting job...");
  
  const db = getDb();
  
  try {
    // Get all active tenants
    const activeTenants = await db
      .select({
        id: tenants.id,
        name: tenants.name,
        intakeEscalationHours: tenants.intakeEscalationHours,
      })
      .from(tenants)
      .where(eq(tenants.status, "active"));
    
    let totalAssigned = 0;
    
    // Process each tenant
    for (const tenant of activeTenants) {
      const assigned = await processTenantEscalation(tenant);
      totalAssigned += assigned;
      
      if (assigned > 0) {
        console.log(`[Intake Escalation] Tenant ${tenant.name}: ${assigned} claims auto-assigned`);
      }
    }
    
    console.log(`[Intake Escalation] Job complete. Total claims auto-assigned: ${totalAssigned}`);
  } catch (error) {
    console.error("[Intake Escalation] Job failed:", error);
  }
}

// Cron schedule: Run every 30 minutes
// Example integration with node-cron:
// import cron from 'node-cron';
// cron.schedule('*/30 * * * *', runIntakeEscalationJob);
