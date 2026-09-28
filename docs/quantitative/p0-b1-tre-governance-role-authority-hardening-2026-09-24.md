# P0-B1 TRE Governance Role Authority Hardening

**Date:** 24 September 2026
**Status:** Merge-readiness validation complete for this narrow package
**Lineage:** Stacked on `feat/p0-b1-composed-fraud-boundary` after the merged remaining-wrapper hardening package

## Decision

This narrow integrity package corrects the inherited admission model for P0-B1-held Truth Record governance routes. Each route now follows the required sequence:

> authenticated session → governance role → tenant scope → tenant-owned claim, where applicable → canonical P0-B1 hold

The aggregate governance dashboard has no claim input. Its sequence is therefore authenticated session → governance role → tenant scope → canonical hold. A valid held route does not read raw assessment, fraud, physics, or governance data after the hold.

## Root Cause

The removed `p0FraudTreProcedure` and its direct-route replacement both applied only authenticated-session, tenant, and claim checks. They did not enforce the established governance role policy. Consequently, an authenticated but unauthorized in-tenant user could reach the tenant-owned claim lookup before receiving the canonical hold. That could distinguish an existing in-tenant claim from a missing or foreign claim.

The final shared-middleware audit exposed this inherited defect. It was not introduced by the wrapper-reintroduction guard or the preceding remaining-wrapper hardening package.

## Remediation

`server/routers/tre-governance.ts` imports the existing `GOVERNANCE_ALLOWED_ROLES` policy and `isAdminRole` predicate from the central role-permissions module. The direct `requireTreGovernanceRole()` helper allows the four established insurer governance roles—`insurer_admin`, `executive`, `risk_manager`, and `claims_manager`—and the existing platform-admin exception. All other authenticated roles fail with `FORBIDDEN` before tenant or claim access.

The remediation leaves every P0-B1 hold direct. It does not restore `p0FraudTreProcedure`, restore `getAssessmentCTO()` access, add a router-local hold message, or read any protected assessment data after authorization has completed.

## Audit Boundary

No cross-tenant audit write is added. These routes accept neither a selected-tenant input nor a platform-global scope. Tenantless callers fail closed, and a tenant-scoped platform administrator remains in the existing tenant-bound path. Adding an ordinary-access audit write would introduce an unrelated operational data-write policy and is outside this corrective package.

## Regression Coverage

The focused regressions cover all nine held TRE procedures. They prove that an authorized governance caller reaches the canonical hold only after the required tenant-owned claim check for claim routes. They also prove that an unauthorized insurer role is denied before either tenant or claim access, a tenantless governance role is denied before resource access, a foreign claim returns the non-disclosing `NOT_FOUND` result before the hold, and the aggregate dashboard performs no database access after valid authorization.

The static authority regression now checks direct route shapes instead of the deleted shared wrapper. The P0-B1 gate regression now correctly expects the TRE resource check to precede the hold; it no longer treats a missing claim as a valid held route.

## Validation

| Validation                              | Result                                                                                                                       |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Guarded focused matrix                  | Passed: 3 files, 57 tests                                                                                                    |
| Guarded expanded P0-B1 authority matrix | Passed: 7 files, 145 tests, re-executed with the exact command below                                                         |
| Static ordering audit                   | Passed for all 9 TRE routes; no shared TRE fraud wrapper, raw assessment call, or reachable fraud field in held route bodies |
| Diff integrity                          | `git diff --check` passed                                                                                                    |
| Scoped test formatting                  | Passed for all modified tests                                                                                                |
| Direct TypeScript diagnostics           | Exit 2 with 1,886 inherited project diagnostic lines; no diagnostic names an active changed path                             |
| Independent adversarial review          | Approved after the exact guarded-matrix evidence was reconciled                                                              |
| Production build                        | Passed: `pnpm build` exit 0                                                                                                  |
| Guarded full suite                      | Completed with a real summary: 607 files passed, 12 failed, 1 skipped; 9,750 tests passed, 35 failed, 4 skipped              |

The reproducible guarded expanded-matrix command was:

```bash
./node_modules/.bin/tsx scripts/run-isolated-vitest.ts \
  server/p0B1FraudHoldMiddlewareGovernance.test.ts \
  server/p0-package-3-executive-router.test.ts \
  server/p0B1RemainingSharedWrapperAuthorityHardening.test.ts \
  server/treGovernanceTenantAuthority.p0.test.ts \
  server/pipeline-v2/p0-b1-fraud-decision-gate.test.ts \
  server/p0B1ResidualAuthorityHardening.test.ts \
  server/p0B1IndependentBypassHardening.test.ts
```

The command completed with `7 passed` test files and `145 passed` tests. The initial reviewer’s independent seven-file rerun intentionally used a different route set and produced 117 tests. It was not evidence against this package; nevertheless, this record now preserves the exact command and result for the 145-test claim.

The final independent read-only re-review approved the correction. It confirmed the exact matrix count, all nine direct role-before-hold route shapes, the central allowlist and platform-admin exception, pre-lookup denial for unauthorized roles, the absence of a shared fraud wrapper and post-hold protected reads, narrow diff scope, and no diagnostics on changed paths within the inherited project TypeScript baseline.

The guarded full suite has 35 remaining failing assertions in the already-classified stale P0-B1 expectation clusters: analytics holds, DOE/manual-review gating, removed historical fraud-score learning gates, Stage 8 fallback wording, report/publication withholding, and report-router executive hold expectations. The TRE authority tests that failed before this package now pass in shards 35 and 58. The full-suite result therefore blocks the eventual integration PR until those stale expectations are reconciled in the integration branch, but it does not block this narrow TRE role-authority package.

## Scope Boundaries

This package changes only the TRE governance role boundary and the direct regressions needed to express that boundary. It does not reconcile the separately classified stale P0-B1 report, analytics, DOE, learning, or observability expectations. Those expectation-only updates remain integration-branch work after this package has merged.

No schema, data, configuration, deployment, client, P0-B1-Client, P0-B2, or P0-B3 work is included.

## References

[1]: https://github.com/Tavshok/KINGA/blob/feat/p0-b1-composed-fraud-boundary/shared/role-permissions.ts "KINGA role permissions"
[2]: https://github.com/Tavshok/KINGA/blob/feat/p0-b1-composed-fraud-boundary/server/routers/tre-governance.ts "TRE governance router"
