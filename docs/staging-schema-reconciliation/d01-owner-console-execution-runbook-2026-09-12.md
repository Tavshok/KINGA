# D-01 Owner Console Execution Runbook

## Scope and hard boundary

This runbook is for **Tavonga Shoko, KINGA owner**, to operate the native authenticated TiDB Cloud SQL Editor directly. It replaces the abandoned browser-automation and dynamic-sandbox direct-client routes. It applies only to D-01 in `KINGA-staging` database `kinga_staging` and to the exact reviewed Wave 1 artefact pinned below.

> Stop immediately on any wrong target, expired or unsuccessful snapshot, non-empty preflight result, SQL-hash discrepancy, failed statement, unexpected warning/result, or metadata mismatch. Do not repair, edit, retry, add an index, grant access, alter a table, or continue to the next statement without a new owner decision.

| Control | Required value |
|---|---|
| Environment | `KINGA-staging` only; database `kinga_staging` only |
| Production | Excluded; do not open, query, or change `KINGA-production` |
| Source artefact | [`wave-01-identity-tenant-roots.sql`](../../audit/gate-c-scratch-baseline/wave-01-generated/wave-01-identity-tenant-roots.sql) |
| Source revision | `4336a2961147877a373a11a706e2a7ee4604f754` |
| Full source SHA-256 | `306797ab94529860bc9e88a69a955061916a94ddc3d08e3265229780ab08083c` |
| Scope | 3 `CREATE TABLE` statements plus 8 `CREATE INDEX` statements; no foreign keys |
| Permitted tables | `tenant_invitations`, `tenants`, `users` only |
| Prohibited classes | `DROP`, `ALTER`, `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `GRANT`, `REVOKE`, `CREATE USER`, backup/restore, import/export, networking change, and any production action |

The source file uses `--> statement-breakpoint` markers for repository tooling. They are **not SQL statements** and must not be pasted into TiDB Cloud. Each semicolon-terminated SQL statement below must be executed separately and exactly as in the pinned file.

## 1. Fresh immediate preflight

Before entering any DDL, open `KINGA-staging` → **Data** → **Backup** and capture the latest snapshot. It must be a **Succeeded** snapshot dated 12 September 2026, belong to `KINGA-staging`, have Restore available, and remain valid until at least two hours after D-01 closure. The prior recorded snapshot was `2026-09-12 03:01:00 UTC`, expiring `2026-09-13 03:01:00 UTC`; it is evidence only and must be rechecked live.

Then open SQL Editor, select `kinga_staging`, and run the following read-only checks individually. Capture the results.

```sql
SELECT DATABASE() AS active_database;
```

Expected: exactly `kinga_staging`.

```sql
SELECT table_name, table_type
FROM information_schema.tables
WHERE table_schema = DATABASE()
ORDER BY table_name;
```

Expected: **zero rows**. If any row is returned, stop; do not assume it is safe to merge with this baseline.

```sql
SELECT USER() AS session_user, CURRENT_USER() AS authenticated_user;
```

Capture the output only as execution evidence. Do not create temporary users or alter grants under this runbook.

## 2. Exact statement sequence

Copy each statement from the pinned file **one at a time** into the owner’s native TiDB Cloud editor, preserving every identifier, enum value, default, constraint, index name, column order, and semicolon. Check the editor preview before pressing **Run**. After each successful result, capture the statement number and TiDB result; only then proceed.

| Order | Exact source location | Expected result |
|---|---|---|
| 1 | Lines 1–14 | `tenant_invitations` table created |
| 2 | Lines 16–44 | `tenants` table created |
| 3 | Lines 46–79 | `users` table created |
| 4 | Line 81 | `tenant_id_idx` created |
| 5 | Line 82 | `email_idx` created |
| 6 | Line 83 | `expires_at_idx` created |
| 7 | Line 84 | `idx_tenants_name` created |
| 8 | Line 85 | `idx_tenants_status` created |
| 9 | Line 86 | `idx_users_tenant_id` created |
| 10 | Line 87 | `idx_users_is_active` created |
| 11 | Line 88 | `idx_users_phone_tenant` created |

The following abbreviations are not substitutes for the full source text. They identify the one permitted action at each point:

```sql
-- 1
CREATE TABLE `tenant_invitations` (...exact lines 1–14 from the pinned file...);

-- 2
CREATE TABLE `tenants` (...exact lines 16–44 from the pinned file...);

-- 3
CREATE TABLE `users` (...exact lines 46–79 from the pinned file...);

-- 4–11
CREATE INDEX `tenant_id_idx` ON `tenant_invitations` (`tenant_id`);
CREATE INDEX `email_idx` ON `tenant_invitations` (`email`);
CREATE INDEX `expires_at_idx` ON `tenant_invitations` (`expires_at`);
CREATE INDEX `idx_tenants_name` ON `tenants` (`name`);
CREATE INDEX `idx_tenants_status` ON `tenants` (`status`);
CREATE INDEX `idx_users_tenant_id` ON `users` (`tenant_id`);
CREATE INDEX `idx_users_is_active` ON `users` (`is_active`);
CREATE INDEX `idx_users_phone_tenant` ON `users` (`phone_number`,`tenant_id`);
```

The displayed `...` forms above are **not executable SQL**. For the three `CREATE TABLE` statements, use only the exact complete source text from the pinned file. Do not retype the table definitions from this document.

If a statement fails, stop at that statement. Do not run later statements. Send the exact statement number and non-sensitive TiDB error text for assessment. No corrective SQL is authorised by this runbook.

## 3. Postflight metadata proof

Only if all 11 statements return success, run the following read-only verification queries.

```sql
SELECT table_name, table_type
FROM information_schema.tables
WHERE table_schema = DATABASE()
ORDER BY table_name;
```

Expected table set, exactly: `tenant_invitations`, `tenants`, `users`.

```sql
SELECT table_name, constraint_name, constraint_type
FROM information_schema.table_constraints
WHERE table_schema = DATABASE()
  AND table_name IN ('tenant_invitations', 'tenants', 'users')
ORDER BY table_name, constraint_name;
```

Expected primary keys: `tenant_invitations_id`, `tenants_id`, `users_id`. Expected unique constraints: `tenant_invitations_token_unique`, `users_openId_unique`. No foreign key is expected.

```sql
SELECT table_name, index_name,
       GROUP_CONCAT(column_name ORDER BY seq_in_index SEPARATOR ',') AS indexed_columns,
       non_unique
FROM information_schema.statistics
WHERE table_schema = DATABASE()
  AND table_name IN ('tenant_invitations', 'tenants', 'users')
GROUP BY table_name, index_name, non_unique
ORDER BY table_name, index_name;
```

Expected non-primary secondary indexes: `tenant_id_idx`, `email_idx`, `expires_at_idx`, `idx_tenants_name`, `idx_tenants_status`, `idx_users_tenant_id`, `idx_users_is_active`, and `idx_users_phone_tenant`.

```sql
SELECT table_name, column_name, column_type, is_nullable, column_default, extra
FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND table_name IN ('tenant_invitations', 'tenants', 'users')
ORDER BY table_name, ordinal_position;
```

Compare this output to the three complete source definitions. In particular, preserve the two approved unique constraints and the approved `now()` timestamp defaults; do not add a foreign key or an extra index.

## 4. Basic table-read smoke check

The application is not configured to use `kinga_staging` as a deployed runtime target, so this D-01 check is limited to **database connectivity and read access** through the authenticated owner console. It is not an end-user application deployment test.

```sql
SELECT 'tenant_invitations' AS table_name, COUNT(*) AS row_count FROM tenant_invitations
UNION ALL
SELECT 'tenants', COUNT(*) FROM tenants
UNION ALL
SELECT 'users', COUNT(*) FROM users;
```

Expected: three rows, each with `row_count = 0`. No `INSERT` is authorised to test writes.

## 5. Evidence to send after the owner-operated run

Send screenshots or copied results for the following, without exposing credentials: current Backup record, active-database confirmation, zero-table preflight, the 11 successful statement results or a first failure, the three postflight metadata result sets, and the three-row empty-table smoke result. I will then reconcile the results against the pinned manifest and update the D-01 audit record.

## References

1. [Pinned D-01 Wave 1 SQL source](../../audit/gate-c-scratch-baseline/wave-01-generated/wave-01-identity-tenant-roots.sql)
2. [TiDB Cloud Starter or Essential Backup and Restore](https://docs.pingcap.com/tidbcloud/backup-and-restore-serverless/)
3. [TiDB Cloud SQL Editor](https://docs.pingcap.com/tidbcloud/explore-data-with-chat2query/)
