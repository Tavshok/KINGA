# Executive Dashboard Diagnostic Report

**Mode:** READ-ONLY ANALYSIS  
**Date:** 2026-02-18  
**Objective:** Identify tRPC endpoint mismatches without implementing fixes

---

## Diagnostic Summary

**Total Modules Analyzed:** 8  
**Total Endpoints Traced:** 8  
**Critical Mismatches Found:** 0  
**Warnings Found:** 1 (Governance mock data)

---

## Detailed Analysis

| Module | Endpoint | Expected Shape | Actual Shape | Root Cause | Fix Required |
|--------|----------|----------------|--------------|------------|--------------|
| **Overview (KPIs)** | `trpc.analytics.getKPIs.useQuery({})` | `{ data: { summaryMetrics: { totalClaims, completedClaims, activeClaims, fraudDetected, avgProcessingTime, totalSavings, highValueClaims, completionRate, totalExecutiveOverrides, segregationViolationAttempts, roleChangesLast30Days, overrideRatePercentage } } }` | `{ data: { summaryMetrics: { totalClaims, completedClaims, activeClaims, fraudDetected, avgProcessingTime, totalSavings, highValueClaims, completionRate, totalExecutiveOverrides, segregationViolationAttempts, roleChangesLast30Days, overrideRatePercentage }, trends: {}, riskIndicators: { fraudDetectionRate, highValueClaimRate }, fraudSignals: { highRiskCount } } }` | ✅ **MATCH** - Frontend accesses `kpisResponse?.data?.summaryMetrics` which exists in backend response | None |
| **Critical Alerts** | `trpc.analytics.getCriticalAlerts.useQuery()` | `{ data: { riskIndicators: { highValuePending, highFraudRisk, disputedClaims, stuckClaims } } }` | `{ data: { summaryMetrics: { totalAlerts }, trends: {}, riskIndicators: { highValuePending: [...], highFraudRisk: [...], disputedClaims: [...], stuckClaims: [...] }, fraudSignals: { highRiskCount } } }` | ✅ **MATCH** - Frontend accesses `alertsResponse?.data?.riskIndicators` which exists | None |
| **Assessors** | `trpc.analytics.getAssessorPerformance.useQuery()` | `{ data: { assessors: [{ id, name, email, performanceScore, totalAssessments, accuracyScore, avgCompletionTime, tier }] } }` | `{ data: { summaryMetrics: { totalAssessors }, trends: {}, riskIndicators: {}, fraudSignals: {}, assessors: [{ id, name, email, performanceScore, totalAssessments, accuracyScore, avgCompletionTime, tier }] } }` | ✅ **MATCH** - Frontend accesses `assessorPerfResponse?.data?.assessors` which exists | None |
| **Panel Beaters** | `trpc.analytics.getPanelBeaterAnalytics.useQuery()` | `{ data: { panelBeaters: [{ id, name, totalQuotes, avgQuoteAmount, acceptedQuotes, acceptanceRate }] } }` | `{ data: { summaryMetrics: { totalPanelBeaters }, trends: {}, riskIndicators: {}, fraudSignals: {}, panelBeaters: [{ id, name, totalQuotes, avgQuoteAmount, acceptedQuotes, acceptanceRate }] } }` | ✅ **MATCH** - Frontend accesses `panelBeaterAnalyticsResponse?.data?.panelBeaters` which exists | None |
| **Financials (Cost Savings)** | `trpc.analytics.getCostSavingsTrends.useQuery()` | `{ data: { trends: { monthlySavings: [{ month, savings, claimCount, avgSavingsPerClaim }] } } }` | `{ data: { summaryMetrics: {}, trends: { monthlySavings: [{ month, savings, claimCount, avgSavingsPerClaim }] }, riskIndicators: {}, fraudSignals: {} } }` | ✅ **MATCH** - Frontend accesses `savingsTrendsResponse?.data?.trends?.monthlySavings` which exists | None |
| **Financials (Overview)** | `trpc.analytics.getFinancialOverview.useQuery()` | `{ data: { summaryMetrics: { totalPayouts, totalReserves, fraudPrevented, netExposure } } }` | `{ data: { summaryMetrics: { totalPayouts, totalReserves, fraudPrevented, netExposure }, trends: {}, riskIndicators: {}, fraudSignals: { preventedAmount } } }` | ✅ **MATCH** - Frontend accesses `financialsResponse?.data?.summaryMetrics` which exists | None |
| **Governance Summary** | `trpc.governance.getGovernanceSummary.useQuery()` | `{ data: { totalOverrides: { value, trend, previousValue }, overrideRate: { value, trend, previousValue }, segregationViolations: { value, trend, previousValue }, roleChanges: { value, trend, previousValue }, involvementConflicts: { value, trend, previousValue } } }` | `{ success: true, data: { totalOverrides: { value: 12, trend: "down", previousValue: 18 }, overrideRate: { value: 3.2, trend: "stable", previousValue: 3.4 }, segregationViolations: { value: 5, trend: "down", previousValue: 8 }, roleChanges: { value: 7, trend: "up", previousValue: 4 }, involvementConflicts: { value: 2, trend: "stable", previousValue: 2 } } }` | ⚠️ **WARNING** - Backend returns **MOCK DATA** (hardcoded values, not real database queries). Frontend expects real governance metrics from `workflow_audit_trail` and `role_assignment_audit` tables. | **Replace mock data with real queries** - Query `workflow_audit_trail` for executive overrides, `claim_involvement_tracking` for segregation violations, `role_assignment_audit` for role changes |
| **Workflow Bottlenecks** | `trpc.analytics.getWorkflowBottlenecks.useQuery()` | `{ data: { riskIndicators: { bottlenecks: [{ state, count, avgDaysInState, maxDaysInState }] } } }` | `{ data: { summaryMetrics: {}, trends: {}, riskIndicators: { bottlenecks: [{ state, count, avgDaysInState, maxDaysInState }] }, fraudSignals: {} } }` | ✅ **MATCH** - Frontend accesses `bottlenecksResponse?.data?.riskIndicators?.bottlenecks` which exists | None |

---

## Technical Issues Detected

### 1. groupBy Usage
**Status:** ✅ **FIXED** (Phase 1 of Production Stabilization)  
**Details:** All `.groupBy(column)` patterns have been replaced with `.groupBy(sql\`${column}\`)` in analytics and governance routers.

### 2. Null Aggregation Fields
**Status:** ✅ **HANDLED**  
**Details:** All endpoints use `safeNumber()`, `safeString()`, and `safeArray()` helper functions to handle null values gracefully. No runtime errors from null aggregations.

### 3. leftJoin vs innerJoin Effects
**Status:** ✅ **CORRECT**  
**Details:**  
- `getCriticalAlerts` uses `leftJoin(aiAssessments, ...)` - Correct, because not all claims have AI assessments yet
- `getPanelBeaterAnalytics` uses `leftJoin(panelBeaterQuotes, ...)` - Correct, because not all panel beaters have quotes
- `getCostSavingsTrends` uses `leftJoin(aiAssessments, ...)` - Correct, with `WHERE` clause filtering for non-null values

### 4. Missing Select Fields
**Status:** ✅ **COMPLETE**  
**Details:** All endpoints select required fields. No missing fields detected.

### 5. Enum Mismatches
**Status:** ✅ **NO ISSUES**  
**Details:** Enums (`fraudRiskLevel`, `workflowState`, `status`) are used correctly in WHERE clauses. No type mismatches.

### 6. Renamed Properties
**Status:** ✅ **NO ISSUES**  
**Details:** All property mappings are consistent between frontend and backend (e.g., `businessName` → `name` in panel beaters).

---

## Performance Analysis

### Database Query Patterns

**Efficient Patterns:**
- ✅ Single aggregate queries with `COUNT(*)`, `AVG()`, `SUM()`
- ✅ Indexed columns used in WHERE clauses (`tenantId`, `status`, `workflowState`)
- ✅ Batch processing with single queries (no N+1 patterns)

**Potential Optimizations:**
- ⚠️ `getWorkflowBottlenecks` uses CTE (Common Table Expression) with `MAX(created_at)` subquery - Could benefit from materialized view for large datasets
- ⚠️ `getCostSavingsTrends` uses `DATE_FORMAT()` in GROUP BY - Consider adding computed column for month if performance degrades

### Memory Usage

**Current Approach:**
- ✅ All endpoints use `.limit(10)` for list queries (critical alerts, panel beaters)
- ✅ Aggregate queries return single rows
- ✅ Trends limited to 6 months

**Estimated Memory per Request:**
- KPIs: ~200 bytes (single row aggregates)
- Critical Alerts: ~5KB (4 arrays × 10 items)
- Assessors: ~2KB (variable, depends on assessor count)
- Panel Beaters: ~2KB (variable, depends on beater count)
- Cost Savings: ~1KB (6 months × 4 fields)
- Bottlenecks: ~500 bytes (typically 5-10 workflow states)
- Governance: ~100 bytes (mock data, minimal)

**Total Dashboard Load:** ~11KB per executive dashboard load

---

## Root Cause Analysis

### Issue: Governance Mock Data

**Location:** `server/routers/governance.ts` lines 40-99

**Current Implementation:**
```typescript
getGovernanceSummary: protectedProcedure.query(async ({ ctx }) => {
  // Mock data for now - will be replaced with real audit trail queries
  return {
    success: true,
    data: {
      totalOverrides: { value: 12, trend: "down", previousValue: 18 },
      overrideRate: { value: 3.2, trend: "stable", previousValue: 3.4 },
      segregationViolations: { value: 5, trend: "down", previousValue: 8 },
      roleChanges: { value: 7, trend: "up", previousValue: 4 },
      involvementConflicts: { value: 2, trend: "stable", previousValue: 2 },
    },
  };
});
```

**Expected Implementation:**
```typescript
// Query workflow_audit_trail for executive overrides
const [overridesResult] = await db
  .select({ count: sql<number>`COUNT(*)` })
  .from(workflowAuditTrail)
  .where(and(
    eq(workflowAuditTrail.tenantId, ctx.user.tenantId),
    eq(workflowAuditTrail.executiveOverride, true),
    gte(workflowAuditTrail.createdAt, thirtyDaysAgo)
  ));

// Query claim_involvement_tracking for segregation violations
const segregationViolations = await db
  .select({ userId: claimInvolvementTracking.userId, claimId: claimInvolvementTracking.claimId })
  .from(claimInvolvementTracking)
  .where(gte(claimInvolvementTracking.createdAt, thirtyDaysAgo))
  .groupBy(sql`${claimInvolvementTracking.userId}`, sql`${claimInvolvementTracking.claimId}`)
  .having(sql`COUNT(DISTINCT ${claimInvolvementTracking.stage}) > 1`);

// Query role_assignment_audit for role changes
const [roleChangesResult] = await db
  .select({ count: sql<number>`COUNT(*)` })
  .from(roleAssignmentAudit)
  .where(and(
    eq(roleAssignmentAudit.tenantId, ctx.user.tenantId),
    gte(roleAssignmentAudit.timestamp, thirtyDaysAgo)
  ));
```

**Impact:**
- Frontend displays **fake metrics** to executives
- No real governance monitoring
- Compliance reporting inaccurate
- Audit trail not utilized

**Fix Required:** Replace mock data with real database queries (DO NOT IMPLEMENT - DIAGNOSTIC ONLY)

---

## Conclusion

**Executive Dashboard Data Integrity:** ✅ **STABLE**

**Summary:**
- 7/8 modules have **perfect shape matching** between frontend and backend
- 1/8 modules (Governance Summary) returns **mock data** instead of real metrics
- All TypeScript interfaces align correctly
- No runtime errors from shape mismatches
- Performance is optimized with proper indexing and query limits

**Recommended Actions (DO NOT IMPLEMENT):**
1. Replace governance mock data with real queries from `workflow_audit_trail`, `claim_involvement_tracking`, and `role_assignment_audit` tables
2. Add materialized view for `getWorkflowBottlenecks` CTE if dataset grows beyond 100k claims
3. Monitor query performance in production and add caching layer if dashboard load time exceeds 2 seconds

---

## Appendix: Response Shape Verification

### createAnalyticsResponse() Wrapper

All analytics endpoints use a standardized response wrapper:

```typescript
interface AnalyticsResponse {
  success: boolean;
  data: {
    summaryMetrics: Record<string, number>;
    trends: Record<string, any[]>;
    riskIndicators: Record<string, any>;
    fraudSignals: Record<string, number>;
    [key: string]: any; // Allows additional fields like assessors, panelBeaters
  };
  metadata: {
    generatedAt: Date;
    role: string;
    dataScope: 'tenant' | 'global';
    tenantId?: string;
  };
}
```

This ensures **consistent shape** across all analytics endpoints, making frontend data access predictable.

---

**End of Diagnostic Report**
