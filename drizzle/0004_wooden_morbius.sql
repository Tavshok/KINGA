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
	CONSTRAINT `fleet_vehicles_id` PRIMARY KEY(`id`),
	CONSTRAINT `fleet_vehicles_vin_unique` UNIQUE(`vin`),
	CONSTRAINT `fleet_vehicles_registration_number_unique` UNIQUE(`registration_number`)
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
	CONSTRAINT `insurance_carriers_id` PRIMARY KEY(`id`),
	CONSTRAINT `insurance_carriers_short_code_unique` UNIQUE(`short_code`)
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
	CONSTRAINT `insurance_policies_id` PRIMARY KEY(`id`),
	CONSTRAINT `insurance_policies_policy_number_unique` UNIQUE(`policy_number`)
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
	`status` enum('pending','accepted','rejected','expired') NOT NULL DEFAULT 'pending',
	`kinga_insights` text,
	`tenant_id` varchar(255),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `insurance_quotes_id` PRIMARY KEY(`id`),
	CONSTRAINT `insurance_quotes_quote_number_unique` UNIQUE(`quote_number`)
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
	CONSTRAINT `policy_endorsements_id` PRIMARY KEY(`id`),
	CONSTRAINT `policy_endorsements_endorsement_number_unique` UNIQUE(`endorsement_number`)
);
