# D-05 Read-Only Preflight Evidence — 15 September 2026

## Scope and evidence boundary

This record supports review of the D-05 final-wave packet only. It records authenticated console observations and repository-only source checks. It does **not** authorise D-05 execution, account or grant changes, networking changes, data changes, recovery/cutover, deployment, or production activity.

## Fresh recovery observation

At approximately 10:07 UTC on 15 September 2026, the authenticated TiDB Cloud Backup page identified the target as `KINGA-staging` and displayed the following latest recovery record:

| Field | Observed value |
|---|---|
| Backup time | `2026-09-15 03:00:45 UTC±00:00` |
| Status | `Succeeded` |
| Expires time | `2026-09-16 03:00:45 UTC±00:00` |
| Restore availability | Backup page exposed the Restore view; no Restore control was selected and no recovery action was started. |

This observation is current review evidence only. Before a future D-05 execution decision, the operator must make a new immediate-before-execution observation, record an approved UTC window, and prove that the window end plus the two-hour post-closure margin is within the snapshot retention period.

## Immediate execution-preflight snapshot recheck

At approximately 10:16 UTC on 15 September 2026, a new authenticated TiDB Cloud Backup-page inspection again identified the target as `KINGA-staging` and displayed the same current recovery record:

| Field | Observed value |
|---|---|
| Backup time | `2026-09-15 03:00:45 UTC±00:00` |
| Status | `Succeeded` |
| Expires time | `2026-09-16 03:00:45 UTC±00:00` |
| Restore availability | The Restore view was visible but not selected; no backup or restore action was initiated. |

This is the immediate recovery-evidence component of the owner-authorised D-05 preflight. It remains valid only while the stated snapshot remains the current same-day recovery point and until any separately recorded execution window ends with its required post-closure margin.

## SQL-editor access state

At approximately 10:07 UTC on 15 September 2026, the authenticated `KINGA-staging` SQL Editor route opened under the owner’s TiDB Cloud session. The editor had restored a previously prepared, read-only zero-row query from D-04; it was visible but not run during this D-05 activity. It will be replaced with the D-05 exact-principal grant inspection before any new query is executed.

At approximately 10:17 UTC on 15 September 2026, the authenticated `KINGA-staging` SQL Editor was restored for the immediate D-05 preflight. It displayed a prior, read-only exact-principal `SHOW GRANTS` statement, which has not been run during this renewed D-05 execution-preflight sequence. The statement will be replaced with the fresh D-05 baseline query before any query execution.

At approximately 10:17 UTC, the following read-only table-inventory query was loaded in full and visually confirmed. It had not yet been run at the time of this entry:

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'kinga_staging'
  AND table_type = 'BASE TABLE'
ORDER BY table_name;
```

The query completed at approximately 10:18 UTC in 110 ms and the authenticated SQL editor reported **113 rows** from `information_schema`. The current displayed rows begin with `adjuster_sign_offs`, `agency_assisted_claimant_identities`, `agency_clients`, `agency_documents`, and the other expected closed-wave entries. The full result will be exported and compared offline against the exact 113-table D-01–D-04 source baseline and the 75 D-05 table names before this gate may pass. No D-05 table was selected or modified by this query.

The result export was retained locally as `/home/ubuntu/Downloads/results-2026-09-15-101812.csv` before the offline exact table-set reconciliation. This export is generated solely from the read-only query above.

The deterministic offline reconciliation completed successfully against the retained D-01 source, canonical D-02 ledger, revised D-03 ledger, corrected D-04 source, and revised D-05 source. It found exactly **113 expected/live baseline tables**, exactly **75** D-05 source tables, no missing baseline table, no unexpected live table, no D-05 table already present, and no overlap between the closed-wave and D-05 table sets. This passes the exact table-membership portion of the D-05 execution preflight; separate zero-row, named-FK, and explicit-index absence checks remain required.

The generated all-baseline, read-only row-count assertion was reproduced from the closed-wave source set and loaded in full into the authenticated SQL editor at approximately 10:22 UTC. Its SHA-256 is `d6b09c0565f5d3428f1047a017fadd9a54e67b276768b27e33400990f8fef5a7`, and it checks `tables_checked`, `total_rows`, `minimum_rows`, and `maximum_rows` across all 113 fully qualified `kinga_staging` baseline tables. It had not yet been executed at the time of this entry.

The assertion completed successfully at approximately 10:22 UTC in 508 ms, returning exactly `tables_checked = 113`, `total_rows = 0`, `minimum_rows = 0`, and `maximum_rows = 0`. The SQL editor identified the result database as `kinga_staging`. This passes the all-closed-wave zero-row gate. The query was read-only and did not select, insert, update, delete, or alter a D-05 table.

The generated D-05 object-absence assertion was reproduced directly from the revised Wave 5 source and loaded in full into the authenticated SQL editor at approximately 10:24 UTC. Its SHA-256 is `869516d49ae90bcac3b745d0a660ef6119fe2598a9f2391c165cdf00f36be970`. It counts only the 25 source-declared D-05 foreign-key names and the 190 source-declared D-05 explicit `(table_name, index_name)` pairs, grouping index metadata by pair to avoid the multi-column row-count error identified in prior waves. It had not yet been executed at the time of this entry.

The assertion completed successfully at approximately 10:25 UTC in 369 ms, returning exactly `existing_d05_foreign_keys = 0` and `existing_d05_explicit_indexes = 0`. This passes the D-05 object-absence gate: no named D-05 foreign key and no source-declared D-05 distinct explicit index was present before execution. The query was read-only metadata inspection only; no DDL or DML was sent.

## Exact-principal grant inspection prepared

The following read-only statement was loaded and visually confirmed in the authenticated SQL editor at approximately 10:08 UTC on 15 September 2026. It had not yet been executed at the time of this entry:

```sql
SHOW GRANTS FOR '289ZyKGJwbC2SkB.d01_runner'@'%';
```

## Exact-principal grant result

At approximately 10:08 UTC on 15 September 2026, the authenticated SQL editor ran the loaded `SHOW GRANTS` statement in 21 ms and returned exactly two rows:

```sql
GRANT USAGE ON *.* TO '289ZyKGJwbC2SkB.d01_runner'@'%'
GRANT SELECT,CREATE,REFERENCES,ALTER,INDEX ON `kinga_staging`.* TO '289ZyKGJwbC2SkB.d01_runner'@'%'
```

The source-derived D-05 privilege assessment therefore has no gap: `CREATE` covers all 75 table statements; `ALTER` and `REFERENCES` cover all 25 foreign-key statements; `INDEX` covers all 190 index statements; and `SELECT` covers required metadata verification. The observed scope contains no privilege beyond global `USAGE` and the five staging-scoped permissions. No account or grant was changed.

For the immediate D-05 execution-preflight sequence, the identical exact-principal statement was freshly loaded again at approximately 10:25 UTC: `SHOW GRANTS FOR '289ZyKGJwbC2SkB.d01_runner'@'%';`. It had not yet been executed at the time of this entry. This recheck is required to establish current rather than review-preparation grant evidence.

The fresh recheck completed successfully at approximately 10:25 UTC in 10 ms and returned exactly these two rows:

```sql
GRANT USAGE ON *.* TO '289ZyKGJwbC2SkB.d01_runner'@'%'
GRANT SELECT,CREATE,REFERENCES,ALTER,INDEX ON `kinga_staging`.* TO '289ZyKGJwbC2SkB.d01_runner'@'%'
```

This passes the current exact-principal grant gate. The observed account is the tenant-prefixed runner, with only global `USAGE` and exactly `SELECT`, `CREATE`, `REFERENCES`, `ALTER`, and `INDEX` scoped to `kinga_staging.*`. It is sufficient for the pinned D-05 75 table, 25 foreign-key, and 190 explicit-index statements and the read-only postflight checks. No account or grant modification was requested or performed.

## Pending review controls

The required no-database source-integrity recheck began after the live gates passed. The revised source SHA-256 was exactly `416de72140bb50ea254031c841e9ee1d027bc710d5fc9aba5b6c074e487764df`; the canonical ledger SHA-256 was exactly `67cf9e0ad6c0d1bc100678dd5d659226e6729430917363386217c153778a604d`; the compatibility audit passed with 290 literal markers, 290 non-empty executable fragments, 75 `CREATE TABLE`, 25 `ADD FOREIGN KEY`, and 190 `CREATE INDEX` statements; no legacy JSON-shaped TEXT literal default; one compatible `JSON_OBJECT()` default; and no unprefixed `TEXT`/`BLOB` index. The deterministic marker-split ledger verification passed, exactly 290 one-statement files existed, the sensitive-content scan found no credential material, and `git diff --check` passed.

The recheck then stopped at the mandatory ordered statement-file hash comparison. The independent file verifier confirmed every statement file exactly matched its ledger text and per-statement SHA-256, but emitted ordered statement-file SHA-256 `2134705c1015416a34d6b3db1d81add863b4205edc742fe31a05468adda9d08f`, not the D-05 packet/briefing expected value `c981ee22e83737226e1baa4068f26a6ab3b04fdc6afb4ed749921024b0a8ab8a`. The latter value was not present in the current D-05 worktree’s text records. This is an integrity mismatch, so the D-05 preflight is **not passed** and no Claude Code handoff or DDL execution may proceed. No D-05 DDL or DML statement has been issued.
