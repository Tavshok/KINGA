# P0-B1 Executive Report Rebase Authority Regression Hardening

**Date:** 25 September 2026
**Status:** In validation
**Scope:** Narrow integration-lineage correction; no schema, data, seed, configuration, deployment, client, or unrelated policy change.

## Finding

Rebasing the P0-B1 integration branch on PR #156 reintroduced an earlier integration commit's router-local executive-report hold. The legacy `PRECONDITION_FAILED` throw occurred before report role, restricted-agency capability, and tenant authorization. The correct authorization calls remained later in the resolver but were unreachable.

This was a real behavior defect, not a stale test expectation. The runtime caller regression from PR #156 rejected six unauthorized/authorized ordering cases with the legacy message. The prior source guard passed because it only confirmed that the intended calls appeared in textual order. It did not reject a terminal statement before the first authorization call.

## Correction

`reportsRouter.generateExecutiveReport` again executes the required sequence:

1. Authenticated session via `executiveReportAuthorityProcedure`.
2. Report-role authorization through `requireAlternateReportAccess`.
3. Route-local agency-assisted identity restriction.
4. Session/requested-tenant validation.
5. Canonical P0-B1 fraud decision hold.

The package removes only the unreachable legacy local hold. It does not alter the global `protectedProcedure` agency boundary or the route-specific authority seam merged in PR #156.

## Regression control

`reportsTenantAuthority.p0.test.ts` now rejects any `throw`, `return`, router-local `TRPCError`, or direct canonical P0 hold before the first executable report-role authorization call. The existing caller-level suite confirms the actual order and no-database behavior for unauthenticated, wrong-role, restricted-agency, tenantless, tenant-mismatch, and fully authorized callers.

The guard is intentionally route-specific. It checks the executable resolver prefix rather than accepting later text as evidence of a path that can never run.

## Validation to date

The guarded disposable-DB focused matrix passed **4 files / 26 tests**:

- `server/p0B1ExecutiveReportAuthorityHardening.test.ts`
- `server/reportsTenantAuthority.p0.test.ts`
- `server/reports.test.ts`
- `server/p0B1IndependentBypassHardening.test.ts`

The direct historical-shape probe also passed. It confirms the strengthened source guard rejects the pre-authorization terminal hold from `b06c4654` while accepting the corrected resolver prefix.

The direct project TypeScript command retains inherited diagnostics in `server/routers/reports.ts` at later, unchanged financial/audit report code. It reports no diagnostic in the removed executive-route lines or the changed source guard. The package does not claim a project-wide clean typecheck.

### Independent adversarial review

The fresh adversarial review returned **APPROVE**. It verified the executable route sequence, the retained global protected-procedure agency boundary, canonical hold use, runtime no-database assertions, and the source guard's rejection of the historical shape. It found no scope expansion or authority blocker.

### Merge readiness

The production build passed. The guarded serial suite covered **623 configured files**. Its first pass exposed only the 11 approved stale-expectation files that had not yet been committed to the successor integration lineage; none intersected this package's two source changes. After the reconciliations were committed to that lineage and this package was rebased onto it, all eight affected shards were rerun under the same guarded disposable-database runner. The complete final aggregate is **622 files passed, 1 skipped; 9,854 tests passed, 4 skipped; 0 failures**.

`git diff --check` and scoped Prettier verification pass. This package is ready for a stacked review PR into `feat/p0-b1-composed-fraud-boundary-final`.

## References

[1]: https://github.com/Tavshok/KINGA/pull/156 "P0-B1 executive report authority ordering hardening"
[2]: https://github.com/Tavshok/KINGA/commit/b06c46542622cb4bd0d22847c47bf8115c7b2aa7 "Original P0-B1 integration commit that introduced the pre-authorization hold"
