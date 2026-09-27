# P0-B1 Decision-Action Authority Hardening (B-R2-C)

**Status:** **APPROVED and merge-ready** as an independently reviewed, stacked package. It has **not** been merged; owner merge authorization remains required.

## Purpose

B-R2-C is the independently approved final-composition hardening package for **decision lifecycle, snapshot, replay, audit, and payment authority**. It is deliberately separate from B-R2: B-R2 contains browser workflow boundaries; B-R2-C closes the corresponding server authority ordering and the remaining client continuation paths discovered during the final composed review.

The package uses the existing canonical `buildP0B1FraudDecisionHold()`/shared presentation contract, B-G0 fixed-boundary checks, and B-G1 exact hold-consumer inventory. It introduces no alternate P0-B1 sentinel or permissive fallback.

## Authority invariant

For every affected route, the order is:

1. authenticated procedure/session boundary;
2. governed tenant-and-claim/resource validation;
3. canonical P0-B1 fraud-decision hold while the policy is active;
4. only then lazy import and protected database, lifecycle, governance, replay, or payment capability use.

A valid hold must therefore make **no protected read, lifecycle write, governance action, replay execution, payment authorization, toast-success continuation, or legacy UI continuation**.

## Included boundaries

| Surface                                                                              | Prior gap                                                                                                                   | Containment                                                                                                                                                        |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `aiAssessments.saveSnapshot`                                                         | Database and lifecycle capabilities were imported before the P0-B1 hold.                                                    | Tenant/resource validation and hold precede both imports.                                                                                                          |
| `aiAssessments.getLatestSnapshot`                                                    | Snapshot reader import preceded the hold.                                                                                   | Hold precedes the lazy database reader.                                                                                                                            |
| `aiAssessments.replayDecision`                                                       | Held replay used an error throw after imports; browser continuation could be ambiguous.                                     | Tenant/resource validation and canonical returned hold precede all snapshot, replay, and lifecycle imports.                                                        |
| `aiAssessments.getLifecycle`, `markReviewed`, `finaliseDecision`, and `lockDecision` | Lifecycle or governance capability import/read/write could precede a hold, or the client could continue from a held result. | Every route returns the canonical hold before the protected capability; the Decision Report discriminates query and mutation results and terminally renders holds. |
| `aiAssessments.getAuditLog` and `getReplayLogs`                                      | Audit/lifecycle readers could be imported before governed-claim validation; `getReplayLogs` lacked a canonical hold.        | Validated tenant/resource → canonical hold → lazy protected reader; regressions assert the exact order.                                                            |
| `claims.authorizePayment`                                                            | Payment authorization could access the database before the P0-B1 boundary.                                                  | Tenant/resource validation and canonical hold precede the database import and payment action.                                                                      |
| `ClaimDecisionReport.page.tsx`                                                       | Snapshot, lifecycle, audit, review, lock, replay, and autosave responses could be treated as ordinary values or success.    | Every response is discriminated; a current hold replaces the report before workflow output or notification continuation.                                           |
| `ExternalAssessorDashboard.tsx`                                                      | Held assessment context could leave assessment action controls available.                                                   | Held result suppresses action controls; B-G0 verifies the action branch is dominated by the hold.                                                                  |
| `InternalAssessorDashboard.tsx`                                                      | A held payment authorization result could leave payment feedback/live workflow state.                                       | The mutation discriminates and terminally renders the canonical hold.                                                                                              |

## Structural enforcement

B-R2-C extends B-G0 with the reviewed query/mutation registrations and attacks that prove:

- Decision Report lifecycle, audit, snapshot, finalisation, replay, and action branches cannot continue after a hold.
- External Assessor action rendering cannot remain live for a held assessment.
- A hold branch must be terminal and dominate live legacy output.

The B-G0 direct verifier now confirms **12 query boundaries, 9 mutation boundaries, and one exported server route**. Its adversarial AST/source suite passes **21/21**.

B-G1's manifest was regenerated from the current source only after the reviewed consumers were contained. It now records **78 exact client-hook fingerprints**, and fails on any added, removed, moved, altered, malformed, or duplicate hold-capable consumer. Its resolver/manifest suite passes **32/32**.

## Review corrections retained

1. **Initial B-R2-C adversarial review:** blocked because `getReplayLogs` imported `decision-lifecycle` before tenant/resource validation and published replay-history output without a canonical hold.
2. **Remediation:** moved the lazy import after governed-claim validation and a returned canonical hold; added a formatting-independent source regression that checks this route alongside the other lifecycle procedures.
3. **Final adversarial re-review:** **APPROVE**. It confirmed canonical-hold ordering for every included lifecycle, snapshot, replay, audit, and payment boundary; terminal client containment; and no module-level `getDb` binding in either reviewed router. Its own review sandbox reported that it could not execute the guarded CI matrix; the actual candidate worktree did execute it successfully, as recorded below.

No blocker was suppressed or reclassified as a test failure.

## Validation evidence

- **Focused guarded authority matrix:** **7 files / 65 tests passed** against the disposable guarded `kinga_ci_test` runner:
  - `server/aiAssessmentGovernanceTenantAuthority.p0.test.ts`
  - `server/claimsCoreTenantAuthority.p0.test.ts`
  - `server/p0B1HeldActionRuntime.test.ts`
  - `server/p0B1BrowserFabricatedReassurance.test.ts`
  - `shared/p0FraudDecisionHoldPresentation.test.ts`
  - `server/p0B1FraudHoldMiddlewareGovernance.test.ts`
  - `server/evidence-governance/p0FraudDecisionHold.test.ts`
- **Fresh guarded merge-readiness suite:** **628 eligible files** in **63 serial shards**; **0 failed shards**; **627 passed / 1 skipped test file**; **9,878 passed / 4 skipped tests**. This fresh rerun supersedes the earlier summary that reported five skipped tests.
- **Production build:** direct `vite build` and `esbuild server/_core/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist` both completed successfully. Inherited warnings remain: a duplicate `border` key in `BulkValuation.tsx` and large output chunks. `pnpm build` is not claimed as passed: an earlier platform invocation was rejected because the working directory was not the managed project; the two constituent production commands above were run directly in the correct worktree.
- **TypeScript hygiene:** repository-wide `tsc --noEmit` remains nonzero from inherited diagnostics. A changed-line audit found **zero diagnostics on B-R2-C changed lines**. The known existing `ClaimDecisionReport.page.tsx(903,39)` TS2367 role-union comparison remains outside this package's changed lines.
- **Diff hygiene:** `git diff --check` is clean. No broad Prettier write was used on legacy source or test files; the payment source-order regression remains a narrow seven-line addition after an attempted whole-file formatter rewrite was discarded.

## Scope and merge boundary

Stage only the ten reviewed tracked files and this package record. Open the stacked PR against `feat/p0-b1-composed-fraud-boundary-final`, verify the hosted Quality Gate, and **do not merge without explicit owner authorization**. B-T1 is next only after B-R2-C is merged into the integration lineage.
