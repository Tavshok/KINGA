# Gate D — D-05 Staging Change Packet: Wave 5 Intelligence, Learning, Analytics, Governance, and Optimisation

## Status and hard authority boundary

**Status: review-only packet. No D-05 execution authority has been granted.** This final Gate D wave adds the approved intelligence, learning, analytics, governance, and optimisation schema baseline after closed D-01–D-04. It authorises no DDL or DML, data seed, account or grant change, network modification, backup or restore action, application deployment, recovery/cutover work, or production activity.

> **No D-05 statement may be sent until a distinct owner decision assigns D-05 roles, establishes any D-05-only control exception, and accepts a fresh immediate preflight.** All D-01 through D-04 exceptions have expired and do not transfer to this packet.

## 1. Packet identity

| Field | Review value | Execution status |
|---|---|---|
| Packet ID | `D-05` | Review-only; no execution authority. |
| Purpose | Add the approved final Wave 5 intelligence, learning, analytics, governance, and optimisation baseline after closed D-01–D-04. | Requires a distinct future execution decision. |
| Target | `KINGA-staging`, database `kinga_staging`, TiDB Cloud Starter | Target identity, TLS, current recovery evidence, and grants must be rechecked before any future statement. |
| Prerequisite | Closed D-01–D-04 baseline: 113 tables, 42 foreign-key definitions, 264 explicit `CREATE INDEX` structures, and zero rows. | Must be revalidated immediately before any D-05 execution. |
| Operator | Unassigned | A named operator and D-05-only exception, if required, need separate approval. |
| Reviewer | Unassigned | Independent review remains the default; any D-05-only sole-reviewer exception must be explicit and time-bounded. |
| Application-validation owner and observer | Unassigned | Any authorised non-production smoke evidence remains mandatory before closure. |
| Change approver and stop authority | KINGA owner | Retains decision and stop authority. |
| Production | `KINGA-production` | Explicitly excluded. |

## 2. Source, compatibility, and ledger pins

| Control | Pinned value | Review result |
|---|---|---|
| Current `drizzle/schema.ts` SHA-256 | `6c86898d9e13ffc16d60acb8440963cf0c9ddc06e027b96b042504f3b65cb1ae` | Canonical source after the Wave 3–5 JSON-shaped TEXT-default reconciliation and Gate-B-backed Wave 4 `idx_recipients` exclusion. |
| Immutable historical Wave 5 source | [`wave-05-intelligence-learning-analytics.sql`](../../audit/gate-c-scratch-baseline/wave-05-generated/wave-05-intelligence-learning-analytics.sql) | SHA-256 `f552c1df891de5816d05d43cdf777d315c7d7a829cf27bede0debd5224f6ad24`; retained unchanged as Gate C evidence. It contains the former JSON-shaped TEXT default and must not be executed. |
| Revised TiDB-compatible Wave 5 source | [`wave-05-tidb-compatible-source-v2.sql`](../../audit/gate-d-text-index-compatibility-2026-09-14/wave-05-tidb-compatible-source-v2.sql) | SHA-256 `416de72140bb50ea254031c841e9ee1d027bc710d5fc9aba5b6c074e487764df`; the only source permitted for any future D-05 preflight or execution review. |
| Compatibility audit | [`gate-d-d05-compatibility-audit-2026-09-15.json`](../../audit/gate-d-d05-compatibility-audit-2026-09-15.json) | Passed: 290 literal markers with terminal empty fragment; no legacy `DEFAULT ('[]')`/`DEFAULT ('{}')`; one compatible `DEFAULT (JSON_OBJECT())`; and no unprefixed `TEXT`/`BLOB` index. |
| Scope manifest | [`gate-d-d05-scope-manifest-2026-09-15.json`](../../audit/gate-d-d05-scope-manifest-2026-09-15.json) | SHA-256 `1e79842acd519fa1c678bb839a245214cc0a0f263551cbcbe47168d8eb2f4699`; deterministic exhaustive membership record for 75 tables, 25 foreign keys, and 190 explicit indexes. |
| Canonical JSON ledger | [`gate-d-d05-statement-hash-ledger-2026-09-15.json`](../../audit/gate-d-d05-statement-hash-ledger-2026-09-15.json) | SHA-256 `67cf9e0ad6c0d1bc100678dd5d659226e6729430917363386217c153778a604d`; 290 ordered exact statements. |
| Human-readable hash ledger | [`d05-wave-05-statement-hash-ledger-2026-09-15.md`](d05-wave-05-statement-hash-ledger-2026-09-15.md) | SHA-256 `421fe370e4ecf920e996951de7fbf43f312d3787a08ad21afeae71674da8eb0d`; each statement ordinal, class, object, and SHA-256. |
| Statement-file directory | `audit/gate-d-d05-statements-2026-09-15/` | Exactly 290 one-statement files; ordered-file SHA-256 `c981ee22e83737226e1baa4068f26a6ab3b04fdc6afb4ed749921024b0a8ab8a`. |
| Deterministic generators | [`generate-d05-statement-ledger.mjs`](../../scripts/generate-d05-statement-ledger.mjs), [`verify-d05-statement-files.mjs`](../../scripts/verify-d05-statement-files.mjs), and [`audit-wave5-compatibility.mjs`](../../scripts/audit-wave5-compatibility.mjs) | Repository-only artefacts; none opens a database connection. |

Any source, schema, ledger, scope-manifest, statement-file, marker, class-total, or ordered-file hash difference is a mandatory stop. A future operator must not regenerate, edit, or substitute the source in a change window.

## 3. Approved D-05 scope

The revised source contains exactly **290** approved statements: 75 `CREATE TABLE`, 25 `ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY`, and 190 `CREATE INDEX`. It contains no DML, `DROP`, user/account/grant statement, backup/restore action, database creation, or non-foreign-key `ALTER`.

| Scope category | Exact approved content |
|---|---|
| New tables | Exactly the 75 table names in the committed [scope manifest](../../audit/gate-d-d05-scope-manifest-2026-09-15.json), which is generated from the canonical ledger—not manually transcribed. The set is limited to final-wave intelligence, learning, analytics, governance, and optimisation declarations. |
| Prior-wave dependency targets | `assessor_report_reviews`, `assessor_reports`, `automation_policies`, `claim_confidence_scores`, `claim_routing_decisions`, and `claims`. All must be present and structurally unchanged in the closed D-01–D-04 baseline before any future execution. |
| Cumulative expected table count | 188: 113 closed D-01–D-04 tables plus 75 D-05 tables. |
| Foreign keys | Exactly 25 source-declared constraints, detailed with original ordinals and individual hashes in the [scope manifest](../../audit/gate-d-d05-scope-manifest-2026-09-15.json) and canonical ledger. |
| Explicit secondary indexes | Exactly 190 `CREATE INDEX` statements, detailed with original ordinals and individual hashes in the [scope manifest](../../audit/gate-d-d05-scope-manifest-2026-09-15.json) and canonical ledger. |
| Explicit exclusions | No table outside the 75 ledger rows; no held table; no deferred natural/composite unique rule; no data seed; no DML; no `DROP`; no non-FK `ALTER`; no account, network, backup, restore, application rollout, recovery/cutover, or production action. |

### 3A. Repeated compatibility and marker controls

> **The revised D-05 source contains 290 literal Drizzle-style `--> statement-breakpoint` markers. They are repository tooling, not MySQL/TiDB comments, and must never be submitted as SQL.**

The source ends with a marker and splits into 291 raw fragments: 290 non-empty, semicolon-terminated executable statements and one empty terminal fragment. The generator discards only that terminal fragment. A raw `mysql < wave-05-tidb-compatible-source-v2.sql` invocation is prohibited.

The final compatibility audit was repeated after D-03 and D-04 findings. It confirmed that the source contains no legacy JSON-shaped `TEXT DEFAULT ('[]')` or `TEXT DEFAULT ('{}')` syntax; its sole such default uses the TiDB-compatible `DEFAULT (JSON_OBJECT())` expression. It also maps every `TEXT`/`BLOB` column and every `CREATE INDEX` column reference and found **no unprefixed `TEXT`/`BLOB` index**. These checks identify only the known source/engine hazards; they do not replace fresh preflight or execution-time server error handling.

## 4. Required fresh recovery evidence

Before any execution decision, an authenticated read-only TiDB Cloud Backup-page inspection must establish a successful same-day `KINGA-staging` snapshot, exact UTC creation and expiry times, and a short owner-approved change window whose end plus a two-hour post-closure margin remains before expiry. The Restore control must be visible but not selected. TiDB Cloud Starter’s one-day retention and absence of PITR remain accepted for staging only and remain insufficient for production.

### 4A. Fresh review observation — 15 September 2026

| Field | Authenticated observed value |
|---|---|
| Target shown in console | `KINGA-staging` |
| Backup time | `2026-09-15 03:00:45 UTC±00:00` |
| Status | `Succeeded` |
| Expires time | `2026-09-16 03:00:45 UTC±00:00` |
| Restore action | Available in the console but not selected; no restore was initiated. |

This observation is retained in the [D-05 preflight evidence](../../audit/gate-d-d05-read-only-preflight-evidence-2026-09-15.md). It supports packet review only, does not itself create an execution window, and must be replaced by a new immediate pre-execution observation before D-05 could proceed.

## 5. Runner account and source-derived privilege assessment

The owner’s recorded decision retains tenant-prefixed principal `289ZyKGJwbC2SkB.d01_runner` for D-03 through D-06. The current recorded grant posture is global `USAGE ON *.*` plus `SELECT, CREATE, REFERENCES, ALTER, INDEX ON kinga_staging.*`. It must be rechecked with the exact principal immediately before any D-05 execution; this packet grants no account or privilege modification.

The exact-principal read-only `SHOW GRANTS` recheck at approximately 10:08 UTC on 15 September 2026 returned precisely that posture. It covers the source-derived D-05 requirements without a privilege gap or excess. The query, result, and source-derived assessment are retained in the [D-05 preflight evidence](../../audit/gate-d-d05-read-only-preflight-evidence-2026-09-15.md); no account or privilege change occurred.

| D-05 action or check | Source-derived minimum privilege | Required preflight conclusion |
|---|---|---|
| 75 `CREATE TABLE` statements | `CREATE` | Present on `kinga_staging.*`. |
| 25 foreign-key `ALTER TABLE` statements | `ALTER`, `REFERENCES` | Both present on `kinga_staging.*`. |
| 190 `CREATE INDEX` statements | `INDEX` | Present on `kinga_staging.*`. |
| Required read-only metadata pre/postflight | `SELECT` | Present on `kinga_staging.*`. |

No source-derived privilege beyond this existing five-privilege set is expected. A missing privilege or unexpected privilege excess is a stop and must not be corrected without separate authority.

## 6. Required preflight before any execution

| Check | Required accepted result | Stop condition |
|---|---|---|
| Target identity and TLS | Owner-approved TiDB Cloud organisation/project/cluster/database identity; `KINGA-staging`, `kinga_staging`, current service class, TLS, authenticated identity, and redacted exact-principal grants. | Target ambiguity, non-TLS connection, privilege gap/excess, or missing authority. |
| Closed baseline | Exactly the closed D-01–D-04 state: 113 tables, 42 foreign-key definitions, 264 explicit indexes, with all existing tables empty. | Any missing, extra, structurally mismatched, or non-empty baseline object. |
| D-05 object absence | No D-05 table, named foreign key, or planned table/index pair exists. | Any D-05 object already exists or any pre-existing partial state is not individually accounted for. |
| Source and ledger integrity | Revised source, scope manifest, ledger, human-readable ledger, and every statement file match; 290 markers, one empty terminal fragment, and ordered totals 75/25/190. | Hash, marker, split, count, class, object, or order mismatch. |
| Recovery record | Fresh same-day successful snapshot covers the approved window plus the two-hour post-closure margin. | Missing, stale, failed, wrong-target, or insufficiently retained snapshot. |
| Roles and authority | Named operator, reviewer, application-validation owner, observer, change approver, and stop authority; a D-05-only exception only if separately approved. | Missing role, authority, or attempted transfer of a prior-wave exception. |

## 7. Future postflight and closure criteria

Only after an authorised D-05 ledger completes without deviation may the assigned reviewer reconcile staging metadata with this pinned source. Expected final state is exactly 188 cumulative tables, 25 D-05 foreign keys, 190 D-05 explicit indexes, all source-defined column/default/key structures, and zero rows in every D-05 table. The result must also reconcile the cumulative D-01–D-05 source baseline before closure.

Closure requires retained statement results, expected-versus-actual metadata comparisons, zero-row results, authorised application-validation evidence, no unresolved unexpected object, expiration of any D-05-only exception, and a distinct owner closure decision. Completion of D-05 does not authorise recovery/cutover, deployment, or production work.

## References

[1]: ../../audit/gate-c-wave-five-review-2026-09-11.md "Gate C Wave 5 review record"
[2]: ../../audit/gate-c-scratch-baseline/wave-05-planning-analysis.json "Wave 5 source membership and dependency analysis"
[3]: ../../audit/gate-d-text-default-compatibility-2026-09-14/README.md "Wave 3–5 JSON-shaped TEXT default compatibility reconciliation"
[4]: ../../audit/gate-d-text-index-compatibility-2026-09-14/README.md "Gate B whole-TEXT index propagation reconciliation"
[5]: ../../audit/gate-d-d05-compatibility-audit-2026-09-15.json "D-05 repeat compatibility and marker audit"
[6]: ../../audit/gate-d-d05-statement-hash-ledger-2026-09-15.json "D-05 canonical per-statement ledger"
[7]: ../../audit/gate-d-d05-scope-manifest-2026-09-15.json "D-05 generated scope manifest"
