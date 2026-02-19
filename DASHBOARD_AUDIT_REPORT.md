# Dashboard Endpoints Audit Report

**Generated:** 2/19/2026, 2:42:14 AM

## Executive Summary

- **Total Dashboards Audited:** 8
- **Health Status:**
  - ✅ PASS: 0
  - ⚠️  WARN: 7
  - ❌ FAIL: 1
- **Mock Data Detected:** 1 dashboard(s)
- **High Performance Risk:** 6 dashboard(s)
- **Fixes Required:** 8 dashboard(s)

---

## Dashboard Details

### Overview

**Router File:** `analytics.ts`

**Procedures:** getExecutiveKPIs, getOverviewMetrics

| Metric | Status | Details |
|--------|--------|----------|
| **Data Source Tables** | ✅ | claims, aiAssessments, users, panelBeaters |
| **Query Health** | ⚠️ WARN | 435 potential null-unsafe property accesses; No empty dataset handling detected |
| **Index Required** | ⚠️  YES | leftJoin on panelBeaters.id = panelBeaterQuotes.panelBeaterId (neither column indexed) |
| **Mock Data** | ✅ NO | Real DB queries confirmed |
| **Performance Risk** | ❌ HIGH | Unindexed join: panelBeaters.id = panelBeaterQuotes.panelBeaterId; N+1 query detected in loop; N+1 query detected in loop |
| **N+1 Patterns** | ❌ DETECTED | Found 1 potential N+1 query pattern(s); Found 10 potential N+1 query pattern(s) |
| **Fix Required** | ⚠️  YES | Add index on panelBeaters.id or panelBeaterQuotes.panelBeaterId; Add null safety checks (optional chaining, nullish coalescing); Refactor to use batch queries or joins; Refactor to use batch queries or joins; Add empty dataset checks and fallback values |

### Analytics

**Router File:** `analytics.ts`

**Procedures:** getKPIs, getClaimsByComplexity, getSLACompliance, getFraudMetrics, getCostSavings

| Metric | Status | Details |
|--------|--------|----------|
| **Data Source Tables** | ✅ | claims, aiAssessments, users, panelBeaters |
| **Query Health** | ⚠️ WARN | 435 potential null-unsafe property accesses; No empty dataset handling detected |
| **Index Required** | ⚠️  YES | leftJoin on panelBeaters.id = panelBeaterQuotes.panelBeaterId (neither column indexed) |
| **Mock Data** | ✅ NO | Real DB queries confirmed |
| **Performance Risk** | ❌ HIGH | Unindexed join: panelBeaters.id = panelBeaterQuotes.panelBeaterId; N+1 query detected in loop; N+1 query detected in loop |
| **N+1 Patterns** | ❌ DETECTED | Found 1 potential N+1 query pattern(s); Found 10 potential N+1 query pattern(s) |
| **Fix Required** | ⚠️  YES | Add index on panelBeaters.id or panelBeaterQuotes.panelBeaterId; Add null safety checks (optional chaining, nullish coalescing); Refactor to use batch queries or joins; Refactor to use batch queries or joins; Add empty dataset checks and fallback values |

### Critical Alerts

**Router File:** `analytics.ts`

**Procedures:** getCriticalAlerts, getHighRiskClaims

| Metric | Status | Details |
|--------|--------|----------|
| **Data Source Tables** | ✅ | claims, aiAssessments, users, panelBeaters |
| **Query Health** | ⚠️ WARN | 435 potential null-unsafe property accesses; No empty dataset handling detected |
| **Index Required** | ⚠️  YES | leftJoin on panelBeaters.id = panelBeaterQuotes.panelBeaterId (neither column indexed) |
| **Mock Data** | ✅ NO | Real DB queries confirmed |
| **Performance Risk** | ❌ HIGH | Unindexed join: panelBeaters.id = panelBeaterQuotes.panelBeaterId; N+1 query detected in loop; N+1 query detected in loop |
| **N+1 Patterns** | ❌ DETECTED | Found 1 potential N+1 query pattern(s); Found 10 potential N+1 query pattern(s) |
| **Fix Required** | ⚠️  YES | Add index on panelBeaters.id or panelBeaterQuotes.panelBeaterId; Add null safety checks (optional chaining, nullish coalescing); Refactor to use batch queries or joins; Refactor to use batch queries or joins; Add empty dataset checks and fallback values |

### Assessors

**Router File:** `analytics.ts`

**Procedures:** getAssessorPerformance, getAssessorLeaderboard

| Metric | Status | Details |
|--------|--------|----------|
| **Data Source Tables** | ✅ | claims, aiAssessments, users, panelBeaters |
| **Query Health** | ⚠️ WARN | 435 potential null-unsafe property accesses; No empty dataset handling detected |
| **Index Required** | ⚠️  YES | leftJoin on panelBeaters.id = panelBeaterQuotes.panelBeaterId (neither column indexed) |
| **Mock Data** | ✅ NO | Real DB queries confirmed |
| **Performance Risk** | ❌ HIGH | Unindexed join: panelBeaters.id = panelBeaterQuotes.panelBeaterId; N+1 query detected in loop; N+1 query detected in loop |
| **N+1 Patterns** | ❌ DETECTED | Found 1 potential N+1 query pattern(s); Found 10 potential N+1 query pattern(s) |
| **Fix Required** | ⚠️  YES | Add index on panelBeaters.id or panelBeaterQuotes.panelBeaterId; Add null safety checks (optional chaining, nullish coalescing); Refactor to use batch queries or joins; Refactor to use batch queries or joins; Add empty dataset checks and fallback values |

### Panel Beaters

**Router File:** `panel-beater-analytics.ts`

**Procedures:** getAllPerformance, getPerformance, getTopPanelBeaters, getTrends, comparePanelBeaters

| Metric | Status | Details |
|--------|--------|----------|
| **Data Source Tables** | ❌ | None detected |
| **Query Health** | ❌ FAIL | Router file not found: /home/ubuntu/kinga-replit/server/routers/panel-beater-analytics.ts |
| **Index Required** | ✅ NO | All joins use indexed columns |
| **Mock Data** | ✅ NO | Real DB queries confirmed |
| **Performance Risk** | ✅ LOW | No performance concerns |
| **N+1 Patterns** | ✅ NONE | No N+1 patterns detected |
| **Fix Required** | ⚠️  YES | Create missing router file |

### Financials

**Router File:** `analytics.ts`

**Procedures:** getFinancialMetrics, getCostSavings, getRevenueAnalytics

| Metric | Status | Details |
|--------|--------|----------|
| **Data Source Tables** | ✅ | claims, aiAssessments, users, panelBeaters |
| **Query Health** | ⚠️ WARN | 435 potential null-unsafe property accesses; No empty dataset handling detected |
| **Index Required** | ⚠️  YES | leftJoin on panelBeaters.id = panelBeaterQuotes.panelBeaterId (neither column indexed) |
| **Mock Data** | ✅ NO | Real DB queries confirmed |
| **Performance Risk** | ❌ HIGH | Unindexed join: panelBeaters.id = panelBeaterQuotes.panelBeaterId; N+1 query detected in loop; N+1 query detected in loop |
| **N+1 Patterns** | ❌ DETECTED | Found 1 potential N+1 query pattern(s); Found 10 potential N+1 query pattern(s) |
| **Fix Required** | ⚠️  YES | Add index on panelBeaters.id or panelBeaterQuotes.panelBeaterId; Add null safety checks (optional chaining, nullish coalescing); Refactor to use batch queries or joins; Refactor to use batch queries or joins; Add empty dataset checks and fallback values |

### Governance

**Router File:** `governance-dashboard.ts`

**Procedures:** getOverrideMetrics, getSegregationMetrics, getRoleChangeMetrics

| Metric | Status | Details |
|--------|--------|----------|
| **Data Source Tables** | ❌ | None detected |
| **Query Health** | ⚠️ WARN | 70 potential null-unsafe property accesses |
| **Index Required** | ✅ NO | All joins use indexed columns |
| **Mock Data** | ❌ YES | Found 7 potential mock data pattern(s) |
| **Performance Risk** | ⚠️ MEDIUM | No performance concerns |
| **N+1 Patterns** | ✅ NONE | No N+1 patterns detected |
| **Fix Required** | ⚠️  YES | Replace mock data with real DB queries; Add null safety checks (optional chaining, nullish coalescing) |

### Executive

**Router File:** `analytics.ts`

**Procedures:** getExecutiveKPIs, getExecutiveDashboard, getStrategicInsights

| Metric | Status | Details |
|--------|--------|----------|
| **Data Source Tables** | ✅ | claims, aiAssessments, users, panelBeaters |
| **Query Health** | ⚠️ WARN | 435 potential null-unsafe property accesses; No empty dataset handling detected |
| **Index Required** | ⚠️  YES | leftJoin on panelBeaters.id = panelBeaterQuotes.panelBeaterId (neither column indexed) |
| **Mock Data** | ✅ NO | Real DB queries confirmed |
| **Performance Risk** | ❌ HIGH | Unindexed join: panelBeaters.id = panelBeaterQuotes.panelBeaterId; N+1 query detected in loop; N+1 query detected in loop |
| **N+1 Patterns** | ❌ DETECTED | Found 1 potential N+1 query pattern(s); Found 10 potential N+1 query pattern(s) |
| **Fix Required** | ⚠️  YES | Add index on panelBeaters.id or panelBeaterQuotes.panelBeaterId; Add null safety checks (optional chaining, nullish coalescing); Refactor to use batch queries or joins; Refactor to use batch queries or joins; Add empty dataset checks and fallback values |

---

## Recommendations

### 🔴 Critical: Replace Mock Data

1 dashboard(s) contain mock data patterns. Replace with real database queries to ensure accurate reporting.

### 🔴 High Priority: Performance Optimization

6 dashboard(s) have high performance risk. Address N+1 patterns and add missing indexes.

### ⚠️  Medium Priority: Query Health

7 dashboard(s) have query health warnings. Review groupBy syntax and null safety.

---

## Audit Methodology

This audit script analyzes router files for:

1. **Real DB Queries:** Detects mock data patterns (hardcoded arrays, TODO comments)
2. **GroupBy Syntax:** Validates sql`` template literal usage
3. **Indexed Joins:** Checks if join columns are indexed
4. **Null Safety:** Counts optional chaining and nullish coalescing usage
5. **N+1 Patterns:** Detects await db calls inside loops
6. **Empty Dataset Handling:** Verifies length checks and fallback values

