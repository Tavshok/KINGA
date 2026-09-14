# Gate D — D-03 Independent Postflight Reconciliation

**Status:** Complete — D-03 closure reconciliation passed. This record distinguishes owner-reported execution evidence from authenticated, independent, read-only metadata reconciliation. It did not authorise or perform DDL, DML, account/grant changes, networking changes, backup/restore actions, deployment, or production work.

## Authenticated target observation

On 14 September 2026, the TiDB Cloud console opened the SQL Editor for `KINGA-staging`. The active target is the existing staging cluster referenced by the D-03 packet, database `kinga_staging`. The retained editor draft was a prior read-only D-03 index-absence query; it has not been executed as part of this postflight record.

## Independent reconciliation scope

The reconciliation will compare live read-only metadata with the revised D-03 source SHA-256 `0c45f9ea613381185fd8afecfd99da1bd1d5f3275467c7286e892ab32745e59a` and the revised 187-statement ledger SHA-256 `fae70dd948b828038687334cc256f488bb8f92a1b54e0773ec08570f7908c06b`. Required final state: 73 total tables, 26 D-03 foreign keys, 111 D-03 explicit indexes counted as distinct table/index pairs, source-defined columns/defaults/keys, and zero rows in every D-03 table.

The D-03 owner-operated exception had no continuing effect during this independent reconciliation. It expires with the closure decision recorded below and does not transfer to D-04 or any later change, recovery/cutover, deployment, or production activity.

## Table inventory

At approximately 13:19 UTC, the authenticated SQL editor executed the following read-only query against `information_schema.tables` in 187 ms:

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'kinga_staging'
ORDER BY table_name;
```

The console reported **73 rows**, matching the expected cumulative table count. A complete result export will be retained and compared offline with the exact 23 prior-wave plus 50 revised D-03 source names before this result is accepted as the final table-set reconciliation.

The SQL editor’s result-export control was selected after the query. The next step is to identify the local CSV export and retain its exact 73 names for deterministic comparison; no additional database statement has been issued by the export action.

The retained export `results-2026-09-14-131958.csv` contained 73 live names. After normalizing CSV encoding, an offline set comparison against the immutable D-01/D-02 sources plus the revised D-03 source found **73 expected / 73 live**, with **0 missing** and **0 unexpected** names. **Final table-set reconciliation: PASS.**

## Foreign-key metadata

At approximately 13:21 UTC, the authenticated SQL editor executed a read-only join of `information_schema.key_column_usage` and `information_schema.referential_constraints`, selecting each foreign-key name, child/parent table and column, and update/delete rule. It completed in 150 ms and returned **35 rows**, matching the expected cumulative 9 prior-wave plus 26 D-03 constraint definitions. The result will be exported and compared offline with the immutable D-01/D-02 and revised D-03 source definitions, including referential actions, before acceptance.

The complete foreign-key result was exported as `results-2026-09-14-132146.csv` for deterministic offline reconciliation. No mutating statement was run.

After normalizing the quoted CSV fields, the offline comparator reconciled the export with the immutable D-01/D-02 and revised D-03 sources: **35 expected / 35 live foreign-key definition rows**, **35 expected / 35 live distinct constraint names**, with **0 missing** and **0 unexpected** definitions. Child/parent columns and update/delete actions were included in the comparison. **Cumulative foreign-key reconciliation: PASS**; this includes the expected **26 D-03** definitions.

## Explicit-index metadata

At approximately 13:23 UTC, the authenticated SQL editor executed a read-only `information_schema.statistics` query returning `table_name`, `index_name`, `seq_in_index`, `column_name`, and `non_unique` for all non-primary-key index rows in `kinga_staging`. It completed in 285 ms and returned **268 rows**.

This row total is deliberately not treated as an index count: multi-column indexes produce one metadata row per indexed column, and foreign-key supporting indexes also appear in the result. The complete export will be reconciled by distinct `(table_name, index_name)` identity and ordered index-column definition against the 58 D-02 and 111 revised D-03 explicit `CREATE INDEX` statements. This avoids the earlier raw-row overcount described by the owner.

The complete index-column result was exported as `results-2026-09-14-132349.csv` for deterministic offline comparison. No mutating statement was run.

An offline D-03 structural verifier is prepared to compare the revised source’s table/column ordering, types, nullability, explicit defaults—including `JSON_ARRAY()` and `JSON_OBJECT()`—auto-increment, and update attributes with read-only `information_schema.columns` exports. Because the SQL editor caps result displays, the D-03 tables will be queried in bounded source-order groups and every export must be complete before a structural conclusion is recorded.

At approximately 13:26 UTC, the first bounded 12-table column query completed in 28 ms and returned **296 rows**, covering `adjuster_sign_offs` through `component_repair_outcomes`. The result is below the editor cap and will be exported before the next group is queried.

The complete first-group result was exported through the SQL editor. The local filename will be recorded with the subsequent group exports before the offline structural comparison is run.

At approximately 13:27 UTC, the second bounded 12-table column query completed in 56 ms and returned **230 rows**, covering `cost_components` through `fraud_alerts`. The result is below the editor cap and will be exported before the next group is queried.

The complete second-group result was exported through the SQL editor. No database-writing action occurred.

At approximately 13:28 UTC, the third bounded 12-table column query completed in 15 ms and returned **251 rows**, covering `fraud_indicators` through `police_reports`. The result is below the editor cap and will be exported before the next group is queried.

At approximately 13:29 UTC, the final bounded 14-table column query completed in 35 ms and returned **232 rows**, covering `policy_documents` through `valuation_comparable_evidence`. The result is below the editor cap and will be exported, then all four bounded exports will be reconciled offline against the revised D-03 source.

The browser download list retained the four complete bounded column exports: `results-2026-09-14-132634.csv` (296 rows), `results-2026-09-14-132714.csv` (230 rows), `results-2026-09-14-132814.csv` (251 rows), and `results-2026-09-14-132934.csv` (232 rows). Combined, the exports contain **1,009** D-03 column-metadata rows and are below the per-query display cap.

The deterministic structural verifier reconciled the four exports with the revised D-03 source: **50 expected / 50 live tables**, **1,009 expected / 1,009 live columns**, and **0 mismatches** across column order, type, nullability, explicit default, auto-increment, and update attributes. The first local comparator run exposed only two parser-normalization defects—function-closing-parenthesis stripping and empty-string-default handling—rather than a live mismatch; raw source and CSV rows were inspected, the offline verifier was corrected, and the corrected run passed. **D-03 column-structure reconciliation: PASS.**

## D-03 zero-row state

The first planned 50-table aggregate count query failed before reading any table because the SQL editor session has no default database and the statement used unqualified table names. This was a query-construction qualification error, not a database/server compatibility or schema error; no data was modified. The replacement check will use fully qualified ``kinga_staging`` table references and will be recorded separately rather than treating the failed result as evidence.

The corrected fully qualified 50-table aggregate query completed in 80 ms and returned **`tables_checked = 50`**, **`total_rows = 0`**, **`minimum_rows = 0`**, and **`maximum_rows = 0`**. Because every individual `COUNT(*)` is non-negative, a zero total and zero maximum prove that **each of the 50 D-03 tables contains zero rows**. **D-03 zero-row reconciliation: PASS.**

## Key and index reconciliation summary

The exported cumulative primary-and-unique key metadata (`results-2026-09-14-133226.csv`) was reconciled offline with all three approved sources. The comparison passed: **96 expected / 96 live keyed-column rows**, **88 expected / 88 live primary-or-unique key structures**, and **0 missing / 0 unexpected** definitions.

The exported non-primary index metadata (`results-2026-09-14-132349.csv`) was similarly compared by distinct `(table_name, index_name)` plus ordered indexed columns. All **177 source-explicit index structures** matched exactly: 8 Wave 1, 58 Wave 2, and 111 revised Wave 3; their **212** source-indexed column rows also matched. The live result contained 225 distinct non-primary index structures and 268 metadata rows because it also includes foreign-key-supporting and other source-declared key structures, and because multi-column indexes emit multiple rows. There were **0 missing** and **0 definition mismatches** among the explicit source index definitions.

The owner-reported cumulative figure of 169 is correctly the **58 D-02 + 111 D-03** explicit-index subtotal. It excludes the 8 D-01 explicit `CREATE INDEX` statements; the complete D-01 through D-03 explicit-index total is **177**.

## Final reconciliation and closure decision

The following authenticated, read-only reconciliation controls all passed against the revised D-03 source SHA-256 `0c45f9ea613381185fd8afecfd99da1bd1d5f3275467c7286e892ab32745e59a` and revised full-ledger SHA-256 `fae70dd948b828038687334cc256f488bb8f92a1b54e0773ec08570f7908c06b`:

| Control | Result |
| --- | --- |
| Cumulative table names | 73 expected / 73 live; 0 missing and 0 unexpected |
| D-03 column structure | 50 tables and 1,009 columns; 0 mismatches across order, type, nullability, explicit default, auto-increment, and update attributes |
| Cumulative foreign-key definitions | 35 expected / 35 live, including the 26 D-03 definitions; 0 missing and 0 unexpected |
| Source-explicit indexes | 177 D-01–D-03 definitions matched by distinct table/index identity and ordered columns; 0 missing and 0 mismatched definitions; D-03 contributes 111 |
| Primary/unique keys | 96 keyed-column rows and 88 structures expected/live; 0 missing and 0 unexpected |
| D-03 data state | All 50 tables checked; total, minimum, and maximum row counts are each 0 |
| Revised execution artefacts | Full 187-file and ordinal-14 onward 174-file sets each passed deterministic exact-text and per-file SHA-256 verification |

**Closure decision:** The final staging state matches the pinned revised D-03 source-derived baseline. D-03 is formally closed as of 14 September 2026. The owner-approved D-03-only sole-operator, reviewer, and application-validation exception expires with this closure.

### Assurance boundary and next-wave gate

The independently verified conclusion is limited to the authenticated, read-only final metadata and zero-row state above. The owner-reported strict ledger ordering, per-statement hash checks, and execution-batch handling are retained as owner execution evidence; the final verified state is consistent with that report. This closure neither authorises D-04 nor carries the D-03 exception forward. Any D-04 work requires a separate packet, a new role/control decision, fresh snapshot and absence preflight, explicit execution authority, and its own postflight reconciliation. Production remains out of scope pending the separately required service-class/PITR and production-planning decisions.
