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

## SQL-editor access state

At approximately 10:07 UTC on 15 September 2026, the authenticated `KINGA-staging` SQL Editor route opened under the owner’s TiDB Cloud session. The editor had restored a previously prepared, read-only zero-row query from D-04; it was visible but not run during this D-05 activity. It will be replaced with the D-05 exact-principal grant inspection before any new query is executed.

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

## Pending review controls

Final packet, ledger, statement-file, source-scope, compatibility, whitespace, and sensitive-content checks remain required before the review packet is published. No D-05 DDL or DML statement has been issued.
