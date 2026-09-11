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
ALTER TABLE `claim_assignments` ADD CONSTRAINT `claim_assignments_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `claim_assignments` ADD CONSTRAINT `claim_assignments_assigned_to_user_id_users_id_fk` FOREIGN KEY (`assigned_to_user_id`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `claim_assignments` ADD CONSTRAINT `claim_assignments_assigned_by_user_id_users_id_fk` FOREIGN KEY (`assigned_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `claim_documents` ADD CONSTRAINT `claim_documents_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `claim_documents` ADD CONSTRAINT `claim_documents_inspection_id_inspections_id_fk` FOREIGN KEY (`inspection_id`) REFERENCES `inspections`(`id`) ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `vehicle_condition_assessment` ADD CONSTRAINT `vehicle_condition_assessment_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `vehicle_damage_history` ADD CONSTRAINT `vehicle_damage_history_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `vehicle_geometry_measurements` ADD CONSTRAINT `fk_vgm_vehicle_model` FOREIGN KEY (`vehicle_model_id`) REFERENCES `vehicle_models`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vehicle_market_valuations` ADD CONSTRAINT `vehicle_market_valuations_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX `idx_claim_assignments_claim_active` ON `claim_assignments` (`claim_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_claim_assignments_assignee_active` ON `claim_assignments` (`assigned_to_user_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_claim_assignments_tenant_role` ON `claim_assignments` (`tenant_id`,`assignment_role`,`status`);--> statement-breakpoint
CREATE INDEX `idx_claim_assignments_parent` ON `claim_assignments` (`parent_assignment_id`);--> statement-breakpoint
CREATE INDEX `idx_claim_id` ON `claim_documents` (`claim_id`);--> statement-breakpoint
CREATE INDEX `idx_uploaded_by` ON `claim_documents` (`uploaded_by`);--> statement-breakpoint
CREATE INDEX `idx_category` ON `claim_documents` (`document_category`);--> statement-breakpoint
CREATE INDEX `idx_cd_inspection_id` ON `claim_documents` (`inspection_id`);--> statement-breakpoint
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
CREATE INDEX `idx_drivers_full_name` ON `drivers` (`full_name`);--> statement-breakpoint
CREATE INDEX `idx_drivers_email` ON `drivers` (`email`);--> statement-breakpoint
CREATE INDEX `idx_drivers_phone` ON `drivers` (`phone`);--> statement-breakpoint
CREATE INDEX `idx_drivers_national_id` ON `drivers` (`national_id_number`);--> statement-breakpoint
CREATE INDEX `idx_drivers_tenant` ON `drivers` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_drivers_risk_score` ON `drivers` (`driver_risk_score`);--> statement-breakpoint
CREATE INDEX `idx_drivers_repeat_claimer` ON `drivers` (`is_repeat_claimer`);--> statement-breakpoint
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
CREATE INDEX `idx_vps_vehicle_registry_id` ON `vehicle_passport_snapshots` (`vehicle_registry_id`);--> statement-breakpoint
CREATE INDEX `idx_vps_registration_number` ON `vehicle_passport_snapshots` (`registration_number`);--> statement-breakpoint
CREATE INDEX `idx_vps_tenant_id` ON `vehicle_passport_snapshots` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_vps_generated_at` ON `vehicle_passport_snapshots` (`generated_at`);--> statement-breakpoint
CREATE INDEX `idx_vehicle_registry_registration` ON `vehicle_registry` (`registration_number`);--> statement-breakpoint
CREATE INDEX `idx_vehicle_registry_make_model` ON `vehicle_registry` (`make`,`model`);--> statement-breakpoint
CREATE INDEX `idx_vehicle_registry_tenant` ON `vehicle_registry` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_vehicle_registry_risk_score` ON `vehicle_registry` (`vehicle_risk_score`);--> statement-breakpoint
CREATE INDEX `idx_vehicle_registry_repeat_claimer` ON `vehicle_registry` (`is_repeat_claimer`);