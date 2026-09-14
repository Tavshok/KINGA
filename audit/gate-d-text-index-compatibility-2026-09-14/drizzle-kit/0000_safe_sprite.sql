CREATE TABLE `access_denial_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int,
	`attempted_route` varchar(500),
	`user_role` varchar(100),
	`insurer_role` varchar(100),
	`tenant_id` varchar(255),
	`denial_reason` text,
	`ip_address` varchar(45),
	`user_agent` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `access_denial_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
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
CREATE TABLE `agency_assisted_claimant_identities` (
	`id` int AUTO_INCREMENT NOT NULL,
	`agency_tenant_id` varchar(64) NOT NULL,
	`agency_client_id` int NOT NULL,
	`insurer_tenant_id` varchar(64) NOT NULL,
	`restricted_claimant_user_id` int NOT NULL,
	`verified_claimant_user_id` int,
	`status` enum('restricted','linked_to_verified_claimant') NOT NULL DEFAULT 'restricted',
	`created_by` int NOT NULL,
	`linked_by` int,
	`linked_at` timestamp,
	`link_confirmation_statement` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `agency_assisted_claimant_identities_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_agency_assisted_claimant_identity` UNIQUE(`agency_tenant_id`,`agency_client_id`,`insurer_tenant_id`)
);
--> statement-breakpoint
CREATE TABLE `agency_clients` (
	`id` int AUTO_INCREMENT NOT NULL,
	`agency_tenant_id` varchar(64) NOT NULL,
	`full_name` varchar(255) NOT NULL,
	`id_number` varchar(50),
	`email` varchar(320),
	`phone` varchar(50),
	`address` text,
	`vehicle_registration` varchar(30),
	`vehicle_make` varchar(100),
	`vehicle_model` varchar(100),
	`vehicle_year` int,
	`vehicle_vin` varchar(50),
	`notes` text,
	`created_by` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `agency_clients_id` PRIMARY KEY(`id`)
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
CREATE TABLE `agency_insurance_service_request_insurers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`service_request_id` int NOT NULL,
	`agency_tenant_id` varchar(64) NOT NULL,
	`insurer_tenant_id` varchar(64) NOT NULL,
	`status` enum('invited','viewed','responded','withdrawn') NOT NULL DEFAULT 'invited',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `agency_insurance_service_request_insurers_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_agency_service_request_insurer` UNIQUE(`service_request_id`,`insurer_tenant_id`)
);
--> statement-breakpoint
CREATE TABLE `agency_insurance_service_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`request_number` varchar(50) NOT NULL,
	`agency_tenant_id` varchar(64) NOT NULL,
	`agency_client_id` int NOT NULL,
	`vehicle_registry_id` int,
	`cover_type` enum('comprehensive','third_party','third_party_fire_theft','commercial','other') NOT NULL,
	`status` enum('draft','awaiting_client_acknowledgement','ready_for_insurer_review','under_insurer_review','closed','withdrawn') NOT NULL DEFAULT 'draft',
	`client_instruction` text NOT NULL,
	`vehicle_risk_notes` text,
	`vehicle_registration` varchar(50),
	`vehicle_make` varchar(100),
	`vehicle_model` varchar(100),
	`vehicle_year` int,
	`vehicle_vin` varchar(50),
	`vehicle_mileage_km` int,
	`client_proposed_value_cents` int,
	`kinga_market_valuation_cents` int,
	`valuation_date` timestamp,
	`valuation_provenance_json` json,
	`variance_percent` decimal(7,2),
	`client_acknowledgement_json` json,
	`created_by` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `agency_insurance_service_requests_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_agency_insurance_service_request_number` UNIQUE(`request_number`)
);
--> statement-breakpoint
CREATE TABLE `agency_insurance_valuation_deviations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`service_request_id` int NOT NULL,
	`agency_tenant_id` varchar(64) NOT NULL,
	`client_proposed_value_cents` int NOT NULL,
	`kinga_market_valuation_cents` int NOT NULL,
	`variance_percent` decimal(7,2) NOT NULL,
	`acknowledgement_json` json NOT NULL,
	`recorded_by` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `agency_insurance_valuation_deviations_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_agency_insurance_valuation_deviation_request` UNIQUE(`service_request_id`)
);
--> statement-breakpoint
CREATE TABLE `agency_product_commission_configs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`agency_tenant_id` varchar(64) NOT NULL,
	`product_id` int NOT NULL,
	`commission_rate` decimal(5,2) NOT NULL,
	`is_active` tinyint NOT NULL DEFAULT 1,
	`configured_by` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `agency_product_commission_configs_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_agency_product_commission` UNIQUE(`agency_tenant_id`,`product_id`)
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
CREATE TABLE `anonymization_audit_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`source_record_id` int NOT NULL,
	`anonymous_record_id` varchar(36),
	`status` enum('success','withheld_k_anonymity','withheld_pii_detected','withheld_tenant_opt_out') NOT NULL,
	`quasi_identifier_hash` varchar(64),
	`group_size` int,
	`transformations_applied` json,
	`anonymized_by_user_id` int,
	`anonymized_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `anonymization_audit_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `appointments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`claim_id` int NOT NULL,
	`assessor_id` int NOT NULL,
	`appointment_type` enum('claimant_inspection','panel_beater_inspection') NOT NULL,
	`claimant_id` int,
	`panel_beater_id` int,
	`scheduled_date` timestamp NOT NULL,
	`location` text,
	`notes` text,
	`status` enum('scheduled','confirmed','completed','cancelled') NOT NULL DEFAULT 'scheduled',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`tenant_id` varchar(255),
	CONSTRAINT `appointments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `approval_workflow` (
	`id` int AUTO_INCREMENT NOT NULL,
	`claim_id` int NOT NULL,
	`level` enum('assessor','risk_surveyor','risk_manager') NOT NULL,
	`level_order` int NOT NULL,
	`approver_id` int,
	`approver_name` varchar(200),
	`approver_role` varchar(100),
	`status` enum('pending','approved','rejected','returned') NOT NULL DEFAULT 'pending',
	`approved_amount` int,
	`comments` text,
	`conditions` text,
	`rejection_reason` text,
	`return_reason` text,
	`return_to_level` enum('assessor','risk_surveyor'),
	`submitted_at` timestamp,
	`reviewed_at` timestamp,
	`approval_date` timestamp,
	`is_escalated` tinyint DEFAULT 0,
	`escalation_reason` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `approval_workflow_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `assessor_deviation_metrics` (
	`id` int AUTO_INCREMENT NOT NULL,
	`assessor_id` int,
	`assessor_name` varchar(255),
	`period_start` date NOT NULL,
	`period_end` date NOT NULL,
	`total_claims` int NOT NULL,
	`average_deviation` decimal(5,2),
	`median_deviation` decimal(5,2),
	`standard_deviation` decimal(5,2),
	`overvaluation_rate` decimal(5,2),
	`undervaluation_rate` decimal(5,2),
	`consistency_score` int,
	`region` varchar(100),
	`vehicle_type` varchar(50),
	`panel_beater_id` int,
	`data_quality_score` int,
	`sample_size` int,
	`calculated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `assessor_deviation_metrics_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `assessor_evaluations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`claim_id` int NOT NULL,
	`assessor_id` int NOT NULL,
	`inspection_date` timestamp,
	`inspection_photos` text,
	`status` enum('pending','in_progress','completed','submitted') NOT NULL DEFAULT 'pending',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`estimated_repair_cost` int,
	`labor_cost` int,
	`parts_cost` int,
	`estimated_duration` int,
	`damage_assessment` text,
	`recommendations` text,
	`fraud_risk_level` enum('low','medium','moderate','high'),
	`tenant_id` varchar(255),
	`source_report_id` int,
	`source_report_version` int,
	`accepted_review_id` int,
	`disagrees_with_ai` tinyint DEFAULT 0,
	`ai_disagreement_reason` text,
	CONSTRAINT `assessor_evaluations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `assessor_insurer_relationships` (
	`id` int AUTO_INCREMENT NOT NULL,
	`assessor_id` int NOT NULL,
	`tenant_id` varchar(64) NOT NULL,
	`relationship_type` enum('insurer_owned','marketplace_contract','preferred_vendor') NOT NULL,
	`relationship_status` enum('active','suspended','terminated') DEFAULT 'active',
	`contract_start_date` timestamp NOT NULL,
	`contract_end_date` timestamp,
	`contracted_rate_per_assessment` decimal(10,2),
	`marketplace_commission_rate` decimal(5,2),
	`performance_rating` decimal(3,2),
	`total_assignments_completed` int DEFAULT 0,
	`total_assignments_rejected` int DEFAULT 0,
	`average_completion_time_hours` decimal(8,2),
	`is_preferred_vendor` tinyint DEFAULT 0,
	`preferred_vendor_since` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `assessor_insurer_relationships_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `assessor_marketplace_reviews` (
	`id` int AUTO_INCREMENT NOT NULL,
	`assessor_id` int NOT NULL,
	`claim_id` int,
	`tenant_id` varchar(64) NOT NULL,
	`reviewer_user_id` int NOT NULL,
	`overall_rating` int NOT NULL,
	`accuracy_rating` int,
	`professionalism_rating` int,
	`timeliness_rating` int,
	`communication_rating` int,
	`review_text` text,
	`would_hire_again` tinyint,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `assessor_marketplace_reviews_id` PRIMARY KEY(`id`)
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
CREATE TABLE `assessor_subscriptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`marketplace_profile_id` varchar(36) NOT NULL,
	`user_id` int NOT NULL,
	`tier` enum('free','pro') NOT NULL DEFAULT 'free',
	`max_claims_per_month` int NOT NULL DEFAULT 10,
	`expires_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `assessor_subscriptions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `assessors` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`professional_license_number` varchar(100) NOT NULL,
	`license_expiry_date` timestamp NOT NULL,
	`assessor_type` enum('insurer_owned','marketplace','hybrid') NOT NULL,
	`primary_tenant_id` varchar(64),
	`marketplace_enabled` tinyint NOT NULL DEFAULT 0,
	`marketplace_status` enum('pending_approval','active','suspended','inactive') DEFAULT 'pending_approval',
	`marketplace_onboarded_at` timestamp,
	`marketplace_bio` text,
	`marketplace_hourly_rate` decimal(10,2),
	`marketplace_availability` enum('full_time','part_time','weekends_only','on_demand') DEFAULT 'on_demand',
	`specializations` text,
	`certifications` text,
	`certification_level` enum('junior','senior','expert','master') NOT NULL,
	`years_of_experience` int,
	`service_regions` text,
	`max_travel_distance_km` int DEFAULT 50,
	`active_status` tinyint NOT NULL DEFAULT 1,
	`performance_score` decimal(5,2),
	`total_assessments_completed` int DEFAULT 0,
	`average_accuracy_score` decimal(5,2),
	`average_turnaround_hours` decimal(8,2),
	`average_rating` decimal(3,2),
	`total_ratings_count` int DEFAULT 0,
	`total_marketplace_earnings` decimal(12,2) DEFAULT '0.00',
	`pending_payout` decimal(12,2) DEFAULT '0.00',
	`last_payout_date` timestamp,
	`background_check_status` enum('pending','passed','failed') DEFAULT 'pending',
	`background_check_date` timestamp,
	`insurance_verified` tinyint DEFAULT 0,
	`insurance_expiry_date` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `assessors_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `asset_registry` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` varchar(255) NOT NULL,
	`asset_ref` varchar(100) NOT NULL,
	`asset_type` enum('vehicle','equipment','building','transformer','fire_system','solar_plant','wind_turbine','substation','industrial') NOT NULL,
	`asset_name` varchar(255) NOT NULL,
	`asset_description` text,
	`serial_number` varchar(100),
	`manufacturer` varchar(100),
	`model` varchar(100),
	`year_manufactured` int,
	`location_address` text,
	`location_lat` decimal(10,7),
	`location_lng` decimal(10,7),
	`owner_id` int,
	`owner_name` varchar(255),
	`vehicle_registration` varchar(50),
	`last_inspection_id` int,
	`last_inspected_at` timestamp,
	`inspection_count` int NOT NULL DEFAULT 0,
	`risk_rating` enum('low','medium','high','critical'),
	`metadata_json` json,
	`created_by` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `asset_registry_id` PRIMARY KEY(`id`),
	CONSTRAINT `idx_ar_ref` UNIQUE(`asset_ref`)
);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` varchar(64) NOT NULL,
	`tenant_id` varchar(64) NOT NULL,
	`user_id` int NOT NULL,
	`user_role` varchar(50) NOT NULL,
	`action_type` enum('create','update','approve','reject','view','delete') NOT NULL,
	`resource_type` varchar(50) NOT NULL,
	`resource_id` varchar(64) NOT NULL,
	`before_state` text,
	`after_state` text,
	`ip_address` varchar(45),
	`session_id` varchar(64),
	`timestamp` timestamp NOT NULL DEFAULT (now()),
	`integrity_hash` varchar(64) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `audit_trail` (
	`id` int AUTO_INCREMENT NOT NULL,
	`claim_id` int,
	`user_id` int NOT NULL,
	`action` varchar(100) NOT NULL,
	`entity_type` varchar(50),
	`entity_id` int,
	`previous_value` text,
	`new_value` text,
	`change_description` text,
	`ip_address` varchar(45),
	`user_agent` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_trail_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `automation_audit_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`claim_id` int,
	`tenant_id` varchar(255) NOT NULL,
	`confidence_score_id` int NOT NULL,
	`composite_confidence_score` decimal(5,2) NOT NULL,
	`routing_decision_id` int NOT NULL,
	`routed_workflow` enum('ai_only','hybrid','manual') NOT NULL,
	`routing_reason` text NOT NULL,
	`automation_policy_id` int NOT NULL,
	`policy_snapshot` json NOT NULL,
	`ai_estimated_cost` bigint NOT NULL,
	`assessor_adjusted_cost` bigint,
	`final_approved_cost` bigint,
	`cost_variance_ai_vs_final` decimal(5,2),
	`decision_made_at` timestamp NOT NULL,
	`claim_approved_at` timestamp,
	`claim_rejected_at` timestamp,
	`was_overridden` tinyint NOT NULL DEFAULT 0,
	`override_reason` text,
	`overridden_by_user_id` int,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `automation_audit_log_id` PRIMARY KEY(`id`)
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
CREATE TABLE `benchmark_deviations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`claim_id` int NOT NULL,
	`tenant_id` varchar(255),
	`vehicle_class` enum('light','medium','heavy') NOT NULL,
	`damage_type` varchar(50) NOT NULL,
	`severity` enum('minor','moderate','severe') NOT NULL,
	`benchmark_source` enum('static','blended','live') NOT NULL,
	`comparable_claim_count` int NOT NULL DEFAULT 0,
	`cost_value_cents` int,
	`cost_benchmark_low_cents` int,
	`cost_benchmark_high_cents` int,
	`cost_benchmark_mean_cents` int,
	`cost_deviation_pct` decimal(7,2),
	`cost_deviation_flag` tinyint DEFAULT 0,
	`cost_narrative` text,
	`physics_value_kmh` decimal(7,2),
	`physics_benchmark_low_kmh` decimal(7,2),
	`physics_benchmark_high_kmh` decimal(7,2),
	`physics_benchmark_mean_kmh` decimal(7,2),
	`physics_deviation_pct` decimal(7,2),
	`physics_deviation_flag` tinyint DEFAULT 0,
	`physics_narrative` text,
	`fraud_value_score` decimal(6,4),
	`fraud_benchmark_low` decimal(6,4),
	`fraud_benchmark_high` decimal(6,4),
	`fraud_benchmark_mean` decimal(6,4),
	`fraud_deviation_pct` decimal(7,2),
	`fraud_deviation_flag` tinyint DEFAULT 0,
	`fraud_narrative` text,
	`overall_deviation_flag` tinyint DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `benchmark_deviations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `bias_detection_flags` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` varchar(64) NOT NULL,
	`batch_id` varchar(64) NOT NULL,
	`bias_type` varchar(64) NOT NULL,
	`bias_score` decimal(5,4),
	`affected_field` varchar(128),
	`sample_size` int,
	`detected_at` timestamp NOT NULL DEFAULT (now()),
	`mitigation_applied` tinyint NOT NULL DEFAULT 0,
	`mitigation_notes` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `bias_detection_flags_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `calibration_overrides` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` varchar(255) NOT NULL,
	`jurisdiction` varchar(50) NOT NULL,
	`scenario_type` varchar(100),
	`cost_multiplier` int,
	`fraud_adjustments_json` text DEFAULT (JSON_OBJECT()),
	`risk_level` enum('LOW','MEDIUM','HIGH') NOT NULL DEFAULT 'MEDIUM',
	`reasoning` text,
	`sample_size` int NOT NULL DEFAULT 0,
	`confidence` int NOT NULL DEFAULT 0,
	`status` enum('pending_review','approved','rejected') NOT NULL DEFAULT 'pending_review',
	`approved_by` int,
	`approved_at` timestamp,
	`rejection_reason` text,
	`source_reports_json` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `calibration_overrides_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `claim_approvals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`claim_id` int NOT NULL,
	`tenant_id` varchar(255) NOT NULL,
	`workflow_template_id` int,
	`stage_order` int NOT NULL,
	`stage_name` varchar(255) NOT NULL,
	`role_key` varchar(100) NOT NULL,
	`actor_user_id` int,
	`actor_name` varchar(255),
	`decision` enum('approved','rejected','returned','escalated','external_received') NOT NULL,
	`notes` text,
	`metadata_json` text,
	`acted_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `claim_approvals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `claim_assignments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`claim_id` int NOT NULL,
	`tenant_id` varchar(255) NOT NULL,
	`assignment_role` enum('assessor','claims_assessor','claims_manager') NOT NULL,
	`assigned_to_user_id` int NOT NULL,
	`assigned_by_user_id` int,
	`assignment_source` enum('manual','workflow','reassignment','system','legacy_import') NOT NULL DEFAULT 'manual',
	`status` enum('assigned','accepted','declined','reassigned','completed','cancelled') NOT NULL DEFAULT 'assigned',
	`parent_assignment_id` int,
	`in_app_notification_created` tinyint NOT NULL DEFAULT 0,
	`email_notification_requested` tinyint NOT NULL DEFAULT 0,
	`email_notification_sent_at` timestamp,
	`email_notification_reference` varchar(255),
	`decision_reason` text,
	`assigned_at` timestamp NOT NULL DEFAULT (now()),
	`accepted_at` timestamp,
	`declined_at` timestamp,
	`reassigned_at` timestamp,
	`completed_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `claim_assignments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `claim_comment_reads` (
	`id` int AUTO_INCREMENT NOT NULL,
	`comment_id` int NOT NULL,
	`user_id` int NOT NULL,
	`read_at` varchar(50) NOT NULL,
	CONSTRAINT `claim_comment_reads_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_ccr_comment_user` UNIQUE(`comment_id`,`user_id`)
);
--> statement-breakpoint
CREATE TABLE `claim_comments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`claimId` int NOT NULL,
	`author_user_id` int NOT NULL,
	`author_role` varchar(50) NOT NULL,
	`to_roles` text NOT NULL DEFAULT (JSON_ARRAY()),
	`to_user_ids` text NOT NULL DEFAULT (JSON_ARRAY()),
	`to_emails` text NOT NULL DEFAULT (JSON_ARRAY()),
	`comment_type` enum('clarification','instruction','escalation','approval_note','rejection_note','inspection_request','general') NOT NULL DEFAULT 'general',
	`requires_response` tinyint NOT NULL DEFAULT 0,
	`response_deadline_at` varchar(50),
	`body` text NOT NULL,
	`parent_comment_id` int,
	`is_resolved` tinyint NOT NULL DEFAULT 0,
	`resolved_by_user_id` int,
	`resolved_at` varchar(50),
	`email_sent` tinyint NOT NULL DEFAULT 0,
	`notify_claimant` tinyint NOT NULL DEFAULT 0,
	`claimant_email_sent` tinyint NOT NULL DEFAULT 0,
	`status_update_template` varchar(100),
	`createdAt` text NOT NULL,
	`tenant_id` varchar(255),
	`deletedAt` text,
	`section_key` varchar(100),
	`subsection_key` varchar(100),
	`finding_id` varchar(100),
	`pipeline_run_id` int,
	`severity` varchar(20) NOT NULL DEFAULT 'info',
	`disposition` varchar(30),
	`blocks_approval` tinyint NOT NULL DEFAULT 0,
	CONSTRAINT `claim_comments_id` PRIMARY KEY(`id`)
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
CREATE TABLE `claim_documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`claim_id` int NOT NULL,
	`uploaded_by` int NOT NULL,
	`file_name` varchar(255) NOT NULL,
	`file_key` varchar(500) NOT NULL,
	`file_url` text NOT NULL,
	`file_size` int NOT NULL,
	`mime_type` varchar(100) NOT NULL,
	`document_title` varchar(255),
	`document_description` text,
	`document_category` enum('damage_photo','repair_quote','invoice','police_report','medical_report','insurance_policy','correspondence','other') NOT NULL DEFAULT 'other',
	`visible_to_roles` text,
	`inspection_id` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `claim_documents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `claim_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`claim_id` int NOT NULL,
	`event_type` varchar(100) NOT NULL,
	`event_payload` json,
	`user_id` int,
	`user_role` varchar(50),
	`tenant_id` varchar(255),
	`emitted_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `claim_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `claim_evidence_findings` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`tenant_id` varchar(255) NOT NULL,
	`claim_id` int NOT NULL,
	`assessment_id` int,
	`evidence_domain` enum('monetary','damage','fraud','vehicle_history','decision') NOT NULL,
	`evidence_status` enum('verified','reconstructed','documented_revision','scope_difference','extraction_defect','evidence_gap','pricing_variance_review_signal','unresolved') NOT NULL,
	`severity` enum('info','review','blocking') NOT NULL DEFAULT 'info',
	`finding_code` varchar(100) NOT NULL,
	`title` varchar(500) NOT NULL,
	`summary` text,
	`source_document_id` int,
	`source_page` int,
	`source_location` varchar(512),
	`source_type` enum('document','quote_line','image','system_record','benchmark','reconstruction') NOT NULL,
	`quote_id` int,
	`quote_line_item_id` int,
	`subject_key` varchar(255),
	`observed_value_cents` bigint unsigned,
	`comparison_value_cents` bigint unsigned,
	`currency` varchar(10),
	`tax_basis` enum('included','excluded','separately_stated','not_stated','not_applicable'),
	`scope_fingerprint` varchar(128),
	`evidence_json` json,
	`reviewed_by_user_id` int,
	`reviewed_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `claim_evidence_findings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `claim_intake_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` varchar(255) NOT NULL,
	`user_id` int NOT NULL,
	`idempotency_key` varchar(64) NOT NULL,
	`request_hash` varchar(64) NOT NULL,
	`channel` varchar(50) NOT NULL,
	`claim_id` int,
	`status` varchar(50) NOT NULL DEFAULT 'persisted',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `claim_intake_requests_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_claim_intake_request_actor` UNIQUE(`tenant_id`,`user_id`,`idempotency_key`)
);
--> statement-breakpoint
CREATE TABLE `claim_intelligence_dataset` (
	`id` int AUTO_INCREMENT NOT NULL,
	`claim_id` int,
	`tenant_id` varchar(255),
	`schema_version` int NOT NULL DEFAULT 1,
	`vehicle_make` varchar(100),
	`vehicle_model` varchar(100),
	`vehicle_year` int,
	`vehicle_mass` int,
	`accident_type` varchar(50),
	`impact_direction` varchar(50),
	`accident_description_text` text,
	`police_report_presence` tinyint DEFAULT 0,
	`detected_damage_components` json,
	`damage_severity_scores` json,
	`llm_damage_reasoning` text,
	`physics_plausibility_score` int,
	`ai_estimated_cost` int,
	`assessor_adjusted_cost` int,
	`insurer_approved_cost` int,
	`cost_variance_ai_vs_assessor` int,
	`cost_variance_assessor_vs_final` int,
	`cost_variance_ai_vs_final` int,
	`ai_fraud_score` int,
	`fraud_explanation` text,
	`final_fraud_outcome` varchar(50),
	`assessor_id` int,
	`assessor_tier` varchar(50),
	`assessment_turnaround_hours` decimal(10,2),
	`reassignment_count` int DEFAULT 0,
	`approval_timeline_hours` decimal(10,2),
	`captured_at` timestamp NOT NULL DEFAULT (now()),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`data_scope` enum('tenant_private','tenant_feature') NOT NULL DEFAULT 'tenant_private',
	`global_sharing_enabled` tinyint DEFAULT 0,
	`anonymized_at` timestamp,
	CONSTRAINT `claim_intelligence_dataset_id` PRIMARY KEY(`id`),
	CONSTRAINT `idx_cid_claim_id_unique` UNIQUE(`claim_id`)
);
--> statement-breakpoint
CREATE TABLE `claim_involvement_tracking` (
	`id` int AUTO_INCREMENT NOT NULL,
	`claim_id` int NOT NULL,
	`user_id` int NOT NULL,
	`workflow_stage` enum('assessment','technical_approval','financial_decision','payment_authorization') NOT NULL,
	`action_type` enum('transition_state','approve_technical','authorize_payment','close_claim','redirect_claim','add_assessment','complete_assessment','start_assessment','submit_quote','request_info','escalate') NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `claim_involvement_tracking_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `claim_review_queue` (
	`id` int AUTO_INCREMENT NOT NULL,
	`historical_claim_id` int NOT NULL,
	`tenant_id` varchar(64),
	`review_status` enum('pending_review','in_review','approved','rejected','needs_more_info') DEFAULT 'pending_review',
	`review_priority` enum('low','medium','high') DEFAULT 'medium',
	`routed_reason` varchar(255),
	`automated_validation_level` varchar(50),
	`assigned_to` int,
	`assigned_at` timestamp,
	`reviewed_by` int,
	`reviewed_at` timestamp,
	`review_decision` enum('approve','reject','request_more_info'),
	`review_notes` text,
	`include_in_training_dataset` tinyint DEFAULT 0,
	`include_in_reference_dataset` tinyint DEFAULT 1,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `claim_review_queue_id` PRIMARY KEY(`id`)
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
CREATE TABLE `claimant_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`claimant_id` int NOT NULL,
	`claimant_email` varchar(320),
	`claimant_phone` varchar(20),
	`total_claims` int NOT NULL DEFAULT 0,
	`approved_claims` int DEFAULT 0,
	`rejected_claims` int DEFAULT 0,
	`fraudulent_claims` int DEFAULT 0,
	`total_claim_amount` int DEFAULT 0,
	`average_claim_amount` int DEFAULT 0,
	`first_claim_date` timestamp,
	`last_claim_date` timestamp,
	`claim_frequency` int,
	`unique_vehicles_count` int DEFAULT 0,
	`non_owner_accident_count` int DEFAULT 0,
	`insurer_change_count` int DEFAULT 0,
	`current_insurer` varchar(255),
	`previous_insurers` text,
	`accident_locations` text,
	`high_risk_area_count` int DEFAULT 0,
	`risk_score` int DEFAULT 0,
	`risk_level` enum('low','medium','high','critical') DEFAULT 'low',
	`is_high_risk_client` tinyint DEFAULT 0,
	`is_fraudster` tinyint DEFAULT 0,
	`is_blacklisted` tinyint DEFAULT 0,
	`notes` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `claimant_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `claims` (
	`id` int AUTO_INCREMENT NOT NULL,
	`claimant_id` int,
	`claim_number` varchar(50) NOT NULL,
	`kinga_ref` varchar(40),
	`tenant_id` varchar(255),
	`vehicle_make` varchar(100),
	`vehicle_model` varchar(100),
	`vehicle_year` int,
	`vehicle_registration` varchar(50),
	`incident_date` timestamp,
	`incident_description` text,
	`normalised_description` text,
	`reported_cause_label` varchar(100),
	`key_facts_json` text,
	`incident_location` text,
	`damage_photos` text,
	`policy_number` varchar(100),
	`policy_verified` tinyint,
	`status` enum('submitted','triage','assessment_pending','assessment_in_progress','quotes_pending','comparison','repair_assigned','repair_in_progress','completed','rejected','intake_pending','assessment_complete','closed','document_validating','document_ready','analysis_running','analysis_complete','document_failed','recovery_attempted','human_review_required') NOT NULL DEFAULT 'submitted',
	`workflow_state` enum('created','intake_queue','intake_verified','assigned','under_assessment','internal_review','technical_approval','financial_decision','payment_authorized','closed','disputed','ai_assessment_pending','ai_assessment_completed','manual_review'),
	`assigned_assessor_id` int,
	`assigned_panel_beater_id` int,
	`selected_panel_beater_ids` text,
	`panel_beater_choice_1` varchar(36),
	`panel_beater_choice_2` varchar(36),
	`panel_beater_choice_3` varchar(36),
	`ai_assessment_triggered` tinyint DEFAULT 0,
	`ai_assessment_completed` tinyint DEFAULT 0,
	`ai_assessment_started_at` timestamp,
	`ai_assessment_completed_at` timestamp,
	`fraud_risk_score` int,
	`fraud_flags` text,
	`complexity_score` enum('simple','moderate','complex','exceptional'),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`external_assessment_url` text,
	`fraud_risk_level` enum('low','medium','moderate','high'),
	`requires_gm_consultation` tinyint DEFAULT 0,
	`technically_approved_by` int,
	`technically_approved_at` timestamp,
	`financially_approved_by` int,
	`financially_approved_at` timestamp,
	`approved_amount` int,
	`closed_by` int,
	`closed_at` timestamp,
	`lodged_by` enum('self','broker','agent','company_rep','family_member','legal_rep','other') DEFAULT 'self',
	`lodger_name` varchar(255),
	`lodger_phone` varchar(50),
	`lodger_email` varchar(320),
	`lodger_company` varchar(255),
	`lodger_reference` varchar(100),
	`lodger_relationship` varchar(255),
	`claimant_id_number` varchar(20),
	`claimant_phone` varchar(50),
	`claimant_email` varchar(320),
	`claimant_address` text,
	`vehicle_vin` varchar(50),
	`vehicle_color` varchar(50),
	`vehicle_mileage` varchar(50),
	`vehicle_engine_number` varchar(100),
	`vehicle_gvm` varchar(20),
	`vehicle_tare_weight` varchar(20),
	`vehicle_engine_capacity` varchar(20),
	`vehicle_fuel_type` varchar(20),
	`vehicle_first_registration_date` varchar(20),
	`vehicle_owner_name` varchar(255),
	`vehicle_licence_expiry_date` varchar(20),
	`incident_time` varchar(10),
	`incident_type` enum('collision','theft','hail','fire','vandalism','flood','hijacking','other'),
	`third_party_name` varchar(255),
	`third_party_vehicle` varchar(255),
	`third_party_registration` varchar(50),
	`third_party_insurer` varchar(255),
	`police_report_number` varchar(100),
	`police_station` varchar(255),
	`witness_name` varchar(255),
	`witness_phone` varchar(50),
	`supporting_documents` text,
	`metadata` json,
	`assigned_processor_id` varchar(255),
	`priority` enum('low','medium','high') DEFAULT 'medium',
	`early_fraud_suspicion` tinyint NOT NULL DEFAULT 0,
	`estimated_claim_value` decimal(12,2),
	`final_approved_amount` decimal(12,2),
	`confidence_score` int,
	`routing_decision` varchar(50),
	`policy_version_id` int,
	`source_document_id` int,
	`claim_source` varchar(50),
	`is_simulated` tinyint NOT NULL DEFAULT 0,
	`vehicle_market_value` int,
	`document_processing_status` varchar(30) NOT NULL DEFAULT 'pending',
	`currency_code` varchar(10) DEFAULT 'USD',
	`vehicle_registry_id` int,
	`driver_registry_id` int,
	`third_party_driver_registry_id` int,
	`ai_detected_incident_type` enum('collision','theft','hail','fire','vandalism','flood','hijacking','other'),
	`incident_type_overridden` tinyint NOT NULL DEFAULT 0,
	`incident_type_override_reason` text,
	`incident_type_overridden_by` int,
	`incident_type_overridden_at` timestamp,
	`incident_type_revalidation_json` text,
	`product_type` varchar(100),
	`product_type_source` varchar(50),
	`estimated_cost` int,
	`estimated_speed_kmh` decimal(6,1),
	`claimant_stated_speed_kmh` decimal(6,1),
	`claimant_speed_needs_verification` tinyint DEFAULT 0,
	`data_completeness_score` decimal(5,2),
	`insurer_name` varchar(255),
	`excess_amount_cents` int,
	`claim_reference` varchar(100),
	`pipeline_current_stage` varchar(100),
	`pipeline_run_uuid` varchar(64),
	`pipeline_heartbeat_at` timestamp,
	`fleet_account_id` int,
	`claimant_type` enum('individual','company') NOT NULL DEFAULT 'individual',
	`claimant_company_name` varchar(255),
	`claimant_company_reg` varchar(100),
	`claimant_department` varchar(255),
	`fleet_vehicle_ref` varchar(100),
	`fleet_driver_id` int,
	`recovery_retry_count` int NOT NULL DEFAULT 0,
	`rejection_reason` text,
	`rejection_category` varchar(50),
	`rejected_by` int,
	`rejected_at` timestamp,
	CONSTRAINT `claims_id` PRIMARY KEY(`id`),
	CONSTRAINT `idx_claims_source_document_id` UNIQUE(`source_document_id`)
);
--> statement-breakpoint
CREATE TABLE `client_insurance_service_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`request_number` varchar(50) NOT NULL,
	`user_id` int,
	`full_name` varchar(255) NOT NULL,
	`email` varchar(320) NOT NULL,
	`phone` varchar(50),
	`product_category` varchar(50) NOT NULL,
	`cover_type` varchar(100) NOT NULL,
	`vehicle_registration` varchar(50),
	`client_proposed_value_cents` int,
	`request_payload_json` longtext NOT NULL,
	`status` enum('submitted','under_review','closed_without_quote') NOT NULL DEFAULT 'submitted',
	`submission_token` varchar(64) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `client_insurance_service_requests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `client_vehicle_valuation_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`request_number` varchar(50) NOT NULL,
	`user_id` int,
	`full_name` varchar(255) NOT NULL,
	`email` varchar(320) NOT NULL,
	`phone` varchar(50),
	`vehicle_make` varchar(100) NOT NULL,
	`vehicle_model` varchar(100) NOT NULL,
	`vehicle_year` int NOT NULL,
	`vehicle_registration` varchar(50),
	`vehicle_vin` varchar(50),
	`mileage` int,
	`condition` enum('excellent','good','fair','poor') NOT NULL,
	`photo_urls_json` longtext,
	`registration_book_url` text,
	`status` enum('pending','processing','complete','review_required','failed') NOT NULL DEFAULT 'pending',
	`submission_token` varchar(64) NOT NULL,
	`kinga_market_valuation_cents` int,
	`valuation_provenance_json` longtext,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `client_vehicle_valuation_requests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `commission_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`policy_id` int NOT NULL,
	`carrier_id` int NOT NULL,
	`product_id` int NOT NULL,
	`premium_amount` int NOT NULL,
	`commission_rate` decimal(5,2) NOT NULL,
	`commission_amount` int NOT NULL,
	`commission_type` enum('new_business','renewal') NOT NULL,
	`payment_status` enum('pending','paid','disputed') NOT NULL DEFAULT 'pending',
	`payment_date` timestamp,
	`payment_reference` varchar(100),
	`commission_period` varchar(20),
	`tenant_id` varchar(255),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `commission_records_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `component_benchmarks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`component_id` varchar(100) NOT NULL,
	`vehicle_make` varchar(100),
	`vehicle_model` varchar(100),
	`year_band` varchar(20),
	`vehicle_variant` varchar(100),
	`body_type` varchar(60),
	`market_region` varchar(20),
	`currency_code` varchar(10),
	`evidence_quality` enum('verified','accepted_quote','assessor_validated','review_required') NOT NULL DEFAULT 'accepted_quote',
	`category` varchar(100),
	`n` int NOT NULL,
	`p25` double NOT NULL,
	`median` double NOT NULL,
	`p75` double NOT NULL,
	`min_cost` double,
	`max_cost` double,
	`confidence` enum('HIGH','MEDIUM','LOW') NOT NULL DEFAULT 'LOW',
	`model_version` varchar(50) NOT NULL DEFAULT 'v1.0',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `component_benchmarks_id` PRIMARY KEY(`id`)
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
	`high_cost_drivers_json` text NOT NULL DEFAULT (JSON_ARRAY()),
	`component_weighting_json` text NOT NULL DEFAULT (JSON_OBJECT()),
	`component_detail_json` text NOT NULL DEFAULT (JSON_ARRAY()),
	`quality_flags_json` text NOT NULL DEFAULT (JSON_ARRAY()),
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
CREATE TABLE `cross_claim_signals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`claim_id` int NOT NULL,
	`signal_type` enum('repeat_damage_signal','driver_repeat_claim_signal','repairer_repeat_pattern_signal','vehicle_high_claim_frequency','damage_zone_repeat_signal','staged_accident_signal','repairer_driver_collusion_signal','claim_velocity_signal','total_loss_repeat_signal') NOT NULL,
	`signal_label` text NOT NULL,
	`evidence_json` text,
	`confidence` enum('low','medium','high') NOT NULL DEFAULT 'medium',
	`score_contribution` int NOT NULL DEFAULT 0,
	`is_dismissed` tinyint NOT NULL DEFAULT 0,
	`dismissed_by` int,
	`dismissed_at` timestamp,
	`dismissal_note` text,
	`tenant_id` varchar(255),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `cross_claim_signals_id` PRIMARY KEY(`id`),
	CONSTRAINT `idx_ccs_claim_signal_unique` UNIQUE(`claim_id`,`signal_type`)
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
CREATE TABLE `customer_consent` (
	`id` int AUTO_INCREMENT NOT NULL,
	`customer_id` int NOT NULL,
	`consent_type` enum('data_processing','marketing','third_party_sharing','credit_check','automated_decision_making') NOT NULL,
	`consent_given` tinyint NOT NULL,
	`consent_date` timestamp NOT NULL DEFAULT (now()),
	`withdrawn_date` timestamp,
	`consent_method` varchar(50),
	`consent_version` varchar(20),
	`tenant_id` varchar(255),
	CONSTRAINT `customer_consent_id` PRIMARY KEY(`id`)
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
CREATE TABLE `dataset_access_grants` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` varchar(255) NOT NULL,
	`data_scope` enum('tenant_private','tenant_feature','global_anonymized') NOT NULL,
	`granted_to_user_id` int,
	`granted_to_role` varchar(50),
	`granted_to_organization` varchar(255),
	`purpose` text NOT NULL,
	`expiry_date` date,
	`max_records` int,
	`granted_by_user_id` int NOT NULL,
	`granted_at` timestamp NOT NULL DEFAULT (now()),
	`revoked_at` timestamp,
	`revoked_by_user_id` int,
	CONSTRAINT `dataset_access_grants_id` PRIMARY KEY(`id`)
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
CREATE TABLE `document_versions` (
	`id` varchar(64) NOT NULL,
	`tenant_id` varchar(64) NOT NULL,
	`claim_id` int NOT NULL,
	`document_name` varchar(500) NOT NULL,
	`document_url` text NOT NULL,
	`doc_type` enum('claim','assessment','report','approval') NOT NULL,
	`version` int NOT NULL,
	`created_by` int NOT NULL,
	`approved_by` int,
	`approved_at` timestamp,
	`retention_until` timestamp NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now())
);
--> statement-breakpoint
CREATE TABLE `driver_claims` (
	`id` int AUTO_INCREMENT NOT NULL,
	`driver_id` int NOT NULL,
	`claim_id` int NOT NULL,
	`role` enum('driver','claimant','passenger','third_party_driver','witness','unknown') NOT NULL DEFAULT 'driver',
	`is_at_fault` tinyint NOT NULL DEFAULT 0,
	`was_injured` tinyint NOT NULL DEFAULT 0,
	`notes` text,
	`tenant_id` varchar(255),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `driver_claims_id` PRIMARY KEY(`id`),
	CONSTRAINT `idx_dc_unique` UNIQUE(`driver_id`,`claim_id`,`role`)
);
--> statement-breakpoint
CREATE TABLE `drivers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`full_name` varchar(255) NOT NULL,
	`license_number` varchar(50),
	`license_issue_date` varchar(20),
	`license_expiry_date` varchar(20),
	`date_of_birth` varchar(20),
	`phone` varchar(30),
	`email` varchar(320),
	`national_id_number` varchar(50),
	`license_country` varchar(5),
	`total_claims_count` int NOT NULL DEFAULT 0,
	`at_fault_claims_count` int NOT NULL DEFAULT 0,
	`driver_risk_score` int NOT NULL DEFAULT 0,
	`is_repeat_claimer` tinyint NOT NULL DEFAULT 0,
	`is_staged_accident_suspect` tinyint NOT NULL DEFAULT 0,
	`claim_ids_json` text,
	`last_fraud_risk_score` int NOT NULL DEFAULT 0,
	`data_source` enum('ocr','manual','import','unknown') NOT NULL DEFAULT 'unknown',
	`ocr_confidence_score` int,
	`tenant_id` varchar(255),
	`first_seen_at` timestamp NOT NULL DEFAULT (now()),
	`last_seen_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `drivers_id` PRIMARY KEY(`id`),
	CONSTRAINT `idx_drivers_license_number` UNIQUE(`license_number`)
);
--> statement-breakpoint
CREATE TABLE `email_verification_tokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`email` varchar(320) NOT NULL,
	`token` varchar(64) NOT NULL,
	`type` enum('verification','password_reset') NOT NULL,
	`used` tinyint NOT NULL DEFAULT 0,
	`used_at` timestamp,
	`expires_at` timestamp NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `email_verification_tokens_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `engineer_observations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` varchar(255) NOT NULL,
	`inspection_id` int NOT NULL,
	`observation_type` enum('defect','hazard','compliance','maintenance','recommendation','general_note') NOT NULL DEFAULT 'general_note',
	`observation_mode` enum('structured','free_text','voice') NOT NULL DEFAULT 'free_text',
	`component` varchar(255),
	`condition_code` varchar(50),
	`condition_detail` text,
	`observation_text` text,
	`voice_audio_url` text,
	`voice_transcript` text,
	`transcription_language` varchar(10) DEFAULT 'en',
	`severity` enum('info','minor','moderate','major','critical') NOT NULL DEFAULT 'info',
	`recommendation` text,
	`standards_body` varchar(50),
	`standards_code` varchar(100),
	`standards_clause` varchar(100),
	`standards_description` text,
	`linked_measurement_ids` json,
	`linked_evidence_ids` json,
	`ai_draft_used` tinyint NOT NULL DEFAULT 0,
	`ai_draft_approved` tinyint NOT NULL DEFAULT 0,
	`ai_draft_prompt` text,
	`authored_by` int NOT NULL,
	`authored_at` timestamp NOT NULL DEFAULT (now()),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `engineer_observations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `engineer_profiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`tenant_id` varchar(255) NOT NULL,
	`skills` json,
	`certifications` json,
	`region` varchar(100),
	`region_lat` decimal(10,7),
	`region_lng` decimal(10,7),
	`max_travel_radius_km` int DEFAULT 100,
	`is_available` tinyint NOT NULL DEFAULT 1,
	`availability_notes` text,
	`active_inspections` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `engineer_profiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `idx_ep_user_id` UNIQUE(`user_id`)
);
--> statement-breakpoint
CREATE TABLE `entity_relationships` (
	`id` int AUTO_INCREMENT NOT NULL,
	`entity_a_type` varchar(50) NOT NULL,
	`entity_a_id` int NOT NULL,
	`entity_a_name` varchar(255),
	`entity_b_type` varchar(50) NOT NULL,
	`entity_b_id` int NOT NULL,
	`entity_b_name` varchar(255),
	`relationship_type` enum('shared_address','shared_phone','shared_email','shared_bank_account','family_relation','business_relation','frequent_interaction','social_media_connection','employment_relation','suspicious_pattern') NOT NULL,
	`relationship_strength` int DEFAULT 0,
	`interaction_count` int DEFAULT 0,
	`first_interaction_date` timestamp,
	`last_interaction_date` timestamp,
	`is_collusion_suspected` tinyint DEFAULT 0,
	`collusion_score` int DEFAULT 0,
	`collusion_evidence` text,
	`investigation_status` enum('none','pending','in_progress','confirmed','cleared') DEFAULT 'none',
	`investigation_notes` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `entity_relationships_id` PRIMARY KEY(`id`)
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
CREATE TABLE `fast_track_config` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` varchar(64) NOT NULL,
	`product_id` int,
	`claim_type` enum('collision','theft','hail','fire','vandalism','flood','hijacking','other'),
	`fast_track_action` enum('AUTO_APPROVE','PRIORITY_QUEUE','REDUCED_DOCUMENTATION','STRAIGHT_TO_PAYMENT') NOT NULL,
	`min_confidence_score` decimal(5,2) NOT NULL,
	`max_claim_value` int NOT NULL,
	`max_fraud_score` decimal(5,2) NOT NULL,
	`enabled` tinyint NOT NULL DEFAULT 1,
	`version` int NOT NULL,
	`effective_from` timestamp NOT NULL,
	`created_by` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `fast_track_config_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fast_track_routing_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`claim_id` int NOT NULL,
	`tenant_id` varchar(64) NOT NULL,
	`config_id` int,
	`config_version` int,
	`eligible` tinyint NOT NULL,
	`decision` enum('AUTO_APPROVE','PRIORITY_QUEUE','REDUCED_DOCUMENTATION','STRAIGHT_TO_PAYMENT','MANUAL_REVIEW') NOT NULL,
	`reason` text NOT NULL,
	`confidence_score` decimal(5,2) NOT NULL,
	`claim_value` int,
	`fraud_score` decimal(5,2) NOT NULL,
	`claim_type` varchar(50),
	`product_id` int,
	`override` tinyint NOT NULL DEFAULT 0,
	`override_by` int,
	`override_reason` text,
	`evaluated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `fast_track_routing_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `federated_learning_metadata` (
	`id` int AUTO_INCREMENT NOT NULL,
	`round_number` int NOT NULL,
	`model_type` varchar(100) NOT NULL,
	`participant_count` int NOT NULL,
	`participant_tenant_ids` json,
	`global_model_version` varchar(50) NOT NULL,
	`local_model_contributions` json,
	`aggregation_method` varchar(50) DEFAULT 'federated_averaging',
	`global_model_accuracy` decimal(5,4),
	`convergence_status` enum('converging','converged','diverged') DEFAULT 'converging',
	`training_started_at` timestamp NOT NULL,
	`training_completed_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `federated_learning_metadata_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `final_approval_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`historical_claim_id` int NOT NULL,
	`tenant_id` varchar(64) NOT NULL,
	`final_decision` enum('approved_repair','approved_total_loss','cash_settlement','rejected','withdrawn') NOT NULL,
	`final_approved_amount` decimal(12,2) NOT NULL,
	`final_labor_cost` decimal(12,2),
	`final_parts_cost` decimal(12,2),
	`final_paint_cost` decimal(12,2),
	`final_sublet_cost` decimal(12,2),
	`final_betterment` decimal(12,2),
	`approved_by_name` varchar(255),
	`approved_by_role` varchar(100),
	`approval_date` date,
	`assessor_name` varchar(255),
	`assessor_license_number` varchar(100),
	`assessor_estimate` decimal(12,2),
	`repair_shop_name` varchar(255),
	`actual_repair_duration` int,
	`customer_satisfaction` int,
	`approval_notes` text,
	`conditions_text` text,
	`data_source` enum('extracted_from_document','manual_entry','system_import') NOT NULL,
	`captured_by_user_id` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `final_approval_records_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fleet_accounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`owner_user_id` int NOT NULL,
	`account_name` varchar(255) NOT NULL,
	`account_code` varchar(50),
	`linked_insurer_tenant_id` varchar(64),
	`linked_agency_id` int,
	`status` enum('active','suspended','pending') NOT NULL DEFAULT 'active',
	`subscription_tier` enum('free','starter','professional','enterprise') NOT NULL DEFAULT 'free',
	`vehicle_count` int NOT NULL DEFAULT 0,
	`notes` text,
	`verification_status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`verified_by_user_id` int,
	`verified_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `fleet_accounts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fleet_audit_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` varchar(64),
	`entity_type` enum('fleet','vehicle','maintenance','service_request','quote','document') NOT NULL,
	`entity_id` int NOT NULL,
	`action` enum('create','update','delete','view','export') NOT NULL,
	`user_id` int NOT NULL,
	`user_name` varchar(255),
	`changes_before` text,
	`changes_after` text,
	`ip_address` varchar(45),
	`user_agent` text,
	`timestamp` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `fleet_audit_logs_id` PRIMARY KEY(`id`)
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
CREATE TABLE `fleet_drivers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fleet_id` int NOT NULL,
	`tenant_id` varchar(64) NOT NULL,
	`user_id` int NOT NULL,
	`driver_license_number` varchar(50) NOT NULL,
	`license_expiry` date NOT NULL,
	`license_class` varchar(20),
	`hire_date` date NOT NULL,
	`employment_status` enum('active','suspended','terminated') NOT NULL DEFAULT 'active',
	`termination_date` date,
	`emergency_contact_name` varchar(255),
	`emergency_contact_phone` varchar(50),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `fleet_drivers_id` PRIMARY KEY(`id`)
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
CREATE TABLE `fleet_intelligence_snapshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fleet_id` int NOT NULL,
	`tenant_id` varchar(255) NOT NULL,
	`snapshot_version` int NOT NULL DEFAULT 1,
	`total_vehicles` int NOT NULL DEFAULT 0,
	`total_drivers` int NOT NULL DEFAULT 0,
	`total_claims` int NOT NULL DEFAULT 0,
	`open_claims` int NOT NULL DEFAULT 0,
	`total_settlement_cents` int NOT NULL DEFAULT 0,
	`avg_settlement_cents` int NOT NULL DEFAULT 0,
	`total_fraud_signals` int NOT NULL DEFAULT 0,
	`high_risk_vehicle_count` int NOT NULL DEFAULT 0,
	`high_risk_driver_count` int NOT NULL DEFAULT 0,
	`fleet_risk_score` int NOT NULL DEFAULT 0,
	`intelligence_json` json,
	`generated_at` timestamp NOT NULL DEFAULT (now()),
	`generated_by` varchar(100) NOT NULL DEFAULT 'system',
	CONSTRAINT `fleet_intelligence_snapshots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fleet_manager_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`fleet_account_id` int,
	`company_name` varchar(255) NOT NULL,
	`company_reg` varchar(100),
	`job_title` varchar(255),
	`contact_phone` varchar(100),
	`status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`reviewed_by_user_id` int,
	`reviewed_at` timestamp,
	`review_notes` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `fleet_manager_requests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fleet_rfq_client_instructions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`quote_request_id` int NOT NULL,
	`agency_tenant_id` varchar(64) NOT NULL,
	`fleet_account_id` int NOT NULL,
	`instruction` enum('accepted','rejected') NOT NULL,
	`status` enum('requested','executed','cancelled') NOT NULL DEFAULT 'requested',
	`instructed_by` int NOT NULL,
	`executed_by` int,
	`notes` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`executed_at` timestamp,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `fleet_rfq_client_instructions_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_fleet_rfq_client_instruction` UNIQUE(`quote_request_id`)
);
--> statement-breakpoint
CREATE TABLE `fleet_risk_scores` (
	`id` int AUTO_INCREMENT NOT NULL,
	`vehicle_id` int NOT NULL,
	`fleet_id` int,
	`tenant_id` varchar(64),
	`overall_risk_score` int NOT NULL,
	`maintenance_risk` int,
	`claims_risk` int,
	`vehicle_age_risk` int,
	`usage_risk` int,
	`repair_cost_risk` int,
	`risk_factors` text,
	`premium_impact` enum('decrease','neutral','increase'),
	`recommended_premium_adjustment` decimal(5,2),
	`calculated_at` timestamp NOT NULL DEFAULT (now()),
	`next_review_date` timestamp,
	CONSTRAINT `fleet_risk_scores_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fleet_vehicles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`vin` varchar(17),
	`registration_number` varchar(50) NOT NULL,
	`make` varchar(100) NOT NULL,
	`model` varchar(100) NOT NULL,
	`year` int NOT NULL,
	`color` varchar(50),
	`engine_number` varchar(100),
	`chassis_number` varchar(100),
	`current_valuation` int,
	`valuation_date` timestamp,
	`valuation_source` varchar(100),
	`maintenance_score` int,
	`risk_score` int,
	`claims_history_count` int DEFAULT 0,
	`owner_id` int NOT NULL,
	`vehicle_images` text,
	`registration_book_url` varchar(500),
	`registration_book_s3_key` varchar(500),
	`tenant_id` varchar(255),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`fleet_id` int,
	`engine_capacity` int,
	`vehicle_mass` int,
	`fuel_type` enum('petrol','diesel','electric','hybrid'),
	`transmission_type` enum('manual','automatic'),
	`usage_type` enum('private','commercial','logistics','mining','agriculture','public_transport'),
	`primary_use` text,
	`average_monthly_mileage` int,
	`current_insurer` varchar(255),
	`policy_number` varchar(100),
	`policy_start_date` timestamp,
	`policy_end_date` timestamp,
	`coverage_type` enum('comprehensive','third_party','third_party_fire_theft'),
	`purchase_price` int,
	`purchase_date` timestamp,
	`replacement_value` int,
	`status` enum('active','inactive','sold','written_off','under_repair') DEFAULT 'active',
	`last_inspection_date` timestamp,
	`next_inspection_due` timestamp,
	`maintenance_compliance_score` int,
	`vehicle_origin` enum('Local_Assembly','Ex_Japanese','Ex_European','Ex_American','Ex_Chinese','Unknown') DEFAULT 'Unknown',
	`imported_from` varchar(100),
	`import_year` int,
	CONSTRAINT `fleet_vehicles_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fleets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`owner_id` int NOT NULL,
	`tenant_id` varchar(64),
	`fleet_name` varchar(255) NOT NULL,
	`fleet_type` enum('mining','logistics','corporate','rental','public_transport','agriculture','construction') NOT NULL,
	`total_vehicles` int DEFAULT 0,
	`active_vehicles` int DEFAULT 0,
	`description` text,
	`primary_location` varchar(255),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`preferred_insurer_id` int,
	`preferred_insurer_name` varchar(255),
	`preferred_insurer_contact` varchar(255),
	`insurer_is_on_kinga` tinyint NOT NULL DEFAULT 0,
	CONSTRAINT `fleets_id` PRIMARY KEY(`id`)
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
CREATE TABLE `fuel_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fleet_account_id` int NOT NULL,
	`vehicle_registration` varchar(50) NOT NULL,
	`vehicle_make` varchar(100),
	`vehicle_model` varchar(100),
	`fuel_date` timestamp NOT NULL,
	`litres` decimal(8,2) NOT NULL,
	`cost_per_litre` decimal(8,4),
	`total_cost_cents` int NOT NULL,
	`odometer` int,
	`fuel_type` enum('petrol','diesel','electric','hybrid','lpg') NOT NULL DEFAULT 'petrol',
	`filled_by` varchar(255),
	`station_name` varchar(255),
	`notes` text,
	`created_by` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `fuel_records_id` PRIMARY KEY(`id`)
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
CREATE TABLE `geometry_sources` (
	`id` int AUTO_INCREMENT NOT NULL,
	`measurement_id` int,
	`landmark_id` int,
	`source_type` varchar(80) NOT NULL,
	`source_reference` varchar(255),
	`date_added` timestamp DEFAULT CURRENT_TIMESTAMP,
	`validation_status` varchar(30) NOT NULL DEFAULT 'pending',
	`notes` text,
	CONSTRAINT `geometry_sources_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `global_anonymized_dataset` (
	`id` int AUTO_INCREMENT NOT NULL,
	`anonymous_record_id` varchar(36) NOT NULL,
	`capture_month` varchar(7) NOT NULL,
	`vehicle_make` varchar(100),
	`vehicle_model` varchar(100),
	`vehicle_year_bracket` varchar(20),
	`vehicle_mass` int,
	`accident_type` varchar(50),
	`province` varchar(50),
	`detected_damage_components` json,
	`damage_severity_scores` json,
	`physics_plausibility_score` int,
	`ai_estimated_cost` int,
	`assessor_adjusted_cost` int,
	`insurer_approved_cost` int,
	`cost_variance_ai_vs_assessor` int,
	`cost_variance_assessor_vs_final` int,
	`cost_variance_ai_vs_final` int,
	`ai_fraud_score` int,
	`final_fraud_outcome` varchar(50),
	`assessor_tier` varchar(50),
	`assessment_turnaround_hours` decimal(10,2),
	`reassignment_count` int,
	`approval_timeline_hours` decimal(10,2),
	`anonymized_at` timestamp NOT NULL DEFAULT (now()),
	`schema_version` int NOT NULL DEFAULT 1,
	CONSTRAINT `global_anonymized_dataset_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `global_search_analytics` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` varchar(255),
	`query` varchar(500) NOT NULL,
	`result_count` int NOT NULL DEFAULT 0,
	`clicked_type` varchar(50),
	`clicked_id` varchar(100),
	`user_role` varchar(50),
	`searched_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `global_search_analytics_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `global_search_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`tenant_id` varchar(255),
	`query` varchar(500) NOT NULL,
	`result_count` int NOT NULL DEFAULT 0,
	`searched_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `global_search_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `governance_audit_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`claim_id` varchar(50) NOT NULL,
	`tenant_id` varchar(50) NOT NULL,
	`action` varchar(50) NOT NULL,
	`performed_by` varchar(50) NOT NULL,
	`performed_by_name` varchar(200),
	`timestamp_ms` bigint NOT NULL,
	`reason` text NOT NULL,
	`override_flag` tinyint NOT NULL DEFAULT 0,
	`ai_decision` varchar(100),
	`human_decision` varchar(100),
	`action_allowed` tinyint NOT NULL DEFAULT 1,
	`validation_errors_json` text,
	`metadata_json` text,
	CONSTRAINT `governance_audit_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `governance_notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` varchar(64) NOT NULL,
	`type` enum('intake_escalation','auto_assignment','ai_rerun','executive_override','segregation_violation') NOT NULL,
	`claim_id` int,
	`recipients` text NOT NULL,
	`title` varchar(255) NOT NULL,
	`message` text NOT NULL,
	`metadata` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`read_at` timestamp,
	CONSTRAINT `governance_notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `governance_violation_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` varchar(64) NOT NULL,
	`user_id` int NOT NULL,
	`user_role` varchar(50) NOT NULL,
	`violation_type` enum('EXCEEDS_AUTO_APPROVAL_LIMIT','BELOW_MIN_CONFIDENCE','EXCEEDS_MAX_FRAUD_TOLERANCE','MISSING_JUSTIFICATION','INSUFFICIENT_JUSTIFICATION') NOT NULL,
	`attempted_config` text NOT NULL,
	`governance_limits_version` int NOT NULL,
	`governance_limits_snapshot` text NOT NULL,
	`reason` text NOT NULL,
	`violated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `governance_violation_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `historical_claims` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` varchar(64) NOT NULL,
	`batch_id` int,
	`claim_reference` varchar(100),
	`policy_number` varchar(100),
	`vehicle_make` varchar(100),
	`vehicle_model` varchar(100),
	`vehicle_year` int,
	`vehicle_registration` varchar(50),
	`vehicle_vin` varchar(50),
	`vehicle_color` varchar(50),
	`incident_date` date,
	`incident_location` text,
	`incident_description` text,
	`accident_type` varchar(100),
	`estimated_speed` int,
	`claimant_name` varchar(255),
	`claimant_id_number` varchar(50),
	`claimant_contact` varchar(100),
	`total_panel_beater_quote` decimal(12,2),
	`total_assessor_estimate` decimal(12,2),
	`total_ai_estimate` decimal(12,2),
	`final_approved_cost` decimal(12,2),
	`repair_decision` enum('repair','total_loss','cash_settlement','rejected'),
	`assessor_name` varchar(255),
	`assessor_license_number` varchar(100),
	`pipeline_status` enum('pending','documents_uploaded','classification_complete','extraction_complete','ground_truth_captured','variance_calculated','complete','failed') NOT NULL DEFAULT 'pending',
	`data_quality_score` int,
	`fields_extracted` int,
	`fields_missing` int,
	`manual_corrections` int DEFAULT 0,
	`total_documents` int DEFAULT 0,
	`extraction_log` json,
	`last_error` text,
	`retry_count` int DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`replay_mode` tinyint NOT NULL DEFAULT 0,
	`last_replayed_at` timestamp,
	`replay_count` int NOT NULL DEFAULT 0,
	`damage_photos_json` json,
	CONSTRAINT `historical_claims_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `historical_replay_results` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` varchar(64) NOT NULL,
	`historical_claim_id` int NOT NULL,
	`original_claim_reference` varchar(100),
	`replayed_at` timestamp NOT NULL DEFAULT (now()),
	`replayed_by_user_id` int,
	`replay_version` int DEFAULT 1,
	`policy_version_id` int,
	`policy_version` int,
	`policy_name` varchar(255),
	`original_decision` enum('approved','rejected','referred','total_loss','cash_settlement'),
	`original_payout` decimal(12,2),
	`original_processing_time_hours` decimal(10,2),
	`original_assessor_name` varchar(255),
	`ai_damage_detection_score` decimal(5,2),
	`ai_estimated_cost` decimal(12,2),
	`ai_fraud_score` decimal(5,2),
	`ai_confidence_score` decimal(5,2),
	`kinga_routing_decision` enum('auto_approve','hybrid_review','escalate','fraud_review'),
	`kinga_predicted_payout` decimal(12,2),
	`kinga_estimated_processing_time_hours` decimal(10,2),
	`decision_match` tinyint NOT NULL,
	`payout_variance` decimal(12,2),
	`payout_variance_percentage` decimal(5,2),
	`processing_time_delta` decimal(10,2),
	`processing_time_delta_percentage` decimal(5,2),
	`confidence_level` enum('very_high','high','medium','low','very_low'),
	`confidence_justification` text,
	`fraud_risk_level` enum('none','low','medium','moderate','high','critical','elevated'),
	`fraud_indicators` json,
	`simulated_workflow_steps` json,
	`is_replay` tinyint NOT NULL DEFAULT 1,
	`no_live_mutation` tinyint NOT NULL DEFAULT 1,
	`performance_summary` text,
	`recommended_action` enum('adopt_kinga','review_policy','manual_review','no_action'),
	`replay_duration_ms` int,
	`replay_status` enum('success','partial_success','failed') NOT NULL DEFAULT 'success',
	`replay_errors` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `historical_replay_results_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `human_review_queue` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` varchar(64) NOT NULL,
	`historical_claim_id` int,
	`review_type` varchar(64) NOT NULL,
	`priority` enum('low','medium','high','critical') NOT NULL DEFAULT 'medium',
	`status` enum('pending','in_review','completed','rejected') NOT NULL DEFAULT 'pending',
	`assigned_to` int,
	`review_notes` text,
	`queued_at` timestamp NOT NULL DEFAULT (now()),
	`started_at` timestamp,
	`completed_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `human_review_queue_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ingestion_batches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` varchar(64) NOT NULL,
	`batch_name` varchar(255),
	`ingestion_source` enum('processor_upload','bulk_batch','api','email','legacy_import','broker_upload') NOT NULL,
	`ingestion_channel` enum('web_ui','api','email','sftp') NOT NULL,
	`uploaded_by_user_id` int,
	`uploaded_by_email` varchar(320),
	`uploaded_by_ip_address` varchar(45),
	`total_documents` int NOT NULL DEFAULT 0,
	`processed_documents` int NOT NULL DEFAULT 0,
	`failed_documents` int NOT NULL DEFAULT 0,
	`status` enum('pending','processing','completed','failed') NOT NULL DEFAULT 'pending',
	`started_at` timestamp,
	`completed_at` timestamp,
	`custody_chain` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ingestion_batches_id` PRIMARY KEY(`id`)
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
CREATE TABLE `inspection_projects` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` varchar(255),
	`project_ref` varchar(50) NOT NULL,
	`project_name` varchar(255) NOT NULL,
	`client_name` varchar(255),
	`description` text,
	`project_status` enum('active','completed','on_hold','cancelled') NOT NULL DEFAULT 'active',
	`start_date` timestamp,
	`target_end_date` timestamp,
	`completed_at` timestamp,
	`total_inspections` int NOT NULL DEFAULT 0,
	`completed_inspections` int NOT NULL DEFAULT 0,
	`lead_engineer_id` int,
	`created_by` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `inspection_projects_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `inspections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` varchar(255) NOT NULL,
	`inspection_ref` varchar(50) NOT NULL,
	`inspection_type` enum('vehicle','engineering','risk_survey','fleet','property','equipment','industrial') NOT NULL,
	`status` enum('scheduled','assigned','in_progress','evidence_capture','measurements_complete','observations_complete','ai_analysis','engineer_review','physics_reconciliation','report_generation','complete','cancelled') NOT NULL DEFAULT 'scheduled',
	`asset_registry_id` int,
	`asset_ref` varchar(100),
	`asset_type` varchar(50) NOT NULL,
	`vehicle_registration` varchar(50),
	`claim_id` int,
	`project_id` int,
	`assigned_engineer_id` int,
	`assigned_at` timestamp,
	`scheduled_date` timestamp,
	`location_address` text,
	`location_lat` decimal(10,7),
	`location_lng` decimal(10,7),
	`completed_at` timestamp,
	`duration_minutes` int,
	`ai_analysis_json` json,
	`ai_analysis_at` timestamp,
	`ai_analysis_approved` tinyint NOT NULL DEFAULT 0,
	`physics_reconciled` tinyint NOT NULL DEFAULT 0,
	`physics_reconciled_at` timestamp,
	`reconciliation_notes` text,
	`report_key` varchar(100),
	`report_id` int,
	`created_by` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `inspections_id` PRIMARY KEY(`id`),
	CONSTRAINT `idx_inspections_ref` UNIQUE(`inspection_ref`)
);
--> statement-breakpoint
CREATE TABLE `insurance_audit_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`timestamp` timestamp NOT NULL DEFAULT (now()),
	`user_id` int NOT NULL,
	`user_role` varchar(50),
	`action` varchar(100) NOT NULL,
	`entity_type` varchar(50) NOT NULL,
	`entity_id` int NOT NULL,
	`changes` text,
	`ip_address` varchar(45),
	`user_agent` text,
	`tenant_id` varchar(255),
	CONSTRAINT `insurance_audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `insurance_carriers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`short_code` varchar(50) NOT NULL,
	`is_active` tinyint NOT NULL DEFAULT 1,
	`default_commission_rate` decimal(5,2) NOT NULL,
	`api_endpoint` varchar(500),
	`api_credentials` text,
	`api_enabled` tinyint DEFAULT 0,
	`contact_email` varchar(320),
	`contact_phone` varchar(20),
	`tenant_id` varchar(255),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `insurance_carriers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `insurance_policies` (
	`id` int AUTO_INCREMENT NOT NULL,
	`policy_number` varchar(100) NOT NULL,
	`quote_id` int,
	`customer_id` int NOT NULL,
	`vehicle_id` int NOT NULL,
	`carrier_id` int NOT NULL,
	`product_id` int NOT NULL,
	`premium_amount` int NOT NULL,
	`premium_frequency` enum('monthly','annual') NOT NULL DEFAULT 'monthly',
	`excess_amount` int,
	`coverage_start_date` timestamp NOT NULL,
	`coverage_end_date` timestamp NOT NULL,
	`coverage_limits` text,
	`status` enum('pending','active','endorsed','cancelled','expired','renewed') NOT NULL DEFAULT 'pending',
	`cancellation_reason` text,
	`cancellation_date` timestamp,
	`cancelled_by` int,
	`renewal_reminder_sent` tinyint DEFAULT 0,
	`renewal_reminder_date` timestamp,
	`renewed_to_policy_id` int,
	`tenant_id` varchar(255),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `insurance_policies_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `insurance_products` (
	`id` int AUTO_INCREMENT NOT NULL,
	`carrier_id` int NOT NULL,
	`product_name` varchar(255) NOT NULL,
	`product_code` varchar(50) NOT NULL,
	`coverage_type` enum('comprehensive','third_party','third_party_fire_theft') NOT NULL,
	`base_premium_monthly` int,
	`base_premium_annual` int,
	`vehicle_damage_limit` int,
	`third_party_liability_limit` int,
	`personal_accident_limit` int,
	`excess_options` text,
	`eligibility_rules` text,
	`commission_rate` decimal(5,2),
	`is_active` tinyint NOT NULL DEFAULT 1,
	`tenant_id` varchar(255),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `insurance_products_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `insurance_quotes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`quote_number` varchar(50) NOT NULL,
	`customer_id` int NOT NULL,
	`vehicle_id` int NOT NULL,
	`carrier_id` int NOT NULL,
	`product_id` int NOT NULL,
	`premium_amount` int NOT NULL,
	`premium_frequency` enum('monthly','annual') NOT NULL DEFAULT 'monthly',
	`excess_amount` int,
	`coverage_limits` text,
	`driver_details` text,
	`risk_profile` text,
	`quote_valid_until` timestamp NOT NULL,
	`status` enum('pending','payment_pending','payment_submitted','payment_verified','accepted','rejected','expired') NOT NULL DEFAULT 'pending',
	`kinga_insights` text,
	`tenant_id` varchar(255),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`payment_method` enum('cash','bank_transfer','ecocash','onemoney','rtgs','zipit'),
	`payment_reference_number` varchar(100),
	`payment_proof_s3_key` varchar(500),
	`payment_proof_s3_url` varchar(500),
	`payment_amount` int,
	`payment_date` timestamp,
	`payment_submitted_at` timestamp,
	`payment_verified_at` timestamp,
	`payment_verified_by` int,
	`payment_rejection_reason` text,
	CONSTRAINT `insurance_quotes_id` PRIMARY KEY(`id`)
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
CREATE TABLE `insurer_tenants` (
	`id` varchar(64) NOT NULL,
	`name` varchar(255) NOT NULL,
	`display_name` varchar(255) NOT NULL,
	`logo_url` text,
	`primary_color` varchar(7) DEFAULT '#10b981',
	`secondary_color` varchar(7) DEFAULT '#64748b',
	`document_naming_template` text,
	`document_retention_years` int DEFAULT 7,
	`fraud_retention_years` int DEFAULT 10,
	`require_manager_approval_above` decimal(10,2) DEFAULT '10000.00',
	`high_value_threshold` decimal(10,2) DEFAULT '10000.00',
	`auto_approve_below` decimal(10,2) DEFAULT '5000.00',
	`fraud_flag_threshold` decimal(3,2) DEFAULT '0.70',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`primary_currency` varchar(3) DEFAULT 'USD',
	`primary_currency_symbol` varchar(10) DEFAULT '$',
	`secondary_currency` varchar(3),
	`secondary_currency_symbol` varchar(10),
	`exchange_rate` decimal(10,4),
	`pricing_tier` enum('process','protect','prove') NOT NULL DEFAULT 'process',
	`monthly_platform_fee` decimal(10,2) NOT NULL DEFAULT '900.00',
	`per_claim_fee` decimal(8,2) NOT NULL DEFAULT '12.00',
	`tier_feature_flags` text,
	CONSTRAINT `insurer_tenants_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `iso_audit_logs` (
	`id` varchar(64) NOT NULL,
	`tenant_id` varchar(64) NOT NULL,
	`user_id` int NOT NULL,
	`user_role` varchar(50) NOT NULL,
	`action_type` enum('create','update','approve','reject','view','delete') NOT NULL,
	`resource_type` varchar(50) NOT NULL,
	`resource_id` varchar(64) NOT NULL,
	`before_state` text,
	`after_state` text,
	`ip_address` varchar(45),
	`session_id` varchar(64),
	`timestamp` timestamp NOT NULL DEFAULT (now()),
	`integrity_hash` varchar(64) NOT NULL,
	CONSTRAINT `iso_audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `licensing_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fleet_account_id` int NOT NULL,
	`vehicle_registration` varchar(50) NOT NULL,
	`vehicle_make` varchar(100),
	`vehicle_model` varchar(100),
	`license_type` enum('vehicle_license','roadworthy','operator_permit','cross_border','other') NOT NULL,
	`license_number` varchar(100),
	`issue_date` timestamp,
	`expiry_date` timestamp NOT NULL,
	`issuing_authority` varchar(255),
	`cost_cents` int,
	`licensing_status` enum('active','expired','expiring_soon','pending_renewal') NOT NULL DEFAULT 'active',
	`document_url` varchar(1000),
	`notes` text,
	`created_by` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `licensing_records_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `maintenance_alerts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`vehicle_id` int NOT NULL,
	`schedule_id` int,
	`tenant_id` varchar(64),
	`alert_type` enum('upcoming_maintenance','overdue_maintenance','inspection_due','safety_alert','compliance_alert') NOT NULL,
	`severity` enum('low','medium','high','critical') NOT NULL,
	`title` varchar(255) NOT NULL,
	`message` text NOT NULL,
	`due_date` timestamp,
	`due_mileage` int,
	`status` enum('pending','acknowledged','resolved','dismissed') DEFAULT 'pending',
	`acknowledged_by` int,
	`acknowledged_at` timestamp,
	`resolved_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `maintenance_alerts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `maintenance_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`vehicle_id` int NOT NULL,
	`schedule_id` int,
	`tenant_id` varchar(64),
	`service_date` timestamp NOT NULL,
	`service_mileage` int,
	`service_type` varchar(255) NOT NULL,
	`service_provider` varchar(255),
	`service_location` varchar(255),
	`labor_cost` int,
	`parts_cost` int,
	`total_cost` int,
	`service_items` text,
	`parts_replaced` text,
	`invoice_url` text,
	`service_report_url` text,
	`is_compliant` tinyint DEFAULT 1,
	`was_overdue` tinyint DEFAULT 0,
	`days_overdue` int,
	`performed_by` int,
	`recorded_by` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`related_claim_id` int,
	`is_claim_related` tinyint NOT NULL DEFAULT 0,
	CONSTRAINT `maintenance_records_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `maintenance_schedules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`vehicle_id` int NOT NULL,
	`tenant_id` varchar(64),
	`maintenance_type` enum('oil_change','tire_rotation','brake_inspection','engine_service','transmission_service','annual_inspection','safety_inspection','filter_replacement','battery_check','coolant_flush','custom') NOT NULL,
	`description` text,
	`interval_type` enum('mileage','time','both') NOT NULL,
	`mileage_interval` int,
	`time_interval` int,
	`last_service_date` timestamp,
	`last_service_mileage` int,
	`next_due_date` timestamp,
	`next_due_mileage` int,
	`alert_days_before` int DEFAULT 7,
	`alert_mileage_before` int DEFAULT 500,
	`is_active` tinyint DEFAULT 1,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `maintenance_schedules_id` PRIMARY KEY(`id`)
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
CREATE TABLE `marketplace_transactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`assignment_id` int NOT NULL,
	`assessor_id` int NOT NULL,
	`tenant_id` varchar(64) NOT NULL,
	`claim_id` int,
	`assessment_fee` decimal(10,2) NOT NULL,
	`kinga_commission` decimal(10,2) NOT NULL,
	`assessor_payout` decimal(10,2) NOT NULL,
	`commission_rate` decimal(5,2) NOT NULL,
	`transaction_status` enum('pending','completed','paid_out','disputed','refunded') DEFAULT 'pending',
	`completed_at` timestamp,
	`paid_out_at` timestamp,
	`payment_method` varchar(50),
	`payment_reference` varchar(100),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `marketplace_transactions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `measurement_types` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(80) NOT NULL,
	`display_name` varchar(120) NOT NULL,
	`unit` varchar(20) NOT NULL DEFAULT 'mm',
	`tier` int NOT NULL DEFAULT 2,
	`base_reliability` decimal(4,3) NOT NULL DEFAULT '0.750',
	`description` text,
	CONSTRAINT `measurement_types_id` PRIMARY KEY(`id`),
	CONSTRAINT `measurement_types_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `mismatch_annotations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`claim_id` int NOT NULL,
	`assessment_id` int NOT NULL,
	`mismatch_type` varchar(64) NOT NULL,
	`mismatch_index` int NOT NULL DEFAULT 0,
	`action` enum('confirm','dismiss') NOT NULL,
	`note` text,
	`user_id` int NOT NULL,
	`user_role` varchar(64),
	`created_at` bigint NOT NULL,
	CONSTRAINT `mismatch_annotations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `model_training_audit_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` varchar(64),
	`model_version_id` int NOT NULL,
	`event_type` enum('training_started','training_completed','training_failed','validation_started','validation_completed','deployment_requested','deployment_approved','deployment_rejected','model_deprecated','dataset_added','dataset_removed') NOT NULL,
	`event_description` text,
	`event_metadata` text,
	`performed_by` int,
	`performed_at` timestamp NOT NULL DEFAULT (now()),
	`ip_address` varchar(45),
	CONSTRAINT `model_training_audit_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `model_training_queue` (
	`id` int AUTO_INCREMENT NOT NULL,
	`claim_id` int,
	`dataset_record_id` int NOT NULL,
	`training_priority` varchar(50) DEFAULT 'normal',
	`processed` tinyint DEFAULT 0,
	`processed_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `model_training_queue_id` PRIMARY KEY(`id`),
	CONSTRAINT `idx_mtq_claim_id_unique` UNIQUE(`claim_id`)
);
--> statement-breakpoint
CREATE TABLE `model_version_registry` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` varchar(64),
	`model_name` varchar(255) NOT NULL,
	`model_version` varchar(50) NOT NULL,
	`model_type` varchar(100),
	`algorithm_used` varchar(100),
	`training_dataset_version` varchar(50),
	`training_claim_count` int,
	`training_started_at` timestamp,
	`training_completed_at` timestamp,
	`training_duration` int,
	`accuracy_score` decimal(5,2),
	`precision_score` decimal(5,2),
	`recall_score` decimal(5,2),
	`f1_score` decimal(5,2),
	`bias_drift_validation` varchar(50),
	`fraud_detection_stability` varchar(50),
	`performance_benchmark` text,
	`deployment_status` enum('training','validation','staging','production','deprecated','archived') DEFAULT 'training',
	`deployed_at` timestamp,
	`deployed_by` int,
	`approval_status` enum('pending_validation','pending_approval','approved','rejected') DEFAULT 'pending_validation',
	`approved_by` int,
	`approved_at` timestamp,
	`approval_notes` text,
	`model_artifact_url` text,
	`model_config_url` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `model_version_registry_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `multi_reference_truth` (
	`id` int AUTO_INCREMENT NOT NULL,
	`historical_claim_id` int NOT NULL,
	`synthesized_value` decimal(10,2) NOT NULL,
	`confidence_interval` decimal(5,2),
	`photo_damage_severity_score` int,
	`panel_beater_quote_cluster_score` int,
	`regional_benchmark_score` int,
	`similar_claims_score` int,
	`fraud_probability_score` int,
	`settlement_amount_score` int,
	`photo_damage_estimate` decimal(10,2),
	`panel_beater_median` decimal(10,2),
	`regional_benchmark` decimal(10,2),
	`similar_claims_average` decimal(10,2),
	`final_settlement` decimal(10,2),
	`assessor_value` decimal(10,2),
	`assessor_deviation` decimal(5,2),
	`deviation_absolute` decimal(10,2),
	`synthesis_method` varchar(50),
	`components_used` int,
	`synthesis_quality` enum('high','medium','low'),
	`synthesized_at` timestamp NOT NULL DEFAULT (now()),
	`synthesized_by` varchar(50),
	`synthesis_explanation` text,
	CONSTRAINT `multi_reference_truth_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `narrative_versions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`claim_id` int NOT NULL,
	`assessment_id` int NOT NULL,
	`mismatch_index` int NOT NULL,
	`mismatch_type` varchar(64) NOT NULL,
	`version` int NOT NULL DEFAULT 1,
	`is_active` tinyint NOT NULL DEFAULT 1,
	`base_narrative` text NOT NULL,
	`enriched_narrative` text,
	`external_narrative` text,
	`preserves_meaning` tinyint,
	`source` varchar(64) NOT NULL,
	`created_at` bigint NOT NULL,
	`created_by` int,
	CONSTRAINT `narrative_versions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notification_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`event_type` varchar(100) NOT NULL,
	`entity_id` varchar(255) NOT NULL,
	`recipient_user_id` int NOT NULL,
	`recipient_email` varchar(255),
	`idempotency_key` varchar(512) NOT NULL,
	`sent` tinyint NOT NULL DEFAULT 1,
	`skip_reason` varchar(255),
	`tenant_id` varchar(64),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notification_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `notification_events_idempotency_key_unique` UNIQUE(`idempotency_key`)
);
--> statement-breakpoint
CREATE TABLE `notification_preferences` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`tenant_id` varchar(64) NOT NULL,
	`module` varchar(64) NOT NULL,
	`in_app_enabled` tinyint NOT NULL DEFAULT 1,
	`email_enabled` tinyint NOT NULL DEFAULT 0,
	`sms_enabled` tinyint NOT NULL DEFAULT 0,
	`min_priority` enum('low','medium','high','urgent') NOT NULL DEFAULT 'low',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `notification_preferences_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_notif_pref_user_module` UNIQUE(`user_id`,`tenant_id`,`module`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`tenant_id` varchar(255),
	`title` varchar(255) NOT NULL,
	`message` text NOT NULL,
	`type` enum('claim_assigned','quote_submitted','fraud_detected','status_changed','assessment_completed','approval_required','document_uploaded','system_alert') NOT NULL,
	`claim_id` int,
	`entity_type` varchar(50),
	`entity_id` int,
	`module` varchar(64),
	`is_read` tinyint NOT NULL DEFAULT 0,
	`read_at` timestamp,
	`archived_at` timestamp,
	`action_url` varchar(500),
	`priority` enum('low','medium','high','urgent') NOT NULL DEFAULT 'medium',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(200) NOT NULL,
	`business_name` varchar(200),
	`email` varchar(320),
	`phone` varchar(20),
	`address` text,
	`city` varchar(100),
	`country` varchar(100) DEFAULT 'Zimbabwe',
	`type` enum('insurer','broker','tpa') NOT NULL DEFAULT 'insurer',
	`owner_id` int NOT NULL,
	`active` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `organizations_id` PRIMARY KEY(`id`)
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
CREATE TABLE `panel_beaters` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` text NOT NULL,
	`business_name` text NOT NULL,
	`email` varchar(320),
	`phone` varchar(20),
	`address` text,
	`city` varchar(100),
	`approved` tinyint NOT NULL DEFAULT 1,
	`panel_beater_status` enum('pending','approved','suspended','rejected') NOT NULL DEFAULT 'approved',
	`user_id` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`tenant_id` varchar(255),
	`total_repairs` int NOT NULL DEFAULT 0,
	`avg_quality_score` decimal(5,2),
	`avg_cost_ratio` decimal(6,3),
	`avg_repair_duration_days` decimal(6,1),
	`repeat_damage_rate_pct` decimal(5,2),
	`warranty_repair_count` int NOT NULL DEFAULT 0,
	`fraud_flag_count` int NOT NULL DEFAULT 0,
	`performance_tier` varchar(20),
	`last_repair_date` varchar(20),
	`performance_updated_at` timestamp,
	CONSTRAINT `panel_beaters_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `part_stratification` (
	`id` int AUTO_INCREMENT NOT NULL,
	`stratum_type` enum('OEM','OEM_Equivalent','Aftermarket','Used') NOT NULL,
	`price_multiplier` decimal(5,2) NOT NULL,
	`quality_rating` int,
	`warranty_months` int,
	`description` text,
	`part_category` varchar(100),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `part_stratification_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `parts_pricing_audit_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`change_type` enum('baseline_update','multiplier_update','override_created','override_deleted','scraper_run') NOT NULL,
	`table_name` varchar(100) NOT NULL,
	`record_id` int,
	`old_value` text,
	`new_value` text,
	`changed_by` int,
	`changed_at` timestamp NOT NULL DEFAULT (now()),
	`reason` text,
	`ip_address` varchar(45),
	CONSTRAINT `parts_pricing_audit_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `parts_pricing_baseline` (
	`id` int AUTO_INCREMENT NOT NULL,
	`part_name` varchar(255) NOT NULL,
	`part_number` varchar(100),
	`part_category` varchar(100),
	`vehicle_make` varchar(100),
	`vehicle_model` varchar(100),
	`vehicle_year_from` int,
	`vehicle_year_to` int,
	`sa_base_price` decimal(10,2) NOT NULL,
	`currency` varchar(3) NOT NULL DEFAULT 'ZAR',
	`source` varchar(100) NOT NULL,
	`source_url` text,
	`scraped_at` timestamp,
	`last_updated` timestamp NOT NULL DEFAULT (now()),
	`confidence` enum('low','medium','high') DEFAULT 'medium',
	`data_quality` text,
	`part_type` enum('OEM','OEM_Equivalent','Aftermarket','Used','Unknown') DEFAULT 'Unknown',
	CONSTRAINT `parts_pricing_baseline_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `parts_pricing_overrides` (
	`id` int AUTO_INCREMENT NOT NULL,
	`part_name` varchar(255),
	`part_number` varchar(100),
	`part_category` varchar(100),
	`vehicle_make` varchar(100),
	`vehicle_model` varchar(100),
	`country` varchar(100),
	`stratum_type` enum('OEM','OEM_Equivalent','Aftermarket','Used'),
	`override_price` decimal(10,2),
	`override_multiplier` decimal(5,2),
	`reason` text NOT NULL,
	`created_by` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`expires_at` timestamp,
	CONSTRAINT `parts_pricing_overrides_id` PRIMARY KEY(`id`)
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
CREATE TABLE `personal_vehicles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`registration` varchar(50),
	`make` varchar(100) NOT NULL,
	`model` varchar(100) NOT NULL,
	`year` int NOT NULL,
	`vin` varchar(50),
	`colour` varchar(50),
	`engine_size` varchar(20),
	`fuel_type_pv` enum('petrol','diesel','electric','hybrid','other') DEFAULT 'petrol',
	`notes` text,
	`is_primary` tinyint NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `personal_vehicles_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `photo_reextraction_jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`assessment_id` int NOT NULL,
	`claim_id` int NOT NULL,
	`pdf_url` text NOT NULL,
	`status` enum('pending','running','completed','failed') NOT NULL DEFAULT 'pending',
	`requested_dpi` int NOT NULL DEFAULT 300,
	`photos_extracted` int,
	`render_dpi` int,
	`avg_sharpness` int,
	`result_json` text,
	`error_message` text,
	`created_at` varchar(50) NOT NULL,
	`started_at` varchar(50),
	`completed_at` varchar(50),
	`duration_ms` int,
	`triggered_by_user_id` int,
	CONSTRAINT `photo_reextraction_jobs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `physical_measurements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` varchar(255) NOT NULL,
	`inspection_id` int NOT NULL,
	`measurement_category` enum('vehicle_crush','structural','mechanical','electrical','fire_protection','industrial') NOT NULL,
	`measurement_type` varchar(100) NOT NULL,
	`value` decimal(15,4) NOT NULL,
	`value_min` decimal(15,4),
	`value_max` decimal(15,4),
	`unit` varchar(30) NOT NULL,
	`instrument` varchar(255),
	`measurement_method` enum('manual','laser','ai_assisted','imported','photogrammetric','ultrasonic','thermal','load_cell','other') NOT NULL DEFAULT 'manual',
	`calibration_reference` varchar(255),
	`confidence` decimal(4,3) NOT NULL DEFAULT '0.900',
	`captured_by` int NOT NULL,
	`captured_at` timestamp NOT NULL DEFAULT (now()),
	`source` varchar(50) NOT NULL DEFAULT 'ENGINEER_MEASUREMENT',
	`evidence_document_ids` json,
	`location_reference` varchar(255),
	`location_image_url` text,
	`standards_body` varchar(50),
	`standards_code` varchar(100),
	`standards_clause` varchar(100),
	`standards_description` text,
	`notes` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `physical_measurements_id` PRIMARY KEY(`id`)
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
CREATE TABLE `pipeline_jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`claim_id` int NOT NULL,
	`run_id` varchar(64) NOT NULL,
	`stage_id` varchar(100) NOT NULL,
	`stage_label` varchar(255) NOT NULL,
	`stage_index` int NOT NULL DEFAULT 0,
	`tenant_id` varchar(255),
	`status` enum('running','completed','failed','skipped','degraded') NOT NULL DEFAULT 'running',
	`is_degraded` tinyint NOT NULL DEFAULT 0,
	`is_timeout` tinyint NOT NULL DEFAULT 0,
	`error_message` text,
	`duration_ms` int,
	`llm_tokens_input` int,
	`llm_tokens_output` int,
	`llm_model` varchar(100),
	`assumption_count` int NOT NULL DEFAULT 0,
	`recovery_action_count` int NOT NULL DEFAULT 0,
	`started_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`completed_at` timestamp,
	`result_json` longtext,
	CONSTRAINT `pipeline_jobs_id` PRIMARY KEY(`id`),
	CONSTRAINT `idx_pj_run_stage` UNIQUE(`run_id`,`stage_id`)
);
--> statement-breakpoint
CREATE TABLE `pipeline_runs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`run_id` varchar(64) NOT NULL,
	`claim_id` int NOT NULL,
	`tenant_id` varchar(255),
	`triggered_by` varchar(255),
	`trigger_reason` varchar(255),
	`status` enum('running','completed','failed','partial') NOT NULL DEFAULT 'running',
	`is_rerun` tinyint NOT NULL DEFAULT 0,
	`stages_completed` int NOT NULL DEFAULT 0,
	`stages_failed` int NOT NULL DEFAULT 0,
	`stages_degraded` int NOT NULL DEFAULT 0,
	`total_duration_ms` int,
	`total_llm_tokens` int,
	`started_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`completed_at` timestamp,
	CONSTRAINT `pipeline_runs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `platform_governance_limits` (
	`id` int AUTO_INCREMENT NOT NULL,
	`max_auto_approval_limit_global` int NOT NULL,
	`min_confidence_allowed_global` decimal(5,2) NOT NULL,
	`max_fraud_tolerance_global` decimal(5,2) NOT NULL,
	`version` int NOT NULL,
	`effective_from` timestamp NOT NULL,
	`created_by` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`notes` text,
	CONSTRAINT `platform_governance_limits_id` PRIMARY KEY(`id`)
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
CREATE TABLE `policy_claim_links` (
	`id` int AUTO_INCREMENT NOT NULL,
	`policy_id` int NOT NULL,
	`claim_id` int NOT NULL,
	`coverage_verified` tinyint DEFAULT 0,
	`verified_by` int,
	`verified_at` timestamp,
	`coverage_approved` tinyint,
	`coverage_decision_reason` text,
	`tenant_id` varchar(255),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `policy_claim_links_id` PRIMARY KEY(`id`)
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
CREATE TABLE `policy_endorsements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`policy_id` int NOT NULL,
	`endorsement_number` varchar(50) NOT NULL,
	`endorsement_type` enum('add_driver','remove_driver','change_vehicle','adjust_coverage','change_excess','other') NOT NULL,
	`endorsement_details` text NOT NULL,
	`premium_adjustment` int,
	`new_premium_amount` int,
	`effective_date` timestamp NOT NULL,
	`created_by` int NOT NULL,
	`approved_by` int,
	`approved_at` timestamp,
	`status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`tenant_id` varchar(255),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `policy_endorsements_id` PRIMARY KEY(`id`)
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
CREATE TABLE `predictive_risk_scores` (
	`id` int AUTO_INCREMENT NOT NULL,
	`entity_type` enum('vehicle','driver','fleet','portfolio') NOT NULL,
	`entity_id` varchar(100) NOT NULL,
	`tenant_id` varchar(255),
	`score_type` varchar(100) NOT NULL,
	`score_value` decimal(8,4) NOT NULL,
	`score_label` enum('very_low','low','medium','high','very_high','critical') NOT NULL,
	`confidence_level` decimal(5,2) NOT NULL,
	`model_version` varchar(50) NOT NULL DEFAULT 'v1.0',
	`factors_json` json,
	`valid_from` timestamp NOT NULL DEFAULT (now()),
	`valid_until` timestamp,
	`computed_at` timestamp NOT NULL DEFAULT (now()),
	`computed_by` varchar(100) NOT NULL DEFAULT 'system',
	CONSTRAINT `predictive_risk_scores_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `quality_metrics` (
	`id` varchar(64) NOT NULL,
	`tenant_id` varchar(64) NOT NULL,
	`metric_type` enum('processing_time','approval_rate','fraud_detection','cost_savings') NOT NULL,
	`metric_value` decimal(10,2) NOT NULL,
	`period_start` timestamp NOT NULL,
	`period_end` timestamp NOT NULL,
	`calculated_at` timestamp NOT NULL DEFAULT (now())
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
CREATE TABLE `quotation_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`request_number` varchar(50) NOT NULL,
	`tenant_id` varchar(255),
	`user_id` int,
	`full_name` varchar(255) NOT NULL,
	`email` varchar(320) NOT NULL,
	`phone` varchar(50),
	`id_number` varchar(20),
	`insurance_type` enum('comprehensive','third_party','third_party_fire_theft','fleet','commercial') NOT NULL,
	`vehicle_make` varchar(100) NOT NULL,
	`vehicle_model` varchar(100) NOT NULL,
	`vehicle_year` int NOT NULL,
	`vehicle_registration` varchar(50),
	`vehicle_vin` varchar(50),
	`vehicle_value` int,
	`vehicle_usage` enum('private','business','both') DEFAULT 'private',
	`driver_age` int,
	`driver_license_years` int,
	`claims_history` int DEFAULT 0,
	`excess_amount` int,
	`additional_cover` text,
	`documents` text,
	`quoted_premium` int,
	`quoted_annual_premium` int,
	`quoted_excess` int,
	`quote_valid_until` timestamp,
	`quote_notes` text,
	`status` enum('pending','under_review','quoted','accepted','rejected','expired') NOT NULL DEFAULT 'pending',
	`assigned_agent_id` int,
	`vehicle_forensics_json` longtext,
	`vehicle_risk_score` int,
	`vehicle_forensics_status` enum('pending','processing','complete','failed'),
	`report_gating_status` enum('teaser','full','paid') NOT NULL DEFAULT 'teaser',
	`report_unlocked_at` timestamp,
	`is_standalone_valuation` tinyint NOT NULL DEFAULT 0,
	`payment_intent_id` varchar(255),
	`inspection_required` tinyint NOT NULL DEFAULT 0,
	`inspection_assigned_to` int,
	`fleet_vehicle_count` int,
	`submission_token` varchar(64),
	`contact_verified` tinyint NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `quotation_requests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `quote_evidence_gaps` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`tenant_id` varchar(255) NOT NULL,
	`claim_id` int NOT NULL,
	`quote_id` int,
	`quote_line_item_id` int,
	`source_document_id` int NOT NULL,
	`source_page` int,
	`source_location` varchar(512),
	`source_crop_ref` varchar(1024),
	`source_text` text,
	`observable_characters` text,
	`ambiguity_description` text NOT NULL,
	`component_confidence` decimal(5,4),
	`quantity_confidence` decimal(5,4),
	`unit_price_confidence` decimal(5,4),
	`extended_amount_confidence` decimal(5,4),
	`transcription_method` enum('document_direct','ocr','vision','human_verified') NOT NULL,
	`candidate_readings_json` json,
	`arithmetic_residual_cents` bigint,
	`currency` varchar(10),
	`impact_json` json,
	`resolution_status` enum('open','human_verification_requested','human_verified','superseded','not_resolvable_from_source') NOT NULL DEFAULT 'open',
	`review_fields_json` json,
	`reviewed_by_user_id` int,
	`reviewed_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `quote_evidence_gaps_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `quote_evidence_ledger` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`tenant_id` varchar(255) NOT NULL,
	`claim_id` int NOT NULL,
	`quote_id` int,
	`quote_line_item_id` int,
	`source_document_id` int NOT NULL,
	`source_page` int,
	`source_location` varchar(512),
	`source_row_label` varchar(500),
	`source_text` text,
	`description` varchar(500) NOT NULL,
	`canonical_component` varchar(255),
	`financial_role` enum('quote_total','subtotal','vat','parts','labour','paint','sundries','component','discount','fee','other') NOT NULL,
	`amount_cents` bigint unsigned NOT NULL,
	`currency` varchar(10) NOT NULL,
	`tax_basis` enum('included','excluded','separately_stated','not_stated','not_applicable') NOT NULL,
	`scope_fingerprint` varchar(128),
	`revision_status` enum('original','revised','superseded','unknown') NOT NULL DEFAULT 'original',
	`extraction_method` enum('document_direct','ocr','vision','human_verified','system_reconstruction') NOT NULL,
	`extraction_confidence` decimal(5,4),
	`evidence_status` enum('verified','reconstructed','documented_revision','scope_difference','extraction_defect','evidence_gap','pricing_variance_review_signal','unresolved') NOT NULL,
	`verification_note` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `quote_evidence_ledger_id` PRIMARY KEY(`id`)
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
CREATE TABLE `rate_limit_tracking` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`tenant_id` varchar(64) NOT NULL,
	`action_type` varchar(50) NOT NULL,
	`window_start` timestamp NOT NULL,
	`action_count` int NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `rate_limit_tracking_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `recovery_cases` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` varchar(64) NOT NULL,
	`claim_id` int NOT NULL,
	`recovery_potential_score` int NOT NULL DEFAULT 0,
	`wronged_party` enum('insured','third_party','shared','unknown') NOT NULL DEFAULT 'unknown',
	`third_party_liability_pct` int DEFAULT 0,
	`third_party_name` varchar(255),
	`third_party_registration` varchar(50),
	`third_party_insurer` varchar(255),
	`third_party_policy_number` varchar(100),
	`third_party_contact_details` text,
	`third_party_insurer_address` text,
	`third_party_insurer_contact` varchar(255),
	`third_party_insurer_policy_ref` varchar(100),
	`third_party_insurer_is_on_kinga` tinyint DEFAULT 0,
	`third_party_address` text,
	`third_party_id_number` varchar(50),
	`third_party_phone` varchar(50),
	`third_party_insurer_phone` varchar(50),
	`police_report_number` varchar(100),
	`police_station` varchar(255),
	`police_report_extracted_at` varchar(50),
	`recovery_target` enum('insurer','individual','unknown') DEFAULT 'unknown',
	`approved_settlement_amount` int,
	`recovered_amount` int,
	`currency_code` varchar(10) DEFAULT 'ZAR',
	`status` enum('pending_review','under_investigation','open','demand_sent','liability_denied','disputed_legal','settled_full','settled_partial','closed_no_recovery','archived') NOT NULL DEFAULT 'pending_review',
	`investigation_reason` text,
	`investigation_expected_resolution_date` varchar(20),
	`recovery_deadline` varchar(20),
	`recovery_deadline_alert_sent_at` varchar(50),
	`demand_letter_sent_at` varchar(50),
	`demand_letter_s3_key` varchar(500),
	`demand_letter_url` varchar(1000),
	`demand_response_due_date` varchar(20),
	`demand_response_received_at` varchar(50),
	`settlement_agreement_date` varchar(20),
	`settlement_notes` text,
	`assigned_officer_user_id` int,
	`assigned_at` varchar(50),
	`officer_notes` text,
	`ai_demand_letter_json` longtext,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`closed_at` varchar(50),
	`is_repeat_offender` tinyint NOT NULL DEFAULT 0,
	`prior_case_count` int NOT NULL DEFAULT 0,
	`prior_case_ids` text,
	CONSTRAINT `recovery_cases_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `recovery_correspondence_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`recovery_case_id` int NOT NULL,
	`tenant_id` varchar(64) NOT NULL,
	`entry_type` enum('demand_letter_generated','demand_letter_sent','response_received','follow_up_sent','legal_escalation','settlement_offer','settlement_accepted','settlement_rejected','case_note','status_change','recovery_target_changed','system_event') NOT NULL DEFAULT 'case_note',
	`actor_id` varchar(64),
	`actor_name` varchar(128),
	`actor_role` varchar(64),
	`subject` varchar(255),
	`body` text,
	`attachment_url` varchar(1024),
	`from_status` varchar(64),
	`to_status` varchar(64),
	`from_target` varchar(32),
	`to_target` varchar(32),
	`amount_cents` int,
	`currency_code` varchar(8) DEFAULT 'ZAR',
	`created_at` varchar(32) NOT NULL,
	CONSTRAINT `recovery_correspondence_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `reference_dataset` (
	`id` int AUTO_INCREMENT NOT NULL,
	`historical_claim_id` int NOT NULL,
	`tenant_id` varchar(64),
	`dataset_version` varchar(50) NOT NULL,
	`included_at` timestamp NOT NULL DEFAULT (now()),
	`used_for_benchmarking` tinyint DEFAULT 0,
	`used_for_analytics` tinyint DEFAULT 0,
	`last_accessed_at` timestamp,
	`reference_purpose` text,
	CONSTRAINT `reference_dataset_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `regional_benchmarks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`region` varchar(100) NOT NULL,
	`city` varchar(100),
	`vehicle_type` varchar(50),
	`vehicle_make` varchar(100),
	`vehicle_model` varchar(100),
	`year_range` varchar(20),
	`labor_rate_per_hour` decimal(10,2),
	`paint_cost_per_panel` decimal(10,2),
	`common_parts_costs` text,
	`sample_size` int,
	`confidence_level` decimal(5,2),
	`effective_from` date NOT NULL,
	`effective_to` date,
	`last_updated` timestamp NOT NULL DEFAULT (now()),
	`data_source` varchar(255),
	CONSTRAINT `regional_benchmarks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `regional_pricing_multipliers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`country` varchar(100) NOT NULL,
	`country_code` varchar(3) NOT NULL,
	`transport_cost_multiplier` decimal(5,2) NOT NULL,
	`duty_rate` decimal(5,2) NOT NULL,
	`handling_fee_flat` decimal(10,2) DEFAULT '0.00',
	`margin_multiplier` decimal(5,2) DEFAULT '1.10',
	`currency_code` varchar(3) NOT NULL,
	`exchange_rate_to_usd` decimal(15,6) NOT NULL,
	`exchange_rate_source` varchar(100),
	`last_updated` timestamp NOT NULL DEFAULT (now()),
	`updated_by` int,
	`notes` text,
	CONSTRAINT `regional_pricing_multipliers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `registration_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(200) NOT NULL,
	`email` varchar(320) NOT NULL,
	`phone` varchar(20),
	`role` enum('panel_beater','assessor') NOT NULL,
	`business_name` varchar(200),
	`address` text,
	`city` varchar(100),
	`license_number` varchar(100),
	`years_experience` int,
	`specializations` text,
	`documents_json` text,
	`status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`reviewed_by` int,
	`reviewed_at` timestamp,
	`review_notes` text,
	`created_user_id` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `registration_requests_id` PRIMARY KEY(`id`)
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
CREATE TABLE `replay_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`claim_id` varchar(50) NOT NULL,
	`tenant_id` varchar(50) NOT NULL,
	`original_snapshot_id` int,
	`original_snapshot_version` int NOT NULL,
	`original_verdict` varchar(50) NOT NULL,
	`new_verdict` varchar(50) NOT NULL,
	`changed` tinyint NOT NULL DEFAULT 0,
	`differences_json` text NOT NULL,
	`impact_analysis` text NOT NULL,
	`replay_result_json` text NOT NULL,
	`replayed_at` bigint NOT NULL,
	`replayed_by_user_id` varchar(50),
	`lifecycle_state_at_replay` varchar(20) NOT NULL,
	CONSTRAINT `replay_logs_id` PRIMARY KEY(`id`)
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
CREATE TABLE `report_provenance_snapshots` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`job_id` varchar(64) NOT NULL,
	`report_key` varchar(100) NOT NULL,
	`tenant_id` varchar(255) NOT NULL,
	`claim_id` int,
	`generator_version` varchar(100) NOT NULL,
	`input_hash` varchar(64) NOT NULL,
	`input_snapshot` json NOT NULL,
	`created_at` bigint unsigned NOT NULL,
	CONSTRAINT `report_provenance_snapshots_id` PRIMARY KEY(`id`),
	CONSTRAINT `report_provenance_snapshots_job_id_uq` UNIQUE(`job_id`)
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
CREATE TABLE `risk_register` (
	`id` varchar(64) NOT NULL,
	`tenant_id` varchar(64) NOT NULL,
	`claim_id` int,
	`risk_type` enum('fraud','cost_overrun','compliance','operational') NOT NULL,
	`likelihood` int NOT NULL,
	`impact` int NOT NULL,
	`risk_score` int NOT NULL,
	`description` text NOT NULL,
	`treatment_plan` enum('accept','mitigate','transfer','avoid'),
	`treatment_notes` text,
	`identified_by` int NOT NULL,
	`identified_at` timestamp NOT NULL DEFAULT (now()),
	`reviewed_by` int,
	`reviewed_at` timestamp,
	`status` enum('open','mitigated','closed') NOT NULL DEFAULT 'open',
	CONSTRAINT `risk_register_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `role_assignment_audit` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` varchar(64) NOT NULL,
	`user_id` int NOT NULL,
	`previous_role` enum('user','admin','insurer','assessor','panel_beater','claimant','fleet_admin','fleet_manager','fleet_driver','platform_super_admin','agency','engineer'),
	`new_role` enum('user','admin','insurer','assessor','panel_beater','claimant','fleet_admin','fleet_manager','fleet_driver','platform_super_admin','agency','engineer') NOT NULL,
	`previous_insurer_role` enum('claims_processor','assessor_internal','assessor_external','risk_manager','claims_manager','executive','insurer_admin','recovery_officer'),
	`new_insurer_role` enum('claims_processor','assessor_internal','assessor_external','risk_manager','claims_manager','executive','insurer_admin','recovery_officer'),
	`changed_by_user_id` int NOT NULL,
	`justification` text,
	`timestamp` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `role_assignment_audit_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `routing_history` (
	`id` varchar(64) NOT NULL,
	`claim_id` int NOT NULL,
	`tenant_id` varchar(64) NOT NULL,
	`confidence_score` decimal(5,2) NOT NULL,
	`confidence_components` text,
	`routing_category` enum('HIGH','MEDIUM','LOW') NOT NULL,
	`routing_decision` enum('AI_FAST_TRACK','INTERNAL_REVIEW','EXTERNAL_REQUIRED','MANUAL_OVERRIDE') NOT NULL,
	`threshold_config_version` varchar(50) NOT NULL DEFAULT 'v1.0',
	`model_version` varchar(50) NOT NULL DEFAULT 'v1.0',
	`decided_by` enum('AI','USER') NOT NULL,
	`decided_by_user_id` int,
	`justification` text,
	`explainability_metadata` text,
	`timestamp` timestamp NOT NULL DEFAULT (now()),
	`routing_version` int NOT NULL DEFAULT 1,
	`threshold_snapshot` text,
	CONSTRAINT `routing_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `routing_threshold_config` (
	`id` varchar(64) NOT NULL,
	`tenant_id` varchar(64) NOT NULL,
	`version` varchar(50) NOT NULL,
	`high_threshold` decimal(5,2) NOT NULL,
	`medium_threshold` decimal(5,2) NOT NULL,
	`ai_fast_track_enabled` tinyint NOT NULL DEFAULT 1,
	`created_by_user_id` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`is_active` tinyint NOT NULL DEFAULT 1,
	CONSTRAINT `routing_threshold_config_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `service_providers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`provider_name` varchar(255) NOT NULL,
	`provider_type` enum('panel_beater','mechanic','dealership','specialist') NOT NULL,
	`contact_person` varchar(255),
	`email` varchar(320),
	`phone` varchar(20),
	`address` text,
	`city` varchar(100),
	`region` varchar(100),
	`specializations` text,
	`certifications` text,
	`average_rating` decimal(3,2),
	`total_jobs_completed` int DEFAULT 0,
	`average_completion_time` decimal(6,2),
	`average_cost_deviation` decimal(5,2),
	`on_time_completion_rate` decimal(5,2),
	`is_active` tinyint DEFAULT 1,
	`is_verified` tinyint DEFAULT 0,
	`verified_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `service_providers_id` PRIMARY KEY(`id`)
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
CREATE TABLE `service_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`vehicle_id` int NOT NULL,
	`fleet_id` int,
	`owner_id` int NOT NULL,
	`tenant_id` varchar(64),
	`request_type` enum('maintenance','repair','inspection','emergency') NOT NULL,
	`service_category` enum('engine','transmission','brakes','suspension','electrical','bodywork','tires','hvac','general') NOT NULL,
	`title` varchar(255) NOT NULL,
	`description` text NOT NULL,
	`urgency` enum('low','medium','high','critical') DEFAULT 'medium',
	`current_mileage` int,
	`problem_images` text,
	`diagnostic_codes` text,
	`status` enum('open','quotes_received','quote_accepted','in_progress','completed','cancelled') DEFAULT 'open',
	`quotes_received` int DEFAULT 0,
	`selected_quote_id` int,
	`selected_provider_id` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`completed_at` timestamp,
	`requires_approval` tinyint NOT NULL DEFAULT 1,
	`approval_status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`approved_by` int,
	`approved_at` timestamp,
	`rejection_reason` text,
	`submitted_by` int NOT NULL,
	CONSTRAINT `service_requests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `shadow_override_monitor` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` varchar(50) NOT NULL,
	`user_name` varchar(100),
	`tenant_id` varchar(50) NOT NULL DEFAULT 'default',
	`overrides_24h` int NOT NULL DEFAULT 0,
	`overrides_7d` int NOT NULL DEFAULT 0,
	`overrides_30d` int NOT NULL DEFAULT 0,
	`total_overrides` int NOT NULL DEFAULT 0,
	`unusual_pattern_detected` tinyint NOT NULL DEFAULT 0,
	`pattern_notes` text,
	`override_activity_detected` tinyint NOT NULL DEFAULT 0,
	`recommended_action` varchar(20) NOT NULL DEFAULT 'none',
	`mode` varchar(20) NOT NULL DEFAULT 'shadow',
	`last_scanned_at` bigint NOT NULL,
	`first_override_at` bigint,
	`last_override_at` bigint,
	`created_at` bigint NOT NULL,
	`updated_at` bigint NOT NULL,
	CONSTRAINT `shadow_override_monitor_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `similar_claims_clusters` (
	`id` int AUTO_INCREMENT NOT NULL,
	`historical_claim_id` int NOT NULL,
	`vehicle_make` varchar(100),
	`vehicle_model` varchar(100),
	`vehicle_year` int,
	`damage_type` varchar(100),
	`damage_severity` enum('minor','moderate','severe','total_loss'),
	`region` varchar(100),
	`cluster_id` int,
	`cluster_size` int,
	`similar_claims` text,
	`cluster_median_cost` decimal(10,2),
	`cluster_average_cost` decimal(10,2),
	`cluster_std_dev` decimal(10,2),
	`similarity_threshold` decimal(5,2),
	`k_neighbors` int,
	`clustered_at` timestamp NOT NULL DEFAULT (now()),
	`clustering_algorithm` varchar(50),
	CONSTRAINT `similar_claims_clusters_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `super_audit_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`super_admin_user_id` int NOT NULL,
	`super_admin_name` varchar(255),
	`audited_tenant_id` varchar(64),
	`impersonated_role` varchar(64),
	`session_started_at` timestamp NOT NULL DEFAULT (now()),
	`session_ended_at` timestamp,
	`session_duration_seconds` int,
	`accessed_claim_ids` text,
	`accessed_dashboards` text,
	`replayed_claim_ids` text,
	`viewed_ai_scoring_claim_ids` text,
	`viewed_routing_logic_claim_ids` text,
	`is_active` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `super_audit_sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `supplier_performance_metrics` (
	`id` int AUTO_INCREMENT NOT NULL,
	`supplier_name` varchar(255) NOT NULL,
	`supplier_country` varchar(100),
	`total_quotes_submitted` int DEFAULT 0,
	`total_quotes_approved` int DEFAULT 0,
	`total_quotes_rejected` int DEFAULT 0,
	`avg_price_vs_market` decimal(5,2),
	`avg_extraction_confidence` decimal(5,2),
	`first_quote_date` date,
	`last_quote_date` date,
	`last_updated` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `supplier_performance_metrics_id` PRIMARY KEY(`id`)
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
CREATE TABLE `system_errors` (
	`id` int AUTO_INCREMENT NOT NULL,
	`procedure_name` varchar(255),
	`user_id` int,
	`tenant_id` varchar(64),
	`error_message` text,
	`stack_trace` text,
	`error_code` varchar(64),
	`occurred_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `system_errors_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tenant_invitations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` varchar(64) NOT NULL,
	`email` varchar(320) NOT NULL,
	`role` enum('user','admin','insurer','assessor','panel_beater','claimant','platform_super_admin','fleet_admin','fleet_manager','fleet_driver') NOT NULL,
	`insurer_role` enum('claims_processor','assessor_internal','assessor_external','risk_manager','claims_manager','executive','insurer_admin','recovery_officer'),
	`token` varchar(64) NOT NULL,
	`expires_at` timestamp NOT NULL,
	`accepted_at` timestamp,
	`created_by` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `tenant_invitations_id` PRIMARY KEY(`id`),
	CONSTRAINT `tenant_invitations_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE TABLE `tenant_isolation_violations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int,
	`user_tenant_id` varchar(64),
	`target_tenant_id` varchar(64),
	`procedure_name` varchar(255),
	`ip_address` varchar(45),
	`user_agent` text,
	`occurred_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `tenant_isolation_violations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tenant_role_configs` (
	`tenant_id` varchar(64) NOT NULL,
	`role_key` enum('executive','claims_manager','claims_processor','assessor_internal','assessor_external','risk_manager','insurer_admin','recovery_officer') NOT NULL,
	`enabled` tinyint NOT NULL DEFAULT 1,
	`display_name` varchar(100),
	`permissions` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tenant_role_configs_tenant_id_role_key_pk` PRIMARY KEY(`tenant_id`,`role_key`)
);
--> statement-breakpoint
CREATE TABLE `tenant_workflow_configs` (
	`id` varchar(64) NOT NULL,
	`tenant_id` varchar(64) NOT NULL,
	`require_executive_approval_above` decimal(10,2) DEFAULT '50000.00',
	`require_manager_approval_above` decimal(10,2) DEFAULT '10000.00',
	`auto_approve_below` decimal(10,2) DEFAULT '5000.00',
	`fraud_flag_threshold` decimal(3,2) DEFAULT '0.70',
	`require_internal_assessment` tinyint NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tenant_workflow_configs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tenants` (
	`id` varchar(255) NOT NULL,
	`name` varchar(255) NOT NULL,
	`display_name` varchar(255) NOT NULL,
	`tier` enum('tier-basic','tier-professional','tier-enterprise') NOT NULL DEFAULT 'tier-basic',
	`status` enum('active','suspended','cancelled') NOT NULL DEFAULT 'active',
	`encryption_key_id` varchar(255),
	`contact_name` varchar(255),
	`contact_email` varchar(255) NOT NULL,
	`contact_phone` varchar(50),
	`billing_email` varchar(255) NOT NULL,
	`config_json` json,
	`workflow_config` text,
	`intake_escalation_hours` int DEFAULT 6,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`activated_at` timestamp,
	`suspended_at` timestamp,
	`intake_escalation_enabled` tinyint NOT NULL DEFAULT 0,
	`intake_escalation_mode` enum('auto_assign','escalate_only') DEFAULT 'escalate_only',
	`ai_rerun_limit_per_hour` int NOT NULL DEFAULT 10,
	`currency_code` varchar(10) DEFAULT 'USD',
	`currency_symbol` varchar(10) DEFAULT '$',
	`country` varchar(2),
	`kinga_sequence` int NOT NULL DEFAULT 0,
	`kinga_sequence_year` int NOT NULL DEFAULT 0,
	`is_synthetic_tenant` tinyint NOT NULL DEFAULT 0,
	CONSTRAINT `tenants_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `third_party_vehicles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`claim_id` int NOT NULL,
	`make` varchar(100),
	`model` varchar(100),
	`year` int,
	`registration` varchar(50),
	`vin` varchar(17),
	`color` varchar(50),
	`owner_name` varchar(200),
	`owner_contact` varchar(100),
	`owner_address` text,
	`driver_name` varchar(200),
	`driver_license` varchar(100),
	`insurance_company` varchar(200),
	`policy_number` varchar(100),
	`damage_description` longtext,
	`damage_photos` text,
	`estimated_repair_cost` int,
	`market_value` int,
	`market_value_source` varchar(255),
	`market_value_confidence` enum('low','medium','high'),
	`liability_percentage` int DEFAULT 0,
	`compensation_amount` int,
	`compensation_type` enum('repair','cash','total_loss'),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `third_party_vehicles_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `training_data_scores` (
	`id` int AUTO_INCREMENT NOT NULL,
	`historical_claim_id` int NOT NULL,
	`tenant_id` varchar(64),
	`training_confidence_score` decimal(5,2) NOT NULL,
	`training_confidence_category` enum('HIGH','MEDIUM','LOW') NOT NULL,
	`assessor_report_score` decimal(5,2) DEFAULT '0.00',
	`supporting_photos_score` decimal(5,2) DEFAULT '0.00',
	`panel_beater_quotes_score` decimal(5,2) DEFAULT '0.00',
	`evidence_completeness_score` decimal(5,2) DEFAULT '0.00',
	`handwritten_adjustments_score` decimal(5,2) DEFAULT '0.00',
	`fraud_markers_score` decimal(5,2) DEFAULT '0.00',
	`dispute_history_score` decimal(5,2) DEFAULT '0.00',
	`competing_quotes_score` decimal(5,2) DEFAULT '0.00',
	`scoring_algorithm_version` varchar(20),
	`scoring_notes` text,
	`anomaly_detected` tinyint DEFAULT 0,
	`anomaly_reason` text,
	`bias_risk_detected` tinyint DEFAULT 0,
	`bias_risk_reason` text,
	`scored_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `training_data_scores_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `training_dataset` (
	`id` int AUTO_INCREMENT NOT NULL,
	`historical_claim_id` int NOT NULL,
	`tenant_id` varchar(64),
	`dataset_version` varchar(50) NOT NULL,
	`included_at` timestamp NOT NULL DEFAULT (now()),
	`included_by` int NOT NULL,
	`inclusion_reason` text,
	`used_in_model_versions` text,
	`last_used_for_training` timestamp,
	`is_active` tinyint DEFAULT 1,
	`deactivated_at` timestamp,
	`deactivation_reason` text,
	`training_weight` decimal(3,2) DEFAULT '1.00',
	`negotiated_adjustment` tinyint DEFAULT 0,
	`deviation_reason` enum('none','negotiation','fraud','regional_variance','data_quality','assessor_bias','manual_override') DEFAULT 'none',
	CONSTRAINT `training_dataset_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `training_records` (
	`id` varchar(64) NOT NULL,
	`tenant_id` varchar(64) NOT NULL,
	`user_id` int NOT NULL,
	`training_type` enum('fraud_detection','iso_compliance','role_onboarding') NOT NULL,
	`completion_date` timestamp NOT NULL,
	`expiry_date` timestamp,
	`trainer` varchar(255),
	`assessment_score` decimal(5,2),
	`certificate_url` text,
	`created_at` timestamp NOT NULL DEFAULT (now())
);
--> statement-breakpoint
CREATE TABLE `usage_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` varchar(255) NOT NULL,
	`claim_id` int,
	`event_type` enum('CLAIM_PROCESSED','AI_EVALUATED','FAST_TRACK_TRIGGERED','AUTO_APPROVED','ASSESSOR_TOOL_USED','FLEET_VEHICLE_ACTIVE','AGENCY_POLICY_BOUND','AI_ASSESSMENT_TRIGGERED','DOCUMENT_INGESTED','EXECUTIVE_ANALYTICS_QUERY','GOVERNANCE_CHECK','FLEET_VEHICLE_MANAGED','MARKETPLACE_QUOTE_REQUEST') NOT NULL,
	`quantity` int NOT NULL DEFAULT 1,
	`timestamp` timestamp NOT NULL DEFAULT (now()),
	`reference_id` varchar(255),
	`metadata` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`user_id` int,
	`resource_type` varchar(100),
	`compute_units` decimal(10,4) DEFAULT '1.0000',
	`processing_time_ms` int,
	`estimated_cost` decimal(10,4),
	CONSTRAINT `usage_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `user_invitations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organization_id` int NOT NULL,
	`email` varchar(320) NOT NULL,
	`role` enum('insurer','assessor') NOT NULL,
	`invited_by` int NOT NULL,
	`invitation_token` varchar(64) NOT NULL,
	`status` enum('pending','accepted','expired','cancelled') NOT NULL DEFAULT 'pending',
	`accepted_at` timestamp,
	`accepted_user_id` int,
	`expires_at` timestamp NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_invitations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`openId` varchar(64) NOT NULL,
	`name` text,
	`email` varchar(320),
	`phone_number` varchar(30),
	`password_hash` varchar(255),
	`loginMethod` varchar(64),
	`role` enum('user','admin','insurer','assessor','panel_beater','claimant','platform_super_admin','fleet_admin','fleet_manager','fleet_driver','agency','engineer') NOT NULL DEFAULT 'user',
	`insurer_role` enum('claims_processor','assessor_internal','assessor_external','risk_manager','claims_manager','executive','insurer_admin','recovery_officer'),
	`organization_id` int,
	`tenant_id` varchar(64),
	`email_verified` tinyint NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp NOT NULL DEFAULT (now()),
	`assessor_tier` enum('free','premium','enterprise') DEFAULT 'free',
	`tier_activated_at` timestamp,
	`tier_expires_at` timestamp,
	`performance_score` int DEFAULT 70,
	`secondary_roles` json,
	`total_assessments_completed` int DEFAULT 0,
	`average_variance_from_final` int,
	`accuracy_score` decimal(5,2) DEFAULT '0.00',
	`avg_completion_time` decimal(6,2) DEFAULT '0.00',
	`marketplace_profile_id` varchar(36),
	`is_active` tinyint NOT NULL DEFAULT 1,
	`deactivated_at` timestamp,
	`default_role` varchar(100),
	`is_qa_account` tinyint DEFAULT 0,
	`is_unregistered_claimant` tinyint NOT NULL DEFAULT 0,
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_openId_unique` UNIQUE(`openId`)
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
CREATE TABLE `variance_datasets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`historical_claim_id` int NOT NULL,
	`tenant_id` varchar(64) NOT NULL,
	`comparison_type` enum('quote_vs_final','ai_vs_final','assessor_vs_final','quote_vs_assessor','ai_vs_assessor','quote_vs_ai') NOT NULL,
	`source_a_label` varchar(100) NOT NULL,
	`source_a_amount` decimal(12,2) NOT NULL,
	`source_b_label` varchar(100) NOT NULL,
	`source_b_amount` decimal(12,2) NOT NULL,
	`variance_amount` decimal(12,2) NOT NULL,
	`variance_percent` decimal(8,2) NOT NULL,
	`absolute_variance_percent` decimal(8,2) NOT NULL,
	`labor_variance` decimal(12,2),
	`parts_variance` decimal(12,2),
	`paint_variance` decimal(12,2),
	`variance_category` enum('within_threshold','minor_variance','significant_variance','major_variance','extreme_variance') NOT NULL,
	`vehicle_make` varchar(100),
	`vehicle_model` varchar(100),
	`vehicle_year` int,
	`accident_type` varchar(100),
	`assessor_name` varchar(255),
	`assessor_license_number` varchar(100),
	`is_fraud_suspected` tinyint DEFAULT 0,
	`is_outlier` tinyint DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `variance_datasets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `vehicle_condition_assessment` (
	`id` int AUTO_INCREMENT NOT NULL,
	`claim_id` int NOT NULL,
	`assessor_id` int NOT NULL,
	`speedo_reading` int,
	`speedo_unit` enum('km','miles') DEFAULT 'km',
	`brakes_condition` enum('good','fair','poor'),
	`brakes_notes` text,
	`steering_condition` enum('good','fair','poor'),
	`steering_notes` text,
	`tires_condition` enum('good','fair','poor'),
	`tire_tread_depth_mm` int,
	`tires_notes` text,
	`suspension_condition` enum('good','fair','poor'),
	`suspension_notes` text,
	`bodywork_condition` enum('good','fair','poor'),
	`bodywork_notes` text,
	`paintwork_condition` enum('good','fair','poor'),
	`paintwork_notes` text,
	`upholstery_condition` enum('good','fair','poor'),
	`upholstery_notes` text,
	`general_mechanical` enum('good','fair','poor'),
	`mechanical_notes` text,
	`radio_present` tinyint DEFAULT 1,
	`radio_model` varchar(100),
	`token_number` varchar(100),
	`overall_condition` enum('excellent','good','fair','poor'),
	`maintenance_level` enum('well_maintained','average','poorly_maintained'),
	`has_contributory_negligence` tinyint DEFAULT 0,
	`negligence_description` text,
	`condition_photos` text,
	`assessment_date` timestamp NOT NULL DEFAULT (now()),
	`assessor_signature` varchar(500),
	`notes` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `vehicle_condition_assessment_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `vehicle_condition_snapshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`vehicle_registry_id` int NOT NULL,
	`insurance_service_request_id` int NOT NULL,
	`vehicle_market_valuation_id` int,
	`snapshot_version` int NOT NULL,
	`snapshot_date` timestamp NOT NULL,
	`exterior_condition` varchar(50) NOT NULL,
	`interior_condition` varchar(50) NOT NULL,
	`mechanical_condition` varchar(50) NOT NULL,
	`existing_damage_notes` text,
	`tyre_condition` varchar(50),
	`glass_condition` varchar(50),
	`odometer_km` int,
	`modifications_json` json,
	`photographs_json` json,
	`evidence_sources_json` json NOT NULL,
	`observations` text,
	`assessor_notes` text,
	`captured_by` int NOT NULL,
	`tenant_id` varchar(64) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `vehicle_condition_snapshots_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_vehicle_condition_snapshot_version` UNIQUE(`insurance_service_request_id`,`snapshot_version`)
);
--> statement-breakpoint
CREATE TABLE `vehicle_damage_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`vehicle_id` int NOT NULL,
	`claim_id` int,
	`vehicle_registration` varchar(50),
	`damage_zone` enum('front','rear','left','right','roof','undercarriage','multiple','unknown') NOT NULL DEFAULT 'unknown',
	`damaged_components_json` longtext,
	`affected_zones_json` text,
	`impact_direction` varchar(50),
	`impact_force_kn` decimal(8,2),
	`estimated_speed_kmh` decimal(6,1),
	`severity` enum('minor','moderate','severe','total_loss','unknown') NOT NULL DEFAULT 'unknown',
	`has_structural_damage` tinyint NOT NULL DEFAULT 0,
	`airbags_deployed` tinyint NOT NULL DEFAULT 0,
	`repair_cost_estimate_cents` int NOT NULL DEFAULT 0,
	`actual_repair_cost_cents` int,
	`repairer_id` int,
	`repairer_name` varchar(255),
	`repair_date` varchar(20),
	`fraud_risk_score` int NOT NULL DEFAULT 0,
	`is_repeat_zone` tinyint NOT NULL DEFAULT 0,
	`tenant_id` varchar(255),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `vehicle_damage_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `vehicle_geometry_measurements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`vehicle_model_id` int NOT NULL,
	`measurement_type` varchar(80) NOT NULL,
	`value_mm` decimal(10,2) NOT NULL,
	`unit` varchar(20) NOT NULL DEFAULT 'mm',
	`confidence` decimal(4,3) NOT NULL DEFAULT '0.900',
	`source_type` varchar(80),
	`source_reference` varchar(255),
	`verified_by` varchar(100),
	`created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `vehicle_geometry_measurements_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `vehicle_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`vehicle_registration` varchar(50) NOT NULL,
	`vehicle_make` varchar(100),
	`vehicle_model` varchar(100),
	`vehicle_year` int,
	`vin` varchar(17),
	`current_owner_id` int,
	`ownership_change_count` int DEFAULT 0,
	`ownership_history` text,
	`total_claims` int DEFAULT 0,
	`total_claim_amount` int DEFAULT 0,
	`last_claim_date` timestamp,
	`has_pre_existing_damage` tinyint DEFAULT 0,
	`is_salvage_title` tinyint DEFAULT 0,
	`has_odometer_fraud` tinyint DEFAULT 0,
	`is_stolen` tinyint DEFAULT 0,
	`unique_drivers_count` int DEFAULT 0,
	`non_owner_accident_count` int DEFAULT 0,
	`driver_history` text,
	`risk_score` int DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `vehicle_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `vehicle_landmarks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`vehicle_model_id` int NOT NULL,
	`landmark_type` varchar(100) NOT NULL,
	`x_mm` decimal(10,2),
	`y_mm` decimal(10,2),
	`z_mm` decimal(10,2),
	`reference_frame` varchar(20) NOT NULL DEFAULT 'VVCS',
	`confidence` decimal(4,3) NOT NULL DEFAULT '0.900',
	`source_type` varchar(80),
	`created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `vehicle_landmarks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `vehicle_market_valuations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`claim_id` int,
	`vehicle_make` varchar(100) NOT NULL,
	`vehicle_model` varchar(100) NOT NULL,
	`vehicle_year` int NOT NULL,
	`vehicle_registration` varchar(50),
	`mileage` int,
	`condition` enum('excellent','good','fair','poor'),
	`estimated_market_value` int NOT NULL,
	`valuation_method` enum('facebook_marketplace','classifieds','autotrader_sa','historical_claims','manual_assessor','ai_estimation','hybrid') NOT NULL,
	`facebook_prices` text,
	`classifieds_prices` text,
	`autotrader_sa_prices` text,
	`sa_base_price` int,
	`import_duty_percent` decimal(5,2),
	`import_duty_amount` int,
	`transport_cost` int,
	`total_import_cost` int,
	`confidence_score` int,
	`data_points_count` int,
	`price_range` text,
	`condition_adjustment` int,
	`mileage_adjustment` int,
	`market_trend_adjustment` int,
	`final_adjusted_value` int,
	`is_total_loss` tinyint DEFAULT 0,
	`total_loss_threshold` decimal(5,2) DEFAULT '60.00',
	`repair_cost_to_value_ratio` decimal(5,2),
	`assessor_override` tinyint DEFAULT 0,
	`assessor_value` int,
	`assessor_justification` text,
	`valuation_date` timestamp NOT NULL DEFAULT (now()),
	`valid_until` timestamp,
	`valued_by` int,
	`notes` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `vehicle_market_valuations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `vehicle_mileage_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`vehicle_id` int NOT NULL,
	`tenant_id` varchar(64),
	`mileage` int NOT NULL,
	`recorded_date` timestamp NOT NULL,
	`recorded_by` int NOT NULL,
	`record_type` enum('manual','service','inspection','claim','automated') DEFAULT 'manual',
	`notes` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `vehicle_mileage_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `vehicle_models` (
	`id` int AUTO_INCREMENT NOT NULL,
	`manufacturer` varchar(100) NOT NULL,
	`model` varchar(100) NOT NULL,
	`variant` varchar(100),
	`generation` varchar(50),
	`year_from` int NOT NULL,
	`year_to` int,
	`body_type` varchar(50),
	`market_region` varchar(100),
	`completeness_score` decimal(4,3) DEFAULT '0.000',
	`profile_cache_json` json,
	`created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `vehicle_models_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `vehicle_passport_snapshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`vehicle_registry_id` int NOT NULL,
	`registration_number` varchar(50) NOT NULL,
	`tenant_id` varchar(255),
	`snapshot_version` int NOT NULL DEFAULT 1,
	`total_claims` int NOT NULL DEFAULT 0,
	`completed_claims` int NOT NULL DEFAULT 0,
	`open_claims` int NOT NULL DEFAULT 0,
	`total_settlement_cents` int NOT NULL DEFAULT 0,
	`avg_settlement_cents` int NOT NULL DEFAULT 0,
	`total_fraud_signals` int NOT NULL DEFAULT 0,
	`repeat_damage_signals` int NOT NULL DEFAULT 0,
	`total_damage_events` int NOT NULL DEFAULT 0,
	`repeat_zone_count` int NOT NULL DEFAULT 0,
	`distinct_damage_zones` int NOT NULL DEFAULT 0,
	`total_inspections` int NOT NULL DEFAULT 0,
	`last_claim_date` timestamp,
	`last_inspection_date` timestamp,
	`last_fraud_signal_date` timestamp,
	`intelligence_json` json,
	`generated_at` timestamp NOT NULL DEFAULT (now()),
	`generated_by` varchar(100) NOT NULL DEFAULT 'system',
	CONSTRAINT `vehicle_passport_snapshots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `vehicle_registry` (
	`id` int AUTO_INCREMENT NOT NULL,
	`vin` varchar(17),
	`registration_number` varchar(30),
	`make` varchar(100),
	`model` varchar(100),
	`year` int,
	`color` varchar(50),
	`engine_number` varchar(100),
	`vehicle_type` enum('sedan','suv','pickup','van','hatchback','coupe','bus','truck','motorcycle','other'),
	`engine_capacity` varchar(20),
	`fuel_type` enum('petrol','diesel','electric','hybrid','lpg','other'),
	`powertrain_type` enum('ICE','HEV','BEV','other'),
	`vehicle_mass_kg` int,
	`vehicle_mass_source` enum('explicit','inferred_model','inferred_class','not_available') DEFAULT 'not_available',
	`current_owner_name` varchar(255),
	`first_registration_date` varchar(20),
	`licence_expiry_date` varchar(20),
	`total_claims_count` int NOT NULL DEFAULT 0,
	`total_repair_cost_cents` int NOT NULL DEFAULT 0,
	`last_claim_date` timestamp,
	`claim_ids_json` text,
	`damage_zone_counts_json` text,
	`has_suspicious_damage_pattern` tinyint NOT NULL DEFAULT 0,
	`is_repeat_claimer` tinyint NOT NULL DEFAULT 0,
	`is_salvage_title` tinyint NOT NULL DEFAULT 0,
	`is_stolen` tinyint NOT NULL DEFAULT 0,
	`is_written_off` tinyint NOT NULL DEFAULT 0,
	`vehicle_risk_score` int NOT NULL DEFAULT 0,
	`tenant_id` varchar(255),
	`first_seen_at` timestamp NOT NULL DEFAULT (now()),
	`last_seen_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `vehicle_registry_id` PRIMARY KEY(`id`),
	CONSTRAINT `vehicle_registry_vin_unique` UNIQUE(`vin`),
	CONSTRAINT `idx_vehicle_registry_vin` UNIQUE(`vin`)
);
--> statement-breakpoint
CREATE TABLE `vision_calibration_results` (
	`id` int AUTO_INCREMENT NOT NULL,
	`claim_id` varchar(50) NOT NULL,
	`assessment_id` int,
	`image_url` text NOT NULL,
	`image_index` int,
	`vehicle_model_id` int,
	`reference_type` varchar(80) NOT NULL,
	`pixel_measurement` decimal(10,2),
	`physical_measurement_mm` decimal(10,2),
	`scale_mm_per_pixel` decimal(10,4),
	`perspective_correction_method` varchar(50) NOT NULL DEFAULT 'none',
	`confidence` decimal(4,3),
	`failure_reason` varchar(255),
	`calibrated_crush_depth_m` decimal(6,4),
	`calibrated_crush_depth_min_m` decimal(6,4),
	`calibrated_crush_depth_max_m` decimal(6,4),
	`geometry_evidence_json` json,
	`created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `vision_calibration_results_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `weight_adjustment_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`mismatch_type` varchar(64) NOT NULL,
	`old_multiplier` decimal(7,4) NOT NULL,
	`raw_multiplier` decimal(7,4) NOT NULL,
	`new_multiplier` decimal(7,4) NOT NULL,
	`total_annotations` int NOT NULL,
	`confirmation_rate` decimal(6,4) NOT NULL,
	`sensitivity_direction` enum('increase','decrease') NOT NULL,
	`reason` text NOT NULL,
	`created_at` bigint NOT NULL,
	CONSTRAINT `weight_adjustment_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `whatsapp_sessions` (
	`id` varchar(36) NOT NULL,
	`phone_number` varchar(30) NOT NULL,
	`intent` varchar(50),
	`state` varchar(80) NOT NULL DEFAULT 'IDLE',
	`data` json,
	`photo_urls` json,
	`status` enum('active','paused','submitted','expired') NOT NULL DEFAULT 'active',
	`resume_context` text,
	`last_message_at` timestamp NOT NULL DEFAULT (now()),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `whatsapp_sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `workflow_audit_trail` (
	`id` int AUTO_INCREMENT NOT NULL,
	`claim_id` int NOT NULL,
	`user_id` int NOT NULL,
	`user_role` enum('claims_processor','assessor_internal','assessor_external','risk_manager','claims_manager','executive','insurer_admin','recovery_officer') NOT NULL,
	`previous_state` enum('intake_queue','created','intake_verified','assigned','under_assessment','internal_review','technical_approval','financial_decision','payment_authorized','closed','disputed'),
	`new_state` enum('intake_queue','created','intake_verified','assigned','under_assessment','internal_review','technical_approval','financial_decision','payment_authorized','closed','disputed') NOT NULL,
	`decision_value` int,
	`ai_score` int,
	`confidence_score` int,
	`comments` text,
	`metadata` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`executive_override` int DEFAULT 0,
	`override_reason` text,
	CONSTRAINT `workflow_audit_trail_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `workflow_configuration` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` varchar(255) NOT NULL,
	`risk_manager_enabled` tinyint NOT NULL DEFAULT 1,
	`high_value_threshold` int NOT NULL DEFAULT 1000000,
	`executive_review_threshold` int NOT NULL DEFAULT 5000000,
	`ai_fast_track_enabled` tinyint NOT NULL DEFAULT 0,
	`external_assessor_enabled` tinyint NOT NULL DEFAULT 1,
	`max_sequential_stages_by_user` int NOT NULL DEFAULT 2,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `workflow_configuration_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `workflow_states` (
	`id` int AUTO_INCREMENT NOT NULL,
	`claim_id` int NOT NULL,
	`tenant_id` varchar(255) NOT NULL,
	`current_state` varchar(100) NOT NULL,
	`previous_state` varchar(100),
	`transitioned_by` int NOT NULL,
	`transitioned_at` timestamp NOT NULL DEFAULT (now()),
	`metadata` json,
	CONSTRAINT `workflow_states_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `workflow_templates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` varchar(255) NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`stages_json` text NOT NULL DEFAULT (JSON_ARRAY()),
	`applies_to_json` text DEFAULT (JSON_OBJECT()),
	`is_default` tinyint NOT NULL DEFAULT 0,
	`is_active` tinyint NOT NULL DEFAULT 1,
	`created_by` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `workflow_templates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `adjuster_sign_offs` ADD CONSTRAINT `adjuster_sign_offs_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `ai_assessments` ADD CONSTRAINT `ai_assessments_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `appointments` ADD CONSTRAINT `appointments_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `approval_workflow` ADD CONSTRAINT `approval_workflow_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `assessor_evaluations` ADD CONSTRAINT `assessor_evaluations_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `assessor_evaluations` ADD CONSTRAINT `assessor_evaluations_source_report_id_assessor_reports_id_fk` FOREIGN KEY (`source_report_id`) REFERENCES `assessor_reports`(`id`) ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `assessor_evaluations` ADD CONSTRAINT `assessor_evaluations_accepted_review_id_assessor_report_reviews_id_fk` FOREIGN KEY (`accepted_review_id`) REFERENCES `assessor_report_reviews`(`id`) ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `assessor_marketplace_reviews` ADD CONSTRAINT `assessor_marketplace_reviews_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `assessor_report_attachments` ADD CONSTRAINT `assessor_report_attachments_report_id_assessor_reports_id_fk` FOREIGN KEY (`report_id`) REFERENCES `assessor_reports`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `assessor_report_reviews` ADD CONSTRAINT `assessor_report_reviews_report_id_assessor_reports_id_fk` FOREIGN KEY (`report_id`) REFERENCES `assessor_reports`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `assessor_report_reviews` ADD CONSTRAINT `assessor_report_reviews_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `assessor_report_reviews` ADD CONSTRAINT `assessor_report_reviews_reviewer_user_id_users_id_fk` FOREIGN KEY (`reviewer_user_id`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `assessor_reports` ADD CONSTRAINT `assessor_reports_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `assessor_reports` ADD CONSTRAINT `assessor_reports_assessor_user_id_users_id_fk` FOREIGN KEY (`assessor_user_id`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `assessor_reports` ADD CONSTRAINT `assessor_reports_assignment_id_claim_assignments_id_fk` FOREIGN KEY (`assignment_id`) REFERENCES `claim_assignments`(`id`) ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `assessor_reports` ADD CONSTRAINT `assessor_reports_attested_by_user_id_users_id_fk` FOREIGN KEY (`attested_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `audit_trail` ADD CONSTRAINT `audit_trail_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `automation_audit_log` ADD CONSTRAINT `automation_audit_log_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `automation_audit_log` ADD CONSTRAINT `automation_audit_log_confidence_score_id_claim_confidence_scores_id_fk` FOREIGN KEY (`confidence_score_id`) REFERENCES `claim_confidence_scores`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `automation_audit_log` ADD CONSTRAINT `automation_audit_log_routing_decision_id_claim_routing_decisions_id_fk` FOREIGN KEY (`routing_decision_id`) REFERENCES `claim_routing_decisions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `automation_audit_log` ADD CONSTRAINT `automation_audit_log_automation_policy_id_automation_policies_id_fk` FOREIGN KEY (`automation_policy_id`) REFERENCES `automation_policies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `benchmark_deviations` ADD CONSTRAINT `benchmark_deviations_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `claim_approvals` ADD CONSTRAINT `claim_approvals_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `claim_assignments` ADD CONSTRAINT `claim_assignments_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `claim_assignments` ADD CONSTRAINT `claim_assignments_assigned_to_user_id_users_id_fk` FOREIGN KEY (`assigned_to_user_id`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `claim_assignments` ADD CONSTRAINT `claim_assignments_assigned_by_user_id_users_id_fk` FOREIGN KEY (`assigned_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `claim_comments` ADD CONSTRAINT `claim_comments_claimId_claims_id_fk` FOREIGN KEY (`claimId`) REFERENCES `claims`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `claim_comments` ADD CONSTRAINT `claim_comments_author_user_id_users_id_fk` FOREIGN KEY (`author_user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `claim_confidence_scores` ADD CONSTRAINT `claim_confidence_scores_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `claim_documents` ADD CONSTRAINT `claim_documents_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `claim_documents` ADD CONSTRAINT `claim_documents_inspection_id_inspections_id_fk` FOREIGN KEY (`inspection_id`) REFERENCES `inspections`(`id`) ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `claim_events` ADD CONSTRAINT `claim_events_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `claim_intake_requests` ADD CONSTRAINT `claim_intake_requests_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `claim_intelligence_dataset` ADD CONSTRAINT `claim_intelligence_dataset_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `claim_involvement_tracking` ADD CONSTRAINT `claim_involvement_tracking_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `claim_routing_decisions` ADD CONSTRAINT `claim_routing_decisions_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `claim_routing_decisions` ADD CONSTRAINT `claim_routing_decisions_confidence_score_id_claim_confidence_scores_id_fk` FOREIGN KEY (`confidence_score_id`) REFERENCES `claim_confidence_scores`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `claim_routing_decisions` ADD CONSTRAINT `claim_routing_decisions_automation_policy_id_automation_policies_id_fk` FOREIGN KEY (`automation_policy_id`) REFERENCES `automation_policies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `component_repair_outcomes` ADD CONSTRAINT `component_repair_outcomes_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `cost_learning_records` ADD CONSTRAINT `cost_learning_records_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `cross_claim_signals` ADD CONSTRAINT `cross_claim_signals_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `document_versions` ADD CONSTRAINT `document_versions_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `driver_claims` ADD CONSTRAINT `driver_claims_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `fast_track_routing_log` ADD CONSTRAINT `fast_track_routing_log_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `fraud_alerts` ADD CONSTRAINT `fraud_alerts_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `fraud_indicators` ADD CONSTRAINT `fraud_indicators_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `generated_reports` ADD CONSTRAINT `generated_reports_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `governance_notifications` ADD CONSTRAINT `governance_notifications_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `insurer_quote_requests` ADD CONSTRAINT `insurer_quote_requests_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `marketplace_transactions` ADD CONSTRAINT `marketplace_transactions_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `mismatch_annotations` ADD CONSTRAINT `mismatch_annotations_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `model_training_queue` ADD CONSTRAINT `model_training_queue_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `narrative_versions` ADD CONSTRAINT `narrative_versions_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `panel_beater_quotes` ADD CONSTRAINT `panel_beater_quotes_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `photo_reextraction_jobs` ADD CONSTRAINT `photo_reextraction_jobs_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `police_reports` ADD CONSTRAINT `police_reports_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `policy_claim_links` ADD CONSTRAINT `policy_claim_links_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `pre_accident_damage` ADD CONSTRAINT `pre_accident_damage_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `quote_optimisation_results` ADD CONSTRAINT `quote_optimisation_results_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `recovery_cases` ADD CONSTRAINT `recovery_cases_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `repair_history` ADD CONSTRAINT `repair_history_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `report_snapshots` ADD CONSTRAINT `report_snapshots_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `risk_register` ADD CONSTRAINT `risk_register_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `routing_history` ADD CONSTRAINT `routing_history_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `third_party_vehicles` ADD CONSTRAINT `third_party_vehicles_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `usage_events` ADD CONSTRAINT `usage_events_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `vehicle_condition_assessment` ADD CONSTRAINT `vehicle_condition_assessment_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `vehicle_damage_history` ADD CONSTRAINT `vehicle_damage_history_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `vehicle_geometry_measurements` ADD CONSTRAINT `fk_vgm_vehicle_model` FOREIGN KEY (`vehicle_model_id`) REFERENCES `vehicle_models`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vehicle_landmarks` ADD CONSTRAINT `vehicle_landmarks_vehicle_model_id_vehicle_models_id_fk` FOREIGN KEY (`vehicle_model_id`) REFERENCES `vehicle_models`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vehicle_market_valuations` ADD CONSTRAINT `vehicle_market_valuations_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `workflow_audit_trail` ADD CONSTRAINT `workflow_audit_trail_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `workflow_states` ADD CONSTRAINT `workflow_states_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX `idx_aso_claim_id` ON `adjuster_sign_offs` (`claim_id`);--> statement-breakpoint
CREATE INDEX `idx_aso_adjuster_user_id` ON `adjuster_sign_offs` (`adjuster_user_id`);--> statement-breakpoint
CREATE INDEX `idx_agency_assisted_claimant_insurer` ON `agency_assisted_claimant_identities` (`insurer_tenant_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_agency_clients_tenant` ON `agency_clients` (`agency_tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_agency_clients_id_number` ON `agency_clients` (`id_number`);--> statement-breakpoint
CREATE INDEX `idx_agency_clients_email` ON `agency_clients` (`email`);--> statement-breakpoint
CREATE INDEX `idx_agency_service_request_insurer_tenant` ON `agency_insurance_service_request_insurers` (`insurer_tenant_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_agency_insurance_service_request_tenant_status` ON `agency_insurance_service_requests` (`agency_tenant_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_agency_insurance_service_request_client` ON `agency_insurance_service_requests` (`agency_client_id`);--> statement-breakpoint
CREATE INDEX `idx_agency_insurance_service_request_vehicle` ON `agency_insurance_service_requests` (`vehicle_registry_id`);--> statement-breakpoint
CREATE INDEX `idx_agency_insurance_valuation_deviation_tenant` ON `agency_insurance_valuation_deviations` (`agency_tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_agency_product_commission_tenant` ON `agency_product_commission_configs` (`agency_tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_ai_assessments_claim_id` ON `ai_assessments` (`claim_id`);--> statement-breakpoint
CREATE INDEX `idx_ai_claim_confidence` ON `ai_assessments` (`claim_id`,`confidence_score`);--> statement-breakpoint
CREATE INDEX `idx_ai_tenant_fraud` ON `ai_assessments` (`tenant_id`,`fraud_risk_level`);--> statement-breakpoint
CREATE INDEX `idx_apl_claim` ON `ai_prediction_logs` (`historical_claim_id`);--> statement-breakpoint
CREATE INDEX `idx_apl_tenant` ON `ai_prediction_logs` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_aal_source_record` ON `anonymization_audit_log` (`source_record_id`);--> statement-breakpoint
CREATE INDEX `idx_aal_status` ON `anonymization_audit_log` (`status`);--> statement-breakpoint
CREATE INDEX `idx_aal_anonymized_at` ON `anonymization_audit_log` (`anonymized_at`);--> statement-breakpoint
CREATE INDEX `idx_evaluations_claim_id` ON `assessor_evaluations` (`claim_id`);--> statement-breakpoint
CREATE INDEX `idx_evaluations_assessor_id` ON `assessor_evaluations` (`assessor_id`);--> statement-breakpoint
CREATE INDEX `unique_assessor_tenant` ON `assessor_insurer_relationships` (`assessor_id`,`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_tenant` ON `assessor_insurer_relationships` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_type` ON `assessor_insurer_relationships` (`relationship_type`);--> statement-breakpoint
CREATE INDEX `idx_status` ON `assessor_insurer_relationships` (`relationship_status`);--> statement-breakpoint
CREATE INDEX `idx_preferred` ON `assessor_insurer_relationships` (`is_preferred_vendor`);--> statement-breakpoint
CREATE INDEX `unique_claim_review` ON `assessor_marketplace_reviews` (`claim_id`,`reviewer_user_id`);--> statement-breakpoint
CREATE INDEX `idx_assessor` ON `assessor_marketplace_reviews` (`assessor_id`);--> statement-breakpoint
CREATE INDEX `idx_rating` ON `assessor_marketplace_reviews` (`overall_rating`);--> statement-breakpoint
CREATE INDEX `idx_tenant` ON `assessor_marketplace_reviews` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_assessor_report_attachments_report` ON `assessor_report_attachments` (`report_id`);--> statement-breakpoint
CREATE INDEX `idx_assessor_report_attachments_tenant` ON `assessor_report_attachments` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_assessor_report_reviews_reviewer_state` ON `assessor_report_reviews` (`reviewer_user_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_assessor_report_reviews_claim_state` ON `assessor_report_reviews` (`claim_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_assessor_report_reviews_tenant_state` ON `assessor_report_reviews` (`tenant_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_assessor_reports_claim_state` ON `assessor_reports` (`claim_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_assessor_reports_assessor_state` ON `assessor_reports` (`assessor_user_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_assessor_reports_tenant_state` ON `assessor_reports` (`tenant_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_asub_profile` ON `assessor_subscriptions` (`marketplace_profile_id`);--> statement-breakpoint
CREATE INDEX `idx_asub_user` ON `assessor_subscriptions` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_asub_tier` ON `assessor_subscriptions` (`tier`);--> statement-breakpoint
CREATE INDEX `idx_type` ON `assessors` (`assessor_type`);--> statement-breakpoint
CREATE INDEX `idx_marketplace_status` ON `assessors` (`marketplace_status`);--> statement-breakpoint
CREATE INDEX `idx_primary_tenant` ON `assessors` (`primary_tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_performance` ON `assessors` (`performance_score`);--> statement-breakpoint
CREATE INDEX `idx_rating` ON `assessors` (`average_rating`);--> statement-breakpoint
CREATE INDEX `user_id` ON `assessors` (`user_id`);--> statement-breakpoint
CREATE INDEX `professional_license_number` ON `assessors` (`professional_license_number`);--> statement-breakpoint
CREATE INDEX `idx_ar_tenant` ON `asset_registry` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_ar_type` ON `asset_registry` (`asset_type`);--> statement-breakpoint
CREATE INDEX `idx_ar_vehicle_reg` ON `asset_registry` (`vehicle_registration`);--> statement-breakpoint
CREATE INDEX `idx_ar_owner` ON `asset_registry` (`owner_id`);--> statement-breakpoint
CREATE INDEX `idx_audit_claim_id` ON `audit_trail` (`claim_id`);--> statement-breakpoint
CREATE INDEX `idx_audit_user_id` ON `audit_trail` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_audit_created_at` ON `audit_trail` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_claim_id` ON `automation_audit_log` (`claim_id`);--> statement-breakpoint
CREATE INDEX `idx_tenant_id` ON `automation_audit_log` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_routed_workflow` ON `automation_audit_log` (`routed_workflow`);--> statement-breakpoint
CREATE INDEX `idx_composite_score` ON `automation_audit_log` (`composite_confidence_score`);--> statement-breakpoint
CREATE INDEX `idx_decision_made_at` ON `automation_audit_log` (`decision_made_at`);--> statement-breakpoint
CREATE INDEX `idx_was_overridden` ON `automation_audit_log` (`was_overridden`);--> statement-breakpoint
CREATE INDEX `idx_tenant_active` ON `automation_policies` (`tenant_id`,`is_active`);--> statement-breakpoint
CREATE INDEX `idx_policy_name` ON `automation_policies` (`policy_name`);--> statement-breakpoint
CREATE INDEX `idx_bmd_claim_id` ON `benchmark_deviations` (`claim_id`);--> statement-breakpoint
CREATE INDEX `idx_bmd_tenant_id` ON `benchmark_deviations` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_bmd_vehicle_class` ON `benchmark_deviations` (`vehicle_class`);--> statement-breakpoint
CREATE INDEX `idx_bmd_damage_type` ON `benchmark_deviations` (`damage_type`);--> statement-breakpoint
CREATE INDEX `idx_bmd_overall_flag` ON `benchmark_deviations` (`overall_deviation_flag`);--> statement-breakpoint
CREATE INDEX `idx_bmd_created_at` ON `benchmark_deviations` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_cal_tenant_jurisdiction` ON `calibration_overrides` (`tenant_id`,`jurisdiction`);--> statement-breakpoint
CREATE INDEX `idx_cal_status` ON `calibration_overrides` (`status`);--> statement-breakpoint
CREATE INDEX `idx_cal_scenario` ON `calibration_overrides` (`scenario_type`);--> statement-breakpoint
CREATE INDEX `idx_ca_claim_id` ON `claim_approvals` (`claim_id`);--> statement-breakpoint
CREATE INDEX `idx_ca_tenant_id` ON `claim_approvals` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_ca_stage_order` ON `claim_approvals` (`claim_id`,`stage_order`);--> statement-breakpoint
CREATE INDEX `idx_ca_role_key` ON `claim_approvals` (`role_key`);--> statement-breakpoint
CREATE INDEX `idx_ca_acted_at` ON `claim_approvals` (`acted_at`);--> statement-breakpoint
CREATE INDEX `idx_claim_assignments_claim_active` ON `claim_assignments` (`claim_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_claim_assignments_assignee_active` ON `claim_assignments` (`assigned_to_user_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_claim_assignments_tenant_role` ON `claim_assignments` (`tenant_id`,`assignment_role`,`status`);--> statement-breakpoint
CREATE INDEX `idx_claim_assignments_parent` ON `claim_assignments` (`parent_assignment_id`);--> statement-breakpoint
CREATE INDEX `idx_ccr_comment_id` ON `claim_comment_reads` (`comment_id`);--> statement-breakpoint
CREATE INDEX `idx_ccr_user_id` ON `claim_comment_reads` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_claim_id` ON `claim_confidence_scores` (`claim_id`);--> statement-breakpoint
CREATE INDEX `idx_tenant_id` ON `claim_confidence_scores` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_composite_score` ON `claim_confidence_scores` (`composite_confidence_score`);--> statement-breakpoint
CREATE INDEX `idx_scoring_timestamp` ON `claim_confidence_scores` (`scoring_timestamp`);--> statement-breakpoint
CREATE INDEX `idx_cdl_tenant` ON `claim_decision_lifecycle` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_cdl_state` ON `claim_decision_lifecycle` (`lifecycle_state`);--> statement-breakpoint
CREATE INDEX `idx_claim_id` ON `claim_documents` (`claim_id`);--> statement-breakpoint
CREATE INDEX `idx_uploaded_by` ON `claim_documents` (`uploaded_by`);--> statement-breakpoint
CREATE INDEX `idx_category` ON `claim_documents` (`document_category`);--> statement-breakpoint
CREATE INDEX `idx_cd_inspection_id` ON `claim_documents` (`inspection_id`);--> statement-breakpoint
CREATE INDEX `idx_ce_claim_id` ON `claim_events` (`claim_id`);--> statement-breakpoint
CREATE INDEX `idx_ce_event_type` ON `claim_events` (`event_type`);--> statement-breakpoint
CREATE INDEX `idx_ce_emitted_at` ON `claim_events` (`emitted_at`);--> statement-breakpoint
CREATE INDEX `claim_evidence_findings_tenant_claim_idx` ON `claim_evidence_findings` (`tenant_id`,`claim_id`);--> statement-breakpoint
CREATE INDEX `claim_evidence_findings_quote_idx` ON `claim_evidence_findings` (`quote_id`,`quote_line_item_id`);--> statement-breakpoint
CREATE INDEX `claim_evidence_findings_status_idx` ON `claim_evidence_findings` (`evidence_status`,`severity`);--> statement-breakpoint
CREATE INDEX `idx_claim_intake_request_claim` ON `claim_intake_requests` (`claim_id`);--> statement-breakpoint
CREATE INDEX `idx_claim_intake_request_tenant_status` ON `claim_intake_requests` (`tenant_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_cid_tenant_id` ON `claim_intelligence_dataset` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_cid_captured_at` ON `claim_intelligence_dataset` (`captured_at`);--> statement-breakpoint
CREATE INDEX `idx_cid_schema_version` ON `claim_intelligence_dataset` (`schema_version`);--> statement-breakpoint
CREATE INDEX `idx_data_scope` ON `claim_intelligence_dataset` (`data_scope`);--> statement-breakpoint
CREATE INDEX `idx_global_sharing` ON `claim_intelligence_dataset` (`global_sharing_enabled`);--> statement-breakpoint
CREATE INDEX `idx_anonymized_at` ON `claim_intelligence_dataset` (`anonymized_at`);--> statement-breakpoint
CREATE INDEX `idx_involvement_claim_user_stage` ON `claim_involvement_tracking` (`claim_id`,`user_id`,`workflow_stage`);--> statement-breakpoint
CREATE INDEX `idx_involvement_claim_user` ON `claim_involvement_tracking` (`claim_id`,`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `claim_review_queue_historical_claim_id_unique` ON `claim_review_queue` (`historical_claim_id`);--> statement-breakpoint
CREATE INDEX `idx_claim_id` ON `claim_routing_decisions` (`claim_id`);--> statement-breakpoint
CREATE INDEX `idx_tenant_id` ON `claim_routing_decisions` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_routed_workflow` ON `claim_routing_decisions` (`routed_workflow`);--> statement-breakpoint
CREATE INDEX `idx_decision_timestamp` ON `claim_routing_decisions` (`decision_timestamp`);--> statement-breakpoint
CREATE INDEX `claims_claim_number_unique` ON `claims` (`claim_number`);--> statement-breakpoint
CREATE INDEX `idx_claims_vehicle_registry_id` ON `claims` (`vehicle_registry_id`);--> statement-breakpoint
CREATE INDEX `idx_claims_claimant_id` ON `claims` (`claimant_id`);--> statement-breakpoint
CREATE INDEX `idx_claims_assigned_assessor_id` ON `claims` (`assigned_assessor_id`);--> statement-breakpoint
CREATE INDEX `idx_claims_status` ON `claims` (`status`);--> statement-breakpoint
CREATE INDEX `idx_claims_created_at` ON `claims` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_claims_tenant_workflow_created` ON `claims` (`tenant_id`,`workflow_state`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_fraud_risk_score` ON `claims` (`fraud_risk_score`);--> statement-breakpoint
CREATE INDEX `idx_confidence_score` ON `claims` (`confidence_score`);--> statement-breakpoint
CREATE INDEX `idx_routing_decision` ON `claims` (`routing_decision`);--> statement-breakpoint
CREATE INDEX `idx_policy_version_id` ON `claims` (`policy_version_id`);--> statement-breakpoint
CREATE INDEX `idx_claims_tenant_status` ON `claims` (`tenant_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_claims_tenant_created` ON `claims` (`tenant_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_claims_fleet_driver_id` ON `claims` (`fleet_driver_id`);--> statement-breakpoint
CREATE INDEX `client_insurance_service_request_number_idx` ON `client_insurance_service_requests` (`request_number`);--> statement-breakpoint
CREATE INDEX `client_insurance_service_user_idx` ON `client_insurance_service_requests` (`user_id`);--> statement-breakpoint
CREATE INDEX `client_valuation_request_number_idx` ON `client_vehicle_valuation_requests` (`request_number`);--> statement-breakpoint
CREATE INDEX `client_valuation_token_idx` ON `client_vehicle_valuation_requests` (`submission_token`);--> statement-breakpoint
CREATE INDEX `client_valuation_user_idx` ON `client_vehicle_valuation_requests` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_cb_component_make` ON `component_benchmarks` (`component_id`,`vehicle_make`);--> statement-breakpoint
CREATE INDEX `idx_cb_vehicle_precision` ON `component_benchmarks` (`component_id`,`vehicle_make`,`vehicle_model`,`year_band`);--> statement-breakpoint
CREATE INDEX `idx_cb_market_currency` ON `component_benchmarks` (`market_region`,`currency_code`,`evidence_quality`);--> statement-breakpoint
CREATE INDEX `idx_cb_component_id` ON `component_benchmarks` (`component_id`);--> statement-breakpoint
CREATE INDEX `idx_cro_claim_id` ON `component_repair_outcomes` (`claim_id`);--> statement-breakpoint
CREATE INDEX `idx_cro_component_severity` ON `component_repair_outcomes` (`component_name`,`severity_at_decision`);--> statement-breakpoint
CREATE INDEX `idx_cro_make_model` ON `component_repair_outcomes` (`vehicle_make`,`vehicle_model`);--> statement-breakpoint
CREATE INDEX `idx_cro_vehicle_precision` ON `component_repair_outcomes` (`component_name`,`vehicle_make`,`vehicle_model`,`vehicle_year`);--> statement-breakpoint
CREATE INDEX `idx_cro_market_currency` ON `component_repair_outcomes` (`market_region`,`currency_code`,`evidence_quality`);--> statement-breakpoint
CREATE INDEX `idx_cro_outcome` ON `component_repair_outcomes` (`outcome`);--> statement-breakpoint
CREATE INDEX `idx_cc_claim` ON `cost_components` (`historical_claim_id`);--> statement-breakpoint
CREATE INDEX `idx_clr_claim_id` ON `cost_learning_records` (`claim_id`);--> statement-breakpoint
CREATE INDEX `idx_clr_tenant_id` ON `cost_learning_records` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_clr_case_signature` ON `cost_learning_records` (`case_signature`);--> statement-breakpoint
CREATE INDEX `idx_clr_vehicle_descriptor` ON `cost_learning_records` (`vehicle_descriptor`);--> statement-breakpoint
CREATE INDEX `idx_clr_vehicle_precision` ON `cost_learning_records` (`vehicle_make`,`vehicle_model`,`vehicle_year`);--> statement-breakpoint
CREATE INDEX `idx_clr_market_currency` ON `cost_learning_records` (`market_region`,`currency`);--> statement-breakpoint
CREATE INDEX `idx_clr_collision_direction` ON `cost_learning_records` (`collision_direction`);--> statement-breakpoint
CREATE INDEX `idx_clr_recorded_at` ON `cost_learning_records` (`recorded_at`);--> statement-breakpoint
CREATE INDEX `idx_cri_country` ON `country_repair_index` (`country_code`);--> statement-breakpoint
CREATE INDEX `idx_cri_effective` ON `country_repair_index` (`effective_from`);--> statement-breakpoint
CREATE INDEX `idx_ccs_claim_id` ON `cross_claim_signals` (`claim_id`);--> statement-breakpoint
CREATE INDEX `idx_ccs_signal_type` ON `cross_claim_signals` (`signal_type`);--> statement-breakpoint
CREATE INDEX `idx_ccs_confidence` ON `cross_claim_signals` (`confidence`);--> statement-breakpoint
CREATE INDEX `idx_ccs_dismissed` ON `cross_claim_signals` (`is_dismissed`);--> statement-breakpoint
CREATE INDEX `idx_ccs_tenant` ON `cross_claim_signals` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `currency_exchange_rates_currency_code_unique` ON `currency_exchange_rates` (`currency_code`);--> statement-breakpoint
CREATE INDEX `idx_dag_tenant_id` ON `dataset_access_grants` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_dag_data_scope` ON `dataset_access_grants` (`data_scope`);--> statement-breakpoint
CREATE INDEX `idx_dag_granted_to_user` ON `dataset_access_grants` (`granted_to_user_id`);--> statement-breakpoint
CREATE INDEX `idx_dag_expiry_date` ON `dataset_access_grants` (`expiry_date`);--> statement-breakpoint
CREATE INDEX `idx_ds_claim` ON `decision_snapshots` (`claim_id`);--> statement-breakpoint
CREATE INDEX `idx_ds_tenant` ON `decision_snapshots` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_ds_created` ON `decision_snapshots` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_ds_verdict` ON `decision_snapshots` (`verdict_decision`);--> statement-breakpoint
CREATE INDEX `idx_ds_lifecycle` ON `decision_snapshots` (`lifecycle_state`);--> statement-breakpoint
CREATE INDEX `document_naming_templates_tenant_id_doc_type_unique` ON `document_naming_templates` (`tenant_id`,`doc_type`);--> statement-breakpoint
CREATE INDEX `document_versions_claim_id_doc_type_version_unique` ON `document_versions` (`claim_id`,`doc_type`,`version`);--> statement-breakpoint
CREATE INDEX `idx_document_versions_claim_id` ON `document_versions` (`claim_id`);--> statement-breakpoint
CREATE INDEX `idx_document_versions_tenant_id` ON `document_versions` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_dc_driver_id` ON `driver_claims` (`driver_id`);--> statement-breakpoint
CREATE INDEX `idx_dc_claim_id` ON `driver_claims` (`claim_id`);--> statement-breakpoint
CREATE INDEX `idx_dc_role` ON `driver_claims` (`role`);--> statement-breakpoint
CREATE INDEX `idx_dc_tenant` ON `driver_claims` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_drivers_full_name` ON `drivers` (`full_name`);--> statement-breakpoint
CREATE INDEX `idx_drivers_email` ON `drivers` (`email`);--> statement-breakpoint
CREATE INDEX `idx_drivers_phone` ON `drivers` (`phone`);--> statement-breakpoint
CREATE INDEX `idx_drivers_national_id` ON `drivers` (`national_id_number`);--> statement-breakpoint
CREATE INDEX `idx_drivers_tenant` ON `drivers` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_drivers_risk_score` ON `drivers` (`driver_risk_score`);--> statement-breakpoint
CREATE INDEX `idx_drivers_repeat_claimer` ON `drivers` (`is_repeat_claimer`);--> statement-breakpoint
CREATE INDEX `token` ON `email_verification_tokens` (`token`);--> statement-breakpoint
CREATE INDEX `idx_eo_inspection` ON `engineer_observations` (`inspection_id`);--> statement-breakpoint
CREATE INDEX `idx_eo_tenant` ON `engineer_observations` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_eo_type` ON `engineer_observations` (`observation_type`);--> statement-breakpoint
CREATE INDEX `idx_eo_severity` ON `engineer_observations` (`severity`);--> statement-breakpoint
CREATE INDEX `idx_eo_authored_by` ON `engineer_observations` (`authored_by`);--> statement-breakpoint
CREATE INDEX `idx_ep_tenant` ON `engineer_profiles` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_ep_region` ON `engineer_profiles` (`region`);--> statement-breakpoint
CREATE INDEX `idx_ep_available` ON `engineer_profiles` (`is_available`);--> statement-breakpoint
CREATE INDEX `idx_eri_claim` ON `extracted_repair_items` (`historical_claim_id`);--> statement-breakpoint
CREATE INDEX `idx_ft_config_tenant` ON `fast_track_config` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_ft_config_product` ON `fast_track_config` (`product_id`);--> statement-breakpoint
CREATE INDEX `idx_ft_config_claim_type` ON `fast_track_config` (`claim_type`);--> statement-breakpoint
CREATE INDEX `idx_ft_config_enabled` ON `fast_track_config` (`enabled`);--> statement-breakpoint
CREATE INDEX `idx_ft_config_effective` ON `fast_track_config` (`effective_from`);--> statement-breakpoint
CREATE INDEX `idx_ft_config_hierarchy` ON `fast_track_config` (`tenant_id`,`product_id`,`claim_type`);--> statement-breakpoint
CREATE INDEX `idx_ft_log_claim` ON `fast_track_routing_log` (`claim_id`);--> statement-breakpoint
CREATE INDEX `idx_ft_log_tenant` ON `fast_track_routing_log` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_ft_log_config` ON `fast_track_routing_log` (`config_id`);--> statement-breakpoint
CREATE INDEX `idx_ft_log_decision` ON `fast_track_routing_log` (`decision`);--> statement-breakpoint
CREATE INDEX `idx_ft_log_evaluated` ON `fast_track_routing_log` (`evaluated_at`);--> statement-breakpoint
CREATE INDEX `idx_ft_log_claim_tenant` ON `fast_track_routing_log` (`claim_id`,`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_flm_round_number` ON `federated_learning_metadata` (`round_number`);--> statement-breakpoint
CREATE INDEX `idx_flm_model_type` ON `federated_learning_metadata` (`model_type`);--> statement-breakpoint
CREATE INDEX `idx_flm_training_started` ON `federated_learning_metadata` (`training_started_at`);--> statement-breakpoint
CREATE INDEX `historical_claim_id` ON `final_approval_records` (`historical_claim_id`);--> statement-breakpoint
CREATE INDEX `idx_fleet_accounts_owner` ON `fleet_accounts` (`owner_user_id`);--> statement-breakpoint
CREATE INDEX `idx_fleet_accounts_insurer` ON `fleet_accounts` (`linked_insurer_tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_fleet_accounts_agency` ON `fleet_accounts` (`linked_agency_id`);--> statement-breakpoint
CREATE INDEX `idx_fleet_accounts_status` ON `fleet_accounts` (`status`);--> statement-breakpoint
CREATE INDEX `idx_fleet_drivers_tenant_id` ON `fleet_drivers` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_fleet_drivers_fleet_id` ON `fleet_drivers` (`fleet_id`);--> statement-breakpoint
CREATE INDEX `idx_fleet_drivers_user_id` ON `fleet_drivers` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_fleet_incident_reports_tenant_id` ON `fleet_incident_reports` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_fleet_incident_reports_fleet_id` ON `fleet_incident_reports` (`fleet_id`);--> statement-breakpoint
CREATE INDEX `idx_fleet_incident_reports_vehicle_id` ON `fleet_incident_reports` (`vehicle_id`);--> statement-breakpoint
CREATE INDEX `idx_fleet_incident_reports_driver_id` ON `fleet_incident_reports` (`driver_id`);--> statement-breakpoint
CREATE INDEX `idx_fleet_incident_reports_status` ON `fleet_incident_reports` (`status`);--> statement-breakpoint
CREATE INDEX `idx_fis_fleet_id` ON `fleet_intelligence_snapshots` (`fleet_id`);--> statement-breakpoint
CREATE INDEX `idx_fis_tenant_id` ON `fleet_intelligence_snapshots` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_fis_generated_at` ON `fleet_intelligence_snapshots` (`generated_at`);--> statement-breakpoint
CREATE INDEX `idx_fmr_user_id` ON `fleet_manager_requests` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_fmr_fleet_account_id` ON `fleet_manager_requests` (`fleet_account_id`);--> statement-breakpoint
CREATE INDEX `idx_fmr_status` ON `fleet_manager_requests` (`status`);--> statement-breakpoint
CREATE INDEX `idx_fmr_created_at` ON `fleet_manager_requests` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_fleet_rfq_instruction_agency_status` ON `fleet_rfq_client_instructions` (`agency_tenant_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_fleet_rfq_instruction_fleet` ON `fleet_rfq_client_instructions` (`fleet_account_id`);--> statement-breakpoint
CREATE INDEX `fleet_risk_scores_vehicle_id_unique` ON `fleet_risk_scores` (`vehicle_id`);--> statement-breakpoint
CREATE INDEX `fleet_vehicles_vin_unique` ON `fleet_vehicles` (`vin`);--> statement-breakpoint
CREATE INDEX `fleet_vehicles_registration_number_unique` ON `fleet_vehicles` (`registration_number`);--> statement-breakpoint
CREATE INDEX `rule_name` ON `fraud_rules` (`rule_name`);--> statement-breakpoint
CREATE INDEX `idx_gr_tenant_id` ON `generated_reports` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_gr_claim_id` ON `generated_reports` (`claim_id`);--> statement-breakpoint
CREATE INDEX `idx_gr_report_type` ON `generated_reports` (`report_type`);--> statement-breakpoint
CREATE INDEX `idx_gr_generated_by` ON `generated_reports` (`generated_by_user_id`);--> statement-breakpoint
CREATE INDEX `idx_gr_created_at` ON `generated_reports` (`created_at`);--> statement-breakpoint
CREATE INDEX `anonymous_record_id` ON `global_anonymized_dataset` (`anonymous_record_id`);--> statement-breakpoint
CREATE INDEX `idx_gad_capture_month` ON `global_anonymized_dataset` (`capture_month`);--> statement-breakpoint
CREATE INDEX `idx_gad_vehicle_make` ON `global_anonymized_dataset` (`vehicle_make`);--> statement-breakpoint
CREATE INDEX `idx_gad_province` ON `global_anonymized_dataset` (`province`);--> statement-breakpoint
CREATE INDEX `idx_gad_accident_type` ON `global_anonymized_dataset` (`accident_type`);--> statement-breakpoint
CREATE INDEX `idx_gad_anonymized_at` ON `global_anonymized_dataset` (`anonymized_at`);--> statement-breakpoint
CREATE INDEX `idx_gsa_tenant_id` ON `global_search_analytics` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_gsa_searched_at` ON `global_search_analytics` (`searched_at`);--> statement-breakpoint
CREATE INDEX `idx_gsa_query` ON `global_search_analytics` (`query`);--> statement-breakpoint
CREATE INDEX `idx_gsh_user_id` ON `global_search_history` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_gsh_tenant_id` ON `global_search_history` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_gsh_searched_at` ON `global_search_history` (`searched_at`);--> statement-breakpoint
CREATE INDEX `idx_gal_claim` ON `governance_audit_log` (`claim_id`);--> statement-breakpoint
CREATE INDEX `idx_gal_tenant` ON `governance_audit_log` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_gal_action` ON `governance_audit_log` (`action`);--> statement-breakpoint
CREATE INDEX `idx_gal_timestamp` ON `governance_audit_log` (`timestamp_ms`);--> statement-breakpoint
CREATE INDEX `idx_gal_override` ON `governance_audit_log` (`override_flag`);--> statement-breakpoint
CREATE INDEX `idx_tenant_id` ON `governance_notifications` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_claim_id` ON `governance_notifications` (`claim_id`);--> statement-breakpoint
CREATE INDEX `idx_read_at` ON `governance_notifications` (`read_at`);--> statement-breakpoint
CREATE INDEX `idx_created_at` ON `governance_notifications` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_gov_violation_tenant` ON `governance_violation_log` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_gov_violation_user` ON `governance_violation_log` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_gov_violation_type` ON `governance_violation_log` (`violation_type`);--> statement-breakpoint
CREATE INDEX `idx_gov_violation_at` ON `governance_violation_log` (`violated_at`);--> statement-breakpoint
CREATE INDEX `idx_gov_violation_tenant_time` ON `governance_violation_log` (`tenant_id`,`violated_at`);--> statement-breakpoint
CREATE INDEX `idx_hc_tenant` ON `historical_claims` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_hc_batch` ON `historical_claims` (`batch_id`);--> statement-breakpoint
CREATE INDEX `idx_hc_status` ON `historical_claims` (`pipeline_status`);--> statement-breakpoint
CREATE INDEX `idx_historical_replay_results_tenant_id` ON `historical_replay_results` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_historical_replay_results_historical_claim_id` ON `historical_replay_results` (`historical_claim_id`);--> statement-breakpoint
CREATE INDEX `idx_historical_replay_results_replayed_at` ON `historical_replay_results` (`replayed_at`);--> statement-breakpoint
CREATE INDEX `idx_historical_replay_results_policy_version_id` ON `historical_replay_results` (`policy_version_id`);--> statement-breakpoint
CREATE INDEX `document_id` ON `ingestion_documents` (`document_id`);--> statement-breakpoint
CREATE INDEX `idx_inspections_tenant` ON `inspections` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_inspections_claim` ON `inspections` (`claim_id`);--> statement-breakpoint
CREATE INDEX `idx_inspections_project` ON `inspections` (`project_id`);--> statement-breakpoint
CREATE INDEX `idx_inspections_engineer` ON `inspections` (`assigned_engineer_id`);--> statement-breakpoint
CREATE INDEX `idx_inspections_asset` ON `inspections` (`asset_registry_id`);--> statement-breakpoint
CREATE INDEX `idx_inspections_vehicle` ON `inspections` (`vehicle_registration`);--> statement-breakpoint
CREATE INDEX `idx_inspections_status` ON `inspections` (`status`);--> statement-breakpoint
CREATE INDEX `insurance_carriers_short_code_unique` ON `insurance_carriers` (`short_code`);--> statement-breakpoint
CREATE INDEX `insurance_policies_policy_number_unique` ON `insurance_policies` (`policy_number`);--> statement-breakpoint
CREATE INDEX `insurance_quotes_quote_number_unique` ON `insurance_quotes` (`quote_number`);--> statement-breakpoint
CREATE INDEX `idx_insurer_marketplace_links_tenant` ON `insurer_marketplace_links` (`insurer_tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_insurer_marketplace_links_profile` ON `insurer_marketplace_links` (`marketplace_profile_id`);--> statement-breakpoint
CREATE INDEX `idx_imr_tenant` ON `insurer_marketplace_relationships` (`insurer_tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_imr_profile` ON `insurer_marketplace_relationships` (`marketplace_profile_id`);--> statement-breakpoint
CREATE INDEX `idx_imr_status` ON `insurer_marketplace_relationships` (`relationship_status`);--> statement-breakpoint
CREATE INDEX `idx_iqr_claim_id` ON `insurer_quote_requests` (`claim_id`);--> statement-breakpoint
CREATE INDEX `idx_iqr_insurer_tenant` ON `insurer_quote_requests` (`insurer_tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_iqr_agency_tenant` ON `insurer_quote_requests` (`agency_tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_iqr_status` ON `insurer_quote_requests` (`status`);--> statement-breakpoint
CREATE INDEX `idx_iso_audit_logs_tenant_id` ON `iso_audit_logs` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_iso_audit_logs_user_id` ON `iso_audit_logs` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_iso_audit_logs_timestamp` ON `iso_audit_logs` (`timestamp`);--> statement-breakpoint
CREATE INDEX `idx_marketplace_profiles_type` ON `marketplace_profiles` (`type`);--> statement-breakpoint
CREATE INDEX `idx_marketplace_profiles_approval_status` ON `marketplace_profiles` (`approval_status`);--> statement-breakpoint
CREATE INDEX `idx_marketplace_profiles_country_id` ON `marketplace_profiles` (`country_id`);--> statement-breakpoint
CREATE INDEX `idx_assignment` ON `marketplace_transactions` (`assignment_id`);--> statement-breakpoint
CREATE INDEX `idx_assessor` ON `marketplace_transactions` (`assessor_id`);--> statement-breakpoint
CREATE INDEX `idx_tenant` ON `marketplace_transactions` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_status` ON `marketplace_transactions` (`transaction_status`);--> statement-breakpoint
CREATE INDEX `idx_ma_claim` ON `mismatch_annotations` (`claim_id`);--> statement-breakpoint
CREATE INDEX `idx_ma_type` ON `mismatch_annotations` (`mismatch_type`);--> statement-breakpoint
CREATE INDEX `idx_ma_user` ON `mismatch_annotations` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_ma_action` ON `mismatch_annotations` (`action`);--> statement-breakpoint
CREATE INDEX `idx_mtq_processed` ON `model_training_queue` (`processed`);--> statement-breakpoint
CREATE INDEX `idx_mtq_training_priority` ON `model_training_queue` (`training_priority`);--> statement-breakpoint
CREATE INDEX `idx_mtq_created_at` ON `model_training_queue` (`created_at`);--> statement-breakpoint
CREATE INDEX `model_version_registry_model_version_unique` ON `model_version_registry` (`model_version`);--> statement-breakpoint
CREATE INDEX `idx_nv_claim` ON `narrative_versions` (`claim_id`);--> statement-breakpoint
CREATE INDEX `idx_nv_assessment` ON `narrative_versions` (`assessment_id`);--> statement-breakpoint
CREATE INDEX `idx_nv_type` ON `narrative_versions` (`mismatch_type`);--> statement-breakpoint
CREATE INDEX `idx_nv_active` ON `narrative_versions` (`is_active`);--> statement-breakpoint
CREATE INDEX `idx_ne_idempotency_key` ON `notification_events` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `idx_ne_recipient` ON `notification_events` (`recipient_user_id`);--> statement-breakpoint
CREATE INDEX `idx_ne_event_type` ON `notification_events` (`event_type`);--> statement-breakpoint
CREATE INDEX `idx_ne_created_at` ON `notification_events` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_notif_pref_user` ON `notification_preferences` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_notif_pref_tenant` ON `notification_preferences` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_quotes_claim_id` ON `panel_beater_quotes` (`claim_id`);--> statement-breakpoint
CREATE INDEX `idx_quotes_panel_beater_id` ON `panel_beater_quotes` (`panel_beater_id`);--> statement-breakpoint
CREATE INDEX `idx_panel_beater_quotes_panel_beater_id` ON `panel_beater_quotes` (`panel_beater_id`);--> statement-breakpoint
CREATE INDEX `idx_snapshot_id` ON `pdf_reports` (`snapshot_id`);--> statement-breakpoint
CREATE INDEX `idx_tenant_id` ON `pdf_reports` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `personal_vehicles_user_id` ON `personal_vehicles` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_prerj_assessment_id` ON `photo_reextraction_jobs` (`assessment_id`);--> statement-breakpoint
CREATE INDEX `idx_prerj_claim_id` ON `photo_reextraction_jobs` (`claim_id`);--> statement-breakpoint
CREATE INDEX `idx_prerj_status` ON `photo_reextraction_jobs` (`status`);--> statement-breakpoint
CREATE INDEX `idx_pm_inspection` ON `physical_measurements` (`inspection_id`);--> statement-breakpoint
CREATE INDEX `idx_pm_tenant` ON `physical_measurements` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_pm_category` ON `physical_measurements` (`measurement_category`);--> statement-breakpoint
CREATE INDEX `idx_pm_captured_by` ON `physical_measurements` (`captured_by`);--> statement-breakpoint
CREATE INDEX `idx_pm_captured_at` ON `physical_measurements` (`captured_at`);--> statement-breakpoint
CREATE INDEX `idx_pj_claim_id` ON `pipeline_jobs` (`claim_id`);--> statement-breakpoint
CREATE INDEX `idx_pj_run_id` ON `pipeline_jobs` (`run_id`);--> statement-breakpoint
CREATE INDEX `idx_pj_stage_id` ON `pipeline_jobs` (`stage_id`);--> statement-breakpoint
CREATE INDEX `idx_pj_status` ON `pipeline_jobs` (`status`);--> statement-breakpoint
CREATE INDEX `idx_pr_claim_id` ON `pipeline_runs` (`claim_id`);--> statement-breakpoint
CREATE INDEX `idx_pr_run_id` ON `pipeline_runs` (`run_id`);--> statement-breakpoint
CREATE INDEX `idx_pr_status` ON `pipeline_runs` (`status`);--> statement-breakpoint
CREATE INDEX `idx_pr_started_at` ON `pipeline_runs` (`started_at`);--> statement-breakpoint
CREATE INDEX `idx_gov_limits_version` ON `platform_governance_limits` (`version`);--> statement-breakpoint
CREATE INDEX `idx_gov_limits_effective` ON `platform_governance_limits` (`effective_from`);--> statement-breakpoint
CREATE INDEX `policy_endorsements_endorsement_number_unique` ON `policy_endorsements` (`endorsement_number`);--> statement-breakpoint
CREATE INDEX `idx_prs_entity` ON `predictive_risk_scores` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `idx_prs_tenant_id` ON `predictive_risk_scores` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_prs_score_type` ON `predictive_risk_scores` (`score_type`);--> statement-breakpoint
CREATE INDEX `idx_prs_valid_from` ON `predictive_risk_scores` (`valid_from`);--> statement-breakpoint
CREATE INDEX `idx_quality_metrics_tenant_id` ON `quality_metrics` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `qrd_quotation_request_id` ON `quotation_request_documents` (`quotation_request_id`);--> statement-breakpoint
CREATE INDEX `qrd_client_user_id` ON `quotation_request_documents` (`client_user_id`);--> statement-breakpoint
CREATE INDEX `request_number` ON `quotation_requests` (`request_number`);--> statement-breakpoint
CREATE INDEX `quote_evidence_gaps_tenant_claim_idx` ON `quote_evidence_gaps` (`tenant_id`,`claim_id`);--> statement-breakpoint
CREATE INDEX `quote_evidence_gaps_quote_idx` ON `quote_evidence_gaps` (`quote_id`,`quote_line_item_id`);--> statement-breakpoint
CREATE INDEX `quote_evidence_gaps_source_idx` ON `quote_evidence_gaps` (`source_document_id`,`source_page`);--> statement-breakpoint
CREATE INDEX `quote_evidence_gaps_resolution_idx` ON `quote_evidence_gaps` (`resolution_status`);--> statement-breakpoint
CREATE INDEX `quote_evidence_ledger_tenant_claim_idx` ON `quote_evidence_ledger` (`tenant_id`,`claim_id`);--> statement-breakpoint
CREATE INDEX `quote_evidence_ledger_quote_idx` ON `quote_evidence_ledger` (`quote_id`,`quote_line_item_id`);--> statement-breakpoint
CREATE INDEX `quote_evidence_ledger_source_idx` ON `quote_evidence_ledger` (`source_document_id`,`source_page`);--> statement-breakpoint
CREATE INDEX `quote_evidence_ledger_scope_status_idx` ON `quote_evidence_ledger` (`scope_fingerprint`,`evidence_status`);--> statement-breakpoint
CREATE INDEX `idx_qor_claim_id` ON `quote_optimisation_results` (`claim_id`);--> statement-breakpoint
CREATE INDEX `idx_qor_status` ON `quote_optimisation_results` (`status`);--> statement-breakpoint
CREATE INDEX `idx_qor_risk` ON `quote_optimisation_results` (`overall_risk_score`);--> statement-breakpoint
CREATE INDEX `idx_user_tenant_action_window` ON `rate_limit_tracking` (`user_id`,`tenant_id`,`action_type`,`window_start`);--> statement-breakpoint
CREATE INDEX `idx_window_start` ON `rate_limit_tracking` (`window_start`);--> statement-breakpoint
CREATE INDEX `idx_rc_tenant_id` ON `recovery_cases` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_rc_claim_id` ON `recovery_cases` (`claim_id`);--> statement-breakpoint
CREATE INDEX `idx_rc_status` ON `recovery_cases` (`status`);--> statement-breakpoint
CREATE INDEX `idx_rc_tenant_status` ON `recovery_cases` (`tenant_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_rc_assigned_officer` ON `recovery_cases` (`assigned_officer_user_id`);--> statement-breakpoint
CREATE INDEX `idx_rc_rps` ON `recovery_cases` (`recovery_potential_score`);--> statement-breakpoint
CREATE INDEX `idx_rc_recovery_deadline` ON `recovery_cases` (`recovery_deadline`);--> statement-breakpoint
CREATE INDEX `idx_rcl_case_id` ON `recovery_correspondence_log` (`recovery_case_id`);--> statement-breakpoint
CREATE INDEX `idx_rcl_tenant_id` ON `recovery_correspondence_log` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_rcl_created_at` ON `recovery_correspondence_log` (`created_at`);--> statement-breakpoint
CREATE INDEX `reference_dataset_historical_claim_id_unique` ON `reference_dataset` (`historical_claim_id`);--> statement-breakpoint
CREATE INDEX `regional_pricing_multipliers_country_unique` ON `regional_pricing_multipliers` (`country`);--> statement-breakpoint
CREATE INDEX `idx_rci_make_model` ON `repair_cost_intelligence` (`vehicle_make`,`vehicle_model`);--> statement-breakpoint
CREATE INDEX `idx_rci_damage_category` ON `repair_cost_intelligence` (`damage_category`);--> statement-breakpoint
CREATE INDEX `idx_rci_country` ON `repair_cost_intelligence` (`country`);--> statement-breakpoint
CREATE INDEX `idx_rh_repairer_id` ON `repair_history` (`repairer_id`);--> statement-breakpoint
CREATE INDEX `idx_rh_vehicle_id` ON `repair_history` (`vehicle_id`);--> statement-breakpoint
CREATE INDEX `idx_rh_claim_id` ON `repair_history` (`claim_id`);--> statement-breakpoint
CREATE INDEX `idx_rh_repair_date` ON `repair_history` (`repair_date`);--> statement-breakpoint
CREATE INDEX `idx_rh_quality_score` ON `repair_history` (`repair_quality_score`);--> statement-breakpoint
CREATE INDEX `idx_rh_repeat_damage` ON `repair_history` (`repeat_damage_within_12_months`);--> statement-breakpoint
CREATE INDEX `idx_rh_warranty_repair` ON `repair_history` (`is_warranty_repair`);--> statement-breakpoint
CREATE INDEX `idx_rh_fraud_flagged` ON `repair_history` (`is_fraud_flagged`);--> statement-breakpoint
CREATE INDEX `idx_rh_tenant` ON `repair_history` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_rl_claim` ON `replay_logs` (`claim_id`);--> statement-breakpoint
CREATE INDEX `idx_rl_tenant` ON `replay_logs` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_rl_replayed_at` ON `replay_logs` (`replayed_at`);--> statement-breakpoint
CREATE INDEX `idx_rl_changed` ON `replay_logs` (`changed`);--> statement-breakpoint
CREATE INDEX `idx_report_id` ON `report_access_audit` (`report_id`);--> statement-breakpoint
CREATE INDEX `idx_accessed_by` ON `report_access_audit` (`accessed_by`);--> statement-breakpoint
CREATE INDEX `idx_tenant_id` ON `report_access_audit` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_accessed_at` ON `report_access_audit` (`accessed_at`);--> statement-breakpoint
CREATE INDEX `idx_snapshot_id` ON `report_links` (`snapshot_id`);--> statement-breakpoint
CREATE INDEX `idx_access_token` ON `report_links` (`access_token`);--> statement-breakpoint
CREATE INDEX `idx_tenant_id` ON `report_links` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `report_provenance_snapshots_tenant_claim_idx` ON `report_provenance_snapshots` (`tenant_id`,`claim_id`);--> statement-breakpoint
CREATE INDEX `report_provenance_snapshots_hash_idx` ON `report_provenance_snapshots` (`input_hash`);--> statement-breakpoint
CREATE INDEX `idx_claim_version` ON `report_snapshots` (`claim_id`,`version`);--> statement-breakpoint
CREATE INDEX `idx_audit_hash` ON `report_snapshots` (`audit_hash`);--> statement-breakpoint
CREATE INDEX `idx_tenant_id` ON `report_snapshots` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_generated_by` ON `report_snapshots` (`generated_by`);--> statement-breakpoint
CREATE INDEX `idx_risk_register_claim_id` ON `risk_register` (`claim_id`);--> statement-breakpoint
CREATE INDEX `idx_risk_register_tenant_id` ON `risk_register` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_tenant_id` ON `role_assignment_audit` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_user_id` ON `role_assignment_audit` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_changed_by` ON `role_assignment_audit` (`changed_by_user_id`);--> statement-breakpoint
CREATE INDEX `idx_timestamp` ON `role_assignment_audit` (`timestamp`);--> statement-breakpoint
CREATE INDEX `idx_role_audit_user_time` ON `role_assignment_audit` (`user_id`,`timestamp`);--> statement-breakpoint
CREATE INDEX `idx_role_audit_tenant_time` ON `role_assignment_audit` (`tenant_id`,`timestamp`);--> statement-breakpoint
CREATE INDEX `idx_routing_claim_id` ON `routing_history` (`claim_id`);--> statement-breakpoint
CREATE INDEX `idx_routing_tenant_id` ON `routing_history` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_routing_timestamp` ON `routing_history` (`timestamp`);--> statement-breakpoint
CREATE INDEX `idx_routing_claim_tenant` ON `routing_history` (`claim_id`,`tenant_id`);--> statement-breakpoint
CREATE INDEX `unique_threshold_tenant_version` ON `routing_threshold_config` (`tenant_id`,`version`);--> statement-breakpoint
CREATE INDEX `idx_threshold_tenant_id` ON `routing_threshold_config` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_threshold_active` ON `routing_threshold_config` (`is_active`);--> statement-breakpoint
CREATE INDEX `idx_threshold_tenant_active` ON `routing_threshold_config` (`tenant_id`,`is_active`);--> statement-breakpoint
CREATE INDEX `idx_som_user` ON `shadow_override_monitor` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_som_tenant` ON `shadow_override_monitor` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_som_scanned` ON `shadow_override_monitor` (`last_scanned_at`);--> statement-breakpoint
CREATE INDEX `idx_som_activity` ON `shadow_override_monitor` (`override_activity_detected`);--> statement-breakpoint
CREATE INDEX `idx_super_audit_sessions_super_admin_user_id` ON `super_audit_sessions` (`super_admin_user_id`);--> statement-breakpoint
CREATE INDEX `idx_super_audit_sessions_audited_tenant_id` ON `super_audit_sessions` (`audited_tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_super_audit_sessions_session_started_at` ON `super_audit_sessions` (`session_started_at`);--> statement-breakpoint
CREATE INDEX `supplier_performance_metrics_supplier_name_unique` ON `supplier_performance_metrics` (`supplier_name`);--> statement-breakpoint
CREATE INDEX `idx_se_procedure` ON `system_errors` (`procedure_name`);--> statement-breakpoint
CREATE INDEX `idx_se_user_id` ON `system_errors` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_se_occurred_at` ON `system_errors` (`occurred_at`);--> statement-breakpoint
CREATE INDEX `idx_se_error_code` ON `system_errors` (`error_code`);--> statement-breakpoint
CREATE INDEX `tenant_id_idx` ON `tenant_invitations` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `email_idx` ON `tenant_invitations` (`email`);--> statement-breakpoint
CREATE INDEX `expires_at_idx` ON `tenant_invitations` (`expires_at`);--> statement-breakpoint
CREATE INDEX `idx_tiv_user_id` ON `tenant_isolation_violations` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_tiv_user_tenant` ON `tenant_isolation_violations` (`user_tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_tiv_occurred_at` ON `tenant_isolation_violations` (`occurred_at`);--> statement-breakpoint
CREATE INDEX `idx_tiv_procedure` ON `tenant_isolation_violations` (`procedure_name`);--> statement-breakpoint
CREATE INDEX `tenant_id` ON `tenant_workflow_configs` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_tenants_name` ON `tenants` (`name`);--> statement-breakpoint
CREATE INDEX `idx_tenants_status` ON `tenants` (`status`);--> statement-breakpoint
CREATE INDEX `training_data_scores_historical_claim_id_unique` ON `training_data_scores` (`historical_claim_id`);--> statement-breakpoint
CREATE INDEX `training_dataset_historical_claim_id_unique` ON `training_dataset` (`historical_claim_id`);--> statement-breakpoint
CREATE INDEX `idx_training_records_user_id` ON `training_records` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_training_records_tenant_id` ON `training_records` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `tenant_idx` ON `usage_events` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `claim_idx` ON `usage_events` (`claim_id`);--> statement-breakpoint
CREATE INDEX `event_type_idx` ON `usage_events` (`event_type`);--> statement-breakpoint
CREATE INDEX `timestamp_idx` ON `usage_events` (`timestamp`);--> statement-breakpoint
CREATE INDEX `reference_idx` ON `usage_events` (`reference_id`);--> statement-breakpoint
CREATE INDEX `invitation_token` ON `user_invitations` (`invitation_token`);--> statement-breakpoint
CREATE INDEX `idx_users_tenant_id` ON `users` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_users_is_active` ON `users` (`is_active`);--> statement-breakpoint
CREATE INDEX `idx_users_phone_tenant` ON `users` (`phone_number`,`tenant_id`);--> statement-breakpoint
CREATE INDEX `valuation_comparable_request_idx` ON `valuation_comparable_evidence` (`valuation_request_id`);--> statement-breakpoint
CREATE INDEX `valuation_comparable_source_idx` ON `valuation_comparable_evidence` (`source_type`,`source_reference`);--> statement-breakpoint
CREATE INDEX `idx_vd_claim` ON `variance_datasets` (`historical_claim_id`);--> statement-breakpoint
CREATE INDEX `idx_vd_tenant` ON `variance_datasets` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_vd_type` ON `variance_datasets` (`comparison_type`);--> statement-breakpoint
CREATE INDEX `idx_vehicle_condition_snapshot_vehicle_date` ON `vehicle_condition_snapshots` (`vehicle_registry_id`,`snapshot_date`);--> statement-breakpoint
CREATE INDEX `idx_vehicle_condition_snapshot_tenant_vehicle` ON `vehicle_condition_snapshots` (`tenant_id`,`vehicle_registry_id`);--> statement-breakpoint
CREATE INDEX `idx_vdh_vehicle_id` ON `vehicle_damage_history` (`vehicle_id`);--> statement-breakpoint
CREATE INDEX `idx_vdh_claim_id` ON `vehicle_damage_history` (`claim_id`);--> statement-breakpoint
CREATE INDEX `idx_vdh_vehicle_reg` ON `vehicle_damage_history` (`vehicle_registration`);--> statement-breakpoint
CREATE INDEX `idx_vdh_damage_zone` ON `vehicle_damage_history` (`damage_zone`);--> statement-breakpoint
CREATE INDEX `idx_vdh_severity` ON `vehicle_damage_history` (`severity`);--> statement-breakpoint
CREATE INDEX `idx_vdh_tenant` ON `vehicle_damage_history` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_vdh_repairer` ON `vehicle_damage_history` (`repairer_id`);--> statement-breakpoint
CREATE INDEX `idx_vdh_repeat_zone` ON `vehicle_damage_history` (`is_repeat_zone`);--> statement-breakpoint
CREATE INDEX `vehicle_registration` ON `vehicle_history` (`vehicle_registration`);--> statement-breakpoint
CREATE INDEX `idx_vps_vehicle_registry_id` ON `vehicle_passport_snapshots` (`vehicle_registry_id`);--> statement-breakpoint
CREATE INDEX `idx_vps_registration_number` ON `vehicle_passport_snapshots` (`registration_number`);--> statement-breakpoint
CREATE INDEX `idx_vps_tenant_id` ON `vehicle_passport_snapshots` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_vps_generated_at` ON `vehicle_passport_snapshots` (`generated_at`);--> statement-breakpoint
CREATE INDEX `idx_vehicle_registry_registration` ON `vehicle_registry` (`registration_number`);--> statement-breakpoint
CREATE INDEX `idx_vehicle_registry_make_model` ON `vehicle_registry` (`make`,`model`);--> statement-breakpoint
CREATE INDEX `idx_vehicle_registry_tenant` ON `vehicle_registry` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_vehicle_registry_risk_score` ON `vehicle_registry` (`vehicle_risk_score`);--> statement-breakpoint
CREATE INDEX `idx_vehicle_registry_repeat_claimer` ON `vehicle_registry` (`is_repeat_claimer`);--> statement-breakpoint
CREATE INDEX `idx_wal_type` ON `weight_adjustment_log` (`mismatch_type`);--> statement-breakpoint
CREATE INDEX `idx_wal_created_at` ON `weight_adjustment_log` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_wal_direction` ON `weight_adjustment_log` (`sensitivity_direction`);--> statement-breakpoint
CREATE INDEX `idx_wa_phone` ON `whatsapp_sessions` (`phone_number`);--> statement-breakpoint
CREATE INDEX `idx_wa_status` ON `whatsapp_sessions` (`status`);--> statement-breakpoint
CREATE INDEX `idx_workflow_audit_claim_state_time` ON `workflow_audit_trail` (`claim_id`,`new_state`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_workflow_audit_override` ON `workflow_audit_trail` (`executive_override`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_audit_claim_timestamp` ON `workflow_audit_trail` (`claim_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `tenant_id` ON `workflow_configuration` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_claim_id` ON `workflow_states` (`claim_id`);--> statement-breakpoint
CREATE INDEX `idx_tenant_id` ON `workflow_states` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_wt_tenant_id` ON `workflow_templates` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_wt_is_default` ON `workflow_templates` (`tenant_id`,`is_default`);