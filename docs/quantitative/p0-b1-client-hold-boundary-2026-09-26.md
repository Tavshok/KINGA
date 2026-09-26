# P0-B1 Client Hold Boundary (B-G0)

**Status:** merge-ready; review PR pending
**Date:** 2026-09-26
**Branch:** `fix/p0-b1-client-hold-boundary`
**Base:** `177c0384` — merged B-R1 fabricated-reassurance containment

## Conclusion

B-G0 makes the canonical P0-B1 fraud hold a required browser boundary for five already-known live query surfaces. Each registered consumer now calls the existing `discriminateP0B1FraudDecisionResponse()` helper before it accesses legacy fraud fields. A hosted Quality Gate source guard fails if a registered boundary loses that discrimination or reintroduces the specific zero/default fallback that caused the prior bypass.

This is not a claim of estate-wide browser closure. The deferred Tier-2 display inventory, the not-yet-re-derived B-R2 action paths, the two B-R3 crash paths, the future exact-fingerprint comparator manifest, and all physics-hold work remain outside B-G0.

## Corrected boundaries

`VehiclePassportPanel.tsx` now uses the shared discriminated response rather than a local hold lookup. A direct hold still takes precedence over every legacy fraud-derived Passport value. Pending, failed, or absent authority data remains fail-closed through the existing shared fallback.

`ExecutiveAlertsCenter.tsx` now distinguishes a direct canonical hold from both a successful empty alert list and a query error. B-R1 had corrected the query-error path, but a direct hold could still become `[]` and render “All clear.” B-G0 renders the shared manual-review hold before the empty-success branch. The executable renderer regression covers both the rejected-query and direct-held-response cases.

`ExternalAssessorDashboard.tsx` now uses the shared discriminator before reading the nested held assessment. A held score cannot reach the green score-styling branch.

`RiskManagerDashboard.tsx` now discriminates the direct `claims.getRiskPortfolioAnalytics` result before displaying fraud-rate or average-score KPIs. A hold renders shared manual-review guidance. An ordinary missing KPI renders `—`; it does not derive a score from the separate active-claims list.

`claims.getRiskPortfolioAnalytics` retains its existing early canonical P0-B1 hold and now removes its unreachable legacy database/score/level/aggregate body. The route therefore has no retained raw fraud read to reactivate accidentally.

## Structural enforcement

`scripts/ci/verify-p0-b1-client-hold-boundary.mjs` is the narrow B-G0 registry. It parses each registered file with the TypeScript compiler API. It verifies that the actual response variable calls the shared discriminator, that the actual hold and available-value variables derive from that response, and that a conditional using the actual hold variable renders the shared hold component. It also resolves `getRiskPortfolioAnalytics` as an AST property, requires its canonical hold return, and rejects raw database, score, or level identifiers inside that actual callback.

The new guard’s own Node regression suite proves acceptance of the registered source. It rejects a commented-out Executive Alerts hold binding, an Executive Alerts `data?.alerts ?? []` fallback, a Risk Portfolio database/score reintroduction even when an adjacent route name changes, and an unresolvable Risk Portfolio route. The Quality Gate invokes that suite alongside its existing trigger-scope and stacked-comparator guards, so removal of the hosted invocation also fails the pinned workflow verifier.

> The guard does not prove that every client file is safe. It prevents regression at the five registered boundaries and makes the required shared handling explicit for future review.

## Validation to date

The guarded focused matrix passed with 3 test files and 14 tests. It covered the shared discriminator, all B-R1 renderer paths, the corrected direct and pending Executive Alerts states, and the existing analytics publication route tests. The standalone AST source guard passed. Its dedicated Node regression matrix and the Quality Gate trigger verifier passed 24 tests together, including the hosted source-guard invocation check. `git diff --check` passed.

The first adversarial review blocked the original string-marker guard because comments could satisfy its required text and a renamed delimiter could hide Risk Portfolio raw access. It also identified accidental Prettier churn in `claims-core.ts`. The first remediation replaced substring checks with AST bindings, added the exact commented-binding and renamed-adjacent-route adversarial fixtures, and recovered a minimal Risk Portfolio-only route diff.

The fresh re-review then blocked that first AST implementation because its file-global identifier map and first-match route lookup could be satisfied by same-named decoys outside the live component or router. The second remediation resolves direct bindings only in each named exported component scope. It resolves the Risk Portfolio property only inside the exported `claimsRouter` object. The regression suite now includes both same-name-decoy attacks and verifies that each fails. A final adversarial re-review is required before merge readiness.

The next re-review found two more structural gaps: a nested `.query()` decoy could be selected inside the registered route property, and a hold renderer could exist without dominating a reassurance branch. It also found that the Executive Alerts header showed “No active alerts” while its query was still pending. The third remediation resolves only the direct `insurerDomainProcedure.input(...).query(callback)` chain of the registered route, rejects nested query decoys, rejects nested Risk Portfolio `?? 0` defaults, checks that reassurance strings occur only under a direct hold partition, and renders an explicit loading status while authority is unresolved. The regression suite covers each attack. A final adversarial re-review is required before merge readiness.

That review found one final render-tree decoy: an unreachable callback inside the returned JSX could satisfy a recursive hold-render search while the live held branch displayed “All clear.” The fourth remediation requires the hold renderer to be the direct true expression of the actual hold conditional, bound to the same hold variable, and skips nested function/callback bodies when locating that branch. The new adversarial fixture reproduces the exact unreachable callback and verifies rejection. A final adversarial re-review is required before merge readiness.

The subsequent re-review found that a direct hold variable could still be initialized with a conditional expression merely containing `.hold`, silently suppressing a valid hold. The fifth remediation requires exact unwrapped property access for every registered direct hold and value binding. Vehicle Passport now keeps its direct `fraudDecisionHold` distinct from its separately verified presentation fallback; Executive Alerts keeps its direct available value distinct from its derived list. The regression suite includes the exact always-null hold-suppression expression and verifies rejection. A final adversarial re-review is required before merge readiness.

The final independent adversarial re-review **APPROVED** the current implementation. It confirmed exact direct bindings and render branches in all four browser targets, the strict exported Risk Portfolio route callback, the 12 adversarial AST fixtures, the hosted Quality Gate invocation/pin, and the minimal `claims-core.ts` delta of 3 additions and 88 deletions. No fresh scope finding was raised. Merge-readiness validation is the next step.

### Merge-readiness evidence

The guarded isolated full suite completed serially in 63 shards: 627 eligible test files, 9,881 tests in total, 1 skipped file, 4 skipped tests, and **zero failed shards**. Its disposable shard logs were summarized and then removed to recover sandbox inode capacity; this record preserves the complete result. The baseline legacy formatter warnings on the five pre-existing large files were classified and intentionally not auto-rewritten; all new/changed test, CI guard, and record files pass Prettier.

A direct project TypeScript run remains nonzero (1,114 diagnostics) because of inherited diagnostics. A line-level comparison against B-G0's semantic additions found **zero diagnostics on an added line**. The eleven remaining `RiskManagerDashboard.tsx` diagnostics are on unchanged legacy held-action/list paths (`getEscalations` and related queue data being treated as an array), reserved for fresh B-R2 derivation; B-G0 does not broaden into that work. This is not a claim that the global typecheck is clean.

The production client build and server bundle both passed. Vite emitted pre-existing unrelated warnings for a duplicate `border` key in `BulkValuation.tsx` and chunk-size guidance; neither is caused by B-G0 or blocks the completed build.

The large legacy UI files have pre-existing formatter deltas. B-G0 preserves their baseline formatting and uses narrow semantic diffs; only new CI scripts and this record are formatted.

## Deferred work

B-R2 must be freshly derived after B-G0. Its prior six-file list is not treated as authoritative until current-source reachability and route contracts are rechecked. B-R3 remains third in the owner-approved severity order. The exact-fingerprint Group B exception manifest remains blocked until all approved runtime-risk work is resolved and the safe diagnostic set is re-derived.

Physics-hold structural enforcement is a separate known gap. B-G0 intentionally covers only P0-B1 fraud holds. P0-A-3 must evaluate a corresponding physics discriminator and CI adoption rule before relying on per-file client remediation.

## References

[1]: ../../shared/p0FraudDecisionHoldPresentation.ts "Canonical P0-B1 fraud hold and discriminated response"
[2]: ../../scripts/ci/verify-p0-b1-client-hold-boundary.mjs "B-G0 registered client hold-boundary verifier"
[3]: ../../server/p0B1BrowserFabricatedReassurance.test.ts "Executable browser fabricated-reassurance regression coverage"
