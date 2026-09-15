# NCU-01 Independent Postflight and Closure Record — 2026-09-15

## Closure decision

**NCU-01 is closed.** The owner reported successful local Claude Code execution of all four ordered, individually hash-verified statements. Independent authenticated TiDB Cloud SQL-editor postflight controls then reconciled the resulting staging state against the pinned NCU-01 source contract, four-statement ledger, and final read-only query packet. Every required control passed.

This record closes **only** the NCU-01 relationship-pair uniqueness transition. It is not authority for D-06, recovery, restore, cutover, deployment, data loading, account/grant changes, or production work.

## Authority and execution boundary

Tavonga Shoko accepted the NCU-01 sole operator/reviewer/application-validation-owner exception and separately authorized execution only of the four hash-pinned NCU-01 statements through the owner's local Claude Code environment. The exception was restricted to `KINGA-staging`, NCU-01, and the records linked below.

The sandbox did not submit DDL. It performed the independent postflight by authenticated, read-only `information_schema` and aggregate `COUNT(*)` controls only.

## Pinned transition and owner execution report

| Ordinal | Expected action | SHA-256 | Owner-reported result |
|---:|---|---|---|
| 001 | Drop `unique_assessor_tenant` from `assessor_insurer_relationships` | `3228ccf99192b5e284b243e09984bb42e76ec95347d6578f20c9a0d6ee333685` | Succeeded after immediate hash verification |
| 002 | Create `uq_assessor_insurer_relationship (assessor_id, tenant_id)` | `49cd35e35a020bf9ba979ff692ce3714fdc547b209351ac91e6631e16549ca43` | Succeeded after immediate hash verification |
| 003 | Create `uq_policy_claim_link (policy_id, claim_id)` | `1d79f04dde9f2eb73c78a8548379f3ccc936170f630ab8e15165795b2e8459b5` | Succeeded after immediate hash verification |
| 004 | Create `uq_fleet_driver_membership (fleet_id, user_id)` | `b25f7fdd7113236392caee8ee963fc1def3fe6786a83f120a961418e90b74246` | Succeeded after immediate hash verification |

The verified transition-source SHA-256 is `a8b8e8fda51a0830116d2516a7d017ee7401e3b35a72e7a7773e1689c10ab9be`. All four one-statement files match their ledger SQL and individual hashes. The verified ordered-file SHA-256 is `81f1cba9f009ea414edd06c3bb8fbaf34fc462d25e3a5f6063a6731aa6ab1ab5`.

## Independent authenticated read-only postflight

| Control | Pinned query SHA-256 | Independent result | Disposition |
|---|---|---|---|
| Final table inventory | `9b392e047ef0dcaedaf7d0ab65b0783d8fa1c3d2e5390689328938c5b466dab2` | Exact 188/188 table-set match; normalized export SHA-256 `36b26b9ee7dcbc0f1883f31db0a06840f5fd247cf8958f8e23f3d608c4bb52b5` | Pass |
| Final all-table row assertion | `1a3f0497749751a168cf6e6b1d13147e858ff8e7c9d9f162d303bb70c0f9be76` | `tables_checked=188`, `total_rows=0`, `minimum_rows=0`, `maximum_rows=0` | Pass |
| Target-table column metadata | `aeaac79f1dcec9ed1373a50abe42b639e601fba686128d919158f8c299590df0` | Exact 3/3 tables and 41/41 columns; zero structural mismatches | Pass |
| Target index state | `8f728bd281020137a6e6690d7d71a7b8eff15a62243f45b8433d219f14c9b451` | Old `unique_assessor_tenant` absent. All three expected unique indexes present with `non_unique=0` and exact ordered columns (6 index-column rows). | Pass |
| Duplicate-pair control | `3faaad3ba9ae21dd7b5c26215c408dd82692e5239de898c01911247781e04216` | Each of the three approved pair rules returned `duplicate_groups=0` and `rows_in_duplicate_groups=0`. | Pass |

The source-contract regression passed 3/3. The deterministic staging-packet and postflight-query generators both passed verification. The final local comparison scripts also passed after normalizing comparison ordering only; no source, ledger, statement, query, or live metadata mismatch was found.

## Final verified index definitions

| Table | Index | `non_unique` | Ordered columns |
|---|---|---:|---|
| `assessor_insurer_relationships` | `uq_assessor_insurer_relationship` | 0 | `assessor_id`, `tenant_id` |
| `policy_claim_links` | `uq_policy_claim_link` | 0 | `policy_id`, `claim_id` |
| `fleet_drivers` | `uq_fleet_driver_membership` | 0 | `fleet_id`, `user_id` |

`entity_relationships` was not part of the transition and remains unmodified. Its append-only fraud-signal observation model has no newly imposed composite unique constraint.

## Protected review state

The live NCU-01 staging state is source-aligned to the approved four-statement transition, but the associated repository review work remains intentionally unmerged. Source PR #91 and stacked packet/closure PR #92 remain open; this closure did not merge either PR or alter `main`. Any later merge decision remains under the protected GitHub review workflow.

## Exception expiry and retained boundary

The NCU-01 sole operator/reviewer/application-validation-owner exception **expires with this closure**. The exact 188-table staging baseline remains empty. No broader staging or production authority transfers from this closure.

## Evidence index

| Artefact | Purpose |
|---|---|
| [`statement-hash-ledger.json`](./statement-hash-ledger.json) | Canonical four-statement order, SQL, and individual hashes |
| [`source-contract.json`](./source-contract.json) | Approved three-index / one-removed-index source contract |
| [`read-only-preflight-evidence.md`](./read-only-preflight-evidence.md) | Fresh pre-execution recovery, baseline, structure, index, duplicate-pair, and grant evidence |
| [`postflight/query-hash-manifest.json`](./postflight/query-hash-manifest.json) | Final postflight query hashes |
| [`postflight-exports/`](./postflight-exports/) | Retained authenticated read-only metadata exports |
| [`owner-local-claude-code-execution-handoff.md`](./owner-local-claude-code-execution-handoff.md) | Owner-only execution instructions and stop conditions |
