/**
 * KINGA Reporting tRPC Router
 * 
 * Handles report generation, job status polling, download tracking,
 * admin-assisted pipeline regeneration, and report scheduling.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { enqueueReport, getAuthorisedReportObject, getJobStatus, recordDownload, getUserJobs } from "../reporting/reportQueue";
import { REPORT_ACCESS } from "../reporting/reportDefinitions";
import { isAdminRole } from "../../shared/role-permissions";
import { storageGet } from "../storage";
import {
  auditP0CrossTenantAccess,
  auditP0PlatformGlobalAccess,
  resolveP0TenantScope,
  validateP0TenantScope,
} from "../security/p0TenantBoundary";
import mysql from "mysql2/promise";

const DB_URL = process.env.DATABASE_URL!;
async function getConn() { return mysql.createConnection(DB_URL); }

async function assertClaimInTenant(claimId: number, tenantId: string): Promise<void> {
  const conn = await getConn();
  try {
    const [rows] = await conn.execute("SELECT id FROM claims WHERE id=? AND tenant_id=? LIMIT 1", [claimId, tenantId]);
    if (!(rows as Record<string, unknown>[])[0]) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Claim not found." });
    }
  } finally {
    await conn.end();
  }
}

// ─── Permission Check ───────────────────────────────────────────────────────
// For insurer users, access is determined by insurerRole (sub-role).
// For admin / platform users, access is determined by the top-level role.
// NOTE: Tier/subscription system not yet implemented — all insurer roles have
// access to all claim-level reports. Access is role-based only.
// insurerRole takes precedence over top-level role so that admin accounts
// with an insurer sub-role (e.g. the platform owner) can access insurer reports.
  export function canAccessReport(reportKey: string, userRole: string, insurerRole?: string | null): boolean {
  const allowed = REPORT_ACCESS[reportKey];
  if (!allowed) return false;
  // Platform super admin has unrestricted access to all reports
  if (isAdminRole(userRole) && !insurerRole) return true;
  // If the user has an insurer sub-role, use it for access checks regardless
  // of their top-level role (handles admin accounts with insurer sub-roles).
  if (insurerRole) return allowed.includes(insurerRole);
  // Platform admins without an insurerRole see only platform-admin-scoped reports
  if (isAdminRole(userRole)) return allowed.includes("admin");
  // Non-insurer roles (assessor, panel_beater) use top-level role
  return allowed.includes(userRole);
}

// ─── Admin-only guard ─────────────────────────────────────────────────────────
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!isAdminRole(ctx.user.role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  }
  return next({ ctx });
});

// ─── Report catalogue definition ─────────────────────────────────────────────
const REPORT_CATALOGUE = [
  // ── Claims Processor ───────────────────────────────────────────────────────────────
  { key: "claim.assessment",      name: "KINGA Assessment Report",       category: "Claim Reports",  description: "Full KINGA assessment output including fraud score, cost analysis, and recommendation.",                   requiresClaimId: true  },
  { key: "claim.cost_comparison", name: "Cost Comparison Report",     category: "Claim Reports",  description: "Component-level cost analysis comparing the submitted quote against the AI benchmark estimate.",       requiresClaimId: true  },
  { key: "claim.repair_decision", name: "Repair vs Replace Decision", category: "Claim Reports",  description: "Repair vs replace recommendation with vehicle valuation, repair-to-value ratio, and scoring rationale.", requiresClaimId: true  },
  // ── Claims Intelligence (new Process tier) ─────────────────────────────────────────
  { key: "claim.intelligence",               name: "Claims Intelligence Report",      category: "Claim Reports",  description: "Process-tier automated assessment: cost intelligence, risk indicators, evidence snapshot, and decision actions.",    requiresClaimId: true  },
  // ── Claims Manager ────────────────────────────────────────────────────────────────
  { key: "claim.forensic",                    name: "Forensic Claim Decision Report",         category: "Claim Reports",  description: "Physics analysis, fraud indicators, narrative consistency, and forensic audit validation.",        requiresClaimId: true  },
  { key: "claim.audit_trail",                 name: "Claim Decision Audit Trail",       category: "Claim Reports",  description: "Immutable log of all workflow events and KINGA assessment history for a single claim.",              requiresClaimId: true  },
  { key: "portfolio.claims_summary",          name: "Claims Portfolio Summary",         category: "Portfolio",      description: "Aggregate claims statistics, approval rates, and total value summary for a selected period.",     requiresClaimId: false },
  { key: "portfolio.dwell_time",              name: "Processing Dwell Time Report",     category: "Portfolio",      description: "Average and maximum time claims spend in each workflow stage, highlighting bottlenecks.",        requiresClaimId: false },
  { key: "portfolio.panel_beater_performance",name: "Panel Beater Performance Report",  category: "Portfolio",      description: "Panel beater quote accuracy, structural gap rates, and anomaly scores across the network.",       requiresClaimId: false },
  { key: "claims_manager.portfolio_overview", name: "Claims Manager Portfolio Report",   category: "Portfolio",      description: "Claims totals, processing state, value, and operational portfolio indicators.",                   requiresClaimId: false },
  // ── Risk Manager ──────────────────────────────────────────────────────────────────
  { key: "portfolio.fraud_summary",           name: "Fraud Detection Summary",          category: "Risk & Fraud",   description: "Fraud risk distribution, high-risk claim breakdown, physics-based violation counts, and savings.", requiresClaimId: false },
  { key: "portfolio.assessor_performance",    name: "Assessor Performance Report",      category: "Risk & Fraud",   description: "Assessor routing patterns, cost reduction rates, variance scores, and anomaly flags.",            requiresClaimId: false },
  { key: "risk_manager_portfolio",            name: "Risk Portfolio Overview",          category: "Risk & Fraud",   description: "Combined fraud and risk exposure summary for the insurer portfolio.",                             requiresClaimId: false },
  { key: "risk_manager.portfolio_overview",   name: "Risk Manager Portfolio Report",    category: "Risk & Fraud",   description: "Fraud risk, AI-estimated financial exposure, and risk portfolio indicators.",                     requiresClaimId: false },
  // ── Executive ────────────────────────────────────────────────────────────────────────
  { key: "executive.insurer_summary",         name: "Insurer Executive Summary",        category: "Executive",      description: "High-level KPI dashboard: claims volume, approval rate, fraud savings, and SLA compliance.",       requiresClaimId: false },
  { key: "executive.claims_trend",            name: "Claims Trend Report",              category: "Executive",      description: "Month-on-month claims volume and value trends with year-over-year comparison.",                  requiresClaimId: false },
  { key: "executive.financial_exposure",      name: "Financial Exposure Report",        category: "Executive",      description: "Outstanding claims exposure, reserve adequacy, and projected settlement costs.",                 requiresClaimId: false },
  // Platform super-admin only
  { key: "executive.platform_dashboard",      name: "Platform Executive Dashboard",     category: "Platform Admin", description: "Platform-wide summary across all insurers. Restricted to platform super-admins.",                requiresClaimId: false },
  { key: "executive.cross_insurer_fraud",     name: "Cross-Insurer Fraud Intelligence", category: "Platform Admin", description: "Fraud pattern analysis across all insurer tenants on the platform.",                             requiresClaimId: false },
  { key: "executive.ml_performance",          name: "ML Model Performance Report",      category: "Platform Admin", description: "AI pipeline accuracy, model drift, and assessment quality metrics across the platform.",          requiresClaimId: false },
  // ── Governance / Compliance ──────────────────────────────────────────────────────────
  { key: "governance.sar",                    name: "Subject Access Request Report",    category: "Governance",     description: "All personal data held for a data subject. Required under POPIA / CDPA.",                         requiresClaimId: false },
  { key: "governance.regulatory_compliance",  name: "Regulatory Compliance Report",     category: "Governance",     description: "Processing compliance summary and data protection obligation status.",                           requiresClaimId: false },
  { key: "governance.data_retention",         name: "Data Retention Audit Report",      category: "Governance",     description: "Records subject to retention or deletion obligations under applicable data protection law.",      requiresClaimId: false },
  // ── Assessor ───────────────────────────────────────────────────────────────────────────
  { key: "assessor.my_assignments",           name: "My Assessment Assignments",        category: "Assessor",       description: "List of all claims assigned to this assessor with status, findings, and completion dates.",       requiresClaimId: false },
  { key: "assessor.performance_summary",      name: "Assessor Performance Summary",     category: "Assessor",       description: "Personal performance metrics: assessments completed, average variance, and quality scores.",       requiresClaimId: false },
  // ── Panel Beater ──────────────────────────────────────────────────────────────────────
  { key: "panel_beater.quote_history",        name: "Quote History Report",             category: "Panel Beater",   description: "All quotes submitted by this panel beater, with acceptance rates and AI benchmark comparison.",    requiresClaimId: false },
  { key: "panel_beater.job_completion",       name: "Job Completion Report",            category: "Panel Beater",   description: "Completed repair jobs with timelines, final costs, and customer satisfaction scores.",             requiresClaimId: false },
  // ── KINGA Agency (Epic 4.5: D-8) ─────────────────────────────────────────────────────────────────────────────────────
  { key: "agency.vehicle_verification",       name: "Vehicle Verification Report",      category: "Agency",         description: "Full vehicle identity verification including VIN, registration, and ownership history.",          requiresClaimId: false },
  { key: "agency.vehicle_valuation",          name: "Vehicle Valuation Report",         category: "Agency",         description: "AI-driven market valuation with comparable sales, depreciation model, and condition assessment.",  requiresClaimId: false },
];

// ─── Allowed regeneration states ─────────────────────────────────────────────
const REGENERATABLE_STATES = [
  "intake_pending", "document_processing_failed", "assessment_failed", "in_review",
];

export const reportingRouter = router({

  // ── Get report catalogue (filtered by user role) ──────────────────────────
  getCatalogue: protectedProcedure.query(({ ctx }) => {
    const role = ctx.user.role ?? "claims_processor";
    const insurerRole = (ctx.user as any).insurerRole ?? null;
    return REPORT_CATALOGUE.filter((r) => canAccessReport(r.key, role, insurerRole));
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
      const insurerRole = (ctx.user as any).insurerRole ?? null;
      if (!canAccessReport(input.reportKey, role, insurerRole)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You do not have access to this report type." });
      }

      const scope = resolveP0TenantScope(ctx, input.tenantId, "reporting.generate");
      await validateP0TenantScope(scope);
      if (input.claimId) await assertClaimInTenant(input.claimId, scope.tenantId);
      await auditP0CrossTenantAccess(ctx, scope, "report_generate", input.claimId ? String(input.claimId) : input.reportKey, { reportKey: input.reportKey });

      const params: Record<string, unknown> = { tenantId: scope.tenantId };
      if (input.reportKey === "executive.platform_dashboard") {
        const reportActor = ctx.user;
        if (!reportActor || !isAdminRole(reportActor.role) || insurerRole) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Platform-super-admin authority is required for platform-global reporting." });
        }
        const actorRole = reportActor.role === "platform_super_admin" ? "platform_super_admin" : "admin";
        params.platformAggregateAuthority = {
          kind: "platform_global",
          auditTenantId: scope.tenantId,
          actorId: reportActor.id,
          actorRole,
        };
        await auditP0PlatformGlobalAccess(ctx, scope.tenantId, "report_generate", input.reportKey, {
          reportKey: input.reportKey,
        });
      }
      if (input.claimId)    params.claimId    = input.claimId;
      if (input.fromTs)     params.fromTs     = input.fromTs;
      if (input.toTs)       params.toTs       = input.toTs;
      if (input.subjectId)  params.subjectId  = input.subjectId;
      if (input.subjectType) params.subjectType = input.subjectType;

      const jobId = await enqueueReport({
        reportKey: input.reportKey,
        requestedByUserId: ctx.user.id,
        requestedByUserName: ctx.user.name ?? ctx.user.email ?? "Unknown",
        tenantId: scope.tenantId,
        parameters: params,
        outputFormat: input.outputFormat,
      });

      return { jobId };
    }),

  // ── Poll job status ────────────────────────────────────────────────────────
  getJobStatus: protectedProcedure
    .input(z.object({ jobId: z.string(), tenantId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const scope = resolveP0TenantScope(ctx, input.tenantId, "reporting.getJobStatus");
      await validateP0TenantScope(scope);
      const job = await getJobStatus(input.jobId, { tenantId: scope.tenantId, userId: ctx.user.id, isPlatformSuperAdmin: scope.isPlatformSuperAdmin });
      if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Report job not found." });
      await auditP0CrossTenantAccess(ctx, scope, "report_job_status", input.jobId);
      return job;
    }),

  // ── Get user's recent jobs ─────────────────────────────────────────────────
  getMyJobs: protectedProcedure
    .input(z.object({ tenantId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const scope = resolveP0TenantScope(ctx, input?.tenantId, "reporting.getMyJobs");
      await validateP0TenantScope(scope);
      await auditP0CrossTenantAccess(ctx, scope, "report_job_list", scope.tenantId);
      return getUserJobs({ tenantId: scope.tenantId, userId: ctx.user.id, isPlatformSuperAdmin: scope.isPlatformSuperAdmin });
    }),

  // ── Record a download ─────────────────────────────────────────────────────
  recordDownload: protectedProcedure
    .input(z.object({ jobId: z.string(), tenantId: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const scope = resolveP0TenantScope(ctx, input.tenantId, "reporting.recordDownload");
      await validateP0TenantScope(scope);
      const recorded = await recordDownload(input.jobId, { tenantId: scope.tenantId, userId: ctx.user.id, isPlatformSuperAdmin: scope.isPlatformSuperAdmin });
      if (!recorded) throw new TRPCError({ code: "NOT_FOUND", message: "Report job not found." });
      await auditP0CrossTenantAccess(ctx, scope, "report_download_record", input.jobId);
      return { ok: true };
    }),

  // A short-lived retrieval URL is issued only after an independent job ownership check.
  getDownloadUrl: protectedProcedure
    .input(z.object({ jobId: z.string(), tenantId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const scope = resolveP0TenantScope(ctx, input.tenantId, "reporting.getDownloadUrl");
      await validateP0TenantScope(scope);
      const job = await getAuthorisedReportObject(input.jobId, { tenantId: scope.tenantId, userId: ctx.user.id, isPlatformSuperAdmin: scope.isPlatformSuperAdmin });
      if (!job || job.status !== "completed" || typeof job.s3_key !== "string" || !job.s3_key) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Completed report output not found." });
      }
      const { url } = await storageGet(job.s3_key, 300);
      await auditP0CrossTenantAccess(ctx, scope, "report_download_url", input.jobId, { reportKey: job.report_key });
      return { url };
    }),

  // ── Admin: get all recent jobs (any user) ─────────────────────────────────
  adminGetAllJobs: adminProcedure
    .input(z.object({
      tenantId: z.string().optional(),
      limit: z.number().min(1).max(200).default(100),
    }))
    .query(async ({ ctx, input }) => {
      const scope = resolveP0TenantScope(ctx, input.tenantId, "reporting.adminGetAllJobs");
      await validateP0TenantScope(scope);
      const conn = await getConn();
      try {
        const [rows] = await conn.execute(
          `SELECT job_id, report_key, status, output_format, requested_by_user_id,
                  tenant_id, download_count, error_message, started_at, completed_at,
                  file_size_bytes, page_count, created_at
           FROM report_jobs WHERE tenant_id=?
           ORDER BY created_at DESC LIMIT ?`,
          [scope.tenantId, input.limit]
        );
        await auditP0CrossTenantAccess(ctx, scope, "report_admin_job_list", scope.tenantId);
        return rows as Record<string, unknown>[];
      } finally {
        await conn.end();
      }
    }),
  // ── Get scheduled reports ─────────────────────────────────────────────────────
  getScheduledReports: protectedProcedure
    .input(z.object({ tenantId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
    const topRole = ctx.user.role ?? "user";
    const insurerRole = (ctx.user as any).insurerRole ?? null;
    const effectiveRole = insurerRole ?? topRole;
    const canSchedule = isAdminRole(topRole) || ["insurer_admin", "claims_manager", "risk_manager", "executive"].includes(effectiveRole);
    if (!canSchedule) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }
    const scope = resolveP0TenantScope(ctx, input?.tenantId, "reporting.getScheduledReports");
    await validateP0TenantScope(scope);
    const conn = await getConn();
    try {
      const [rows] = await conn.execute(
        `SELECT id, report_key, schedule_cron, schedule_label, is_active,
                tenant_id, delivery_emails, parameters, last_run_at, next_run_at,
                created_by_user_id, created_at
         FROM report_schedules WHERE tenant_id=?
         ORDER BY created_at DESC`,
        [scope.tenantId]
      );
      await auditP0CrossTenantAccess(ctx, scope, "report_schedule_list", scope.tenantId);
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
      parameters:     z.record(z.string(), z.unknown()).optional(),
      tenantId:       z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const role = ctx.user.role ?? "claims_processor";
      const insurerRole = (ctx.user as any).insurerRole ?? null;
      const effectiveRole = insurerRole ?? role;
      if (!canAccessReport(input.reportKey, role, insurerRole)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You do not have access to this report type." });
      }
      if (!(isAdminRole(role) || (["insurer_admin", "claims_manager", "executive"] as string[]).includes(effectiveRole))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only managers and admins can schedule reports." });
      }
      const scope = resolveP0TenantScope(ctx, input.tenantId, "reporting.createSchedule");
      await validateP0TenantScope(scope);
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
            scope.tenantId,
            JSON.stringify(input.deliveryEmails),
            JSON.stringify(input.parameters ?? {}),
            ctx.user.id, now, now,
          ]
        );
        await auditP0CrossTenantAccess(ctx, scope, "report_schedule_create", input.reportKey);
        return { ok: true };
      } finally {
        await conn.end();
      }
    }),

  // ── Delete a scheduled report ──────────────────────────────────────────────
  deleteSchedule: protectedProcedure
    .input(z.object({ scheduleId: z.number(), tenantId: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const topRole = ctx.user.role ?? "user";
      const insurerRole = (ctx.user as any).insurerRole ?? null;
      const effectiveRole = insurerRole ?? topRole;
      if (!(isAdminRole(topRole) || (["insurer_admin", "claims_manager", "risk_manager", "executive"] as string[]).includes(effectiveRole))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only managers and admins can delete schedules." });
      }
      const scope = resolveP0TenantScope(ctx, input.tenantId, "reporting.deleteSchedule");
      await validateP0TenantScope(scope);
      const conn = await getConn();
      try {
        const [rows] = await conn.execute(
          `SELECT id FROM report_schedules WHERE id=? AND tenant_id=? LIMIT 1`,
          [input.scheduleId, scope.tenantId]
        ) as [Record<string, unknown>[], unknown];
        const sched = rows[0];
        if (!sched) throw new TRPCError({ code: "NOT_FOUND", message: "Schedule not found." });
        await conn.execute(`DELETE FROM report_schedules WHERE id=? AND tenant_id=?`, [input.scheduleId, scope.tenantId]);
        await auditP0CrossTenantAccess(ctx, scope, "report_schedule_delete", String(input.scheduleId));
        return { ok: true };
      } finally {
        await conn.end();
      }
    }),
  // ── Toggle a scheduled report active/inactive ────────────────────────────
  toggleSchedule: protectedProcedure
    .input(z.object({ scheduleId: z.number(), isActive: z.boolean(), tenantId: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const topRole = ctx.user.role ?? "user";
      const insurerRole = (ctx.user as any).insurerRole ?? null;
      const effectiveRole = insurerRole ?? topRole;
      if (!(isAdminRole(topRole) || (["insurer_admin", "claims_manager", "risk_manager", "executive"] as string[]).includes(effectiveRole))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only managers and admins can modify schedules." });
      }
      const scope = resolveP0TenantScope(ctx, input.tenantId, "reporting.toggleSchedule");
      await validateP0TenantScope(scope);
      const conn = await getConn();
      try {
        const [rows] = await conn.execute(
          `SELECT id FROM report_schedules WHERE id=? AND tenant_id=? LIMIT 1`,
          [input.scheduleId, scope.tenantId]
        ) as [Record<string, unknown>[], unknown];
        const sched = rows[0];
        if (!sched) throw new TRPCError({ code: "NOT_FOUND", message: "Schedule not found." });
        await conn.execute(
          `UPDATE report_schedules SET is_active=?, updated_at=? WHERE id=? AND tenant_id=?`,
          [input.isActive ? 1 : 0, Date.now(), input.scheduleId, scope.tenantId]
        );
        await auditP0CrossTenantAccess(ctx, scope, "report_schedule_toggle", String(input.scheduleId));
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
      tenantId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const scope = resolveP0TenantScope(ctx, input.tenantId, "reporting.adminRegeneratePipeline");
      await validateP0TenantScope(scope);
      await assertClaimInTenant(input.claimId, scope.tenantId);
      const conn = await getConn();
      try {
        // 1. Check claim exists and is in a regeneratable state
        const [claims] = await conn.execute(
          `SELECT id, psm_status, claim_reference, document_processing_status FROM claims WHERE id=? AND tenant_id=? LIMIT 1`,
          [input.claimId, scope.tenantId]
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
           WHERE id=? AND tenant_id=?`,
          [now, input.claimId, scope.tenantId]
        );

        // 4. Write audit log entry
        await conn.execute(
          `INSERT INTO report_audit_log
             (action, job_id, tenant_id, performed_by_user_id, performed_by_user_name,
              parameters, created_at)
           VALUES ('admin_pipeline_regen', NULL, ?, ?, ?, ?, ?)`,
          [
            scope.tenantId,
            ctx.user.id,
            ctx.user.name ?? ctx.user.email ?? "Admin",
            JSON.stringify({ claimId: input.claimId, reason: input.reason, previousState: currentState }),
            now,
          ]
        );

        await auditP0CrossTenantAccess(ctx, scope, "report_pipeline_regenerate", String(input.claimId), { reason: input.reason });

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
    .input(z.object({ claimId: z.number().optional(), limit: z.number().default(50), tenantId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const scope = resolveP0TenantScope(ctx, input.tenantId, "reporting.adminGetRegenerationHistory");
      await validateP0TenantScope(scope);
      if (input.claimId) await assertClaimInTenant(input.claimId, scope.tenantId);
      const conn = await getConn();
      try {
        const [rows] = await conn.execute(
          `SELECT r.*, c.claim_reference
           FROM admin_pipeline_regenerations r
           INNER JOIN claims c ON c.id = r.claim_id
           WHERE c.tenant_id=? ${input.claimId ? "AND r.claim_id=?" : ""}
           ORDER BY r.created_at DESC LIMIT ?`,
          input.claimId ? [scope.tenantId, input.claimId, input.limit] : [scope.tenantId, input.limit]
        );
        await auditP0CrossTenantAccess(ctx, scope, "report_pipeline_regeneration_history", input.claimId ? String(input.claimId) : scope.tenantId);
        return rows as Record<string, unknown>[];
      } finally {
        await conn.end();
      }
    }),

  // ── Preview report HTML inline (for iframe rendering in ClaimDecisionReport) ──
  previewHtml: protectedProcedure
    .input(z.object({
      reportKey: z.string(),
      claimId:   z.number().optional(),
      tenantId:  z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const role = ctx.user.role ?? "claims_processor";
      const insurerRole = (ctx.user as any).insurerRole ?? null;
      if (!canAccessReport(input.reportKey, role, insurerRole)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You do not have access to this report type." });
      }
      const scope = resolveP0TenantScope(ctx, input.tenantId, "reporting.previewHtml");
      await validateP0TenantScope(scope);
      if (input.claimId) await assertClaimInTenant(input.claimId, scope.tenantId);
      const { generateReportHtml } = await import("../reporting/reportDefinitions");
      const params: Record<string, unknown> = {};
      if (input.claimId) params.claimId = input.claimId;
      const html = await generateReportHtml(input.reportKey, params, scope.tenantId);
      await auditP0CrossTenantAccess(ctx, scope, "report_preview", input.claimId ? String(input.claimId) : input.reportKey);
      return { html };
    }),

  // ─── Report Readiness ────────────────────────────────────────────────────────
  // Single source of truth for report readiness state per claim.
  // Used by: claim list rows, claim detail view, Reports Centre selector.
  getReportReadiness: protectedProcedure
    .input(z.object({ claimId: z.number(), tenantId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const scope = resolveP0TenantScope(ctx, input.tenantId, "reporting.getReportReadiness");
      await validateP0TenantScope(scope);
      const conn = await getConn();
      try {
        const [rows] = await conn.execute(
          `SELECT
             c.id AS claim_id,
             c.status AS claim_status,
             c.claim_reference,
             a.id AS assessment_id,
             a.forensic_analysis              IS NOT NULL AS has_forensic,
             a.physics_analysis               IS NOT NULL AS has_physics,
             a.fraud_indicators               IS NOT NULL AS has_fraud,
             a.estimated_cost                 IS NOT NULL AS has_cost,
             a.forensic_audit_validation_json IS NOT NULL AS has_audit,
             a.pipeline_run_summary           IS NOT NULL AS has_pipeline,
             a.recommendation
           FROM claims c
           LEFT JOIN ai_assessments a ON a.claim_id = c.id
           WHERE c.id = ? AND c.tenant_id = ?
           ORDER BY a.id DESC
           LIMIT 1`,
          [input.claimId, scope.tenantId]
        ) as any[];

        if (!rows || rows.length === 0) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Claim not found" });
        }

        const row = rows[0];
        const claimStatus: string = row.claim_status;
        const hasAssessment = !!row.assessment_id;

        type ReadinessState = "not_submitted" | "ai_processing" | "ai_failed" | "partial" | "ready";
        let state: ReadinessState;
        let label: string;
        let colour: "green" | "amber" | "red" | "grey" | "blue";
        const missingFields: string[] = [];
        const availableReports: string[] = [];

        const processingStatuses = ["submitted", "triage", "assessment_pending", "assessment_in_progress", "intake_pending"];

        if (!hasAssessment && processingStatuses.includes(claimStatus)) {
          state  = "ai_processing";
          label  = "KINGA Processing";
          colour = "blue";
        } else if (!hasAssessment) {
          state  = "not_submitted";
          label  = "Pending Submission";
          colour = "grey";
        } else {
          if (!row.has_forensic)  missingFields.push("Forensic Analysis");
          if (!row.has_physics)   missingFields.push("Physics Analysis");
          if (!row.has_fraud)     missingFields.push("Fraud Indicators");
          if (!row.has_cost)      missingFields.push("Cost Estimate");
          if (!row.has_audit)     missingFields.push("Forensic Audit Validation");

          if (missingFields.length === 0) {
            state  = "ready";
            label  = "Report Ready";
            colour = "green";
          } else {
            state  = "partial";
            label  = missingFields.length <= 2 ? "Partial Data" : "Limited Data";
            colour = "amber";
          }
        }

        const fullAIReports  = ["claim.forensic", "claim.audit_trail"];
        const basicReports   = ["claim.assessment", "claim.cost_comparison", "claim.repair_decision"];
        const portfolioReports = [
          "portfolio.claims_summary", "portfolio.dwell_time",
          "portfolio.panel_beater_performance", "portfolio.fraud_summary",
          "portfolio.assessor_performance", "risk_manager_portfolio",
          "executive.insurer_summary", "executive.claims_trend",
          "executive.financial_exposure",
        ];

        if (state === "ready") {
          availableReports.push(...fullAIReports, ...basicReports);
        } else if (state === "partial") {
          if (row.has_cost && row.has_fraud) availableReports.push(...basicReports);
          if (row.has_forensic && row.has_physics) availableReports.push("claim.forensic");
          if (row.has_audit) availableReports.push("claim.audit_trail");
        }
        availableReports.push(...portfolioReports);

        await auditP0CrossTenantAccess(ctx, scope, "report_readiness", String(input.claimId));
        return {
          claimId:        input.claimId,
          claimReference: row.claim_reference as string,
          claimStatus,
          state,
          label,
          colour,
          missingFields,
          availableReports,
          hasAssessment,
          recommendation: row.recommendation as string | null,
        };
      } finally {
        await conn.end();
      }
    }),
});
