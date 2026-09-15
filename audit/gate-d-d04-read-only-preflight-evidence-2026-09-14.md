# Gate D — D-04 Read-Only Preflight Evidence

**Status:** Initial preflight evidence retained; controlled D-04 compatibility stop. The initial preflight supported owner-authorised execution but is no longer a valid resumption gate after the reported partial execution. This record does not authorise D-04 DML, account or grant changes, networking changes, backup/restore actions, deployment, recovery/cutover, or production work.

## Fresh recovery observation

On **14 September 2026**, an authenticated TiDB Cloud console inspection opened the Backup page for `KINGA-staging`. The page displayed the following current snapshot record without changing any backup setting or starting a restore:

| Field | Observed value |
|---|---|
| Cluster | `KINGA-staging` |
| Backup time | `2026-09-14 03:00:00 UTC±00:00` |
| Status | `Succeeded` |
| Expiry | `2026-09-15 03:00:00 UTC±00:00` |
| Restore control | Present; not selected |

This is a **review-time** snapshot observation only. It is not an approved D-04 execution window and must be rechecked immediately before any separately authorised execution. Any later window must end with at least a two-hour post-closure margin before the then-current snapshot expiry.

## Immediate execution-preflight snapshot recheck

At approximately **18:13 UTC on 14 September 2026**, the authenticated TiDB Cloud Backup page was re-opened for the authorised D-04 preflight. It still displayed the same successful `KINGA-staging` snapshot, created `2026-09-14 03:00:00 UTC±00:00` and expiring `2026-09-15 03:00:00 UTC±00:00`; the Restore control remained present and unselected. No backup setting or restore action was taken.

The observed expiry was approximately **8 hours 47 minutes** after the recheck, exceeding the required two-hour post-closure margin for a short same-day execution window. This evidence supports only the recovery-time gate; the D-01–D-03 baseline, D-04 object absence, exact-principal grant set, and ledger integrity still require independent read-only confirmation before any statement may be sent.

## Baseline and D-04 table-absence inventory

The authenticated SQL Editor executed the following read-only inventory on `KINGA-staging` at the D-04 preflight step:

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'kinga_staging'
  AND table_type = 'BASE TABLE'
ORDER BY table_name;
```

The console completed the query in 97 ms and returned **73 rows** from `information_schema`. This is the expected count for the closed D-01 through D-03 baseline. The complete result must be retained and compared exactly with the pinned cumulative table set; the query result also establishes that no D-04 table appears in the returned set when the exact comparison is complete. No statement was sent to modify the database.

The initial offline comparator intentionally treated the downloaded export as unquoted text and therefore reported every expected table as missing while displaying each live name with surrounding quotes. This was a **CSV representation error**, not a live-schema discrepancy: the SQL Editor export encodes its field values as quoted CSV. A dedicated CSV-aware verifier has been added for the exact source-to-live comparison; it normalizes only CSV enclosure before comparing the D-01/D-02/revised-D-03 baseline and revised D-04 membership.

The CSV-aware verifier passed against the retained inventory export: exactly **73** live baseline names matched the 73 expected D-01/D-02/revised-D-03 source names, with no missing or unexpected name; all **40** revised D-04 table names were absent.

## Baseline zero-row check

The dedicated query generator derived a single 73-table read-only aggregate solely from the exact verified baseline inventory. The generated statement has SHA-256 `2e5edd2b7bf1e30926c2779c4294b4c20d6acb6e5556b26c1e55115bada2c63c`; the SQL Editor independently re-hashed it before loading it. The authenticated console completed the query in 269 ms and returned:

| `tables_checked` | `total_rows` | `minimum_rows` | `maximum_rows` |
|---:|---:|---:|
| 73 | 0 | 0 | 0 |

This confirms every source-identified D-01 through D-03 baseline table is still empty at the D-04 preflight point. No write statement was sent.

## D-04 named foreign-key and explicit-index absence

The object-absence query was generated solely from the canonical 135-statement D-04 ledger and loaded only after its SHA-256 was verified as `cd7ad9c3e1bdd2b5fa06e779692103074517cc3e01e91827b206eca53e27b4f7`. It queried the seven exact D-04 foreign-key names from `information_schema.table_constraints` and the 88 exact D-04 `(table_name, index_name)` pairs from `information_schema.statistics`, using `COUNT(DISTINCT ...)` so multi-column index metadata cannot be mistaken for additional index structures.

The authenticated console completed the read-only query in 294 ms and returned:

| `d04_foreign_keys_present` | `d04_explicit_index_pairs_present` |
|---:|---:|
| 0 | 0 |

Together with the exact 73-table baseline comparison, this proves that none of the 40 D-04 tables, seven named foreign keys, or 88 named explicit table/index pairs existed at the preflight point. No DDL, DML, privilege, network, backup, or restore operation was performed.

## Immediate source and ledger control; execution-route stop

Immediately after the read-only preflight, the revised D-04 source and derived execution materials were reverified without contacting TiDB:

| Control | Result |
|---|---|
| Revised source SHA-256 | `8317ccc6d01c8c34b6fd2e1f466ca8781c9152910953c5f345fe13de65183f61` |
| Canonical ledger SHA-256 | `2f3aa4973af2842b2f61ce4535ae3418d7cc4e84cae9747e28b4ad11fc697c9f` |
| Deterministic source-to-ledger check | Passed; 135 statements |
| Derived statement files | Passed; 135 expected, 135 present, no missing, unexpected, or content/hash mismatch |
| Ordered derived-file hash | `8909d7cf205ae26b7807d44597ff9d8a6f79b24bc97734f0cec3b95b7b7393ee` |

The specific execution path authorised by the owner—**Claude Code**—is not installed or exposed in this sandbox (`claude_path=UNAVAILABLE`). This is a route-availability stop, not a source, snapshot, baseline, object-absence, or grant mismatch. No D-04 statement has been sent, and the browser SQL Editor has not been substituted for the authorised Claude Code route.

Execution remains stopped pending either owner operation through the verified ledger in the owner’s Claude Code environment or a new explicit decision authorising a different route. Any later resumption must recheck the then-current snapshot and all time-sensitive preflight evidence before a first D-04 statement is considered.

## Exact-principal review-only grant check

The exact tenant-prefixed runner account `289ZyKGJwbC2SkB.d01_runner` required a fresh `SHOW GRANTS` recheck before the D-04 packet could state that the existing `SELECT`, `CREATE`, `REFERENCES`, `ALTER`, and `INDEX` set covered the initial source. No account or grant change was authorised.

The authenticated TiDB Cloud SQL Editor for the same `KINGA-staging` cluster opened successfully after the Backup-page observation. Its retained editor text was a prior D-03 read-only count query; it has not been executed as part of D-04 evidence. The next operation is limited to replacing that text with the exact-principal `SHOW GRANTS` statement and running it read-only.

The editor text was successfully replaced with `SHOW GRANTS FOR '289ZyKGJwbC2SkB.d01_runner'@'%';`. An initial user-interface control selection targeted the editor search input rather than the visible `Run` control, so **no query ran** and no database state changed. The statement remains loaded for the intended read-only execution.

The exact-principal `SHOW GRANTS` query then completed in 19 ms and returned exactly two rows:

```sql
GRANT USAGE ON *.* TO '289ZyKGJwbC2SkB.d01_runner'@'%'
GRANT SELECT,CREATE,REFERENCES,ALTER,INDEX ON `kinga_staging`.* TO '289ZyKGJwbC2SkB.d01_runner'@'%'
```

The grant set is restricted to `kinga_staging.*` except for global `USAGE`. It includes the five source-derived privileges required by the initial D-04 source: `CREATE` for 40 table statements; `ALTER` and `REFERENCES` for seven foreign keys; `INDEX` for 88 index statements; and `SELECT` for metadata and row-count verification. No source-derived D-04 privilege gap was found, and no account or grant was changed. This was pre-execution evidence only and did not substitute for the separately recorded owner authority.

## Owner-reported partial execution and source-compatibility stop

The owner reports that historical D-04 ledger ordinals **1–98** executed in order with each exact statement hash verified immediately before execution. The reported accepted partial state is all 40 D-04 tables, all seven D-04 foreign keys, and 51 of the original 88 explicit indexes, with zero rows in the new tables. Historical ordinal **99**, `CREATE INDEX idx_recipients ON governance_notifications (recipients);`, then stopped on the database requirement for a key-length prefix on a `TEXT` column. The reported SQL hash matched the pinned original ledger; no modified retry or later statement was run.

This is an owner-reported execution observation, not independent postflight verification. The initial snapshot, baseline, absence, and grants above are therefore historical evidence only. Before any resumption, the then-current snapshot, exact partially applied D-04 structures, zero-row state, retained grants, revised source/ledger hashes, and the absence of the deliberately excluded index must all be rechecked read-only. The only permitted resumption package, if later authorised, is historical ordinals 100–135 from the revised source; ordinals 1–98 must not be rerun and ordinal 99 must not be sent.

## Renewed resumption snapshot recheck

On **15 September 2026**, the authenticated TiDB Cloud Backup page for `KINGA-staging` was re-opened for the owner-authorised D-04 resumption preflight. It displayed the current same-day snapshot below; the Restore control was visible and was not selected.

| Field | Observed value |
|---|---|
| Cluster | `KINGA-staging` |
| Backup time | `2026-09-15 03:00:45 UTC±00:00` |
| Status | `Succeeded` |
| Expiry | `2026-09-16 03:00:45 UTC±00:00` |
| Restore control | Present; not selected |

This observation satisfies only the renewed recovery-point gate. It does not approve an execution window or substitute for the remaining fresh baseline, partial-state, row-count, exact-principal grant, excluded-index-absence, and revised-artifact checks. No backup setting or restore action was taken.

## Renewed resumption inventory preparation

The authenticated `KINGA-staging` SQL Editor was opened after the renewed snapshot observation. The following current-table inventory statement was loaded in full on **15 September 2026** but had **not yet been executed** when this entry was written:

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'kinga_staging'
  AND table_type = 'BASE TABLE'
ORDER BY table_name;
```

The planned query is read-only and will establish the exact current table set for comparison with the 73-table D-01–D-03 baseline plus the reported 40-table D-04 partial state. Loading it made no database change.

The authenticated console then completed the inventory in **207 ms** and returned **113 base-table names** from `information_schema`. This count is consistent with the expected 73-table closed baseline plus the reported 40-table D-04 partial state, but count alone is not sufficient for the resumption gate: the complete name set must still be retained and compared exactly. An initial attempt to select the result’s export representation targeted a non-exporting text element; it did not execute another query or alter any database state. The result now exposes the generated export link as the sole blank link control in the result toolbar; it was used to retain `results-2026-09-15-082047.csv` locally for deterministic comparison.

The CSV-aware resumption-state verifier passed against that retained export: all **73** D-01–D-03 baseline table names and all **40** accepted D-04 partial-state table names are present, with no missing or unexpected table. The compatibility-only D-03 revision did not alter table membership, so the retained Gate C Wave 3 source is valid for this table-name comparison. This is exact table-set evidence only; structural objects, zero-row state, excluded-index absence, runner grants, and revised ledger artefacts remain separate gates.

After retaining the inventory, the authenticated SQL Editor was re-opened successfully for the next read-only gate. The completed table-inventory result remained visible; no additional query ran during this navigation and load confirmation.

The generated partial-state assertion was independently recomputed from the original and revised ledgers before use. It requires **7** accepted D-04 foreign-key names, **51** accepted pre-stop D-04 explicit `(table_name, index_name)` pairs, and **0** occurrences of the deliberately excluded `governance_notifications.idx_recipients`. Its SHA-256 is `e6314ceb288317ff7776645d418722aa2d2baa59902d0834754dbb93e21fe8d9`. The complete statement was loaded successfully in the authenticated SQL Editor and had not yet been executed when this entry was written.

The authenticated read-only query completed in **393 ms** and returned exactly the required values: `accepted_d04_foreign_keys_present = 7`, `accepted_d04_explicit_index_pairs_present = 51`, and `excluded_idx_recipients_present = 0`. This independently confirms the expected ordinal-1–98 partial D-04 structural state and confirms that the unsupported excluded index was not created. No database change was made.

The generated exact cumulative row-count assertion was loaded from the local relay, with SHA-256 `4417bab914f97d192d6ff825b0712772762b2bda5b2aa7d11c9508b6aaec607e`, and then executed read-only. It completed in **471 ms** and returned `tables_checked = 113`, `total_rows = 0`, `minimum_rows = 0`, and `maximum_rows = 0`. The complete closed baseline and accepted D-04 partial state are therefore empty at this observation point. This does not itself verify current runner grants or revised execution artefact integrity.

The final exact-principal privilege query—`SHOW GRANTS FOR '289ZyKGJwbC2SkB.d01_runner'@'%';`—was then loaded successfully in the authenticated SQL Editor. It is read-only and had not yet been executed when this entry was written.

The authenticated `SHOW GRANTS` query completed in **8 ms** and returned exactly two grants: `USAGE ON *.*` and `SELECT, CREATE, REFERENCES, ALTER, INDEX ON \`kinga_staging\`.*`, both for `289ZyKGJwbC2SkB.d01_runner`@`%`. These are staging-scoped and cover the pending original ordinals 100–135. The query made no database change.

Immediately before resumption handoff, the revised source SHA-256 (`7e5802c2a4c57cee21a951a0ca85d174b1f03fb5c560c00925564455ef9cfd69`), revised 134-statement ledger SHA-256 (`ddaeefc896ef01b713cb5551c67188614c777d52320c657412018f112a784b2f`), and 36-file historical-ordinal 100–135 resumption ledger SHA-256 (`c0253bdb9edc9f0aa6433bb95d44db468f89cce38fc89bcdb97da578b0d7f1f3`) were reverified. Independent deterministic regeneration reproduced the full and resumption ledger JSON, Markdown summaries, 134 full statement files, and 36 resumption files byte-for-byte. The resumption file range is exactly `100-idx_read_at.sql` through `135-idx_wt_is_default.sql`. The sandbox does not expose the owner-authorised Claude Code execution route; no DDL was sent from this environment.
