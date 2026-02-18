# Governance Data Restoration - Query Design

**Objective:** Replace hardcoded mock data with live database queries while maintaining response shape and ensuring tenant safety.

---

## Response Shape (MUST MAINTAIN)

```typescript
{
  success: true,
  data: {
    totalOverrides: {
      value: number,
      trend: "up" | "down" | "stable",
      previousValue: number,
    },
    overrideRate: {
      value: number, // percentage
      trend: "up" | "down" | "stable",
      previousValue: number,
    },
    segregationViolations: {
      value: number,
      trend: "up" | "down" | "stable",
      previousValue: number,
    },
    roleChanges: {
      value: number,
      trend: "up" | "down" | "stable",
      previousValue: number,
    },
    involvementConflicts: {
      value: number,
      trend: "up" | "down" | "stable",
      previousValue: number,
    },
  },
}
```

---

## Query Design

### 1. Total Overrides (Last 30 Days)

**Source Table:** `workflow_audit_trail`  
**Filter:** `executiveOverride = 1`  
**Tenant Isolation:** `claims.tenantId = ctx.user.tenantId` (via join)  
**Date Range:** `createdAt >= thirtyDaysAgo`

**Query Logic:**
```typescript
const overridesLast30Days = await db
  .select({ count: sql<number>`count(*)` })
  .from(workflowAuditTrail)
  .innerJoin(claims, eq(workflowAuditTrail.claimId, claims.id))
  .where(
    and(
      eq(claims.tenantId, ctx.user.tenantId),
      eq(workflowAuditTrail.executiveOverride, 1),
      gte(workflowAuditTrail.createdAt, thirtyDaysAgo)
    )
  );

const overridesPrevious30Days = await db
  .select({ count: sql<number>`count(*)` })
  .from(workflowAuditTrail)
  .innerJoin(claims, eq(workflowAuditTrail.claimId, claims.id))
  .where(
    and(
      eq(claims.tenantId, ctx.user.tenantId),
      eq(workflowAuditTrail.executiveOverride, 1),
      gte(workflowAuditTrail.createdAt, sixtyDaysAgo),
      lt(workflowAuditTrail.createdAt, thirtyDaysAgo)
    )
  );
```

**Null Safety:** `count(*)` always returns number (0 if no rows)  
**Performance:** Uses `idx_audit_claim_timestamp` index (already exists from Phase 2)

---

### 2. Override Rate (% of Claims Overridden)

**Calculation:** `(totalOverrides / totalClaims) * 100`

**Query Logic:**
```typescript
const totalClaimsLast30Days = await db
  .select({ count: sql<number>`count(*)` })
  .from(claims)
  .where(
    and(
      eq(claims.tenantId, ctx.user.tenantId),
      gte(claims.createdAt, thirtyDaysAgo)
    )
  );

const overrideRate = totalClaimsLast30Days[0].count > 0
  ? (overridesLast30Days[0].count / totalClaimsLast30Days[0].count) * 100
  : 0;
```

**Null Safety:** Zero division guard (`totalClaims > 0`)  
**Performance:** Uses `idx_claims_tenant_created` index (already exists from Phase 2)

---

### 3. Segregation Violations (Last 30 Days)

**Definition:** User involved in multiple critical stages of the same claim (violates segregation of duties)

**Source Table:** `claim_involvement_tracking`  
**Logic:** Count claims where same userId appears in 2+ critical stages

**Query Logic:**
```typescript
const segregationViolations = await db
  .select({
    claimId: claimInvolvementTracking.claimId,
    userId: claimInvolvementTracking.userId,
    stageCount: sql<number>`count(distinct ${claimInvolvementTracking.workflowStage})`,
  })
  .from(claimInvolvementTracking)
  .innerJoin(claims, eq(claimInvolvementTracking.claimId, claims.id))
  .where(
    and(
      eq(claims.tenantId, ctx.user.tenantId),
      gte(claimInvolvementTracking.createdAt, thirtyDaysAgo)
    )
  )
  .groupBy(sql`${claimInvolvementTracking.claimId}, ${claimInvolvementTracking.userId}`)
  .having(sql`count(distinct ${claimInvolvementTracking.workflowStage}) > 1`);
```

**Null Safety:** `count(distinct ...)` always returns number  
**Performance:** Uses `idx_involvement_claim_user` (needs to be created)

---

### 4. Role Changes (Last 30 Days)

**Source Table:** `role_assignment_audit`  
**Filter:** `timestamp >= thirtyDaysAgo`  
**Tenant Isolation:** `tenantId = ctx.user.tenantId`

**Query Logic:**
```typescript
const roleChangesLast30Days = await db
  .select({ count: sql<number>`count(*)` })
  .from(roleAssignmentAudit)
  .where(
    and(
      eq(roleAssignmentAudit.tenantId, ctx.user.tenantId),
      gte(roleAssignmentAudit.timestamp, thirtyDaysAgo)
    )
  );

const roleChangesPrevious30Days = await db
  .select({ count: sql<number>`count(*)` })
  .from(roleAssignmentAudit)
  .where(
    and(
      eq(roleAssignmentAudit.tenantId, ctx.user.tenantId),
      gte(roleAssignmentAudit.timestamp, sixtyDaysAgo),
      lt(roleAssignmentAudit.timestamp, thirtyDaysAgo)
    )
  );
```

**Null Safety:** `count(*)` always returns number  
**Performance:** Uses `idx_timestamp` index (already exists in schema)

---

### 5. Involvement Conflicts (Last 30 Days)

**Definition:** Claims with segregation violations (same as #3, but count of claims, not user-claim pairs)

**Query Logic:**
```typescript
const involvementConflicts = segregationViolations.length; // Number of unique claim-user pairs with violations
```

**Null Safety:** `.length` always returns number (0 if empty array)  
**Performance:** Reuses segregationViolations query result

---

## Trend Calculation

**Formula:**
```typescript
function calculateTrend(current: number, previous: number): "up" | "down" | "stable" {
  if (current > previous) return "up";
  if (current < previous) return "down";
  return "stable";
}
```

---

## Performance Estimates

### Query Execution Times (Estimated)

| Query | Table | Rows Scanned | Index Used | Est. Time |
|---|---|---|---|---|
| Total Overrides (30d) | workflow_audit_trail | ~500 | idx_audit_claim_timestamp | 15ms |
| Total Overrides (30-60d) | workflow_audit_trail | ~500 | idx_audit_claim_timestamp | 15ms |
| Total Claims (30d) | claims | ~1000 | idx_claims_tenant_created | 10ms |
| Total Claims (30-60d) | claims | ~1000 | idx_claims_tenant_created | 10ms |
| Segregation Violations (30d) | claim_involvement_tracking | ~2000 | idx_involvement_claim_user | 25ms |
| Segregation Violations (30-60d) | claim_involvement_tracking | ~2000 | idx_involvement_claim_user | 25ms |
| Role Changes (30d) | role_assignment_audit | ~50 | idx_timestamp | 5ms |
| Role Changes (30-60d) | role_assignment_audit | ~50 | idx_timestamp | 5ms |

**Total Estimated Time:** ~110ms (8 queries)

### Optimization Opportunities

1. **Parallel Execution:** Run all 8 queries concurrently using `Promise.all()` → **~25ms total**
2. **Missing Index:** Create `idx_involvement_claim_user` on `claim_involvement_tracking(claim_id, user_id, created_at)`

---

## Tenant Safety Verification

### Tenant Isolation Enforcement

**✅ All queries enforce tenant isolation:**

1. **workflow_audit_trail** → Joins `claims` table, filters by `claims.tenantId`
2. **claims** → Direct filter by `claims.tenantId`
3. **claim_involvement_tracking** → Joins `claims` table, filters by `claims.tenantId`
4. **role_assignment_audit** → Direct filter by `roleAssignmentAudit.tenantId`

**No cross-tenant data leakage possible.**

### Date Filtering Indexes

**✅ All date-based queries use indexed columns:**

1. **workflow_audit_trail.createdAt** → `idx_audit_claim_timestamp`
2. **claims.createdAt** → `idx_claims_tenant_created`
3. **claim_involvement_tracking.createdAt** → Needs `idx_involvement_claim_user`
4. **role_assignment_audit.timestamp** → `idx_timestamp`

### groupBy Syntax

**✅ All groupBy uses sql`` template:**

```typescript
.groupBy(sql`${claimInvolvementTracking.claimId}, ${claimInvolvementTracking.userId}`)
```

### N+1 Query Prevention

**✅ No loops with individual queries:**
- All metrics computed with single aggregation queries
- No `for` loops or `.map(async)` patterns

### Null-Safe Aggregations

**✅ All aggregations handle nulls:**
- `count(*)` → Returns 0 if no rows
- `.length` → Returns 0 if empty array
- Zero division guard for override rate calculation

---

## Implementation Checklist

- [ ] Add missing index: `idx_involvement_claim_user`
- [ ] Replace mock data with live queries
- [ ] Implement parallel execution with `Promise.all()`
- [ ] Add error handling for database failures
- [ ] Test with multiple tenants to verify isolation
- [ ] Test with empty datasets (new tenants)
- [ ] Verify response shape matches frontend expectations

---

**Report Generated:** 2026-02-18  
**Mode:** Governance Data Restoration  
**Status:** Query design complete, ready for implementation
