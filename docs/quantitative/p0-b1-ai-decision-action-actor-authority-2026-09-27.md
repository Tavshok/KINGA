# P0-B1 AI Decision-Action Actor Authority

**Package:** P0-B1 AI Decision-Action Actor Authority
**Validation date:** 27 September 2026
**Branch:** `fix/p0-b1-ai-decision-action-actor-authority`
**Base:** `feat/p0-b1-composed-fraud-boundary-final` at `15d43245de9d19b126b23b407a1e24e75e957ae1`
**Status:** **APPROVED by independent adversarial review; merge-ready pending PR and hosted Quality Gate**

## Purpose

Final composed validation found that ten decision-lifecycle procedures authenticated a user and resolved a tenant-owned claim before returning the canonical P0-B1 hold, but did not first establish that the actor held decision-lifecycle authority. An ineligible same-tenant actor could therefore receive a canonical hold instead of `FORBIDDEN`.

This package adds the missing server authority boundary without expanding to payment authority, dashboard publication, or client rendering.

## Authority contract

The router now uses the existing `GOVERNANCE_ALLOWED_ROLES` policy from `shared/role-permissions.ts`:

- insurer roles: `insurer_admin`, `executive`, `risk_manager`, `claims_manager`;
- platform identities accepted by the existing `isAdminRole()` predicate: `admin` and `platform_super_admin`.

All other insurer roles, assessors, claimants, panel beaters, recovery officers, and users without a recognized governance role are denied.

The actual order on every covered route is:

1. authenticated session (`protectedProcedure`);
2. global restricted agency-assisted identity denial (`protectedProcedure`);
3. `requireDecisionActionActor(ctx)`;
4. `requireGovernedTenantClaim()` tenant and resource authorization;
5. canonical P0-B1 decision hold;
6. only if policy later permits it, dynamic imports and decision-lifecycle, audit, or database capabilities.

This preserves the prior approved tenant/resource-before-hold rule for authorized actors. It also guarantees that an ineligible actor does not learn whether the requested claim exists and does not invoke claim lookup, the hold, dynamic imports, database access, audit, replay, or lifecycle operations.

## Covered procedures

The following `aiAssessments` procedures now call the actor gate before `requireGovernedTenantClaim()`:

- `saveSnapshot`
- `getLatestSnapshot`
- `replayDecision`
- `getLifecycle`
- `markReviewed`
- `finaliseDecision`
- `lockDecision`
- `getAuditLog`
- `getReplayLogs`
- `getSnapshots`

## Tests and adversarial review

`server/p0B1DecisionActionRuntimeProof.test.ts` executes callers created from the real `aiAssessmentsRouter`; it does not mock tRPC, `protectedProcedure`, or the new actor gate. The regression proves, for all ten routes:

- same-tenant `claims_processor` callers receive `FORBIDDEN` before governed-claim lookup and protected capabilities;
- every authorized governance role and a platform administrator reaches the existing tenant/resource-to-hold boundary;
- missing and foreign resources still deny before the hold and protected work;
- a restricted agency-assisted identity remains rejected by global middleware before actor or claim resolution.

`server/aiAssessmentGovernanceTenantAuthority.p0.test.ts` provides source-order coverage for all ten routes as defense in depth.

Independent adversarial review returned **APPROVE**. It confirmed exact policy alignment with the canonical governance role set, actual protected-middleware order, executable caller-level coverage, scope containment, and the absence of formatter churn. No remediation was required.

## Validation evidence

| Check                        | Result                                                                                                                                                                                                                                                |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Focused guarded matrix       | 4 files, 65 tests passed: actor runtime proof, AI source-order regression, Decision Report browser hold containment, and Internal Assessor payment hold containment.                                                                                  |
| B-G0 fixed-boundary guard    | Passed: 12 query boundaries, 9 mutation boundaries, one exported server route; 21/21 Node regressions.                                                                                                                                                |
| B-G1/B-G2 consumer inventory | Passed: 78 exact client-hook fingerprints.                                                                                                                                                                                                            |
| Guarded full suite           | 630 eligible files in 63 serial shards; 0 failed shards; 629 passed / 1 skipped files; 9,939 passed / 4 skipped tests. Every shard used `scripts/run-isolated-vitest.ts` against the guarded disposable CI database.                                  |
| Production build             | Direct `vite build` and bundled `esbuild server/_core/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist` succeeded. Inherited warnings only: duplicate `border` key in `BulkValuation.tsx` and large generated chunks. |
| TypeScript                   | Global `tsc --noEmit` remains nonzero from inherited diagnostics. It reported **no diagnostics** for the three changed package paths. This is not a global TypeScript-clean claim.                                                                    |
| Diff hygiene                 | `git diff --check` clean. The legacy router does not satisfy current Prettier check; no broad formatter rewrite was applied. The committed diff remains narrowly semantic.                                                                            |

The prior disposable full-suite launcher had been intentionally cleaned with other temporary artifacts. For this package, the identical approved guarded serial pattern was reconstructed from the retained runner record: the same eligible-file filter, ten-file serial shards, and `run-isolated-vitest.ts` invocation. It produced the complete aggregate above; no raw Vitest invocation, live database, staging, production, schema, data, configuration, or deployment action occurred.

## Scope boundary

This package intentionally does **not** change `claims.authorizePayment`. Payment authority follows the narrower workflow transition policy (`claims_manager` and `executive`) and remains a separately approved P0-B1 Payment Command Actor Authority package.
