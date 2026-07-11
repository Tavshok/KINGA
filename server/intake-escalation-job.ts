// @ts-nocheck
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
 *
 * AUDIT-01 (2026-07-11): Redirected from auditTrail (wrong table/field vocabulary) to
 * isoAuditLogs. This is a system-triggered job (no human actor), so SYSTEM_USER_ID is
 * used for userId. integrityHash is generated per the ingestion-review-queue.ts pattern.
 */

import { getDb } from "./db";
import { claims, tenants, users } from "../drizzle/schema";
import { eq, and, lt, sql, inArray } from "drizzle-orm";
import { notifyOwner } from "./_core/notification";
import { findLowestWorkloadProcessor, type ProcessorWorkload } from "./workload-balancing";
import {
  createNotification,
  formatNotificationTitle,
  formatNotificationMessage,
} from "./notification-service";
import { insertIsoAuditLog, SYSTEM_USER_ID } from "./utils/audit-helpers";

// Processor selection logic moved to workload-balancing.ts service module

/**
 * Auto-assign a claim to a processor (auto_assign mode)
 */
async function autoAssignClaim(
  claim: any,
  processor: ProcessorWorkload,
  thresholdHours: number
) {
  const hoursInQueue = Math.floor(
    (Date.now() - new Date(claim.createdAt).getTime()) / (1000 * 60 * 60)
  );

  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db
    .update(claims)
    .set({
      assignedProcessorId: processor.processorId,
      workflowState: "assigned",
      updatedAt: new Date(),
    })
    .where(eq(claims.id, claim.id));

  // AUDIT-01: isoAuditLogs — system-triggered compliance event (no human actor)
  await insertIsoAuditLog(db as any, {
    tenantId: claim.tenantId,
    userId: SYSTEM_USER_ID,
    userRole: "system",
    actionType: "update",
    resourceType: "claim",
    resourceId: claim.id.toString(),
    beforeState: JSON.stringify({ workflowState: "intake_queue" }),
    afterState: JSON.stringify({
      actionType: "INTAKE_AUTO_ASSIGN",
      workflowState: "assigned",
      assignedProcessorId: processor.processorId,
      assignedProcessorName: processor.processorName,
      hoursInQueue,
      escalationThreshold: thresholdHours,
      processorActiveClaims: processor.activeClaims,
      processorComplexClaims: processor.complexClaims,
      processorHighRiskClaims: processor.highRiskClaims,
      processorWeightedScore: processor.weightedScore,
      claimNumber: claim.claimNumber,
      estimatedValue: claim.estimatedClaimValue,
      reason: `Manager inactivity - auto-assigned after ${hoursInQueue} hours (threshold: ${thresholdHours} hours)`,
    }),
  });

  console.log(
    `[Intake Escalation] Auto-assigned claim ${claim.claimNumber} to processor ${processor.processorName} ` +
    `(weighted score: ${processor.weightedScore}, active: ${processor.activeClaims}, ` +
    `complex: ${processor.complexClaims}, high-risk: ${processor.highRiskClaims})`
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

  // AUDIT-01: isoAuditLogs — system-triggered compliance event (no state change)
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await insertIsoAuditLog(db as any, {
    tenantId: claim.tenantId,
    userId: SYSTEM_USER_ID,
    userRole: "system",
    actionType: "view",
    resourceType: "claim",
    resourceId: claim.id.toString(),
    beforeState: null,
    afterState: JSON.stringify({
      actionType: "INTAKE_ESCALATION",
      workflowState: "intake_queue",
      hoursInQueue,
      escalationThreshold: thresholdHours,
      claimNumber: claim.claimNumber,
      estimatedValue: claim.estimatedClaimValue,
      escalationMode: "escalate_only",
      reason: `Manager inactivity - escalated after ${hoursInQueue} hours (threshold: ${thresholdHours} hours)`,
    }),
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

  if (!intakeEscalationEnabled) {
    console.log(`[Intake Escalation] Skipping tenant ${tenantName} (escalation disabled)`);
    return;
  }

  const thresholdHours = intakeEscalationHours || 6;
  const mode = intakeEscalationMode || "escalate_only";

  console.log(
    `[Intake Escalation] Processing tenant ${tenantName} (threshold: ${thresholdHours}h, mode: ${mode})`
  );

  const db = await getDb();
  if (!db) {
    console.error(`[Intake Escalation] Database not available for tenant ${tenantName}`);
    return;
  }
  
  const staleClaims = await db
    .select()
    .from(claims)
    .where(
      and(
        eq(claims.tenantId, tenantId),
        eq(claims.workflowState, "intake_queue"),
        sql`${claims.createdAt} < DATE_SUB(NOW(), INTERVAL ${thresholdHours} HOUR)`
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
    const processor = await findLowestWorkloadProcessor(tenantId);

    if (!processor) {
      console.error(
        `[Intake Escalation] No available processors for tenant ${tenantName} - cannot auto-assign`
      );
      for (const claim of staleClaims) {
        await escalateClaim(claim, thresholdHours);
      }
    } else {
      for (const claim of staleClaims) {
        await autoAssignClaim(claim, processor, thresholdHours);
      }

      try {
        const managerUsers = await db
          .select()
          .from(users)
          .where(
            and(
              eq(users.tenantId, tenant.id),
              inArray(users.insurerRole, ["claims_manager", "executive"])
            )
          );

        const recipientIds = managerUsers.map((u) => u.id);

        if (recipientIds.length > 0) {
          const context = {
            count: staleClaims.length,
            thresholdHours,
            processorName: processor.processorName,
            workloadScore: processor.weightedScore.toFixed(1),
            claimNumbers: staleClaims.map((c) => c.claimNumber).join(", "),
          };

          await createNotification(
            tenant.id,
            "auto_assignment",
            formatNotificationTitle("auto_assignment", context),
            formatNotificationMessage("auto_assignment", context),
            recipientIds,
            undefined,
            context
          );
        }

        await notifyOwner({
          title: `⚠️ Intake Queue Auto-Assignment Alert - ${tenantName}`,
          content: `${staleClaims.length} claim(s) were automatically assigned to processor "${processor.processorName}" due to manager inactivity.\n\nTenant: ${tenantName}\nEscalation Threshold: ${thresholdHours} hours\nProcessor Workload: ${processor.weightedScore.toFixed(1)} (active: ${processor.activeClaims}, complex: ${processor.complexClaims}, high-risk: ${processor.highRiskClaims})\nAuto-Assigned Claims: ${staleClaims.map((c) => c.claimNumber).join(", ")}\n\nPlease review the Claims Manager Dashboard for details.`,
        });
      } catch (error) {
        console.error("[Intake Escalation] Failed to send auto-assignment notification:", error);
      }
    }
  } else {
    for (const claim of staleClaims) {
      await escalateClaim(claim, thresholdHours);
    }

    try {
      const managerUsers = await db
        .select()
        .from(users)
        .where(
          and(
            eq(users.tenantId, tenant.id),
            inArray(users.insurerRole, ["claims_manager", "executive"])
          )
        );

      const recipientIds = managerUsers.map((u) => u.id);

      if (recipientIds.length > 0) {
        const context = {
          count: staleClaims.length,
          thresholdHours,
          claimNumbers: staleClaims.map((c) => c.claimNumber).join(", "),
        };

        await createNotification(
          tenant.id,
          "intake_escalation",
          formatNotificationTitle("intake_escalation", context),
          formatNotificationMessage("intake_escalation", context),
          recipientIds,
          undefined,
          context
        );
      }

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

    for (const tenant of activeTenants) {
      try {
        await processTenantEscalation(tenant);
      } catch (error) {
        console.error(
          `[Intake Escalation] Error processing tenant ${tenant.name}:`,
          error
        );
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

  const THIRTY_MINUTES = 30 * 60 * 1000;
  setInterval(() => {
    runIntakeEscalationJob();
  }, THIRTY_MINUTES);

  console.log("[Intake Escalation] Cron job initialized successfully");
}
