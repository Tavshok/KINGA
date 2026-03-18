/**
 * shadow-override-monitor.ts
 *
 * SHADOW MODE — Passive observation only.
 *
 * RULES (hard-coded, never relaxed):
 *   ✓ Track override frequency per user (24h, 7d, 30d windows)
 *   ✓ Identify unusual patterns (statistical baseline comparison)
 *   ✗ NEVER block any action
 *   ✗ NEVER trigger escalations
 *   ✗ NEVER notify users
 *
 * OUTPUT (per user, per scan):
 * {
 *   override_activity_detected: boolean,
 *   user_id: string,
 *   metrics: { overrides_24h: number, overrides_7d: number },
 *   recommended_action: "none",   ← always "none" in shadow mode
 *   mode: "shadow"                ← always "shadow"
 * }
 */

import { getDb } from "./db";
import { governanceAuditLog, shadowOverrideMonitor } from "../drizzle/schema";
import { eq, and, gte, sql } from "drizzle-orm";

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

/** Shadow mode is always "shadow" — immutable. */
export const SHADOW_MODE = "shadow" as const;

/** Recommended action is always "none" in shadow mode — immutable. */
export const SHADOW_RECOMMENDED_ACTION = "none" as const;

/** Pattern thresholds for baseline anomaly detection (observation only). */
const PATTERN_THRESHOLDS = {
  /** More than this many overrides in 24h is flagged as unusual */
  overrides24hHigh: 5,
  /** More than this many overrides in 7d is flagged as unusual */
  overrides7dHigh: 15,
  /** Ratio of overrides to total actions above this is flagged */
  overrideRatioHigh: 0.5,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface ShadowObservationResult {
  override_activity_detected: boolean;
  user_id: string;
  user_name: string | null;
  metrics: {
    overrides_24h: number;
    overrides_7d: number;
    overrides_30d: number;
    total_overrides: number;
  };
  pattern: {
    unusual_detected: boolean;
    notes: string;
  };
  /** Always "none" — shadow mode never recommends action */
  recommended_action: "none";
  /** Always "shadow" */
  mode: "shadow";
  scanned_at: string;
}

export interface ShadowScanSummary {
  scanned_at: string;
  users_scanned: number;
  users_with_activity: number;
  users_with_unusual_pattern: number;
  results: ShadowObservationResult[];
}

// ─────────────────────────────────────────────────────────────────────────────
// CORE OBSERVATION ENGINE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Scans override activity for a single user and returns the spec-compliant
 * observation result. Never modifies any claim data or triggers any action.
 */
export async function observeUser(
  userId: string,
  userName?: string | null
): Promise<ShadowObservationResult> {
  const now = Date.now();
  const ms24h = 24 * 60 * 60 * 1000;
  const ms7d = 7 * 24 * 60 * 60 * 1000;
  const ms30d = 30 * 24 * 60 * 60 * 1000;

  const db = await getDb();
  if (!db) {
    return buildEmptyResult(userId, userName, now);
  }

  // Count overrides in each rolling window
  const [count24h, count7d, count30d, countTotal] = await Promise.all([
    countOverrides(db, userId, now - ms24h),
    countOverrides(db, userId, now - ms7d),
    countOverrides(db, userId, now - ms30d),
    countOverrides(db, userId, 0),
  ]);

  // Count total actions (for ratio calculation)
  const totalActions = await countTotalActions(db, userId, now - ms7d);

  // Detect unusual patterns (observation only)
  const patternNotes: string[] = [];
  let unusualDetected = false;

  if (count24h >= PATTERN_THRESHOLDS.overrides24hHigh) {
    unusualDetected = true;
    patternNotes.push(`High 24h override frequency: ${count24h} overrides`);
  }
  if (count7d >= PATTERN_THRESHOLDS.overrides7dHigh) {
    unusualDetected = true;
    patternNotes.push(`High 7d override frequency: ${count7d} overrides`);
  }
  if (totalActions > 0) {
    const ratio = count7d / totalActions;
    if (ratio >= PATTERN_THRESHOLDS.overrideRatioHigh) {
      unusualDetected = true;
      patternNotes.push(
        `High override ratio in 7d: ${(ratio * 100).toFixed(1)}% of ${totalActions} actions`
      );
    }
  }

  const result: ShadowObservationResult = {
    override_activity_detected: countTotal > 0,
    user_id: userId,
    user_name: userName ?? null,
    metrics: {
      overrides_24h: count24h,
      overrides_7d: count7d,
      overrides_30d: count30d,
      total_overrides: countTotal,
    },
    pattern: {
      unusual_detected: unusualDetected,
      notes: patternNotes.join("; ") || "No unusual patterns detected",
    },
    recommended_action: SHADOW_RECOMMENDED_ACTION,
    mode: SHADOW_MODE,
    scanned_at: new Date(now).toISOString(),
  };

  // Persist the observation (upsert by userId)
  await persistObservation(db, userId, userName ?? null, result, now);

  return result;
}

/**
 * Scans ALL users who have ever performed an override.
 * Returns a summary of the full scan. Safe to call from a cron job.
 */
export async function runFullShadowScan(): Promise<ShadowScanSummary> {
  const db = await getDb();
  const scannedAt = new Date().toISOString();

  if (!db) {
    return {
      scanned_at: scannedAt,
      users_scanned: 0,
      users_with_activity: 0,
      users_with_unusual_pattern: 0,
      results: [],
    };
  }

  // Find all distinct users who have ever overridden an AI decision
  const usersWithOverrides = await db
    .selectDistinct({
      userId: governanceAuditLog.performedBy,
      userName: governanceAuditLog.performedByName,
    })
    .from(governanceAuditLog)
    .where(eq(governanceAuditLog.overrideFlag, 1));

  const results: ShadowObservationResult[] = [];

  for (const { userId, userName } of usersWithOverrides) {
    const result = await observeUser(userId, userName);
    results.push(result);
  }

  return {
    scanned_at: scannedAt,
    users_scanned: results.length,
    users_with_activity: results.filter((r) => r.override_activity_detected).length,
    users_with_unusual_pattern: results.filter((r) => r.pattern.unusual_detected).length,
    results,
  };
}

/**
 * Retrieves the latest stored observation for a specific user.
 * Returns null if no observation has been recorded yet.
 */
export async function getLatestObservation(
  userId: string
): Promise<ShadowObservationResult | null> {
  const db = await getDb();
  if (!db) return null;

  const rows = await db
    .select()
    .from(shadowOverrideMonitor)
    .where(eq(shadowOverrideMonitor.userId, userId))
    .limit(1);

  if (rows.length === 0) return null;
  const row = rows[0];

  return {
    override_activity_detected: row.overrideActivityDetected === 1,
    user_id: row.userId,
    user_name: row.userName ?? null,
    metrics: {
      overrides_24h: row.overrides24h,
      overrides_7d: row.overrides7d,
      overrides_30d: row.overrides30d,
      total_overrides: row.totalOverrides,
    },
    pattern: {
      unusual_detected: row.unusualPatternDetected === 1,
      notes: row.patternNotes ?? "No unusual patterns detected",
    },
    recommended_action: SHADOW_RECOMMENDED_ACTION,
    mode: SHADOW_MODE,
    scanned_at: new Date(row.lastScannedAt).toISOString(),
  };
}

/**
 * Retrieves all stored observations (latest per user), ordered by 7d override count desc.
 */
export async function getAllObservations(): Promise<ShadowObservationResult[]> {
  const db = await getDb();
  if (!db) return [];

  const rows = await db
    .select()
    .from(shadowOverrideMonitor)
    .orderBy(sql`${shadowOverrideMonitor.overrides7d} DESC`);

  return rows.map((row) => ({
    override_activity_detected: row.overrideActivityDetected === 1,
    user_id: row.userId,
    user_name: row.userName ?? null,
    metrics: {
      overrides_24h: row.overrides24h,
      overrides_7d: row.overrides7d,
      overrides_30d: row.overrides30d,
      total_overrides: row.totalOverrides,
    },
    pattern: {
      unusual_detected: row.unusualPatternDetected === 1,
      notes: row.patternNotes ?? "No unusual patterns detected",
    },
    recommended_action: SHADOW_RECOMMENDED_ACTION,
    mode: SHADOW_MODE,
    scanned_at: new Date(row.lastScannedAt).toISOString(),
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

async function countOverrides(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  userId: string,
  sinceMs: number
): Promise<number> {
  const conditions = [
    eq(governanceAuditLog.performedBy, userId),
    eq(governanceAuditLog.overrideFlag, 1),
  ];
  if (sinceMs > 0) {
    conditions.push(gte(governanceAuditLog.timestampMs, sinceMs));
  }
  const result = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(governanceAuditLog)
    .where(and(...conditions));
  return Number(result[0]?.count ?? 0);
}

async function countTotalActions(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  userId: string,
  sinceMs: number
): Promise<number> {
  const result = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(governanceAuditLog)
    .where(
      and(
        eq(governanceAuditLog.performedBy, userId),
        gte(governanceAuditLog.timestampMs, sinceMs)
      )
    );
  return Number(result[0]?.count ?? 0);
}

async function persistObservation(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  userId: string,
  userName: string | null,
  result: ShadowObservationResult,
  now: number
): Promise<void> {
  // Find first and last override timestamps
  const firstRow = await db
    .select({ ts: governanceAuditLog.timestampMs })
    .from(governanceAuditLog)
    .where(
      and(
        eq(governanceAuditLog.performedBy, userId),
        eq(governanceAuditLog.overrideFlag, 1)
      )
    )
    .orderBy(governanceAuditLog.timestampMs)
    .limit(1);

  const lastRow = await db
    .select({ ts: governanceAuditLog.timestampMs })
    .from(governanceAuditLog)
    .where(
      and(
        eq(governanceAuditLog.performedBy, userId),
        eq(governanceAuditLog.overrideFlag, 1)
      )
    )
    .orderBy(sql`${governanceAuditLog.timestampMs} DESC`)
    .limit(1);

  const existing = await db
    .select({ id: shadowOverrideMonitor.id })
    .from(shadowOverrideMonitor)
    .where(eq(shadowOverrideMonitor.userId, userId))
    .limit(1);

  const record = {
    userId,
    userName,
    tenantId: "default",
    overrides24h: result.metrics.overrides_24h,
    overrides7d: result.metrics.overrides_7d,
    overrides30d: result.metrics.overrides_30d,
    totalOverrides: result.metrics.total_overrides,
    unusualPatternDetected: result.pattern.unusual_detected ? 1 : 0,
    patternNotes: result.pattern.notes,
    overrideActivityDetected: result.override_activity_detected ? 1 : 0,
    recommendedAction: SHADOW_RECOMMENDED_ACTION,
    mode: SHADOW_MODE,
    lastScannedAt: now,
    firstOverrideAt: firstRow[0]?.ts ?? null,
    lastOverrideAt: lastRow[0]?.ts ?? null,
    updatedAt: now,
  };

  if (existing.length > 0) {
    await db
      .update(shadowOverrideMonitor)
      .set(record)
      .where(eq(shadowOverrideMonitor.userId, userId));
  } else {
    await db.insert(shadowOverrideMonitor).values({ ...record, createdAt: now });
  }
}

function buildEmptyResult(
  userId: string,
  userName: string | null | undefined,
  now: number
): ShadowObservationResult {
  return {
    override_activity_detected: false,
    user_id: userId,
    user_name: userName ?? null,
    metrics: { overrides_24h: 0, overrides_7d: 0, overrides_30d: 0, total_overrides: 0 },
    pattern: { unusual_detected: false, notes: "No data available" },
    recommended_action: SHADOW_RECOMMENDED_ACTION,
    mode: SHADOW_MODE,
    scanned_at: new Date(now).toISOString(),
  };
}
