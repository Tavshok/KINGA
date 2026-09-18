# Isolated Full-Suite CI Result

**Date:** 18 September 2026  
**Commit tested:** `cdb20be848d8903a5f8608a5766aa19d876cb605`  
**Target:** dedicated local `kinga_ci_test` database at the exact loopback-only CI endpoint  
**Scope:** post-cleanup validation after merging CI database isolation (PR #102) and global-`fetch` test isolation (PR #100)

## Result

The full test suite **did not pass**. It was, however, demonstrably contained within the disposable CI database: the runner used the exact guarded loopback CI URL and the repository’s fail-closed test policy was active. No test command targeted the application database.

| Vitest outcome | Count |
|---|---:|
| Test files passed | 508 |
| Test files failed | 47 |
| Test files skipped | 1 |
| Tests passed | 9,287 |
| Tests failed | 132 |
| Tests skipped | 9 |
| Duration | 138.28 seconds |

The earlier global `fetch` pollution was not the dominant blocker in this run. The merged isolation change has removed the specific cross-suite contamination previously reproduced around the WhatsApp and maintenance tests. The remaining failures are materially different and must not be treated as a single assertion-update exercise.

## Failure clusters requiring separate investigation

| Cluster | Evidence from this run | Consequence | Status |
|---|---|---|---|
| **Schema-engine compatibility** | Nineteen routing-related failures across confidence explainability, immutable routing, routing re-evaluation, and threshold-version tests reject ISO-8601 strings such as `2026-09-18T18:48:51.117Z` for a MariaDB `DATETIME` column. | The DDL-only MariaDB test target is not behaviorally identical to the TiDB source for these timestamp paths. | Must be reconciled before those tests can be considered meaningful on this target. |
| **Self-contained fixture gaps** | Role switching, tenant isolation, approval, comments, onboarding, insurance-payment, police-report, reporting-intake, and session-revocation tests fail while creating or updating prerequisite records. The database intentionally began with no rows. | Tests are relying on state that is neither created by their fixture nor part of a declared test seed. | Each affected test family needs explicit fixture ownership, not production-shaped residue. |
| **Stale source/topology assertions** | Static/source-oriented checks in portal conformance, pipeline audits, report registry/cost-evidence tests, client display tests, and several authority tests expect old strings, route shapes, or exact call counts. | These tests may be out of date, but each must be reconciled with current behavior individually. | No bulk assertion update is authorized. |
| **Test-harness resource control** | The resolved-report tenant-authority test reports `Too many connections`. | Full-suite concurrency and connection lifecycle need an isolated-harness review. | Open. |
| **Runtime behavior/fixture semantics** | Examples include assessor ecosystem status and marketplace expectations, dataset-capture activation, usage-meter metadata, upload-to-report authorization, and vehicle-registry tenant containment. | May represent real behavioral regressions or incomplete fixture setup. | Requires test-by-test source tracing. |

## Representative failing files

The failing set spans 47 files. The largest groupings are `server/assessor-ecosystem-integration.test.ts` (23 failure headers), `server/services/routing-re-evaluation.test.ts` (8), `server/auth.switchRole.test.ts` (7), `server/routers/comments.test.ts` (6), `server/services/immutable-routing.test.ts` (6), and `server/routers/assessor-onboarding.test.ts` (5). The remaining failures are distributed across authentication, authority, approval, pipeline, portal, report, routing, tenant-isolation, and static-audit tests.

The complete concise inventory is retained in the execution workspace as a transient analysis file and was derived from the full Vitest log. It deliberately contains no production records, identifiers, emails, names, or database credentials.

## Safety and decision status

The test run has **not** created data in the live application database. The earlier live fixture cleanup remains in force: the verified real database state is one owner account and 101 protected claims. The daily contamination monitor remains separate from this CI work.

CI workflow and branch-protection enablement remain blocked. The next corrective work should first separate: (1) TiDB-versus-MariaDB test-target compatibility, (2) shared test-seed/fixture ownership, (3) test connection concurrency, and (4) individually verified stale expectation or runtime-behavior failures. This report makes no recommendation to weaken or bypass the required CI gate.

## Related evidence

- [Dedicated CI database isolation proof](ci-disposable-test-database-provisioning-2026-09-18.md)
- [Prior integrated validation result](ci-full-suite-integrated-validation-2026-09-18.md)
- [Fixture cleanup operation log](fixture-cleanup-operation-log-2026-09-18.md)
- [CI failure-origin investigation](ci-dry-run-failure-origin-investigation-2026-09-18.md)
