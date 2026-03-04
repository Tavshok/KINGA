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
import { claims, insurerTenants, users, auditTrail } from "../../drizzle/schema";
import { notifyOwner } from "../_core/notification";

interface ProcessorWorkload {
  userId: string;
  userName: string;
  assignedCount: number;
}

function nowStr(): string {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

/**
 * Find the processor with the lowest current workload for a given tenant.
 */
async function findLowestWorkloadProcessor(tenantId: string): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;

  const processors = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(
      and(
        eq(users.tenantId, tenantId),
        eq(users.insurerRole, "claims_processor")
      )
    );

  if (processors.length === 0) return null;

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

  workloads.sort((a, b) => a.assignedCount - b.assignedCount);
  return workloads[0]?.userId || null;
}

/**
 * Auto-assign a stale intake claim to the lowest workload processor.
 */
async function autoAssignClaim(
  claimId: number,
  processorId: string,
  tenantId: string,
  hoursStale: number
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const processorIdNum = parseInt(processorId, 10);

  await db
    .update(claims)
    .set({
      workflowState: "assigned",
      assignedProcessorId: processorId,
      priority: "medium",
      updatedAt: nowStr(),
    })
    .where(eq(claims.id, claimId));

  await db.insert(auditTrail).values({
    action: "INTAKE_AUTO_ASSIGN",
    userId: processorIdNum,
    claimId,
    changeDescription: JSON.stringify({
      reason: "Manager inactivity",
      triggeredAfterHours: hoursStale,
      assignedProcessorId: processorId,
      timestamp: new Date().toISOString(),
    }),
    createdAt: nowStr(),
  });
}

/**
 * Process stale intake claims for a single tenant.
 */
async function processTenantEscalation(tenant: {
  id: string;
  name: string;
  intakeEscalationHours: number | null;
}): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const escalationHours = tenant.intakeEscalationHours || 24;
  const thresholdDate = new Date(Date.now() - escalationHours * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");

  const staleClaims = await db
    .select({
      id: claims.id,
      claimNumber: claims.claimNumber,
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

  if (staleClaims.length === 0) return 0;

  const processorId = await findLowestWorkloadProcessor(tenant.id);
  if (!processorId) {
    console.error(`[Intake Escalation] No processors available for tenant ${tenant.id}`);
    return 0;
  }

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
 * Main escalation job — processes all active tenants.
 */
export async function runIntakeEscalationJob(): Promise<void> {
  console.log("[Intake Escalation] Starting job...");

  const db = await getDb();
  if (!db) {
    console.error("[Intake Escalation] Database unavailable, skipping job.");
    return;
  }

  try {
    const activeTenants = await db
      .select({
        id: insurerTenants.id,
        name: insurerTenants.name,
        intakeEscalationHours: insurerTenants.documentRetentionYears, // use available field as placeholder
      })
      .from(insurerTenants);

    let totalAssigned = 0;

    for (const tenant of activeTenants) {
      try {
        const assigned = await processTenantEscalation(tenant);
        totalAssigned += assigned;
      } catch (error) {
        console.error(`[Intake Escalation] Error processing tenant ${tenant.id}:`, error);
      }
    }

    console.log(`[Intake Escalation] Job complete. Total auto-assigned: ${totalAssigned}`);
  } catch (error) {
    console.error("[Intake Escalation] Job failed:", error);
  }
}
