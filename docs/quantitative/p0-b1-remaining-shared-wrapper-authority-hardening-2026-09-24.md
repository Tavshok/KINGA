# P0-B1 Remaining Shared Wrapper Authority Hardening

**Date:** 24 September 2026
**Status:** Independent adversarial review approved; blocked from standalone publication only by the confirmed stacked-branch lineage constraint described below.
**Scope:** A narrow, independent integrity package that replaces the remaining shared P0-B1 fraud-hold middleware wrappers with direct route handlers. It does not change P0-B1 integration, P0-B1-Client, P0-B2, P0-B3, schema, data, configuration, deployment, or audit-export policy.

## Finding

The final pre-integration shared-wrapper audit found four historical middleware wrappers that threw the canonical P0-B1 fraud hold before the registered route body could perform its own authorization. The wrappers appeared in the P0-B1 integration ancestry before the structural guard was introduced. They did not disclose raw fraud data, but they violated the required authorization ordering because role, tenant, claim-ownership, and tier checks could be preempted by a hold.

> **Required order:** session and role checks, tenant scope, resource ownership, and any required cross-tenant audit must complete before a P0 hold. Once an authorized route reaches the hold, it must not read protected raw fraud data.

The four wrappers were `p0FraudSuperAdminProcedure`, `p0FraudAnalyticsProcedure`, `p0FraudClaimsManagerProcedure`, and `p0FraudTreProcedure`. The new P0-B1 middleware governance test from PR #153 correctly detected the wrappers because they contained canonical fraud holds in shared procedure middleware. This package removes those wrappers rather than weakening the guard.

## Remediation

The package replaces **22 wrapper-bound routes** with direct procedures that retain their previous route-specific input schema and non-fraud authorization conditions before calling `throwP0B1FraudDecisionHold()`.

| Area                  | Routes | Authorization retained before hold                                                                                                                                                                                       | Protected-data behavior                                                                                                                                                                                                                                            |
| --------------------- | -----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Admin Platform Health |      1 | Existing exact `platform_super_admin` procedure                                                                                                                                                                          | The canonical hold occurs before any database acquisition. This remains a global administrative hold and does not gain a tenant requirement that the prior route did not have.                                                                                     |
| Analytics             |     10 | Existing analytics role middleware; concrete tenant scope on every route; Risk Manager role and enterprise-tier check where the legacy route required them; the email-report route keeps its stricter legacy report role | All routes hold before protected analytics reads. The enterprise-tier lookup is an authorization read that occurs before the hold; no raw fraud aggregation follows it.                                                                                            |
| Claims Manager        |      2 | Existing insurer-domain procedure and a concrete tenant requirement, including denial of a tenantless platform super-admin                                                                                               | Both routes hold before queue or workbench data is acquired.                                                                                                                                                                                                       |
| TRE governance        |      9 | Existing authenticated session; tenant requirement; tenant-owned claim existence check for each claim route                                                                                                              | Claim routes perform the minimum ownership lookup before the hold. The aggregate dashboard performs tenant authorization and then holds without a database read. No assessment, CTO, fraud score, certification, or governance calculation is read after the hold. |

## Systemic Control

The root cause was structural rather than a route-local typo: a reusable tRPC `.use(...)` wrapper can execute before a handler and therefore silently override ordering visible in that handler. TypeScript cannot, by itself, prove that a dynamic middleware composition leaves local authorization reachable.

PR #153 introduced `server/p0B1FraudHoldMiddlewareGovernance.test.ts` as the preventive control. It parses non-test server TypeScript using the TypeScript AST and rejects canonical P0 hold calls and local fraud-hold `TRPCError` constructions inside procedure middleware. Its adversarial fixtures cover inline and named callbacks, aliases, namespace imports, factory indirection, rebinding, declaration hoisting, callback capture time, shadowing, parenthesized expressions, and nested scopes. The control permits canonical holds in direct route handlers after route-local authorization. It is therefore the standard structural prevention mechanism for future P0 fraud-hold work; route-level runtime tests remain necessary to prove the specific role, tenant, resource, and audit sequence.

## Regression Coverage

`server/p0B1RemainingSharedWrapperAuthorityHardening.test.ts` adds 26 focused assertions. It verifies that the four prohibited wrapper symbols are absent, each of the 22 routes is directly bound to the appropriate existing procedure, and direct route bodies do not retain a raw fraud-data path after the hold.

The runtime cases cover the following behavior:

- Platform Health accepts only a platform super-admin, returns the canonical hold without a database read, and preserves its global administrative semantics.
- Analytics preserves role denial, tenantless-session denial, tenantless platform-super-admin denial, Risk Manager role denial, enterprise-tier authorization, and canonical holds before raw analytics access.
- Claims Manager returns a tenant-scoped canonical hold to an authorized insurer-domain caller and denies a tenantless platform super-admin before the hold.
- TRE denies a tenantless session before resource lookup, denies a foreign claim before the hold, validates a tenant-owned claim before the hold, and holds the aggregate dashboard without a database read.

The focused guarded matrix is green: **4 files, 107 tests passed** before the review follow-up assertion described below. It includes the new hardening regression, the 44-case shared-middleware governance suite, the Executive ordering regression, and the residual authority regression.

## Hygiene and Typecheck Interpretation

`git diff --check` passes. The new regression is Prettier-formatted. The four legacy routers remain intentionally unformatted because formatting them would create unrelated baseline churn; their semantic diff is narrow and was reviewed directly.

A direct `tsc --noEmit` run exits with the repository’s inherited diagnostic baseline. It reports existing diagnostics in the legacy Admin, Analytics, and Claims Manager routers, including the pre-existing nullable return type in `resolveAnalyticsTenant` and unrelated schema/import mismatches. The integration-lineage baseline comparator reports `baseline: 1001`, `current: 1290`, `new: 333`, and `resolved: 44`; it is not a package-local signal because this stacked worktree contains the entire still-unmerged P0-B1 integration delta. No global typecheck-clean claim is made.

## Review Gate

The fresh independent adversarial review returned **APPROVE**. It verified all 22 direct procedure bindings, the absence of the four prohibited wrappers, role/tenant/claim/tier ordering before every hold, the distinction between tier or ownership authorization reads and protected fraud reads, the canonical shared hold, and the continuing effectiveness of the PR #153 AST governance control.

The reviewer identified one non-blocking coverage improvement: explicitly prove that an analytics-authorized Executive is denied by the stricter legacy `sendRiskAnalyticsReport` Risk Manager/Admin gate. That assertion was added after review and focused revalidation passed. It does not change production behavior.

## Stacked-Lineage Constraint

The four wrappers were introduced only by the unmerged P0-B1 integration commits (`e48953e1` and descendants). They do not exist on current `main`, which already includes PR #152 and PR #153. Consequently, this remediation cannot truthfully be opened as a standalone PR against `main`: such a PR would either be empty or would require importing the blocked integration commits that it is intended to repair.

The owner approved the correct mechanical shape: a **stacked integrity PR on the P0-B1 integration lineage**, followed by refreshing the preserved integration worktree before the integration review PR is opened. The integration base may be published solely as the stacked PR base. The hardening PR targets that base, not `main`; once hosted checks pass, it will merge into the integration lineage. This preserves hardening-before-integration-review without a misleading standalone merge. No integration PR to `main` has been opened.

## Follow-up Backlog

The TypeScript baseline comparator currently evaluates the entire checked-out branch against the `main`-derived committed baseline. That is correct for ordinary PRs but creates a false package-level signal for stacked work because it includes the unmerged parent integration delta. A small follow-up should add an explicit base-ref comparison mode for stacked PRs, so future P0 packages compare their diagnostics against the parent integration branch rather than `main`. This follow-up is not part of this package and does not block its stacked review.

## References

[1]: ../p0-b1-wrapper-reintroduction-guard-2026-09-24.md "P0-B1 Integration Wrapper Reintroduction Guard"
[2]: ./p0-b1-residual-authority-hardening-2026-09-23.md "P0-B1 Residual Authority Hardening"
