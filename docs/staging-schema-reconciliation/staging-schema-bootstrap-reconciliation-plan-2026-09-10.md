# KINGA Staging TiDB Schema Bootstrap and Reconciliation Plan

**Status:** Review only — no DDL, migration, data copy, environment switch, or production operation is authorised by this document.
**Prepared:** 10 September 2026
**Target:** `kinga_staging` only
**Source baseline:** KINGA repository `main` reviewed on 10 September 2026.

> **Decision requested:** approve the planning baseline and sequence below before any temporary migration identity is created or any statement is applied to TiDB staging.

## 1. What has been verified

The staging connection is real, encrypted and intentionally least-privilege. The dedicated verification account connected to `kinga_staging` over TLS (`TLS_AES_128_GCM_SHA256`) on TiDB Serverless `v8.5.3`, exposed only `SELECT`-class access, and returned no application tables from metadata. The smoke test neither read claim/customer/evidence rows nor changed an object. [1]

The staging database is therefore **reachable but not application-ready**. It contains zero visible application tables. The reproducible current-main manifest count is **226 MySQL declarations representing 221 distinct MySQL/TiDB physical table names**, plus **16 PostgreSQL auxiliary declarations**, for **242 production-schema declarations**. The configured `drizzle/schema.ts` entrypoint alone defines **218 MySQL declarations and 3,939 columns**; supplementary schema modules add the remaining declarations and include five duplicate physical table names that require an authority decision rather than duplicate DDL. [2]

> **Count correction:** the previously referenced figure of **254 source tables** cannot be reproduced from current GitHub `main` (`484c8e1b`). The manifest also finds five test-only table-factory calls, making 247 factory calls across production schema files and tests, not 254. This plan therefore uses the reproducible 242-declaration / 221-distinct-MySQL-name inventory as its review baseline and does not silently round the difference.

The existing migration chain cannot be treated as a trusted bootstrap artefact. The earlier drift audit found 89 source tables and 1,443 source columns with no matching primary-chain creation record, plus another 209 missing columns on 15 migration-created tables. It also records a journal gap, a partially failing claims-comments migration and a text-index migration defect. [3]

| Verified fact | Consequence for staging bootstrap |
|---|---|
| `kinga_staging` has zero tables | There is no existing application data to preserve in this database today, but no destructive operation is permitted without a separate approval because future test data may arrive. |
| 242 production-schema declarations / 221 distinct MySQL physical names exist | A full source inventory must be classified; it must not be assumed that every source declaration deserves immediate DDL. |
| 82 SQL files exist under `drizzle/` and subdirectories | File count is not a reliable deployment sequence. Some files are legacy, manually added, supplementary or outside the journal. |
| Drizzle journal jumps from `0055` to `0060` | Standard journal-driven migration cannot be used as the bootstrap path until this integrity defect is repaired and replay-proven. [4] |
| `scripts/db-push.mjs` auto-accepts generate prompts then runs migrate | It must **not** be used against TiDB staging during bootstrap planning or execution. It is not a review gate. [5] |

## 2. Objectives and non-objectives

The objective is to produce a **reproducible, reviewed schema baseline** for a clean TiDB staging database, followed by structural verification. The process must preserve KINGA’s tenant and evidence controls, prove migration chain integrity in disposable environments first, and create records sufficient for a later production decision.

This plan does **not** authorise the following:

| Explicitly out of scope now | Reason |
|---|---|
| Applying DDL or `drizzle-kit migrate` to `kinga_staging` | The migration chain has known integrity defects and must be repaired/replayed in disposable infrastructure first. |
| `drizzle-kit push`, `scripts/db-push.mjs`, or any auto-accepted schema prompt | The current helpers can generate and apply changes without a human SQL review. |
| Copying any managed database data, claims, documents, users, quotes, evidence or workflow records | Data migration needs a separate authority, sanitisation plan, reconciliation method and restore rehearsal. |
| Replacing the current managed `DATABASE_URL` | Staging must be connected through an explicitly separate application configuration only after schema readiness is approved. |
| Any connection, DDL, data action, secret change or cutover against KINGA production | Production requires separate approval after staging gates pass. |

## 3. Required artefacts before execution

The execution team should create the following **before** changing any TiDB object. These are design/review artefacts, not migrations.

| Artefact | Owner | Acceptance condition |
|---|---|---|
| Immutable source baseline | Engineering | Record the Git commit SHA, `pnpm-lock.yaml` checksum, `drizzle/schema.ts` checksum and migration-journal checksum. |
| Expected-schema manifest | Engineering | Machine-generated list of table names, columns, types, nullable/default/index/FK properties from all source schema modules; review duplicate table declarations explicitly. |
| Migration-artifact manifest | Engineering | Classify each SQL file as registered primary-chain, journal-skipped, supplementary/manual, one-off repair, PostgreSQL-only, or obsolete. |
| Drift decision ledger | Engineering + product/data owner | For each source-vs-migration gap, identify: baseline-required, compatibility-only, legacy-retained, deferred, or needs business decision. |
| TiDB staging protection record | Data owner | Record cluster ID, region, firewall state, backup/PITR capability, retention settings, database name and named administrators. No passwords in this record. |
| Restore rehearsal runbook | Data/platform owner | Define the exact snapshot/export method, a non-destructive recovery target, acceptance checks and decision authority. |
| Change packet | Engineering + reviewer | Exact SQL, checksum, expected metadata delta, rollback route, owner, time window and stop conditions for each executable batch. |

## 4. Expected table inventory

The following is the complete **source expectation inventory** extracted from current `drizzle/` TypeScript schema declarations. It contains **221 distinct table names**. It is an inventory for classification and review; it is **not** a direction to create all 221 tables in one deployment.

```text
access_denial_log
adjuster_sign_offs
agency_assisted_claimant_identities
agency_clients
agency_documents
agency_insurance_service_request_insurers
agency_insurance_service_requests
agency_insurance_valuation_deviations
agency_product_commission_configs
ai_assessments
ai_prediction_logs
anonymization_audit_log
appointments
approval_workflow
assessor_deviation_metrics
assessor_evaluations
assessor_insurer_relationships
assessor_marketplace_reviews
assessor_report_attachments
assessor_report_reviews
assessor_reports
assessor_subscriptions
assessors
asset_registry
audit_logs
audit_trail
automation_audit_log
automation_policies
benchmark_deviations
bias_detection_flags
calibration_overrides
claim_approvals
claim_assignments
claim_comment_reads
claim_comments
claim_confidence_scores
claim_decision_lifecycle
claim_documents
claim_events
claim_evidence_findings
claim_intake_requests
claim_intelligence_dataset
claim_involvement_tracking
claim_review_queue
claim_routing_decisions
claimant_history
claims
client_insurance_service_requests
client_vehicle_valuation_requests
commission_records
component_benchmarks
component_repair_outcomes
cost_components
cost_learning_records
country_repair_index
cross_claim_signals
currency_exchange_rates
customer_consent
customer_documents
dataset_access_grants
decision_snapshots
document_naming_templates
document_versions
driver_claims
drivers
email_verification_tokens
engineer_observations
engineer_profiles
entity_relationships
extracted_document_data
extracted_repair_items
fast_track_config
fast_track_routing_log
federated_learning_metadata
final_approval_records
fleet_accounts
fleet_audit_logs
fleet_documents
fleet_drivers
fleet_incident_reports
fleet_intelligence_snapshots
fleet_manager_requests
fleet_rfq_client_instructions
fleet_risk_scores
fleet_vehicles
fleets
fraud_alerts
fraud_indicators
fraud_rules
fuel_records
generated_reports
geometry_sources
global_anonymized_dataset
global_search_analytics
global_search_history
governance_audit_log
governance_notifications
governance_violation_log
historical_claims
historical_replay_results
human_review_queue
ingestion_batches
ingestion_documents
inspection_projects
inspections
insurance_audit_logs
insurance_carriers
insurance_policies
insurance_products
insurance_quotes
insurer_marketplace_links
insurer_marketplace_relationships
insurer_quote_requests
insurer_tenants
iso_audit_logs
licensing_records
maintenance_alerts
maintenance_records
maintenance_schedules
marketplace_profiles
marketplace_transactions
measurement_types
mismatch_annotations
model_training_audit_log
model_training_queue
model_version_registry
multi_reference_truth
narrative_versions
notification_events
notification_preferences
notifications
organizations
panel_beater_quotes
panel_beaters
part_stratification
parts_pricing_audit_log
parts_pricing_baseline
parts_pricing_overrides
pdf_reports
personal_vehicles
photo_reextraction_jobs
physical_measurements
physics_validation_records
pipeline_jobs
pipeline_runs
platform_governance_limits
police_reports
policy_claim_links
policy_documents
policy_endorsements
pre_accident_damage
predictive_risk_scores
quality_metrics
quotation_request_documents
quotation_requests
quote_evidence_gaps
quote_evidence_ledger
quote_line_items
quote_optimisation_results
rate_limit_tracking
recovery_cases
recovery_correspondence_log
reference_dataset
regional_benchmarks
regional_pricing_multipliers
registration_requests
repair_cost_intelligence
repair_history
replay_logs
report_access_audit
report_links
report_provenance_snapshots
report_snapshots
risk_register
role_assignment_audit
routing_history
routing_threshold_config
service_providers
service_quotes
service_requests
shadow_override_monitor
similar_claims_clusters
super_audit_sessions
supplier_performance_metrics
supplier_quote_line_items
supplier_quotes
system_errors
tenant_invitations
tenant_isolation_violations
tenant_role_configs
tenant_tier_history
tenant_usage_summary
tenant_workflow_configs
tenants
third_party_vehicles
training_data_scores
training_dataset
training_records
usage_events
user_invitations
users
valuation_comparable_evidence
variance_datasets
vehicle_condition_assessment
vehicle_condition_snapshots
vehicle_damage_history
vehicle_geometry_measurements
vehicle_history
vehicle_landmarks
vehicle_market_valuations
vehicle_mileage_logs
vehicle_models
vehicle_passport_snapshots
vehicle_registry
vision_calibration_results
weight_adjustment_log
whatsapp_sessions
workflow_audit_trail
workflow_configuration
workflow_states
workflow_templates
```

## 5. Reconciliation method before any migration is generated

The team must create a three-way record for every source table and column:

| Source of truth | What it proves | What it does **not** prove |
|---|---|---|
| Current Drizzle source | What the application presently declares and type-checks against | Whether the declaration is still product-required or represents historic/unused capability. |
| Checked-in SQL + Drizzle journal | What the repository says might be created through its historical migration path | Whether the statements are registered, apply cleanly, or match a real database. |
| Staging `information_schema` | What exists in `kinga_staging` at the time of inspection | Whether the object is correct without a typed structural comparison. |

For the present empty staging database, every expected table is **absent in staging**. That does not automatically make every table a bootstrap candidate. The drift decision ledger must classify each object as follows:

| Classification | Execution result |
|---|---|
| Required baseline table/column | Included in a reviewed staging baseline batch. |
| Active application dependency but design ambiguity | Held for an explicit product/data decision; no guessed DDL. |
| Compatibility/legacy table | Retained or deferred only with an owner and explanation. |
| Superseded/duplicate source declaration | Removed or corrected in source/migration design before bootstrap; not copied blindly. |
| Existing migration-chain repair | Repaired in a separate tooling batch before bootstrap-generated SQL is trusted. |

## 6. Dependency-safe execution sequence

The following sequence is intentionally conservative. It is a **proposed run order**, not a command list.

### Gate A — Freeze and inspect

1. Freeze the schema baseline commit for the exercise; record its checksum.
2. Record TiDB staging database metadata and the zero-table result again immediately before any later execution.
3. Export the expected-schema and migration-artifact manifests.
4. Review duplicate declarations and out-of-band schema modules (`claim-comments-schema.ts`, replay/routing/super-audit/usage modules) before choosing the target manifest.
5. Approve the drift decision ledger and the final baseline table/column set.

**Stop condition:** any object has an unclear business owner, a contradictory declaration, a source/physical-name ambiguity, or a proposed destructive change.

### Gate B — Repair migration-chain integrity in disposable infrastructure

1. Create an isolated disposable MySQL/TiDB-compatible scratch database that is **not** `kinga_staging` and contains no KINGA data.
2. Reconcile the `0056`–`0059` journal gap, but do not hand-edit history that may have been applied elsewhere. The corrective chain must make its intent explicit and be reviewed as a new artefact.
3. Split/fix the `0058_claim_comments_extend.sql` failure mode: its first `CHANGE COLUMN` assumes `userId`, while the prior migration chain indicates `user_id`; do not allow one failed multi-operation `ALTER` to hide later additions. [3]
4. Correct the `0045` text-index defect with an explicit key-prefix design where the index is still required; verify whether later intended indexes are absent after the historic failure. [3]
5. Bring the unregistered `rate_limit_tracking` definition into a controlled, journaled design only after verifying its target structure.
6. Replay the repaired chain from an empty scratch database with non-interactive, reviewed input. Do not use `scripts/db-push.mjs`; its auto-answer behavior is unsuitable for this gate. [5]

**Exit evidence:** exact migration file list/checksums; clean replay log; migration journal state; `information_schema` table/column/index/FK manifest; no unexpected DDL; and a reviewer sign-off.

### Gate C — Generate a reviewed schema baseline, in waves

Once Gate B is replay-proven, generate candidate SQL from the approved source manifest. Split it into logical waves. Each wave may proceed only after the previous one has a clean scratch replay and metadata comparison.

| Wave | Purpose and example dependency roots | Allowed change shape | Primary review focus |
|---|---|---|---|
| C1 | Tenant, identity, organisation and core reference roots: `tenants`, `users`, `organizations`, insurer/panel-beater/assessor roots, product/policy roots, lookup/config tables | `CREATE TABLE` only in a fresh bootstrap database | Primary keys, tenant fields, unique constraints, physical column names and referenced root availability. |
| C2 | Vehicle, claimant, driver, policy and claim core: `vehicle_registry`, `drivers`, `insurance_policies`, `claims`, `claim_documents`, `claim_events`, `claim_comments`, quote-request roots | `CREATE TABLE` only | Parent relationships, mandatory tenant/claim predicates and foreign-key order. |
| C3 | Assessment, evidence, quotes, decision, pipeline and reporting: `ai_assessments`, quote/evidence/line-item tables, pipeline jobs/runs, decision snapshots, report snapshots/links/audit tables | `CREATE TABLE` only | Cost-evidence truth boundaries, audit/provenance storage, JSON/default compatibility and report access ownership. |
| C4 | Operational portals and channels: agency, fleet, inspections, engineer observations, recovery, notifications, WhatsApp session and workflow tables | `CREATE TABLE` only | Tenant authority, user/claim parent references, webhook/message state and scheduled-work idempotency fields. |
| C5 | Intelligence, learning, analytics and secondary capability tables: calibration, benchmarks, training, search, historical/replay, governance and optimisation tables | `CREATE TABLE` only | Product-owner confirmation that each table is required in the first staging baseline rather than merely historic/experimental. |

**Hard rule:** a candidate bootstrap wave must contain only reviewed `CREATE TABLE`, required indexes and required foreign keys for objects approved in the decision ledger. A generated `DROP`, data migration, rename, `ALTER` of an existing object, or unexpected table is a stop condition.

### Gate D — Apply to empty `kinga_staging` only after approval

This gate is explicitly **not authorised now**. When authorised, it requires a temporary staging migration account and a reviewed change packet per wave.

The initial account should be scoped only to `kinga_staging` and only for the approved time window. Its exact grant set must be confirmed against TiDB Cloud capability and logged. The read-only `kinga_verify` account remains unchanged and must remain the post-apply verification identity.

After each wave, run metadata-only verification from `kinga_verify`:

1. table manifest matches the approved wave;
2. columns, types, nullability and defaults match the approved source manifest;
3. primary/unique/FK/index definitions match the approved manifest;
4. no unexpected object exists;
5. the next wave’s referenced parents are present.

No application connection should be pointed at staging until all baseline waves, chain integrity and structural verification are complete.

### Gate E — Additive evolution only after bootstrap

The historical 209-column gap on 15 tables becomes relevant only after the new baseline has an approved table set. For each column, decide whether it is truly required, nullable/default-safe, source-only, compatibility-only or a manual business decision.

The initial execution policy should be:

| Column/change type | Required approach |
|---|---|
| Nullable additive field | Separate reviewed `ADD COLUMN` batch after scratch replay. |
| Field with semantic default | Validate the default against the product meaning; never choose a default merely to satisfy a non-null constraint. |
| Non-null field with no safe historic default | Two phase: nullable add → approved backfill design → completeness verification → later constraint. |
| Physical-name/casing mismatch | Verify against real metadata first. Prefer source correction when the physical column is already correct; never drop/recreate a column that could carry data. |
| Rename, type conversion or destructive change | Separate change packet, explicit data/reconciliation strategy, backup/restore rehearsal and human approval. |

## 7. Rollback and restore strategy

TiDB DDL must be treated as a separately recoverable change; this plan does not assume all DDL is transactionally reversible.

### 7.1 Before every approved staging apply

| Requirement | Evidence required |
|---|---|
| TiDB Cloud recovery capability | Record current backup/PITR/branch/restore capability, retention period and account owner from the TiDB console. |
| Pre-change metadata snapshot | Export `information_schema` table, column, index and FK manifests; record change-packet checksum and migration journal state. |
| Fresh-database recovery path | Demonstrate how a separate empty staging database or TiDB recovery target would be created without touching production. |
| Verification credentials | Confirm `kinga_verify` remains read-only and can inspect metadata after the change. |
| Stop/rollback authority | Name the person who can stop the window and authorise recovery. |

### 7.2 Rollback rules

1. **Before any test data exists:** do not use automatic `DROP DATABASE` as a rollback mechanism. A recovery action must be explicit, recorded and approved, even for an empty environment.
2. **After any test data exists:** do not attempt destructive reverse DDL as a routine rollback. Restore or clone into a separate recovery database/cluster, verify metadata and approved test data, then redirect only the staging connection under explicit authority.
3. **Never use staging rollback as a production rehearsal.** Production must have its own final backup, restore proof, migration packet and cutover decision.
4. **Never downgrade by guessing.** If a migration’s reverse SQL is not proven in scratch and against representative non-production data, recovery defaults to restore-to-new-target rather than in-place reversal.

### 7.3 Restore rehearsal acceptance

The first rehearsal may use only the empty schema baseline. Later, once approved non-production data exists, it must also verify approved counts/checksums and access controls.

| Check | Empty staging baseline | Sanitized data rehearsal |
|---|---|---|
| New recovery target can be provisioned | Required | Required |
| Schema manifest matches expected checkpoint | Required | Required |
| Migration journal/version matches | Required | Required |
| Selected table row counts/checksums match | Not applicable | Required |
| Application tenant/claim/report smoke paths | Deferred until app config is approved | Required |
| Credentials and firewall scope remain staging-only | Required | Required |

## 8. Verification and promotion gates

| Gate | Evidence | Do not advance when |
|---|---|---|
| G1 — Baseline classification | Approved source manifest, migration-artifact manifest, decision ledger | Any table/column has unresolved ownership, legacy or physical-name ambiguity. |
| G2 — Chain integrity | Scratch replay succeeds with zero errors; journal and metadata match approved expectations | Any historic file is skipped, partially applies, auto-accepted or requires ad hoc manual SQL. |
| G3 — Bootstrap structure | Per-wave staging metadata is exactly equal to the approved manifest | Unexpected DDL, missing FK/index, unexpected object or source mismatch appears. |
| G4 — Recovery | Recovery target/restore rehearsal succeeds with recorded evidence | Recovery depends on an untested in-place reverse migration or unowned backup capability. |
| G5 — Application readiness | Separately authorised staging app configuration, tenant isolation, core claim/report/pipeline and provider-failure smoke evidence | Staging uses production credentials/data, any authority test fails, or report evidence is fabricated/contradictory. |
| G6 — Production readiness | Explicit production migration packet, final backup/restore evidence, rollback route, change window and named decision authority | Any G1–G5 exception is unresolved or production action is based only on staging success. |

## 9. Execution controls and named roles

| Role | Permitted action | Must not do |
|---|---|---|
| Data owner | Approves staging database use, backup/recovery capability and later data movement | Approve a schema/data change without the reviewed change packet. |
| Migration engineer | Generates manifests and reviewed candidate SQL in a dedicated branch/scratch DB | Use root, current managed `DATABASE_URL`, auto-accept scripts or production credentials. |
| Reviewer | Checks scope, physical names, FK ordering, journal state, rollback plan and validation evidence | Treat a passing syntax check as proof of data safety. |
| Application/security owner | Approves future staging app connection and tenant/security test plan | Weaken tenant/session/evidence rules to accommodate schema drift. |
| Release authority | Authorises a staging window and, much later, a production window | Combine schema change, data move and production cutover in one unreviewed action. |

## 10. Decision required after review

Approve one of the following next actions:

| Option | Next action | What it does not do |
|---|---|---|
| **A — Manifest package (recommended)** | Create the machine-generated source/migration manifests, drift decision ledger and scratch-replay design in a review branch. | No TiDB DDL, no staging migration account, no data movement. |
| **B — Migration-chain repair package** | After Option A review, repair the migration journal and known broken migration artefacts in an isolated branch and prove a clean scratch replay. | No change to `kinga_staging`, no production work. |
| **C — Staging baseline apply** | Only after A and B pass review, create a time-bound migration user and apply approved `CREATE TABLE` waves to the empty staging database. | No production connection or data import. |

The recommended immediate decision is **Option A**. It turns the existing audit into a reproducible manifest and decision ledger without making any database change.

## References

[1]: `/home/ubuntu/kinga-staging-read-only-verification-2026-09-10.md` — successful 3/3 staging TLS, identity, grant and metadata-only verification.

[2]: Current `drizzle/` source inventory extracted from the repository on 10 September 2026; 221 distinct `mysqlTable(...)` names across `schema.ts` and supplementary schema modules.

[3]: `docs/SCHEMA_MIGRATION_DRIFT_AUDIT.md` — static and MySQL-replay cross-validation of source/migration drift, known missing tables/columns and failure modes.

[4]: `drizzle/meta/_journal.json`, entries 55 and 60 — registered sequence jumps from tag `0055_illegal_carlie_cooper` to `0060_role_assignment_audit_fleet_platform_enum`.

[5]: `scripts/db-push.mjs` — auto-answer generation helper followed by an immediate migration call; excluded from this controlled process.

[6]: `docs/SCHEMA_MIGRATION_REMEDIATION_PLAN.md` and `docs/KINGA_EXTERNAL_PRODUCTION_MIGRATION_PLAN.md` — existing staged reconciliation and external-environment governance controls.
