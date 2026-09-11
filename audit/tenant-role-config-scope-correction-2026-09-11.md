# Tenant Role-Configuration Scope Correction

## Scope

This priority correction is isolated from the Gate C schema-review chain. It changes only `updateTenantRoleConfig()` and adds a disposable-loopback regression. It does not alter a schema declaration, migration, historical journal, tenant-administration authorisation guard, router input, role enum, or application deployment configuration.

No operation contacted `kinga_staging`, production, a migration account, Gate D, or live data.

## Defect and correction

`tenant.updateRoleConfig` provides one `tenantId` and one requested role to `updateTenantRoleConfig()`. Before this correction, the service checked for an existing configuration using `tenantId` alone and then updated using the same tenant-only predicate. Once a tenant had its standard role rows, a permitted administrator changing one role could overwrite `enabled`, `permissions`, and `updatedAt` for every role configuration owned by that tenant.

The correction introduces one `roleConfigPredicate`:

```ts
and(
  eq(tenantRoleConfigs.tenantId, tenantId),
  eq(tenantRoleConfigs.roleKey, role),
)
```

The same predicate now governs the existence lookup and update. The pre-existing no-row path remains, but it inserts only the requested `(tenantId, roleKey)` pair. The active router remains responsible for authenticating the user and applying the existing tenant-administration scope guard before the service is called.

## Regression evidence

The new regression creates a uniquely named `kinga_gatec_tenant_role_scope_*` database only on local `127.0.0.1:3317` MariaDB when `KINGA_LOCAL_SCRATCH_TESTS=1` is set. It refuses a non-MySQL or non-loopback administrator URL, refuses any administrative database other than `/mysql`, checks that its target name does not pre-exist, and drops only that exact target in `afterAll`. An independent `information_schema` check after the run confirmed no matching scratch schema remains.

| Check | Result |
|---|---|
| One-role update | Passed. Updating `executive` left the same tenant’s `risk_manager` `enabled` and `permissions` values unchanged. |
| No-row path | Passed. An existing `executive` row remained unchanged while the absent `claims_manager` pair alone was inserted. |
| Local scratch run | 1 file / 2 tests passed. |
| Scratch disposal | Passed. No `kinga_gatec_tenant_role_scope_*` schema remained. |
| Production build | Passed in 30.69 seconds; only existing large-chunk warnings were emitted. |
| TypeScript comparison | Branch and exact `c69b446c` main base each produced 999 inherited diagnostics; error identifiers/categories matched and neither touched service/test path appeared. |
| DB-disabled full-suite comparison | Branch and exact base each had 101 failed files, 217 failed tests, and 8,682 passing tests; no branch-only or base-only failing header. The branch has two additionally skipped local-scratch tests by design. |

The pre-existing `tenant-config.test.ts` cannot be treated as a passing validation when the database URLs are deliberately empty: its database-dependent tests report the established `Database not available` failure. The dedicated loopback test above is the functional evidence for this change.

## Review boundary

This correction is ready for a dedicated priority review branch. It can be reviewed and merged independently of Gate D and independently of the still-stacked Gate C baseline PRs.
