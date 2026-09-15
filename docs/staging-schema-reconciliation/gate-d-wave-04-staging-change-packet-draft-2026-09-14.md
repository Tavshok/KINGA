# Gate D — D-04 Staging Change Packet: Wave 4 Operational Portals and Workflows

## Status and hard authority boundary

**Status: controlled compatibility stop; revised resumption package awaiting fresh preflight.** Owner-authorised D-04 historical ledger ordinals 1–98 completed before a TiDB/MySQL whole-TEXT index incompatibility stopped historical ordinal 99. This packet preserves that partial state, records the source-level correction, and authorises **no automatic resumption**. It does not authorise DML, a data seed, account or grant change, network change, backup/restore action, application deployment, recovery/cutover work, or production activity.

> **No D-04 statement after historical ordinal 98 may be sent until a fresh resumption preflight passes exactly.** The D-03 exception expired at D-03 closure and does not transfer to this packet. The D-04-only exception below expires at D-04 closure, stop, abandonment, or the approved window’s expiry.

## 1. Packet identity

| Field | Review value | Execution status |
|---|---|---|
| Packet ID | `D-04` | Review-only; no execution authority. |
| Purpose | Add the approved Wave 4 operational portals, agency, fleet, engineering, recovery, notifications, WhatsApp, and workflow baseline after closed D-01–D-03. | Requires a distinct approval after fresh preflight. |
| Target | `KINGA-staging`, database `kinga_staging`, TiDB Cloud Starter | Target identity, TLS, and current recovery evidence must be rechecked before any future statement. |
| Prerequisite | Closed D-01–D-03 baseline: 73 tables, 35 foreign keys, 177 explicit `CREATE INDEX` structures, and zero rows. | Must be revalidated immediately before any future execution. |
| Operator | Tavonga Shoko, KINGA owner, under Section 1A | D-04-only owner exception; no independent assurance and no authority beyond the approved source/ledger and preflight controls. |
| Reviewer | Tavonga Shoko, KINGA owner, sole reviewer under Section 1A | D-04-only owner exception; all evidence remains mandatory for later independent review. |
| Application-validation owner and observer | Tavonga Shoko, KINGA owner, under Section 1A | D-04-only owner exception; any authorised non-production smoke evidence remains mandatory before closure. |
| Change approver and stop authority | KINGA owner | Retains decision and stop authority. |
| Production | `KINGA-production` | Explicitly excluded. |

### 1A. Accepted D-04-only owner-operated control exception

On 14 September 2026, **Tavonga Shoko, KINGA owner**, accepted the absence of an independent operator, reviewer, and application-validation owner for D-04 only. Tavonga Shoko may perform those roles and observe this change only within the approved 40-table Wave 4 scope, subject to the packet’s source, hash, recovery, preflight, stop, and closure controls.

This exception provides **no independent assurance**, does not permit substituting an execution route, does not authorise any account/grant/network/recovery/deployment/production action, and expires at D-04 closure, stop, abandonment, or approved-window expiry. It does not transfer to D-05 or later work, recovery/cutover, deployment, or production.

## 2. Source, compatibility, and ledger pins

| Control | Pinned value | Review result |
|---|---|---|
| Current `drizzle/schema.ts` SHA-256 | `6c86898d9e13ffc16d60acb8440963cf0c9ddc06e027b96b042504f3b65cb1ae` | Canonical source after the JSON-shaped TEXT-default reconciliation and Gate-B-backed `idx_recipients` exclusion. |
| Immutable historical Wave 4 source | [`wave-04-operational-portals-channels.sql`](../../audit/gate-c-scratch-baseline/wave-04-generated/wave-04-operational-portals-channels.sql) | SHA-256 `c6d4f6bb2f7984dd381630651d9520db59c14c873617492fc7e5ed3035915139`; retained unchanged as Gate C evidence. It contains five historical literal JSON-shaped TEXT defaults and must not be submitted to TiDB. |
| Prior D-04 compatible source and ledger | [`wave-04-tidb-compatible-source.sql`](../../audit/gate-d-text-default-compatibility-2026-09-14/wave-04-tidb-compatible-source.sql) and [`135-statement ledger`](../../audit/gate-d-d04-statement-hash-ledger-2026-09-14.json) | Retained evidence of the stopped run: source SHA-256 `8317ccc6…83f61`, ledger SHA-256 `2f3aa497…97c9f`; **not permitted for resumption** because historical ordinal 99 is unsupported. |
| Revised TiDB-compatible D-04 source | [`wave-04-tidb-compatible-source-v2.sql`](../../audit/gate-d-text-index-compatibility-2026-09-14/wave-04-tidb-compatible-source-v2.sql) | SHA-256 `7e5802c2a4c57cee21a951a0ca85d174b1f03fb5c560c00925564455ef9cfd69`; the only permitted source for later D-04 resumption. It preserves the five JSON-shaped TEXT-default corrections and omits only historical ordinal 99. |
| TEXT-index compatibility trace | [`README.md`](../../audit/gate-d-text-index-compatibility-2026-09-14/README.md) | Shows that Gate B previously excluded this same no-consumer whole-TEXT index only in a historical migration overlay, leaving canonical schema metadata to reintroduce it during later source derivation. It confirms no analogous unprefixed TEXT/BLOB index remains in revised Waves 4–5. |
| Revised full JSON ledger | [`gate-d-d04-statement-hash-ledger-2026-09-14-v2.json`](../../audit/gate-d-d04-statement-hash-ledger-2026-09-14-v2.json) | SHA-256 `ddaeefc896ef01b713cb5551c67188614c777d52320c657412018f112a784b2f`; deterministic re-derivation passed. |
| Resumption ledger | [`gate-d-d04-resumption-ledger-2026-09-14.json`](../../audit/gate-d-d04-resumption-ledger-2026-09-14.json) and [`human-readable record`](d04-wave-04-resumption-ledger-2026-09-14.md) | SHA-256 `c0253bdb9edc9f0aa6433bb95d44db468f89cce38fc89bcdb97da578b0d7f1f3`; exactly historical ordinals 100–135. |
| Revised statement-file directory | `audit/gate-d-d04-statements-2026-09-14-v2/` | Exactly 134 exact one-statement SQL files, ordered concatenation SHA-256 `43682255a91362cc25516657af6e7666b6a2725b8dd4ce62b4ca8fcc8da99591`. |
| Resumption statement-file directory | `audit/gate-d-d04-resumption-statements-2026-09-14/` | Exactly 36 files for historical ordinals 100–135 only, ordered concatenation SHA-256 `d3d9017f7eda5bf474f38ac343fe45d2eb57e140c74a4322504c6fcfa268d57b`. |
| Generator | [`generate-d04-statement-ledger.mjs`](../../scripts/generate-d04-statement-ledger.mjs) | Repository-only deterministic generator/verifier; makes no database connection. |

Any source, schema, ledger, or statement-file hash difference is a mandatory stop. A future operator must not regenerate, edit, or substitute the source in a change window.

## 3. Approved D-04 scope

The revised source contains exactly **134** approved statements: 40 `CREATE TABLE`, 7 `ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY`, and 87 `CREATE INDEX`. It contains no DML, `DROP`, user/account/grant statement, backup/restore action, database creation, or non-foreign-key `ALTER`.

| Scope category | Exact approved content |
|---|---|
| New tables | `agency_assisted_claimant_identities`, `agency_clients`, `agency_insurance_service_request_insurers`, `agency_insurance_service_requests`, `agency_insurance_valuation_deviations`, `agency_product_commission_configs`, `approval_workflow`, `claim_comment_reads`, `claim_comments`, `client_insurance_service_requests`, `client_vehicle_valuation_requests`, `engineer_observations`, `engineer_profiles`, `fleet_accounts`, `fleet_audit_logs`, `fleet_drivers`, `fleet_intelligence_snapshots`, `fleet_manager_requests`, `fleet_rfq_client_instructions`, `fleet_risk_scores`, `fleet_vehicles`, `fleets`, `governance_audit_log`, `governance_notifications`, `governance_violation_log`, `inspection_projects`, `notification_events`, `notification_preferences`, `notifications`, `panel_beaters`, `platform_governance_limits`, `rate_limit_tracking`, `recovery_cases`, `recovery_correspondence_log`, `service_requests`, `tenant_workflow_configs`, `whatsapp_sessions`, `workflow_audit_trail`, `workflow_configuration`, and `workflow_templates`. |
| Prior-wave targets | `claims` and `users`; both are present in the closed D-01–D-03 baseline and must be revalidated before any future D-04 execution. |
| Cumulative expected table count | 113: 73 closed D-01–D-03 tables plus 40 D-04 tables. |
| Foreign keys | Exactly 7 source-declared constraints in ledger ordinals 41–47: `approval_workflow_claim_id_claims_id_fk`, `claim_comments_claimId_claims_id_fk`, `claim_comments_author_user_id_users_id_fk`, `governance_notifications_claim_id_claims_id_fk`, `notifications_claim_id_claims_id_fk`, `recovery_cases_claim_id_claims_id_fk`, and `workflow_audit_trail_claim_id_claims_id_fk`. |
| Explicit secondary indexes | Exactly 87 `CREATE INDEX` statements in revised-ledger ordinals 48–134. Historical `idx_recipients` at ordinal 99 is deliberately excluded. |
| Explicit exclusions | No table outside the 40 listed above; no held table; no deferred natural/composite unique rule; no data seed; no DML; no `DROP`; no non-FK `ALTER`; no account, network, backup, restore, application rollout, recovery/cutover, or production action. |

### 3A. Marker-aware execution control

> **The revised D-04 source contains 134 Drizzle-style `--> statement-breakpoint` markers. They are repository tooling, not MySQL/TiDB comments, and must never be submitted as SQL.**

The source ends with a marker and splits into 135 raw fragments: 134 non-empty, semicolon-terminated executable statements and one empty terminal fragment. The generator discards only that empty fragment. A raw `mysql < wave-04-tidb-compatible-source-v2.sql` invocation is prohibited.

Historical ordinals 1–98 are accepted owner-reported partial execution and **must not be rerun**. Historical ordinal 99 is deliberately omitted. After a renewed immediate preflight and exact hash verification, the only permitted resumption order is the 36-file resumption ledger’s historical ordinals 100–135. Before each statement, the operator must hash the exact proposed SQL and require equality with its resumption-ledger row. Any hash mismatch, target discrepancy, parser error, grant error, missing/extra statement, order change, or server error is an immediate stop; no blind retry or later statement is allowed without a separate partial-state assessment and owner decision.

## 4. Required fresh recovery evidence

At review time on 14 September 2026, the authenticated `KINGA-staging` Backup page displayed a successful snapshot created at `2026-09-14 03:00:00 UTC±00:00` and expiring at `2026-09-15 03:00:00 UTC±00:00`; the Restore control was present and was not selected.[7] This is not an execution window or recovery acceptance decision. Immediately before any future D-04 execution, an authenticated read-only Backup-page inspection must re-establish a successful same-day snapshot, its exact UTC creation/expiry times, and a short approved window whose end plus a two-hour post-closure margin remains before expiry. Starter’s one-day retention and no-PITR posture remain acceptable only for staging and do not meet the production requirement.

## 5. Runner account and source-derived privilege assessment

The owner’s recorded reuse decision retains tenant-prefixed principal `289ZyKGJwbC2SkB.d01_runner` for D-03 through D-06. An authenticated review-time `SHOW GRANTS FOR '289ZyKGJwbC2SkB.d01_runner'@'%';` on 14 September 2026 returned only `USAGE ON *.*` and `SELECT, CREATE, REFERENCES, ALTER, INDEX ON kinga_staging.*`.[7] It must be rechecked using the exact principal immediately before any D-04 execution. No account or grant change is authorised by this packet.

| D-04 action or check | Source-derived minimum privilege | Required preflight conclusion |
|---|---|---|
| 40 `CREATE TABLE` statements | `CREATE` | Present on `kinga_staging.*`. |
| 7 foreign-key `ALTER TABLE` statements | `ALTER`, `REFERENCES` | Both present on `kinga_staging.*`. |
| 87 `CREATE INDEX` statements | `INDEX` | Present on `kinga_staging.*`. |
| Required read-only metadata pre/postflight | `SELECT` | Present on `kinga_staging.*`. |

No source-derived privilege beyond this existing five-privilege set is expected. A fresh exact-principal check remains mandatory; a privilege gap or unexpected privilege excess is a stop and must not be corrected without separate authority.

## 6. Required preflight before any future execution

| Check | Required accepted result | Stop condition |
|---|---|---|
| Target identity and TLS | Owner-approved TiDB Cloud organisation/project/cluster/database identity; `KINGA-staging`, `kinga_staging`, current service class, TLS, authenticated identity, and redacted exact-principal grants. | Target ambiguity, non-TLS connection, privilege gap/excess, or missing authority. |
| Accepted D-04 partial state | Exactly the source-derived state from historical ordinals 1–98: the 40 D-04 tables, all 7 D-04 FKs, and 51 D-04 explicit indexes; every D-04 table remains empty. | Any missing, extra, structurally mismatched, or non-empty D-04 object; any unrecorded historic ordinal at or after 99. |
| Source and ledger integrity | Revised source, full ledger, and 100–135 resumption ledger/file hashes match; 134 markers, one empty terminal fragment, and ordered class totals 40/7/87. | Hash, marker, split, count, class, or order mismatch. |
| Recovery record | Fresh same-day successful snapshot covers the approved window plus two-hour post-closure margin. | Missing, stale, failed, wrong-target, or insufficiently retained snapshot. |
| Roles and authority | Named operator, reviewer, application-validation owner, observer, change approver, and stop authority; a D-04-only exception only if separately approved. | Missing role, authority, or attempted transfer of D-03 exception. |

## 7. Future postflight and closure criteria

Only after the controlled 100–135 resumption completes without a deviation may Tavonga Shoko, under Section 1A, reconcile staging metadata with this revised pinned source. The expected state is exactly 113 cumulative tables, 7 D-04 foreign keys, 87 D-04 explicit indexes, all source-defined column/default/key structures, and zero rows in every D-04 table. The owner-operated reconciliation does not provide independent assurance; all evidence must be retained for later independent review. Application validation is limited to separately authorised authenticated non-production connectivity and read-only smoke checks; no data seed or write test is authorised.

Closure requires retained statement results, expected-versus-actual metadata comparison, zero-row results, application-validation evidence, no unresolved unexpected object, expiration of any D-04-only exception, and a distinct owner decision before D-05 is considered.

## References

[1]: ../../audit/gate-c-wave-four-review-2026-09-11.md "Gate C Wave 4 review record"
[2]: ../../audit/gate-c-scratch-baseline/wave-04-planning-analysis.json "Wave 4 source membership and dependency analysis"
[3]: ../../audit/gate-d-text-default-compatibility-2026-09-14/README.md "Wave 3–5 JSON-shaped TEXT default compatibility reconciliation"
[4]: ../../audit/gate-d-text-index-compatibility-2026-09-14/README.md "Gate B idx_recipients trace and D-04 whole-TEXT index reconciliation"
[5]: ../../audit/gate-d-d04-statement-hash-ledger-2026-09-14-v2.json "Revised D-04 134-statement ledger"
[6]: d04-wave-04-resumption-ledger-2026-09-14.md "D-04 historical-ordinal 100–135 resumption ledger"
[7]: ../../audit/gate-d-d04-read-only-preflight-evidence-2026-09-14.md "D-04 initial preflight and controlled statement-99 stop record"
[6]: ../../audit/gate-d-d04-read-only-preflight-evidence-2026-09-14.md "D-04 fresh snapshot and exact-principal grant observation"
