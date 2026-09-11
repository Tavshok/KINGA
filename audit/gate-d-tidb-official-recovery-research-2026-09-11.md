# Gate D Preparation — TiDB Official Recovery and Account-Scope Research

This note records external authoritative material used to prepare a **non-executing** Gate D readiness plan. It does not confirm the configuration, backup history, cluster class, privileges, or recoverability of any KINGA environment.

TiDB Cloud Dedicated documentation states that automatic snapshot backups are retained according to policy, Point-in-Time Restore must be enabled in advance, and PITR becomes effective only after the next backup completes; a manual backup can accelerate that readiness point. The same documentation says a restore is to a **new cluster**, not in place, and requires setting a new root password for that restored target.[1]

The TiDB Cloud backup/restore concepts describe manual backups as controlled restore points retained until explicitly deleted and explain that PITR restores to a new cluster or instance. They also distinguish service classes: Starter does not support PITR, Essential offers a stated window, and Dedicated requires PITR to have been enabled in advance.[2]

TiDB’s backup and restore overview documents constraints relevant to a restore rehearsal: PITR restores only to an empty cluster; concurrent backup tasks are unsupported; active log backup or TiCDC cannot run during a PITR restore; and restore to a new or offline cluster is preferred over restore to production. It advises using a BR version compatible with the TiDB cluster and notes system-table compatibility considerations.[3]

For account preparation, the developer guide states that user/role creation requires a root user and recommends granting only privileges needed for the task. It also recommends using a MySQL command-line or GUI client for schema changes rather than an ORM.[4]

## References

[1]: https://docs.pingcap.com/tidbcloud/backup-and-restore/ "Back Up and Restore TiDB Cloud Dedicated Data"
[2]: https://docs.pingcap.com/tidbcloud/backup-and-restore-concepts/ "TiDB Cloud Backup & Restore"
[3]: https://docs.pingcap.com/tidb/stable/backup-and-restore-overview/ "TiDB Backup & Restore Overview"
[4]: https://docs.pingcap.com/developer/dev-guide-create-database/ "Create a Database"
