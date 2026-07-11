# AUDIT-01 Investigation Findings (2026-07-11)

## Tables
- `audit_trail`: userId, action, entityType, entityId, previousValue, newValue, changeDescription, ipAddress, userAgent, createdAt (441 rows)
- `workflow_audit_trail`: claimId, userId, userRole (enum), previousState, newState, decisionValue, aiScore, metadata, comments (18 rows)
- `audit_logs`: DEAD TABLE — 0 rows, never imported/written. Duplicate of isoAuditLogs.
- `iso_audit_logs` / `isoAuditLogs`: tenantId, userId, userRole (varchar50), actionType, resourceType, resourceId, beforeState, afterState, integrityHash, timestamp (LIVE — used by ingestion-review-queue.ts)

## integrityHash algorithm (from ingestion-review-queue.ts)
```ts
const integrityHash = require('crypto').createHash('sha256').update(JSON.stringify(auditData)).digest('hex');
// auditData = the payload object being logged (no salt, no HMAC)
```

## System User
- id: 20670001, openId: "SYSTEM", name: "KINGA System", role: admin
- Created 2026-07-11 for AUDIT-01

## AUDIT-01 Final Mapping
| File | Target | Notes |
|---|---|---|
| ai-rerun-service.ts | workflowAuditTrail | Human actor, workflow state transitions. DONE. |
| intake-escalation-job.ts | isoAuditLogs | System actor (SYSTEM_USER_ID). DONE. |
| routing-policy-version-manager.ts | isoAuditLogs | System/admin actor. Has module-level db bug (getDb() not awaited at top). |
| invitation-service.ts | isoAuditLogs | System actor (invitation acceptance). Has actor="SYSTEM" → SYSTEM_USER_ID. |
| platform-super-admin-guard.ts | isoAuditLogs | Has correct db pattern (dynamic import + await getDb). resourceType/resourceId → correct fields. |
| seed-production-data.ts | isoAuditLogs | Seed data only — not production. Has actionType/actionDescription/actor fields. |
| services/super-audit-mode.ts | audit_trail | Stay on audit_trail. targetType→entityType, targetId→entityId, metadata→changeDescription. CRITICAL: db is never initialized — ReferenceError at runtime. Must add await getDb() to each function. |

## workflowAuditTrail userRole enum values
claims_processor, assessor_internal, assessor_external, risk_manager, claims_manager, executive, insurer_admin, recovery_officer
NOTE: "system" is NOT in this enum — use isoAuditLogs for system actors.

## audit-helpers.ts location
/home/ubuntu/kinga-replit/server/utils/audit-helpers.ts
Exports: SYSTEM_USER_ID, insertWorkflowAudit, insertIsoAuditLog, generateIntegrityHash, generateAuditId
