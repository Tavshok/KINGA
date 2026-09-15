# Natural/Composite Unique Constraints — Disposable Scratch Proof

**Date:** 15 September 2026

**Scope:** Three owner-confirmed source-level unique constraints only
**Execution boundary:** Local loopback MySQL on `127.0.0.1:3317`; no staging or production connection

## Source decision implemented

The owner confirmed that `assessor_insurer_relationships.tenant_id` identifies the insurer tenant and `fleet_drivers.user_id` identifies the driver. The source change therefore makes only the following pair rules unique.

| Table | Unique index | Physical columns | Source action |
|---|---|---|---|
| `assessor_insurer_relationships` | `uq_assessor_insurer_relationship` | `assessor_id`, `tenant_id` | Replaces the misnamed non-unique `unique_assessor_tenant` index. |
| `policy_claim_links` | `uq_policy_claim_link` | `policy_id`, `claim_id` | Adds the approved pair rule. |
| `fleet_drivers` | `uq_fleet_driver_membership` | `fleet_id`, `user_id` | Adds the approved pair rule. |
| `entity_relationships` | None | Not applicable | Explicitly unchanged; it remains an append-only fraud-signal observation model. |

The deterministic source-derived transition contains four statements, including the replacement of the pre-existing assessor index. Its SHA-256 is `a8b8e8fda51a0830116d2516a7d017ee7401e3b35a72e7a7773e1689c10ab9be`.

The mandatory `pnpm drizzle-kit generate --name natural_composite_unique_constraints` command was invoked first. It stopped at an unrelated, pre-existing interactive `claim_comments` column-rename prompt before it emitted a migration. No response was selected because choosing `create` or `rename` would have introduced an unapproved historical migration-chain decision outside this three-constraint scope. The retained four-statement transition is therefore generated deterministically from the verified source declarations by `scripts/generate-natural-composite-unique-sql.mjs`; the script rejects any source mapping or scope drift before writing its SQL and manifest.

## Scratch replay results

Two separately named, initially empty loopback targets completed the same composed 188-table baseline replay and the four-statement uniqueness transition. The inputs were D-01 through D-05 source files, containing 709 executable baseline statements in total. The source identities and SHA-256 fingerprints are retained in each `scratch-replay.json` result.

| Replay | Database | Result | Post-replay table count | Unique-index metadata |
|---|---|---|---:|---|
| A | `kinga_natural_unique_20260915d` | Passed | 188 | All three indexes existed with `non_unique=0` and required ordered columns. |
| B | `kinga_natural_unique_20260915e` | Passed | 188 | All three indexes existed with `non_unique=0` and required ordered columns. |

The retained metadata verification for replay B observed these exact definitions:

| Table | Index | `non_unique` | Ordered columns |
|---|---|---:|---|
| `assessor_insurer_relationships` | `uq_assessor_insurer_relationship` | 0 | `assessor_id,tenant_id` |
| `policy_claim_links` | `uq_policy_claim_link` | 0 | `policy_id,claim_id` |
| `fleet_drivers` | `uq_fleet_driver_membership` | 0 | `fleet_id,user_id` |

Each duplicate insertion was rejected with MySQL `ER_DUP_ENTRY`. The proof separately confirmed valid relationships remain accepted: multiple assessors for one insurer, one assessor for multiple insurers, multiple policies for one claim, one policy for multiple claims, one driver across multiple fleets, and multiple drivers in one fleet. `entity_relationships` is outside the approved 188-table baseline, so the proof asserts it remains source-level unique-index-free rather than attempting to add or seed the held table.

Both scratch databases were dropped after their respective verification. Each removal was confirmed through `information_schema.schemata` before closure of the local proof.

The scratch runner was also invoked with a synthetic non-loopback `kinga_staging` URL. It rejected the target before connecting, creating a database, or creating evidence output. This verifies its explicit host guard rather than relying only on the operator’s selected command line.

## Controlled runner corrections

Two aborted local attempts were contained and removed before any baseline statement executed. The first correctly identified that the older D-01 source has 10 literal marker occurrences rather than three; the second identified that it contains 11 executable fragments because its final index block is compacted after the third marker. The runner was corrected to separately validate marker counts and executable-fragment counts, consistent with the approved source framing. No staging, production, source metadata, or data action occurred during these corrections.

The next local run reached the completed 188-table baseline and all three approved unique-index definitions, then stopped before final evidence because it attempted to insert `entity_relationships`. That table is intentionally not in the 188-table baseline, so the unsupported test was removed rather than expanding scope. The scratch target was confirmed to contain 188 tables and six expected index-metadata rows before it was dropped. The two final replays then passed independently.

## Boundary preserved

This is source and loopback scratch evidence only. It neither authorizes nor performs any staging duplicate-data preflight, staging DDL, production DDL, data load, grant/account change, network change, recovery/cutover, or deployment. Any staging application requires a distinct later approval and a fresh read-only duplicate-pair preflight against the then-current staging data.
