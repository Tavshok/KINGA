/**
 * KINGA Reporting tRPC Router
 * 
 * Handles report generation, job status polling, download tracking,
 * admin-assisted pipeline regeneration, and report scheduling.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { enqueueReport, getJobStatus, recordDownload, getUserJobs } from "../reporting/reportQueue";
import { REPORT_ACCESS } from "../reporting/reportDefinitions";
import mysql from "mysql2/promise";

const DB_URL = process.env.DATABASE_URL!;
async function getConn() { return mysql.createConnection(DB_URL); }

// ─── Permission Check ─────────────────────────────────────────────────────────
function canAccessReport(reportKey: string, userRole: string): boolean {
  const allowed = REPORT_ACCESS[reportKey];
  if (!allowed) return false;
  return allowed.includes(userRole) || allowed.includes("admin");
}

// ─── Admin-only guard ─────────────────────────────────────────────────────────
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  }
  return next({ ctx });
});

// ─── Report catalogue definition ─────────────────────────────────────────────
const REPORT_CATALOGUE = [
  // Phase 2a — Individual Claim
  { key: "claim.assessment",      name: "AI Assessment Report",          category: "Individual Claim", description: "Full AI assessment output including fraud score, cost analysis, and recommendation.", requiresClaimId: true },
  { key: "claim.forensic",        name: "Forensic Analysis Report",      category: "Individual Claim", description: "Physics analysis, fraud indicators, narrative consistency, and forensic audit validation.", requiresClaimId: true },
  { key: "claim.audit_trail",     name: "Claim Decision Audit Trail",    category: "Individual Claim", description: "Immutable log of all workflow events and AI assessment history for a claim.", requiresClaimId: true },
  { key: "claim.cost_comparison", name: "Cost Comparison Report",        category: "Individual Claim", description: "Component-level cost analysis comparing submitted quote against AI benchmark.", requiresClaimId: true },
  { key: "claim.repair_decision", name: "Repair vs Replace Decision",    category: "Individual Claim", description: "Repair vs replace recommendation with vehicle valuation and scoring rationale.", requiresClaimId: true },
  // Phase 2b — Portfolio
  { key: "portfolio.claims_summary",          name: "Claims Portfolio Summary",         category: "Portfolio", description: "Aggregate claims statistics, approval rates, and value summary for a period.", requiresClaimId: false },
  { key: "portfolio.fraud_summary",           name: "Fraud Detection Summary",          category: "Portfolio", description: "Fraud risk distribution, high-risk claim breakdown, and savings analysis.", requiresClaimId: false },
  { key: "portfolio.assessor_performance",    name: "Assessor Performance Report",      category: "Portfolio", description: "Assessor routing patterns, cost reduction rates, and anomaly scores.", requiresClaimId: false },
  { key: "portfolio.panel_beater_performance",name: "Panel Beater Performance Report",  category: "Portfolio", description: "Panel beater quote accuracy, structural gap rates, and anomaly scores.", requiresClaimId: false },
  { key: "portfolio.dwell_time",              name: "Processing Dwell Time Report",     category: "Portfolio", description: "Average and maximum time claims spend in each workflow stage.", requiresClaimId: false },
  // Phase 2d — Executive / Governance
  { key: "executive.platform_dashboard",      name: "Platform Executive Dashboard",     category: "Executive", description: "Platform-wide summary across all insurers. Super-admin only.", requiresClaimId: false },
  { key: "governance.sar",                    name: "Subject Access Request Report",    category: "Governance", description: "All personal data held for a data subject. Required under POPIA/CDPA.", requiresClaimId: false },
  { key: "governance.regulatory_compliance",  name: "Regulatory Compliance Report",     category: "Governance", description: "Processing compliance summary and data protection obligation status.", requiresClaimId: false },
];

// ─── Allowed regeneration states ─────────────────────────────────────────────
const REGENERATABLE_STATES = [
  "intake_pending", "document_processing_failed", "assessment_failed", "in_review",
];

export const reportingRouter = router({

  // ── Get report catalogue (filtered by user role) ──────────────────────────
  getCatalogue: protectedProcedure.query(({ ctx }) => {
    const role = ctx.user.role ?? "claims_processor";
    return REPORT_CATALOGUE.filter((r) => canAccessReport(r.key, role));
  }),

  // ── Enqueue a report generation job ──────────────────────────────────────
  generate: protectedProcedure
    .input(z.object({
      reportKey:    z.string(),
      claimId:      z.number().optional(),
      tenantId:     z.string().optional(),
      fromTs:       z.number().optional(),
      toTs:         z.number().optional(),
      subjectId:    z.number().optional(),
      subjectType:  z.string().optional(),
      outputFormat: z.enum(["pdf", "excel"]).default("pdf"),
    }))
    .mutation(async ({ ctx, input }) => {
      const role = ctx.user.role ?? "claims_processor";
      if (!canAccessReport(input.reportKey, role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You do not have access to this report type." });
      }

      const params: Record<string, unknown> = {};
      if (input.claimId)    params.claimId    = input.claimId;
      if (input.tenantId)   params.tenantId   = input.tenantId;
      if (input.fromTs)     params.fromTs     = input.fromTs;
      if (input.toTs)       params.toTs       = input.toTs;
      if (input.subjectId)  params.subjectId  = input.subjectId;
      if (input.subjectType) params.subjectType = input.subjectType;

      const jobId = await enqueueReport({
        reportKey: input.reportKey,
        requestedByUserId: ctx.user.id,
        requestedByUserName: ctx.user.name ?? ctx.user.email ?? "Unknown",
        tenantId: input.tenantId ?? ctx.user.tenantId,
        parameters: params,
        outputFormat: input.outputFormat,
      });

      return { jobId };
    }),

  // ── Poll job status ────────────────────────────────────────────────────────
  getJobStatus: protectedProcedure
    .input(z.object({ jobId: z.string() }))
    .query(async ({ input }) => {
      const job = await getJobStatus(input.jobId);
      if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Report job not found." });
      return job;
    }),

  // ── Get user's recent jobs ─────────────────────────────────────────────────
  getMyJobs: protectedProcedure.query(async ({ ctx }) => {
    return getUserJobs(ctx.user.id, ctx.user.tenantId);
  }),

  // ── Record a download ─────────────────────────────────────────────────────
  recordDownload: protectedProcedure
    .input(z.object({ jobId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await recordDownload(input.jobId, ctx.user.id);
      return { ok: true };
    }),

  // ── Admin: get all recent jobs (any user) ─────────────────────────────────
  adminGetAllJobs: adminProcedure
    .input(z.object({
      tenantId: z.string().optional(),
      limit: z.number().min(1).max(200).default(100),
    }))
    .query(async ({ input }) => {
      const conn = await getConn();
      try {
        const [rows] = await conn.execute(
          `SELECT job_id, report_key, status, output_format, requested_by_user_id,
                  tenant_id, download_count, error_message, started_at, completed_at,
                  file_size_bytes, page_count, created_at
           FROM report_jobs
           ${input.tenantId ? "WHERE tenant_id=?" : ""}
           ORDER BY created_at DESC LIMIT ?`,
          input.tenantId ? [input.tenantId, input.limit] : [input.limit]
        );
        return rows as Record<string, unknown>[];
      } finally {
        await conn.end();
      }
    }),

  // ── Admin: get scheduled reports ──────────────────────────────────────────
  getScheduledReports: protectedProcedure.query(async ({ ctx }) => {
    const role = ctx.user.role ?? "claims_processor";
    if (!["admin", "insurer_admin", "claims_manager"].includes(role)) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }
    const conn = await getConn();
    try {
      const [rows] = await conn.execute(
        `SELECT id, report_key, schedule_cron, schedule_label, is_active,
                tenant_id, delivery_emails, parameters, last_run_at, next_run_at,
                created_by_user_id, created_at
         FROM report_schedules
         WHERE tenant_id=? OR (tenant_id IS NULL AND ? = 'admin')
         ORDER BY created_at DESC`,
        [ctx.user.tenantId ?? null, role]
      );
      return rows as Record<string, unknown>[];
    } finally {
      await conn.end();
    }
  }),

  // ── Create a scheduled report ─────────────────────────────────────────────
  createSchedule: protectedProcedure
    .input(z.object({
      reportKey:      z.string(),
      scheduleLabel:  z.string(),
      scheduleCron:   z.string(),
      deliveryEmails: z.array(z.string().email()),
      parameters:     z.record(z.unknown()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const role = ctx.user.role ?? "claims_processor";
      if (!canAccessReport(input.reportKey, role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You do not have access to this report type." });
      }
      if (!["admin", "insurer_admin", "claims_manager"].includes(role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only managers and admins can schedule reports." });
      }
      const conn = await getConn();
      try {
        const now = Date.now();
        await conn.execute(
          `INSERT INTO report_schedules
             (report_key, schedule_cron, schedule_label, is_active, tenant_id,
              delivery_emails, parameters, created_by_user_id, created_at, updated_at)
           VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?)`,
          [
            input.reportKey, input.scheduleCron, input.scheduleLabel,
            ctx.user.tenantId ?? null,
            JSON.stringify(input.deliveryEmails),
            JSON.stringify(input.parameters ?? {}),
            ctx.user.id, now, now,
          ]
        );
        return { ok: true };
      } finally {
        await conn.end();
      }
    }),

  // ── Delete a scheduled report ──────────────────────────────────────────────
  deleteSchedule: protectedProcedure
    .input(z.object({ scheduleId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const role = ctx.user.role ?? "claims_processor";
      if (!(["admin", "insurer_admin", "claims_manager"] as string[]).includes(role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only managers and admins can delete schedules." });
      }
      const conn = await getConn();
      try {
        const [rows] = await conn.execute(
          `SELECT id, tenant_id FROM report_schedules WHERE id=? LIMIT 1`,
          [input.scheduleId]
        ) as [Record<string, unknown>[], unknown];
        const sched = rows[0];
        if (!sched) throw new TRPCError({ code: "NOT_FOUND", message: "Schedule not found." });
        // Non-admins can only delete their own tenant's schedules
        if (role !== "admin" && sched.tenant_id !== ctx.user.tenantId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "You can only delete schedules for your own tenant." });
        }
        await conn.execute(`DELETE FROM report_schedules WHERE id=?`, [input.scheduleId]);
        return { ok: true };
      } finally {
        await conn.end();
      }
    }),
  // ── Toggle a scheduled report active/inactive ────────────────────────────
  toggleSchedule: protectedProcedure
    .input(z.object({ scheduleId: z.number(), isActive: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const role = ctx.user.role ?? "claims_processor";
      if (!(["admin", "insurer_admin", "claims_manager"] as string[]).includes(role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only managers and admins can modify schedules." });
      }
      const conn = await getConn();
      try {
        const [rows] = await conn.execute(
          `SELECT id, tenant_id FROM report_schedules WHERE id=? LIMIT 1`,
          [input.scheduleId]
        ) as [Record<string, unknown>[], unknown];
        const sched = rows[0];
        if (!sched) throw new TRPCError({ code: "NOT_FOUND", message: "Schedule not found." });
        if (role !== "admin" && sched.tenant_id !== ctx.user.tenantId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "You can only modify schedules for your own tenant." });
        }
        await conn.execute(
          `UPDATE report_schedules SET is_active=?, updated_at=? WHERE id=?`,
          [input.isActive ? 1 : 0, Date.now(), input.scheduleId]
        );
        return { ok: true };
      } finally {
        await conn.end();
      }
    }),
  // ── Admin: trigger pipeline re-run for a claim ────────────────────────────
  adminRegeneratePipeline: adminProcedure
    .input(z.object({
      claimId: z.number(),
      reason:  z.string().min(10, "Please provide a reason of at least 10 characters."),
    }))
    .mutation(async ({ ctx, input }) => {
      const conn = await getConn();
      try {
        // 1. Check claim exists and is in a regeneratable state
        const [claims] = await conn.execute(
          `SELECT id, psm_status, claim_reference, document_processing_status FROM claims WHERE id=? LIMIT 1`,
          [input.claimId]
        ) as [Record<string, unknown>[], unknown];

        const claim = claims[0];
        if (!claim) throw new TRPCError({ code: "NOT_FOUND", message: "Claim not found." });

        const currentState = String(claim.psm_status ?? "");
        if (!REGENERATABLE_STATES.includes(currentState)) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: `Cannot regenerate pipeline for a claim in state '${currentState}'. ` +
              `Only claims in these states can be regenerated: ${REGENERATABLE_STATES.join(", ")}.`,
          });
        }

        // 2. Write admin regeneration audit record
        const now = Date.now();
        await conn.execute(
          `INSERT INTO admin_pipeline_regenerations
             (claim_id, requested_by_user_id, requested_by_user_name, reason,
              previous_status, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`,
          [
            input.claimId, ctx.user.id,
            ctx.user.name ?? ctx.user.email ?? "Admin",
            input.reason, currentState, now, now,
          ]
        );

        // 3. Reset claim to intake_pending so the pipeline can run
        await conn.execute(
          `UPDATE claims SET
             psm_status='intake_pending',
             document_processing_status='pending',
             ai_assessment_triggered=0,
             ai_assessment_started_at=NULL,
             ai_assessment_completed_at=NULL,
             updated_at=?
           WHERE id=?`,
          [now, input.claimId]
        );

        // 4. Write audit log entry
        await conn.execute(
          `INSERT INTO report_audit_log
             (action, job_id, tenant_id, performed_by_user_id, performed_by_user_name,
              parameters, created_at)
           VALUES ('admin_pipeline_regen', NULL, NULL, ?, ?, ?, ?)`,
          [
            ctx.user.id,
            ctx.user.name ?? ctx.user.email ?? "Admin",
            JSON.stringify({ claimId: input.claimId, reason: input.reason, previousState: currentState }),
            now,
          ]
        );

        return {
          ok: true,
          message: `Claim ${claim.claim_reference ?? input.claimId} has been reset to intake_pending. The pipeline will trigger automatically on the next processing cycle.`,
          claimReference: claim.claim_reference,
        };
      } finally {
        await conn.end();
      }
    }),

  // ── Admin: get regeneration history ──────────────────────────────────────
  adminGetRegenerationHistory: adminProcedure
    .input(z.object({ claimId: z.number().optional(), limit: z.number().default(50) }))
    .query(async ({ input }) => {
      const conn = await getConn();
      try {
        const [rows] = await conn.execute(
          `SELECT r.*, c.claim_reference
           FROM admin_pipeline_regenerations r
           LEFT JOIN claims c ON c.id = r.claim_id
           ${input.claimId ? "WHERE r.claim_id=?" : ""}
           ORDER BY r.created_at DESC LIMIT ?`,
          input.claimId ? [input.claimId, input.limit] : [input.limit]
        );
        return rows as Record<string, unknown>[];
      } finally {
        await conn.end();
      }
    }),
});
