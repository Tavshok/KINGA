/**
 * Intake Escalation Background Job
 * 
 * Runs every 30 minutes to detect and escalate stale claims in intake_queue.
 * Supports two modes:
 * - auto_assign: Automatically assigns claims to lowest workload processor
 * - escalate_only: Sends notifications without auto-assignment
 * 
 * Tenant-configurable via:
 * - intakeEscalationEnabled: Enable/disable escalation
 * - intakeEscalationHours: Threshold in hours (default 6)
 * - intakeEscalationMode: "auto_assign" or "escalate_only" (default "escalate_only")
 */

import { getDb } from "./db";
import { claims, tenants, users, auditTrail } from "../drizzle/schema";
import { eq, and, lt, sql, count } from "drizzle-orm";
import { notifyOwner } from "./_core/notification";

/**
 * Find the processor with the lowest current workload for a given tenant
 */
async function findLowestWorkloadProcessor(tenantId: string): Promise<{ id: string; name: string; workload: number } | null> {
  const db = await getDb();
  if (!db) return null;
  
  const processors = await db
    .select({
      id: users.id,
      name: users.name,
      openId: users.openId,
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

  // Calculate workload for each processor
  const processorsWithWorkload = await Promise.all(
    processors.map(async (processor) => {
      const db = await getDb();
      if (!db) return { id: processor.openId, name: processor.name || "Unknown Processor", workload: 0 };
      
      const workloadResult = await db
        .select({ count: count() })
        .from(claims)
        .where(
          and(
            eq(claims.tenantId, tenantId),
            eq(claims.assignedProcessorId, processor.openId),
            sql`${claims.workflowState} IN ('assigned', 'ai_assessment_pending', 'manual_review')`
          )
        );

      return {
        id: processor.openId,
        name: processor.name || "Unknown Processor",
        workload: workloadResult[0]?.count || 0,
      };
    })
  );

  // Sort by workload (ascending) and return the first
  processorsWithWorkload.sort((a, b) => a.workload - b.workload);
  return processorsWithWorkload[0];
}

/**
 * Auto-assign a claim to a processor (auto_assign mode)
 */
async function autoAssignClaim(
  claim: any,
  processorId: string,
  processorName: string,
  processorWorkload: number,
  thresholdHours: number
) {
  const hoursInQueue = Math.floor(
    (Date.now() - new Date(claim.createdAt).getTime()) / (1000 * 60 * 60)
  );

  // Update claim: assign processor and transition to "assigned" state
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db
    .update(claims)
    .set({
      assignedProcessorId: processorId,
      workflowState: "assigned",
      updatedAt: new Date(),
    })
    .where(eq(claims.id, claim.id));

  // Insert audit trail entry
  await db.insert(auditTrail).values({
    claimId: claim.id,
    tenantId: claim.tenantId,
    actionType: "INTAKE_AUTO_ASSIGN",
    actorId: "SYSTEM",
    actorRole: "system",
    previousState: "intake_queue",
    newState: "assigned",
    reason: `Manager inactivity - auto-assigned after ${hoursInQueue} hours (threshold: ${thresholdHours} hours)`,
    metadata: JSON.stringify({
      assignedProcessorId: processorId,
      assignedProcessorName: processorName,
      hoursInQueue,
      escalationThreshold: thresholdHours,
      processorWorkload,
      claimNumber: claim.claimNumber,
      estimatedValue: claim.estimatedClaimValue,
    }),
    timestamp: new Date(),
  });

  console.log(
    `[Intake Escalation] Auto-assigned claim ${claim.claimNumber} to processor ${processorName} (workload: ${processorWorkload})`
  );
}

/**
 * Escalate a claim without auto-assignment (escalate_only mode)
 */
async function escalateClaim(
  claim: any,
  thresholdHours: number
) {
  const hoursInQueue = Math.floor(
    (Date.now() - new Date(claim.createdAt).getTime()) / (1000 * 60 * 60)
  );

  // Insert audit trail entry (no state change)
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.insert(auditTrail).values({
    claimId: claim.id,
    tenantId: claim.tenantId,
    actionType: "INTAKE_ESCALATION",
    actorId: "SYSTEM",
    actorRole: "system",
    previousState: "intake_queue",
    newState: "intake_queue", // State remains unchanged
    reason: `Manager inactivity - escalated after ${hoursInQueue} hours (threshold: ${thresholdHours} hours)`,
    metadata: JSON.stringify({
      hoursInQueue,
      escalationThreshold: thresholdHours,
      claimNumber: claim.claimNumber,
      estimatedValue: claim.estimatedClaimValue,
      escalationMode: "escalate_only",
    }),
    timestamp: new Date(),
  });

  console.log(
    `[Intake Escalation] Escalated claim ${claim.claimNumber} (${hoursInQueue} hours in queue, threshold: ${thresholdHours})`
  );
}

/**
 * Process escalation for a single tenant
 */
async function processTenantEscalation(tenant: any) {
  const {
    id: tenantId,
    name: tenantName,
    intakeEscalationEnabled,
    intakeEscalationHours,
    intakeEscalationMode,
  } = tenant;

  // Skip if escalation is disabled
  if (!intakeEscalationEnabled) {
    console.log(`[Intake Escalation] Skipping tenant ${tenantName} (escalation disabled)`);
    return;
  }

  const thresholdHours = intakeEscalationHours || 6; // Default to 6 hours
  const mode = intakeEscalationMode || "escalate_only"; // Default to escalate_only

  console.log(
    `[Intake Escalation] Processing tenant ${tenantName} (threshold: ${thresholdHours}h, mode: ${mode})`
  );

  // Find stale claims in intake_queue
  const db = await getDb();
  if (!db) {
    console.error(`[Intake Escalation] Database not available for tenant ${tenantName}`);
    return;
  }
  
  const thresholdDate = new Date(Date.now() - thresholdHours * 60 * 60 * 1000);
  const staleClaims = await db
    .select()
    .from(claims)
    .where(
      and(
        eq(claims.tenantId, tenantId),
        eq(claims.workflowState, "intake_queue"),
        lt(claims.createdAt, thresholdDate)
      )
    );

  if (staleClaims.length === 0) {
    console.log(`[Intake Escalation] No stale claims found for tenant ${tenantName}`);
    return;
  }

  console.log(
    `[Intake Escalation] Found ${staleClaims.length} stale claim(s) for tenant ${tenantName}`
  );

  if (mode === "auto_assign") {
    // AUTO-ASSIGN MODE: Assign to lowest workload processor
    const processor = await findLowestWorkloadProcessor(tenantId);

    if (!processor) {
      console.error(
        `[Intake Escalation] No available processors for tenant ${tenantName} - cannot auto-assign`
      );
      // Fall back to escalate_only behavior
      for (const claim of staleClaims) {
        await escalateClaim(claim, thresholdHours);
      }
    } else {
      // Auto-assign all stale claims to the selected processor
      for (const claim of staleClaims) {
        await autoAssignClaim(
          claim,
          processor.id,
          processor.name,
          processor.workload,
          thresholdHours
        );
      }

      // Send notification about auto-assignments
      try {
        await notifyOwner({
          title: `⚠️ Intake Queue Auto-Assignment Alert - ${tenantName}`,
          content: `${staleClaims.length} claim(s) were automatically assigned to processor "${processor.name}" due to manager inactivity.\n\nTenant: ${tenantName}\nEscalation Threshold: ${thresholdHours} hours\nAuto-Assigned Claims: ${staleClaims.map((c) => c.claimNumber).join(", ")}\n\nPlease review the Claims Manager Dashboard for details.`,
        });
      } catch (error) {
        console.error("[Intake Escalation] Failed to send auto-assignment notification:", error);
      }
    }
  } else {
    // ESCALATE-ONLY MODE: Notify without auto-assignment
    for (const claim of staleClaims) {
      await escalateClaim(claim, thresholdHours);
    }

    // Send notification about escalated claims
    try {
      await notifyOwner({
        title: `⚠️ Intake Queue Escalation Alert - ${tenantName}`,
        content: `${staleClaims.length} claim(s) in the intake queue require immediate attention.\n\nTenant: ${tenantName}\nEscalation Threshold: ${thresholdHours} hours\nEscalated Claims: ${staleClaims.map((c) => c.claimNumber).join(", ")}\n\nThese claims have not been assigned to a processor. Please review the Claims Manager Dashboard and take action.`,
      });
    } catch (error) {
      console.error("[Intake Escalation] Failed to send escalation notification:", error);
    }
  }
}

/**
 * Main escalation job - processes all tenants
 */
export async function runIntakeEscalationJob() {
  console.log("[Intake Escalation] Starting escalation job...");

  try {
    // Fetch all active tenants with escalation configuration
    const db = await getDb();
    if (!db) {
      console.error("[Intake Escalation] Database not available");
      return;
    }
    
    const activeTenants = await db
      .select({
        id: tenants.id,
        name: tenants.name,
        intakeEscalationEnabled: tenants.intakeEscalationEnabled,
        intakeEscalationHours: tenants.intakeEscalationHours,
        intakeEscalationMode: tenants.intakeEscalationMode,
      })
      .from(tenants)
      .where(eq(tenants.status, "active"));

    console.log(`[Intake Escalation] Found ${activeTenants.length} active tenant(s)`);

    // Process each tenant independently
    for (const tenant of activeTenants) {
      try {
        await processTenantEscalation(tenant);
      } catch (error) {
        console.error(
          `[Intake Escalation] Error processing tenant ${tenant.name}:`,
          error
        );
        // Continue with next tenant
      }
    }

    console.log("[Intake Escalation] Escalation job completed successfully");
  } catch (error) {
    console.error("[Intake Escalation] Fatal error in escalation job:", error);
  }
}

/**
 * Start the cron job (runs every 30 minutes)
 */
export function startIntakeEscalationJob() {
  console.log("[Intake Escalation] Initializing cron job (every 30 minutes)...");

  // Run immediately on startup (for testing)
  // runIntakeEscalationJob();

  // Schedule to run every 30 minutes
  const THIRTY_MINUTES = 30 * 60 * 1000;
  setInterval(() => {
    runIntakeEscalationJob();
  }, THIRTY_MINUTES);

  console.log("[Intake Escalation] Cron job initialized successfully");
}
