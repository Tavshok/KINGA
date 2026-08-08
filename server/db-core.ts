/**
 * KINGA Database Connection Core
 * getDb, withDbTimeout, getRawPool, getDbOrThrow, withDbRetry.
 * Import from domain modules to avoid circular dependencies.
 */

import { eq, and, or, desc, inArray, notInArray, sql, like } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "../drizzle/schema";
import { 
  InsertUser, 
  users,
  claims,
  InsertClaim,
  panelBeaters,
  InsertPanelBeater,
  aiAssessments,
  InsertAiAssessment,
  assessorEvaluations,
  InsertAssessorEvaluation,
  panelBeaterQuotes,
  InsertPanelBeaterQuote,
  appointments,
  InsertAppointment,
  auditTrail,
  InsertAuditTrailEntry,
  notifications,
  InsertNotification,
  fraudIndicators,
  claimantHistory,
  vehicleHistory,
  entityRelationships,
  fraudAlerts,
  fraudRules,
  quoteLineItems,
  InsertQuoteLineItem,
  thirdPartyVehicles,
  InsertThirdPartyVehicle,
  vehicleMarketValuations,
  InsertVehicleMarketValuation,
  policeReports,
  InsertPoliceReport,
  preAccidentDamage,
  InsertPreAccidentDamage,
  vehicleConditionAssessment,
  InsertVehicleConditionAssessment,
  approvalWorkflow,
  InsertApprovalWorkflow,
  assessors,
  assessorInsurerRelationships,
  claimEvents,
  InsertClaimEvent,
  ingestionDocuments,
  decisionSnapshots,
  DecisionSnapshot,
  tenants
} from "../drizzle/schema";
import { ENV } from './_core/env';
import { logger } from './logger';
import * as dbPipeline from './db-pipeline.ts';

import type { MySql2Database } from 'drizzle-orm/mysql2';
let _db: MySql2Database<typeof schema> | null = null;
let _pool: mysql.Pool | null = null;

// Lazily create the drizzle instance with a proper connection pool.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _pool = mysql.createPool({
        uri: process.env.DATABASE_URL,
        connectionLimit: 5,
        waitForConnections: true,
        queueLimit: 0,
        enableKeepAlive: true,
        keepAliveInitialDelay: 30000,  // Send keepalive after 30s idle
        connectTimeout: 30000,
        multipleStatements: false,
        // TiDB Cloud drops idle connections after ~5 minutes.
        // Set idleTimeout to 4 minutes so the pool releases connections before TiDB drops them.
        idleTimeout: 240000,
      });
      // Reset pool on fatal connection errors so next getDb() call creates a fresh pool
      (_pool as any).on('error', (err: Error) => {
        if ((err as any).code === 'ECONNRESET' || (err as any).code === 'PROTOCOL_CONNECTION_LOST') {
          console.warn('[Database] Pool connection lost, will reinitialise on next query:', err.message);
          _db = null;
          _pool = null;
        }
      });
      _db = drizzle(_pool, { schema, mode: "default" });
      console.log("[Database] Connection pool initialized");
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
      _pool = null;
    }
  }
  return _db;
}

/**
 * R-INF-01: Execute a DB operation with a per-query statement timeout.
 *
 * TiDB/MySQL does not have a per-pool query timeout option in mysql2, so we
 * implement it by running `SET SESSION max_statement_time = <ms>` on the
 * connection before the operation, then restoring it to 0 (unlimited) after.
 *
 * Usage:
 *   const result = await withDbTimeout(() => db.select(...).from(...), 10_000);
 *
 * @param operation  Async function that performs the DB work.
 * @param timeoutMs  Max wall-clock ms for the query (default 30 s).
 * @param label      Label for log messages.
 */
export async function withDbTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs = 30_000,
  label = 'DB query'
): Promise<T> {
  const pool = await getRawPool();
  if (!pool) {
    // No DB available — fall through to operation() which will also fail/no-op
    return operation();
  }
  const conn = await pool.getConnection();
  try {
    // max_statement_time is in milliseconds on TiDB; on standard MySQL it is in seconds
    // but TiDB accepts ms. We use the TiDB-compatible form.
    await conn.execute(`SET SESSION max_statement_time = ${timeoutMs}`);
    const result = await operation();
    return result;
  } catch (err: any) {
    const isTimeout =
      err?.code === 'ER_STATEMENT_TIMEOUT' ||
      String(err?.message).includes('max_statement_time exceeded') ||
      String(err?.message).includes('Query execution was interrupted');
    if (isTimeout) {
      throw new Error(`[Database] ${label} timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    // Restore unlimited statement time before releasing the connection back to pool
    try { await conn.execute('SET SESSION max_statement_time = 0'); } catch { /* ignore */ }
    conn.release();
  }
}

/**
 * Returns the raw mysql2 Pool so callers can use pool.execute(sql, params)
 * with the standard 2-argument signature (unlike drizzle's 1-arg wrapper).
 * Returns null when DATABASE_URL is not configured.
 */
export async function getRawPool(): Promise<mysql.Pool | null> {
  await getDb(); // ensure pool is initialised
  return _pool;
}

/**
 * getDbOrThrow — same as getDb() but throws a typed error if the DB is unavailable.
 * Use this in any code path where a null DB should be treated as a hard failure
 * (e.g. WhatsApp session manager, background jobs, webhook handlers).
 *
 * This eliminates TypeScript TS2531 "Object is possibly null" errors at call sites
 * that chain DB operations without a null guard.
 *
 * TECH-01: Added Aug 2026 as part of TypeScript error remediation.
 */
export async function getDbOrThrow() {
  const db = await getDb();
  if (!db) {
    throw new Error("[Database] Connection unavailable — DB not initialised or connection failed");
  }
  return db;
}

/**
 * Execute a database operation with automatic retry on transient connection errors.
 * Handles ECONNRESET / PROTOCOL_CONNECTION_LOST by resetting the pool and retrying.
 * Use this wrapper for any DB call that runs outside of a live HTTP request context
 * (e.g. background jobs, scheduled tasks, fire-and-forget pipeline steps).
 */
export async function withDbRetry<T>(
  operation: () => Promise<T>,
  maxAttempts = 3,
  delayMs = 1000,
  label = 'DB operation'
): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (err: any) {
      const isTransient =
        err?.code === 'ECONNRESET' ||
        err?.code === 'PROTOCOL_CONNECTION_LOST' ||
        err?.cause?.code === 'ECONNRESET' ||
        err?.cause?.code === 'PROTOCOL_CONNECTION_LOST' ||
        String(err?.message).includes('ECONNRESET') ||
        String(err?.message).includes('PROTOCOL_CONNECTION_LOST');
      if (isTransient && attempt < maxAttempts) {
        console.warn(`[Database] ${label}: transient error on attempt ${attempt}/${maxAttempts} — resetting pool and retrying in ${delayMs * attempt}ms:`, err.message);
        // Force pool reset so getDb() creates a fresh connection on next call
        _db = null;
        _pool = null;
        await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
        lastError = err;
        continue;
      }
      throw err;
    }
  }
  throw lastError ?? new Error(`${label}: exhausted ${maxAttempts} attempts`);
}

