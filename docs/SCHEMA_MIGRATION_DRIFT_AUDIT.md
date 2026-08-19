# Schema ↔ Migration Drift Audit

Produced per `docs/KINGA-CLAUDE-CODE-READINESS.md` Section 4.1 / Section 5 item 2:
"run a full schema-vs-migration diff, not just the tables the test suite hit."

**This is a report only — nothing here has been fixed.** Scope was explicitly
limited to producing a complete list; remediation is a separate, reviewed task.

## Methodology

1. `drizzle/schema.ts` was parsed structurally (not by eyeballing) to extract
   every `mysqlTable(...)` call, its table name, and every column's actual
   database column name — respecting explicit `columnFn("db_name", ...)`
   arguments where present, and falling back to the JS property name where
   drizzle has no explicit name (this project does not set `casing:
   "snake_case"` in `drizzle.config.ts`, so unnamed columns keep their JS
   property name verbatim, e.g. `users.loginMethod` is really stored as
   `loginMethod`, not `login_method`).
2. All 62 files under `drizzle/*.sql` were parsed the same way: every
   `CREATE TABLE`, and every `ALTER TABLE ... ADD/CHANGE/DROP/MODIFY COLUMN`
   clause, in filename order, tracking which columns exist on each table by
   the end of the file set.
3. **Cross-validated against a real database**, not just static parsing: all
   62 SQL files were applied in order to a fresh MySQL 8 container. The
   resulting table count (129) matched the static parse exactly, confirming
   the parse is accurate and not an artifact of the parsing approach.
4. Schema tables/columns were then diffed against the migration-derived
   tables/columns.

Numbers: schema.ts defines **218 tables / 3,939 columns**. The checked-in
migrations create **129 tables**. That means **89 tables (1,443 columns)**
defined in `schema.ts` have no `CREATE TABLE` anywhere in `drizzle/*.sql`,
and a further **15 existing tables are missing 209 individual columns**
between them. In total **1,652 of 3,939 schema columns (~42%)** have no
corresponding migration.

This is substantially larger than the "likely others not yet discovered"
noted in the readiness doc — the four previously-confirmed items
(`users.phone_number`, `users.secondary_roles`, `physical_measurements`,
`engineer_observations`) are real but are a small fraction of the actual gap.

---

## Part 1 — Tables in `schema.ts` with zero mention in any migration (89)

```
report_provenance_snapshots        claim_evidence_findings
quote_evidence_ledger              quote_evidence_gaps
audit_logs                         claim_intake_requests
claim_assignments                  assessor_reports
assessor_report_attachments        assessor_report_reviews
agency_product_commission_configs  currency_exchange_rates
client_vehicle_valuation_requests  valuation_comparable_evidence
client_insurance_service_requests  bias_detection_flags
human_review_queue                 marketplace_profiles
insurer_marketplace_links          agency_clients
agency_insurance_service_requests  agency_insurance_service_request_insurers
agency_insurance_valuation_deviations agency_assisted_claimant_identities
vehicle_condition_snapshots        insurer_quote_requests
fleet_rfq_client_instructions      fleet_accounts
fleet_manager_requests             insurer_marketplace_relationships
quote_optimisation_results         assessor_subscriptions
tenant_isolation_violations        notification_events
system_errors                      country_repair_index
repair_cost_intelligence           vehicle_registry
vehicle_damage_history             drivers
driver_claims                      repair_history
cross_claim_signals                decision_snapshots
claim_decision_lifecycle           replay_logs
governance_audit_log               shadow_override_monitor
mismatch_annotations               narrative_versions
weight_adjustment_log              benchmark_deviations
cost_learning_records              calibration_overrides
workflow_templates                 claim_approvals
adjuster_sign_offs                 photo_reextraction_jobs
component_repair_outcomes          generated_reports
recovery_cases                     recovery_correspondence_log
component_benchmarks               pipeline_runs
pipeline_jobs                      vehicle_models
measurement_types                  vehicle_geometry_measurements
vehicle_landmarks                  geometry_sources
vision_calibration_results         physics_validation_records
asset_registry                     inspections
physical_measurements              engineer_observations
engineer_profiles                  vehicle_passport_snapshots
fleet_intelligence_snapshots       predictive_risk_scores
global_search_history              global_search_analytics
notification_preferences           fuel_records
licensing_records                  inspection_projects
personal_vehicles                  quotation_request_documents
whatsapp_sessions
```

Notable: `inspections` — the table backing the tenant-authority reference
implementation in `server/routers/inspections.ts` (readiness doc Section 3)
— has no migration at all, nor do `physical_measurements` /
`engineer_observations`, which that same router depends on.

---

## Part 2 — Columns missing from tables that DO exist in migrations (15 tables, 209 columns)

| Table | Missing columns |
|---|---|
| `users` | `phone_number`, `secondary_roles`, `marketplace_profile_id`, `is_active`, `deactivated_at`, `default_role`, `is_qa_account`, `is_unregistered_claimant` |
| `claims` | 55 columns, incl. `kinga_ref`, `fraud_risk_level`, `vehicle_market_value`, `pipeline_current_stage`, `fleet_account_id`, `rejection_reason` — [full list in appendix below] |
| `ai_assessments` | 70 columns — almost entirely the forensic/physics/fraud pipeline output fields (`fraud_score`, `physics_deviation_score`, `forensic_analysis`, `evidence_bundle_json`, `decision_trace_json`, etc.) — [full list below] |
| `claim_comments` | 26 columns, incl. `author_user_id`, `body`, `parent_comment_id`, `to_roles` — see also the `claimId` casing bug flagged in Part 3 |
| `quotation_requests` | `vehicle_forensics_json`, `vehicle_risk_score`, `report_gating_status`, `payment_intent_id`, `inspection_required`, `submission_token`, `contact_verified`, `fleet_vehicle_count`, `vehicle_forensics_status`, `report_unlocked_at`, `is_standalone_valuation`, `inspection_assigned_to` |
| `panel_beaters` | `panel_beater_status`, `total_repairs`, `avg_quality_score`, `avg_cost_ratio`, `avg_repair_duration_days`, `repeat_damage_rate_pct`, `warranty_repair_count`, `fraud_flag_count`, `performance_tier`, `last_repair_date`, `performance_updated_at` |
| `panel_beater_quotes` | `quote_type`, `parent_quote_id`, `currency_code`, `quote_audit_json`, `quote_congruency_score` |
| `insurer_tenants` | `pricing_tier`, `monthly_platform_fee`, `per_claim_fee`, `tier_feature_flags` |
| `tenants` | `currency_code`, `currency_symbol`, `country`, `kinga_sequence`, `is_synthetic_tenant` |
| `quote_line_items` | `currency`, `ai_review`, `part_origin`, `repairer_name` |
| `assessor_evaluations` | `source_report_id`, `source_report_version`, `accepted_review_id` |
| `automation_policies` | `demand_letter_response_days` |
| `claim_documents` | `inspection_id` |
| `final_approval_records` | `conditions_text` |
| `ingestion_documents` | `p_hash` |

Full column lists for `claims` and `ai_assessments` (too long for the table above):

**`claims`** (55): `kinga_ref`, `normalised_description`, `reported_cause_label`, `key_facts_json`, `panel_beater_choice_1`, `panel_beater_choice_2`, `panel_beater_choice_3`, `ai_assessment_started_at`, `ai_assessment_completed_at`, `external_assessment_url`, `fraud_risk_level`, `requires_gm_consultation`, `source_document_id`, `claim_source`, `is_simulated`, `vehicle_market_value`, `document_processing_status`, `currency_code`, `vehicle_registry_id`, `driver_registry_id`, `third_party_driver_registry_id`, `ai_detected_incident_type`, `incident_type_overridden`, `incident_type_override_reason`, `incident_type_overridden_by`, `incident_type_overridden_at`, `incident_type_revalidation_json`, `product_type`, `product_type_source`, `estimated_cost`, `estimated_speed_kmh`, `claimant_stated_speed_kmh`, `claimant_speed_needs_verification`, `data_completeness_score`, `insurer_name`, `excess_amount_cents`, `claim_reference`, `pipeline_current_stage`, `pipeline_run_uuid`, `pipeline_heartbeat_at`, `fleet_account_id`, `claimant_type`, `claimant_company_name`, `claimant_company_reg`, `claimant_department`, `fleet_vehicle_ref`, `fleet_driver_id`, `recovery_retry_count`, `rejection_reason`, `rejection_category`, `rejected_by`, `rejected_at`

**`ai_assessments`** (70): `fraud_score`, `recommendation`, `fraud_score_breakdown_json`, `physics_deviation_score`, `forensic_analysis`, `estimated_parts_cost`, `estimated_labor_cost`, `currency_code`, `inferred_hidden_damages_json`, `repair_intelligence_json`, `parts_reconciliation_json`, `cost_intelligence_json`, `damage_photos_json`, `confidence_score_breakdown_json`, `pipeline_run_summary`, `enriched_photos_json`, `unresolved_parts_json`, `photo_inconsistencies_json`, `consistency_check_json`, `coherence_result_json`, `cost_realism_json`, `causal_chain_json`, `evidence_bundle_json`, `realism_bundle_json`, `benchmark_bundle_json`, `consensus_result_json`, `causal_verdict_json`, `constraint_overrides_json`, `validated_outcome_json`, `case_signature_json`, `decision_authority_json`, `contradiction_gate_json`, `report_readiness_json`, `explanation_json`, `escalation_route_json`, `decision_trace_json`, `stage2_raw_ocr_text`, `claim_record_json`, `narrative_analysis_json`, `direction_contradiction_flag_json`, `cross_validation_json`, `image_analysis_total_count`, `image_analysis_success_count`, `image_analysis_failed_count`, `image_analysis_success_rate`, `fcdi_score`, `forensic_execution_ledger_json`, `assumption_registry_json`, `economic_context_json`, `ife_result_json`, `doe_result_json`, `fel_version_snapshot_json`, `claim_quality_json`, `forensic_audit_validation_json`, `shared_with_roles_json`, `human_override`, `human_override_user_id`, `human_override_reason`, `human_override_at`, `ocr_fallback_used`, `pipeline_degraded_stages_json`, `photo_classification_json`, `claim_truth_json`, `claim_truth_object_json`, `physics_truth_json`, `report_signals_json`, `evidence_registry_json`, `system_intervention_count`, `intervention_summary_json`, `decision_readiness_json`, `degradation_reasons_json`, `field_validation_json`, `gate_decision_json`, `cgi_result_json`, `interpretation_result_json`

Note: `ai_assessments.stage2_raw_ocr_text` and `.narrative_analysis_json` *do*
have migration files (`0056_stage2_raw_ocr_text.sql`,
`0057_narrative_analysis_json.sql`) — they show up here only because those
two migrations are missing from `drizzle/meta/_journal.json` (see Part 3),
so a plain journal-driven replay wouldn't apply them even though the SQL
text exists. Treat these two specifically as "migration exists but isn't
wired up" rather than "no migration was ever written."

**`claim_comments`** (26): `claimId`\*, `author_user_id`, `author_role`, `to_roles`, `to_user_ids`, `to_emails`, `requires_response`, `response_deadline_at`, `body`, `parent_comment_id`, `is_resolved`, `resolved_by_user_id`, `resolved_at`, `email_sent`, `notify_claimant`, `claimant_email_sent`, `status_update_template`, `createdAt`\*, `deletedAt`\*, `section_key`, `subsection_key`, `finding_id`, `pipeline_run_id`, `severity`, `disposition`, `blocks_approval` — \* see Part 3, these three are case/type bugs, not simple absence.

---

## Part 3 — Related issues found while producing this diff (not part of the requested list, flagging for the follow-up task)

1. **`claim_comments.claimId` has a real casing bug in `schema.ts:734`**:
   `claimId: int("claimId")...` passes the literal string `"claimId"` as the
   database column name. The actual column (created in
   `0002_lively_thundra.sql`) is `claim_id`. This isn't a missing-migration
   problem — it's a wrong-name-in-schema problem that would make any query
   touching this column fail against a real database today.
2. **`claim_comments.createdAt` and `.deletedAt`** (`schema.ts:752,754`) have
   no explicit db name, so drizzle expects literal `createdAt`/`deletedAt`
   columns; the actual migrated column is `created_at` (and there is no
   `deletedAt`/`deleted_at` column in migrations at all — also captured in
   Part 2's missing-columns list for this table).
3. **Migration `0058_claim_comments_extend.sql` does not apply cleanly.**
   Its first statement does `CHANGE COLUMN \`userId\` \`author_user_id\`...`
   but `claim_comments.userId` was never the real column name (it's been
   `user_id` since `0002_lively_thundra.sql`) — the whole `ALTER TABLE`
   statement fails, and because `mysql`'s CLI aborts a script after the
   first error, none of that file's other additions (`to_roles`,
   `parent_comment_id`, `is_resolved`, etc.) apply either, even though the
   SQL text for all of them is checked in.
4. **Migration `0045_colossal_molecule_man.sql`** fails partway:
   `CREATE INDEX idx_recipients ON governance_notifications (recipients)`
   errors with "BLOB/TEXT column ... used in key specification without a
   key length" (MySQL requires a prefix length for indexing a `TEXT`
   column). The table and its first two indexes are created fine; the last
   two indexes in the file never get created.
5. **`drizzle/meta/_journal.json` has a gap**: entries jump from `idx: 55`
   straight to `idx: 60`, silently skipping `0056`–`0059`. `drizzle-kit
   migrate` (and the `db:push` npm script, which runs
   `generate && migrate`) is journal-driven, so those four migration files
   — despite being checked into `drizzle/*.sql` — would never actually be
   applied by the standard tooling.
6. **`drizzle/rate-limit-tracking-schema.sql`** is not part of the numbered
   migration sequence at all (no `NNNN_` prefix, no journal entry, uses
   unquoted column identifiers and `CREATE TABLE IF NOT EXISTS` instead of
   drizzle-kit's usual generated style). It appears to have been added by
   hand outside the normal migration flow. Its table (`rate_limit_tracking`)
   does match `schema.ts` with no missing columns, so it isn't part of the
   drift itself, but it's an inconsistency in how migrations get produced.

These six items compound the raw table/column gap: even a team that
faithfully ran every checked-in `.sql` file in order would not end up with
a database matching `schema.ts`, both because of the drift itself and
because two of the files don't apply as written.
