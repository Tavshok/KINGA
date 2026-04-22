/**
 * KINGA Report Job Queue
 * Async report generation with status tracking, S3 archival, and audit logging.
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
  tenantId?: string;
  parameters?: Record<string, unknown>;
  outputFormat?: "pdf" | "excel";
  ipAddress?: string;
}

/**
 * Enqueue a report job. Returns the job_id immediately.
 * Generation runs asynchronously in the background.
 */
export async function enqueueReport(opts: EnqueueOptions): Promise<string> {
  const jobId = uuidv4();
  const now = Date.now();
  const expiresAt = now + 7 * 24 * 60 * 60 * 1000; // 7 days

  const conn = await getConn();
  try {
    await conn.execute(
      `INSERT INTO report_jobs
        (job_id, report_key, status, requested_by_user_id, tenant_id, parameters, output_format, created_at, updated_at, expires_at)
       VALUES (?, ?, 'queued', ?, ?, ?, ?, ?, ?, ?)`,
      [
        jobId,
        opts.reportKey,
        opts.requestedByUserId,
        opts.tenantId ?? null,
        JSON.stringify(opts.parameters ?? {}),
        opts.outputFormat ?? "pdf",
        now, now, expiresAt,
      ]
    );

    // Audit log
    await conn.execute(
      `INSERT INTO report_audit_log
        (action, report_key, job_id, tenant_id, performed_by_user_id, performed_by_user_name, ip_address, parameters, created_at)
       VALUES ('requested', ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        opts.reportKey, jobId, opts.tenantId ?? null,
        opts.requestedByUserId, opts.requestedByUserName,
        opts.ipAddress ?? null, JSON.stringify(opts.parameters ?? {}), now,
      ]
    );
  } finally {
    await conn.end();
  }

  // Fire and forget — run in background
  setImmediate(() => processJob(jobId, opts).catch(console.error));

  return jobId;
}

/**
 * Process a single report job.
 */
async function processJob(jobId: string, opts: EnqueueOptions): Promise<void> {
  const conn = await getConn();
  const now = Date.now();

  try {
    // Mark as running
    await conn.execute(
      `UPDATE report_jobs SET status='running', started_at=?, updated_at=? WHERE job_id=?`,
      [now, now, jobId]
    );

    // Generate the HTML
    const html = await generateReportHtml(
      opts.reportKey,
      opts.parameters ?? {},
      opts.tenantId
    );

    // Render to PDF and upload to S3
    const s3Prefix = `reports/${opts.tenantId ?? "global"}/${opts.reportKey}/${jobId}`;
    const { s3Key, url, pageCount, fileSizeBytes } = await renderAndUpload(html, s3Prefix);

    const completedAt = Date.now();
    const downloadUrlExpiresAt = completedAt + 7 * 24 * 60 * 60 * 1000;

    // Mark as completed
    await conn.execute(
      `UPDATE report_jobs SET
        status='completed', completed_at=?, updated_at=?,
        s3_key=?, download_url=?, download_url_expires_at=?,
        page_count=?, file_size_bytes=?
       WHERE job_id=?`,
      [completedAt, completedAt, s3Key, url, downloadUrlExpiresAt, pageCount, fileSizeBytes, jobId]
    );

    // Audit log
    await conn.execute(
      `INSERT INTO report_audit_log
        (action, report_key, job_id, tenant_id, performed_by_user_id, performed_by_user_name, created_at)
       VALUES ('generated', ?, ?, ?, ?, ?, ?)`,
      [opts.reportKey, jobId, opts.tenantId ?? null, opts.requestedByUserId, opts.requestedByUserName, completedAt]
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await conn.execute(
      `UPDATE report_jobs SET status='failed', error_message=?, updated_at=? WHERE job_id=?`,
      [msg.substring(0, 1000), Date.now(), jobId]
    ).catch(() => {});
    console.error(`[ReportQueue] Job ${jobId} failed:`, msg);
  } finally {
    await conn.end();
  }
}

/**
 * Get the status of a report job.
 */
export async function getJobStatus(jobId: string) {
  const conn = await getConn();
  try {
    const [rows] = await conn.execute(
      `SELECT job_id, report_key, status, output_format, download_url,
              download_url_expires_at, download_count, error_message,
              started_at, completed_at, expires_at, file_size_bytes, page_count, created_at
       FROM report_jobs WHERE job_id=? LIMIT 1`,
      [jobId]
    );
    return (rows as Record<string, unknown>[])[0] ?? null;
  } finally {
    await conn.end();
  }
}

/**
 * Record a download event.
 */
export async function recordDownload(jobId: string, userId: number): Promise<void> {
  const conn = await getConn();
  const now = Date.now();
  try {
    await conn.execute(
      `UPDATE report_jobs SET download_count=download_count+1, last_downloaded_at=?, last_downloaded_by=?, updated_at=? WHERE job_id=?`,
      [now, userId, now, jobId]
    );
    await conn.execute(
      `INSERT INTO report_audit_log (action, job_id, performed_by_user_id, created_at) VALUES ('downloaded', ?, ?, ?)`,
      [jobId, userId, now]
    );
  } finally {
    await conn.end();
  }
}

/**
 * Get all jobs for a user (last 50).
 */
export async function getUserJobs(userId: number, tenantId?: string) {
  const conn = await getConn();
  try {
    const [rows] = await conn.execute(
      `SELECT job_id, report_key, status, output_format, download_url,
              download_count, error_message, started_at, completed_at,
              file_size_bytes, page_count, created_at
       FROM report_jobs
       WHERE requested_by_user_id=? ${tenantId ? "AND tenant_id=?" : ""}
       ORDER BY created_at DESC LIMIT 50`,
      tenantId ? [userId, tenantId] : [userId]
    );
    return rows as Record<string, unknown>[];
  } finally {
    await conn.end();
  }
}
