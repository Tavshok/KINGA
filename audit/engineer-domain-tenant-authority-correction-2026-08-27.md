# P0 Engineering Domain Tenant Authority Correction

**Date:** 27 August 2026  
**Base revision:** `cb59e1355967b17fca0f95173343b925c854d318`  
**Held branch:** `fix/p0-engineer-tenant-authority`  
**Scope:** Correct only the five confirmed tenant-authority findings from `KINGA-RAW-COLUMN-AND-TENANT-AUTHORITY-AUDIT-2026-08-27.md`. The broader static candidate ledger is intentionally unchanged.

## Root cause and correction

`engineerDomainProcedure` admitted an authenticated user based on role alone. An engineer or permitted administrator with `ctx.user.tenantId === null` could therefore enter inspection callbacks that then substituted a synthetic `"platform"` tenant, persisted a `NULL` tenant, or switched to an owner-only fallback query.

The middleware now denies a missing session tenant with `FORBIDDEN` **before any inspection callback runs**. This creates a shared, fail-closed authority boundary rather than relying on four individual procedure fixes. After the shared guard was added, the four affected procedures were simplified to consume the now-guaranteed session tenant; no synthetic, `NULL`, or tenantless owner-query fallback remains in their paths.

| Finding | Location | Correction |
|---|---|---|
| TG-001 | `server/routers/inspections.ts` — `create` | Removed `ctx.user!.tenantId ?? "platform"`; uses the middleware-guaranteed tenant. |
| TG-002 | `server/routers/inspections.ts` — `upsertMyProfile` | Removed `ctx.user!.tenantId ?? "platform"`; uses the middleware-guaranteed tenant. |
| TG-003 | `server/routers/inspections.ts` — `createProject` | Removed `ctx.user!.tenantId ?? null`; no null-tenant project rows can be created through the route. |
| TG-004 | `server/routers/inspections.ts` — `listProjects` | Removed the null-tenant `createdBy` fallback; results always use the session tenant predicate. |
| TG-005 | `server/routers/audit.ts` — `logAccessDenial` | Removed caller-controlled `tenantId` from the input contract; requires a session tenant and persists only `ctx.user.tenantId`. |

## Regression coverage

The existing real-database `server/engineer/inspectionAuthority.p0.test.ts` fixture was extended without creating a parallel fixture lifecycle. It now proves that a role-permitted tenantless engineering session is rejected with `FORBIDDEN` for all four affected inspection procedures:

1. `inspections.create`
2. `inspections.upsertMyProfile`
3. `inspections.createProject`
4. `inspections.listProjects`

The same test proves `audit.logAccessDenial` rejects a tenantless session. It then invokes the audit route with a valid tenant-A session while passing tenant B as an unrecognised legacy field. The retrieved record is asserted to carry tenant A, proving attribution derives from the authenticated session rather than caller data. The one audit record created by the proof is captured by primary key and deleted in the suite’s `afterAll` hook.

## Verification

| Check | Result | Evidence |
|---|---|---|
| Focused live-TiDB regression | **7 passed, 0 failed** | `inspectionAuthority.p0.test.ts`; includes all five affected procedures and existing cross-tenant coverage. |
| Bundled server build | Passed | `npx esbuild server/_core/index.ts --platform=node --packages=external --bundle --format=esm`. |
| Vite production build | Passed | `NODE_OPTIONS=--max-old-space-size=1792 npx vite build`; existing duplicate-key warning in `client/src/pages/BulkValuation.tsx` remained non-fatal and outside scope. |
| Full suite — current main | 13 failed files, 26 failed tests, 8,764 passed, 3 skipped, one unexpected worker exit | Same live database, single-worker configuration. |
| Full suite — held branch | 12 failed files, 25 failed tests, 8,849 passed, 3 skipped, one unexpected worker exit | No branch-only failed identifier. The sole main-only failure was the previously observed `truthReconciliationEngine` idempotency assertion. |
| TypeScript baseline comparison | Inconclusive | Both this work and matching main encounter the known project-scale TypeScript memory ceiling. The main check reached the configured 1.8 GB Node heap and exited before diagnostics. No TypeScript result is claimed as green. |

The complete-suite result remains a baseline comparison, not a global-green claim, because the repository’s `singleFork` worker exits unexpectedly after variable partial completion. The focused real-database regression and both production builds passed.

## Boundaries retained

No schema, DDL, migration, production data, provider activation, payment, policy, settlement, or authentication-bypass change was made. No static-audit candidate other than the five approved confirmed defects was modified. No pull request was opened and no branch was merged.
