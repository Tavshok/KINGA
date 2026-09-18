# KINGA Final Isolated CI Reconciliation — 18 September 2026

**Author:** Manus AI

## Conclusion

The final guarded suite is **green** when run through the repository’s fail-closed isolated test runner. The run completed with **561 passing test files**, **1 skipped file**, **9,439 passing tests**, and **4 skipped tests** in **251.73 seconds**. The disposable local `kinga_ci_test` database was reset immediately before the run. No test process was directed at the live application database.

The result follows individual reconciliation of the last twelve failing files. Those changes removed dependencies on historical claim IDs and shared seeded fixtures, corrected stale source-location assertions, and aligned tests with the current cookie and document-gate contracts. The package also contains three narrowly justified runtime corrections discovered during the trace: normalized legacy assessor-report JSON, MariaDB-compatible comment-recipient JSON predicates, and atomic assessor-report acceptance persistence.

## Final validation

| Check | Result | Evidence |
|---|---:|---|
| Guarded full suite | 561 passed, 1 skipped files | `pnpm test` through the isolated runner |
| Test assertions | 9,439 passed, 4 skipped | Final guarded suite log |
| Focused assessor acceptance suite | 28 passed | Atomicity, rollback, and concurrent-winner checks |
| Server bundle | Passed | `pnpm check:server` |
| Patch whitespace check | Passed | `git diff --check` |
| Production/live database access | None | Runner and Vitest guard policy |

> The full-suite command was `pnpm test`. The package script invokes `scripts/run-isolated-vitest.ts`, which validates the dedicated local test endpoint before Vitest starts. The Vitest setup also guards direct `mysql2` factory use. [1] [2]

## Reconciled failure groups

The six self-contained fixture tests now create their own tenant, user, claim, and dependent records. The fixtures use generated identifiers and delete child records before their parents. The audit test no longer inserts or deletes the reserved `SYSTEM` identity; it uses a suite-owned system actor instead.

The dataset-capture test now uses the schema’s camel-case `tenantId` fields. It creates an assessment that matches the current dataset contract and proves both successful capture and the non-blocking capture-failure behavior. The DRA test now supplies the mandatory `isDocumentIngested` input and asserts the actual advisory-gate contract: a blocked assessment classification is represented by the decision and readiness contract rather than by `mayProceed = false`.

The former real-ID physics test now creates and deletes a claim and assessment in `kinga_ci_test`. It no longer reads historical identifiers or any populated dataset. The source-location tests now trace their expectations to the current modular files, including `insurance-core.ts` and `vehicle-valuation-core.ts`. The logout test now asserts the current `SameSite=Lax` cookie policy.

## Runtime integrity corrections found during reconciliation

### Assessor-report acceptance is atomic and single-winner

An accepted assessor report must result in an accepted review, accepted report, evaluator projection, and audit entry as one unit. The final package places that sequence inside a single database transaction. The transaction makes the pending-to-accepted review update conditional on its existing `pending` status and requires exactly one affected row. A concurrent caller therefore loses without creating a second evaluation. If evaluator or audit persistence fails, the transaction rolls back the review and report status changes.

The regression suite proves all critical cases. A legacy nested JSON string is normalized successfully. A malformed payload fails before state mutation. An injected evaluator foreign-key failure rolls the review back to `pending` and the report back to `under_review`. Two concurrent acceptance attempts produce exactly one accepted review and exactly one evaluator projection.

### Comment notification predicates remain tenant-scoped under MariaDB

The comment recipient predicates now pass a JSON numeric scalar to `JSON_CONTAINS`, which MariaDB accepts for numeric `to_user_ids`. Each affected query retains both the comment tenant predicate and the joined claim tenant predicate. The coverage verifies notification listing, unread counting, and mark-all-read for a same-tenant numeric recipient while proving that an identically addressed foreign-tenant comment remains invisible and unread.

### Connection teardown remains safe for pure unit files

The test setup closes a real database pool when one exists. Pure unit files that mock the database module and expose no close helper now skip that teardown call instead of failing after all their assertions have passed. The database-target preflight and direct-mysql guards are unchanged.

## Decision boundary

The local suite is now trustworthy enough to reconsider the previously approved **GitHub Actions workflow source package**. Branch protection remains a separate decision and must not be enabled until the workflow is merged, observed on GitHub, and confirmed to pass there. This result does not itself change any GitHub workflow, branch-protection rule, production configuration, live data, or deployment.

## References

[1]: ../scripts/run-isolated-vitest.ts "Fail-closed isolated Vitest runner"
[2]: ../server/test-database-isolation.setup.ts "Vitest test-database isolation setup"
[3]: ../server/db.ts "Database pool lifecycle and atomic assessor-review persistence"
[4]: ../server/routers.ts "Assessor-review authorization and acceptance route"
