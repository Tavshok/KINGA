# Gate D — D-04 Staging Change Packet: Wave 4 Operational Portals and Workflows

## Status and hard authority boundary

**Status: review-only preparation.** This packet prepares the revised TiDB-compatible Wave 4 source and its derived execution artefacts for review. It authorises **no D-04 execution**. It does not authorise DDL, DML, a data seed, account or grant change, network change, backup/restore action, application deployment, recovery/cutover work, or production activity.

> **D-04 must not begin until a separate owner decision records the operator, reviewer, application-validation owner, an accepted control model, a short UTC window, and execution authority after every fresh preflight condition passes exactly.** The D-03 exception expired at D-03 closure and does not transfer to this packet.

## 1. Packet identity

| Field | Review value | Execution status |
|---|---|---|
| Packet ID | `D-04` | Review-only; no execution authority. |
| Purpose | Add the approved Wave 4 operational portals, agency, fleet, engineering, recovery, notifications, WhatsApp, and workflow baseline after closed D-01–D-03. | Requires a distinct approval after fresh preflight. |
| Target | `KINGA-staging`, database `kinga_staging`, TiDB Cloud Starter | Target identity, TLS, and current recovery evidence must be rechecked before any future statement. |
| Prerequisite | Closed D-01–D-03 baseline: 73 tables, 35 foreign keys, 177 explicit `CREATE INDEX` structures, and zero rows. | Must be revalidated immediately before any future execution. |
| Operator | Unassigned | Requires a named assignment and authority decision. |
| Reviewer | Unassigned | Requires a named reviewer or a newly recorded D-04-only exception; no earlier exception transfers. |
| Application-validation owner and observer | Unassigned | Must be named; smoke evidence is mandatory before closure. |
| Change approver and stop authority | KINGA owner | Retains decision and stop authority. |
| Production | `KINGA-production` | Explicitly excluded. |

## 2. Source, compatibility, and ledger pins

| Control | Pinned value | Review result |
|---|---|---|
| Current `drizzle/schema.ts` SHA-256 | `7eed4cbaa395a3d90648f5cd7a7070a6b3734b9776d1fb914a98868059731644` | Canonical source after the global JSON-shaped TEXT-default reconciliation. |
| Immutable historical Wave 4 source | [`wave-04-operational-portals-channels.sql`](../../audit/gate-c-scratch-baseline/wave-04-generated/wave-04-operational-portals-channels.sql) | SHA-256 `c6d4f6bb2f7984dd381630651d9520db59c14c873617492fc7e5ed3035915139`; retained unchanged as Gate C evidence. It contains five historical literal JSON-shaped TEXT defaults and must not be submitted to TiDB. |
| Revised TiDB-compatible D-04 source | [`wave-04-tidb-compatible-source.sql`](../../audit/gate-d-text-default-compatibility-2026-09-14/wave-04-tidb-compatible-source.sql) | SHA-256 `8317ccc6d01c8c34b6fd2e1f466ca8781c9152910953c5f345fe13de65183f61`; this is the only permitted future D-04 execution source. |
| Compatibility inventory | [`README.md`](../../audit/gate-d-text-default-compatibility-2026-09-14/README.md) | Records all 10 affected Wave 3–5 fields. Wave 4’s five fields now render `DEFAULT (JSON_ARRAY())` or `DEFAULT (JSON_OBJECT())`; no incompatible `DEFAULT ('[]')` or `DEFAULT ('{}')` remains in the revised Wave 4 source. |
| Canonical JSON ledger | [`gate-d-d04-statement-hash-ledger-2026-09-14.json`](../../audit/gate-d-d04-statement-hash-ledger-2026-09-14.json) | SHA-256 `2f3aa4973af2842b2f61ce4535ae3418d7cc4e84cae9747e28b4ad11fc697c9f`; deterministic re-derivation passed. |
| Human-readable ledger | [`d04-wave-04-statement-hash-ledger-2026-09-14.md`](d04-wave-04-statement-hash-ledger-2026-09-14.md) | Ordered per-statement SHA-256 review record. |
| Statement-file directory | `audit/gate-d-d04-statements-2026-09-14/` | Exactly 135 exact one-statement SQL files; each file matches its ledger row. Ordered concatenation SHA-256 `8909d7cf205ae26b7807d44597ff9d8a6f79b24bc97734f0cec3b95b7b7393ee`. |
| Generator | [`generate-d04-statement-ledger.mjs`](../../scripts/generate-d04-statement-ledger.mjs) | Repository-only deterministic generator/verifier; makes no database connection. |

Any source, schema, ledger, or statement-file hash difference is a mandatory stop. A future operator must not regenerate, edit, or substitute the source in a change window.

## 3. Approved D-04 scope

The revised source contains exactly **135** approved statements: 40 `CREATE TABLE`, 7 `ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY`, and 88 `CREATE INDEX`. It contains no DML, `DROP`, user/account/grant statement, backup/restore action, database creation, or non-foreign-key `ALTER`.

| Scope category | Exact approved content |
|---|---|
| New tables | `agency_assisted_claimant_identities`, `agency_clients`, `agency_insurance_service_request_insurers`, `agency_insurance_service_requests`, `agency_insurance_valuation_deviations`, `agency_product_commission_configs`, `approval_workflow`, `claim_comment_reads`, `claim_comments`, `client_insurance_service_requests`, `client_vehicle_valuation_requests`, `engineer_observations`, `engineer_profiles`, `fleet_accounts`, `fleet_audit_logs`, `fleet_drivers`, `fleet_intelligence_snapshots`, `fleet_manager_requests`, `fleet_rfq_client_instructions`, `fleet_risk_scores`, `fleet_vehicles`, `fleets`, `governance_audit_log`, `governance_notifications`, `governance_violation_log`, `inspection_projects`, `notification_events`, `notification_preferences`, `notifications`, `panel_beaters`, `platform_governance_limits`, `rate_limit_tracking`, `recovery_cases`, `recovery_correspondence_log`, `service_requests`, `tenant_workflow_configs`, `whatsapp_sessions`, `workflow_audit_trail`, `workflow_configuration`, and `workflow_templates`. |
| Prior-wave targets | `claims` and `users`; both are present in the closed D-01–D-03 baseline and must be revalidated before any future D-04 execution. |
| Cumulative expected table count | 113: 73 closed D-01–D-03 tables plus 40 D-04 tables. |
| Foreign keys | Exactly 7 source-declared constraints in ledger ordinals 41–47: `approval_workflow_claim_id_claims_id_fk`, `claim_comments_claimId_claims_id_fk`, `claim_comments_author_user_id_users_id_fk`, `governance_notifications_claim_id_claims_id_fk`, `notifications_claim_id_claims_id_fk`, `recovery_cases_claim_id_claims_id_fk`, and `workflow_audit_trail_claim_id_claims_id_fk`. |
| Explicit secondary indexes | Exactly 88 `CREATE INDEX` statements in ledger ordinals 48–135. |
| Explicit exclusions | No table outside the 40 listed above; no held table; no deferred natural/composite unique rule; no data seed; no DML; no `DROP`; no non-FK `ALTER`; no account, network, backup, restore, application rollout, recovery/cutover, or production action. |

### 3A. Marker-aware execution control

> **The revised D-04 source contains 135 Drizzle-style `--> statement-breakpoint` markers. They are repository tooling, not MySQL/TiDB comments, and must never be submitted as SQL.**

The source ends with a marker and splits into 136 raw fragments: 135 non-empty, semicolon-terminated executable statements and one empty terminal fragment. The generator discards only that empty fragment. A raw `mysql < wave-04-tidb-compatible-source.sql` invocation is prohibited.

If D-04 receives later execution authority, the approved execution order is ledger ordinals 1–135: 40 tables, 7 foreign keys, and 88 indexes. Before each statement, the operator must hash the exact proposed SQL and require equality with its ledger row. Any hash mismatch, target discrepancy, parser error, grant error, missing/extra statement, order change, or server error is an immediate stop; no blind retry or later statement is allowed without a separate partial-state assessment and owner decision.

## 4. Required fresh recovery evidence

At review time on 14 September 2026, the authenticated `KINGA-staging` Backup page displayed a successful snapshot created at `2026-09-14 03:00:00 UTC±00:00` and expiring at `2026-09-15 03:00:00 UTC±00:00`; the Restore control was present and was not selected.[6] This is not an execution window or recovery acceptance decision. Immediately before any future D-04 execution, an authenticated read-only Backup-page inspection must re-establish a successful same-day snapshot, its exact UTC creation/expiry times, and a short approved window whose end plus a two-hour post-closure margin remains before expiry. Starter’s one-day retention and no-PITR posture remain acceptable only for staging and do not meet the production requirement.

## 5. Runner account and source-derived privilege assessment

The owner’s recorded reuse decision retains tenant-prefixed principal `289ZyKGJwbC2SkB.d01_runner` for D-03 through D-06. An authenticated review-time `SHOW GRANTS FOR '289ZyKGJwbC2SkB.d01_runner'@'%';` on 14 September 2026 returned only `USAGE ON *.*` and `SELECT, CREATE, REFERENCES, ALTER, INDEX ON kinga_staging.*`.[6] It must be rechecked using the exact principal immediately before any D-04 execution. No account or grant change is authorised by this packet.

| D-04 action or check | Source-derived minimum privilege | Required preflight conclusion |
|---|---|---|
| 40 `CREATE TABLE` statements | `CREATE` | Present on `kinga_staging.*`. |
| 7 foreign-key `ALTER TABLE` statements | `ALTER`, `REFERENCES` | Both present on `kinga_staging.*`. |
| 88 `CREATE INDEX` statements | `INDEX` | Present on `kinga_staging.*`. |
| Required read-only metadata pre/postflight | `SELECT` | Present on `kinga_staging.*`. |

No source-derived privilege beyond this existing five-privilege set is expected. A fresh exact-principal check remains mandatory; a privilege gap or unexpected privilege excess is a stop and must not be corrected without separate authority.

## 6. Required preflight before any future execution

| Check | Required accepted result | Stop condition |
|---|---|---|
| Target identity and TLS | Owner-approved TiDB Cloud organisation/project/cluster/database identity; `KINGA-staging`, `kinga_staging`, current service class, TLS, authenticated identity, and redacted exact-principal grants. | Target ambiguity, non-TLS connection, privilege gap/excess, or missing authority. |
| Closed D-01–D-03 baseline | Exactly 73 tables with approved columns, keys, defaults, 35 FKs, 177 explicit indexes, and zero rows. | Any mismatch or non-empty prerequisite table. |
| D-04 absence | None of the 40 D-04 table names, 7 D-04 FK names, or 88 D-04 explicit index names exists. | Existing or unexpected D-04 object. |
| Source and ledger integrity | Revised source, ledger, and statement-file hashes match; 135 markers, one empty terminal fragment, and ordered class totals 40/7/88. | Hash, marker, split, count, class, or order mismatch. |
| Recovery record | Fresh same-day successful snapshot covers the approved window plus two-hour post-closure margin. | Missing, stale, failed, wrong-target, or insufficiently retained snapshot. |
| Roles and authority | Named operator, reviewer, application-validation owner, observer, change approver, and stop authority; a D-04-only exception only if separately approved. | Missing role, authority, or attempted transfer of D-03 exception. |

## 7. Future postflight and closure criteria

Only after separately authorised D-04 execution completes without a deviation may the named reviewer reconcile staging metadata with this revised pinned source. The expected state is exactly 113 cumulative tables, 7 D-04 foreign keys, 88 D-04 explicit indexes, all source-defined column/default/key structures, and zero rows in every D-04 table. Application validation is limited to separately authorised authenticated non-production connectivity and read-only smoke checks; no data seed or write test is authorised.

Closure requires retained statement results, expected-versus-actual metadata comparison, zero-row results, application-validation evidence, no unresolved unexpected object, expiration of any D-04-only exception, and a distinct owner decision before D-05 is considered.

## References

[1]: ../../audit/gate-c-wave-four-review-2026-09-11.md "Gate C Wave 4 review record"
[2]: ../../audit/gate-c-scratch-baseline/wave-04-planning-analysis.json "Wave 4 source membership and dependency analysis"
[3]: ../../audit/gate-d-text-default-compatibility-2026-09-14/README.md "Wave 3–5 JSON-shaped TEXT default compatibility reconciliation"
[4]: ../../audit/gate-d-d04-statement-hash-ledger-2026-09-14.json "Canonical D-04 135-statement ledger"
[5]: d04-wave-04-statement-hash-ledger-2026-09-14.md "Human-readable D-04 statement hash ledger"
[6]: ../../audit/gate-d-d04-read-only-preflight-evidence-2026-09-14.md "D-04 fresh snapshot and exact-principal grant observation"
