/**
 * Usage Aggregator Service
 * Monthly aggregation of usage events for billing and analytics
 */

import { eq, and, gte, lte, count, sum } from "drizzle-orm";
import { getDb } from "../db";
import { usageEvents } from "../../drizzle/schema";

export interface MonthlySummary {
  tenantId: string;
  month: string; // YYYY-MM format
  claimCount: number;
  aiEvaluations: number;
  fastTrackCount: number;
  autoApprovalCount: number;
  assessorPremiumUsage: number;
  fleetUsage: number;
  agencyCommissionEvents: number;
  totalEvents: number;
  periodStart: Date;
  periodEnd: Date;
}

/**
 * Generate monthly usage summary for a tenant
 */
export async function generateMonthlySummary(
  tenantId: string,
  month: string // YYYY-MM format
): Promise<MonthlySummary> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database connection not available");
  }

  // Parse month and calculate date range
  const [year, monthNum] = month.split("-").map(Number);
  const periodStart = new Date(year, monthNum - 1, 1);
  const periodEnd = new Date(year, monthNum, 0, 23, 59, 59, 999);

  // Aggregate events by type
  const eventCounts = await db
    .select({
      eventType: usageEvents.eventType,
      count: count(),
      totalQuantity: sum(usageEvents.quantity),
    })
    .from(usageEvents)
    .where(
      and(
        eq(usageEvents.tenantId, tenantId),
        gte(usageEvents.timestamp, periodStart),
        lte(usageEvents.timestamp, periodEnd)
      )
    )
    .groupBy(usageEvents.eventType);

  // Build summary object
  const summary: MonthlySummary = {
    tenantId,
    month,
    claimCount: 0,
    aiEvaluations: 0,
    fastTrackCount: 0,
    autoApprovalCount: 0,
    assessorPremiumUsage: 0,
    fleetUsage: 0,
    agencyCommissionEvents: 0,
    totalEvents: 0,
    periodStart,
    periodEnd,
  };

  // Map event counts to summary fields
  for (const row of eventCounts) {
    const eventCount = Number(row.count);
    const quantity = Number(row.totalQuantity || row.count);

    switch (row.eventType) {
      case "CLAIM_PROCESSED":
        summary.claimCount = eventCount;
        break;
      case "AI_EVALUATED":
        summary.aiEvaluations = eventCount;
        break;
      case "FAST_TRACK_TRIGGERED":
        summary.fastTrackCount = eventCount;
        break;
      case "AUTO_APPROVED":
        summary.autoApprovalCount = eventCount;
        break;
      case "ASSESSOR_TOOL_USED":
        summary.assessorPremiumUsage = quantity;
        break;
      case "FLEET_VEHICLE_ACTIVE":
        summary.fleetUsage = quantity;
        break;
      case "AGENCY_POLICY_BOUND":
        summary.agencyCommissionEvents = eventCount;
        break;
    }

    summary.totalEvents += eventCount;
  }

  return summary;
}

/**
 * Generate monthly summaries for multiple months
 */
export async function generateMonthlySummaries(
  tenantId: string,
  startMonth: string, // YYYY-MM
  endMonth: string // YYYY-MM
): Promise<MonthlySummary[]> {
  const summaries: MonthlySummary[] = [];

  const [startYear, startMonthNum] = startMonth.split("-").map(Number);
  const [endYear, endMonthNum] = endMonth.split("-").map(Number);

  let currentYear = startYear;
  let currentMonth = startMonthNum;

  while (
    currentYear < endYear ||
    (currentYear === endYear && currentMonth <= endMonthNum)
  ) {
    const monthStr = `${currentYear}-${String(currentMonth).padStart(2, "0")}`;
    const summary = await generateMonthlySummary(tenantId, monthStr);
    summaries.push(summary);

    // Move to next month
    currentMonth++;
    if (currentMonth > 12) {
      currentMonth = 1;
      currentYear++;
    }
  }

  return summaries;
}

/**
 * Get current month summary
 */
export async function getCurrentMonthSummary(
  tenantId: string
): Promise<MonthlySummary> {
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return generateMonthlySummary(tenantId, month);
}

/**
 * Get usage trends (last N months)
 */
export async function getUsageTrends(
  tenantId: string,
  monthsBack: number = 6
): Promise<MonthlySummary[]> {
  const now = new Date();
  const endMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const startDate = new Date(now.getFullYear(), now.getMonth() - monthsBack + 1, 1);
  const startMonth = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, "0")}`;

  return generateMonthlySummaries(tenantId, startMonth, endMonth);
}
