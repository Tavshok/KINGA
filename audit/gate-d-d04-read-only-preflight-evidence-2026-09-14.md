# Gate D — D-04 Read-Only Preflight Evidence

**Status:** Review-only evidence collection. This record does not authorise D-04 DDL, DML, account or grant changes, networking changes, backup/restore actions, deployment, recovery/cutover, or production work.

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

## Pending review-only check

The exact tenant-prefixed runner account `289ZyKGJwbC2SkB.d01_runner` requires a fresh `SHOW GRANTS` recheck before the D-04 review packet can state that the existing `SELECT`, `CREATE`, `REFERENCES`, `ALTER`, and `INDEX` set still covers the revised source. No account or grant change is authorised.

The authenticated TiDB Cloud SQL Editor for the same `KINGA-staging` cluster opened successfully after the Backup-page observation. Its retained editor text was a prior D-03 read-only count query; it has not been executed as part of D-04 evidence. The next operation is limited to replacing that text with the exact-principal `SHOW GRANTS` statement and running it read-only.

The editor text was successfully replaced with `SHOW GRANTS FOR '289ZyKGJwbC2SkB.d01_runner'@'%';`. An initial user-interface control selection targeted the editor search input rather than the visible `Run` control, so **no query ran** and no database state changed. The statement remains loaded for the intended read-only execution.

The exact-principal `SHOW GRANTS` query then completed in 19 ms and returned exactly two rows:

```sql
GRANT USAGE ON *.* TO '289ZyKGJwbC2SkB.d01_runner'@'%'
GRANT SELECT,CREATE,REFERENCES,ALTER,INDEX ON `kinga_staging`.* TO '289ZyKGJwbC2SkB.d01_runner'@'%'
```

The grant set is restricted to `kinga_staging.*` except for global `USAGE`. It includes the five source-derived privileges required by the revised D-04 source: `CREATE` for 40 table statements; `ALTER` and `REFERENCES` for seven foreign keys; `INDEX` for 88 index statements; and `SELECT` for metadata and row-count verification. No source-derived D-04 privilege gap was found, and no account or grant was changed. This is review-time evidence only and does not create D-04 execution authority.
