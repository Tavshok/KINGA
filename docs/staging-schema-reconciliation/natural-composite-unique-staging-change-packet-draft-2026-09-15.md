# Natural/Composite Unique Constraints — Staging Change Packet

## Status and authority boundary

**Status: review-only packet. No execution authority has been granted.** This packet contains exactly one narrow staging transition: replace the non-unique assessor/insurer pair index and add two approved relationship-pair unique indexes. It authorizes no database action by itself.

> No statement may be sent to `kinga_staging` until the KINGA owner records a named operator, reviewer, application-validation owner, change approver, and stop authority; explicitly records any narrow sole-operator/reviewer/application-validation-owner exception; accepts fresh immediate preflight evidence; and grants a separate execution decision. The D-05 exception expired at D-05 closure and does not transfer.

No source merge, staging DDL/DML, account/grant change, network modification, backup/restore, recovery/cutover, deployment, or production activity is within this packet-preparation scope.

## 1. Packet identity

| Field | Review value | Execution status |
|---|---|---|
| Packet ID | `NCU-01` | Review-only; needs separate execution authority. |
| Purpose | Enforce one row per assessor/insurer, policy/claim, and fleet/driver pair. | Limited to the four pinned statements in Section 3. |
| Target | `KINGA-staging`, database `kinga_staging`, TiDB Cloud Starter | Fresh authenticated target/TLS identity is mandatory before execution. |
| Prerequisite | Closed D-01–D-05 staging baseline: 188 tables, 67 FKs, 454 source-explicit indexes, 220 primary/unique structures, zero rows. | Every part must be freshly rechecked. |
| Operator | Unassigned | Owner must name before execution. |
| Reviewer | Unassigned | Independent review is default; any exception must be explicit and expire at NCU-01 closure. |
| Application-validation owner | Unassigned | Owner must name before execution and record postflight validation. |
| Change approver and stop authority | KINGA owner | Retains authority to approve, stop, or abandon this change. |
| Production | `KINGA-production` | Explicitly excluded. |

## 2. Source and evidence pins

The approved source branch is [PR #91](https://github.com/Tavshok/KINGA/pull/91), stacked on the final D-05 review branch. Its GitHub head is `df7e56f852bfc8cae1f75bbcf2541af436e8d5ea`; the locally verified source tree is byte-identical and recorded in the source contract. The packet derives every transition artifact from the approved source declaration; it does not infer a constraint from business wording alone.

| Control | Pinned value | Required conclusion |
|---|---|---|
| Source schema | `drizzle/schema.ts` SHA-256 `4627f2cfd6e6cceeee785c905a7517bc18aafdeeee01dfaf0cfd973b626e859c` | It contains only the three approved `uniqueIndex` declarations and leaves `entity_relationships` without a secondary unique index. |
| Transition source | `audit/natural-composite-unique-2026-09-15/natural-composite-unique-constraints.sql` | SHA-256 `a8b8e8fda51a0830116d2516a7d017ee7401e3b35a72e7a7773e1689c10ab9be`; exactly four statements. |
| Canonical ledger | `audit/natural-composite-unique-staging-2026-09-15/statement-hash-ledger.json` | Four ordered statements with individual hashes. |
| Human-readable ledger | `audit/natural-composite-unique-staging-2026-09-15/statement-hash-ledger.md` | Review copy of statement identity, order, and hashes. |
| One-statement files | `audit/natural-composite-unique-staging-2026-09-15/statements/` | Exactly four files, one statement each; ordered-file SHA-256 `81f1cba9f009ea414edd06c3bb8fbaf34fc462d25e3a5f6063a6731aa6ab1ab5`. |
| Source contract | `audit/natural-composite-unique-staging-2026-09-15/source-contract.json` | Baseline source hashes, final 188-table inventory pin, required pre/postflight index definitions, and query hashes. |
| Scratch proof | `audit/natural-composite-unique-2026-09-15/scratch-proof-evidence.md` | Two independently named loopback replays passed; both were disposed. |
| Deterministic packet generator | `scripts/generate-natural-composite-unique-staging-packet.mjs` | Repository-only generation/verification; it opens no database connection. |

Any hash, statement text, ordinal, file-content, source-schema, query, or expected-state mismatch is a mandatory stop. An operator must not regenerate, edit, or substitute any artifact during a change window.

## 3. Approved statement scope

The complete scope is four DDL statements. It contains **one** `DROP INDEX` and **three** `CREATE UNIQUE INDEX` statements; no table, column, foreign key, data row, account, grant, backup, restore, deployment, recovery, or production object is changed.

| Ordinal | Exact action | Target | SHA-256 |
|---:|---|---|---|
| 1 | Drop prior non-unique relationship-pair index | `assessor_insurer_relationships.unique_assessor_tenant` | `3228ccf99192b5e284b243e09984bb42e76ec95347d6578f20c9a0d6ee333685` |
| 2 | Create unique assessor/insurer pair index | `assessor_insurer_relationships (assessor_id, tenant_id)` | `49cd35e35a020bf9ba979ff692ce3714fdc547b209351ac91e6631e16549ca43` |
| 3 | Create unique policy/claim pair index | `policy_claim_links (policy_id, claim_id)` | `1d79f04dde9f2eb73c78a8548379f3ccc936170f630ab8e15165795b2e8459b5` |
| 4 | Create unique fleet/driver pair index | `fleet_drivers (fleet_id, user_id)` | `b25f7fdd7113236392caee8ee963fc1def3fe6786a83f120a961418e90b74246` |

`assessor_insurer_relationships.tenant_id` is the approved insurer identity; `fleet_drivers.user_id` is the approved driver identity. `entity_relationships` is deliberately unchanged because repeated pairings are append-only fraud-signal observations rather than duplicates.

### 3A. Atomicity and partial-state control

Each DDL statement auto-commits independently. In particular, after ordinal 1 succeeds and before ordinal 2 succeeds, the old non-unique index has been removed. This is an accepted, explicitly observable intermediate state only when execution proceeds one hash-verified statement at a time.

If any tool, permission, server, hash, or metadata error occurs, **stop immediately**. Do not modify a statement, do not rerun it blindly, and do not continue to a later ordinal. Record the accepted ordinal, exact error, current index state, and row-state result; then await a separate owner decision. This packet provides no recovery authority.

## 4. Required fresh recovery and access evidence

Before execution, authenticated read-only TiDB Cloud Backup-page inspection must show a successful **same-day** `KINGA-staging` snapshot with exact UTC creation/expiry. The owner-approved window must end at least two hours before snapshot expiry. Starter’s one-day retention remains accepted for this narrow staging change only and remains insufficient for production.

The exact runner principal must be rechecked using:

```sql
SHOW GRANTS FOR '289ZyKGJwbC2SkB.d01_runner'@'%';
```

The source-derived minimum is `SELECT, INDEX ON kinga_staging.*`, plus global `USAGE`; the retained runner may have the broader closed-wave staging set `SELECT, CREATE, REFERENCES, ALTER, INDEX`, which must be recorded but not modified. A missing required privilege or unapproved new excess is a stop. This packet does not authorize account or grant alteration.

## 5. Required immediate preflight

All five generated read-only query files are under `audit/natural-composite-unique-staging-2026-09-15/preflight/`. An operator must verify each file SHA-256 against `query-hash-manifest.json` before loading it into the authenticated SQL editor. The query files must not be altered in transit.

| Check | Required accepted result | Stop condition |
|---|---|---|
| Target and recovery identity | Correct authenticated `KINGA-staging` / `kinga_staging`, TLS, same-day successful snapshot, sufficient window margin. | Target ambiguity, stale/failed snapshot, no margin, or absent authority. |
| 188-table baseline inventory | Exact sorted table set, 188 rows, SHA-256 `36b26b9ee7dcbc0f1883f31db0a06840f5fd247cf8958f8e23f3d608c4bb52b5`. | Any missing/extra table or inventory mismatch. |
| Baseline rows | `tables_checked=188`, `total_rows=0`, `minimum_rows=0`, `maximum_rows=0`. | Any nonzero result or SQL error. |
| Target table structure | The three target tables exist and their read-only column metadata is retained. | Missing/extra column or unexpected target table state. |
| Current index state | `unique_assessor_tenant` exists on `(assessor_id,tenant_id)` as non-unique; all three proposed `uq_*` indexes are absent. | Old index absent, any planned index present, wrong ordered columns, or any unexpected partial state. |
| Duplicate-pair check | Three returned rows; every `duplicate_groups=0` and `rows_in_duplicate_groups=0`. | Any duplicate pair or query error. |
| Artifact integrity | Source, transition, ledger, individual files, ordered-file hash, packet query hashes, and source contract all match Section 2. | Any integrity mismatch. |
| Roles and authority | Named operator, reviewer, application-validation owner, approver, and stop authority; any sole-role exception is explicit, scope-bounded, and expires at closure. | Missing role, scope, expiry, or distinct execution decision. |

## 6. Permitted execution route

Only after all preflight controls pass and the owner grants execution authority, the named owner-operated local **Claude Code** route may execute the four files below in order. Before each statement, it must calculate the file SHA-256 and compare it with Section 3. It must record outcome before proceeding.

```text
001-unique_assessor_tenant.sql
002-uq_assessor_insurer_relationship.sql
003-uq_policy_claim_link.sql
004-uq_fleet_driver_membership.sql
```

Raw-source submission, `mysql < file`, whole-file execution, statement rewriting, and blind batch retry are prohibited. Batch sizing is not applicable: execution is one statement at a time only.

## 7. Required postflight and closure

The assigned reviewer must independently collect fresh read-only results and compare them with the source contract.

| Postflight control | Required accepted result |
|---|---|
| Baseline inventory and rows | The same exact 188-table inventory and all-zero row assertion remain true. |
| Index state | `unique_assessor_tenant` is absent. Exactly the three new `uq_*` indexes exist, each `non_unique=0` with its exact ordered columns. |
| Structural preservation | Target-table column metadata remains unchanged from the retained preflight export. |
| Duplicate-pair state | The three duplicate checks still return zero groups and zero rows in duplicate groups. |
| Application validation | The named validation owner records a non-mutating connectivity/read validation for the three target tables or formally records why it cannot be performed. |
| Closure evidence | Ledger outcomes, file hashes, live query exports, source-to-live comparison, and role-exception expiry are committed to protected review history. |

Formal closure requires a distinct owner decision. Completion does not authorize recovery/cutover, data loading, deployment, source merge, production work, or any further schema change.

## References

[1]: ../../audit/natural-composite-unique-2026-09-15/scratch-proof-evidence.md "Natural/composite unique constraints scratch proof"
[2]: ../../audit/natural-composite-unique-staging-2026-09-15/source-contract.json "Source contract and expected staging state"
[3]: ../../audit/natural-composite-unique-staging-2026-09-15/statement-hash-ledger.json "Canonical four-statement ledger"
[4]: ../../audit/gate-d-final-staging-schema-reconciliation-closure-2026-09-15.md "Final Gate D staging schema closure"
