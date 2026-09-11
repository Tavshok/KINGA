CREATE TABLE `adjuster_sign_offs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`claim_id` int NOT NULL,
	`adjuster_user_id` int,
	`adjuster_name` varchar(255) NOT NULL,
	`decision` enum('APPROVE','REJECT','ESCALATE','DEFER') NOT NULL,
	`notes` text,
	`ai_decision` varchar(50),
	`signed_at` bigint NOT NULL,
	`updated_at` bigint NOT NULL,
	CONSTRAINT `adjuster_sign_offs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `agency_documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` varchar(255),
	`quotation_request_id` int,
	`policy_id` int,
	`document_type` enum('id_document','drivers_license','vehicle_registration','proof_of_address','bank_statement','vehicle_photos','previous_policy','claims_history','other') NOT NULL,
	`title` varchar(255) NOT NULL,
	`file_name` varchar(255) NOT NULL,
	`file_url` text NOT NULL,
	`file_size` int,
	`mime_type` varchar(100),
	`uploaded_by` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `agency_documents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ai_assessments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`claim_id` int NOT NULL,
	`estimated_cost` int,
	`damage_description` longtext,
	`detected_damage_types` longtext,
	`confidence_score` int,
	`fraud_indicators` longtext,
	`fraud_risk_level` enum('low','medium','moderate','high','critical','elevated'),
	`fraud_score` int,
	`recommendation` varchar(50),
	`fraud_score_breakdown_json` longtext,
	`model_version` varchar(50),
	`processing_time` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`total_loss_indicated` tinyint DEFAULT 0,
	`structural_damage_severity` enum('none','minor','moderate','severe','catastrophic') DEFAULT 'none',
	`estimated_vehicle_value` int,
	`repair_to_value_ratio` int,
	`total_loss_reasoning` longtext,
	`damaged_components_json` longtext,
	`physics_analysis` longtext,
	`graph_urls` longtext,
	`tenant_id` varchar(255),
	`is_reanalysis` tinyint NOT NULL DEFAULT 0,
	`triggered_by` int,
	`triggered_role` varchar(50),
	`previous_assessment_id` int,
	`reanalysis_reason` longtext,
	`version_number` int NOT NULL DEFAULT 1,
	`physics_deviation_score` int,
	`forensic_analysis` longtext,
	`estimated_parts_cost` int,
	`estimated_labor_cost` int,
	`currency_code` varchar(10) DEFAULT 'USD',
	`inferred_hidden_damages_json` longtext,
	`repair_intelligence_json` longtext,
	`parts_reconciliation_json` longtext,
	`cost_intelligence_json` longtext,
	`damage_photos_json` longtext,
	`confidence_score_breakdown_json` longtext,
	`pipeline_run_summary` longtext,
	`enriched_photos_json` longtext,
	`unresolved_parts_json` longtext,
	`photo_inconsistencies_json` longtext,
	`consistency_check_json` longtext,
	`coherence_result_json` longtext,
	`cost_realism_json` longtext,
	`causal_chain_json` longtext,
	`evidence_bundle_json` longtext,
	`realism_bundle_json` longtext,
	`benchmark_bundle_json` longtext,
	`consensus_result_json` longtext,
	`causal_verdict_json` longtext,
	`constraint_overrides_json` longtext,
	`validated_outcome_json` longtext,
	`case_signature_json` longtext,
	`decision_authority_json` longtext,
	`contradiction_gate_json` longtext,
	`report_readiness_json` longtext,
	`explanation_json` longtext,
	`escalation_route_json` longtext,
	`decision_trace_json` longtext,
	`stage2_raw_ocr_text` longtext,
	`claim_record_json` longtext,
	`narrative_analysis_json` longtext,
	`direction_contradiction_flag_json` longtext,
	`cross_validation_json` longtext,
	`image_analysis_total_count` int DEFAULT 0,
	`image_analysis_success_count` int DEFAULT 0,
	`image_analysis_failed_count` int DEFAULT 0,
	`image_analysis_success_rate` int,
	`fcdi_score` int,
	`forensic_execution_ledger_json` longtext,
	`assumption_registry_json` longtext,
	`economic_context_json` longtext,
	`ife_result_json` longtext,
	`doe_result_json` longtext,
	`fel_version_snapshot_json` longtext,
	`claim_quality_json` longtext,
	`forensic_audit_validation_json` longtext,
	`shared_with_roles_json` longtext,
	`human_override` tinyint DEFAULT 0,
	`human_override_user_id` int,
	`human_override_reason` text,
	`human_override_at` bigint,
	`ocr_fallback_used` tinyint DEFAULT 0,
	`pipeline_degraded_stages_json` text,
	`photo_classification_json` longtext,
	`claim_truth_json` longtext,
	`claim_truth_object_json` longtext,
	`physics_truth_json` longtext,
	`report_signals_json` longtext,
	`evidence_registry_json` longtext,
	`system_intervention_count` int,
	`intervention_summary_json` text,
	`decision_readiness_json` longtext,
	`degradation_reasons_json` text,
	`field_validation_json` longtext,
	`gate_decision_json` longtext,
	`cgi_result_json` longtext,
	`interpretation_result_json` longtext,
	CONSTRAINT `ai_assessments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ai_prediction_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`historical_claim_id` int NOT NULL,
	`tenant_id` varchar(64) NOT NULL,
	`prediction_type` enum('cost_estimate','fraud_detection','document_classification','damage_assessment','repair_vs_replace','total_loss_determination','physics_validation') NOT NULL,
	`model_name` varchar(100) NOT NULL,
	`model_version` varchar(50),
	`input_summary` text,
	`input_tokens` int,
	`predicted_value` decimal(12,2),
	`predicted_label` varchar(100),
	`confidence_score` decimal(5,4),
	`prediction_json` json,
	`actual_value` decimal(12,2),
	`actual_label` varchar(100),
	`variance_amount` decimal(12,2),
	`variance_percent` decimal(8,2),
	`is_accurate` tinyint,
	`processing_time_ms` int,
	`output_tokens` int,
	`total_cost` decimal(10,6),
	`error_occurred` tinyint DEFAULT 0,
	`error_message` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ai_prediction_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `assessor_report_attachments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`report_id` int NOT NULL,
	`tenant_id` varchar(255) NOT NULL,
	`original_file_name` varchar(500) NOT NULL,
	`storage_key` varchar(500) NOT NULL,
	`file_url` text NOT NULL,
	`mime_type` varchar(255),
	`size_bytes` int,
	`file_hash` varchar(128),
	`attachment_role` enum('original_report','supporting_evidence','generated_export') NOT NULL DEFAULT 'supporting_evidence',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `assessor_report_attachments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `assessor_report_reviews` (
	`id` int AUTO_INCREMENT NOT NULL,
	`report_id` int NOT NULL,
	`claim_id` int NOT NULL,
	`tenant_id` varchar(255) NOT NULL,
	`reviewer_user_id` int NOT NULL,
	`reviewer_role` enum('claims_assessor','claims_manager') NOT NULL,
	`status` enum('pending','accepted','returned','rejected','escalated') NOT NULL DEFAULT 'pending',
	`route_reason` enum('assigned_claims_assessor','claims_manager_fallback','claims_manager_escalation') NOT NULL,
	`decision_reason` text,
	`reviewed_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `assessor_report_reviews_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `assessor_reports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`claim_id` int NOT NULL,
	`tenant_id` varchar(255) NOT NULL,
	`assessor_user_id` int NOT NULL,
	`assignment_id` int NOT NULL,
	`parent_report_id` int,
	`version_number` int NOT NULL DEFAULT 1,
	`creation_method` enum('native_upload','kinga_assisted') NOT NULL,
	`status` enum('draft','attested','submitted','under_review','returned','rejected','accepted','superseded') NOT NULL DEFAULT 'draft',
	`title` varchar(255) NOT NULL,
	`source_file_name` varchar(500),
	`source_storage_key` varchar(500),
	`source_file_url` text,
	`source_mime_type` varchar(255),
	`source_file_hash` varchar(128),
	`report_payload` json,
	`kinga_extraction_json` json,
	`attested_by_user_id` int,
	`attested_at` timestamp,
	`submitted_at` timestamp,
	`superseded_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `assessor_reports_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_assessor_reports_claim_version` UNIQUE(`claim_id`,`version_number`)
);
--> statement-breakpoint
CREATE TABLE `automation_policies` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` varchar(255) NOT NULL,
	`policy_name` varchar(255) NOT NULL,
	`min_automation_confidence` int NOT NULL DEFAULT 85,
	`min_hybrid_confidence` int NOT NULL DEFAULT 60,
	`eligible_claim_types` json NOT NULL,
	`excluded_claim_types` json NOT NULL,
	`max_ai_only_approval_amount` bigint NOT NULL DEFAULT 5000000,
	`max_hybrid_approval_amount` bigint NOT NULL DEFAULT 20000000,
	`max_fraud_score_for_automation` int NOT NULL DEFAULT 30,
	`eligible_vehicle_categories` json NOT NULL,
	`excluded_vehicle_makes` json NOT NULL,
	`min_vehicle_year` int NOT NULL DEFAULT 2010,
	`max_vehicle_age` int NOT NULL DEFAULT 15,
	`require_manager_approval_above` bigint NOT NULL DEFAULT 10000000,
	`allow_policy_override` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`created_by_user_id` int,
	`is_active` tinyint NOT NULL DEFAULT 1,
	`version` int NOT NULL DEFAULT 1,
	`effective_from` timestamp NOT NULL DEFAULT (now()),
	`effective_until` timestamp,
	`superseded_by_policy_id` int,
	`fraud_sensitivity_multiplier` decimal(3,2) NOT NULL DEFAULT '1.00',
	`demand_letter_response_days` int NOT NULL DEFAULT 21,
	CONSTRAINT `automation_policies_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `claim_confidence_scores` (
	`id` int AUTO_INCREMENT NOT NULL,
	`claim_id` int NOT NULL,
	`tenant_id` varchar(255) NOT NULL,
	`damage_certainty` decimal(5,2) NOT NULL,
	`physics_strength` decimal(5,2) NOT NULL,
	`fraud_confidence` decimal(5,2) NOT NULL,
	`historical_accuracy` decimal(5,2) NOT NULL,
	`data_completeness` decimal(5,2) NOT NULL,
	`vehicle_risk_intelligence` decimal(5,2) NOT NULL,
	`composite_confidence_score` decimal(5,2) NOT NULL,
	`scoring_version` varchar(50) NOT NULL DEFAULT 'v1.0',
	`scoring_timestamp` timestamp DEFAULT (now()),
	`damage_certainty_breakdown` json,
	`physics_validation_details` json,
	`fraud_analysis_details` json,
	`historical_accuracy_details` json,
	`data_completeness_details` json,
	`vehicle_risk_details` json,
	CONSTRAINT `claim_confidence_scores_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `claim_decision_lifecycle` (
	`id` int AUTO_INCREMENT NOT NULL,
	`claim_id` varchar(50) NOT NULL,
	`tenant_id` varchar(50) NOT NULL,
	`lifecycle_state` varchar(20) NOT NULL DEFAULT 'DRAFT',
	`is_final` tinyint NOT NULL DEFAULT 0,
	`is_locked` tinyint NOT NULL DEFAULT 0,
	`authoritative_snapshot_id` int,
	`drafted_at` bigint,
	`reviewed_at` bigint,
	`reviewed_by_user_id` varchar(50),
	`finalised_at` bigint,
	`finalised_by_user_id` varchar(50),
	`locked_at` bigint,
	`locked_by_user_id` varchar(50),
	`final_decision_choice` varchar(50),
	`created_at` bigint NOT NULL,
	`updated_at` bigint NOT NULL,
	CONSTRAINT `claim_decision_lifecycle_id` PRIMARY KEY(`id`),
	CONSTRAINT `idx_cdl_claim_unique` UNIQUE(`claim_id`)
);
--> statement-breakpoint
CREATE TABLE `claim_routing_decisions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`claim_id` int NOT NULL,
	`tenant_id` varchar(255) NOT NULL,
	`confidence_score_id` int NOT NULL,
	`automation_policy_id` int NOT NULL,
	`routed_workflow` enum('ai_only','hybrid','manual') NOT NULL,
	`routing_reason` text NOT NULL,
	`policy_thresholds_applied` json NOT NULL,
	`decision_timestamp` timestamp DEFAULT (now()),
	`decision_made_by_system` tinyint NOT NULL DEFAULT 1,
	`decision_made_by_user_id` int,
	`was_overridden` tinyint NOT NULL DEFAULT 0,
	`override_reason` text,
	`overridden_by_user_id` int,
	`overridden_at` timestamp,
	`policy_version` int NOT NULL DEFAULT 1,
	`policy_snapshot_json` json NOT NULL,
	`claim_version` int NOT NULL DEFAULT 1,
	CONSTRAINT `claim_routing_decisions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `component_repair_outcomes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`claim_id` int NOT NULL,
	`assessment_id` int NOT NULL,
	`component_name` varchar(120) NOT NULL,
	`component_category` varchar(60),
	`severity_at_decision` varchar(30),
	`vehicle_make` varchar(80),
	`vehicle_model` varchar(80),
	`vehicle_year` int,
	`vehicle_age_years` int,
	`vehicle_variant` varchar(100),
	`vehicle_body_type` varchar(60),
	`market_region` varchar(20),
	`currency_code` varchar(10),
	`evidence_quality` enum('verified','accepted_quote','assessor_validated','review_required') NOT NULL DEFAULT 'accepted_quote',
	`outcome` enum('repair','replace','write_off') NOT NULL,
	`ai_suggestion` enum('repair','replace','uncertain'),
	`was_override` tinyint NOT NULL DEFAULT 0,
	`adjuster_user_id` int,
	`repair_cost_usd` decimal(10,2),
	`replace_cost_usd` decimal(10,2),
	`part_origin` enum('oem','aftermarket','reconditioned','used','unknown'),
	`repairer_name` varchar(255),
	`decided_at` varchar(50) NOT NULL,
	`created_at` varchar(50) NOT NULL,
	CONSTRAINT `component_repair_outcomes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `cost_components` (
	`id` int AUTO_INCREMENT NOT NULL,
	`historical_claim_id` int NOT NULL,
	`source_type` enum('panel_beater_quote','assessor_report','ai_estimate','final_approved') NOT NULL,
	`document_id` int,
	`labor_cost` decimal(12,2) DEFAULT '0.00',
	`parts_cost` decimal(12,2) DEFAULT '0.00',
	`paint_cost` decimal(12,2) DEFAULT '0.00',
	`materials_cost` decimal(12,2) DEFAULT '0.00',
	`sublet_cost` decimal(12,2) DEFAULT '0.00',
	`sundries` decimal(12,2) DEFAULT '0.00',
	`vat_amount` decimal(12,2) DEFAULT '0.00',
	`total_excl_vat` decimal(12,2) DEFAULT '0.00',
	`total_incl_vat` decimal(12,2) DEFAULT '0.00',
	`total_labor_hours` decimal(8,2),
	`average_labor_rate` decimal(10,2),
	`total_parts_count` int,
	`oem_parts_count` int,
	`aftermarket_parts_count` int,
	`repair_vs_replace_ratio` decimal(5,2),
	`total_betterment` decimal(12,2) DEFAULT '0.00',
	`extraction_confidence` decimal(5,4),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `cost_components_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `cost_learning_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`claim_id` int,
	`tenant_id` varchar(255),
	`vehicle_descriptor` varchar(255) NOT NULL,
	`vehicle_make` varchar(100),
	`vehicle_model` varchar(100),
	`vehicle_year` int,
	`vehicle_variant` varchar(100),
	`vehicle_body_type` varchar(60),
	`collision_direction` varchar(50) NOT NULL,
	`market_region` varchar(10) NOT NULL DEFAULT 'DEFAULT',
	`case_signature` varchar(100) NOT NULL,
	`component_count` int NOT NULL DEFAULT 0,
	`structural_component_count` int NOT NULL DEFAULT 0,
	`currency` varchar(10) NOT NULL DEFAULT 'USD',
	`final_cost_usd_cents` int,
	`cost_is_agreed` tinyint NOT NULL DEFAULT 0,
	`quote_coverage_ratio_pct` int NOT NULL DEFAULT 0,
	`high_cost_drivers_json` text NOT NULL DEFAULT ('[]'),
	`component_weighting_json` text NOT NULL DEFAULT ('{}'),
	`component_detail_json` text NOT NULL DEFAULT ('[]'),
	`quality_flags_json` text NOT NULL DEFAULT ('[]'),
	`recorded_at` timestamp NOT NULL DEFAULT (now()),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `cost_learning_records_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `country_repair_index` (
	`id` int AUTO_INCREMENT NOT NULL,
	`country_code` varchar(10) NOT NULL,
	`country_name` varchar(100) NOT NULL,
	`vat_rate` decimal(5,4) NOT NULL,
	`import_duty_rate` decimal(5,4) NOT NULL,
	`avg_labour_rate_per_hour` int NOT NULL,
	`currency_code` varchar(10) NOT NULL,
	`effective_from` varchar(10) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `country_repair_index_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `currency_exchange_rates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`currency_code` varchar(3) NOT NULL,
	`currency_name` varchar(100),
	`currency_symbol` varchar(10),
	`rate_to_usd` decimal(18,6) NOT NULL,
	`source` varchar(100) DEFAULT 'manual',
	`last_updated` timestamp NOT NULL DEFAULT (now()),
	`is_active` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `currency_exchange_rates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `customer_documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`customer_id` int NOT NULL,
	`document_type` enum('id_document','drivers_license','proof_of_residence','vehicle_registration','other') NOT NULL,
	`document_url` varchar(500) NOT NULL,
	`s3_key` varchar(500) NOT NULL,
	`verification_status` enum('pending','verified','rejected') NOT NULL DEFAULT 'pending',
	`verified_at` timestamp,
	`verified_by` int,
	`rejection_reason` text,
	`file_name` varchar(255),
	`file_size` int,
	`mime_type` varchar(100),
	`tenant_id` varchar(255),
	`uploaded_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `customer_documents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `decision_snapshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`claim_id` varchar(50) NOT NULL,
	`tenant_id` varchar(50) NOT NULL,
	`snapshot_version` int NOT NULL DEFAULT 1,
	`created_at` bigint NOT NULL,
	`created_by_user_id` varchar(50),
	`verdict_decision` varchar(50) NOT NULL,
	`verdict_primary_reason` text NOT NULL,
	`verdict_confidence` int NOT NULL,
	`cost_ai_estimate` int NOT NULL,
	`cost_quoted` int NOT NULL DEFAULT 0,
	`cost_deviation_percent` int NOT NULL DEFAULT 0,
	`cost_fair_range_min` int NOT NULL,
	`cost_fair_range_max` int NOT NULL,
	`cost_verdict` varchar(20) NOT NULL,
	`fraud_score` int NOT NULL,
	`fraud_level` varchar(20) NOT NULL,
	`fraud_contributions_json` text NOT NULL,
	`physics_delta_v` int NOT NULL DEFAULT 0,
	`physics_velocity_range` varchar(50) NOT NULL DEFAULT '',
	`physics_energy_kj` int NOT NULL DEFAULT 0,
	`physics_force_kn` int NOT NULL DEFAULT 0,
	`physics_estimated` tinyint NOT NULL DEFAULT 0,
	`damage_zones_json` text NOT NULL,
	`damage_severity` varchar(30) NOT NULL,
	`damage_consistency_score` int NOT NULL DEFAULT 0,
	`enforcement_trace_json` text NOT NULL,
	`confidence_breakdown_json` text NOT NULL,
	`missing_fields_json` text NOT NULL,
	`estimated_fields_json` text NOT NULL,
	`extraction_confidence` int NOT NULL DEFAULT 0,
	`snapshot_json` text,
	`lifecycle_state` varchar(20) NOT NULL DEFAULT 'DRAFT',
	`is_final_snapshot` tinyint NOT NULL DEFAULT 0,
	CONSTRAINT `decision_snapshots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `document_naming_templates` (
	`id` varchar(64) NOT NULL,
	`tenant_id` varchar(64) NOT NULL,
	`doc_type` enum('claim','assessment','report','approval') NOT NULL,
	`template` varchar(500) NOT NULL,
	`description` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `document_naming_templates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `extracted_document_data` (
	`id` int AUTO_INCREMENT NOT NULL,
	`document_id` int NOT NULL,
	`policy_number` varchar(100),
	`claim_number` varchar(100),
	`insured_name` varchar(255),
	`insured_id_number` varchar(50),
	`insured_phone` varchar(50),
	`insured_email` varchar(320),
	`insured_address` text,
	`incident_date` date,
	`incident_time` time,
	`incident_location` text,
	`incident_description` text,
	`vehicle_make` varchar(100),
	`vehicle_model` varchar(100),
	`vehicle_year` int,
	`vehicle_vin` varchar(50),
	`vehicle_license_plate` varchar(20),
	`vehicle_mass` int,
	`repair_cost_estimate` decimal(10,2),
	`repair_parts_list` json,
	`repair_labor_hours` decimal(6,2),
	`repair_labor_rate` decimal(10,2),
	`assessor_name` varchar(255),
	`assessor_license_number` varchar(100),
	`assessor_observations` text,
	`damage_severity` enum('minor','moderate','severe','total_loss'),
	`extraction_confidence` decimal(5,4),
	`fields_extracted_count` int,
	`fields_missing_count` int,
	`full_text` longtext,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `extracted_document_data_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `extracted_repair_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`historical_claim_id` int NOT NULL,
	`document_id` int,
	`source_type` enum('panel_beater_quote','assessor_report','ai_estimate') NOT NULL,
	`item_number` int,
	`description` varchar(500) NOT NULL,
	`part_number` varchar(100),
	`category` enum('parts','labor','paint','diagnostic','sundries','sublet','other') NOT NULL,
	`damage_location` varchar(200),
	`repair_action` enum('repair','replace','refinish','blend','remove_refit'),
	`quantity` decimal(10,2) DEFAULT '1.00',
	`unit_price` decimal(10,2),
	`line_total` decimal(10,2),
	`labor_hours` decimal(6,2),
	`labor_rate` decimal(10,2),
	`parts_quality` enum('oem','genuine','aftermarket','used','reconditioned'),
	`betterment_percent` decimal(5,2),
	`betterment_amount` decimal(10,2),
	`extraction_confidence` decimal(5,4),
	`is_handwritten` tinyint DEFAULT 0,
	`manually_verified` tinyint DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `extracted_repair_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fleet_documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fleet_id` int,
	`vehicle_id` int,
	`tenant_id` varchar(64),
	`document_type` enum('registration_book','ownership_certificate','inspection_report','insurance_policy','service_history','photo','valuation_report','other') NOT NULL,
	`document_name` varchar(255) NOT NULL,
	`s3_key` varchar(500) NOT NULL,
	`s3_url` text NOT NULL,
	`file_size` int,
	`mime_type` varchar(100),
	`verification_status` enum('pending','verified','rejected') DEFAULT 'pending',
	`verified_by` int,
	`verified_at` timestamp,
	`rejection_reason` text,
	`uploaded_by` int NOT NULL,
	`uploaded_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `fleet_documents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fleet_incident_reports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`vehicle_id` int NOT NULL,
	`driver_id` int NOT NULL,
	`fleet_id` int NOT NULL,
	`tenant_id` varchar(64) NOT NULL,
	`incident_date` timestamp NOT NULL,
	`location` text NOT NULL,
	`description` text NOT NULL,
	`severity` enum('minor','moderate','major','critical') NOT NULL DEFAULT 'minor',
	`status` enum('submitted','under_review','approved','rejected','claim_filed') NOT NULL DEFAULT 'submitted',
	`police_report_number` varchar(100),
	`witness_name` varchar(255),
	`witness_phone` varchar(50),
	`estimated_damage` decimal(10,2),
	`vehicle_driveable` tinyint DEFAULT 1,
	`reviewed_by` int,
	`reviewed_at` timestamp,
	`review_notes` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `fleet_incident_reports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fraud_alerts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`claim_id` int NOT NULL,
	`alert_type` varchar(100) NOT NULL,
	`alert_severity` enum('low','medium','high','critical') NOT NULL,
	`alert_title` varchar(255) NOT NULL,
	`alert_description` text NOT NULL,
	`triggered_rule_id` int,
	`triggered_rule_name` varchar(255),
	`related_entity_type` varchar(50),
	`related_entity_id` int,
	`alert_data` text,
	`fraud_score` int,
	`status` enum('new','acknowledged','investigating','resolved','false_alarm') NOT NULL DEFAULT 'new',
	`assigned_to` int,
	`resolution_notes` text,
	`resolution_date` timestamp,
	`is_fraud_confirmed` tinyint,
	`actions_taken` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `fraud_alerts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fraud_indicators` (
	`id` int AUTO_INCREMENT NOT NULL,
	`claim_id` int NOT NULL,
	`overall_fraud_score` int NOT NULL,
	`fraud_risk_level` enum('low','medium','moderate','high','critical','elevated') NOT NULL,
	`delayed_submission_days` int,
	`delayed_submission_score` int,
	`is_non_owner_driver` tinyint DEFAULT 0,
	`non_owner_driver_score` int,
	`is_sole_party_night_accident` tinyint DEFAULT 0,
	`sole_party_night_score` int,
	`policy_age_days` int,
	`new_policy_write_off_score` int,
	`previous_insurer_count` int,
	`insurer_hopping_score` int,
	`claimant_history_score` int,
	`quote_similarity_score` int,
	`has_copy_quotations` tinyint DEFAULT 0,
	`inflated_parts_cost_score` int,
	`inflated_labor_time_score` int,
	`exaggerated_damage_score` int,
	`replacement_vs_repair_ratio` int,
	`replacement_ratio_score` int,
	`damage_scope_creep_score` int,
	`assessor_collusion_score` int,
	`assessor_bias_score` int,
	`rubber_stamping_score` int,
	`photo_metadata_score` int,
	`reused_photo_score` int,
	`document_consistency_score` int,
	`staged_accident_score` int,
	`geographic_risk_score` int,
	`temporal_anomaly_score` int,
	`detected_patterns` text,
	`fraud_evidence` text,
	`requires_investigation` tinyint NOT NULL DEFAULT 0,
	`investigation_priority` enum('low','medium','high','urgent'),
	`investigation_status` enum('pending','in_progress','completed','closed') DEFAULT 'pending',
	`investigation_notes` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`tenant_id` varchar(255),
	CONSTRAINT `fraud_indicators_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fraud_rules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`rule_name` varchar(255) NOT NULL,
	`rule_description` text,
	`rule_category` enum('claimant','panel_beater','assessor','vehicle','document','temporal','geographic','network') NOT NULL,
	`is_active` tinyint NOT NULL DEFAULT 1,
	`severity` enum('low','medium','high','critical') NOT NULL,
	`score_weight` int NOT NULL DEFAULT 10,
	`threshold_value` int,
	`threshold_unit` varchar(50),
	`rule_logic` text,
	`auto_flag` tinyint DEFAULT 1,
	`requires_manual_review` tinyint DEFAULT 0,
	`notify_investigator` tinyint DEFAULT 0,
	`times_triggered` int DEFAULT 0,
	`true_positive_count` int DEFAULT 0,
	`false_positive_count` int DEFAULT 0,
	`accuracy` int DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `fraud_rules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `generated_reports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`claim_id` int,
	`report_type` enum('claims_assessment','portfolio_summary','fraud_intelligence','executive_summary','risk_portfolio','processor_performance','assessor_performance','panel_beater_performance') NOT NULL,
	`tier` enum('process','protect','prove') NOT NULL DEFAULT 'process',
	`s3_key` varchar(500) NOT NULL,
	`url` varchar(1000) NOT NULL,
	`generated_by_user_id` int NOT NULL,
	`generated_at` varchar(50) NOT NULL,
	`file_size_bytes` int,
	`page_count` int,
	`status` enum('generating','ready','failed') NOT NULL DEFAULT 'ready',
	`error_message` text,
	`created_at` varchar(50) NOT NULL,
	CONSTRAINT `generated_reports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ingestion_documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` varchar(64) NOT NULL,
	`batch_id` int NOT NULL,
	`document_id` varchar(36) NOT NULL,
	`original_filename` varchar(500) NOT NULL,
	`file_size_bytes` int NOT NULL,
	`mime_type` varchar(100) NOT NULL,
	`s3_bucket` varchar(255) NOT NULL,
	`s3_key` varchar(1024) NOT NULL,
	`s3_url` varchar(2048) NOT NULL,
	`sha256_hash` varchar(64) NOT NULL,
	`hash_verified` tinyint NOT NULL DEFAULT 0,
	`document_type` enum('claim_form','police_report','damage_image','repair_quote','assessor_report','supporting_evidence','unknown'),
	`classification_confidence` decimal(5,4),
	`classification_method` enum('ai_model','rule_based','manual_override'),
	`extraction_status` enum('pending','processing','completed','failed') NOT NULL DEFAULT 'pending',
	`extraction_started_at` timestamp,
	`extraction_completed_at` timestamp,
	`validation_status` enum('pending','in_review','approved','rejected') NOT NULL DEFAULT 'pending',
	`validated_by_user_id` int,
	`validated_at` timestamp,
	`page_count` int,
	`language_detected` varchar(10),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`p_hash` varchar(64),
	`historical_claim_id` int,
	CONSTRAINT `ingestion_documents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `insurer_marketplace_links` (
	`id` int AUTO_INCREMENT NOT NULL,
	`insurer_tenant_id` varchar(64) NOT NULL,
	`marketplace_profile_id` varchar(36) NOT NULL,
	`status` enum('active','suspended') NOT NULL DEFAULT 'active',
	`linked_by` int,
	`linked_at` timestamp NOT NULL DEFAULT (now()),
	`suspended_at` timestamp,
	`suspension_reason` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `insurer_marketplace_links_id` PRIMARY KEY(`id`),
	CONSTRAINT `unique_insurer_marketplace_link` UNIQUE(`insurer_tenant_id`,`marketplace_profile_id`)
);
--> statement-breakpoint
CREATE TABLE `insurer_marketplace_relationships` (
	`id` int AUTO_INCREMENT NOT NULL,
	`insurer_tenant_id` varchar(255) NOT NULL,
	`marketplace_profile_id` varchar(36) NOT NULL,
	`relationship_status` enum('approved','suspended','blacklisted') NOT NULL DEFAULT 'approved',
	`sla_signed` tinyint NOT NULL DEFAULT 0,
	`preferred` tinyint NOT NULL DEFAULT 0,
	`notes` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `insurer_marketplace_relationships_id` PRIMARY KEY(`id`),
	CONSTRAINT `unique_insurer_relationship` UNIQUE(`insurer_tenant_id`,`marketplace_profile_id`)
);
--> statement-breakpoint
CREATE TABLE `insurer_quote_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`claim_id` int NOT NULL,
	`insurer_tenant_id` varchar(64) NOT NULL,
	`agency_tenant_id` varchar(64) NOT NULL,
	`status` enum('pending','sent','quoted','accepted','rejected','expired') NOT NULL DEFAULT 'pending',
	`quote_amount` decimal(12,2),
	`quote_currency` varchar(10) DEFAULT 'USD',
	`quote_notes` text,
	`quote_valid_until` timestamp,
	`sent_at` timestamp,
	`quoted_at` timestamp,
	`responded_at` timestamp,
	`request_type` enum('standard_claim','fleet_policy') NOT NULL DEFAULT 'standard_claim',
	`claim_source` varchar(50) NOT NULL DEFAULT 'direct',
	`fleet_account_id` int,
	`vehicle_count` int,
	`estimated_total_value` decimal(14,2),
	`claims_history_summary` text,
	`commission_estimate` decimal(12,2),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `insurer_quote_requests_id` PRIMARY KEY(`id`),
	CONSTRAINT `unique_claim_insurer_quote` UNIQUE(`claim_id`,`insurer_tenant_id`)
);
--> statement-breakpoint
CREATE TABLE `marketplace_profiles` (
	`id` varchar(36) NOT NULL,
	`type` enum('assessor','panel_beater') NOT NULL,
	`company_name` varchar(255) NOT NULL,
	`country_id` varchar(10) NOT NULL DEFAULT 'ZA',
	`contact_email` varchar(320),
	`contact_phone` varchar(50),
	`address` text,
	`license_number` varchar(100),
	`specializations` json,
	`approval_status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`rejection_reason` text,
	`approved_by` int,
	`approved_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `marketplace_profiles_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `panel_beater_quotes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`claim_id` int NOT NULL,
	`panel_beater_id` int NOT NULL,
	`quoted_amount` int NOT NULL,
	`labor_cost` int,
	`parts_cost` int,
	`estimated_duration` int,
	`labor_hours` int,
	`itemized_breakdown` text,
	`notes` text,
	`modified` tinyint DEFAULT 0,
	`original_quoted_amount` int,
	`modification_reason` text,
	`modified_by_assessor_id` int,
	`panel_beater_agreed` tinyint,
	`quote_type` enum('original','strip_requote','assessor_adjusted','supplementary','revised') NOT NULL DEFAULT 'original',
	`parent_quote_id` int,
	`status` enum('draft','submitted','modified','accepted','rejected') NOT NULL DEFAULT 'draft',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`components_json` text,
	`parts_quality` enum('aftermarket','oem','genuine','used') DEFAULT 'aftermarket',
	`warranty_months` int DEFAULT 12,
	`tenant_id` varchar(255),
	`currency_code` varchar(10) DEFAULT 'USD',
	`quote_audit_json` text,
	`quote_congruency_score` decimal(5,2),
	CONSTRAINT `panel_beater_quotes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pdf_reports` (
	`id` varchar(255) NOT NULL,
	`snapshot_id` varchar(255) NOT NULL,
	`s3_url` text NOT NULL,
	`file_size_bytes` int NOT NULL,
	`generated_at` timestamp NOT NULL DEFAULT (now()),
	`deleted_at` timestamp,
	`tenant_id` varchar(255) NOT NULL,
	CONSTRAINT `pdf_reports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `physics_validation_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`claim_id` varchar(50) NOT NULL,
	`assessment_id` int,
	`predicted_speed_kmh` decimal(6,2),
	`predicted_speed_low_kmh` decimal(6,2),
	`predicted_speed_high_kmh` decimal(6,2),
	`predicted_crush_depth_mm` decimal(7,2),
	`predicted_repair_cost_local` decimal(12,2),
	`predicted_delta_v_kmh` decimal(6,2),
	`uncertainty_grade` varchar(1),
	`integrity_score` int,
	`actual_speed_kmh` decimal(6,2),
	`actual_repair_cost_local` decimal(12,2),
	`actual_damage_zone` varchar(50),
	`actual_settlement_amount` decimal(12,2),
	`adjuster_override_reason` text,
	`speed_deviation_pct` decimal(7,3),
	`cost_deviation_pct` decimal(7,3),
	`speed_within_ci` tinyint,
	`calibration_feedback_json` json,
	`validation_status` varchar(30) NOT NULL DEFAULT 'pending',
	`validated_at` timestamp,
	`created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `physics_validation_records_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `police_reports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`claim_id` int NOT NULL,
	`report_number` varchar(100) NOT NULL,
	`police_station` varchar(200),
	`officer_name` varchar(200),
	`officer_badge_number` varchar(100),
	`report_date` timestamp,
	`reported_speed` int,
	`reported_weather` varchar(100),
	`reported_road_condition` varchar(100),
	`reported_visibility` varchar(100),
	`accident_location` text,
	`accident_description` text,
	`violations_issued` text,
	`citation_numbers` text,
	`witness_statements` text,
	`witness_count` int DEFAULT 0,
	`police_photos` text,
	`accident_diagram` varchar(500),
	`report_document_url` varchar(500),
	`speed_discrepancy` int,
	`location_mismatch` tinyint DEFAULT 0,
	`weather_mismatch` tinyint DEFAULT 0,
	`description_inconsistent` tinyint DEFAULT 0,
	`notes` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`road_surface` varchar(100),
	`vehicle1_mass` int,
	`vehicle2_mass` int,
	`skid_mark_length` decimal(10,2),
	`impact_speed` int,
	`road_gradient` decimal(5,2),
	`lighting_condition` varchar(100),
	`traffic_condition` varchar(100),
	`ocr_extracted` tinyint DEFAULT 0,
	`ocr_confidence` int,
	`ocr_notes` text,
	CONSTRAINT `police_reports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `policy_documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`policy_id` int NOT NULL,
	`document_type` enum('policy_schedule','certificate_of_insurance','endorsement','cancellation_notice','renewal_notice','other') NOT NULL,
	`document_url` varchar(500) NOT NULL,
	`s3_key` varchar(500) NOT NULL,
	`version` int NOT NULL DEFAULT 1,
	`file_name` varchar(255),
	`file_size` int,
	`mime_type` varchar(100),
	`uploaded_by` int,
	`tenant_id` varchar(255),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `policy_documents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pre_accident_damage` (
	`id` int AUTO_INCREMENT NOT NULL,
	`claim_id` int NOT NULL,
	`damage_type` enum('rust','dent','scratch','paint_damage','mechanical','glass','interior','other') NOT NULL,
	`location` varchar(200) NOT NULL,
	`severity` enum('minor','moderate','severe') NOT NULL,
	`description` text,
	`photo_url` varchar(500),
	`documented_date` timestamp,
	`estimated_age` varchar(100),
	`is_related_to_current_claim` tinyint DEFAULT 0,
	`assessor_notes` text,
	`documented_by` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pre_accident_damage_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `quotation_request_documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`quotation_request_id` int NOT NULL,
	`client_user_id` int,
	`document_type_qrd` enum('policy_schedule','certificate_of_insurance','endorsement','renewal_notice','cancellation_notice','cover_note','debit_note','claim_form','proposal_form','other') NOT NULL DEFAULT 'other',
	`title` varchar(255) NOT NULL,
	`file_name` varchar(255) NOT NULL,
	`file_url` text NOT NULL,
	`s3_key` varchar(500) NOT NULL,
	`file_size` int,
	`mime_type` varchar(100),
	`sent_by_agent_id` int,
	`delivered_to_client` tinyint NOT NULL DEFAULT 1,
	`emailed_to_client` tinyint NOT NULL DEFAULT 0,
	`notes` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `quotation_request_documents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `quote_line_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`quote_id` int NOT NULL,
	`item_number` int,
	`description` varchar(500) NOT NULL,
	`part_number` varchar(100),
	`category` enum('parts','labor','paint','diagnostic','sundries','other') NOT NULL,
	`quantity` decimal(10,2) NOT NULL,
	`unit_price` decimal(10,2) NOT NULL,
	`line_total` decimal(10,2) NOT NULL,
	`currency` varchar(10) NOT NULL DEFAULT 'USD',
	`vat_rate` decimal(5,2) DEFAULT '15.00',
	`vat_amount` decimal(10,2),
	`total_with_vat` decimal(10,2),
	`is_repair` tinyint DEFAULT 0,
	`is_replacement` tinyint DEFAULT 1,
	`betterment_amount` decimal(10,2),
	`net_cost` decimal(10,2),
	`is_price_inflated` tinyint DEFAULT 0,
	`is_unrelated_damage` tinyint DEFAULT 0,
	`is_missing_in_other_quotes` tinyint DEFAULT 0,
	`notes` text,
	`ai_review` varchar(50),
	`part_origin` enum('oem','aftermarket','reconditioned','used','unknown') DEFAULT 'unknown',
	`repairer_name` varchar(255),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `quote_line_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `quote_optimisation_results` (
	`id` int AUTO_INCREMENT NOT NULL,
	`claim_id` int NOT NULL,
	`triggered_at` timestamp NOT NULL DEFAULT (now()),
	`triggered_by` int,
	`status` enum('pending','processing','completed','failed') NOT NULL DEFAULT 'pending',
	`quote_analysis` json,
	`recommended_profile_id` varchar(36),
	`recommended_company_name` varchar(255),
	`overall_risk_score` enum('low','medium','high','critical'),
	`risk_score_numeric` decimal(5,2),
	`overpricing_detected` tinyint NOT NULL DEFAULT 0,
	`parts_inflation_detected` tinyint NOT NULL DEFAULT 0,
	`labour_inflation_detected` tinyint NOT NULL DEFAULT 0,
	`optimisation_summary` text,
	`raw_llm_response` json,
	`insurer_accepted_recommendation` tinyint,
	`insurer_decision_by` int,
	`insurer_decision_at` timestamp,
	`insurer_override_reason` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `quote_optimisation_results_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `repair_cost_intelligence` (
	`id` int AUTO_INCREMENT NOT NULL,
	`vehicle_make` varchar(100) NOT NULL,
	`vehicle_model` varchar(100) NOT NULL,
	`vehicle_year` int,
	`damage_category` varchar(100) NOT NULL,
	`country` varchar(10) NOT NULL DEFAULT 'ZA',
	`median_repair_cost` int NOT NULL,
	`min_repair_cost` int NOT NULL,
	`max_repair_cost` int NOT NULL,
	`claim_count` int NOT NULL DEFAULT 0,
	`intelligence_confidence` enum('low','medium','high') NOT NULL DEFAULT 'low',
	`last_updated` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `repair_cost_intelligence_id` PRIMARY KEY(`id`),
	CONSTRAINT `idx_rci_unique` UNIQUE(`vehicle_make`,`vehicle_model`,`damage_category`,`country`)
);
--> statement-breakpoint
CREATE TABLE `repair_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`repairer_id` int NOT NULL,
	`vehicle_id` int,
	`claim_id` int NOT NULL,
	`components_repaired_json` text,
	`component_count` int NOT NULL DEFAULT 0,
	`component_match_score` int NOT NULL DEFAULT 100,
	`repair_cost_cents` int NOT NULL DEFAULT 0,
	`labour_cost_cents` int NOT NULL DEFAULT 0,
	`parts_cost_cents` int NOT NULL DEFAULT 0,
	`ai_estimated_cost_cents` int NOT NULL DEFAULT 0,
	`cost_deviation_pct` decimal(7,2),
	`approval_date` varchar(20),
	`repair_date` varchar(20),
	`repair_duration_days` int,
	`repeat_damage_within_12_months` tinyint NOT NULL DEFAULT 0,
	`repair_cost_ratio` decimal(6,3),
	`repair_quality_score` int NOT NULL DEFAULT 0,
	`is_warranty_repair` tinyint NOT NULL DEFAULT 0,
	`original_repair_id` int,
	`is_fraud_flagged` tinyint NOT NULL DEFAULT 0,
	`fraud_signals_json` text,
	`damage_history_ids_json` text,
	`damage_history_link_count` int NOT NULL DEFAULT 0,
	`tenant_id` varchar(255),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `repair_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `report_access_audit` (
	`id` int AUTO_INCREMENT NOT NULL,
	`report_id` varchar(255) NOT NULL,
	`report_type` enum('pdf','interactive') NOT NULL,
	`accessed_by` int NOT NULL,
	`access_type` enum('view','download','export','create') NOT NULL,
	`accessed_at` timestamp NOT NULL DEFAULT (now()),
	`ip_address` varchar(45),
	`user_agent` text,
	`tenant_id` varchar(255) NOT NULL,
	CONSTRAINT `report_access_audit_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `report_links` (
	`id` varchar(255) NOT NULL,
	`snapshot_id` varchar(255) NOT NULL,
	`interactive_url` text NOT NULL,
	`access_token` varchar(255) NOT NULL,
	`qr_code_data` text,
	`expires_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`tenant_id` varchar(255) NOT NULL,
	CONSTRAINT `report_links_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `report_snapshots` (
	`id` varchar(255) NOT NULL,
	`claim_id` int NOT NULL,
	`version` int NOT NULL,
	`report_type` enum('insurer','assessor','regulatory') NOT NULL,
	`intelligence_data` json NOT NULL,
	`audit_hash` varchar(64) NOT NULL,
	`generated_by` int NOT NULL,
	`generated_at` timestamp NOT NULL DEFAULT (now()),
	`is_immutable` tinyint NOT NULL DEFAULT 1,
	`tenant_id` varchar(255) NOT NULL,
	CONSTRAINT `report_snapshots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `service_quotes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`request_id` int NOT NULL,
	`provider_id` int NOT NULL,
	`tenant_id` varchar(64),
	`quoted_amount` int NOT NULL,
	`labor_cost` int,
	`parts_cost` int,
	`additional_costs` int,
	`estimated_duration` int,
	`availability_date` timestamp,
	`completion_date` timestamp,
	`quote_line_items` text,
	`parts_required` text,
	`provider_name` varchar(255) NOT NULL,
	`provider_location` varchar(255),
	`provider_rating` decimal(3,2),
	`provider_completed_jobs` int,
	`ai_cost_score` int,
	`cost_deviation_percent` decimal(5,2),
	`recommendation_score` int,
	`status` enum('pending','accepted','rejected','expired') DEFAULT 'pending',
	`valid_until` timestamp,
	`submitted_at` timestamp NOT NULL DEFAULT (now()),
	`accepted_at` timestamp,
	CONSTRAINT `service_quotes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `supplier_quote_line_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`quote_id` int NOT NULL,
	`part_name` varchar(255) NOT NULL,
	`part_number` varchar(100),
	`part_description` text,
	`part_category` varchar(100),
	`vehicle_make` varchar(100),
	`vehicle_model` varchar(100),
	`vehicle_year_from` int,
	`vehicle_year_to` int,
	`price` decimal(10,2) NOT NULL,
	`currency` varchar(3) NOT NULL,
	`part_type` enum('OEM','OEM_Equivalent','Aftermarket','Used','Unknown') DEFAULT 'Unknown',
	`quantity` int DEFAULT 1,
	`approved` tinyint DEFAULT 0,
	`rejection_reason` text,
	`extracted_at` timestamp NOT NULL DEFAULT (now()),
	`line_number` int,
	`shipping_cost` decimal(10,2),
	`customs_duty` decimal(10,2),
	`clearing_fees` decimal(10,2),
	`forex_charges` decimal(10,2),
	`lead_time_days` int,
	CONSTRAINT `supplier_quote_line_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `supplier_quotes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`supplier_name` varchar(255) NOT NULL,
	`supplier_country` varchar(100) NOT NULL,
	`supplier_contact` varchar(255),
	`quote_date` date NOT NULL,
	`quote_number` varchar(100),
	`quote_valid_until` date,
	`document_url` text NOT NULL,
	`document_type` enum('pdf','excel','image') NOT NULL,
	`status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`extracted_at` timestamp,
	`reviewed_at` timestamp,
	`reviewed_by` int,
	`extraction_confidence` decimal(5,2),
	`extraction_notes` text,
	`uploaded_by` int NOT NULL,
	`uploaded_at` timestamp NOT NULL DEFAULT (now()),
	`notes` text,
	CONSTRAINT `supplier_quotes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `valuation_comparable_evidence` (
	`id` int AUTO_INCREMENT NOT NULL,
	`valuation_request_id` int NOT NULL,
	`source_type` enum('market_valuation_record','historical_claim') NOT NULL,
	`source_reference` varchar(255) NOT NULL,
	`observed_value_cents` int NOT NULL,
	`observed_at` timestamp,
	`vehicle_year` int,
	`vehicle_match_json` longtext NOT NULL,
	`adjustment_json` longtext,
	`limitation` text,
	`inclusion_status` enum('included','excluded','review_required') NOT NULL DEFAULT 'included',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `valuation_comparable_evidence_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `adjuster_sign_offs` ADD CONSTRAINT `adjuster_sign_offs_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE cascade ON UPDATE cascade;
--> statement-breakpoint
ALTER TABLE `ai_assessments` ADD CONSTRAINT `ai_assessments_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE cascade ON UPDATE cascade;
--> statement-breakpoint
ALTER TABLE `assessor_report_attachments` ADD CONSTRAINT `assessor_report_attachments_report_id_assessor_reports_id_fk` FOREIGN KEY (`report_id`) REFERENCES `assessor_reports`(`id`) ON DELETE cascade ON UPDATE cascade;
--> statement-breakpoint
ALTER TABLE `assessor_report_reviews` ADD CONSTRAINT `assessor_report_reviews_report_id_assessor_reports_id_fk` FOREIGN KEY (`report_id`) REFERENCES `assessor_reports`(`id`) ON DELETE cascade ON UPDATE cascade;
--> statement-breakpoint
ALTER TABLE `assessor_report_reviews` ADD CONSTRAINT `assessor_report_reviews_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE cascade ON UPDATE cascade;
--> statement-breakpoint
ALTER TABLE `assessor_report_reviews` ADD CONSTRAINT `assessor_report_reviews_reviewer_user_id_users_id_fk` FOREIGN KEY (`reviewer_user_id`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE cascade;
--> statement-breakpoint
ALTER TABLE `assessor_reports` ADD CONSTRAINT `assessor_reports_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE cascade ON UPDATE cascade;
--> statement-breakpoint
ALTER TABLE `assessor_reports` ADD CONSTRAINT `assessor_reports_assessor_user_id_users_id_fk` FOREIGN KEY (`assessor_user_id`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE cascade;
--> statement-breakpoint
ALTER TABLE `assessor_reports` ADD CONSTRAINT `assessor_reports_assignment_id_claim_assignments_id_fk` FOREIGN KEY (`assignment_id`) REFERENCES `claim_assignments`(`id`) ON DELETE restrict ON UPDATE cascade;
--> statement-breakpoint
ALTER TABLE `assessor_reports` ADD CONSTRAINT `assessor_reports_attested_by_user_id_users_id_fk` FOREIGN KEY (`attested_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE cascade;
--> statement-breakpoint
ALTER TABLE `claim_confidence_scores` ADD CONSTRAINT `claim_confidence_scores_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE cascade ON UPDATE cascade;
--> statement-breakpoint
ALTER TABLE `claim_routing_decisions` ADD CONSTRAINT `claim_routing_decisions_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE cascade ON UPDATE cascade;
--> statement-breakpoint
ALTER TABLE `claim_routing_decisions` ADD CONSTRAINT `fk_crd_confidence_score` FOREIGN KEY (`confidence_score_id`) REFERENCES `claim_confidence_scores`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `claim_routing_decisions` ADD CONSTRAINT `fk_crd_automation_policy` FOREIGN KEY (`automation_policy_id`) REFERENCES `automation_policies`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `component_repair_outcomes` ADD CONSTRAINT `component_repair_outcomes_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE cascade ON UPDATE cascade;
--> statement-breakpoint
ALTER TABLE `cost_learning_records` ADD CONSTRAINT `cost_learning_records_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE set null ON UPDATE cascade;
--> statement-breakpoint
ALTER TABLE `fraud_alerts` ADD CONSTRAINT `fraud_alerts_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE cascade ON UPDATE cascade;
--> statement-breakpoint
ALTER TABLE `fraud_indicators` ADD CONSTRAINT `fraud_indicators_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE cascade ON UPDATE cascade;
--> statement-breakpoint
ALTER TABLE `generated_reports` ADD CONSTRAINT `generated_reports_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE cascade ON UPDATE cascade;
--> statement-breakpoint
ALTER TABLE `insurer_quote_requests` ADD CONSTRAINT `insurer_quote_requests_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE cascade ON UPDATE cascade;
--> statement-breakpoint
ALTER TABLE `panel_beater_quotes` ADD CONSTRAINT `panel_beater_quotes_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE cascade ON UPDATE cascade;
--> statement-breakpoint
ALTER TABLE `police_reports` ADD CONSTRAINT `police_reports_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE cascade ON UPDATE cascade;
--> statement-breakpoint
ALTER TABLE `pre_accident_damage` ADD CONSTRAINT `pre_accident_damage_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE cascade ON UPDATE cascade;
--> statement-breakpoint
ALTER TABLE `quote_optimisation_results` ADD CONSTRAINT `quote_optimisation_results_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE cascade ON UPDATE cascade;
--> statement-breakpoint
ALTER TABLE `repair_history` ADD CONSTRAINT `repair_history_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE cascade ON UPDATE cascade;
--> statement-breakpoint
ALTER TABLE `report_snapshots` ADD CONSTRAINT `report_snapshots_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE cascade ON UPDATE cascade;
--> statement-breakpoint
CREATE INDEX `idx_aso_claim_id` ON `adjuster_sign_offs` (`claim_id`);
--> statement-breakpoint
CREATE INDEX `idx_aso_adjuster_user_id` ON `adjuster_sign_offs` (`adjuster_user_id`);
--> statement-breakpoint
CREATE INDEX `idx_ai_assessments_claim_id` ON `ai_assessments` (`claim_id`);
--> statement-breakpoint
CREATE INDEX `idx_ai_claim_confidence` ON `ai_assessments` (`claim_id`,`confidence_score`);
--> statement-breakpoint
CREATE INDEX `idx_ai_tenant_fraud` ON `ai_assessments` (`tenant_id`,`fraud_risk_level`);
--> statement-breakpoint
CREATE INDEX `idx_apl_claim` ON `ai_prediction_logs` (`historical_claim_id`);
--> statement-breakpoint
CREATE INDEX `idx_apl_tenant` ON `ai_prediction_logs` (`tenant_id`);
--> statement-breakpoint
CREATE INDEX `idx_assessor_report_attachments_report` ON `assessor_report_attachments` (`report_id`);
--> statement-breakpoint
CREATE INDEX `idx_assessor_report_attachments_tenant` ON `assessor_report_attachments` (`tenant_id`);
--> statement-breakpoint
CREATE INDEX `idx_assessor_report_reviews_reviewer_state` ON `assessor_report_reviews` (`reviewer_user_id`,`status`);
--> statement-breakpoint
CREATE INDEX `idx_assessor_report_reviews_claim_state` ON `assessor_report_reviews` (`claim_id`,`status`);
--> statement-breakpoint
CREATE INDEX `idx_assessor_report_reviews_tenant_state` ON `assessor_report_reviews` (`tenant_id`,`status`);
--> statement-breakpoint
CREATE INDEX `idx_assessor_reports_claim_state` ON `assessor_reports` (`claim_id`,`status`);
--> statement-breakpoint
CREATE INDEX `idx_assessor_reports_assessor_state` ON `assessor_reports` (`assessor_user_id`,`status`);
--> statement-breakpoint
CREATE INDEX `idx_assessor_reports_tenant_state` ON `assessor_reports` (`tenant_id`,`status`);
--> statement-breakpoint
CREATE INDEX `idx_tenant_active` ON `automation_policies` (`tenant_id`,`is_active`);
--> statement-breakpoint
CREATE INDEX `idx_policy_name` ON `automation_policies` (`policy_name`);
--> statement-breakpoint
CREATE INDEX `idx_claim_id` ON `claim_confidence_scores` (`claim_id`);
--> statement-breakpoint
CREATE INDEX `idx_tenant_id` ON `claim_confidence_scores` (`tenant_id`);
--> statement-breakpoint
CREATE INDEX `idx_composite_score` ON `claim_confidence_scores` (`composite_confidence_score`);
--> statement-breakpoint
CREATE INDEX `idx_scoring_timestamp` ON `claim_confidence_scores` (`scoring_timestamp`);
--> statement-breakpoint
CREATE INDEX `idx_cdl_tenant` ON `claim_decision_lifecycle` (`tenant_id`);
--> statement-breakpoint
CREATE INDEX `idx_cdl_state` ON `claim_decision_lifecycle` (`lifecycle_state`);
--> statement-breakpoint
CREATE INDEX `idx_claim_id` ON `claim_routing_decisions` (`claim_id`);
--> statement-breakpoint
CREATE INDEX `idx_tenant_id` ON `claim_routing_decisions` (`tenant_id`);
--> statement-breakpoint
CREATE INDEX `idx_routed_workflow` ON `claim_routing_decisions` (`routed_workflow`);
--> statement-breakpoint
CREATE INDEX `idx_decision_timestamp` ON `claim_routing_decisions` (`decision_timestamp`);
--> statement-breakpoint
CREATE INDEX `idx_cro_claim_id` ON `component_repair_outcomes` (`claim_id`);
--> statement-breakpoint
CREATE INDEX `idx_cro_component_severity` ON `component_repair_outcomes` (`component_name`,`severity_at_decision`);
--> statement-breakpoint
CREATE INDEX `idx_cro_make_model` ON `component_repair_outcomes` (`vehicle_make`,`vehicle_model`);
--> statement-breakpoint
CREATE INDEX `idx_cro_vehicle_precision` ON `component_repair_outcomes` (`component_name`,`vehicle_make`,`vehicle_model`,`vehicle_year`);
--> statement-breakpoint
CREATE INDEX `idx_cro_market_currency` ON `component_repair_outcomes` (`market_region`,`currency_code`,`evidence_quality`);
--> statement-breakpoint
CREATE INDEX `idx_cro_outcome` ON `component_repair_outcomes` (`outcome`);
--> statement-breakpoint
CREATE INDEX `idx_cc_claim` ON `cost_components` (`historical_claim_id`);
--> statement-breakpoint
CREATE INDEX `idx_clr_claim_id` ON `cost_learning_records` (`claim_id`);
--> statement-breakpoint
CREATE INDEX `idx_clr_tenant_id` ON `cost_learning_records` (`tenant_id`);
--> statement-breakpoint
CREATE INDEX `idx_clr_case_signature` ON `cost_learning_records` (`case_signature`);
--> statement-breakpoint
CREATE INDEX `idx_clr_vehicle_descriptor` ON `cost_learning_records` (`vehicle_descriptor`);
--> statement-breakpoint
CREATE INDEX `idx_clr_vehicle_precision` ON `cost_learning_records` (`vehicle_make`,`vehicle_model`,`vehicle_year`);
--> statement-breakpoint
CREATE INDEX `idx_clr_market_currency` ON `cost_learning_records` (`market_region`,`currency`);
--> statement-breakpoint
CREATE INDEX `idx_clr_collision_direction` ON `cost_learning_records` (`collision_direction`);
--> statement-breakpoint
CREATE INDEX `idx_clr_recorded_at` ON `cost_learning_records` (`recorded_at`);
--> statement-breakpoint
CREATE INDEX `idx_cri_country` ON `country_repair_index` (`country_code`);
--> statement-breakpoint
CREATE INDEX `idx_cri_effective` ON `country_repair_index` (`effective_from`);
--> statement-breakpoint
CREATE INDEX `currency_exchange_rates_currency_code_unique` ON `currency_exchange_rates` (`currency_code`);
--> statement-breakpoint
CREATE INDEX `idx_ds_claim` ON `decision_snapshots` (`claim_id`);
--> statement-breakpoint
CREATE INDEX `idx_ds_tenant` ON `decision_snapshots` (`tenant_id`);
--> statement-breakpoint
CREATE INDEX `idx_ds_created` ON `decision_snapshots` (`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_ds_verdict` ON `decision_snapshots` (`verdict_decision`);
--> statement-breakpoint
CREATE INDEX `idx_ds_lifecycle` ON `decision_snapshots` (`lifecycle_state`);
--> statement-breakpoint
CREATE INDEX `document_naming_templates_tenant_id_doc_type_unique` ON `document_naming_templates` (`tenant_id`,`doc_type`);
--> statement-breakpoint
CREATE INDEX `idx_eri_claim` ON `extracted_repair_items` (`historical_claim_id`);
--> statement-breakpoint
CREATE INDEX `idx_fleet_incident_reports_tenant_id` ON `fleet_incident_reports` (`tenant_id`);
--> statement-breakpoint
CREATE INDEX `idx_fleet_incident_reports_fleet_id` ON `fleet_incident_reports` (`fleet_id`);
--> statement-breakpoint
CREATE INDEX `idx_fleet_incident_reports_vehicle_id` ON `fleet_incident_reports` (`vehicle_id`);
--> statement-breakpoint
CREATE INDEX `idx_fleet_incident_reports_driver_id` ON `fleet_incident_reports` (`driver_id`);
--> statement-breakpoint
CREATE INDEX `idx_fleet_incident_reports_status` ON `fleet_incident_reports` (`status`);
--> statement-breakpoint
CREATE INDEX `rule_name` ON `fraud_rules` (`rule_name`);
--> statement-breakpoint
CREATE INDEX `idx_gr_tenant_id` ON `generated_reports` (`tenant_id`);
--> statement-breakpoint
CREATE INDEX `idx_gr_claim_id` ON `generated_reports` (`claim_id`);
--> statement-breakpoint
CREATE INDEX `idx_gr_report_type` ON `generated_reports` (`report_type`);
--> statement-breakpoint
CREATE INDEX `idx_gr_generated_by` ON `generated_reports` (`generated_by_user_id`);
--> statement-breakpoint
CREATE INDEX `idx_gr_created_at` ON `generated_reports` (`created_at`);
--> statement-breakpoint
CREATE INDEX `document_id` ON `ingestion_documents` (`document_id`);
--> statement-breakpoint
CREATE INDEX `idx_insurer_marketplace_links_tenant` ON `insurer_marketplace_links` (`insurer_tenant_id`);
--> statement-breakpoint
CREATE INDEX `idx_insurer_marketplace_links_profile` ON `insurer_marketplace_links` (`marketplace_profile_id`);
--> statement-breakpoint
CREATE INDEX `idx_imr_tenant` ON `insurer_marketplace_relationships` (`insurer_tenant_id`);
--> statement-breakpoint
CREATE INDEX `idx_imr_profile` ON `insurer_marketplace_relationships` (`marketplace_profile_id`);
--> statement-breakpoint
CREATE INDEX `idx_imr_status` ON `insurer_marketplace_relationships` (`relationship_status`);
--> statement-breakpoint
CREATE INDEX `idx_iqr_claim_id` ON `insurer_quote_requests` (`claim_id`);
--> statement-breakpoint
CREATE INDEX `idx_iqr_insurer_tenant` ON `insurer_quote_requests` (`insurer_tenant_id`);
--> statement-breakpoint
CREATE INDEX `idx_iqr_agency_tenant` ON `insurer_quote_requests` (`agency_tenant_id`);
--> statement-breakpoint
CREATE INDEX `idx_iqr_status` ON `insurer_quote_requests` (`status`);
--> statement-breakpoint
CREATE INDEX `idx_marketplace_profiles_type` ON `marketplace_profiles` (`type`);
--> statement-breakpoint
CREATE INDEX `idx_marketplace_profiles_approval_status` ON `marketplace_profiles` (`approval_status`);
--> statement-breakpoint
CREATE INDEX `idx_marketplace_profiles_country_id` ON `marketplace_profiles` (`country_id`);
--> statement-breakpoint
CREATE INDEX `idx_quotes_claim_id` ON `panel_beater_quotes` (`claim_id`);
--> statement-breakpoint
CREATE INDEX `idx_quotes_panel_beater_id` ON `panel_beater_quotes` (`panel_beater_id`);
--> statement-breakpoint
CREATE INDEX `idx_panel_beater_quotes_panel_beater_id` ON `panel_beater_quotes` (`panel_beater_id`);
--> statement-breakpoint
CREATE INDEX `idx_snapshot_id` ON `pdf_reports` (`snapshot_id`);
--> statement-breakpoint
CREATE INDEX `idx_tenant_id` ON `pdf_reports` (`tenant_id`);
--> statement-breakpoint
CREATE INDEX `qrd_quotation_request_id` ON `quotation_request_documents` (`quotation_request_id`);
--> statement-breakpoint
CREATE INDEX `qrd_client_user_id` ON `quotation_request_documents` (`client_user_id`);
--> statement-breakpoint
CREATE INDEX `idx_qor_claim_id` ON `quote_optimisation_results` (`claim_id`);
--> statement-breakpoint
CREATE INDEX `idx_qor_status` ON `quote_optimisation_results` (`status`);
--> statement-breakpoint
CREATE INDEX `idx_qor_risk` ON `quote_optimisation_results` (`overall_risk_score`);
--> statement-breakpoint
CREATE INDEX `idx_rci_make_model` ON `repair_cost_intelligence` (`vehicle_make`,`vehicle_model`);
--> statement-breakpoint
CREATE INDEX `idx_rci_damage_category` ON `repair_cost_intelligence` (`damage_category`);
--> statement-breakpoint
CREATE INDEX `idx_rci_country` ON `repair_cost_intelligence` (`country`);
--> statement-breakpoint
CREATE INDEX `idx_rh_repairer_id` ON `repair_history` (`repairer_id`);
--> statement-breakpoint
CREATE INDEX `idx_rh_vehicle_id` ON `repair_history` (`vehicle_id`);
--> statement-breakpoint
CREATE INDEX `idx_rh_claim_id` ON `repair_history` (`claim_id`);
--> statement-breakpoint
CREATE INDEX `idx_rh_repair_date` ON `repair_history` (`repair_date`);
--> statement-breakpoint
CREATE INDEX `idx_rh_quality_score` ON `repair_history` (`repair_quality_score`);
--> statement-breakpoint
CREATE INDEX `idx_rh_repeat_damage` ON `repair_history` (`repeat_damage_within_12_months`);
--> statement-breakpoint
CREATE INDEX `idx_rh_warranty_repair` ON `repair_history` (`is_warranty_repair`);
--> statement-breakpoint
CREATE INDEX `idx_rh_fraud_flagged` ON `repair_history` (`is_fraud_flagged`);
--> statement-breakpoint
CREATE INDEX `idx_rh_tenant` ON `repair_history` (`tenant_id`);
--> statement-breakpoint
CREATE INDEX `idx_report_id` ON `report_access_audit` (`report_id`);
--> statement-breakpoint
CREATE INDEX `idx_accessed_by` ON `report_access_audit` (`accessed_by`);
--> statement-breakpoint
CREATE INDEX `idx_tenant_id` ON `report_access_audit` (`tenant_id`);
--> statement-breakpoint
CREATE INDEX `idx_accessed_at` ON `report_access_audit` (`accessed_at`);
--> statement-breakpoint
CREATE INDEX `idx_snapshot_id` ON `report_links` (`snapshot_id`);
--> statement-breakpoint
CREATE INDEX `idx_access_token` ON `report_links` (`access_token`);
--> statement-breakpoint
CREATE INDEX `idx_tenant_id` ON `report_links` (`tenant_id`);
--> statement-breakpoint
CREATE INDEX `idx_claim_version` ON `report_snapshots` (`claim_id`,`version`);
--> statement-breakpoint
CREATE INDEX `idx_audit_hash` ON `report_snapshots` (`audit_hash`);
--> statement-breakpoint
CREATE INDEX `idx_tenant_id` ON `report_snapshots` (`tenant_id`);
--> statement-breakpoint
CREATE INDEX `idx_generated_by` ON `report_snapshots` (`generated_by`);
--> statement-breakpoint
CREATE INDEX `valuation_comparable_request_idx` ON `valuation_comparable_evidence` (`valuation_request_id`);
--> statement-breakpoint
CREATE INDEX `valuation_comparable_source_idx` ON `valuation_comparable_evidence` (`source_type`,`source_reference`);
--> statement-breakpoint
