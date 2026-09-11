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
	`fraud_adjustments_json` text DEFAULT ('{}'),
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
ALTER TABLE `appointments` ADD CONSTRAINT `appointments_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE cascade ON UPDATE cascade;
--> statement-breakpoint
ALTER TABLE `assessor_evaluations` ADD CONSTRAINT `assessor_evaluations_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE cascade ON UPDATE cascade;
--> statement-breakpoint
ALTER TABLE `assessor_evaluations` ADD CONSTRAINT `assessor_evaluations_source_report_id_assessor_reports_id_fk` FOREIGN KEY (`source_report_id`) REFERENCES `assessor_reports`(`id`) ON DELETE set null ON UPDATE cascade;
--> statement-breakpoint
ALTER TABLE `assessor_evaluations` ADD CONSTRAINT `fk_ae_accepted_review` FOREIGN KEY (`accepted_review_id`) REFERENCES `assessor_report_reviews`(`id`) ON DELETE set null ON UPDATE cascade;
--> statement-breakpoint
ALTER TABLE `audit_trail` ADD CONSTRAINT `audit_trail_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE cascade ON UPDATE cascade;
--> statement-breakpoint
ALTER TABLE `automation_audit_log` ADD CONSTRAINT `automation_audit_log_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE set null ON UPDATE cascade;
--> statement-breakpoint
ALTER TABLE `automation_audit_log` ADD CONSTRAINT `fk_aal_confidence_score` FOREIGN KEY (`confidence_score_id`) REFERENCES `claim_confidence_scores`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `automation_audit_log` ADD CONSTRAINT `fk_aal_routing_decision` FOREIGN KEY (`routing_decision_id`) REFERENCES `claim_routing_decisions`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `automation_audit_log` ADD CONSTRAINT `fk_aal_automation_policy` FOREIGN KEY (`automation_policy_id`) REFERENCES `automation_policies`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `claim_approvals` ADD CONSTRAINT `claim_approvals_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE cascade ON UPDATE cascade;
--> statement-breakpoint
ALTER TABLE `claim_events` ADD CONSTRAINT `claim_events_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE cascade ON UPDATE cascade;
--> statement-breakpoint
ALTER TABLE `claim_intake_requests` ADD CONSTRAINT `claim_intake_requests_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE set null ON UPDATE cascade;
--> statement-breakpoint
ALTER TABLE `claim_intelligence_dataset` ADD CONSTRAINT `claim_intelligence_dataset_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE set null ON UPDATE cascade;
--> statement-breakpoint
ALTER TABLE `claim_involvement_tracking` ADD CONSTRAINT `claim_involvement_tracking_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE cascade ON UPDATE cascade;
--> statement-breakpoint
ALTER TABLE `cross_claim_signals` ADD CONSTRAINT `cross_claim_signals_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE cascade ON UPDATE cascade;
--> statement-breakpoint
ALTER TABLE `driver_claims` ADD CONSTRAINT `driver_claims_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE cascade ON UPDATE cascade;
--> statement-breakpoint
ALTER TABLE `fast_track_routing_log` ADD CONSTRAINT `fast_track_routing_log_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE cascade ON UPDATE cascade;
--> statement-breakpoint
ALTER TABLE `mismatch_annotations` ADD CONSTRAINT `mismatch_annotations_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE cascade ON UPDATE cascade;
--> statement-breakpoint
ALTER TABLE `model_training_queue` ADD CONSTRAINT `model_training_queue_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE set null ON UPDATE cascade;
--> statement-breakpoint
ALTER TABLE `narrative_versions` ADD CONSTRAINT `narrative_versions_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE cascade ON UPDATE cascade;
--> statement-breakpoint
ALTER TABLE `policy_claim_links` ADD CONSTRAINT `policy_claim_links_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE cascade ON UPDATE cascade;
--> statement-breakpoint
ALTER TABLE `risk_register` ADD CONSTRAINT `risk_register_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE set null ON UPDATE cascade;
--> statement-breakpoint
ALTER TABLE `routing_history` ADD CONSTRAINT `routing_history_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE cascade ON UPDATE cascade;
--> statement-breakpoint
ALTER TABLE `third_party_vehicles` ADD CONSTRAINT `third_party_vehicles_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE cascade ON UPDATE cascade;
--> statement-breakpoint
ALTER TABLE `usage_events` ADD CONSTRAINT `usage_events_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE set null ON UPDATE cascade;
--> statement-breakpoint
CREATE INDEX `idx_aal_source_record` ON `anonymization_audit_log` (`source_record_id`);
--> statement-breakpoint
CREATE INDEX `idx_aal_status` ON `anonymization_audit_log` (`status`);
--> statement-breakpoint
CREATE INDEX `idx_aal_anonymized_at` ON `anonymization_audit_log` (`anonymized_at`);
--> statement-breakpoint
CREATE INDEX `idx_evaluations_claim_id` ON `assessor_evaluations` (`claim_id`);
--> statement-breakpoint
CREATE INDEX `idx_evaluations_assessor_id` ON `assessor_evaluations` (`assessor_id`);
--> statement-breakpoint
CREATE INDEX `unique_assessor_tenant` ON `assessor_insurer_relationships` (`assessor_id`,`tenant_id`);
--> statement-breakpoint
CREATE INDEX `idx_tenant` ON `assessor_insurer_relationships` (`tenant_id`);
--> statement-breakpoint
CREATE INDEX `idx_type` ON `assessor_insurer_relationships` (`relationship_type`);
--> statement-breakpoint
CREATE INDEX `idx_status` ON `assessor_insurer_relationships` (`relationship_status`);
--> statement-breakpoint
CREATE INDEX `idx_preferred` ON `assessor_insurer_relationships` (`is_preferred_vendor`);
--> statement-breakpoint
CREATE INDEX `idx_asub_profile` ON `assessor_subscriptions` (`marketplace_profile_id`);
--> statement-breakpoint
CREATE INDEX `idx_asub_user` ON `assessor_subscriptions` (`user_id`);
--> statement-breakpoint
CREATE INDEX `idx_asub_tier` ON `assessor_subscriptions` (`tier`);
--> statement-breakpoint
CREATE INDEX `idx_type` ON `assessors` (`assessor_type`);
--> statement-breakpoint
CREATE INDEX `idx_marketplace_status` ON `assessors` (`marketplace_status`);
--> statement-breakpoint
CREATE INDEX `idx_primary_tenant` ON `assessors` (`primary_tenant_id`);
--> statement-breakpoint
CREATE INDEX `idx_performance` ON `assessors` (`performance_score`);
--> statement-breakpoint
CREATE INDEX `idx_rating` ON `assessors` (`average_rating`);
--> statement-breakpoint
CREATE INDEX `user_id` ON `assessors` (`user_id`);
--> statement-breakpoint
CREATE INDEX `professional_license_number` ON `assessors` (`professional_license_number`);
--> statement-breakpoint
CREATE INDEX `idx_ar_tenant` ON `asset_registry` (`tenant_id`);
--> statement-breakpoint
CREATE INDEX `idx_ar_type` ON `asset_registry` (`asset_type`);
--> statement-breakpoint
CREATE INDEX `idx_ar_vehicle_reg` ON `asset_registry` (`vehicle_registration`);
--> statement-breakpoint
CREATE INDEX `idx_ar_owner` ON `asset_registry` (`owner_id`);
--> statement-breakpoint
CREATE INDEX `idx_audit_claim_id` ON `audit_trail` (`claim_id`);
--> statement-breakpoint
CREATE INDEX `idx_audit_user_id` ON `audit_trail` (`user_id`);
--> statement-breakpoint
CREATE INDEX `idx_audit_created_at` ON `audit_trail` (`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_claim_id` ON `automation_audit_log` (`claim_id`);
--> statement-breakpoint
CREATE INDEX `idx_tenant_id` ON `automation_audit_log` (`tenant_id`);
--> statement-breakpoint
CREATE INDEX `idx_routed_workflow` ON `automation_audit_log` (`routed_workflow`);
--> statement-breakpoint
CREATE INDEX `idx_composite_score` ON `automation_audit_log` (`composite_confidence_score`);
--> statement-breakpoint
CREATE INDEX `idx_decision_made_at` ON `automation_audit_log` (`decision_made_at`);
--> statement-breakpoint
CREATE INDEX `idx_was_overridden` ON `automation_audit_log` (`was_overridden`);
--> statement-breakpoint
CREATE INDEX `idx_cal_tenant_jurisdiction` ON `calibration_overrides` (`tenant_id`,`jurisdiction`);
--> statement-breakpoint
CREATE INDEX `idx_cal_status` ON `calibration_overrides` (`status`);
--> statement-breakpoint
CREATE INDEX `idx_cal_scenario` ON `calibration_overrides` (`scenario_type`);
--> statement-breakpoint
CREATE INDEX `idx_ca_claim_id` ON `claim_approvals` (`claim_id`);
--> statement-breakpoint
CREATE INDEX `idx_ca_tenant_id` ON `claim_approvals` (`tenant_id`);
--> statement-breakpoint
CREATE INDEX `idx_ca_stage_order` ON `claim_approvals` (`claim_id`,`stage_order`);
--> statement-breakpoint
CREATE INDEX `idx_ca_role_key` ON `claim_approvals` (`role_key`);
--> statement-breakpoint
CREATE INDEX `idx_ca_acted_at` ON `claim_approvals` (`acted_at`);
--> statement-breakpoint
CREATE INDEX `idx_ce_claim_id` ON `claim_events` (`claim_id`);
--> statement-breakpoint
CREATE INDEX `idx_ce_event_type` ON `claim_events` (`event_type`);
--> statement-breakpoint
CREATE INDEX `idx_ce_emitted_at` ON `claim_events` (`emitted_at`);
--> statement-breakpoint
CREATE INDEX `idx_claim_intake_request_claim` ON `claim_intake_requests` (`claim_id`);
--> statement-breakpoint
CREATE INDEX `idx_claim_intake_request_tenant_status` ON `claim_intake_requests` (`tenant_id`,`status`);
--> statement-breakpoint
CREATE INDEX `idx_cid_tenant_id` ON `claim_intelligence_dataset` (`tenant_id`);
--> statement-breakpoint
CREATE INDEX `idx_cid_captured_at` ON `claim_intelligence_dataset` (`captured_at`);
--> statement-breakpoint
CREATE INDEX `idx_cid_schema_version` ON `claim_intelligence_dataset` (`schema_version`);
--> statement-breakpoint
CREATE INDEX `idx_data_scope` ON `claim_intelligence_dataset` (`data_scope`);
--> statement-breakpoint
CREATE INDEX `idx_global_sharing` ON `claim_intelligence_dataset` (`global_sharing_enabled`);
--> statement-breakpoint
CREATE INDEX `idx_anonymized_at` ON `claim_intelligence_dataset` (`anonymized_at`);
--> statement-breakpoint
CREATE INDEX `idx_involvement_claim_user_stage` ON `claim_involvement_tracking` (`claim_id`,`user_id`,`workflow_stage`);
--> statement-breakpoint
CREATE INDEX `idx_involvement_claim_user` ON `claim_involvement_tracking` (`claim_id`,`user_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `claim_review_queue_historical_claim_id_unique` ON `claim_review_queue` (`historical_claim_id`);
--> statement-breakpoint
CREATE INDEX `idx_cb_component_make` ON `component_benchmarks` (`component_id`,`vehicle_make`);
--> statement-breakpoint
CREATE INDEX `idx_cb_vehicle_precision` ON `component_benchmarks` (`component_id`,`vehicle_make`,`vehicle_model`,`year_band`);
--> statement-breakpoint
CREATE INDEX `idx_cb_market_currency` ON `component_benchmarks` (`market_region`,`currency_code`,`evidence_quality`);
--> statement-breakpoint
CREATE INDEX `idx_cb_component_id` ON `component_benchmarks` (`component_id`);
--> statement-breakpoint
CREATE INDEX `idx_ccs_claim_id` ON `cross_claim_signals` (`claim_id`);
--> statement-breakpoint
CREATE INDEX `idx_ccs_signal_type` ON `cross_claim_signals` (`signal_type`);
--> statement-breakpoint
CREATE INDEX `idx_ccs_confidence` ON `cross_claim_signals` (`confidence`);
--> statement-breakpoint
CREATE INDEX `idx_ccs_dismissed` ON `cross_claim_signals` (`is_dismissed`);
--> statement-breakpoint
CREATE INDEX `idx_ccs_tenant` ON `cross_claim_signals` (`tenant_id`);
--> statement-breakpoint
CREATE INDEX `idx_dag_tenant_id` ON `dataset_access_grants` (`tenant_id`);
--> statement-breakpoint
CREATE INDEX `idx_dag_data_scope` ON `dataset_access_grants` (`data_scope`);
--> statement-breakpoint
CREATE INDEX `idx_dag_granted_to_user` ON `dataset_access_grants` (`granted_to_user_id`);
--> statement-breakpoint
CREATE INDEX `idx_dag_expiry_date` ON `dataset_access_grants` (`expiry_date`);
--> statement-breakpoint
CREATE INDEX `idx_dc_driver_id` ON `driver_claims` (`driver_id`);
--> statement-breakpoint
CREATE INDEX `idx_dc_claim_id` ON `driver_claims` (`claim_id`);
--> statement-breakpoint
CREATE INDEX `idx_dc_role` ON `driver_claims` (`role`);
--> statement-breakpoint
CREATE INDEX `idx_dc_tenant` ON `driver_claims` (`tenant_id`);
--> statement-breakpoint
CREATE INDEX `idx_ft_config_tenant` ON `fast_track_config` (`tenant_id`);
--> statement-breakpoint
CREATE INDEX `idx_ft_config_product` ON `fast_track_config` (`product_id`);
--> statement-breakpoint
CREATE INDEX `idx_ft_config_claim_type` ON `fast_track_config` (`claim_type`);
--> statement-breakpoint
CREATE INDEX `idx_ft_config_enabled` ON `fast_track_config` (`enabled`);
--> statement-breakpoint
CREATE INDEX `idx_ft_config_effective` ON `fast_track_config` (`effective_from`);
--> statement-breakpoint
CREATE INDEX `idx_ft_config_hierarchy` ON `fast_track_config` (`tenant_id`,`product_id`,`claim_type`);
--> statement-breakpoint
CREATE INDEX `idx_ft_log_claim` ON `fast_track_routing_log` (`claim_id`);
--> statement-breakpoint
CREATE INDEX `idx_ft_log_tenant` ON `fast_track_routing_log` (`tenant_id`);
--> statement-breakpoint
CREATE INDEX `idx_ft_log_config` ON `fast_track_routing_log` (`config_id`);
--> statement-breakpoint
CREATE INDEX `idx_ft_log_decision` ON `fast_track_routing_log` (`decision`);
--> statement-breakpoint
CREATE INDEX `idx_ft_log_evaluated` ON `fast_track_routing_log` (`evaluated_at`);
--> statement-breakpoint
CREATE INDEX `idx_ft_log_claim_tenant` ON `fast_track_routing_log` (`claim_id`,`tenant_id`);
--> statement-breakpoint
CREATE INDEX `idx_flm_round_number` ON `federated_learning_metadata` (`round_number`);
--> statement-breakpoint
CREATE INDEX `idx_flm_model_type` ON `federated_learning_metadata` (`model_type`);
--> statement-breakpoint
CREATE INDEX `idx_flm_training_started` ON `federated_learning_metadata` (`training_started_at`);
--> statement-breakpoint
CREATE INDEX `historical_claim_id` ON `final_approval_records` (`historical_claim_id`);
--> statement-breakpoint
CREATE INDEX `anonymous_record_id` ON `global_anonymized_dataset` (`anonymous_record_id`);
--> statement-breakpoint
CREATE INDEX `idx_gad_capture_month` ON `global_anonymized_dataset` (`capture_month`);
--> statement-breakpoint
CREATE INDEX `idx_gad_vehicle_make` ON `global_anonymized_dataset` (`vehicle_make`);
--> statement-breakpoint
CREATE INDEX `idx_gad_province` ON `global_anonymized_dataset` (`province`);
--> statement-breakpoint
CREATE INDEX `idx_gad_accident_type` ON `global_anonymized_dataset` (`accident_type`);
--> statement-breakpoint
CREATE INDEX `idx_gad_anonymized_at` ON `global_anonymized_dataset` (`anonymized_at`);
--> statement-breakpoint
CREATE INDEX `idx_gsa_tenant_id` ON `global_search_analytics` (`tenant_id`);
--> statement-breakpoint
CREATE INDEX `idx_gsa_searched_at` ON `global_search_analytics` (`searched_at`);
--> statement-breakpoint
CREATE INDEX `idx_gsa_query` ON `global_search_analytics` (`query`);
--> statement-breakpoint
CREATE INDEX `idx_gsh_user_id` ON `global_search_history` (`user_id`);
--> statement-breakpoint
CREATE INDEX `idx_gsh_tenant_id` ON `global_search_history` (`tenant_id`);
--> statement-breakpoint
CREATE INDEX `idx_gsh_searched_at` ON `global_search_history` (`searched_at`);
--> statement-breakpoint
CREATE INDEX `idx_hc_tenant` ON `historical_claims` (`tenant_id`);
--> statement-breakpoint
CREATE INDEX `idx_hc_batch` ON `historical_claims` (`batch_id`);
--> statement-breakpoint
CREATE INDEX `idx_hc_status` ON `historical_claims` (`pipeline_status`);
--> statement-breakpoint
CREATE INDEX `idx_historical_replay_results_tenant_id` ON `historical_replay_results` (`tenant_id`);
--> statement-breakpoint
CREATE INDEX `idx_historical_replay_results_historical_claim_id` ON `historical_replay_results` (`historical_claim_id`);
--> statement-breakpoint
CREATE INDEX `idx_historical_replay_results_replayed_at` ON `historical_replay_results` (`replayed_at`);
--> statement-breakpoint
CREATE INDEX `idx_historical_replay_results_policy_version_id` ON `historical_replay_results` (`policy_version_id`);
--> statement-breakpoint
CREATE INDEX `idx_iso_audit_logs_tenant_id` ON `iso_audit_logs` (`tenant_id`);
--> statement-breakpoint
CREATE INDEX `idx_iso_audit_logs_user_id` ON `iso_audit_logs` (`user_id`);
--> statement-breakpoint
CREATE INDEX `idx_iso_audit_logs_timestamp` ON `iso_audit_logs` (`timestamp`);
--> statement-breakpoint
CREATE INDEX `idx_ma_claim` ON `mismatch_annotations` (`claim_id`);
--> statement-breakpoint
CREATE INDEX `idx_ma_type` ON `mismatch_annotations` (`mismatch_type`);
--> statement-breakpoint
CREATE INDEX `idx_ma_user` ON `mismatch_annotations` (`user_id`);
--> statement-breakpoint
CREATE INDEX `idx_ma_action` ON `mismatch_annotations` (`action`);
--> statement-breakpoint
CREATE INDEX `idx_mtq_processed` ON `model_training_queue` (`processed`);
--> statement-breakpoint
CREATE INDEX `idx_mtq_training_priority` ON `model_training_queue` (`training_priority`);
--> statement-breakpoint
CREATE INDEX `idx_mtq_created_at` ON `model_training_queue` (`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_nv_claim` ON `narrative_versions` (`claim_id`);
--> statement-breakpoint
CREATE INDEX `idx_nv_assessment` ON `narrative_versions` (`assessment_id`);
--> statement-breakpoint
CREATE INDEX `idx_nv_type` ON `narrative_versions` (`mismatch_type`);
--> statement-breakpoint
CREATE INDEX `idx_nv_active` ON `narrative_versions` (`is_active`);
--> statement-breakpoint
CREATE INDEX `personal_vehicles_user_id` ON `personal_vehicles` (`user_id`);
--> statement-breakpoint
CREATE INDEX `idx_pm_inspection` ON `physical_measurements` (`inspection_id`);
--> statement-breakpoint
CREATE INDEX `idx_pm_tenant` ON `physical_measurements` (`tenant_id`);
--> statement-breakpoint
CREATE INDEX `idx_pm_category` ON `physical_measurements` (`measurement_category`);
--> statement-breakpoint
CREATE INDEX `idx_pm_captured_by` ON `physical_measurements` (`captured_by`);
--> statement-breakpoint
CREATE INDEX `idx_pm_captured_at` ON `physical_measurements` (`captured_at`);
--> statement-breakpoint
CREATE INDEX `idx_pj_claim_id` ON `pipeline_jobs` (`claim_id`);
--> statement-breakpoint
CREATE INDEX `idx_pj_run_id` ON `pipeline_jobs` (`run_id`);
--> statement-breakpoint
CREATE INDEX `idx_pj_stage_id` ON `pipeline_jobs` (`stage_id`);
--> statement-breakpoint
CREATE INDEX `idx_pj_status` ON `pipeline_jobs` (`status`);
--> statement-breakpoint
CREATE INDEX `idx_pr_claim_id` ON `pipeline_runs` (`claim_id`);
--> statement-breakpoint
CREATE INDEX `idx_pr_run_id` ON `pipeline_runs` (`run_id`);
--> statement-breakpoint
CREATE INDEX `idx_pr_status` ON `pipeline_runs` (`status`);
--> statement-breakpoint
CREATE INDEX `idx_pr_started_at` ON `pipeline_runs` (`started_at`);
--> statement-breakpoint
CREATE INDEX `policy_endorsements_endorsement_number_unique` ON `policy_endorsements` (`endorsement_number`);
--> statement-breakpoint
CREATE INDEX `idx_prs_entity` ON `predictive_risk_scores` (`entity_type`,`entity_id`);
--> statement-breakpoint
CREATE INDEX `idx_prs_tenant_id` ON `predictive_risk_scores` (`tenant_id`);
--> statement-breakpoint
CREATE INDEX `idx_prs_score_type` ON `predictive_risk_scores` (`score_type`);
--> statement-breakpoint
CREATE INDEX `idx_prs_valid_from` ON `predictive_risk_scores` (`valid_from`);
--> statement-breakpoint
CREATE INDEX `request_number` ON `quotation_requests` (`request_number`);
--> statement-breakpoint
CREATE INDEX `idx_rl_claim` ON `replay_logs` (`claim_id`);
--> statement-breakpoint
CREATE INDEX `idx_rl_tenant` ON `replay_logs` (`tenant_id`);
--> statement-breakpoint
CREATE INDEX `idx_rl_replayed_at` ON `replay_logs` (`replayed_at`);
--> statement-breakpoint
CREATE INDEX `idx_rl_changed` ON `replay_logs` (`changed`);
--> statement-breakpoint
CREATE INDEX `idx_risk_register_claim_id` ON `risk_register` (`claim_id`);
--> statement-breakpoint
CREATE INDEX `idx_risk_register_tenant_id` ON `risk_register` (`tenant_id`);
--> statement-breakpoint
CREATE INDEX `idx_tenant_id` ON `role_assignment_audit` (`tenant_id`);
--> statement-breakpoint
CREATE INDEX `idx_user_id` ON `role_assignment_audit` (`user_id`);
--> statement-breakpoint
CREATE INDEX `idx_changed_by` ON `role_assignment_audit` (`changed_by_user_id`);
--> statement-breakpoint
CREATE INDEX `idx_timestamp` ON `role_assignment_audit` (`timestamp`);
--> statement-breakpoint
CREATE INDEX `idx_role_audit_user_time` ON `role_assignment_audit` (`user_id`,`timestamp`);
--> statement-breakpoint
CREATE INDEX `idx_role_audit_tenant_time` ON `role_assignment_audit` (`tenant_id`,`timestamp`);
--> statement-breakpoint
CREATE INDEX `idx_routing_claim_id` ON `routing_history` (`claim_id`);
--> statement-breakpoint
CREATE INDEX `idx_routing_tenant_id` ON `routing_history` (`tenant_id`);
--> statement-breakpoint
CREATE INDEX `idx_routing_timestamp` ON `routing_history` (`timestamp`);
--> statement-breakpoint
CREATE INDEX `idx_routing_claim_tenant` ON `routing_history` (`claim_id`,`tenant_id`);
--> statement-breakpoint
CREATE INDEX `unique_threshold_tenant_version` ON `routing_threshold_config` (`tenant_id`,`version`);
--> statement-breakpoint
CREATE INDEX `idx_threshold_tenant_id` ON `routing_threshold_config` (`tenant_id`);
--> statement-breakpoint
CREATE INDEX `idx_threshold_active` ON `routing_threshold_config` (`is_active`);
--> statement-breakpoint
CREATE INDEX `idx_threshold_tenant_active` ON `routing_threshold_config` (`tenant_id`,`is_active`);
--> statement-breakpoint
CREATE INDEX `idx_som_user` ON `shadow_override_monitor` (`user_id`);
--> statement-breakpoint
CREATE INDEX `idx_som_tenant` ON `shadow_override_monitor` (`tenant_id`);
--> statement-breakpoint
CREATE INDEX `idx_som_scanned` ON `shadow_override_monitor` (`last_scanned_at`);
--> statement-breakpoint
CREATE INDEX `idx_som_activity` ON `shadow_override_monitor` (`override_activity_detected`);
--> statement-breakpoint
CREATE INDEX `idx_super_audit_sessions_super_admin_user_id` ON `super_audit_sessions` (`super_admin_user_id`);
--> statement-breakpoint
CREATE INDEX `idx_super_audit_sessions_audited_tenant_id` ON `super_audit_sessions` (`audited_tenant_id`);
--> statement-breakpoint
CREATE INDEX `idx_super_audit_sessions_session_started_at` ON `super_audit_sessions` (`session_started_at`);
--> statement-breakpoint
CREATE INDEX `supplier_performance_metrics_supplier_name_unique` ON `supplier_performance_metrics` (`supplier_name`);
--> statement-breakpoint
CREATE INDEX `idx_se_procedure` ON `system_errors` (`procedure_name`);
--> statement-breakpoint
CREATE INDEX `idx_se_user_id` ON `system_errors` (`user_id`);
--> statement-breakpoint
CREATE INDEX `idx_se_occurred_at` ON `system_errors` (`occurred_at`);
--> statement-breakpoint
CREATE INDEX `idx_se_error_code` ON `system_errors` (`error_code`);
--> statement-breakpoint
CREATE INDEX `idx_tiv_user_id` ON `tenant_isolation_violations` (`user_id`);
--> statement-breakpoint
CREATE INDEX `idx_tiv_user_tenant` ON `tenant_isolation_violations` (`user_tenant_id`);
--> statement-breakpoint
CREATE INDEX `idx_tiv_occurred_at` ON `tenant_isolation_violations` (`occurred_at`);
--> statement-breakpoint
CREATE INDEX `idx_tiv_procedure` ON `tenant_isolation_violations` (`procedure_name`);
--> statement-breakpoint
CREATE INDEX `training_data_scores_historical_claim_id_unique` ON `training_data_scores` (`historical_claim_id`);
--> statement-breakpoint
CREATE INDEX `training_dataset_historical_claim_id_unique` ON `training_dataset` (`historical_claim_id`);
--> statement-breakpoint
CREATE INDEX `tenant_idx` ON `usage_events` (`tenant_id`);
--> statement-breakpoint
CREATE INDEX `claim_idx` ON `usage_events` (`claim_id`);
--> statement-breakpoint
CREATE INDEX `event_type_idx` ON `usage_events` (`event_type`);
--> statement-breakpoint
CREATE INDEX `timestamp_idx` ON `usage_events` (`timestamp`);
--> statement-breakpoint
CREATE INDEX `reference_idx` ON `usage_events` (`reference_id`);
--> statement-breakpoint
CREATE INDEX `idx_vd_claim` ON `variance_datasets` (`historical_claim_id`);
--> statement-breakpoint
CREATE INDEX `idx_vd_tenant` ON `variance_datasets` (`tenant_id`);
--> statement-breakpoint
CREATE INDEX `idx_vd_type` ON `variance_datasets` (`comparison_type`);
--> statement-breakpoint
CREATE INDEX `idx_wal_type` ON `weight_adjustment_log` (`mismatch_type`);
--> statement-breakpoint
CREATE INDEX `idx_wal_created_at` ON `weight_adjustment_log` (`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_wal_direction` ON `weight_adjustment_log` (`sensitivity_direction`);
--> statement-breakpoint
