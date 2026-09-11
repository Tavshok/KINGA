# Gate C Wave 1 Scratch-Replay Evidence

## Scope

This package proves the **identity and tenant-root baseline wave** in disposable local databases only. It does not create or alter an object in `kinga_staging`, production, or any external service. The retained evidence contains DDL metadata, constraint/index metadata, and checksums only; it contains no application rows, credentials, or connection string.

## Approved source reconciliation

The review branch updates only the reviewed Wave 1 source contract in `drizzle/schema.ts`:

| Object | Approved source contract |
|---|---|
| `tenants.id` | Primary key |
| `tenant_invitations.id` | Primary key |
| `users.openId` | Unique constraint required by the current duplicate-key user upsert path |
| `tenant_invitations.token` | Unique constraint required by invitation-token identity |
| `tenants.name` | One retained non-unique index: `idx_tenants_name`; the physically duplicate `name` index was removed |
| Four Wave 1 timestamp fields | `.defaultNow()` so generated SQL uses functional `DEFAULT (now())`, not quoted string defaults |

The reviewed source export contains only `users`, `tenants`, and `tenant_invitations`. The generated SQL is retained at `../wave-01-generated/wave-01-identity-tenant-roots.sql` and has SHA-256 `306797ab94529860bc9e88a69a955061916a94ddc3d08e3265229780ab08083c`.

## SQL review boundary

The generated migration contains exactly three `CREATE TABLE` statements and eight required `CREATE INDEX` statements. It contains no `DROP`, `ALTER`, `INSERT`, `UPDATE`, `DELETE`, external connection detail, unexpected table, or foreign key. Wave 1 has no configured source foreign-key dependency; none was inferred or invented.

## Guarded replay controls

`scripts/gate-c-wave-one-replay.mjs` rejects a target unless it is an explicitly supplied `mysql://` URL with a loopback host and a fresh database name matching `kinga_gatec_*`. It does not read `DATABASE_URL` or `KINGA_STAGING_DATABASE_URL`. It rejects non-`CREATE` SQL and a SQL file that does not contain exactly the three reviewed tables.

The focused source-contract and runner-guard suite passed **6/6** tests. Two independent clean runs then created and removed uniquely named local scratch databases on loopback port `3317`.

| Clean run | Statement count | Created table set | SQL SHA-256 | Structural metadata SHA-256 | Disposal |
|---|---:|---|---|---|---|
| `wave1_a_20260911T113449Z_28269` | 11 | `tenant_invitations`, `tenants`, `users` | `306797ab94529860bc9e88a69a955061916a94ddc3d08e3265229780ab08083c` | `e4d52b9f4ed2de6ffd00c6a184fdef807d8450b64edd1d1b604c08be06dc2a50` | Verified removed |
| `wave1_b_20260911T113450Z_25003` | 11 | `tenant_invitations`, `tenants`, `users` | `306797ab94529860bc9e88a69a955061916a94ddc3d08e3265229780ab08083c` | `e4d52b9f4ed2de6ffd00c6a184fdef807d8450b64edd1d1b604c08be06dc2a50` | Verified removed |

The structural fingerprint intentionally excludes the unique scratch database name and includes only tables, constraints, and indexes. The equal fingerprints prove the same reviewed structure was produced on both empty targets.

## Per-run artefacts

Each clean-run directory contains:

| File | Contents |
|---|---|
| `replay.json` | Scope, loopback target identity, statement count, source-SQL checksum, structural checksum, table set, and pass status |
| `metadata.json` | `information_schema` table, constraint, and index metadata only |
| `sql.sha256` | Checksum binding the replay to the reviewed generated SQL |

## Status and next boundary

Wave 1 is **proven in local scratch only**. It is not a staging migration and must not be applied to `kinga_staging` or production. Wave 2 must not begin until this evidence is reviewed and the held-table decisions remain explicit. Gate D—staging access/DDL—remains outside authorisation.
