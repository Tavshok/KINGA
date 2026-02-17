# Governance Analytics - Database Index Documentation

This document describes the database indexes required for optimal performance of governance analytics queries.

## Overview

Governance analytics procedures query three primary audit tables:
- `workflow_audit_trail` - Tracks all claim state transitions and executive overrides
- `role_assignment_audit` - Records role changes and assignments over time
- `claim_involvement_tracking` - Monitors user involvement across claim stages

## Required Indexes

### 1. workflow_audit_trail

**Primary Index (claim_id, created_at)**
```sql
CREATE INDEX idx_workflow_audit_claim_time ON workflow_audit_trail(claim_id, created_at);
```
- **Used by**: `governance.getOverrideMetrics`, `analytics.getKPIs`
- **Purpose**: Efficient filtering by claim and time-based ordering for trend analysis
- **Query pattern**: `WHERE claim_id = ? ORDER BY created_at DESC`

**Tenant Isolation Index (tenant_id, created_at)**
```sql
CREATE INDEX idx_workflow_audit_tenant_time ON workflow_audit_trail(tenant_id, created_at);
```
- **Used by**: All governance procedures with tenant filtering
- **Purpose**: Fast tenant-scoped queries with time-based filtering
- **Query pattern**: `WHERE tenant_id = ? AND created_at >= ?`

**Executive Override Index (executive_override, created_at)**
```sql
CREATE INDEX idx_workflow_audit_override_time ON workflow_audit_trail(executive_override, created_at);
```
- **Used by**: `governance.getOverrideMetrics`, `analytics.getKPIs`
- **Purpose**: Rapid identification of executive override events
- **Query pattern**: `WHERE executive_override = 1 AND created_at >= ?`

### 2. role_assignment_audit

**Tenant Time Index (tenant_id, timestamp)**
```sql
CREATE INDEX idx_role_audit_tenant_time ON role_assignment_audit(tenant_id, timestamp);
```
- **Used by**: `governance.getRoleAssignmentTrends`, `analytics.getKPIs`
- **Purpose**: Tenant-scoped role change queries with temporal filtering
- **Query pattern**: `WHERE tenant_id = ? AND timestamp >= ?`

**User Activity Index (user_id, timestamp)**
```sql
CREATE INDEX idx_role_audit_user_time ON role_assignment_audit(user_id, timestamp);
```
- **Used by**: `governance.getRoleAssignmentTrends` (frequent role switcher analysis)
- **Purpose**: Track role change frequency per user
- **Query pattern**: `WHERE user_id = ? ORDER BY timestamp DESC`

### 3. claim_involvement_tracking

**Claim Stage Index (claim_id, user_id, stage)**
```sql
CREATE INDEX idx_involvement_claim_user_stage ON claim_involvement_tracking(claim_id, user_id, stage);
```
- **Used by**: `governance.getSegregationViolations`, `governance.getInvolvementConflicts`
- **Purpose**: Detect multi-stage involvement by same user (segregation violations)
- **Query pattern**: `GROUP BY user_id, claim_id HAVING COUNT(DISTINCT stage) > 1`

**User Involvement Index (user_id, created_at)**
```sql
CREATE INDEX idx_involvement_user_time ON claim_involvement_tracking(user_id, created_at);
```
- **Used by**: `governance.getInvolvementConflicts`
- **Purpose**: Analyze user involvement patterns over time
- **Query pattern**: `WHERE user_id = ? AND created_at >= ?`

## Performance Characteristics

### Query Complexity

| Procedure | Tables Scanned | Index Usage | Estimated Rows |
|-----------|---------------|-------------|----------------|
| `governance.getOverrideMetrics` | 1 (workflow_audit_trail) | 2 indexes | 100-10K |
| `governance.getSegregationViolations` | 2 (claim_involvement_tracking, claims) | 1 index | 500-50K |
| `governance.getRoleAssignmentTrends` | 1 (role_assignment_audit) | 2 indexes | 50-5K |
| `governance.getInvolvementConflicts` | 3 (claim_involvement_tracking, claims, users) | 1 index | 1K-100K |
| `analytics.getKPIs` (governance metrics) | 3 (all audit tables) | 3 indexes | 10K-500K |

### Index Maintenance

- **Rebuild frequency**: Monthly (or when fragmentation > 30%)
- **Statistics update**: Weekly (or after bulk inserts)
- **Monitoring**: Track index usage via `EXPLAIN` plans

## Verification Queries

### Check Index Existence

```sql
SHOW INDEXES FROM workflow_audit_trail WHERE Key_name LIKE 'idx_workflow%';
SHOW INDEXES FROM role_assignment_audit WHERE Key_name LIKE 'idx_role%';
SHOW INDEXES FROM claim_involvement_tracking WHERE Key_name LIKE 'idx_involvement%';
```

### Analyze Index Usage

```sql
EXPLAIN SELECT COUNT(*) 
FROM workflow_audit_trail 
WHERE tenant_id = 'test-tenant' 
  AND executive_override = 1 
  AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY);
```

Expected: `Using index condition; Using where`

## Future Optimization Opportunities

1. **Materialized Views**: Consider pre-aggregating monthly governance metrics
2. **Partitioning**: Partition `workflow_audit_trail` by month for historical data
3. **Caching**: Add Redis layer for frequently accessed 30-day metrics
4. **Archival**: Move audit records older than 2 years to cold storage

## Notes

- All indexes support tenant isolation (multi-tenancy)
- Composite indexes are ordered for optimal query performance
- No full table scans should occur with proper index usage
- Monitor slow query log for missing index opportunities
