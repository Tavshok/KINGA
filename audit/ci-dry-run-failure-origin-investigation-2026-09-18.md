# CI Dry-Run Failure-Origin Investigation

**Date:** 18 September 2026
**Scope:** Read-only comparison of the failing clusters requested by the owner.
**Current main tested:** `ab1adcc11b564e131dc1c98bb8f99f7566d6c1e0`
**Pre–Package A comparison commit:** `682cbf95ed4b4155738778d4e259f09488c8da0a` (first parent of the Package A merge)

## Conclusion

The red full suite is a **mixed condition**, not one undifferentiated baseline. The WhatsApp and maintenance/probe clusters are reproducible **test-process pollution**, while the role-assignment, approval-tracking, and three reporting-file changes are a genuine **source-to-active-test-database schema drift introduced when the Package A source contract was merged without applying its additive database columns to the active test database**. The remaining seven reporting failures already existed before Package A.

No test, source, database, migration, configuration, WorkOS provider setting, or deployment was changed during this investigation.

## Comparison results

| Cluster | Current main in isolated invocation | Pre–Package A parent in isolated invocation | Classification |
|---|---:|---:|---|
| WA-SEC-02 `webhook.signature.test.ts` | **15/15 passed** | **15/15 passed** | Full-suite-only shared-state failure; the signed webhook boundary itself passes in isolation. |
| Role assignment audit | **19/19 failed** | **19/19 passed** | Current source/test database drift. |
| Approval tracking | **14/14 failed** | **14/14 passed** | Current source/test database drift. |
| Maintenance stack | **2/2 passed** | **2/2 passed** | Full-suite-only shared-state failure. |
| Maintenance production stack | **1/1 passed** | **1/1 passed** | Full-suite-only shared-state failure. |
| Runtime probes | **3/3 passed** | **3/3 passed** | Full-suite-only shared-state failure. |
| Reporting: seven legacy files | Same isolated failures on both revisions | Same isolated failures on both revisions | Pre-existing reporting test debt. |
| Reporting: `forensicReportModel`, `p0IntakeEvidenceVisibility`, `sharedQuoteEvidencePresentation` | Current setup fails before the test body | All tests passed before Package A | Current source/test database drift. |

## WhatsApp signature test: proven full-suite pollution

The signature suite passes when it is the only requested file: **15/15 passing**. The full suite instead reports fifteen `TypeError: Cannot read properties of undefined (reading 'status')` errors at `fetch()` response assertions, rather than an invalid signature acceptance or a provider-validation error.

The failure is reproducible without the full suite by running the two test files that stub the global `fetch` function before the WhatsApp signature file:

```text
server/services/photoEnrichment.test.ts
server/vehicle-structural-intelligence.test.ts
server/whatsapp/webhook.signature.test.ts
```

This combined run produces **15 WhatsApp failures** with the same undefined response. `server/vehicle-structural-intelligence.test.ts` repeatedly calls `vi.stubGlobal("fetch", ...)` and uses `vi.restoreAllMocks()` but does not call `vi.unstubAllGlobals()`. With Vitest configured as one fork and without `unstubGlobals: true`, the mocked global fetch remains available to later files and returns an object intended for vehicle/NHTSA tests, not an HTTP `Response`. The identical mechanism explains the full-suite maintenance/probe failures: those files pass alone, but their local HTTP request assertions see the leaked fetch mock and receive `undefined`.

> **Security conclusion:** The WA-SEC-02 signed-webhook behavior is not shown to be regressed. Its isolated suite passes. The CI failure is nevertheless real test hygiene debt and must be repaired before treating the full suite as reliable.

## Package A source/test-database drift

Package A changed only the schema contract and its schema test in runtime TypeScript paths. It added nullable `users.workos_user_id` and `tenants.workos_organization_id` mappings. The active project test database currently contains **neither column**.

Current database fixture inserts are generated from the merged Drizzle `users` declaration, so they include `workos_user_id`. The active test database rejects those insert statements with:

```text
ER_BAD_FIELD_ERROR: Unknown column 'workos_user_id' in 'field list'
```

This failure fully explains all **19** role-assignment audit failures, all **14** approval-tracking failures, and the three current-only reporting files listed above. They are not WorkOS provider-adapter faults; they occur before provider code is imported or exercised.

The distinction matters: Package A’s source merge was additive and inert in application behavior, but it still requires the separately reviewed/additive Package A database transition to be applied to whichever database is used by database-backed tests before those tests can exercise their intended assertions. Applying that database transition is a write and remains out of scope for this investigation.

## Reporting baseline

The following seven reporting files fail in isolated execution on both exact revisions. Their failure modes are content/expectation drift, such as a historical expected phrase no longer matching current report language or counts expecting three render calls while current shared presentation performs four.

| Pre-existing isolated failure | Illustrative mismatch |
|---|---|
| `claimReportAudienceDisclosure.p1.test.ts` | Expected source string no longer matches current report component. |
| `claimReportReadiness.rendering.p0.test.ts` | Expected three render calls; current execution performs four. |
| `l2SelectionTrace.crossSurface.p1.test.ts` | Expected cost/write-off wording no longer matches current output. |
| `legacyQuoteHistory.p1.test.ts` | Historical qualification/source assertions diverge from current report source. |
| `r0CrossSurfaceCostStripAcceptance.test.ts` | Expected active-ledger/L2 guard wording differs from current source. |
| `reportR1Display.test.ts` | Expected report registry wording differs from current source. |
| `reportTierSharedFieldsConsistency.p1.test.ts` | Expected unavailable-cost message differs from current canonical wording. |

These are neither caused by Package A nor by Package B. They should be handled as a separate report-regression reconciliation, with each expectation traced before updating a test or source.

## Recommended next order

1. **Repair test isolation** in a dedicated CI-hygiene package: restore global fetch after each relevant test or enable a carefully verified Vitest global-unstubbing setting; prove the WhatsApp and maintenance/probe files pass both alone and in an ordered shared-process reproduction.
2. **Seek separate authority for the Package A additive schema transition on the active test database** or deliberately provision a schema-current disposable test database. Re-run the role, approval, and three affected report suites after the schema and source contract agree.
3. **Reconcile the seven pre-existing reporting expectation failures** as an independent report-quality/test-debt package; do not simply bless them as baseline.
4. Re-run the full suite. Only then decide whether the CI workflow can make `pnpm test` blocking without an exception.

No exception proposal is warranted at this stage.
