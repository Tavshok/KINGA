# KINGA Staging TiDB — Read-Only Connection and Schema Verification

**Date:** 10 September 2026
**Environment:** `kinga_staging` only
**Scope:** TLS connectivity, effective account/grants, metadata-only schema visibility, and static comparison with checked-in Drizzle definitions. No application record, schema object, migration, production connection, or current managed `DATABASE_URL` was changed.

## Verified connection state

| Control | Verified result |
|---|---|
| Database selected by the staging connection | `kinga_staging` |
| Server | TiDB Serverless `8.0.11-TiDB-v8.5.3-serverless` |
| Transport | TLS; negotiated cipher `TLS_AES_128_GCM_SHA256` |
| Account | Dedicated `kinga_verify` account, not root |
| Privilege gate | The read-only smoke test verified `SELECT` and rejected broad/write grants (`INSERT`, `UPDATE`, `DELETE`, `CREATE`, `ALTER`, `DROP`, `GRANT OPTION`, and `ALL PRIVILEGES`) |
| Smoke-test result | 3/3 checks passed |

## Schema compatibility finding

The selected `kinga_staging` database contains **zero visible application tables**. The current KINGA source defines **221 distinct MySQL table names** across the checked-in `drizzle/` schema files.

> This is an expected empty-environment state, not a failed connection. It does mean that KINGA cannot yet run against this staging database: application startup/query paths require database objects that do not exist in `kinga_staging`.

The gap is a **schema bootstrap/reconciliation decision**, not a reason to run an unreviewed migration. Before any DDL, the project needs an explicit approved plan that reconciles the checked-in schema, existing migration coverage, and the earlier schema-drift documentation. Data movement must remain a separately approved stage after schema validation.

## Safe next decision

Choose one of the following deliberately:

1. **Schema-readiness planning only:** generate a migration/reconciliation plan, expected-table inventory and rollback/restore procedure without applying DDL.
2. **Approved staging bootstrap:** after reviewing the plan, create a temporary staging migration account, apply only the approved schema sequence to `kinga_staging`, and then run structural verification. This requires explicit approval because it changes the new staging database.
3. **No bootstrap yet:** retain the verified staging connectivity and read-only account while infrastructure/ownership decisions continue.

Production remains untouched under all three options.
