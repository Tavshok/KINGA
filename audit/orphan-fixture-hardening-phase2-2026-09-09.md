# Orphan Fixture Hardening — Phase 2

**Scope:** Test infrastructure only. This change does not alter production creation, deletion, access-control, report, schema, migration, or scheduled-workflow behavior.

## Confirmed root cause

The retained rows removed in Phase 1 arose from two fixture lifecycle defects, not normal user workflows.

| Fixture | Confirmed failure mechanism | Why the residue could remain |
|---|---|---|
| `server/policeReport.test.ts` | Its primary and secondary cleanup blocks caught and ignored all cleanup errors. The secondary claim was cleaned inside one test rather than in the suite-level teardown. | A child-delete failure, a parent-delete failure, or interrupted execution could leave rows while the test output gave no cleanup failure and performed no residue check. |
| `server/vehiclePassportInArray.p0.test.ts` | It directly inserted service requests with an agency-user ID in `agency_client_id`, although the normal procedure requires a same-tenant agency-client row. Its sequential teardown was one `try` body; failure of one delete skipped every later delete and the final residue assertion. | A stopped or partially failing test could retain an already-invalid request relationship that later appears as an agency data-integrity defect. |

## Hardening implemented

`server/test-helpers/owned-fixture-cleanup.ts` now provides a small dependency-aware helper for owned live fixtures. It continues unrelated exact-ID cleanup after a failure, skips a parent whose child prerequisite did not clean successfully, always executes the supplied exact-ID residue check, and throws an `AggregateError` containing every cleanup/verification failure. It never selects or deletes by broad pattern.

The police-report fixture now records both owned claims for one suite-level cleanup. It deletes police reports before their claims and its actor only after its owned claims, then asserts that all captured IDs are absent. It no longer suppresses cleanup errors.

The Vehicle Passport fixture now creates and captures a real owned `agency_clients` parent, uses that ID as `agency_client_id`, deletes it only after its captured service requests, and routes all remaining exact-ID teardown through the same helper. Its complete residue assertion runs even if an earlier cleanup operation fails.

`pnpm run check:known-fixture-orphans` is an explicit, on-demand integrity check. It checks only the two exact PR #58 fixture fingerprints with parent-absence joins and returns nonzero when either retained pattern is present. It intentionally does **not** discover, enumerate, or act on arbitrary other potential orphans.

> Had this helper and check existed before the PR #58 scenario, a partial teardown would have failed loudly and the known fixture-pattern check would have reported the retained residue before it could be misclassified as production-origin data.

## Validation

| Check | Result |
|---|---|
| Cleanup-helper unit regression | 1/1 passed. It proves unrelated cleanup continues, dependent parents are not deleted after child failure, verification still runs, and failure is surfaced. |
| Hardened police-report fixture | 4/4 passed against the live database. |
| Hardened Vehicle Passport fixture | 7/7 passed against the live database. |
| On-demand known-fixture check after tests | Passed; police fixture residue `0`, Vehicle Passport fixture residue `0`. |
| Production build | Passed: Vite build and server bundle completed. |
| TypeScript check | Retains repository-wide baseline debt; no diagnostics named any changed Phase 2 file. |
| Full suite on Phase 2 branch | 492 files passed; 27 files / 53 tests failed; 3 skipped. This matches the previously recorded 53-test inherited baseline, but a fresh same-run `main` comparator was stopped before it completed. It is not represented as a newly proven baseline match. |

## Deliberate boundaries

This phase makes no foreign-key, cascade, application-router, production-operation, or data-model change. It does not broaden into an orphan inventory and does not retroactively scan for other rows. Future schema enforcement remains a separately governed decision because data migration and retention/disposition assessment would be required first.
