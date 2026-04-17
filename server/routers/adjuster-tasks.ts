/**
 * adjuster-tasks.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * tRPC router for the Adjuster Workflow Integration panel.
 *
 * Provides:
 *   adjusterTasks.getByClaim   — list tasks for a claim
 *   adjusterTasks.create       — create a new task (AI pipeline or manual)
 *   adjusterTasks.resolve      — mark a task as resolved / dismissed
 *   adjusterTasks.syncFromPipeline — auto-generate tasks from forensic analysis
 */

import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";

// ── Types ─────────────────────────────────────────────────────────────────────

const TaskPriority = z.enum(["low", "medium", "high", "critical"]);
const TaskStatus   = z.enum(["open", "in_progress", "resolved", "dismissed"]);

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Derive actionable adjuster tasks from a forensic analysis JSON blob.
 * Returns an array of task objects ready to be inserted.
 */
function deriveTasksFromForensicAnalysis(
  claimId: number,
  fa: any
): Array<{
  claim_id: number;
  task_type: string;
  title: string;
  description: string;
  priority: "low" | "medium" | "high" | "critical";
  source: string;
}> {
  const tasks: ReturnType<typeof deriveTasksFromForensicAnalysis> = [];

  if (!fa) return tasks;

  // ── Integrity gate blockers → critical tasks ──────────────────────────────
  const gate = fa.integrityGate;
  if (gate?.status === "BLOCKED") {
    for (const blocker of gate.blockers ?? []) {
      tasks.push({
        claim_id: claimId,
        task_type: "integrity_blocker",
        title: `Integrity Blocker: ${blocker.code ?? blocker.reason ?? "Unknown"}`,
        description: blocker.detail ?? blocker.reason ?? "Pipeline integrity gate blocked this claim. Manual review required.",
        priority: "critical",
        source: "ai_pipeline",
      });
    }
  }

  // ── Integrity gate warnings → high tasks ─────────────────────────────────
  if (gate?.status === "WARNINGS") {
    for (const warning of gate.warnings ?? []) {
      tasks.push({
        claim_id: claimId,
        task_type: "integrity_warning",
        title: `Integrity Warning: ${warning.code ?? warning.reason ?? "Unknown"}`,
        description: warning.detail ?? warning.reason ?? "Review flagged integrity issue.",
        priority: "high",
        source: "ai_pipeline",
      });
    }
  }

  // ── High fraud score → escalation task ───────────────────────────────────
  const fraudScore = fa.fraudRiskScore ?? 0;
  if (fraudScore >= 70) {
    tasks.push({
      claim_id: claimId,
      task_type: "fraud_escalation",
      title: `High Fraud Risk — Score ${fraudScore}`,
      description: `Fraud risk score of ${fraudScore} exceeds the escalation threshold. Initiate SIU referral and obtain additional evidence.`,
      priority: fraudScore >= 85 ? "critical" : "high",
      source: "ai_pipeline",
    });
  }

  // ── Missing evidence from scenario checklist ──────────────────────────────
  const completenessCheck = fa.evidenceRegistry?.completeness_check;
  if (completenessCheck?.missing_documents?.length > 0) {
    const missing: string[] = completenessCheck.missing_documents;
    tasks.push({
      claim_id: claimId,
      task_type: "missing_evidence",
      title: `Obtain Missing Evidence (${missing.length} item${missing.length > 1 ? "s" : ""})`,
      description: `The following documents are required but not yet received: ${missing.join(", ")}. Contact the claimant or relevant parties to obtain these before finalising the decision.`,
      priority: "high",
      source: "ai_pipeline",
    });
  }

  // ── Physics violation → technical review task ─────────────────────────────
  const physicsViolations: any[] = fa.physicsViolations ?? [];
  if (physicsViolations.length > 0) {
    tasks.push({
      claim_id: claimId,
      task_type: "physics_violation",
      title: `Physics Inconsistency Detected (${physicsViolations.length} violation${physicsViolations.length > 1 ? "s" : ""})`,
      description: physicsViolations.map((v: any) => v.description ?? v.code ?? String(v)).join("; "),
      priority: "high",
      source: "ai_pipeline",
    });
  }

  // ── Cost outlier → financial review task ─────────────────────────────────
  const costDecision = fa.costDecision;
  if (costDecision?.outlierFlag || costDecision?.requiresManualReview) {
    tasks.push({
      claim_id: claimId,
      task_type: "cost_review",
      title: "Repair Cost Requires Financial Review",
      description: costDecision?.outlierReason ?? "Estimated repair cost is outside expected range. Verify repair quotation against market benchmarks.",
      priority: "medium",
      source: "ai_pipeline",
    });
  }

  // ── Mandatory assessor review ─────────────────────────────────────────────
  const decision = fa.decisionAuthority;
  if (decision?.requiresManualReview) {
    tasks.push({
      claim_id: claimId,
      task_type: "manual_review_required",
      title: "Mandatory Assessor Review",
      description: (decision.reviewReasons ?? []).join("; ") || "This claim has been flagged for mandatory assessor review.",
      priority: "high",
      source: "ai_pipeline",
    });
  }

  return tasks;
}

// ── Router ────────────────────────────────────────────────────────────────────

export const adjusterTasksRouter = router({

  /**
   * List all tasks for a given claim.
   */
  getByClaim: protectedProcedure
    .input(z.object({ claimId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const [rows] = await db.execute(
        `SELECT * FROM adjuster_tasks WHERE claim_id = ? ORDER BY
          FIELD(priority,'critical','high','medium','low'),
          FIELD(status,'open','in_progress','resolved','dismissed'),
          created_at DESC`,
        [input.claimId]
      ) as any[];
      return (rows as any[]).map((r: any) => ({
        id:             r.id,
        claimId:        r.claim_id,
        taskType:       r.task_type,
        title:          r.title,
        description:    r.description,
        priority:       r.priority,
        status:         r.status,
        source:         r.source,
        assignedTo:     r.assigned_to,
        resolvedBy:     r.resolved_by,
        resolvedAt:     r.resolved_at ? new Date(r.resolved_at).toISOString() : null,
        resolutionNote: r.resolution_note,
        createdAt:      new Date(r.created_at).toISOString(),
        updatedAt:      new Date(r.updated_at).toISOString(),
      }));
    }),

  /**
   * Create a manual task for a claim.
   */
  create: protectedProcedure
    .input(z.object({
      claimId:     z.number(),
      taskType:    z.string().min(1).max(80),
      title:       z.string().min(1).max(255),
      description: z.string().optional(),
      priority:    TaskPriority.default("medium"),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db.execute(
        `INSERT INTO adjuster_tasks (claim_id, task_type, title, description, priority, source, assigned_to)
         VALUES (?, ?, ?, ?, ?, 'manual', ?)`,
        [input.claimId, input.taskType, input.title, input.description ?? null, input.priority, (ctx.user as any).id]
      );
      return { success: true };
    }),

  /**
   * Resolve or dismiss a task.
   */
  resolve: protectedProcedure
    .input(z.object({
      taskId:         z.number(),
      status:         z.enum(["resolved", "dismissed"]),
      resolutionNote: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db.execute(
        `UPDATE adjuster_tasks
         SET status = ?, resolved_by = ?, resolved_at = NOW(), resolution_note = ?, updated_at = NOW()
         WHERE id = ?`,
        [input.status, (ctx.user as any).id, input.resolutionNote ?? null, input.taskId]
      );
      return { success: true };
    }),

  /**
   * Auto-generate tasks from the forensic analysis of a claim.
   * Idempotent: skips if AI-pipeline tasks already exist for this claim.
   */
  syncFromPipeline: protectedProcedure
    .input(z.object({
      claimId:          z.number(),
      forensicAnalysis: z.any(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { inserted: 0 };

      // Check if pipeline tasks already exist
      const [existing] = await db.execute(
        `SELECT COUNT(*) as cnt FROM adjuster_tasks WHERE claim_id = ? AND source = 'ai_pipeline'`,
        [input.claimId]
      ) as any[];
      const count = (existing as any[])[0]?.cnt ?? 0;
      if (count > 0) return { inserted: 0, skipped: true };

      const tasks = deriveTasksFromForensicAnalysis(input.claimId, input.forensicAnalysis);
      if (tasks.length === 0) return { inserted: 0 };

      for (const t of tasks) {
        await db.execute(
          `INSERT INTO adjuster_tasks (claim_id, task_type, title, description, priority, source)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [t.claim_id, t.task_type, t.title, t.description, t.priority, t.source]
        );
      }
      return { inserted: tasks.length };
    }),
});
