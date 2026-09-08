# KINGA Administration Manual

## 1. Administration scope

Administrative and platform functionality is implemented through `server/routers/admin.ts`, `tenant.ts`, `platform.ts`, `platform-operations.ts`, `platform-observability.ts`, `platform-user-roles.ts`, `governance.ts`, `governance-dashboard.ts`, `super-audit.ts`, and related router modules. The client includes pages under `client/src/pages/admin/` as well as platform operations, overview, marketplace and role-management pages.

## 2. Administrative domains

| Domain | Server evidence | UI evidence | Safety boundary |
|---|---|---|---|
| Tenant administration | `tenant.ts`, `admin.ts` | `admin/TenantManagement.tsx`, `TenantProvisioning.tsx`, `TenantRoleConfig.tsx` | Tenant changes are privileged and must be auditable. |
| User/role management | `platform-user-roles.ts`, auth/admin routers | `PlatformUserRoleManager.tsx`, `admin/UserManagement.tsx` | Roles are not merely UI labels; trace session and router checks. |
| Workflow configuration | workflow routers/configuration entities | `WorkflowSettings.tsx`, `admin/WorkflowTemplates.tsx` | Do not make transition rules more permissive without tests/review. |
| Audit and governance | `audit.ts`, `super-audit.ts`, `governance*.ts` | `admin/AuditLog.tsx`, `SecurityEvents.tsx`, observability pages | Viewing audit data is itself tenant/platform-sensitive. |
| Operational health | operational/platform observability routers | `OperationalHealthDashboard.tsx`, `admin/PipelineHealthDashboard.tsx` | Do not expose global metrics to ordinary tenant users. |
| Marketplace/agency/fleet administration | marketplace, agency and fleet routers | marketplace/agency/fleet pages | Preserve entity and tenant relationships. |

## 3. Role model

The codebase contains privileged platform/admin paths and role-facing views for tenant, agency, fleet, engineering, assessor, claims and other users. The exact current role enum and procedure access are defined by `drizzle/schema.ts`, `server/_core/domain-middleware.ts`, `server/routers/auth-core.ts`, and the target router. A new engineer must never grant access solely by adding a route or client-side condition.

## 4. Safe admin operation

1. Use the real authenticated role path; do not impersonate or inject tenant values for testing.
2. Confirm target tenant/object scope before a read or mutation.
3. Capture appropriate audit evidence for privileged operations.
4. Treat role, tenant, workflow configuration, subscription and integration changes as high-impact changes with review and rollback planning.
5. Do not use production data or broad test cleanup filters for test setup.

Production operator runbooks, user-provisioning approvals, role delegation policy, subscription billing reconciliation and exact incident escalation contacts are **[NOT VERIFIED IN CODEBASE]**.
