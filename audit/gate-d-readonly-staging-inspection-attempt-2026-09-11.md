# Gate D Read-Only KINGA-Staging Inspection Attempt — 2026-09-11

## Authority and boundary

The owner authorised only a read-only verification of KINGA-staging recovery readiness: TiDB service class, backup/PITR availability, retention, recovery-to-new-instance capability, and the scope of the existing verification identity. No account, firewall, backup, restore, schema, migration, data, staging, or production change was authorised or performed.

## Direct verification-identity attempt

The staging-specific `KINGA_STAGING_DATABASE_URL` resolved to the TiDB Cloud public endpoint for database `kinga_staging`, distinct from the managed runtime `DATABASE_URL`. The supplied account name is the expected `kinga_verify` identity. The read-only MySQL client attempt used that staging URL only and issued no query because TiDB Cloud rejected the TCP connection first:

> `ERROR 1105 (HY000): Host '184.72.188.173' is not allowed to connect to your cluster '10622508722732097493'.`

No `SELECT`, metadata query, backup action, restore action, DDL, DML, or account change ran. The direct verification path remains blocked until the sandbox egress IP is added as a narrow TiDB Cloud public-endpoint firewall rule or an approved private/connectivity route is supplied.

## Authenticated-console evidence available to the owner

The owner supplied an authenticated TiDB Cloud overview screenshot for `KINGA-staging`. The visible console facts are:

| Property | Observed value |
|---|---|
| Instance name | `KINGA-staging` |
| Instance state | Active |
| Service class | Starter |
| Cloud provider | AWS |
| TiDB version | v8.5.3 |
| Current spend label | Free |

The browser session available to this task is separate from the owner’s signed-in browser and therefore remains at the TiDB Cloud sign-in page. It cannot inspect the owner’s Backup page without the session being connected to this task.

## What is confirmed, conditional, and still unverified

TiDB Cloud documentation states that Starter instances use daily automatic backups; a free Starter instance retains backups for one day, while paid Starter/Essential can configure 1–30 days. Point-in-time restore is not supported for Starter and is preview-only for Essential. Snapshot restore is to a **new** Starter or Essential instance, and source credentials/permissions are not restored.[1]

Because the owner’s overview shows `Starter` and `Free`, the documented plan behaviour is consistent with a daily, one-day-retention snapshot-backup posture and **no PITR**. That is a documented service-class inference, not a confirmation of the instance’s current Backup-page setting or latest backup.

The following require either an owner-provided Backup-page screenshot or a successful allowlisted read-only console/database path:

1. the configured current retention and latest successful backup timestamp;
2. the displayed restore actions for this exact instance;
3. the actual grants of `kinga_verify` and its confirmed table visibility;
4. any per-instance recovery warning, restore restriction, or capacity limit.

## Successful AWS-allowlisted read-only verification

After the owner enabled TiDB Cloud **AWS Access** on the public endpoint, the exact same staging-only verification identity connected successfully. The runtime `DATABASE_URL` was explicitly unset for this operation. The local temporary client configuration was deleted after the command and no credential value was printed or committed.

| Read-only check | Verified result |
|---|---|
| Target database | `kinga_staging` |
| Authenticated identity | `289ZyKGJwbC2SkB.kinga_verify@%` |
| Server | `8.0.11-TiDB-v8.5.3-serverless` |
| Transport | TLS 1.3 using `TLS_AES_128_GCM_SHA256` |
| Effective grant scope | `USAGE` globally and `SELECT` on `kinga_staging` only |
| Visible application tables | `0` in `information_schema.tables` for `kinga_staging` |
| DDL/DML/backup/restore/account action | None issued |

The confirmed grant is appropriately read-only for Gate D readiness inspection. The zero visible-table result confirms that staging is still empty from the verification identity's perspective; it does **not** establish a completed migration baseline.

The TiDB Cloud console overview supplied by the owner identifies KINGA-staging as an active, free **Starter** instance on AWS. Under TiDB Cloud's documented Starter behaviour, automatic backup is daily, free Starter retention is one day, point-in-time restore is not supported for Starter, and snapshot restore is to a new instance.[1] This establishes the currently documented recovery capability and a material Gate D constraint: **the planned PITR acceptance gate cannot be satisfied on the current free Starter service class**.

The latest successful snapshot timestamp and the Backup-page display were not exposed through the SQL verification identity and remain console-only evidence. Before any Gate D execution packet, the owner or an authenticated console session must record the exact latest snapshot/time and confirm the displayed snapshot-restore action. A restore rehearsal must remain a separately authorised operation to a newly created non-production instance; it has not been started.

## No-go conclusion

Gate D remains non-executing. The authorised inspection did not establish the recovery acceptance gate, and it did not authorize a migration account, staging DDL/DML, backup creation, restore rehearsal, production work, or Gate D execution.

## Authorised restore-rehearsal preparation

The owner subsequently approved a restore rehearsal using the latest available KINGA-staging snapshot, subject to the following recorded roles and boundaries:

| Item | Recorded value |
|---|---|
| Approver | KINGA owner |
| Operator | Manus AI, acting under the owner's explicit authority |
| Source | `KINGA-staging` latest available snapshot only |
| Proposed recovery target | `kinga-staging-restore-rehearsal-20260911` (new, separate, disposable non-production instance) |
| Forbidden source actions | Any DDL/DML, migration, data change, backup configuration change, or restore action on `kinga_staging` |
| Forbidden scope | Production and migration-account work |
| Submission control | A final owner confirmation is required immediately before selecting **Restore** in the TiDB Cloud console. |

Before submission, the exact backup timestamp, displayed restore option, target name, and target service/capacity setting must be captured from the Backup page. The target must be a newly created instance rather than `KINGA-staging` itself; any unexpected target name, in-place option, or data-change screen is a stop condition.

## Latest snapshot evidence for the authorised rehearsal

The owner supplied a TiDB Cloud **KINGA-staging → Data → Backup** console screenshot. The visible latest snapshot record is:

| Field | Console value |
|---|---|
| Backup time | `2026-09-11 03:00:45 UTC+00:00` |
| Status | Succeeded |
| Expiry time | `2026-09-12 03:00:45 UTC+00:00` |
| Available action | Restore |

This is the source snapshot approved for the rehearsal. The restore form has not yet been opened or submitted. The next evidence gate is confirmation from the form that TiDB Cloud will create a new instance, with the exact target name and capacity settings visible before the final owner confirmation.

## Restore-form boundary evidence

The owner then opened the TiDB Cloud restore form without submission. The form confirms the following:

| Form field | Visible value |
|---|---|
| Source Starter instance | `KINGA-staging` |
| Restore mode | Snapshot Restore selected |
| Point-in-Time Restore | Unavailable; form states it is available only for Essential |
| Destination model | Restore to a New Starter Instance |
| Provider | AWS |
| Region | Frankfurt (`eu-central-1`) |
| Target name | Not yet entered |
| Backup snapshot selection | Not yet selected in the form |
| Restore submission | Not performed |

This confirms the current console flow does not present an in-place restore option. The operator instructed the owner to select the already evidenced `2026-09-11 03:00:45 UTC` snapshot and enter `kinga-staging-restore-rehearsal-20260911`. The final summary must show those exact values before the final submission confirmation is requested.

The owner then selected the expected snapshot. The visible restore summary confirms `KINGA-staging`, **Snapshot Restore**, backup snapshot `2026-09-11 03:00:45 UTC+00:00`, AWS, Frankfurt (`eu-central-1`), and a `$0.00` monthly spending limit. The instance-name field remained blank and the summary displayed the name as `–`; this is a stop condition. No final confirmation has been requested and no restore was submitted until the exact disposable target name is shown.

The owner subsequently populated the exact target `kinga-staging-restore-rehearsal-20260911`. The summary confirmed that same name alongside the previously verified source snapshot, Snapshot Restore mode, AWS Frankfurt (`eu-central-1`) region, and $0.00 monthly limit. The owner then explicitly confirmed submission. The owner must submit through the separately authenticated TiDB Cloud console; this task has no access to that browser session. Completion, restored-instance state, and source-instance invariance remain pending console status evidence.

## Submitted restore observation

The owner supplied the first post-submission TiDB Cloud resource-list view. It confirms that a distinct resource named `kinga-staging-restore-rehearsal-20260911` exists with plan **Starter** and status **Restoring**. In the same view, `KINGA-staging` and `KINGA-production` remain separately listed and each shows **Active**. This is positive in-progress evidence that the console created a separate recovery target rather than restoring in place.

The rehearsal is not yet complete. No SQL, DDL, DML, migration, import, or application test must be run against the restored target until its status is **Active** and a separate verification plan is approved.

## Reference

[1] [TiDB Cloud Starter or Essential Backup and Restore](https://docs.pingcap.com/tidbcloud/backup-and-restore-serverless/) — automatic backup, retention, restore modes, destination, and limitations.
