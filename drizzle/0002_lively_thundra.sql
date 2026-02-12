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
	`claim_id` int NOT NULL,
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
	CONSTRAINT `assessors_id` PRIMARY KEY(`id`),
	CONSTRAINT `assessors_user_id_unique` UNIQUE(`user_id`),
	CONSTRAINT `assessors_professional_license_number_unique` UNIQUE(`professional_license_number`)
);
--> statement-breakpoint
CREATE TABLE `automation_audit_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`claim_id` int NOT NULL,
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
	`was_overridden` boolean NOT NULL DEFAULT false,
	`override_reason` text,
	`overridden_by_user_id` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
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
	`allow_policy_override` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`created_by_user_id` int,
	`is_active` boolean NOT NULL DEFAULT true,
	CONSTRAINT `automation_policies_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `claim_comments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`claim_id` int NOT NULL,
	`user_id` int NOT NULL,
	`user_role` text NOT NULL,
	`comment_type` enum('general','flag','clarification_request','technical_note') NOT NULL,
	`content` text NOT NULL,
	`tenant_id` varchar(255),
	`created_at` timestamp NOT NULL DEFAULT (now()),
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
	`scoring_timestamp` timestamp NOT NULL DEFAULT (now()),
	`damage_certainty_breakdown` json,
	`physics_validation_details` json,
	`fraud_analysis_details` json,
	`historical_accuracy_details` json,
	`data_completeness_details` json,
	`vehicle_risk_details` json,
	CONSTRAINT `claim_confidence_scores_id` PRIMARY KEY(`id`)
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
CREATE TABLE `claim_intelligence_dataset` (
	`id` int AUTO_INCREMENT NOT NULL,
	`claim_id` int NOT NULL,
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
	CONSTRAINT `claim_intelligence_dataset_id` PRIMARY KEY(`id`)
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
	`decision_timestamp` timestamp NOT NULL DEFAULT (now()),
	`decision_made_by_system` boolean NOT NULL DEFAULT true,
	`decision_made_by_user_id` int,
	`was_overridden` boolean NOT NULL DEFAULT false,
	`override_reason` text,
	`overridden_by_user_id` int,
	`overridden_at` timestamp,
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
	CONSTRAINT `email_verification_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `email_verification_tokens_token_unique` UNIQUE(`token`)
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
	`conditions` text,
	`data_source` enum('extracted_from_document','manual_entry','system_import') NOT NULL,
	`captured_by_user_id` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `final_approval_records_id` PRIMARY KEY(`id`),
	CONSTRAINT `final_approval_records_historical_claim_id_unique` UNIQUE(`historical_claim_id`)
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
	`fraud_risk_level` enum('low','medium','high','critical') NOT NULL,
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
	`tenant_id` varchar(255),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
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
	CONSTRAINT `fraud_rules_id` PRIMARY KEY(`id`),
	CONSTRAINT `fraud_rules_rule_name_unique` UNIQUE(`rule_name`)
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
	CONSTRAINT `global_anonymized_dataset_id` PRIMARY KEY(`id`),
	CONSTRAINT `global_anonymized_dataset_anonymous_record_id_unique` UNIQUE(`anonymous_record_id`)
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
	CONSTRAINT `historical_claims_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ingestion_batches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` varchar(64) NOT NULL,
	`batch_id` varchar(36) NOT NULL,
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
	CONSTRAINT `ingestion_batches_id` PRIMARY KEY(`id`),
	CONSTRAINT `ingestion_batches_batch_id_unique` UNIQUE(`batch_id`)
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
	CONSTRAINT `ingestion_documents_id` PRIMARY KEY(`id`),
	CONSTRAINT `ingestion_documents_document_id_unique` UNIQUE(`document_id`)
);
--> statement-breakpoint
CREATE TABLE `marketplace_transactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`assignment_id` int NOT NULL,
	`assessor_id` int NOT NULL,
	`tenant_id` varchar(64) NOT NULL,
	`claim_id` int NOT NULL,
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
CREATE TABLE `model_training_queue` (
	`id` int AUTO_INCREMENT NOT NULL,
	`claim_id` int NOT NULL,
	`dataset_record_id` int NOT NULL,
	`training_priority` varchar(50) DEFAULT 'normal',
	`processed` tinyint DEFAULT 0,
	`processed_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `model_training_queue_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`message` text NOT NULL,
	`type` enum('claim_assigned','quote_submitted','fraud_detected','status_changed','assessment_completed','approval_required','document_uploaded','system_alert') NOT NULL,
	`claim_id` int,
	`entity_type` varchar(50),
	`entity_id` int,
	`is_read` tinyint NOT NULL DEFAULT 0,
	`read_at` timestamp,
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
	`speed_discrepancy` int,
	`location_mismatch` tinyint DEFAULT 0,
	`weather_mismatch` tinyint DEFAULT 0,
	`description_inconsistent` tinyint DEFAULT 0,
	`notes` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `police_reports_id` PRIMARY KEY(`id`)
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
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `quote_line_items_id` PRIMARY KEY(`id`)
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
CREATE TABLE `tenants` (
	`id` varchar(64) NOT NULL,
	`name` varchar(255) NOT NULL,
	`display_name` varchar(255) NOT NULL,
	`tier` enum('tier-basic','tier-professional','tier-enterprise') NOT NULL DEFAULT 'tier-basic',
	`status` enum('active','inactive','suspended') NOT NULL DEFAULT 'active',
	`encryption_key_id` varchar(255),
	`contact_name` varchar(255),
	`contact_email` varchar(320),
	`contact_phone` varchar(20),
	`billing_email` varchar(320),
	`config_json` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`activated_at` timestamp,
	`suspended_at` timestamp,
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
	`damage_description` text,
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
	CONSTRAINT `user_invitations_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_invitations_invitation_token_unique` UNIQUE(`invitation_token`)
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
	CONSTRAINT `vehicle_history_id` PRIMARY KEY(`id`),
	CONSTRAINT `vehicle_history_vehicle_registration_unique` UNIQUE(`vehicle_registration`)
);
--> statement-breakpoint
CREATE TABLE `vehicle_market_valuations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`claim_id` int NOT NULL,
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
ALTER TABLE `assessor_evaluations` MODIFY COLUMN `status` enum('pending','in_progress','completed','submitted') NOT NULL DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE `ai_assessments` ADD `total_loss_indicated` tinyint DEFAULT 0;--> statement-breakpoint
ALTER TABLE `ai_assessments` ADD `structural_damage_severity` enum('none','minor','moderate','severe','catastrophic') DEFAULT 'none';--> statement-breakpoint
ALTER TABLE `ai_assessments` ADD `estimated_vehicle_value` int;--> statement-breakpoint
ALTER TABLE `ai_assessments` ADD `repair_to_value_ratio` int;--> statement-breakpoint
ALTER TABLE `ai_assessments` ADD `total_loss_reasoning` text;--> statement-breakpoint
ALTER TABLE `ai_assessments` ADD `damaged_components_json` text;--> statement-breakpoint
ALTER TABLE `ai_assessments` ADD `physics_analysis` text;--> statement-breakpoint
ALTER TABLE `ai_assessments` ADD `graph_urls` text;--> statement-breakpoint
ALTER TABLE `ai_assessments` ADD `tenant_id` varchar(255);--> statement-breakpoint
ALTER TABLE `appointments` ADD `tenant_id` varchar(255);--> statement-breakpoint
ALTER TABLE `assessor_evaluations` ADD `estimated_repair_cost` int;--> statement-breakpoint
ALTER TABLE `assessor_evaluations` ADD `labor_cost` int;--> statement-breakpoint
ALTER TABLE `assessor_evaluations` ADD `parts_cost` int;--> statement-breakpoint
ALTER TABLE `assessor_evaluations` ADD `estimated_duration` int;--> statement-breakpoint
ALTER TABLE `assessor_evaluations` ADD `damage_assessment` text;--> statement-breakpoint
ALTER TABLE `assessor_evaluations` ADD `recommendations` text;--> statement-breakpoint
ALTER TABLE `assessor_evaluations` ADD `fraud_risk_level` enum('low','medium','high');--> statement-breakpoint
ALTER TABLE `assessor_evaluations` ADD `tenant_id` varchar(255);--> statement-breakpoint
ALTER TABLE `claims` ADD `tenant_id` varchar(255);--> statement-breakpoint
ALTER TABLE `claims` ADD `workflow_state` enum('created','assigned','under_assessment','internal_review','technical_approval','financial_decision','payment_authorized','closed','disputed');--> statement-breakpoint
ALTER TABLE `claims` ADD `technically_approved_by` int;--> statement-breakpoint
ALTER TABLE `claims` ADD `technically_approved_at` timestamp;--> statement-breakpoint
ALTER TABLE `claims` ADD `financially_approved_by` int;--> statement-breakpoint
ALTER TABLE `claims` ADD `financially_approved_at` timestamp;--> statement-breakpoint
ALTER TABLE `claims` ADD `approved_amount` int;--> statement-breakpoint
ALTER TABLE `claims` ADD `closed_by` int;--> statement-breakpoint
ALTER TABLE `claims` ADD `closed_at` timestamp;--> statement-breakpoint
ALTER TABLE `panel_beater_quotes` ADD `labor_hours` int;--> statement-breakpoint
ALTER TABLE `panel_beater_quotes` ADD `components_json` text;--> statement-breakpoint
ALTER TABLE `panel_beater_quotes` ADD `parts_quality` enum('aftermarket','oem','genuine','used') DEFAULT 'aftermarket';--> statement-breakpoint
ALTER TABLE `panel_beater_quotes` ADD `warranty_months` int DEFAULT 12;--> statement-breakpoint
ALTER TABLE `panel_beater_quotes` ADD `tenant_id` varchar(255);--> statement-breakpoint
ALTER TABLE `panel_beaters` ADD `tenant_id` varchar(255);--> statement-breakpoint
ALTER TABLE `users` ADD `password_hash` varchar(255);--> statement-breakpoint
ALTER TABLE `users` ADD `insurer_role` enum('claims_processor','internal_assessor','risk_manager','claims_manager','executive');--> statement-breakpoint
ALTER TABLE `users` ADD `organization_id` int;--> statement-breakpoint
ALTER TABLE `users` ADD `tenant_id` varchar(64);--> statement-breakpoint
ALTER TABLE `users` ADD `email_verified` tinyint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `assessor_tier` enum('free','premium','enterprise') DEFAULT 'free';--> statement-breakpoint
ALTER TABLE `users` ADD `tier_activated_at` timestamp;--> statement-breakpoint
ALTER TABLE `users` ADD `tier_expires_at` timestamp;--> statement-breakpoint
ALTER TABLE `users` ADD `performance_score` int DEFAULT 70;--> statement-breakpoint
ALTER TABLE `users` ADD `total_assessments_completed` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `users` ADD `average_variance_from_final` int;--> statement-breakpoint
ALTER TABLE `users` ADD `accuracy_score` decimal(5,2) DEFAULT '0.00';--> statement-breakpoint
ALTER TABLE `users` ADD `avg_completion_time` decimal(6,2) DEFAULT '0.00';--> statement-breakpoint
CREATE INDEX `idx_aal_source_record` ON `anonymization_audit_log` (`source_record_id`);--> statement-breakpoint
CREATE INDEX `idx_aal_status` ON `anonymization_audit_log` (`status`);--> statement-breakpoint
CREATE INDEX `idx_aal_anonymized_at` ON `anonymization_audit_log` (`anonymized_at`);--> statement-breakpoint
CREATE INDEX `idx_claim_id` ON `automation_audit_log` (`claim_id`);--> statement-breakpoint
CREATE INDEX `idx_tenant_id` ON `automation_audit_log` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_routed_workflow` ON `automation_audit_log` (`routed_workflow`);--> statement-breakpoint
CREATE INDEX `idx_composite_score` ON `automation_audit_log` (`composite_confidence_score`);--> statement-breakpoint
CREATE INDEX `idx_decision_made_at` ON `automation_audit_log` (`decision_made_at`);--> statement-breakpoint
CREATE INDEX `idx_was_overridden` ON `automation_audit_log` (`was_overridden`);--> statement-breakpoint
CREATE INDEX `idx_tenant_active` ON `automation_policies` (`tenant_id`,`is_active`);--> statement-breakpoint
CREATE INDEX `idx_policy_name` ON `automation_policies` (`policy_name`);--> statement-breakpoint
CREATE INDEX `idx_claim_id` ON `claim_confidence_scores` (`claim_id`);--> statement-breakpoint
CREATE INDEX `idx_tenant_id` ON `claim_confidence_scores` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_composite_score` ON `claim_confidence_scores` (`composite_confidence_score`);--> statement-breakpoint
CREATE INDEX `idx_scoring_timestamp` ON `claim_confidence_scores` (`scoring_timestamp`);--> statement-breakpoint
CREATE INDEX `idx_claim_id` ON `claim_events` (`claim_id`);--> statement-breakpoint
CREATE INDEX `idx_event_type` ON `claim_events` (`event_type`);--> statement-breakpoint
CREATE INDEX `idx_emitted_at` ON `claim_events` (`emitted_at`);--> statement-breakpoint
CREATE INDEX `idx_claim_id` ON `claim_intelligence_dataset` (`claim_id`);--> statement-breakpoint
CREATE INDEX `idx_tenant_id` ON `claim_intelligence_dataset` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_captured_at` ON `claim_intelligence_dataset` (`captured_at`);--> statement-breakpoint
CREATE INDEX `idx_schema_version` ON `claim_intelligence_dataset` (`schema_version`);--> statement-breakpoint
CREATE INDEX `idx_claim_id` ON `claim_routing_decisions` (`claim_id`);--> statement-breakpoint
CREATE INDEX `idx_tenant_id` ON `claim_routing_decisions` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_routed_workflow` ON `claim_routing_decisions` (`routed_workflow`);--> statement-breakpoint
CREATE INDEX `idx_decision_timestamp` ON `claim_routing_decisions` (`decision_timestamp`);--> statement-breakpoint
CREATE INDEX `idx_dag_tenant_id` ON `dataset_access_grants` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_dag_data_scope` ON `dataset_access_grants` (`data_scope`);--> statement-breakpoint
CREATE INDEX `idx_dag_granted_to_user` ON `dataset_access_grants` (`granted_to_user_id`);--> statement-breakpoint
CREATE INDEX `idx_dag_expiry_date` ON `dataset_access_grants` (`expiry_date`);--> statement-breakpoint
CREATE INDEX `idx_flm_round_number` ON `federated_learning_metadata` (`round_number`);--> statement-breakpoint
CREATE INDEX `idx_flm_model_type` ON `federated_learning_metadata` (`model_type`);--> statement-breakpoint
CREATE INDEX `idx_flm_training_started` ON `federated_learning_metadata` (`training_started_at`);--> statement-breakpoint
CREATE INDEX `idx_gad_capture_month` ON `global_anonymized_dataset` (`capture_month`);--> statement-breakpoint
CREATE INDEX `idx_gad_vehicle_make` ON `global_anonymized_dataset` (`vehicle_make`);--> statement-breakpoint
CREATE INDEX `idx_gad_province` ON `global_anonymized_dataset` (`province`);--> statement-breakpoint
CREATE INDEX `idx_gad_accident_type` ON `global_anonymized_dataset` (`accident_type`);--> statement-breakpoint
CREATE INDEX `idx_gad_anonymized_at` ON `global_anonymized_dataset` (`anonymized_at`);--> statement-breakpoint
CREATE INDEX `idx_processed` ON `model_training_queue` (`processed`);--> statement-breakpoint
CREATE INDEX `idx_training_priority` ON `model_training_queue` (`training_priority`);--> statement-breakpoint
CREATE INDEX `idx_created_at` ON `model_training_queue` (`created_at`);--> statement-breakpoint
ALTER TABLE `assessor_evaluations` DROP COLUMN `estimated_cost`;--> statement-breakpoint
ALTER TABLE `assessor_evaluations` DROP COLUMN `damage_description`;--> statement-breakpoint
ALTER TABLE `assessor_evaluations` DROP COLUMN `repair_recommendations`;--> statement-breakpoint
ALTER TABLE `assessor_evaluations` DROP COLUMN `additional_notes`;