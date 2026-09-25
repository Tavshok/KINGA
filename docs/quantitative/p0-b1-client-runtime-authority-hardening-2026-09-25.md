# P0-B1 Client Runtime Authority Hardening — Group A

**Date:** 25 September 2026
**Status:** final adversarial re-review approved; merge-readiness validation in progress
**Scope:** narrow integrity hardening for six current-lineage client/browser and publication paths with confirmed runtime or authority risk. This is not P0-B1-Client Packages B/C and does not remediate the separately deferred Group B type-only diagnostics.

## Trigger and verified current-source scope

The scope was re-derived from the current `feat/p0-b1-composed-fraud-boundary-final` lineage after earlier summaries named paths imprecisely. Six confirmed paths are in scope:

| Path                                                                                   | Verified failure mode                                                                                                                                  | Remediation                                                                                                                                                                              |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `client/src/components/replay/ReplayResultsTable.tsx`                                  | A held replay response was treated as an array; `.length` / `.map` would throw.                                                                        | Render canonical actionable hold; otherwise render a conservative unavailable state. No replay statistics or result values are rendered.                                                 |
| `client/src/components/replay/ReplayStatisticsCards.tsx`                               | A held replay response was treated as statistics; numeric access would throw.                                                                          | Render canonical actionable hold; otherwise render a conservative unavailable state. No numeric replay statistics are rendered.                                                          |
| `client/src/pages/AssessorClaimDetails.tsx`                                            | A held assessment could fall through to legacy fraud/cost fields and fabricate zero-like display values.                                               | Detect the shared hold before legacy assessment rendering and render an actionable abstention.                                                                                           |
| `client/src/pages/BatchExport.tsx`                                                     | A held assessment could remain selectable/exportable and its legacy estimate could render.                                                             | Exclude held assessments from bulk selection/export, reject stale selection at execution, and label manual review required.                                                              |
| `client/src/pages/admin/LearningDashboard.tsx`                                         | Held calibration, pattern-analysis, or calibration-history responses could be used as live numeric/array data, including throw/NaN-like display paths. | Detect each shared hold before rendering legacy calibration, pattern, or history fields and render an actionable abstention.                                                             |
| `client/src/pages/InsurerComparisonView.tsx` + `server/routers/ai-assessments-core.ts` | Browser report sharing could reach `pushReportToRole`; the server route could read assessment data before the canonical P0 hold.                       | Browser stops comparison/report-sharing work on a shared hold. Server executes role → governed tenant claim authority → canonical hold before `getDb`, assessment read, or notification. |

## Security and authority invariants

1. Canonical `FRAUD_DECISION_WITHHELD` values are detected through the shared presentation contract, not UI-local text or numeric fallbacks.
2. A held response does not reach legacy `.map`, `.length`, numeric formatting, default-to-zero, export, comparison, or notification logic in the affected paths.
3. `pushReportToRole` denies an ineligible role before tenant lookup; an authorized caller completes governed tenant-claim authority before the hold.
4. For an authorized held call, the canonical hold occurs before `getDb`, `getAiAssessmentByClaimId`, or `createNotification`; no publication side effect is reachable.
5. Replay result/statistic components intentionally fail closed: no unqualified legacy numeric content remains reachable in their current response contract.

## Validation evidence

| Check                                      | Result                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Initial guarded focused matrix             | **5 files, 19 tests passed**: shared discriminator, Group A server/client source regression, browser containment, publication UI and router regressions.                                                                                                                                                                                  |
| First adversarial review                   | **BLOCK**. It found four real containment gaps: held calibration-feedback fallback/success rendering, held comparison ready-toast and shared-role read, and stale held batch selection. No scope expansion was required; all were in the six approved paths.                                                                              |
| Second adversarial review                  | **BLOCK**. It correctly found that the reader function remained in the router's module-level import list, so a no-call assertion did not prove the requested no-import/no-call authority boundary.                                                                                                                                        |
| First reviewer-remediation guarded matrix  | **6 files, 25 tests passed**: the five original suites plus real React server-render hold tests for direct and nested replay payloads. New server caller coverage proves `getSharedRoles` completes governed tenant authority, then throws the canonical hold before an assessment read.                                                  |
| Second reviewer-remediation guarded matrix | **6 files, 26 tests passed**, including static proof that the reader is absent from router module imports and dynamic loading follows the `getSharedRoles` hold. The wrapper governance matrix also passed **2 files, 46 tests**.                                                                                                         |
| Final recovery guarded matrix              | **6 files, 26 tests passed** after restoring legacy source formatting without broad formatter writes. The wrapper governance matrix again passed **2 files, 46 tests**.                                                                                                                                                                   |
| Third adversarial review                   | **BLOCK**. It found that `pushReportToRole` dynamically imported DB/schema/ORM/notification capabilities before governed tenant/resource authority and the canonical hold, even though no protected reader or side effect was called.                                                                                                     |
| Publication import-order remediation       | Dynamic DB, schema, ORM, assessment-reader, and notification dependencies now resolve only after session → role → governed tenant/resource → canonical hold. Source-order regressions assert the hold precedes every dynamic persistence import; behavioral caller tests assert no DB, reader, or notification call after a held request. |
| Final fresh adversarial review             | **APPROVE**. It confirmed the corrected exact publication ordering, retained `getSharedRoles`/lazy-reader ordering, valid behavioral-plus-source regression coverage, browser containment, and no Group B scope expansion.                                                                                                                |
| Held-only replay static audit              | Passed: no legacy replay result/statistic numeric operations remain in the two affected components.                                                                                                                                                                                                                                       |
| Post-remediation authority audit           | Passed: `pushReportToRole` and `getSharedRoles` both execute governed tenant/claim authority before canonical hold; held routes cannot reach their assessment read, notification, or publication work. The comparison browser query waits for an unheld assessment before querying shared roles.                                          |
| Final guarded merge-readiness suite        | **626 eligible test files in 63 serial guarded shards; 625 passed, 1 skipped; 9,870 tests passed, 4 skipped; zero failed shards.** Executed only through the isolated CI-database runner.                                                                                                                                                 |
| Production build                           | **Passed** (`pnpm build`). The build retains pre-existing large-chunk warnings only; it completed successfully.                                                                                                                                                                                                                           |
| `git diff --check`                         | Passed.                                                                                                                                                                                                                                                                                                                                   |
| Direct TypeScript check                    | Project-wide `tsc` retains inherited diagnostics (exit 2); **no diagnostics remain on the six Group A paths, shared hold contract, or publication route** after recovery.                                                                                                                                                                 |

## Explicit exclusions and deferred work

- **Group B:** 15 client paths classified from current diagnostics as non-throwing type-narrowing work. They are known, deferred, and may not be treated as fixed by this package.
- A later, separately approved comparator change may permit only exact, fingerprinted Group B diagnostics. It must reject every new, removed, moved, or changed diagnostic and must not use wildcards.
- P0-B1-Client Packages B/C, P0-A-3 client physics hardening, P0-B2, and P0-B3 are out of scope.
- No schema, data, configuration, deployment, staging, or production changes are included.

## Review checklist

The adversarial review must verify:

- canonical hold recognition rejects malformed lookalikes and does not conceal non-hold data;
- all six current paths stop before their documented risky legacy operation;
- report sharing role → tenant/resource authority → canonical hold → no-read/no-notification ordering;
- browser controls cannot re-enable held batch export or report sharing via stale state;
- the replay components do not silently substitute zero, empty numeric statistics, or a fabricated verdict;
- Group B is not silently folded into this package.

## First review remediation

The first review correctly rejected source-text-only proof as insufficient. The remediation therefore adds both executable and behavioral safeguards:

1. **Learning Dashboard:** `evaluateCalibrationFeedback` now discriminates its response before state assignment; `applyCalibrationUpdate` discriminates its mutation result before any success alert. Both held outcomes clear legacy feedback state and render the shared actionable abstention instead of a no-update decision, undefined risk label, or false success.
2. **Comparison/report sharing:** the ready toast and shared-role query are disabled for a held assessment. `getSharedRoles` independently completes tenant/claim authority and throws the canonical hold before importing or calling the assessment reader.
3. **Batch Export:** a derived selected-exportable set controls checkbox state, selection counts, and export controls, while an effect prunes newly held IDs from persistent selection. The existing execution-time held-ID rejection remains defense in depth.
4. **Runtime proof:** React server rendering exercises direct and nested canonical holds through both replay components; server caller tests exercise the report-share and shared-role authority paths. Static source checks remain supplementary, not the only evidence.

## Second review remediation

The module-level `getAiAssessmentByClaimId` import was removed. The ordinary `byClaim` route now resolves it lazily after its existing session-and-tenant guard, while `getSharedRoles` preserves its tenant/resource authority → canonical hold → lazy-import sequence. New regression assertions prove the reader is neither module-imported nor called by either held `pushReportToRole` or held `getSharedRoles` path.

## Final adversarial review, import-order remediation, and formatting recovery

The first final independent adversarial re-review approved the Group A boundary, but its subsequent source-order inspection correctly blocked the candidate because `pushReportToRole` dynamically imported DB/schema/ORM/notification dependencies before tenant/resource authority and the canonical hold. The remediation moved every such dynamic import after the ordered session → role → governed tenant/resource → canonical hold prefix, added a source-order regression for each import category, and retained behavioral assertions that a held caller reaches neither DB work, assessment reading, nor notification. A fresh independent adversarial re-review then **approved** the corrected boundary. It also reconfirmed `getSharedRoles` as session → governed tenant/resource → canonical hold → lazy reader import/call, direct/nested browser containment, and no Group B application-code expansion.

An attempted formatter recovery initially encountered a color-encoded patch issue. No source was reset or discarded. The final recovery restored the legacy formatting baseline with targeted semantic patches only; the resulting diff was reduced to the reviewed logic rather than thousands of formatter-only lines. Existing large legacy files still have repository-baseline Prettier deltas, so they remain intentionally unformatted. `git diff --check` is clean, while the new shared contract, tests, and this record pass Prettier checks.
