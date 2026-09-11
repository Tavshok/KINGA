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
	`to_roles` text NOT NULL DEFAULT ('[]'),
	`to_user_ids` text NOT NULL DEFAULT ('[]'),
	`to_emails` text NOT NULL DEFAULT ('[]'),
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
CREATE TABLE `workflow_templates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` varchar(255) NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`stages_json` text NOT NULL DEFAULT ('[]'),
	`applies_to_json` text DEFAULT ('{}'),
	`is_default` tinyint NOT NULL DEFAULT 0,
	`is_active` tinyint NOT NULL DEFAULT 1,
	`created_by` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `workflow_templates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `approval_workflow` ADD CONSTRAINT `approval_workflow_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE cascade ON UPDATE cascade;
--> statement-breakpoint
ALTER TABLE `claim_comments` ADD CONSTRAINT `claim_comments_claimId_claims_id_fk` FOREIGN KEY (`claimId`) REFERENCES `claims`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `claim_comments` ADD CONSTRAINT `claim_comments_author_user_id_users_id_fk` FOREIGN KEY (`author_user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `governance_notifications` ADD CONSTRAINT `governance_notifications_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE cascade ON UPDATE cascade;
--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE cascade ON UPDATE cascade;
--> statement-breakpoint
ALTER TABLE `recovery_cases` ADD CONSTRAINT `recovery_cases_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE restrict ON UPDATE cascade;
--> statement-breakpoint
ALTER TABLE `workflow_audit_trail` ADD CONSTRAINT `workflow_audit_trail_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE cascade ON UPDATE cascade;
--> statement-breakpoint
CREATE INDEX `idx_agency_assisted_claimant_insurer` ON `agency_assisted_claimant_identities` (`insurer_tenant_id`,`status`);
--> statement-breakpoint
CREATE INDEX `idx_agency_clients_tenant` ON `agency_clients` (`agency_tenant_id`);
--> statement-breakpoint
CREATE INDEX `idx_agency_clients_id_number` ON `agency_clients` (`id_number`);
--> statement-breakpoint
CREATE INDEX `idx_agency_clients_email` ON `agency_clients` (`email`);
--> statement-breakpoint
CREATE INDEX `idx_agency_service_request_insurer_tenant` ON `agency_insurance_service_request_insurers` (`insurer_tenant_id`,`status`);
--> statement-breakpoint
CREATE INDEX `idx_agency_insurance_service_request_tenant_status` ON `agency_insurance_service_requests` (`agency_tenant_id`,`status`);
--> statement-breakpoint
CREATE INDEX `idx_agency_insurance_service_request_client` ON `agency_insurance_service_requests` (`agency_client_id`);
--> statement-breakpoint
CREATE INDEX `idx_agency_insurance_service_request_vehicle` ON `agency_insurance_service_requests` (`vehicle_registry_id`);
--> statement-breakpoint
CREATE INDEX `idx_agency_insurance_valuation_deviation_tenant` ON `agency_insurance_valuation_deviations` (`agency_tenant_id`);
--> statement-breakpoint
CREATE INDEX `idx_agency_product_commission_tenant` ON `agency_product_commission_configs` (`agency_tenant_id`);
--> statement-breakpoint
CREATE INDEX `idx_ccr_comment_id` ON `claim_comment_reads` (`comment_id`);
--> statement-breakpoint
CREATE INDEX `idx_ccr_user_id` ON `claim_comment_reads` (`user_id`);
--> statement-breakpoint
CREATE INDEX `client_insurance_service_request_number_idx` ON `client_insurance_service_requests` (`request_number`);
--> statement-breakpoint
CREATE INDEX `client_insurance_service_user_idx` ON `client_insurance_service_requests` (`user_id`);
--> statement-breakpoint
CREATE INDEX `client_valuation_request_number_idx` ON `client_vehicle_valuation_requests` (`request_number`);
--> statement-breakpoint
CREATE INDEX `client_valuation_token_idx` ON `client_vehicle_valuation_requests` (`submission_token`);
--> statement-breakpoint
CREATE INDEX `client_valuation_user_idx` ON `client_vehicle_valuation_requests` (`user_id`);
--> statement-breakpoint
CREATE INDEX `idx_eo_inspection` ON `engineer_observations` (`inspection_id`);
--> statement-breakpoint
CREATE INDEX `idx_eo_tenant` ON `engineer_observations` (`tenant_id`);
--> statement-breakpoint
CREATE INDEX `idx_eo_type` ON `engineer_observations` (`observation_type`);
--> statement-breakpoint
CREATE INDEX `idx_eo_severity` ON `engineer_observations` (`severity`);
--> statement-breakpoint
CREATE INDEX `idx_eo_authored_by` ON `engineer_observations` (`authored_by`);
--> statement-breakpoint
CREATE INDEX `idx_ep_tenant` ON `engineer_profiles` (`tenant_id`);
--> statement-breakpoint
CREATE INDEX `idx_ep_region` ON `engineer_profiles` (`region`);
--> statement-breakpoint
CREATE INDEX `idx_ep_available` ON `engineer_profiles` (`is_available`);
--> statement-breakpoint
CREATE INDEX `idx_fleet_accounts_owner` ON `fleet_accounts` (`owner_user_id`);
--> statement-breakpoint
CREATE INDEX `idx_fleet_accounts_insurer` ON `fleet_accounts` (`linked_insurer_tenant_id`);
--> statement-breakpoint
CREATE INDEX `idx_fleet_accounts_agency` ON `fleet_accounts` (`linked_agency_id`);
--> statement-breakpoint
CREATE INDEX `idx_fleet_accounts_status` ON `fleet_accounts` (`status`);
--> statement-breakpoint
CREATE INDEX `idx_fleet_drivers_tenant_id` ON `fleet_drivers` (`tenant_id`);
--> statement-breakpoint
CREATE INDEX `idx_fleet_drivers_fleet_id` ON `fleet_drivers` (`fleet_id`);
--> statement-breakpoint
CREATE INDEX `idx_fleet_drivers_user_id` ON `fleet_drivers` (`user_id`);
--> statement-breakpoint
CREATE INDEX `idx_fis_fleet_id` ON `fleet_intelligence_snapshots` (`fleet_id`);
--> statement-breakpoint
CREATE INDEX `idx_fis_tenant_id` ON `fleet_intelligence_snapshots` (`tenant_id`);
--> statement-breakpoint
CREATE INDEX `idx_fis_generated_at` ON `fleet_intelligence_snapshots` (`generated_at`);
--> statement-breakpoint
CREATE INDEX `idx_fmr_user_id` ON `fleet_manager_requests` (`user_id`);
--> statement-breakpoint
CREATE INDEX `idx_fmr_fleet_account_id` ON `fleet_manager_requests` (`fleet_account_id`);
--> statement-breakpoint
CREATE INDEX `idx_fmr_status` ON `fleet_manager_requests` (`status`);
--> statement-breakpoint
CREATE INDEX `idx_fmr_created_at` ON `fleet_manager_requests` (`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_fleet_rfq_instruction_agency_status` ON `fleet_rfq_client_instructions` (`agency_tenant_id`,`status`);
--> statement-breakpoint
CREATE INDEX `idx_fleet_rfq_instruction_fleet` ON `fleet_rfq_client_instructions` (`fleet_account_id`);
--> statement-breakpoint
CREATE INDEX `fleet_risk_scores_vehicle_id_unique` ON `fleet_risk_scores` (`vehicle_id`);
--> statement-breakpoint
CREATE INDEX `fleet_vehicles_vin_unique` ON `fleet_vehicles` (`vin`);
--> statement-breakpoint
CREATE INDEX `fleet_vehicles_registration_number_unique` ON `fleet_vehicles` (`registration_number`);
--> statement-breakpoint
CREATE INDEX `idx_gal_claim` ON `governance_audit_log` (`claim_id`);
--> statement-breakpoint
CREATE INDEX `idx_gal_tenant` ON `governance_audit_log` (`tenant_id`);
--> statement-breakpoint
CREATE INDEX `idx_gal_action` ON `governance_audit_log` (`action`);
--> statement-breakpoint
CREATE INDEX `idx_gal_timestamp` ON `governance_audit_log` (`timestamp_ms`);
--> statement-breakpoint
CREATE INDEX `idx_gal_override` ON `governance_audit_log` (`override_flag`);
--> statement-breakpoint
CREATE INDEX `idx_tenant_id` ON `governance_notifications` (`tenant_id`);
--> statement-breakpoint
CREATE INDEX `idx_claim_id` ON `governance_notifications` (`claim_id`);
--> statement-breakpoint
CREATE INDEX `idx_recipients` ON `governance_notifications` (`recipients`);
--> statement-breakpoint
CREATE INDEX `idx_read_at` ON `governance_notifications` (`read_at`);
--> statement-breakpoint
CREATE INDEX `idx_created_at` ON `governance_notifications` (`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_gov_violation_tenant` ON `governance_violation_log` (`tenant_id`);
--> statement-breakpoint
CREATE INDEX `idx_gov_violation_user` ON `governance_violation_log` (`user_id`);
--> statement-breakpoint
CREATE INDEX `idx_gov_violation_type` ON `governance_violation_log` (`violation_type`);
--> statement-breakpoint
CREATE INDEX `idx_gov_violation_at` ON `governance_violation_log` (`violated_at`);
--> statement-breakpoint
CREATE INDEX `idx_gov_violation_tenant_time` ON `governance_violation_log` (`tenant_id`,`violated_at`);
--> statement-breakpoint
CREATE INDEX `idx_ne_idempotency_key` ON `notification_events` (`idempotency_key`);
--> statement-breakpoint
CREATE INDEX `idx_ne_recipient` ON `notification_events` (`recipient_user_id`);
--> statement-breakpoint
CREATE INDEX `idx_ne_event_type` ON `notification_events` (`event_type`);
--> statement-breakpoint
CREATE INDEX `idx_ne_created_at` ON `notification_events` (`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_notif_pref_user` ON `notification_preferences` (`user_id`);
--> statement-breakpoint
CREATE INDEX `idx_notif_pref_tenant` ON `notification_preferences` (`tenant_id`);
--> statement-breakpoint
CREATE INDEX `idx_gov_limits_version` ON `platform_governance_limits` (`version`);
--> statement-breakpoint
CREATE INDEX `idx_gov_limits_effective` ON `platform_governance_limits` (`effective_from`);
--> statement-breakpoint
CREATE INDEX `idx_user_tenant_action_window` ON `rate_limit_tracking` (`user_id`,`tenant_id`,`action_type`,`window_start`);
--> statement-breakpoint
CREATE INDEX `idx_window_start` ON `rate_limit_tracking` (`window_start`);
--> statement-breakpoint
CREATE INDEX `idx_rc_tenant_id` ON `recovery_cases` (`tenant_id`);
--> statement-breakpoint
CREATE INDEX `idx_rc_claim_id` ON `recovery_cases` (`claim_id`);
--> statement-breakpoint
CREATE INDEX `idx_rc_status` ON `recovery_cases` (`status`);
--> statement-breakpoint
CREATE INDEX `idx_rc_tenant_status` ON `recovery_cases` (`tenant_id`,`status`);
--> statement-breakpoint
CREATE INDEX `idx_rc_assigned_officer` ON `recovery_cases` (`assigned_officer_user_id`);
--> statement-breakpoint
CREATE INDEX `idx_rc_rps` ON `recovery_cases` (`recovery_potential_score`);
--> statement-breakpoint
CREATE INDEX `idx_rc_recovery_deadline` ON `recovery_cases` (`recovery_deadline`);
--> statement-breakpoint
CREATE INDEX `idx_rcl_case_id` ON `recovery_correspondence_log` (`recovery_case_id`);
--> statement-breakpoint
CREATE INDEX `idx_rcl_tenant_id` ON `recovery_correspondence_log` (`tenant_id`);
--> statement-breakpoint
CREATE INDEX `idx_rcl_created_at` ON `recovery_correspondence_log` (`created_at`);
--> statement-breakpoint
CREATE INDEX `tenant_id` ON `tenant_workflow_configs` (`tenant_id`);
--> statement-breakpoint
CREATE INDEX `idx_wa_phone` ON `whatsapp_sessions` (`phone_number`);
--> statement-breakpoint
CREATE INDEX `idx_wa_status` ON `whatsapp_sessions` (`status`);
--> statement-breakpoint
CREATE INDEX `idx_workflow_audit_claim_state_time` ON `workflow_audit_trail` (`claim_id`,`new_state`,`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_workflow_audit_override` ON `workflow_audit_trail` (`executive_override`,`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_audit_claim_timestamp` ON `workflow_audit_trail` (`claim_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `tenant_id` ON `workflow_configuration` (`tenant_id`);
--> statement-breakpoint
CREATE INDEX `idx_wt_tenant_id` ON `workflow_templates` (`tenant_id`);
--> statement-breakpoint
CREATE INDEX `idx_wt_is_default` ON `workflow_templates` (`tenant_id`,`is_default`);
--> statement-breakpoint
