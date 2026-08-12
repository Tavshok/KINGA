/**
 * KINGA Report Job Queue
 * Async report generation with status tracking, S3 archival, and audit logging.
 * P0 Package 1: every read or mutation of a job requires a tenant/object scope.
 */
import { v4 as uuidv4 } from "uuid";
import mysql from "mysql2/promise";
import { renderAndUpload } from "./pdfRenderer";
import { generateReportHtml } from "./reportDefinitions";

const DB_URL = process.env.DATABASE_URL!;

async function getConn() {
  return mysql.createConnection(DB_URL);
}

export interface EnqueueOptions {
  reportKey: string;
  requestedByUserId: number;
  requestedByUserName: string;
  tenantId: string;
  parameters?: Record<string, unknown>;
  outputFormat?: "pdf" | "excel";
  ipAddress?: string;
}

export interface ReportJobAccessScope {
  tenantId: string;
  userId: number;
  isPlatformSuperAdmin: boolean;
}

function jobScopeSql(scope: ReportJobAccessScope): { clause: string; values: Array<string | number> } {
  if (scope.isPlatformSuperAdmin) {
    return { clause: "tenant_id=?", values: [scope.tenantId] };
  }
  return {
    clause: "tenant_id=? AND requested_by_user_id=?",
    values: [scope.tenantId, scope.userId],
  };
}

/** Enqueue a report under the server-resolved tenant only. */
export async function enqueueReport(opts: EnqueueOptions): Promise<string> {
  const jobId = uuidv4();
  const now = Date.now();
  const expiresAt = now + 7 * 24 * 60 * 60 * 1000;
  const conn = await getConn();
  try {
    await conn.execute(
      `INSERT INTO report_jobs
        (job_id, report_key, status, requested_by_user_id, tenant_id, parameters, output_format, created_at, updated_at, expires_at)
       VALUES (?, ?, 'queued', ?, ?, ?, ?, ?, ?, ?)`,
      [jobId, opts.reportKey, opts.requestedByUserId, opts.tenantId, JSON.stringify(opts.parameters ?? {}), opts.outputFormat ?? "pdf", now, now, expiresAt]
    );
    await conn.execute(
      `INSERT INTO report_audit_log
        (action, report_key, job_id, tenant_id, performed_by_user_id, performed_by_user_name, ip_address, parameters, created_at)
       VALUES ('requested', ?, ?, ?, ?, ?, ?, ?, ?)`,
      [opts.reportKey, jobId, opts.tenantId, opts.requestedByUserId, opts.requestedByUserName, opts.ipAddress ?? null, JSON.stringify(opts.parameters ?? {}), now]
    );
  } finally {
    await conn.end();
  }
  setImmediate(() => processJob(jobId, opts).catch(console.error));
  return jobId;
}

async function processJob(jobId: string, opts: EnqueueOptions): Promise<void> {
  const conn = await getConn();
  const now = Date.now();
  try {
    await conn.execute("UPDATE report_jobs SET status='running', started_at=?, updated_at=? WHERE job_id=?", [now, now, jobId]);
    const html = await generateReportHtml(opts.reportKey, opts.parameters ?? {}, opts.tenantId);
    const s3Prefix = `reports/${opts.tenantId}/${opts.reportKey}/${jobId}`;
    const { s3Key, pageCount, fileSizeBytes } = await renderAndUpload(html, s3Prefix);
    const completedAt = Date.now();
    await conn.execute(
      `UPDATE report_jobs SET status='completed', completed_at=?, updated_at=?, s3_key=?,
       download_url=NULL, download_url_expires_at=NULL, page_count=?, file_size_bytes=? WHERE job_id=?`,
      [completedAt, completedAt, s3Key, pageCount, fileSizeBytes, jobId]
    );
    await conn.execute(
      `INSERT INTO report_audit_log
        (action, report_key, job_id, tenant_id, performed_by_user_id, performed_by_user_name, created_at)
       VALUES ('generated', ?, ?, ?, ?, ?, ?)`,
      [opts.reportKey, jobId, opts.tenantId, opts.requestedByUserId, opts.requestedByUserName, completedAt]
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await conn.execute("UPDATE report_jobs SET status='failed', error_message=?, updated_at=? WHERE job_id=?", [msg.substring(0, 1000), Date.now(), jobId]).catch(() => {});
    console.error(`[ReportQueue] Job ${jobId} failed:`, msg);
  } finally {
    await conn.end();
  }
}

/** Returns safe job metadata only after tenant and requester ownership are established. */
export async function getJobStatus(jobId: string, scope: ReportJobAccessScope) {
  const conn = await getConn();
  try {
    const access = jobScopeSql(scope);
    const [rows] = await conn.execute(
      `SELECT job_id, report_key, status, output_format, download_count, error_message,
              started_at, completed_at, expires_at, file_size_bytes, page_count, created_at
       FROM report_jobs WHERE job_id=? AND ${access.clause} LIMIT 1`,
      [jobId, ...access.values]
    );
    return (rows as Record<string, unknown>[])[0] ?? null;
  } finally {
    await conn.end();
  }
}

/** Obtains the authoritative private object key only after the same object-level check. */
export async function getAuthorisedReportObject(jobId: string, scope: ReportJobAccessScope) {
  const conn = await getConn();
  try {
    const access = jobScopeSql(scope);
    const [rows] = await conn.execute(
      `SELECT job_id, s3_key, status, report_key FROM report_jobs
       WHERE job_id=? AND ${access.clause} LIMIT 1`,
      [jobId, ...access.values]
    );
    return (rows as Record<string, unknown>[])[0] ?? null;
  } finally {
    await conn.end();
  }
}

/** Records a download only if the independently authorised job lookup succeeds. */
export async function recordDownload(jobId: string, scope: ReportJobAccessScope): Promise<boolean> {
  const job = await getAuthorisedReportObject(jobId, scope);
  if (!job) return false;
  const conn = await getConn();
  const now = Date.now();
  try {
    const access = jobScopeSql(scope);
    await conn.execute(
      `UPDATE report_jobs SET download_count=download_count+1, last_downloaded_at=?, last_downloaded_by=?, updated_at=?
       WHERE job_id=? AND ${access.clause}`,
      [now, scope.userId, now, jobId, ...access.values]
    );
    await conn.execute(
      `INSERT INTO report_audit_log (action, job_id, tenant_id, performed_by_user_id, created_at)
       VALUES ('downloaded', ?, ?, ?, ?)`,
      [jobId, scope.tenantId, scope.userId, now]
    );
    return true;
  } finally {
    await conn.end();
  }
}

/** Lists jobs only in the caller's tenant and, for ordinary users, only their own jobs. */
export async function getUserJobs(scope: ReportJobAccessScope) {
  const conn = await getConn();
  try {
    const access = jobScopeSql(scope);
    const [rows] = await conn.execute(
      `SELECT job_id, report_key, status, output_format, download_count, error_message,
              started_at, completed_at, file_size_bytes, page_count, created_at
       FROM report_jobs WHERE ${access.clause} ORDER BY created_at DESC LIMIT 50`,
      access.values
    );
    return rows as Record<string, unknown>[];
  } finally {
    await conn.end();
  }
}
