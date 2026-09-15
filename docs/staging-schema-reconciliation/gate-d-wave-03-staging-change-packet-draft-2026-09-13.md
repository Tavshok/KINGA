# Gate D — D-03 Staging Change Packet: Wave 3 Assessment, Evidence, and Reporting

## Status and hard authority boundary

**Status: controlled compatibility stop after ordinal 13.** The owner-reported execution completed original ledger ordinals 1–13 with per-statement hash verification, then stopped at ordinal 14 (`cost_learning_records`) on a TiDB parser rejection of JSON-shaped `TEXT` literal defaults. A revised source and ledger are now prepared for review, but no resumption has occurred. This packet does not authorise a data seed, account or grant change, network change, backup/restore action, application deployment, or production work.

> **D-03 execution stops unless all fresh preflight checks pass exactly.** D-02’s exception expired at D-02 closure and did not transfer automatically. The new, separately recorded D-03-only exception in Section 1A is limited to this packet and does not create independent assurance.

## 1. Packet identity

| Field | Review value | Execution status |
|---|---|---|
| Packet ID | `D-03` | Conditionally authorised after exact fresh preflight. |
| Purpose | Add the approved Wave 3 assessment, evidence, and reporting baseline after D-01/D-02. | Authorised only within Sections 1A, 3A, 4–7. |
| Target | `KINGA-staging`, database `kinga_staging`, TiDB Cloud Starter | Target, region, TLS, identity, and current recovery evidence must be rechecked before first statement. |
| Prerequisite | Closed D-01/D-02 metadata: 23 tables, no rows, and all approved prior-wave structures. | Must be revalidated immediately before execution. |
| Operator | Tavonga Shoko, KINGA owner | Recorded under the D-03-only exception in Section 1A; this assignment is not independent assurance. |
| Reviewer | Tavonga Shoko, KINGA owner | Sole reviewer under the D-03-only exception in Section 1A because no independent reviewer is available. |
| Application-validation owner and observer | Tavonga Shoko, KINGA owner | Recorded under the D-03-only exception in Section 1A; required smoke evidence remains mandatory before closure. |
| Change approver and stop authority | KINGA owner | Issued the D-03 decision; retains stop authority. |
| Production | `KINGA-production` | Explicitly excluded. |

### 1A. D-03-only owner-operated control exception and execution decision

| Field | Recorded decision |
|---|---|
| Decision maker | Tavonga Shoko, KINGA owner |
| Decision date | 14 September 2026 |
| Accepted deviation | Tavonga Shoko may act as the D-03 operator, reviewer, application-validation owner, and observer because no independent person is currently available. |
| Scope limit | `D-03` only: the 50 approved Wave 3 tables, 26 named foreign keys, and 111 named explicit indexes in `KINGA-staging` database `kinga_staging`, using the pinned 187-statement ledger. |
| Execution decision | The original ledger ran only through ordinal 13, then stopped at ordinal 14. Any later owner-operated resumption must use the revised source and execute only ordinals 14–187 in original ordinal order, after a fresh snapshot/target preflight and exact SHA-256 comparison before every statement. |
| Controls that remain mandatory | Current snapshot validity, exact prerequisite and partial-state metadata, revised-source and ledger hashes, resumption-range proof, statement results, immediate stop on mismatch/server error, postflight metadata, zero-row smoke checks, retained evidence, and a distinct decision before D-04. |
| Expiry | Ends immediately when D-03 is closed, stopped, abandoned, or its approved window expires. It does not apply to D-04–D-06, recovery/cutover, an application rollout, or production. |
| Reopening rule | Any preflight mismatch, source/hash mismatch, parser discrepancy, failed statement, target/snapshot discrepancy, unexpected object, or smoke-test failure stops execution. The original parser stop has been documented and requires the revised source, ledger, and resumption boundary to be independently reverified before the owner may resume. |

This exception accepts the absence of separation of duties for D-03 only; it does not provide independent assurance. Complete preflight, execution, and postflight evidence must be retained for later independent review.

## 2. Immutable source and derived ledger pins

| Control | Pinned value | Review result |
|---|---|---|
| Packet branch base | `2611ba5c67d49c69eafa44198a7afd597d248b6d` | Corrected D-02 closure evidence, including runner-account correction. |
| Gate C Wave 3 source commit | `576d2cd29788fd83ab18719848fe035eaec22898` | `feat(schema): complete explicit keys and prove Gate C Wave 3`. |
| Current `drizzle/schema.ts` SHA-256 | `7eed4cbaa395a3d90648f5cd7a7070a6b3734b9776d1fb914a98868059731644` | Repository-only calculation after the TiDB-compatible default-expression reconciliation. |
| D-01 prerequisite SQL SHA-256 | `306797ab94529860bc9e88a69a955061916a94ddc3d08e3265229780ab08083c` | Closed staging prerequisite. |
| D-02 prerequisite SQL SHA-256 | `15661c69490a4360931ef5fc3d17e2b4521f692730b2d113f1342117b067e7b9` | Closed staging prerequisite. |
| Immutable Gate C D-03 source SQL | [`wave-03-assessment-evidence-reporting.sql`](../../audit/gate-c-scratch-baseline/wave-03-generated/wave-03-assessment-evidence-reporting.sql) | Preserved historical source; SHA-256 `ccdca4a47d9d82c04cc9b9a12e6d49960d4271a052773a342282086a9aff9254`. It stopped at ordinal 14 and must not be altered. |
| Revised compatible D-03 source SQL | [`gate-d-d03-tidb-compatible-source-2026-09-14.sql`](../../audit/gate-d-d03-tidb-compatible-source-2026-09-14.sql) | Source-derived from corrected metadata; SHA-256 `0c45f9ea613381185fd8afecfd99da1bd1d5f3275467c7286e892ab32745e59a`. Only ordinal 14 differs from the immutable source. |
| Text-default compatibility record | [`README.md`](../../audit/gate-d-text-default-compatibility-2026-09-14/README.md) | Records the 10-field Wave 3–5 inventory, TiDB expression-default basis, and immutable-to-revised proof. |
| Gate C scratch structural metadata SHA-256 | `25865fcd27d74e09f962e171bfb3ae4b080668010908189df07e7b960ae1b388` | Historical scratch cross-check only, not staging preflight evidence. |

Any source, prerequisite, ledger, or hash difference is a mandatory stop. The operator must not regenerate, edit, or substitute the source during a future change window.

### 2A. Generated marker-split statement ledger

The following D-03 execution inputs were generated locally without a TiDB connection or SQL execution. The generator splits only on the exact `--> statement-breakpoint` literal, UTF-8 trims fragments, and discards **only** the empty terminal fragment caused by Wave 3’s trailing marker. Every remaining emitted statement retains its terminal semicolon and has a SHA-256.

| Artefact | Purpose | Verification |
|---|---|---|
| [`gate-d-d03-revised-statement-hash-ledger-2026-09-14.json`](../../audit/gate-d-d03-revised-statement-hash-ledger-2026-09-14.json) | Canonical machine-readable 187-row ledger with exact revised SQL and per-statement SHA-256. | Revised source SHA-256 `0c45f9…e59a`; re-derivation `PASS`. |
| [`d03-wave-03-revised-statement-hash-ledger-2026-09-14.md`](d03-wave-03-revised-statement-hash-ledger-2026-09-14.md) | Human-readable ordered revised ledger. | 50 tables, 26 FKs, 111 indexes; 187 rows. |
| [`gate-d-d03-resume-statement-hash-ledger-2026-09-14.json`](../../audit/gate-d-d03-resume-statement-hash-ledger-2026-09-14.json) | Machine-readable resumption ledger retaining original ordinals. | Exactly 174 statements, ordinals 14–187; excludes accepted ordinals 1–13. |
| [`d03-wave-03-resumption-ledger-2026-09-14.md`](d03-wave-03-resumption-ledger-2026-09-14.md) | Human-readable ordinal-14 onward ledger. | First pending statement hash `082052db…b3be`. |
| `audit/gate-d-d03-revised-statements-2026-09-14/` | 187 exact one-statement `.sql` files for full revised-ledger review. | Each file’s SHA-256 matches its revised JSON-ledger row. |
| `audit/gate-d-d03-resume-statements-2026-09-14/` | 174 exact one-statement `.sql` files for any approved resumption. | Files run only from ordinal 14 through 187; each hash matches its resume-ledger row. |
| [`generate-d03-statement-ledger.mjs`](../../scripts/generate-d03-statement-ledger.mjs) | Deterministic local generator/verifier; no database connection. | Verify mode re-derives the ledger and returns `PASS`. |

The revised full emitted-file set contains exactly 187 `.sql` files. Its deterministic ordered concatenation has SHA-256 `e7d2b52650c70bfd774a14d7865632e59335392bdb700e5cba6cc81bd6b6a6b3`. The resume-file set contains exactly 174 files and has ordered-concatenation SHA-256 `a6408896da44b53318c007b16ceaaacae798d932359187dccf7d9aba8414a443`. These packing checks supplement, but do not replace, the revised-source hash and each individual statement hash.

## 3. Approved D-03 scope

The immutable source contains **187** approved Wave 3 statements: 50 `CREATE TABLE`, 26 `ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY`, and 111 `CREATE INDEX`. Source classification rejected all other statement classes. In particular, it contains no DML, `DROP`, user/account/grant statement, backup/restore statement, database creation, or non-FK `ALTER`.[1]

| Scope category | Exact approved content |
|---|---|
| New tables | `adjuster_sign_offs`, `agency_documents`, `ai_assessments`, `ai_prediction_logs`, `assessor_report_attachments`, `assessor_report_reviews`, `assessor_reports`, `automation_policies`, `claim_confidence_scores`, `claim_decision_lifecycle`, `claim_routing_decisions`, `component_repair_outcomes`, `cost_components`, `cost_learning_records`, `country_repair_index`, `currency_exchange_rates`, `customer_documents`, `decision_snapshots`, `document_naming_templates`, `extracted_document_data`, `extracted_repair_items`, `fleet_documents`, `fleet_incident_reports`, `fraud_alerts`, `fraud_indicators`, `fraud_rules`, `generated_reports`, `ingestion_documents`, `insurer_marketplace_links`, `insurer_marketplace_relationships`, `insurer_quote_requests`, `marketplace_profiles`, `panel_beater_quotes`, `pdf_reports`, `physics_validation_records`, `police_reports`, `policy_documents`, `pre_accident_damage`, `quotation_request_documents`, `quote_line_items`, `quote_optimisation_results`, `repair_cost_intelligence`, `repair_history`, `report_access_audit`, `report_links`, `report_snapshots`, `service_quotes`, `supplier_quote_line_items`, `supplier_quotes`, and `valuation_comparable_evidence`. |
| Prior-wave targets | `claims`, `users`, and `claim_assignments`; all must exactly match the closed D-01/D-02 metadata before D-03 is considered. |
| Cumulative expected table count | 73: 23 closed D-01/D-02 tables plus 50 D-03 tables. |
| Foreign keys | Exactly 26 source-declared constraints in ledger ordinals 51–76. Their child/parent columns and delete/update actions are held in the canonical ledger and source SQL. |
| Explicit secondary indexes | Exactly 111 `CREATE INDEX` statements in ledger ordinals 77–187. |
| Explicit exclusions | No table outside the 50 listed above; no held table; no deferred natural/composite unique rule; no data seed; no DML; no `DROP`; no non-FK `ALTER`; no account, network, backup, restore, application rollout, or production action. |

### 3A. Source-marker handling — mandatory execution control

> **D-03 contains 187 Drizzle-style `--> statement-breakpoint` markers. They are repository tooling, not valid MySQL/TiDB comments, and must never be submitted as SQL.**

The source ends with a marker. Therefore the source splits into 188 raw fragments: 187 non-empty, semicolon-terminated executable statements plus one empty terminal fragment. The empty terminal fragment is not a statement and is discarded by the deterministic generator. A raw `mysql < wave-03-assessment-evidence-reporting.sql` invocation is prohibited.

The original execution stopped at ordinal 14 after accepted ordinals 1–13. Any resumption must execute one statement at a time from original ordinal 14 in the revised resumption-ledger order: the remaining 37 tables, then 26 foreign keys, then 111 indexes. Before each statement, the operator must hash the exact proposed SQL and require equality with that resume-ledger row. A parser error, grant error, missing/extra statement, order change, source or statement hash difference, target discrepancy, or server error stops D-03 immediately. No later statement may be sent, and any further resumption requires a separately documented partial-state assessment and owner decision.

## 4. Fresh recovery evidence — review only

The authenticated `KINGA-staging` Backup page was inspected at approximately `2026-09-13 14:22 UTC` without changing any backup setting or starting a restore. It displayed a successful snapshot with backup time `2026-09-13 03:01:00 UTC±00:00` and expiry `2026-09-14 03:01:00 UTC±00:00`.[2]

This is a **review-time** recovery observation, not an execution window or recovery acceptance decision. Starter’s one-day retention and no-PITR posture require a new immediate-before-execution snapshot recheck. A later D-03 decision must set a short UTC window whose end plus a two-hour post-closure margin remains before the then-current snapshot expiry; otherwise D-03 stops. No manual backup, restore, or production fallback is authorised here.

## 5. Runner account and source-derived privilege assessment

The exact tenant-prefixed principal `289ZyKGJwbC2SkB.d01_runner` is retained by owner decision for D-03 through D-06. The authenticated SQL editor rechecked `SHOW GRANTS FOR '289ZyKGJwbC2SkB.d01_runner'@'%';` at approximately `2026-09-13 14:23 UTC`; it returned `USAGE ON *.*` and `SELECT, CREATE, REFERENCES, ALTER, INDEX ON kinga_staging.*`.[2]

| D-03 action or check | Source-derived minimum privilege | Rechecked grant | Result |
|---|---|---|---|
| 50 `CREATE TABLE` statements | `CREATE` | Present on `kinga_staging.*` | Sufficient for this statement class. |
| 26 foreign-key `ALTER TABLE` statements | `ALTER`, `REFERENCES` | Both present on `kinga_staging.*` | Sufficient for this statement class. |
| 111 `CREATE INDEX` statements | `INDEX` | Present on `kinga_staging.*` | Sufficient for this statement class. |
| Required read-only metadata pre/postflight | `SELECT` | Present on `kinga_staging.*` | Sufficient for approved metadata inspection. |

No source-derived D-03 privilege gap was found, and no broader schema-level privilege appeared in the returned grant rows. This does not grant execution authority, waive a fresh preflight, or carry over D-02’s expired role-control exception. No account or grant was changed.

## 6. Resumption preflight criteria

The initial preflight passed before the controlled parser stop. Because the previous snapshot will expire, the owner-operated resumption must collect the following fresh **read-only** evidence immediately before ordinal 14. It must also establish the accepted 13-table partial state and absence of the remaining 37 D-03 tables, all 26 D-03 foreign keys, and all 111 D-03 explicit indexes.

| Check | Required accepted result | Stop condition |
|---|---|---|
| Target identity and TLS | Owner-approved TiDB Cloud organisation/project/cluster/database identity; `KINGA-staging`, `kinga_staging`, current service class, TLS, authenticated identity, and redacted grants. | Any target ambiguity, non-TLS connection, or privilege excess. |
| D-01/D-02 prerequisite metadata | Exactly 23 prior-wave tables with closed D-01/D-02 columns, keys, defaults, 9 FKs, and 58 explicit indexes; all prior-wave tables remain empty. | Any prerequisite mismatch. |
| Accepted partial-state metadata | Exactly the owner-reported 13 D-03 tables from original ordinals 1–13, all with zero rows, and no other D-03 table. | Missing, altered, non-empty, or unexpected D-03 table. |
| Remaining D-03 absence check | None of the remaining 37 D-03 table names, 26 D-03 FK names, or 111 D-03 explicit-index names exists. | Existing or unexpected pending D-03 object. |
| Revised source and separator proof | Revised source SHA-256 matches; 187 literal markers, one terminal empty fragment, 187 ordered statements with 50 tables, 26 FKs, and 111 indexes; resumption ledger contains only ordinals 14–187. | Hash, marker, split, class, count, ordering, or resume-boundary mismatch. |
| Recovery record | Fresh same-day successful snapshot covers the approved window plus a two-hour post-closure margin. | Missing, stale, failed, wrong-target, or insufficiently retained snapshot. |
| Roles and authority | Named D-03 operator, reviewer, application-validation owner, and stop authority; a new exception only if explicitly approved. | Any missing role, authority, or attempted D-02 exception carryover. |

## 7. Future postflight and closure criteria

Only if the revised D-03 execution completes all pending ordinals 14–187 without a deviation may the named reviewer compare staging metadata with the revised pinned source and retained Wave 3 scratch fingerprint. The expected state is exactly 73 tables, 26 D-03 foreign keys, 111 D-03 explicit indexes, the revised source-declared primary/unique/default/column structures, and zero rows in all 73 tables.

Any future smoke test is limited to separately authorised authenticated non-production connectivity and `COUNT(*)` reads. No data seed or write test is authorised. Closure requires retained statement results, expected-versus-actual metadata comparison, zero-row results, application-validation evidence, no unresolved unexpected object, and a distinct owner decision before D-04 is considered.

## References

[1]: ../../audit/gate-c-wave-three-review-2026-09-11.md "Gate C Wave 3 review record"
[2]: ../../audit/gate-d-d03-read-only-preflight-evidence-2026-09-13.md "D-03 fresh snapshot and exact-principal grant recheck"
[3]: ../../audit/gate-c-scratch-baseline/wave-03-generated/wave-03-assessment-evidence-reporting.sql "Immutable historical Wave 3 source SQL"
[4]: ../../audit/gate-d-text-default-compatibility-2026-09-14/README.md "D-03 TEXT default compatibility reconciliation"
[5]: d03-wave-03-revised-statement-hash-ledger-2026-09-14.md "D-03 revised 187-statement marker-split ledger"
[6]: d03-wave-03-resumption-ledger-2026-09-14.md "D-03 ordinal-14 onward resumption ledger"
