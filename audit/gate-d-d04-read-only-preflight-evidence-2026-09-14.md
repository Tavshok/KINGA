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
