# Gate D D-01 Owner-Executed Postflight Reconciliation

**Verification timestamp:** 12 September 2026, 20:59:42 UTC
**Environment:** `KINGA-staging` only, database `kinga_staging`
**Verification method:** Authenticated TiDB Cloud SQL Editor; read-only catalogue, `SHOW CREATE TABLE`, and `COUNT(*)` queries only
**Production:** Not opened, queried, or changed

## Conclusion

> **D-01 is closed as passed.** The independently observed staging state exactly contains the three approved Wave 1 tables—`tenant_invitations`, `tenants`, and `users`—with the approved explicit primary, unique, and secondary-index structures and with zero rows in each table. No extra Wave 1 table or explicit index was observed.

The owner executed the approved artefact using a local MySQL client after the previously documented TiDB Cloud browser-editor and dynamic-sandbox-egress routes were abandoned. The source file remains byte-identical to the approved pin. The initial local-client invocation stopped after the first table because repository `--> statement-breakpoint` markers are not executable MySQL comments; TiDB DDL is statement-autocommitting, making that partial state observable rather than ambiguous. The owner then used a cleaned temporary execution copy containing only the **remaining, not-yet-applied** approved statements. The committed source artefact was not edited.

This record independently verifies the final metadata and empty-table read state. It does not claim direct observation of the owner’s local shell history or temporary execution file; those execution-sequence details are owner-reported and are reconciled here against the immutable source pin and final server metadata.

## Approved source integrity

The retained source file was recalculated locally after execution and still has the approved SHA-256:

`306797ab94529860bc9e88a69a955061916a94ddc3d08e3265229780ab08083c`

| Source control | Expected | Independently rechecked result |
|---|---:|---:|
| `CREATE TABLE` statements | 3 | 3 |
| Explicit `CREATE INDEX` statements | 8 | 8 |
| Repository statement-breakpoint markers | 3 | 3 |
| Prohibited DDL/DML/account verbs in source | 0 | 0 |
| Permitted table set | `tenant_invitations`, `tenants`, `users` | Unchanged |

The source’s three `--> statement-breakpoint` lines are repository-tooling separators rather than executable SQL. They are the documented cause of the initial local-client parse interruption; they did not alter the source hash or add an unapproved operation. The statement sequence and the approved source contract are retained in the pinned Wave 1 artefact.[1]

## Independent read-only staging observations

The metadata catalogue inventory returned exactly three base tables in `kinga_staging` and no other table: `tenant_invitations` with 10 columns, `tenants` with 26 columns, and `users` with 30 columns. The three `SHOW CREATE TABLE` results were compared against the complete pinned definitions.

| Table | Columns | Primary / unique structures verified | Explicit secondary indexes verified | Result |
|---|---:|---|---|---|
| `tenant_invitations` | 10 | `PRIMARY (id)`; `tenant_invitations_token_unique (token)` | `tenant_id_idx (tenant_id)`; `email_idx (email)`; `expires_at_idx (expires_at)` | Matches |
| `tenants` | 26 | `PRIMARY (id)` | `idx_tenants_name (name)`; `idx_tenants_status (status)` | Matches |
| `users` | 30 | `PRIMARY (id)`; `users_openId_unique (openId)` | `idx_users_tenant_id (tenant_id)`; `idx_users_is_active (is_active)`; `idx_users_phone_tenant (phone_number, tenant_id)` | Matches |

The final state therefore contains eight explicit secondary-index statements plus five primary/unique index structures, for **13 index structures** in total. No foreign key is present or expected in D-01. Each approved timestamp default is rendered by TiDB as `CURRENT_TIMESTAMP`, the engine-normalized equivalent of the approved source `DEFAULT (now())` form.

The local scratch metadata capture records automatic named `CHECK` entries for the `tenants.config_json` and `users.secondary_roles` JSON columns. The pinned D-01 source does not issue explicit named `CHECK` statements for these columns, and TiDB’s `SHOW CREATE TABLE` renders them as native `json` columns without named checks. This is a MariaDB-versus-TiDB metadata-presentation difference, not a missing approved D-01 statement or an additional staging object.[2]

## Empty-table smoke verification

The authenticated owner-console read checks completed successfully and returned zero rows in every D-01 table.

| Read-only query target | Expected rows | Observed rows | Result |
|---|---:|---:|---|
| `kinga_staging.tenant_invitations` | 0 | 0 | Passed |
| `kinga_staging.tenants` | 0 | 0 | Passed |
| `kinga_staging.users` | 0 | 0 | Passed |

This is the D-01 basic database-connectivity/read smoke check. `KINGA-staging` is not a deployed application runtime target, so no end-user application deployment test is implied or claimed.[3]

## Closure decision and retained boundaries

D-01 is complete. It created only the permitted empty identity/tenant-root tables and eight explicit secondary indexes. No data seeding, foreign key, unapproved index, account/grant, backup/restore, network configuration, later-wave table, or production operation is included in this closure.

The earlier browser-editor, sandbox direct-client, temporary-account, and temporary-network attempts are superseded by this owner-operated result. They remain historical audit evidence only; their temporary accounts, temporary network rules, and temporary credential material were already removed before the owner’s stable local-client execution.

No authority is created for D-02 or later waves. Any later staging wave requires its own reviewed packet, fresh same-day recovery evidence, target preflight, explicit execution authority, and independent postflight record. Production remains out of scope pending an Essential or Dedicated TiDB service class with real PITR and a separately approved production plan.

## References

[1]: ../gate-c-scratch-baseline/wave-01-generated/wave-01-identity-tenant-roots.sql "Pinned Wave 1 source SQL"
[2]: ../gate-c-scratch-baseline/wave-01-evidence/wave1_a_20260911T113449Z_28269/metadata.json "Wave 1 local scratch structural metadata"
[3]: ../docs/staging-schema-reconciliation/d01-owner-console-execution-runbook-2026-09-12.md "D-01 owner-console execution runbook"
