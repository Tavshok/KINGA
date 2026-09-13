# Gate D — D-03 Read-Only Preflight Evidence

**Status:** In progress. This record contains only authenticated console observations and source-derived comparisons. It does not authorize or perform DDL, DML, account/grant changes, networking changes, backup/restore actions, deployment, or production work.

## Fresh recovery observation

| Observation time | Target | Backup time | Status | Expires time | Action taken |
|---|---|---|---|---|---|
| 2026-09-13 approximately 14:22 UTC | `KINGA-staging` / `kinga_staging` | `2026-09-13 03:01:00 UTC±00:00` | `Succeeded` | `2026-09-14 03:01:00 UTC±00:00` | Read-only Backup-page inspection only; no restore, backup-setting, or database action. |

This is fresh console evidence for D-03 packet review. It is not an execution-window approval and must be rechecked immediately before any separately authorised D-03 action.

## Exact runner-account grant recheck

The authenticated SQL editor executed `SHOW GRANTS FOR '289ZyKGJwbC2SkB.d01_runner'@'%';` as a read-only metadata query at approximately 14:23 UTC. It returned the following two rows in 20 ms:

```sql
GRANT USAGE ON *.* TO '289ZyKGJwbC2SkB.d01_runner'@'%'
GRANT SELECT,CREATE,REFERENCES,ALTER,INDEX ON `kinga_staging`.* TO '289ZyKGJwbC2SkB.d01_runner'@'%'
```

The immutable Wave 3 source contains only 50 `CREATE TABLE`, 26 `ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY`, and 111 `CREATE INDEX` statements. Its source-derived minimum execution privileges are therefore `CREATE`, `ALTER`, `REFERENCES`, and `INDEX`; `SELECT` is additionally necessary for the stipulated preflight/postflight metadata checks. The exact tenant-prefixed account has each of these privileges on `kinga_staging.*`, and no broader schema-level grant appeared in the returned rows. **No source-derived D-03 privilege gap was found.**

This evidence supports packet review only. It neither authorises execution nor permits any change to the account, its grants, the target schema, or the network.
