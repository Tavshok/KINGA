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

## Reference

[1] [TiDB Cloud Starter or Essential Backup and Restore](https://docs.pingcap.com/tidbcloud/backup-and-restore-serverless/) — automatic backup, retention, restore modes, destination, and limitations.
