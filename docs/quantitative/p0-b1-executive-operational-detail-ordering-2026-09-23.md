# P0-B1 Executive Operational-Detail Ordering Hardening

**Date:** 2026-09-23
**Status:** Independent adversarial review approved; merge-readiness validation pending
**Package:** Independent hardening between canonical P0-B1 fraud-hold remediation and the P0-B1 integration package

## Purpose

This narrow package corrects one P0-B1 authorization-ordering bypass in `executiveRouter.getOperationalClaimDetail`. The prior route read operational claim data and raw fraud-risk fields after calculating a session-derived tenant scope. A P0-B1 hold must never precede authorization, but once authorization succeeds the route must also not proceed to its legacy data query. The route now resolves and validates tenant scope, records required cross-tenant access auditing, and then returns the canonical P0-B1 actionable fraud hold before any claim, workflow-history, or fraud-risk query.

## Boundary

The package changes only the Executive Dashboard operational-detail endpoint and its dedicated tenant-authority regression suite. It does not alter the P0-B1 integration package, P0-B1-Client Package A, the deferred browser display packages, report rendering, or any other executive analytics route. The endpoint retains its legacy filter input for client compatibility, but neither `high_fraud` nor any other filter can reach a claim query once P0-B1 is active. Its returned `fraudRiskScore` and `fraudRiskLevel` fields are removed together with the legacy query because they are prohibited under the hold.

## Required ordering

| Step | Required behavior                                                                                                                                                                      |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `executiveProcedure` authenticates the caller and enforces the executive role set.                                                                                                     |
| 2    | `resolveP0TenantScope()` binds an ordinary user to the session tenant, rejects a tenant override, and requires an explicit tenant for a platform-super-admin without a session tenant. |
| 3    | `validateP0TenantScope()` validates an explicit cross-tenant selection.                                                                                                                |
| 4    | `auditP0CrossTenantAccess()` records a successful cross-tenant operational-detail access selection.                                                                                    |
| 5    | `throwP0B1FraudDecisionHold()` returns the canonical actionable abstention before any operational claim, workflow-history, fraud-score, fraud-level, or filter query.                  |

> **Fail-closed rule:** A caller who fails role or tenant authorization receives that authorization error, not a P0 hold. An authorized caller receives the canonical P0 hold and no raw fraud or claim operational detail from this endpoint.

## Regression coverage

`server/p0-package-3-executive-router.test.ts` covers nine caller and state combinations: same-tenant executive hold, rejected ordinary tenant override, rejected non-executive role, no disclosure for a direct foreign numeric identifier, the legacy `high_fraud` filter contained behind the hold, ordinary caller without tenant context, platform-super-admin without an explicit tenant selection, same-tenant database unavailability with no read before hold, and audited platform-super-admin cross-tenant hold. Every authorized P0 hold assertion proves that neither `getDb()` nor `db.execute()` was called after authorization.

## Validation record

Focused guarded validation passed on 2026-09-23: `server/p0-package-3-executive-router.test.ts` and `server/evidence-governance/p0FraudDecisionHold.test.ts` completed with 2 files and 11 tests passing against the isolated `kinga_ci_test` runner. Source audit confirmed that the operational-detail procedure contains no `getDb()`, `db.execute`, raw fraud-risk field, or legacy claim query after authorization.

One fresh independent adversarial review approved the package on 2026-09-23. The review verified the required role, tenant, null-tenant, selected-super-admin-tenant, and cross-tenant audit ordering; canonical hold behavior; legacy filter containment; no-query regressions; and package scope. The reviewer recorded no blockers.

Merge readiness completed on 2026-09-23. The guarded complete suite passed with 614 files, 9,720 tests, one intentionally skipped file, and four intentionally skipped tests. Equivalent production bundle validation completed with `vite build` and a Node ESM `esbuild` server bundle. TypeScript direct checking still reports 1,004 inherited repository diagnostics; the one diagnostic in `server/routers/executive.ts` is an unchanged pre-existing overload mismatch at the unrelated financial-approval query (`:542`), not the operational-detail hold boundary.
