# Gate D Staging Reconciliation — Execution Readiness Plan

## Status, purpose, and authority boundary

This document prepares the controls, evidence model, and execution packets required **before** a future staging-only Gate D reconciliation. It is not authority to contact a TiDB Cloud cluster, create a user, inspect a backup, take a backup, restore a cluster, alter a database, or change application configuration.

The merged Gate C source baseline has reproducible local proof for **189 selected tables**: Waves 1–5 cover 188 tables, and a separately approved supplemental package covers `photo_reextraction_jobs`. The following candidates are explicitly excluded from all Gate D packets: `audit_logs`, `benchmark_deviations`, `geometry_sources`, `tenant_tier_history`, `tenant_usage_summary`, `vehicle_landmarks`, and `vision_calibration_results`. Four natural/composite-unique questions also remain deferred: `assessor_insurer_relationships`, `policy_claim_links`, `fleet_drivers`, and `entity_relationships`.

> **Hard stop:** Gate D cannot begin until the owner separately authorises a named TiDB Cloud staging cluster, an exact target database, access provisioning, the recovery/rehearsal actions, and one execution packet. Production is out of scope.

## Required decision record before any access

The Gate D owner must complete and approve the following record in writing. Values are intentionally blank because this package has not inspected a KINGA TiDB Cloud environment.

| Field | Required value before Gate D | Why it is a stop condition |
|---|---|---|
| Environment identity | Organisation, project, cluster name/ID, cloud/provider region, TiDB Cloud service class, and exact staging database name | Prevents misrouting credentials or a command to production. |
| Ownership | Named KINGA account owner, database administrator, application owner, and incident/recovery approver | Assigns authority for account provisioning, restore, and any future cutover. |
| Network and TLS | Approved source-IP/private-connectivity route, CA/server-name method, and mandatory TLS behaviour | Avoids broad internet access and unverified encryption. |
| RPO/RTO and retention | Explicit recovery-point, recovery-time, and backup-retention objectives approved by the owner | TiDB default/available retention is not a substitute for KINGA’s recovery requirement. |
| Service-class capability | Evidence that the actual TiDB Cloud class supports the required backup/PITR workflow | PITR availability differs by TiDB Cloud service class.[1] |
| Change window | UTC start/end, application isolation owner, observer, stop authority, and communications route | Prevents a migration from running during an unowned or ambiguous operating period. |

## Least-privilege access design

The design separates discovery, schema execution, application traffic, and recovery administration. Credentials must be created and stored by the designated KINGA administrator, entered only through the managed secret process when separately authorised, scoped to the named staging database, and rotated/revoked after the approved window. The application runtime must never use a schema-runner credential.

| Principal | Purpose | Required capability | Explicitly excluded |
|---|---|---|---|
| `kinga_staging_schema_verifier` | Preflight/postflight metadata checks | Metadata visibility and read-only schema inspection for the one target database; no application-row reads unless separately approved for a restore validation sample | DDL, DML, user/role administration, cross-database access, production access. |
| `kinga_staging_schema_runner` | One owner-approved Wave packet | `CREATE`, `ALTER`, `INDEX`, and `REFERENCES` only on the named staging database, plus the minimum metadata visibility necessary to verify the result | `DROP`, `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, user/role grants, cross-database access, production access. |
| `kinga_ticloud_recovery_admin` | TiDB Cloud console backup/PITR and restore actions | Console/project authority sufficient only to inspect backup settings and, when separately approved, restore to a **new** non-production cluster/instance | Application runtime use, routine schema execution, production restore/cutover, sharing root credentials. |
| Application account | Ordinary app traffic after a separately approved staging rollout | Existing application data permissions only | Schema DDL, backup administration, migration-account duties. |

The final SQL grant syntax must be generated and reviewed in the TiDB Cloud account context, because available privileges and object-scoped grant behaviour must be checked against the actual service class/version. TiDB documentation recommends granting only the privileges necessary for the job and using a MySQL command-line or GUI client, not an ORM, for schema changes.[2] No credential, grant, secret name with a value, or executable grant statement is included here.

### Credential and connection acceptance test

Before the migration credential is ever allowed to run a packet, the administrator and operator must jointly retain an evidence record proving:

1. DNS/endpoint, cluster ID, `SELECT VERSION()`, `SELECT DATABASE()`, and authenticated account identity all resolve to the owner-approved staging target.
2. TLS is negotiated and certificate/server-name validation conforms to the approved connection design.
3. The verifier can inspect only approved metadata and cannot write data or DDL.
4. The runner can perform no data DML and has no `DROP` privilege; the operator records `SHOW GRANTS` output with secret values redacted.
5. The runner’s permitted DDL classes correspond exactly to the selected packet’s `CREATE TABLE`, `CREATE INDEX`, and source-declared `ALTER TABLE ... ADD CONSTRAINT` statements.
6. No application runtime secret is reused as either verifier or runner credential.

A failed identity, TLS, privilege, or schema-scope check is a stop condition. Do not attempt a “test DDL” on the real staging target; use a separate disposable target only after its owner approves that action.

## Recovery, backup, PITR, and restore-rehearsal gates

The actual TiDB Cloud service class has not been identified, so no recovery capability is assumed. TiDB Cloud documentation says Cloud Dedicated PITR must be enabled in advance and becomes effective after the next completed backup; a manual backup can create an earlier readiness point.[3] Its documented restore workflow restores to a new cluster and requires a new root password for that target.[3] TiDB guidance further warns that PITR is to an empty cluster and that restore to a new/offline cluster is preferred over production.[4]

| Gate | Evidence required | Acceptance criterion | Authority required |
|---|---|---|---|
| R1: Service-class confirmation | Console/export evidence naming the cluster service class, version, region, backup retention, and backup history | The documented backup/PITR method applies to the actual cluster class. | Read-only TiDB Cloud console access. |
| R2: Backup/PITR readiness | Backup settings evidence, PITR status/range where supported, last successful automatic backup, and manual pre-change recovery point if/when authorised | The owner accepts the effective recovery window and confirms PITR was enabled before the desired recovery point where relevant. | Explicit backup/PITR inspection authority; separate authority for a manual backup. |
| R3: Restore target design | Named new non-production restore target, no application route, access owner, encryption/network settings, cost approval, and deletion/retention plan | The target is isolated and can accept a restore without overwriting staging or production. | Explicit restore-rehearsal authority. |
| R4: Rehearsal | Timestamped restore operation record, source backup/PITR point, new target identity, new target credentials held by owner, and structural validation results | Restore completes to the new target; selected structural metadata equals the approved source/baseline packet; any row-level validation uses separately approved privacy-safe checks. | Explicit restore execution authority. |
| R5: Recovery sign-off | Owner, recovery administrator, and application owner attest actual elapsed restore time, observed recovery point, validation result, limits, and follow-up remediation | Demonstrated result meets the approved RPO/RTO or is accepted as a known gap. | Owner sign-off. |

The plan does not treat auto-backup as proof of a usable restore. Manual backups are controlled restore points retained until deleted, while PITR and restore characteristics differ by TiDB Cloud service class.[1] [3] The rehearsal should be completed before the first staging DDL packet, not after it.

## Packet-controlled staging execution protocol

Only one packet may be considered at a time after all R1–R5 gates and the named packet’s preconditions are accepted. Every packet must have a second-person reviewer. The runner receives a SHA-256-pinned SQL file; it must not generate SQL during the execution window.

| Step | Operator action | Evidence | Stop condition |
|---|---|---|---|
| 0. Authorise | Obtain written approval naming the packet ID, SQL SHA-256, target, window, approvers, recovery point, and stop authority | Signed decision record | Missing named packet/target/approver. |
| 1. Identity | Run read-only identity/TLS/privilege check using verifier credentials | Redacted transcript and target fingerprint | Target does not exactly match approved staging identity. |
| 2. Preflight | Compare current staging metadata to the packet’s prerequisite fingerprint and check unexpected tables/constraints/indexes | Machine-readable preflight diff | Any unapproved drift or existing packet object. |
| 3. Recovery point | Confirm the authorised current backup/PITR evidence; do not initiate a manual backup without its separate approval | Backup ID/time/range | Recovery gate expired, missing, or not accepted. |
| 4. Execute | Run the exact reviewed SQL with the schema-runner account, one statement log at a time | Redacted command log, start/end UTC, statement counts | Any failed statement, timeout, lock/connection issue, unexpected object, or output deviation. |
| 5. Postflight | Use verifier credentials to compare tables, columns, PKs, indexes, FKs, defaults, and checksum/fingerprint to the packet expectation | Machine-readable metadata comparison | Any mismatch. |
| 6. Application gate | Separate application owner performs agreed staging smoke tests using non-production accounts/data | Test record | Any runtime/auth/tenant/data-integrity failure. |
| 7. Close | Revoke/disable runner access, retain evidence, confirm no unapproved object, and decide whether next packet may be considered | Closure/sign-off | No closure or unresolved finding. |

### Recovery and rollback rule

No “rollback SQL” is pre-authorised for a packet. The Gate C baseline deliberately contains no destructive `DROP`/data statements, and no staging procedure should improvise them. If a postflight mismatch occurs, stop the sequence, preserve logs, isolate application traffic if required by the incident owner, and use the rehearsed new-cluster restore route for investigation/recovery. Any decision to replace, repoint, or alter a staging target requires a separate incident/change approval.

## Gate D non-execution exit criteria

This preparation phase is complete only when the documents and packets are reviewed. It does **not** complete Gate D. Gate D remains blocked until the owner has authorised R1–R5, a named environment, credentials, one packet, and the intended first staging action. Production remains a separate, later decision.

## References

[1]: https://docs.pingcap.com/tidbcloud/backup-and-restore-concepts/ "TiDB Cloud Backup & Restore"
[2]: https://docs.pingcap.com/developer/dev-guide-create-database/ "Create a Database"
[3]: https://docs.pingcap.com/tidbcloud/backup-and-restore/ "Back Up and Restore TiDB Cloud Dedicated Data"
[4]: https://docs.pingcap.com/tidb/stable/backup-and-restore-overview/ "TiDB Backup & Restore Overview"
