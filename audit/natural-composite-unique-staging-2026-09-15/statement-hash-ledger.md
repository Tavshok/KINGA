# Natural/Composite Unique Constraints — Staging Statement Hash Ledger

This ledger is deterministically derived from the approved source declarations and the scratch-proven transition SQL. It is review material only and grants no execution authority.

| Control | Value |
|---|---|
| Source schema SHA-256 | `4627f2cfd6e6cceeee785c905a7517bc18aafdeeee01dfaf0cfd973b626e859c` |
| Transition-source SHA-256 | `a8b8e8fda51a0830116d2516a7d017ee7401e3b35a72e7a7773e1689c10ab9be` |
| Statements | 4: one `DROP INDEX`, three `CREATE UNIQUE INDEX` |
| Ordered statement-file SHA-256 | `81f1cba9f009ea414edd06c3bb8fbaf34fc462d25e3a5f6063a6731aa6ab1ab5` |
| Required staging baseline | 188 tables, inventory SHA-256 `36b26b9ee7dcbc0f1883f31db0a06840f5fd247cf8958f8e23f3d608c4bb52b5` |

> Do not submit the raw transition through `mysql < file.sql`. The owner-authorised local Claude Code route must hash-verify and execute only the one-statement files in ordinal order. A server or tool error is a stop-and-report event, never a blind retry.

## Ordered execution ledger

| # | Statement class | Table | Index | SHA-256 of exact SQL |
|---:|---|---|---|---|
| 1 | DROP INDEX | `assessor_insurer_relationships` | `unique_assessor_tenant` | `3228ccf99192b5e284b243e09984bb42e76ec95347d6578f20c9a0d6ee333685` |
| 2 | CREATE UNIQUE INDEX | `assessor_insurer_relationships` | `uq_assessor_insurer_relationship` | `49cd35e35a020bf9ba979ff692ce3714fdc547b209351ac91e6631e16549ca43` |
| 3 | CREATE UNIQUE INDEX | `policy_claim_links` | `uq_policy_claim_link` | `1d79f04dde9f2eb73c78a8548379f3ccc936170f630ab8e15165795b2e8459b5` |
| 4 | CREATE UNIQUE INDEX | `fleet_drivers` | `uq_fleet_driver_membership` | `b25f7fdd7113236392caee8ee963fc1def3fe6786a83f120a961418e90b74246` |

## Reproducibility

```bash
node scripts/generate-natural-composite-unique-staging-packet.mjs verify
```
