# P0-B1 Held-Action Boundaries (B-R2)

**Status:** adversarially reviewed and merge-ready; review PR pending.

## Purpose

B-R2 closes the remaining **live browser workflow** paths that could treat a canonical P0-B1 fraud-decision hold as ordinary absent data, a successful action, or a navigable decision surface. It is intentionally separate from the earlier B-R1 fabricated-reassurance package. B-R1 stopped false safe/low-risk presentation. B-R2 stops action, replay, report, escalation, and search flows from continuing when the server withholds fraud decision authority.

The package uses the already-merged B-G0 fixed-boundary guard and B-G1 repository-wide exact consumer inventory. It does not add a parallel hold convention.

## Fresh current-source scope

The six current, live boundaries were re-derived from `feat/p0-b1-composed-fraud-boundary-final` after B-G1 merged. The original shorthand list was not accepted without current-source verification.

| Boundary                                             | Current behavior corrected                                                                                                                                | Containment                                                                                                                                                                                                                                                                           |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `client/src/components/PoliceReportForm.tsx`         | A held `policeReports.create` response could enter success/discrepancy feedback.                                                                          | The mutation success callback exits before notification or refetch. A current held mutation result renders the canonical hold.                                                                                                                                                        |
| `client/src/components/replay/ReplayTriggerForm.tsx` | Single and batch replay could show success feedback or batch counts after a held result.                                                                  | Each mutation exits on its own canonical hold. Held mutation state terminally renders the canonical hold before replay UI or result counts.                                                                                                                                           |
| `client/src/pages/ClaimDecisionReport.page.tsx`      | A held assessment, snapshot, or finalisation response could continue into report, snapshot, finalisation, replay, re-analysis, or navigation workflow UI. | The direct assessment and snapshot responses are each discriminated, and either hold terminally renders the canonical hold before loading or missing-assessment fallbacks. Finalisation success exits on a hold and the mutation's held state terminally replaces the report surface. |
| `client/src/pages/InternalAssessorDashboard.tsx`     | The expandable KINGA context could reveal a hold after workflow actions were already available.                                                           | The workflow-owning dashboard now owns and discriminates the lazy context query. A received hold terminally replaces the dashboard before assessment, AI-reassessment, payment-authorisation, report-navigation, or readiness output can render.                                      |
| `client/src/pages/RiskManagerDashboard.tsx`          | A held escalation query could fall through to client fallback filtering and leave approval/financial workflow actions live.                               | The escalation response is discriminated and a hold terminally replaces the dashboard workflow surface.                                                                                                                                                                               |
| `client/src/pages/ExecutiveDashboard.tsx`            | A held global-search response could be reduced to absent results while executive search and result routing remained live.                                 | The global-search response is discriminated and a hold terminally replaces the Executive dashboard surface. The existing result component also receives the unstripped sentinel as defense in depth.                                                                                  |

`AiReanalysisPanel.tsx` is not part of B-R2. The fresh audit found that it is not currently mounted on a live route. It remains a tracked Tier-2/dormant client surface rather than being silently treated as closed.

`GeographicRiskClustersPanel.tsx` remains outside B-R2 for the same reason: its current import is not rendered by the live Risk Manager dashboard. Its deferred Tier-2 classification remains unchanged. The corresponding geographic server route already returns the canonical hold, so this package makes no server change there.

## Structural enforcement

B-R2 extends B-G0's fixed high-risk boundary registry from four to nine query boundaries and adds four held mutation boundaries. For registered queries, the verifier requires all of the following in the exported component that owns the actual tRPC call:

1. A direct binding to the declared tRPC query.
2. A direct call to `discriminateP0B1FraudDecisionResponse` on that query result.
3. Direct `hold` and `value` bindings from the discriminator response.
4. A terminal direct `<P0FraudValidationHold hold={...} />` branch before legacy workflow output.

The verifier rejects a recognized hold branch if any prior branch can return non-hold output. A preceding hold branch is allowed only when it has no `else` arm and terminally returns the canonical renderer itself. This prevents a syntactically valid but unreachable hold branch from being appended below the live render return or behind an earlier live `else` return.

For held mutations, the verifier requires the first success-callback statements to discriminate the returned value and return on its canonical hold. It separately requires current mutation state to terminally render the same hold before legacy success output.

B-G1's symbol-resolved inventory was regenerated only after the B-R2 source was fixed. It now has **73 exact client-hook fingerprints**. It fails on any moved, removed, added, malformed, duplicated, or fingerprint-tampered hold-capable consumer. This is a consumer inventory, not the later approved Group B TypeScript-exception manifest.

## Validation so far

Focused guarded validation completed against the disposable loopback `kinga_ci_test` database:

- 8 files and 34 tests passed: the shared hold contract, Group A rendering and authority tests, B-R1 runtime rendering, B-R2's Internal Assessor workflow-owner runtime regression, and publication/browser containment regressions.
- B-G0 boundary verifier passed for 9 query boundaries, 4 mutation boundaries, and the exported Risk Portfolio server hold route.
- B-G0's 18 adversarial AST/source regressions passed, including a Police Report success-continuation attack, a Claim Decision Report post-return hold-branch attack, an earlier-hold `else`-return attack, a finalisation success-continuation attack, and a Risk Portfolio inline-hold attack.
- B-G1 exact typed consumer verification passed for 73 fingerprints. Its 16 resolver and manifest-integrity regressions passed.
- Direct TypeScript compilation retains inherited repository diagnostics. The only diagnostic on a B-R2 changed path is the pre-existing impossible `claims_processor` role comparison in `ClaimDecisionReport.page.tsx:837`; no new B-R2 type diagnostic remains after the available-value narrowing.
- `git diff --check` is clean. The six legacy browser files remain outside the current Prettier baseline. No broad formatter write was run.

### Merge readiness

- The first full guarded run exposed exactly two stale source assertions caused by B-R2's correct containment: the snapshot-governance test still expected the retired permissive snapshot normalization, and the Global Search presentation test still expected a redundant conditional payload expression. The former now requires direct canonical discrimination; the latter source was simplified back to the already-terminal available value. No product boundary was relaxed.
- The clean final guarded serial run completed **628 eligible test files** in **63 shards** with **9,878 passed** and **4 explicitly skipped** tests; `failed_shards=0`.
- The client production build completed successfully. It retained two pre-existing Vite warnings: a duplicate `border` key in `BulkValuation.tsx` and large generated chunks. The package-equivalent server bundle completed successfully with `--packages=external` (`dist/index.js`).

## Deferred work and sequencing

B-R3, the two confirmed crash-only paths, remains a later narrow package. The exact-fingerprint Group B TypeScript-exception manifest remains blocked until B-R2 and B-R3 resolve the active safety paths and the safe diagnostic set is re-derived again. The P0-B1 integration PR remains unopened until those prerequisites complete.

Physics holds remain a known separate gap. B-G0 and B-G1 enforce fraud holds only. Before P0-A-3 begins after the integration PR opens, assess whether an analogous physics discriminator, fixed-boundary guard, and consumer inventory should be built before per-file physics remediation.

## References

[1]: https://github.com/Tavshok/KINGA "KINGA source repository"
