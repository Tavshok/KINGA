# KINGA Security and Tenant Isolation Manual

> **High-priority rule:** An endpoint, router or helper is safe only when the executable access path proves the current session is permitted to access the target object before data is read or side effects occur.

## 1. Security architecture in code

| Control | Implementation evidence | Required interpretation |
|---|---|---|
| Request/session context | `server/_core/context.ts` | Establishes the request user context used by protected procedures. |
| tRPC protection | `server/_core/trpc.ts` | Distinguishes public and protected procedure pathways. |
| Domain/role enforcement | `server/_core/domain-middleware.ts` | Provides domain-aware role/tenant enforcement; a caller with no tenant must not silently receive a fallback tenant. |
| Router/object enforcement | Individual routers, especially `server/routers/inspections.ts`, `comments.ts`, report/export paths | Enforces target-object and tenant predicates close to data access. |
| Audit evidence | `audit.ts`, `super-audit.ts`, `workflow-audit.ts`; audit tables in `drizzle/schema.ts` | Records actions/denials where implemented; logging does not replace prevention. |
| Security regression evidence | `server/engineer/inspectionAuthority.p0.test.ts`, `server/routers/notificationsTenantAuthority.p0.test.ts`, quote/router authorisation tests | Tests both success and refusal behaviour using controlled fixtures. |

## 2. Tenant and object-authority proof

For every critical access path, answer this question in review:

> **How does KINGA prove that this session may access this object?**

A satisfactory answer should identify: (1) authenticated session user, (2) session-derived tenant or explicitly authorised platform scope, (3) target claim/document/inspection/etc. lookup constrained to that scope, (4) any role, assignment or ownership condition, and (5) the audit/side-effect path after authority is established.

| Access class | Expected control sequence |
|---|---|
| Normal tenant read | Protected session → non-null tenant → tenant-constrained query → result |
| Tenant write | Protected session → non-null tenant → constrained target lookup → workflow/role validation → write/audit/event |
| Assigned professional action | Tenant proof plus authorised identity/assignment proof |
| Platform-wide action | Explicit platform-super-admin or equivalent privileged rule, plus intentional audit scope |
| Export/report download | Session and target report/claim authority before file/query access; tenant cannot be inferred from request input |

## 3. Security invariants

1. **Fail closed for missing tenant context.** Do not replace an absent tenant with `"platform"`, `null`, an input value, or an arbitrary record.
2. **Filter before retrieval.** An ID-only lookup followed by a tenant comparison is dangerous if related data or a side effect happens first.
3. **Do not trust request tenant IDs.** They may be filtering input but never authorisation input.
4. **Keep enforcement server-side.** Hidden UI controls are not access control.
5. **Preserve hard-deleted-user denial.** A valid token without an active corresponding user must not silently recreate access; inspect the authentication path and regression tests before changing it.
6. **Reports, SAR/export and files are data access.** They require the same authority proof as ordinary claim reads.
7. **Background/automation work must carry scope.** A job lacking a verified tenant/object context is a security review item.

## 4. Review-required security findings

The following categories must be documented as **SECURITY FINDING — REVIEW REQUIRED** if encountered during work. Do not silently repair a product/authority decision without the appropriate approval.

- A tenant-scoped procedure with no explicit session-tenant guard or no demonstrable equivalent middleware.
- Raw SQL using a camelCase property name in place of a physical snake_case column.
- Data retrieved by ID before tenant/object authority is checked.
- A privileged router registered through a lower-privilege procedure primitive.
- An export/download/notification or background path that loses tenant context.
- A report or dashboard presenting cross-tenant values without explicit platform authority.

## 4.1 Concrete notification-boundary reference

Use `server/routers/notifications.ts` and `server/routers/notificationsTenantAuthority.p0.test.ts` as the reference for a current-user tenant-scoped collection. The router obtains the tenant only from `ctx.user`, rejects absent tenant context, and combines both `notifications.userId = ctx.user.id` and `notifications.tenantId = tenantId` in list/count/update predicates. Single-row actions bind the row ID, user ID and tenant ID together; bulk actions still bind user and tenant. This is the expected shape when a row belongs to an individual within a tenant.

## 5. Safe change procedure

Read the complete procedure, direct services, schema declarations, and nearest security regression before editing. Add a test that proves same-tenant authorised behaviour remains available and a test that proves a foreign-tenant, tenantless, unassigned, or otherwise unauthorised call is denied without an unintended write. Use test-owned IDs/stamps and precise cleanup. See [KINGA_ENGINEERING_CHANGE_GUIDE.md](./KINGA_ENGINEERING_CHANGE_GUIDE.md).

## 6. Scope limitations

The repository has security-oriented dependencies and modules, including `helmet`, `express-rate-limit`, `jose`, `bcryptjs`, S3 SDK packages and Sentry packages. Their appearance in `package.json` is not evidence that every control is correctly configured in every deployed environment. TLS termination, identity-provider configuration, key rotation, production secret storage, WAF rules, backup encryption and incident response service-level commitments are **[NOT VERIFIED IN CODEBASE]**.
