# D-02 Wave 2 Staging Change Packet — Review Draft

## Status and hard authority boundary

**Status: review draft only.** This packet prepares the second possible staging reconciliation change after completed D-01. It does **not** authorise a staging connection, snapshot inspection, account or grant creation, network change, DDL, DML, data seed, backup/restore action, application deployment, or any production work.

> **D-02 execution is prohibited pending a new, explicit owner decision.** The D-01 single-person review, application-observer, existing-administrator, browser-editor, temporary-access, and same-day-snapshot decisions all expired at D-01 closure. None transfers to D-02.

## 1. Packet identity

| Field | Draft value | Execution status |
|---|---|---|
| Packet ID | `D-02` | Review only |
| Purpose | Add the approved Wave 2 vehicle, claimant, driver, policy, inspection, and claim-core baseline after D-01. | Not authorised |
| Target | `KINGA-staging`, database `kinga_staging`, AWS Frankfurt (`eu-central-1`), Starter | Reconfirm only after a separate read-only-access decision. |
| Prerequisite | Completed D-01 root structures and D-01 postflight record. | Must be revalidated before D-02. |
| Operator | Unassigned | Must be named in a later execution authority. |
| Independent reviewer | Unassigned | Mandatory. The D-01 exception is unavailable. |
| Application-validation owner | Unassigned | Must be separately named before execution. |
| Change approver and stop authority | KINGA owner | Must issue a new written D-02 decision. |
| Production | `KINGA-production` | Explicitly excluded. |

## 2. Immutable source pins

| Control | Pinned value | Draft verification |
|---|---|---|
| Mainline at D-02 draft start | `956ab8055d590157ef10d091e1f8a4e6ba34542d` | Contains merged D-01 closure evidence. |
| Gate C source revision | `4336a2961147877a373a11a706e2a7ee4604f754` | Verified ancestor of the draft-start mainline. |
| Current `drizzle/schema.ts` SHA-256 | `0d07fd920f1b260c75b85ec25ce224cef48d6deb4fe0fef47d6dc0ceec03a17c` | Repository-only calculation. |
| D-01 prerequisite SQL SHA-256 | `306797ab94529860bc9e88a69a955061916a94ddc3d08e3265229780ab08083c` | D-01 closed with independent metadata reconciliation. |
| D-02 SQL artefact | `audit/gate-c-scratch-baseline/wave-02-generated/wave-02-vehicle-claim-core.sql` | Retained Gate C review artefact. |
| D-02 SQL SHA-256 | `15661c69490a4360931ef5fc3d17e2b4521f692730b2d113f1342117b067e7b9` | Recalculated locally from the immutable artefact. |
| Gate C scratch structural metadata SHA-256 | `2b7b1ba33cc6fbb729824d1ab447c6920cfdc5e6f9ffb6d60720f0414abf7897` | Cross-check only; not a live staging preflight result. |

Any source, schema, prerequisite, or SQL hash difference is a mandatory stop. The operator must not regenerate, edit, or substitute the source during a change window.

## 3. Approved D-02 scope

The reviewed D-02 artefact contains **87 Wave 2 statements**: 20 `CREATE TABLE`, 9 source-declared `ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY`, and 58 `CREATE INDEX`. It contains no `DROP`, DML, account/grant statement, backup/restore statement, database creation, or non-FK `ALTER` statement.[1]

| Scope category | Exact approved content |
|---|---|
| New tables | `claim_assignments`, `claim_documents`, `claims`, `drivers`, `inspections`, `insurance_audit_logs`, `insurance_carriers`, `insurance_policies`, `insurance_products`, `insurance_quotes`, `measurement_types`, `vehicle_condition_assessment`, `vehicle_condition_snapshots`, `vehicle_damage_history`, `vehicle_geometry_measurements`, `vehicle_market_valuations`, `vehicle_mileage_logs`, `vehicle_models`, `vehicle_passport_snapshots`, and `vehicle_registry`. |
| Prerequisite tables | D-01’s `tenant_invitations`, `tenants`, and `users`, already closed and independently reconciled. |
| Cumulative expected table count | 23: three D-01 prerequisite tables plus 20 D-02 tables. |
| Explicit secondary indexes | 58 `CREATE INDEX` statements, listed in Appendix A. |
| Primary/unique structures in D-02 table definitions | 20 primary keys and 7 explicitly declared unique structures. Together with 58 explicit indexes, this is 85 D-02 index structures and 98 cumulative structures including D-01. |
| Foreign keys | Exactly 9, listed in Section 3B. |
| Explicit exclusions | No table outside the 20 listed above; no held candidate; no deferred natural/composite unique rule; no data seed; no DML; no `DROP`; no non-FK `ALTER`; no account, network, backup, restore, application rollout, or production action. |

### 3A. Source-marker handling — mandatory execution control

> **D-02 does contain Drizzle-style `--> statement-breakpoint` markers. They are not valid MySQL/TiDB comments and must never be submitted as SQL.**

The exact pinned file contains **86** markers: 20 standalone marker lines following table statements and 66 inline terminators following the 9 foreign-key and 58 index statements. These delimit **87** executable statements but are not themselves executable statements.

If D-02 is later authorised, the original file remains immutable. The approved future operator method must perform an auditable, non-mutating marker split into exactly 87 semicolon-terminated statements, retain the original full-file SHA-256, calculate a separate hash for every emitted statement, and have the named independent reviewer compare the ordered statement ledger to this packet before any statement runs. A raw `mysql < wave-02-vehicle-claim-core.sql` invocation is prohibited because it would treat these markers as invalid SQL, as occurred in D-01.

Execution must be one statement at a time in this order: 20 tables, 9 foreign keys, then 58 indexes. Any parser error, omitted statement, unexpected extra statement, order change, source-hash difference, per-statement-hash difference, or server error stops D-02 immediately; no later statement may be sent.

### 3B. Approved foreign-key list

| Order | Constraint | Child column | Parent target | Delete / update action |
|---:|---|---|---|---|
| 21 | `claim_assignments_claim_id_claims_id_fk` | `claim_assignments.claim_id` | `claims.id` | Cascade / cascade |
| 22 | `claim_assignments_assigned_to_user_id_users_id_fk` | `claim_assignments.assigned_to_user_id` | D-01 `users.id` | Restrict / cascade |
| 23 | `claim_assignments_assigned_by_user_id_users_id_fk` | `claim_assignments.assigned_by_user_id` | D-01 `users.id` | Set null / cascade |
| 24 | `claim_documents_claim_id_claims_id_fk` | `claim_documents.claim_id` | `claims.id` | Cascade / cascade |
| 25 | `claim_documents_inspection_id_inspections_id_fk` | `claim_documents.inspection_id` | `inspections.id` | Set null / cascade |
| 26 | `vehicle_condition_assessment_claim_id_claims_id_fk` | `vehicle_condition_assessment.claim_id` | `claims.id` | Cascade / cascade |
| 27 | `vehicle_damage_history_claim_id_claims_id_fk` | `vehicle_damage_history.claim_id` | `claims.id` | Set null / cascade |
| 28 | `fk_vgm_vehicle_model` | `vehicle_geometry_measurements.vehicle_model_id` | `vehicle_models.id` | No action / no action |
| 29 | `vehicle_market_valuations_claim_id_claims_id_fk` | `vehicle_market_valuations.claim_id` | `claims.id` | Set null / cascade |

## 4. Recovery and short-window proposal

The successful D-01 restore rehearsal remains evidence that a Starter snapshot can restore into a separate disposable instance. It does **not** satisfy D-02’s recovery gate. Free Starter’s one-day snapshot retention and no-PITR limitation require a newly captured, successful, current-day `KINGA-staging` snapshot with expiry covering the entire D-02 change and a two-hour post-closure margin.

| Control | D-02 draft requirement |
|---|---|
| Current recovery record | A read-only Backup-page capture naming `KINGA-staging`, snapshot UTC timestamp, status **Succeeded**, expiry, and visible Restore action. |
| Service-class limitation | Owner must expressly accept the same-day Starter-only recovery limitation for D-02; the D-01 acceptance is expired and cannot be reused. |
| Proposed short window | **Four hours maximum:** first 90 minutes reserved for preflight and statement-by-statement execution, followed by 150 minutes for postflight, database-read smoke, evidence reconciliation, and closure. |
| Window scheduling rule | No fixed date/time is proposed before a current snapshot exists. The named owner must later choose UTC start/end on the same UTC date, starting no earlier than one hour after snapshot confirmation and ending at least two hours before snapshot expiry. |
| Stop rule | Missing, stale, failed, wrong-target, ambiguous, or insufficiently retained snapshot evidence stops D-02. Do not create a manual backup, substitute an older snapshot, or use production. |

## 5. Future preflight criteria — no live action authorised

Before any D-02 execution authority can be requested, a separate owner decision must authorise the named verifier to collect only the following read-only evidence.

| Check | Required accepted result | Stop condition |
|---|---|---|
| Target identity and TLS | Owner-approved TiDB Cloud organisation/project/cluster/database identity; `KINGA-staging`, `kinga_staging`, current region/service class, TLS, authenticated identity, and redacted grants. | Any target ambiguity, non-TLS connection, privilege excess, or runtime-secret reuse. |
| D-01 prerequisite metadata | Exactly `tenant_invitations`, `tenants`, and `users` match the D-01 audit’s columns, PKs, unique keys, defaults, and eight explicit indexes; all are empty. | Any D-01 mismatch. |
| D-02 absence check | None of the 20 D-02 table names, 9 D-02 FK names, or 58 D-02 explicit-index names exists. | Existing or unexpected D-02 object. |
| Source and separator proof | Full Wave 2 SHA-256 matches; marker count is 86; splitter ledger has exactly 87 ordered statements with 20 tables, 9 FKs, and 58 indexes. | Hash, class, count, ordering, or marker mismatch. |
| Recovery record | Fresh same-day successful snapshot meets the proposed window and two-hour safety margin. | Missing or expired recovery point. |
| Change roles | Named operator, **independent reviewer**, application-validation owner, observer, and stop authority. | Any missing role or an attempted carryover of a D-01 exception. |

## 6. Future postflight and closure criteria

If—and only if—future D-02 execution completes all 87 approved statements without a deviation, the independent verifier must compare current metadata with the pinned source and retained Wave 2 scratch fingerprint. The expected server state is exactly 23 tables, 9 named foreign keys, 58 named explicit secondary indexes, and the primary/unique/default/column structures in the source definitions.

The database smoke test is limited to authenticated non-production connectivity and `COUNT(*)` reads over the three D-01 plus 20 D-02 tables. No data seed or write test is authorised. Because staging is not a deployed application runtime target, this is not an end-user application deployment test.

Closure requires redacted statement-result records, expected-versus-actual metadata comparison, zero-row results for all 23 tables, application-validation record, runner/verifier revocation evidence, no unresolved unexpected object, and a distinct owner decision before D-03 is considered.

## Appendix A — explicit index inventory

| Table | Index and columns |
|---|---|
| `claim_assignments` | `idx_claim_assignments_claim_active (claim_id, status)`; `idx_claim_assignments_assignee_active (assigned_to_user_id, status)`; `idx_claim_assignments_tenant_role (tenant_id, assignment_role, status)`; `idx_claim_assignments_parent (parent_assignment_id)` |
| `claim_documents` | `idx_claim_id (claim_id)`; `idx_uploaded_by (uploaded_by)`; `idx_category (document_category)`; `idx_cd_inspection_id (inspection_id)` |
| `claims` | `claims_claim_number_unique (claim_number)`; `idx_claims_vehicle_registry_id (vehicle_registry_id)`; `idx_claims_claimant_id (claimant_id)`; `idx_claims_assigned_assessor_id (assigned_assessor_id)`; `idx_claims_status (status)`; `idx_claims_created_at (created_at)`; `idx_claims_tenant_workflow_created (tenant_id, workflow_state, created_at)`; `idx_fraud_risk_score (fraud_risk_score)`; `idx_confidence_score (confidence_score)`; `idx_routing_decision (routing_decision)`; `idx_policy_version_id (policy_version_id)`; `idx_claims_tenant_status (tenant_id, status)`; `idx_claims_tenant_created (tenant_id, created_at)`; `idx_claims_fleet_driver_id (fleet_driver_id)` |
| `drivers` | `idx_drivers_full_name (full_name)`; `idx_drivers_email (email)`; `idx_drivers_phone (phone)`; `idx_drivers_national_id (national_id_number)`; `idx_drivers_tenant (tenant_id)`; `idx_drivers_risk_score (driver_risk_score)`; `idx_drivers_repeat_claimer (is_repeat_claimer)` |
| `inspections` | `idx_inspections_tenant (tenant_id)`; `idx_inspections_claim (claim_id)`; `idx_inspections_project (project_id)`; `idx_inspections_engineer (assigned_engineer_id)`; `idx_inspections_asset (asset_registry_id)`; `idx_inspections_vehicle (vehicle_registration)`; `idx_inspections_status (status)` |
| `insurance_carriers` | `insurance_carriers_short_code_unique (short_code)` |
| `insurance_policies` | `insurance_policies_policy_number_unique (policy_number)` |
| `insurance_quotes` | `insurance_quotes_quote_number_unique (quote_number)` |
| `vehicle_condition_snapshots` | `idx_vehicle_condition_snapshot_vehicle_date (vehicle_registry_id, snapshot_date)`; `idx_vehicle_condition_snapshot_tenant_vehicle (tenant_id, vehicle_registry_id)` |
| `vehicle_damage_history` | `idx_vdh_vehicle_id (vehicle_id)`; `idx_vdh_claim_id (claim_id)`; `idx_vdh_vehicle_reg (vehicle_registration)`; `idx_vdh_damage_zone (damage_zone)`; `idx_vdh_severity (severity)`; `idx_vdh_tenant (tenant_id)`; `idx_vdh_repairer (repairer_id)`; `idx_vdh_repeat_zone (is_repeat_zone)` |
| `vehicle_passport_snapshots` | `idx_vps_vehicle_registry_id (vehicle_registry_id)`; `idx_vps_registration_number (registration_number)`; `idx_vps_tenant_id (tenant_id)`; `idx_vps_generated_at (generated_at)` |
| `vehicle_registry` | `idx_vehicle_registry_registration (registration_number)`; `idx_vehicle_registry_make_model (make, model)`; `idx_vehicle_registry_tenant (tenant_id)`; `idx_vehicle_registry_risk_score (vehicle_risk_score)`; `idx_vehicle_registry_repeat_claimer (is_repeat_claimer)` |

## References

[1]: ../../audit/gate-c-wave-two-review-2026-09-11.md "Gate C Wave 2 scratch baseline review"
[2]: ../../audit/gate-c-scratch-baseline/wave-02-generated/wave-02-vehicle-claim-core.sql "Pinned Wave 2 source SQL"
[3]: ../../audit/gate-c-scratch-baseline/wave-02-evidence/run_a/replay.json "Wave 2 retained scratch replay evidence"
[4]: gate-d-execution-readiness-plan.md "Gate D execution readiness controls"
[5]: gate-d-d01-owner-executed-postflight-2026-09-12.md "D-01 closure evidence"
