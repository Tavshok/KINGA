/**
 * KINGA — ResolvedPlatformReportCollection
 *
 * PURPOSE
 * ───────
 * The only read contract for approved aggregate reports. It converts a bounded
 * set of claim and latest-assessment source fields into named portfolio, fraud,
 * and elapsed-processing measures. Raw rows never leave this module.
 *
 * AUTHORITY
 * ─────────
 * Tenant reports require one session-derived tenant ID. Platform-global reports
 * require an explicit, reporting-router-issued platform-super-admin authority
 * object whose anchor tenant is recorded in the report audit trail.
 *
 * NEVER
 * ─────
 * Never use this collection for SAR/privacy reporting. Never call it from a
 * renderer without authority. Never describe created-to-updated elapsed time as
 * complete workflow-transition history.
 */

import mysql from "mysql2/promise";
import type { FraudRiskLevel } from "../../shared/fraudScoring";
import { normaliseReportData, type NormalisedReportData } from "../report-normalisation";

const DB_URL = process.env.DATABASE_URL!;
const IN_PROGRESS_STATUSES = new Set(["in_review", "assessment_in_progress", "submitted"]);
const HIGH_RISK_LEVELS = new Set<FraudRiskLevel>(["high", "elevated"]);

export type ResolvedPlatformReportAuthority =
  | Readonly<{ kind: "tenant"; tenantId: string }>
  | Readonly<{
      kind: "platform_global";
      auditTenantId: string;
      actorId: number;
      actorRole: "admin" | "platform_super_admin";
    }>;

export interface PlatformReportFilters {
  fromTs?: number;
  toTs?: number;
}

export interface IncidentTypeAggregate {
  incidentType: string;
  claimCount: number;
  aiEstimatedValueUsd: number;
}

export interface FraudRiskAggregate {
  riskLevel: FraudRiskLevel | "unassessed";
  claimCount: number;
  averageScore: number | null;
}

export interface DwellTimeAggregate {
  status: string;
  claimCount: number;
  /** Elapsed from claim creation to latest update; not historical time-in-state. */
  averageElapsedHours: number;
  maximumElapsedHours: number;
}

export interface PortfolioAggregate {
  totalClaims: number;
  activeInsurerCount: number;
  approvedCount: number;
  rejectedCount: number;
  inProgressCount: number;
  settledCount: number;
  assessedClaimCount: number;
  aiEstimatedValueUsd: number;
  averageFraudScore: number | null;
  highRiskClaimCount: number;
  averageConfidenceScore: number | null;
  incidentTypes: readonly IncidentTypeAggregate[];
}

export interface ResolvedPlatformReportCollection {
  authority: ResolvedPlatformReportAuthority;
  filters: Readonly<{ fromTs: number | null; toTs: number | null }>;
  portfolio: PortfolioAggregate;
  fraudRiskDistribution: readonly FraudRiskAggregate[];
  dwellTimeByStatus: readonly DwellTimeAggregate[];
}

type AggregateRecord = {
  tenantId: string;
  status: string;
  incidentType: string;
  confidenceScore: number | null;
  createdAt: number | null;
  updatedAt: number | null;
  assessmentPresent: boolean;
  normalised: NormalisedReportData | null;
};

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asTimestamp(value: unknown): number | null {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function parseObject(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function average(values: readonly number[]): number | null {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : null;
}

function assertAuthority(authority: ResolvedPlatformReportAuthority): void {
  if (authority.kind === "tenant") {
    if (!authority.tenantId.trim()) throw new Error("Tenant scope is required for aggregate reporting");
    return;
  }
  if (!authority.auditTenantId.trim() || !Number.isInteger(authority.actorId) || authority.actorId <= 0) {
    throw new Error("Explicit platform-super-admin aggregate authority is required");
  }
  if (authority.actorRole !== "admin" && authority.actorRole !== "platform_super_admin") {
    throw new Error("Platform-global aggregate reporting requires a platform-super-admin authority decision");
  }
}

function whereClause(authority: ResolvedPlatformReportAuthority, filters: PlatformReportFilters): { sql: string; values: unknown[] } {
  const clauses = ["c.tenant_id IS NOT NULL"];
  const values: unknown[] = [];
  if (authority.kind === "tenant") {
    clauses.push("c.tenant_id = ?");
    values.push(authority.tenantId);
  }
  if (filters.fromTs !== undefined) { clauses.push("c.created_at >= ?"); values.push(filters.fromTs); }
  if (filters.toTs !== undefined) { clauses.push("c.created_at <= ?"); values.push(filters.toTs); }
  return { sql: clauses.join(" AND "), values };
}

const LATEST_ASSESSMENT_SOURCE = `
  LEFT JOIN (
    SELECT ranked.*
    FROM (
      SELECT a.*,
             ROW_NUMBER() OVER (
               PARTITION BY a.claim_id, a.tenant_id
               ORDER BY a.created_at DESC, a.id DESC
             ) AS assessment_rank
      FROM ai_assessments a
    ) ranked
    WHERE ranked.assessment_rank = 1
  ) a ON a.claim_id = c.id AND a.tenant_id = c.tenant_id`;

function toAggregateRecord(row: Record<string, unknown>): AggregateRecord {
  const assessmentPresent = row.assessment_id !== null && row.assessment_id !== undefined;
  const normalised = assessmentPresent
    ? normaliseReportData({
        estimatedCost: asNumber(row.estimated_cost),
        estimatedPartsCost: asNumber(row.parts_cost),
        estimatedLaborCost: asNumber(row.labor_cost),
        fraudScore: asNumber(row.fraud_score),
        fraudRiskLevel: asString(row.fraud_risk_level),
        recommendation: asString(row.recommendation),
        currencyCode: asString(row.assessment_currency_code),
        costIntelligenceJson: parseObject(row.cost_intelligence_json) as any,
        fraudScoreBreakdownJson: parseObject(row.fraud_score_breakdown_json) as any,
        causalVerdictJson: parseObject(row.claim_truth_json) as any,
        validatedOutcomeJson: parseObject(row.decision_authority_json) as any,
      })
    : null;
  return {
    tenantId: String(row.tenant_id),
    status: asString(row.status) ?? "Unknown",
    incidentType: asString(row.incident_type) ?? "Unknown",
    confidenceScore: asNumber(row.confidence_score),
    createdAt: asTimestamp(row.created_at),
    updatedAt: asTimestamp(row.updated_at),
    assessmentPresent,
    normalised,
  };
}

function summarisePortfolio(records: readonly AggregateRecord[]): PortfolioAggregate {
  const incidentTypes = new Map<string, { claimCount: number; aiEstimatedValueUsd: number }>();
  const fraudScores: number[] = [];
  const confidenceScores: number[] = [];
  const activeTenants = new Set<string>();
  let approvedCount = 0;
  let rejectedCount = 0;
  let inProgressCount = 0;
  let settledCount = 0;
  let aiEstimatedValueUsd = 0;
  let highRiskClaimCount = 0;

  for (const record of records) {
    activeTenants.add(record.tenantId);
    if (record.status === "approved") approvedCount += 1;
    if (record.status === "rejected") rejectedCount += 1;
    if (record.status === "settled") settledCount += 1;
    if (IN_PROGRESS_STATUSES.has(record.status)) inProgressCount += 1;
    if (record.confidenceScore !== null) confidenceScores.push(record.confidenceScore);

    const estimated = record.normalised?.costs.aiEstimateUsd ?? 0;
    aiEstimatedValueUsd += estimated;
    const incident = incidentTypes.get(record.incidentType) ?? { claimCount: 0, aiEstimatedValueUsd: 0 };
    incident.claimCount += 1;
    incident.aiEstimatedValueUsd += estimated;
    incidentTypes.set(record.incidentType, incident);

    if (record.normalised) {
      fraudScores.push(record.normalised.fraud.score);
      if (HIGH_RISK_LEVELS.has(record.normalised.fraud.level)) highRiskClaimCount += 1;
    }
  }

  return {
    totalClaims: records.length,
    activeInsurerCount: activeTenants.size,
    approvedCount,
    rejectedCount,
    inProgressCount,
    settledCount,
    assessedClaimCount: fraudScores.length,
    aiEstimatedValueUsd,
    averageFraudScore: average(fraudScores),
    highRiskClaimCount,
    averageConfidenceScore: average(confidenceScores),
    incidentTypes: [...incidentTypes.entries()]
      .map(([incidentType, values]) => ({ incidentType, ...values }))
      .sort((left, right) => right.claimCount - left.claimCount || left.incidentType.localeCompare(right.incidentType)),
  };
}

function summariseFraudRisk(records: readonly AggregateRecord[]): readonly FraudRiskAggregate[] {
  const groups = new Map<FraudRiskAggregate["riskLevel"], { claimCount: number; scores: number[] }>();
  for (const record of records) {
    const riskLevel = record.normalised?.fraud.level ?? "unassessed";
    const group = groups.get(riskLevel) ?? { claimCount: 0, scores: [] };
    group.claimCount += 1;
    if (record.normalised) group.scores.push(record.normalised.fraud.score);
    groups.set(riskLevel, group);
  }
  const order: ReadonlyArray<FraudRiskAggregate["riskLevel"]> = ["elevated", "high", "moderate", "low", "minimal", "unassessed"];
  return order.filter((level) => groups.has(level)).map((riskLevel) => {
    const group = groups.get(riskLevel)!;
    return { riskLevel, claimCount: group.claimCount, averageScore: average(group.scores) };
  });
}

function summariseDwellTime(records: readonly AggregateRecord[]): readonly DwellTimeAggregate[] {
  const groups = new Map<string, number[]>();
  for (const record of records) {
    if (record.createdAt === null || record.updatedAt === null) continue;
    const elapsedHours = Math.max(0, (record.updatedAt - record.createdAt) / 3_600_000);
    const group = groups.get(record.status) ?? [];
    group.push(elapsedHours);
    groups.set(record.status, group);
  }
  return [...groups.entries()]
    .map(([status, elapsedHours]) => ({
      status,
      claimCount: elapsedHours.length,
      averageElapsedHours: average(elapsedHours) ?? 0,
      maximumElapsedHours: elapsedHours.length ? Math.max(...elapsedHours) : 0,
    }))
    .sort((left, right) => right.averageElapsedHours - left.averageElapsedHours || left.status.localeCompare(right.status));
}

export async function resolvePlatformReportCollection(input: {
  authority: ResolvedPlatformReportAuthority;
  filters?: PlatformReportFilters;
}): Promise<ResolvedPlatformReportCollection> {
  assertAuthority(input.authority);
  const filters = input.filters ?? {};
  const scope = whereClause(input.authority, filters);
  const conn = await mysql.createConnection(DB_URL);
  try {
    const [rows] = await conn.execute(
      `SELECT c.tenant_id, c.status, c.incident_type, c.confidence_score, c.created_at, c.updated_at,
              a.id AS assessment_id, a.estimated_cost, a.parts_cost, a.labor_cost,
              a.fraud_score, a.fraud_risk_level, a.recommendation,
              a.currency_code AS assessment_currency_code, a.cost_intelligence_json,
              a.fraud_score_breakdown_json, a.claim_truth_json, a.decision_authority_json
         FROM claims c
         ${LATEST_ASSESSMENT_SOURCE}
        WHERE ${scope.sql}`,
      scope.values,
    ) as [Record<string, unknown>[], unknown];
    const records = rows.map(toAggregateRecord);
    return {
      authority: input.authority,
      filters: { fromTs: filters.fromTs ?? null, toTs: filters.toTs ?? null },
      portfolio: summarisePortfolio(records),
      fraudRiskDistribution: summariseFraudRisk(records),
      dwellTimeByStatus: summariseDwellTime(records),
    };
  } finally {
    await conn.end();
  }
}
