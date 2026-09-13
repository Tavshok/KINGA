# Gate D — D-02 Independent Postflight Reconciliation

**Status:** **Read-only reconciliation passed; D-02 is eligible for formal closure.** This record does not create authority for D-03, recovery/cutover, deployment, or production activity.

## Scope and assurance boundary

This is an independent, authenticated, **read-only** review of the owner-reported D-02 outcome against the approved packet, immutable source artefacts, and source-derived ledger. No schema object, data row, account, grant, network setting, snapshot, restore, deployment setting, or production target was changed during this review.

The review independently establishes the **final staging metadata and empty-table state**. It does not independently attest the owner-reported statement-by-statement hash checks, execution order, or the two grant stops. Those execution details remain owner-reported; the verified final state is consistent with the claimed 87-statement ledger outcome.

## Immutable evidence inputs

| Artefact | Verified value or use |
|---|---|
| [Wave 1 source SQL](../audit/gate-c-scratch-baseline/wave-01-generated/wave-01-identity-tenant-roots.sql) | D-01 prerequisite schema reference. |
| [Wave 2 source SQL](../audit/gate-c-scratch-baseline/wave-02-generated/wave-02-vehicle-claim-core.sql) | SHA-256 `15661c69490a4360931ef5fc3d17e2b4521f692730b2d113f1342117b067e7b9`; source remained unchanged. |
| [Canonical D-02 ledger](../audit/gate-d-d02-statement-hash-ledger-2026-09-12.json) | SHA-256 `5aaf71afb185a2f478d9fce6af4becf587771547cb94ead3cbb021c92aea85a4`; deterministic verifier passed: 86 markers and 87 statements. |
| Approved D-02 packet | [Change packet](../docs/staging-schema-reconciliation/gate-d-wave-02-staging-change-packet-draft-2026-09-12.md), including the D-02-only sole-operator exception and closure rule. |

## Authenticated read-only TiDB evidence

The authenticated console target was `KINGA-staging` / `kinga_staging`. The Backup page displayed a successful snapshot at `2026-09-13 03:01:00 UTC±00:00` with expiry at `2026-09-14 03:01:00 UTC±00:00`; this is a historical observation, **not** a claim that a recovery point remains valid now.

| Check | Read-only evidence | Verified result |
|---|---|---|
| Table inventory | `information_schema.tables` base-table inventory | Exact 23-name set: 3 D-01 plus 20 D-02 tables; no source-set difference. |
| Column structures | Complete bounded `information_schema.columns` exports | 23 expected/live tables; 586 expected/live columns; no mismatch in ordinal, name, type, nullability, explicit default, auto-increment, or `ON UPDATE CURRENT_TIMESTAMP`. |
| Foreign keys | `key_column_usage` plus `referential_constraints` | Exactly 9; all names, child/parent tables, columns, and update/delete actions match source, including `fk_vgm_vehicle_model` with `NO ACTION` / `NO ACTION`. |
| Explicit indexes | `information_schema.statistics` exports | All 58 source-explicit indexes present, with all 69 expected indexed-column rows in the correct order. |
| Primary/unique keys | `information_schema.statistics` primary/unique export | All 33 source-declared keyed-column rows present; no missing or unexpected primary/unique definition. |
| D-01 rows | `COUNT(*)` over `tenant_invitations`, `tenants`, `users` | `0`, `0`, `0`. |
| D-02 rows | Two unions of 10 fully qualified `COUNT(*)` queries | All 20 D-02 tables returned `0`. |

## Deterministic local verification

| Verifier | Result |
|---|---|
| `generate-d02-statement-ledger.mjs verify` | **PASS** — expected immutable source hash and 87-statement ledger. |
| `verify-d02-postflight-columns.mjs` | **PASS** — 23 tables, 586 columns, no mismatch. |
| `verify-d02-postflight-explicit-indexes.mjs` | **PASS** — 58 explicit indexes, 69 index-column rows, no missing definition. |
| `verify-d02-postflight-primary-unique-keys.mjs` | **PASS** — 33 keyed-column rows, no missing or unexpected definition. |

## Independent conclusion

The final staging state exactly matches the pinned D-01 plus D-02 source-derived schema: **23 tables, 586 columns, 9 foreign keys, 58 explicit indexes, all declared primary/unique key structures, and zero rows in every table**. No unexpected source-to-live schema mismatch was found. On this evidence, D-02 is eligible for formal closure.

> The D-02-only exception allowing Tavonga Shoko to act as operator, reviewer, application-validation owner, and observer expires with closure. It created no independent assurance and does not carry to D-03 through D-06, recovery/cutover, deployment, or production.

## Runner-account lifecycle finding

The requested exact-principal inspection does not support the premise that `d01_runner` remains available with cumulative D-01/D-02 privileges. `SHOW GRANTS FOR 'd01_runner'@'%'` returned no such host-qualified principal, and `SELECT User, Host FROM mysql.user WHERE User='d01_runner'` returned an empty set. Therefore there is **no currently defined `d01_runner` account to retain, reuse, or drop**. No account or grant change was made, and no differently named historical runner was inferred.

If a D-03 execution identity is later authorised, create or designate it through a separate least-privilege decision rather than assuming this absent account can be reused.

## References

1. [Immutable Wave 1 source SQL](../audit/gate-c-scratch-baseline/wave-01-generated/wave-01-identity-tenant-roots.sql)
2. [Immutable Wave 2 source SQL](../audit/gate-c-scratch-baseline/wave-02-generated/wave-02-vehicle-claim-core.sql)
3. [D-02 canonical 87-statement hash ledger](../audit/gate-d-d02-statement-hash-ledger-2026-09-12.json)
4. [Approved D-02 change packet](../docs/staging-schema-reconciliation/gate-d-wave-02-staging-change-packet-draft-2026-09-12.md)
