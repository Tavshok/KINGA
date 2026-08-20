/**
 * Multi-Layer Approval Workflow Router
 *
 * Handles the configurable, insurer-defined approval chain for claims.
 * Each insurer defines their own workflow template (ordered stages).
 * Claims progress through stages in order; each stage requires a user
 * with the matching insurerRole to act before the claim advances.
 *
 * Role keys (matching users.insurerRole enum):
 *   claims_processor | assessor_internal | risk_manager | claims_manager | executive
 *
 * External assessors are handled via the "external_received" decision type —
 * their work enters the system but they are not part of the internal chain.
 */

import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb, createNotification, getUsersByInsurerRoles } from "../db";
import { eq, desc, and, asc, isNull } from "drizzle-orm";
import {
  workflowTemplates,
  claimApprovals,
  claims,
  users,
  claimComments,
} from "../../drizzle/schema";
import {
  generateClaimNotification,
  type EventType,
} from "../pipeline-v2/claimsNotificationGenerator";
import { notifyOwner } from "../_core/notification";
import { isAdminRole } from "@shared/role-permissions";

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const WorkflowStageSchema = z.object({
  stage_order: z.number().int().min(1),
  stage_name: z.string().min(1),
  role_key: z.enum([
    "claims_processor",
    "assessor_internal",
    "external_assessor",
    "risk_manager",
    "claims_manager",
    "executive",
    "underwriter",
  ]),
  required: z.boolean().default(true),
  can_reject: z.boolean().default(true),
  can_request_info: z.boolean().default(true),
  notes_required: z.boolean().default(false),
  description: z.string().optional(),
});

type WorkflowStage = z.infer<typeof WorkflowStageSchema>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseStagesToJson(stages: WorkflowStage[]): string {
  return JSON.stringify(stages);
}

function parseStagesFromJson(json: string): WorkflowStage[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function requireApprovalTenant(ctx: { user?: { tenantId?: string | null } }): string {
  const tenantId = ctx.user?.tenantId;
  if (!tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "A tenant-scoped session is required" });
  return tenantId;
}

async function requireApprovalTenantClaim(
  drizzle: Awaited<ReturnType<typeof getDb>>,
  claimId: number,
  tenantId: string,
) {
  if (!drizzle || !tenantId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "A tenant-scoped session is required" });
  }
  const [claim] = await drizzle
    .select({ id: claims.id })
    .from(claims)
    .where(and(eq(claims.id, claimId), eq(claims.tenantId, tenantId)))
    .limit(1);
  if (!claim) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Claim not found or access denied" });
  }
  return claim;
}

/**
 * Get the active workflow template for a tenant.
 * Falls back to a sensible default if none is configured.
 */
async function getActiveTemplate(
  drizzle: Awaited<ReturnType<typeof getDb>>,
  tenantId: string
) {
  if (!drizzle) return null;
  const rows = await drizzle
    .select()
    .from(workflowTemplates)
    .where(
      and(
        eq(workflowTemplates.tenantId, tenantId),
        eq(workflowTemplates.isActive, 1),
        eq(workflowTemplates.isDefault, 1)
      )
    )
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Build the default 5-stage template stages for a new insurer.
 */
function buildDefaultStages(): WorkflowStage[] {
  return [
    {
      stage_order: 1,
      stage_name: "Claims Processor Review",
      role_key: "claims_processor",
      required: true,
      can_reject: false,
      can_request_info: true,
      notes_required: false,
      description:
        "Initial intake review — verify documents are complete and the claim is correctly categorised.",
    },
    {
      stage_order: 2,
      stage_name: "Internal Assessor Assessment",
      role_key: "assessor_internal",
      required: true,
      can_reject: true,
      can_request_info: true,
      notes_required: false,
      description:
        "Technical assessment of damage, cost estimate, and fraud indicators.",
    },
    {
      stage_order: 3,
      stage_name: "Risk Manager Sign-off",
      role_key: "risk_manager",
      required: true,
      can_reject: true,
      can_request_info: true,
      notes_required: false,
      description:
        "Risk review — validate that the claim falls within policy terms and risk appetite.",
    },
    {
      stage_order: 4,
      stage_name: "Claims Manager Approval",
      role_key: "claims_manager",
      required: true,
      can_reject: true,
      can_request_info: false,
      notes_required: false,
      description: "Final claims department approval before settlement.",
    },
    {
      stage_order: 5,
      stage_name: "Executive / GM Sign-off",
      role_key: "executive",
      required: false,
      can_reject: true,
      can_request_info: false,
      notes_required: true,
      description:
        "Required only for high-value or fraud-flagged claims. Optional for standard claims.",
    },
  ];
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const approvalRouter = router({
  // ── Workflow Template Management ──────────────────────────────────────────

  /**
   * getTemplates — list all workflow templates for the current tenant.
   */
  getTemplates: protectedProcedure.query(async ({ ctx }) => {
    const drizzle = await getDb();
    if (!drizzle) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    const tenantId = requireApprovalTenant(ctx);
    const rows = await drizzle
      .select()
      .from(workflowTemplates)
      .where(eq(workflowTemplates.tenantId, tenantId))
      .orderBy(desc(workflowTemplates.isDefault), asc(workflowTemplates.name));
    return rows.map((r) => ({
      ...r,
      stages: parseStagesFromJson(r.stagesJson),
    }));
  }),

  /**
   * getDefaultTemplate — get or create the default template for the tenant.
   */
  getDefaultTemplate: protectedProcedure.query(async ({ ctx }) => {
    const drizzle = await getDb();
    if (!drizzle) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    const tenantId = requireApprovalTenant(ctx);
    const existing = await getActiveTemplate(drizzle, tenantId);
    if (existing) {
      return { ...existing, stages: parseStagesFromJson(existing.stagesJson) };
    }
    // Return the built-in default without persisting
    return {
      id: null,
      tenantId,
      name: "Standard Claims Workflow",
      description: "Default 5-stage approval chain",
      stages: buildDefaultStages(),
      isDefault: 1,
      isActive: 1,
    };
  }),

  /**
   * createTemplate — create a new workflow template.
   * Requires claims_manager or executive role.
   */
  createTemplate: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(255),
        description: z.string().optional(),
        stages: z.array(WorkflowStageSchema).min(1).max(10),
        is_default: z.boolean().default(false),
        applies_to: z
          .object({
            min_claim_value: z.number().optional(),
            scenario_types: z.array(z.string()).optional(),
            escalation_routes: z.array(z.string()).optional(),
          })
          .optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const drizzle = await getDb();
      if (!drizzle) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const tenantId = requireApprovalTenant(ctx);
      const userRole = (ctx.user as { insurerRole?: string }).insurerRole ?? "";
      if (!["claims_manager", "executive"].includes(userRole) &&
          !isAdminRole((ctx.user as { role?: string }).role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only claims managers or executives can create workflow templates" });
      }
      // If setting as default, unset existing defaults first
      if (input.is_default) {
        await drizzle
          .update(workflowTemplates)
          .set({ isDefault: 0 })
          .where(eq(workflowTemplates.tenantId, tenantId));
      }
      // Sort stages by order before saving
      const sortedStages = [...input.stages].sort((a, b) => a.stage_order - b.stage_order);
      await drizzle.insert(workflowTemplates).values({
        tenantId,
        name: input.name,
        description: input.description ?? "",
        stagesJson: parseStagesToJson(sortedStages),
        appliesToJson: JSON.stringify(input.applies_to ?? {}),
        isDefault: input.is_default ? 1 : 0,
        isActive: 1,
        createdBy: typeof ctx.user.id === "number" ? ctx.user.id : parseInt(String(ctx.user.id), 10),
      });
      return { success: true };
    }),

  /**
   * updateTemplate — update an existing workflow template.
   */
  updateTemplate: protectedProcedure
    .input(
      z.object({
        template_id: z.number().int(),
        name: z.string().min(1).max(255).optional(),
        description: z.string().optional(),
        stages: z.array(WorkflowStageSchema).min(1).max(10).optional(),
        is_default: z.boolean().optional(),
        is_active: z.boolean().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const drizzle = await getDb();
      if (!drizzle) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const tenantId = requireApprovalTenant(ctx);
      const userRole = (ctx.user as { insurerRole?: string }).insurerRole ?? "";
      if (!["claims_manager", "executive"].includes(userRole) &&
          !isAdminRole((ctx.user as { role?: string }).role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only claims managers or executives can update workflow templates" });
      }
      const updateData: Record<string, unknown> = {};
      if (input.name !== undefined) updateData.name = input.name;
      if (input.description !== undefined) updateData.description = input.description;
      if (input.stages !== undefined) {
        const sorted = [...input.stages].sort((a, b) => a.stage_order - b.stage_order);
        updateData.stagesJson = parseStagesToJson(sorted);
      }
      if (input.is_default !== undefined) {
        if (input.is_default) {
          await drizzle
            .update(workflowTemplates)
            .set({ isDefault: 0 })
            .where(eq(workflowTemplates.tenantId, tenantId));
        }
        updateData.isDefault = input.is_default ? 1 : 0;
      }
      if (input.is_active !== undefined) updateData.isActive = input.is_active ? 1 : 0;
      // Build typed update object
      const typedUpdate: Partial<{
        name: string;
        description: string;
        stagesJson: string;
        isDefault: number;
        isActive: number;
      }> = {};
      if (updateData.name !== undefined) typedUpdate.name = updateData.name as string;
      if (updateData.description !== undefined) typedUpdate.description = updateData.description as string;
      if (updateData.stagesJson !== undefined) typedUpdate.stagesJson = updateData.stagesJson as string;
      if (updateData.isDefault !== undefined) typedUpdate.isDefault = updateData.isDefault as number;
      if (updateData.isActive !== undefined) typedUpdate.isActive = updateData.isActive as number;
      await drizzle
        .update(workflowTemplates)
        .set(typedUpdate)
        .where(
          and(
            eq(workflowTemplates.id, input.template_id),
            eq(workflowTemplates.tenantId, tenantId)
          )
        );
      return { success: true };
    }),

  // ── Claim Approval Actions ────────────────────────────────────────────────

  /**
   * getClaimApprovalStatus — get the current approval state for a claim.
   * Returns completed stages, current pending stage, and overall status.
   */
  getClaimApprovalStatus: protectedProcedure
    .input(z.object({ claim_id: z.number().int() }))
    .query(async ({ input, ctx }) => {
      const drizzle = await getDb();
      if (!drizzle) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const tenantId = requireApprovalTenant(ctx);

      // Get all approval records for this claim
      const approvalRows = await drizzle
        .select()
        .from(claimApprovals)
        .where(
          and(
            eq(claimApprovals.claimId, input.claim_id),
            eq(claimApprovals.tenantId, tenantId)
          )
        )
        .orderBy(asc(claimApprovals.stageOrder), asc(claimApprovals.actedAt));

      // Get the active template
      const template = await getActiveTemplate(drizzle, tenantId);
      const stages: WorkflowStage[] = template
        ? parseStagesFromJson(template.stagesJson)
        : buildDefaultStages();

      // Determine which stages are complete
      const completedStageOrders = new Set(
        approvalRows
          .filter((r) => r.decision === "approved" || r.decision === "external_received")
          .map((r) => r.stageOrder)
      );
      const rejectedStages = approvalRows.filter((r) => r.decision === "rejected");
      const returnedStages = approvalRows.filter((r) => r.decision === "returned");

      // Find the current pending stage
      const requiredStages = stages.filter((s) => s.required);
      const nextPendingStage = requiredStages.find(
        (s) => !completedStageOrders.has(s.stage_order)
      );

      // Overall status
      const isRejected = rejectedStages.length > 0;
      const allRequiredComplete = requiredStages.every((s) =>
        completedStageOrders.has(s.stage_order)
      );
      const isReturned = returnedStages.length > 0 && !isRejected;

      let overallStatus: "pending" | "in_progress" | "approved" | "rejected" | "returned";
      if (isRejected) overallStatus = "rejected";
      else if (allRequiredComplete) overallStatus = "approved";
      else if (isReturned) overallStatus = "returned";
      else if (approvalRows.length > 0) overallStatus = "in_progress";
      else overallStatus = "pending";

      return {
        claim_id: input.claim_id,
        overall_status: overallStatus,
        current_stage: nextPendingStage ?? null,
        completed_stages: stages.filter((s) =>
          completedStageOrders.has(s.stage_order)
        ),
        pending_stages: stages.filter(
          (s) => s.required && !completedStageOrders.has(s.stage_order)
        ),
        optional_stages: stages.filter((s) => !s.required),
        approval_history: approvalRows,
        template_name: template?.name ?? "Default Workflow",
        total_stages: stages.length,
        required_stages_count: requiredStages.length,
        completed_required_count: requiredStages.filter((s) =>
          completedStageOrders.has(s.stage_order)
        ).length,
      };
    }),

  /**
   * submitApprovalDecision — submit an approval, rejection, return, or escalation
   * for the current stage of a claim.
   *
   * The actor must have the insurerRole matching the current pending stage's role_key.
   */
  submitApprovalDecision: protectedProcedure
    .input(
      z.object({
        claim_id: z.number().int(),
        stage_order: z.number().int(),
        stage_name: z.string(),
        role_key: z.enum([
          "claims_processor",
          "assessor_internal",
          "external_assessor",
          "risk_manager",
          "claims_manager",
          "executive",
          "underwriter",
        ]),
        decision: z.enum(["approved", "rejected", "returned", "escalated", "external_received"]),
        notes: z.string().optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const drizzle = await getDb();
      if (!drizzle) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const tenantId = requireApprovalTenant(ctx);
      const userInsurerId = (ctx.user as { insurerRole?: string }).insurerRole ?? "";
      const userRole = (ctx.user as { role?: string }).role ?? "user";

      await requireApprovalTenantClaim(drizzle, input.claim_id, tenantId);

      // Validate that the actor has the right role for this stage
      // Admin can act on any stage; otherwise must match role_key
      if (!isAdminRole(userRole) && userInsurerId !== input.role_key) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `This stage requires role '${input.role_key}'. Your role is '${userInsurerId || "unassigned"}'.`,
        });
      }

      // Check for unresolved blocking annotations — only for 'approved' decisions
      // claims_manager and executive may override with a note
      if (input.decision === "approved") {
        const canOverride = ["claims_manager", "executive", "insurer_admin"].includes(userInsurerId);
        if (!canOverride) {
          const blockingAnnotations = await drizzle
            .select({ id: claimComments.id, sectionKey: claimComments.sectionKey, content: claimComments.content })
            .from(claimComments)
            .where(
              and(
                eq(claimComments.claimId, input.claim_id),
                eq(claimComments.blocksApproval, 1),
                eq(claimComments.isResolved, 0),
                isNull(claimComments.deletedAt)
              )
            )
            .limit(5);
          if (blockingAnnotations.length > 0) {
            const sections = [...new Set(blockingAnnotations.map((a) => a.sectionKey).filter(Boolean))];
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message: `Cannot approve: ${blockingAnnotations.length} unresolved blocking annotation(s) in section(s): ${sections.join(", ")}. Resolve them first, or escalate to claims manager.`,
            });
          }
        }
      }

      // Check this stage hasn't already been actioned
      const existing = await drizzle
        .select()
        .from(claimApprovals)
        .where(
          and(
            eq(claimApprovals.claimId, input.claim_id),
            eq(claimApprovals.stageOrder, input.stage_order),
            eq(claimApprovals.tenantId, tenantId)
          )
        )
        .limit(1);

      if (existing.length > 0 && existing[0].decision === "approved") {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Stage ${input.stage_order} (${input.stage_name}) has already been approved.`,
        });
      }

      // Insert the approval record
      await drizzle.insert(claimApprovals).values({
        claimId: input.claim_id,
        tenantId,
        stageOrder: input.stage_order,
        stageName: input.stage_name,
        roleKey: input.role_key,
        actorUserId: typeof ctx.user.id === "number" ? ctx.user.id : parseInt(String(ctx.user.id), 10),
        actorName: (ctx.user as { name?: string }).name ?? "Unknown",
        decision: input.decision,
        notes: input.notes ?? "",
        metadataJson: input.metadata ? JSON.stringify(input.metadata) : null,
      });

      // ── Generate and dispatch notification ──────────────────────────────────
      // Fetch claim vehicle context for richer notifications
      const claimRows = await drizzle
        .select({
          claimNumber: claims.claimNumber,
          vehicleMake: claims.vehicleMake,
          vehicleModel: claims.vehicleModel,
          vehicleYear: claims.vehicleYear,
          claimantId: claims.claimantId,
        })
        .from(claims)
        .where(and(eq(claims.id, input.claim_id), eq(claims.tenantId, tenantId)))
        .limit(1);

      const claimRow = claimRows[0] ?? null;

      // Map decision → event type
      const eventTypeMap: Record<string, EventType> = {
        approved: input.stage_order === 1 ? "STAGE_ADVANCE" : "APPROVE",
        rejected: "REJECT",
        returned: "RETURN_FOR_INFO",
        escalated: "ESCALATION",
        external_received: "STAGE_ADVANCE",
      };
      const eventType: EventType = eventTypeMap[input.decision] ?? "STAGE_ADVANCE";

      // Fire notification generation asynchronously — don't block the response
      void (async () => {
        try {
          const notification = await generateClaimNotification({
            event_type: eventType,
            claim_id: input.claim_id,
            claim_reference: claimRow?.claimNumber ?? `CLM-${input.claim_id}`,
            vehicle_year: claimRow?.vehicleYear ?? null,
            vehicle_make: claimRow?.vehicleMake ?? null,
            vehicle_model: claimRow?.vehicleModel ?? null,
            reason: input.notes ?? null,
            stage_name: input.stage_name,
            actor_name: (ctx.user as { name?: string }).name ?? null,
          });

          // Write to in-app notifications table for the claimant
          if (claimRow?.claimantId) {
            await createNotification({
              userId: claimRow.claimantId,
              tenantId,
              title: notification.title,
              message: notification.message,
              type: notification.notification_type,
              claimId: input.claim_id,
              entityType: "claim",
              entityId: input.claim_id,
              actionUrl: `/claims/${input.claim_id}`,
              priority: notification.priority,
            });
          }

          // Also notify the actor (adjuster/manager who made the decision)
          const actorId = typeof ctx.user.id === "number" ? ctx.user.id : parseInt(String(ctx.user.id), 10);
          if (actorId && actorId !== claimRow?.claimantId) {
            await createNotification({
              userId: actorId,
              tenantId,
              title: `Decision Recorded — ${notification.title}`,
              message: `Your decision on ${claimRow?.claimNumber ?? `Claim #${input.claim_id}`} has been saved: ${notification.message}`,
              type: notification.notification_type,
              claimId: input.claim_id,
              entityType: "claim",
              entityId: input.claim_id,
              actionUrl: `/insurer-portal/comparison/${input.claim_id}`,
              priority: "low",
            });
          }

          // ── Notify next-stage role when a stage is approved ──────────────────
          if (input.decision === "approved" || input.decision === "external_received") {
            // Re-fetch the template to find the next stage
            const tpl = await getActiveTemplate(drizzle, tenantId);
            const allStages: WorkflowStage[] = tpl
              ? parseStagesFromJson(tpl.stagesJson)
              : buildDefaultStages();
            const nextStage = allStages
              .filter((s) => s.required)
              .find((s) => s.stage_order === input.stage_order + 1);
            if (nextStage) {
              const nextRoleKey = nextStage.role_key;
              const nextRoleUsers = await drizzle
                .select({ id: users.id })
                .from(users)
                .where(and(eq(users.tenantId, tenantId), eq(users.insurerRole, nextRoleKey)));
              for (const nextUser of nextRoleUsers) {
                if (nextUser.id) {
                  await createNotification({
                    userId: nextUser.id,
                    tenantId,
                    title: `Claim Ready for Your Review — ${claimRow?.claimNumber ?? `#${input.claim_id}`}`,
                    message: `Stage ${input.stage_order} (${input.stage_name}) has been approved by ${(ctx.user as { name?: string }).name ?? "a colleague"}. The claim is now awaiting your action at Stage ${nextStage.stage_order}: "${nextStage.stage_name}".`,
                    type: "system_alert",
                    claimId: input.claim_id,
                    entityType: "claim",
                    entityId: input.claim_id,
                    actionUrl: `/insurer-portal/comparison/${input.claim_id}`,
                    priority: "medium",
                  });
                }
              }
            }
          }

          // Send owner alert for HIGH/URGENT priority events
          if (notification.priority === "high" || notification.priority === "urgent") {
            await notifyOwner({
              title: `[KINGA] ${notification.title}`,
              content: `${notification.message}\n\nClaim: ${claimRow?.claimNumber ?? input.claim_id} | Stage: ${input.stage_name} | Actor: ${(ctx.user as { name?: string }).name ?? "Unknown"}`,
            });
          }
        } catch (notifErr) {
          // Notification failure must never break the approval flow
          console.warn("[ApprovalRouter] Notification dispatch failed:", notifErr);
        }
      })();

      return {
        success: true,
        claim_id: input.claim_id,
        stage_order: input.stage_order,
        decision: input.decision,
        message:
          input.decision === "approved"
            ? `Stage ${input.stage_order} approved. Claim advances to next stage.`
            : input.decision === "rejected"
            ? `Claim rejected at stage ${input.stage_order}.`
            : input.decision === "returned"
            ? `Claim returned for revision at stage ${input.stage_order}.`
            : `Decision recorded for stage ${input.stage_order}.`,
      };
    }),

  /**
   * getApprovalHistory — full audit trail for a claim.
   */
  getApprovalHistory: protectedProcedure
    .input(z.object({ claim_id: z.number().int() }))
    .query(async ({ input, ctx }) => {
      const drizzle = await getDb();
      if (!drizzle) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const tenantId = requireApprovalTenant(ctx);
      const rows = await drizzle
        .select()
        .from(claimApprovals)
        .where(
          and(
            eq(claimApprovals.claimId, input.claim_id),
            eq(claimApprovals.tenantId, tenantId)
          )
        )
        .orderBy(asc(claimApprovals.stageOrder), asc(claimApprovals.actedAt));
      return rows;
    }),

  /**
   * getApprovalQueue — get all claims currently pending at a specific stage/role.
   * Used by the Escalation Queue admin page.
   */
  getApprovalQueue: protectedProcedure
    .input(
      z.object({
        role_key: z
          .enum([
            "claims_processor",
            "assessor_internal",
            "risk_manager",
            "claims_manager",
            "executive",
            "underwriter",
          ])
          .optional(),
        limit: z.number().int().min(1).max(200).default(50),
      })
    )
    .query(async ({ input, ctx }) => {
      const drizzle = await getDb();
      if (!drizzle) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const tenantId = requireApprovalTenant(ctx);

      // Get all approval records for this tenant
      const allApprovals = await drizzle
        .select()
        .from(claimApprovals)
        .where(eq(claimApprovals.tenantId, tenantId))
        .orderBy(desc(claimApprovals.actedAt));

      // Group by claim_id and find the latest stage per claim
      const claimMap = new Map<number, typeof allApprovals>();
      for (const row of allApprovals) {
        if (!claimMap.has(row.claimId)) claimMap.set(row.claimId, []);
        claimMap.get(row.claimId)!.push(row);
      }

      // Filter to claims where the latest action was "approved" (waiting for next stage)
      // or no action yet (pending first stage)
      const pendingClaimIds: number[] = [];
      for (const [claimId, rows] of claimMap.entries()) {
        const latestDecision = rows[rows.length - 1]?.decision;
        if (latestDecision === "approved" || latestDecision === "external_received") {
          pendingClaimIds.push(claimId);
        }
      }

      return {
        pending_claim_ids: pendingClaimIds.slice(0, input.limit),
        total_pending: pendingClaimIds.length,
        role_filter: input.role_key ?? "all",
      };
    }),

  /**
   * getWorkflowSummary — aggregate stats for the admin dashboard.
   */
  getWorkflowSummary: protectedProcedure.query(async ({ ctx }) => {
    const drizzle = await getDb();
    if (!drizzle) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    const tenantId = requireApprovalTenant(ctx);

    const allApprovals = await drizzle
      .select()
      .from(claimApprovals)
      .where(eq(claimApprovals.tenantId, tenantId))
      .orderBy(desc(claimApprovals.actedAt))
      .limit(1000);

    const decisionCounts: Record<string, number> = {};
    const stageCounts: Record<string, number> = {};
    const roleCounts: Record<string, number> = {};

    for (const row of allApprovals) {
      decisionCounts[row.decision] = (decisionCounts[row.decision] ?? 0) + 1;
      stageCounts[row.stageName] = (stageCounts[row.stageName] ?? 0) + 1;
      roleCounts[row.roleKey] = (roleCounts[row.roleKey] ?? 0) + 1;
    }

    const uniqueClaims = new Set(allApprovals.map((r) => r.claimId)).size;
    const approvedCount = decisionCounts["approved"] ?? 0;
    const rejectedCount = decisionCounts["rejected"] ?? 0;
    const returnedCount = decisionCounts["returned"] ?? 0;

    return {
      total_decisions: allApprovals.length,
      unique_claims_processed: uniqueClaims,
      approved_count: approvedCount,
      rejected_count: rejectedCount,
      returned_count: returnedCount,
      approval_rate_pct:
        allApprovals.length > 0
          ? Math.round((approvedCount / allApprovals.length) * 100)
          : 0,
      decision_breakdown: decisionCounts,
      stage_breakdown: stageCounts,
      role_breakdown: roleCounts,
      recent_activity: allApprovals.slice(0, 10),
    };
  }),
});
