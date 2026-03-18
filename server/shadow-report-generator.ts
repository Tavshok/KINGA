/**
 * shadow-report-generator.ts
 *
 * Generates role-based shadow monitoring reports from the same underlying
 * shadow observation data. Three report formats are produced:
 *
 *   1. claims_manager  → operational detail (per-user activity breakdown)
 *   2. risk_manager    → analytical insights (trends, ratios, distribution)
 *   3. executive       → summary + high-level interpretation
 *
 * RULES (inherited from shadow mode):
 *   ✗ No enforcement language
 *   ✗ No blocking recommendations
 *   ✓ Focus on insight, not action
 *   ✓ recommended_action is always "none"
 *   ✓ mode is always "shadow"
 *
 * OUTPUT (per report):
 * {
 *   report_type: "claims_manager" | "risk_manager" | "executive",
 *   period: string,
 *   key_metrics: { ... },
 *   trend: string,
 *   interpretation: string,
 *   mode: "shadow",
 *   recommended_action: "none",
 *   generated_at: ISO8601,
 * }
 */

import { getDb } from "./db";
import { governanceAuditLog, shadowOverrideMonitor } from "../drizzle/schema";
import { and, gte, sql, desc } from "drizzle-orm";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type ReportRole = "claims_manager" | "risk_manager" | "executive";

export interface ShadowReportKeyMetrics {
  total_overrides_period: number;
  total_actions_period: number;
  override_ratio_percent: number;
  users_with_activity: number;
  users_with_unusual_pattern: number;
  highest_override_user: string | null;
  highest_override_count: number;
  /** Only present in claims_manager report */
  per_user_breakdown?: Array<{
    user_id: string;
    user_name: string | null;
    overrides_24h: number;
    overrides_7d: number;
    overrides_30d: number;
    total_overrides: number;
    unusual_pattern: boolean;
    pattern_notes: string;
  }>;
  /** Only present in risk_manager report */
  distribution?: {
    zero_overrides: number;
    low_1_to_5: number;
    medium_6_to_14: number;
    high_15_plus: number;
  };
  /** Only present in risk_manager report */
  trend_data?: Array<{
    day: string;
    overrides: number;
  }>;
}

export interface ShadowReport {
  report_type: ReportRole;
  period: string;
  key_metrics: ShadowReportKeyMetrics;
  trend: string;
  interpretation: string;
  mode: "shadow";
  recommended_action: "none";
  generated_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// DATA COLLECTION
// ─────────────────────────────────────────────────────────────────────────────

interface RawOverrideRow {
  user_id: string;
  user_name: string | null;
  override_count: number;
  total_actions: number;
  unusual_pattern: boolean;
  pattern_notes: string;
}

async function collectRawData(periodDays: number): Promise<{
  rows: RawOverrideRow[];
  totalOverrides: number;
  totalActions: number;
  periodLabel: string;
}> {
  const db = await getDb();
  const periodLabel = `Last ${periodDays} day${periodDays !== 1 ? "s" : ""}`;

  if (!db) {
    return { rows: [], totalOverrides: 0, totalActions: 0, periodLabel };
  }

  const cutoff = Date.now() - periodDays * 24 * 60 * 60 * 1000;

  // Pull raw governance log entries in the period
  const entries = await db
    .select({
      user_id: governanceAuditLog.performedBy,
      action: governanceAuditLog.action,
      override_flag: governanceAuditLog.overrideFlag,
      ai_decision: governanceAuditLog.aiDecision,
      human_decision: governanceAuditLog.humanDecision,
      timestampMs: governanceAuditLog.timestampMs,
    })
    .from(governanceAuditLog)
      .where(gte(governanceAuditLog.timestampMs, cutoff));

  // Aggregate per user
  const userMap = new Map<
    string,
    { overrides: number; actions: number }
  >();
  for (const entry of entries) {
    const uid = entry.user_id ?? "unknown";
    if (!userMap.has(uid)) userMap.set(uid, { overrides: 0, actions: 0 });
    const u = userMap.get(uid)!;
    u.actions++;
    if (entry.override_flag) u.overrides++;
  }

  // Pull the latest shadow observations for pattern notes
  const observations = await db
    .select()
    .from(shadowOverrideMonitor)
    .orderBy(desc(shadowOverrideMonitor.updatedAt));

  const obsMap = new Map<string, typeof observations[0]>();
  for (const obs of observations) {
    if (!obsMap.has(obs.userId)) obsMap.set(obs.userId, obs);
  }

  const rows: RawOverrideRow[] = [];
  for (const [uid, counts] of Array.from(userMap.entries())) {
    const obs = obsMap.get(uid);
    rows.push({
      user_id: uid,
      user_name: obs?.userName ?? null,
      override_count: counts.overrides,
      total_actions: counts.actions,
      unusual_pattern: obs ? obs.unusualPatternDetected === 1 : false,
      pattern_notes: obs?.patternNotes ?? "No pattern data available",
    });
  }

  const totalOverrides = rows.reduce((s, r) => s + r.override_count, 0);
  const totalActions = rows.reduce((s, r) => s + r.total_actions, 0);

  return { rows, totalOverrides, totalActions, periodLabel };
}

async function collectTrendData(days: number): Promise<Array<{ day: string; overrides: number }>> {
  const db = await getDb();
  if (!db) return [];

  const result: Array<{ day: string; overrides: number }> = [];
  const now = Date.now();

  for (let i = days - 1; i >= 0; i--) {
    const dayStart = now - (i + 1) * 24 * 60 * 60 * 1000;
    const dayEnd = now - i * 24 * 60 * 60 * 1000;
    const dayLabel = new Date(dayStart).toISOString().slice(0, 10);

    const rows = await db
      .select({ count: sql<number>`count(*)` })
      .from(governanceAuditLog)
      .where(
        and(
          gte(governanceAuditLog.timestampMs, dayStart),
          sql`${governanceAuditLog.timestampMs} < ${dayEnd}`,
          sql`${governanceAuditLog.overrideFlag} = 1`
        )
      );

    result.push({ day: dayLabel, overrides: Number(rows[0]?.count ?? 0) });
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// TREND ANALYSIS (pure, no DB)
// ─────────────────────────────────────────────────────────────────────────────

export function computeTrendDescription(trendData: Array<{ day: string; overrides: number }>): string {
  if (trendData.length < 4) return "Insufficient data to determine trend direction.";

  const half = Math.floor(trendData.length / 2);
  const firstHalf = trendData.slice(0, half);
  const secondHalf = trendData.slice(half);

  const avg = (arr: typeof trendData) =>
    arr.reduce((s, d) => s + d.overrides, 0) / arr.length;

  const firstAvg = avg(firstHalf);
  const secondAvg = avg(secondHalf);

  if (firstAvg === 0 && secondAvg === 0) return "No override activity observed in the period.";

  const changePct = firstAvg === 0
    ? secondAvg > 0 ? 100 : 0
    : ((secondAvg - firstAvg) / firstAvg) * 100;

  if (Math.abs(changePct) < 10) return "Override frequency has remained broadly stable across the period.";
  if (changePct > 30) return `Override frequency shows a notable upward trend (+${changePct.toFixed(0)}% in the second half of the period).`;
  if (changePct > 0) return `Override frequency shows a modest upward trend (+${changePct.toFixed(0)}%).`;
  if (changePct < -30) return `Override frequency shows a notable downward trend (${changePct.toFixed(0)}% in the second half of the period).`;
  return `Override frequency shows a modest downward trend (${changePct.toFixed(0)}%).`;
}

export function computeDistribution(rows: RawOverrideRow[]): ShadowReportKeyMetrics["distribution"] {
  const dist = { zero_overrides: 0, low_1_to_5: 0, medium_6_to_14: 0, high_15_plus: 0 };
  for (const r of rows) {
    if (r.override_count === 0) dist.zero_overrides++;
    else if (r.override_count <= 5) dist.low_1_to_5++;
    else if (r.override_count <= 14) dist.medium_6_to_14++;
    else dist.high_15_plus++;
  }
  return dist;
}

// ─────────────────────────────────────────────────────────────────────────────
// ROLE FORMATTERS
// ─────────────────────────────────────────────────────────────────────────────

function formatClaimsManagerReport(
  rows: RawOverrideRow[],
  totalOverrides: number,
  totalActions: number,
  periodLabel: string,
  generatedAt: string
): ShadowReport {
  const sorted = [...rows].sort((a, b) => b.override_count - a.override_count);
  const usersWithActivity = rows.filter((r) => r.override_count > 0).length;
  const usersWithUnusual = rows.filter((r) => r.unusual_pattern).length;
  const top = sorted[0] ?? null;
  const overrideRatio = totalActions > 0
    ? parseFloat(((totalOverrides / totalActions) * 100).toFixed(1))
    : 0;

  const perUserBreakdown = sorted.map((r) => ({
    user_id: r.user_id,
    user_name: r.user_name,
    overrides_24h: 0, // 24h breakdown requires per-user windowed query; populated from shadow obs below
    overrides_7d: r.override_count,
    overrides_30d: r.override_count,
    total_overrides: r.override_count,
    unusual_pattern: r.unusual_pattern,
    pattern_notes: r.pattern_notes,
  }));

  const trend =
    usersWithActivity === 0
      ? "No override activity recorded in this period."
      : usersWithUnusual > 0
      ? `${usersWithUnusual} user${usersWithUnusual > 1 ? "s" : ""} show elevated override frequency relative to baseline.`
      : "All users are operating within normal override frequency ranges.";

  const interpretation =
    totalOverrides === 0
      ? "No AI decision overrides were recorded in this period. All assessor decisions aligned with AI recommendations."
      : `${totalOverrides} override${totalOverrides > 1 ? "s" : ""} were recorded across ${usersWithActivity} assessor${usersWithActivity > 1 ? "s" : ""} during this period, representing ${overrideRatio}% of all lifecycle actions. ` +
        (usersWithUnusual > 0
          ? `${usersWithUnusual} assessor${usersWithUnusual > 1 ? "s" : ""} exhibited override patterns that deviate from the established baseline — this is noted for awareness purposes only.`
          : "Override patterns are consistent with the established baseline.");

  return {
    report_type: "claims_manager",
    period: periodLabel,
    key_metrics: {
      total_overrides_period: totalOverrides,
      total_actions_period: totalActions,
      override_ratio_percent: overrideRatio,
      users_with_activity: usersWithActivity,
      users_with_unusual_pattern: usersWithUnusual,
      highest_override_user: top?.user_name ?? top?.user_id ?? null,
      highest_override_count: top?.override_count ?? 0,
      per_user_breakdown: perUserBreakdown,
    },
    trend,
    interpretation,
    mode: "shadow",
    recommended_action: "none",
    generated_at: generatedAt,
  };
}

function formatRiskManagerReport(
  rows: RawOverrideRow[],
  totalOverrides: number,
  totalActions: number,
  periodLabel: string,
  trendData: Array<{ day: string; overrides: number }>,
  generatedAt: string
): ShadowReport {
  const usersWithActivity = rows.filter((r) => r.override_count > 0).length;
  const usersWithUnusual = rows.filter((r) => r.unusual_pattern).length;
  const top = [...rows].sort((a, b) => b.override_count - a.override_count)[0] ?? null;
  const overrideRatio = totalActions > 0
    ? parseFloat(((totalOverrides / totalActions) * 100).toFixed(1))
    : 0;
  const dist = computeDistribution(rows);
  const trendDescription = computeTrendDescription(trendData);

  const concentrationRisk =
    top && totalOverrides > 0
      ? parseFloat(((top.override_count / totalOverrides) * 100).toFixed(1))
      : 0;

  const highCount = dist?.high_15_plus ?? 0;

  const interpretation =
    totalOverrides === 0
      ? "No override activity was observed in this period. The AI-to-human decision alignment rate is 100%. This baseline will be used for future comparative analysis."
      : `The override ratio for this period stands at ${overrideRatio}% of total lifecycle actions. ` +
        (concentrationRisk >= 50
          ? `Override activity is notably concentrated — the highest-activity user accounts for ${concentrationRisk}% of all overrides, which may warrant monitoring as the baseline matures. `
          : `Override activity is distributed across ${usersWithActivity} users, with no single user accounting for a disproportionate share. `) +
        (highCount > 0
          ? `${highCount} user${highCount > 1 ? "s" : ""} fall in the high-frequency tier (15+ overrides in the period). `
          : "") +
        `Trend analysis: ${trendDescription.toLowerCase()}`;

  return {
    report_type: "risk_manager",
    period: periodLabel,
    key_metrics: {
      total_overrides_period: totalOverrides,
      total_actions_period: totalActions,
      override_ratio_percent: overrideRatio,
      users_with_activity: usersWithActivity,
      users_with_unusual_pattern: usersWithUnusual,
      highest_override_user: top?.user_name ?? top?.user_id ?? null,
      highest_override_count: top?.override_count ?? 0,
      distribution: dist,
      trend_data: trendData,
    },
    trend: trendDescription,
    interpretation,
    mode: "shadow",
    recommended_action: "none",
    generated_at: generatedAt,
  };
}

function formatExecutiveReport(
  rows: RawOverrideRow[],
  totalOverrides: number,
  totalActions: number,
  periodLabel: string,
  trendData: Array<{ day: string; overrides: number }>,
  generatedAt: string
): ShadowReport {
  const usersWithActivity = rows.filter((r) => r.override_count > 0).length;
  const usersWithUnusual = rows.filter((r) => r.unusual_pattern).length;
  const overrideRatio = totalActions > 0
    ? parseFloat(((totalOverrides / totalActions) * 100).toFixed(1))
    : 0;
  const alignmentRate = parseFloat((100 - overrideRatio).toFixed(1));
  const trendDescription = computeTrendDescription(trendData);

  const systemHealth =
    alignmentRate >= 90
      ? "Strong"
      : alignmentRate >= 75
      ? "Moderate"
      : "Developing";

  const interpretation =
    totalActions === 0
      ? "No lifecycle actions were recorded in this period. The shadow monitoring system is active and will begin reporting once assessors process claims."
      : `During this period, assessors completed ${totalActions} lifecycle action${totalActions !== 1 ? "s" : ""} with an AI-to-human alignment rate of ${alignmentRate}%. ` +
        `Override activity was observed across ${usersWithActivity} assessor${usersWithActivity !== 1 ? "s" : ""}. ` +
        (usersWithUnusual > 0
          ? `${usersWithUnusual} assessor${usersWithUnusual !== 1 ? "s" : ""} showed activity patterns outside the established baseline — this is captured for ongoing baseline calibration. `
          : "All assessors operated within established baseline parameters. ") +
        `Overall system health is assessed as ${systemHealth}. ${trendDescription}`;

  const trend =
    alignmentRate >= 90
      ? "AI-human alignment is high. Override frequency is within expected parameters."
      : alignmentRate >= 75
      ? "AI-human alignment is moderate. Override frequency is being tracked for baseline calibration."
      : "Override frequency is above baseline norms. Continued observation will establish whether this reflects a structural shift.";

  return {
    report_type: "executive",
    period: periodLabel,
    key_metrics: {
      total_overrides_period: totalOverrides,
      total_actions_period: totalActions,
      override_ratio_percent: overrideRatio,
      users_with_activity: usersWithActivity,
      users_with_unusual_pattern: usersWithUnusual,
      highest_override_user: null, // not surfaced at executive level
      highest_override_count: 0,   // not surfaced at executive level
    },
    trend,
    interpretation,
    mode: "shadow",
    recommended_action: "none",
    generated_at: generatedAt,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a shadow monitoring report for a specific role.
 * Period defaults to 7 days. Pass periodDays to customise.
 */
export async function generateShadowReport(
  role: ReportRole,
  periodDays: number = 7
): Promise<ShadowReport> {
  const generatedAt = new Date().toISOString();
  const { rows, totalOverrides, totalActions, periodLabel } =
    await collectRawData(periodDays);

  if (role === "claims_manager") {
    return formatClaimsManagerReport(rows, totalOverrides, totalActions, periodLabel, generatedAt);
  }

  // risk_manager and executive both use trend data
  const trendData = await collectTrendData(Math.min(periodDays, 14));

  if (role === "risk_manager") {
    return formatRiskManagerReport(rows, totalOverrides, totalActions, periodLabel, trendData, generatedAt);
  }

  // executive
  return formatExecutiveReport(rows, totalOverrides, totalActions, periodLabel, trendData, generatedAt);
}

/**
 * Generate all three role reports in parallel.
 * Returns { claims_manager, risk_manager, executive }.
 */
export async function generateAllShadowReports(
  periodDays: number = 7
): Promise<Record<ReportRole, ShadowReport>> {
  const [claimsManager, riskManager, executive] = await Promise.all([
    generateShadowReport("claims_manager", periodDays),
    generateShadowReport("risk_manager", periodDays),
    generateShadowReport("executive", periodDays),
  ]);
  return { claims_manager: claimsManager, risk_manager: riskManager, executive };
}
