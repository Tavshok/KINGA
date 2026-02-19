# Dashboard Audit CI Integration

## Overview

The Dashboard Audit CI integration prevents deployment of code with dashboard integrity violations by automatically running quality checks on every push and pull request.

## Features

### Automated Checks

1. **Mock Data Detection** - Fails build if hardcoded mock data is detected
2. **N+1 Pattern Detection** - Fails build if N+1 query patterns are found
3. **FAIL Status Detection** - Fails build if any dashboard has FAIL status
4. **Index Coverage** - Warns if joins use unindexed columns
5. **Query Health** - Warns on groupBy syntax and null safety issues

### CI Integration

- **Trigger:** Runs on push/PR to `main` or `develop` branches
- **Scope:** Monitors changes to `server/routers/**/*.ts`, `server/db.ts`, `drizzle/schema.ts`
- **Artifacts:** Generates JSON report uploaded to GitHub Actions artifacts
- **PR Comments:** Automatically comments on PRs with audit results

## Exit Codes

| Code | Meaning | Action |
|------|---------|--------|
| 0 | All checks passed | Build continues |
| 1 | Integrity violations detected | Build fails |
| 2 | Script execution error | Build fails |

## Build Failure Conditions

The build will **FAIL** if any of the following are detected:

1. **Any dashboard status = FAIL**
2. **Any mock data detected**
3. **Any N+1 pattern detected**

The build will **PASS** with warnings if:

- Dashboards have WARN status (groupBy syntax, null safety, unindexed joins)
- No critical violations detected

## Usage

### Local Testing

Run the audit locally before committing:

```bash
pnpm tsx scripts/dashboard-audit-ci.ts
```

**Expected output:**

```
🔍 Dashboard Endpoints CI Audit
================================

📊 Auditing: Overview...
   Status: PASS
📊 Auditing: Analytics...
   Status: PASS
...

📈 Summary:
   Total Dashboards: 8
   PASS: 6
   WARN: 2
   FAIL: 0
   Mock Data: 0
   N+1 Patterns: 0
   High Risk: 0

✅ CI AUDIT PASSED - All dashboards meet integrity requirements
```

### GitHub Actions

The audit runs automatically on:

- Push to `main` or `develop`
- Pull requests targeting `main` or `develop`

**Workflow file:** `.github/workflows/dashboard-audit.yml`

### Viewing Results

#### In GitHub Actions

1. Navigate to Actions tab in GitHub repository
2. Select the workflow run
3. View "Dashboard Audit" job
4. Download `dashboard-audit-report` artifact for detailed JSON report

#### In Pull Requests

The bot automatically comments on PRs with:

- Summary table (PASS/WARN/FAIL counts)
- List of violations (if any)
- Required actions to fix violations

**Example PR Comment:**

```markdown
## 📊 Dashboard Integrity Audit Results

❌ **Integrity violations detected - Build failed**

### Summary

| Metric | Count |
|--------|-------|
| Total Dashboards | 8 |
| ✅ PASS | 5 |
| ⚠️ WARN | 2 |
| ❌ FAIL | 1 |
| 🚫 Mock Data | 1 |
| 🔄 N+1 Patterns | 1 |
| ⚡ High Risk | 1 |

### ❌ Violations

**Failed Dashboards:**
- Governance

**Mock Data Detected:**
- Governance

**N+1 Patterns Detected:**
- Governance

### 🔧 Required Actions

1. Replace mock data with real database queries
2. Refactor N+1 patterns to use batch queries or joins
3. Ensure all joins use indexed columns
4. Re-run audit after fixes: `pnpm tsx scripts/dashboard-audit-ci.ts`
```

## JSON Artifact Schema

The audit generates a JSON artifact with the following structure:

```typescript
interface CIAuditResult {
  success: boolean;
  timestamp: string;
  summary: {
    totalDashboards: number;
    passCount: number;
    warnCount: number;
    failCount: number;
    mockDataCount: number;
    n1PatternCount: number;
    highRiskCount: number;
  };
  violations: {
    failedDashboards: string[];
    mockDataDashboards: string[];
    n1PatternDashboards: string[];
  };
  dashboards: DashboardAudit[];
  exitCode: number;
}
```

**Example:**

```json
{
  "success": true,
  "timestamp": "2026-02-19T10:15:30.000Z",
  "summary": {
    "totalDashboards": 8,
    "passCount": 6,
    "warnCount": 2,
    "failCount": 0,
    "mockDataCount": 0,
    "n1PatternCount": 0,
    "highRiskCount": 0
  },
  "violations": {
    "failedDashboards": [],
    "mockDataDashboards": [],
    "n1PatternDashboards": []
  },
  "dashboards": [ /* ... */ ],
  "exitCode": 0
}
```

## Indexed Columns

The audit checks that all joins use indexed columns. The following columns are recognized as indexed:

### Claims Table
- `id` (primary key)
- `tenantId`
- `claimantId`
- `assignedAssessorId`
- `assignedPanelBeaterId`
- `status`
- `workflowState`
- `createdAt`

### Users Table
- `id` (primary key)
- `tenantId`
- `email`
- `openId`

### AI Assessments
- `id` (primary key)
- `claimId`

### Assessor Evaluations
- `id` (primary key)
- `claimId`

### Panel Beaters
- `id` (primary key)

### Panel Beater Quotes
- `id` (primary key)
- `claimId`
- `panelBeaterId`

### Workflow Audit Trail
- `id` (primary key)
- `claimId`
- `tenantId`
- `createdAt`

### Claim Involvement Tracking
- `id` (primary key)
- `claimId`

### Role Assignment Audit
- `id` (primary key)

## Detection Logic

### Mock Data Detection

Detects the following patterns:

```typescript
// Pattern 1: Hardcoded arrays with objects
return [
  { name: 'John Doe', value: 100 },
  { name: 'Jane Smith', value: 200 }
];

// Pattern 2: Hardcoded data arrays
const mockData = [
  { id: 1, name: 'Test' },
  { id: 2, name: 'Test 2' }
];

// Pattern 3: TODO comments mentioning mock
// TODO: Replace with real data (currently using mock)

// Pattern 4: FIXME comments mentioning mock
// FIXME: Remove mock data
```

**Excluded patterns (not flagged as mock data):**

```typescript
// Null safety helpers
safeNumber(result?.count, 0)
safeArray(results)
safeString(user?.name, 'Unknown')

// Empty pagination responses
return { items: [], total: 0 }
```

### N+1 Pattern Detection

Detects queries inside loops:

```typescript
// ❌ N+1 pattern (flagged)
for (const user of users) {
  const claims = await db.query.claims.findMany({
    where: eq(claims.userId, user.id)
  });
}

// ✅ Consolidated query (not flagged)
const result = await db.execute(sql`
  SELECT u.*, COUNT(c.id) as claim_count
  FROM users u
  LEFT JOIN claims c ON u.id = c.user_id
  GROUP BY u.id
`);

// ✅ UNION query (not flagged)
const result = await db.execute(sql`
  SELECT * FROM claims WHERE status = 'pending'
  UNION ALL
  SELECT * FROM claims WHERE status = 'approved'
`);
```

### Unindexed Join Detection

Detects joins where neither column is indexed:

```typescript
// ❌ Unindexed join (flagged)
.leftJoin(panelBeaters, eq(panelBeaters.customField, claims.customField))
// Neither panelBeaters.customField nor claims.customField is indexed

// ✅ Indexed join (not flagged)
.leftJoin(panelBeaters, eq(panelBeaters.id, claims.assignedPanelBeaterId))
// Both columns are indexed
```

## Fixing Violations

### Replacing Mock Data

**Before:**

```typescript
export const getOverviewMetrics = protectedProcedure.query(async () => {
  return {
    totalClaims: 1234,
    pendingClaims: 56,
    completedClaims: 1178
  };
});
```

**After:**

```typescript
export const getOverviewMetrics = protectedProcedure.query(async ({ ctx }) => {
  const db = getDb();
  const result = await db.execute(sql`
    SELECT 
      COUNT(*) as total_claims,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_claims,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_claims
    FROM claims
    WHERE tenant_id = ${ctx.user.tenantId}
  `);
  
  return {
    totalClaims: safeNumber(result[0]?.total_claims, 0),
    pendingClaims: safeNumber(result[0]?.pending_claims, 0),
    completedClaims: safeNumber(result[0]?.completed_claims, 0)
  };
});
```

### Eliminating N+1 Patterns

**Before:**

```typescript
const users = await db.query.users.findMany();
const usersWithClaims = [];

for (const user of users) {
  const claims = await db.query.claims.findMany({
    where: eq(claims.userId, user.id)
  });
  usersWithClaims.push({ ...user, claims });
}
```

**After:**

```typescript
const result = await db.execute(sql`
  SELECT 
    u.*,
    JSON_ARRAYAGG(
      JSON_OBJECT(
        'id', c.id,
        'status', c.status,
        'amount', c.amount
      )
    ) as claims
  FROM users u
  LEFT JOIN claims c ON u.id = c.user_id
  WHERE u.tenant_id = ${tenantId}
  GROUP BY u.id
`);
```

### Adding Missing Indexes

**Before:**

```typescript
// Unindexed join
.leftJoin(claims, eq(claims.customField, users.customField))
```

**After:**

```sql
-- Add index to schema
CREATE INDEX idx_claims_custom_field ON claims(custom_field);
CREATE INDEX idx_users_custom_field ON users(custom_field);
```

Then update `scripts/dashboard-audit-ci.ts`:

```typescript
const INDEXED_COLUMNS = new Set([
  // ... existing columns ...
  'claims.customField',
  'users.customField',
]);
```

## Maintenance

### Updating Indexed Columns

When adding new indexes to the database:

1. Add the index to the schema
2. Run migration: `pnpm db:push`
3. Update `INDEXED_COLUMNS` in `scripts/dashboard-audit-ci.ts`
4. Commit both changes together

### Updating Dashboard Mappings

When adding new dashboards or procedures:

1. Update `DASHBOARD_ROUTERS` in `scripts/dashboard-audit-ci.ts`
2. Add the new dashboard name and router file mapping
3. List all procedures that should be audited

**Example:**

```typescript
const DASHBOARD_ROUTERS: Record<string, { file: string; procedures: string[] }> = {
  // ... existing dashboards ...
  'New Dashboard': { 
    file: 'new-dashboard.ts', 
    procedures: ['getProcedure1', 'getProcedure2'] 
  },
};
```

## Troubleshooting

### False Positives

If the audit incorrectly flags code:

1. **Mock Data False Positive:** Ensure you're using `safeNumber()`, `safeArray()`, `safeString()` helpers instead of inline fallback values
2. **N+1 False Positive:** Use consolidated queries with UNION, CTEs, or multiple aggregations
3. **Unindexed Join False Positive:** Verify the index exists in database and is listed in `INDEXED_COLUMNS`

### Build Failing Unexpectedly

1. Run audit locally: `pnpm tsx scripts/dashboard-audit-ci.ts`
2. Check JSON artifact: `cat DASHBOARD_AUDIT_CI_RESULT.json`
3. Review violations section for specific issues
4. Fix violations and re-run audit

### Audit Script Not Running

1. Verify GitHub Actions workflow file exists: `.github/workflows/dashboard-audit.yml`
2. Check workflow triggers match your branch names
3. Ensure `scripts/dashboard-audit-ci.ts` is committed to repository
4. Verify pnpm is installed in CI environment

## Best Practices

1. **Run audit locally before committing** to catch issues early
2. **Keep indexed columns list updated** when adding new indexes
3. **Use helper functions** (`safeNumber`, `safeArray`) to avoid false positives
4. **Consolidate queries** instead of loops to prevent N+1 patterns
5. **Add indexes** for frequently joined columns
6. **Review PR comments** to understand violations before fixing

## Related Documentation

- [Dashboard Audit Delta Summary](../DASHBOARD_AUDIT_DELTA_SUMMARY.md)
- [Analytics Optimization Summary](../ANALYTICS_OPTIMIZATION_SUMMARY.md)
- [Database Schema](../drizzle/schema.ts)
- [GitHub Actions Workflow](../.github/workflows/dashboard-audit.yml)

---

**Last Updated:** February 19, 2026  
**Version:** 1.0.0
