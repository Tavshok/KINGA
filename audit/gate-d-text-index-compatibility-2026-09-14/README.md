# D-04 Whole-TEXT Index Compatibility Reconciliation

## Purpose and frozen execution boundary

This record addresses the D-04 stop at historical ledger ordinal 99: `CREATE INDEX idx_recipients ON governance_notifications (recipients)`. The owner reports that ordinals 1–98 completed with per-statement hash verification; those accepted statements are outside this correction and **must not be rerun**. No subsequent D-04 statement is authorised until a revised resumption ledger is independently verified and a fresh preflight is completed.

## Root cause: Gate B repair was not propagated to canonical source metadata

The index is the **same index**, not a coincidentally named different object. Gate B commit `d922c9b7` deliberately removed its historical migration statement only inside `scripts/gate-b-immutable-overlay-replay.mjs`. That overlay replaced the historical statement with the explicit rationale:

> `-- Gate B overlay: recipients is JSON text and has no SQL filter consumer; omit its whole-TEXT index.`

Gate B was an immutable migration-chain repair. It neither rewrote historical migration SQL nor removed `index("idx_recipients").on(table.recipients)` from canonical `drizzle/schema.ts`. Wave 4 was subsequently selected from a fresh full-schema source snapshot by `scripts/generate-gate-c-wave-four-sql.mjs`, which selects every `CREATE INDEX` targeting a Wave 4 table. It therefore reintroduced the still-declared index into the historical Wave 4 source and then the original D-04 ledger.

This is a **source-reconciliation propagation omission**, not a failed Gate B execution or a different index. The corrective action is to remove the no-consumer whole-TEXT index declaration from canonical metadata, while preserving both the historical Gate C source and Gate B overlay as immutable evidence.

## Current consumer trace and disposition

The current runtime trace finds `governance_notifications.recipients` parsed as JSON only *after* a notification row is selected. The database predicates and ordering use `tenant_id`, `read_at`, `id`, and `created_at`; no current runtime query filters, joins, sorts, or performs lookup against `recipients`. The earlier Gate B disposition therefore remains applicable.

The correct reconciliation is **exclusion**, not a `recipients(191)` prefix. A prefix index would create a new performance contract for a JSON-encoded recipient list despite the absence of a SQL consumer, and would supersede the reviewed Gate B rationale without supporting evidence.

## Systemic inventory

The source-level scan inspected every `CREATE INDEX` in revised Waves 4 and 5, resolved every indexed column against its `CREATE TABLE` type, and flagged only unprefixed `TEXT`/`BLOB` columns. Before this correction, the only result was `governance_notifications.recipients -> idx_recipients` in Wave 4. Wave 5 had none. After removal, neither revised execution source contains an indexed `TEXT`/`BLOB` column without a prefix.

| Revised source | Unprefixed indexed TEXT/BLOB columns after reconciliation |
|---|---:|
| Wave 4 | 0 |
| Wave 5 | 0 |

## Required regenerated artefacts

The revised D-04 source will contain 40 `CREATE TABLE` statements, 7 foreign keys, and **87** explicit indexes: 134 executable statements in total. A comparator must prove that historical ordinals 1–98 are byte-identical, that only historical ordinal 99 is removed, and that historical ordinals 100–135 are byte-identical pending statements. The resumption ledger must preserve historical ordinals and emit only 100–135, so the owner cannot accidentally resend the stopped index statement.

## Assurance boundary

This source and evidence correction is repository-only. It creates no database connection and makes no schema, data, grant, network, backup, restore, deployment, or production change. A later execution decision must use the revised source and resumption ledger, verify their new hashes, obtain fresh recovery and baseline evidence, and resume only at historical ordinal 100.
