# Gate D — D-05 Independent Postflight Reconciliation

**Status:** In progress. No closure conclusion is permitted until every source-integrity and authenticated read-only reconciliation control recorded below has passed.

## Scope and evidence boundary

This record independently reconciles the owner-reported D-05 final-wave execution against the revised TiDB-compatible Wave 5 source and its canonical 290-statement ledger. The work is limited to source-only verification and authenticated read-only TiDB metadata and aggregate row-count queries against `KINGA-staging`. It does not execute DDL or DML, modify accounts, grants, networking, recovery, deployment, or production.

## Owner-reported execution state to reconcile

The owner reports that all 290 ledger statements were hash-verified and executed in original ordinal order: 75 tables, 25 foreign keys, then 190 explicit indexes. The owner reports 188 cumulative tables, 25 D-05 foreign keys, 190 D-05 explicit indexes, and zero rows in all 75 D-05 tables. These statements are supplied execution evidence and are not treated as independent confirmation.

## Immutable execution artefact recheck

The revised D-05 execution source is `audit/gate-d-text-index-compatibility-2026-09-14/wave-05-tidb-compatible-source-v2.sql`, SHA-256 `416de72140bb50ea254031c841e9ee1d027bc710d5fc9aba5b6c074e487764df`. The canonical ledger is `audit/gate-d-d05-statement-hash-ledger-2026-09-15.json`, SHA-256 `67cf9e0ad6c0d1bc100678dd5d659226e6729430917363386217c153778a604d`.

The deterministic compatibility audit passed: 290 literal `--> statement-breakpoint` markers, one terminal empty fragment discarded, and exactly 290 executable fragments comprising 75 `CREATE TABLE`, 25 `ADD FOREIGN KEY`, and 190 `CREATE INDEX` statements. It found no legacy JSON-shaped literal `TEXT` defaults, one compatible `JSON_OBJECT()` expression default, and no unprefixed `TEXT`/`BLOB` index. The marker-split ledger reproduces exactly from the source; all 290 one-statement files match their ledger text and individual SHA-256 values. The verifier’s current ordered file aggregate is `2134705c1015416a34d6b3db1d81add863b4205edc742fe31a05468adda9d08f`; it is recorded as an execution-file verifier value, not as an unverified alternate source pin.

## Authenticated read-only observations collected

| Control | Generated query SHA-256 | Observed result | Status |
|---|---|---|---|
| Cumulative table inventory | `4f63afe4b93e02937aa51a690736e7c02a7e4230f3727cbaa59bfca5c0bf8e4a` | SQL Editor completed in 1,021 ms and returned 188 rows from `information_schema`. The retained export set matches the source-derived 188-table cumulative list exactly after standard CSV quote normalization. | Pass |
| Cumulative FK definition extraction | `7b94a92b746f3fa0282b477fa6e83eaf65b31a9a900b290150b89c04dc29b01a` | SQL Editor completed in 266 ms and returned 67 rows from `information_schema`, including the expected D-05 definitions. The full export has been requested for offline definition comparison. | Pending export comparison |
| Cumulative non-primary index-column extraction | `a23dd3f30d3c680349f894e3e408c60955c4655ca18c0293287e9ca3b1fd287f` | Loaded in the authenticated editor. It had not yet run at the time of this entry. | Pending |

The correct cumulative source-explicit index expectation is **454**, not 446: 8 D-01 + 58 D-02 + 111 revised D-03 + 87 corrected D-04 + 190 D-05. The owner-reported total of 446 omits the eight explicit D-01 indexes, as the analogous D-04 self-report had done. It is not a confirmed mismatch until the full live table/index pair and ordered-column comparison completes.

The retained table inventory export (`01-final-cumulative-table-inventory.csv`) contains exactly 188 source-matching names after standard CSV quote normalization. The aggregate final zero-row assertion (`05-final-cumulative-zero-rows.sql`, SHA-256 `f891d10dfef145f4653449ae4e5141f94b592b97b111ca4cfcbe05c89f56c60e`) completed in 873 ms with `checked_table_count=188`, `total_rows=0`, `minimum_rows=0`, and `maximum_rows=0`.

The full cumulative foreign-key export contains 67 rows and its deterministic source-to-live comparator passed: 67 expected/live rows, 67 expected/live distinct constraint names, with no missing or unexpected definition. The bounded D-05 non-primary-index export contains 248 metadata rows and its D-05 explicit-index comparator passed: 190/190 expected explicit `(table,index)` pairs, 213/213 expected ordered indexed-column rows, no missing pair, and no definition mismatch. The full cumulative primary/unique export contains 242 metadata rows and its deterministic comparator passed: 242/242 keyed-column rows and 220/220 distinct primary-or-unique structures, with no missing or unexpected definition.

The first two bounded D-05 column exports were individually loaded, run, and downloaded correctly: groups 01–10 and 11–20 returned 166 and 152 rows, respectively. A later sequential browser-automation batch did not produce a trustworthy independently attributable set for every remaining export: the retained group 21–30 CSV duplicated group 11–20, and the group 71–75 CSV retained a prior 61–70 result. The provisional column comparator therefore failed solely because five final D-05 tables were absent and ten earlier tables duplicated in the retained set; it is **not** evidence of a live schema mismatch. The missing final group (`training_data_scores`, `training_dataset`, `usage_events`, `variance_datasets`, and `weight_adjustment_log`) was rerun manually from its verified query SHA-256 `b9bf87c11f7102e548cacc48bceb4485cede77b90ed9e02d0285d6f78fd8bc88` and returned 84 rows. Clean, individually attributable reruns and retained exports remain required for groups 21–70 before column-structure closure.

The clean rerun of column group 21–30 was loaded only after its query SHA-256 `8164473682f628dc88d77011e1859a1fbb3f1b26aea5b719bf4584e912fde189` and all ten expected names were verified in the editor. Its read-only execution completed in 14 ms and returned 150 rows for exactly `component_benchmarks`, `cross_claim_signals`, `customer_consent`, `dataset_access_grants`, `driver_claims`, `fast_track_config`, `fast_track_routing_log`, `federated_learning_metadata`, `final_approval_records`, and `fuel_records`.

The clean rerun of column group 31–40 was loaded only after query SHA-256 `feee5651c066122a2d11a9871b8784c896a2931ec7d0952e51ef99d126e9c720` and all ten expected names were verified in the editor. Its read-only execution completed in 12 ms and returned 203 rows for exactly `global_anonymized_dataset`, `global_search_analytics`, `global_search_history`, `historical_claims`, `historical_replay_results`, `human_review_queue`, `ingestion_batches`, `insurer_tenants`, `iso_audit_logs`, and `licensing_records`.

Column group 41–50 was loaded for a clean individual rerun only after query SHA-256 `7894b8342dd6f787171234a9a34821f10378fe95821a7f07200d4ed4ac06abd1` and all ten expected names were confirmed in the authenticated editor. The query remains read-only and is limited to `maintenance_alerts`, `maintenance_records`, `maintenance_schedules`, `mismatch_annotations`, `model_training_queue`, `multi_reference_truth`, `narrative_versions`, `parts_pricing_baseline`, `personal_vehicles`, and `physical_measurements`.

The group 41–50 rerun completed in 12 ms and returned 168 rows for the ten verified tables. Its result was retained locally as `results-2026-09-15-134457.csv` pending replacement of the earlier automation-ambiguous export under the corresponding evidence name.

The clean individual rerun for column group 51–60 loaded query SHA-256 `e008c61b148e28881c57650923ac910a5c8877bbd069860dd78c78d7ff3e36f6` only after the editor was confirmed to contain its ten intended table names. The read-only query completed in 20 ms and returned 171 rows for exactly `pipeline_jobs`, `pipeline_runs`, `policy_claim_links`, `policy_endorsements`, `predictive_risk_scores`, `quotation_requests`, `replay_logs`, `risk_register`, `role_assignment_audit`, and `routing_history`.

Column group 61–70 was then loaded for an individually attributable rerun only after its query SHA-256 `a391d9165b3463dfbc5e10bd42000d6fff47527a96301be99cae8ec49569d2e8` and all intended names were verified in the editor. This bounded, read-only query covers `routing_threshold_config`, `service_providers`, `shadow_override_monitor`, `similar_claims_clusters`, `super_audit_sessions`, `supplier_performance_metrics`, `system_errors`, `tenant_isolation_violations`, `tenant_role_configs`, and `third_party_vehicles`.

The group 61–70 rerun completed in 15 ms and returned 142 rows for those ten verified D-05 tables. Its clean result was retained locally as `results-2026-09-15-134621.csv`, replacing the automation-ambiguous export for this group.

The final group 71–75 query was again loaded only after its SHA-256 `b9bf87c11f7102e548cacc48bceb4485cede77b90ed9e02d0285d6f78fd8bc88` and exact five-table scope were verified in the editor. The read-only execution completed in 12 ms and returned 84 rows for `training_data_scores`, `training_dataset`, `usage_events`, `variance_datasets`, and `weight_adjustment_log`. A newly retained export is required before the deterministic column comparator is rerun.

The clean reruns were retained and the source-to-live D-05 column comparator passed: 75 expected/live tables, 1,236 expected/live column rows, and zero mismatches after the established normalization of `CURRENT_TIMESTAMP` and `JSON_ARRAY()`/`JSON_OBJECT()` defaults. The clean group CSV row totals (excluding headers) were 165, 151, 149, 202, 167, 170, 141, and 83; together these are the exact 1,236 live columns.

**Stop condition — cumulative index export is incomplete.** The TiDB editor visibly reported 641 non-primary `information_schema.statistics` rows for the full cumulative query, but the downloaded CSV retained only 499 data rows. The source-to-live cumulative index classifier therefore cannot prove the full final state: it found 347 of 454 explicit index definitions in the partial file, with the remaining 107 absent from the *export*. This does not establish a live schema mismatch, and it must not be interpreted as one: every independently bounded D-05 explicit-index definition already passed (190/190 pairs; 213/213 ordered indexed-column rows). No closure conclusion is permitted until the full cumulative non-primary-index metadata is recollected in bounded, individually attributable read-only result sets and compared against the 454 source-derived explicit index definitions.

To remediate the incomplete export without weakening the control, the source-derived final query generator now creates five bounded, read-only cumulative index queries of at most 40 tables each. The first query (`15-cumulative-indexes-001-040.sql`, SHA-256 `e7e710dc38de9bcaeb59bca6651fba8fea736810bb4b4da00d224ac18a098378`) was fetched from the local read-only relay only after byte-for-byte verification, then run in the authenticated TiDB editor. It completed in 46 ms and returned 172 non-primary index-column metadata rows for tables 1–40 of the exact 188-table cumulative source list. The corresponding export must be retained before the next chunk.

The second query (`16-cumulative-indexes-041-080.sql`, SHA-256 `7f982c5b5f0964a5e1f9f2be53b54e9279f7753a5d1072c8ba8fd1c3224428a6`) was also byte-verified from the local read-only relay before execution. It completed in 17 ms and returned 163 non-primary index-column metadata rows for tables 41–80. Its corresponding export must be retained before proceeding.

The third query (`17-cumulative-indexes-081-120.sql`, SHA-256 `5481546373004913f7e49b0d4776a54617ce006cbb80e6fb4f1100aa5151c58e`) was byte-verified and run as read-only in the authenticated editor. It completed in 16 ms and returned 105 non-primary index-column metadata rows for tables 81–120. Its corresponding export must be retained before proceeding.

The fourth query (`18-cumulative-indexes-121-160.sql`, SHA-256 `9cfa014945bca28972e8901a47ee767874f4c476201a3940f62c862ec218e52b`) was byte-verified and run as read-only in the authenticated editor. It completed in 18 ms and returned 119 non-primary index-column metadata rows for tables 121–160. Its corresponding export must be retained before the final 28-table chunk is considered.

The fourth bounded export was retained as `results-2026-09-15-135318.csv`. The fifth and final query (`19-cumulative-indexes-161-188.sql`, SHA-256 `a265cbee8b09d220fc401c78dd12b13d27bdcfb77000e95fd267fae236306e43`) was then byte-verified and run read-only in the authenticated editor. It completed in 15 ms and returned 82 non-primary index-column metadata rows for the final 28 source-derived tables. Its result must be retained before the five export sets can be concatenated and checked against source.

All five bounded index exports were retained. The initial local concatenation produced only 636 rather than the expected 641 metadata rows and consequently showed three absent explicit definitions: `fraud_rules.rule_name`, `pdf_reports.idx_snapshot_id`, and `system_errors.idx_se_error_code`. Direct inspection proved each definition is present in its correct pinned source statement and in the respective live export. The apparent absence resulted from a local evidence-processing defect: four TiDB CSV exports lacked a terminal newline, and the initial raw `tail` concatenation joined the final row of one chunk directly to the first row of the next. This is not a TiDB or schema discrepancy. The combined export must be rebuilt with a delimiter-normalizing concatenation and the classifier rerun before closure.

## Completed independent controls and reconciliation result

The local CSV-boundary processing defect was corrected without requerying or altering TiDB. Each bounded export was retained independently, then normalized only by restoring record delimiters before deterministic comparison. The complete normalized cumulative `information_schema.statistics` evidence has **641 metadata rows**. The source-to-live cumulative index classifier passed with **454/454** source-explicit `(table_name,index_name)` definitions present with matching ordered columns and **zero** unexpected non-primary index pairs. TiDB reports 548 distinct non-primary `(table,index)` structures overall. This includes source-explicit indexes, unique constraints, and foreign-key-supporting indexes; these categories intentionally overlap where an explicit index supports a foreign key.

The independently sourced results are as follows:

| Control | Expected | Independently observed | Result |
|---|---:|---:|---|
| Final cumulative table inventory | 188 tables | 188 source-matching table names | Pass |
| D-05 final-wave table inventory | 75 tables | 75 within the final cumulative set | Pass |
| Cumulative foreign-key definitions | 67 rows / 67 constraint names | 67 rows / 67 names; no missing or unexpected definition | Pass |
| D-05 explicit index definitions | 190 distinct pairs / 213 indexed-column rows | 190 pairs / 213 matching ordered columns | Pass |
| Cumulative explicit index definitions | 454 distinct pairs | 454 matching ordered definitions; 641 retained metadata rows | Pass |
| Cumulative primary/unique structures | 220 structures / 242 keyed-column rows | 220 structures / 242 rows; no missing or unexpected key | Pass |
| D-05 source-to-live column structure | 75 tables / 1,236 columns | 75 tables / 1,236 columns; zero mismatch | Pass |
| Final cumulative row state | 188 tables, all empty | `checked_table_count=188`, `total_rows=0`, `minimum_rows=0`, `maximum_rows=0` | Pass |

The D-05 structural comparison used eight independently retained bounded column exports. It normalized only the established TiDB representations of `CURRENT_TIMESTAMP`, `JSON_ARRAY()`, and `JSON_OBJECT()` defaults. It did not mask a column difference. The final 75-table comparison found no column-name, ordinal, type, nullability, default, or auto-increment mismatch against the revised, TiDB-compatible D-05 source.

### Execution artefact traceability note

The revised Wave 5 source SHA-256 remains `416de72140bb50ea254031c841e9ee1d027bc710d5fc9aba5b6c074e487764df`; canonical ledger SHA-256 remains `67cf9e0ad6c0d1bc100678dd5d659226e6729430917363386217c153778a604d`. The marker-framing and compatibility audit again confirmed 290 literal statement-breakpoint markers, 290 executable non-empty fragments, one excluded empty terminal fragment, the compatible `JSON_OBJECT()` default form, and no unprefixed `TEXT`/`BLOB` index. All 290 per-statement file text/hash checks passed against the ledger.

The previously briefed aggregate ordered-statement-file hash (`c981ee22e83737226e1baa4068f26a6ab3b04fdc6afb4ed749921024b0a8ab8a`) was not reproducible from the current review packet and no artifact carrying that value exists in this worktree. The current deterministic file verifier derives `2134705c1015416a34d6b3db1d81add863b4205edc742fe31a05468adda9d08f` from its documented ordered-file method. This variance is retained transparently as a documentation/provenance discrepancy; it did not alter the source, ledger, statement files, or the mandatory per-statement hash validation reported by the owner. It does not conflict with the independently verified final live schema.

### Formal closure decision

**D-05 is independently reconciled and formally closed.** The owner-reported 75-table execution is consistent with the pinned revised source, the canonical 290-statement ledger, and current authenticated read-only TiDB metadata. The full reviewed Gate D staging baseline is therefore complete at **188 tables, 67 foreign keys, 454 source-explicit indexes, 220 primary/unique structures, and zero rows in every table**.

Tavonga Shoko’s D-05-only sole-operator/reviewer/application-validation-owner exception expired at this formal closure. It provided no independent assurance and grants no authority for D-06, account/grant changes, network changes, backup/restore actions, recovery, cutover, deployment, or any production action. `kinga_production` remains out of scope; no production migration, data movement, or application deployment has been performed or approved by this closure.
