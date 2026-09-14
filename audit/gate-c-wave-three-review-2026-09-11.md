# Gate C Wave 3 Review Record — Assessment, Evidence, and Reporting

## Scope and hard boundary

This review package contains the authorised completion of explicit source keys and the **scratch-only** Wave 3 baseline. It makes no migration, no staging or production connection, no migration-account change, and no claim, tenant, policy, evidence, quotation, or other live-data operation.

Wave 3 contains 50 reviewed Assessment, Evidence, and Reporting tables. Its only prior-wave dependencies are the three Wave 1 identity tables and the 20 Wave 2 vehicle/claim-core tables. The generated SQL permits only reviewed `CREATE TABLE`, `CREATE INDEX`, and source-declared foreign-key `ALTER TABLE ... ADD CONSTRAINT` statements.

## Explicit-key completion

The earlier safe-subset pass classified 145 auto-increment IDs outside Waves 1 and 2. The retained compatibility proof then verified all remaining 111 are direct `mysqlTable` declarations with a required auto-increment `id`, no existing inline primary key, and no configured competing primary key. It found **111 compatible and zero conflicts**. The guarded reconciler added only `.primaryKey()` to those IDs.

The requested full Wave 3 scope additionally exposed five required string-ID tables that had no explicit primary key at all. The complete Wave 3 inventory found 45 explicit keys and five omissions. The five existing `id` fields were reconciled, again by adding only `.primaryKey()`.

| Reconciliation group | Count | Result |
|---|---:|---|
| Remaining auto-increment IDs | 111 | All 111 now have explicit surrogate primary keys. |
| Wave 3 required string IDs | 5 | All five now have explicit primary keys. |
| Residual unkeyed auto-increment IDs outside Waves 1/2 | 0 | Verified by `auto-increment-primary-key-gaps-after-global-completion.json`. |
| Wave 3 tables lacking an explicit primary key | 0 | Verified by `wave-03-primary-key-inventory.json`. |

The five required-string-ID tables are `document_naming_templates`, `pdf_reports`, `report_links`, `report_snapshots`, and `marketplace_profiles`. Their pre-existing required `id` values are now their explicit primary keys; no secondary unique constraint, index, column, or data rule was added.

The separate natural/composite-unique decision list remains intentionally separate from the surrogate-key work. It proposes a business-rule review for `assessor_insurer_relationships`, `policy_claim_links`, `fleet_drivers`, and `entity_relationships`, and records the relationship tables already protected by source-declared unique indexes. See `audit/gate-c-natural-composite-unique-candidates-2026-09-11.md`.

## Source-derived Wave 3 SQL

The full source schema was generated into a disposable local directory with a loopback-only placeholder configuration; no database command or connection was performed by the generation step. The selector retained the reviewed 50 Wave 3 table declarations, their 111 index statements, and 26 source-declared foreign keys. It rejected every other statement class and every table outside Wave 3 and its Wave 1/2 prerequisite set.

| Static property | Result |
|---|---:|
| Reviewed Wave 3 tables | 50 |
| Reviewed SQL statements | 187 |
| Index statements | 111 |
| Foreign-key additions | 26 |
| Source SQL SHA-256 | `9cd46b359fdc1c4ff0b2b8484ee5ed47d16eff3af91f016df0964842da601d9f` |
| Wave 3 SQL SHA-256 | `ccdca4a47d9d82c04cc9b9a12e6d49960d4271a052773a342282086a9aff9254` |

Two source-generated foreign-key names exceeded MySQL’s 64-character identifier limit. The scratch selector changes only those names—without changing either source/target column or `ON DELETE`/`ON UPDATE` action—to `fk_crd_confidence_score` and `fk_crd_automation_policy`. The identifier guard passed after this bounded normalisation. The temporary generation configuration and disposable source output were removed; they are not part of this review package.

## Composed loopback scratch proof

Two fresh databases were created only under the local MariaDB listener at `127.0.0.1:3317`, each with a unique `kinga_gatec_wave3_*` name. The runner rejects non-`mysql://` protocol, any non-loopback host, any non-`kinga_gatec_*` name, a non-empty target, unexpected tables, unsupported statement classes, and foreign-key targets outside the reviewed Wave 1/2/3 set.

Each run replayed 11 Wave 1 statements, 87 Wave 2 statements, and 187 Wave 3 statements. Both runs created exactly 73 tables, yielded the identical structural metadata fingerprint below, and were then dropped by exact database name. The corresponding `disposal.json` records confirm removal.

| Evidence | Run A | Run B |
|---|---|---|
| Created table count | 73 | 73 |
| Wave 3 SQL SHA-256 | `ccdca4a47d9d82c04cc9b9a12e6d49960d4271a052773a342282086a9aff9254` | Same |
| Structural metadata SHA-256 | `25865fcd27d74e09f962e171bfb3ae4b080668010908189df07e7b960ae1b388` | Same |
| Disposal proof | `verifiedRemoved: true` | `verifiedRemoved: true` |

## Application and source validation

The focused suite passed **6 files / 17 tests**, covering the Wave 1/2/3 scratch target contracts, the global key contract, and a new mocked agency quotation regression. The source-manifest verifier passed after the final key changes. The production build passed; it retained only the project’s existing large-chunk warnings.

Explicit key metadata exposed an existing agency-router misuse of Drizzle’s `$returningId()` output: the code destructured the returned array and then indexed the resulting object as if it were still an array. Both affected response paths now return `result?.id`. The branch also removes an existing duplicated `rowIndex` property by assigning the input row index after object expansion. The focused regression proves a quotation submission returns the mocked generated ID `4242`.

With `DATABASE_URL` and `KINGA_STAGING_DATABASE_URL` explicitly empty, the final branch TypeScript run reports 998 inherited diagnostics, compared with 999 on its exact clean base. The one lower diagnostic is the corrected pre-existing agency `rowIndex` warning. No diagnostic appears in the final touched paths. Compiler message text varies in a small set of unrelated inferred unions, but no new diagnostic category or touched-path error was introduced.

The DB-disabled full suite was compared sequentially against the exact clean base. The branch reported 101 failed files, 217 failed tests, 8,699 passed, and 217 skipped; the base reported 102 failed files, 218 failed tests, 8,695 passed, and 217 skipped. The branch introduced **no branch-only failed identifier**. The sole base-only failure was the separately documented `truthReconciliationEngine` time-derived-certificate idempotency assertion.

## Review status and next boundary

Wave 3 is complete as a **review-only scratch baseline**. This package should remain stacked on the earlier review chain: Wave 1 PR #73, Wave 2 PR #74, then global key PR #75. It does not authorise Gate D, a migration account, `kinga_staging`, production, or Wave 4. Any later natural/composite-unique constraint requires a separate business-rule decision and duplicate-data preflight.
