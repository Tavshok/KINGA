# P0-B1 Executable Decision-Action Runtime Proof (B-T1)

**Date:** 27 September 2026

**Status:** **APPROVED and merge-ready.** Two adversarial test-semantics reviews found and closed proof-only gaps; the final confirmation approved the corrected candidate. Guarded merge-readiness, production build, focused formatting, and changed-path TypeScript hygiene are complete.
**Classification:** Narrow, test-only P0-B1 integrity hardening on the merged B-R2-C integration lineage.

## Purpose

B-G0 and B-G1 structurally enforce the canonical P0-B1 fraud-hold boundary and inventory every hold-capable browser consumer. B-R2-C corrected the remaining decision lifecycle, snapshot, replay, audit, payment, and client continuation paths. Before final composed validation, however, the affected server routes were covered mainly by source-order assertions.

B-T1 supplies the missing **executable runtime proof**. It does not change a production route, response contract, hold policy, schema, data, configuration, deployment, or deferred client package. It proves, through real tRPC callers and React server rendering, that the actual held execution paths satisfy the existing P0-B1 boundary.

> A valid fraud hold must follow the route's required authorization and then prevent protected reads, lifecycle/governance/replay/payment work, notification-success continuation, and legacy workflow rendering.

## Included proof obligations

| Surface                                                          | Runtime proof                                                                                                                                                                                                                                                        |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `aiAssessments.saveSnapshot`                                     | An authorized caller receives the canonical hold before snapshot persistence or lifecycle creation.                                                                                                                                                                  |
| `aiAssessments.getLatestSnapshot`                                | An authorized caller receives the canonical hold before a snapshot read.                                                                                                                                                                                             |
| `aiAssessments.replayDecision`                                   | An authorized caller receives the canonical hold before snapshot reads, replay execution, lifecycle reads, or replay-log writes.                                                                                                                                     |
| `aiAssessments.getLifecycle`                                     | An authorized caller receives the canonical hold before lifecycle access.                                                                                                                                                                                            |
| `aiAssessments.markReviewed`, `finaliseDecision`, `lockDecision` | An authorized caller receives the canonical hold before governance enforcement, lifecycle transitions, snapshot authority marking, or audit effects.                                                                                                                 |
| `aiAssessments.getAuditLog`, `getReplayLogs`, `getSnapshots`     | An authorized caller receives the canonical hold before audit, replay-history, or snapshot readers.                                                                                                                                                                  |
| Tenant/resource precedence                                       | For each of the ten AI decision procedures, both a missing and a foreign governed-claim rejection return their access error rather than a canonical hold and invoke no post-authority capability.                                                                    |
| `claims.authorizePayment`                                        | The existing agency capability and tenant-owned claim validation run before the canonical hold; no payment database handle, audit write, or notification capability is reached. Missing and foreign caller-tenant claim lookups are denied before the hold.          |
| `ClaimDecisionReport.page.tsx`                                   | Server-rendered held query states (`latestSnapshot`, lifecycle, audit log, snapshot history) and held mutation states (snapshot save, review, finalise, lock, replay) terminally render the canonical hold without any adversarial legacy-workflow sentinel content. |
| Decision Report mutation callbacks                               | Each registered `onSuccess` callback is executed with a canonical held result and produces no `success`, `error`, or `warning` toast or lifecycle/audit refetch continuation.                                                                                        |
| `InternalAssessorDashboard.tsx`                                  | A held current payment mutation state terminally renders the canonical hold and removes the action-owning workflow surface.                                                                                                                                          |

## Test design

### Server caller proof

`server/p0B1DecisionActionRuntimeProof.test.ts` uses real router callers with a tenant-scoped authenticated context. It uses an exact-module mock of `requireGovernedTenantClaim` to control the authority precondition; the real helper's own tenant-scoped database lookup is not reimplemented by this test. It separately mocks post-authority capabilities so they can be observed. Each successful authorization path asserts:

1. the governed tenant/claim authorization receives the exact claim and session-tenant inputs;
2. a deferred authority promise prevents the caller from settling or returning a hold until that authority resolves;
3. the result then has the immutable canonical hold status, explanation, review requirement, and `actionAllowed: false`;
4. no post-authority database getter, snapshot reader/writer, lifecycle helper, governance helper, replay helper, audit reader/writer, payment-audit writer, or notification helper runs.

For each AI procedure, both missing and foreign governed-resource rejections are exercised with the exact caller tenant and must win before a hold or protected operation. Payment has separate missing and foreign caller-tenant cases. This deliberately distinguishes authorization precedence from the authorized-held behavior; a canonical hold is not treated as a substitute for claim ownership validation.

### Browser execution proof

`server/p0B1DecisionActionBrowserRuntime.test.ts` uses the active `ClaimDecisionReport` component with tRPC hook fixtures and React server rendering. It does not rely on a source substring alone: every held query or mutation state must render the canonical `P0FraudValidationHold` and suppress adversarial sentinel content seeded into the otherwise-live claim, assessment, enforcement, and quote fixtures. It also captures the real mutation `onSuccess` handlers registered by the component and invokes each with a canonical hold to prove terminal early-return behavior: no success, error, or warning toast and no lifecycle/audit refetch continuation.

The existing `server/p0B1HeldActionRuntime.test.ts` is extended with the current held `claims.authorizePayment` mutation state, complementing its existing held lazy-context test.

## Focused validation

All commands use the guarded isolated `kinga_ci_test` runner only.

| Check                                                  | Result                                                                                                                                        |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| B-T1 server caller runtime proof                       | 33/33 passed after the first review's semantic corrections                                                                                    |
| B-T1 Decision Report rendered state and callback proof | 11/11 passed, including `success`/`error`/`warning` toast and lifecycle/audit refetch non-continuation assertions                             |
| Internal Assessor held-action runtime regression       | 2/2 passed                                                                                                                                    |
| Final three-file B-T1 proof run                        | 46/46 passed (33 server caller + 11 Decision Report + 2 Internal Assessor)                                                                    |
| Expanded authority/runtime/contract matrix             | 9/9 files, 110/110 tests passed under the guarded isolated runner                                                                             |
| B-G0 fixed-boundary verifier                           | 12 query boundaries, 9 mutation boundaries, and one exported server route verified; 21/21 Node regressions passed                             |
| B-G1 exact consumer inventory                          | 78 exact fingerprints verified; 32/32 resolver/manifest regressions passed                                                                    |
| Guarded merge-readiness suite                          | 630 eligible files in 63 serial shards; 0 failed shards; 629 passed/1 skipped files; 9,923 passed/4 skipped tests                             |
| Production build                                       | Direct `vite build` and bundled `esbuild server/_core/index.ts` completed successfully; inherited duplicate-key and large-chunk warnings only |
| TypeScript hygiene                                     | Global `tsc --noEmit` remains nonzero on 1,082 inherited diagnostics; it reports no B-T1 test-path diagnostics                                |
| Diff and focused formatting                            | `git diff --check` clean; all B-T1 tests and this record Prettier-clean                                                                       |

## Deliberate boundaries

- This package is **test-only**. It neither changes fraud policy nor retries a production remediation already contained in B-R2-C.
- It does not claim estate-wide browser closure. Deferred P0-B1-Client Packages B/C and Group B diagnostics remain unchanged.
- It does not alter the exact-fingerprint Group B TypeScript exception manifest, which remains blocked until all safety/authority packages are complete and the safe set is freshly derived.
- It does not add physics-hold enforcement. P0-A-3 must independently evaluate whether B-G0/B-G1-style structural enforcement is appropriate for physics holds after the P0-B1 integration PR opens.
- No staging, production, DDL, DML, seed, config, or deployment work is included.

## Required next steps

1. Stage only the three B-T1 test files and this record, verify the staged diff/hygiene, commit, push, and open the stacked B-T1 PR to `feat/p0-b1-composed-fraud-boundary-final`.
2. Await the hosted Quality Gate and explicit owner merge authorization. Do not merge B-T1 merely because local checks are green.
3. Only after B-T1 merges may final P0-B1 composed validation restart from scratch.
