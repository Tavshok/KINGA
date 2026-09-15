# Gate D — D-04 Independent Postflight Reconciliation

**Status:** Draft evidence record; no closure conclusion until every planned authenticated read-only check and offline source comparison passes.

## Scope and authority boundary

This record independently reconciles the owner-reported completed D-04 execution against the corrected, source-derived Wave 4 execution artefacts. It is limited to authenticated read-only metadata and aggregate row-count queries against `KINGA-staging`; it does not issue DDL, DML, account, grant, networking, backup/restore, deployment, or production actions.

The relevant corrected source is `audit/gate-d-text-index-compatibility-2026-09-14/wave-04-tidb-compatible-source-v2.sql`, SHA-256 `7e5802c2a4c57cee21a951a0ca85d174b1f03fb5c560c00925564455ef9cfd69`. Its deterministic ledger contains 134 statements: 40 tables, 7 foreign keys, and 87 explicit indexes. Historical execution ordinals 1–98 are owner-reported as accepted; historical ordinal 99 (`idx_recipients`) is intentionally excluded; original ordinals 100–135 are represented by the 36-file resumption ledger.

## Owner-reported execution state to reconcile

The owner reports that statements 1–98 were hash-verified and executed before the statement-99 compatibility stop, and that the corrected resumption files for original ordinals 100–135 then completed in one hash-verified batch. The asserted final D-04 state is 113 cumulative tables, 7 D-04 foreign keys, 87 D-04 explicit indexes, and zero rows in every D-04 table. These statements are execution evidence supplied by the owner and are not treated as independent confirmation.

## Independent closure checks

The following read-only controls must all pass before a D-04 closure conclusion:

| Control | Expected state |
|---|---|
| Cumulative table inventory | Exactly 113 names: the closed 73-table D-01–D-03 baseline plus 40 corrected-source D-04 tables |
| D-04 structural metadata | Every corrected-source D-04 table and column definition matches the live metadata |
| Foreign keys | All 42 cumulative definitions match names, child/parent columns, targets, and actions; 7 are D-04 definitions |
| Explicit indexes | 264 cumulative distinct table/index definitions match source, including 87 D-04 definitions; `idx_recipients` remains absent |
| Primary and unique keys | All source-defined key structures and ordered key columns match |
| Row state | Every D-04 table has zero rows |
| Artefact integrity | Corrected full ledger and ordinal-100 onward resumption ledger reproduce deterministically from their pinned sources |

## Authenticated target observation

The TiDB Cloud SQL Editor was authenticated as the KINGA owner and opened against `KINGA-staging` on 15 September 2026. An initial read-only inventory query using `table_schema = DATABASE()` completed in 34 ms with an empty set because the editor reported `No database used`; it was not a staging-state result and no closure conclusion was drawn. The explicit-schema replacement query—filtering `information_schema.tables` to `table_schema = 'kinga_staging'`—completed in 12 ms and returned **113 rows**. Its downloaded export was compared offline with the Wave 1 and Wave 2 table definitions, the revised Wave 3 canonical ledger, and corrected Wave 4 source. The result was exactly **113 expected / 113 live**, with **0 missing** and **0 unexpected** table names.

The cumulative read-only foreign-key definition query completed in **325 ms** and returned **42 rows** from `information_schema`: constraint name, child table/column, parent table/column, update rule, and delete rule. Its retained export is required for exact source-to-live definition comparison.

The exported live foreign-key definitions were compared offline with the Wave 1 and Wave 2 SQL sources, the revised Wave 3 canonical ledger, and corrected Wave 4 source. The result was **42 expected / 42 live** definitions and **42 / 42 distinct constraint names**, with **0 missing** and **0 unexpected** definitions. This includes all seven D-04 foreign keys.

The cumulative read-only non-primary index-column query completed in **217 ms** and returned **393 information-schema rows**. This is intentionally not treated as the explicit-index count: composite and unique/foreign-key-backed indexes contribute multiple rows or are outside the explicit `CREATE INDEX` population. The complete export is required to reconcile the expected **256 distinct source-explicit table/index pairs** and their ordered columns, including the deliberate absence of `governance_notifications.idx_recipients`.

The exported live index metadata was reconciled offline against all source-defined explicit indexes: 8 Wave 1, 58 Wave 2, 111 revised Wave 3, and 87 corrected Wave 4. The result was **264 expected / 264 matching distinct explicit table/index pairs**, with all **313 expected ordered index-column rows** matching and **0 missing** or definition-mismatched indexes. The correct cumulative explicit-index total is therefore 264; the owner-reported 256 omits the eight Wave 1 explicit indexes. `governance_notifications.idx_recipients` is absent as required by the corrected Wave 4 source.

Bounded structural group 1 (the first ten corrected D-04 source tables) completed in **92 ms** and returned **146 column-metadata rows**, below the SQL editor result cap. Its full export is retained for deterministic source-to-live comparison; the remaining 30 D-04 tables are collected in three similarly bounded read-only groups.

The group-1 export was retained locally as `results-2026-09-15-094011.csv` before continuing the structural collection.

Bounded structural group 2 (the next ten corrected D-04 source tables) completed in **73 ms** and returned **160 column-metadata rows**, also below the result cap. Its complete export is retained before collecting groups 3 and 4.

The group-2 export was retained locally as `results-2026-09-15-094201.csv`.

Bounded structural group 3 completed in **71 ms** and returned **169 column-metadata rows**, below the result cap. Its full export was retained locally as `results-2026-09-15-094331.csv`; the remaining final group is the last read-only structural collection required.

Bounded structural group 4 completed in **65 ms** and returned **162 column-metadata rows**, below the result cap. It completes the 40-table structural evidence collection; its export is retained before the offline source-to-live comparison.

The final group export was retained as `results-2026-09-15-094516.csv`. The deterministic structural comparator then reconciled all four complete live exports against corrected Wave 4 source v2: **40/40 tables**, **637/637 columns**, and **0 mismatches** in ordinal, name, type, nullability, explicit default (including normalized JSON expression defaults), auto-increment, or update attribute.

The final cumulative source-key query completed in **130 ms** and returned **153 keyed-column rows** from `information_schema.statistics` where `non_unique = 0`. Its complete export is retained for exact comparison of all primary and unique-key definitions with the corrected cumulative source.

The retained export `results-2026-09-15-094906.csv` reconciled exactly with the D-01, D-02, revised D-03, and corrected D-04 sources: **153/153 keyed-column rows** and **138/138 distinct primary-or-unique structures**, with no missing or unexpected definition.

The first generated 40-table zero-row aggregate was correctly assembled but failed before reading any table because the newly loaded editor session had no selected database and the query used unqualified table names. The error was `No database selected`; it was non-mutating. A retry with fully qualified `` `kinga_staging`.`table_name` `` references still received the SQL editor’s `No database selected` qualification error, demonstrating that this editor requires a session schema even for fully qualified table references. The next generated assertion will therefore begin with `USE \`kinga_staging\`;` (session context only) before the identical fully qualified read-only aggregate.

The regenerated assertion `gate-d-d04-postflight-zero-row-query-2026-09-15.sql` (SHA-256 `7bd3424030fe3757ae666e7fa17029b9d267080f68f8a7f016f8a56cd5878489`) executed with the target session schema selected. The aggregate returned `checked_table_count = 40`, `total_rows = 0`, `minimum_rows = 0`, and `maximum_rows = 0` in 223 ms. All 40 corrected-source D-04 tables are therefore independently confirmed empty.

## Closure decision

**Closed — 15 September 2026.** Every planned authenticated, read-only D-04 closure control passed against the corrected Wave 4 execution source and its related source artefacts:

| Control | Independent result |
|---|---|
| Cumulative table inventory | 113 expected / 113 live names; 0 missing, 0 unexpected |
| D-04 structural metadata | 40 / 40 tables and 637 / 637 columns; 0 mismatch |
| Cumulative foreign keys | 42 / 42 definitions; 0 mismatch, including 7 D-04 definitions |
| Cumulative explicit indexes | 264 / 264 distinct table/index pairs and 313 / 313 ordered indexed-column rows; 0 mismatch, including 87 D-04 indexes |
| Cumulative primary and unique keys | 153 / 153 keyed-column rows and 138 / 138 structures; 0 mismatch |
| D-04 row state | 40 / 40 tables checked; total, minimum, and maximum row count each 0 |
| Corrected artefact integrity | Revised 134-statement ledger and 36-file historical-ordinal 100–135 ledger regenerated and matched exactly; all file hashes passed |

The corrected Wave 4 source does not define `governance_notifications.idx_recipients`; its absence is therefore required and was independently confirmed. The correct cumulative explicit-index total is 264 (8 D-01 + 58 D-02 + 111 D-03 + 87 D-04). The owner-reported figure of 256 omits the eight D-01 explicit indexes.

> This closure is limited to independently observed final staging metadata, structural definitions, explicit index/key definitions, and row state. The reported per-statement hash verification and Claude Code execution process remain owner-reported evidence. The independently reconciled end state is consistent with that report.

The D-04-only sole-operator/reviewer/application-validation exception expired with this closure. It grants no authority for D-05, later waves, recovery/cutover, deployment, or production. No D-05 activity is authorised or initiated by this record.
