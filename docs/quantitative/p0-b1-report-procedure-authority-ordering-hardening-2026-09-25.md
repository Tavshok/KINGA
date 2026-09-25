# P0-B1 Report Procedure Authority Ordering Hardening

**Date:** 25 September 2026
**Status:** Merge-ready; pending conventional PR review.
**Classification:** Narrow P0-B1 integrity hardening; authorization ordering and fraud-decision publication boundary.
**Base:** `user_github/main` at `45010c9a` (after merged P0-B1 Residual Authority Hardening and Wrapper Reintroduction Guard).
**Out of scope:** P0-B1 integration composition, P0-B1-Client, P0-B2/B3, changes to any other report route, schema/data/seed/configuration/deployment work, and changes to the global restricted-agency boundary.

## Finding

The independent review of the separately blocked Executive Report Authority Hardening package found that `protectedProcedure` applies the global `rejectRestrictedAgencyAssistedIdentity` middleware before a resolver runs. The intended executive-report resolver sequence was therefore only textual. At runtime, a restricted identity was denied before the required report-role test, local `report_access` denial, and tenant validation.

This package is deliberately separate from the blocked report package. The defect is a shared-procedure composition issue, not a reason to expand a report-route remediation after a review finding.

## Narrow correction

A new `executiveReportAuthorityProcedure` is exported from `server/_core/trpc.ts`. It applies only the established authenticated-session middleware, `requireUser`. The existing `protectedProcedure` remains unchanged and continues to apply both `requireUser` and the global restricted-agency middleware for all existing consumers.

`reports.generateExecutiveReport` is the sole production use of the narrow seam. Its resolver now owns the approved executable sequence:

1. authenticated session through `requireUser`;
2. `requireAlternateReportAccess(ctx, "executive.portfolio_overview")`;
3. `assertRestrictedAgencyAssistedCapability(ctx.user, "report_access")`;
4. `requireReportTenant(ctx.user.tenantId, input.tenantId)`;
5. canonical `throwP0B1FraudDecisionHold()`.

The terminal held procedure has no database acquisition, claim query, aggregate computation, legacy fraud notice, or PDF rendering. `generateFinancialSummary` and `generateAuditTrailReport` continue to use the unchanged global `protectedProcedure` boundary.

## Changed surfaces

| Path                                                   | Change                                                                                                                                                                                                                               |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `server/_core/trpc.ts`                                 | Adds the narrowly named authenticated authority seam while retaining the global `protectedProcedure` agency restriction unchanged.                                                                                                   |
| `server/routers/reports.ts`                            | Binds only `generateExecutiveReport` to the narrow seam; keeps the role → local agency → tenant → canonical-hold sequence.                                                                                                           |
| `server/p0B1ExecutiveReportAuthorityHardening.test.ts` | Adds runtime caller coverage for unauthenticated denial, combined wrong-role/restricted-agency precedence, exact local report-access denial, preserved sibling global restriction, tenant denials, canonical hold, and no DB access. |
| `server/reportsTenantAuthority.p0.test.ts`             | Adds source/composition guards for root registration, exact narrow seam binding, retained global protected procedure, sole reports-router seam use, and terminal hold order.                                                         |
| `server/p0B1IndependentBypassHardening.test.ts`        | Updates the existing executive source boundary locator to the approved narrow seam while continuing to require canonical hold/no DB/no PDF behavior.                                                                                 |
| `server/reports.test.ts`                               | Carries the independently blocked report package's stale legacy executive-PDF expectations forward to canonical-hold behavior; no Financial Summary or Audit Trail behavioral rewrite.                                               |

## Regression intent

The caller-level regression explicitly separates the two previously conflated cases. A caller who is both wrong-role and restricted agency-assisted must receive the report-role denial first. A caller with an allowed report role but restricted agency identity must reach the resolver and receive the specific `report_access` denial. A restricted caller to sibling `generateFinancialSummary`, still on `protectedProcedure`, must receive the unchanged global agency denial before database access.

The source guard makes a silent revert structurally visible. It requires the root-registered executive route to bind exactly to `executiveReportAuthorityProcedure`, rejects `protectedProcedure`, `publicProcedure`, and direct `t.procedure` on that route, requires the globally restricted `protectedProcedure` declaration to remain intact, and confines the narrow seam to its import plus the executive route binding in `reports.ts`.

## Validation

The guarded isolated matrix ran only against `kinga_ci_test`:

```text
server/p0B1ExecutiveReportAuthorityHardening.test.ts
server/reportsTenantAuthority.p0.test.ts
server/agency/agencyAssistedClaimantAuthorityRoutes.test.ts
server/p0B1IndependentBypassHardening.test.ts
server/reports.test.ts
server/evidence-governance/p0FraudDecisionHold.test.ts
server/reporting/p0FraudPresentation.test.ts

Test Files  7 passed (7)
Tests       34 passed (34)
```

The matrix proves the new runtime sequence and preserves global agency denial on a sibling protected report route. It also rechecks the existing restricted-agency route inventory and the pre-existing independent P0-B1 bypass constraints.

A direct TypeScript check reports 990 inherited diagnostics on this branch compared with 993 in the mainline comparison worktree. After normalizing the absolute temporary-worktree path embedded in one inherited schema diagnostic, there are **zero new semantic diagnostics** and zero semantic resolutions. The raw count difference is duplicate/line-location accounting from the removed legacy executive generator; it is not a claim that the repository typecheck is globally clean.

The fresh independent adversarial review returned **APPROVE**. It independently confirmed the seam is only `requireUser`, the active root-registered executive route has the required runtime order, `protectedProcedure` remains globally fail-closed for other consumers, sibling report routes retain their original boundary, and the tests assert the corrected behavior rather than the old middleware preemption. The reviewer found no blocker.

The guarded full suite, production build, direct type-diagnostic delta, and formatting/diff hygiene gates are complete. The remaining step is publication of the conventional PR to `main` for owner review.

## Merge-readiness evidence

The complete configured unit suite was run through the guarded isolated runner in 62 serial shards. It completed with a real summary for every shard: **617 passed / 0 failed / 1 configured-skipped test file** and **9,799 passed / 0 failed / 4 configured-skipped tests** across 618 eligible test files. No shard terminated ambiguously, and `failed_shards=0`.

`pnpm build` completed with exit status 0: Vite built the client and esbuild generated `dist/index.js`. The only output was pre-existing chunk-size warnings; no build error occurred. The normalized direct TypeScript comparison remains zero new semantic diagnostics. Prettier passes on new/small tests and this record, legacy files retain their baseline formatting, and `git diff --check` passes.

## Sequencing

This package must merge before the blocked Executive Report Authority Hardening package can resume. After both merge, the paused P0-B1 integration branch must rebase on `main`, receive combined validation and a fresh adversarial composition review. That final review must inspect the whole composed suite for assertions that could pass while encoding an incorrect authority sequence; a green suite alone is not sufficient evidence.
