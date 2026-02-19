# Dashboard Endpoints Audit Report

**Generated:** 2/19/2026, 4:53:25 AM

## Executive Summary

- **Total Dashboards Audited:** 8
- **Health Status:**
  - ✅ PASS: 0
  - ⚠️  WARN: 8
  - ❌ FAIL: 0
- **Mock Data Detected:** 2 dashboard(s)
- **High Performance Risk:** 8 dashboard(s)
- **Fixes Required:** 8 dashboard(s)

---

## Dashboard Details

### Overview

**Router File:** `analytics.ts`

**Procedures:** getExecutiveKPIs, getOverviewMetrics

| Metric | Status | Details |
|--------|--------|----------|
| **Data Source Tables** | ✅ | claims, users, panelBeaters |
| **Query Health** | ⚠️ WARN | 181 potential null-unsafe property accesses; No empty dataset handling detected |
| **Index Required** | ⚠️  YES | leftJoin on panelBeaters.id = panelBeaterQuotes.panelBeaterId (neither column indexed) |
| **Mock Data** | ✅ NO | Real DB queries confirmed |
| **Performance Risk** | ❌ HIGH | Unindexed join: panelBeaters.id = panelBeaterQuotes.panelBeaterId; N+1 query detected in loop; N+1 query detected in loop |
| **N+1 Patterns** | ❌ DETECTED | Found 1 potential N+1 query pattern(s); Found 2 potential N+1 query pattern(s) |
| **Fix Required** | ⚠️  YES | Add index on panelBeaters.id or panelBeaterQuotes.panelBeaterId; Add null safety checks (optional chaining, nullish coalescing); Refactor to use batch queries or joins; Refactor to use batch queries or joins; Add empty dataset checks and fallback values |

### Analytics

**Router File:** `analytics.ts`

**Procedures:** getKPIs, getClaimsByComplexity, getSLACompliance, getFraudMetrics, getCostSavings

| Metric | Status | Details |
|--------|--------|----------|
| **Data Source Tables** | ✅ | claims, users, panelBeaters |
| **Query Health** | ⚠️ WARN | 181 potential null-unsafe property accesses; No empty dataset handling detected |
| **Index Required** | ⚠️  YES | leftJoin on panelBeaters.id = panelBeaterQuotes.panelBeaterId (neither column indexed) |
| **Mock Data** | ✅ NO | Real DB queries confirmed |
| **Performance Risk** | ❌ HIGH | Unindexed join: panelBeaters.id = panelBeaterQuotes.panelBeaterId; N+1 query detected in loop; N+1 query detected in loop |
| **N+1 Patterns** | ❌ DETECTED | Found 1 potential N+1 query pattern(s); Found 2 potential N+1 query pattern(s) |
| **Fix Required** | ⚠️  YES | Add index on panelBeaters.id or panelBeaterQuotes.panelBeaterId; Add null safety checks (optional chaining, nullish coalescing); Refactor to use batch queries or joins; Refactor to use batch queries or joins; Add empty dataset checks and fallback values |

### Critical Alerts

**Router File:** `analytics.ts`

**Procedures:** getCriticalAlerts, getHighRiskClaims

| Metric | Status | Details |
|--------|--------|----------|
| **Data Source Tables** | ✅ | claims, users, panelBeaters |
| **Query Health** | ⚠️ WARN | 181 potential null-unsafe property accesses; No empty dataset handling detected |
| **Index Required** | ⚠️  YES | leftJoin on panelBeaters.id = panelBeaterQuotes.panelBeaterId (neither column indexed) |
| **Mock Data** | ✅ NO | Real DB queries confirmed |
| **Performance Risk** | ❌ HIGH | Unindexed join: panelBeaters.id = panelBeaterQuotes.panelBeaterId; N+1 query detected in loop; N+1 query detected in loop |
| **N+1 Patterns** | ❌ DETECTED | Found 1 potential N+1 query pattern(s); Found 2 potential N+1 query pattern(s) |
| **Fix Required** | ⚠️  YES | Add index on panelBeaters.id or panelBeaterQuotes.panelBeaterId; Add null safety checks (optional chaining, nullish coalescing); Refactor to use batch queries or joins; Refactor to use batch queries or joins; Add empty dataset checks and fallback values |

### Assessors

**Router File:** `analytics.ts`

**Procedures:** getAssessorPerformance, getAssessorLeaderboard

| Metric | Status | Details |
|--------|--------|----------|
| **Data Source Tables** | ✅ | claims, users, panelBeaters |
| **Query Health** | ⚠️ WARN | 181 potential null-unsafe property accesses; No empty dataset handling detected |
| **Index Required** | ⚠️  YES | leftJoin on panelBeaters.id = panelBeaterQuotes.panelBeaterId (neither column indexed) |
| **Mock Data** | ✅ NO | Real DB queries confirmed |
| **Performance Risk** | ❌ HIGH | Unindexed join: panelBeaters.id = panelBeaterQuotes.panelBeaterId; N+1 query detected in loop; N+1 query detected in loop |
| **N+1 Patterns** | ❌ DETECTED | Found 1 potential N+1 query pattern(s); Found 2 potential N+1 query pattern(s) |
| **Fix Required** | ⚠️  YES | Add index on panelBeaters.id or panelBeaterQuotes.panelBeaterId; Add null safety checks (optional chaining, nullish coalescing); Refactor to use batch queries or joins; Refactor to use batch queries or joins; Add empty dataset checks and fallback values |

### Panel Beaters

**Router File:** `panel-beater-analytics.ts`

**Procedures:** getAllPerformance, getPerformance, getTopPanelBeaters, getTrends, comparePanelBeaters

| Metric | Status | Details |
|--------|--------|----------|
| **Data Source Tables** | ✅ | panelBeaters |
| **Query Health** | ⚠️ WARN | groupBy without sql template literal: panelBeaters.id, panelBeaters.name, panelBeaters.b...; groupBy without sql template literal: panelBeaters.id, panelBeaters.name, panelBeaters.b...; groupBy without sql template literal: panelBeaters.id, panelBeaters.name...; 246 potential null-unsafe property accesses |
| **Index Required** | ⚠️  YES | leftJoin on claims.assignedPanelBeaterId = panelBeaters.id (neither column indexed); leftJoin on panelBeaterQuotes.panelBeaterId = panelBeaters.id (neither column indexed); leftJoin on claims.assignedPanelBeaterId = panelBeaters.id (neither column indexed); leftJoin on panelBeaterQuotes.panelBeaterId = panelBeaters.id (neither column indexed); leftJoin on claims.assignedPanelBeaterId = panelBeaters.id (neither column indexed); leftJoin on panelBeaterQuotes.panelBeaterId = panelBeaters.id (neither column indexed); leftJoin on claims.assignedPanelBeaterId = panelBeaters.id (neither column indexed); leftJoin on panelBeaterQuotes.panelBeaterId = panelBeaters.id (neither column indexed); leftJoin on claims.assignedPanelBeaterId = panelBeaters.id (neither column indexed); leftJoin on panelBeaterQuotes.panelBeaterId = panelBeaters.id (neither column indexed) |
| **Mock Data** | ❌ YES | Found 1 potential mock data pattern(s) |
| **Performance Risk** | ❌ HIGH | Unindexed join: claims.assignedPanelBeaterId = panelBeaters.id; Unindexed join: panelBeaterQuotes.panelBeaterId = panelBeaters.id; Unindexed join: claims.assignedPanelBeaterId = panelBeaters.id; Unindexed join: panelBeaterQuotes.panelBeaterId = panelBeaters.id; Unindexed join: claims.assignedPanelBeaterId = panelBeaters.id; Unindexed join: panelBeaterQuotes.panelBeaterId = panelBeaters.id; Unindexed join: claims.assignedPanelBeaterId = panelBeaters.id; Unindexed join: panelBeaterQuotes.panelBeaterId = panelBeaters.id; Unindexed join: claims.assignedPanelBeaterId = panelBeaters.id; Unindexed join: panelBeaterQuotes.panelBeaterId = panelBeaters.id; N+1 query detected in loop |
| **N+1 Patterns** | ❌ DETECTED | Found 3 potential N+1 query pattern(s) |
| **Fix Required** | ⚠️  YES | Replace mock data with real DB queries; Wrap groupBy arguments in sql`` template literal; Wrap groupBy arguments in sql`` template literal; Wrap groupBy arguments in sql`` template literal; Add index on claims.assignedPanelBeaterId or panelBeaters.id; Add index on panelBeaterQuotes.panelBeaterId or panelBeaters.id; Add index on claims.assignedPanelBeaterId or panelBeaters.id; Add index on panelBeaterQuotes.panelBeaterId or panelBeaters.id; Add index on claims.assignedPanelBeaterId or panelBeaters.id; Add index on panelBeaterQuotes.panelBeaterId or panelBeaters.id; Add index on claims.assignedPanelBeaterId or panelBeaters.id; Add index on panelBeaterQuotes.panelBeaterId or panelBeaters.id; Add index on claims.assignedPanelBeaterId or panelBeaters.id; Add index on panelBeaterQuotes.panelBeaterId or panelBeaters.id; Add null safety checks (optional chaining, nullish coalescing); Refactor to use batch queries or joins |

### Financials

**Router File:** `analytics.ts`

**Procedures:** getFinancialMetrics, getCostSavings, getRevenueAnalytics

| Metric | Status | Details |
|--------|--------|----------|
| **Data Source Tables** | ✅ | claims, users, panelBeaters |
| **Query Health** | ⚠️ WARN | 181 potential null-unsafe property accesses; No empty dataset handling detected |
| **Index Required** | ⚠️  YES | leftJoin on panelBeaters.id = panelBeaterQuotes.panelBeaterId (neither column indexed) |
| **Mock Data** | ✅ NO | Real DB queries confirmed |
| **Performance Risk** | ❌ HIGH | Unindexed join: panelBeaters.id = panelBeaterQuotes.panelBeaterId; N+1 query detected in loop; N+1 query detected in loop |
| **N+1 Patterns** | ❌ DETECTED | Found 1 potential N+1 query pattern(s); Found 2 potential N+1 query pattern(s) |
| **Fix Required** | ⚠️  YES | Add index on panelBeaters.id or panelBeaterQuotes.panelBeaterId; Add null safety checks (optional chaining, nullish coalescing); Refactor to use batch queries or joins; Refactor to use batch queries or joins; Add empty dataset checks and fallback values |

### Governance

**Router File:** `governance-dashboard.ts`

**Procedures:** getOverrideMetrics, getSegregationMetrics, getRoleChangeMetrics

| Metric | Status | Details |
|--------|--------|----------|
| **Data Source Tables** | ✅ | workflowAuditTrail, claimInvolvementTracking, stages, users, userSet, allUserIds, roleAssignmentAudit |
| **Query Health** | ⚠️ WARN | groupBy without sql template literal: workflowAuditTrail.userId, users.name...; groupBy without sql template literal: workflowAuditTrail.userId...; groupBy without sql template literal: workflowAuditTrail.userId, users.name...; groupBy without sql template literal: workflowAuditTrail.overrideReason...; groupBy without sql template literal: roleAssignmentAudit.changedByUserId, users.name...; groupBy without sql template literal: roleAssignmentAudit.previousRole,
              ro...; 406 potential null-unsafe property accesses |
| **Index Required** | ✅ NO | All joins use indexed columns |
| **Mock Data** | ❌ YES | Found 6 potential mock data pattern(s) |
| **Performance Risk** | ❌ HIGH | N+1 query detected in loop; N+1 query detected in loop; N+1 query detected in loop |
| **N+1 Patterns** | ❌ DETECTED | Found 1 potential N+1 query pattern(s); Found 13 potential N+1 query pattern(s); Found 6 potential N+1 query pattern(s) |
| **Fix Required** | ⚠️  YES | Replace mock data with real DB queries; Wrap groupBy arguments in sql`` template literal; Wrap groupBy arguments in sql`` template literal; Wrap groupBy arguments in sql`` template literal; Wrap groupBy arguments in sql`` template literal; Wrap groupBy arguments in sql`` template literal; Wrap groupBy arguments in sql`` template literal; Add null safety checks (optional chaining, nullish coalescing); Refactor to use batch queries or joins; Refactor to use batch queries or joins; Refactor to use batch queries or joins |

### Executive

**Router File:** `analytics.ts`

**Procedures:** getExecutiveKPIs, getExecutiveDashboard, getStrategicInsights

| Metric | Status | Details |
|--------|--------|----------|
| **Data Source Tables** | ✅ | claims, users, panelBeaters |
| **Query Health** | ⚠️ WARN | 181 potential null-unsafe property accesses; No empty dataset handling detected |
| **Index Required** | ⚠️  YES | leftJoin on panelBeaters.id = panelBeaterQuotes.panelBeaterId (neither column indexed) |
| **Mock Data** | ✅ NO | Real DB queries confirmed |
| **Performance Risk** | ❌ HIGH | Unindexed join: panelBeaters.id = panelBeaterQuotes.panelBeaterId; N+1 query detected in loop; N+1 query detected in loop |
| **N+1 Patterns** | ❌ DETECTED | Found 1 potential N+1 query pattern(s); Found 2 potential N+1 query pattern(s) |
| **Fix Required** | ⚠️  YES | Add index on panelBeaters.id or panelBeaterQuotes.panelBeaterId; Add null safety checks (optional chaining, nullish coalescing); Refactor to use batch queries or joins; Refactor to use batch queries or joins; Add empty dataset checks and fallback values |

---

## Recommendations

### 🔴 Critical: Replace Mock Data

2 dashboard(s) contain mock data patterns. Replace with real database queries to ensure accurate reporting.

### 🔴 High Priority: Performance Optimization

8 dashboard(s) have high performance risk. Address N+1 patterns and add missing indexes.

### ⚠️  Medium Priority: Query Health

8 dashboard(s) have query health warnings. Review groupBy syntax and null safety.

---

## Audit Methodology

This audit script analyzes router files for:

1. **Real DB Queries:** Detects mock data patterns (hardcoded arrays, TODO comments)
2. **GroupBy Syntax:** Validates sql`` template literal usage
3. **Indexed Joins:** Checks if join columns are indexed
4. **Null Safety:** Counts optional chaining and nullish coalescing usage
5. **N+1 Patterns:** Detects await db calls inside loops
6. **Empty Dataset Handling:** Verifies length checks and fallback values

